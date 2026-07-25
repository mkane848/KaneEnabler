# Time Counters — Commander Companion

A lightweight, single-page companion app for tracking Suspend, Vanishing,
Fading, and other time-counter mechanics across a Commander game. No backend,
no database — card data is a static file generated at build time from
Scryfall's bulk data, and game state lives in your browser's `localStorage`.

## How it works

- **Turn tracking is yours only.** Commander is multiplayer, but Suspend,
  Vanishing, and Fading all remove a counter at the beginning of *their
  owner's* upkeep — not every player's. So the app just tracks "my turn
  number" and decrements counters once per increment, regardless of how many
  opponents take turns in between.
- **Add a card any time** via the "Add a card" panel — it's always the first
  thing on the page, whether it's the middle of your turn or someone else's.
- **Starting counts are auto-filled** by reading the card's oracle text for
  keywords like "Suspend 4" or "Vanishing 3," but every field is editable
  before you confirm.
- **Every counter can be manually overridden** at any time with the +/−
  steppers or by tapping the number directly.
- **Next Turn shows a summary** of what changed at upkeep, with a clear
  callout for anything that just hit 0 and what to do about it (cast it
  from exile, sacrifice it, etc.).

## Setup

```bash
npm install
npm run fetch-cards   # pulls the full Jeskai card pool — see below
npm run dev
```

## The card catalog

Search covers **every Commander-legal card in the Jeskai (White/Blue/Red)
color identity** — around 16,000 cards, which is the full legal pool for
this deck's commanders. Anything outside that identity is filtered out at
generation time and again when the app loads, so an off-color card can
never appear in the picker.

`npm run fetch-cards` builds that catalog: it downloads Scryfall's Oracle
Cards bulk file, keeps the cards that are Commander-legal and Jeskai, and
writes `public/cards.json`. It's a build step — the running app never calls
the Scryfall API itself.

A few things worth knowing about the shape of that file:

- It lives in `public/`, not `src/`, so it ships as a standalone static
  asset the app fetches at runtime. Importing ~4.5 MB of JSON would inline
  it into the JavaScript bundle and stall startup; served this way the UI
  paints immediately and the catalog streams in behind it (and gzips to a
  few hundred KB over the wire).
- Only the fields the UI reads are kept. Oracle text in particular is stored
  just for cards with a time-counter mechanic, since that is the only thing
  that reads it — which drops several megabytes.
- The repo commits a five-card seed so `npm run dev` works before you have
  ever run `fetch-cards`. Render regenerates the real catalog on every
  deploy (see `render.yaml`), and `fetch-cards` fails the build loudly
  rather than quietly shipping that seed.

## Scripts

| Command               | What it does                                          |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Start the local dev server                             |
| `npm run build`        | Type-check and build a static bundle into `dist/`      |
| `npm run preview`      | Preview the production build locally                   |
| `npm run fetch-cards`  | Rebuild `public/cards.json` from Scryfall              |

## Project layout

```
scripts/fetch-card-data.mjs   Scryfall bulk-data → public/cards.json
public/cards.json             Generated card catalog (or the committed seed)
src/types.ts                  Shared TypeScript types
src/utils/counters.ts         Mechanic detection from oracle text
src/utils/colorIdentity.ts    Jeskai color-identity filter
src/utils/cardCatalog.ts      Catalog fetching and name search
src/utils/storage.ts          localStorage persistence
src/hooks/useCardCatalog.ts   Loads the catalog once, shared by consumers
src/hooks/useGameState.ts     Turn number, tracked cards, upkeep logic
src/components/               UI: header, add-card panel, card list, summary
```

## Deploying

`npm run build` produces a static `dist/` folder — drop it on any static
host (Vercel, Netlify, GitHub Pages, a spare S3 bucket, etc.). There's
nothing server-side to configure.

## Credits

Card data via [Scryfall](https://scryfall.com). Magic: The Gathering is
© Wizards of the Coast; this is an unofficial fan tool.
