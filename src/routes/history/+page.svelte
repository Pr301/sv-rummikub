<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ScoreTile from '$lib/components/ScoreTile.svelte';
	import { gameWinnerId, totals } from '$lib/scoring';
	import { app } from '$lib/store.svelte';

	let games = $derived(app.history);

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	/** Wins per player across every finished game — the long-running bragging rights. */
	let leaderboard = $derived.by(() => {
		const wins: Record<string, number> = {};
		for (const game of games) {
			const winner = gameWinnerId(game);
			if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
		}
		return Object.entries(wins).sort((a, b) => b[1] - a[1]);
	});
</script>

<svelte:head><title>History · Rummikub</title></svelte:head>

<PageHeader title="History" eyebrow="{games.length} {games.length === 1 ? 'game' : 'games'}" />

{#if games.length === 0}
	<p class="rack-well px-4 py-6 text-center text-sm text-ink-dim">
		Finished games land here, with the full round-by-round record.
	</p>
{:else}
	{#if leaderboard.length > 1}
		<section class="mb-8">
			<h2 class="eyebrow mb-3">Games won</h2>
			<ul class="flex flex-wrap gap-2">
				{#each leaderboard as [playerId, wins] (playerId)}
					<li class="flex items-center gap-2 rounded-lg border border-edge px-3 py-1.5 text-sm">
						<span
							class="size-2.5 shrink-0 rounded-full"
							style="background: var(--color-{app.playerColor(playerId)})"
						></span>
						{app.playerName(playerId)}
						<span class="tnum font-tile font-bold">{wins}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<ul class="flex flex-col gap-2">
		{#each games as game (game.id)}
			{@const winner = gameWinnerId(game)}
			{@const table = totals(game)}
			<li>
				<a
					href={resolve('/history/[id]', { id: game.id })}
					class="rack-well flex items-center gap-3 px-4 py-3"
				>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">
							{#if winner}
								{app.playerName(winner)} won
							{:else}
								Drawn game
							{/if}
						</p>
						<p class="truncate text-xs text-ink-faint">
							{formatDate(game.endedAt ?? game.createdAt)} · {game.rounds.length}
							{game.rounds.length === 1 ? 'round' : 'rounds'} · {game.playerIds
								.map((id) => app.playerName(id))
								.join(', ')}
						</p>
					</div>
					{#if winner}
						<ScoreTile value={table[winner]} size="sm" />
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}
