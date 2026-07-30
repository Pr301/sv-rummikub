<script lang="ts">
	interface Props {
		value: number;
		/** Rendered height in rem; width follows. */
		size?: 'sm' | 'md' | 'lg';
		/** Show an explicit + on positives. Off for per-round deltas that already read as changes. */
		signed?: boolean;
	}

	let { value, size = 'md', signed = true }: Props = $props();

	const scale = {
		sm: { pad: 'px-2 py-1', text: 'text-sm', min: '2.5rem' },
		md: { pad: 'px-2.5 py-1.5', text: 'text-xl', min: '3.25rem' },
		lg: { pad: 'px-3 py-2', text: 'text-3xl', min: '4rem' }
	} as const;

	let ink = $derived(
		value > 0
			? 'var(--color-score-plus)'
			: value < 0
				? 'var(--color-score-minus)'
				: 'var(--color-tile-black)'
	);

	let label = $derived(`${signed && value > 0 ? '+' : ''}${value}`);
</script>

<!-- A running total moulded onto a tile face. This is the app's signature readout. -->
<span
	class="tile-face inline-flex items-center justify-center {scale[size].pad}"
	style="min-width: {scale[size].min}; color: {ink}"
>
	<span class="tnum font-tile leading-none font-bold {scale[size].text}">{label}</span>
</span>
