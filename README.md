# Time Counters — Commander Companion

A lightweight, single-page companion app for tracking Suspend, Vanishing,
Fading, and other time-counter mechanics across a Commander game. No backend,
no database — card data is a static file generated at build time from
Scryfall's bulk data, and game state lives in your browser's `localStorage`.

## How it works

- **Turn tracking is yours only.** Commander is multiplayer, but Suspend,
  Vanishing, and Fading all remove a time counter at the beginning of *their
  owner's* upkeep — not every player's. So the app just tracks "my turn
  number" and decrements counters once per Next Turn, regardless of how many
  opponents take turns in between.
- **Next Turn** is the automatic upkeep trigger every Suspend, Vanishing, and
  Fading card has on its own — it removes one time counter from every
  tracked card and opens a summary of what changed and what, if anything,
  just resolved.
- **Time Travel** is a separate, deliberately manual action, because it's a
  real (and different) Magic keyword: *"For each suspended card you own and
  each permanent you control with a time counter on it, you may add or
  remove a time counter."* It isn't tied to the turn counter at all — it's
  something specific cards grant (this deck has three: The Tenth Doctor's
  {7} activated ability does it three times, Wibbly-wobbly, Timey-wimey
  triggers it once off a spell, and Time Beetle triggers it on combat
  damage). Tap Time Travel, say how many times you're resolving it, and the
  app walks you through that many passes, one card at a time, letting you
  add, remove, or skip each one — so you always know how many passes are
  left instead of losing count mid-resolution.
- **Add a card any time** via the "Add a card" panel — it's always the first
  thing on the page, whether it's the middle of your turn or someone else's.
  A second, smaller action — "Suspend a card via an effect" — covers a card
  that got exiled with time counters by something other than its own Suspend
  cost. This deck's The Tenth Doctor does exactly that: attacking exiles a
  card and suspends it with three time counters, no Suspend cost paid. Delay
  does the same generically. This shortcut skips straight to the Suspend
  setup with a note that it came from an effect, since the app only needs to
  know how many time counters the card has, not which spell put them there.
- **Starting counts are auto-filled** by reading the card's oracle text for
  Suspend, Vanishing, or Fading, but every field is editable before you
  confirm. Anything else falls back to a "Custom" counter you name yourself,
  with your own choice of counts up or counts down and an optional target —
  for age counters (As Foretold) or any other one-off this app doesn't know
  by name.
- **Cards live on a virtual tabletop.** Tracked cards show as their card art
  in a grid, grouped by counter type — every Suspend card sits together,
  every Vanishing card sits together, and so on — with a color-coded badge
  over each image showing its count. Tap a card to expand its controls; a
  card that's hit zero expands on its own so the "what to do now" callout
  isn't something you have to go looking for.
- **Every counter can be manually overridden** at any time with the +/−
  steppers or by tapping the number directly.
- **The Game Log** ("Game Log" in the header) is a SpellTable-style history
  of every effect that changed something, grouped by turn with the current
  turn tagged and newest first — adding a card, a Next Turn upkeep, a Time
  Travel pass, a manual edit, resolving or removing a card, changing the
  turn number. It's a slide-in drawer rather than a permanently docked
  sidebar: this app is mobile-first, and there's no spare width to keep a
  sidebar open alongside the board on a phone, so it's reference material
  you pull up and dismiss rather than a fixed pane. It persists with the
  rest of the game state, so it survives a reload and only clears on New
  Game.

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
src/hooks/useGameState.ts     Turn number, tracked cards, game log, Next Turn and Time Travel logic
src/components/CardTile.tsx        One card's tile: art, badge, expandable controls
src/components/MechanicGroup.tsx   One counter type's labeled section of the board
src/components/ActiveCardsList.tsx Groups and sorts tracked cards into sections
src/components/AddCardPanel.tsx    Search, mechanic setup, quick-suspend action
src/components/ChangeSummaryModal.tsx  The Next Turn upkeep summary
src/components/TimeTravelPanel.tsx     Walks through N passes of the Time Travel keyword action
src/components/GameLogPanel.tsx        Slide-in game log, grouped by turn
```

## Counter mechanics

The app only tracks **time counters** — the counter type Suspend, Vanishing,
and Fading use — not Magic's many other counter types (+1/+1, loyalty, lore,
level, and so on). Built in, with auto-detection from oracle text:

| Mechanic  | Direction | Auto-adjusts on Next Turn | Target                      |
| --------- | --------- | --------------------------- | ---------------------------- |
| Suspend   | down      | yes                          | 0 (cast for free from exile) |
| Vanishing | down      | yes                          | 0 (sacrifice)                |
| Fading    | down      | yes                          | 0 (sacrifice)                |

Anything else is a **Custom** counter: name it, pick a direction, and
optionally give it a target. That covers age counters (As Foretold) or any
other one-off this app doesn't recognize by name — you tell it the counter
type and direction instead of it guessing wrong. The increment option
exists here specifically because Time Travel can *add* a time counter to
any of these cards, not just remove one, so the data model has to allow it
even though none of the three built-in mechanics move that way on their own.

**Not covered on purpose:** every other counter type in Magic (+1/+1, loyalty,
charge, lore, level, and so on). This is a *time* counter tracker, matching
what the app's name says — not a general-purpose counter tracker.

### About the decklist scan

This environment has no network access to Scryfall, so oracle text can't be
fetched directly — but web search access became available partway through
building this app, which made it possible to verify some of what was
previously just an educated guess. Cross-checked against multiple
independent sources (MTG Wiki, Card Kingdom's mechanics writeup, and
Scryfall's own `keyword:"time travel"` index):

- **The Tenth Doctor's** real ability is confirmed: *"Whenever you attack,
  exile cards from the top of your library until you exile a nonland card,
  then put three time counters on it. If it doesn't have suspend, it gains
  suspend."* Plus *"Timey-Wimey — {7}: Time travel three times. Activate
  only as a sorcery."* The quick "Suspend a card via an effect" action is
  the right shortcut for the first ability, and Time Travel now exists as
  its own feature for the second.
- **Wibbly-wobbly, Timey-wimey** and **Time Beetle** also confirmed to use
  Time Travel — the former as a spell ("Time travel. … Draw a card."), the
  latter off combat damage.
- **All of History, All at Once** appears in Scryfall's own index of cards
  with the Time Travel keyword, though its exact full text wasn't pulled.
- **Delay** and **Clockspinning** are real Time Spiral–block cards that
  manipulate time counters directly (Delay suspends a spell with three
  counters; Clockspinning moves a counter to or from a suspended card) —
  the quick-suspend action covers Delay directly.

Still unverified — **Crack in Time**, **Out of Time**, **Trenzalore
Clocktower**, **The Pandorica**, and **Jhoira's Timebug** have names or
flavor that suggest a time-counter connection, but I don't have their exact
oracle text confirmed. None of this blocks the deck from working today: the
Custom mechanic handles anything the built-in detection doesn't recognize,
and `npm run fetch-cards` with real network access will pull the actual
text for all of these and let auto-detection take over properly.

## Deploying

`npm run build` produces a static `dist/` folder — drop it on any static
host (Vercel, Netlify, GitHub Pages, a spare S3 bucket, etc.). There's
nothing server-side to configure.

## Credits

Card data via [Scryfall](https://scryfall.com). Magic: The Gathering is
© Wizards of the Coast; this is an unofficial fan tool.
