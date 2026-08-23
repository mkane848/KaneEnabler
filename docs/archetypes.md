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

| Kind               | Example signal                                         | Notes                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `creatureType`     | `kindred:Sliver`, `reanimator:Zombie`, `goWide:Sliver` | The original. `goWide` becomes qualifiable to stop Sliver lords forming a phantom generic Go-Wide theme.                                                                                   |
| `keyword`          | `keywordCare:Cascade`                                  | See the keyword-shadow rule below — heavily restricted.                                                                                                                                    |
| `cardType`         | `copyEffects:instant`                                  | Kalamax copies **instants only**; suggesting sorceries for him is wrong.                                                                                                                   |
| `permanentSubtype` | `artifacts:Vehicle`, `artifacts:Food`                  | Miles's fifteen Vehicles and Sophia's Food engine ride the same mechanism. Uses a curated constant list — **not** a new Scryfall catalog fetch, which would be an api-policy-gated change. |
| `counterType`      | `counters:+1/+1`, `counters:-1/-1`, `counters:time`    | See "Counters are a family" below.                                                                                                                                                         |
| `gameState`        | `gameState:theRing`, `gameState:monarch`               | Persistent shared state that many cards read and write.                                                                                                                                    |

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
same eight cards inflate *every* kindred-caring commander in the whole pool, not just the deck's own
themes.

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

