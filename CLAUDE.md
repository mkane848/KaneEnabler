# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`KaneEnabler` is the root of all Magic: The Gathering tooling in this account — a pnpm/Turborepo
monorepo holding:

- `apps/commander-recommender` — Commander recommender (React + Vite client, Express + SQLite server)
- `apps/time-counters` — in-game counter companion for one specific Doctor Who deck. It wears the
  same platform theme as the other two by default; **the opt-in Doctor Who skin is meant to be its
  only visual difference from the rest of the site**, so treat a new app-local palette, type stack
  or page frame here as a bug rather than a feature
- `apps/home` — shared platform landing page: links to both tools, the one sign-in menu shared
  across them (`@mtg/profile`, same Supabase project as the recommender's own account menu), and
  `/profile` — a page over the same `card_preferences`/`combo_preferences` data (liked/disliked
  cards, jank tags, notes, favourited combos), resolving oracle_ids back to card data via the
  recommender server's `/api/cards`. Deploys as part of the combined static site (see "Combined
  deploy" below), not as its own standalone app in production, though it still builds and runs
  standalone for local dev
- `packages/config` (`@mtg/config`) — shared tsconfig/ESLint/Prettier/Vitest bases both apps extend
- `packages/rules` (`@mtg/rules`) — CR-cited Magic rules primitives shared by both apps: commander
  eligibility, singleton limit, Partner/Background pairing, commander tax, color-identity subset
  checks, counter taxonomy/turn steps, creature-type parsing and Changeling detection, and
  commander format legality, plus deck size and whole-deck color-identity validation. Every
  primitive except the last two is already called from both apps — the deck-size and whole-deck
  color-identity checks are tested and CR-cited
  but not wired in yet, since neither app has a deck-list-validation feature for them to back (see
  `docs/handoff.md`'s Phase 3b table). Consumed straight from `.ts` source by Vite
  and time-counters, but also built to real CommonJS for commander-recommender/server's bare-Node
  runtime (conditional package.json exports + a nested `dist/package.json` — see that package's
  own `tsconfig.build.json` before changing its module settings)
- `packages/card-model` (`@mtg/card-model`) — face/DFC-aware Scryfall field readers
  (`frontFaceField`, `frontImageUri`, `backImageUri`, `backFaceName`, `isTwoSidedLayout`) shared by
  both apps' Scryfall-import build scripts (`commander-recommender/server/scripts/import-scryfall.ts`,
  `time-counters/scripts/fetch-card-data.mjs`) — not a shared `Card` type; each app's own stored/wire
  shape stays intentionally narrow, see `docs/handoff.md`'s Phase 2 for why. Plain `.js` with JSDoc
  types, not `.ts` — `fetch-card-data.mjs` runs under bare `node` with no build step, so a `.ts`
  source (even one only ever consumed via conditional exports) isn't loadable there, the same
  constraint `time-counters/src/utils/colorIdentity.mjs` already works around
- `packages/mana` (`@mtg/mana`) — mana-cost parsing and the inlined glyph SVG paths both clients render
- `packages/ui` (`@mtg/ui`) — a `Modal` built on Radix Dialog (focus trap, Escape, scroll lock);
  time-counters' five panels use it, commander-recommender's own Dialog usages are unmigrated (see
  that package's own file for why). `ErrorBoundary`, a class component all three apps wrap their
  root in — `fallback` is a render prop so each app supplies its own themed recovery screen rather
  than a fixed look, matching `Modal`'s className-hook approach. `NavBar`, the site chrome
  (brand, cross-app links, wherever the app plugs in its account menu/theme toggle) every app
  renders at its root, and `SiteFooter`, the attribution line every app closes with. And
  **`theme.css` — the platform theme, and the single place a platform colour, font, radius or
  shadow is defined.** Every app imports it first (see each `main.tsx`) and aliases its own
  long-standing local token names to the `--mtg-*` ones rather than defining a palette of its own:
  `--ink`/`--brass` in the recommender, `--bg`/`--accent` in apps/home, `--color-*` in
  time-counters. That direction matters — it used to run the other way, with three unrelated
  palettes each mapping outward onto `--mtg-*`, which is why the three tools looked like three
  websites. It also carries the shared reset, page shell (`.mtg-page`, `.mtg-page-main`,
  `.mtg-page-title`), controls (`.mtg-btn`, `.mtg-input`) and `.mtg-visually-hidden`. The one
  sanctioned override is time-counters' Doctor Who skin, which redefines the same `--mtg-*` names
  under `[data-theme='who']` — that is how one toggle reskins the shared chrome too
- `packages/profile` (`@mtg/profile`) — shared by all three apps: a Supabase client, `useAuth`, the
  `AccountMenu`/`AuthDialog` every app's `NavBar` renders (one implementation now, not three
  per-app copies), and RLS-scoped hooks over `card_preferences`/`combo_preferences` (like/dislike,
  jank tags, favourited combos with an offline-rendered snapshot — see `docs/handoff.md`'s Phase
  7). `null` when `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` aren't set rather than
  throwing, since profiles are additive and every app works with zero Supabase setup. Depends on
  `@mtg/ui` (`AuthDialog` uses its `Modal`) — the one `packages/*` dependency edge that isn't
  card-data-shaped
- `packages/scryfall` (`@mtg/scryfall`) — hard-rule gated (`docs/api-policy.md`): the single place
  both apps' bulk-data fetch scripts (`commander-recommender/server/scripts/fetch-scryfall.ts`,
  `time-counters/scripts/fetch-card-data.mjs`) get their snapshot fetch/cache mechanics
  (`ensureOracleCardsSnapshot`, comparing Scryfall's published `updated_at` rather than guessing
  from local file age) and `User-Agent` (`buildUserAgent`, derived from each app's own
  `package.json` rather than hand-copied). Same plain-`.js`-with-JSDoc, dual CJS/ESM shape as
  `@mtg/card-model`, for the same reason — `fetch-card-data.mjs` runs under bare `node`

