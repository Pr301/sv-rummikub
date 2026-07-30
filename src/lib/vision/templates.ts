import { GLYPH_HEIGHT, GLYPH_WIDTH, type DigitTemplate } from './classify';

/**
 * Digit templates, three type faces per digit, baked in as 1-bit bitmaps.
 *
 * These used to be rasterised from the browser's own fonts on first use, which made the scanner's
 * accuracy depend on which faces a given phone happened to ship — and made the pipeline impossible
 * to test outside a browser, since it needed a canvas. They are now fixed data: every device
 * matches against the same shapes, and the whole vision stack runs in plain Node.
 *
 * Each record is one byte of digit followed by `PACKED_BYTES` of bitmap, LSB-first, row-major over
 * a GLYPH_WIDTH × GLYPH_HEIGHT box. Matching is normalised cross-correlation, which happily
 * compares these hard-edged templates against the soft, greyscale glyphs that come off a photo.
 */
const PACKED_BYTES = Math.ceil((GLYPH_WIDTH * GLYPH_HEIGHT) / 8);

const PACKED =
	'AMAH8A/4P/w//H8+fD54H/gf+B/4H/gf+B/4H/gf+B/4H/g+eD58fH78P/g/8B/ABwDAB/Af+D/8P/x/fnw+/D/4H/gf+B/4H/gf+B/4H/gf+D/4Pvx+fPx//D/4P/AfwAcAwAfwD/g//D/+fz58Pvg/+B/4H/gf+B/4H/gf+B/4H/g/+D74Pnx+fvx/+D/wH+AHAQB+gP/g//j//v/////+Pv4A/gD+AP4A/gD+AP4A/gD+AP4A/gD+AP4A/gD+APwAeAEA/8D/8P/8//////9//x//B/8B/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8BAPwA/gD+gP/+////////////AP4A/gD+AP4A/gD+AP4A/gD+AP4A/gD+AP4A/gD+AoAB8B/8P/5//38//B/4D/gG+AD4AHwAfgA/gB/AD+AH8AP4AfwAfgD////////+/wLgB/Af/D/8f/7/P/w/+B/4APgA/AB8AH4AP4A/wB/gB/AH+AP8Af7///////////8CwAfwH/g//H/8f378Pvg++D/4HvgA/AB+AH+AP8Af4A/wA/gB/AB+AP7/////////A+AH+B/8P/5/f34f+B/4DvgAeAB+wD/gH+A/wH8A/AD4BvgP+B/4f/7///5//D/wDwPgD/Af+D/8f/5/Pnw+fB54AHwAf+A/4B/gP8B/APwA+B74H/g//P7//n/8f/gf4A8DwAfwH/g//H/+fz58Png/eB54AH6AP4A/gH+A/wD4D/gf+B/4P/h+/v5//D/4H+AHBAAPgB+AH8AfwB/gH/Ad8Bx4HHgcPBw8HB4cHhwPHP9///////7/+H8AHAAcABwAHASAH4A/wD/AP+A/4D/wP/A++D54Pnw+PD4+Ph4+Hz7/f///////////AD4APgA+AD4EAD4APwA/gD+AP8A/4D/wPvA++D58Pjw+Hj4fPv////////////8APgA+AD4APgA+Bfg//H/+f/5//n8fAB8AHwCfB/8f/3//f3/+HvgE+ADwBvgP+B/4f/7+f/4/+B/gBwX+f/5//n/+f/5/HgAeAB4AnwffH/8//3//fx/8DvgA+A/4H/g//P9//n/8P/gf4AcF+H/4f/x//H/8f3wAPAA+B/4f/j/+f37/Pvwe+AD4APgf+B/4P/h/fv5//D/4H+AHBsAH8B/4P/x//H4+eB5wHwAfD98f/z//f/9+P/gf+B/wH/Ae+D74fnz8f/g/8B/ADwbAB/Af+D/8f/x/fvw++D8AHw/fP/8//3///z/8P/gf+B/4Pvg+/Px//H/4P/AfwAcGwA/gH/A/+H98fH74Pvg+AJ8P3z//f/9/f/w/+D/4P/g/+D74Pvh+fvx/+D/wH8APB/5//////////v8A+AD4AHwAfgA+AD8AH4AfgA/AD8AH4AfgA/AD8AH4AfgA+ABwAAf/////////////APgA/AB8AH4AfgA/AD+AH4AfwA/AD+AH4AfwA/AD+AH4AfwA/AAH/////////////wB8AD4AHgAfAA+AD4AHwAfAB+AD4APgA/AD8AHwAfAB+AH4AfgBCOAH+B/8P/5/Pnw/eB94Hng+fHw/+B/wH/w//n8//B/4H/gf+B/4P/z+f/x/+B/wDwjgB/gf/D/8f/5/Pnw/eD54Pnz8f/w/8B/8P/5/P/w/+B/4H/g//H/+/n/8f/gf4AcIwAfwH/g//H9+fj54Png+eD54fH74P/g//H9+/j/4H/gf+B/4P/h//P5//H/4P+APCeAH8A/4H/w//n8+fB/4H/gf+B/4P/h+/P7//P/49+DxAPgM+B54Pnz+P/wf+A/gBwngB/AP/D/8P/5/Pnw//B/4H/gf+D/8/v/+//z/+Pvw+QD4Hnw+fP5//D/8P/gf4AcJ4AfwD/gf/D/+fz58P3gf+B/4H/g/+D/8/v/8//j/8PsA+B54Pnw+fv4//B/4D+AD';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 is decoded by hand rather than through `atob` or `Buffer` so this module stays free of
 * both the DOM and Node, exactly like the rest of the pipeline.
 */
function decodeBase64(input: string): Uint8Array {
	const clean = input.replace(/=+$/, '');
	const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
	let bits = 0;
	let accumulator = 0;
	let offset = 0;

	for (const character of clean) {
		const value = BASE64_ALPHABET.indexOf(character);
		if (value < 0) continue;
		accumulator = (accumulator << 6) | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out[offset++] = (accumulator >> bits) & 0xff;
		}
	}

	return out.subarray(0, offset);
}

let cache: DigitTemplate[] | null = null;

export function digitTemplates(): DigitTemplate[] {
	if (cache) return cache;

	const bytes = decodeBase64(PACKED);
	const stride = 1 + PACKED_BYTES;
	const templates: DigitTemplate[] = [];

	for (let start = 0; start + stride <= bytes.length; start += stride) {
		const digit = bytes[start];
		const data = new Float32Array(GLYPH_WIDTH * GLYPH_HEIGHT);
		for (let i = 0; i < data.length; i++) {
			data[i] = (bytes[start + 1 + (i >> 3)] >> (i & 7)) & 1;
		}
		templates.push({ digit, data });
	}

	cache = templates;
	return templates;
}

/** Test seam: lets a fake template set be injected, and `null` restores the baked-in set. */
export function setTemplates(templates: DigitTemplate[] | null): void {
	cache = templates;
}

export { GLYPH_HEIGHT, GLYPH_WIDTH };
