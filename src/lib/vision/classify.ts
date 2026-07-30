import { hueDistance, meanHue, otsuThreshold, rgbToHsv, type Box, type Frame } from './image';
import type { TileColor, TileValue } from './tiles';
import type { ColorCalibration } from '$lib/types';

export const GLYPH_WIDTH = 16;
export const GLYPH_HEIGHT = 24;

export interface DigitTemplate {
	digit: number;
	/** GLYPH_WIDTH × GLYPH_HEIGHT, row-major, 0–1 ink coverage. */
	data: Float32Array;
}

/** Hues of the three coloured inks, in degrees. Overridden by user calibration. */
export const DEFAULT_HUES = { red: 6, orange: 32, blue: 214 };
/** A tile's ink counts as black below this saturation. */
export const DEFAULT_BLACK_SATURATION = 0.3;

/** Crop inset — the outermost band of a detected box is bevel and shadow, not print. */
const INSET = 0.14;
/** The numeral sits above the small orientation dot near the tile's foot. */
const NUMERAL_BAND = 0.74;

export interface InkMask {
	data: Uint8Array;
	width: number;
	height: number;
	/** Ink pixels as a fraction of the inspected area — jokers cover far more than digits. */
	coverage: number;
	hue: number;
	saturation: number;
}

/**
 * Separates printed ink from the tile face inside one candidate box. Dark ink is found by Otsu on
 * brightness; orange and red ink can be as bright as the cream face, so saturation catches those.
 */
export function extractInk(frame: Frame, box: Box): InkMask {
	const insetX = Math.round(box.width * INSET);
	const insetY = Math.round(box.height * INSET);
	const x0 = box.x + insetX;
	const y0 = box.y + insetY;
	const width = Math.max(1, box.width - insetX * 2);
	const height = Math.max(1, box.height - insetY * 2);

	const values = new Uint8Array(width * height);
	const sats = new Float32Array(width * height);
	const hues = new Float32Array(width * height);
	const histogram = new Array<number>(256).fill(0);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const sx = Math.min(frame.width - 1, x0 + x);
			const sy = Math.min(frame.height - 1, y0 + y);
			const o = (sy * frame.width + sx) * 4;
			const { h, s, v } = rgbToHsv(frame.data[o], frame.data[o + 1], frame.data[o + 2]);
			const i = y * width + x;
			const v8 = Math.round(v * 255);
			values[i] = v8;
			sats[i] = s;
			hues[i] = h;
			histogram[v8] += 1;
		}
	}

	const threshold = otsuThreshold(histogram);
	const data = new Uint8Array(width * height);
	const inkHues: number[] = [];
	const inkWeights: number[] = [];
	let inkCount = 0;
	let satSum = 0;

	for (let i = 0; i < data.length; i++) {
		const isInk = values[i] < threshold || sats[i] > 0.45;
		if (!isInk) continue;
		data[i] = 1;
		inkCount += 1;
		satSum += sats[i];
		if (sats[i] > 0.2) {
			inkHues.push(hues[i]);
			inkWeights.push(sats[i]);
		}
	}

	return {
		data,
		width,
		height,
		coverage: inkCount / data.length,
		hue: meanHue(inkHues, inkWeights),
		saturation: inkCount === 0 ? 0 : satSum / inkCount
	};
}

export function classifyColor(
	ink: Pick<InkMask, 'hue' | 'saturation'>,
	calibration: ColorCalibration | null
): { color: TileColor; confidence: number } {
	const hues = calibration?.hues ?? DEFAULT_HUES;
	const blackCut = calibration?.blackMaxValue ?? DEFAULT_BLACK_SATURATION;

	if (ink.saturation < blackCut) {
		// The further below the cut, the more certain it is genuinely black print.
		return { color: 'black', confidence: Math.min(1, 0.6 + (blackCut - ink.saturation) * 2) };
	}

	const distances: [TileColor, number][] = [
		['red', hueDistance(ink.hue, hues.red)],
		['orange', hueDistance(ink.hue, hues.orange)],
		['blue', hueDistance(ink.hue, hues.blue)]
	];
	distances.sort((a, b) => a[1] - b[1]);

	const [best, second] = distances;
	// Confidence comes from the margin: red and orange sit close together, so a hue landing
	// between them should be reported as uncertain rather than guessed.
	const margin = second[1] - best[1];
	const confidence = Math.max(0.25, Math.min(1, margin / 20)) * (best[1] < 30 ? 1 : 0.6);

	return { color: best[0], confidence };
}

