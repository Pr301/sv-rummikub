# Rummikub Scoreboard

A phone-first scoreboard for in-person Rummikub. Keeps the running score, runs a turn clock, charts
how the game is swinging, and can read a losing player's leftover tiles through the camera so nobody
has to add them up by hand.

Everything runs on the device. There is no backend, no account, and no network call — games live in
`localStorage` and the tile scanner does its image processing in the browser.

## Features

- **Roster** — named players with their own colour, kept between games. Players who appear in past
  games are archived rather than deleted, so history keeps their names.
- **Official Rummikub scoring** — enter each loser's leftover tile points; they score that as a
  negative and the winner scores the positive sum of everyone else's. Every round sums to zero.
- **Turn clock** — 80 seconds by default (configurable), with beeps at 30s and 10s and an alarm at
  zero that keeps sounding until you tap through to the next player. All sounds are synthesised with
  the Web Audio API, so there are no audio files to load.
- **Score chart** — a line per player, cumulative or per round, with an emphasised zero baseline and
  a crosshair readout.
- **Tile scanner** — point the camera at a rack, or pick a photo. Tiles are segmented, their ink
  colour classified and their numeral matched against templates rendered from system fonts. Anything
  read with low confidence is flagged and must be confirmed; a tile-by-tile picker is always
  available to correct or replace the scan.
- **History** — every finished game with its round-by-round table and the same chart.
- **Installable PWA** — add to the home screen and it runs fullscreen and offline.

## Running it

```bash
npm install
```

```bash
npm run dev
```

## Checks

```bash
npm run check && npm run lint && npm run test
```

The tests cover the two places where correctness is not obvious by inspection: the scoring maths
(`src/lib/scoring.ts`) and the vision pipeline's image processing (`src/lib/vision/`).

## Production build

```bash
npm run build && npm run preview
```

The app builds as a static SPA (`@sveltejs/adapter-static` with an `index.html` fallback), so it can
be served from any static host. To verify offline behaviour, load the preview once, then stop the
server and reload — the service worker serves the cached shell and the saved games are still there.

## Notes on the camera

`getUserMedia` only works in a secure context. That covers `localhost` and any `https://` origin, but
**not** a plain-http dev server reached over the LAN — so testing the rear camera on a real phone
needs HTTPS (for example via `@vitejs/plugin-basic-ssl`). Everywhere else, the "Choose a photo"
button uses a plain file input with `capture="environment"`, which opens the native camera on mobile
and works regardless.

Detection is reliable with even lighting, tiles laid flat on a dark surface, and the camera roughly
square on. It degrades when several of those go wrong at once, which is why low-confidence reads are
flagged for confirmation and the manual picker is never more than a tap away. If red and orange get
confused on your set, **Settings → Calibrate colours** measures your own tiles' inks once and uses
them from then on.

## Icons

The PWA icons are generated, not hand-drawn — rerun after changing the mark:

```bash
node scripts/gen-icons.mjs
```
