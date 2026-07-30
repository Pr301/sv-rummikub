import { classifyTile, type DigitTemplate } from './classify';
import { faceMask, segment, DEFAULT_SEGMENT_OPTIONS, type SegmentOptions } from './segment';
import type { Frame } from './image';
import type { ScannedTile } from './tiles';
import type { ColorCalibration } from '$lib/types';

/** Working resolution. Big enough to read a numeral, small enough to stay interactive on a phone. */
export const WORK_WIDTH = 640;

export interface DetectResult {
	tiles: ScannedTile[];
	/** The frame the boxes refer to, so the UI can draw the overlay at the right scale. */
	frame: { width: number; height: number };
	/** Populated only when debug is on — the binary face mask, for tuning thresholds. */
	mask?: Uint8Array;
}

let counter = 0;
function nextId(): string {
	counter += 1;
	return `t${counter}`;
}

export function detectTiles(
	frame: Frame,
	templates: DigitTemplate[],
	calibration: ColorCalibration | null,
	options: { debug?: boolean; segmentOptions?: SegmentOptions } = {}
): DetectResult {
	const segmentOptions = options.segmentOptions ?? DEFAULT_SEGMENT_OPTIONS;
	const candidates = segment(frame, segmentOptions);

	const tiles: ScannedTile[] = candidates.map((box) => {
		const reading = classifyTile(frame, box, templates, calibration);
		return {
			id: nextId(),
			value: reading.value,
			color: reading.color,
			confidence: reading.confidence,
			box: { x: box.x, y: box.y, width: box.width, height: box.height }
		};
	});

	return {
		tiles,
		frame: { width: frame.width, height: frame.height },
		mask: options.debug ? faceMask(frame, segmentOptions) : undefined
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
