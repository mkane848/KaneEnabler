# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/).

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