| Property          | Derived from                                                                                                                                                               | What reads it                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alternativeCost` | Phyrexian pips in `mana_cost`; `"rather than pay this spell's mana cost"`; `"if you control a commander"`; `"without paying its mana cost"`; evoke, cleave, delve, convoke | `freeSpells`; combined with `cmc` it answers _"your commander wants mana value 3+ — here are cards with mana value 3+ that cost less than that to cast"_ |
| `modified`        | Equipment attached, Auras attached, counters on it (a CR umbrella term)                                                                                                    | `voltron`, `counters` — Kodama of the West Tree                                                                                                          |
| `alternateWin`    | `"you win the game"`                                                                                                                                                       | Knuckles the Echidna, Approach of the Second Sun. Probably a property rather than an archetype: a card quality, not a plan        |

`cards` already stores both `cmc` and `mana_cost`, so this is a derived fact in `buildCardFacts`, not
new data. It also explains why Snuff Out belongs to two lists at once: not two archetypes, **one
property read by both**.

**Correction, checked against the seeded database:** The Book of Exalted Deeds does not itself
qualify for `alternateWin`. Its own text only ever *grants* an Angel "you can't lose the game and
your opponents can't win the game" — a symmetric protection clause, not a win condition for its own
controller. That shape (also on Platinum Persecutor, Herald of Eternal Dawn, Celestine Reef,
Everybody Lives!) is a different property with no archetype reading it yet.

---

## Archetypes

Each archetype declares a **`definingRole`** (default `rewards`) and a **minimum** (default 1). See
"The rules that are settled" for why.

### Shipping today

Every entry below is **Vetted** (see "Grounding: vetted vs inferred" above) except where its own
Notes cell says otherwise — Phases A through E all shipped against a named deck.

| Key            | `definingRole`   | Notes                                                                                |
| -------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `aristocrats`  | `rewards` ×1     | Deliberately creature-specific. Sacrificing an artifact or land is a different deck. |
| `goWide`       | `rewards` ×1     | Becomes `qualifiable: creatureType`.                                                 |
| `voltron`      | `rewards` ×1     | Payoff matchers were narrowed after a false positive and overshot — see below.       |
| `landsMatter`  | `rewards` **×2** | Fetchlands alone must never constitute a theme.                                      |
| `spellslinger` | `rewards` ×1     |                                                                                      |
| `counters`     | `rewards` ×1     | Becomes `qualifiable: counterType`.                                                  |
| `reanimator`   | `rewards` ×1     |                                                                                      |
| `selfMill`     | `produces` ×1    | Filling your own graveyard on purpose.                                               |
| `opponentMill` | `produces` ×1    | An attack, not a resource. Kept separate on purpose.                                 |
| `kindred`      | `rewards` **×2** | Generated per creature type.                                                         |
| `keywordCare`  | `rewards` ×1     | Heavily restricted — see the keyword-shadow rule.                                    |
| `copyEffects`  | `rewards` ×1     | Becomes `qualifiable: cardType`. No lifecycle yet — one undifferentiated `rewards` role, same shape as `selfMill`/`opponentMill`. |
| `freeSpells`   | `produces` ×1    | No separate payoff role — granting a free/reduced cast is the identity itself. Reads `alternativeCost`, plus Cascade/Discover/Suspend/Plot/Rebound from the bare keyword (their own reminder text is the only place they say "without paying its mana cost", and reminder text is stripped). |
| `artifacts`    | `rewards` ×1     | Becomes `qualifiable: permanentSubtype`, scoped to `Vehicle`/`Food`/`Clue`/`Treasure` only — `Equipment`/`Saga` are `PERMANENT_SUBTYPES` too, but voltron's and counters' territory, not this archetype's `is` role. A card's own structural subtype qualifies it directly (Smuggler's Copter needs no text to be a Vehicle) *except* when its own reward reads artifacts generically (Cranial Plating is an Equipment but "for each artifact you control" doesn't restrict to Equipment — see below). |
| `gameState`    | `produces` ×1    | Becomes `qualifiable: gameState`, one of five named states (`theRing`, `monarch`, `initiative`, `maxSpeed`, `dayNight`) computed once onto `CardFacts.gameStates` via a dedicated keyword-and-text detector, the same shape as `counterType` — not the payoff-matcher clause scan `cardType`/`permanentSubtype` use. Max speed and day/night lean on the literal Scryfall `keywords` array where reminder text is the only place the mechanic names itself (`Start your engines!`, `Daybound`, `Nightbound`); the Ring, the monarch, and the initiative are text-only, no matching keyword exists. |
| `lifegain`     | `rewards` ×1     | No qualifier — unlike `counters`/`gameState`, there's no restricted "kind" a payoff cares about, just the event itself. Granting lifelink (not merely having it structurally) is `produces`, resolving the keyword-shadow rule's own Bre example below — a bare "creature ... with lifelink" *selection* (Duskfang Mentor's second ability) is deliberately excluded from production, since caring about existing lifelink creatures isn't granting it. |
| `drain`        | `produces` ×1    | No qualifier, same reasoning as `lifegain`. No separate payoff role — causing the life loss *is* the identity, same shape as `freeSpells`. Sanguine Bond/Vito's "whenever you gain life, opponent loses that much" is still `produces`, since their trigger reads a *different* resource (lifegain) — but a card whose trigger IS "an opponent loses life" itself (Exquisite Blood, Bloodthirsty Conqueror) is `rewards` only, since it reads someone else's loss rather than causing it; `DRAIN_TRIGGER_READS_LOSS` is the shared pattern both roles check to keep that split exact rather than double-counting. |
| `cyclingDiscard` | `produces` ×1  | No qualifier. No separate payoff role, same shape as `drain`/`freeSpells` — discarding on purpose is the identity, not a means to some other reward. The Cycling keyword alone is `produces`; a card whose trigger IS discarding/cycling itself (Ivora's counter, Rielle's card draw) is `rewards` only via the same causes-vs-reads split `drain` uses, `CYCLING_DISCARD_TRIGGER_READS_DISCARD` playing `DRAIN_TRIGGER_READS_LOSS`'s role. Deliberately overlaps `selfMill` (a discarded card also fills the graveyard) rather than replacing it — see below for why that overlap is left alone. |
| `temporaryEffects` | `enables` ×1 | No qualifier. `definingRole: enables`, not `produces` — the ~25 delayed-cost cards (Sneak Attack, Puppeteer Clique) are common, often-incidental staples across many decks, but the enablers that erase their cleanup trigger (Obeka, Sundial of the Infinite, Glorious End: `"end the turn"`) are the actual, rare identity — "those three are the deck" per the `enables` role's own motivating section above. Unearth/Encore/Dash/Blitz/Mobilize/Warp's entire cleanup template lives inside their own reminder text (the same problem Cascade/Suspend forced on `freeSpells`), so `produces` reads `CardFacts.keywords` for a card that has one of them and a granting-clause text pattern for a card that grants one to others. |
| `recursion`    | `produces` ×1    | No qualifier. Persist/Undying (own keyword or granted via text — Isilu, Carrier of Twilight: "has persist"; Mikaeus, the Unhallowed: "have undying"), Gravecrawler's repeatable self-cast template, and Prized Amalgam's repeatable self-return trigger — all scoped, via the full card pool, to exclude Flashback/Escape/Unearth's *one-shot* "cast/return this card ... then exile it" shape, which is a different plan (graveyard value or `temporaryEffects`), not this. `amplifies`: the deck's own combo piece per the repo owner — a card that puts a +1/+1 counter on an *entering* creature (Cathars' Crusade: `"on each creature you control"`, not a card that only buffs itself) cancels Persist's own -1/-1 counter under CR 704.5q, letting the loop repeat instead of firing once. |
| `tapForValue`  | `produces` ×1    | No qualifier. Like `recursion`, only one of the tier table's two decks has confirmed textual backing — kalamax.txt, via the six mana-tap enablers `docs/archetypes.md`'s own `enables` section already names by card (Springleaf Drum, Holdout Settlement, Survivors' Encampment, Gene Pollinator, Relic of Legends, Honor-Worn Shaku); shipped on that grounding alone rather than inventing a second deck. Two `produces` shapes, both combo *ingredients* per the "flag ingredients, do not detect loops" rule above, not loop detection itself: tapping a *different* permanent you control as a cost for something else (never a card's own bare `{T}:` ability, which is ubiquitous and not itself evidence of anything), and untapping your own permanents for free (Seedborn Muse). Kalamax herself doesn't qualify — her text only reads "if Kalamax is tapped" as a condition; she's the beneficiary of this archetype, not its identity. |
| `cardDraw`     | `produces` ×1    | No qualifier. **Phase C3's first archetype** — see below for the tier and its own grounding correction. Two decks: watcher-in-the-water.txt (primary — its own corpus note names the amplifies role and all three doubler cards by hand) and miles.txt (secondary, "draw engine" as one of four confirmed axes). Repeatable engines are `produces` (Rhystic Study, Mystic Remora, Archmage Emeritus, Sram), a trigger reading you drawing is `rewards` (Chasm Skulker, Homunculus Horde), and a pure doubling replacement effect is `amplifies` (Teferi's Ageless Insight, Thought Reflection, Alhammarret's Archive — the last also amplifies `lifegain`, one card correctly earning both). Checked against the full legal card pool before shipping, not just the two grounding decks: an initial ungated `produces` pattern rescued 124 previously zero-active-signal commanders at once — plausible on its own, since drawing a card is one of the most common templated effects in Magic, but the sweep still turned up two real false-positive shapes (a third-person "draws" naming only an opponent as its subject — Vendilion Clique, Mathas, Fiend Seeker — and a replacement effect that redirects a draw into something else entirely — Eruth, Tormented Prophet, Urabrask, Heretic Praetor) before the final version shipped; see "Behaviours verified as correct" below for the full account. |

### Proposed, ordered by how many independent decks back them

Tiered deliberately: an archetype backed by six decks is a proven pattern; one backed by a single
deck is a guess.

| Tier   | Key                                                                                                  | Decks  | What it is                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | ~~`copyEffects`~~ **Shipped** — see "Shipping today" above                                           | 6      | Copying **spells, abilities and permanents** — Kalamax (spells), Kirol and Agrus Kos, Eternal Soldier (abilities), Rite of Replication, Necroduality and Sculpting Steel (permanents) |
|        | cost reduction _(as `enables`, not an archetype)_ — **shipped in Phase B**                           | 6      | Modelled once, parameterised by what it reduces, instead of a regex per archetype                                                                                                     |
|        | ~~`freeSpells`~~ **Shipped** — see "Shipping today" above                                           | 5      | Cascade, suspend, `"without paying its mana cost"`, alternative costs                                                                                                                 |
|        | ~~`artifacts`~~ **Shipped** — see "Shipping today" above                                             | 5      | Miles's Vehicles and Sophia's Food ride one qualifier                                                                                                                                 |
| **C2** | ~~`lifegain`~~ **Shipped** — see "Shipping today" above                                             | 3      | **The largest single gap** — one of the format's most-built themes, entirely absent                                                                                                   |
|        | ~~`drain`~~ **Shipped** — see "Shipping today" above                                                | 2      | Life loss as a _trigger_. Sanguine Bond and Vito are the bridge cards to `lifegain`                                                                                                   |
|        | ~~`cyclingDiscard`~~ **Shipped** — see "Shipping today" above                                       | 3      | Discard as a resource, which the engine only sees as "mill"                                                                                                                           |
|        | ~~`temporaryEffects`~~ **Shipped** — see "Shipping today" above                                     | 3      | Delayed-cost cards and the enablers that erase the trigger                                                                                                                            |
|        | ~~`recursion`~~ **Shipped** — see "Shipping today" above                                            | 2      | The same body returning repeatedly — distinct from `reanimator`'s "cheat something big into play". Unlike this catalog's other entries, no corpus fixture comment named the motivating decks or the original "3" count's third deck; confirmed with the repo owner as `wilhelt.txt` and `eirdu.txt` before implementation — see "Behaviours verified as correct" below for the real interaction (Isilu's granted Persist + Cathars' Crusade's counter-cancel) that grounds it. |
|        | ~~`tapForValue`~~ **Shipped** — see "Shipping today" above                                          | 2      | Tapping and untapping your own permanents; also where combo _ingredients_ get classified. **Phase C2 is complete.**                                                                    |
|        | ~~`gameState`~~ **Shipped** — see "Shipping today" above                                            | 6      | The Ring, the monarch, Max speed, initiative, day/night                                                                                                                               |
| **C3** | ~~`cardDraw`~~ **Shipped** — see "Shipping today" above                                             | 2      | Repeatable draw engines, the payoffs that read a draw, and the effects that double every draw outright — watcher-in-the-water.txt (primary) and miles.txt (secondary) |
|        | `burn`                                                                                                | 1      | Damage dealt directly, not through combat, as its own plan — kalamax.txt names it explicitly ("Copy, burn, power-into-damage, go-wide"). Corrected from this table's own original "zero grounding" note: the deck was named all along, just not cross-referenced against this table's own corpus list before that note was written. |
|        | `bigMana`                                                                                             | 1      | Ramping toward an X spell or another huge-cost payoff, not land count for its own sake (that's `landsMatter`'s territory) — trazyn.txt's own corpus note says "big mana into X" by name, with a real X spell (Exsanguinate) sitting in the list. |
|        | `powerMatters`                                                                                        | 1      | Payoffs that scale with how big a creature is, not how many there are (that's `goWide`'s territory) — radagast.txt's corpus note names Ghalta, Goreclaw, Outcaster Trailblazer, and Return of the Wildspeaker by hand. |
|        | `graveyardToolbox`                                                                                    | 1      | Same source deck as `bigMana` (trazyn.txt), a distinct plan: flexible retrieval from the graveyard as a resource, not one big reanimation target (`reanimator`'s territory). |
|        | `pillowfort`                                                                                          | 1      | Taxing or deterring attacks aimed at you — yshtola.txt names it explicitly, and the deck plays Ghostly Prison and Propaganda outright. |
|        | `monoColorDevotion`                                                                                   | 0      | The one archetype in this tier with no deck in the corpus confirmed to build around it — checked directly (`grep -il devotion` across every fixture's comments and body), not assumed absent. **Inferred**, when built: CR 700.6 is a precise, well-defined mechanic, so the risk here is lower than a fuzzier concept like `politics` below. |
| **C4** | `politics`, `storm`, `alternateWin`                                                                  | 1 each | Build only if C1–C3 hold up. `politics` is the fuzziest concept in the catalog — if it cannot be kept crisp (goad, donate, symmetric effects), drop it rather than ship a vague theme |

### Lifecycles

A lifecycle says what a working deck **needs**, so that _"you have nine death-trigger payoffs and one
sacrifice outlet"_ is expressible. **Kindred gets one — shipped.** Retires the previous "membership
groups rather than engines" carve-out, which the Sliver deck disproves: five slots, one spec serving
every creature type since `lifecycleFor` already keys on archetype alone and `groupByTheme` already
scopes participants by qualifier — no mechanism change needed.

| Slot | Key | Role | Minimum | What it is |
| --- | --- | --- | --- | --- |
| Bodies | `bodies` | `is` | 8 | Actual members of the tribe. |
| Lords & anthems | `payoff` | `rewards` | 2 (matches kindred's own `definingRequirement`) | Anthems, count-scaled effects, **and** abilities granted to the whole type. |
| Tribal engine | `engine` | `enables` | 1, commonly missing | Mana, cost reduction, or spending restricted to the tribe. |
| Toolbox | `toolbox` | `produces` | 1 | Tutors **or** tokens of the type — the same role Krenko's Command already used for the latter. |
| Resilience | `resilience` | `protects` | 1, commonly missing | Protection granted to the whole tribe: indestructible, hexproof, ward. |

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
  to a *named* type — the per-type counterpart of the wildcard's own "look at the top card" — wasn't
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

| Slot | Key | Role | Minimum | What it is |
| --- | --- | --- | --- | --- |
| Draw engines | `engines` | `produces` | 3 | Repeatable ways to draw extra cards, not just one big spell. |
| Payoffs | `payoff` | `rewards` | 2 | Cards that reward drawing extra cards, not just having them. |
| Multipliers | `multiplier` | `amplifies` | 1 | Effects that double every draw outright. |

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
- **`EXCLUDED_KEYWORDS` covers `doctor's companion`**, so Rose Tyler generates no structural keyword
  theme.
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
  creature/enchantment source" names the ability's *source*, and Agrus Kos, Eternal Soldier's "copy
  that ability for each other creature you control" names the copies' *targets*. All three found while
  building `copyEffects` and correctly stay unqualified rather than becoming
  `copyEffects:Creature`/`copyEffects:Enchantment`.
