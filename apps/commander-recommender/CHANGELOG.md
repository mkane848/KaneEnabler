# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and version numbers follow [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`, where MAJOR is a breaking change to how the app is used,
MINOR is a new capability, and PATCH is a fix with no new capability.

## [Unreleased]

## [1.7.1] — 2026-08-01

### Fixed

- **The recommendation response was 12 MB, sent uncompressed.** Two separate
  causes, both measured before anything was changed — see
  `docs/response-size.md`.
  - There was no compression middleware at all. The browser asked for gzip;
    the server answered with 12,224,814 uncompressed bytes.
  - Each cited card was serialized once per commander that cited it. A cited
    card is by definition one of *your* cards, so one 30-card list produced
    **26,618 card entries backed by 28 distinct cards** — 84% of the payload.
    They are now sent once and cited by position, and put back together at
    the client's API boundary, so nothing in the UI changed.

  A 12.22 MB response is now 2.88 MB of JSON and **0.25 MB on the wire**, 49×
  smaller. The other two test lists came in 25× and 40× smaller. Server-side
  pagination was considered and rejected: it would have meant degrading the
  filter bar, which needs the whole result set to count and offer its options,
  to solve a problem two smaller changes solve outright.

## [1.7.0] — 2026-08-01

### Fixed

- **Cards written down the way people actually write them now match.** A card
  stored as "Adventurous Eater // Have a Bite" was only findable by that full
  joined name. Single-face matching existed but covered just two layouts, so
  384 gameplay cards were unfindable by the name printed on them — adventure
  (166), split (137), prepare (55), and flip (26). Typing "Adventurous Eater"
  or "Gollum, Silent Slinker" now resolves. Cards whose face name is also a
  real card in its own right — "Lightning Bolt" is both a card and the back
  face of another — still resolve to the standalone card.
- **Re-skinned printings match.** "Count Dracula" is Sorin the Mirthless, and
  "You're Gonna Need a Bigger Boat" is Abrade. These alternate names live on
  the printing rather than the card, so the bulk data has none of them; 602 of
  them, covering 428 cards, are now indexed.
- **Card relationships were being built on a broken vocabulary, and 37% of
  them were wrong.** Three separate causes, all found by checking real lists
  against the new deck summary rather than by reading code:
  - Non-creature subtypes were read as creature types. "Battle — Control
    Point" made *Control* a creature type, so every card saying "creatures you
    control" registered as caring about Control Kindred — a 30-card
    aristocrats list came back with a 14-card "Control Kindred" theme.
  - A creature card's subtypes still are not all creature types, and are not
    positionally separable: "Artifact Creature — Equipment Boar" and "Kindred
    Enchantment — Lhurgoyf Aura" each carry one of each. That made Equipment,
    Aura, and Saga creature types. The vocabulary now comes from Scryfall's
    creature-type catalog rather than being inferred.
  - Joke-set type lines ("Creature — Lady of Proper Etiquette") made *of* a
    creature type. The vocabulary now describes the legal format only.

  Precomputed relationships went from 134,293 to 84,471. This was inflating
  commander scores as well as the new summary.
- **Every Equipment was counting as its own Voltron payoff**, because
  "Equipped creature gets +2/+2" is an Equipment describing its own effect. A
  20-card Equipment pile read as a complete Voltron deck while lacking any
  reason to be stacking Equipment at all. A payoff is now a card that rewards
  you for suiting up and is not itself the suit — Sram, Kor Spiritdancer,
  Sigarda's Aid, Kemba.
- **The server no longer crashes on a database that has never been imported.**
  The statement resolving card names was prepared while the module was still
  loading, against the very table `isSeeded` exists to check for — so an
  unseeded database threw `no such table: cards` at startup instead of letting
  the routes answer with the "run npm run import-scryfall" message written for
  exactly that case.
- **Having a keyword is no longer a theme.** A graveyard deck with four fliers
  in it was reporting a five-card "Flying" theme. A keyword only counts when
  something in the list grants it or triggers off it, the same "cares, not
  shares" rule the commander scoring already used. Kindred is deliberately
  exempt: being a Goblin is a plan in a way that having flying is not.

### Changed

- **Card relationships are now computed once, at import, and shared.** Which
  archetypes a card belongs to — and in what capacity — used to be derived
  on the fly, per request, scoped to whatever vocabulary the submitted list
  happened to contain. They are now precomputed into a `card_signals` table
  covering every creature type and keyword in the game, so a card's
  relationships are a property of the card rather than of what someone pasted.
  Nothing in the recommendations changes yet; this is the foundation the
  deck-theme summary and card-package suggestions are built on, and it makes
  questions like "which cards *produce* Goblins" or "which cards *reward*
  creature death" answerable directly instead of only as a side effect of
  scoring commanders.
