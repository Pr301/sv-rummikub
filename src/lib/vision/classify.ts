import { hueDistance, type Box } from './image';
import type { Numeral } from './glyphs';
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

export interface InkColor {
	/** Degrees, 0–360. */
	hue: number;
	saturation: number;
}

export function classifyColor(
	ink: InkColor,
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

/** Below this width-to-height ratio a region cannot hold two digits, so it is never cut. */
const SPLIT_MIN_ASPECT = 1;
/** The gap between two digits, as a fraction of the region's mean column weight. */
const SPLIT_MAX_VALLEY = 0.3;

/**
 * Splits a wide region into two digits, or leaves it whole.
 *
 * Being wide is necessary but nowhere near sufficient: a "9" is very nearly as wide as it is tall,
 * and cutting it in half turns one right answer into two wrong ones. So the region is only cut when
 * a real gap runs through it — a column carrying almost no ink, the white space between two
 * printed digits. A "0" has a thin middle but never an empty one, which is exactly the distinction.
 */
export function splitDigits(mask: Uint8Array, width: number, height: number, bounds: Box): Box[] {
	if (bounds.width / bounds.height < SPLIT_MIN_ASPECT) return [bounds];

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

	const mean = columns.reduce((sum, count) => sum + count, 0) / (columns.length || 1);
	if (mean <= 0 || lowest > mean * SPLIT_MAX_VALLEY) return [bounds];

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
 * Box-samples a glyph region onto the template grid, stretching it to fill.
 *
 * Aspect ratio is deliberately thrown away. It is tempting to preserve it — a squashed "1" does
 * look like a lot of things — but the templates come from ordinary UI faces, whose digits are far
 * narrower than the heavy, nearly square numerals actually printed on Rummikub tiles. Padding a
 * photographed "9" to keep its proportions leaves it a different shape *and* a different size from
 * every template, and it matches none of them. Stretching both to the same grid compares stroke
 * layout, which is the part that identifies a digit, and leaves width to `splitDigits` and the
 * 1–13 range check to police.
 */
export function normalizeGlyph(
	mask: Uint8Array,
	width: number,
	height: number,
	box: Box
): Float32Array {
	const out = new Float32Array(GLYPH_WIDTH * GLYPH_HEIGHT);

	for (let ty = 0; ty < GLYPH_HEIGHT; ty++) {
		// Work out the source window in box-relative coordinates first, then shift it into the mask.
		// Mixing the two makes the window grow with the box's position and averages the glyph flat.
		const ry0 = Math.floor((ty / GLYPH_HEIGHT) * box.height);
		const ry1 = Math.max(ry0 + 1, Math.floor(((ty + 1) / GLYPH_HEIGHT) * box.height));
		const sy0 = box.y + ry0;
		const sy1 = box.y + ry1;

		for (let tx = 0; tx < GLYPH_WIDTH; tx++) {
			const rx0 = Math.floor((tx / GLYPH_WIDTH) * box.width);
			const rx1 = Math.max(rx0 + 1, Math.floor(((tx + 1) / GLYPH_WIDTH) * box.width));
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
			out[ty * GLYPH_WIDTH + tx] = count === 0 ? 0 : sum / count;
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
 * The glyphs of one numeral, normalised to template size and ordered left to right.
 *
 * Usually each digit is its own component and there is nothing to do. When ink bleeds — a heavy
 * print, a low-resolution frame — two digits arrive fused into one wide component, so a component
 * noticeably wider than a single digit is cut at its emptiest column instead.
 */
function digitGlyphs(numeral: Numeral): Float32Array[] {
	const ordered = [...numeral.glyphs].sort((a, b) => a.x - b.x);

	if (ordered.length === 1) {
		const glyph = ordered[0];
		const full: Box = { x: 0, y: 0, width: glyph.width, height: glyph.height };
		const parts = splitDigits(glyph.mask, glyph.width, glyph.height, full);
		return parts.map((part) => normalizeGlyph(glyph.mask, glyph.width, glyph.height, part));
	}

	return ordered.map((glyph) =>
		normalizeGlyph(glyph.mask, glyph.width, glyph.height, {
			x: 0,
			y: 0,
			width: glyph.width,
			height: glyph.height
		})
	);
}

/**
 * Reads one numeral into a tile, or returns null when the digits do not spell a real tile.
 *
 * Returning null matters: a numeral that reads as 0, or 47, is not a tile the scanner should offer
 * a guess at. Dropping it leaves the user one tap short in the picker, whereas inventing a tile
 * quietly changes their score. Confidence is likewise conservative — anything the pipeline is
 * unsure of lands below the floor and the UI makes the user confirm it.
 */
export function readNumeral(
	numeral: Numeral,
	templates: DigitTemplate[],
	calibration: ColorCalibration | null
): TileReading | null {
	const { color, confidence: colorConfidence } = classifyColor(numeral, calibration);
	const reads = digitGlyphs(numeral).map((glyph) => matchGlyph(glyph, templates));
	if (reads.length === 0) return null;

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

	if (!Number.isInteger(value) || value < 1 || value > 13) return null;

	return {
		value: value as TileValue,
		color,
		// Both the shape and the ink colour have to be right for the tile to be right.
		confidence: Math.max(0, Math.min(1, shapeConfidence * 0.75 + colorConfidence * 0.25))
	};
}
