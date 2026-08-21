# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/).

## [1.5.1] - 2026-08-21

### Fixed

- **The undo toast could dismiss early if you removed two same-named cards in
  quick succession.** Its auto-dismiss timer restarted only when the removed
  card's *name* changed, not on each removal — two copies of the same card
  (or two same-named tokens) removed within the 6-second window shared one
  timer, cutting the second toast's undo window short. Now keyed on the
  removed card's own instance instead.
- **An Adventure card's mana cost showed both halves' pips joined together**
  (e.g. Bonecrusher Giant's creature cost plus its Adventure spell's cost, as
  one run of pips) — the same underlying `@mtg/card-model` fix as the
  commander recommender's own CHANGELOG entry for this; time-counters' card
  catalog is rebuilt from the same shared field reader.
- **The sign-in menu could get stuck loading forever after a network hiccup**
  — `@mtg/profile`'s `useAuth` had no `.catch` on its initial session check,
  so a rejected `getSession()` call left the account menu hidden instead of
  degrading to signed-out.

## [1.5.0] - 2026-08-18

### Added

- **Links to the platform's other tools, from inside this app for the first time** — Home and the
  Commander recommender now show up in the header via `@mtg/ui`'s new shared `NavBar`.

### Changed

- The header's theme toggle and sign-in menu moved into the new shared `NavBar` (a thin strip above
  the existing game console); the turn tracker, commander banner, Game Log/About/New game controls
  stay exactly where they were. The Doctor Who/Claude theme toggle behaves identically — the whole
  page, NavBar included, still re-themes when it's flipped.
- The sign-in menu (`AccountMenu`/`AuthDialog`) now comes from `@mtg/profile` instead of this app's
  own copy — one implementation shared with the other two tools instead of three hand-maintained
  ones. No behavior change.

## [1.4.0] - 2026-08-18

### Added

- A shared sign-in menu in the header, backed by the same Supabase project
  as the platform's home page and commander recommender — one account works
  across every tool now, not just the recommender. This app has no
  account-gated preferences of its own yet; the menu just keeps sign-in
  state consistent everywhere.

## [1.3.2] - 2026-08-18

### Fixed

- **Casting a commander, ticking a counter, or any other action anywhere in
  the app re-scanned the ~18k-card catalog for both commanders' art.**
  `useCommanderCards` built a brand-new result object and ran two full
  linear scans (`findCardByName`, once per commander) on every render,
  with no memoization — so any state change anywhere in the app, not just
  ones that touch commander data, paid that cost again. The header's
  commander portraits (`CommanderBanner`) independently duplicated the
  same unmemoized scan a second time. Both now go through one memoized
  `useCommanderCards()`, which only re-scans when the catalog itself
  changes (once, when it finishes loading) instead of on every render.
  Also memoized the two arrays `App.tsx` derives every render
  (`commanderFieldCards`, `timeTravelTargets`).

## [1.3.1] - 2026-08-17

### Fixed

- **Typing in the Add Card search box could lag on a fast typist.**
  `searchCards` scanned the full ~16k-card catalog on every keystroke,
  collected every substring match, sorted the whole match set, and only
  then took the top 8 — repeating that full scan-and-sort for every
  keystroke, including ones already superseded before their scan finished.
  The catalog is written out already alphabetized, so scanning it in order
  and bucketing into "starts with" vs. "merely contains" produces each
  bucket in the right relative order without a separate sort, and the scan
  now stops as soon as the anchored bucket alone fills the result limit.
  The search box itself still updates every keystroke instantly
  (`useDeferredValue` only defers the search computation, not what's shown
  in the input), so React can drop a stale in-flight scan for the next one
  instead of queuing every keystroke's scan behind the last.

## [1.3.0] - 2026-08-17

### Added

- **A render crash no longer white-screens the app mid-game with no way
  back.** Nothing caught an unexpected throw during render — the whole
  screen unmounted with nothing in its place. The app is now wrapped in an
  error boundary (the new shared `@mtg/ui` `ErrorBoundary`) that shows a
  recovery screen instead: "Try again" re-attempts the render, and "Reset
  game" clears the save and reloads if the same crash keeps happening. The
  save itself is untouched unless you choose that second option.
