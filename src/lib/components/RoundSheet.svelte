<script lang="ts">
	import Sheet from './Sheet.svelte';
	import ScoreTile from './ScoreTile.svelte';
	import TileScanner from './TileScanner.svelte';
	import { roundScores, validateRound } from '$lib/scoring';
	import { app } from '$lib/store.svelte';
	import type { Game } from '$lib/types';

	interface Props {
		open: boolean;
		game: Game;
		onsaved: () => void;
	}

	let { open = $bindable(), game, onsaved }: Props = $props();

	let winnerId = $state('');
	/** Raw strings so an untouched field stays distinguishable from a deliberate 0. */
	let remainingText = $state<Record<string, string>>({});
	let sources = $state<Record<string, 'manual' | 'camera'>>({});
	/** The player whose rack is currently being scanned, if any. */
	let scanningId = $state<string | null>(null);
	let scannerOpen = $state(false);

	function reset() {
		winnerId = '';
		remainingText = {};
		sources = {};
		scanningId = null;
		scannerOpen = false;
	}

	function openScanner(playerId: string) {
		scanningId = playerId;
		scannerOpen = true;
	}

	function applyScan(total: number) {
		if (!scanningId) return;
		remainingText[scanningId] = String(total);
		sources[scanningId] = 'camera';
	}

	let losers = $derived(game.playerIds.filter((id) => id !== winnerId));

	let remaining = $derived(
		Object.fromEntries(
			losers.map((id) => {
				const raw = remainingText[id]?.trim();
				return [id, raw === undefined || raw === '' ? Number.NaN : Number(raw)];
			})
		)
	);

	let validation = $derived(validateRound({ winnerId, remaining }, game.playerIds));

	let preview = $derived(
		validation.ok
			? roundScores({ id: '', at: 0, winnerId, remaining, sources: {} }, game.playerIds)
			: null
	);

	let pot = $derived(losers.reduce((sum, id) => sum + (remaining[id] || 0), 0));

	function save() {
		if (!validation.ok) return;
		app.addRound(game.id, {
			winnerId,
			remaining: Object.fromEntries(losers.map((id) => [id, remaining[id]])),
			sources: Object.fromEntries(losers.map((id) => [id, sources[id] ?? 'manual']))
		});
		reset();
		open = false;
		onsaved();
	}
</script>

<Sheet bind:open title="Round {game.rounds.length + 1}" onclose={reset}>
	<fieldset>
		<legend class="eyebrow mb-2.5">Who went out?</legend>
		<div class="flex flex-wrap gap-2">
			{#each game.playerIds as id (id)}
				{@const player = app.player(id)}
				{@const picked = winnerId === id}
				<button
					type="button"
					class="btn {picked ? 'btn-primary' : 'btn-secondary'} gap-2 px-3"
					aria-pressed={picked}
					onclick={() => (winnerId = picked ? '' : id)}
				>
					<span
						class="size-2.5 shrink-0 rounded-full"
						style="background: var(--color-{player?.color ?? 'p1'})"
					></span>
					{app.playerName(id)}
				</button>
			{/each}
		</div>
	</fieldset>

	{#if winnerId}
		<fieldset class="mt-6">
			<legend class="eyebrow mb-1">Tiles left on each rack</legend>
			<p class="mb-3 text-xs text-ink-faint">
				Add up the face value of the tiles each player is still holding. Jokers count 30.
			</p>

			<ul class="flex flex-col gap-2">
				{#each losers as id (id)}
					{@const player = app.player(id)}
					<li class="rack-well flex items-stretch overflow-hidden">
						<span class="w-1.5 shrink-0" style="background: var(--color-{player?.color ?? 'p1'})"
						></span>
						<div class="flex flex-1 items-center gap-3 py-2 pr-2 pl-3">
							<label class="min-w-0 flex-1 truncate font-medium" for="rem-{id}">
								{app.playerName(id)}
							</label>

							<button
								type="button"
								class="btn btn-ghost shrink-0 px-2"
								onclick={() => openScanner(id)}
								aria-label="Scan {app.playerName(id)}'s tiles with the camera"
								title="Scan with the camera"
							>
								<svg viewBox="0 0 24 24" class="size-5" fill="none" aria-hidden="true">
									<path
										d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a1 1 0 0 0 .84-.46l.62-.96A1 1 0 0 1 10 4.1h4a1 1 0 0 1 .84.48l.62.96a1 1 0 0 0 .84.46h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
										stroke="currentColor"
										stroke-width="1.5"
									/>
									<circle cx="12" cy="12.3" r="3.2" stroke="currentColor" stroke-width="1.5" />
								</svg>
							</button>

							<input
								id="rem-{id}"
								class="field tnum w-16 text-right"
								inputmode="numeric"
								pattern="[0-9]*"
								placeholder="0"
								bind:value={remainingText[id]}
								oninput={() => (sources[id] = 'manual')}
								onfocus={(e) => e.currentTarget.select()}
							/>

							<span class="w-11 shrink-0 text-right">
								{#if preview}
									<span
										class="tnum font-tile text-sm font-bold"
										style="color: {preview[id] < 0 ? 'var(--color-bad)' : 'var(--color-ink-faint)'}"
									>
										{preview[id]}
									</span>
								{/if}
							</span>
						</div>
					</li>
				{/each}
			</ul>
		</fieldset>

		<div
			class="mt-5 flex items-center justify-between gap-4 rounded-xl border border-edge-soft px-4 py-3"
		>
			<div>
				<p class="eyebrow">{app.playerName(winnerId)} collects</p>
				<p class="mt-0.5 text-xs text-ink-faint">Sum of every other rack</p>
			</div>
			<ScoreTile value={validation.ok ? pot : 0} size="lg" />
		</div>

		{#if validation.hints.length > 0}
			<ul class="mt-3 flex flex-col gap-1">
				{#each validation.hints as hint (hint)}
					<li class="text-xs text-warn">{hint}</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#snippet footer()}
		<button type="button" class="btn btn-primary w-full" disabled={!validation.ok} onclick={save}>
			{#if !winnerId}
				Pick who went out
			{:else if !validation.ok}
				Fill in every rack
			{:else}
				Save round
			{/if}
		</button>
	{/snippet}
</Sheet>

<TileScanner
	bind:open={scannerOpen}
	playerName={scanningId ? app.playerName(scanningId) : ''}
	onuse={applyScan}
/>
