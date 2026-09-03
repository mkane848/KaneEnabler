# The signal vocabulary

What the commander recommender means by a _role_, an _archetype_, a _qualifier_, and a _card
property_ — and, for each rule, the real deck that forced it.

This document is the arguable artefact. `server/src/services/signals.ts` is its encoding; if the two
ever disagree, that is a bug in one of them, and this file says which behaviour was intended and why.
Read [`commander-recommender.md`](./commander-recommender.md) first for how the scorer consumes any
of this, and [`signals-rework.md`](./signals-rework.md) for the implementation plan that turns the
proposals below into code.

The corpus itself is committed at
`apps/commander-recommender/server/src/services/__fixtures__/decks/` — every "backed by N decks"
claim here is checkable against real lists.

## How this was built

Twenty of the repo owner's real Commander decks were traced by hand against the matchers in
`signals.ts`, using oracle text pulled from Scryfall rather than recalled (root CLAUDE.md hard rule 4).
For each deck the owner then confirmed the intended game plan, so every rule below is anchored to a
deck someone actually plays rather than to a hypothetical.

**A rule backed by one deck is marked as such.** Coverage counts are the honest measure of confidence
here — there is no play-rate or win-rate data behind any of it.

### The corpus

| Fixture                       | Commander                     | Identity   | Confirmed axes                                                     |
| ----------------------------- | ----------------------------- | ---------- | ------------------------------------------------------------------ |
| `kalamax.txt`                 | Kalamax, the Stormsire        | Temur      | Copy, burn, power-into-damage, go-wide                             |
| `miles.txt`                   | Miles "Tails" Prower          | Azorius    | Vehicles, artifacts, wrath-proof threats, draw                     |
| `first-sliver.txt`            | The First Sliver              | 5-colour   | Cascade, lords, toolbox, resilience                                |
| `wilhelt.txt`                 | Wilhelt, the Rotcleaver       | Dimir      | Sac loops, drain, alpha strike, reanimation                        |
| `trazyn.txt`                  | Trazyn the Infinite           | Mono-black | **Main:** graveyard toolbox, big mana · **Fallback:** aggro, drain |
| `obeka.txt`                   | Obeka, Brute Chronologist     | Grixis     | Temporary effects + turn denial                                    |
| `sophia.txt`                  | Sophia, Dogged Detective      | Bant       | Dogs, +1/+1 counters, Food/Clue/Treasure, go-wide                  |
| `bre.txt`                     | Bre of Clan Stoutarm          | Boros      | Lifegain→free spells, Equipment, damage doubling, impulse          |
| `yshtola.txt`                 | Y'shtola, Night's Blessed     | Esper      | Drain, pillowfort, spellslinger, politics, **MV-vs-cost**          |
| `krenko.txt`                  | Krenko, Mob Boss              | Mono-red   | Goblins                                                            |
| `eirdu.txt`                   | Eirdu // Isilu                | Orzhov     | Aristocrats, lifegain, persist                                     |
| `sauron.txt`                  | Sauron, the Dark Lord         | Grixis     | The Ring, amass, discard                                           |
| `morcant.txt`                 | High Perfect Morcant          | Golgari    | Elves, −1/−1 counters, proliferate                                 |
| `brigid.txt`                  | Brigid, Clachan's Heart       | Selesnya   | Kithkin, creatures-entering payoffs                                |
| `giada.txt`                   | Giada, Font of Hope           | Mono-white | Angels, lifegain, counters                                         |
| `shadow.txt`                  | Shadow the Hedgehog           | Rakdos     | Treasure aristocrats                                               |
| `radagast.txt`                | Radagast the Brown            | Mono-green | Power matters, stompy                                              |
| `tenth-doctor-rose-tyler.txt` | The Tenth Doctor + Rose Tyler | Jeskai     | Time counters, suspend                                             |
| `watcher-in-the-water.txt`    | The Watcher in the Water      | Mono-blue  | Draw matters                                                       |
| `captain-howler.txt`          | Captain Howler, Sea Scourge   | Izzet      | Cycling, discard                                                   |

**Twenty for twenty are multi-axis.** Every owner selected every offered axis. Only Trazyn ranked
them (main plan versus fallback). That is the single most consistent finding in the corpus, and it is
why `DIMINISHING_FACTOR` (`synergy.ts:254`) is flagged for review rather than treated as settled.

### Grounding: vetted vs inferred

Every archetype through Phase E was traced against a named deck above before it shipped — that is
what "backed by N decks" means everywhere in this document. Starting with Phase C3, the repo owner
asked to build ahead of that rather than wait on a named deck for every remaining archetype:
**inferring from established Magic patterns and this catalog's own conventions is now an accepted
way to ship, not just a stopgap.** The corpus-first discipline underneath this document does not
relax — real oracle text, pulled from the seeded database, is still the only thing any matcher is
ever written against (root CLAUDE.md hard rule 4 stays absolute), and a new archetype is still
checked against the full legal card pool for false positives before it ships, the same rigor every
Vetted entry already got. What changes is only whether a real deck in the corpus is confirmed to
build around it.

Every archetype below carries one of two tags, so the difference stays legible at a glance rather
than requiring a re-derivation each time:

- **Vetted** — a named deck in the corpus above confirms this axis. The deck is cited by name.
- **Inferred** — built from established Magic patterns and checked against the full legal card pool
  for false positives, but no deck in the corpus is confirmed to build around it yet.

