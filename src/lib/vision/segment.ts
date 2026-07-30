import { median, otsuThreshold, rgbToHsv, type Box, type Frame } from './image';

export interface SegmentOptions {
	/** Ceiling on ink saturation for a pixel to count as tile face. */
	maxFaceSaturation: number;
	/** Component area as a fraction of the frame. */
	minAreaFraction: number;
	maxAreaFraction: number;
	/** Tiles are taller than they are wide. */
	minAspect: number;
	maxAspect: number;
	/** Component pixels / bounding-box pixels — rejects L-shapes and glare streaks. */
	minFill: number;
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentOptions = {
	maxFaceSaturation: 0.42,
	minAreaFraction: 0.0012,
	maxAreaFraction: 0.16,
	minAspect: 1.0,
	maxAspect: 2.1,
	minFill: 0.68
};

export interface Candidate extends Box {
	/** Pixel count in the component, which is <= width * height. */
	area: number;
	fill: number;
}

/**
 * Marks pixels that look like the bone-coloured front of a tile: bright, and not strongly
 * coloured. The brightness cut-off is chosen by Otsu so the same code copes with a lamp-lit table
 * and a bright kitchen.
 */
export function faceMask(frame: Frame, options: SegmentOptions): Uint8Array {
	const { data, width, height } = frame;
	const count = width * height;
	const values = new Uint8Array(count);
	const saturations = new Float32Array(count);
	const histogram = new Array<number>(256).fill(0);

	for (let i = 0; i < count; i++) {
		const o = i * 4;
		const { s, v } = rgbToHsv(data[o], data[o + 1], data[o + 2]);
		const v8 = Math.round(v * 255);
		values[i] = v8;
		saturations[i] = s;
		histogram[v8] += 1;
	}

	const threshold = otsuThreshold(histogram);
	const mask = new Uint8Array(count);
	for (let i = 0; i < count; i++) {
		mask[i] = values[i] > threshold && saturations[i] < options.maxFaceSaturation ? 1 : 0;
	}
	return mask;
}

/**
 * Flood-fills the mask into connected components (8-connectivity) and keeps the ones shaped like a
 * tile. Iterative with an explicit stack — recursion blows up on a full-frame component.
 */
export function findCandidates(
	mask: Uint8Array,
	width: number,
	height: number,
	options: SegmentOptions = DEFAULT_SEGMENT_OPTIONS
): Candidate[] {
	const total = width * height;
	const seen = new Uint8Array(total);
	const stack = new Int32Array(total);
	const candidates: Candidate[] = [];

	const minArea = options.minAreaFraction * total;
	const maxArea = options.maxAreaFraction * total;

	for (let start = 0; start < total; start++) {
		if (mask[start] === 0 || seen[start] === 1) continue;

		let top = 0;
		stack[top++] = start;
		seen[start] = 1;

		let area = 0;
		let minX = width;
		let maxX = -1;
		let minY = height;
		let maxY = -1;

		while (top > 0) {
			const index = stack[--top];
			const x = index % width;
			const y = (index - x) / width;

			area += 1;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;

			for (let dy = -1; dy <= 1; dy++) {
				const ny = y + dy;
				if (ny < 0 || ny >= height) continue;
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					if (nx < 0 || nx >= width) continue;
					const n = ny * width + nx;
					if (mask[n] === 1 && seen[n] === 0) {
						seen[n] = 1;
						stack[top++] = n;
					}
				}
			}
		}

		if (area < minArea || area > maxArea) continue;

		const boxWidth = maxX - minX + 1;
		const boxHeight = maxY - minY + 1;
		const aspect = boxHeight / boxWidth;
		if (aspect < options.minAspect || aspect > options.maxAspect) continue;

		const fill = area / (boxWidth * boxHeight);
		if (fill < options.minFill) continue;

		candidates.push({ x: minX, y: minY, width: boxWidth, height: boxHeight, area, fill });
	}

	return candidates;
}

/**
 * Tiles in one photo are all about the same size, so anything wildly off the median is glare, a
 * napkin, or part of the rack rather than a tile.
 */
export function keepSimilarSizes(candidates: Candidate[]): Candidate[] {
	if (candidates.length < 3) return candidates;
	const mid = median(candidates.map((c) => c.area));
	return candidates.filter((c) => c.area >= mid * 0.45 && c.area <= mid * 2.2);
}

/** Left-to-right, top-to-bottom within a row — the order a person would read the rack. */
export function readingOrder(candidates: Candidate[]): Candidate[] {
	if (candidates.length === 0) return candidates;
	const rowHeight = median(candidates.map((c) => c.height)) || 1;
	return [...candidates].sort((a, b) => {
		const rowA = Math.round(a.y / rowHeight);
		const rowB = Math.round(b.y / rowHeight);
		return rowA === rowB ? a.x - b.x : rowA - rowB;
	});
}

export function segment(
	frame: Frame,
	options: SegmentOptions = DEFAULT_SEGMENT_OPTIONS
): Candidate[] {
	const mask = faceMask(frame, options);
	return readingOrder(keepSimilarSizes(findCandidates(mask, frame.width, frame.height, options)));
}
