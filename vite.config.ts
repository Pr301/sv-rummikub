import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// All data lives in localStorage and the tile scanner needs the camera, so this is a
			// client-only SPA. The `index.html` fallback lets every route resolve offline.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		// Honour PORT so tooling that assigns a free port can drive the dev server.
		port: Number(process.env.PORT) || 5173
	}
});
