<script lang="ts">
	import Tile from './Tile.svelte';
	import { TILE_COLORS, TILE_NUMBERS, type TileColor, type TileValue } from '$lib/vision/tiles';

	interface Props {
		onadd: (value: TileValue, color: TileColor) => void;
	}

	let { onadd }: Props = $props();

	let color = $state<TileColor>('black');

	const swatches: Record<TileColor, string> = {
		black: 'var(--color-tile-black)',
		red: 'var(--color-tile-red)',
		blue: 'var(--color-tile-blue)',
		orange: 'var(--color-tile-orange)'
	};
</script>

<fieldset>
	<legend class="sr-only">Add a tile</legend>

	<!--
		The chosen ink is a tile face; the others are plain outlined buttons. Dimming a cream tile
		with opacity just turns it muddy against the rack, so selection changes the surface instead.
	-->
	<div class="mb-3 flex gap-2" role="group" aria-label="Ink colour">
		{#each TILE_COLORS as option (option)}
			{@const picked = color === option}
			<button
				type="button"
				class="relative h-9 flex-1 rounded-lg capitalize transition-colors {picked
					? 'tile-face'
					: 'border border-edge hover:bg-rack-sunk'}"
				aria-pressed={picked}
				onclick={() => (color = option)}
			>
				<span
					class="font-tile text-sm font-bold"
					style="color: {picked ? swatches[option] : 'var(--app-text-dim)'}"
				>
					{option}
				</span>
			</button>
		{/each}
	</div>

	<div class="grid grid-cols-7 gap-1.5">
		{#each TILE_NUMBERS as number (number)}
			<button
				type="button"
				class="flex justify-center transition-transform active:scale-95"
				onclick={() => onadd(number, color)}
				aria-label="Add {color} {number}"
			>
				<Tile value={number} {color} size={2.1} />
			</button>
		{/each}
		<button
			type="button"
			class="flex justify-center transition-transform active:scale-95"
			onclick={() => onadd('joker', color)}
			aria-label="Add joker, worth 30"
		>
			<Tile value="joker" {color} size={2.1} />
		</button>
	</div>
</fieldset>
