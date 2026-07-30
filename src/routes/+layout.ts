// Everything is stored in localStorage and the tile scanner needs the camera, so there is nothing
// for the server to render. Disabling SSR also means the store in `$lib/store.svelte.ts` can be a
// module singleton — see https://svelte.dev/docs/kit/state-management
export const ssr = false;
export const prerender = true;