**Flip the tag in place when a real deck later confirms or corrects an Inferred entry — the
archetype's own shape (qualifier, roles, lifecycle) is not expected to change to accommodate that.**
An Inferred archetype is built with the exact same `ArchetypeDef`/`LifecycleSpec` machinery as a
Vetted one, using real card text throughout; the only thing a later deck example adds is the
citation and, if it turns up a pattern the inference missed, a new matcher alongside the existing
ones — not a redesign. This is also why "Inferred" is not a synonym for "guessed": the corpus tier
table below (`docs/signals-rework.md`'s own Phase C3 note) turned out to already name a real deck
for six of Phase C3's seven archetypes once the corpus table above was checked archetype-by-archetype
rather than assumed absent — only `monoColorDevotion` is genuinely ungrounded so far.

---

## Roles

**A role is the capacity in which a card participates in an archetype.** A card does not "have" a
theme; it plays a part in one, and it can play several parts in several themes at once.

| Role        | Meaning                                                                                                                                                                                                                     | The card that forced it                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `is`        | The card **is** the resource — a Goblin, an Equipment, a land. Read from structured data (type line, creature types), never from text, and **never from the card's name**. Passive: never qualifies a commander on its own. | Goblin Sharpshooter, which is a Goblin by type line and never mentions Goblins |
| `produces`  | The card **makes** the resource — tokens, extra land drops, cards into your own graveyard.                                                                                                                                  | Krenko's Command                                                               |
| `consumes`  | The card **needs** the resource as a cost — `"Sacrifice a creature:"`, `"Tap ten untapped Elves:"`.                                                                                                                         | Viscera Seer                                                                   |
| `rewards`   | The card **benefits** from the resource existing or the event happening. **This is an archetype's identity** — see `definingRole`.                                                                                          | Blood Artist                                                                   |
| `amplifies` | The card **doubles or repeats** the resource or event. Generates nothing alone.                                                                                                                                             | Doubling Season; Hardened Scales                                               |
| `enables`   | The card **turns the engine on** without being it.                                                                                                                                                                          | **Obeka** — a whole deck whose thesis is three enablers                        |
| `protects`  | The card **keeps the engine running**. Must be archetype-scoped, never generic hexproof.                                                                                                                                    | Sliver Hivelord; Snakeskin Veil                                                |

`ACTIVE_ROLES` is everything except `is`. A commander needs at least one active role in an archetype
to be suggested for it — this is the generalised "cares, not shares" rule. Silas Renn _is_ a Human
and never mentions Humans, so he is not a Human commander.

### Why `enables` and `protects` were added

The previous five-role vocabulary carried a self-documented gap: _"Goblin Sharpshooter … enables a
loop it does not itself contain, and no role below captures 'enables'."_ Three decks made that gap
expensive:

- **Obeka.** ~25 cards carry a delayed `"sacrifice it at the beginning of the next end step"`; three
  cards (Obeka, Sundial of the Infinite, Glorious End) erase that trigger. Those three are the deck.
  Under five roles they are unclassifiable.
- **Kalamax.** Six cards tap a creature for mana (Springleaf Drum, Holdout Settlement, Survivors'
  Encampment, Gene Pollinator, Relic of Legends, Honor-Worn Shaku). Confirmed deliberate: they exist
  to turn Kalamax on at instant speed. They are not ramp.
- **Bre.** Equip-cost reduction and free-equip — Puresteel Paladin's `equip {0}`, Bruenor's free
  equip, Danitha's cost reduction — are payoffs in every practical sense but fail `voltron.rewards`,
  and correctly so. They are `enables`.

`protects` earns its place across every deck with a commander-dependent engine, and one card proves
it must be inferred from _effect_ rather than matched on words: **Obeka can end an opponent's turn**,
making her a fog and a way to strand spells on the stack. Nothing in her text says "protect".

---

## Qualifiers

A signal can be **narrowed** to a specific thing, and then it only counts supporters of that thing.
Sliver Gravemother reanimates Slivers, so a non-Sliver creature in your graveyard supports her not at
all.

| Kind               | Example signal                                                               | Notes                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `creatureType`     | `kindred:Sliver`, `reanimator:Zombie`, `goWide:Sliver`, `aristocrats:Zombie` | The original. `goWide`/`reanimator`/`aristocrats` become qualifiable to stop a lord or type-restricted death payoff forming a phantom generic theme. A produces-only match that names no type of its own can also _borrow_ one from this same card's kindred signal — see "A produces-only match can borrow from kindred" below. |
| `keyword`          | `keywordCare:Cascade`                                                        | See the keyword-shadow rule below — heavily restricted.                                                                                                                                                                                                                                                                          |
| `cardType`         | `copyEffects:instant`                                                        | Kalamax copies **instants only**; suggesting sorceries for him is wrong.                                                                                                                                                                                                                                                         |
| `permanentSubtype` | `artifacts:Vehicle`, `artifacts:Food`                                        | Miles's fifteen Vehicles and Sophia's Food engine ride the same mechanism. Uses a curated constant list — **not** a new Scryfall catalog fetch, which would be an api-policy-gated change.                                                                                                                                       |
| `counterType`      | `counters:+1/+1`, `counters:-1/-1`, `counters:time`                          | See "Counters are a family" below.                                                                                                                                                                                                                                                                                               |
| `gameState`        | `gameState:theRing`, `gameState:monarch`                                     | Persistent shared state that many cards read and write.                                                                                                                                                                                                                                                                          |

### Two relations between qualified signals

Both were forced by real decks, and both are the same mechanism:

**Unqualified supports qualified, never the reverse.** Wilhelt's deck has one unqualified
reanimation effect and two `reanimator:Zombie` effects. Grouped separately, both fall under
`MIN_THEME_CARDS` and **the deck's entire reanimation axis vanishes** — despite five reanimation
spells. A card that reanimates _anything_ obviously reanimates Zombies.

**Wildcard kindred (`*`) — shipped.** Cards reading `"choose a creature type"` support _any_ kindred
theme and form none of their own: Herald's Horn, Vanquisher's Banner, Gathering Stone, Three Tree
City, Secluded Courtyard, Unclaimed Territory, Path of Ancestry, Realmwalker (via `"shares a
creature type with your commander"`'s dynamic variant, Path of Ancestry). Eight cards confirmed by
textual search against the seeded database, one short of this section's original claim of "ten" —
recorded here rather than silently rounded down; the other two, if real, weren't found by
`"choose a creature type"` or the commander-sharing phrasing and may use different wording or may
have been an overcount. All eight now register as Sliver cards: `first-sliver.txt` reports `Sliver
Kindred (56)`, not the 48 it reported before this landed. See "Behaviours verified as correct"
below for a severe regression this shipped with and fixed before merging — an ungated fold let these
same eight cards inflate _every_ kindred-caring commander in the whole pool, not just the deck's own
themes.

### A produces-only match can borrow from this same card's own kindred signal

Ajani, Nacatl Pariah // Ajani, Nacatl Avenger only ever matches `goWide` via `produces` (he makes a Cat
token, twice) — no clause of his own scales with board size the way `goWide`'s own `rewards` regexes
look for, so `findQualifier` correctly leaves him unqualified, generic Go-Wide Combat. `findQualifier`
deliberately never reads a `produces` clause for a restriction (Gothmog's `amass Orcs 1` is genuine
go-wide production regardless of the type it happens to create, not a restriction to it — see its own
comment in `signals.ts`), so this can never be fixed by widening that scan. But Ajani's own
`"Whenever one or more other Cats you control die..."` transform trigger is a _different_ clause that
independently earns `kindred:Cat` an active, non-`produces` role (`rewards`) — real evidence that the
same card's otherwise-generic `goWide` match should read as `goWide:Cat` too.

`detectSignals` now borrows a qualifier this way for any `creatureType`-qualifiable archetype
(`goWide`, `reanimator`, `aristocrats`) whose own match on a card is `produces` alone: if this same
card independently has exactly one kindred type with a role beyond bare production, that type
qualifies the otherwise-generic match. Two or more candidate types, or zero, and it stays unqualified
rather than guessing — the same posture `findQualifier` itself takes for "one of each" and
ability-copy clauses.

**This does not reopen the Gothmog case, and is not "produces can now qualify."** The rule borrowed
from is narrower: _a different, already-active signal on the same card can lend its qualifier_ to a
match that has no identity of its own beyond producing the resource. Gothmog's `kindred:Orc` and
`kindred:Army` are themselves `produces`-only (nothing else on his card cares about Orcs or Armies), so
there is nothing to borrow and he stays unqualified, exactly as before. The gate is also scoped to a
`produces`-only _match_, not merely an unqualified one: a commander that generically "Sacrifice a
creature: Draw a card" and, in a wholly unrelated ability, buffs a tribe it doesn't otherwise interact
with must not have that unrelated tribe hijack its Aristocrats identity — that outlet really does take
any creature. Only when the archetype's own matched roles are `produces` and nothing else does the
card have no identity of its own to protect.

A borrowed qualifier is also weaker evidence than one read directly off the archetype's own text
(`qualifierSource: 'kindred'` on the `SignalMatch`, unset for every other qualifier). Citation is
correspondingly stricter: the "unqualified pool card still counts" fallback that lets Wilhelt's
generic reanimation spells back `Reanimator (Zombie)` does not apply here — a pool card must itself be
of the borrowed type, produce a token of it, or carry its own matching qualified signal
(`synergy.ts`'s `supporterMatches`).

### A produces-only SUPPORTER doesn't back a qualified signal either, borrowed or not

Kratos, Stoic Father's `"whenever a God dies, you get an experience counter"` names "God" directly, so
his `aristocrats:God` signal is **text-qualified**, not borrowed — the Wilhelt-style permissive path,
untouched by the borrowing fix above. Even there, a real user's citation list for him surfaced three
cards (Kavaron Harrier, Goro-Goro Disciple of Ryusei, Young Pyromancer) whose only aristocrats role is
`produces` — each makes a _fixed_, non-God token (a Robot, a Dragon Spirit, an Elemental) — cited
purely because the old "unqualified own signal still counts" fallback checked whether a pool card
belonged to the archetype at all, never _which role_ it played in it.

The fix generalises the same distinction the borrowing rule already draws, applied to the supporter
side of `supporterMatches` instead of the commander side: `produces` makes something fixed by the
card's own text, so it can never satisfy a type it doesn't already produce, no matter how good the
card is generically. `consumes`/`rewards` operate on a flexible, at-the-table choice ("a creature,"
"target creature," "another creature you control") that genuinely could be the qualified type — the
same reasoning that makes Wilhelt's unrestricted reanimation spell ("return target creature card from
your graveyard") a real Zombie reanimator even though its own text never says Zombie. Stalking
Vengeance's `"whenever another creature you control dies..."` is exactly this shape and correctly
keeps backing "Aristocrats (God)"; Kavaron Harrier's `produces`-only token no longer does. Applies
uniformly across every qualifier kind, not just `creatureType` — the rigid/flexible distinction
doesn't depend on what's being narrowed. An exact qualifier match on the supporter's own signal (or
the kindred wildcard `*`) is exempt from this check: it's already proven relevant regardless of role,
the same way a Sliver Gravemother bystander counts by structural type alone.

### Death-trigger precision: replacement effects and combat kills are not Aristocrats rewards

Two more bugs the same real citation list surfaced, both regex-precision issues independent of the
qualifier work above, verified against the full legal card pool (40 previously-mismatched cards
sampled by hand across both categories, zero false corrections found; 0 cards newly gained a false
positive, 240 correctly lost one):

- **`"if [x] would die ... instead"` is a replacement effect, not a death payoff — nothing actually
  dies.** Flame-Blessed Bolt's `"If that creature or planeswalker would die this turn, exile it
instead"` matched the `dies?` regex the produces-only-borrowing fix widened to catch the plural
  "die." This turns out to be an extremely common burn-spell template — Pillar of Flame, Touch of the
  Void, Obliterating Bolt, Spikefield Hazard, Underworld Fires, and others all read `"If a creature
dealt damage this way would die this turn, exile it instead"` near-verbatim. Excluded with a
  lookbehind (`(?<!would )`) immediately before the death word, kept inside the same regex rather than
  converted to a function matcher — `findQualifier` explicitly skips function matchers when scanning
  for a qualifying type, and this exact regex is what supplies "Cat" for Ajani's and "Zombie" for
  Wilhelt's qualification, so converting it would silently regress both.
- **`"a creature dealt damage by [source] ... dies"` is combat/removal value on an opponent's
  creature, not your own board dying.** Markov Enforcer's `"Whenever a creature dealt damage by this
creature this turn dies, create a Blood token"` only ever fires on whatever it just fought — the
  death-trigger regex never checked whose creature was dying. Same real template recurs on Blood
  Cultist, Seraph, Sengir Bats, Vampiric Embrace, and others. Excluded with a repeated negative
  lookahead across the gap (`(?:(?!dealt damage by)[^.;])*`) so "dealt damage by" can't appear anywhere
  between the trigger word and the death word — same regex-not-function constraint as above.

### Sacrifice-cost precision: a comma isn't always a cost boundary, and creature isn't always the plan

Two further bugs, both in `sacrificesKind`/`sacrificesACreature`'s cost-side scan (`signals.ts`), also
verified against the full pool with zero false corrections in the sampled cards:

- **A triggered ability's condition and effect can be comma-joined instead of colon-joined, and the
  old cost-side scan didn't know to stop there.** Blood Hypnotist's `"Whenever you sacrifice one or
more Blood tokens, target creature can't block this turn"` never sacrifices a creature at all — Blood
  tokens are artifacts — but the unbounded scan credited it with one anyway, reading the _unrelated
  later_ "target creature" (the effect's own target, past the comma) as the sacrificed object. The same
  shape recurs whenever the sacrificed thing isn't a creature but "creature" appears later in the same
  sentence for an unrelated reason — Crime Novelist and Daring Sleuth sacrifice artifacts/Clues and
  mention "creature" only as an unrelated buff/transform target; Nyssa of Traken and Szarel, Genesis
  Shepherd sacrifice artifacts/permanents and mention "creature" only as an unrelated ability target.
  Fixed by anchoring the scan on the word "sacrifice" itself and bounding it to the next comma _after_
  that point, rather than scanning the whole remaining clause — this also had to keep respecting an
  activated ability's `:` first and unchanged (Nim Devourer's `"{B}{B}: Return this card from your
graveyard to the battlefield, then sacrifice a creature"` pays only `{B}{B}` to activate; the
  sacrifice is part of the _effect_, not the cost, and an earlier version of this fix that searched for
  "sacrifice" before checking for a colon at all wrongly credited this, Polygraph Orb, and Sorin,
  Imperious Bloodlord with a consumes role none of the three have — caught by the same full-pool
  before/after diff, not by any of the eight cards that motivated the fix).
- **Creature listed alongside other fungible resources in one sacrifice cost isn't a creature-specific
  plan, even though creature is a literal legal choice.** Greater Gargadon's `"Sacrifice an artifact,
creature, or land: Remove a time counter..."` is a suspend-acceleration cost with no preference
  toward creatures at all — consistent with Aristocrats' own description ("deliberately
  creature-specific: sacrificing an artifact or a land is a different deck"). This turns out to be the
  single most common shape among the newly-excluded cards: "sacrifice another creature or artifact,"
  "creature or land," "creature or enchantment," "creature or planeswalker," and Braids, Arisen
  Nightmare's five-way `"artifact, creature, enchantment, land, or planeswalker"` all recur across the
  pool. A new `sacrificesCreatureSpecifically` check (used only by `aristocrats.consumes`, not by
  `detectKindred`'s own per-type calls, which are already type-specific by construction) requires the
  cost not list a non-creature resource (artifact/land/permanent/enchantment/planeswalker) alongside
  creature via a comma/"or" list.

### `deckAnalysis.ts`'s own "unqualified supports qualified" fold is a related, still-open gap

`groupByTheme`'s fold (deck-level theme summaries, independent of any commander) uses `ownSignalContains`
directly and unconditionally — it has none of `supporterMatches`'s qualifier-kind structural fallback
or the produces/flexible-role distinction above. A submitted list containing one of the produces-only
cards this section describes would still have it silently folded into every qualified variant of that
archetype the list happens to contain, the same false-positive shape this section fixes for commander
suggestions. Deliberately out of scope here — `scoreCommanders`/`supporterMatches` is what a real
citation list actually renders from, and `groupByTheme` is a second, separate consumer that would need
its own pass.

### Counters are a family, not a keyword

`counters` matches the literal string `+1/+1`. That is one counter kind out of at least a dozen the
corpus cares about:

| Kind                                                                      | Corpus evidence                                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| −1/−1 (`blight`, `persist`)                                               | Morcant, Evershrike's Gift, Pyrrhic Strike, Reluctant Dounguard, Bristlebane Battler, Eirdu // Isilu, Rhys, Puppeteer Clique                    |
| time (suspend, vanishing, time travel)                                    | ~25 cards in the Tenth Doctor deck                                                                                                              |
| stun                                                                      | The Watcher in the Water enters with nine                                                                                                       |
| lore (Sagas)                                                              | six decks                                                                                                                                       |
| burden, oil, corpse, supply, foreshadow, stash, eon, enlightened, loyalty | The One Ring, Urabrask's Forge, Crowded Crypt, Stocking the Pantry, Ominous Seas, Glittering Stockpile, Out of the Tombs, Book of Exalted Deeds |

And `proliferate` touches all of them at once — Morcant's second ability, Thirsting Roots.

**This is not new rules work.** `packages/rules/src/counters.ts` already defines `CounterMechanic`,
`TIME_COUNTER_MECHANICS` (suspend and vanishing, cited to **CR 702.62**, correctly excluding fade and
lore counters) and `turnStepForMechanic`. It was written for `time-counters` and the recommender has
never imported it. Root CLAUDE.md hard rule 2 says a primitive lives in `@mtg/rules` once and apps
consume it — so the work is to consume and widen it, not to add a regex here.

---

## Card properties

**A property is something a card _is_, which archetypes then read. It is not itself a plan.** This
dimension does not exist in the engine today and was named by the deck owner rather than derived.

On Y'shtola — who triggers on _"a noncreature spell with **mana value 3 or greater**"_ — the owner
described choosing cards that _"TECHNICALLY trigger the mana value trigger but can be paid with
alternative costs."_ Mana value is read off the printed cost regardless of what you actually paid, so
Fierce Guardianship ({2}{U}, free with a commander), Dismember ({1}{B/P}{B/P}) and Snuff Out ({3}{B},
zero mana and 4 life) all trigger her for nearly nothing.

| Property          | Derived from                                                                                                                                                               | What reads it                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alternativeCost` | Phyrexian pips in `mana_cost`; `"rather than pay this spell's mana cost"`; `"if you control a commander"`; `"without paying its mana cost"`; evoke, cleave, delve, convoke | `freeSpells`; combined with `cmc` it answers _"your commander wants mana value 3+ — here are cards with mana value 3+ that cost less than that to cast"_                                |
| `modified`        | Equipment attached, Auras attached, counters on it (a CR umbrella term)                                                                                                    | `voltron`, `counters` — Kodama of the West Tree                                                                                                                                         |
| `alternateWin`    | `"you win the game"`                                                                                                                                                       | The `alternateWin` archetype (Phase C4) — see "Shipping today" below. Knuckles the Echidna, Approach of the Second Sun, Doctor Doom, Unrivaled, Ramses, Assassin Lord, Zenos yae Galvus |

`cards` already stores both `cmc` and `mana_cost`, so this is a derived fact in `buildCardFacts`, not
new data. It also explains why Snuff Out belongs to two lists at once: not two archetypes, **one
property read by both**.

**Correction, checked against the seeded database:** The Book of Exalted Deeds does not itself
qualify for `alternateWin`. Its own text only ever _grants_ an Angel "you can't lose the game and
your opponents can't win the game" — a symmetric protection clause, not a win condition for its own
controller. That shape (also on Platinum Persecutor, Herald of Eternal Dawn, Celestine Reef,
Everybody Lives!) is a genuinely different property, and still has no archetype reading it — the
distinction the `alternateWin` archetype (Phase C4) exists specifically to draw.

---

## Archetypes

Each archetype declares a **`definingRole`** (default `rewards`) and a **minimum** (default 1). See
"The rules that are settled" for why.

### Shipping today

Every entry below is **Vetted** (see "Grounding: vetted vs inferred" above) except where its own
Notes cell says otherwise — Phases A through E all shipped against a named deck.

| Key                 | `definingRole`   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aristocrats`       | `rewards` ×1     | Deliberately creature-specific. Sacrificing an artifact or land is a different deck. Becomes `qualifiable: creatureType` (Ajani, Nacatl Pariah's Cat-restricted death trigger); its own death-trigger regexes were also widened from `dies\|dying` to `dies?\|dying` — a plural subject reads "die", not "dies".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `goWide`            | `rewards` ×1     | Becomes `qualifiable: creatureType`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `voltron`           | `rewards` ×1     | Payoff matchers were narrowed after a false positive and overshot — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `landsMatter`       | `rewards` **×2** | Fetchlands alone must never constitute a theme.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `spellslinger`      | `rewards` ×1     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `counters`          | `rewards` ×1     | Becomes `qualifiable: counterType`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `reanimator`        | `rewards` ×1     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `selfMill`          | `produces` ×1    | Filling your own graveyard on purpose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `opponentMill`      | `produces` ×1    | An attack, not a resource. Kept separate on purpose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `kindred`           | `rewards` **×2** | Generated per creature type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `keywordCare`       | `rewards` ×1     | Heavily restricted — see the keyword-shadow rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `copyEffects`       | `rewards` ×1     | Becomes `qualifiable: cardType`. No lifecycle yet — one undifferentiated `rewards` role, same shape as `selfMill`/`opponentMill`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `freeSpells`        | `produces` ×1    | No separate payoff role — granting a free/reduced cast is the identity itself. Reads `alternativeCost`, plus Cascade/Discover/Suspend/Plot/Rebound from the bare keyword (their own reminder text is the only place they say "without paying its mana cost", and reminder text is stripped).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `artifacts`         | `rewards` ×1     | Becomes `qualifiable: permanentSubtype`, scoped to `Vehicle`/`Food`/`Clue`/`Treasure` only — `Equipment`/`Saga` are `PERMANENT_SUBTYPES` too, but voltron's and counters' territory, not this archetype's `is` role. A card's own structural subtype qualifies it directly (Smuggler's Copter needs no text to be a Vehicle) _except_ when its own reward reads artifacts generically (Cranial Plating is an Equipment but "for each artifact you control" doesn't restrict to Equipment — see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `gameState`         | `produces` ×1    | Becomes `qualifiable: gameState`, one of five named states (`theRing`, `monarch`, `initiative`, `maxSpeed`, `dayNight`) computed once onto `CardFacts.gameStates` via a dedicated keyword-and-text detector, the same shape as `counterType` — not the payoff-matcher clause scan `cardType`/`permanentSubtype` use. Max speed and day/night lean on the literal Scryfall `keywords` array where reminder text is the only place the mechanic names itself (`Start your engines!`, `Daybound`, `Nightbound`); the Ring, the monarch, and the initiative are text-only, no matching keyword exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lifegain`          | `rewards` ×1     | No qualifier — unlike `counters`/`gameState`, there's no restricted "kind" a payoff cares about, just the event itself. Granting lifelink (not merely having it structurally) is `produces`, resolving the keyword-shadow rule's own Bre example below — a bare "creature ... with lifelink" _selection_ (Duskfang Mentor's second ability) is deliberately excluded from production, since caring about existing lifelink creatures isn't granting it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `drain`             | `produces` ×1    | No qualifier, same reasoning as `lifegain`. No separate payoff role — causing the life loss _is_ the identity, same shape as `freeSpells`. Sanguine Bond/Vito's "whenever you gain life, opponent loses that much" is still `produces`, since their trigger reads a _different_ resource (lifegain) — but a card whose trigger IS "an opponent loses life" itself (Exquisite Blood, Bloodthirsty Conqueror) is `rewards` only, since it reads someone else's loss rather than causing it; `DRAIN_TRIGGER_READS_LOSS` is the shared pattern both roles check to keep that split exact rather than double-counting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `cyclingDiscard`    | `produces` ×1    | No qualifier. No separate payoff role, same shape as `drain`/`freeSpells` — discarding on purpose is the identity, not a means to some other reward. The Cycling keyword alone is `produces`; a card whose trigger IS discarding/cycling itself (Ivora's counter, Rielle's card draw) is `rewards` only via the same causes-vs-reads split `drain` uses, `CYCLING_DISCARD_TRIGGER_READS_DISCARD` playing `DRAIN_TRIGGER_READS_LOSS`'s role. Deliberately overlaps `selfMill` (a discarded card also fills the graveyard) rather than replacing it — see below for why that overlap is left alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `temporaryEffects`  | `enables` ×1     | No qualifier. `definingRole: enables`, not `produces` — the ~25 delayed-cost cards (Sneak Attack, Puppeteer Clique) are common, often-incidental staples across many decks, but the enablers that erase their cleanup trigger (Obeka, Sundial of the Infinite, Glorious End: `"end the turn"`) are the actual, rare identity — "those three are the deck" per the `enables` role's own motivating section above. Unearth/Encore/Dash/Blitz/Mobilize/Warp's entire cleanup template lives inside their own reminder text (the same problem Cascade/Suspend forced on `freeSpells`), so `produces` reads `CardFacts.keywords` for a card that has one of them and a granting-clause text pattern for a card that grants one to others.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `recursion`         | `produces` ×1    | No qualifier. Persist/Undying (own keyword or granted via text — Isilu, Carrier of Twilight: "has persist"; Mikaeus, the Unhallowed: "have undying"), Gravecrawler's repeatable self-cast template, and Prized Amalgam's repeatable self-return trigger — all scoped, via the full card pool, to exclude Flashback/Escape/Unearth's _one-shot_ "cast/return this card ... then exile it" shape, which is a different plan (graveyard value or `temporaryEffects`), not this. `amplifies`: the deck's own combo piece per the repo owner — a card that puts a +1/+1 counter on an _entering_ creature (Cathars' Crusade: `"on each creature you control"`, not a card that only buffs itself) cancels Persist's own -1/-1 counter under CR 704.5q, letting the loop repeat instead of firing once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tapForValue`       | `produces` ×1    | No qualifier. Like `recursion`, only one of the tier table's two decks has confirmed textual backing — kalamax.txt, via the six mana-tap enablers `docs/archetypes.md`'s own `enables` section already names by card (Springleaf Drum, Holdout Settlement, Survivors' Encampment, Gene Pollinator, Relic of Legends, Honor-Worn Shaku); shipped on that grounding alone rather than inventing a second deck. Two `produces` shapes, both combo _ingredients_ per the "flag ingredients, do not detect loops" rule above, not loop detection itself: tapping a _different_ permanent you control as a cost for something else (never a card's own bare `{T}:` ability, which is ubiquitous and not itself evidence of anything), and untapping your own permanents for free (Seedborn Muse). Kalamax herself doesn't qualify — her text only reads "if Kalamax is tapped" as a condition; she's the beneficiary of this archetype, not its identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `cardDraw`          | `produces` ×1    | No qualifier. **Phase C3's first archetype** — see below for the tier and its own grounding correction. Two decks: watcher-in-the-water.txt (primary — its own corpus note names the amplifies role and all three doubler cards by hand) and miles.txt (secondary, "draw engine" as one of four confirmed axes). Repeatable engines are `produces` (Rhystic Study, Mystic Remora, Archmage Emeritus, Sram), a trigger reading you drawing is `rewards` (Chasm Skulker, Homunculus Horde), and a pure doubling replacement effect is `amplifies` (Teferi's Ageless Insight, Thought Reflection, Alhammarret's Archive — the last also amplifies `lifegain`, one card correctly earning both). Checked against the full legal card pool before shipping, not just the two grounding decks: an initial ungated `produces` pattern rescued 124 previously zero-active-signal commanders at once — plausible on its own, since drawing a card is one of the most common templated effects in Magic, but the sweep still turned up two real false-positive shapes (a third-person "draws" naming only an opponent as its subject — Vendilion Clique, Mathas, Fiend Seeker — and a replacement effect that redirects a draw into something else entirely — Eruth, Tormented Prophet, Urabrask, Heretic Praetor) before the final version shipped; see "Behaviours verified as correct" below for the full account.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `burn`              | `produces` ×1    | No qualifier. Phase C3's second archetype, one deck: kalamax.txt's own confirmed axes name it directly ("Copy, burn, power-into-damage, go-wide"; `copyEffects` and `goWide` already cover the other two). No separate payoff role, same shape as `drain`/`cyclingDiscard` — dealing the damage _is_ the identity. `produces` requires a quantifier right after "deals" (a fixed number, X, "that much damage", or "damage equal to" — Fling and Soul's Fire's power-into-damage template), excludes any clause naming combat damage ("not through combat" is this archetype's own boundary, even when the trigger goes on to deal more damage besides), and excludes a clause whose only target is the controller (a pain land's cost, not a damage plan — unless a real target rides along in the same breath, Char's own downside). `amplifies` is a damage doubler — "if a source [you control] would deal damage ..., it deals double/triple/that much plus N ... instead" (Torbran, Thane of Red Fell; Furnace of Rath) — requiring an actual increase word so a same-amount _redirect_ (Harsh Judgment: sends a spell's damage back at its own caster, no increase) is never mistaken for one, and excluding the shape redirected onto the controller or the source itself (Goldnight Castigator's own downside, not a payoff). Checked against the full legal card pool before shipping: 62 previously zero-active-signal commanders rescued, cleanly split across the power-into-damage template (Halana, Kessig Ranger; Itzquinth, Firstborn of Gishath), fixed/X-damage payoffs (Lava Spike-shaped commanders like Kaervek the Merciless, Nekusar, the Mindrazer), and doublers (Torbran, Obosh, the Preypiercer) — no false positive survived manual review. One real bug did surface mid-implementation: an early version of the doubler exclusion matched on the literal substring "that much damage" and wrongly stripped `produces` from every card using that phrase, including Donna Noble, a genuine reflect-effect commander with no replacement-effect structure at all ("whenever Donna Noble ... is dealt damage, Donna Noble deals that much damage to target opponent") — fixed by keying the exclusion off the doubler's actual "would deal damage ... instead" replacement shape instead of the ambiguous phrase alone; see "Behaviours verified as correct" below. |
| `bigMana`           | `produces` ×1    | No qualifier. Phase C3's third archetype, one deck: trazyn.txt's own confirmed axes name it directly ("big mana into X", with a real X spell — Exsanguinate — sitting in the list). No separate payoff role, the same shape as `freeSpells` — producing a lot of mana at once _is_ the identity. `produces` is three or more mana symbols back to back (Basalt Monolith, Thran Dynamo's "Add {C}{C}{C}"; Dark Ritual's burst "Add {B}{B}{B}") or the word-count shape for the same thing (Gilded Lotus, Sceptre of Eternal Glory's "Add three mana of any one color"; Klauth, Unrivaled Ancient's "add X mana"). Deliberately excludes Sol Ring/Arcane Signet/Mind Stone-shaped one- or two-mana rocks: format-wide staples present in nearly every deck, not evidence of a big-mana plan specifically. Checked against the full legal card pool before shipping: 5 previously zero-active-signal commanders rescued (The Eternity Elevator, Karolina Dean, Rosheen Meanderer, Klauth, Mona Lisa, Science Geek), all genuine big-mana-into-X payoffs — no false positive found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `graveyardToolbox`  | `produces` ×1    | No qualifier. Same source deck as `bigMana` (trazyn.txt), the other half of its own confirmed axes ("graveyard toolbox"). No separate payoff role — retrieving the card _is_ the identity. `produces` covers returning a flexible card choice from the graveyard to your hand (Codex Shredder's "Return target card...", Takenuma, Abandoned Mire's Channel ability, restricted to creature/planeswalker but still a choice rather than one fixed target) and reading a whole graveyard's worth of activated abilities without moving anything (Trazyn's own commander ability — the deck's centerpiece expression of the archetype — and Mirran Safehouse's identical template for lands). Deliberately distinct from `reanimator`'s "return ... to the battlefield" pattern, a different regex entirely, so a card can't satisfy both by accident. Checked against the full legal card pool before shipping: 9 previously zero-active-signal commanders rescued, all genuine flexible-retrieval effects — no false positive survived, though one real bug was caught and fixed first: an initial version matched "return **this** card from your graveyard to your hand" the same as "return **target** card", which wrongly counted Squee, Goblin Nabob and Adéwalé, Breaker of Chains (both retrieve only themselves, repeatable self-recursion rather than a flexible multi-card resource) — fixed by excluding "return this card" explicitly; see "Behaviours verified as correct" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `powerMatters`      | `rewards` ×1     | No qualifier. Phase C3's fifth archetype, one deck: radagast.txt's own corpus note names four cards by hand (Ghalta, Goreclaw, Outcaster Trailblazer, Return of the Wildspeaker). Two roles: `enables` for cost reduction scaled by power (Ghalta's own "costs {X} less to cast, where X is the total power of creatures you control"; Goreclaw's "creature spells you cast with power 4 or greater cost {2} less to cast" — the same enables/rewards split `spellslinger`'s own cost-reduction clause draws), and `rewards` for a payoff gated by or scaled by power (Goreclaw's attack-trigger buff and Outcaster Trailblazer's draw trigger share the exact phrase "with power 4 or greater"; Return of the Wildspeaker and Tuya Bearclaw both read the "greatest power" among your own creatures; Mosswort Bridge gates a free cast behind "total power 10 or greater"). Checked against the full legal card pool before shipping: 8 previously zero-active-signal commanders rescued, all genuine big-creature payoffs (Mayael the Anima's power-5-or-greater cheat, Alena and Giant-Man's power-scaled mana) — no false positive survived, though one real bug was caught and fixed first: "power N or greater" also appears in "can't be blocked by creatures with power N or greater" (Delney, Streetwise Lookout; April O'Neil, Kunoichi Trainee), a threat to _opponents'_ blockers rather than a payoff for the controller's own big creatures — fixed by excluding that shape explicitly; see "Behaviours verified as correct" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pillowfort`        | `produces` ×1    | No qualifier. Phase C3's sixth archetype, one deck: yshtola.txt's own confirmed axes name it directly, and the deck plays Ghostly Prison and Propaganda outright. No separate payoff role, the same shape as `bigMana`/`graveyardToolbox` — deterring the attack _is_ the identity. `produces` is the classic tax shape ("Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you" — Ghostly Prison, Propaganda's identical wording; Norn's Annex extends it to planeswalkers with an alternative-cost payment). Deliberately excludes the common Vow cycle and Assault Suit's shape ("Enchanted/Equipped creature ... can't attack you") — those neutralize one specific creature, usually stolen with a Threaten effect, not a board-wide deterrent; a deck running any one of that cycle isn't thereby a pillowfort deck. Checked against the full legal card pool before shipping: 2 previously zero-active-signal commanders rescued (Dáin, Lord of the Iron Hills; Baird, Steward of Argive), both genuine board-wide tax effects — no false positive survived, caught before shipping by excluding the single-target Aura/Equipment shape; see "Behaviours verified as correct" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `monoColorDevotion` | `rewards` ×1     | **Inferred** — see "Grounding: vetted vs inferred" above. No deck in the corpus is confirmed to build around this; confirmed absent by directly searching every fixture for "devotion" rather than assumed. Phase C3's seventh and final archetype, built from CR 700.6 alone — devotion to a color is the number of mana symbols of that color among the mana costs of permanents you control, a precise, well-defined mechanic that always reprints itself verbatim as reminder text ("your devotion to black"), which is what makes it safe to build ahead of a real example. `qualifiable: 'color'` — a genuinely new `QualifierKind`, the first not modeled on a creature-type-shaped vocabulary lookup or one of `gameState`'s five named states; see its own doc comment and `findQualifier`'s. Requires a single named color, not a color pair ("devotion to blue and black" — Phenax, Keranos, Ephara, Iroas, Karametra, Athreos, all real Theros gods with a genuinely different, dual-color threshold), which this archetype's own name deliberately excludes. Checked against the full legal card pool, the only verification available for a genuinely ungrounded archetype: 45 cards matched across the whole pool, every one a real Theros-block devotion payoff correctly qualified by color, and 2 previously zero-active-signal commanders rescued (Thassa, Deep-Dwelling; Thassa, God of the Sea) — no false positive found. A card whose devotion is to a color the ability itself chooses rather than names (Nykthos, Shrine to Nyx: "devotion to _that_ color") is a known, accepted gap — nothing in its text for the qualifier to key on, and it's a flexible any-color utility land rather than a payoff for one fixed color.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `alternateWin`      | `produces` ×1    | Phase C4's first archetype, one deck: shadow.txt's own corpus note names it directly by card ("Knuckles is an alternate win condition"). No separate payoff role — the win condition itself is the identity, the same shape as `freeSpells`/`drain`. `produces` reads the precomputed `CardFacts.alternateWin` fact (Phase B) directly rather than re-deriving the pattern — already verified against The Book of Exalted Deeds, which only ever _grants_ a symmetric "can't lose/win" clause and correctly produces no signal. Checked against the full legal card pool: only 4 commander-eligible cards in the entire game carry a genuine "you win the game" clause (Knuckles the Echidna, Doctor Doom, Unrivaled, Ramses, Assassin Lord, Zenos yae Galvus // Shinryu, Transcendent Rival) — all four correctly matched, no false positive, and no surprise that the count is this small: an outright win condition is one of the rarest, most heavily-costed effects in the game by design.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `politics`          | `produces` ×1    | Phase C4's second archetype, one deck: yshtola.txt's own confirmed axes name it directly (`"Drain, pillowfort, spellslinger, politics, MV-vs-cost"`). The catalog's own flagged-fuzziest concept, kept crisp by unifying three textually different but real, well-defined social tools under one `produces` role rather than reaching for one broad "affects other players" scan (which would sweep in board wipes and group draw spells). No separate payoff role — taking the political action _is_ the identity, the same shape as `pillowfort`/`alternateWin`. Goad reads the real Scryfall keyword directly off `CardFacts.keywords` (Eye of Nidhogg's own "is goaded"). Giving away a permanent is "target player \[...\] gains control of" (Donate's own "Target player gains control of target permanent you control", Crown of Doom's self-referential "Target player other than this artifact's owner gains control of it", Bazaar Trader, Domineering Will — handing an opponent's creature to a third player and forcing it to block, a real EDH political staple) — scoped to "target player" specifically, not "target opponent" (Humble Defector/Yes Man-style self-sacrifice-for-value engines and Chaos Lord/Jinxed Ring-style always-an-opponent effects are a different plan). The symmetric reveal-and-exchange shape is Parker Luck and Keen Duelist's own shared phrase ("lose life equal to the mana value of the card revealed by the other player"), deliberately narrow rather than a broad "each player" scan. Checked against the full legal card pool before shipping: the donate pattern found exactly its four real cards and no others; the symmetric pattern found exactly its two grounding cards and nothing else in the entire pool; 3 previously zero-active-signal commanders rescued (all real goad commanders — Red Death, Shipwrecker; Kaima, the Fractured Calm; Grenzo, Havoc Raiser) — no false positive found.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `storm`             | `produces` ×1    | **Inferred** — see "Grounding: vetted vs inferred" above. No deck in the corpus is confirmed to build around this; real Storm-keyword cards do appear (krenko.txt's Empty the Warrens and Haze of Rage; tenth-doctor-rose-tyler.txt's All of History, All at Once) but neither deck's own note claims Storm as an intentional plan — they're there for other reasons. Phase C4's third and final archetype, built from CR 702.39 (the Storm keyword itself) and the real, recurring "spells you've cast this turn" payoff template. No separate payoff role for the keyword itself — the same no-identity-split shape as `freeSpells`/`drain`/`bigMana` — but `rewards` still exists alongside it for a payoff scaled by spell count without the keyword (Aetherflux Reservoir's life gain, Gnostro's X, Volcanic Torrent's damage, Rionya's tokens). `produces` reads the Storm keyword directly off `CardFacts.keywords`. `rewards` requires the phrase "spells you've cast this turn" and excludes any clause naming a cost (Demilich's and Urza's cost reduction scaled by the same count is `spellslinger`'s `enables` territory, not a storm payoff) or "can't" (Domri, Anarch of Bolas's flat "can't be countered" for the turn doesn't scale by anything). Checked against the full legal card pool before shipping: 19 real cards matched after both exclusions, all genuine count-scaled payoffs, none of them cost reduction — 1 previously zero-active-signal commander rescued (Hurkyl, Master Wizard), no false positive found. One real bug was caught and fixed first: an early version's cost exclusion, `\bcost\b`, doesn't match the plural "costs" due to word-boundary semantics, letting Demilich slip through until widened to `\bcosts?\b`; see "Behaviours verified as correct" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Proposed, ordered by how many independent decks back them

Tiered deliberately: an archetype backed by six decks is a proven pattern; one backed by a single
deck is a guess.

| Tier   | Key                                                                        | Decks | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | ~~`copyEffects`~~ **Shipped** — see "Shipping today" above                 | 6     | Copying **spells, abilities and permanents** — Kalamax (spells), Kirol and Agrus Kos, Eternal Soldier (abilities), Rite of Replication, Necroduality and Sculpting Steel (permanents)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|        | cost reduction _(as `enables`, not an archetype)_ — **shipped in Phase B** | 6     | Modelled once, parameterised by what it reduces, instead of a regex per archetype                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|        | ~~`freeSpells`~~ **Shipped** — see "Shipping today" above                  | 5     | Cascade, suspend, `"without paying its mana cost"`, alternative costs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|        | ~~`artifacts`~~ **Shipped** — see "Shipping today" above                   | 5     | Miles's Vehicles and Sophia's Food ride one qualifier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **C2** | ~~`lifegain`~~ **Shipped** — see "Shipping today" above                    | 3     | **The largest single gap** — one of the format's most-built themes, entirely absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|        | ~~`drain`~~ **Shipped** — see "Shipping today" above                       | 2     | Life loss as a _trigger_. Sanguine Bond and Vito are the bridge cards to `lifegain`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|        | ~~`cyclingDiscard`~~ **Shipped** — see "Shipping today" above              | 3     | Discard as a resource, which the engine only sees as "mill"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|        | ~~`temporaryEffects`~~ **Shipped** — see "Shipping today" above            | 3     | Delayed-cost cards and the enablers that erase the trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|        | ~~`recursion`~~ **Shipped** — see "Shipping today" above                   | 2     | The same body returning repeatedly — distinct from `reanimator`'s "cheat something big into play". Unlike this catalog's other entries, no corpus fixture comment named the motivating decks or the original "3" count's third deck; confirmed with the repo owner as `wilhelt.txt` and `eirdu.txt` before implementation — see "Behaviours verified as correct" below for the real interaction (Isilu's granted Persist + Cathars' Crusade's counter-cancel) that grounds it.                                                                                                                                                      |
|        | ~~`tapForValue`~~ **Shipped** — see "Shipping today" above                 | 2     | Tapping and untapping your own permanents; also where combo _ingredients_ get classified. **Phase C2 is complete.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|        | ~~`gameState`~~ **Shipped** — see "Shipping today" above                   | 6     | The Ring, the monarch, Max speed, initiative, day/night                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **C3** | ~~`cardDraw`~~ **Shipped** — see "Shipping today" above                    | 2     | Repeatable draw engines, the payoffs that read a draw, and the effects that double every draw outright — watcher-in-the-water.txt (primary) and miles.txt (secondary)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|        | ~~`burn`~~ **Shipped** — see "Shipping today" above                        | 1     | Damage dealt directly, not through combat, as its own plan — kalamax.txt names it explicitly ("Copy, burn, power-into-damage, go-wide"). Corrected from this table's own original "zero grounding" note: the deck was named all along, just not cross-referenced against this table's own corpus list before that note was written.                                                                                                                                                                                                                                                                                                 |
|        | ~~`bigMana`~~ **Shipped** — see "Shipping today" above                     | 1     | Ramping toward an X spell or another huge-cost payoff, not land count for its own sake (that's `landsMatter`'s territory) — trazyn.txt's own corpus note says "big mana into X" by name, with a real X spell (Exsanguinate) sitting in the list.                                                                                                                                                                                                                                                                                                                                                                                    |
|        | ~~`powerMatters`~~ **Shipped** — see "Shipping today" above                | 1     | Payoffs that scale with how big a creature is, not how many there are (that's `goWide`'s territory) — radagast.txt's corpus note names Ghalta, Goreclaw, Outcaster Trailblazer, and Return of the Wildspeaker by hand.                                                                                                                                                                                                                                                                                                                                                                                                              |
|        | ~~`graveyardToolbox`~~ **Shipped** — see "Shipping today" above            | 1     | Same source deck as `bigMana` (trazyn.txt), a distinct plan: flexible retrieval from the graveyard as a resource, not one big reanimation target (`reanimator`'s territory).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|        | ~~`pillowfort`~~ **Shipped** — see "Shipping today" above                  | 1     | Taxing or deterring attacks aimed at you — yshtola.txt names it explicitly, and the deck plays Ghostly Prison and Propaganda outright.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|        | ~~`monoColorDevotion`~~ **Shipped** — see "Shipping today" above           | 0     | The one archetype in this tier with no deck in the corpus confirmed to build around it — checked directly (`grep -il devotion` across every fixture's comments and body), not assumed absent. **Inferred**, when built: CR 700.6 is a precise, well-defined mechanic, so the risk here is lower than a fuzzier concept like `politics` below. **Phase C3 is now complete.**                                                                                                                                                                                                                                                         |
| **C4** | ~~`alternateWin`~~ **Shipped** — see "Shipping today" above                | 1     | shadow.txt names it explicitly by card (Knuckles the Echidna). Corrected from this table's own original "1 each, no deck named" note the same way Phase C3's tier row was: the deck was named all along, just not cross-referenced against the corpus table before that note was written.                                                                                                                                                                                                                                                                                                                                           |
|        | ~~`politics`~~ **Shipped** — see "Shipping today" above                    | 1     | yshtola.txt's own confirmed axes name it directly (`"Drain, pillowfort, spellslinger, politics, MV-vs-cost"`) — also corrected from "no deck named". The fuzziest concept in the catalog even so — kept crisp rather than dropped: all three real sub-shapes (goad, donate, symmetric effects) checked clean against the full card pool before shipping.                                                                                                                                                                                                                                                                            |
|        | ~~`storm`~~ **Shipped** — see "Shipping today" above                       | 0     | The one C4 entry with no deck's own confirmed axes naming it — checked directly, not assumed absent. Real Storm-keyword cards exist in the corpus (krenko.txt's Empty the Warrens and Haze of Rage; tenth-doctor-rose-tyler.txt's All of History, All at Once) but none of those decks' own notes claim Storm as an intentional plan — they're there for other reasons (Goblin production, a big flashy spell). **Inferred**: CR 702.39 is a precise, well-defined keyword, kept the risk here closer to `monoColorDevotion`'s than `politics`'s. **Phase C4 is now complete — and with it, the entire signal-engine rework plan.** |

### Lifecycles

A lifecycle says what a working deck **needs**, so that _"you have nine death-trigger payoffs and one
sacrifice outlet"_ is expressible. **Kindred gets one — shipped.** Retires the previous "membership
groups rather than engines" carve-out, which the Sliver deck disproves: five slots, one spec serving
every creature type since `lifecycleFor` already keys on archetype alone and `groupByTheme` already
scopes participants by qualifier — no mechanism change needed.

| Slot            | Key          | Role       | Minimum                                         | What it is                                                                                     |
| --------------- | ------------ | ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Bodies          | `bodies`     | `is`       | 8                                               | Actual members of the tribe.                                                                   |
| Lords & anthems | `payoff`     | `rewards`  | 2 (matches kindred's own `definingRequirement`) | Anthems, count-scaled effects, **and** abilities granted to the whole type.                    |
| Tribal engine   | `engine`     | `enables`  | 1, commonly missing                             | Mana, cost reduction, or spending restricted to the tribe.                                     |
| Toolbox         | `toolbox`    | `produces` | 1                                               | Tutors **or** tokens of the type — the same role Krenko's Command already used for the latter. |
| Resilience      | `resilience` | `protects` | 1, commonly missing                             | Protection granted to the whole tribe: indestructible, hexproof, ward.                         |

This catalog's original plan named six jobs, not five — **"evasion and haste" is not a separate
slot.** Granting a keyword to the tribe ("Sliver creatures you control have flying") was already
`rewards` before this lifecycle existed (Gleaming Overseer's hexproof grant, tested since Phase B),
on the reasoning that a card handing out flying to your tribe genuinely is a tribal payoff, not
merely "having" the keyword the way `keywordCare`'s granting/caring split treats it. Splitting that
same clause shape into a second, redundant `enables` slot next to "Lords & anthems" would either
duplicate already-tested behavior or require a distinction the text can't ground — so evasion and
haste live in the payoff slot they were already in.

**"Toolbox," not "Tutors"** — `produces` for kindred already meant "makes a token of the type"
before this lifecycle existed (Krenko's Command, Their Number Is Legion); a tutor scoped to the type
(Sliver Overlord's "Search your library for a Sliver card") is the same role, not a new one. Brood
Sliver ("create a 1/1 Sliver token" on combat damage) fills the slot exactly the way Sliver
Overlord's search does, and both genuinely answer the same question — can this deck get a specific
member of the tribe when it needs one? The label says so honestly rather than narrowly claiming
"Tutors" for a slot that also catches token-makers.

Three new `detectKindred` checks feed the two slots the pre-existing roles didn't already cover —
`enables` (tribal engine) and `produces`-as-tutor (toolbox), scoped by the exact same
`wordPattern(type)` clause gate every other per-type check already uses:

- A mana ability granted to the type (`"Sliver creatures you control have '{T}: Add one mana of any
color.'"` — Gemhide Sliver, Manaweft Sliver) or mana restricted to spending on it (`"Spend this
mana only to cast a Sliver spell"` — Sliver Hive) is `enables`.
- `"Affinity for Slivers"` (Thrumming Hivepool) is cost reduction, and `enables` — a keyword ability
  whose whole explanation lives in reminder text, so it needs its own check rather than the wildcard
  branch's `"cost {N} less to cast"` text pattern, which never fires on a named type.
- `"Search your library for a Sliver card"` (Sliver Overlord) is `produces`. Card selection scoped
  to a _named_ type — the per-type counterpart of the wildcard's own "look at the top card" — wasn't
  found anywhere in the corpus, so it's left uncovered rather than invented; see "Known tensions"
  below.

Verified against the real seeded database: `first-sliver.txt`'s Sliver Kindred theme (56 cards)
reports complete, with 47/46/9/6/3 cards across the five slots respectively — confirmed end-to-end
through the actual browser UI, not just the API. `brigid.txt`'s Kithkin Kindred theme (26 cards,
including the three Changeling cards from the previous sub-item) also reports complete. A sweep of
every fixture deck's other kindred themes shows realistic, sensible partial completion — Krenko's
Goblin Kindred (42 cards) is missing only resilience; Sauron's Army Kindred (18 cards, built more
around amass than a starting Army body count) is genuinely missing bodies as well as engine — not a
bug, an accurate read of a deck that produces the type rather than starting with much of it.

**`cardDraw` gets one too — shipped**, the same three-slot shape as `goWide`/`spellslinger`
(engines, payoff, multiplier):

| Slot         | Key          | Role        | Minimum | What it is                                                   |
| ------------ | ------------ | ----------- | ------- | ------------------------------------------------------------ |
| Draw engines | `engines`    | `produces`  | 3       | Repeatable ways to draw extra cards, not just one big spell. |
| Payoffs      | `payoff`     | `rewards`   | 2       | Cards that reward drawing extra cards, not just having them. |
| Multipliers  | `multiplier` | `amplifies` | 1       | Effects that double every draw outright.                     |

Verified against the real seeded database: `watcher-in-the-water.txt`'s Card Draw theme (37 cards)
reports complete, and its multiplier slot names exactly the three cards its own corpus note already
called out by hand — Teferi's Ageless Insight, Alhammarret's Archive, Thought Reflection. This is a
genuine independent confirmation, not circular: the note was written when the deck was added to the
corpus, before this archetype existed to detect anything. `miles.txt` reports Card Draw (11 cards)
incomplete, missing only the payoff slot — consistent with its own corpus note naming "draw engine"
specifically, not payoffs.

---

## The rules that are settled

**An archetype's payoff slot is its identity; the other slots are its machinery.** A deck that
sacrifices creatures with nothing rewarding their death is not an Aristocrats deck. A deck with nine
death payoffs and one outlet _is_, and should still be diagnosed as short — which is why the
requirement is ≥1, not the slot minimum. Verified by hand across the corpus: it kills Lands Matter on
every deck that runs fetchlands, Trazyn's phantom Aristocrats, Voltron and Necron Kindred, and keeps
Wilhelt's Aristocrats (8 payoffs), Sliver Kindred (15 lords) and Miles's thin-but-real Go-Wide.

**Membership counts cards; caring makes a theme.** This supersedes the old kindred exemption from
"cares, not shares" with something principled, and it is why `kindred` and `landsMatter` take a
minimum of 2: ten Wizards plus one incidental pump is not a Wizard deck, and twelve Necrons that are
Necrons because of the set they came from is not tribal.

**The keyword shadow is worse than a silent gap.** When an archetype is missing, `keywordCare` picks
up the _mechanism_ it runs on and names the deck wrongly:

| Deck  | Real theme        | Reported instead |
| ----- | ----------------- | ---------------- |
| Miles | Vehicles          | **Flying**       |
| Obeka | Temporary effects | **Haste**        |
| Bre   | Lifegain          | **Lifelink**     |

A missing archetype gives no advice; a keyword shadow gives _confident advice about the wrong thing_.
So keyword themes are gated on `rewards` specifically — granting a keyword is not caring about it,
triggering off it is — and **catalog coverage matters more than matcher precision**, because
precision on the wrong archetype is worthless.

**Edicts are not sacrifice outlets.** `"Each player sacrific**es** a creature"` (Fleshbag Marauder,
Accursed Marauder, Call to the Grave, Liliana Dreadhorde General) is removal. This already works and
must not be "fixed".

**Fungibility is a design value, not a coincidence.** On Wilhelt's decayed tokens the owner's words
were _"versatile resources for all of the reasons you listed… not because of one narrow usage."_ Two
existing behaviours encode this and are correct: `buildSlots` lets one card fill several slots, and
`rank()` orders candidates by cross-theme fit first.

**Flag combo ingredients; do not detect loops.** Commander Spellbook already answers "what does my
list combo into", click-triggered and rate-limited (`api-policy.md`). Classify the parts — an
untapper, a mana producer that taps — and leave loop detection alone.

**A single-card "keyword" is not a mechanic.** Scryfall's `keywords` array includes flavour ability
words from Universes Beyond sets. The corpus turned up **25+** of them: `Prismatic Gallery`,
`Bad Wolf`, `Chaos Control`, `Allons-y!`, `I. AM. TALKING!`, `Treasure Hunter`, `Eukrasia`… and
`keywordCare: Prismatic Gallery` is currently **Trazyn's strongest active signal**. Drop keywords
appearing on fewer than ~5 cards in the pool, measured at import — data-driven, no allowlist to
curate as sets release.

---

## Behaviours verified as correct

Checked against real cards during the corpus review. **Do not "simplify" these away.**

- **DFC two-face import.** `import-scryfall.ts` joins `card_faces` on `\n` and `clauses()` splits on
  `\n`, so a transforming commander's back face is detected _and_ matchers cannot bleed across the
  face boundary. Cases: Eirdu // Isilu, Brigid, Trystan.
- **Doctor's companion pairing** (`packages/rules/src/partners.ts`) pairs only with legends whose
  creature types are _exactly_ Time Lord and Doctor. Case: The Tenth Doctor + Rose Tyler.
- **`IGNORED_KEYWORDS` covers `doctor's companion`**, so Rose Tyler generates no structural keyword
  theme.
- **A keyword already read by a dedicated archetype is not automatically redundant with
  `keywordCare` — only a keyword whose "grants this to something else" shape is _separately_
  covered is.** Phase D's own design sketch (docs/signals-rework.md) assumed the opposite: that once
  an archetype reads a keyword via `f.keywords.includes(...)`, a parallel `keywordCare` theme for the
  same keyword just echoes it. `f.keywords` only ever reflects a card's _own_ printed keyword, though
  — it says nothing about a card that _grants_ the keyword to something else (Jhoira of the Ghitu and
  Kang Prime grant Suspend to an exiled card; Prismari, the Inspiration grants Storm to the spells it
  casts; Peri Brown grants Convoke to the first historic spell each turn; Wildsear, Yidris, and
  Zhulodok all grant Cascade). None of those commanders themselves have the keyword structurally, so
  `freeSpells`/`storm`'s own `f.keywords.includes` checks never see them — only `keywordCare`'s own
  text-scanning "has/have/gains/gets ... KEYWORD" granting pattern does. An early version of this
  phase's `IGNORED_KEYWORDS` set moved every keyword any archetype read by name into it, checked
  against the full legal card pool (not just the fixture corpus) via the same before/after "zero
  active signals" coverage-report methodology every archetype in this catalog uses, and the
  re-measurement caught 14 real commanders dropping to zero active signals — the six above, plus
  Glorfindel/Kenessos/Alrund (care about Scry, never covered by any dedicated archetype at all) and
  Okaun/Tanazir Quandrix/The Thing/Vorel (the generic, cross-resource "Double" ability-word tag,
  likewise uncovered elsewhere). Fixed by shrinking `IGNORED_KEYWORDS` back down to only the Partner
  family plus the handful of keywords checked line-by-line to have a _separate_ granting-shaped
  matcher, not just a structural one — see `IGNORED_KEYWORDS`'s own doc comment in `signals.ts` for
  the full account, including which two keywords (Lifelink; Persist/Undying) actually clear that bar.
  Re-verified after the fix: 559 of 4,049 commander-eligible cards produce zero active signals,
  identical to the pre-Phase-D baseline — no regression, no new rescue (Phase D redistributes and
  deduplicates theme labels; it was never expected to rescue a commander the way a Phase C archetype
  does, since neither `IGNORED_KEYWORDS` nor `MECHANIC_KEYWORDS` can add an active role to a
  commander's own signal, only change how _supporting_ cards in a submitted list are counted).
- **Krenko** detects as `kindred:Goblin[produces, rewards]`, exactly as `signals.ts`'s own doc comment
  claims.
- **Names are never evidence.** `stripSelfReferences` exists because Goblin Sharpshooter matched
  Goblin kindred purely on its name.
- **Reminder text is stripped** — Sliver Gravemother's Encore reminder ends _"They gain haste"_, which
  read as granting haste to your team. Correct, but see below.
- **`findQualifier` ties the candidate type word to the matcher that actually hit, not a clause-wide
  scan.** Angel of Glory's Rise's "exile all Zombies, then return all Human creature cards from your
  graveyard to the battlefield" now qualifies `reanimator:Human` — the thing actually returned — not
  `reanimator:Zombie`, which is merely exiled earlier in the same clause and outside the reward
  matcher's own match text. Sliver Gravemother still qualifies correctly too: her restriction sits
  outside her matcher's match text entirely (`"Each Sliver creature card ... has encore"` — the
  matcher only hits bare `"encore"`), so the whole-clause scan remains the fallback when no matcher's
  own match text names a type.
- **`findQualifier`'s whole-clause fallback never fires for an ability-copy clause.** An ability is
  never itself a card type, so a real card type sitting near one describes something else — Echo,
  Perceptive Prodigy and Weaver of Harmony's "copy target ... ability you control from a
  creature/enchantment source" names the ability's _source_, and Agrus Kos, Eternal Soldier's "copy
  that ability for each other creature you control" names the copies' _targets_. All three found while
  building `copyEffects` and correctly stay unqualified rather than becoming
  `copyEffects:Creature`/`copyEffects:Enchantment`.
- **A `permanentSubtype` archetype's structural qualifier is scoped to the subtypes its own `is` role
  tracks, not every `PERMANENT_SUBTYPES` entry.** Cranial Plating ("Equipped creature gets +1/+0 for
  each artifact you control") is structurally an Equipment — voltron's territory — but its own reward
  reads _every_ artifact, not Equipment specifically. Qualifying it `artifacts:Equipment` just because
  it happens to be one would misrepresent what it actually cares about; it correctly stays unqualified.
  Also found while building `artifacts`: a token-doubling `amplifies` clause needed including in the
  qualifier scan for Xorn's own Treasure restriction, and "one of each" (Academy Manufactor: Clue,
  Food, _and_ Treasure at once) needed an explicit skip so the clause can't arbitrarily qualify as
  whichever type it mentions first — the same shape of bug as Angel of Glory's Rise above, just via a
  different matcher.
- **`gameState`'s initiative reward matcher needed a real card to catch it.** The first draft matched
  only `"if you've the initiative"`/`"if you have the initiative"`; Undercellar Sweep's actual wording
  is third-person and doesn't even keep "you" as the sole subject — `"if you or a player you're
attacking has the initiative"` — so it produced only `produces`, never `rewards`, until the regex was
  widened to `/\b(?:has|have|'ve) the initiative\b/i`.
- **Granting lifelink is production; caring about a creature that already has it is not.** Checked
  against the full card pool while building `lifegain`, not just the corpus: Duskfang Mentor's
  `"Put a +1/+1 counter on each creature you control with lifelink"` selects existing lifelink
  creatures for a payoff — a real card that would have false-positived under a bare `"with lifelink"`
  production matcher. `lifegain`'s produces regex requires a granting verb (`has`/`have`/`gains`/
  `gets`/`grants`/`creates`/`becomes`) immediately governing `lifelink`, which correctly matches every
  real granting template found (`"Equipped creature has ... lifelink"`, `"Create a ... token with
lifelink"`, `"becomes a ... creature with lifelink"`) while leaving Duskfang Mentor's second ability
  unmatched. The same scan also resolves the keyword-shadow rule's own Bre example above: her deck now
  reports `Lifegain (17)` as its top theme instead of a phantom `Lifelink` keyword theme.
- **Reading someone else's life loss is not causing it.** A first draft of `drain`'s `produces` matcher
  was a bare `"opponent/player/controller ... loses ... life"` scan, and Exquisite Blood ("Whenever an
  opponent loses life, you gain that much life") matched it directly — its own trigger clause literally
  contains that phrase, even though the card never makes anyone lose life itself; it only reads a loss
  from any source. Caught before shipping by checking the full card pool, the same discipline as the
  Duskfang Mentor case above: `produces` now excludes any clause `DRAIN_TRIGGER_READS_LOSS` already
  claims (a trigger of exactly `"whenever a(n) opponent/player loses life"`), while still catching a
  trigger that reads a _different_ resource and directly causes the loss itself — Sanguine Bond and
  Vito's `"whenever you gain life, opponent loses that much life"` stays `produces`, correctly
  distinguishing the "bridge card" shape (causes drain, reading lifegain) from the "payoff" shape
  (reads drain, causing something else).
- **`cyclingDiscard` deliberately overlaps `selfMill` rather than replacing its discard-catching.**
  `selfMill.produces` already treats a bare `"discards?"` mention as filling the graveyard (Faithless
  Looting, Thrill of Possibility, Windfall are named explicitly in its own comment) — that's still true
  once `cyclingDiscard` exists, not made wrong by it: a discarded card really does end up in the
  graveyard. What was actually missing wasn't a correction, it was the _other_ identity these decks
  have — the cycling/looting payoffs (`Curator of Mysteries`' scry, `Ivora`'s counter, `Rielle`'s extra
  draw) that `selfMill` has no matchers for at all, since "discard for card selection" and "fill the
  yard for reanimation" are different plans that happen to share a mechanic. Same "causes vs. reads"
  split as `drain`: Ivora and Rielle's own triggers ARE discarding itself, so a bare
  `"discards? a card"` matcher would have doubled as `produces` for them too — `produces` excludes any
  clause `CYCLING_DISCARD_TRIGGER_READS_DISCARD` already claims, the same shape as
  `DRAIN_TRIGGER_READS_LOSS`. Verified against the full corpus: `captain-howler.txt` reports `Cycling /
Discard` as its top theme (48 cards), and `obeka.txt`/`sauron.txt` — the two decks the corpus fixture
  comments name as this pattern's earlier, unaddressed instances — now report it too (8 and 9 cards),
  both still keeping their pre-existing `Self-Mill` signal alongside it rather than losing it.
- **`temporaryEffects`'s named keyword mechanics hide their whole cleanup template in reminder text,
  the same problem Cascade/Suspend forced on `freeSpells`.** Unearth's real oracle text is
  `"Unearth {3}{B}{R} ({3}{B}{R}: Return this card from your graveyard to the battlefield. It gains
haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth
only as a sorcery.)"` — every word of what it _does_ sits inside the parenthetical, which
  `stripReminderText` deletes, so the bare `"at the beginning of the next end step"` text matcher
  never sees a Kathari Bomber-style card at all (caught by checking a real Unearth card against the
  full pool, not assumed). Encore, Dash, Blitz, Mobilize, and Warp all share the identical shape.
  `TEMPORARY_EFFECT_KEYWORDS` reads `CardFacts.keywords` for a card that has one of them directly, and
  a separate granting-clause text pattern for a card that grants one to others (Grixis: `"Blue, black,
and/or red creature cards in your graveyard have unearth"`) — that clause survives stripping, since
  it sits outside the parenthetical it's introducing, the same reasoning `lifegain`'s lifelink-granting
  matcher already established.
- **`recursion` was grounded by the repo owner directly, not by a corpus fixture comment** — the one
  archetype in this catalog where that was necessary. The real interaction: Eirdu's back face, Isilu,
  Carrier of Twilight, grants Persist to every other creature (`"Each other nontoken creature you
control has persist"`); a persist creature returns with a -1/-1 counter and can't trigger Persist
  again while that counter is on it. Cathars' Crusade (`"Whenever a creature you control enters, put a
+1/+1 counter on each creature you control"`) fires on that same re-entry and puts a +1/+1 counter on
  it too — under **CR 704.5q**, a permanent with both a +1/+1 and a -1/-1 counter has them annihilate
  as a state-based action, so the creature ends up with _no_ counters at all, and the next time it
  dies, Persist's own `"if it had no -1/-1 counters on it"` check passes again. The loop repeats instead
  of firing once. `amplifies`'s regex is deliberately narrow because of this: a card that puts a
  counter only on _itself_ (Hulkling, Burgeoning Bruiser: `"put a +1/+1 counter on Hulkling"`) never
  touches the counter on the creature that just returned, so it doesn't enable the loop — checked
  against the full card pool, the same false-positive shape as `drain`/`cyclingDiscard`'s causes-vs-
  reads splits, just for a third role pair (`produces` vs. `amplifies`) instead of `produces` vs.
  `rewards`.
- **Flashback, Escape, and Unearth's "cast/return this card from your graveyard" is a one-shot use of
  the card, not `recursion`'s repeatable loop — and, checked against the full card pool once reminder
  text is stripped, the two are textually indistinguishable except for the "then exile it" clause,
  which sits in the same reminder-text parenthetical `stripReminderText` deletes.** Before the check,
  the raw oracle-text pattern for `"you may cast this card from your graveyard"` matched 354 cards,
  most of them Flashback/Escape spells that get exiled after their one use; after checking what
  `CardFacts.text` actually contains post-strip, only 35 real matches survive, none of them
  Flashback/Escape/Unearth. `"return this card from your graveyard to the battlefield"` shows the same
  pattern (148 raw, 95 post-strip) — Royal Warden's Unearth ability contains that exact phrase in its
  own reminder text and correctly disappears once stripped, leaving genuinely repeatable cards like
  Prized Amalgam, Retrofitted Transmogrant, and Postmortem Professor.
- **A wildcard card only supports a kindred qualifier the deck already has real depth in — not any
  qualifier it happens to touch at all.** This distinction (conditional vs. unconditional
  applicability) is why the wildcard fold needs its own gate where the pre-existing unqualified fold
  (above) does not: Wilhelt's generic reanimation spell reanimates a Zombie unconditionally, no
  exception, but Herald's Horn's benefit depends on which type the _player_ chooses at deck-building
  time — a fact the engine cannot observe, not a guaranteed textual claim. Found twice, at two
  different layers, against the real First Sliver corpus deck:
  - **Deck-summary layer (`groupByTheme`, deckAnalysis.ts).** An ungated fold read Realmwalker's own
    printed type (`Creature — Shapeshifter`), Sliver Overlord's own printed type (`Legendary Creature
— Sliver Mutant`), and Forbidden Orchard's opponent-facing Spirit token as real membership, then
    let the deck's 8 wildcard cards inflate each into a full theme — `"Shapeshifter Kindred (8)"`,
    `"Mutant Kindred (9)"`, `"Spirit Kindred (9)"` — out of one incidental card apiece, none of which
    the deck owner ever pointed a wildcard card at. Fixed by requiring a qualifier to already have
    `MIN_THEME_CARDS` worth of real bodies (the `is` role, non-wildcard) before the wildcard fold
    reaches it.
  - **Scoring layer (`gateWildcardKindredSupporters`, synergy.ts) — the more severe of the two.**
    `ownSignalContains`'s wildcard OR-clause (needed so `supporterMatches`/`playsDefiningRole` accept
    a wildcard card as support at all) has no bucket-level view of how deep any given qualifier
    actually is, so left as the only guard, the same 8 cards backed _every_ kindred-caring commander
    in the entire candidate pool — not just this deck's real Sliver theme. Commanders for types the
    list owned zero real cards of scored a full `MIN_SIGNAL_COUNT`-clearing signal from the wildcard
    cards alone: Kithkin, Ooze, Mercenary, Archer, and dozens of others each showed "8 supporting
    cards" in `kindredSupport`, drowning out the deck's one genuine 56-card Sliver signal in the
    ranking. Fixed the same way, applied to the commander-scoring bucket instead of the deck-summary
    group: a wildcard card is dropped from a qualifier's supporter list unless that qualifier already
    has `MIN_SIGNAL_COUNT` real (non-wildcard) bodies among the candidates. The two commanders that
    legitimately keep `kindred:*` support (Kolvori, God of Kinship and Morophon, the Boundless — both
    themselves read "choose a creature type") are exempted from the gate entirely, since their own
    signal genuinely _is_ the wildcard, not a specific type being backstopped by one.
  - `findCardsBySignals`'s SQL-level wildcard join (db.ts, the suggestion-fill path) was checked and
    needs no analogous gate of its own: its only caller for kindred keys only ever requests a
    qualifier that is already a reported `DeckTheme`, i.e. one that already cleared `groupByTheme`'s
    gate — see the comment on `includeWildcard` in `db.ts` for the full reasoning, and re-check it if
    kindred ever gains a lifecycle or a new caller.
- **Changeling (CR 702.73a) needs no depth gate, unlike its own wildcard sibling above — because
  it isn't conditional on anything.** `hasChangeling` (`@mtg/rules`) stores a single `is_changeling`
  column rather than expanding `creature_types` into Magic's ~300-type catalog per changeling card;
  `detectKindred` reads it and pushes exactly one _unqualified_ `kindred[is]` signal (qualifier
  `undefined`, never `'*'`), reusing Phase B's pre-existing "unqualified supports qualified" fold
  and `ownSignalContains`'s pre-existing undefined-qualifier branch — the same relation Wilhelt's
  unqualified reanimation spell already rides, not a new mechanism next to the wildcard one. That
  reuse is the point, not an implementation shortcut: crediting a wildcard card to a specific type
  is a guess about a player's future deck-building choice, which is why it needs real structural
  depth in that type before the fold applies; crediting a Changeling card is not a guess at all — CR
  702.73a makes it unconditionally, always true of the printed card, in every deck, so there is
  nothing to gate. Verified against the real Brigid corpus deck (all three of its changeling
  creatures — Chomping Changeling, Flock Impostor, Crib Swap — mention no creature type anywhere in
  their own text, so `candidateTypes`' text scan finds nothing for any of them): the deck's real
  `Kithkin Kindred` theme now includes all three, and no other kindred type appears anywhere in
  scoring output for the deck. `qualifierKind` is left `undefined` to match the convention every
  other unqualified signal in this catalog already uses, rather than `'creatureType'` — nothing
  reads it for a signal with no qualifier to narrow.
- **`cardDraw`'s `produces` split on a real grammatical distinction, found only by checking the full
  legal card pool rather than the two grounding decks.** The bare imperative/infinitive "draw" (no
  `-s`) always benefits the controller — standard MTG templating leaves the subject of a "yours"
  effect implicit (Rhystic Study's "you may draw a card", Behold the Multiverse's imperative "draw
  two cards", Nezahal's "whenever an opponent casts a noncreature spell, draw a card" — the _trigger_
  names an opponent, the effect doesn't). Third-person "draws" (WITH the `-s`) grammatically needs an
  explicit subject, and that subject decides who benefits: "each player draws a card" (Scrawling
  Crawler) includes you, but "that player... draws a card" (Vendilion Clique, replacing a card it
  just made a player discard) or "each opponent draws a card" (Mathas, Fiend Seeker's own bounty
  handing opponents a card as a downside) never do. An initial version that matched `draws?`
  unconditionally rescued 124 previously zero-active-signal commanders in one pass — plausible on its
  own, since drawing a card is one of the most common templated effects in the game — but a spot
  check of that rescued set turned up both of those false-positive commanders directly, which is what
  forced the grammatical split rather than a distance-based or player-name-based heuristic (neither
  survives contact with "that player reveals the chosen card, puts it on the bottom of their library,
  then draws a card" — the subject and the verb are far apart, with two other verbs in between).
  A second, distinct false-positive shape survived that first fix: a _replacement_ effect
  (`"if/when [someone] would draw a card, [something else happens] instead"`) never causes a draw at
  all, whoever its subject is — Eruth, Tormented Prophet turns your own draws into a different kind
  of card access entirely, and Urabrask, Heretic Praetor taxes an _opponent's_ draw into something
  else. `CARD_DRAW_REPLACEMENT` excludes the whole family from `produces`; the narrower
  `CARD_DRAW_REPLACEMENT_AMPLIFIES` (specifically "draw two/three/N cards instead") is what still
  earns `amplifies` for the three real doublers. After both fixes, a full re-check of every rescued
  commander (108 after the second fix) found no further false positives — including several
  legitimately ambiguous shapes that were checked and kept rather than excluded: Edric, Spymaster of
  Trest's "its controller may draw a card" is a genuinely symmetric attacks-matter effect (you _are_ a
  valid beneficiary whenever your own creatures attack), and Ludevic, Necro-Alchemist's "that player
  may draw a card" is keyed to _each_ player's own end step in turn, meaning "that player" is you on
  your own turn.
- **`burn`'s doubler exclusion is keyed to the actual replacement-effect shape, not the ambiguous
  phrase it happens to share with a real production template.** "It deals that much damage" appears
  in two genuinely different constructions: a doubler's redirect ("if a source _would_ deal damage
  ..., it deals that much damage plus N ... _instead_" — Torbran, Thane of Red Fell; Embermaw
  Hellion), which modifies an amount some other source is already dealing and produces nothing of its
  own, and a reflect effect's brand-new instance of damage to a brand-new target, sized off an
  unrelated damage event ("whenever Donna Noble ... is dealt damage, Donna Noble deals that much
  damage to target opponent" — no "would deal damage ... instead" replacement structure at all). An
  early version excluded any clause containing the bare phrase "that much damage" from `produces`,
  which correctly fixed the first shape and incorrectly stripped the second — Donna Noble, a real,
  playable commander, among them. `BURN_DAMAGE_DOUBLER`'s own "would deal damage ...
  it deals \[double/triple/that much plus N\] ... instead" shape is what the exclusion actually checks
  now, so a reflect effect with no replacement structure keeps its `produces` role.
- **The same doubler pattern needed an explicit self-only exclusion, the mirror image of `cardDraw`'s
  opponent-subject case.** A damage doubler redirected onto the controller or the source itself
  (Goldnight Castigator: "if a source would deal damage to you/this creature, it deals double that
  damage to you/this creature instead") is a real downside some risk-reward creatures carry, not a
  burn payoff — checked against the full card pool alongside a genuine, unrelated false positive of
  the same general "would deal damage ... instead" shape: Harsh Judgment redirects a spell's damage
  back onto its own caster with no increase in amount at all, which the doubler regex's own
  requirement for an actual multiplier word ("double", "triple", "that much ... plus N") excludes on
  its own, without needing a separate check.
- **`graveyardToolbox`'s "return ... card ... to your hand" pattern needed an explicit exclusion for
  self-only recursion, found checking the full card pool rather than the two-card grounding.** "Return
  **this** card from your graveyard to your hand" (Squee, Goblin Nabob; Adéwalé, Breaker of Chains) and
  "return **target** card from your graveyard to your hand" (Codex Shredder; Hanna, Ship's Navigator)
  share every word except the one that matters: the first only ever retrieves the card itself, a
  repeatable self-recursion effect closer to what `recursion` means, while the second is a genuine
  choice among _different_ cards — the flexible, many-cards resource this archetype is actually about.
  An initial version matched both identically; fixed with an explicit "return this card" exclusion
  rather than widening the archetype to cover self-recursion too.
- **`powerMatters`'s "power N or greater" phrase needed an explicit exclusion for a blocker
  restriction, found checking the full card pool rather than the six-card grounding.** "Each creature
  you control with power 4 or greater gets +1/+1" (Goreclaw) and "can't be blocked by creatures with
  power 3 or greater" (Delney, Streetwise Lookout; April O'Neil, Kunoichi Trainee) share the identical
  phrase for opposite reasons: the first is a payoff for the controller's own big creatures, the second
  describes a _threat_ — the size an opponent's blocker would need to be to stop this creature — with
  no connection to the controller having big creatures at all. An initial version matched both
  identically; fixed by excluding "blocked by creatures with power N or greater" explicitly rather than
  widening the archetype to cover evasion thresholds too.
- **`pillowfort`'s "can't attack you" pattern needed an explicit exclusion for the Vow-Aura/Equipment
  cycle, found checking the full card pool rather than the three-card grounding.** "Creatures can't
  attack you unless their controller pays" (Ghostly Prison) and "Enchanted creature ... can't attack
  you or planeswalkers you control" (Vow of Duty, one of a common six-card cycle) share the tail end of
  the same phrase for entirely different plans: the first is a board-wide tax on every attacker, the
  second neutralizes one specific creature — usually a Threaten-effect target given back at end of
  turn, unrelated to a defensive shell around the controller's whole board. An initial version matched
  both identically; fixed with an explicit "enchanted/equipped creature" exclusion rather than treating
  every single-target lockdown effect as evidence of a pillowfort plan.
- **A commander whose only Go-Wide/Reanimator/Aristocrats text creates or returns a specific creature
  type, with no separate payoff clause of its own, cited arbitrary unrelated cards as supporting
  evidence — found from a real user report, not the corpus.** Ajani, Nacatl Pariah // Ajani, Nacatl
  Avenger only ever matches `goWide` via `produces` (his token-making text) — a role `findQualifier`
  deliberately never scans for a restriction (Gothmog's `amass Orcs 1` is genuine go-wide production
  regardless of the type it happens to create, not a restriction to it). He surfaced as an unqualified
  "Go-Wide Combat" match and cited any token-maker in a submitted list, Cat or not — nothing tied the
  citation to what actually makes him strong (Cats dying to flip him, Cats getting +1/+1 counters).
  He independently earns an active `kindred:Cat[rewards]` signal from a _different_ clause ("Whenever
  one or more other Cats you control die..."), and `detectSignals` now borrows that type as `goWide`'s
  qualifier when its own match is `produces`-only and exactly one such kindred type qualifies — see "A
  produces-only match can borrow from this same card's own kindred signal" above for the full mechanism
  and why it does not reopen the Gothmog case. Citation for a borrowed qualifier is also stricter than a
  text-stated one (Wilhelt's unqualified reanimation spells still back every restricted variant,
  unchanged): a pool card must itself be of the type, produce a token of it, or carry its own matching
  qualified signal — simply sharing the unqualified archetype is no longer enough. Separately,
  `aristocrats`'s death-trigger regexes only matched `dies`/`dying`, missing the grammatically-plural
  "Cats you control die" in Ajani's own transform trigger — widened to `dies?`. Dreadhorde Invasion
  (already fixtured for an unrelated reason — see "token descriptor stripping" above) is a second real
  card the borrow newly qualifies, from `goWide` to `goWide:Zombie` — checked and pinned in
  `signals.test.ts` rather than left as an unasserted side effect.
- **The same false-citation shape recurs for a TEXT-qualified signal, not just a borrowed one — found
  walking a second real user's citation list card by card.** Kratos, Stoic Father's `"whenever a God
dies"` names God directly, so `aristocrats:God` is text-qualified, untouched by the borrowing fix
  above — yet three cards cited under "Aristocrats (God)" (Kavaron Harrier, Goro-Goro Disciple of
  Ryusei, Young Pyromancer) are `produces`-only and make a fixed non-God token each. Generalised the
  same rigid/`produces`-vs-flexible/`consumes`-or-`rewards` distinction to the _supporter_ side of
  `supporterMatches`, across every qualifier kind — see "A produces-only SUPPORTER doesn't back a
  qualified signal either" above. The same review turned up two more, independent bugs in the same
  archetype: Flame-Blessed Bolt's `"if [x] would die ... instead"` replacement effect and Markov
  Enforcer's `"a creature dealt damage by [source] ... dies"` combat-kill trigger both matched the
  death-trigger regex as if they were payoffs; Blood Hypnotist's sacrifice-cost scan credited it with
  sacrificing a creature it never mentions, reading an unrelated later "creature" past a comma; Greater
  Gargadon's three-way `"artifact, creature, or land"` sacrifice cost isn't the creature-specific plan
  Aristocrats' own description requires. All four fixed and checked against the _entire_ legal card
  pool (not just the motivating cards) via a live-vs-precomputed before/after diff: 276 cards changed,
  0 gained a new false positive, 240 correctly lost one — 40 of the lost cards sampled by hand across
  both the death-trigger and sacrifice-cost fixes, all 40 confirmed correct. That same diff caught a
  real regression in an earlier version of the sacrifice-cost fix before it shipped — see "Sacrifice-cost
  precision" above for the Nim Devourer/Polygraph Orb/Sorin, Imperious Bloodlord case it would have
  wrongly credited.
- **`monoColorDevotion`'s mono-color scoping is deliberate, not an oversight to "complete" later.**
  "Devotion to blue and black" (Phenax, Keranos, Ephara, Iroas, Karametra, Athreos — six real Theros
  gods) is a genuinely different mechanic from single-color devotion, not a superset of it: a deck
  built around a color pair's combined pip count plays differently from one stacking pips in one
  color, and conflating them would make the archetype's own qualifier lie about which color a payoff
  actually cares about. Checked against the full card pool before shipping, not assumed — all six
  two-color gods correctly produce no signal at all. Nykthos, Shrine to Nyx's "devotion to _that_
  color" (the color an activated ability chooses, not one its own text names) was checked the same
  way and is a known, accepted gap for the identical reason `findQualifier` leaves any card unqualified
  when nothing in its own text names a value to key on — Nykthos genuinely supports whichever color a
  devotion deck is actually built around, so it has no single fixed qualifier to report.
- **`storm`'s spell-count-payoff pattern needed an explicit exclusion for cost reduction scaled by
  the same count, found checking the full card pool rather than assumed.** "Whenever you cast a
  spell, you gain 1 life for each spell you've cast this turn" (Aetherflux Reservoir) and "This
  spell costs {U} less to cast for each instant and sorcery spell you've cast this turn" (Demilich)
  share the identical "spells you've cast this turn" phrase for entirely different plans: the first
  is a genuine payoff that scales with spell count, the second is `spellslinger`'s own
  cost-reduction mechanism reading the identical count as its scaling factor — a different
  mechanism entirely, not a storm payoff. An early version excluded any clause naming a cost with
  `\bcost\b`, which missed Demilich's own plural "costs" entirely — a word-boundary regex requires
  a boundary immediately after the literal word "cost", which the trailing "s" defeats — letting it
  slip through the full-pool sweep as a false positive until widened to `\bcosts?\b`.
- **The same pattern also needed an explicit exclusion for a flat effect that doesn't scale by
  anything.** Domri, Anarch of Bolas's "+1: Add {R} or {G}. Creature spells you cast this turn
  can't be countered." reads the identical "spells you cast this turn" window but grants a flat,
  non-scaling protection for the turn, not a genuine count-scaled payoff. Excluded with a `can't`
  check, verified against the full card pool alongside the cost-reduction case above: 19 real cards
  matched after both exclusions, all genuine count-scaled payoffs, none of them cost reduction or a
  flat effect.

---

## Known tensions

Recorded rather than resolved, because each is a real trade.

**A new archetype can collide with an existing test's shared fixture text, silently.** Adding
`cardDraw` broke three exact-score assertions in `synergy.test.ts`'s "scoring measures focus" suite —
not because the new archetype was wrong, but because `SACRIFICE_TEXT` (a shared constant used only to
give aristocrats tests a valid outlet+payoff shape) happened to read `"Sacrifice a creature: Draw a
card."`, which is now also, correctly, a `cardDraw` signal. The fix was changing the incidental word
("Draw a card" → "Scry 1"), not narrowing `cardDraw`. **Every future archetype addition should re-run
the full server test suite and treat an exact-score assertion failure as a signal to check for this
specific collision before assuming the new archetype is wrong** — a fixture built to isolate one
archetype's scoring math can accidentally start exercising a second one once that second archetype's
vocabulary grows to cover common English phrasing ("draw a card" being about as common as it gets).

**Wildcard kindred's role detection is grounded on 8 cards, and a 9th (Path of Ancestry) that
matches a different phrasing entirely.** Every regex in `detectKindred`'s wildcard branch was
written against the confirmed real text of those cards specifically — a future wildcard-kindred
printing with different wording for its cost reduction, card selection, or anthem effect will
silently produce zero wildcard roles (the card is detected as a wildcard trigger at all, but earns
no `enables`/`produces`/`rewards`, so it never appears as support anywhere) rather than an error.
This catalog's original claim was ten cards; only eight were confirmed by direct database search —
recorded as a gap here rather than quietly rounded down, in case the other two are real cards using
wording the current search missed.

**Only four real cards ground Changeling's own detection** (Realmwalker, Chomping Changeling,
Flock Impostor, Crib Swap — all four appear in the corpus, none of them named a specific creature
type anywhere in their own text). `hasChangeling` (`@mtg/rules`) is a single boolean read off
Scryfall's `keywords` array, so there's little surface area for that thin sample to have missed —
but it means the corpus never exercised a Changeling creature that _also_ has active kindred text
of its own (a changeling lord, say), only ones whose only kindred contribution is passive
membership.

**Kindred's lifecycle has two slots with known imprecision, both accepted rather than fixed, for
the same reason: multiple roles per card is an established pattern here (Krenko is simultaneously
`is`, `produces`, and `rewards`), not a defect to design around.**

- **A tutor and a token-maker are the same role (`produces`), so "Toolbox" shows both — by design,
  not by accident.** See the lifecycle table above.
- **A tutor can also count toward "Lords & anthems."** The per-type loop's generic `rewards`
  catch-all already matched the bare word `"search"` before this lifecycle existed — Sliver
  Overlord's tutor ability was `rewards` under that rule alone, with no anthem or scaling text
  anywhere on the card. Left as-is rather than narrowed: no existing test pins a kindred `rewards`
  role to the word `"search"` specifically, so narrowing it was low-risk, but doing so would touch
  the same catch-all every other qualified archetype's `rewards` detection shares, for a fix whose
  benefit is cosmetic (a tutor also listed under "Lords & anthems") rather than correctness-bearing
  (it does not change whether a theme is reported, and `caringCount` already clears its own bar from
  real lords in every corpus deck checked). Revisit if a future deck's kindred theme reports thanks
  to a tutor's `search`-triggered `rewards` role alone, with no genuine anthem backing it.
- **Card selection scoped to a _named_ type (the per-type counterpart of the wildcard's "look at the
  top card of your library") was not found anywhere in the corpus.** `produces` for kindred currently
  covers token production and tutoring only; a real card that peeks/selects from the top of the
  library for a _named_ type, rather than a player-chosen one, would need its own check when found.

**Reminder-stripping hides keyword-defined mechanics.** The fix above creates a false negative:
Overcharged Amalgam's Exploit — a sacrifice outlet — mentions "sacrifice" _only_ in reminder text.
The file already special-cases `encore`/`unearth`/`adapt`/`surveil`/`dredge` for this reason; the
convention is right and incomplete. Still needed: `exploit`, `amass`, `decayed`, `cascade`,
`for mirrodin!`, `demonstrate`, `aftermath`, `fuse`, `behold`, `myriad`, `evoke`, `blitz`.

**Templating decides answers that should be decided by meaning.** Two decks, two variants of one
split: `"All Sliver creatures get +1/+1"` versus `"Sliver creatures you control get +1/+1"`, and
`"Zombies you control get"` versus `"Zombie creatures you control get"`. Functionally identical
lords, sorted by which decade the card was printed in. The answer is a normalisation pass, not a
third regex.

**`DIMINISHING_FACTOR` contradicts the corpus.** Twenty of twenty decks are multi-axis, so
discounting every axis past the strongest is wrong — except that Trazyn's owner ranked his axes
(main plan versus fallback), where discounting is _right_. The engine does not need to ask which is
which: themes already sort by card count. What is missing is that `DeckAnalysis` ships a flat list
instead of primary-versus-supporting. **Do not change the factor until Phases A and C land** —
today's breadth is mostly phantom themes, so the measurement would be meaningless.

**Cross-archetype interactions are not modelled at all.** Miles's asymmetric wraths are one-sided
_because_ his threats are uncrewed Vehicles. Curiosity on Papalymo is a draw engine because Papalymo
pings. Both are real, deliberate, and currently inexpressible — the engine classifies cards, not
pairs.

---

## What is deliberately not modelled

- **Combo loops.** Ingredients only — see above.
- **Card quality.** There is no play-rate or power data here. `packages.ts` suggests cards that _do
  the thing you are missing, in your colours_, and says so.
- **`commonlyMissing` flags** are a judgement call about which slot people forget, explicitly labelled
  low-confidence in `lifecycle.ts`. Revisit once enough real lists exist to test them statistically.
- **Commander-aware deck grading.** `analyzeDeck` is commander-blind by design today. An optional
  `commander` field on `POST /api/recommend` — _"Kalamax copies instants; twelve of your spells are
  sorceries"_ — is designed but deferred.
