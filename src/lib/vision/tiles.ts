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

export function totalPoints(tiles: ScannedTile[]): number {
	return tiles.reduce((sum, tile) => sum + tilePoints(tile.value), 0);
}

export function isUncertain(tile: ScannedTile): boolean {
	return tile.confidence < CONFIDENCE_FLOOR;
}
