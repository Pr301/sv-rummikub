<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import Sheet from './Sheet.svelte';
	import Tile from './Tile.svelte';
	import TilePicker from './TilePicker.svelte';
	import { captureFrame, detectTiles } from '$lib/vision/detect';
	import { digitTemplates } from '$lib/vision/templates';
	import {
		CONFIDENCE_FLOOR,
		isUncertain,
		totalPoints,
		type ScannedTile,
		type TileColor,
		type TileValue
	} from '$lib/vision/tiles';
	import { app } from '$lib/store.svelte';

	interface Props {
		open: boolean;
		playerName: string;
		/** Called with the confirmed rack total when the user accepts it. */
		onuse: (total: number) => void;
	}

	let { open = $bindable(), playerName, onuse }: Props = $props();

	type Stage = 'capture' | 'review';

	let stage = $state<Stage>('capture');
	let tiles = $state<ScannedTile[]>([]);
	/** Ids of uncertain reads the user has explicitly accepted. */
	const confirmed = new SvelteSet<string>();
	let cameraError = $state('');
	let busy = $state(false);
	let debug = $state(false);

	let video = $state<HTMLVideoElement>();
	// Reactive: the Capture button stays disabled until the stream is actually live.
	let stream = $state<MediaStream | null>(null);
	let frameSize = $state({ width: 0, height: 0 });
	let capturedUrl = $state('');
	let maskUrl = $state('');
	let manualId = 0;

	let total = $derived(totalPoints(tiles));
	let unresolved = $derived(tiles.filter((t) => isUncertain(t) && !confirmed.has(t.id)));

	async function startCamera() {
		cameraError = '';
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraError = 'This browser has no camera access. Use "Choose a photo" instead.';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }
			});
			if (video) {
				video.srcObject = stream;
				await video.play();
			}
		} catch (error) {
			// The usual causes are a denied permission prompt or a non-HTTPS origin.
			cameraError =
				error instanceof DOMException && error.name === 'NotAllowedError'
					? 'Camera permission was declined. You can still add tiles by hand.'
					: 'No camera available here — a secure (https) page is required. Use a photo instead.';
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		if (video) video.srcObject = null;
	}

	/** Paints the binary face mask so thresholds can be judged by eye when a read goes wrong. */
	function renderMask(mask: Uint8Array, size: { width: number; height: number }): string {
		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext('2d');
		if (!context) return '';

		const image = context.createImageData(size.width, size.height);
		for (let i = 0; i < mask.length; i++) {
			const on = mask[i] === 1 ? 255 : 0;
			image.data[i * 4] = on;
			image.data[i * 4 + 1] = on;
			image.data[i * 4 + 2] = on;
			image.data[i * 4 + 3] = 255;
		}
		context.putImageData(image, 0, 0);
		return canvas.toDataURL('image/png');
	}

	function runDetection(source: HTMLVideoElement | HTMLImageElement) {
		busy = true;
		try {
			const captured = captureFrame(source);
			if (!captured) {
				cameraError = 'That image could not be read.';
				return;
			}
			const result = detectTiles(captured.frame, digitTemplates(), app.calibration, { debug });
			tiles = result.tiles;
			frameSize = result.frame;
			capturedUrl = captured.canvas.toDataURL('image/jpeg', 0.85);
			maskUrl = result.mask ? renderMask(result.mask, result.frame) : '';
			confirmed.clear();
			stage = 'review';
			stopCamera();
		} finally {
			busy = false;
		}
	}

	function capture() {
		if (video) runDetection(video);
	}

	function choosePhoto(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const image = new Image();
		image.onload = () => {
			runDetection(image);
			URL.revokeObjectURL(image.src);
		};
		image.src = URL.createObjectURL(file);
	}

	function addTile(value: TileValue, color: TileColor) {
		manualId += 1;
		tiles = [...tiles, { id: `m${manualId}`, value, color, confidence: 1 }];
	}

	function removeTile(id: string) {
		tiles = tiles.filter((t) => t.id !== id);
	}

	function confirmTile(id: string) {
		confirmed.add(id);
	}

	function reset() {
		stopCamera();
		stage = 'capture';
		tiles = [];
		confirmed.clear();
		cameraError = '';
		capturedUrl = '';
		maskUrl = '';
		frameSize = { width: 0, height: 0 };
	}

	function use() {
		onuse(total);
		open = false;
		reset();
	}

	// Bring the camera up when the sheet opens, and always release it when it closes — a live
	// camera left running is both a battery drain and a privacy problem.
	$effect(() => {
		if (open && stage === 'capture') {
			void startCamera();
		}
		return stopCamera;
	});
</script>

