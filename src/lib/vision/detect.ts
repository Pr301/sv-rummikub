import { readNumeral, type DigitTemplate } from './classify';
import {
	DEFAULT_GLYPH_OPTIONS,
	findGlyphs,
	groupNumerals,
	inkMask,
	tileBox,
	type GlyphOptions
} from './glyphs';
import { pixelPlanes, median, rotateFrame, unrotateBox, type Frame } from './image';
import { CONFIDENCE_FLOOR, DETECTION_FLOOR, type ScannedTile } from './tiles';
import type { ColorCalibration } from '$lib/types';

/** Working resolution. Big enough to read a numeral, small enough to stay interactive on a phone. */
export const WORK_WIDTH = 640;

export interface DetectResult {
	tiles: ScannedTile[];
	/** The frame the boxes refer to, so the UI can draw the overlay at the right scale. */
	frame: { width: number; height: number };
	/** Quarter-turns clockwise the frame had to be rotated before the numerals read. */
	turns: number;
	/** Populated only when debug is on — the binary ink mask, for tuning thresholds. */
	mask?: Uint8Array;
}

export interface DetectOptions {
	debug?: boolean;
	glyphOptions?: GlyphOptions;
	/**
	 * Whether to retry the other three right-angle orientations when the upright read comes back
	 * thin. Worth it for a still photo; skipped for live preview frames, where the next frame is
	 * along in a moment anyway.
	 */
	searchOrientation?: boolean;
}

let counter = 0;
function nextId(): string {
	counter += 1;
	return `t${counter}`;
}

interface Attempt {
	tiles: Omit<ScannedTile, 'id'>[];
	score: number;
}

function readFrame(
	frame: Frame,
	templates: DigitTemplate[],
	calibration: ColorCalibration | null,
	options: GlyphOptions
): Attempt {
	const glyphs = findGlyphs(frame, options);
	const glyphHeight = median(glyphs.map((glyph) => glyph.height)) || 1;
	const tiles: Omit<ScannedTile, 'id'>[] = [];

	for (const numeral of groupNumerals(glyphs, options)) {
		const reading = readNumeral(numeral, templates, calibration);
		if (!reading || reading.confidence < DETECTION_FLOOR) continue;
		tiles.push({
			value: reading.value,
			color: reading.color,
			confidence: reading.confidence,
			box: tileBox(numeral, glyphHeight)
		});
	}

	// Summing confidence rather than counting tiles: a wrong orientation tends to produce a few
	// low-scoring accidents, which should never outrank a smaller set of clean reads.
	return { tiles, score: tiles.reduce((sum, tile) => sum + tile.confidence, 0) };
}

/**
 * A read good enough that the other three orientations are not worth the work.
 *
 * The bar sits above the confirmation floor on purpose. A frame held the wrong way up still yields
 * the odd accidental read, and accepting one of those early would stop the search before it ever
 * tried the orientation the numerals are actually printed in.
 */
function isConvincing(attempt: Attempt): boolean {
	if (attempt.tiles.length < 2) return false;
	return attempt.score / attempt.tiles.length >= CONFIDENCE_FLOOR + 0.08;
}

export function detectTiles(
	frame: Frame,
	templates: DigitTemplate[],
	calibration: ColorCalibration | null,
	options: DetectOptions = {}
): DetectResult {
	const glyphOptions = options.glyphOptions ?? DEFAULT_GLYPH_OPTIONS;

	let bestTurns = 0;
	let best = readFrame(frame, templates, calibration, glyphOptions);

	if (options.searchOrientation !== false && !isConvincing(best)) {
		// Every remaining orientation is tried before choosing. Stopping at the first that looks
		// passable is how a sideways rack ends up read as three stray marks: the wrong turn scores
		// something, and the right one never gets its turn.
		for (const turns of [1, 2, 3]) {
			const attempt = readFrame(rotateFrame(frame, turns), templates, calibration, glyphOptions);
			if (attempt.score > best.score) {
				best = attempt;
				bestTurns = turns;
			}
		}
	}

	const rotated = rotateFrame(frame, bestTurns);
	const tiles: ScannedTile[] = best.tiles.map((tile) => ({
		...tile,
		id: nextId(),
		box: tile.box ? unrotateBox(tile.box, bestTurns, rotated.width, rotated.height) : undefined
	}));

	return {
		tiles,
		frame: { width: frame.width, height: frame.height },
		turns: bestTurns,
		mask: options.debug
			? inkMask(pixelPlanes(frame), frame.width, frame.height, glyphOptions)
			: undefined
	};
}

/**
 * Draws a video frame or still image onto a canvas at working resolution and hands back its
 * pixels. Browser-only — the rest of the pipeline is pure and testable without a canvas.
 */
export function captureFrame(
	source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): { frame: ImageData; canvas: HTMLCanvasElement } | null {
	const naturalWidth =
		source instanceof HTMLVideoElement
			? source.videoWidth
			: source instanceof HTMLImageElement
				? source.naturalWidth
				: source.width;
	const naturalHeight =
		source instanceof HTMLVideoElement
			? source.videoHeight
			: source instanceof HTMLImageElement
				? source.naturalHeight
				: source.height;

	if (!naturalWidth || !naturalHeight) return null;

	const scale = Math.min(1, WORK_WIDTH / naturalWidth);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(naturalWidth * scale);
	canvas.height = Math.round(naturalHeight * scale);

	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;

	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return { frame: context.getImageData(0, 0, canvas.width, canvas.height), canvas };
}
