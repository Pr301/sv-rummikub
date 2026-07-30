<script lang="ts">
	import type { TileColor, TileValue } from '$lib/vision/tiles';

	interface Props {
		value: TileValue;
		color: TileColor;
		/** Rendered width in rem. Height follows the real tile ratio. */
		size?: number;
		dimmed?: boolean;
	}

	let { value, color, size = 2.75, dimmed = false }: Props = $props();

	const inks: Record<TileColor, string> = {
		black: 'var(--color-tile-black)',
		red: 'var(--color-tile-red)',
		blue: 'var(--color-tile-blue)',
		orange: 'var(--color-tile-orange)'
	};

	let ink = $derived(inks[color]);
</script>

<!--
	A single Rummikub tile: bone face, lit top bevel, shadowed bottom edge, numeral moulded in one
	of the four inks. This is the app's signature component — everything else is built around it.
-->
<span
	class="tile-face relative inline-flex shrink-0 items-center justify-center select-none"
	class:opacity-45={dimmed}
	style="width: {size}rem; height: {size * 1.38}rem; color: {ink}"
>
	{#if value === 'joker'}
		<!-- The joker's grinning face, in the tile's own ink. -->
		<svg viewBox="0 0 24 24" style="width: {size * 0.62}rem" aria-hidden="true" fill="none">
			<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6" />
			<circle cx="9" cy="10" r="1.35" fill="currentColor" />
			<circle cx="15" cy="10" r="1.35" fill="currentColor" />
			<path
				d="M8 14.2c1 1.5 2.4 2.3 4 2.3s3-.8 4-2.3"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
			/>
		</svg>
		<span class="sr-only">Joker</span>
	{:else}
		<span
			class="tnum font-tile leading-none font-bold"
			style="font-size: {size * 0.62}rem"
			aria-hidden="true">{value}</span
		>
		<span class="sr-only">{color} {value}</span>
	{/if}
</span>
