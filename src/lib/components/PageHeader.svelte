<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		eyebrow?: string;
		/** Trailing controls, aligned to the baseline of the title. */
		action?: Snippet;
	}

	let { title, eyebrow, action }: Props = $props();
</script>

<header class="flex items-end justify-between gap-4 pt-6 pb-5">
	<div>
		{#if eyebrow}
			<p class="eyebrow mb-1.5">{eyebrow}</p>
		{/if}
		<h1 class="font-tile text-[1.75rem] leading-none font-bold tracking-tight">{title}</h1>
	</div>
	{#if action}
		<div class="flex shrink-0 items-center gap-2">{@render action()}</div>
	{/if}
</header>
