# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`KaneEnabler` is the root of all Magic: The Gathering tooling in this account — a pnpm/Turborepo
monorepo holding:

- `apps/commander-recommender` — Commander recommender (React + Vite client, Express + SQLite server)
- `apps/time-counters` — in-game counter companion for one specific Doctor Who deck
- `packages/config` (`@mtg/config`) — shared tsconfig/ESLint/Prettier/Vitest bases both apps extend
- `packages/mana` (`@mtg/mana`) — mana-cost parsing and the inlined glyph SVG paths both clients render
- `packages/ui` (`@mtg/ui`) — a `Modal` built on Radix Dialog (focus trap, Escape, scroll lock);
  time-counters' five panels use it, commander-recommender's own Dialog usages are unmigrated (see
  that package's own file for why). Also `ErrorBoundary`, a class component both apps wrap their
  root in — `fallback` is a render prop so each app supplies its own themed recovery screen rather
  than a fixed look, matching `Modal`'s className-hook approach

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

## Architecture

- **`apps/*`** are independently deployable products with their own `package.json` name, version,
  and `CHANGELOG.md` — they are not versioned together. `apps/commander-recommender` additionally
  splits into `client/` and `server/`, each its own pnpm workspace package (see its own
  `render.yaml`/`CLAUDE.md` for why).
- **`packages/*`** are internal (`workspace:*`), unpublished, and ship plain TS source with no build
  step — both apps' Vite bundlers and `tsc`'s `moduleResolution: "bundler"` resolve a package's
  `exports` straight to its `src/index.ts`. `packages/config`, `packages/mana`, and `packages/ui`
  exist today; `docs/handoff.md`'s remaining Phase 2–3 packages (`@mtg/rules`, `@mtg/scryfall`,
  `@mtg/card-model`, `@mtg/profile`) land incrementally — check that doc for current status before
  assuming one exists.
- **Shared dependency versions live in `pnpm-workspace.yaml`'s `catalog:`**, not hand-copied across
  `package.json` files — reference `"catalog:"` rather than pinning a version directly for anything
  more than one package depends on, so drift can't reoccur the way it did before consolidation.
- **`noUncheckedIndexedAccess` is on** (via `packages/config/tsconfig.base.json`). An indexed access
  (`arr[i]`, `record[key]`) is `T | undefined` until proven otherwise — either guard it, or assert
  with `!` **plus a comment naming the invariant that makes it safe** (a mandatory regex capture
  group, a loop bound, a documented precondition). Don't add a bare `!` without that comment; that's
  exactly the kind of unverified assumption this flag exists to catch.

## Documents

| Document                                                           | What it's for                                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [`docs/handoff.md`](./docs/handoff.md)                             | The plan: target architecture, all seven phases, verification steps           |
| [`docs/commander-recommender.md`](./docs/commander-recommender.md) | Commander recommender's own handoff doc — deep design rationale, file map     |
| [`docs/rules-audit.md`](./docs/rules-audit.md)                     | Every Magic rules defect found in the incoming code, with file:line citations |
| [`docs/api-policy.md`](./docs/api-policy.md)                       | **Hard rule.** External API limits and etiquette                              |

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
