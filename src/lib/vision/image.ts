/**
 * Small pixel helpers shared by the segmentation and classification stages. Everything here works
 * on a plain `{ data, width, height }` shape so the pipeline can be unit-tested without a canvas.
 */

export interface Frame {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Hsv {
	/** Degrees, 0–360. */
	h: number;
	/** 0–1. */
	s: number;
	/** 0–1. */
	v: number;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const delta = max - min;

	let h = 0;
	if (delta > 1e-6) {
		if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
		else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
		else h = 60 * ((rn - gn) / delta + 4);
	}
	if (h < 0) h += 360;

	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** Shortest distance between two hues, in degrees (0–180). */
export function hueDistance(a: number, b: number): number {
	const d = Math.abs(((a - b) % 360) + 360) % 360;
	return d > 180 ? 360 - d : d;
}

/**
 * Circular mean — hues wrap, so averaging 350° and 10° must give 0°, not 180°.
 */
export function meanHue(hues: number[], weights?: number[]): number {
	let x = 0;
	let y = 0;
	for (let i = 0; i < hues.length; i++) {
		const w = weights?.[i] ?? 1;
		const rad = (hues[i] * Math.PI) / 180;
		x += Math.cos(rad) * w;
		y += Math.sin(rad) * w;
	}
	if (x === 0 && y === 0) return 0;
	const deg = (Math.atan2(y, x) * 180) / Math.PI;
	return (deg + 360) % 360;
}

/**
 * Otsu's method: the threshold that best splits a histogram into two classes. Used to separate
 * bright tile faces from whatever they're resting on, without hard-coding a brightness.
 */
export function otsuThreshold(histogram: number[]): number {
	const total = histogram.reduce((sum, count) => sum + count, 0);
	if (total === 0) return 128;

	let sum = 0;
	for (let i = 0; i < histogram.length; i++) sum += i * histogram[i];

	let sumBackground = 0;
	let weightBackground = 0;
	let bestVariance = -1;
	// Between two well-separated clusters every threshold in the gap scores identically. Averaging
	// the whole winning plateau puts the cut in the middle of the valley instead of hard against
	// one cluster, where a little noise would push pixels to the wrong side.
	let plateauSum = 0;
	let plateauCount = 0;

	for (let t = 0; t < histogram.length; t++) {
		weightBackground += histogram[t];
		if (weightBackground === 0) continue;
		const weightForeground = total - weightBackground;
		if (weightForeground === 0) break;

		sumBackground += t * histogram[t];
		const meanBackground = sumBackground / weightBackground;
		const meanForeground = (sum - sumBackground) / weightForeground;
		const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

		if (variance > bestVariance) {
			bestVariance = variance;
			plateauSum = t;
			plateauCount = 1;
		} else if (variance === bestVariance) {
			plateauSum += t;
			plateauCount += 1;
		}
	}

	return plateauCount === 0 ? 128 : Math.round(plateauSum / plateauCount);
}

export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