<Sheet bind:open title="{playerName}'s rack" onclose={reset}>
	{#if stage === 'capture'}
		<div class="overflow-hidden rounded-xl bg-rack-sunk">
			<video bind:this={video} class="aspect-[4/3] w-full object-cover" playsinline muted></video>
		</div>

		{#if cameraError}
			<p class="mt-3 text-sm text-warn">{cameraError}</p>
		{:else}
			<p class="mt-3 text-xs text-ink-faint">
				Lay the tiles face up on a dark surface, fill the frame, and hold the phone square on.
				Everything is read on this device — no photo ever leaves it.
			</p>
		{/if}

		<div class="mt-4 flex gap-2">
			<button
				type="button"
				class="btn btn-primary flex-1"
				onclick={capture}
				disabled={!stream || busy}
			>
				{busy ? 'Reading…' : 'Capture'}
			</button>
			<label class="btn btn-secondary flex-1 cursor-pointer">
				Choose a photo
				<input
					type="file"
					accept="image/*"
					capture="environment"
					class="sr-only"
					onchange={choosePhoto}
				/>
			</label>
		</div>

		<button
			type="button"
			class="btn btn-ghost mt-2 w-full text-xs"
			onclick={() => {
				tiles = [];
				stage = 'review';
				stopCamera();
			}}
		>
			Skip the camera and tap them in
		</button>
	{:else}
		{#if capturedUrl}
			<div class="relative overflow-hidden rounded-xl bg-rack-sunk">
				<img src={capturedUrl} alt="The rack you photographed" class="w-full" />
				<svg
					viewBox="0 0 {frameSize.width} {frameSize.height}"
					class="absolute inset-0 h-full w-full"
					aria-hidden="true"
				>
					{#each tiles as tile (tile.id)}
						{#if tile.box}
							<rect
								x={tile.box.x}
								y={tile.box.y}
								width={tile.box.width}
								height={tile.box.height}
								fill="none"
								stroke={isUncertain(tile) && !confirmed.has(tile.id)
									? 'var(--app-warn)'
									: 'var(--app-good)'}
								stroke-width="2"
								rx="3"
							/>
						{/if}
					{/each}
				</svg>
			</div>
		{/if}

		<div class="mt-4 flex items-baseline justify-between gap-3">
			<h3 class="eyebrow">
				{tiles.length}
				{tiles.length === 1 ? 'tile' : 'tiles'} · {total} points
			</h3>
			{#if capturedUrl}
				<button type="button" class="btn btn-ghost px-2 py-1 text-xs" onclick={reset}>
					Retake
				</button>
			{/if}
		</div>

		{#if unresolved.length > 0}
			<p class="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
				{unresolved.length}
				{unresolved.length === 1 ? 'tile is' : 'tiles are'} an uncertain read. Tap to confirm, or fix
				them below.
			</p>
		{/if}

		{#if tiles.length > 0}
			<ul class="mt-3 flex flex-wrap gap-2">
				{#each tiles as tile (tile.id)}
					{@const uncertain = isUncertain(tile) && !confirmed.has(tile.id)}
					<li class="relative">
						<button
							type="button"
							class="block rounded-lg transition-transform active:scale-95 {uncertain
								? 'ring-2 ring-warn'
								: ''}"
							onclick={() => (uncertain ? confirmTile(tile.id) : removeTile(tile.id))}
							aria-label={uncertain
								? `Confirm ${tile.color} ${tile.value}`
								: `Remove ${tile.color} ${tile.value}`}
						>
							<Tile value={tile.value} color={tile.color} size={2.4} />
						</button>
						{#if !uncertain}
							<span
								class="pointer-events-none absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-rack text-[0.625rem] text-ink-dim"
								aria-hidden="true">×</span
							>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-3 rounded-lg border border-edge px-3 py-4 text-center text-sm text-ink-dim">
				No tiles yet. Tap them in below.
			</p>
		{/if}

		<div class="mt-5">
			<h3 class="eyebrow mb-2">Add a tile</h3>
			<p class="mb-2 text-xs text-ink-faint">
				The scanner reads printed numerals, so jokers are added here by hand.
			</p>
			<TilePicker onadd={addTile} />
		</div>

		<label class="mt-5 flex items-center gap-2 text-xs text-ink-faint">
			<input type="checkbox" class="size-4 rounded border-edge bg-rack-sunk" bind:checked={debug} />
			Show what the detector saw on the next capture
		</label>

		{#if maskUrl}
			<figure class="mt-3">
				<img
					src={maskUrl}
					alt="The detector's view: white where it decided a pixel belongs to a tile face."
					class="w-full rounded-lg"
				/>
				<figcaption class="mt-1.5 text-xs text-ink-faint">
					White is what the detector took for a tile face. If tiles are broken up or the table is
					showing through, move to a darker surface or even out the light.
				</figcaption>
			</figure>
		{/if}
	{/if}

	{#snippet footer()}
		{#if stage === 'review'}
			<button
				type="button"
				class="btn btn-primary w-full"
				disabled={unresolved.length > 0}
				onclick={use}
			>
				{#if unresolved.length > 0}
					Confirm {unresolved.length} uncertain {unresolved.length === 1 ? 'tile' : 'tiles'}
				{:else}
					Use {total} points
				{/if}
			</button>
		{:else}
			<p class="text-center text-xs text-ink-faint">
				Reads below {Math.round(CONFIDENCE_FLOOR * 100)}% confidence must be confirmed by hand.
			</p>
		{/if}
	{/snippet}
</Sheet>