- **Removing a tracked card can be undone.** The `×` button is small and
  easy to tap by accident, and until now there was no way back once a card
  was gone. A brief "removed" prompt with an Undo action now appears after
  every removal — from the card tile or from resolving a card in the Next
  Turn summary — and stays up for a few seconds before dismissing itself.

### Fixed

- **A corrupted save could crash the app on load.** Loading only checked
  that `turn` was a number and `cards` was an array; nothing validated an
  individual tracked card, so a save containing something like `cards:
[{}]` (hand-edited, or corrupted some other way) passed the check and
  then crashed `CardTile` on a missing field. Every card is now validated
  field-by-field on load; one that doesn't pass is dropped (with a console
  warning) rather than taking the rest of the save down with it.
- **The counter steppers and remove button were smaller than Apple's and
  Material's touch-target guidelines** (24×24 and ~20×20 against 44×44/
  48×48), on the most-tapped controls in the app. Their visible size is
  unchanged — enlarging them would have broken the compact card grid — but
  the actual tappable area around each one is now at least 44×44, using an
  invisible expanded hit area rather than a bigger button. Also wired up
  `env(safe-area-inset-*)` (declared via `viewport-fit=cover` but never
  actually read anywhere): the header, the add-card and card-list panels,
  and the footer now keep clear of a notch or a home indicator instead of
  sitting under one.
- **The sticky header rendered in the Claude theme's background color even
  under the Doctor Who theme.** It was hardcoded to
  `rgba(20, 22, 43, 0.92)` — Claude's `--color-bg` at 92% opacity — instead
  of reading the active theme's token, contradicting the app's own rule
  that every component reads color from CSS custom properties. Now reads
  `--color-bg` through `color-mix()`, so it tracks whichever theme is active.

## [1.2.1] - 2026-08-16

### Fixed

- **Fading permanents were flagged "ready to sacrifice" one upkeep early.**
  Rule 702.32b sacrifices a Fading permanent on the upkeep a fade-counter
  removal _fails_ — one upkeep after the count reaches 0 — not the upkeep
  it gets there, unlike Vanishing. The card now sits at 0 for one full turn
  before the resolve callout appears, on both the tile and the Next Turn
  summary. A manual count edit that restores counters above 0 (via the
  stepper or the exact-count field) un-does that flag if it was set.
- **Manually editing a Saga's lore counter could silently skip chapter
  abilities.** Setting or stepping the count with the stepper or the
  exact-count field never checked which chapters the change crossed, so
  jumping from 0 to 2 fired neither chapter I nor II — only chapter III
  would fire later, and never again after that. Manual edits now catch up
  every chapter ability the jump crosses, the same way Next Turn's
  precombat-main step already did, and the Game Log entry names which
  chapter(s) triggered. Moving the count back down still can't un-trigger
  a chapter already recorded.
- **Bad Wolf could under-count suspended cards.** Rose Tyler's trigger has
  two separate clauses — "each suspended card you own" (unconditional) and
  "each other permanent you control with a time counter on it" (needs a
  counter still on it) — collapsed into one check that required a counter
  either way. A suspended card that already lost its last counter now still
  contributes; a Vanishing permanent in the same state correctly doesn't.
- **Time Travel offered a suspended card as a target even after it had
  already been cast.** The target list checked mechanic only, not whether
  a counter was actually left — once the last one's removed, the card has
  already resolved (rule 702.61) and isn't a legal Time Travel target,
  which the −1 button already silently assumed (disabled at 0) while +1
  stayed clickable. Both Suspend and Vanishing cards now drop off the
  target list entirely once they're out of counters, instead of sitting
  there with only half their buttons disabled.
- **A modal double-faced card's mana cost could show up to five pips
  instead of one.** `scripts/fetch-card-data.mjs` fell back to joining
  both faces' mana costs with " // " when a card had none at the top
  level — which every modal DFC doesn't, since it's cast as one face or
  the other, never both. `"{1}{G} // {3}{G}{G}"` then read as five
  separate symbols to the mana-cost renderer. Now takes the front face's
  own cost only, the same front-face principle already used for commander
  eligibility elsewhere in this project's sibling app. Takes effect on the
  next `pnpm run fetch-cards`; the committed catalog is unaffected until
  then, since this environment can't reach Scryfall's bulk data.