/** Tightest box containing ink, or null when the region is blank. */
export function inkBounds(mask: Uint8Array, width: number, height: number): Box | null {
	let minX = width;
	let maxX = -1;
	let minY = height;
	let maxY = -1;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (mask[y * width + x] === 0) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}

	if (maxX < 0) return null;
	return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Splits the numeral into digits. Two digits are far wider relative to their height than one, so
 * the aspect ratio decides how many there are; the cut goes through the emptiest column.
 */
export function splitDigits(mask: Uint8Array, width: number, height: number, bounds: Box): Box[] {
	const aspect = bounds.width / bounds.height;
	if (aspect < 0.75) return [bounds];

	const columns = new Array<number>(bounds.width).fill(0);
	for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
		for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
			if (mask[y * width + x] === 1) columns[x - bounds.x] += 1;
		}
	}

	// Only look for the gap in the middle third — the edges always trough.
	const from = Math.floor(bounds.width * 0.3);
	const to = Math.ceil(bounds.width * 0.7);
	let cut = from;
	let lowest = Infinity;
	for (let i = from; i < to; i++) {
		if (columns[i] < lowest) {
			lowest = columns[i];
			cut = i;
		}
	}

	const left = { x: bounds.x, y: bounds.y, width: cut, height: bounds.height };
	const right = {
		x: bounds.x + cut,
		y: bounds.y,
		width: bounds.width - cut,
		height: bounds.height
	};

	return [left, right]
		.map((part) => {
			const tight = inkBounds(cropMask(mask, width, height, part), part.width, part.height);
			return tight
				? { x: part.x + tight.x, y: part.y + tight.y, width: tight.width, height: tight.height }
				: null;
		})
		.filter((part): part is Box => part !== null && part.width > 1 && part.height > 1);
}

function cropMask(mask: Uint8Array, width: number, height: number, box: Box): Uint8Array {
	const out = new Uint8Array(box.width * box.height);
	for (let y = 0; y < box.height; y++) {
		const sy = box.y + y;
		if (sy < 0 || sy >= height) continue;
		for (let x = 0; x < box.width; x++) {
			const sx = box.x + x;
			if (sx < 0 || sx >= width) continue;
			out[y * box.width + x] = mask[sy * width + sx];
		}
	}
	return out;
}

/**
 * Box-samples a glyph region down to the fixed template size, keeping the aspect ratio by padding
 * rather than stretching — a squashed "1" matches almost anything.
 */
export function normalizeGlyph(
	mask: Uint8Array,
	width: number,
	height: number,
	box: Box
): Float32Array {
	const out = new Float32Array(GLYPH_WIDTH * GLYPH_HEIGHT);
	const scale = Math.min(GLYPH_WIDTH / box.width, GLYPH_HEIGHT / box.height);
	const drawWidth = Math.max(1, Math.round(box.width * scale));
	const drawHeight = Math.max(1, Math.round(box.height * scale));
	const offsetX = Math.floor((GLYPH_WIDTH - drawWidth) / 2);
	const offsetY = Math.floor((GLYPH_HEIGHT - drawHeight) / 2);

	for (let ty = 0; ty < drawHeight; ty++) {
		// Work out the source window in box-relative coordinates first, then shift it into the mask.
		// Mixing the two makes the window grow with the box's position and averages the glyph flat.
		const ry0 = Math.floor((ty / drawHeight) * box.height);
		const ry1 = Math.max(ry0 + 1, Math.floor(((ty + 1) / drawHeight) * box.height));
		const sy0 = box.y + ry0;
		const sy1 = box.y + ry1;
		for (let tx = 0; tx < drawWidth; tx++) {
			const rx0 = Math.floor((tx / drawWidth) * box.width);
			const rx1 = Math.max(rx0 + 1, Math.floor(((tx + 1) / drawWidth) * box.width));
			const sx0 = box.x + rx0;
			const sx1 = box.x + rx1;

			let sum = 0;
			let count = 0;
			for (let sy = sy0; sy < sy1 && sy < height; sy++) {
				for (let sx = sx0; sx < sx1 && sx < width; sx++) {
					sum += mask[sy * width + sx];
					count += 1;
				}
			}
			out[(ty + offsetY) * GLYPH_WIDTH + (tx + offsetX)] = count === 0 ? 0 : sum / count;
		}
	}

	return out;
}

