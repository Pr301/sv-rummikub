import { browser } from '$app/environment';
import {
	DEFAULT_SETTINGS,
	PLAYER_COLORS,
	type AppData,
	type ColorCalibration,
	type Game,
	type Player,
	type PlayerColor,
	type Round,
	type Settings
} from './types';

const STORAGE_KEY = 'rummikub.v1';

export function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyData(): AppData {
	return {
		version: 1,
		players: [],
		games: [],
		activeGameId: null,
		settings: { ...DEFAULT_SETTINGS },
		calibration: null
	};
}

/**
 * Trusts nothing from localStorage — a hand-edited or half-written document should downgrade to
 * defaults rather than crash the app on boot.
 */
function parse(raw: string | null): AppData {
	if (!raw) return emptyData();
	try {
		const parsed = JSON.parse(raw) as Partial<AppData>;
		if (!parsed || typeof parsed !== 'object') return emptyData();
		return {
			version: 1,
			players: Array.isArray(parsed.players) ? parsed.players : [],
			games: Array.isArray(parsed.games) ? parsed.games : [],
			activeGameId: typeof parsed.activeGameId === 'string' ? parsed.activeGameId : null,
			settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
			calibration: parsed.calibration ?? null
		};
	} catch {
		return emptyData();
	}
}

class AppStore {
	#data = $state<AppData>(emptyData());
	#loaded = false;
	#saveHandle: ReturnType<typeof setTimeout> | null = null;

	/** Set once the browser document has been read, so the UI can hold off on empty states. */
	ready = $state(false);

