import { describe, expect, it } from 'vitest';
import {
	connectedComponents,
	hueDistance,
	meanHue,
	otsuThreshold,
	pixelPlanes,
	rgbToHsv,
	rotateFrame,
	unrotateBox
} from './image';
import type { Box, Frame } from './image';
import {
	brightLevel,
	DEFAULT_GLYPH_OPTIONS,
	findGlyphs,
	groupNumerals,
	inkMask,
	keepConsistentHeights,
	tileBox,
	type Glyph
} from './glyphs';
import {
	classifyColor,
	correlate,
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

/**
 * A cream tile face on a dark table, with one dark bar printed on it. The bar is kept narrow
 * relative to the face-scale window, exactly as a real numeral is relative to its tile — the ink
 * test needs a majority of that window to be bare face to have something to contrast against.
 */
function tileWithPrint(): Frame {
	const frame = blankFrame(200, 200);
	paintRect(frame, 40, 40, 60, 84, CREAM);
	// A stem with a foot, so the shape fills its box the way a numeral does rather than solidly —
	// a completely solid block is not a digit, and the fill test is right to throw it out.
	paintRect(frame, 68, 60, 5, 24, [30, 28, 26]);
	paintRect(frame, 64, 80, 13, 4, [30, 28, 26]);
	return frame;
}

function glyph(x: number, y: number, width: number, height: number): Glyph {
	return {
		x,
		y,
		width,
		height,
		area: width * height,
		fill: 1,
		mask: new Uint8Array(width * height).fill(1),
		hue: 0,
		saturation: 0.8
	};
}

describe('finding ink', () => {
	it('marks print but not the face it sits on', () => {
		const frame = tileWithPrint();
		const mask = inkMask(pixelPlanes(frame), frame.width, frame.height, DEFAULT_GLYPH_OPTIONS);
		const at = (x: number, y: number) => mask[y * frame.width + x];

		expect(at(69, 72)).toBe(1); // middle of the print
		expect(at(90, 50)).toBe(0); // bare tile face
	});

	it('leaves a dark background alone, however dark it is', () => {
		// The rack is darker than any print, but nothing around it is brighter, so it has no local
		// contrast. Letting it in would bridge every tile on it into a single blob.
		const frame = tileWithPrint();
		const mask = inkMask(pixelPlanes(frame), frame.width, frame.height, DEFAULT_GLYPH_OPTIONS);
		expect(mask[10 * frame.width + 10]).toBe(0);
		expect(mask[180 * frame.width + 180]).toBe(0);
	});

	it('reports the brightness the lit parts of a frame reach', () => {
		const values = new Uint8Array(1000);
		values.fill(40);
		values.fill(230, 900);
		expect(brightLevel(values)).toBeGreaterThan(200);
	});

	it('picks out the printed shape as a candidate glyph', () => {
		const frame = tileWithPrint();
		const found = findGlyphs(frame);
		const print = found.find((g) => g.x > 60 && g.x < 72 && g.y > 55 && g.y < 66);
		expect(print).toBeDefined();
		expect(print!.height).toBeGreaterThan(print!.width);
	});
});

describe('connected components', () => {
	it('labels separate blobs separately and bounds each one', () => {
		const width = 10;
		const height = 6;
		const mask = new Uint8Array(width * height);
		const set = (x: number, y: number) => (mask[y * width + x] = 1);
		set(1, 1);
		set(2, 1);
		set(1, 2);
		set(7, 4);

		const { components } = connectedComponents(mask, width, height);
		expect(components).toHaveLength(2);
		expect(components[0]).toMatchObject({ x: 1, y: 1, width: 2, height: 2, area: 3 });
		expect(components[1]).toMatchObject({ x: 7, y: 4, width: 1, height: 1, area: 1 });
	});

	it('joins pixels that touch only at a corner', () => {
		const width = 6;
		const height = 6;
		const mask = new Uint8Array(width * height);
		mask[1 * width + 1] = 1;
		mask[2 * width + 2] = 1;
		expect(connectedComponents(mask, width, height).components).toHaveLength(1);
	});
});

describe('grouping digits into numerals', () => {
	it('joins two digits of one numeral and keeps the next tile apart', () => {
		// Two digits nearly touching, then a wide gap to the neighbouring tile's numeral.
		const numerals = groupNumerals([
			glyph(10, 10, 8, 20),
			glyph(20, 10, 8, 20),
			glyph(70, 10, 8, 20)
		]);
		expect(numerals).toHaveLength(2);
		expect(numerals[0].glyphs).toHaveLength(2);
		expect(numerals[1].glyphs).toHaveLength(1);
	});

	it('never takes more than the two digits a tile can carry', () => {
		const numerals = groupNumerals([
			glyph(10, 10, 8, 20),
			glyph(19, 10, 8, 20),
			glyph(28, 10, 8, 20)
		]);
		expect(numerals[0].glyphs).toHaveLength(2);
	});

	it('keeps digits on different rows apart', () => {
		const numerals = groupNumerals([glyph(10, 10, 8, 20), glyph(20, 60, 8, 20)]);
		expect(numerals).toHaveLength(2);
	});

	it('reads left to right within a row, and rows top to bottom', () => {
		const numerals = groupNumerals([
			glyph(60, 62, 8, 20),
			glyph(10, 60, 8, 20),
			glyph(10, 8, 8, 20)
		]);
		expect(numerals.map((n) => [n.x, n.y])).toEqual([
			[10, 8],
			[10, 60],
			[60, 62]
		]);
	});

	it('drops glyphs whose size is nothing like the rest', () => {
		const kept = keepConsistentHeights([
			glyph(0, 0, 8, 20),
			glyph(20, 0, 8, 20),
			glyph(40, 0, 8, 21),
			glyph(60, 0, 30, 70)
		]);
		expect(kept).toHaveLength(3);
	});

	it('puts the tile box around the numeral that was read', () => {
		const numeral = groupNumerals([glyph(100, 100, 10, 20)])[0];
		const box = tileBox(numeral, 20);
		expect(box.height).toBeGreaterThan(numeral.height);
		expect(box.x).toBeLessThan(numeral.x);
		expect(box.x + box.width).toBeGreaterThan(numeral.x + numeral.width);
	});
});

describe('rotation', () => {
	it('turns a frame through a right angle and swaps its dimensions', () => {
		const frame = blankFrame(4, 2);
		paintRect(frame, 0, 0, 1, 1, [255, 0, 0]);
		const turned = rotateFrame(frame, 1);

		expect(turned.width).toBe(2);
		expect(turned.height).toBe(4);
		// The top-left corner swings round to the top-right.
		expect(turned.data[(0 * 2 + 1) * 4]).toBe(255);
	});

	it('brings a box found in a turned frame back to where it started', () => {
		const frame = blankFrame(40, 24);
		const original: Box = { x: 5, y: 7, width: 6, height: 4 };

		for (const turns of [0, 1, 2, 3]) {
			const turned = rotateFrame(frame, turns);
			// Forward-map the box the same way the pixels move, then ask for it back.
			const moved =
				turns === 0
					? original
					: turns === 1
						? {
								x: turned.width - original.y - original.height,
								y: original.x,
								width: original.height,
								height: original.width
							}
						: turns === 2
							? {
									x: turned.width - original.x - original.width,
									y: turned.height - original.y - original.height,
									width: original.width,
									height: original.height
								}
							: {
									x: original.y,
									y: turned.height - original.x - original.width,
									width: original.height,
									height: original.width
								};

			expect(unrotateBox(moved, turns, turned.width, turned.height)).toEqual(original);
		}
	});
});

describe('ink colour', () => {
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
		const hollow = maskFromRows(['####', '#..#', '#..#', '####']);
		const bar = maskFromRows(['##..', '##..', '##..', '##..']);
		const a = normalizeGlyph(hollow.mask, hollow.width, hollow.height, {
			x: 0,
			y: 0,
			width: 4,
			height: 4
		});
		const b = normalizeGlyph(bar.mask, bar.width, bar.height, { x: 0, y: 0, width: 4, height: 4 });
		expect(correlate(a, a)).toBeCloseTo(1);
		expect(correlate(a, b)).toBeLessThan(0.8);
	});

	it('scores a featureless glyph at zero rather than matching everything', () => {
		// Normalisation stretches a filled block into a flat field with nothing to correlate against.
		const solid = maskFromRows(['####', '####', '####', '####']);
		const flat = normalizeGlyph(solid.mask, solid.width, solid.height, {
			x: 0,
			y: 0,
			width: 4,
			height: 4
		});
		expect(correlate(flat, flat)).toBe(0);
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
