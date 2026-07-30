import {
	areaMean,
	componentMask,
	connectedComponents,
	integralImage,
	meanHue,
	median,
	pixelPlanes,
	type Box,
	type Frame,
	type PixelPlanes
} from './image';

/**
 * Finding the printed numerals, rather than the tiles they are printed on.
 *
 * The obvious approach — mask the bone-coloured tile faces, then read whatever is inside each one —
 * falls apart on ordinary photos. A tile face and a pale table are nearly the same brightness, so
 * no threshold separates them; and tiles pushed together on a rack touch, so the faces that *are*
 * found merge into one long blob rather than one component per tile.
 *
 * The print has neither problem. Ink always contrasts with the face it is printed on — in colour,
 * in brightness, or both — and there is always a gap between one tile's numeral and the next. So
 * the numerals are located first and the tiles inferred from them.
 */
export interface GlyphOptions {
	/** Fraction below the surrounding brightness at which a pixel counts as dark ink. */
	darkDrop: number;
	/** Floor on that drop in absolute brightness, so faint texture is not mistaken for print. */
	darkMargin: number;
	/** How far a pixel's chromaticity must sit from its surroundings to count as coloured ink. */
	chromaMargin: number;
	/** Radius of the face-scale window, as a fraction of frame width. */
	faceRadiusFraction: number;
	/** How bright the face-scale neighbourhood must be, relative to the frame's bright level. */
	minFaceBrightness: number;
	/** Component area as a fraction of the frame. */
	minAreaFraction: number;
	maxAreaFraction: number;
	/**
	 * Glyph height / width. Wide enough at the bottom end to admit a two-digit numeral whose digits
	 * have run together into one component, and at the top end a bare "1".
	 */
	minAspect: number;
	maxAspect: number;
	/** Component pixels / bounding-box pixels — rejects hairlines and solid blobs alike. */
	minFill: number;
	maxFill: number;
	/** Largest gap between two digits of one numeral, as a fraction of glyph height. */
	maxDigitGap: number;
	/** How far two digits' centres may differ vertically, as a fraction of glyph height. */
	maxBaselineDrift: number;
}

export const DEFAULT_GLYPH_OPTIONS: GlyphOptions = {
	darkDrop: 0.25,
	darkMargin: 25,
	chromaMargin: 14,
	faceRadiusFraction: 0.05,
	minFaceBrightness: 0.55,
	minAreaFraction: 0.00006,
	maxAreaFraction: 0.06,
	minAspect: 0.5,
	maxAspect: 4.5,
	minFill: 0.22,
	maxFill: 0.95,
	maxDigitGap: 0.5,
	maxBaselineDrift: 0.4
};

/**
 * Tuned for one tile held up close, filling much of the frame.
 *
 * At that scale a numeral's strokes are thick enough that a face-scale window sized for a whole
 * rack would sit entirely inside the ink, find no contrast, and hollow the digit out. Everything
 * here is simply the ordinary settings widened to match.
 */
export const CLOSE_UP_GLYPH_OPTIONS: GlyphOptions = {
	...DEFAULT_GLYPH_OPTIONS,
	faceRadiusFraction: 0.16,
	maxAreaFraction: 0.4,
	minFill: 0.15
};

export interface Glyph extends Box {
	area: number;
	fill: number;
	/** Box-sized, holding only this component's pixels. */
	mask: Uint8Array;
	/** Saturation-weighted circular mean hue of the component's pixels, in degrees. */
	hue: number;
	saturation: number;
}

/** Brightness the frame's brightest few per cent reach — a stand-in for "as lit as a tile face". */
export function brightLevel(values: Uint8Array, quantile = 0.95): number {
	const histogram = new Array<number>(256).fill(0);
	for (let i = 0; i < values.length; i++) histogram[values[i]] += 1;

	const target = values.length * quantile;
	let seen = 0;
	for (let v = 0; v < 256; v++) {
		seen += histogram[v];
		if (seen >= target) return v;
	}
	return 255;
}

