# Per-card recommendation coverage: implementation plan

A submitted card list is a **pool**, not a deck-in-progress. This document says what to change so
every card in a pool gets some commander recommended for it, in what order, and how to know it
worked. Nothing here has been implemented — this is the brief.

The companion reading is [`commander-recommender.md`](./commander-recommender.md) (the app's own
handoff doc, including the scoring model this plan modifies) and
[`archetypes.md`](./archetypes.md) (what the signals being counted actually mean).

## The bug

Uploading a 30-card grab bag — a pack, or a few binder pages — that contains **Tergrid, God of
Fright**, then clicking the **Black** colour filter, returns **zero** commanders.

The reproducing list:

```
1 Bleachbone Verge [DFT] 250
1 Dracula the Voyager - Edgar, Charmed Groom [VOW] 341
1 Faldorn, Dread Wolf Herald [CLB] 647
1 Hallowed Fountain [ECL] 265
1 Hare Apparent [FDN] 15
1 Hare Apparent [FDN] 15
1 Isshin, Two Heavens as One [NEO] 224
1 Jace, Memory Adept (Deluxe Commander Kit) [UMP] 2
1 Jetmir's Garden [SNC] 250
1 Kodama of the West Tree [NEO] 199
1 Krenko, Mob Boss (Anime Borderless) [RVR] 430
2 Living End [TSR] 121
1 Lush Portico (Borderless) [MKM] 327
2 Michiko Konda, Truth Seeker [J22] 215
2 Otawara, Soaring City [NEO] 271
3 Persistent Petitioners [RVR] 53
1 Persistent Petitioners (Retro Frame) [RVR] 316
1 Professional Face-Breaker [SNC] 116
1 Rhythm of the Wild [RNA] 201
1 Rhythm of the Wild [RVR] 217
2 Shadowborn Apostle [2X2] 89
2 Shroofus Sproutsire (Anime) [J25] 54
1 Steam Vents [ECL] 267
1 Tamiyo, Inquisitive Student [MH3] 242
1 Temple Garden (Retro Frame) [RVR] 414
1 Tergrid, God of Fright (Showcase) [KHM] 307
1 The Locust God [MOC] 335
1 Vengevine [SLD] 1078
1 Voja, Jaws of the Conclave [PRE] 432
1 Windswept Heath [MH3] 235
```

Two independent defects compound.

### 1. The gates are absolute counts over an identity-narrowed pool

`routes/recommend.ts:54` builds a single `CollectionProfile` from every matched card, then
`services/synergy.ts`'s `scoreCommanders` narrows the list to cards each candidate could legally
play (`fitsIdentity`, `synergy.ts:403`) **before** applying three gates:

| Gate                  | Where             | Requirement                                        |
| --------------------- | ----------------- | -------------------------------------------------- |
| `MIN_SIGNAL_COUNT`    | `synergy.ts:325`  | 3 distinct citable cards per signal                |
| `definingRequirement` | `signals.ts:2568` | enough of those play the archetype's defining role |
| `isMeaningfulMatch`   | `synergy.ts:557`  | 2+ signals, **or** one signal citing 5+ cards      |

For the list above, the cards a **mono-black** commander can legally cite are exactly four:
Tergrid, Living End, Shadowborn Apostle, and Windswept Heath (colourless identity). Four is below
`DEEP_SIGNAL_COUNT`, so the depth route is arithmetically impossible; and two separate 3-card
signals cannot be drawn from four cards sharing no archetype. **No mono-black unit reaches
`scored` at all** — and the same holds for every narrow identity against a rainbow pool. Only wide
(3+ colour) commanders accumulate enough absolute count, so every result is wide.

Note the density term (`synergy.ts:466`) actually _favours_ narrow commanders — a 3-of-4 signal is
density 0.75. It is purely the absolute gates that exclude them.

**Those gates stay.** They exist for a documented reason: on a real graveyard list, 877 commanders
came back matching one archetype on the same three cards, all scoring 3.3–5.0 and genuinely
indistinguishable (`synergy.ts:541-556`). Loosening them globally reintroduces that. The fix is a
second tier underneath them, not a lower bar.

### 2. The colour filter is a client-side subset filter over that fixed set

`client/src/lib/filters.ts:70` `matchesColors` keeps a suggestion only when its identity is a
**subset** of the allowed colours, and `ResultFilters.tsx:119` renders all five WUBRG pips
unconditionally — `availableFilterValues`' computed `colors` set is never passed to the component.
So the Black pip is always clickable into a possibly-empty state, and under subset semantics it
also drops Isshin (RWB) and Edgar (WB), not merely the absent mono-black entries. The filter has no
way to re-ask the server "what is the best black deck in this pool?"; it only removes rows from a
set that never contained one.

### 3. A name-resolution miss in the same list

