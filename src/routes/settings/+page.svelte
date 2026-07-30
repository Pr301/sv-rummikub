<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { app } from '$lib/store.svelte';
	import { DEFAULT_SETTINGS } from '$lib/types';

	let confirmingReset = $state(false);
	let importError = $state('');

	const TURN_PRESETS = [45, 60, 80, 120];

	let settings = $derived(app.settings);

	function setTurnSeconds(value: number) {
		app.updateSettings({ turnSeconds: Math.max(10, Math.min(600, Math.round(value))) });
	}

	function exportData() {
		const blob = new Blob([app.exportJSON()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `rummikub-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function importData(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importError = '';
		const text = await file.text();
		if (!app.importJSON(text)) {
			importError = "That file doesn't contain any Rummikub data.";
		}
		input.value = '';
	}
</script>

<svelte:head><title>Settings · Rummikub</title></svelte:head>

<PageHeader title="Settings" eyebrow="Preferences" />

<section class="mb-8">
	<h2 class="eyebrow mb-1">Turn clock</h2>
	<p class="mb-3 text-xs text-ink-faint">
		How long each player gets. Warnings sound at {settings.warnAtSeconds.join(' and ')} seconds.
	</p>

	<div class="mb-3 flex flex-wrap gap-2">
		{#each TURN_PRESETS as preset (preset)}
			<button
				type="button"
				class="btn {settings.turnSeconds === preset ? 'btn-primary' : 'btn-secondary'} px-3"
				aria-pressed={settings.turnSeconds === preset}
				onclick={() => setTurnSeconds(preset)}
			>
				{preset}s
			</button>
		{/each}
	</div>

	<label class="flex items-center gap-3">
		<span class="text-sm text-ink-dim">Custom</span>
		<input
			class="field tnum w-24"
			inputmode="numeric"
			pattern="[0-9]*"
			value={settings.turnSeconds}
			onchange={(e) => setTurnSeconds(Number(e.currentTarget.value))}
			aria-label="Seconds per turn"
		/>
		<span class="text-sm text-ink-faint">seconds</span>
	</label>
</section>

<section class="mb-8">
	<h2 class="eyebrow mb-3">Alerts</h2>
	<ul class="flex flex-col gap-2">
		{#each [{ key: 'sound', label: 'Sound', hint: 'Beeps at each warning, alarm at zero' }, { key: 'vibrate', label: 'Vibration', hint: 'Where the device supports it' }, { key: 'keepAwake', label: 'Keep screen on', hint: 'While a game is in progress' }] as row (row.key)}
			<li class="rack-well flex items-center gap-3 px-4 py-3">
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium">{row.label}</p>
					<p class="text-xs text-ink-faint">{row.hint}</p>
				</div>
				<input
					type="checkbox"
					class="size-5 rounded border-edge bg-rack-sunk text-ink focus:ring-ink"
					checked={settings[row.key as 'sound' | 'vibrate' | 'keepAwake']}
					onchange={(e) => app.updateSettings({ [row.key]: e.currentTarget.checked })}
					aria-label={row.label}
				/>
			</li>
		{/each}
	</ul>
</section>

<section class="mb-8">
	<h2 class="eyebrow mb-3">Appearance</h2>
	<div class="flex gap-2" role="group" aria-label="Theme">
		{#each [{ id: 'system', label: 'System' }, { id: 'dark', label: 'Rack' }, { id: 'light', label: 'Tile' }] as option (option.id)}
			<button
				type="button"
				class="btn {settings.theme === option.id ? 'btn-primary' : 'btn-secondary'} flex-1"
				aria-pressed={settings.theme === option.id}
				onclick={() => app.updateSettings({ theme: option.id as 'system' | 'dark' | 'light' })}
			>
				{option.label}
			</button>
		{/each}
	</div>
</section>

<section class="mb-8">
	<h2 class="eyebrow mb-1">Tile scanner</h2>
	<p class="mb-3 text-xs text-ink-faint">
		{#if app.calibration}
			Calibrated on {new Date(app.calibration.measuredAt).toLocaleDateString()}. Recalibrate if your
			set reads wrong.
		{:else}
			Photograph one tile of each colour so the scanner learns your set's inks. Optional, but it
			makes red and orange much harder to confuse.
		{/if}
	</p>
	<div class="flex gap-2">
		<a href={resolve('/settings/calibrate')} class="btn btn-secondary flex-1">
			{app.calibration ? 'Recalibrate' : 'Calibrate colours'}
		</a>
		{#if app.calibration}
			<button type="button" class="btn btn-ghost px-3" onclick={() => app.setCalibration(null)}>
				Clear
			</button>
		{/if}
	</div>
</section>

<section>
	<h2 class="eyebrow mb-3">Your data</h2>
	<p class="mb-3 text-xs text-ink-faint">
		Everything lives on this device only. Export before clearing your browser data.
	</p>

	<div class="flex flex-wrap gap-2">
		<button type="button" class="btn btn-secondary" onclick={exportData}>Export</button>

		<label class="btn btn-secondary cursor-pointer">
			Import
			<input type="file" accept="application/json,.json" class="sr-only" onchange={importData} />
		</label>

		{#if confirmingReset}
			<button
				type="button"
				class="btn btn-danger"
				onclick={() => {
					app.resetAll();
					confirmingReset = false;
				}}
			>
				Delete everything
			</button>
			<button type="button" class="btn btn-ghost" onclick={() => (confirmingReset = false)}>
				Cancel
			</button>
		{:else}
			<button type="button" class="btn btn-ghost" onclick={() => (confirmingReset = true)}>
				Reset
			</button>
		{/if}
	</div>

	{#if importError}
		<p class="mt-2 text-xs text-bad">{importError}</p>
	{/if}

	{#if settings.turnSeconds !== DEFAULT_SETTINGS.turnSeconds}
		<button
			type="button"
			class="btn btn-ghost mt-4 px-0 text-xs"
			onclick={() => app.updateSettings({ turnSeconds: DEFAULT_SETTINGS.turnSeconds })}
		>
			Restore the {DEFAULT_SETTINGS.turnSeconds}s default
		</button>
	{/if}
</section>
