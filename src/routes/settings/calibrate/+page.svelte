<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { captureFrame } from '$lib/vision/detect';
	import { DEFAULT_HUES, DEFAULT_BLACK_SATURATION } from '$lib/vision/classify';
	import { CLOSE_UP_GLYPH_OPTIONS, findGlyphs } from '$lib/vision/glyphs';
	import { app } from '$lib/store.svelte';

	type Step = 'red' | 'orange' | 'blue';
	const STEPS: Step[] = ['red', 'orange', 'blue'];

	const labels: Record<Step, string> = {
		red: 'a red tile',
		orange: 'an orange tile',
		blue: 'a blue tile'
	};

	let index = $state(0);
	let measured = $state<Partial<Record<Step, number>>>({});
	let error = $state('');
	let video = $state<HTMLVideoElement>();
	// Reactive: the Measure button stays disabled until the stream is actually live.
	let stream = $state<MediaStream | null>(null);

	let step = $derived(STEPS[index]);
	let done = $derived(index >= STEPS.length);

	async function startCamera() {
		error = '';
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } }
			});
			if (video) {
				video.srcObject = stream;
				await video.play();
			}
		} catch {
			error = 'No camera here. Calibration needs one — the defaults will keep being used.';
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	$effect(() => {
		if (!done) void startCamera();
		return stopCamera;
	});

	function measure() {
		if (!video) return;
		error = '';
		const captured = captureFrame(video);
		if (!captured) {
			error = 'Could not read the camera.';
			return;
		}

		// The boldest mark in frame is the numeral on the one tile the user is holding up.
		const ink = findGlyphs(captured.frame, CLOSE_UP_GLYPH_OPTIONS).sort(
			(a, b) => b.area - a.area
		)[0];
		if (!ink) {
			error = 'No numeral found. Fill more of the frame and try again.';
			return;
		}

		if (ink.saturation < 0.2) {
			error = 'That ink reads as black, not a colour. Try a more evenly lit shot.';
			return;
		}

		measured[step] = ink.hue;
		index += 1;
	}

	function save() {
		app.setCalibration({
			measuredAt: Date.now(),
			hues: {
				red: measured.red ?? DEFAULT_HUES.red,
				orange: measured.orange ?? DEFAULT_HUES.orange,
				blue: measured.blue ?? DEFAULT_HUES.blue
			},
			blackMaxValue: DEFAULT_BLACK_SATURATION
		});
		void goto(resolve('/settings'));
	}
</script>

<svelte:head><title>Calibrate · Rummikub</title></svelte:head>

<PageHeader title="Calibrate" eyebrow="Tile scanner">
	{#snippet action()}
		<a href={resolve('/settings')} class="btn btn-ghost px-3 text-sm">Cancel</a>
	{/snippet}
</PageHeader>

{#if done}
	<div class="rack-well px-4 py-6 text-center">
		<p class="mb-1 font-tile text-lg font-bold">All three measured</p>
		<p class="mx-auto mb-5 max-w-[30ch] text-sm text-ink-dim">
			The scanner will use your set's own inks from now on.
		</p>
		<ul class="mb-5 flex justify-center gap-4">
			{#each STEPS as name (name)}
				<li class="text-xs text-ink-faint">
					<span
						class="mx-auto mb-1 block size-6 rounded-full"
						style="background: hsl({measured[name] ?? 0} 70% 50%)"
					></span>
					{Math.round(measured[name] ?? 0)}°
				</li>
			{/each}
		</ul>
		<div class="flex justify-center gap-2">
			<button type="button" class="btn btn-primary" onclick={save}>Save calibration</button>
			<button
				type="button"
				class="btn btn-secondary"
				onclick={() => {
					index = 0;
					measured = {};
				}}
			>
				Start over
			</button>
		</div>
	</div>
{:else}
	<p class="mb-4 text-sm text-ink-dim">
		Step {index + 1} of {STEPS.length}. Hold up <strong class="text-ink">{labels[step]}</strong> so it
		fills the frame, then measure.
	</p>

	<div class="overflow-hidden rounded-xl bg-rack-sunk">
		<video bind:this={video} class="aspect-[4/3] w-full object-cover" playsinline muted></video>
	</div>

	{#if error}
		<p class="mt-3 text-sm text-warn">{error}</p>
	{/if}

	<button type="button" class="btn btn-primary mt-4 w-full" onclick={measure} disabled={!stream}>
		Measure {step}
	</button>
{/if}
