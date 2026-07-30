<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const items = [
		{ href: resolve('/'), label: 'Game', match: (p: string) => p === '/' },
		{ href: resolve('/history'), label: 'History', match: (p: string) => p.startsWith('/history') },
		{ href: resolve('/players'), label: 'Players', match: (p: string) => p.startsWith('/players') },
		{
			href: resolve('/settings'),
			label: 'Settings',
			match: (p: string) => p.startsWith('/settings')
		}
	];

	let pathname = $derived(page.url.pathname);
</script>

<!-- The rack lip: a raised strip along the bottom edge, where a real rack holds the tiles in. -->
<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-rack-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
	style="box-shadow: inset 0 1px 0 color-mix(in oklab, var(--app-text) 12%, transparent), 0 -8px 24px rgb(0 0 0 / 0.25)"
	aria-label="Main"
>
	<ul class="mx-auto flex max-w-lg">
		{#each items as item (item.href)}
			{@const active = item.match(pathname)}
			<li class="flex-1">
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="relative flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2 text-[0.6875rem] font-medium tracking-wide transition-colors {active
						? 'text-ink'
						: 'text-ink-faint hover:text-ink-dim'}"
				>
					<!-- Active marker reads as a tile slotted into the rack above the label. It tracks the
					     text colour so it stays visible on the cream surface as well as the dark one. -->
					<span class="h-1.5 w-7 rounded-full transition-all {active ? 'bg-ink' : 'bg-edge'}"
					></span>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