- **The card data refresh only does work when there's new data.** Re-running
  it now compares against the published snapshot instead of guessing from the
  file's age — the old rule reused a week-old copy after Scryfall had
  published something newer, and re-downloaded 24 MB of unchanged data. A
  no-op refresh went from ~12 seconds and a 24 MB download to ~2 seconds and
  almost nothing. Deploys are unaffected: they start from an empty directory
  and build everything, as before. See `docs/card-data-strategy.md`.
- The About dialog shows when the card data was published, alongside the
  existing app version and build date.
- **Cited cards show their real mana cost**, as symbols, instead of "MV 3" —
  the pips carry the card's colors as well as its cost, which the number
  didn't. Each list is now ordered by mana value and then alphabetically, the
  way a decklist reads; cards with no mana value (lands) sort last rather
  than as zero.
- Results-per-page options are **12 / 24 / 48 / 96**, replacing 9 / 18 / 36 /
  72. All of them still fill whole rows of the grid, and the new set does so
  at four columns as well as three, so wide screens no longer end on a ragged
  row. An existing saved preference moves to the nearest new option rather
  than resetting.
- **Far fewer, better results.** A commander whose entire case was one
  archetype matched on the bare minimum of three cards is a coincidence, not
  a recommendation — and there are hundreds of them for any given list. A
  suggestion now has to show either a signal with five or more of your cards
  behind it, or more than one signal at all. On a focused kindred list that
  cut results from 1,400 to 768 while leaving every real match in place; on
  a list with no strong pattern it cut 877 near-identical suggestions to a
  short, clearly-labelled shortlist. This is a quality bar, not a cap: a list
  with genuine depth still gets everything that fits it.
- When nothing clears that bar, the results now **say so** rather than
  presenting the closest few as a confident ranking.

### Added

- **A Clear button for the card list**, behind a confirmation step, since
  nothing is saved and a mis-click would mean pasting the list again. It only
  appears when there is something to clear.
- **Type a page number** to jump straight to it, alongside the numbered
  buttons. Only shown once there are enough pages that the numbers start
  collapsing behind an ellipsis.
- **"What this list is doing"** — a summary of the strongest patterns in your
  cards, above the commander suggestions and independent of them. Each theme
  is shown as a chain rather than a count: Aristocrats needs fodder, a
  sacrifice outlet, and a death payoff, and a list with nine death triggers
  and one outlet is told exactly that. Themes with no chain to break — Goblin
  Kindred is a membership group, not an engine — are reported as a depth
  count instead, with no invented shortfall.
- **Cards that would fill the gap.** Where a chain is broken, up to fifteen
  cards that would fix it, five at a time. They are restricted to colors your
  list already plays, exclude cards you already have, and are ranked first by
  how many of your *other* themes the card also feeds — the one ranking input
  that comes from your actual list. Slots are filled across archetype
  boundaries where that is how the game works: Reanimator's graveyard-filling
  is answered by Self-Mill cards, because nothing in Reanimator itself fills
  a graveyard.
- A **★ "often the missing piece"** marker on the slot each archetype tends to
  lack. Explicitly labelled as low confidence — it is a judgement call, not a
  measurement, and it says so on hover. It will be revisited once there are
  enough real lists to check it against.

## [1.6.0] — 2026-07-30

### Fixed

- **The Scryfall bulk import was completely broken**, which also broke fresh
  deploys, since a deploy rebuilds the card database from scratch. Scryfall
  changed the shape of their bulk-data listing: `download_uri` (an
  uncompressed JSON array) and `size` are gone, replaced by
  `jsonl_download_uri` — gzipped, newline-delimited JSON — and
  `compressed_size`. Reading the old field names yielded `undefined`, so the
  fetch died with "Failed to parse URL from undefined" after reporting a
  download size of "~NaNMB". The download is now streamed and gunzipped
  straight to disk instead of being buffered whole, and the importer reads
  JSONL line by line. If Scryfall renames the field again, the failure is now
  an explicit message naming the fields it did find.

### Changed