/** Normalised cross-correlation, clamped to 0–1. Insensitive to stroke weight and exposure. */
export function correlate(a: Float32Array, b: Float32Array): number {
	const n = a.length;
	let meanA = 0;
	let meanB = 0;
	for (let i = 0; i < n; i++) {
		meanA += a[i];
		meanB += b[i];
	}
	meanA /= n;
	meanB /= n;

	let covariance = 0;
	let varA = 0;
	let varB = 0;
	for (let i = 0; i < n; i++) {
		const da = a[i] - meanA;
		const db = b[i] - meanB;
		covariance += da * db;
		varA += da * da;
		varB += db * db;
	}

	const denominator = Math.sqrt(varA * varB);
	if (denominator < 1e-9) return 0;
	return Math.max(0, covariance / denominator);
}

export function matchGlyph(
	glyph: Float32Array,
	templates: DigitTemplate[]
): { digit: number; score: number } {
	let best = { digit: -1, score: -1 };
	for (const template of templates) {
		const score = correlate(glyph, template.data);
		if (score > best.score) best = { digit: template.digit, score };
	}
	return best;
}

export interface TileReading {
	value: TileValue;
	color: TileColor;
	confidence: number;
}

/**
 * Reads one candidate box into a tile. Confidence is deliberately conservative: anything the
 * pipeline is unsure of lands below the floor and the UI makes the user confirm it.
 */
export function classifyTile(
	frame: Frame,
	box: Box,
	templates: DigitTemplate[],
	calibration: ColorCalibration | null
): TileReading {
	const ink = extractInk(frame, box);
	const { color, confidence: colorConfidence } = classifyColor(ink, calibration);

	// Restrict digit-finding to the band above the orientation dot.
	const bandHeight = Math.max(1, Math.round(ink.height * NUMERAL_BAND));
	const band = cropMask(ink.data, ink.width, ink.height, {
		x: 0,
		y: 0,
		width: ink.width,
		height: bandHeight
	});

	const bounds = inkBounds(band, ink.width, bandHeight);
	if (!bounds) {
		return { value: 'joker', color, confidence: 0.2 };
	}

	// A joker's face floods the tile; a numeral never covers this much of it.
	if (ink.coverage > 0.34) {
		return { value: 'joker', color, confidence: 0.45 };
	}

	const parts = splitDigits(band, ink.width, bandHeight, bounds);
	const reads = parts.map((part) =>
		matchGlyph(normalizeGlyph(band, ink.width, bandHeight, part), templates)
	);

	let value: number;
	let shapeConfidence: number;

	if (reads.length === 1) {
		value = reads[0].digit;
		shapeConfidence = reads[0].score;
	} else {
		value = reads[0].digit * 10 + reads[1].digit;
		shapeConfidence = Math.min(reads[0].score, reads[1].score);
		// The only legal two-digit tiles are 10–13, so a leading digit that isn't 1 is a misread.
		if (reads[0].digit !== 1) shapeConfidence *= 0.4;
	}

	if (!Number.isInteger(value) || value < 1 || value > 13) {
		return { value: 'joker', color, confidence: 0.15 };
	}

	return {
		value: value as TileValue,
		color,
		// Both the shape and the ink colour have to be right for the tile to be right.
		confidence: Math.max(0, Math.min(1, shapeConfidence * 0.75 + colorConfidence * 0.25))
	};
}
