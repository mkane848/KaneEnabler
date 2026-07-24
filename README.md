# Time Counters — Commander Companion

A lightweight, single-page companion app for tracking Suspend, Vanishing,
Fading, and other time-counter mechanics across a Commander game. No backend,
no database — card data is a static file bundled at build time from
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
npm run fetch-cards   # optional but recommended — see below
npm run dev
```

The app ships with a handful of example cards in `src/data/cards.json` so it
runs out of the box. To load your actual decklist:

1. Open `decklist.txt` and add your deck's card names, one per line.
2. Run `npm run fetch-cards`. This downloads Scryfall's Oracle Cards bulk
   file and filters it down to just your deck, overwriting
   `src/data/cards.json`. It's a build step, not something the running app
   does — end users never call the Scryfall API directly.
3. Restart `npm run dev` (or just let Vite hot-reload — it usually picks up
   the new JSON automatically).

Leave `decklist.txt` empty and `fetch-cards` will instead grab every card on
Scryfall with Suspend, Vanishing, or Fading text, which is a fine way to
explore the app before your list is finalized.

## Scripts

| Command               | What it does                                      |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Start the local dev server                         |
| `npm run build`        | Type-check and build a static bundle into `dist/`  |
| `npm run preview`      | Preview the production build locally               |
| `npm run fetch-cards`  | Rebuild `src/data/cards.json` from your decklist    |

## Project layout

```
scripts/fetch-card-data.mjs   Scryfall bulk-data → src/data/cards.json
decklist.txt                  Your deck's card names (edit this)
src/data/cards.json           Generated card catalog (or the demo seed)
src/types.ts                  Shared TypeScript types
src/utils/counters.ts         Mechanic detection from oracle text
src/utils/cardCatalog.ts      Name search over the bundled catalog
src/utils/storage.ts          localStorage persistence
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