/**
 * Marks printed ink: anything that stands out from the tile face immediately around it, either by
 * being darker or by being a different colour.
 *
 * Everything here is judged locally and relatively, which is what makes it survive real photos.
 * Absolute thresholds all fail on this material — a cream face under warm light is as saturated as
 * the inks, and as bright as the table it sits on — but no tile is printed in the colour of its own
 * face, so contrast against the immediate surroundings always separates the two.
 *
 * The face-scale gate is what keeps the rack out. The rack is very dark, but so is everything
 * around it, so it shows no local contrast; more importantly, a rack that leaks into the mask does
 * not merely add clutter, it bridges every tile resting on it into a single blob and swallows the
 * numerals whole.
 */
export function inkMask(
	planes: PixelPlanes,
	width: number,
	height: number,
	options: GlyphOptions
): Uint8Array {
	const mask = new Uint8Array(width * height);
	const valueIntegral = integralImage(planes.value, width, height);
	const redIntegral = integralImage(planes.chromaRed, width, height);
	const greenIntegral = integralImage(planes.chromaGreen, width, height);

	const faceRadius = Math.max(6, Math.round(width * options.faceRadiusFraction));
	const minFace = brightLevel(planes.value) * options.minFaceBrightness;
	const chromaMarginSquared = options.chromaMargin * options.chromaMargin;

	for (let y = 0; y < height; y++) {
		const y0 = y - faceRadius;
		const y1 = y + faceRadius + 1;

		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			const x0 = x - faceRadius;
			const x1 = x + faceRadius + 1;

			const face = areaMean(valueIntegral, width, height, x0, y0, x1, y1);
			if (face < minFace) continue;

			if (planes.value[i] <= face - Math.max(options.darkMargin, face * options.darkDrop)) {
				mask[i] = 1;
				continue;
			}

			const red = areaMean(redIntegral, width, height, x0, y0, x1, y1);
			const green = areaMean(greenIntegral, width, height, x0, y0, x1, y1);
			const dr = planes.chromaRed[i] - red;
			const dg = planes.chromaGreen[i] - green;
			if (dr * dr + dg * dg >= chromaMarginSquared) mask[i] = 1;
		}
	}

	return mask;
}

/**
 * Every ink component that is shaped like a digit. Shape alone still admits stray marks, so the
 * survivors are then held against the median height: printed numerals on one rack are all the same
 * size, and anything well off that is a shadow, a crumb, or the edge of something else.
 */
export function findGlyphs(frame: Frame, options: GlyphOptions = DEFAULT_GLYPH_OPTIONS): Glyph[] {
	const planes = pixelPlanes(frame);
	const mask = inkMask(planes, frame.width, frame.height, options);
	const { labels, components } = connectedComponents(mask, frame.width, frame.height);

	const total = frame.width * frame.height;
	const minArea = options.minAreaFraction * total;
	const maxArea = options.maxAreaFraction * total;
	const glyphs: Glyph[] = [];

	for (const component of components) {
		if (component.area < minArea || component.area > maxArea) continue;

		const aspect = component.height / component.width;
		if (aspect < options.minAspect || aspect > options.maxAspect) continue;

		const fill = component.area / (component.width * component.height);
		if (fill < options.minFill || fill > options.maxFill) continue;

		const shape = componentMask(labels, frame.width, component);
		const hues: number[] = [];
		const weights: number[] = [];
		let saturationSum = 0;

		for (let y = 0; y < component.height; y++) {
			for (let x = 0; x < component.width; x++) {
				if (shape[y * component.width + x] === 0) continue;
				const source = (component.y + y) * frame.width + (component.x + x);
				const saturation = planes.saturation[source];
				saturationSum += saturation;
				if (saturation > 0.2) {
					hues.push(planes.hue[source]);
					weights.push(saturation);
				}
			}
		}

		glyphs.push({
			x: component.x,
			y: component.y,
			width: component.width,
			height: component.height,
			area: component.area,
			fill,
			mask: shape,
			hue: meanHue(hues, weights),
			saturation: component.area === 0 ? 0 : saturationSum / component.area
		});
	}

	return keepConsistentHeights(glyphs);
}