	load() {
		if (!browser || this.#loaded) return;
		this.#loaded = true;
		this.#data = parse(localStorage.getItem(STORAGE_KEY));
		this.ready = true;
	}

	#save() {
		if (!browser) return;
		if (this.#saveHandle) clearTimeout(this.#saveHandle);
		// Batch the writes that a single interaction can trigger into one serialisation.
		this.#saveHandle = setTimeout(() => {
			this.#saveHandle = null;
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.#data)));
			} catch (error) {
				console.error('Could not save to localStorage', error);
			}
		}, 120);
	}

	get players(): Player[] {
		return this.#data.players;
	}

	get activePlayers(): Player[] {
		return this.#data.players.filter((p) => !p.archived);
	}

	get games(): Game[] {
		return this.#data.games;
	}

	get settings(): Settings {
		return this.#data.settings;
	}

	get calibration(): ColorCalibration | null {
		return this.#data.calibration;
	}

	get activeGame(): Game | null {
		if (!this.#data.activeGameId) return null;
		return this.#data.games.find((g) => g.id === this.#data.activeGameId) ?? null;
	}

	/** Finished games, most recently finished first. */
	get history(): Game[] {
		return this.#data.games
			.filter((g) => g.endedAt !== null)
			.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
	}

	game(id: string): Game | null {
		return this.#data.games.find((g) => g.id === id) ?? null;
	}

	player(id: string): Player | null {
		return this.#data.players.find((p) => p.id === id) ?? null;
	}

	playerName(id: string): string {
		return this.player(id)?.name ?? 'Removed player';
	}

	playerColor(id: string): PlayerColor {
		return this.player(id)?.color ?? 'p1';
	}

	// --- Roster ---------------------------------------------------------------

	/** Picks the least-used colour so a new player is visually distinct from the current roster. */
	#nextColor(): PlayerColor {
		const used: Record<string, number> = Object.fromEntries(PLAYER_COLORS.map((c) => [c, 0]));
		for (const player of this.#data.players) {
			if (player.archived) continue;
			used[player.color] = (used[player.color] ?? 0) + 1;
		}
		return PLAYER_COLORS.reduce((best, color) => (used[color] < used[best] ? color : best));
	}

	addPlayer(name: string): Player {
		const player: Player = {
			id: newId(),
			name: name.trim(),
			color: this.#nextColor(),
			createdAt: Date.now(),
			archived: false
		};
		this.#data.players.push(player);
		this.#save();
		return player;
	}

	renamePlayer(id: string, name: string) {
		const player = this.player(id);
		if (!player) return;
		player.name = name.trim();
		this.#save();
	}

	setPlayerColor(id: string, color: PlayerColor) {
		const player = this.player(id);
		if (!player) return;
		player.color = color;
		this.#save();
	}

	/** True when a player appears in any game, and so must be archived rather than deleted. */
	playerHasHistory(id: string): boolean {
		return this.#data.games.some((g) => g.playerIds.includes(id));
	}

	removePlayer(id: string) {
		if (this.playerHasHistory(id)) {
			const player = this.player(id);
			if (player) player.archived = true;
		} else {
			this.#data.players = this.#data.players.filter((p) => p.id !== id);
		}
		this.#save();
	}

	restorePlayer(id: string) {
		const player = this.player(id);
		if (!player) return;
		player.archived = false;
		this.#save();
	}

	// --- Games ----------------------------------------------------------------

	startGame(playerIds: string[], targetScore: number | null = null): Game {
		const game: Game = {
			id: newId(),
			createdAt: Date.now(),
			endedAt: null,
			playerIds: [...playerIds],
			rounds: [],
			targetScore,
			activeSeat: 0
		};
		this.#data.games.push(game);
		this.#data.activeGameId = game.id;
		this.#save();
		return game;
	}

	addRound(gameId: string, round: Omit<Round, 'id' | 'at'>): Round | null {
		const game = this.game(gameId);
		if (!game) return null;
		const full: Round = { ...round, id: newId(), at: Date.now() };
		game.rounds.push(full);
		// The player who went out starts the next hand.
		const winnerSeat = game.playerIds.indexOf(full.winnerId);
		if (winnerSeat >= 0) game.activeSeat = winnerSeat;
		this.#save();
		return full;
	}

	undoLastRound(gameId: string) {
		const game = this.game(gameId);
		if (!game || game.rounds.length === 0) return;
		game.rounds.pop();
		this.#save();
	}

	setActiveSeat(gameId: string, seat: number) {
		const game = this.game(gameId);
		if (!game || game.playerIds.length === 0) return;
		game.activeSeat =
			((seat % game.playerIds.length) + game.playerIds.length) % game.playerIds.length;
		this.#save();
	}

	advanceSeat(gameId: string) {
		const game = this.game(gameId);
		if (!game) return;
		this.setActiveSeat(gameId, game.activeSeat + 1);
	}

	finishGame(gameId: string) {
		const game = this.game(gameId);
		if (!game) return;
		game.endedAt = Date.now();
		if (this.#data.activeGameId === gameId) this.#data.activeGameId = null;
		this.#save();
	}

	/** Throws the game away entirely — only offered for games with no rounds recorded. */
	discardGame(gameId: string) {
		this.#data.games = this.#data.games.filter((g) => g.id !== gameId);
		if (this.#data.activeGameId === gameId) this.#data.activeGameId = null;
		this.#save();
	}

	// --- Settings & calibration ------------------------------------------------

	updateSettings(patch: Partial<Settings>) {
		Object.assign(this.#data.settings, patch);
		this.#save();
	}

	setCalibration(calibration: ColorCalibration | null) {
		this.#data.calibration = calibration;
		this.#save();
	}

	// --- Data management --------------------------------------------------------

	exportJSON(): string {
		return JSON.stringify($state.snapshot(this.#data), null, 2);
	}

	importJSON(raw: string): boolean {
		try {
			const next = parse(raw);
			if (next.players.length === 0 && next.games.length === 0) return false;
			this.#data = next;
			this.#save();
			return true;
		} catch {
			return false;
		}
	}

	resetAll() {
		this.#data = emptyData();
		this.#save();
	}
}

export const app = new AppStore();
