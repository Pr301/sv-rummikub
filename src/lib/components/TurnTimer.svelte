<script lang="ts">
	import { formatClock, TurnTimer } from '$lib/turn-timer.svelte';
	import { stopAlarm } from '$lib/audio';
	import { app } from '$lib/store.svelte';
	import type { Game } from '$lib/types';

	interface Props {
		game: Game;
	}

	let { game }: Props = $props();

	const timer = new TurnTimer({
		seconds: app.settings.turnSeconds,
		warnAt: app.settings.warnAtSeconds,
		sound: app.settings.sound,
		haptics: app.settings.vibrate
	});

	$effect(() => {
		timer.configure({
			seconds: app.settings.turnSeconds,
			warnAt: app.settings.warnAtSeconds,
			sound: app.settings.sound,
			haptics: app.settings.vibrate
		});
	});

	$effect(() => timer.destroy);

	let activeId = $derived(game.playerIds[game.activeSeat] ?? game.playerIds[0]);
	let color = $derived(`var(--color-${app.playerColor(activeId)})`);

	/** The drain bar shifts to warning colours as the clock runs down, on top of player identity. */
	let barColor = $derived(
		timer.expired
			? 'var(--app-bad)'
			: timer.remainingMs <= 10_000
				? 'var(--app-bad)'
				: timer.remainingMs <= 30_000
					? 'var(--app-warn)'
					: color
	);

	function nextPlayer() {
		stopAlarm();
		app.advanceSeat(game.id);
		timer.restart();
	}

	function skipTo(seat: number) {
		stopAlarm();
		app.setActiveSeat(game.id, seat);
		timer.reset();
	}
</script>

<section
	class="rack-well mb-4 overflow-hidden"
	class:animate-expired={timer.expired}
	style="--player: {color}"
>
	<div class="flex items-center gap-3 px-4 pt-3">
		<span class="size-2.5 shrink-0 rounded-full" style="background: {color}"></span>
		<p class="min-w-0 flex-1 truncate text-sm font-medium">
			{app.playerName(activeId)}
		</p>
		<button
			type="button"
			class="btn btn-ghost -mr-2 px-2 py-1 text-xs"
			onclick={() => skipTo(game.activeSeat - 1)}
			aria-label="Previous player"
		>
			←
		</button>
	</div>

	<div class="px-4 pt-1 pb-3">
		<p
			class="tnum text-center font-mono text-[3.25rem] leading-none font-semibold tabular-nums"
			class:text-bad={timer.expired}
			aria-hidden="true"
		>
			{#if timer.expired}
				+{formatClock(timer.overtimeMs)}
			{:else}
				{formatClock(timer.remainingMs)}
			{/if}
		</p>

		<!-- The drain bar: a full rack emptying over the turn. -->
		<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-rack-sunk" aria-hidden="true">
			<div
				class="h-full rounded-full"
				style="width: {timer.fraction *
					100}%; background: {barColor}; transition: background-color 300ms ease"
			></div>
		</div>

		<div class="mt-3 flex gap-2">
			<button type="button" class="btn btn-secondary flex-1" onclick={timer.toggle}>
				{timer.running ? 'Pause' : timer.remainingMs < timer.totalMs ? 'Resume' : 'Start turn'}
			</button>
			<button type="button" class="btn btn-primary flex-1" onclick={nextPlayer}>
				{timer.expired ? 'Stop · next' : 'Next player'}
			</button>
		</div>
	</div>
</section>

<!-- Warnings are announced as well as sounded, so the clock is usable without audio. -->
<p class="sr-only" role="status" aria-live="polite">{timer.announcement}</p>

<style>
	.animate-expired {
		animation: flash 900ms ease-in-out infinite;
	}

	@keyframes flash {
		0%,
		100% {
			border-color: var(--app-edge-soft);
		}
		50% {
			border-color: var(--app-bad);
		}
	}
</style>
