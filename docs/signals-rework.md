# Signals rework: implementation plan

The companion to [`archetypes.md`](./archetypes.md). That document says what the vocabulary **means**
and why; this one says what to **change**, in what order, and how to know it worked.

**Phases A and A2 have landed**, and Phase B is in progress (see their sections below and the
`[Unreleased]` entries in `apps/commander-recommender/CHANGELOG.md`). Landed so far within Phase B:
the `Role` addition (`enables`/`protects` — this also resolved A2's `voltron`/`spellslinger`
deferrals: equip-cost reduction, free-equip, Dualcast); the `cardType`/`permanentSubtype`
`QualifierKind` additions with their `CardFacts`/`supporterMatches` plumbing (no consuming archetype
yet — that's Phase C1's `copyEffects`/`artifacts` — so exercised directly in tests); and
`counterType`, which turned the old `+1/+1`-only `counters` archetype into a real qualified family
(`Counters (+1/+1)`, `Counters (-1/-1)`, `Counters (time)`, `Counters (stun)`, ...), importing and
widening `@mtg/rules`' counters taxonomy along the way per hard rule 2; and the card-property layer
(`cmc`, `alternativeCost`, `modified`, `alternateWin` on `CardFacts`), verified against Fierce
Guardianship, Dismember, Snuff Out, Kodama of the West Tree, Knuckles the Echidna and Approach of the
Second Sun in the seeded database — no consuming archetype yet (`alternativeCost` is `freeSpells`'s
job, Phase C1; `modified`/`alternateWin` likewise exercised directly in tests), same as
`cardType`/`permanentSubtype` before it. Checking Book of Exalted Deeds against the real database
turned up an archetypes.md inaccuracy (corrected there): its own text doesn't win the game, it only
grants a "can't lose/win" clause to an Angel. And the **signal containment merge** — unqualified
supports qualified, never the reverse (`groupByTheme` in deckAnalysis.ts, `supporterMatches` in
synergy.ts) — verified against the real Wilhelt corpus fixture: Liliana, Death's Majesty's
unqualified reanimation spell now folds into `Reanimator (Zombie)` alongside Tomb Tyrant and Zombie
Apocalypse, clearing `MIN_THEME_CARDS` where three sub-threshold fragments previously reported
nothing (archetypes.md's own motivating example, confirmed exactly). Verifying this against the full
20-deck corpus also surfaced a pre-existing, unrelated `findQualifier` imprecision, fixed as its own
follow-up: Angel of Glory's Rise ("exile all Zombies, then return all Human creature cards from your
graveyard to the battlefield") mis-qualified as `reanimator:Zombie` instead of `reanimator:Human`,
because the old code scanned the whole clause for the first known type word rather than tying the
candidate to the payoff matcher's own match text. Now qualified correctly, with Sliver Gravemother
(whose restriction sits outside her matcher's match text entirely) verified still correct via the
whole-clause fallback.

**Phase B is otherwise complete.** Only `gameState` remains (needs its own archetype, arguably Phase
C2's job). Cascade (`freeSpells`) still needs a Phase C archetype that doesn't exist yet. The corpus
this is derived from is committed at
`apps/commander-recommender/server/src/services/__fixtures__/decks/`.

> **Where a line number is cited it was accurate at the commit that added this file.** Treat them as
> signposts, not addresses — find the code by what it does.

---

## Sequencing

**A → B → C1 → C2 → C3 → E → F**, with **D deferred** and **C4 conditional**.

- **Phase A is independently shippable** and the highest-trust change: it stops the engine making
  claims that are visibly wrong, before anything new is stacked on top.
- **Phase D is deliberately out of order.** Gating `keywordCare` on `rewards` (Phase A) may collapse
  the mechanic-keyword split into little more than an ignore list once Phase C's archetypes exist —
  Crew stops mattering as a keyword once `artifacts:Vehicle` carries the theme. **Build C first and
  re-measure. Do not build both.**
- **Re-measure between C tiers** with the Phase F coverage report. The zero-signal commander count is
  the number that says whether the catalog is actually improving.

---

## Phase A — Stop the false positives

No schema change. All in `services/signals.ts` unless noted.

### `definingRole`

Add to `ArchetypeDef`: which role is the archetype's identity (default `rewards`) and how many cards
must have it (default 1). Enforce at the two gates that already exist — `deckAnalysis.ts`'s theme
loop beside `MIN_THEME_CARDS`, and `synergy.ts`'s `matched` loop beside `MIN_SIGNAL_COUNT`.

Minimums above the default: **`landsMatter` 2**, **`kindred` 2**. Rationale and the full
kills/keeps table are in `archetypes.md`.

This **supersedes the kindred exemption from "cares, not shares"** (`deckAnalysis.ts`'s
`countsTowardTheme`). Delete the special case and the paragraph justifying it — membership still
counts cards, but a theme needs at least one card that cares.

Also **gate `keywordCare` on `rewards` specifically**, not merely an active role: granting a keyword
is not caring about it. This is what kills the Flying/Haste/Lifelink keyword shadows.

Keep the `sacrificesItself && isLand` matcher. Fetchlands are correct evidence for a real lands deck;
the gate is what stops them constituting one alone.

### Drop single-card "keywords" at import

`import-scryfall.ts`, where the keyword vocabulary is collected (~line 406-418). Count keyword
frequency across the pool and drop anything on fewer than ~5 cards. The corpus surfaced 25+ flavour
ability words (`Prismatic Gallery`, `Bad Wolf`, `Chaos Control`, `Allons-y!`, `Treasure Hunter`,
`Eukrasia`…). Data-driven, so no allowlist to curate as sets release.

### Smaller fixes

| Change                                             | Why                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`growsItself` fact**                             | Model on the existing `sacrificesItself` precedent — read off `rawText`, because name-stripping destroys the evidence. A card whose only `+1/+1` clause targets itself is bookkeeping, not counter production. Excludes Kalamax and Dragonsguard Elite from `counters.produces`. |
| **Widen `spellslinger.rewards`**                   | `"your first instant spell each turn"`, `"cast or copy an instant or sorcery"` — Kalamax, Double Vision, Storm-Kiln Artist, Ral, Arcane Bombardment.                                                                                                                             |
| **`goWide` becomes `qualifiable: 'creatureType'`** | `"Sliver creatures you control get +1/+1"` currently makes an unqualified Go-Wide theme out of half the Sliver lords. Qualified, it cites and suggests Slivers. Reuses `findQualifier`/`supporterMatches` exactly as the Sliver Gravemother case designed them.                  |
| **`MAX_THEMES` 6 → 8**                             | Kalamax legitimately fills six once Phase C lands; Wilhelt has five axes.                                                                                                                                                                                                        |

---

## Phase A2 — Matcher precision

Same phase, separable work. Every item below is a real card the current matchers miss or misread.

### One shared `sacrificeCost` primitive

`aristocrats.consumes` (a regex requiring the literal word _creature_) and `detectKindred`'s consumes
test (clause mentions the type **and** contains "sacrifice") disagree about the same sentence, in
both directions:

- **Wilhelt's** `"you may sacrifice a Zombie"` is detected as a Zombie-consumer but **not** as a
  sacrifice outlet — the commander's defining ability.
- **Sophia's** `{1}, Sacrifice an artifact token: Put a +1/+1 counter on each Dog you control`
  registers as **consuming Dogs**, which she does not.

Extract one helper both call. It must:

- **Split on `:` and read the cost side only.** `[^.;]*` currently spans the colon, so _effect_ text
  can satisfy a _cost_ requirement — Cleaver Skaab and Empty the Laboratory both match for the wrong
  reason.
- **Accept a subtype or permanent type**, not just `creature`: "a Zombie", "a Sliver", "a Goblin",
  "an artifact", "a token". The Krenko deck alone has four misses (Goblin Bombardment, Siege-Gang
  Commander, Arms Dealer, Goblin Grenade).
- **Widen the quantifier** past `a|an|another|two|three|four|\d+|x` to cover `one or more`,
  `up to three`, `any number of`. Plumb the Forbidden currently matches nothing at all.
- **Keep excluding `sacrific*es*`.** Edicts are not outlets. Pin with a test.

### Explicit matchers for reminder-only keywords

`stripReminderText` deletes the only English description a keyword-defined mechanic has. The file
already special-cases `encore`/`unearth`/`eternalize`/`embalm`, `adapt`/`evolve`/`bolster`/`outlast`
and `surveil`/`dredge` for exactly this reason — the convention is right and incomplete.

Add, with the archetype each belongs to: `exploit` (aristocrats `consumes`), `amass` (goWide
`produces`, counters `produces`, kindred for the named type **and** Army — ~18 cards in the Sauron
deck), `decayed` (self-sacrificing fodder), `cascade` (`freeSpells`), `for mirrodin!` (a token
producer **and** an attach), `demonstrate`, `aftermath`, `fuse`, `behold`, `myriad`, `evoke`,
`blitz`, `crew`, `improvise`, `affinity`, `magecraft`.

### Templating families

| Family                    | Misses                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Lord wording**          | `"All Sliver creatures get"` vs `"Sliver creatures you control get"`; `"Zombies you control get"` vs `"Zombie creatures you control get"`. Four Zombie lords in, four out, on whether the word _creatures_ appears. **Add a normalisation pass** rather than a third regex.                                                          |
| **Death triggers**        | `aristocrats.rewards` needs `dies`/`dying`, so it cannot see Psychomancer's `"is put into a graveyard from the battlefield or is put into exile from the battlefield"` — the Trazyn deck's only drain payoff, and the reason its phantom Aristocrats theme shows zero. Treat **exile-from-battlefield** as a death-equivalent.       |
| **Graveyard filling**     | Three separate gaps: `search … put them into your graveyard` (Buried Alive, Unmarked Grave, Disciples of Gix); `"Mill N cards, then …"` (needs a period after `cards`); and **discard** — Faithless Looting, Thrill of Possibility, Windfall, Fact or Fiction, Ideas Unbound. In a Grixis reanimator deck the discard _is_ the fill. |
| **Reanimation source**    | `from your\|a graveyard` misses `from an opponent's graveyard` (Gruesome Encore, Puppeteer Clique).                                                                                                                                                                                                                                  |
| **Permanent recursion**   | `reanimator.rewards` requires `creature`, so Sun Titan's `"return target **permanent** card"` misses. Also Revive the Shire, Triumphant Reckoning.                                                                                                                                                                                   |
| **"Nth spell each turn"** | Kalamax, Double Vision, Alisaie, Alphinaud. Handle the family.                                                                                                                                                                                                                                                                       |
| **Cost reduction**        | `spellslinger.rewards` requires the literal `instant and sorcery spells … cost`. Six decks' worth of misses. Model **once** as an `enables` matcher parameterised by what it reduces.                                                                                                                                                |

### Counters matchers

Rewritten against Sophia, the corpus's real counters deck. Each is standard templating:

- **Passive voice.** `amplifies` is `would (put|distribute) one or more … instead`, but **Hardened
  Scales** reads `"If one or more +1/+1 counters **would be put** on a creature you control…"`. The
  format's most iconic counters amplifier fails the counters amplifier matcher.
- **`"creature with a +1/+1 counter on it"`** is the dominant _payoff_ templating and matches
  nothing — Herald of Secret Streams, Ainok Bond-Kin, Inspiring Call.
- **Bare `"counters"`** — The Ozolith never says `+1/+1`.
- **`"enters with N +1/+1 counters"`** is not production; the matcher requires `put`. Faithful
  Watchdog, Wildwood Scourge, District Mascot, **Giada**.
- **`Distribute`** (Ajani, Mentor of Heroes) and **`proliferate`** belong in `produces`.

### Two token bugs, one function

`tokenDescriptorPattern` fails in **both** directions and the fixes land together:

- **Under-reach:** it allows exactly one intervening word, so `"Necron Warrior artifact creature
tokens"` is not stripped and Their Number Is Legion falsely reads as a Necron payoff.
- **Over-reach:** stripping is correct inside a `create … token` clause (the Krenko's Command case
  its comment cites) and wrong everywhere else — it erases Gleaming Overseer's `"Zombie tokens you
control have hexproof and menace"`, Eternal Skylord's flying grant, and Dreadhorde Invasion's
  attack trigger. Confine it to `create … token` clauses, mirroring `findProducedTokenTypes`.

Separately: **`"create a token that's a copy of"` is not recognised as token production anywhere**,
in `goWide.produces`, `aristocrats.produces` or `findProducedTokenTypes`. Ten such cards in the Obeka
deck alone; five of six decks affected.

### `detectKeywordCare` plurals

It builds `\b${keyword}\b` with no plural form, so `"Foods"`, `"Clues"` and `"Treasures"` never
match. `detectKindred` already solves this via `wordPattern`/`pluralOfType` — reuse it. Peregrin Took
and The Cabbage Merchant miss on this alone.

### `voltron.rewards` was narrowed too far

The existing comment correctly excluded `equipped creature gets/has/gains` after a 20-card Equipment
pile reported "14 payoffs" — but overshot. On Bre's deck it finds 2 of 7. Missing: Danitha
(Equipment spells cost less), Puresteel Paladin (`equip {0}`), Bruenor (free equip), Koll
(`"if it was enchanted or equipped"`), Bladehold War-Whip (the matcher is
`equip abilities you activate cost`; the card says `"…you activate **of other Equipment** cost"`).

Equip-cost reduction and free-equip are **`enables`**, not `rewards`, so the new role resolves four
of the five _without_ reopening the false positive the comment guards against.

---

## Phase B — Roles, qualifiers, storage

Schema-affecting. **Bump `IMPORT_VERSION` 8 → 9** (`services/dataSnapshot.ts`). `card_signals` is
dropped and rebuilt per import and already stores `qualifier_kind`, so no migration is needed — but a
stale database must be rejected, and `IMPORT_VERSION` is the existing mechanism.

- **`Role` gains `enables` and `protects`**; both into `ROLES` and `ACTIVE_ROLES`. Rewrite the
  "KNOWN LIMITATION" comment — the Goblin Sharpshooter note it opens with is exactly what `enables`
  answers. **`protects` matchers must be archetype-scoped** (protects _Slivers_, protects
  _artifacts_), never generic hexproof, or every Lightning Greaves becomes a candidate for
  everything.
- **`QualifierKind` gains `cardType`, `permanentSubtype`, `counterType`, `gameState`.** Needs new
  `CardFacts` fields off the type line, plus handling in `supporterMatches`, which today knows only
  `creatureType` and `keyword`. **Do not add a Scryfall catalog fetch for artifact subtypes** — that
  is an api-policy-gated change. Use a curated constant (`Vehicle`, `Equipment`, `Saga`, `Clue`,
  `Treasure`, `Food`) matched against the stored `type_line`.
- **Counters via `@mtg/rules`.** Import `packages/rules/src/counters.ts` and widen its taxonomy
  rather than adding a local regex — see `archetypes.md`. Hard rule 2.
- **The card-property layer** (`alternativeCost` × `cmc`, `modified`, `alternateWin`) belongs here,
  designed alongside `CardFacts` — **not** bolted into individual archetype matchers.
- **Signal containment: unqualified supports qualified, never the reverse.** `groupByTheme` and
  `supporterMatches` treat `reanimator` and `reanimator:Zombie` as unrelated, so Wilhelt's deck
  reports _neither_ — one card and two cards, both under threshold, while the deck plainly
  reanimates. Implement as a merge step when grouping. **This is the same relation Phase E's kindred
  wildcard needs — build one mechanism.**

---

## Phase C — New archetypes

Tiers, decks backing each, and per-archetype detail are in
[`archetypes.md`](./archetypes.md#archetypes). Ship C1 → C2 → C3, re-measuring between. C4 only if
the earlier tiers hold up.

Add to `ARCHETYPES`, with `LIFECYCLES` entries for the ones that are chains rather than membership
groups.

---

## Phase D — Keyword split _(deferred — see Sequencing)_

Replace the single `EXCLUDED_KEYWORDS` set with three buckets and teach `countsTowardTheme` about
them: `MECHANIC_KEYWORDS` (count on membership), `COMBAT_KEYWORDS` (keep the active-role
requirement), `IGNORED_KEYWORDS` (the Partner family, plus Scryfall's _keyword actions_ and ability
words — `Treasure`, `Double`, `Heal`, `Regenerate`, `Scry`, `Fateseal`, `Typecycling`, all confirmed
present in live data).

**Re-measure before building this.** It may reduce to little more than `IGNORED_KEYWORDS`.

---

## Phase E — Kindred as an engine

- **A `kindred` lifecycle.** `lifecycleFor` keys on archetype only and `groupByTheme` already scopes
  participants by qualifier, so one spec serves every creature type with no mechanism change. Slots:
  bodies (`is`), lords and anthems (`rewards`), tribal mana and cost reduction (`enables`), tutors
  and selection (`produces`), evasion and haste (`enables`), resilience (`protects`,
  `commonlyMissing`). Retire the "membership groups rather than engines" carve-out in
  `lifecycle.ts`'s header — the Sliver deck is its counterexample.
- **Wildcard kindred (`*`).** Emit `{ archetype: 'kindred', qualifier: '*' }` for `"choose a creature
type"` cards and teach the three consumers — `supporterMatches`, `groupByTheme`,
  `findCardsBySignals` — that `*` joins every kindred qualifier and forms no theme of its own.
- **Changeling → `@mtg/rules`** (hard rule 2). New primitive citing **CR 702.73a** alongside
  `parseCreatureTypes`. Store an `is_changeling` column rather than expanding ~300 creature types per
  card; honour it in `detectKindred` and `supporterMatches`. Realmwalker is the corpus case, with
  Chomping Changeling, Flock Impostor and Crib Swap in the Brigid deck.

---

## Phase F — Measurement and documentation

### Import-time coverage report

`signals.ts` concedes that its weights "were set before any measurement was possible". **Obeka makes
that concrete: a real, legal, played commander that no input can ever return**, because
`scoreCommanders` skips any unit with no active signal.

Have `import-scryfall.ts` print, alongside its existing signal count, **how many commander-eligible
cards produced zero signals**, with a sample. It re-runs free on every `prepare-data` and turns
catalog coverage from an opinion into a number.

**Decided: measure first, then decide.** No fallback for zero-signal commanders is being built yet.
Making them returnable on colour identity alone — flagged "no synergy detected" — trades meaningless
results for completeness, and that trade should be made against a real number. ~20 cards means extend
the catalog; ~2,000 means build the fallback.

### Docs

- Reconcile `archetypes.md` against what actually shipped.
- Update `docs/commander-recommender.md`'s file map and `CHANGELOG.md` under `[Unreleased]`.

### Designed, not built

**Commander-aware deck grading.** An optional `commander` field on `POST /api/recommend`, scoping
`analyzeDeck` to that commander's own signals and identity — _"Kalamax copies instants; twelve of
your spells are sorceries."_ `analyzeDeck` is commander-blind by design today, and every corpus deck
includes its commander in the list, so nothing depends on the split yet.

---

## Verification

1. **`cd apps/commander-recommender/server && pnpm run prepare-data`.** Required — the working tree
   ships no `cards.sqlite`, and Phases B/C/E all need a re-import at `IMPORT_VERSION` 9.
2. **Every oracle string in a new test is copied out of the seeded database**, per this app's
   standing rule. Do not reuse text from a planning document, including this one.
3. **Pin the behaviours already verified correct** — the list in
   [`archetypes.md`](./archetypes.md#behaviours-verified-as-correct). These were checked against real
   cards and must not be "fixed".
4. **Regression tests over the committed corpus.** What each deck should assert:

   | Deck                      | Assertion                                                                                                                                                                                                                                                                                   |
   | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `obeka`                   | **Produces at least one signal** (the regression that matters most) and is returned for her own 99. Temporary Effects is the top theme, with Obeka, Sundial and Glorious End as its `enables`. The ten copy-token makers count as production.                                               |
   | `trazyn`                  | **No** Aristocrats, Voltron or Necron Kindred theme. `Prismatic Gallery` produces no signal. Psychomancer is a death payoff. Artifacts is top. Buried Alive, Unmarked Grave and Disciples of Gix all count as graveyard-filling.                                                            |
   | `kalamax`                 | Reports Copy and Burn. Does **not** report Lands Matter or +1/+1 Counters. Copy spells land in the multiplier slot, not the payoff slot.                                                                                                                                                    |
   | `miles`                   | **Artifacts (Vehicle)** is a top theme.                                                                                                                                                                                                                                                     |
   | `first-sliver`            | `kindred:Sliver` has non-empty `slots`. Herald's Horn and Realmwalker are cited as Sliver supporters. No phantom unqualified Go-Wide.                                                                                                                                                       |
   | `wilhelt`                 | Wilhelt fills the **outlet** slot, not just fodder and payoff. Plumb the Forbidden and Overcharged Amalgam are outlets; Fleshbag and Accursed Marauder are **not**. One Reanimation theme, not two sub-threshold fragments. Gleaming Overseer and Eternal Skylord are Zombie-token payoffs. |
   | `sophia`                  | Hardened Scales is an **amplifier**; The Ozolith, Herald of Secret Streams and Inspiring Call are **payoffs**. Academy Manufactor produces a Food signal. Peregrin Took matches on `"Foods"`. Sophia does **not** consume Dogs. Lands Matter does **not** fire on one landfall payoff.      |
   | `bre`                     | **Lifegain** is the top theme, not Lifelink. Danitha, Puresteel, Bruenor and Bladehold War-Whip are Voltron support. Sun Titan counts as recursion. The three split cards resolve via `card_face_names`.                                                                                    |
   | `yshtola`                 | Pillowfort and Drain both appear. Voltron does **not**, despite four Auras.                                                                                                                                                                                                                 |
   | `krenko`                  | Goblin Bombardment, Siege-Gang, Arms Dealer and Goblin Grenade are sacrifice outlets.                                                                                                                                                                                                       |
   | `sauron`                  | Amass registers as production. The Ring appears as `gameState`.                                                                                                                                                                                                                             |
   | `morcant`                 | −1/−1 counters are detected; proliferate registers.                                                                                                                                                                                                                                         |
   | `giada`                   | Angels kindred plus Lifegain. `"enters with an additional +1/+1 counter"` counts as production.                                                                                                                                                                                             |
   | `shadow`                  | Treasure is a qualified artifact theme. Xorn is an amplifier.                                                                                                                                                                                                                               |
   | `tenth-doctor-rose-tyler` | The pair is built as one `CommanderUnit`. Time counters are detected.                                                                                                                                                                                                                       |
   | `captain-howler`          | Cycling/discard appears as a theme.                                                                                                                                                                                                                                                         |

5. `pnpm turbo run lint typecheck test build` at the repo root.
6. **Run the app** and paste corpus decks through the real UI. A clean typecheck is necessary, not
   sufficient — it does not catch a theme that stopped rendering.
7. **Confirm no new outbound call.** The only Scryfall traffic remains `fetch-scryfall.ts`, and no
   artifact-subtype catalog fetch was added (`api-policy.md`).
