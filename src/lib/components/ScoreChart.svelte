<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { cumulativeSeries, roundScores } from '$lib/scoring';
	import { app } from '$lib/store.svelte';
	import type { Game } from '$lib/types';

	interface Props {
		game: Game;
	}

	let { game }: Props = $props();

	type Mode = 'cumulative' | 'round';
	let mode = $state<Mode>('cumulative');
	const hidden = new SvelteSet<string>();
	let hoverIndex = $state<number | null>(null);
	let width = $state(0);

	const HEIGHT = 190;
	/** The right gutter holds the leader's direct label, so it can't be clipped by the frame. */
	const PAD = { top: 14, right: 62, bottom: 24, left: 36 };
	const LEADER_LABEL_MAX = 9;

	/** Cumulative starts at a shared 0 so every line begins on the baseline; deltas start at round 1. */
	let series = $derived.by(() => {
		if (mode === 'cumulative') return cumulativeSeries(game);
		const out: Record<string, number[]> = {};
		for (const id of game.playerIds) out[id] = [];
		for (const round of game.rounds) {
			const scores = roundScores(round, game.playerIds);
			for (const id of game.playerIds) out[id].push(scores[id] ?? 0);
		}
		return out;
	});

	let pointCount = $derived(series[game.playerIds[0]]?.length ?? 0);
	let visibleIds = $derived(game.playerIds.filter((id) => !hidden.has(id)));

	let bounds = $derived.by(() => {
		const values = visibleIds.flatMap((id) => series[id] ?? []);
		if (values.length === 0) return { min: -10, max: 10 };
		let min = Math.min(0, ...values);
		let max = Math.max(0, ...values);
		if (min === max) {
			min -= 10;
			max += 10;
		}
		// Breathing room so the extreme point never sits on the frame.
		const pad = (max - min) * 0.12;
		return { min: min - pad, max: max + pad };
	});

	/** Round tick step up to a familiar number so the axis reads at a glance. */
	let ticks = $derived.by(() => {
		const span = bounds.max - bounds.min;
		const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
		const step = steps.find((s) => span / s <= 4) ?? 2000;
		const out: number[] = [];
		for (let v = Math.ceil(bounds.min / step) * step; v <= bounds.max; v += step) out.push(v);
		return out;
	});

	let plotWidth = $derived(Math.max(0, width - PAD.left - PAD.right));
	let plotHeight = HEIGHT - PAD.top - PAD.bottom;

	function x(index: number): number {
		if (pointCount <= 1) return PAD.left + plotWidth / 2;
		return PAD.left + (index / (pointCount - 1)) * plotWidth;
	}

	function y(value: number): number {
		const t = (value - bounds.min) / (bounds.max - bounds.min);
		return PAD.top + (1 - t) * plotHeight;
	}

	function path(values: number[]): string {
		return values
			.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
			.join(' ');
	}

	/** The one direct label the chart carries: whoever is ahead, at their line's end. */
	let leaderId = $derived.by(() => {
		if (mode !== 'cumulative' || visibleIds.length === 0) return null;
		return visibleIds.reduce((best, id) => {
			const last = series[id]?.[pointCount - 1] ?? 0;
			return last > (series[best]?.[pointCount - 1] ?? 0) ? id : best;
		}, visibleIds[0]);
	});

	function toggle(id: string) {
		// Never let the last visible line be hidden — an empty chart tells you nothing.
		if (hidden.has(id)) hidden.delete(id);
		else if (visibleIds.length > 1) hidden.add(id);
	}

	function pointerIndex(event: PointerEvent) {
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const rel = event.clientX - rect.left - PAD.left;
		if (pointCount <= 1) return 0;
		return Math.max(0, Math.min(pointCount - 1, Math.round((rel / plotWidth) * (pointCount - 1))));
	}

	function onKey(event: KeyboardEvent) {
		if (pointCount === 0) return;
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const step = event.key === 'ArrowRight' ? 1 : -1;
			hoverIndex = Math.max(0, Math.min(pointCount - 1, (hoverIndex ?? 0) + step));
		} else if (event.key === 'Escape') {
			hoverIndex = null;
		}
	}

	/**
	 * A plain function, not a `$derived`: the value depends on the argument as well as `mode`, so
	 * there is nothing for a derived to cache. Callers read it inside the template, which is what
	 * tracks `mode`.
	 */
	function roundLabel(index: number): string {
		if (mode !== 'cumulative') return `Round ${index + 1}`;
		return index === 0 ? 'Start' : `Round ${index}`;
	}
</script>

