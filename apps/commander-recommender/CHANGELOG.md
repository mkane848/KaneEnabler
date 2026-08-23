# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and version numbers follow [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`, where MAJOR is a breaking change to how the app is used,
MINOR is a new capability, and PATCH is a fix with no new capability.

## [Unreleased]

### Added

- **Signal engine, Phase B (part 1) — `enables` and `protects` roles.** See
  `docs/signals-rework.md` Phase B. `Role` gains two new capacities,
  joining `ROLES` and `ACTIVE_ROLES`:
  - **`enables`** — turns the engine on without being it. A new shared
    `reducesCostOf` helper (parameterised by what it reduces, rather than a
    bespoke regex per archetype) recognizes cost reduction and free
    activation/casting as Voltron and Spellslinger enablers: Danitha
    Capashen, Paragon (Aura/Equipment spells cost less), Puresteel Paladin
    (`equip {0}`), Bruenor Battlehammer (free equip), Bladehold War-Whip
    (other Equipment's own equip cost), and Alisaie Leveilleur's Dualcast
    (the second spell each turn) were all previously unresolved because
    they don't reward anything — they make the engine cheaper to run.
  - **`protects`** — keeps the engine running, and must be
    archetype-scoped or every generic hexproof/indestructible effect
    becomes a candidate for everything. Kindred detection now recognizes a
    lord that grants indestructible/hexproof/protection/ward/shroud
    *to its own type by name* (Sliver Hivelord: "Sliver creatures you
    control have indestructible") as a protector for that kindred
    specifically; a spell that merely grants hexproof to "target creature"
    (Snakeskin Veil) is deliberately left unmatched — it names no type, so
    there's nothing safe to scope it to yet.
- **Signal engine, Phase B (part 2) — `cardType` and `permanentSubtype`
  qualifiers.** `CardFacts` gains `cardTypes` (Creature, Instant, Sorcery,
  Artifact, Enchantment, Land, Planeswalker, Battle, Kindred — read off the
  type line before the em dash) and `permanentSubtypes` (a curated list —
  Vehicle, Equipment, Saga, Clue, Treasure, Food — matched against the type
  line; not a Scryfall subtype catalog fetch, which would be an
  api-policy-gated change). `synergy.ts`'s `supporterMatches` narrows by
  both the same way it already narrows by `creatureType`/`keyword`. Neither
  has a consuming archetype yet — that's Phase C1's `copyEffects`
  (Kalamax copies *instants*, not sorceries) and `artifacts` (Miles's
  Vehicles, Sophia's Food) — so this is plumbing ahead of its first user,
  exercised directly in tests rather than through a real signal.
- **Signal engine, Phase B (part 3) — `counterType` qualifier, and
  `+1/+1 Counters` becomes `Counters`.** Counters are a family, not a
  keyword (docs/archetypes.md) — the archetype is now qualified by the
  specific counter kind exactly like Kindred is qualified by creature
  type, rather than being permanently scoped to the literal string
  "+1/+1".
  - `packages/rules/src/counters.ts` (`@mtg/rules`) gains
    `MINUS_ONE_MINUS_ONE_KEYWORDS` (Blight, rule 701.68; Persist, rule
    702.79 — both only ever name "-1/-1" inside their own reminder text)
    and `TIME_COUNTER_KEYWORDS` (`TIME_COUNTER_MECHANICS` plus Time
    Travel, rule 701.56) — consumed rather than re-derived locally, per
    root CLAUDE.md hard rule 2.
  - `counters.produces` now recognizes -1/-1 (via those keywords) and stun
    counters (rule 122.1d — The Watcher in the Water's own nine), not just
    "+1/+1"; `findCounterKind` also recognizes a curated list of named
    kinds (lore, burden, oil, corpse, supply, foreshadow, stash, eon,
    enlightened, loyalty) generically, as "<name> counter(s)", without
    inventing a kind for a card that only ever says bare "counters" (The
    Ozolith stays unqualified, on purpose).
  - Every existing +1/+1-specific signal is now `Counters (+1/+1)`
    rather than bare `Counters` — verified against the real seeded
    database: Morcant's deck detects -1/-1 production via Blight, The
    Watcher in the Water gets `Counters (stun)`, and the Tenth Doctor deck
    gets `Counters (time)` for its ~25 Suspend/Vanishing cards.
- **Signal engine, Phase B (part 4) — the card-property layer.** `CardFacts`
  gains `cmc`, `alternativeCost`, `modified`, and `alternateWin` —
  properties a card *is*, which an archetype can read, rather than roles of
  their own (docs/archetypes.md's "Card properties"). Verified against the
  real seeded database:
  - **`alternativeCost`** — Phyrexian mana pips (Dismember), the
    self-referential "cast this spell without paying its mana cost"
    template (Fierce Guardianship's commander clause), "rather than pay
    this spell's mana cost" (Snuff Out), and Evoke/Cleave/Delve/Convoke.
    Deliberately scoped to a card's cost for *itself* — Nissa, Worldsoul
    Speaker reduces the cost of other permanent spells, which is `enables`
    (`reducesCostOf`), not this property.
  - **`modified`** — the CR umbrella term for a permanent with a counter on
    it or an Equipment/Aura attached ("modified creature(s)/permanent(s)",
    "is/was modified" — Kodama of the West Tree, the card the property is
    named for), excluding Booster Blitz's unrelated "these modified rules"
    house-rule text.
  - **`alternateWin`** — an actual "you win the game" outcome (Knuckles the
    Echidna, Approach of the Second Sun), not a mere "can't lose/win"
    prevention effect. Checking The Book of Exalted Deeds against the real
    database found it doesn't qualify — its own text only ever *grants* an
    Angel "you can't lose the game and your opponents can't win the game",
    a symmetric protection clause, not a win condition for its own
    controller. archetypes.md named it as an `alternateWin` example; that
    was inaccurate and is corrected there.

  None of the three has a consuming archetype yet — `alternativeCost` is
  `freeSpells`'s job (Phase C1); `modified`/`alternateWin` are exercised
  directly in tests, same as `cardType`/`permanentSubtype` before them.
- **Signal engine, Phase B (part 5) — the signal containment merge:
  unqualified supports qualified, never the reverse.** `groupByTheme`
  (deckAnalysis.ts) and `supporterMatches` (synergy.ts) used to treat, say,
  `reanimator` and `reanimator:Zombie` as unrelated buckets. Wilhelt's real
  decklist has exactly the corpus case this broke: Liliana, Death's
  Majesty's reanimation spell doesn't restrict what it returns (unqualified),
  while Tomb Tyrant's and Zombie Apocalypse's do (`reanimator:Zombie`) —
  three cards that all plainly work together, split into two sub-threshold
  groups (1 and 2, both under `MIN_THEME_CARDS`), reporting no reanimation
  theme at all despite the deck plainly reanimating.
  - `groupByTheme` now folds every unqualified group's participants into
    every qualified group of the *same* archetype after building them —
    the unqualified group's own count is untouched, since the relation
    runs one way only. Verified against the real Wilhelt fixture: the three
    cards above now report as one `Reanimator (Zombie)` theme.
  - `synergy.ts` gains the same relation as a shared `ownSignalContains`
    helper, used both by `supporterMatches` (a new containment path
    alongside the existing raw-fact/type checks — an owned card can support
    a qualified commander signal via either) and by `playsDefiningRole`
    (refactored onto the same helper, unchanged behavior).
  - Verifying this against the full 20-deck corpus surfaced a pre-existing,
    unrelated imprecision in `findQualifier` (Angel of Glory's Rise
    mis-qualifies as `reanimator:Zombie` instead of `reanimator:Human`,
    because it scans the whole clause for the first known type word rather
    than the one the payoff verb actually restricts) — newly *visible*
    because the merge pushed that group over threshold, not caused by it.
    Recorded as a new "Known tension" in `docs/archetypes.md` rather than
    fixed here, since it's a different bug than this phase scopes.
- **Signal engine, Phase C1 — `copyEffects` archetype.** See
  `docs/signals-rework.md` Phase C. Copying spells, abilities, and
  permanents for extra value out of a single card, `qualifiable: cardType`
  (Kalamax copies *instants* only, so suggesting sorceries for him would be
  wrong):
  - Spells — Kalamax's own trigger ("copy that spell") and the common
    activated-ability copy template ("copy target ... spell") shared by
    League Guildmage, Lithoform Engine, Geistblast.
  - Abilities — Kirol, Attentive First-Year and Agrus Kos, Eternal Soldier
    ("copy target/that ... ability").
  - Permanents — token copies (Rite of Replication, Necroduality) and
    clone/shapeshift effects (Sculpting Steel's "enter as a copy of",
    Mirrorweave's "becomes a copy of" — a different template, no "as").
  - `findQualifier` gained the ability to narrow by `cardType`/
    `permanentSubtype` (a curated constant, not the creature-type
    vocabulary) alongside its existing `creatureType` narrowing, plus a
    guard against a false positive specific to ability-copying: an ability
    is never itself a card type, so a nearby type word describes something
    else entirely. Verified against the real seeded database: Echo,
    Perceptive Prodigy and Weaver of Harmony's ability-copy clauses name
    their ability's *source* ("... from a creature/enchantment source"),
    and Agrus Kos, Eternal Soldier's names the copies' *targets* ("for each
    other creature you control") — all three correctly stay unqualified
    rather than becoming `copyEffects:Creature`/`copyEffects:Enchantment`.
  - Verified against the real seeded database and the full 20-deck corpus:
    Kalamax's deck reports `Copy Effects (Instant)` with 11 cards (its
    second-largest theme, after Spellslinger), and Obeka's, Y'shtola's, and
    the Tenth Doctor's decks each report `Copy Effects (Creature)`.
- **Signal engine, Phase C1 — `freeSpells` archetype.** See
  `docs/signals-rework.md` Phase C. Casting a spell for less than its
  printed cost, or for free. `definingRole: produces` — no separate payoff
  role, since granting a free or reduced cast is the identity itself, the
  same shape as `selfMill`/`opponentMill`:
  - Reads `alternativeCost` (Fierce Guardianship, Dismember — Phase B part
    4), plus a new `FREE_CAST_KEYWORDS` list (Cascade, Discover, Suspend,
    Plot, Rebound) checked against the bare keyword alone, since each of
    these keywords' own reminder text is the *only* place it says "without
    paying its mana cost", and reminder text is stripped.
  - A broader, non-self-referential "without paying its mana cost" pattern
    also catches a card that grants a free cast to *something else*
    (Rashmi, Eternities Crafter, Mindclaw Shaman) rather than casting
    itself for less.
  - Verified against the real seeded database and the full 20-deck corpus:
    Y'shtola's deck — `alternativeCost`'s own motivating example (Fierce
    Guardianship, Dismember, Snuff Out) — finally reports `Free Spells` as
    a theme (6 cards), closing the loop from Phase B part 4. The Tenth
    Doctor's deck reports 8 cards (Suspend/Vanishing-heavy), and Bre's,
    Kalamax's, Radagast's, and The First Sliver's decks each report a
    smaller `Free Spells` theme too.
- **Signal engine, Phase C1 — `artifacts` archetype (completing Phase C1).**
  See `docs/signals-rework.md` Phase C. Building around artifacts as a
  category — the Vehicle, Food, Clue, and Treasure subtypes specifically —
  token production, payoffs that scale with artifact count, and effects
  that multiply the tokens themselves. `qualifiable: permanentSubtype`,
  scoped to `Vehicle`/`Food`/`Clue`/`Treasure` — `Equipment`/`Saga` are
  `PERMANENT_SUBTYPES` too, but voltron's and counters' territory, not
  this archetype's:
  - A card's own structural subtype qualifies it directly (Smuggler's
    Copter needs no text to be a Vehicle), alongside token production
    ("create a Clue/Food/Treasure token", Investigate), payoffs that read
    artifact count ("for each artifact you control", "sacrifice a
    Food/Clue/Treasure"), Vehicle-specific triggers, and amplifiers that
    double token creation (Xorn: Treasure-specific; Academy Manufactor:
    Clue, Food, and Treasure at once, so unqualified).
  - `findQualifier` gained two fixes discovered verifying this archetype
    against real cards: its qualifying scan didn't include `amplifies`
    matchers at all (missing Xorn's own Treasure restriction, which lives
    there), and a card's structural subtype was preferred unconditionally,
    which wrongly qualified Cranial Plating (structurally an Equipment)
    as `artifacts:Equipment` even though its own reward ("for each
    artifact you control") doesn't restrict to Equipment at all — now
    scoped to the subtypes `artifacts`'s own `is` role tracks. A regression
    this surfaced during development (Gothmog, Morgul Lieutenant's `amass`
    ability incorrectly gaining a `goWide:Orc` qualifier) was caught by
    the existing test suite before shipping and fixed by keeping
    `produces` out of the qualifying scan — production is evidence a
    theme exists, not a restriction on what it produces.
  - Verified against the real seeded database and the full 20-deck corpus:
    Miles's deck reports `Artifacts (Vehicle)` as its top theme (21
    cards), and Sophia's deck reports both `Artifacts (Clue)` and
    `Artifacts (Food)` (10 cards each) — archetypes.md's own motivating
    examples, confirmed exactly.
- **Signal engine, Phase F — import-time coverage report**, landed early
  as the re-measurement checkpoint between Phase C1 and C2 that
  `docs/signals-rework.md`'s own sequencing calls for.
  `import-scryfall.ts` now prints how many commander-eligible cards
  produce zero *active* signals, with a sample — the number Obeka's own
  gap (`scoreCommanders` skips any unit with no active signal) had been
  an opinion about until now. Tracked via `hasActiveRole` during the same
  pass that inserts `card_signals`, not a naive "zero rows" check — Obeka
  herself has two rows (`kindred:Ogre[is]`, `kindred:Wizard[is]`), both
  structural and neither active, so a "zero rows" check would have missed
  her entirely. **Measured: 898 of 4,049 commander-eligible cards produce
  zero active signals** — between the doc's own two reference points
  (~20 meaning extend the catalog, ~2,000 meaning build a
  colour-identity-only fallback), closer to "extend the catalog." Decided:
  keep extending via Phase C rather than building that fallback yet.
- **Signal engine, Phase C2 — `gameState` archetype.** See
  `docs/signals-rework.md` Phase C. The item Phase B explicitly deferred:
  persistent shared state that many cards read and write regardless of
  who controls it — the Ring, the monarch, the initiative, Max speed, and
  day/night. `qualifiable: gameState`, five named states (`theRing`,
  `monarch`, `initiative`, `maxSpeed`, `dayNight`) computed once onto a
  new `CardFacts.gameStates` by a dedicated detector scanning every
  clause and the Scryfall `keywords` array, the same all-clauses,
  order-independent shape `counterType` already uses rather than the
  payoff-matcher clause scan `cardType`/`permanentSubtype` use — a card
  can produce one game state and reward on a completely different one
  within the same clause set. Max speed and day/night lean on the literal
  `keywords` array (`Start your engines!`, `Daybound`, `Nightbound`)
  because reminder text is the only place those mechanics name
  themselves and reminder text is stripped; the Ring, the monarch, and
  the initiative have no such keyword and stay text-only. Verified
  against the real seeded database and the full 20-deck corpus:
  `sauron.txt` reports `Game State (theRing)` (11 cards) and `miles.txt`
  reports `Game State (maxSpeed)` (4 cards), matching archetypes.md's own
  motivating decks exactly. Re-measured with Phase F's coverage report:
  889 of 4,049 commander-eligible cards now produce zero active signals,
  down from 898.
- **Signal engine, Phase C2 — `lifegain` archetype.** See
  `docs/signals-rework.md` Phase C. "The largest single gap" per
  `docs/archetypes.md`'s own tiering — one of the format's most-built
  themes, previously entirely absent. No qualifier: unlike
  `counterType`/`gameState` there's no restricted "kind" a payoff cares
  about, just the gain-life event itself.
  - `produces`: a creature's own printed Lifelink (`CardFacts.keywords`),
    a direct `"you gain N life"`/`"you gain life equal to"` effect, or
    granting lifelink to something else (equipment, auras, tokens,
    animation) — matched by a granting-verb-governs-`lifelink` regex
    (`has`/`have`/`gains`/`gets`/`grants`/`creates`/`becomes`) rather than
    a bare `"lifelink"` mention, since a card can *select* creatures that
    already have lifelink for a payoff without granting it itself.
  - `rewards`: `"whenever you gain life"` triggers, both the
    exact-threshold (`"if you gained 3 or more life this turn"`) and
    bare-conditional (`"if you gained life this turn"`) end-step
    templates, and X-scaling payoffs reading `"the amount of life you
    gained"`.
  - `amplifies`: `"if you would gain life ... instead"` doublers, scoped
    to `you` only so an opponent-facing lifegain-denial effect (Tainted
    Remedy: `"If an opponent would gain life, that player loses that much
    life instead"`) doesn't register as an amplifier for this deck's own
    plan.
  - Checked against the full card pool, not just the corpus, for the same
    false-positive shape the `artifacts` archetype's Cranial Plating fix
    found: Duskfang Mentor's `"Put a +1/+1 counter on each creature you
    control with lifelink"` selects existing lifelink creatures for a
    payoff rather than granting it, and correctly stays unmatched.
  - Resolves the keyword-shadow rule's own Bre example
    (`docs/archetypes.md`'s "the rules that are settled"): her deck now
    reports `Lifegain (17)` as its top theme, verified against the full
    20-deck corpus, instead of a phantom `Lifelink` keyword theme.
    `eirdu.txt` and `giada.txt` also correctly surface `Lifegain`,
    matching their stated axes. Re-measured with Phase F's coverage
    report: 814 of 4,049 commander-eligible cards now produce zero active
    signals, down from 889 — confirming `lifegain` really was the
    largest single gap.
- **Signal engine, Phase C2 — `drain` archetype.** See
  `docs/signals-rework.md` Phase C. Life loss as a trigger, not damage.
  No qualifier, the same reasoning as `lifegain`. `definingRole:
  produces` — no separate payoff role, the same shape as `freeSpells`:
  causing the life loss *is* the identity, not a means to some other
  reward.
  - `produces`: the direct devotion/X-drain template (Gray Merchant of
    Asphodel, Exsanguinate, Debt to the Deathless), aristocrats-style
    death triggers (Zulaport Cutthroat, Blood Artist), and Sanguine
    Bond/Vito's own `"whenever you gain life, opponent loses that much
    life"` — their trigger reads a *different* resource (lifegain), so
    the loss they cause is still this archetype's own production.
  - `rewards`: a trigger that reads an opponent's life loss — this
    archetype's own resource — as the condition for a *different*
    payoff (Exquisite Blood, Bloodthirsty Conqueror). Deliberately
    excludes `"whenever you lose life"` self-referential triggers
    (Vampire Scrivener) — a life-as-a-resource theme of its own, not
    this one.
  - One precision issue found and fixed before shipping, checked against
    the full card pool rather than just the corpus: a first-draft
    `produces` matcher was a bare `"opponent/player/controller ... loses
    ... life"` scan, and Exquisite Blood matched it directly even though
    the card never causes a loss itself, it only reads one from any
    source. `produces` now excludes any clause a shared
    `DRAIN_TRIGGER_READS_LOSS` pattern already claims (also `rewards`'s
    own matcher), keeping the "causes drain" (Sanguine Bond) vs. "reads
    drain" (Exquisite Blood) split exact rather than double-counting.
  - Verified against the real seeded database and the full 20-deck
    corpus: `wilhelt.txt` reports `Drain (3)` and `yshtola.txt` reports
    `Drain (6)`, both matching `docs/archetypes.md`'s own motivating
    decks exactly, and `trazyn.txt` reports `Drain (4)`, matching its
    own "fallback: aggro, drain" identity. Re-measured with Phase F's
    coverage report: 797 of 4,049 commander-eligible cards now produce
    zero active signals, down from 814.
- **Signal engine, Phase C2 — `cyclingDiscard` archetype.** See
  `docs/signals-rework.md` Phase C. Discarding cards on purpose as a
  resource: Cycling, "draw N then discard N" loot effects, discard as
  an additional cost, and the payoffs that trigger off cycling or
  discarding. No qualifier, `definingRole: produces` — the same shape
  as `drain`.
  - `produces`: the Cycling keyword alone; "draw N, then discard N"
    loot templates (Faithless Looting, Sorcerer Class); discard as an
    additional cost (Thrill of Possibility, Cathartic Reunion, Demand
    Answers); activated discard-to-draw (Glint-Horn Buccaneer); and
    "each player discards their hand" (Windfall).
  - `rewards`: a trigger that reads cycling/discarding — this
    archetype's own resource — as the condition for a payoff (Curator
    of Mysteries' scry, Drake Haven's token, Ivora's counter, Rielle's
    extra draw, Marauding Mako's counters, Glint-Horn's damage).
  - Deliberately overlaps `selfMill` rather than replacing its existing
    discard-catching (`"Discarding is filling your own graveyard by
    another name"`) — a discarded card genuinely still fills the
    graveyard, that wasn't wrong; what was missing was the *other*
    identity these decks have that `selfMill` has no matchers for at
    all. Same causes-vs-reads split as `drain`: Ivora and Rielle's own
    triggers ARE discarding itself, so `produces` excludes any clause a
    shared `CYCLING_DISCARD_TRIGGER_READS_DISCARD` pattern already
    claims (also `rewards`'s own matcher) — a regression test for this
    is in `signals.test.ts`.
  - Verified against the real seeded database and the full 20-deck
    corpus: `captain-howler.txt` reports `Cycling / Discard` as its top
    theme (48 cards), and `obeka.txt`/`sauron.txt` — the two decks
    `docs/archetypes.md`'s own corpus fixture comments name as this
    pattern's earlier, unaddressed instances — now report it too (8 and
    9 cards), both keeping their pre-existing `Self-Mill` signal
    alongside it. Re-measured with Phase F's coverage report: 793 of
    4,049 commander-eligible cards now produce zero active signals,
    down from 797.
- **Signal engine, Phase C2 — `temporaryEffects` archetype (Obeka's
  own).** See `docs/signals-rework.md` Phase C. Delayed-cost effects —
  reanimating, blinking, or copying something with a built-in
  "sacrifice/exile/return it at the beginning of the next end step"
  cleanup — and the enablers that end the turn early to erase that
  cleanup before it ever fires. No qualifier, `definingRole: enables`
  rather than `produces` this time: the delayed-cost cards themselves
  are common, often-incidental staples across many decks, but the
  enablers (Obeka, Sundial of the Infinite, Glorious End: `"end the
  turn"`) are the actual, rare identity — "those three are the deck"
  per `docs/archetypes.md`'s own framing of why the `enables` role
  exists in the first place.
  - `produces`: the bare `"at the beginning of the next end step"`
    cleanup template, plus a card that has or grants Unearth, Encore,
    Dash, Blitz, Mobilize, or Warp.
  - `enables`: CR's own "end the turn" rules action, distinct from the
    unrelated "until end of turn" duration.
  - One real gap found and fixed before shipping, checked against the
    full card pool rather than just the corpus: Unearth/Encore/Dash/
    Blitz/Mobilize/Warp all hide their entire cleanup template inside
    their own reminder text (the identical problem Cascade/Suspend
    forced on `freeSpells`) — a Kathari Bomber-style Unearth creature
    registered zero signal at all until `produces` started reading a
    new `TEMPORARY_EFFECT_KEYWORDS` list off `CardFacts.keywords`
    directly, plus a granting-clause text pattern for a card that
    grants one of those keywords to others (Grixis) rather than having
    it itself — regression tests for both are in `signals.test.ts`.
  - Verified against the real seeded database and the full 20-deck
    corpus: `obeka.txt` reports `Temporary Effects` as its top theme
    (27 cards, matching `docs/archetypes.md`'s own "~25" estimate
    almost exactly), and no other deck in the corpus false-positives on
    it. Re-measured with Phase F's coverage report: 777 of 4,049
    commander-eligible cards now produce zero active signals, down from
    793.
- **Signal engine, Phase C2 — `recursion` archetype.** See
  `docs/signals-rework.md` Phase C. The same body coming back from the
  graveyard, again and again — distinct from Reanimator's one-shot
  cheat of something big into play. The one archetype in this catalog
  grounded by the repo owner directly rather than a corpus fixture
  comment (`wilhelt.txt` and `eirdu.txt`, confirmed before
  implementation). No qualifier, `definingRole: produces` — the same
  shape as `drain`/`cyclingDiscard`/`freeSpells`.
  - `produces`: Persist/Undying (a card's own keyword, or granted to
    others via text — Isilu, Carrier of Twilight: "has persist";
    Mikaeus, the Unhallowed: "have undying"); Gravecrawler's repeatable
    self-cast template; Prized Amalgam's repeatable self-return
    trigger.
  - `amplifies`: the loop's own combo enabler, per the repo owner's own
    clarification — Isilu's granted Persist creature returns with a
    -1/-1 counter, and a card that puts a +1/+1 counter on that same
    entering creature (Cathars' Crusade: "on each creature you
    control") cancels it under CR 704.5q, letting Persist trigger again
    on the next death instead of only once. Deliberately excludes a
    card that only buffs itself (Hulkling, Burgeoning Bruiser), which
    never touches the counter on a different creature.
  - One real precision issue found and fixed before shipping, checked
    against the full card pool: Flashback, Escape, and Unearth's "cast/
    return this card from your graveyard" phrasing is textually
    identical to `recursion`'s own templates until reminder text is
    stripped — the "then exile it" clause that distinguishes a one-shot
    use from a repeatable loop lives in the same parenthetical
    `stripReminderText` deletes. 354 raw matches for the
    cast-from-graveyard phrase dropped to 35 real ones once checked
    against `CardFacts.text` instead of raw `oracle_text`, none of them
    Flashback/Escape/Unearth — regression tests for both this and the
    Hulkling case are in `signals.test.ts`.
  - Verified against the real seeded database: `eirdu.txt` reports
    `Recursion (3)` directly; `wilhelt.txt` has the same 3 real
    supporting cards (confirmed via direct signal inspection) but
    doesn't surface in its displayed theme list — it ties `Drain` at
    `cardCount: 3` and loses the alphabetical tie-break for the deck's
    8th and last `MAX_THEMES` slot, a pre-existing cutoff mechanism
    unrelated to this archetype's own correctness. Re-measured with
    Phase F's coverage report: 770 of 4,049 commander-eligible cards
    now produce zero active signals, down from 777.
- **Signal engine, Phase C2 — `tapForValue` archetype, completing
  Phase C2.** See `docs/signals-rework.md` Phase C. Tapping and
  untapping your own permanents as a resource, and where combo
  *ingredients* get classified — the engine flags the parts (an
  untapper, a mana producer that taps), not the loop itself, which
  stays Commander Spellbook's job. No qualifier, `definingRole:
  produces` — the same shape as `drain`/`cyclingDiscard`/`recursion`/
  `freeSpells`. Like `recursion`, only one of the tier table's two
  decks has confirmed textual backing: kalamax.txt, via the six
  mana-tap enablers `docs/archetypes.md`'s own `enables` section
  already names by card (Springleaf Drum, Holdout Settlement,
  Survivors' Encampment, Gene Pollinator, Relic of Legends, Honor-Worn
  Shaku) as the reason `enables` needed to exist in the first place —
  shipped on that grounding alone rather than inventing a second deck.
  - `produces`: tapping a *different* permanent you control as a cost
    for something else (never a card's own bare `{T}:` ability, which
    is ubiquitous and not itself evidence of anything), and untapping
    your own permanents for free (Seedborn Muse).
  - Kalamax herself doesn't register — her text only reads "if Kalamax
    is tapped" as a condition; she's the beneficiary of this
    archetype, not its identity, and a dedicated test guards against
    that.
  - Verified against the real seeded database: `kalamax.txt` reports
    `Tap for Value (7)`, matching its own doc-confirmed axis exactly,
    with no false positives elsewhere in the corpus. Re-measured with
    Phase F's coverage report: 764 of 4,049 commander-eligible cards
    now produce zero active signals, down from 770.
  - **This completes Phase C2** — all seven archetypes shipped and
    merged.
- **Signal engine, Phase E (part 1) — wildcard kindred (`*`).** See
  `docs/signals-rework.md` Phase E. Cards reading `"choose a creature
  type"` (Herald's Horn, Vanquisher's Banner, Gathering Stone, Three Tree
  City, Secluded Courtyard, Unclaimed Territory, Realmwalker) or the
  dynamic equivalent (Path of Ancestry's `"shares a creature type with
  your commander"`) now support *every* kindred theme in the list instead
  of registering as nothing. `ownSignalContains` (synergy.ts) accepts
  `qualifier === '*'` alongside its existing unqualified case, fixing
  `supporterMatches` and `playsDefiningRole` together; `groupByTheme`
  (deckAnalysis.ts) folds a wildcard group's participants into every real
  kindred group and drops the wildcard group itself; `findCardsBySignals`
  (db.ts) does the equivalent join in SQL for the suggestion-fill path.
  Verified against the real seeded database: `first-sliver.txt` now
  reports `Sliver Kindred (56)` (was 48) with all 8 wildcard cards
  present. This catalog's original claim was ten wildcard cards; only
  eight were confirmed by direct database search — see
  `docs/archetypes.md`'s "Known tensions" for that gap. Re-measured with
  Phase F's coverage report: 763 of 4,049 commander-eligible cards now
  produce zero active signals, down from 764.
- **Signal engine, Phase E (part 2) — Changeling.** See
  `docs/signals-rework.md` Phase E. `@mtg/rules` gains `hasChangeling`,
  citing CR 702.73a alongside `parseCreatureTypes` and reading Scryfall's
  own `keywords` array rather than parsing text — Changeling's reminder
  ("This card is every creature type.") names no type words for a text
  matcher to find. Stored as a plain `is_changeling` column, the same
  pattern as `is_legendary`/`is_background`, rather than expanding
  `creature_types` into Magic's ~300-type catalog per changeling card,
  which would undo `candidateTypes`'s own performance optimisation for
  every changeling printing.
  - `detectKindred` honours the flag by pushing one *unqualified*
    `kindred[is]` signal (never `qualifier: '*'`) rather than enumerating
    types — which means `supporterMatches` needed no direct edit at all:
    `ownSignalContains`'s existing `s.qualifier === undefined` branch
    (Phase B, for the unqualified-reanimator case) already accepts it as
    support for any kindred qualifier, and `groupByTheme` already folds an
    unqualified group into every qualified sibling. Deliberately *not*
    gated the way the wildcard fold is: crediting a wildcard card to a
    type is a guess about a future player choice, but Changeling makes a
    card unconditionally, always every type — the same unconditional
    shape as Wilhelt's generic reanimation spell, so it rides that
    mechanism rather than a third parallel one.
  - Verified against the real Brigid corpus deck: Chomping Changeling,
    Flock Impostor, and Crib Swap — none of which mentions a specific
    creature type anywhere in its own text — now correctly appear in the
    deck's real `Kithkin Kindred (26)` theme, with no phantom type
    anywhere in a full corpus sweep. Only four real cards ground this
    feature (Realmwalker plus those three); see `docs/archetypes.md`'s
    "Known tensions" for what that thin sample doesn't cover. Re-measured:
    still 763 of 4,049 zero-active-signal commanders, unchanged, since
    `is` is a passive role and this signal never carries an active one on
    its own.
- **Signal engine, Phase E (part 3) — the kindred lifecycle, completing
  Phase E.** See `docs/signals-rework.md` Phase E and
  `docs/archetypes.md`'s "Lifecycles" for the full slot table. Kindred
  gets a lifecycle for the first time, retiring the "membership groups
  rather than engines" carve-out — `lifecycleFor` already keyed on
  archetype alone and `groupByTheme` already scoped participants by
  qualifier, so one spec serves every creature type with no mechanism
  change. Five slots, not the six originally planned:
  - **Bodies** (`is`, minimum 8) — actual members of the tribe.
  - **Lords & anthems** (`rewards`, minimum 2) — anthems, count-scaled
    effects, and abilities granted to the whole type. "Evasion and
    haste" is not a separate slot: granting a keyword to the tribe was
    already `rewards` before this lifecycle existed (Gleaming
    Overseer's hexproof grant, tested since Phase B), so a second,
    redundant `enables` slot for the same clause shape would either
    duplicate that or require a distinction the text can't ground.
  - **Tribal engine** (`enables`, minimum 1, commonly missing) — mana,
    cost reduction, or spending restricted to the tribe. Three new
    `detectKindred` checks feed this and the next slot, scoped by the
    same `wordPattern(type)` clause gate every other per-type check
    uses: a mana ability granted to the type or mana restricted to
    spending on it (Gemhide Sliver, Manaweft Sliver, Sliver Hive), and
    `"Affinity for [Type]"` (Thrumming Hivepool) — a keyword ability
    that needs its own check rather than the wildcard branch's
    `"cost {N} less to cast"` text pattern, which never fires on a
    named type.
  - **Toolbox** (`produces`, minimum 1) — tutors or tokens of the type,
    honestly labelled rather than narrowly "Tutors": `produces` already
    meant "makes a token of the type" (Krenko's Command) before this
    landed, and a tutor scoped to the type (`"search your library for a
    Sliver card"` — Sliver Overlord, newly detected) is the same role,
    not a new one. Card selection scoped to a *named* type — the
    per-type counterpart of the wildcard's own "look at the top card" —
    wasn't found anywhere in the corpus, so it's left uncovered rather
    than invented.
  - **Resilience** (`protects`, minimum 1, commonly missing) —
    protection granted to the whole tribe: indestructible, hexproof,
    ward. Reuses the existing `protects` detection unchanged.
  - Verified against the real seeded database and confirmed through the
    actual browser UI, not just the API: `first-sliver.txt`'s Sliver
    Kindred theme (56 cards) reports complete, all five slots filled
    (47/46/9/6/3 cards). `brigid.txt`'s Kithkin Kindred theme (26 cards)
    also reports complete. A sweep of every other fixture deck's
    kindred themes shows realistic partial completion with no
    anomalies — see `docs/archetypes.md`'s "Known tensions" for the
    accepted imprecisions this surfaced (a tutor and a token-maker
    sharing one role; a tutor's pre-existing, untouched `rewards` role
    also counting it toward "Lords & anthems").
  - Re-measured with Phase F's coverage report: 761 of 4,049
    commander-eligible cards now produce zero active signals, down from
    763.
  - **This completes Phase E** — all three sub-items (wildcard kindred,
    Changeling, and this lifecycle) shipped and merged.
- **Signal engine, Phase C3 — `cardDraw` archetype, and a documentation
  policy change.** See `docs/signals-rework.md` Phase C and
  `docs/archetypes.md`'s new "Grounding: vetted vs inferred" section — the
  repo owner asked to build ahead of named-deck confirmation for future
  archetypes rather than wait on it for every one, while keeping the same
  full-card-pool false-positive check every archetype has always gotten.
  Re-checking Phase C3's tier row against the corpus table under that new
  policy found six of its seven archetypes were never actually
  ungrounded — `cardDraw` itself is named explicitly by two decks
  (watcher-in-the-water.txt, primary; miles.txt, secondary).
  - Repeatable engines are `produces` (Rhystic Study, Mystic Remora,
    Archmage Emeritus, Sram, Senior Edificer), a trigger reading you
    drawing a card is `rewards` (Chasm Skulker, Homunculus Horde), and a
    pure doubling replacement effect is `amplifies` (Teferi's Ageless
    Insight, Thought Reflection, Alhammarret's Archive — the last also
    amplifies `lifegain`, one card correctly earning both signals, exactly
    as `watcher-in-the-water.txt`'s own corpus note calls out by name).
    Gets a three-slot lifecycle, the same shape as `goWide`/
    `spellslinger`: draw engines (`produces`, minimum 3), payoffs
    (`rewards`, minimum 2), multipliers (`amplifies`, minimum 1).
  - Checked against the full legal card pool before shipping, not just the
    two grounding decks: an initial version rescued 124 previously
    zero-active-signal commanders in one pass, and a spot check of that
    set found two real false-positive shapes before the final version
    shipped — see the Fixed section below.
  - Verified against the real seeded database:
    `watcher-in-the-water.txt`'s Card Draw theme (37 cards) reports
    complete, with its multiplier slot naming exactly the three cards its
    own corpus note already called out by hand. `miles.txt`'s Card Draw
    theme (11 cards) reports incomplete, missing only payoffs — consistent
    with its own corpus note naming "draw engine" specifically.
  - Re-measured with Phase F's coverage report: 653 of 4,049
    commander-eligible cards now produce zero active signals, down from
    761 — by far the largest single movement this number has ever seen,
    consistent with "draw a card" being one of the most common templated
    effects in the game.
- **Signal engine, Phase C3 — `burn` archetype.** See `docs/signals-rework.md`
  Phase C and `docs/archetypes.md`'s own entry. One deck, kalamax.txt, whose
  own confirmed axes name it directly ("Copy, burn, power-into-damage,
  go-wide" — `copyEffects` and `goWide` already cover the other two). No
  separate payoff role, the same shape as `drain`/`cyclingDiscard` — dealing
  the damage *is* the identity.
  - `produces` requires a quantifier right after "deals" — a fixed number
    (Guttersnipe), X (Comet Storm), "that much damage" (a reflect effect
    reading an unrelated damage event, Donna Noble), or "damage equal to"
    (Fling, Soul's Fire, Chandra's Ignition's power-into-damage template) —
    excludes any clause naming combat damage ("not through combat" is this
    archetype's own boundary), and excludes a clause whose only target is
    the controller (a pain land's cost) unless a real target rides along in
    the same breath (Char).
  - `amplifies` is a damage doubler — "if a source \[you control\] would
    deal damage ..., it deals double/triple/that much plus N ... instead"
    (Torbran, Thane of Red Fell; Furnace of Rath) — requiring an actual
    increase word so a same-amount redirect is never mistaken for one, and
    excluding the shape redirected onto the controller or the source itself.
  - Checked against the full legal card pool before shipping, not just the
    grounding deck: 62 previously zero-active-signal commanders rescued,
    cleanly split across the power-into-damage template, fixed/X-damage
    payoffs, and doublers — see the Fixed section below for a real bug the
    sweep caught before shipping.
  - Verified against the real seeded database: kalamax.txt's own eight burn
    cards (Comet Storm, Electrodominance, Expansion // Explosion, Fling,
    Guttersnipe, Ral, Storm Conduit, Soul's Fire, Chandra's Ignition) all
    tag `produces`.
  - Re-measured with Phase F's coverage report: 591 of 4,049
    commander-eligible cards now produce zero active signals, down from 653.
- **Signal engine, Phase C3 — `bigMana` and `graveyardToolbox` archetypes.**
  See `docs/signals-rework.md` Phase C and `docs/archetypes.md`'s own
  entries. One deck, trazyn.txt, whose own confirmed axes name both
  directly ("graveyard toolbox, big mana into X"). Both
  `definingRole: produces`, no separate payoff role — same shape as
  `freeSpells`.
  - `bigMana`'s `produces` is three or more mana symbols back to back
    (Basalt Monolith, Thran Dynamo's "Add {C}{C}{C}"; Dark Ritual's burst
    "Add {B}{B}{B}") or the word-count shape for the same thing (Gilded
    Lotus, Sceptre of Eternal Glory's "Add three mana of any one color";
    Klauth, Unrivaled Ancient's "add X mana"). Deliberately excludes Sol
    Ring/Arcane Signet/Mind Stone-shaped one- or two-mana rocks —
    format-wide staples, not evidence of a big-mana plan.
  - `graveyardToolbox`'s `produces` covers returning a flexible card choice
    from the graveyard to hand (Codex Shredder, Takenuma, Abandoned Mire's
    Channel ability) and reading a whole graveyard's activated abilities
    without moving anything (Trazyn's own commander ability; Mirran
    Safehouse's identical template for lands). Deliberately distinct from
    `reanimator`'s "return ... to the battlefield" pattern.
  - Checked against the full legal card pool before shipping: 5 previously
    zero-active-signal commanders rescued by `bigMana` alone, 9 by
    `graveyardToolbox` alone — see the Fixed section below for a real bug
    the sweep caught before shipping.
  - Verified against the real seeded database: trazyn.txt's own five
    `bigMana` cards (Basalt Monolith, Dark Ritual, Gilded Lotus, Sceptre of
    Eternal Glory, Thran Dynamo) and three `graveyardToolbox` cards (Codex
    Shredder, Takenuma, Trazyn the Infinite) all tag `produces`.
  - Re-measured with Phase F's coverage report: 576 of 4,049
    commander-eligible cards now produce zero active signals, down from
    591.
- **Signal engine, Phase C3 — `powerMatters` archetype.** See
  `docs/signals-rework.md` Phase C and `docs/archetypes.md`'s own entry.
  One deck, radagast.txt, whose own corpus note names four cards by hand
  (Ghalta, Goreclaw, Outcaster Trailblazer, Return of the Wildspeaker).
  - `enables` covers cost reduction scaled by power (Ghalta's own "costs
    {X} less to cast, where X is the total power of creatures you
    control"; Goreclaw's "creature spells you cast with power 4 or greater
    cost {2} less to cast") — the same enables/rewards split
    `spellslinger`'s own cost-reduction clause draws.
  - `rewards` covers a payoff gated by or scaled by power: Goreclaw's
    attack-trigger buff and Outcaster Trailblazer's draw trigger share the
    exact phrase "with power 4 or greater"; Return of the Wildspeaker and
    Tuya Bearclaw both read the "greatest power" among your own creatures;
    Mosswort Bridge gates a free cast behind "total power 10 or greater".
  - Checked against the full legal card pool before shipping: 8 previously
    zero-active-signal commanders rescued, all genuine big-creature
    payoffs (Mayael the Anima's power-5-or-greater cheat, Alena and
    Giant-Man's power-scaled mana) — see the Fixed section below for a
    real bug the sweep caught before shipping.
  - Verified against the real seeded database: radagast.txt's own six
    `powerMatters` cards (Entish Restoration, Ghalta, Goreclaw, Mosswort
    Bridge, Outcaster Trailblazer, Return of the Wildspeaker) all tag
    correctly.
  - Re-measured with Phase F's coverage report: 568 of 4,049
    commander-eligible cards now produce zero active signals, down from
    576.
- **Signal engine, Phase C3 — `pillowfort` archetype.** See
  `docs/signals-rework.md` Phase C and `docs/archetypes.md`'s own entry.
  One deck, yshtola.txt, whose own confirmed axes name it directly, and
  the deck plays Ghostly Prison and Propaganda outright.
  `definingRole: produces`, no separate payoff role — the same shape as
  `bigMana`/`graveyardToolbox`.
  - `produces` is the classic tax shape ("Creatures can't attack you
    unless their controller pays {2} for each creature they control
    that's attacking you" — Ghostly Prison, Propaganda's identical
    wording; Norn's Annex extends it to planeswalkers with an
    alternative-cost payment). Deliberately excludes the common Vow cycle
    and Assault Suit's shape ("Enchanted/Equipped creature ... can't
    attack you") — those neutralize one specific creature, not a
    board-wide deterrent.
  - Checked against the full legal card pool before shipping: 2 previously
    zero-active-signal commanders rescued (Dáin, Lord of the Iron Hills;
    Baird, Steward of Argive), both genuine board-wide tax effects — see
    the Fixed section below for a real bug the sweep caught before
    shipping.
  - Verified against the real seeded database: yshtola.txt's own three
    `pillowfort` cards (Ghostly Prison, Norn's Annex, Propaganda) all tag
    `produces`.
  - Re-measured with Phase F's coverage report: 566 of 4,049
    commander-eligible cards now produce zero active signals, down from
    568. This completes Phase C3's grounded archetypes — only
    `monoColorDevotion`, the tier's one genuinely Inferred entry, remains.

### Fixed

- **Signal engine — `cardDraw`'s `produces` matched a third-person "draws"
  naming only an opponent as its subject, and separately matched a
  replacement effect that never causes a draw at all.** Both found
  checking the full legal card pool before shipping, not just the two
  grounding decks — an initial version that matched `draws?`
  unconditionally rescued 124 previously zero-active-signal commanders in
  one pass, and a spot check of that set found both shapes directly.
  - Third-person "draws" (with the `-s`) grammatically needs an explicit
    subject, and that subject decides who benefits — "that player...
    draws a card" (Vendilion Clique, replacing a card it just made a
    player discard) or "each opponent draws a card" (Mathas, Fiend
    Seeker's own bounty handing opponents a card as a downside) never
    benefit you, unlike the bare imperative "draw" (no `-s`) standard MTG
    templating already uses for an effect that's yours, or "each player
    draws" which includes you. Fixed by splitting `produces` on that
    grammatical distinction rather than a distance- or player-name-based
    heuristic, neither of which survives Vendilion Clique's subject and
    verb sitting on opposite ends of a three-verb sentence.
  - A *replacement* effect ("if/when \[someone\] would draw a card,
    \[something else happens\] instead") never causes a draw at all,
    whoever its subject is — Eruth, Tormented Prophet turns your own
    draws into a different kind of card access entirely, and Urabrask,
    Heretic Praetor taxes an opponent's draw into something else. A new,
    broader `CARD_DRAW_REPLACEMENT` excludes the whole family from
    `produces`; the narrower `CARD_DRAW_REPLACEMENT_AMPLIFIES`
    (specifically "draw two/three/N cards instead") is what still earns
    `amplifies` for the three real doublers (Teferi's Ageless Insight,
    Thought Reflection, Alhammarret's Archive).
  - A full re-check after both fixes (108 commanders rescued by `cardDraw`
    alone) found no further false positives, including legitimately
    ambiguous shapes that were checked and correctly kept: Edric,
    Spymaster of Trest's "its controller may draw a card" is a genuinely
    symmetric attacks-matter effect, and Ludevic, Necro-Alchemist's "that
    player may draw a card" is keyed to each player's own end step in
    turn.
- **Signal engine — `burn`'s doubler exclusion wrongly stripped `produces`
  from a real reflect-effect commander.** "It deals that much damage"
  appears in two different constructions: a damage doubler's redirect
  ("if a source *would* deal damage ..., it deals that much damage plus N
  ... *instead*" — Torbran, Thane of Red Fell), which produces nothing of
  its own, and a reflect effect's brand-new instance of damage to a
  brand-new target ("whenever Donna Noble ... is dealt damage, Donna Noble
  deals that much damage to target opponent" — no replacement structure at
  all). An early version excluded any clause containing the bare phrase
  "that much damage" from `produces`, which correctly handled the first
  shape and incorrectly stripped the second — Donna Noble, a real,
  playable commander, among them. Fixed by keying the exclusion to the
  doubler's actual "would deal damage ... instead" replacement shape
  instead of the ambiguous phrase alone.
- **Signal engine — `graveyardToolbox`'s retrieval pattern didn't
  distinguish a card that only ever retrieves itself from one that offers a
  real choice among different cards.** "Return this card from your
  graveyard to your hand" (Squee, Goblin Nabob; Adéwalé, Breaker of Chains)
  and "return target card from your graveyard to your hand" (Codex
  Shredder; Hanna, Ship's Navigator) share every word except the one that
  matters — the first is repeatable self-recursion, not the flexible,
  many-cards resource this archetype means. Found checking the full card
  pool before shipping. Fixed with an explicit "return this card"
  exclusion.
- **Signal engine — `powerMatters`'s "power N or greater" phrase also
  matched a blocker-size restriction with no connection to the plan.**
  "Each creature you control with power 4 or greater gets +1/+1" (Goreclaw)
  and "can't be blocked by creatures with power 3 or greater" (Delney,
  Streetwise Lookout; April O'Neil, Kunoichi Trainee) share the identical
  phrase for opposite reasons — the second describes a threat to
  opponents' blockers, not a payoff for the controller's own big
  creatures. Found checking the full card pool before shipping. Fixed by
  excluding "blocked by creatures with power N or greater" explicitly.
- **Signal engine — `pillowfort`'s "can't attack you" pattern also matched
  a single-creature lockdown Aura or Equipment with no board-wide
  effect.** "Creatures can't attack you unless their controller pays"
  (Ghostly Prison) and "Enchanted creature ... can't attack you or
  planeswalkers you control" (Vow of Duty, one of a common six-card cycle;
  Assault Suit's identical Equipment shape) share the tail end of the same
  phrase for entirely different plans — the second neutralizes one
  specific creature, usually a Threaten-effect target, not a defensive
  shell around the controller's whole board. Found checking the full card
  pool before shipping. Fixed with an explicit "enchanted/equipped
  creature" exclusion.
- **Signal engine — a wildcard kindred card backed every kindred-caring
  commander in the pool, not just the deck's own themes.** Found verifying
  wildcard kindred above, before merging, by running the real First Sliver
  corpus deck through both the deck-summary and the commander-scoring
  paths — not just the detection unit tests. Two instances of the same
  bug, at two layers:
  - **Deck summary (`groupByTheme`, deckAnalysis.ts).** An ungated fold
    read three of the deck's own incidental type mentions (Realmwalker's
    printed Shapeshifter type, Sliver Overlord's printed Mutant type,
    Forbidden Orchard's opponent-facing Spirit token) as real membership,
    then let the deck's 8 wildcard cards inflate each into a full phantom
    theme — `Shapeshifter Kindred (8)`, `Mutant Kindred (9)`, `Spirit
    Kindred (9)` — out of one incidental card apiece that nobody actually
    built around.
  - **Commander scoring (`scoreCommanders`, synergy.ts) — more severe.**
    With no bucket-level view of how deep any given qualifier actually is,
    the same 8 cards backed *every* kindred-caring commander in the whole
    candidate pool: commanders for types the list owned zero real cards of
    (Kithkin, Ooze, Mercenary, Archer, dozens more) each scored "8
    supporting cards", drowning out the deck's one genuine 56-card Sliver
    signal in the ranking.
  - Both fixed with the same rule, applied separately at each layer: a
    wildcard card only counts toward a qualifier once that qualifier
    already has real, non-wildcard structural depth of its own. New
    `gateWildcardKindredSupporters` (synergy.ts) does this for scoring,
    exempting only the rare commander whose own signal genuinely *is* the
    wildcard (Kolvori, God of Kinship; Morophon, the Boundless).
- **Signal engine — `gameState`'s initiative reward matcher missed its own
  motivating card.** Found verifying the `gameState` archetype above:
  the first draft matched only `"if you've"`/`"if you have" the
  initiative`, but Undercellar Sweep's real wording is third-person and
  doesn't even keep "you" as the sole subject — `"if you or a player
  you're attacking has the initiative"` — so it produced only `produces`,
  never `rewards`. Widened to `/\b(?:has|have|'ve) the initiative\b/i`.

- **Signal engine — `findQualifier` ties the candidate type word to the
  payoff matcher's own match text, not a clause-wide scan.** Follow-up to
  Phase B (part 5)'s signal containment merge, which surfaced this as a
  "Known tension" in `docs/archetypes.md` rather than fixing it there.
  Angel of Glory's Rise — "exile all Zombies, then return all Human
  creature cards from your graveyard to the battlefield" — mis-qualified as
  `reanimator:Zombie` instead of `reanimator:Human`: the old code scanned
  every word in the whole clause and returned the first recognized type,
  which was "Zombies" (merely exiled, earlier in the clause) rather than
  "Human" (the thing actually returned). Now each payoff matcher's own
  match text is checked first — for the `return`/`put` reanimator
  matchers, the type-restricting word sits inside the match itself, so this
  correctly excludes "Zombies," which the match never reaches. Falls back
  to the whole clause only when no matcher's own match text names a type,
  which Sliver Gravemother needs: her restriction ("Each Sliver creature
  card ... has encore") sits structurally outside the bare `encore`
  keyword her matcher hits, verified still correctly qualified as
  `reanimator:Sliver`.
- **Signal engine, Phase A ("stop the false positives"):** see
  `docs/signals-rework.md` for the full plan this lands the first phase of.
  - **A theme needs at least one card that cares, not just cards that belong
    to it.** `signals.ts` archetypes now declare a `definingRole` (default
    `rewards`) and a minimum count of cards that must show it — enforced
    beside `deckAnalysis.ts`'s `MIN_THEME_CARDS` and `synergy.ts`'s
    `MIN_SIGNAL_COUNT`. This supersedes kindred's old blanket exemption from
    "cares, not shares": ten Wizards plus one incidental pump is no longer a
    Wizard theme (kindred and Lands Matter require 2 caring cards; a
    fetchland sacrificing itself is still real evidence for Lands Matter,
    but can no longer constitute the theme alone). `keywordCare` is gated on
    `rewards` specifically rather than any active role — granting a keyword
    to the team is not caring about it, which is what made a Vehicles deck
    read as "Flying" and a Lifegain deck read as "Lifelink".
  - **A single-card "keyword" is not a mechanic.** `import-scryfall.ts` now
    counts keyword frequency across the legal card pool at import and drops
    anything appearing on fewer than 5 cards from the signal vocabulary —
    Universes Beyond flavour ability words (`Prismatic Gallery`, `Bad Wolf`,
    `Chaos Control`, ...) no longer generate a `keywordCare` signal at all.
  - **Kalamax and Dragonsguard Elite no longer read as +1/+1 Counters
    decks.** A new `growsItself` fact (read off raw text, alongside
    `sacrificesItself`) excludes a card whose only `+1/+1` clause targets
    itself from `counters.produces` — that is bookkeeping for a copy
    trigger or Magecraft, not counters production.
  - **Widened `spellslinger.rewards`** to match "cast your first instant
    (or sorcery) spell each turn" and "cast or copy an instant or sorcery
    spell" — Kalamax, Double Vision, Storm-Kiln Artist, Ral Storm Conduit,
    and Arcane Bombardment all register now.
  - **`goWide` is qualifiable by creature type**, so "Sliver creatures you
    control get +1/+1" cites and suggests Slivers instead of forming a
    phantom unqualified Go-Wide theme.
  - Raised `MAX_THEMES` from 6 to 8 (Kalamax and Wilhelt both legitimately
    fill more than 6 axes).
- **Signal engine, Phase A2 ("matcher precision"):** the separable follow-up
  to Phase A — real cards the matchers missed or misread, not new false
  positives to gate.
  - **One shared `sacrificeCost` primitive**, reading only a clause's cost
    side and accepting a named creature type as well as the bare word
    "creature". Fixes two opposite misreadings of the same shape: Wilhelt's
    "you may sacrifice a Zombie" is now recognised as both a Zombie consumer
    *and* an Aristocrats outlet (it required the literal word "creature"
    before); Sophia's "Sacrifice an artifact token: Put a +1/+1 counter on
    each Dog you control" no longer reads as consuming Dogs, because the
    fix stops reading past the ':' into the effect. Krenko's own outlets
    (Goblin Bombardment, Siege-Gang Commander, Arms Dealer, Goblin Grenade)
    and Plumb the Forbidden's "sacrifice one or more creatures" all register
    now.
  - **Explicit matchers for reminder-only keywords** — Exploit, Amass,
    Decayed, Evoke, Blitz, "For Mirrodin!", Demonstrate, and Myriad all
    explain their operative text only in a parenthetical that's already
    stripped by the time matchers run; each now has a matcher on its own
    printed name, in the archetype its mechanic actually belongs to. Amass
    also produces the named creature type *and* Army through the existing
    kindred/token-production machinery, matching real templating ("amass
    Orcs 1" makes a card both an Orc and an Army).
  - **Lord-wording normalisation.** "All Sliver creatures get +1/+1" and
    "Zombies you control get +1/+1" are two decades of the same lord
    templating; a normalisation pass onto one shape replaces what would
    otherwise be a third bespoke regex.
  - **A spelled-out death definition counts as a death trigger.** Aristocrats
    rewards now recognises "is put into a graveyard from the battlefield"
    and "is put into exile from the battlefield" (CR 700.4's own wording for
    "dies"), not just the words "dies"/"dying" — Psychomancer's Harbinger of
    Despair never says either.
  - **Graveyard-filling gaps closed**: "search your library for ... put them
    into your graveyard" (Buried Alive, Unmarked Grave, Disciples of Gix),
    "mill N cards, then ..." with a comma rather than a period (Incarnation
    Technique), and discarding your own cards (Faithless Looting, Thrill of
    Possibility, Windfall, Fact or Fiction, Ideas Unbound) — excluding
    making an *opponent* discard, which stays Mill (Opponents)' territory.
  - **Reanimator widened** past "from your/a graveyard" to "from an
    opponent's graveyard" (Gruesome Encore, Puppeteer Clique), and past the
    literal word "creature" to "permanent" (Sun Titan's own "return target
    permanent card").
  - **"Nth spell each turn" is one family, not just "first".** Alphinaud
    Leveilleur's Eukrasia ("cast your second spell each turn") now matches;
    Dualcast's own cost reduction stays unresolved until the `enables` role
    exists (Phase B).
  - **+1/+1 Counters rewritten against the Sophia corpus deck**: Hardened
    Scales' passive-voice amplifier ("would be put ... instead"); "creature
    with a +1/+1 counter on it" as the dominant payoff templating (Herald of
    Secret Streams, Ainok Bond-Kin, Inspiring Call); The Ozolith's bare
    "counters" (it never says "+1/+1"); "enters with N +1/+1 counters" as
    production, not just "put" (Faithful Watchdog, Wildwood Scourge,
    District Mascot, Giada); Distribute (Ajani, Mentor of Heroes) and
    Proliferate as production.
  - **Two token-descriptor bugs fixed together**: under-reached at one
    intervening word, so "Necron Warrior artifact creature tokens" wasn't
    fully stripped and Their Number Is Legion read as a Necron *payoff*
    rather than just a producer; over-reached by stripping everywhere
    instead of only inside a "create ... token" clause, erasing Gleaming
    Overseer's, Eternal Skylord's, and Dreadhorde Invasion's real
    Zombie-token payoffs. Also recognises "create a token that's a copy of"
    as token production, which never mentioned the words "creature token".
  - **`detectKeywordCare` now matches plurals** — "Foods", "Clues", and
    "Treasures" never matched a bare keyword before (Peregrin Took, The
    Cabbage Merchant).
  - **`voltron.rewards`**: Koll, the Forgemaster's "if it was enchanted or
    equipped" is a genuine reward. Danitha, Puresteel Paladin, Bruenor, and
    Bladehold War-Whip's own equip-cost-reduction/free-equip effects stay
    unresolved on purpose — they're `enables`, not `rewards` (Phase B).
- **A double-faced commander's back face could leak into signal detection
  through the stored `type_line`.** `import-scryfall.ts` stored Scryfall's
  *joined* `type_line` ("Legendary Creature — God // Legendary Artifact —
  Equipment" for Halvar, God of Battle // Sword of the Realms) rather than
  the front face alone, even though the very same function already computes
  the correct front-face-only reading (`frontFaceCharacteristics`) for
  eligibility, creature types, and the legendary/Background flags — just not
  for this column. `signals.ts` regexes `type_line` for `isLand`/
  `isEquipment`/`isAura`, so a transform or modal DFC whose back face is a
  different card type (Halvar as Equipment, Binding Geist // Spectral
  Binding as an Aura) was misread as having that type on its front face,
  feeding a false Voltron/Auras signal. Also removed `isCreature`, which
  this same regex-set computed but nothing ever read.
- **A split/adventure/flip card's own name, spoken by its non-front half,
  wasn't recognised as a self-reference.** Self-reference stripping (so a
  card's own name doesn't get mistaken for caring about a creature type or
  keyword that's merely part of it) passed the whole Scryfall-joined name
  ("Bonecrusher Giant // Stomp") plus `back_name` — but `back_name` is only
  populated for transform/modal_dfc, not split/adventure/flip, even though
  those layouts join their stored name with " // " the same way. A bare
  face name in oracle text (Stomp's own "Stomp deals 2 damage...") was never
  stripped. Now splits the stored name on " // " so every face's own name is
  checked, regardless of layout.
- **An Adventure card's mana cost showed both halves' pips joined together.**
  Scryfall's top-level `mana_cost` for an Adventure card (Bonecrusher Giant,
  Brazen Borrower, and others) is the creature and its Adventure spell joined
  ("{2}{R} // {1}{R}"), the same shape a split card's combined cost uses — but
  unlike a split card, only the front (creature) face's own cost is real
  outside the stack. `@mtg/card-model`'s `frontFaceField` preferred that
  top-level value whenever it was defined, so every Adventure card's stored
  `mana_cost` (and by extension its rendered pips) silently included the
  Adventure spell's cost tacked on. Fixed at the source so both apps' imports
  pick it up; modal DFC and split cards render unchanged.
- **A malformed request body was reported as a 500, not a 400.** `express.json()`
  throws a `SyntaxError` with `status: 400` when a POST body isn't valid JSON,
  before any route handler runs — the shared error middleware discarded that
  and always answered 500, misreporting a client mistake as a server
  incident to anything that branches on status code.
- **`GET /api/cards` had no upper bound on how many oracle_ids one request
  could list**, letting a single request force an unbounded number of
  chunked SQLite queries. Capped at 500, the same purpose `MAX_CARDS` already
  serves for Commander Spellbook requests.
- **The sign-in menu could get stuck loading forever after a network hiccup.**
  `@mtg/profile`'s `useAuth` had no `.catch` on its initial session check; a
  rejected `getSession()` call (a dropped connection, a CSP block) left
  `loading` `true` permanently, hiding the account menu instead of degrading
  to signed-out. Affects every app's `NavBar`.

## [1.8.0] — 2026-08-18

### Added

- **Test coverage for previously-untested paths.** `/api/recommend` now has an end-to-end
  integration test against a real seeded database (`recommend.integration.test.ts`, via
  `supertest`) — `server/src/app.ts` was split out of `index.ts` so tests can import the Express
  app without triggering `app.listen()`. Partner/Background pairing is now spot-checked against
  real Scryfall data (`packages/rules/src/partners.real-data.test.ts`), which found that Tiana,
  Ship's Caretaker isn't actually part of the Partner family as printed today. Favourited combos
  rendering from their stored snapshot with the network blocked is now tested
  (`ComboFavoriteButton.test.tsx`). No behaviour changed — see `docs/handoff.md` and
  `docs/api-policy.md` for details.

- **Optional sign-in, for liking/disliking cards and commanders, tagging a
  liked card as favourite jank, and favouriting or hating combos.**
  Everything else about the app works exactly as before, signed out — this
  is additive, not a gate. Email/password only, via a new `@mtg/profile`
  package (Supabase auth + Postgres, RLS scoping every row to its owner).
  A commander is a card, so "favourite commander" is the same
  `card_preferences` row read where the card is commander-eligible — no
  second table to drift from it. A combo's snapshot is stored at the
  moment you favourite it and rendered from that snapshot afterward;
  favouriting or unfavouriting never re-queries Commander Spellbook, only
  an explicit per-combo refresh does (see `docs/api-policy.md`). Nothing
  about the scoring or ranking changes — this is filter-and-annotate only,
  a badge on cards you've marked, not a new signal feeding the suggestion
  itself. See the About dialog for what's stored.

- **A consistent NavBar shared with the platform's home page and time-counters** (`@mtg/ui`'s new
  `NavBar`) — links to those two tools now show up in this app's header for the first time; the
  About trigger moved into the bar alongside them. The sign-in menu (`AccountMenu`/`AuthDialog`)
  now comes from `@mtg/profile` instead of this app's own copy (also moved off raw
  `@radix-ui/react-dialog` onto `@mtg/ui`'s `Modal` in the process) — one implementation shared
  with the other two tools instead of three hand-maintained ones. No behavior change beyond the new
  links.
- **`GET /api/cards`**, a read-only lookup resolving `card_preferences`' bare oracle_ids back to
  card data (name, image, commander eligibility) — SQLite only, no new Scryfall call. Built for the
  platform's new `/profile` page (`apps/home`), which had no other way to turn a liked/disliked
  card back into something displayable; nothing in this app calls it itself.
- **A render crash no longer white-screens the app.** Nothing caught an
  unexpected throw during render — the whole page unmounted with nothing in
  its place, mid-session, with no way back short of a manual reload. A crash
  now shows a themed recovery screen with a "Try again" action instead.
  TanStack Router wraps every route's own component in its own catch
  boundary, which claims a route's render errors before an outer one ever
  sees them, so the recovery screen is wired in at both levels: the router's
  `defaultErrorComponent` for anything inside a route, and a top-level
  boundary (new shared `@mtg/ui` `ErrorBoundary`) for anything outside the
  routed tree.
- **`/api/recommend`, `/api/combos`, and every other endpoint now return a
  clean JSON error instead of a raw stack trace.** No error-handling
  middleware was registered, so an unexpected throw — inside scoring, say —
  fell through to Express's own default handler: an HTML page with the
  stack trace, not a JSON body an API client could parse. A last-resort
  error handler is now registered after every route; it logs the full
  error server-side and returns a generic message to the client, never the
  error's own text.
- **Filters, sort, and the current page are now part of the URL**, so they
  survive a reload and a link you copy while looking at a filtered/sorted
  view reproduces it (paste your list back in against that link and you're
  back where you left off — the list itself still isn't part of the URL).
  Previously all three lived in component state and reset the moment the
  page refreshed. A visit with nothing customized keeps a plain `/`; only
  what you've actually changed shows up in the address bar. Also fixes a
  latent gap the pagination code's own comment already claimed was handled:
  narrowing the results with a filter while on a later page could leave you
  stranded looking at an empty page instead of being brought back in range.

### Fixed

- **Sign-up confirmation emails linked to `localhost` instead of the deployed
  site.** `useAuth`'s `signUp` call never passed `emailRedirectTo`, so
  Supabase fell back to the project's Auth "Site URL", which was left at its
  local-dev default. Now passes the page's own origin explicitly. The
  Supabase project's Site URL and Redirect URL allow-list also need to be
  updated in the dashboard to the deployed client URL — this fix alone isn't
  sufficient without that.

- **Multi-word creature types like Time Lord were silently dropped.**
  `parseCreatureTypes` filtered the type line word-by-word against Scryfall's
  creature-type catalog, so a two-word type could never survive — neither
  "Time" nor "Lord" is a type on its own, only "Time Lord" together is. That
  made every Time Lord creature (the whole premise of a Doctor's companion
  pairing) invisible to Kindred detection and to the Doctor's-companion
  partner check. Now tries the longest word-run at each position before
  falling back to a single word, so a two-word type is recognized as one
  type instead of being lost entirely.
- **A banned card in your list still counted as synergy support.** Only
  commander candidates were filtered by Commander legality — a card in the
  submitted list itself was matched and scored regardless, so a banned card
  could be cited as a reason for a suggestion. Submitted cards are now
  filtered the same way, and reported separately in the response (`banned`,
  alongside the existing `notFound`) so the match count still adds up
  instead of a banned card silently vanishing. Also applies to combo search,
  which no longer treats a banned card as available for the deck.
- **The singleton-count exception for cards like Nazgûl and Seven Dwarves
  would have silently capped a future card at 1 copy.** `singletonLimit`
  only recognized a spelled-out number word ("up to nine"), with no path
  for a digit ("up to 7") or a word past twelve. Neither real card hits
  this today — both spell their number out, seven and nine — but the
  failure mode was silent, so a future card wouldn't have been caught
  until someone noticed a deck getting under-counted. Now tries a plain
  integer first, unbounded, before falling back to the word list; a value
  that's genuinely neither now logs a warning instead of failing quietly.
- **Hybrid and Phyrexian mana rendered as raw text, and the generic-mana
  disc color had drifted from its own design token.** `{W/U}` showed the
  literal text "W/U" on a grey disc instead of a split white/blue circle,
  `{W/P}` showed "W/P" instead of a Phyrexian glyph, and `--pip-generic`
  had been hardcoded to a slightly different color than the rest of the
  palette rather than reading the shared token. All three traced back to
  `client/src/lib/manaSymbols.ts` being a hand-copied, incomplete extract
  of the mana-font glyphs (6 of 8 symbols, no generator, no way to update
  it — its own header comment pointed at a dependency the app never had)
  instead of the shared, generated, validated set `time-counters` already
  had. Now imports the same `@mtg/mana` package that app uses: hybrids
  split the disc corner to corner, Phyrexian draws as one glyph on one
  disc rather than a split, and `--pip-generic` is a proper token again.
- **A commander candidate's own signals could depend on what else was in
  your list, not just on the candidate's own card.** Candidates were scored
  by recomputing each one's signals per request against a vocabulary built
  only from the submitted list's creature types and keywords. A signal
  backed by a card's own structural type or token data was unaffected, but
  a purely textual qualifier — one named only in a card's oracle text, with
  no structural fallback, like Sliver Gravemother's "Reanimator (Sliver)"
  label — could silently lose its qualifier if the list didn't separately
  include enough of that type. Recomputing per request also meant a card in
  _k_ Partner pairs was processed _k_+1 times on every submission.
  Candidates now read the same precomputed, full-vocabulary `card_signals`
  table the deck-analysis summary already used — computed once at import
  time against every type and keyword in the game, not scoped to whatever
  happened to be pasted in.
- **A card could be flagged as a Kindred payoff for a type it only
  happened to mention.** `detectKindred` ended with a catch-all that
  granted an active "rewards" role to any card whose text mentioned a
  creature-type word without matching one of the specific caring patterns
  (`gets`/`gains`/`has`/`whenever`/`for each`/etc.) — so a common English
  word that's incidentally also a creature type (Wall, Scout, Seal, Elder,
  Noble, Citizen, Mount, Guest, Toy) could make an unrelated card look like
  it cared about that type, given 3+ other citable cards of it. Artificial
  Evolution is a real example: its text names Wall only to rule it out as a
  target ("The new creature type can't be Wall"), not to reward it. The
  catch-all is gone; only the specific caring patterns and the
  sacrifice/tap/discard/exile "consumes" check grant the rewards role now.
- **A modal double-faced commander candidate showed no mana cost at all.**
  Scryfall gives a modal DFC no top-level `mana_cost` — it's cast as one
  face or the other, never both — and the import script's read of it had no
  fallback to the front face's own cost, unlike its `power`/`toughness`/
  `colors` reads, which already did. Every modal DFC (Bala Ged Recovery //
  Bala Ged Sanctuary, and others) was stored with a null mana cost and
  rendered with no pips. Found while extracting `@mtg/card-model`'s shared
  front-face field reader; the import now uses the same one for all three
  fields, so the fallback is consistent instead of present on two of three.

### Changed

- **The suggestion grid scrolls instead of paginating.** Results were capped
  at a page — 12/24/48/96 at a time, chosen from a "Show" dropdown — with
  numbered page buttons below; an unfiltered list routinely produces
  hundreds of suggestions, so most of a match was never on screen unless you
  kept clicking through pages. The grid is now virtualized with TanStack
  Virtual (window-based, since the page itself is the only scroll container
  — there's no inner scrolling pane), rendering only the rows near the
  viewport no matter how large the result set gets, so every result is
  reachable by scrolling. The page-size preference and its dropdown are gone
  along with pagination; there's nothing left to remember a page size for.

## [1.7.1] — 2026-08-01

### Fixed

- **The recommendation response was 12 MB, sent uncompressed.** Two separate
  causes, both measured before anything was changed — see
  `docs/response-size.md`.
  - There was no compression middleware at all. The browser asked for gzip;
    the server answered with 12,224,814 uncompressed bytes.
  - Each cited card was serialized once per commander that cited it. A cited
    card is by definition one of _your_ cards, so one 30-card list produced
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
    Point" made _Control_ a creature type, so every card saying "creatures you
    control" registered as caring about Control Kindred — a 30-card
    aristocrats list came back with a 14-card "Control Kindred" theme.
  - A creature card's subtypes still are not all creature types, and are not
    positionally separable: "Artifact Creature — Equipment Boar" and "Kindred
    Enchantment — Lhurgoyf Aura" each carry one of each. That made Equipment,
    Aura, and Saga creature types. The vocabulary now comes from Scryfall's
    creature-type catalog rather than being inferred.
  - Joke-set type lines ("Creature — Lady of Proper Etiquette") made _of_ a
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
  questions like "which cards _produce_ Goblins" or "which cards _reward_
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
- Results-per-page options are **12 / 24 / 48 / 96**, replacing 9 / 18 / 36 / 72. All of them still fill whole rows of the grid, and the new set does so
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
  how many of your _other_ themes the card also feeds — the one ranking input
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
  capacity each card participates (it _is_ the resource, _produces_ it,
  _consumes_ it, _rewards_ it, or _amplifies_ it). What this changes in
  practice:
  - **A commander has to actually care.** Sharing a property is never enough.
    Being a Frog Horror doesn't make one a Horror commander, and a card's
    _name_ is no longer evidence of anything — Gitrog, Horror of Zhava was
    matching Horror kindred purely because "Horror" is in its name, while its
    abilities are entirely about lands. 267 Commander-eligible cards in the
    current card data have a creature type that reaches their rules text only
    through their own name.
  - **Keywords alone are no longer a synergy.** Two cards both having Trample
    means nothing; a commander that _grants_ trample to your team, the way
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

- Double-faced cards whose _back_ is a legendary creature are no longer
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
  no longer does. A commander need not _be_ the type it cares about —
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

[Unreleased]: https://github.com/mkane848/KaneEnabler/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/mkane848/KaneEnabler/compare/v1.7.1...v1.8.0
[1.1.0]: https://github.com/mkane848/KaneEnabler/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mkane848/KaneEnabler/releases/tag/v1.0.0
