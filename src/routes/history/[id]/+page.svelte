<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Standings from '$lib/components/Standings.svelte';
	import ScoreChart from '$lib/components/ScoreChart.svelte';
	import { cumulativeSeries, gameWinnerId, roundScores } from '$lib/scoring';
	import { app } from '$lib/store.svelte';

	let game = $derived(app.game(page.params.id ?? ''));
	let winner = $derived(game ? gameWinnerId(game) : null);
	let series = $derived(game ? cumulativeSeries(game) : {});
	let pageTitle = $derived(
		!game ? 'Not found' : winner ? `${app.playerName(winner)} won` : 'Drawn game'
	);

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>{pageTitle} · Rummikub</title></svelte:head>

{#if !app.ready}
	<div class="flex-1" aria-hidden="true"></div>
{:else if !game}
	<PageHeader title="Not found" eyebrow="History" />
	<p class="rack-well px-4 py-6 text-center text-sm text-ink-dim">
		That game isn't on this device. <a
			href={resolve('/history')}
			class="underline underline-offset-2"
		>
			Back to history
		</a>.
	</p>
{:else}
	<PageHeader
		title={winner ? `${app.playerName(winner)} won` : 'Drawn game'}
		eyebrow={formatDate(game.endedAt ?? game.createdAt)}
	>
		{#snippet action()}
			<a href={resolve('/history')} class="btn btn-ghost px-3 text-sm">Back</a>
		{/snippet}
	</PageHeader>

	<Standings {game} />

	{#if game.rounds.length > 0}
		<ScoreChart {game} />

		<section class="mt-8">
			<h2 class="eyebrow mb-3">Round by round</h2>

			<!-- The table view the chart's readings can always be checked against. -->
			<div class="-mx-4 overflow-x-auto px-4">
				<table class="w-full min-w-max border-collapse text-sm">
					<thead>
						<tr class="border-b border-edge">
							<th scope="col" class="py-2 pr-3 text-left text-xs font-semibold text-ink-faint">
								#
							</th>
							{#each game.playerIds as id (id)}
								<th
									scope="col"
									class="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap"
								>
									<span class="inline-flex items-center gap-1.5">
										<span
											class="size-2 shrink-0 rounded-full"
											style="background: var(--color-{app.playerColor(id)})"
										></span>
										{app.playerName(id)}
									</span>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each game.rounds as round, index (round.id)}
							{@const scores = roundScores(round, game.playerIds)}
							<tr class="border-b border-edge-soft">
								<th scope="row" class="py-2 pr-3 text-left text-xs font-normal text-ink-faint">
									{index + 1}
								</th>
								{#each game.playerIds as id (id)}
									<td class="tnum px-3 py-2 text-right">
										<span
											class="font-medium"
											style="color: {scores[id] > 0
												? 'var(--color-good)'
												: scores[id] < 0
													? 'var(--color-bad)'
													: 'var(--color-ink-faint)'}"
										>
											{scores[id] > 0 ? '+' : ''}{scores[id]}
										</span>
										{#if round.sources[id] === 'camera'}
											<span class="text-ink-faint" title="Scanned" aria-label="Scanned">◎</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<th scope="row" class="py-2 pr-3 text-left text-xs font-semibold text-ink-faint">
								Total
							</th>
							{#each game.playerIds as id (id)}
								{@const final = series[id]?.[series[id].length - 1] ?? 0}
								<td class="tnum px-3 py-2 text-right font-tile font-bold">
									{final > 0 ? '+' : ''}{final}
								</td>
							{/each}
						</tr>
					</tfoot>
				</table>
			</div>
		</section>
	{:else}
		<p class="rack-well mt-6 px-4 py-6 text-center text-sm text-ink-dim">
			This game ended before any rounds were scored.
		</p>
	{/if}
{/if}
