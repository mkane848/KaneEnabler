# Time Counters — Commander Companion

A lightweight, single-page companion app for tracking Suspend, Vanishing,
Fading, and Saga counters — plus commander tax — across a Commander game.
No backend, no database — card data is a static file generated at build
time from Scryfall's bulk data, and game state lives in your browser's
`localStorage`.

## How it works

- **Turn tracking is yours only.** Commander is multiplayer, but Suspend,
  Vanishing, and Fading all remove a counter at the beginning of _their
  owner's_ upkeep, and a Saga gains a lore counter as _their owner's_
  precombat main begins — not every player's. So the app just tracks "my
  turn number," not a full multi-player turn order.
- **Next Turn runs two steps, in order, as one action:** upkeep (Suspend,
  Vanishing, and Fading counters tick down) and then precombat main (each
  tracked Saga gains a lore counter, firing any chapter ability that lore
  count newly reaches). The summary modal groups what changed by step, so a
  Saga's chapter ability is never mixed in with an unrelated upkeep trigger
  or shown before the turn has actually reached that point.
- **Time Travel** is a separate, deliberately manual action, because it's a
  real (and different) Magic keyword: _"For each suspended card you own and
  each permanent you control with a time counter on it, you may add or
  remove a time counter."_ It isn't tied to the turn counter at all — it's
  something specific cards grant (this deck has three: The Tenth Doctor's
  {7} activated ability does it three times, Wibbly-wobbly, Timey-wimey
  triggers it once off a spell, and Time Beetle triggers it on combat
  damage). Tap Time Travel, say how many times you're resolving it, and the
  app walks you through that many passes, one card at a time, letting you
  add, remove, or skip each one — so you always know how many passes are
  left instead of losing count mid-resolution. Only objects with a real
  _time counter_ are offered: Suspend and Vanishing cards, and Rose Tyler's
  own Bad Wolf counters once she has any — Fading (fade counters) and Saga
  (lore counters) are never eligible, since neither is actually a time
  counter.