`1 Dracula the Voyager - Edgar, Charmed Groom [VOW] 341` does not resolve. `parseList.ts` strips
`[VOW] 341`, leaving `Dracula the Voyager - Edgar, Charmed Groom`, which matches no exact name, no
face name, and no flavour name — the printed flavour name is `Dracula, Voyager`, so the existing
`card_flavor_names` rung (`db.ts:74`) misses it too. A WB commander the player owns silently lands
in `notFound` and never enters the pool.

## Decisions already taken

Confirmed with the repo owner before this plan was written:

- **Colour pips change to "touches this colour."** Include keeps any commander whose identity
  intersects the allowed set. Consequence to carry through the UI: a colourless commander no longer
  survives a colour include, because it touches nothing — the existing `colorless` chip in the
  `colorCategory` facet is how you ask for those, and the hint text must say so.
- **Coverage picks render as a separate labelled tier below** the confident ranking, so a weak pick
  never reads as a strong one.
- **Coverage includes** commanders already in your list, and relaxed-bar narrow picks.
- **Deliberately out of scope:** a UI listing cards that remain uncovered after both tiers. The
  owner chose not to surface these. Tests still assert coverage; the app just doesn't report the
  residue.
- **The `FlavourName - Real Name` export shape gets fixed.**

## Phase 1 — cited-card tracking (`server/src/services/synergy.ts`)

Two small changes, no behaviour change on their own.

1. Add `citedOracleIds: string[]` to the internal `CommanderSuggestion`. Build it from the
   `supporters` arrays that already exist at `synergy.ts:433-456`, before they are mapped through
   `toSupportingCard`.

   This is the "which of my cards does this commander actually **want**" relation, and it is
   distinct from `includedCardCount`, which is mere colour-identity fit — every card in a
   five-colour commander's identity counts toward that number whether or not it supports anything.
   Coverage must key off wanting, not fitting.

   Internal only. Do **not** put it on the wire: `SupportingCard` carries no `oracle_id` today, and
   adding one to the DTO would grow every citation in the response — see
   [`response-size.md`](../apps/commander-recommender/docs/response-size.md) and the `cardIndex`
   dedup it documents.

2. Parameterise the gate:
   `scoreCommanders(units, profile, owned, candidateSignals, options?)` where
   `options.minSignalCount` defaults to `MIN_SIGNAL_COUNT`. Nothing else about the formula moves —
   the "scoring measures focus" tests in `synergy.test.ts` must stay green **unmodified**.

Also export `ownSignalContains` and `supporterMatches` from this module so Phase 2 can reuse the
containment relation rather than re-deriving it.

## Phase 2 — the coverage pass (`server/src/services/coverage.ts`, new)

Runs after `selectSuggestions`. Reuses `isWithinColorIdentity` (`@mtg/rules`), `unitKey`
(`partners.ts`), and the two relations exported from `synergy.ts`.

1. **Covered set** — the union of `citedOracleIds` across the selected suggestions.

2. **Tier A — commanders you already own.** Filter the already-built `units` array for units whose
   every card is in the submitted list. `owned` entries are full `CardRow`s, so
   `is_commander_eligible` and `legality_commander` are read directly with no extra query.

   Reuse `units` rather than constructing solo units by hand — that keeps a Partner pair correct
   when the player happens to own both halves (CR 702.124e; see `partners.ts`). Reason code:
   `'owned'`.

   On the reproducing list this tier alone rescues Tergrid, Isshin, Krenko, Faldorn, Voja, Kodama,
   Michiko, Shroofus, and The Locust God — nine of the thirty cards, and the one the bug report
   names.

3. **Tier B — relaxed narrow picks.** For each card still uncovered:

   - Build a `Map<archetype, CommanderUnit[]>` index **once** from `candidateSignals`, so a card
     only considers units sharing one of its own archetypes instead of rescanning the whole unit
     pool. `scoreCommanders` already walks every unit once per request; a restricted second pass
     over a few hundred units is cheap, an unrestricted one is not.
   - Keep units that can legally play the card (card identity ⊆ unit identity) and that share at
     least one active signal with it (`hasActiveRole` + `ownSignalContains`).
   - Score that shortlist with `scoreCommanders(..., { minSignalCount: 1 })`, skipping the
     `isMeaningfulMatch` gate.
   - Rank **narrowest identity first**, then by relaxed score. Narrowness is the whole point: for
     Tergrid, a mono-black unit must beat a five-colour one, or the Black filter stays empty and
     this exercise achieves nothing.

   Reason code: `'covers'`.

4. Dedupe against `suggestions` by `unitKey`, and cap the tier (~24 suggested) so a wide pool
   cannot reintroduce the four-figure result counts the two bars exist to prevent.

## Phase 3 — response shape (`server/src/routes/recommend.ts`)

Add an `alsoPlayable` array alongside `suggestions`. Extract the existing
`selected.map((s) => {...})` body (`recommend.ts:95-122`) into a local `serialize(s)` helper so
both arrays share one code path **and one `cardIndex`/`cite()` instance** — a second index would
double the response and break `rehydrate.ts`'s position lookups.

Each `alsoPlayable` entry additionally carries:

