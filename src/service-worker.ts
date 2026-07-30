/// <reference types="@sveltejs/kit" />
import { base, build, files, version } from '$service-worker';

// `self` is a ServiceWorkerGlobalScope here, not a Window.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `rummikub-${version}`;
/** The app shell: hashed build output plus everything in static/. */
const ASSETS = [...build, ...files];
const FALLBACK = `${base}/index.html`;

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
			// The SPA fallback is what every client-side route resolves to when offline.
			await cache.add(FALLBACK).catch(() => {});
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Build output is content-hashed, so a hit is always correct and always fastest.
			if (ASSETS.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}

			// Navigations: prefer the network so a deploy is picked up, but never fail offline —
			// the cached shell can render any route because all state is local.
			if (request.mode === 'navigate') {
				try {
					return await fetch(request);
				} catch {
					return (
						(await cache.match(FALLBACK)) ??
						(await cache.match(`${base}/`)) ??
						new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
					);
				}
			}

			try {
				const response = await fetch(request);
				if (response.ok && response.type === 'basic') {
					cache.put(request, response.clone());
				}
				return response;
			} catch {
				const cached = await cache.match(request);
				if (cached) return cached;
				throw new Error('Offline and not cached');
			}
		})()
	);
});