- **Commander tax and Rose Tyler's Bad Wolf counters** live behind the
  commander portraits in the header, or the field tile once a commander is
  cast — tap either to open a tracker for that commander: how many times
  it's been cast from the command zone this game and the resulting tax
  (rule 903.10, +{2} per previous cast), with a one-tap "Cast from the
  command zone" action. Casting puts the commander on the board as a card,
  right alongside everything else being tracked, until it's sent back to
  the command zone (which never resets the tax — that persists for the
  whole game regardless of zone changes). Rose Tyler's modal additionally
  tracks her own time counters (she's +1/+1 for each) with manual +/−
  controls and a "Rose attacks" action that counts this game's tracked
  Suspend cards and Vanishing permanents for you and applies that many
  counters in one tap. The Tenth Doctor's modal has a Timey-Wimey shortcut
  straight into Time Travel, pre-set to his ability's three passes.
- **Add a card any time** via the "Add a card" panel — it's always the first
  thing on the page, whether it's the middle of your turn or someone else's.
  A second, smaller action — "Suspend a card via an effect" — covers a card
  that got exiled with time counters by something other than its own Suspend
  cost. This deck's The Tenth Doctor does exactly that: attacking exiles a
  card and suspends it with three time counters, no Suspend cost paid. Delay
  does the same generically. This shortcut skips straight to the Suspend
  setup with a note that it came from an effect, since the app only needs to
  know how many time counters the card has, not which spell put them there.
- **Create a token** covers creature tokens an effect makes, which aren't in
  the card catalog since they're not cards in their own right — Scryfall
  only lists cards legal in Commander, and a token isn't one. This deck's
  The Girl in the Fireplace does exactly this: its first chapter makes a
  1/1 Human Noble token with vanishing 3. Name the token, pick its mechanic
  the same way you would for a real card, and it's tracked identically from
  there — just tagged "Token" on its tile, since it has no Scryfall art.
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
- **Two visual themes** — a Doctor Who–skinned look (the default) and the
  app's original styling, kept as a "Claude" option. Switch anytime with the
  "Theme:" button in the header; see [Themes](#themes) below.
- **About** (in the header) shows the current version, credits, and links to
  the source repo and the [changelog](CHANGELOG.md). The app follows
  [Semantic Versioning](https://semver.org/) starting at v1.0.0.

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

| Command               | What it does                                      |
| --------------------- | ------------------------------------------------- |
| `npm run dev`         | Start the local dev server                        |
| `npm run build`       | Type-check and build a static bundle into `dist/` |
| `npm run preview`     | Preview the production build locally              |
| `npm run fetch-cards` | Rebuild `public/cards.json` from Scryfall         |

## Project layout

```
scripts/fetch-card-data.mjs   Scryfall bulk-data → public/cards.json
scripts/seed-cards.json       Small committed seed, copied in when no catalog exists
public/cards.json             Generated card catalog (gitignored)
src/types.ts                  Shared TypeScript types
src/utils/counters.ts         Mechanic detection, labels, colors, resolve text
src/utils/colorIdentity.mjs   Jeskai color-identity filter (shared with the fetch script)
src/utils/cardCatalog.ts      Catalog fetching and name search
src/utils/commanders.ts       Commander id/name lookup, shared by App/CommanderBanner/CommanderTaxModal
src/utils/storage.ts          localStorage persistence (game state)
src/utils/theme.ts            localStorage persistence (theme preference)
src/hooks/useCardCatalog.ts     Loads the catalog once, shared by consumers
src/hooks/useCommanderCards.ts  Looks up each commander's catalog entry (for its art) by name
src/hooks/useGameState.ts       Turn number, tracked cards, game log, Next Turn and Time Travel logic
src/hooks/useTheme.ts           Reads/writes/applies the active theme
src/components/CardTile.tsx            One tracked card's tile: art, badge, expandable controls
src/components/CommanderFieldTile.tsx  A commander's tile while it's on the battlefield
src/components/ActiveCardsList.tsx     One flat, sorted grid of commander + tracked-card tiles
src/components/AddCardPanel.tsx        Search, mechanic setup, quick-suspend action
src/components/ChangeSummaryModal.tsx  The Next Turn summary, grouped by upkeep vs. precombat main
src/components/TimeTravelPanel.tsx     Walks through N passes of the Time Travel keyword action
src/components/CommanderTaxModal.tsx   Per-commander tax tracker, opened from a portrait or field tile
src/components/GameLogPanel.tsx        Slide-in game log, grouped by turn
src/components/ThemeToggle.tsx         Switches between the two themes
src/components/AboutModal.tsx          Version, credits, and repo/changelog links
```

## Themes

Two visual themes, switchable anytime from the header — the choice is a
device preference (its own localStorage key), so New Game doesn't reset it:

- **Doctor Who** (default) — a TARDIS-blue palette with an electric-cyan
  accent, and sci-fi/HUD typography: [Orbitron](https://fonts.google.com/specimen/Orbitron)
  for headings, [Titillium Web](https://fonts.google.com/specimen/Titillium+Web)
  for body text, [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)
  for numbers and counts. All three are free/open (SIL OFL or Apache 2.0),
  loaded the same non-render-blocking way the app's other fonts already are.

  This is deliberately an original color-and-type language, not a
  reproduction of any BBC-owned asset — the Doctor Who logo wordmark and the
  TARDIS box shape are both design-trademarked, so neither appears anywhere
  in this theme. It's meant to read as "a Magic tool with a Doctor Who
  skin," the same way the rest of the app already leans on Scryfall art and
  the community-standard [mana-font](https://github.com/andrewgioia/mana)
  project for its MTG identity.

- **Claude** — the app's original styling (the dark "exile zone at night"
  palette with an amber accent, Fraunces/Inter/IBM Plex Mono), kept exactly
  as-is and selectable rather than replaced.

A few colors are deliberately **not** themed, because they carry functional
meaning that shouldn't change with the skin: mana pip colors always match
MTG's own White/Blue/Black/Red/Green, and mechanic badge colors (Suspend =
gold, Vanishing = blue, Fading = coral, Saga = green) stay the same across
both themes so that color-to-mechanic association doesn't have to be
relearned when switching.

Switching applies instantly — every component reads color and font values
from CSS custom properties (`--color-*`, `--font-*`) rather than hardcoding
them, so the whole app reskins from one attribute change
(`<html data-theme="...">`). A small inline script in `index.html` applies
the stored preference before React mounts, so a returning visitor who picked
Claude doesn't see a flash of the Doctor Who default first.

## Counter mechanics

The app tracks the counter types this deck actually uses — Suspend and
Vanishing (real _time counters_), Fading (_fade counters_, a distinct
counter type — rule 702.32), and Saga (_lore counters_) — not Magic's many
other counter types (+1/+1, loyalty, charge, level, and so on). Built in,
with auto-detection from oracle text where that's possible:

| Mechanic  | Direction | Auto-adjusts on | Target                              |
| --------- | --------- | --------------- | ----------------------------------- |
| Suspend   | down      | upkeep          | 0 (cast for free from exile)        |
| Vanishing | down      | upkeep          | 0 (sacrifice)                       |
| Fading    | down      | upkeep          | 0 (sacrifice)                       |
| Saga      | up        | precombat main  | final chapter (resolves, sacrifice) |

Suspend, Vanishing, and Fading all trigger at _your own upkeep_. A Saga
gains its lore counter as _your own precombat main_ begins instead — a
different step, and one step later in the turn — and each chapter ability
fires the instant the lore count reaches that chapter's number, not only at
the final one. Next Turn runs both steps, in that order, as one action; see
[How it works](#how-it-works).

Because Fading and Saga don't use time counters, they're never offered as
targets for the Time Travel keyword action or counted toward Rose Tyler's
Bad Wolf trigger — only Suspend, Vanishing, and Rose's own counters are.

Anything else is a **Custom** counter: name it, pick a direction, and
optionally give it a target. That covers age counters (As Foretold) or any
other one-off this app doesn't recognize by name — you tell it the counter
type and direction instead of it guessing wrong. The increment option
exists here specifically because Time Travel can _add_ a time counter to a
Suspend or Vanishing card, not just remove one, so the data model has to
allow it even though neither built-in decrement mechanic moves that way on
its own. A Custom counter is _not_ offered to Time Travel or Bad Wolf,
since the app has no way to know whether a given Custom counter is
actually a time counter (Rose's own counters are handled separately, in
her commander modal, specifically because hers are).

**Not covered on purpose:** every other counter type in Magic (+1/+1,
loyalty, charge, level, and so on) besides the four above. This is a _time
counter and Saga_ tracker, matching what this deck needs — not a
general-purpose counter tracker.

### About the decklist scan

This environment has no network access to Scryfall, so oracle text can't be
fetched directly — but web search access became available partway through
building this app, which made it possible to verify some of what was
previously just an educated guess. Cross-checked against multiple
independent sources (MTG Wiki, Card Kingdom's mechanics writeup, and
Scryfall's own `keyword:"time travel"` index):

- **The Tenth Doctor's** real ability is confirmed: _"Whenever you attack,
  exile cards from the top of your library until you exile a nonland card,
  then put three time counters on it. If it doesn't have suspend, it gains
  suspend."_ Plus _"Timey-Wimey — {7}: Time travel three times. Activate
  only as a sorcery."_ The quick "Suspend a card via an effect" action is
  the right shortcut for the first ability, and Time Travel now exists as
  its own feature for the second — with a one-tap shortcut into it,
  pre-set to three passes, from his commander tax modal.
- **Rose Tyler's** ability is confirmed: _"Rose Tyler gets +1/+1 for each
  time counter on it. Bad Wolf — Whenever Rose Tyler attacks, put a time
  counter on it for each suspended card you own and each other permanent
  you control with a time counter on it."_ Her commander tax modal tracks
  those counters directly, with a "Rose attacks" action that counts the
  board for you.
- **Commander tax** (rule 903.10) is confirmed as +{2} per previous cast
  of that specific commander from the command zone this game, tracked
  independently for each of the two commanders — implemented as-is.
- **Wibbly-wobbly, Timey-wimey** and **Time Beetle** also confirmed to use
  Time Travel — the former as a spell ("Time travel. … Draw a card."), the
  latter off combat damage.
- **The Girl in the Fireplace** is a Saga: chapter I creates a 1/1 white
  Human Noble creature token with vanishing 3 (damage-prevented); chapter II
  creates a 2/2 white Horse token; chapter III triggers Time Travel on
  combat damage. The chapter I token is the reason this app supports
  tracking tokens at all — see "Create a token" above.
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