/** Drops glyphs whose height is well away from the median — the print on one rack is one size. */
export function keepConsistentHeights(glyphs: Glyph[]): Glyph[] {
	if (glyphs.length < 3) return glyphs;
	const mid = median(glyphs.map((glyph) => glyph.height));
	if (mid <= 0) return glyphs;
	return glyphs.filter((glyph) => glyph.height >= mid * 0.62 && glyph.height <= mid * 1.6);
}

export interface Numeral extends Box {
	/** One or two glyphs, left to right. */
	glyphs: Glyph[];
	hue: number;
	saturation: number;
}

function centreY(box: Box): number {
	return box.y + box.height / 2;
}

/**
 * Joins digits that belong to the same tile. The two halves of a "13" nearly touch, while the gap
 * to the next tile's numeral is several times wider, so a threshold in units of glyph height
 * separates them without knowing anything about the tile size.
 */
export function groupNumerals(
	glyphs: Glyph[],
	options: GlyphOptions = DEFAULT_GLYPH_OPTIONS
): Numeral[] {
	if (glyphs.length === 0) return [];

	const glyphHeight = median(glyphs.map((glyph) => glyph.height)) || 1;
	const sorted = [...glyphs].sort((a, b) => a.x - b.x);
	const taken = new Array<boolean>(sorted.length).fill(false);
	const numerals: Numeral[] = [];

	for (let i = 0; i < sorted.length; i++) {
		if (taken[i]) continue;
		taken[i] = true;
		const group = [sorted[i]];

		// A Rummikub tile never prints more than two digits, so one partner is all that is sought.
		for (let j = i + 1; j < sorted.length; j++) {
			if (taken[j]) continue;
			const previous = group[group.length - 1];
			if (sorted[j].x - (previous.x + previous.width) > glyphHeight * options.maxDigitGap) break;
			if (
				Math.abs(centreY(sorted[j]) - centreY(previous)) >
				glyphHeight * options.maxBaselineDrift
			) {
				continue;
			}
			group.push(sorted[j]);
			taken[j] = true;
			break;
		}

		numerals.push(toNumeral(group));
	}

	return readingOrder(numerals, glyphHeight);
}

function toNumeral(glyphs: Glyph[]): Numeral {
	const minX = Math.min(...glyphs.map((glyph) => glyph.x));
	const minY = Math.min(...glyphs.map((glyph) => glyph.y));
	const maxX = Math.max(...glyphs.map((glyph) => glyph.x + glyph.width));
	const maxY = Math.max(...glyphs.map((glyph) => glyph.y + glyph.height));

	const hues: number[] = [];
	const weights: number[] = [];
	let saturationSum = 0;
	let areaSum = 0;
	for (const glyph of glyphs) {
		hues.push(glyph.hue);
		weights.push(glyph.saturation * glyph.area);
		saturationSum += glyph.saturation * glyph.area;
		areaSum += glyph.area;
	}

	return {
		glyphs,
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
		hue: meanHue(hues, weights),
		saturation: areaSum === 0 ? 0 : saturationSum / areaSum
	};
}

/** Left to right within a row, top to bottom between rows — the order a person reads a rack. */
export function readingOrder(numerals: Numeral[], rowHeight: number): Numeral[] {
	const height = rowHeight || 1;
	return [...numerals].sort((a, b) => {
		const rowA = Math.round(centreY(a) / height);
		const rowB = Math.round(centreY(b) / height);
		return rowA === rowB ? a.x - b.x : rowA - rowB;
	});
}

/**
 * Where the tile behind a numeral must be. The print sits a predictable fraction of the way down a
 * fixed-proportion tile, so the face can be reconstructed from the numeral well enough to draw an
 * overlay box over the right tile.
 */
export function tileBox(numeral: Numeral, glyphHeight: number): Box {
	const height = glyphHeight * 2.6;
	const width = height / 1.35;
	return {
		x: Math.round(numeral.x + numeral.width / 2 - width / 2),
		y: Math.round(centreY(numeral) - height * 0.42),
		width: Math.round(width),
		height: Math.round(height)
	};
}
