# Repository guide

KaneEnabler is the root of a pnpm + Turborepo monorepo of Magic: The Gathering tools. The game's
rules, card data, mana symbols, and shared UI are modelled once in `packages/` and consumed by
three apps in `apps/`, so a new tool never re-implements colour identity, commander legality, or
counter semantics.

<!-- intent-skills:start -->

## Skill Loading

Before editing files for a substantial task:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

## Commands

Run from the repo root unless noted. Turborepo fans each task out per package; add
`--filter <package-name>` to scope to one (package names are each `package.json`'s `name`, not the
directory name).

- Install: `pnpm install` — one root `pnpm-lock.yaml`, one workspace.
- Full gate: `pnpm turbo run lint typecheck test build` (also the CI command).
- One task everywhere: `pnpm turbo run test` (or `build`, `typecheck`, `lint`).
- One package: `pnpm turbo run test --filter mtg-recommender-server`.
- Dev servers: `pnpm dev` (all, persistent + uncached) or `pnpm --filter <package-name> dev`.
- Format: `pnpm format` / `pnpm format:check` (one root Prettier config; ESLint is per-package).
- Single test file: `pnpm --filter <package-name> exec vitest run <path>`, or `pnpm exec vitest run
<file>` inside the app (omit `run` for watch mode).
- Combined static site: `node scripts/build-platform.mjs` → `dist-platform/` — what the
  `kaneenabler-platform` Render service runs. Only needed when debugging that build.
- Card-data fetch scripts (`prepare-data`, `fetch-cards`) hit Scryfall — read
  [`docs/api-policy.md`](./docs/api-policy.md) before touching them.

Package names: `mtg-recommender-client`, `mtg-recommender-server`, `mtg-time-tracker`,
`mtg-platform-home`.

## Project layout

- `apps/commander-recommender/` — paste a card list, get ranked Commander suggestions. `client/`
  (React 19 + Vite, Zustand + TanStack) and `server/` (Express 5 + better-sqlite3, no ORM) are
  separate packages.
- `apps/time-counters/` — in-game counter companion for one Doctor Who deck: static
  `public/cards.json`, `localStorage` state, CSS Modules, no backend.
- `apps/home/` — platform landing page and `/profile`; ships inside the combined static site.
- `packages/config/` (`@mtg/config`) — shared tsconfig / ESLint / Prettier / Vitest bases.
- `packages/rules/` (`@mtg/rules`) — CR-cited Magic rules primitives; the one place the rules live.
- `packages/card-model/` (`@mtg/card-model`) — face/DFC-aware Scryfall field readers (plain `.js`
  with JSDoc types, not `.ts`).
- `packages/scryfall/` (`@mtg/scryfall`) — the single choke point for Scryfall bulk-data
  fetch/cache plus `User-Agent` (plain `.js` with JSDoc types, not `.ts`).
- `packages/mana/` (`@mtg/mana`) — mana-cost parsing and inlined glyph SVG paths.
- `packages/ui/` (`@mtg/ui`) — shared `Modal`, `ErrorBoundary`, `NavBar`, `SiteFooter`, and
  `theme.css` (the platform theme; the single place a platform colour/font/radius/shadow is
  defined).
- `packages/profile/` (`@mtg/profile`) — Supabase auth and card/combo preference hooks, shared by
  all three apps.
- `docs/` — phase plan, API policy, audits, and per-feature briefs (see Documents below).
- `scripts/build-platform.mjs` — assembles the combined static site.

Per-app commands, architecture, and rules live in nested guides. Read the relevant one before
working in that app; this file covers only what's shared:

- [`apps/commander-recommender/AGENTS.md`](./apps/commander-recommender/AGENTS.md)
- [`apps/time-counters/AGENTS.md`](./apps/time-counters/AGENTS.md)

## Architecture

- **`apps/*` are independently deployable**, each with its own `package.json` name, version, and
  `CHANGELOG.md`; they are not versioned together. Bump the app you changed.
- **Combined deploy:** production serves `apps/home`, `apps/commander-recommender/client`, and
  `apps/time-counters` from one Render static site (`kaneenabler-platform`), so the shared
  Supabase session carries across every tool. Each app still builds standalone at `base: '/'`;
  only `scripts/build-platform.mjs` sets `VITE_BASE_PATH` for a subpath. Read asset and fetch URLs
  back through `import.meta.env.BASE_URL` — a hardcoded `/`-rooted path breaks the subpath build.
- **`packages/*` are internal (`workspace:*`), unpublished.** Vite and `tsc`'s
  `moduleResolution: "bundler"` resolve a package's `exports` straight to `src/index.ts`.
  `rules`, `card-model`, and `scryfall` additionally build real CommonJS into `dist/` for
  commander-recommender/server's bare-Node `tsx` scripts, which cannot load ESM source directly —
  read each `tsconfig.build.json` before changing its module settings.
- **Shared dependency versions live in `pnpm-workspace.yaml`'s `catalog:`** — reference
  `"catalog:"` rather than hand-pinning a second copy, so versions can't drift.
- **`noUncheckedIndexedAccess` is on** (via `packages/config/tsconfig.base.json`). An indexed
  access (`arr[i]`, `record[key]`) is `T | undefined` until proven otherwise — guard it, or assert
  with `!` **plus a comment naming the invariant** that makes it safe. No bare `!`.

## Documents

