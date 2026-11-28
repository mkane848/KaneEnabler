# pokemon-decks

Pokémon TCG deck builder. Two modes: paste a collection and get ranked decks you can build toward
(`/`), or pick a main attacker and get a 60-card list (`/build`). Formats: Standard, Expanded, Gym
Leader Challenge, Unlimited. Client-only — React 19 + Vite + TanStack Router/Query — and served
from the combined platform site at `/pokemon/`.

## Commands

- `pnpm --filter pokemon-decks dev` / `build` / `test` / `typecheck` / `lint`
- `pnpm --filter pokemon-decks run build-snapshot` — rebuild the card snapshot (one shallow git
  clone of TCGdex's database). Read `docs/api-policy.md`'s TCGdex section first; the monthly
  `pokemon-data-refresh.yml` workflow normally does this and opens a PR.

## Where things live

- `public/data/` — **generated, committed.** The TCGdex snapshot: `index.json` (sets, series,
  vendored legality filters) and `series/<id>.json`. Never hand-edit; rebuild it.
- `scripts/` — the snapshot builder. `tcgdexSource.mjs` parses TCGdex's TypeScript data files with
  the TS compiler and never executes them.
- `src/data/` — loads the snapshot through `import.meta.env.BASE_URL`, fetching only the series a
  format needs (`@ptcg/rules`' `seriesFor`).
- `src/engine/` — the deck heuristics: `roles.ts` (role tags from card text), `pool.ts`,
  `build.ts` (one deck around an attacker), `recommend.ts` (ranking).
- `src/lib/` — list parsing/export, URL search state, the saved collection.

## Rules

- **Format rules live in `@ptcg/rules`**, never here: legality, copy limits, ACE SPEC/Radiant/Prism
  Star, GLC's type and Rule Box rules. Every built deck goes through its `validateDeck`.
- **Role patterns and test fixtures come from real snapshot text.** Each regex in `roles.ts` names
  the card it was written against, and `roles.test.ts` pins it. Don't write card text from memory.
- **Runtime requests: the app's own `public/data/` files, plus card images.** Data loads only
  through `src/data/catalog.ts` (listed in `apiPolicy.test.ts`). Images follow the Magic tools'
  Scryfall arrangement (owner-approved 2026-11-28, `docs/api-policy.md`): the snapshot carries
  each card's TCGdex image base URL, and `CardArt` lets the browser load `…/low.webp` lazily from
  TCGdex's CDN. Keep it lazy and on-screen only — no preloading, no images in collapsed lists.
- The engine is a heuristic and says so in the UI. Its tuning numbers (role targets, the shape
  constants, score weights) are judgement calls; change them with a before/after list in the PR.
