import { describe, expect, it } from 'vitest';
import {
	cumulativeSeries,
	gameWinnerId,
	roundIsBalanced,
	roundScores,
	standings,
	totals,
	validateRound
} from './scoring';
import type { Game, Round } from './types';

const PLAYERS = ['a', 'b', 'c'];

function round(winnerId: string, remaining: Record<string, number>): Round {
	return { id: 'r', at: 0, winnerId, remaining, sources: {} };
}

function game(rounds: Round[], playerIds = PLAYERS): Game {
	return {
		id: 'g',
		createdAt: 0,
		endedAt: null,
		playerIds,
		rounds,
		targetScore: null,
		activeSeat: 0
	};
}

describe('roundScores', () => {
	it('gives the winner the sum of everyone else and the losers their own total as a negative', () => {
		const scores = roundScores(round('a', { b: 20, c: 35 }), PLAYERS);
		expect(scores).toEqual({ a: 55, b: -20, c: -35 });
	});

	it('always sums to zero', () => {
		expect(roundIsBalanced(round('b', { a: 7, c: 61 }), PLAYERS)).toBe(true);
		expect(roundIsBalanced(round('c', { a: 0, b: 0 }), PLAYERS)).toBe(true);
	});

	it('treats a missing total as zero rather than NaN', () => {
		expect(roundScores(round('a', { b: 12 }), PLAYERS)).toEqual({ a: 12, b: -12, c: 0 });
	});

	it('ignores any stray value stored against the winner', () => {
		const scores = roundScores(round('a', { a: 99, b: 10, c: 10 }), PLAYERS);
		expect(scores.a).toBe(20);
	});
});

describe('validateRound', () => {
	it('accepts a well-formed round', () => {
		expect(validateRound({ winnerId: 'a', remaining: { b: 10, c: 0 } }, PLAYERS).ok).toBe(true);
	});

	it('rejects a missing winner', () => {
		const result = validateRound({ winnerId: '', remaining: { b: 10, c: 0 } }, PLAYERS);
		expect(result.ok).toBe(false);
		expect(result.errors).toContain('Pick who went out.');
	});

	it('rejects a winner who is not in the game', () => {
		expect(validateRound({ winnerId: 'zz', remaining: { b: 1 } }, PLAYERS).ok).toBe(false);
	});

	it('rejects negative, fractional, and missing totals', () => {
		expect(validateRound({ winnerId: 'a', remaining: { b: -5, c: 0 } }, PLAYERS).ok).toBe(false);
		expect(validateRound({ winnerId: 'a', remaining: { b: 2.5, c: 0 } }, PLAYERS).ok).toBe(false);
		expect(validateRound({ winnerId: 'a', remaining: { b: 5 } }, PLAYERS).ok).toBe(false);
	});

	it('rejects fewer than two players', () => {
		expect(validateRound({ winnerId: 'a', remaining: {} }, ['a']).ok).toBe(false);
	});

	it('hints without blocking when a total exceeds a full rack of 13s', () => {
		const result = validateRound({ winnerId: 'a', remaining: { b: 400, c: 0 } }, PLAYERS);
		expect(result.ok).toBe(true);
		expect(result.hints).toHaveLength(1);
	});

	it('blocks a total larger than every tile in the box', () => {
		expect(validateRound({ winnerId: 'a', remaining: { b: 900, c: 0 } }, PLAYERS).ok).toBe(false);
	});
});

describe('cumulativeSeries', () => {
	it('seeds every player at zero so lines start on the baseline', () => {
		const series = cumulativeSeries(game([]));
		expect(series).toEqual({ a: [0], b: [0], c: [0] });
	});

	it('accumulates round by round', () => {
		const series = cumulativeSeries(
			game([round('a', { b: 20, c: 30 }), round('b', { a: 10, c: 5 })])
		);
		expect(series.a).toEqual([0, 50, 40]);
		expect(series.b).toEqual([0, -20, -5]);
		expect(series.c).toEqual([0, -30, -35]);
	});

	it('keeps the table balanced at every point in the game', () => {
		const series = cumulativeSeries(
			game([round('a', { b: 20, c: 30 }), round('c', { a: 4, b: 9 })])
		);
		for (let i = 0; i < series.a.length; i++) {
			expect(series.a[i] + series.b[i] + series.c[i]).toBe(0);
		}
	});
});

describe('standings', () => {
	it('ranks by total, highest first', () => {
		const table = standings(game([round('a', { b: 20, c: 30 })]));
		expect(table.map((s) => s.playerId)).toEqual(['a', 'b', 'c']);
		expect(table[0]).toMatchObject({ total: 50, rank: 1, roundsWon: 1 });
	});

	it('shares a rank on a tie', () => {
		const table = standings(game([round('a', { b: 25, c: 25 })]));
		expect(table[1].rank).toBe(2);
		expect(table[2].rank).toBe(2);
	});

	it('counts rounds won per player', () => {
		const table = standings(
			game([round('a', { b: 5, c: 5 }), round('a', { b: 5, c: 5 }), round('b', { a: 1, c: 1 })])
		);
		expect(table.find((s) => s.playerId === 'a')?.roundsWon).toBe(2);
		expect(table.find((s) => s.playerId === 'b')?.roundsWon).toBe(1);
	});
});

describe('gameWinnerId', () => {
	it('is null before any round is played', () => {
		expect(gameWinnerId(game([]))).toBeNull();
	});

	it('is the highest total', () => {
		expect(gameWinnerId(game([round('a', { b: 20, c: 30 })]))).toBe('a');
	});

	it('is null when the top two are level', () => {
		const drawn = game([round('a', { b: 10, c: 0 }), round('b', { a: 10, c: 0 })]);
		expect(totals(drawn)).toEqual({ a: 0, b: 0, c: 0 });
		expect(gameWinnerId(drawn)).toBeNull();
	});
});