- **Synergy detection now understands context, not just vocabulary.** A
  signal used to be one regex applied identically to your card and to the
  candidate commander, so two cards "synergised" when the same words appeared
  in both. That measured lexical overlap rather than synergy. Signals are now
  structured — what object they act on, what event links them, and in what
  capacity each card participates (it *is* the resource, *produces* it,
  *consumes* it, *rewards* it, or *amplifies* it). What this changes in
  practice:
  - **A commander has to actually care.** Sharing a property is never enough.
    Being a Frog Horror doesn't make one a Horror commander, and a card's
    *name* is no longer evidence of anything — Gitrog, Horror of Zhava was
    matching Horror kindred purely because "Horror" is in its name, while its
    abilities are entirely about lands. 267 Commander-eligible cards in the
    current card data have a creature type that reaches their rules text only
    through their own name.
  - **Keywords alone are no longer a synergy.** Two cards both having Trample
    means nothing; a commander that *grants* trample to your team, the way
    Craterhoof Behemoth does, is the real signal.
  - **Payoffs restricted to a subtype only count that subtype.** A commander
    that reanimates Slivers specifically feeds "Reanimator (Sliver)", and the
    non-Sliver creatures in your graveyard no longer count toward it.
  - **Cards land in the right archetype.** A fetch land like Arid Mesa
    supports Lands Matter rather than Aristocrats — it sacrifices itself and
    triggers no creature-death ability — and Aristocrats now requires
    creatures rather than any sacrifice at all.
  - **Token makers count as kindred cards.** Krenko's Command is a Goblin card
    despite being a Sorcery with no creature type of its own.
  - **Reminder text no longer creates signals.** It restates a keyword the
    card already has and is never an ability of its own — Sliver
    Gravemother's Encore reminder text ends "They gain haste", which read as
    the card granting haste to your whole team.
- New archetypes: Reanimator, Self-Mill, Mill (Opponents), Voltron, Go-Wide
  Combat, and Lands Matter. Self-mill and opponent-mill are deliberately
  separate — one is setup, the other is an attack. The loose `graveyard`,
  `artifact` and `enchantment` themes are gone; they matched removal and
  hate as readily as the synergy.

## [1.5.0] — 2026-07-28

### Fixed

- Double-faced cards whose *back* is a legendary creature are no longer
  offered as commanders. Westvale Abbey // Ormendahl, Profane Prince was
  being suggested because Scryfall's combined type line for it reads
  "Land // Legendary Creature — Demon", which satisfies a naive
  Legendary-plus-Creature check off the back face. Eligibility is now judged
  on the front face alone, which is all a card has outside the battlefield
  (CR 712.4) — in the command zone that card is a non-legendary land. The
  same reading fixes flip cards (Bushi Tenderfoot is not legendary; only its
  flipped side is) and adventures. Split cards deliberately stay joined,
  since they are one face with both halves' characteristics in every zone.
  **Takes effect on the next card-data import** — a deploy rebuilds the
  database from scratch, so it self-heals there; locally, re-run
  `npm run import-scryfall`.

### Changed

- Scoring now rewards **depth of synergy**, not just how many themes a
  commander matches. Previously every signal contributed the same share of
  a commander's castable pool, so a wide spread of shallow matches could
  out-score one deep, specific synergy — the opposite of what actually makes
  a commander a good fit. Two changes: a signal citing 5 or more distinct
  cards now earns a flat bonus per card beyond that floor, which (unlike the
  existing density term) isn't diluted by how large the rest of the list is;
  and each additional signal past a commander's strongest is discounted, so
  piling up weak matches no longer out-accumulates real focus. Also, when a
  named archetype (e.g. Aristocrats) fires, its component themes (Sacrifice,
  Death Triggers, …) still show in "Why this commander?" but no longer add
  their own score on top of the archetype's — they're the same cards under
  a second label, and were being paid for twice.
- Suggestions show their **raw score** instead of an "X% match". The
  percentage was relative to whatever was on screen and read as a confidence
  it never measured; while the scoring model is being tuned, the actual
  number is the more useful thing to see. The written explanation behind it
  is unchanged.
- The **Bracket estimate is hidden** for now — no badge, note, filter row,
  or card-detail row — while the calculation is reworked. Game Changers are
  still flagged, now with a count covering both the commander and the
  matching cards in your list. The estimate is still computed and still on
  the API response; only its display is switched off.
- American spelling ("color") throughout, replacing "colour".

### Added

- **Double-faced cards flip.** The full-art view now offers a Flip control
  for transform and modal DFCs, showing the back face and its name, the way
  Scryfall and the deckbuilders do. Reopening a card starts on its front
  again.
