import { describe, expect, it } from 'vitest';
import { hueDistance, meanHue, otsuThreshold, rgbToHsv } from './image';
import type { Frame } from './image';
import {
	DEFAULT_SEGMENT_OPTIONS,
	faceMask,
	findCandidates,
	keepSimilarSizes,
	readingOrder
} from './segment';
import {
	classifyColor,
	correlate,
	extractInk,
	GLYPH_HEIGHT,
	GLYPH_WIDTH,
	inkBounds,
	matchGlyph,
	normalizeGlyph,
	splitDigits,
	type DigitTemplate
} from './classify';
import { tilePoints, totalPoints, isUncertain, JOKER_POINTS, type ScannedTile } from './tiles';

/** Builds a blank dark "table" frame that tiles can be painted onto. */
function blankFrame(
	width: number,
	height: number,
	rgb: [number, number, number] = [20, 18, 15]
): Frame {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = rgb[0];
		data[i * 4 + 1] = rgb[1];
		data[i * 4 + 2] = rgb[2];
		data[i * 4 + 3] = 255;
	}
	return { data, width, height };
}

function paintRect(
	frame: Frame,
	x: number,
	y: number,
	w: number,
	h: number,
	rgb: [number, number, number]
) {
	for (let py = y; py < y + h; py++) {
		for (let px = x; px < x + w; px++) {
			if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) continue;
			const o = (py * frame.width + px) * 4;
			frame.data[o] = rgb[0];
			frame.data[o + 1] = rgb[1];
			frame.data[o + 2] = rgb[2];
		}
	}
}

const CREAM: [number, number, number] = [242, 232, 213];

describe('colour maths', () => {
	it('converts rgb to hsv', () => {
		expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 });
		expect(rgbToHsv(0, 0, 255).h).toBeCloseTo(240);
		expect(rgbToHsv(128, 128, 128).s).toBe(0);
	});

	it('measures hue distance the short way around the circle', () => {
		expect(hueDistance(350, 10)).toBe(20);
		expect(hueDistance(10, 350)).toBe(20);
		expect(hueDistance(0, 180)).toBe(180);
	});

	it('averages hues circularly, not arithmetically', () => {
		expect(meanHue([350, 10])).toBeCloseTo(0, 0);
		expect(meanHue([10, 50])).toBeCloseTo(30, 0);
	});

	it('finds a threshold between two brightness clusters', () => {
		const histogram = new Array<number>(256).fill(0);
		histogram[30] = 500;
		histogram[220] = 500;
		const t = otsuThreshold(histogram);
		expect(t).toBeGreaterThan(30);
		expect(t).toBeLessThan(220);
	});
});

describe('segmentation', () => {
	it('finds tile-shaped bright regions and ignores the background', () => {
		const frame = blankFrame(200, 200);
		paintRect(frame, 20, 30, 30, 42, CREAM);
		paintRect(frame, 70, 30, 30, 42, CREAM);

		const mask = faceMask(frame, DEFAULT_SEGMENT_OPTIONS);
		const found = findCandidates(mask, frame.width, frame.height);

		expect(found).toHaveLength(2);
		expect(found[0]).toMatchObject({ x: 20, y: 30, width: 30, height: 42 });
	});

	it('rejects regions that are too wide to be a tile', () => {
		const frame = blankFrame(200, 200);
		paintRect(frame, 20, 20, 120, 40, CREAM);

		const found = findCandidates(faceMask(frame, DEFAULT_SEGMENT_OPTIONS), 200, 200);
		expect(found).toHaveLength(0);
	});

	it('rejects a hollow ring, which fills its box too sparsely', () => {
		const frame = blankFrame(200, 200);
		paintRect(frame, 40, 40, 40, 56, CREAM);
		paintRect(frame, 48, 48, 24, 40, [20, 18, 15]);

		const found = findCandidates(faceMask(frame, DEFAULT_SEGMENT_OPTIONS), 200, 200);
		expect(found).toHaveLength(0);
	});

	it('drops outliers far from the median tile size', () => {
		const candidates = [
			{ x: 0, y: 0, width: 10, height: 14, area: 140, fill: 1 },
			{ x: 20, y: 0, width: 10, height: 14, area: 140, fill: 1 },
			{ x: 40, y: 0, width: 10, height: 14, area: 140, fill: 1 },
			{ x: 60, y: 0, width: 40, height: 56, area: 2240, fill: 1 }
		];
		expect(keepSimilarSizes(candidates)).toHaveLength(3);
	});

	it('orders tiles the way a person reads a rack', () => {
		const ordered = readingOrder([
			{ x: 60, y: 2, width: 10, height: 14, area: 140, fill: 1 },
			{ x: 10, y: 40, width: 10, height: 14, area: 140, fill: 1 },
			{ x: 10, y: 0, width: 10, height: 14, area: 140, fill: 1 }
		]);
		expect(ordered.map((c) => [c.x, c.y])).toEqual([
			[10, 0],
			[60, 2],
			[10, 40]
		]);
	});
});

