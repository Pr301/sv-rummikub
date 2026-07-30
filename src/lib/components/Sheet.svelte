<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
		/** Pinned to the bottom of the sheet, outside the scroll area. */
		footer?: Snippet;
	}

	let { open = $bindable(), title, onclose, children, footer }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	// <dialog> gives us the focus trap, inert background, and Escape handling for free; this keeps
	// its open state in step with the `open` prop.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="m-0 mt-auto w-full max-w-lg bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:mx-auto"
	onclose={() => {
		open = false;
		onclose();
	}}
	oncancel={(event) => {
		event.preventDefault();
		open = false;
		onclose();
	}}
>
	{#if open}
		<div
			class="flex max-h-[88svh] flex-col rounded-t-2xl border-t border-edge bg-rack-raised pb-[env(safe-area-inset-bottom)] text-ink"
			style="box-shadow: 0 -12px 40px rgb(0 0 0 / 0.5)"
		>
			<header class="flex items-center gap-3 border-b border-edge-soft px-4 pt-3 pb-3">
				<div class="flex-1">
					<div class="mx-auto mb-3 h-1 w-10 rounded-full bg-edge"></div>
					<h2 class="font-tile text-lg font-bold">{title}</h2>
				</div>
				<button
					type="button"
					class="btn btn-ghost -mr-2 px-3"
					onclick={() => {
						open = false;
						onclose();
					}}
				>
					Close
				</button>
			</header>

			<div class="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
				{@render children()}
			</div>

			{#if footer}
				<footer class="border-t border-edge-soft px-4 py-3">
					{@render footer()}
				</footer>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		max-width: 100%;
		max-height: 100svh;
		width: 100%;
	}

	dialog[open] > :global(div) {
		animation: rise 260ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes rise {
		from {
			transform: translateY(14px);
			opacity: 0;
		}
	}
</style>
