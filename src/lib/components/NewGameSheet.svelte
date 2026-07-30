<script lang="ts">
	import { resolve } from '$app/paths';
	import Sheet from './Sheet.svelte';
	import { app } from '$lib/store.svelte';

	interface Props {
		open: boolean;
		onstarted: (gameId: string) => void;
	}

	let { open = $bindable(), onstarted }: Props = $props();

	/** Rummikub seats two to four; six is the practical ceiling with a second set. */
	const MAX_SEATS = 6;

	let picked = $state<string[]>([]);
	let targetText = $state('');

	let roster = $derived(app.activePlayers);
	let canStart = $derived(picked.length >= 2);

	function toggle(id: string) {
		if (picked.includes(id)) picked = picked.filter((p) => p !== id);
		else if (picked.length < MAX_SEATS) picked = [...picked, id];
	}

	function reset() {
		picked = [];
		targetText = '';
	}

	function start() {
		if (!canStart) return;
		const target = Number(targetText.trim());
		const game = app.startGame(picked, Number.isInteger(target) && target > 0 ? target : null);
		reset();
		open = false;
		onstarted(game.id);
	}
</script>

<Sheet bind:open title="New game" onclose={reset}>
	<fieldset>
		<legend class="eyebrow mb-1">Who's playing?</legend>
		<p class="mb-3 text-xs text-ink-faint">
			Tap in seating order — that's the order the turn timer follows.
		</p>

		{#if roster.length < 2}
			<p class="rack-well px-4 py-5 text-center text-sm text-ink-dim">
				You need at least two players.
				<a href={resolve('/players')} class="underline underline-offset-2">Add some</a>.
			</p>
		{:else}
			<div class="flex flex-wrap gap-2">
				{#each roster as player (player.id)}
					{@const seat = picked.indexOf(player.id)}
					{@const full = picked.length >= MAX_SEATS && seat === -1}
					<button
						type="button"
						class="btn {seat >= 0 ? 'btn-primary' : 'btn-secondary'} gap-2 px-3"
						aria-pressed={seat >= 0}
						disabled={full}
						onclick={() => toggle(player.id)}
					>
						<span
							class="grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold"
							style="background: var(--color-{player.color}); color: #1b1b1b"
						>
							{seat >= 0 ? seat + 1 : ''}
						</span>
						{player.name}
					</button>
				{/each}
			</div>
		{/if}
	</fieldset>

	<fieldset class="mt-6">
		<legend class="eyebrow mb-1">Finish line</legend>
		<p class="mb-3 text-xs text-ink-faint">
			Optional. The game offers to end once someone reaches this score.
		</p>
		<input
			class="field tnum"
			inputmode="numeric"
			pattern="[0-9]*"
			placeholder="No target"
			bind:value={targetText}
			aria-label="Target score"
		/>
	</fieldset>

	{#snippet footer()}
		<button type="button" class="btn btn-primary w-full" disabled={!canStart} onclick={start}>
			{canStart ? `Start with ${picked.length} players` : 'Pick at least two players'}
		</button>
	{/snippet}
</Sheet>