- `coverageReason: 'owned' | 'covers'`
- `coveredCards: number[]` — positions into the same `cardIndex`, so the UI can name _which_ of
  your cards it rescues at no payload cost.

## Phase 4 — client

| File                                              | Change                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/src/types/index.ts`                       | `alsoPlayable`, `coverageReason`, `coveredCards` on the DTOs and on `WireRecommendResponse`                                                                              |
| `client/src/lib/rehydrate.ts`                     | Factor the per-suggestion body out of `rehydrateRecommendations` into a local function; run both arrays through it; resolve `coveredCards` with the existing `resolve()` |
| `client/src/lib/filters.ts`                       | `matchesColors` include branch becomes intersection (`colorIdentity.some((c) => allowed.has(c))`); exclude unchanged. Drop the now-unused `isWithinColorIdentity` import |
| `client/src/components/ResultFilters.tsx`         | Rewrite `nextColorModeDescription` (`:86`), the `filter-hint` string (`:157`), and the comment block at `:78-85` — all three describe subset semantics and become wrong  |
| `client/src/components/RecommendationResults.tsx` | Render a second labelled section beneath the grid                                                                                                                        |
| `client/src/components/CommanderCard.tsx`         | A badge for the coverage reason — "In your list" / "Covers Tergrid"                                                                                                      |

**Rewrite the `filters.ts:63-69` doc comment.** Its Orzhov rationale ("picking {B, G} keeps
everything playable in a Golgari deck") is a careful explanation of the semantics being replaced;
leaving it in place would actively mislead the next reader.

`RecommendationResults.tsx` must run `alsoPlayable` through the **same** `applyFilters` and the
same dismissal set as the main grid. Otherwise a Black filter produces an empty main grid sitting
above a full, unfiltered coverage list — a worse bug than the one being fixed. Show each section
only when non-empty.

`client/src/lib/searchSchema.ts` needs no change: `parseFilterSelection` is value-agnostic and only
the predicate moves.

## Phase 5 — name resolution (`server/src/db.ts`)

`findCardsByNames` already tries exact name → face name → flavour name, in decreasing order of
certainty. Add a fourth rung: split the name on `-` and retry each half through rungs 1–3.

This belongs in the resolver, not `parseList.ts`. Only the resolver can tell which half is the real
name — the reported line resolves on its **right**-hand side (`Edgar, Charmed Groom`), because the
printed flavour name is `Dracula, Voyager`, which is not what the export wrote.

Safe as a last rung: exact matching already wins outright (`db.ts:83-94` explains why that ordering
is load-bearing — 27 face names are also the real name of a different card), and no real card name
contains a space-hyphen-space; Magic uses an em dash.

## How to know it worked

`server/data/cards.sqlite` is **not** seeded in a fresh checkout, so `recommend.integration.test.ts`
and `cards.integration.test.ts` `skipIf` themselves — they only execute in
`.github/workflows/scryfall-fetch-check.yml`. Verification therefore runs in two parts.

**Seed first:** `cd apps/commander-recommender/server && pnpm run prepare-data`. This is required,
not optional: hard rule 4 forbids writing oracle text from memory, so every new fixture's text must
be copied out of the imported database. It is an existing script called the existing way, so it is
not a change to what we call under [`api-policy.md`](./api-policy.md).

**Unit tests:**

- `server/src/services/coverage.test.ts` (new) — a fixture pool mirroring the reproducing list.
  Assert (a) every owned card appears in some suggestion's `citedOracleIds` or in some
  `alsoPlayable` entry's `coveredCards`, (b) at least one entry has a mono-black identity, (c)
  Tergrid appears with `coverageReason: 'owned'`.
- `server/src/services/synergy.test.ts` — add a case for the `minSignalCount` option. The existing
  "scoring measures focus" tests must pass **unmodified**; if they need editing, the scoring formula
  moved when it shouldn't have.
- `client/src/lib/filters.test.ts` — rewrite the `:63` subset test for the new semantics, and add
  "include ['B'] keeps a WB commander" and "include ['B'] drops a colourless commander".
- `client/src/lib/rehydrate.test.ts` — `alsoPlayable` and `coveredCards` rehydration.
- A `db`/`parseList` test for the `-` rung, using the Edgar line verbatim.

**Run the app** — required by `apps/commander-recommender/CLAUDE.md` for anything user-visible, and
a clean typecheck will not catch any of these. `pnpm dev`, paste the reproducing list, confirm:

1. Results appear with no filter, as before the change.
2. Clicking **Black** returns commanders — Tergrid among them, plus Isshin and Edgar under the new
   "touches" semantics.
3. The coverage tier renders beneath the ranking, labelled, and responds to the filter bar.
4. Edgar resolves instead of landing in "not found".

**Then:** `pnpm turbo run lint typecheck test build` at the repo root; a `CHANGELOG.md` entry under
`[Unreleased]` in `apps/commander-recommender/`; and updates to
[`commander-recommender.md`](./commander-recommender.md)'s file map and that app's `CLAUDE.md`
architecture list for the new `services/coverage.ts`.
