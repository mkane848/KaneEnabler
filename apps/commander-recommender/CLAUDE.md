# CLAUDE.md

Guidance for Claude Code when working in `apps/commander-recommender/`.

## What this is

A Commander recommender: paste or upload a card list, get ranked Commander suggestions —
including Partner/Background pairs — with cited synergies, ban-list legality, and an estimated
Bracket. React 19 + Vite client (Zustand + TanStack Query/Table), Express 5 + better-sqlite3
server, no ORM. Card data is Scryfall's Oracle Cards bulk export, imported into SQLite at
build/deploy time — the running server never calls Scryfall live.

Read [`../../docs/commander-recommender.md`](../../docs/commander-recommender.md) first — it's
this app's own handoff document (moved here during the monorepo consolidation, file map kept
current) and covers the deeper "why" behind the stack choices, the scoring model, and known risk
areas in more depth than this file repeats. This file is about how to work in the code, not what
the code does. The root [`CLAUDE.md`](../../CLAUDE.md) covers workspace-wide commands and
conventions this file doesn't repeat.

## Commands

Run from `apps/commander-recommender/` unless noted (or use `pnpm --filter mtg-recommender-client`
/ `--filter mtg-recommender-server` from the repo root).

- `pnpm --filter mtg-recommender-client dev` and `pnpm --filter mtg-recommender-server dev`, or
  both via `pnpm dev` from the repo root — API on `:4000`, Vite client on `:5173` (proxies `/api`)
- `cd server && pnpm run prepare-data` — downloads Scryfall's Oracle Cards bulk file and seeds
  `server/data/cards.sqlite`; required before `/api/recommend` returns anything but a 503. Needs
  network access; reuses a copy less than a week old unless run as `prepare-data:fresh`
- `cd server && pnpm run typecheck` (`tsc`) / `pnpm run build` (`tsc -p tsconfig.build.json`,
  `src/` only, test files excluded — see the note in `tsconfig.build.json` about why `rootDir`
  matters here) / `pnpm test` (Vitest, 12 files colocated under `src/services/`)
- `cd client && pnpm run typecheck` (`tsc -b`) / `pnpm run build` (`tsc -b && vite build`) /
  `pnpm test` (Vitest, 5 files colocated under `src/lib/`)
- `pnpm run lint` in either — no type-aware rules (see `packages/config/eslint.base.js`)
- Single test file: `pnpm exec vitest run src/services/synergy.test.ts` (or any other), from
  whichever of `client`/`server` it lives in

## Architecture

- **`server/src/services/synergy.ts`** is the heart of the app: builds a `CollectionProfile` from
  the matched cards (color identity, creature types, keywords, oracle-text theme regexes), then
  scores every `CommanderUnit` from `partners.ts` against it. A signal counts only once it clears
  `MIN_SIGNAL_COUNT` (3) distinct supporting cards _after_ narrowing to that unit's color identity.
  Kindred requires the unit's own text to _care_ about a type (`caresAboutCreatureType`), not
  merely have it. Color identity gates eligibility and contributes nothing to score — see the
  "scoring measures focus" tests in `synergy.test.ts` before changing the weight formula.
- **`server/src/services/signals.ts`** (879 lines, the largest file) is the signal/role model
  feeding `synergy.ts`: what a card contributes to a deck's plan (`is`/`produces`/`consumes`/
  `rewards`/`amplifies`) and in what capacity. `deckAnalysis.ts` + `lifecycle.ts` + `packages.ts`
  build on it to answer "what is this list trying to do, and what's it missing" independent of any
  commander — see `docs/commander-recommender.md`'s file map for how those three fit together.
