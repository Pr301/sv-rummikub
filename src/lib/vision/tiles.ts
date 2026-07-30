/** The four inks printed on Rummikub tiles. */
export const TILE_COLORS = ['black', 'red', 'blue', 'orange'] as const;
export type TileColor = (typeof TILE_COLORS)[number];

export const TILE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type TileNumber = (typeof TILE_NUMBERS)[number];

export type TileValue = TileNumber | 'joker';

/** A joker is worth 30 penalty points; every other tile is worth its face value. */
export const JOKER_POINTS = 30;

export function tilePoints(value: TileValue): number {
	return value === 'joker' ? JOKER_POINTS : value;
}

export interface ScannedTile {
	id: string;
	value: TileValue;
	color: TileColor;
	/** 0–1. Below `CONFIDENCE_FLOOR` the tile must be confirmed before its points are used. */
	confidence: number;
	/** Where it was found in the captured frame, in frame pixels. Absent for hand-added tiles. */
	box?: { x: number; y: number; width: number; height: number };
}

export const CONFIDENCE_FLOOR = 0.62;

/**
 * Below this, a read is dropped rather than offered.
 *
 * Stray marks in a photo — crust on a loaf, a shadow, print on something else on the table — do
 * sometimes survive the shape filters, but they match a digit template far worse than real print
 * does. Discarding them costs the user a tap in the picker; keeping them silently adds points to
 * someone's score, which is the more expensive mistake by far.
 */
export const DETECTION_FLOOR = 0.55;

export function totalPoints(tiles: ScannedTile[]): number {
	return tiles.reduce((sum, tile) => sum + tilePoints(tile.value), 0);
}

export function isUncertain(tile: ScannedTile): boolean {
	return tile.confidence < CONFIDENCE_FLOOR;
}