<section class="mt-8">
	<div class="mb-3 flex items-center justify-between gap-3">
		<h2 class="eyebrow">How it's swinging</h2>

		<div class="flex rounded-lg border border-edge p-0.5" role="group" aria-label="Chart mode">
			{#each [{ id: 'cumulative', label: 'Total' }, { id: 'round', label: 'Per round' }] as option (option.id)}
				<button
					type="button"
					class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {mode === option.id
						? 'bg-tile text-[#1b1b1b]'
						: 'text-ink-dim hover:text-ink'}"
					aria-pressed={mode === option.id}
					onclick={() => (mode = option.id as Mode)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="relative" bind:clientWidth={width}>
		{#if width > 0 && pointCount > 0}
			<svg
				viewBox="0 0 {width} {HEIGHT}"
				{width}
				height={HEIGHT}
				role="img"
				aria-label="{mode === 'cumulative' ? 'Running totals' : 'Points per round'} for {visibleIds
					.map((id) => app.playerName(id))
					.join(', ')} over {game.rounds.length} rounds"
				class="touch-pan-y overflow-visible"
			>
				<!-- Gridlines: hairline, one step off the surface, deliberately recessive. -->
				{#each ticks as tick (tick)}
					<line
						x1={PAD.left}
						x2={width - PAD.right}
						y1={y(tick)}
						y2={y(tick)}
						stroke="var(--app-edge-soft)"
						stroke-width="1"
					/>
					<text
						x={PAD.left - 7}
						y={y(tick)}
						text-anchor="end"
						dominant-baseline="middle"
						class="tnum"
						font-size="10"
						fill="var(--app-text-faint)"
					>
						{tick}
					</text>
				{/each}

				<!-- Zero is the line that matters: below it you are losing the game. -->
				<line
					x1={PAD.left}
					x2={width - PAD.right}
					y1={y(0)}
					y2={y(0)}
					stroke="var(--app-text-faint)"
					stroke-width="1.5"
				/>

				{#each visibleIds as id (id)}
					{@const color = `var(--color-${app.playerColor(id)})`}
					<path
						d={path(series[id] ?? [])}
						fill="none"
						stroke={color}
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<!-- End dot: r=4 with a 2px surface ring so crossings stay legible. -->
					<circle
						cx={x(pointCount - 1)}
						cy={y(series[id]?.[pointCount - 1] ?? 0)}
						r="4"
						fill={color}
						stroke="var(--app-rack)"
						stroke-width="2"
					/>
				{/each}

				{#if hoverIndex !== null}
					<line
						x1={x(hoverIndex)}
						x2={x(hoverIndex)}
						y1={PAD.top}
						y2={HEIGHT - PAD.bottom}
						stroke="var(--app-text-dim)"
						stroke-width="1"
					/>
					{#each visibleIds as id (id)}
						<circle
							cx={x(hoverIndex)}
							cy={y(series[id]?.[hoverIndex] ?? 0)}
							r="4"
							fill="var(--color-{app.playerColor(id)})"
							stroke="var(--app-rack)"
							stroke-width="2"
						/>
					{/each}
				{/if}

				<!-- x labels: first and last only, so the axis never crowds on a phone. -->
				<text
					x={PAD.left}
					y={HEIGHT - 6}
					font-size="10"
					fill="var(--app-text-faint)"
					text-anchor="start">{roundLabel(0)}</text
				>
				{#if pointCount > 1}
					<text
						x={width - PAD.right}
						y={HEIGHT - 6}
						font-size="10"
						fill="var(--app-text-faint)"
						text-anchor="end">{roundLabel(pointCount - 1)}</text
					>
				{/if}

				<rect
					x={PAD.left}
					y={PAD.top}
					width={plotWidth}
					height={plotHeight}
					fill="transparent"
					tabindex="0"
					role="slider"
					aria-label="Inspect a round"
					aria-valuemin="0"
					aria-valuemax={pointCount - 1}
					aria-valuenow={hoverIndex ?? 0}
					aria-valuetext={roundLabel(hoverIndex ?? 0)}
					onpointermove={(e) => (hoverIndex = pointerIndex(e))}
					onpointerdown={(e) => (hoverIndex = pointerIndex(e))}
					onpointerleave={() => (hoverIndex = null)}
					onkeydown={onKey}
					onblur={() => (hoverIndex = null)}
				/>
			</svg>

			{#if leaderId && hoverIndex === null && game.rounds.length > 0}
				{@const name = app.playerName(leaderId)}
				<!-- Selective direct label: the leader only. Everyone else is carried by the legend. -->
				<span
					class="pointer-events-none absolute -translate-y-1/2 text-[0.6875rem] font-semibold text-ink-dim"
					style="left: {x(pointCount - 1) + 8}px; top: {y(
						series[leaderId]?.[pointCount - 1] ?? 0
					)}px"
					title={name}
				>
					{name.length > LEADER_LABEL_MAX ? `${name.slice(0, LEADER_LABEL_MAX - 1)}…` : name}
				</span>
			{/if}

			{#if hoverIndex !== null}
				<div
					class="pointer-events-none absolute top-0 z-10 min-w-32 rounded-lg border border-edge bg-rack-sunk px-3 py-2 shadow-lg"
					style="left: {Math.min(Math.max(x(hoverIndex) - 60, 0), Math.max(0, width - 130))}px"
					role="status"
				>
					<p class="eyebrow mb-1.5">{roundLabel(hoverIndex)}</p>
					<ul class="flex flex-col gap-1">
						{#each visibleIds as id (id)}
							<li class="flex items-center gap-2 text-xs">
								<span
									class="size-2 shrink-0 rounded-full"
									style="background: var(--color-{app.playerColor(id)})"
								></span>
								<span class="tnum flex-1 font-semibold">{series[id]?.[hoverIndex] ?? 0}</span>
								<span class="truncate text-ink-dim">{app.playerName(id)}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{:else}
			<div style="height: {HEIGHT}px"></div>
		{/if}
	</div>

	<!-- Legend is always present for two or more series, and doubles as a show/hide control. -->
	<ul class="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
		{#each game.playerIds as id (id)}
			{@const off = hidden.has(id)}
			<li>
				<button
					type="button"
					class="flex items-center gap-1.5 text-xs transition-opacity {off ? 'opacity-40' : ''}"
					aria-pressed={!off}
					onclick={() => toggle(id)}
				>
					<span
						class="size-2.5 shrink-0 rounded-full"
						style="background: var(--color-{app.playerColor(id)})"
					></span>
					<span class={off ? 'line-through' : ''}>{app.playerName(id)}</span>
				</button>
			</li>
		{/each}
	</ul>
</section>
