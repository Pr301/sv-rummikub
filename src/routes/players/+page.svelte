<script lang="ts">
	import { slide } from 'svelte/transition';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { app } from '$lib/store.svelte';
	import { PLAYER_COLORS, type PlayerColor } from '$lib/types';

	let draftName = $state('');
	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let showArchived = $state(false);

	let roster = $derived(app.activePlayers);
	let archived = $derived(app.players.filter((p) => p.archived));

	function add(event: SubmitEvent) {
		event.preventDefault();
		const name = draftName.trim();
		if (!name) return;
		app.addPlayer(name);
		draftName = '';
	}

	function toggleEdit(id: string, name: string) {
		if (editingId === id) {
			commitEdit();
			return;
		}
		commitEdit();
		editingId = id;
		editingName = name;
	}

	function commitEdit() {
		if (!editingId) return;
		const name = editingName.trim();
		if (name) app.renamePlayer(editingId, name);
		editingId = null;
	}

	function gamesPlayed(playerId: string): number {
		return app.games.filter((g) => g.playerIds.includes(playerId)).length;
	}
</script>

<svelte:head><title>Players · Rummikub</title></svelte:head>

<PageHeader title="Players" eyebrow="Roster" />

<form onsubmit={add} class="mb-6 flex gap-2">
	<input
		class="field"
		bind:value={draftName}
		placeholder="Add a player"
		aria-label="New player name"
		maxlength="24"
		autocomplete="off"
	/>
	<button type="submit" class="btn btn-primary shrink-0" disabled={!draftName.trim()}>Add</button>
</form>

{#if roster.length === 0}
	<p class="rack-well px-4 py-6 text-center text-sm text-ink-dim">
		No players yet. Add everyone at the table to start keeping score.
	</p>
{:else}
	<ul class="flex flex-col gap-2">
		{#each roster as player (player.id)}
			{@const editing = editingId === player.id}
			{@const games = gamesPlayed(player.id)}
			<li class="rack-well flex items-stretch overflow-hidden">
				<!-- Colour spine: the player's tile seen edge-on in the rack. -->
				<span class="w-1.5 shrink-0" style="background: var(--color-{player.color})"></span>

				<div class="min-w-0 flex-1 px-3 py-2.5">
					<div class="flex items-center gap-3">
						<button
							type="button"
							class="min-w-0 flex-1 text-left"
							onclick={() => toggleEdit(player.id, player.name)}
							aria-expanded={editing}
						>
							<span class="block truncate font-medium">{player.name}</span>
							<span class="text-xs text-ink-faint">
								{games}
								{games === 1 ? 'game' : 'games'}
							</span>
						</button>
						<button
							type="button"
							class="btn btn-ghost shrink-0 px-3 text-xs"
							onclick={() => toggleEdit(player.id, player.name)}
						>
							{editing ? 'Done' : 'Edit'}
						</button>
					</div>

					{#if editing}
						<div transition:slide={{ duration: 180 }} class="flex flex-col gap-3 pt-3">
							<input
								class="field"
								bind:value={editingName}
								onkeydown={(e) => {
									if (e.key === 'Enter') commitEdit();
									if (e.key === 'Escape') editingId = null;
								}}
								aria-label="Name"
								maxlength="24"
								{@attach (el: HTMLInputElement) => el.select()}
							/>

							<fieldset class="flex items-center gap-2">
								<legend class="sr-only">Colour</legend>
								{#each PLAYER_COLORS as color (color)}
									<button
										type="button"
										class="size-7 rounded-full transition-transform {player.color === color
											? 'ring-2 ring-ink ring-offset-2 ring-offset-rack-raised'
											: 'opacity-55 hover:opacity-100'}"
										style="background: var(--color-{color})"
										aria-label="Colour {PLAYER_COLORS.indexOf(color as PlayerColor) + 1}"
										aria-pressed={player.color === color}
										onclick={() => app.setPlayerColor(player.id, color)}
									></button>
								{/each}
							</fieldset>

							<div class="flex items-center justify-between gap-3">
								<p class="text-xs text-ink-faint">
									{app.playerHasHistory(player.id)
										? 'Archiving keeps their name on past games.'
										: 'Not in any game yet.'}
								</p>
								<button
									type="button"
									class="btn btn-danger shrink-0 px-3 text-xs"
									onclick={() => {
										editingId = null;
										app.removePlayer(player.id);
									}}
								>
									{app.playerHasHistory(player.id) ? 'Archive' : 'Remove'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if archived.length > 0}
	<section class="mt-8">
		<button
			type="button"
			class="eyebrow flex items-center gap-2 hover:text-ink-dim"
			onclick={() => (showArchived = !showArchived)}
			aria-expanded={showArchived}
		>
			Archived · {archived.length}
			<span aria-hidden="true">{showArchived ? '−' : '+'}</span>
		</button>

		{#if showArchived}
			<ul class="mt-3 flex flex-col gap-2" transition:slide={{ duration: 180 }}>
				{#each archived as player (player.id)}
					<li class="rack-well flex items-center gap-3 px-3 py-2.5">
						<span class="flex-1 truncate text-ink-dim">{player.name}</span>
						<button
							type="button"
							class="btn btn-secondary px-3 text-xs"
							onclick={() => app.restorePlayer(player.id)}
						>
							Restore
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
