import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectTiles } from './detect';
import { rotateFrame } from './image';
import { digitTemplates } from './templates';
import { totalPoints, type ScannedTile } from './tiles';
import { loadPng } from './__fixtures__/png';

/**
 * An end-to-end read of a real photograph, rather than a synthetic bitmap.
 *
 * The picture is an ordinary phone snap of a rack on a kitchen table: tiles touching each other,
 * cream faces against a pale worktop barely darker than they are, a dark rack behind them, and a
 * plate, two loaves and a rubber band in shot. Every one of those defeated the original
 * face-first segmentation, so this fixture is the check that the ink-first pipeline actually holds
 * up outside a test bench.
 */
const photo = loadPng(fileURLToPath(new URL('./__fixtures__/rack-photo.png', import.meta.url)));

const EXPECTED = [
	{ color: 'blue', value: 2 },
	{ color: 'blue', value: 4 },
	{ color: 'blue', value: 5 },
	{ color: 'blue', value: 9 },
	{ color: 'blue', value: 11 },
	{ color: 'orange', value: 6 },
	{ color: 'red', value: 1 },
	{ color: 'red', value: 6 },
	{ color: 'red', value: 13 }
] as const;

function describeTiles(tiles: ScannedTile[]): string[] {
	return tiles.map((tile) => `${tile.color} ${tile.value}`).sort();
}

describe('reading a photographed rack', () => {
	const result = detectTiles(photo, digitTemplates(), null);

	it('finds every tile and no extras', () => {
		expect(describeTiles(result.tiles)).toEqual(
			[...EXPECTED].map((tile) => `${tile.color} ${tile.value}`).sort()
		);
	});

	it('adds up to the rack the photo shows', () => {
		expect(totalPoints(result.tiles)).toBe(57);
	});

	it('is confident enough not to make the user check every tile', () => {
		const mean = result.tiles.reduce((sum, tile) => sum + tile.confidence, 0) / result.tiles.length;
		expect(mean).toBeGreaterThan(0.62);
	});

	it('reads the same rack from a photo taken sideways', () => {
		// Quarter-turned on purpose: templates only match upright numerals, so without the
		// orientation search a landscape snap of a rack reads as nothing at all.
		const sideways = detectTiles(rotateFrame(photo, 1), digitTemplates(), null);
		expect(describeTiles(sideways.tiles)).toEqual(describeTiles(result.tiles));
		expect(sideways.turns).toBe(3);
	});

	it('points each box at the tile it read', () => {
		// The blue 2 is the leftmost tile of the upper row, the red 1 the leftmost of the lower one.
		const blueTwo = result.tiles.find((tile) => tile.color === 'blue' && tile.value === 2);
		const redOne = result.tiles.find((tile) => tile.color === 'red' && tile.value === 1);
		expect(blueTwo?.box && redOne?.box).toBeTruthy();
		expect(blueTwo!.box!.y).toBeLessThan(redOne!.box!.y);
		expect(blueTwo!.box!.x).toBeGreaterThan(0);
		expect(blueTwo!.box!.x + blueTwo!.box!.width).toBeLessThan(photo.width);
	});
});
