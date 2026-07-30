<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';
	import { app } from '$lib/store.svelte';

	let { children } = $props();

	app.load();

	// Mirror the theme preference onto <html> so the CSS overrides in layout.css can take effect.
	$effect(() => {
		const theme = app.settings.theme;
		const root = document.documentElement;
		if (theme === 'system') root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', theme);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="mx-auto flex min-h-svh max-w-lg flex-col px-4 pt-[env(safe-area-inset-top)] pb-24">
	{@render children()}
</div>

<Nav />
