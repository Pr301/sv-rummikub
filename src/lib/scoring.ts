import type { Game, Round } from './types';

/**
 * Every tile in the box: (1..13) × 4 colours × 2 copies = 728, plus two 30-point jokers.
 * A rack cannot possibly be worth more than this, so anything above it is a typo.
 */
export const MAX_POSSIBLE_POINTS = 788;

/** A full 14-tile rack of the most expensive tiles: 2 jokers + 12 × 13. Above this we hint. */
export const TYPICAL_MAX_RACK_POINTS = 216;

/**
 * Official Rummikub scoring: everyone still holding tiles scores their leftover points as a
 * negative, and the winner scores the positive sum of everything the others were left with.
 * The returned values always sum to zero — `roundIsBalanced` asserts it.
 */
export function roundScores(round: Round, playerIds: string[]): Record<string, number> {
	const scores: Record<string, number> = {};
	let pot = 0;

	for (const id of playerIds) {
		if (id === round.winnerId) continue;
		const remaining = round.remaining[id] ?? 0;
		// Guard against negative zero, which would surface as a stray "-0" in exports.
		scores[id] = remaining === 0 ? 0 : -remaining;
		pot += remaining;
	}

	scores[round.winnerId] = pot;
	return scores;
}

export function roundIsBalanced(round: Round, playerIds: string[]): boolean {
	const scores = roundScores(round, playerIds);
	return playerIds.reduce((sum, id) => sum + (scores[id] ?? 0), 0) === 0;
}

export interface ValidationResult {
	ok: boolean;
	errors: string[];
	/** Non-blocking notes, e.g. a total that is legal but suspiciously high. */
	hints: string[];
}

export function validateRound(
	round: Pick<Round, 'winnerId' | 'remaining'>,
	playerIds: string[]
): ValidationResult {
	const errors: string[] = [];
	const hints: string[] = [];

	if (playerIds.length < 2) {
		errors.push('A round needs at least two players.');
	}

	if (!round.winnerId) {
		errors.push('Pick who went out.');
	} else if (!playerIds.includes(round.winnerId)) {
		errors.push('The winner is not in this game.');
	}

	for (const id of playerIds) {
		if (id === round.winnerId) continue;

		const value = round.remaining[id];
		if (value === undefined || Number.isNaN(value)) {
			errors.push('Every other player needs a tile total.');
			continue;
		}
		if (!Number.isInteger(value)) {
			errors.push('Tile totals must be whole numbers.');
		} else if (value < 0) {
			errors.push('Tile totals cannot be negative.');
		} else if (value > MAX_POSSIBLE_POINTS) {
			errors.push('That is more points than the whole box holds.');
		} else if (value > TYPICAL_MAX_RACK_POINTS) {
			hints.push('One total is higher than a full rack of 13s — worth a second look.');
		}
	}

	return {
		ok: errors.length === 0,
		errors: [...new Set(errors)],
		hints: [...new Set(hints)]
	};
}

/**
 * Running total per player after each round, seeded with a 0 at index 0 so the chart can start
 * every line on the baseline. Both the chart and the standings read this, so they cannot disagree.
 */
export function cumulativeSeries(game: Game): Record<string, number[]> {
	const series: Record<string, number[]> = {};
	for (const id of game.playerIds) series[id] = [0];

	let running: Record<string, number> = Object.fromEntries(game.playerIds.map((id) => [id, 0]));

	for (const round of game.rounds) {
		const scores = roundScores(round, game.playerIds);
		running = Object.fromEntries(game.playerIds.map((id) => [id, running[id] + (scores[id] ?? 0)]));
		for (const id of game.playerIds) series[id].push(running[id]);
	}

	return series;
}

export function totals(game: Game): Record<string, number> {
	const series = cumulativeSeries(game);
	return Object.fromEntries(game.playerIds.map((id) => [id, series[id][series[id].length - 1]]));
}

export interface Standing {
	playerId: string;
	total: number;
	/** 1-based, sharing a rank on a tie. */
	rank: number;
	roundsWon: number;
}

export function standings(game: Game): Standing[] {
	const total = totals(game);
	const wins = Object.fromEntries(game.playerIds.map((id) => [id, 0]));
	for (const round of game.rounds) {
		if (wins[round.winnerId] !== undefined) wins[round.winnerId] += 1;
	}

	const sorted = [...game.playerIds].sort((a, b) => total[b] - total[a]);

	let lastTotal: number | null = null;
	let lastRank = 0;
	return sorted.map((playerId, index) => {
		const value = total[playerId];
		const rank = value === lastTotal ? lastRank : index + 1;
		lastTotal = value;
		lastRank = rank;
		return { playerId, total: value, rank, roundsWon: wins[playerId] };
	});
}

/** Whoever is ahead once the game ends. Null for an empty game or a tie at the top. */
export function gameWinnerId(game: Game): string | null {
	if (game.rounds.length === 0) return null;
	const table = standings(game);
	if (table.length < 2) return table[0]?.playerId ?? null;
	return table[0].total === table[1].total ? null : table[0].playerId;
}

export function hasReachedTarget(game: Game): boolean {
	if (game.targetScore === null) return false;
	return Object.values(totals(game)).some((value) => value >= game.targetScore!);
}
