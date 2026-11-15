# Rules for Claude in this repo

## About the project

- **Name:** workout-timer
- **What it is:** a workout timer for the phone (Tabata, AMRAP, EMOM, For Time and custom
  intervals), installable as an app (PWA) and usable offline.
- **Live:** https://workout-timer.jonoba.no
- **Hosting:** Cloudflare Worker `workout-timer` with custom domain `workout-timer.jonoba.no`,
  serving static assets only. Cloudflare Workers Builds deploys automatically on push to
  `main`. Other branches get a preview build.
- **Run locally:** `npm run dev` (pages with hot reload), `npm run preview` (production
  build served by `wrangler dev`, including `_headers` and the service worker).
- **Tests:** `npm test` (unit), `npm run check` (types). CI runs both, plus `npm run build`.

The project is listed on jonoba.no/prosjekter through a card in the repo
`jongitoba/jonoba-nettside` (`src/content/projects/workout-timer.md`). If the name,
description or URL changes here, tell Jon that the card there should be updated.
Do not change that repo from here.

## Stack

Chosen stack (the same as jonoba.no, minus the server):

- **Framework:** Astro with a static build, TypeScript in strict mode. One page
  (`src/pages/index.astro`) with plain client scripts (`src/client/`), no UI framework.
  Views are switched by URL hash (`#/tabata`, `#/innstillinger`, `#/kjor` …).
- **Hosting:** Cloudflare Workers with static assets, configured in `wrangler.jsonc`.
  There is **no Worker script and no backend**. Response headers live in `public/_headers`.
- **Storage:** the browser's `localStorage` only, under the key `workout-timer:v1`
  (`src/lib/storage.ts`). Settings and saved workouts stay on the device; nothing is
  synced and there is no login (Jon's decision). Everything read back is validated, and
  storage being blocked must never break the app.
- **Offline / PWA:** `public/manifest.webmanifest`, icons in `public/icons/`, and a service
  worker generated at build time by `integrations/service-worker.mjs` from
  `integrations/sw-template.js`. It precaches every built file and versions the cache by
  content hash, so a deploy is picked up automatically. Do not hand-write `public/sw.js`.
- **Icons:** drawn by `scripts/make-icons.mjs` (`npm run icons`); the PNGs are committed.
  `public/favicon.svg` is the same design and is edited by hand.
- **Tests:** `node:test` with Node's TypeScript type stripping, so imports use `.ts`
  extensions and only erasable TypeScript syntax (no enums, no parameter properties).
- **Node:** `24`, pinned in `.node-version`.

Domain rules that the code depends on:

- All timing logic is pure and lives in `src/lib/` (`workouts.ts` builds a timeline of
  segments from a config, `timer.ts` answers "where are we at elapsed t" and "which cues
  happen between t1 and t2"). The page only tracks elapsed time. Keep it that way, and
  add tests in `test/` for any change to it.
- Elapsed time uses `Date.now()`, not `performance.now()`, so the clock stays right after
  the phone has been locked. Cues older than 1 s are dropped instead of played in a burst.
- Cues: three short beeps for the last three seconds of each timed segment, a long high
  beep when work starts, a long low beep when rest starts, three beeps at the finish.
  Optionally (setting "Pip halvveis", off by default) two quick beeps halfway through each
  timed work segment, left out when that would land inside the 3-2-1. The get-ready phase
  starts silently. Sound is Web Audio (no audio files) and must be
  unlocked from a user gesture (the Start tap).
- Screen flash: with "Farge på hele skjermen" on, the run screen takes the phase colour
  (`--phase-*` in `src/styles/global.css`) and pulses white on phase changes. The phase
  colours were checked for at least 4.5:1 contrast against white text (and the dark-mode
  variants against the dark background); re-check if you change them. Respect
  `prefers-reduced-motion`.
- Tabata ends on the last work interval (no trailing rest), so default Tabata is 3:50.
  Between sets, the set's last rest still runs and is followed by "Pause mellom sett";
  only the very last set skips its final rest.
- For Time counts up; a cap of 0 means open-ended, and the "Ferdig" button ends it.
  AMRAP and For Time show a "+1 runde" counter that ends up in the result.
- Vibration and spoken cues were considered and left out (Jon chose beeps + screen
  flash). Ask before adding them.

If the project needs something this stack handles poorly, suggest an alternative
and explain why before using it. Keep the suggestion short: what to use, why the
current stack falls short, and what it costs (money, complexity, a different deploy
setup). Wait for Jon's go-ahead before switching. Adding a backend (e.g. to sync
workouts between devices) is such a change.

## Language

- **Website content is Norwegian:** everything a visitor sees, such as page text,
  titles, meta descriptions, alt text, `aria-label`s, the web app manifest, URL hash
  slugs and error messages shown on the page.
- **Everything else is English:** code, identifiers, code comments, commit messages,
  branch names, PR titles and descriptions, CLAUDE.md, README and other developer
  docs, and all conversation with Jon.

## Branches

- All work happens on a separate branch. Never commit directly to `main`.
- Name it `claude/` followed by 1–3 keywords describing the content, joined by hyphens,
  e.g. `claude/emom-rest-beep` or `claude/fix-landscape`.
- Branch off an up-to-date `main`: `git fetch origin && git switch -c claude/<keywords> origin/main`.
- A new task means a new branch. Never build on a branch that has already been merged.
- Once merged, delete the branch both on GitHub and locally.

## Pull requests and merging

GitHub does not enforce these rules (a private repo without GitHub Pro), so they
have to be followed manually.

1. Push the branch and open a PR against `main`.
2. Run `gh pr checks <nr>` and confirm that every expected check is registered:
   - `Workers Builds: workout-timer` (Cloudflare)
   - `test` (GitHub Actions, `.github/workflows/ci.yml`)

   Right after a push a check can be missing, and then `--watch` only waits for
   the others. If a check never shows up, tell Jon. Do not treat it as passed.
3. `gh pr checks <nr> --watch --fail-fast`. Wait until all checks pass.
4. If a check fails, do not merge. Report the failure and fix it first.
5. When everything is green, tell Jon and **wait for approval**. Never merge unless
   Jon has approved this specific PR. Approval of one PR does not carry over to the next.
6. After approval: `gh pr merge <nr> --merge --delete-branch`.

## Secrets and config

- The app has no secrets today. If one is ever needed, it must not go in the repo: not
  in code, `wrangler.jsonc` or commits. Local values go in `.dev.vars`, which is listed
  in `.gitignore`.
- Add secrets in Cloudflare as type **Secret** (in the dashboard or with
  `npx wrangler secret put <NAME>`), never as Text/Variable. Plain variables are
  overwritten on every deploy.

## Constraints

- Everything stays within Cloudflare's free tiers. Static asset requests are free and
  unlimited, so keep the app static. Tell Jon before suggesting anything that costs money.
- Do not change DNS, domains or Cloudflare settings without asking first.