| Document                                                                         | What it's for                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`docs/handoff.md`](./docs/handoff.md)                                           | The phase plan: target architecture, all seven phases, verification steps                         |
| [`docs/api-policy.md`](./docs/api-policy.md)                                     | **Hard rule.** External API limits and etiquette                                                  |
| [`docs/commander-recommender.md`](./docs/commander-recommender.md)               | Commander recommender's own handoff doc and file map                                              |
| [`docs/rules-audit.md`](./docs/rules-audit.md)                                   | Every Magic rules defect found in the incoming code, with file:line citations                     |
| [`docs/archetypes.md`](./docs/archetypes.md)                                     | Signal vocabulary: roles, archetypes, qualifiers, and the decks behind them                       |
| [`docs/signals-rework.md`](./docs/signals-rework.md)                             | Signal engine rework plan (shipped)                                                               |
| [`docs/recommendation-coverage.md`](./docs/recommendation-coverage.md)           | Per-card recommendation coverage plan (shipped)                                                   |
| [`docs/color-filter-semantics.md`](./docs/color-filter-semantics.md)             | Colour-pip subset semantics brief (approved, not started)                                         |
| [`docs/control-primitives-migration.md`](./docs/control-primitives-migration.md) | Moving bespoke controls onto `@mtg/ui` (shipped)                                                  |
| [`docs/state-machine-audit.md`](./docs/state-machine-audit.md)                   | State-machine audit: confirmed defects, product decisions, phased fix plan (audited, not started) |
| [`TODO.md`](./TODO.md)                                                           | Remaining manual and dashboard-only tasks                                                         |

**Where truth lives:** [`docs/handoff.md`](./docs/handoff.md) is the phase plan and the record of
what landed; [`docs/api-policy.md`](./docs/api-policy.md) is the hard rule for external calls; the
code wins over any stale comment. Read the relevant doc before starting a fresh session — the
nested guides point inward to these rather than restating them.

## Hard rules

1. **Respect external API limits.** Read [`docs/api-policy.md`](./docs/api-policy.md) before
   touching anything that makes a network call. **Any change to what we call, how often, or what
   triggers a call must be confirmed with the repo owner before implementation** — including
   changes that look incidental, like moving a lookup from a click handler into a route loader or
   a `useEffect`. The riskiest traffic changes don't look like network changes; they look like
   refactors.

2. **Magic rules go in `@mtg/rules`, once.** Every rules primitive cites the Comprehensive Rules
   number it implements and is tested against it. Don't re-derive colour identity, commander
   legality, or counter semantics in an app — if it isn't in the package yet, add it there.

3. **Don't assume the legacy logic is correct.** Comments that cite CR numbers make code easier to
   audit, not automatically right; several documented defects sit directly underneath a comment
   describing the correct rule. See [`docs/rules-audit.md`](./docs/rules-audit.md).

4. **Never write oracle text from memory.** Copy it out of the card database. Scryfall has moved
   much self-referential wording from card names to "this creature" / "this land", which silently
   broke two rules in the recommender that were written from recall.

## Conventions

- **Comments explain _why_, not _what_.** They are rare and load-bearing; match the existing tone.
- **Semantic Versioning + [Keep a Changelog](https://keepachangelog.com/), per app.** An app's own
  `package.json` `version` is its single source of truth; bump the app you actually changed.
- **A failing typecheck is a real error, not noise.** `strict`, `noUnusedLocals`,
  `noUnusedParameters`, and `noUncheckedIndexedAccess` are all on.
- **Tests live next to the code** as `*.test.{ts,tsx,js}`.
- **Match the surrounding pattern.** Prefer the existing utility or dependency over adding one, and
  keep changes proportional to the ask.
- **Shared versions go in `catalog:`** (see Architecture); don't hand-pin a duplicate.

## Verification

Before calling work finished:

1. Focused checks for the changed area: `pnpm --filter <package-name> exec vitest run <file>` and
   `pnpm --filter <package-name> run typecheck`.
2. The full gate: `pnpm turbo run lint typecheck test build` — the same command `ci.yml` runs on
   every push and PR.
3. For user-visible changes, actually run the app (`pnpm dev`). A clean typecheck and passing tests
   are necessary, not sufficient — they don't catch a CSS rule that silently stopped applying.

`scryfall-fetch-check.yml` runs the real Scryfall bulk-data fetch separately (Monday + manual) and
is the only place the `*.integration.test.ts` suites execute. If a check fails, fix it and rerun;
don't skip the gate.

## Safety

- Do not commit secrets or credentials, and never put a private token or host in these docs.
- Do not bypass the external-API hard rule (Hard rule 1) or write oracle text from memory (Hard
  rule 4).
- Do not run destructive git or filesystem commands against uncommitted work without confirmation.
- Do not hand-edit generated artifacts; regenerate them:
  - `dist/`, `dist-platform/`, `coverage/`, `*.tsbuildinfo`, `.turbo/` — build and test output
    (gitignored). `dist/` comes from `pnpm turbo run build`.
  - `packages/mana/src/glyphs.ts` — generated and committed; regenerate with
    `pnpm --filter @mtg/mana run gen-glyphs`, and edit `scripts/gen-mana-glyphs.mjs`, not the output.
  - `apps/time-counters/public/cards.json` — generated and gitignored; `ensure-catalog` seeds it
    for dev, `pnpm --filter mtg-time-tracker run fetch-cards` rebuilds the real catalog.

## Environment notes

- The remote sandbox's egress allowlist is narrow but not absolute (re-measured 2026-09-04; see
  [`TODO.md`](./TODO.md) for the full table). `api.scryfall.com`, Supabase, `*.onrender.com`,
  Google Fonts, `magic.wizards.com`, and `mtgjson.com` resolve; `api.academyruins.com`,
  `media.wizards.com`, and `cards.scryfall.io` are blocked — so Comprehensive Rules ingestion runs
  locally or in GitHub Actions, and screenshot card art is absent.
- A Playwright-launched browser does **not** inherit `$HTTPS_PROXY`; pass it explicitly with
  `localhost` bypassed, and set `PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXY_LOOPBACK=1`.
- Playwright and Chromium are pre-installed; do not run `playwright install`.
