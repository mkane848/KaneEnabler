# The signal vocabulary

What the commander recommender means by a _role_, an _archetype_, a _qualifier_, and a _card
property_ — and, for each rule, the real deck that forced it.

This document is the arguable artefact. `server/src/services/signals.ts` is its encoding; if the two
ever disagree, that is a bug in one of them, and this file says which behaviour was intended and why.
Read [`commander-recommender.md`](./commander-recommender.md) first for how the scorer consumes any
of this.

## How this was built

Twenty of the repo owner's real Commander decks were traced by hand against the matchers in
`signals.ts`, using oracle text pulled from Scryfall rather than recalled (root CLAUDE.md hard rule 4).
For each deck the owner then confirmed the intended game plan, so every rule below is anchored to a
deck someone actually plays rather than to a hypothetical.

**A rule backed by one deck is marked as such.** Coverage counts are the honest measure of confidence
here — there is no play-rate or win-rate data behind any of it.

### The corpus

| Deck              | Commander                     | Identity   | Confirmed axes                                                     |
| ----------------- | ----------------------------- | ---------- | ------------------------------------------------------------------ |
| dino_thunder      | Kalamax, the Stormsire        | Temur      | Copy, burn, power-into-damage, go-wide                             |
| miles             | Miles "Tails" Prower          | Azorius    | Vehicles, artifacts, wrath-proof threats, draw                     |
| sliver_me_timbers | The First Sliver              | 5-colour   | Cascade, lords, toolbox, resilience                                |
| —                 | Wilhelt, the Rotcleaver       | Dimir      | Sac loops, drain, alpha strike, reanimation                        |
| —                 | Trazyn the Infinite           | Mono-black | **Main:** graveyard toolbox, big mana · **Fallback:** aggro, drain |
| —                 | Obeka, Brute Chronologist     | Grixis     | Temporary effects + turn denial                                    |
| —                 | Sophia, Dogged Detective      | Bant       | Dogs, +1/+1 counters, Food/Clue/Treasure, go-wide                  |
| —                 | Bre of Clan Stoutarm          | Boros      | Lifegain→free spells, Equipment, damage doubling, impulse          |
| —                 | Y'shtola, Night's Blessed     | Esper      | Drain, pillowfort, spellslinger, politics, **MV-vs-cost**          |
| —                 | Krenko, Mob Boss              | Mono-red   | Goblins                                                            |
| —                 | Eirdu // Isilu                | Orzhov     | Aristocrats, lifegain, persist                                     |
| —                 | Sauron, the Dark Lord         | Grixis     | The Ring, amass, discard                                           |
| —                 | High Perfect Morcant          | Golgari    | Elves, −1/−1 counters, proliferate                                 |
| —                 | Brigid, Clachan's Heart       | Selesnya   | Kithkin, creatures-entering payoffs                                |
| —                 | Giada, Font of Hope           | Mono-white | Angels, lifegain, counters                                         |
| —                 | Shadow the Hedgehog           | Rakdos     | Treasure aristocrats                                               |
| —                 | Radagast the Brown            | Mono-green | Power matters, stompy                                              |
| —                 | The Tenth Doctor + Rose Tyler | Jeskai     | Time counters, suspend                                             |
| —                 | The Watcher in the Water      | Mono-blue  | Draw matters                                                       |
| —                 | Captain Howler, Sea Scourge   | Izzet      | Cycling, discard                                                   |

**Twenty for twenty are multi-axis.** Every owner selected every offered axis. Only Trazyn ranked
them (main plan versus fallback). That is the single most consistent finding in the corpus, and it is
why `DIMINISHING_FACTOR` (`synergy.ts:254`) is flagged for review rather than treated as settled.

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

**Wildcard kindred (`*`).** Cards reading `"choose a creature type"` support _any_ kindred theme and
form none of their own: Herald's Horn, Vanquisher's Banner, Gathering Stone, Three Tree City,
Secluded Courtyard, Unclaimed Territory, Path of Ancestry, Realmwalker. In the Sliver deck **ten
cards that are the tribal engine do not currently register as Sliver cards at all.**

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
| `alternateWin`    | `"you win the game"`                                                                                                                                                       | Knuckles the Echidna, Approach of the Second Sun, Book of Exalted Deeds. Probably a property rather than an archetype: a card quality, not a plan        |

`cards` already stores both `cmc` and `mana_cost`, so this is a derived fact in `buildCardFacts`, not
new data. It also explains why Snuff Out belongs to two lists at once: not two archetypes, **one
property read by both**.

---

## Archetypes

Each archetype declares a **`definingRole`** (default `rewards`) and a **minimum** (default 1). See
"The rules that are settled" for why.

### Shipping today

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

### Proposed, ordered by how many independent decks back them

Tiered deliberately: an archetype backed by six decks is a proven pattern; one backed by a single
deck is a guess.

| Tier   | Key                                                                                                  | Decks  | What it is                                                                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | `copyEffects`                                                                                        | 6      | Copying **spells, abilities and permanents** — Kalamax (spells), Kirol and Agrus Kos (abilities), Rite of Replication and Necroduality and Sculpting Steel (permanents)               |
|        | cost reduction _(as `enables`, not an archetype)_                                                    | 6      | Modelled once, parameterised by what it reduces, instead of a regex per archetype                                                                                                     |
|        | `freeSpells`                                                                                         | 5      | Cascade, suspend, `"without paying its mana cost"`, alternative costs                                                                                                                 |
|        | `artifacts` (+ `Vehicle` / `Food` / `Clue` / `Treasure`)                                             | 5      | Miles's Vehicles and Sophia's Food ride one qualifier                                                                                                                                 |
| **C2** | `lifegain`                                                                                           | 3      | **The largest single gap** — one of the format's most-built themes, entirely absent                                                                                                   |
|        | `drain`                                                                                              | 2      | Life loss as a _trigger_. Sanguine Bond and Vito are the bridge cards to `lifegain`                                                                                                   |
|        | `cyclingDiscard`                                                                                     | 3      | Discard as a resource, which the engine only sees as "mill"                                                                                                                           |
|        | `temporaryEffects`                                                                                   | 3      | Delayed-cost cards and the enablers that erase the trigger                                                                                                                            |
|        | `recursion`                                                                                          | 3      | The same body returning repeatedly — distinct from `reanimator`'s "cheat something big into play"                                                                                     |
|        | `tapForValue`                                                                                        | 2      | Tapping and untapping your own permanents; also where combo _ingredients_ get classified                                                                                              |
|        | `gameState`                                                                                          | 6      | The Ring, the monarch, Max speed, initiative, day/night                                                                                                                               |
| **C3** | `burn`, `bigMana`, `powerMatters`, `cardDraw`, `graveyardToolbox`, `monoColorDevotion`, `pillowfort` | 2 each |                                                                                                                                                                                       |
| **C4** | `politics`, `storm`, `alternateWin`                                                                  | 1 each | Build only if C1–C3 hold up. `politics` is the fuzziest concept in the catalog — if it cannot be kept crisp (goad, donate, symmetric effects), drop it rather than ship a vague theme |

### Lifecycles

A lifecycle says what a working deck **needs**, so that _"you have nine death-trigger payoffs and one
sacrifice outlet"_ is expressible. **Kindred gets one** — retiring the previous "membership groups
rather than engines" carve-out, which the Sliver deck disproves: bodies, lords and anthems, tribal
mana and cost reduction, tutors and selection, evasion and haste, resilience. Every one of those can
be short.

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

---

## Known tensions

Recorded rather than resolved, because each is a real trade.

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
