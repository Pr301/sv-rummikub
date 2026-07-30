/**
 * Generates the PWA icons with no image dependency — just Node's zlib, writing valid PNGs by hand.
 * The mark is four tiles standing in a rack: bone rectangles on warm-black, inked in the four
 * Rummikub colours.
 *
 * Run with: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'icons');

const RACK = [0x15, 0x12, 0x0f];
const TILE = [0xf2, 0xe8, 0xd5];
const TILE_SHADE = [0xd9, 0xcb, 0xb0];
const INKS = [
	[0x1b, 0x1b, 0x1b],
	[0xc8, 0x35, 0x2f],
	[0x1e, 0x5f, 0xa8],
	[0xd9, 0x74, 0x1a]
];

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

/** rgba is a Uint8Array of size * size * 4. */
function encodePng(rgba, size) {
	// PNG rows are each prefixed with a filter byte; 0 means "no filtering".
	const stride = size * 4;
	const raw = Buffer.alloc((stride + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (stride + 1)] = 0;
		Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type: RGBA
	ihdr[10] = 0; // deflate
	ihdr[11] = 0; // adaptive filtering
	ihdr[12] = 0; // no interlace

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

function draw(size, { maskable = false } = {}) {
	const rgba = new Uint8Array(size * size * 4);

	const put = (x, y, [r, g, b]) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return;
		const o = (y * size + x) * 4;
		rgba[o] = r;
		rgba[o + 1] = g;
		rgba[o + 2] = b;
		rgba[o + 3] = 255;
	};

	const rect = (x0, y0, w, h, color, radius = 0) => {
		for (let y = y0; y < y0 + h; y++) {
			for (let x = x0; x < x0 + w; x++) {
				if (radius > 0) {
					// Skip pixels outside the rounded corner arcs.
					const dx = Math.min(x - x0, x0 + w - 1 - x);
					const dy = Math.min(y - y0, y0 + h - 1 - y);
					if (dx < radius && dy < radius) {
						const ox = radius - dx;
						const oy = radius - dy;
						if (ox * ox + oy * oy > radius * radius) continue;
					}
				}
				put(x, y, color);
			}
		}
	};

	rect(0, 0, size, size, RACK);

	// Two rows of three, at a real tile's 1:1.38 proportions — a rack seen head on.
	// Maskable icons must survive an aggressive circular crop, so the mark sits in the safe zone.
	const inset = maskable ? size * 0.26 : size * 0.13;
	const area = size - inset * 2;
	const columns = 3;
	const rows = 2;
	const gapX = area * 0.06;
	const gapY = area * 0.08;

	const tileWidth = (area - gapX * (columns - 1)) / columns;
	const tileHeight = tileWidth * 1.38;
	const blockHeight = tileHeight * rows + gapY;
	const top = inset + (area - blockHeight) / 2;

	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const x = Math.round(inset + column * (tileWidth + gapX));
			const y = Math.round(top + row * (tileHeight + gapY));
			const w = Math.round(tileWidth);
			const h = Math.round(tileHeight);
			const radius = Math.max(1, Math.round(w * 0.14));

			rect(x, y, w, h, TILE, radius);
			// A shaded foot gives each tile its bevel at icon scale.
			rect(x, y + h - Math.round(h * 0.12), w, Math.round(h * 0.12), TILE_SHADE, radius);

			// An inked block standing in for the numeral.
			const ink = INKS[(row * columns + column) % INKS.length];
			const barW = Math.max(2, Math.round(w * 0.4));
			const barH = Math.max(2, Math.round(h * 0.42));
			rect(
				x + Math.round((w - barW) / 2),
				y + Math.round(h * 0.2),
				barW,
				barH,
				ink,
				Math.max(1, Math.round(barW * 0.22))
			);
		}
	}

	return encodePng(rgba, size);
}

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
	['icon-192.png', draw(192)],
	['icon-512.png', draw(512)],
	['icon-maskable-512.png', draw(512, { maskable: true })],
	['apple-touch-icon.png', draw(180)]
];

for (const [name, buffer] of outputs) {
	writeFileSync(join(OUT_DIR, name), buffer);
	console.log(`${name} — ${buffer.length} bytes`);
}
