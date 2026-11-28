# apps/pokemon-decks guide

Guidance for working inside `apps/pokemon-decks/`. Follow the root [`AGENTS.md`](../../AGENTS.md)
unless this file gives a more specific rule.

## What this is

Pokémon TCG deck builder. Two modes: paste a collection and get ranked decks you can build toward
(`/`), or pick a main attacker and get a 60-card list (`/build`). Formats: Standard, Expanded, Gym
Leader Challenge, Unlimited. Client-only — React 19 + Vite + TanStack Router/Query — served from
the combined platform site at `/pokemon/`. Card data is a committed TCGdex snapshot; format rules
live in `@ptcg/rules` (`packages/ptcg-rules`).

## Local commands

From the repo root:

- Dev server: `pnpm --filter pokemon-decks dev`
- Tests: `pnpm --filter pokemon-decks test`; one file:
  `pnpm --filter pokemon-decks exec vitest run src/engine/build.test.ts`
- Typecheck / lint: `pnpm --filter pokemon-decks run typecheck` / `pnpm --filter pokemon-decks run lint`
- Rules package: `pnpm --filter @ptcg/rules test`
- Regenerate the card snapshot: `pnpm --filter pokemon-decks run build-snapshot` (one shallow git
  clone of TCGdex's database plus one read of its image manifest — read `docs/api-policy.md`'s
  TCGdex section first; the monthly `pokemon-data-refresh.yml` workflow normally does this and
  opens a PR)

## Where things live

- `public/data/` — **generated, committed; never hand-edit.** `index.json` (sets, series, vendored
  legality filters, image count) and `series/<id>.json`. Regenerate with `build-snapshot`.
- `scripts/` — the snapshot builder. `tcgdexSource.mjs` parses TCGdex's TypeScript data files with
  the TS compiler and never executes them.
- `src/data/` — loads the snapshot through `import.meta.env.BASE_URL`, fetching only the series a
  format needs (`@ptcg/rules`' `seriesFor`).
- `src/engine/` — the deck heuristics: `roles.ts` (role tags from card text), `pool.ts`, `build.ts`
  (one deck around an attacker), `recommend.ts` (ranking).
- `src/lib/` — list parsing/export, URL search state, the saved collection.

## Local conventions

- **Format rules live in `@ptcg/rules`**, never here: legality, copy limits, ACE SPEC/Radiant/Prism
  Star, GLC's type and Rule Box rules. Every built deck goes through its `validateDeck`.
- **Role patterns and test fixtures come from real snapshot text.** Each regex in `roles.ts` names
  the card it was written against, and `roles.test.ts` pins it — the Pokémon side of root hard
  rule 4.
- **Runtime requests: the app's own `public/data/` files, plus card images.** Data loads only
  through `src/data/catalog.ts` (listed in `apiPolicy.test.ts`). Images follow the Magic tools'
  Scryfall arrangement (owner-approved 2026-11-28, `docs/api-policy.md`): the snapshot carries each
  card's TCGdex image base URL, and `CardArt` lets the browser load `…/low.webp` lazily from
  TCGdex's CDN.
- The engine is a heuristic and says so in the UI. Its tuning numbers (role targets, the shape
  constants, score weights) are judgement calls; change them with a before/after deck list in the
  PR.
- Bump `package.json`'s `version` and add a dated `CHANGELOG.md` entry for user-visible changes.

## Verification

For changes in this directory tree (or `packages/ptcg-rules`):

1. `pnpm --filter pokemon-decks run typecheck` and `pnpm --filter pokemon-decks test`
2. `pnpm --filter @ptcg/rules test` if a rule or the snapshot changed
3. `pnpm turbo run lint typecheck test build` from the repo root (the CI gate)
4. For anything user-visible, run the dev server and exercise it in a browser — including at 375px
   width.

## What to avoid

- Fetching TCGdex (or anything else) at runtime beyond the snapshot files and lazy card images.
- Preloading images, or showing images in collapsed lists.
- Re-deriving a format rule in the app instead of adding it to `@ptcg/rules`.
