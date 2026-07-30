<script lang="ts">
	import { resolve } from '$app/paths';
	import { slide } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Standings from '$lib/components/Standings.svelte';
	import TurnTimer from '$lib/components/TurnTimer.svelte';
	import ScoreChart from '$lib/components/ScoreChart.svelte';
	import RoundSheet from '$lib/components/RoundSheet.svelte';
	import NewGameSheet from '$lib/components/NewGameSheet.svelte';
	import FinishGameSheet from '$lib/components/FinishGameSheet.svelte';
	import { hasReachedTarget, roundScores } from '$lib/scoring';
	import { keepScreenAwake } from '$lib/wake-lock';
	import { app } from '$lib/store.svelte';

	let newGameOpen = $state(false);
	let roundOpen = $state(false);
	let finishOpen = $state(false);
	let showRounds = $state(false);
	/** Set briefly after saving so the undo affordance is offered in context. */
	let justSaved = $state(false);
	let undoTimer: ReturnType<typeof setTimeout> | null = null;

	let game = $derived(app.activeGame);
	let activePlayerId = $derived(game ? (game.playerIds[game.activeSeat] ?? null) : null);
	let recent = $derived(app.history.slice(0, 3));

	$effect(() => {
		if (!game || !app.settings.keepAwake) return;
		return keepScreenAwake();
	});

	function afterSave() {
		justSaved = true;
		if (undoTimer) clearTimeout(undoTimer);
		undoTimer = setTimeout(() => (justSaved = false), 8000);
	}

	function undo() {
		if (!game) return;
		app.undoLastRound(game.id);
		justSaved = false;
	}

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Rummikub</title></svelte:head>

{#if !app.ready}
	<!-- Nothing to show until localStorage has been read; avoids flashing the empty state. -->
	<div class="flex-1" aria-hidden="true"></div>
{:else if !game}
	<PageHeader title="Rummikub" eyebrow="Scoreboard" />

	<div class="rack-well px-5 py-8 text-center">
		<p class="mb-1 font-tile text-lg font-bold">No game in progress</p>
		<p class="mx-auto mb-5 max-w-[26ch] text-sm text-ink-dim">
			Start one to keep score, run the turn clock, and scan racks at the end of a round.
		</p>
		<button type="button" class="btn btn-primary" onclick={() => (newGameOpen = true)}>
			New game
		</button>
	</div>

	{#if recent.length > 0}
		<section class="mt-8">
			<h2 class="eyebrow mb-3">Last played</h2>
			<ul class="flex flex-col gap-2">
				{#each recent as past (past.id)}
					<li>
						<a
							href={resolve('/history/[id]', { id: past.id })}
							class="rack-well flex items-center gap-3 px-4 py-3"
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">
									{past.playerIds.map((id) => app.playerName(id)).join(' · ')}
								</p>
								<p class="text-xs text-ink-faint">
									{past.rounds.length}
									{past.rounds.length === 1 ? 'round' : 'rounds'} · {formatDate(
										past.endedAt ?? past.createdAt
									)}
								</p>
							</div>
							<span class="text-ink-faint" aria-hidden="true">→</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{:else}
	<PageHeader
		title={game.rounds.length === 0 ? 'Round 1' : `Round ${game.rounds.length + 1}`}
		eyebrow="{game.playerIds.length} players{game.targetScore ? ` · to ${game.targetScore}` : ''}"
	>
		{#snippet action()}
			<button type="button" class="btn btn-ghost px-3 text-sm" onclick={() => (finishOpen = true)}>
				Finish
			</button>
		{/snippet}
	</PageHeader>

	{#if hasReachedTarget(game)}
		<p class="mb-4 rounded-xl border border-edge px-4 py-3 text-sm text-ink-dim">
			Someone has passed {game.targetScore}. Finish the game when you're ready.
		</p>
	{/if}

	<TurnTimer {game} />

	<Standings {game} {activePlayerId} />

	{#if game.rounds.length > 0}
		<ScoreChart {game} />

		<section class="mt-8">
			<button
				type="button"
				class="eyebrow flex items-center gap-2 hover:text-ink-dim"
				onclick={() => (showRounds = !showRounds)}
				aria-expanded={showRounds}
			>
				Rounds · {game.rounds.length}
				<span aria-hidden="true">{showRounds ? '−' : '+'}</span>
			</button>

			{#if showRounds}
				<ol class="mt-3 flex flex-col gap-1.5" transition:slide={{ duration: 180 }}>
					{#each game.rounds as round, index (round.id)}
						{@const scores = roundScores(round, game.playerIds)}
						<li class="rack-well px-3 py-2.5">
							<div class="mb-1.5 flex items-baseline gap-2">
								<span class="tnum font-tile text-xs font-bold text-ink-faint">
									{index + 1}
								</span>
								<span class="text-sm">
									<strong class="font-semibold">{app.playerName(round.winnerId)}</strong> went out
								</span>
							</div>
							<div class="flex flex-wrap gap-x-3 gap-y-1">
								{#each game.playerIds as id (id)}
									<span class="text-xs text-ink-faint">
										{app.playerName(id)}
										<span
											class="tnum font-semibold"
											style="color: {scores[id] > 0
												? 'var(--color-good)'
												: scores[id] < 0
													? 'var(--color-bad)'
													: 'inherit'}"
										>
											{scores[id] > 0 ? '+' : ''}{scores[id]}
										</span>
										{#if round.sources[id] === 'camera'}
											<span title="Scanned" aria-label="Scanned">◎</span>
										{/if}
									</span>
								{/each}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	<div class="mt-auto pt-8">
		{#if justSaved}
			<div
				class="mb-2 flex items-center justify-between gap-3 px-1"
				transition:slide={{ duration: 150 }}
			>
				<span class="text-xs text-ink-faint">Round saved.</span>
				<button type="button" class="btn btn-ghost px-2 py-1 text-xs" onclick={undo}>Undo</button>
			</div>
		{/if}
		<button type="button" class="btn btn-primary w-full" onclick={() => (roundOpen = true)}>
			Add round
		</button>
	</div>

	<RoundSheet bind:open={roundOpen} {game} onsaved={afterSave} />
	<FinishGameSheet bind:open={finishOpen} {game} onfinished={() => (justSaved = false)} />
{/if}

<NewGameSheet bind:open={newGameOpen} onstarted={() => {}} />
