# workout-timer

A workout timer for the phone at **https://workout-timer.jonoba.no**: Tabata, AMRAP,
EMOM, For Time and custom intervals. Installable as an app (PWA) and works offline.
The app itself is in Norwegian. Code, comments and docs are in English.

- **Framework:** [Astro](https://astro.build), static build, no UI framework
- **Hosting:** Cloudflare Workers with static assets only (no Worker script). Deploys
  automatically on push to `main` via Workers Builds.
- **Data:** settings and saved workouts live in the browser's `localStorage`. No backend,
  no login, nothing leaves the device.
- **Cost:** 0 NOK/month

```
src/lib/workouts.ts           ← modes, their fields, config → timeline (Plan)
src/lib/timer.ts              ← state at elapsed time, cues (beeps/flash) between two times
src/lib/format.ts             ← time formatting, parsing typed input, stepper steps
src/lib/storage.ts            ← localStorage shape and validation
src/client/app.ts             ← views, setup form, presets, settings, the running timer
src/client/audio.ts           ← Web Audio beeps
src/client/wake-lock.ts       ← keeps the screen on during a workout
src/pages/index.astro         ← the whole app (one page, hash routing)
src/styles/global.css         ← styles and phase colours
integrations/                 ← generates dist/sw.js (offline cache) after the build
public/manifest.webmanifest   ← PWA manifest
public/_headers               ← cache headers for sw.js, manifest and hashed assets
scripts/make-icons.mjs        ← draws public/icons/*.png
```

## Modes

| Mode | Fields | Notes |
|---|---|---|
| Tabata | work, rest, rounds, sets, rest between sets | Defaults 20 s / 10 s × 8 |
| AMRAP | duration | Counts down, "+1 runde" counter |
| EMOM | interval, rounds | Set the interval to 2:00 for E2MOM |
| For Time | time cap (0 = none) | Counts up, "Ferdig" stops it, "+1 runde" counter |
| Intervall | same as Tabata | Defaults 40 s / 20 s × 10 |

Every workout starts with a get-ready countdown (10 s by default, set in Innstillinger).
Duration fields take `1:30`, `1.30` or `1,30`. A plain number means seconds, except for
AMRAP duration and the For Time cap, where it means minutes.

## Running locally

Requires Node 24 (see `.node-version`).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:4321. Pages, CSS and scripts hot reload. The service worker is
only registered in production builds, so it never gets in the way during development.

To test the real production setup (built files, `_headers`, service worker, offline):

```bash
npm run preview
```

That builds the site and serves it with `wrangler dev` on http://localhost:8787.

To try it on your phone over the local network: `npx astro dev --host`, then open the
printed network address. Wake lock and installing as an app need HTTPS, so test those on
the deployed site or a preview URL.

Tests and type check:

```bash
npm test
```

```bash
npm run check
```

## Deploy (one-time Cloudflare setup)

1. Create the GitHub repo `jongitoba/workout-timer` and push `main`.
2. Cloudflare → Workers & Pages → Create → *Import a repository* → `jongitoba/workout-timer`.
   - Name: `workout-timer` (must match `name` in `wrangler.jsonc`)
   - Build command: empty (`wrangler.jsonc` runs `npm run build` itself). Deploy command: `npx wrangler deploy`.
   - Production branch: `main`.
3. The Worker → Settings → **Domains & Routes** → *Add* → *Custom domain* → `workout-timer.jonoba.no`.
4. Add the project card to `jongitoba/jonoba-nettside` (`src/content/projects/workout-timer.md`).

## Installing on the phone

- **iPhone (Safari):** Share → *Legg til på Hjem-skjerm*.
- **Android (Chrome):** the app shows an *Installer som app* button, or use the menu → *Installer app*.

## Known limits

- On iPhone, the beeps follow the silent switch (a Web Audio limitation in Safari).
- If the screen locks, the browser pauses the page. The clock stays correct when you
  come back, but beeps during the lock are skipped. "Hold skjermen på" (Wake Lock) keeps
  the screen on during a workout to avoid this.