- **A `permanentSubtype` archetype's structural qualifier is scoped to the subtypes its own `is` role
  tracks, not every `PERMANENT_SUBTYPES` entry.** Cranial Plating ("Equipped creature gets +1/+0 for
  each artifact you control") is structurally an Equipment — voltron's territory — but its own reward
  reads *every* artifact, not Equipment specifically. Qualifying it `artifacts:Equipment` just because
  it happens to be one would misrepresent what it actually cares about; it correctly stays unqualified.
  Also found while building `artifacts`: a token-doubling `amplifies` clause needed including in the
  qualifier scan for Xorn's own Treasure restriction, and "one of each" (Academy Manufactor: Clue,
  Food, *and* Treasure at once) needed an explicit skip so the clause can't arbitrarily qualify as
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
  trigger that reads a *different* resource and directly causes the loss itself — Sanguine Bond and
  Vito's `"whenever you gain life, opponent loses that much life"` stays `produces`, correctly
  distinguishing the "bridge card" shape (causes drain, reading lifegain) from the "payoff" shape
  (reads drain, causing something else).
- **`cyclingDiscard` deliberately overlaps `selfMill` rather than replacing its discard-catching.**
  `selfMill.produces` already treats a bare `"discards?"` mention as filling the graveyard (Faithless
  Looting, Thrill of Possibility, Windfall are named explicitly in its own comment) — that's still true
  once `cyclingDiscard` exists, not made wrong by it: a discarded card really does end up in the
  graveyard. What was actually missing wasn't a correction, it was the *other* identity these decks
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
  only as a sorcery.)"` — every word of what it *does* sits inside the parenthetical, which
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
  as a state-based action, so the creature ends up with *no* counters at all, and the next time it
  dies, Persist's own `"if it had no -1/-1 counters on it"` check passes again. The loop repeats instead
  of firing once. `amplifies`'s regex is deliberately narrow because of this: a card that puts a
  counter only on *itself* (Hulkling, Burgeoning Bruiser: `"put a +1/+1 counter on Hulkling"`) never
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
  exception, but Herald's Horn's benefit depends on which type the *player* chooses at deck-building
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
    actually is, so left as the only guard, the same 8 cards backed *every* kindred-caring commander
    in the entire candidate pool — not just this deck's real Sliver theme. Commanders for types the
    list owned zero real cards of scored a full `MIN_SIGNAL_COUNT`-clearing signal from the wildcard
    cards alone: Kithkin, Ooze, Mercenary, Archer, and dozens of others each showed "8 supporting
    cards" in `kindredSupport`, drowning out the deck's one genuine 56-card Sliver signal in the
    ranking. Fixed the same way, applied to the commander-scoring bucket instead of the deck-summary
    group: a wildcard card is dropped from a qualifier's supporter list unless that qualifier already
    has `MIN_SIGNAL_COUNT` real (non-wildcard) bodies among the candidates. The two commanders that
    legitimately keep `kindred:*` support (Kolvori, God of Kinship and Morophon, the Boundless — both
    themselves read "choose a creature type") are exempted from the gate entirely, since their own
    signal genuinely *is* the wildcard, not a specific type being backstopped by one.
  - `findCardsBySignals`'s SQL-level wildcard join (db.ts, the suggestion-fill path) was checked and
    needs no analogous gate of its own: its only caller for kindred keys only ever requests a
    qualifier that is already a reported `DeckTheme`, i.e. one that already cleared `groupByTheme`'s
    gate — see the comment on `includeWildcard` in `db.ts` for the full reasoning, and re-check it if
    kindred ever gains a lifecycle or a new caller.
