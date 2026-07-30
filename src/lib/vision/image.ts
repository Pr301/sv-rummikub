/**
 * Small pixel helpers shared by the glyph-finding and classification stages. Everything here works
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

/**
 * Per-pixel planes for a whole frame, converted once and read by every later pass.
 *
 * Alongside HSV there is chromaticity — each channel over the sum of all three. Stripping intensity
 * out that way is what lets ink be told from the tile it is printed on: a cream face under warm
 * light is nearly as *saturated* as the inks are, so saturation alone separates nothing, but its
 * chromaticity is steady across the whole face and the print's is not.
 */
export interface PixelPlanes {
	hue: Float32Array;
	saturation: Float32Array;
	value: Uint8Array;
	/** Red and green chromaticity, each scaled to 0–255. Blue is implied by the other two. */
	chromaRed: Uint8Array;
	chromaGreen: Uint8Array;
}

export function pixelPlanes(frame: Frame): PixelPlanes {
	const count = frame.width * frame.height;
	const hue = new Float32Array(count);
	const saturation = new Float32Array(count);
	const value = new Uint8Array(count);
	const chromaRed = new Uint8Array(count);
	const chromaGreen = new Uint8Array(count);

	for (let i = 0; i < count; i++) {
		const o = i * 4;
		const r = frame.data[o];
		const g = frame.data[o + 1];
		const b = frame.data[o + 2];
		const { h, s, v } = rgbToHsv(r, g, b);
		hue[i] = h;
		saturation[i] = s;
		value[i] = Math.round(v * 255);

		const sum = r + g + b;
		// A pixel with no light in it has no colour to speak of; call it neutral rather than divide.
		chromaRed[i] = sum === 0 ? 85 : Math.round((r / sum) * 255);
		chromaGreen[i] = sum === 0 ? 85 : Math.round((g / sum) * 255);
	}

	return { hue, saturation, value, chromaRed, chromaGreen };
}

/**
 * Summed-area table, so the mean brightness of any rectangle costs four lookups. That is what makes
 * a local-contrast threshold affordable: every pixel gets compared against its own neighbourhood
 * instead of against one global cut-off that a shadow across the rack would ruin.
 */
export function integralImage(values: Uint8Array, width: number, height: number): Float64Array {
	const stride = width + 1;
	const integral = new Float64Array(stride * (height + 1));

	for (let y = 0; y < height; y++) {
		let rowSum = 0;
		for (let x = 0; x < width; x++) {
			rowSum += values[y * width + x];
			integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
		}
	}

	return integral;
}

/** Mean of the half-open rectangle, clamped to the frame. Returns 0 for an empty rectangle. */
export function areaMean(
	integral: Float64Array,
	width: number,
	height: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number
): number {
	const ax = Math.max(0, Math.min(width, x0));
	const ay = Math.max(0, Math.min(height, y0));
	const bx = Math.max(0, Math.min(width, x1));
	const by = Math.max(0, Math.min(height, y1));
	if (bx <= ax || by <= ay) return 0;

	const stride = width + 1;
	const sum =
		integral[by * stride + bx] -
		integral[ay * stride + bx] -
		integral[by * stride + ax] +
		integral[ay * stride + ax];
	return sum / ((bx - ax) * (by - ay));
}

/**
 * Turns a frame through a whole number of right angles, clockwise.
 *
 * Digit templates only match upright numerals, so a rack photographed sideways reads as nothing at
 * all. Rather than trying to match every glyph at four rotations and reconciling the results, the
 * frame itself is turned and the whole pipeline re-run — which keeps left-to-right digit grouping
 * meaningful, since "13" is only two adjacent digits in the orientation it was printed in.
 */
export function rotateFrame(frame: Frame, turns: number): Frame {
	const quarter = ((turns % 4) + 4) % 4;
	if (quarter === 0) return frame;

	const { width, height } = frame;
	const swapped = quarter !== 2;
	const outWidth = swapped ? height : width;
	const outHeight = swapped ? width : height;
	const data = new Uint8ClampedArray(outWidth * outHeight * 4);

	for (let y = 0; y < outHeight; y++) {
		for (let x = 0; x < outWidth; x++) {
			let sx: number;
			let sy: number;
			if (quarter === 1) {
				sx = y;
				sy = height - 1 - x;
			} else if (quarter === 2) {
				sx = width - 1 - x;
				sy = height - 1 - y;
			} else {
				sx = width - 1 - y;
				sy = x;
			}
			const to = (y * outWidth + x) * 4;
			const from = (sy * width + sx) * 4;
			data[to] = frame.data[from];
			data[to + 1] = frame.data[from + 1];
			data[to + 2] = frame.data[from + 2];
			data[to + 3] = frame.data[from + 3];
		}
	}

	return { data, width: outWidth, height: outHeight };
}

/** Maps a box found in a rotated frame back onto the frame it was rotated from. */
export function unrotateBox(
	box: Box,
	turns: number,
	rotatedWidth: number,
	rotatedHeight: number
): Box {
	const quarter = ((turns % 4) + 4) % 4;
	if (quarter === 0) return { ...box };
	if (quarter === 1) {
		return {
			x: box.y,
			y: rotatedWidth - box.x - box.width,
			width: box.height,
			height: box.width
		};
	}
	if (quarter === 2) {
		return {
			x: rotatedWidth - box.x - box.width,
			y: rotatedHeight - box.y - box.height,
			width: box.width,
			height: box.height
		};
	}
	return {
		x: rotatedHeight - box.y - box.height,
		y: box.x,
		width: box.height,
		height: box.width
	};
}

export interface Component extends Box {
	/** 1-based label, matching the value stored in `labels`. */
	id: number;
	/** Pixel count, which is at most width × height. */
	area: number;
}

export interface ComponentResult {
	/** Frame-sized; 0 is background, anything else is a component id. */
	labels: Int32Array;
	components: Component[];
}

/**
 * Labels the mask's 8-connected regions. Iterative with an explicit stack — recursion overflows on
 * a component that covers most of the frame.
 */
export function connectedComponents(
	mask: Uint8Array,
	width: number,
	height: number
): ComponentResult {
	const total = width * height;
	const labels = new Int32Array(total);
	const stack = new Int32Array(total);
	const components: Component[] = [];
	let nextId = 0;

	for (let start = 0; start < total; start++) {
		if (mask[start] === 0 || labels[start] !== 0) continue;

		nextId += 1;
		let top = 0;
		stack[top++] = start;
		labels[start] = nextId;

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
					if (mask[n] === 1 && labels[n] === 0) {
						labels[n] = nextId;
						stack[top++] = n;
					}
				}
			}
		}

		components.push({
			id: nextId,
			area,
			x: minX,
			y: minY,
			width: maxX - minX + 1,
			height: maxY - minY + 1
		});
	}

	return { labels, components };
}

/**
 * Cuts one component out of a label image into its own box-sized mask. Neighbouring components that
 * merely overlap the bounding box are left out, so a glyph is never contaminated by the one beside
 * it.
 */
export function componentMask(labels: Int32Array, width: number, component: Component): Uint8Array {
	const out = new Uint8Array(component.width * component.height);
	for (let y = 0; y < component.height; y++) {
		const sy = component.y + y;
		for (let x = 0; x < component.width; x++) {
			const sx = component.x + x;
			if (labels[sy * width + sx] === component.id) out[y * component.width + x] = 1;
		}
	}
	return out;
}

export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