**Read [`docs/handoff.md`](./docs/handoff.md) first.** It is the execution brief for the
consolidation and everything that follows — target architecture, all seven phases, what's landed
and what hasn't — and it explains decisions that are easy to unknowingly reverse. Each app also has
its own `CLAUDE.md` (`apps/commander-recommender/CLAUDE.md`, `apps/time-counters/CLAUDE.md`) with
per-app architecture; this file covers only what's shared.

## Commands

Run from the repo root unless noted. Every command fans out per-package via Turborepo.

- `pnpm install` — installs the whole workspace (there is one root `pnpm-lock.yaml`, not
  per-app lockfiles)
- `pnpm turbo run build` / `typecheck` / `lint` / `test` — runs that task in every package that
  defines it. Add `--filter <package-name>` (e.g. `--filter mtg-recommender-server`) to scope to
  one app; package names are each `package.json`'s `name` field, not the `apps/` directory name.
- `pnpm dev` — starts every app's dev server concurrently (Turborepo's `dev` task is persistent,
  uncached). To run just one: `pnpm --filter mtg-time-tracker dev`.
- `pnpm format` / `pnpm format:check` — Prettier across the whole repo (one root config; ESLint is
  per-package, see each app's `eslint.config.js`).
- **Single test file:** `pnpm --filter <package-name> exec vitest run <path/to/file.test.ts>`, or
  `cd` into the app and run `pnpm exec vitest run <file>` / `pnpm exec vitest <file>` (watch mode)
  directly.
- Card-data fetch scripts (`prepare-data`, `fetch-cards`, etc.) need network access to Scryfall —
  see each app's own `CLAUDE.md`/`README.md` and [`docs/api-policy.md`](./docs/api-policy.md)
  before touching them.
- `node scripts/build-platform.mjs` — builds the combined production static site (`apps/home` at
  the root, `apps/commander-recommender/client` and `apps/time-counters` under their own
  `/recommender` and `/time-counters` subpaths) into `dist-platform/` at the repo root. This is
  what the `kaneenabler-platform` Render service runs; there's normally no reason to run it
  yourself outside of debugging that build — `pnpm dev`/`pnpm build` on an individual app is what
  you want for everyday work.

## CI

Two workflows in `.github/workflows/`:

- **`ci.yml`** — every push to `main` and every PR: `pnpm turbo run lint typecheck test build` at
  the root. Deliberately doesn't fetch real Scryfall data — lint/typecheck/build don't need it, and
  the committed seed data is enough for `test`, so a normal PR never triggers extra Scryfall traffic.
- **`scryfall-fetch-check.yml`** — scheduled (Monday 13:00 UTC) plus manual dispatch, kept separate
  from `ci.yml` for the same reason. Runs the _real_ Scryfall bulk-data fetch for both apps
  (`mtg-recommender-server`'s `prepare-data`, `mtg-time-tracker`'s `fetch-cards`), which is also the
  only place `recommend.integration.test.ts` and `cards.integration.test.ts` actually execute
  (they `skipIf` themselves everywhere else, since they need a real seeded database). This is the
  regression guard for a bad _fetch_ (a changed bulk-data shape, a moved field) — see
  `docs/api-policy.md` before changing what it calls, how often, or what triggers it.

## Architecture

- **`apps/*`** are independently deployable products with their own `package.json` name, version,
  and `CHANGELOG.md` — they are not versioned together. `apps/commander-recommender` additionally
  splits into `client/` and `server/`, each its own pnpm workspace package (see its own
  `render.yaml`/`CLAUDE.md` for why).
- **Combined deploy**: production serves `apps/home`, `apps/commander-recommender/client`, and
  `apps/time-counters` from **one** Render static site (`kaneenabler-platform`), not three — same-
  origin subpaths mean the shared Supabase sign-in session (browser storage) actually carries
  across every tool, not just "same account, separate tabs." Each app still builds and runs
  standalone for local dev (`pnpm --filter <app> dev`/`build`, `base: '/'`); only
  `scripts/build-platform.mjs` sets `VITE_BASE_PATH` to build a given app for its subpath. Don't
  hardcode a `/`-rooted asset path or fetch URL in either app without reading it back through
  `import.meta.env.BASE_URL` (see `apps/time-counters/src/utils/cardCatalog.ts` for the existing
  pattern) — anything that assumes it's mounted at the origin root breaks under the subpath build.
- **`packages/*`** are internal (`workspace:*`), unpublished, and ship plain TS source with no build
  step — both apps' Vite bundlers and `tsc`'s `moduleResolution: "bundler"` resolve a package's
  `exports` straight to its `src/index.ts`. `packages/rules` and `packages/card-model` are the
  exception each: also built to real CommonJS (`dist/`) for commander-recommender/server's bare-Node
  `tsx` scripts, which can't load their ESM source directly — see each package's own
  `tsconfig.build.json`. `packages/config`, `packages/mana`, `packages/ui`, `packages/profile`, and
  `packages/scryfall` round out today's set; all seven `docs/handoff.md` packages have landed.
- **Shared dependency versions live in `pnpm-workspace.yaml`'s `catalog:`**, not hand-copied across
  `package.json` files — reference `"catalog:"` rather than pinning a version directly for anything
  more than one package depends on, so drift can't reoccur the way it did before consolidation.
- **`noUncheckedIndexedAccess` is on** (via `packages/config/tsconfig.base.json`). An indexed access
  (`arr[i]`, `record[key]`) is `T | undefined` until proven otherwise — either guard it, or assert
  with `!` **plus a comment naming the invariant that makes it safe** (a mandatory regex capture
  group, a loop bound, a documented precondition). Don't add a bare `!` without that comment; that's
  exactly the kind of unverified assumption this flag exists to catch.

## Documents

| Document                                                               | What it's for                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/handoff.md`](./docs/handoff.md)                                 | The plan: target architecture, all seven phases, verification steps                                                                                                                                                     |
| [`docs/commander-recommender.md`](./docs/commander-recommender.md)     | Commander recommender's own handoff doc — deep design rationale, file map                                                                                                                                               |
| [`docs/rules-audit.md`](./docs/rules-audit.md)                         | Every Magic rules defect found in the incoming code, with file:line citations                                                                                                                                           |
| [`docs/archetypes.md`](./docs/archetypes.md)                           | Signal vocabulary: roles, archetypes, qualifiers, and the decks behind them                                                                                                                                             |
| [`docs/signals-rework.md`](./docs/signals-rework.md)                   | Implementation plan for the signal engine rework (shipped — every phase, including the conditional Phase C4 and the deferred Phase D)                                                                                   |
| [`docs/recommendation-coverage.md`](./docs/recommendation-coverage.md) | Implementation plan for per-card recommendation coverage — treating a submitted list as a pool rather than one deck (shipped — see `apps/commander-recommender/server/src/services/coverage.ts`)                        |
| [`docs/color-filter-semantics.md`](./docs/color-filter-semantics.md)   | Implementation brief for returning the recommender's colour pips to subset ("fits inside these colours") semantics, and why that reverses the decision recorded in `recommendation-coverage.md` (approved, not started) |
| [`docs/api-policy.md`](./docs/api-policy.md)                           | **Hard rule.** External API limits and etiquette                                                                                                                                                                        |

**Where truth lives.** [`docs/handoff.md`](./docs/handoff.md) is the phase plan and the canonical
record of what has landed vs. what is deferred; [`docs/api-policy.md`](./docs/api-policy.md) is the
hard rule for external calls; [`docs/signals-rework.md`](./docs/signals-rework.md) tracks the
recommender engine rework; and [`TODO.md`](./TODO.md) carries the remaining manual/dashboard-only
tasks. When these disagree with each other or with a stale comment, the code wins, but these four
are where a fresh session should look _first_ — the per-app `CLAUDE.md` files and this file point
inward to them rather than restating their contents.

## Hard rules

1. **Respect external API limits.** Read [`docs/api-policy.md`](./docs/api-policy.md) before
   touching anything that makes a network call. **Any change to what we call, how often, or what
   triggers a call must be confirmed with the repo owner before implementation** — including changes
   that look incidental, like moving a lookup from a click handler into a route loader or a
   `useEffect`. The riskiest traffic changes don't look like network changes; they look like
   refactors.

2. **Magic rules go in `@mtg/rules`, once.** Every rules primitive cites the Comprehensive Rules
   number it implements and is tested against it. Don't re-derive colour identity, commander
   legality, or counter semantics in an app — if it isn't in the package yet, add it there.

3. **Don't assume the legacy logic is correct.** Both incoming projects cite CR numbers in comments,
   which makes them easier to audit, not automatically right. Several documented defects sit
   directly underneath a comment describing the correct rule. See
   [`docs/rules-audit.md`](./docs/rules-audit.md).

4. **Never write oracle text from memory.** Copy it out of the card database. Scryfall has moved
   much self-referential wording from card names to "this creature" / "this land", which silently
   broke two rules in the recommender that were written from recall.

## Conventions

Both apps share these, and predate consolidation:

- **Comments explain _why_, not _what_.** They are rare and load-bearing. Match the existing tone;
  don't add narrating comments.
- **Semantic Versioning + [Keep a Changelog](https://keepachangelog.com/), per app.** Each app's own
  `package.json` `version` is that app's single source of truth — there is no workspace-wide
  version. Bump the app you actually changed.
- **A failing typecheck is a real error, not noise.** `strict`, `noUnusedLocals`,
  `noUnusedParameters`, and `noUncheckedIndexedAccess` are all on.
- **Tests before fixes** for anything in the rules audit.

## Environment notes

- The remote sandbox can reach `api.scryfall.com` only. `media.wizards.com`, `mtgjson.com` and
  `api.academyruins.com` are blocked by the egress proxy — the Comprehensive Rules ingestion script
  must run locally or in GitHub Actions and commit its output.
- Playwright and Chromium are pre-installed; do not run `playwright install`.