- **Changeling (CR 702.73a) needs no depth gate, unlike its own wildcard sibling above — because
  it isn't conditional on anything.** `hasChangeling` (`@mtg/rules`) stores a single `is_changeling`
  column rather than expanding `creature_types` into Magic's ~300-type catalog per changeling card;
  `detectKindred` reads it and pushes exactly one *unqualified* `kindred[is]` signal (qualifier
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
  two cards", Nezahal's "whenever an opponent casts a noncreature spell, draw a card" — the *trigger*
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
  A second, distinct false-positive shape survived that first fix: a *replacement* effect
  (`"if/when [someone] would draw a card, [something else happens] instead"`) never causes a draw at
  all, whoever its subject is — Eruth, Tormented Prophet turns your own draws into a different kind
  of card access entirely, and Urabrask, Heretic Praetor taxes an *opponent's* draw into something
  else. `CARD_DRAW_REPLACEMENT` excludes the whole family from `produces`; the narrower
  `CARD_DRAW_REPLACEMENT_AMPLIFIES` (specifically "draw two/three/N cards instead") is what still
  earns `amplifies` for the three real doublers. After both fixes, a full re-check of every rescued
  commander (108 after the second fix) found no further false positives — including several
  legitimately ambiguous shapes that were checked and kept rather than excluded: Edric, Spymaster of
  Trest's "its controller may draw a card" is a genuinely symmetric attacks-matter effect (you *are* a
  valid beneficiary whenever your own creatures attack), and Ludevic, Necro-Alchemist's "that player
  may draw a card" is keyed to *each* player's own end step in turn, meaning "that player" is you on
  your own turn.

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
but it means the corpus never exercised a Changeling creature that *also* has active kindred text
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
- **Card selection scoped to a *named* type (the per-type counterpart of the wildcard's "look at the
  top card of your library") was not found anywhere in the corpus.** `produces` for kindred currently
  covers token production and tutoring only; a real card that peeks/selects from the top of the
  library for a *named* type, rather than a player-chosen one, would need its own check when found.

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
