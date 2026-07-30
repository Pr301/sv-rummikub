import {
	inkBounds,
	normalizeGlyph,
	GLYPH_HEIGHT,
	GLYPH_WIDTH,
	type DigitTemplate
} from './classify';

/**
 * Digit templates are rasterised from the browser's own fonts at first use rather than shipped as
 * data. Rummikub numerals are a heavy rounded grotesque, so several weights and families are
 * rendered per digit and matched independently — a set printed in a squarer face still finds a
 * reasonable template.
 */
const FACES = [
	'700 64px ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
	'800 64px ui-sans-serif, system-ui, sans-serif',
	'600 64px "Helvetica Neue", Arial, sans-serif'
];

const RASTER = 96;

let cache: DigitTemplate[] | null = null;

function rasterize(digit: number, font: string): Float32Array | null {
	const canvas = document.createElement('canvas');
	canvas.width = RASTER;
	canvas.height = RASTER;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;

	context.fillStyle = '#fff';
	context.fillRect(0, 0, RASTER, RASTER);
	context.fillStyle = '#000';
	context.font = font;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(String(digit), RASTER / 2, RASTER / 2);

	const { data } = context.getImageData(0, 0, RASTER, RASTER);
	const mask = new Uint8Array(RASTER * RASTER);
	for (let i = 0; i < mask.length; i++) {
		mask[i] = data[i * 4] < 128 ? 1 : 0;
	}

	const bounds = inkBounds(mask, RASTER, RASTER);
	if (!bounds) return null;
	return normalizeGlyph(mask, RASTER, RASTER, bounds);
}

export function digitTemplates(): DigitTemplate[] {
	if (cache) return cache;

	const templates: DigitTemplate[] = [];
	for (let digit = 0; digit <= 9; digit++) {
		for (const font of FACES) {
			const data = rasterize(digit, font);
			if (data) templates.push({ digit, data });
		}
	}

	cache = templates;
	return templates;
}

/** Test seam: lets a fake template set be injected without touching a canvas. */
export function setTemplates(templates: DigitTemplate[] | null): void {
	cache = templates;
}

export { GLYPH_HEIGHT, GLYPH_WIDTH };
