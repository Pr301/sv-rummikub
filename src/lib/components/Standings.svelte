<script lang="ts">
	import { flip } from 'svelte/animate';
	import ScoreTile from './ScoreTile.svelte';
	import { standings } from '$lib/scoring';
	import { app } from '$lib/store.svelte';
	import type { Game } from '$lib/types';

	interface Props {
		game: Game;
		/** Highlights whoever is on the clock. Omit for finished games. */
		activePlayerId?: string | null;
		size?: 'sm' | 'md';
	}

	let { game, activePlayerId = null, size = 'md' }: Props = $props();

	let table = $derived(standings(game));
	let leaderTotal = $derived(table[0]?.total ?? 0);
</script>

<ul class="flex flex-col gap-1.5">
	{#each table as row (row.playerId)}
		{@const player = app.player(row.playerId)}
		{@const isActive = row.playerId === activePlayerId}
		<li
			animate:flip={{ duration: 320 }}
			class="rack-well flex items-stretch overflow-hidden transition-shadow"
			class:ring-1={isActive}
			class:ring-ink={isActive}
		>
			<span class="w-1.5 shrink-0" style="background: var(--color-{player?.color ?? 'p1'})"></span>

			<div class="flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 pl-3">
				<!-- Rank is meaningless until a round has been scored, so the column stays empty. -->
				<span
					class="tnum w-4 shrink-0 text-center font-tile text-sm font-bold text-ink-faint"
					aria-hidden="true">{game.rounds.length > 0 ? row.rank : ''}</span
				>

				<div class="min-w-0 flex-1">
					<span class="block truncate font-medium {size === 'sm' ? 'text-sm' : ''}">
						{app.playerName(row.playerId)}
					</span>
					<span class="text-xs text-ink-faint">
						{#if isActive}
							<span class="text-ink-dim">On the clock</span>
						{:else if row.roundsWon > 0}
							{row.roundsWon} won
						{:else if game.rounds.length > 0}
							{row.total === leaderTotal && table.length > 1
								? 'Level'
								: `${leaderTotal - row.total} behind`}
						{:else}
							&nbsp;
						{/if}
					</span>
				</div>

				<ScoreTile value={row.total} size={size === 'sm' ? 'sm' : 'md'} />
			</div>
		</li>
	{/each}
</ul>