- **Jump straight to a page.** Pagination shows numbered pages alongside
  Previous/Next, for both the suggestion grid and each combo list. Long runs
  collapse behind an ellipsis so a few hundred results don't render a row of
  numbers wider than the screen.
- **Sort in either direction.** An arrow beside the sort control reverses
  whichever mode is selected.

## [1.4.0] — 2026-07-27

### Added

- No cap on how many commanders can be suggested — every candidate that
  clears the matching bar comes back, not just the top 30. How many show
  per page is now yours to set via a "Show" control next to Sort, and the
  choice is remembered for next time.
- Each cited card's name in "Why this commander?" shows its art on hover
  (or on tap, on a touch screen) without leaving the list, and its mana
  value alongside the name.
- Commander Spellbook combo results — "Ready to go" and "Almost there" —
  now page independently instead of listing everything found at once, with
  their own "Show N per page" control. The whole results block can be
  collapsed back down after fetching without losing what was found;
  reopening it doesn't ask Commander Spellbook again.

### Fixed

- The Sacrifice theme required only the bare word "sacrifice" anywhere in a
  card's text, so every fetch land in the format counted toward
  creature-sacrifice synergy — a fetch land's own text reads "Sacrifice
  Arid Mesa: …", sacrificing only itself, by name, as the cost for an
  unrelated effect. The pattern now requires an indefinite object right
  after the word ("sacrifice **a** creature", "sacrifice **another**
  artifact", "sacrifice **it**"), which a self-referential cost never has.
- "Card Draw" is no longer detected as its own theme. Almost every deck
  draws cards somehow, so it was adding a "Themes: Card Draw" tag to
  nearly anything capable of drawing one rather than pointing at an actual
  pattern in the list.

## [1.3.0] — 2026-07-27

### Added

- The About dialog now shows when the app was last updated, alongside the
  version number. Taken from the build's commit date, not hand-maintained,
  so it can't go stale the way a manually-typed date would.

### Changed

- A creature type now only counts if the commander's own rules text cares
  about it. Sharing a type was enough before, so a list with eight Humans
  in it collected a "Human" tag on every commander that happened to be a
  Human, whether or not it did anything with them. Krenko counting
  Goblins, Lathril tapping Elves, and Edgar Markov triggering on Vampire
  spells all still match; Silas Renn, whose text never mentions Humans,
  no longer does. A commander need not *be* the type it cares about —
  Ghoulcaller Gisa is a Human Wizard and one of the best Zombie
  commanders there is. Irregular plurals are handled, since Lathril's
  text says "Elves", never "Elf".
- "Tribal" is now "Kindred" throughout, matching the current wording on
  cards.
- Both halves of a Partner/Background pair are named together in one
  heading. Each face used to render its own full title, so the second
  name sat below a type line and a whole rules-text box and reading
  "which two cards is this?" meant scanning the length of the card.
- The color filter's hint no longer says "require". Including White does
  not require white — it permits it, and a commander shows when its whole
  color identity fits inside the colors you allowed, which is why
  allowing White and Black still lists mono-black commanders. Brackets and
  themes genuinely do require, and keep their original wording.
- Each group inside "Why this commander?" — every kindred type, theme, keyword,
  and the Game Changers list — is now collapsible and starts collapsed.
  Expanding the panel used to unroll every supporting card at once, which
  pushed the page out far enough that the themes themselves were hard to
  take in. The reasoning now opens as a short list of headings with their
  counts, and any one group opens on click.

## [1.2.1] — 2026-07-27

### Fixed

- Color identity no longer scores anything by itself. It used to open the
  formula with `coverageRatio * 50` — the largest single term — which a
  five-color commander banked in full for free, so it could out-rank a
  mono-color commander that matched your list twice as well before any
  synergy was weighed. Identity now only decides which cards are eligible
  to count.
- Signals are scored by density instead of a flat count: each tribe, theme,
  keyword, and archetype is worth the share of that commander's playable
  cards standing behind it. A signal every playable card supports is worth
  its full weight; one that half of them support is worth half. Scoring
  now rewards a focused fit rather than color reach, and a deep theme no
  longer counts the same as one scraping the three-card minimum.

## [1.2.0] — 2026-07-26

### Changed

- Submitted lists are now read as a legal Commander deck rather than as a
  pile of cards: extra copies beyond what the singleton rule (903.5b)
  allows are ignored when scoring. Basic lands, "any number of cards
  named …" cards, and "up to N cards named …" cards keep their copies, all
  read off the card's own text and type line. Repeats of one card spread
  across several lines are merged first, so a card listed three times can
  no longer pass for three different cards supporting a theme. Anything
  trimmed is reported as "N extra copies ignored" beside the matched
  count.
- A theme, tribe, or keyword now needs at least **three** supporting cards
  to count, measured after narrowing to that commander's own color
  identity. Below that it is dropped from the recommendation engine
  entirely, not just hidden — it no longer contributes to a commander's
  score, and no longer appears in "Why this commander?". A group of one or
  two cards is noise, and scoring on it ranked commanders on evidence too
  thin to check.
- Result filters are now include/exclude rather than include-only: tap a
  chip once to require it, again to exclude it, again to clear it. This
  applies to colors, Colorless/Multicolor, Brackets, and themes alike.
- Colorless and Multicolor moved out of their own row and into the Colors
  row alongside the WUBRG pips, since they describe a color identity too.

### Added

- Each suggestion shows a match score relative to the best match currently
  on screen, with a hover/tap tooltip breaking down what drove it.

### Removed

- `@radix-ui/react-toggle-group`, now unused — the filter chips need a
  three-state cycle that a toggle group does not model.

## [1.1.0] — 2026-07-26

### Added

- Partner, Partner—[text], Partner with [Name], Friends forever, Choose a
  Background, and Doctor's companion are now recognized: a commander with
  one of these abilities appears both as a solo suggestion and as one
  suggestion per valid pairing, on the same ranked list.
- A non-functional "EDHRec" placeholder button next to "Find combos" on
  each suggestion, reserving the spot for a future one-time lookup. No
  EDHREC data is fetched.
- Whole-card art preview: tapping a commander's image, or any supporting
  card cited in a "Why this commander?" explanation, opens that card at
  its own proportions.
- A sort control (best match, or color/name/mana value) alongside the
  existing filters.
- "Copy list" and "Download .txt" export the current suggestion list.
- Suggestion tags and filter options (Tribal/Themes/Keywords, and the
  filter bar's theme chips) now only count a theme or tribe if it still
  has supporting cards after narrowing to that commander's color
  identity, rather than showing one with nothing behind it.
- Layout now keeps clear of notches, the home indicator, and a sliding
  mobile URL bar on phones.

## [1.0.0] — 2026-07-26

First versioned release. This project had been under active development
without version numbers before this point; this entry covers the app as it
stands today, not a chronological history of how it got here.

### Added

- Paste or upload a card list; get back legal Commander suggestions scored
  against it, each with an estimated power Bracket.
- Deck-list parsing for the formats real sites export: Moxfield, Archidekt,
  TCGplayer Mass Entry, Arena, and MTGO, including quantities, set codes in
  either bracket style, foil/commander markers, and MTGO's `SB:` prefix.
- Double-faced cards match on either face's name alone, not just the full
  combined name.
- A "Why this commander?" explanation for every suggestion: which of your
  cards support it and why, not just a score.
- Synergy detection across shared creature types, shared keywords (e.g. a
  Flying-heavy list), named archetypes (Aristocrats, Voltron, Spellslinger),
  and a set of hand-picked themes (sacrifice, graveyard, tokens, artifacts,
  enchantments, planeswalkers, doublers/multipliers, and more).
- Commander Spellbook combo lookup, run only when you explicitly ask for it
  on a suggestion — never automatically.
- Filtering by color (with proper subset matching — picking Black and Green
  shows what you could actually build in Golgari), by Colorless or
  Multicolor, by Bracket, and by theme; pagination; and per-suggestion
  dismissal.
- A full card-detail view (art, mana cost, complete rules text,
  power/toughness, Scryfall link) for any suggestion whose text doesn't fit
  on the card face.
- Real MTG presentation conventions: WUBRG color ordering, named color
  identities (Dimir, Golgari, Boros, ...), and mana symbols.
- A collapsible card-list panel that tucks itself away once results load.
- An About panel (this app, in the navbar) with version info, data-source
  credits, and a link to the repository.

### Notes

- Card and legality data comes from [Scryfall](https://scryfall.com)'s bulk
  data, re-imported on every deploy.
- Combo data comes from [Commander Spellbook](https://commanderspellbook.com),
  queried live and only on request.
- Bracket estimates are a heuristic based on Game Changer count, not the full
  official Bracket System — they don't model combo speed, mass land
  destruction, or extra-turn density.

[Unreleased]: https://github.com/mkane848/HardlyKnowHer/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mkane848/HardlyKnowHer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mkane848/HardlyKnowHer/releases/tag/v1.0.0