- **`server/src/services/partners.ts`** builds every legal `CommanderUnit` (rule 702.124: one card
  or a legal pair) from the eligible pool — a `CommanderUnit` is what `synergy.ts` scores, not a
  bare `CardRow`. Grouped by ability variant (Partner, Partner—[text], Partner with [Name], Friends
  forever, Choose a Background, Doctor's companion) rather than a cross-product.
- **`server/src/services/eligibility.ts`** judges commander eligibility on a card's **front face
  only** (CR 712.4) — Scryfall's top-level `type_line` for a DFC is both faces joined, which is why
  this can't just substring-match the whole thing. `split` is the deliberate exception (CR 709.4).
  This runs at import time (`import-scryfall.ts`'s only caller), so a stale `cards.sqlite` keeps
  old eligibility until re-imported.
- **`server/src/db.ts`** — SQLite connection + `isSeeded` guard (returns 503 instead of a raw SQL
  error pre-import) + `findCardsByNames`, which falls back to a `card_face_names` table (built by
  `cardNames.ts`'s rules) so a decklist naming only one face of a DFC still resolves.
- **`server/scripts/fetch-scryfall.ts`** + **`import-scryfall.ts`** are the only place Scryfall is
  called from this app — see [`../../docs/api-policy.md`](../../docs/api-policy.md), a hard
  project rule, before changing what these call or when.
- **`server/src/services/spellbook.ts`** — Commander Spellbook adapter. Click-triggered only, 1-hour
  in-memory cache, no retry on 429. Same hard-rule constraints apply.
- **Cited-card dedup**: the server sends each cited card once (`server/src/services/cardIndex.ts`)
  and cites it by position; `client/src/lib/rehydrate.ts` puts cards back together at the API
  boundary. This is why a 12MB response became 0.25MB (see `CHANGELOG.md` 1.7.1) — don't bypass it
  by threading whole card objects through a new code path.
- **`client/src/api/`** — `client.ts` (fetch + cold-start retry against Render's free-tier sleep)
  wrapped by `queries.ts` (TanStack Query hooks). The `retry`/`refetchOnWindowFocus`/
  `refetchOnReconnect: false` defaults in `main.tsx` are load-bearing against Commander
  Spellbook traffic — don't restore them without re-reading the api-policy doc.
- **`client/src/store/`** splits by what the state _is_: `useAppStore` (not persisted — textarea
  contents, submitted list, dismissals) vs. `usePreferencesStore` (persisted to `localStorage` —
  durable UI prefs like page size). Don't merge these; a dismissal surviving a browser restart
  against a different pasted list would be surprising, but a page-size choice should outlive the
  tab.
- **`client/src/lib/mtg.ts`** — WUBRG ordering and color-identity naming ("Golgari", never
  "Black/Green"). **`client/src/lib/manaSymbols.ts`** — inlined SVG mana glyph paths (see
  `docs/rules-audit.md` item 16 — this file is a Phase 2 migration target for `@mtg/mana`).
- A suggestion is a `CommanderUnit` (1-2 `CardRow`s), not a single card — every DTO, filter, and
  sort in the client threads through that union, not a flattened card.

## Conventions

- Comments explain _why_, not _what_ — match the existing tone (see `synergy.ts`'s comments on the
  scoring formula, or `eligibility.ts`'s on front-face-only reasoning).
- Keep changes proportional to the ask. This codebase deliberately favors a short, readable
  heuristic over a "complete" system in synergy detection and Bracket estimation — see
  `docs/commander-recommender.md`'s "Core logic" section before making one more sophisticated.
- Match the existing pattern for whichever file you're touching. If the surrounding code uses a
  plain function and a `Set`, don't reach for a class or a new dependency to do the same job.
- **Never write oracle text from memory — copy it from the database.** Scryfall has moved much
  self-referential wording from a card's name to "this creature"/"this land"; two rules in this
  codebase were written from recall and were wrong on real cards (see
  `docs/commander-recommender.md`'s "Known risk areas"). Every string in `signals.test.ts` is
  copied verbatim from the imported database — keep it that way.
- Before opening a PR: typecheck and test both `client/` and `server/`, and actually run the app
  for anything user-visible — a clean typecheck and passing tests are necessary, not sufficient
  (they don't catch a CSS rule that silently stopped applying, for instance).
- Add a `CHANGELOG.md` entry under `[Unreleased]` for any user-facing change, in the existing
  style (see `1.7.1`'s entry for the level of detail expected).
- `docs/commander-recommender.md`'s file map is meant to stay current — update it in the same
  commit whenever you add, rename, or remove a file it lists.