- **The five modal panels (Commander tax, Time Travel, Game Log, Turn
  summary, About) now trap focus, restore it on close, and close on
  Escape.** Each was a hand-rolled backdrop and dialog pair that asserted
  `aria-modal="true"` without enforcing it: Tab could reach the page behind
  an open dialog, closing one left focus stranded with nowhere to go, and
  there was no keyboard way to dismiss one at all. All five now share
  `@mtg/ui`'s `Modal` component (built on Radix Dialog), which also adds
  scroll lock behind an open dialog — previously the page could scroll out
  from under it.

## [1.2.0] - 2026-08-11

### Added

- **Casting a commander now shows it as a card on the board**, right
  alongside everything else being tracked, until it's sent back to the
  command zone (a one-tap action from its field tile or the tax modal).
  Returning to the command zone never resets the tax (rule 903.10) —
  that persists for the whole game regardless of zone changes.

### Changed

- **The board is now one flat grid instead of a section per counter
  mechanic.** Each mechanic's own header + grid was wasting a lot of
  vertical space on mobile, especially with only a card or two in a
  section. Cards are still sorted by mechanic and urgency, but the sole
  cue distinguishing them now is each tile's colored top accent and badge
  (a new violet for a commander's field tile, the existing per-mechanic
  colors for everything else) instead of a row break.

## [1.1.1] - 2026-08-11

### Fixed

- **Render deploys were failing at the `fetch-cards` build step.** Scryfall
  retired the plain-JSON `download_uri` on its bulk-data index in favor of
  a gzip-compressed JSON-Lines `jsonl_download_uri`, so the catalog build
  was fetching `undefined` and crashing before `vite build` ever ran.
  `scripts/fetch-card-data.mjs` now reads the new field and decompresses/
  parses the JSON-Lines file; verified against the live Scryfall API
  (18,407 Jeskai-legal cards written).

## [1.1.0] - 2026-08-11

### Added

- **Commander tax tracking.** Tap either commander's portrait (or name) in
  the header to open a per-commander tracker: how many times it's been
  cast from the command zone this game and the resulting tax (rule
  903.10 — +{2} per previous cast), with a one-tap "Cast from the command
  zone" action.
- **Rose Tyler's Bad Wolf counters**, tracked in that same modal: her own
  time counters (she's +1/+1 per counter) with manual +/− controls, plus a
  "Rose attacks" action that counts this game's tracked Suspend cards and
  Vanishing permanents for you and applies that many counters in one tap,
  instead of counting the board by hand every combat.
- **The Tenth Doctor's Timey-Wimey** shortcut in his modal, opening Time
  Travel pre-set to three passes.
- **Saga support** as a full mechanic: enter chapter I/II/III (or more)
  text when adding a Saga, and each chapter ability now triggers
  individually — with its own text shown — exactly when its lore count is
  reached, not just at the final chapter. A Saga's tile shows its current
  chapter as a standing reference, not just a one-time popup.
- The turn cycle is now rules-accurate under the hood: Next Turn runs
  **upkeep** (Suspend/Vanishing/Fading count down) and **precombat main**
  (Sagas gain a lore counter) as two ordered steps in one action, and the
  summary groups what happened by step.

### Fixed

- **Time Travel no longer offers Fading or Saga cards** as targets — Fading
  uses fade counters and Saga uses lore counters (rules 702.32 and Saga's
  own rules), neither of which is the time counter Time Travel and Bad Wolf
  actually care about. Only Suspend, Vanishing, and (once she has any) Rose
  Tyler's own Bad Wolf counters are eligible now.

## [1.0.0] - 2026-07-26

First versioned release. The app itself predates this file — Suspend,
Vanishing, and Fading tracking, the virtual-tabletop card grid, Next Turn
and Time Travel, the Game Log, the Doctor Who/Claude themes, and token
support were all already in place. This release adds:

### Added

- An **About** link in the header, opening a modal with the app version,
  credits (Scryfall card data, the mana-font project, Google Fonts, built
  with Claude), and links to the source repo and this changelog.
- Semantic versioning, tracked here from this point forward.