describe('ink extraction and colour', () => {
	it('separates dark print from a cream tile face', () => {
		const frame = blankFrame(60, 80, CREAM);
		paintRect(frame, 22, 24, 14, 30, [27, 27, 27]);

		const ink = extractInk(frame, { x: 0, y: 0, width: 60, height: 80 });
		expect(ink.coverage).toBeGreaterThan(0.05);
		expect(ink.coverage).toBeLessThan(0.35);
		expect(ink.saturation).toBeLessThan(0.3);
	});

	it('calls low-saturation print black', () => {
		expect(classifyColor({ hue: 0, saturation: 0.05 }, null).color).toBe('black');
	});

	it('separates the three coloured inks by hue', () => {
		expect(classifyColor({ hue: 5, saturation: 0.8 }, null).color).toBe('red');
		expect(classifyColor({ hue: 33, saturation: 0.8 }, null).color).toBe('orange');
		expect(classifyColor({ hue: 212, saturation: 0.8 }, null).color).toBe('blue');
	});

	it('reports low confidence for a hue sitting between red and orange', () => {
		const between = classifyColor({ hue: 19, saturation: 0.8 }, null);
		const clear = classifyColor({ hue: 212, saturation: 0.8 }, null);
		expect(between.confidence).toBeLessThan(clear.confidence);
	});

	it('honours user calibration over the defaults', () => {
		const calibration = {
			measuredAt: 0,
			hues: { red: 350, blue: 200, orange: 25 },
			blackMaxValue: 0.3
		};
		expect(classifyColor({ hue: 350, saturation: 0.8 }, calibration).color).toBe('red');
	});
});

