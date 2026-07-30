import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { Frame } from '../image';

/**
 * Just enough PNG to load a test fixture: 8-bit truecolour, no interlacing, which is what the
 * checked-in photo is. Test-only, so it leans on Node's zlib rather than shipping an inflater.
 */
export function loadPng(path: string): Frame {
	const file = readFileSync(path);
	if (file.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);

	let width = 0;
	let height = 0;
	let channels = 0;
	const parts: Buffer[] = [];

	for (let offset = 8; offset + 8 <= file.length;) {
		const length = file.readUInt32BE(offset);
		const type = file.toString('ascii', offset + 4, offset + 8);
		const body = file.subarray(offset + 8, offset + 8 + length);

		if (type === 'IHDR') {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const depth = body[8];
			const colorType = body[9];
			const interlace = body[12];
			if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
			if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
			if (colorType === 2) channels = 3;
			else if (colorType === 6) channels = 4;
			else throw new Error(`unsupported colour type ${colorType}`);
		} else if (type === 'IDAT') {
			parts.push(body);
		} else if (type === 'IEND') {
			break;
		}

		offset += 12 + length;
	}

	const raw = inflateSync(Buffer.concat(parts));
	const stride = width * channels;
	const pixels = Buffer.alloc(height * stride);

	// Undo the per-scanline filters. Each row's filter type refers to the already-reconstructed row
	// above it, so this has to run top to bottom.
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const row = pixels.subarray(y * stride, (y + 1) * stride);
		const previous = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);

		for (let i = 0; i < stride; i++) {
			const left = i >= channels ? row[i - channels] : 0;
			const up = previous ? previous[i] : 0;
			const upLeft = previous && i >= channels ? previous[i - channels] : 0;
			const value = source[i];

			switch (filter) {
				case 0:
					row[i] = value;
					break;
				case 1:
					row[i] = value + left;
					break;
				case 2:
					row[i] = value + up;
					break;
				case 3:
					row[i] = value + ((left + up) >> 1);
					break;
				case 4: {
					const estimate = left + up - upLeft;
					const dLeft = Math.abs(estimate - left);
					const dUp = Math.abs(estimate - up);
					const dUpLeft = Math.abs(estimate - upLeft);
					const predictor = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
					row[i] = value + predictor;
					break;
				}
				default:
					throw new Error(`unknown PNG filter ${filter}`);
			}
		}
	}

	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = pixels[i * channels];
		data[i * 4 + 1] = pixels[i * channels + 1];
		data[i * 4 + 2] = pixels[i * channels + 2];
		data[i * 4 + 3] = channels === 4 ? pixels[i * channels + 3] : 255;
	}

	return { data, width, height };
}
