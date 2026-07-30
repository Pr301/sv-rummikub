/** The six player identity colours defined in `layout.css`. */
export const PLAYER_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export interface Player {
	id: string;
	name: string;
	color: PlayerColor;
	createdAt: number;
	/** Archived players stay in the file so past games keep their names, but leave the picker. */
	archived: boolean;
}

/**
 * One completed round. `remaining` is each player's leftover tile points as counted at the end of
 * the round; the winner's entry is always 0. Scores are derived from this by `lib/scoring.ts`
 * rather than stored, so the round total can never drift out of balance.
 */
export interface Round {
	id: string;
	at: number;
	winnerId: string;
	remaining: Record<string, number>;
	/** How each player's number got entered, for the "scanned" marker in the round table. */
	sources: Record<string, 'manual' | 'camera'>;
}

export interface Game {
	id: string;
	createdAt: number;
	/** Null while the game is still being played. */
	endedAt: number | null;
	playerIds: string[];
	rounds: Round[];
	/** Optional finish line — when any player reaches it the game offers to end. */
	targetScore: number | null;
	/** Index into `playerIds` of whoever is on the clock. */
	activeSeat: number;
}

export interface Settings {
	turnSeconds: number;
	warnAtSeconds: number[];
	sound: boolean;
	vibrate: boolean;
	keepAwake: boolean;
	theme: 'system' | 'dark' | 'light';
}

/** Reference hues (0–360) for the four inks, optionally re-measured by the user's own tiles. */
export interface ColorCalibration {
	measuredAt: number;
	hues: { red: number; blue: number; orange: number };
	/** Max value (0–1) a pixel can have and still count as black ink. */
	blackMaxValue: number;
}

export interface AppData {
	version: 1;
	players: Player[];
	games: Game[];
	activeGameId: string | null;
	settings: Settings;
	calibration: ColorCalibration | null;
}

export const DEFAULT_SETTINGS: Settings = {
	turnSeconds: 80,
	warnAtSeconds: [30, 10],
	sound: true,
	vibrate: true,
	keepAwake: true,
	theme: 'system'
};