describe('glyph handling', () => {
	function maskFromRows(rows: string[]): { mask: Uint8Array; width: number; height: number } {
		const width = rows[0].length;
		const height = rows.length;
		const mask = new Uint8Array(width * height);
		rows.forEach((row, y) => {
			[...row].forEach((ch, x) => {
				mask[y * width + x] = ch === '#' ? 1 : 0;
			});
		});
		return { mask, width, height };
	}

	it('finds the tight box around ink', () => {
		const { mask, width, height } = maskFromRows(['.....', '.##..', '.##..', '.....']);
		expect(inkBounds(mask, width, height)).toEqual({ x: 1, y: 1, width: 2, height: 2 });
	});

	it('returns null for a blank region', () => {
		const { mask, width, height } = maskFromRows(['...', '...']);
		expect(inkBounds(mask, width, height)).toBeNull();
	});

	it('treats a narrow numeral as a single digit', () => {
		const { mask, width, height } = maskFromRows([
			'.##.',
			'.##.',
			'.##.',
			'.##.',
			'.##.',
			'.##.',
			'.##.',
			'.##.'
		]);
		const bounds = inkBounds(mask, width, height)!;
		expect(splitDigits(mask, width, height, bounds)).toHaveLength(1);
	});

	it('splits a wide numeral into two digits at the gap', () => {
		const { mask, width, height } = maskFromRows([
			'##..##',
			'##..##',
			'##..##',
			'##..##',
			'##..##',
			'##..##'
		]);
		const bounds = inkBounds(mask, width, height)!;
		const parts = splitDigits(mask, width, height, bounds);
		expect(parts).toHaveLength(2);
		expect(parts[0].x).toBeLessThan(parts[1].x);
	});

	it('normalises any glyph to the template size', () => {
		const { mask, width, height } = maskFromRows(['####', '####', '####']);
		const glyph = normalizeGlyph(mask, width, height, { x: 0, y: 0, width, height });
		expect(glyph).toHaveLength(GLYPH_WIDTH * GLYPH_HEIGHT);
		expect(glyph.some((v) => v > 0)).toBe(true);
	});

	it('preserves the shape rather than flattening it into a blob', () => {
		// A left-heavy glyph must stay left-heavy after resampling.
		const { mask, width, height } = maskFromRows(['##..', '##..', '##..', '##..', '##..', '##..']);
		const glyph = normalizeGlyph(mask, width, height, { x: 0, y: 0, width, height });

		let left = 0;
		let right = 0;
		for (let y = 0; y < GLYPH_HEIGHT; y++) {
			for (let x = 0; x < GLYPH_WIDTH; x++) {
				const v = glyph[y * GLYPH_WIDTH + x];
				if (x < GLYPH_WIDTH / 2) left += v;
				else right += v;
			}
		}
		expect(left).toBeGreaterThan(right * 3);
	});

	it('resamples the same regardless of where the glyph sits in the mask', () => {
		// The bug this guards: a source window built from mixed absolute and box-relative
		// coordinates grows with the glyph's offset and averages every digit into a blob.
		const rows = ['.####.', '.#..#.', '.#..#.', '.####.', '.#....', '.#....'];
		const flat = maskFromRows(rows);
		const atOrigin = normalizeGlyph(flat.mask, flat.width, flat.height, {
			x: 0,
			y: 0,
			width: flat.width,
			height: flat.height
		});

		// The same rows, shifted six across and six down, with the box moved to match.
		const padded = maskFromRows([
			'............',
			'............',
			'............',
			'............',
			'............',
			'............',
			...rows.map((row) => '......' + row)
		]);
		const offset = normalizeGlyph(padded.mask, padded.width, padded.height, {
			x: 6,
			y: 6,
			width: 6,
			height: 6
		});

		expect(correlate(atOrigin, offset)).toBeGreaterThan(0.95);
	});

	it('tells two different shapes apart', () => {
		const solid = maskFromRows(['####', '####', '####', '####']);
		const hollow = maskFromRows(['####', '#..#', '#..#', '####']);
		const a = normalizeGlyph(solid.mask, solid.width, solid.height, {
			x: 0,
			y: 0,
			width: 4,
			height: 4
		});
		const b = normalizeGlyph(hollow.mask, hollow.width, hollow.height, {
			x: 0,
			y: 0,
			width: 4,
			height: 4
		});
		expect(correlate(a, a)).toBeCloseTo(1);
		expect(correlate(a, b)).toBeLessThan(0.8);
	});

	it('correlates a glyph perfectly with itself and poorly with its inverse', () => {
		const a = new Float32Array([1, 0, 1, 0, 1, 0]);
		const b = new Float32Array([0, 1, 0, 1, 0, 1]);
		expect(correlate(a, a)).toBeCloseTo(1);
		expect(correlate(a, b)).toBe(0);
	});

	it('picks the closest template', () => {
		const templates: DigitTemplate[] = [
			{ digit: 1, data: new Float32Array([1, 1, 0, 0]) },
			{ digit: 7, data: new Float32Array([0, 0, 1, 1]) }
		];
		expect(matchGlyph(new Float32Array([1, 1, 0, 0]), templates).digit).toBe(1);
		expect(matchGlyph(new Float32Array([0, 0, 1, 1]), templates).digit).toBe(7);
	});
});

describe('tile scoring', () => {
	it('scores a joker at 30 and everything else at face value', () => {
		expect(tilePoints('joker')).toBe(JOKER_POINTS);
		expect(tilePoints(13)).toBe(13);
		expect(tilePoints(1)).toBe(1);
	});

	it('totals a rack', () => {
		const tiles: ScannedTile[] = [
			{ id: 'a', value: 13, color: 'red', confidence: 1 },
			{ id: 'b', value: 'joker', color: 'black', confidence: 1 },
			{ id: 'c', value: 7, color: 'blue', confidence: 1 }
		];
		expect(totalPoints(tiles)).toBe(50);
	});

	it('flags low-confidence reads for confirmation', () => {
		expect(isUncertain({ id: 'a', value: 3, color: 'red', confidence: 0.4 })).toBe(true);
		expect(isUncertain({ id: 'b', value: 3, color: 'red', confidence: 0.9 })).toBe(false);
	});
});
