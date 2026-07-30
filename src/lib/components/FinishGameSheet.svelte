<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Standings from './Standings.svelte';
	import { gameWinnerId } from '$lib/scoring';
	import { app } from '$lib/store.svelte';
	import type { Game } from '$lib/types';

	interface Props {
		open: boolean;
		game: Game;
		onfinished: () => void;
	}

	let { open = $bindable(), game, onfinished }: Props = $props();

	let winner = $derived(gameWinnerId(game));

	function finish() {
		app.finishGame(game.id);
		open = false;
		onfinished();
	}

	function discard() {
		app.discardGame(game.id);
		open = false;
		onfinished();
	}
</script>

<Sheet bind:open title="Finish game" onclose={() => {}}>
	{#if game.rounds.length === 0}
		<p class="text-sm text-ink-dim">
			No rounds have been played yet, so there's nothing to save. Discarding removes the game
			entirely.
		</p>
	{:else}
		<p class="mb-4 text-sm text-ink-dim">
			{#if winner}
				<strong class="font-semibold text-ink">{app.playerName(winner)}</strong> takes it after
				{game.rounds.length}
				{game.rounds.length === 1 ? 'round' : 'rounds'}.
			{:else}
				It's a draw at the top after {game.rounds.length} rounds.
			{/if}
			Finishing moves the game to your history.
		</p>

		<Standings {game} size="sm" />
	{/if}

	{#snippet footer()}
		{#if game.rounds.length === 0}
			<button type="button" class="btn btn-danger w-full" onclick={discard}>Discard game</button>
		{:else}
			<button type="button" class="btn btn-primary w-full" onclick={finish}>
				Finish and save
			</button>
		{/if}
	{/snippet}
</Sheet>
