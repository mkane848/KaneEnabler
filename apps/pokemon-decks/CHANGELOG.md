# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-27

### Added

- **Decks from your collection.** Paste a Pokémon TCG Live export or a plain card list and get the
  decks you can build toward, ranked by how much of each you already own. Each deck shows its
  evolution line, Energy type, a score breakdown, the full 60-card list and the cards still to
  find, and copies out as a list the app reads straight back in.
- **Build around a Pokémon.** Search for a main attacker and get a 60-card list around it. A saved
  collection steers the build toward cards you already own.
- **Four formats.** Standard, Expanded, Gym Leader Challenge and Unlimited. Every list is checked
  against `@ptcg/rules` (deck size, copy limits, ACE SPEC/Radiant/Prism Star limits, GLC's
  singleton, single-type and Rule Box rules, format legality).
- Card data is a committed snapshot of TCGdex's card database, refreshed monthly by a workflow that
  opens a PR. The app never contacts TCGdex or any other card service while you use it.
