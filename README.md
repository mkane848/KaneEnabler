# Time Counters — Commander Companion

A lightweight, single-page companion app for tracking Suspend, Vanishing,
Fading, and other time-counter mechanics across a Commander game. No backend,
no database — card data is a static file generated at build time from
Scryfall's bulk data, and game state lives in your browser's `localStorage`.

## How it works

- **Turn tracking is yours only.** Commander is multiplayer, but Suspend,
  Vanishing, Fading, and Saga chapters all trigger at the beginning of (or
  during) *their owner's* turn — not every player's. So the app just tracks
  "my turn number" and adjusts counters once per Time Travel, regardless of
  how many opponents take turns in between.
- **Time Travel** is the turn-advance button. It steps every auto-adjusting
  card's counter once — down for Suspend/Vanishing/Fading, up for Saga — and
  opens a changelog of exactly what moved and what, if anything, just
  triggered.
- **Add a card any time** via the "Add a card" panel — it's always the first
  thing on the page, whether it's the middle of your turn or someone else's.
  A second, smaller action — "Suspend a card via an effect" — covers a card
  that got exiled with time counters by something other than its own Suspend
  cost (this deck's The Tenth Doctor does that; so do cards like Delay and
  Clockspinning). It skips straight to the Suspend setup with a note that
  it came from an effect, since the app only needs to know how many time
  counters it has, not which spell put them there.
- **Starting counts are auto-filled** by reading the card's oracle text for
  Suspend, Vanishing, Fading, Saga (lore counters), or Level Up, but every
  field is editable before you confirm. Anything else falls back to a
  "Custom" counter you name yourself, with your own choice of counts up or
  counts down and an optional target.
- **Cards live on a virtual tabletop.** Tracked cards show as their card art
  in a grid, grouped by counter type — so every Suspend card sits together,
  every Saga sits together, and so on — with a color-coded badge over each
  image showing its count (or count/target for Saga). Tap a card to expand
  its controls; a card that's hit its target expands on its own so the
  "what to do now" callout isn't something you have to go looking for.
- **Every counter can be manually overridden** at any time with the +/−
  steppers or by tapping the number directly. An increment counter with a
  known target (a Saga's final chapter) can't be pushed past it, since that
  isn't a state the game can actually be in.

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
scripts/seed-cards.json       Small committed seed, copied in when no catalog exists
public/cards.json             Generated card catalog (gitignored)
src/types.ts                  Shared TypeScript types
src/utils/counters.ts         Mechanic detection, labels, colors, resolve text
src/utils/colorIdentity.mjs   Jeskai color-identity filter (shared with the fetch script)
src/utils/cardCatalog.ts      Catalog fetching and name search
src/utils/storage.ts          localStorage persistence
src/hooks/useCardCatalog.ts   Loads the catalog once, shared by consumers
src/hooks/useGameState.ts     Turn number, tracked cards, Time Travel logic
src/components/CardTile.tsx        One card's tile: art, badge, expandable controls
src/components/MechanicGroup.tsx   One counter type's labeled section of the board
src/components/ActiveCardsList.tsx Groups and sorts tracked cards into sections
src/components/AddCardPanel.tsx    Search, mechanic setup, quick-suspend action
src/components/ChangeSummaryModal.tsx  The Time Travel changelog
```

## Counter mechanics

Built in, with auto-detection from oracle text:

| Mechanic  | Direction | Auto-adjusts on Time Travel | Target                        |
| --------- | --------- | ---------------------------- | ------------------------------ |
| Suspend   | down      | yes                           | 0 (cast for free from exile)   |
| Vanishing | down      | yes                           | 0 (sacrifice)                  |
| Fading    | down      | yes                           | 0 (sacrifice)                  |
| Saga      | up        | yes                           | final chapter (e.g. 3)         |
| Level Up  | up        | no — it's a paid ability, not a turn trigger | none (open-ended) |

Anything else is a **Custom** counter: name it, pick a direction, and
optionally give it a target. That covers age counters (As Foretold),
charge counters, or any other one-off — the app doesn't need to recognize
a mechanic by name to track it correctly, since increment/decrement and an
optional target is the whole shape of every time-relevant counter mechanic
in the game.

**Not covered on purpose:** +1/+1-style counters (Amass, Bolster,
Monstrosity, Adapt, Backup, …). Those track a creature's stats, not a
countdown to a trigger, and the app's whole model — Time Travel steps a
counter and tells you what happened — doesn't fit them. This is a *time*
counter tracker, not a general-purpose counter tracker.

### About the decklist scan

This deck's decklist was checked for cards with counter mechanics against
the rules text I'm confident about — well-established, standardized Magic
templating (Suspend, Vanishing, Fading, Saga, Level Up all print consistent
reminder text, which is what the detection regexes match on). A handful of
cards are worth a second look that I could **not** verify, because this
environment has no network access to Scryfall to check their actual oracle
text:

- **Delay** and **Clockspinning** are real Time Spiral–block cards I'm
  confident *do* interact with time counters (Delay suspends a spell with
  three counters; Clockspinning moves a counter to or from a suspended
  card) — the quick "Suspend a card via an effect" action covers Delay
  directly.
- **The Tenth Doctor**, **Crack in Time**, **Out of Time**,
  **Wibbly-wobbly, Timey-wimey**, **Trenzalore Clocktower**, **The
  Pandorica**, and a few other `(who)`-set cards have names that strongly
  suggest a time or counter mechanic, but I don't have reliable enough
  knowledge of their exact printed text to say so with confidence — Doctor
  Who Commander is a 2023 Universes Beyond product, not something I could
  cross-check here.
- **Jhoira's Timebug** (Time Spiral) plausibly involves time counters based
  on its flavor, but I'm not confident enough in the exact ability to say so.

None of this blocks the deck from working with the app today: the generic
Custom mechanic and the quick-suspend action handle anything the built-in
detection doesn't recognize, with no loss of accuracy — you just tell the
app the counter type and direction yourself instead of it guessing wrong.
Once `npm run fetch-cards` runs somewhere with real network access, the
real oracle text takes over and auto-detection will catch whichever of
these actually have a supported mechanic.

## Deploying

`npm run build` produces a static `dist/` folder — drop it on any static
host (Vercel, Netlify, GitHub Pages, a spare S3 bucket, etc.). There's
nothing server-side to configure.

## Credits

Card data via [Scryfall](https://scryfall.com). Magic: The Gathering is
© Wizards of the Coast; this is an unofficial fan tool.
