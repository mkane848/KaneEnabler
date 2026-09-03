# Signals rework: implementation plan

The companion to [`archetypes.md`](./archetypes.md). That document says what the vocabulary **means**
and why; this one says what to **change**, in what order, and how to know it worked.

**Phases A, A2, and B have landed** (see their sections below and the `[Unreleased]` entries in
`apps/commander-recommender/CHANGELOG.md`). Phase B shipped: the `Role` addition (`enables`/
`protects`); the `cardType`/`permanentSubtype`/`counterType` `QualifierKind` additions (the last
turning `+1/+1`-only `counters` into a real qualified family, importing and widening `@mtg/rules`'
counters taxonomy per hard rule 2); the card-property layer (`cmc`, `alternativeCost`, `modified`,
`alternateWin` on `CardFacts`); and the **signal containment merge** — unqualified supports
qualified, never the reverse (`groupByTheme` in deckAnalysis.ts, `supporterMatches` in synergy.ts) —
verified against the real Wilhelt fixture, archetypes.md's own motivating example. Two documentation
inaccuracies were found and corrected along the way (Book of Exalted Deeds doesn't win the game; it
only grants a "can't lose/win" clause to an Angel), and one real `findQualifier` bug was found and
fixed as its own follow-up: it scanned a whole clause for the first known type word rather than tying
the candidate to the payoff matcher's own match text, so Angel of Glory's Rise ("exile all Zombies,
then return all Human creature cards...") mis-qualified as `reanimator:Zombie` instead of
`reanimator:Human`. Only `gameState` remains outstanding from Phase B (needs its own archetype,
arguably Phase C2's job).

**Phase C1 is complete** (see "Phase C" below and archetypes.md's archetype catalog — re-measure
before starting C2). All three archetypes landed:

- **`copyEffects`** — `qualifiable: cardType` (Kalamax copies instants only), covering spells ("copy
  that spell"/"copy target ... spell"), abilities ("copy target activated or triggered ability"), and
  permanents (token copies, clone/shapeshift effects) as one archetype.
- **`freeSpells`** — `definingRole: produces` (no separate payoff role — granting a free/reduced cast
  is the identity itself, same shape as `selfMill`/`opponentMill`). Reads `alternativeCost` plus
  Cascade/Discover/Suspend/Plot/Rebound from the bare keyword alone (their own reminder text is the
  only place any of them says "without paying its mana cost", and reminder text is stripped), plus a
  broader, non-self-referential pattern for cards that grant a free cast to _something else_ (Rashmi,
  Mindclaw Shaman). Verified against the full 20-deck corpus: Y'shtola's deck —
  `alternativeCost`'s own motivating example (Fierce Guardianship, Dismember, Snuff Out) — finally
  reports `Free Spells` as a theme, closing the loop from Phase B part 4.
- **`artifacts`** — `qualifiable: permanentSubtype`, scoped to `Vehicle`/`Food`/`Clue`/`Treasure`
  (not `Equipment`/`Saga`, which are voltron's and counters' territory). Verified against the full
  corpus: Miles's deck reports `Artifacts (Vehicle)` as its top theme, and Sophia's reports both
  `Artifacts (Clue)` and `Artifacts (Food)`, matching archetypes.md's own motivating examples exactly.

Building `copyEffects` and `artifacts` found and fixed three real `findQualifier` mis-qualifications
against real cards (Echo/Weaver/Agrus Kos for ability-copying; Xorn and Academy Manufactor for
token-doubling amplifiers; Cranial Plating for a structural-subtype false positive) — all recorded in
archetypes.md's "Behaviours verified as correct" rather than repeated here. The corpus this is
derived from is committed at `apps/commander-recommender/server/src/services/__fixtures__/decks/`.

**Phase F's import-time coverage report has also landed**, as the re-measurement checkpoint between
C1 and C2 (see its own section below): **898 of 4,049 commander-eligible cards produce zero active
signals** — closer to "extend the catalog" than "build a fallback" on the doc's own scale, so Phase C
continues rather than that fallback getting built yet.

**Phase C2 has started: `gameState` is shipped**, the item explicitly deferred from Phase B above.
`qualifiable: gameState`, five named states (`theRing`, `monarch`, `initiative`, `maxSpeed`,
`dayNight`) computed once onto `CardFacts.gameStates` by a dedicated detector — the same
all-clauses-scanned, order-independent shape as `counterType`, not the payoff-matcher clause scan
`cardType`/`permanentSubtype` use, since a card can produce and reward on completely different
mechanics within the same clause set. Max speed and day/night lean on the literal Scryfall `keywords`
array (`Start your engines!`, `Daybound`, `Nightbound`) because reminder text is the only place those
mechanics name themselves and reminder text is stripped; the Ring, the monarch, and the initiative
have no such keyword and stay text-only. One real bug found and fixed: the initiative `rewards`
matcher's first draft only matched `"you've"/"you have" the initiative`, which missed Undercellar
Sweep's actual third-person `"if you or a player you're attacking has the initiative"` entirely — see
archetypes.md's "Behaviours verified as correct". Verified against the full corpus: `sauron.txt`
reports `Game State (theRing)` with 11 supporting cards and `miles.txt` reports `Game State
(maxSpeed)` with 4, both matching archetypes.md's own motivating decks. Re-measured after shipping:
**889 of 4,049 commander-eligible cards now produce zero active signals**, down from 898.

**`lifegain` is shipped**, Phase C2's second archetype and "the largest single gap" per
archetypes.md's own tiering — one of the format's most-built themes, previously entirely absent. No
qualifier: unlike `counterType`/`gameState` there's no restricted "kind" a payoff cares about, just
the gain-life event itself. Granting lifelink (not merely having it structurally — a creature's own
printed Lifelink still counts, read off `CardFacts.keywords`) is `produces`, the format's dominant
passive way to gain life; a `whenever you gain life`/`if you('ve) gained ... life`/`the amount of
life you('ve) gained` family covers both trigger-per-event and end-of-turn-threshold payoffs
(`rewards`); `if you would gain life ... instead` doublers are `amplifies`, deliberately scoped to
`you` only so an opponent-facing lifegain-denial effect (Tainted Remedy: `"If an opponent would gain
life, that player loses that much life instead"`) doesn't register as an amplifier for this deck's
own plan. Checked against the full card pool, not just the corpus, for the same false-positive shape
`artifacts`' Cranial Plating fix found: a card that merely _selects_ creatures already having
lifelink (Duskfang Mentor's `"Put a +1/+1 counter on each creature you control with lifelink"`) must
not register as granting it — see archetypes.md's "Behaviours verified as correct". This resolves
the keyword-shadow rule's own Bre example (archetypes.md's "the rules that are settled" table): her
deck now reports `Lifegain (17)` as its top theme, verified against the full corpus, instead of a
phantom `Lifelink` keyword theme. `eirdu.txt` and `giada.txt` also correctly surface `Lifegain`,
matching their stated axes. Re-measured after shipping: **814 of 4,049 commander-eligible cards now
produce zero active signals**, down from 889 — confirming `lifegain` really was the largest single
gap.

**`drain` is shipped**, Phase C2's third archetype — life loss as a trigger, not damage. Also
unqualified. `definingRole: produces`, the same shape as `freeSpells`: causing an opponent's life
loss is the identity itself, not a means to some other reward. Covers the direct devotion/X-drain
template (Gray Merchant of Asphodel, Exsanguinate, Debt to the Deathless), aristocrats-style death
triggers (Zulaport Cutthroat, Blood Artist), and Sanguine Bond/Vito's own `"whenever you gain life,
opponent loses that much life"` — their trigger reads a _different_ resource (lifegain), so the loss
they cause is still `produces`, not a reward for something drain itself already produced. One real
precision issue found and fixed before shipping, checked against the full card pool rather than just
the corpus: a first-draft `produces` matcher was a bare `"opponent/player/controller ... loses ...
life"` scan, and Exquisite Blood (`"Whenever an opponent loses life, you gain that much life"`)
matched it directly even though the card never causes a loss itself, it only reads one from any
source. `produces` now excludes any clause a shared `DRAIN_TRIGGER_READS_LOSS` pattern already
claims (a trigger of exactly `"whenever a(n) opponent/player loses life"`), which is also
`rewards`'s own matcher — see archetypes.md's "Behaviours verified as correct" for the full
Sanguine-Bond-vs-Exquisite-Blood distinction this resolves. Verified against the full corpus:
`wilhelt.txt` reports `Drain (3)` and `yshtola.txt` reports `Drain (6)`, both matching
archetypes.md's own motivating decks exactly, and `trazyn.txt` reports `Drain (4)`, matching its own
"fallback: aggro, drain" identity. Re-measured after shipping: **797 of 4,049 commander-eligible
cards now produce zero active signals**, down from 814.

**`cyclingDiscard` is shipped**, Phase C2's fourth archetype — discarding cards on purpose as a
resource: Cycling, "draw N then discard N" loot effects, discard as an additional cost, and the
payoffs that trigger off cycling or discarding. Also unqualified, `definingRole: produces`, the same
shape as `drain`. Deliberately overlaps `selfMill` rather than replacing its existing discard-catching
— a discarded card genuinely still fills the graveyard, that wasn't wrong; what was missing was the
_other_ identity these decks have that `selfMill` has no matchers for at all (Curator of Mysteries'
scry, Ivora's counter, Rielle's extra draw). Same causes-vs-reads split as `drain`, with
`CYCLING_DISCARD_TRIGGER_READS_DISCARD` playing `DRAIN_TRIGGER_READS_LOSS`'s role: Ivora and Rielle's
own triggers ARE discarding itself, so `produces` excludes any clause that pattern already claims —
see archetypes.md's "Behaviours verified as correct". Verified against the full corpus:
`captain-howler.txt` reports `Cycling / Discard` as its top theme (48 cards, its own corpus comment's
~25 estimate was a rough undercount), and `obeka.txt`/`sauron.txt` — the two decks that comment names
as this pattern's earlier, unaddressed instances — now report it too (8 and 9 cards), both keeping
their pre-existing `Self-Mill` signal alongside it. Re-measured after shipping: **793 of 4,049
commander-eligible cards now produce zero active signals**, down from 797 — a small drop, since most
of these cards already had a signal via `selfMill` or elsewhere; the real win here is the new
identity, not new catalog coverage.

**`temporaryEffects` is shipped**, Phase C2's fifth archetype and Obeka's own — the deck the `enables`
role itself was originally justified by ("Obeka — a whole deck whose thesis is three enablers", see
the `enables`/`protects` section above). Also unqualified, but `definingRole: enables` rather than
`produces` this time: the ~25 delayed-cost cards (Sneak Attack, Puppeteer Clique — `"sacrifice/exile/
return it at the beginning of the next end step"`) are common, often-incidental staples that show up
in many decks regardless of plan, but the enablers that erase that cleanup trigger before it fires
(Obeka, Sundial of the Infinite, Glorious End: `"end the turn"`, CR's own rules action, distinct from
the unrelated "until end of turn" duration) are the actual, rare identity — "those three are the
deck" per archetypes.md's own framing. One real gap found and fixed before shipping, checked against
the full card pool: Unearth, Encore, Dash, Blitz, Mobilize, and Warp all hide their _entire_ cleanup
template inside their own reminder text (Unearth's real oracle text has every word of what it does
inside the parenthetical `stripReminderText` deletes), the identical problem Cascade/Suspend forced on
`freeSpells` — a Kathari Bomber-style Unearth creature registered zero signal at all until `produces`
started reading `TEMPORARY_EFFECT_KEYWORDS` off `CardFacts.keywords` directly, plus a granting-clause
text pattern for a card that grants one of those keywords to others (Grixis) rather than having it
itself — see archetypes.md's "Behaviours verified as correct". Verified against the full corpus:
`obeka.txt` reports `Temporary Effects` as its top theme (27 cards, matching archetypes.md's own "~25"
estimate almost exactly), and no other deck in the corpus false-positives on it. Re-measured after
shipping: **777 of 4,049 commander-eligible cards now produce zero active signals**, down from 793.

**`recursion` is shipped**, Phase C2's sixth archetype and the one entry in this catalog that needed
the repo owner's direct grounding rather than a corpus fixture comment — unlike every other archetype
built this rework, no fixture file names its motivating decks, and the tier table's own "3" deck count
cites none either. Confirmed with the repo owner before implementation: `wilhelt.txt` and `eirdu.txt`.
Also unqualified, `definingRole: produces` — the same shape as `drain`/`cyclingDiscard`/`freeSpells`.
`produces` covers Persist/Undying (a card's own keyword, or granted to others via text — Isilu,
Carrier of Twilight: `"has persist"`; Mikaeus, the Unhallowed: `"have undying"`), Gravecrawler's
repeatable self-cast template, and Prized Amalgam's repeatable self-return trigger. One real precision
issue found and fixed before shipping, checked against the full card pool: Flashback, Escape, and
Unearth's `"cast/return this card from your graveyard"` phrasing is textually identical to
`recursion`'s own templates until reminder text is stripped — the "then exile it" clause that
distinguishes a one-shot use from a repeatable loop lives in the same parenthetical
`stripReminderText` deletes, so checking `CardFacts.text` (not raw `oracle_text`) was the only way to
confirm the pattern actually excludes them (354 raw matches for the cast-from-graveyard phrase dropped
to 35 real ones post-strip, none of them Flashback/Escape/Unearth). `amplifies` covers the archetype's
own combo enabler, per the repo owner's own clarification: Isilu's granted Persist creature returns
with a -1/-1 counter, and a card that puts a +1/+1 counter on that _same entering creature_ (Cathars'
Crusade: `"on each creature you control"`) cancels it under **CR 704.5q**, letting Persist trigger
again on the next death instead of only once — narrow enough to exclude a card that only buffs itself
(Hulkling, Burgeoning Bruiser), which never touches the counter on a different creature and so can't
enable the loop — see archetypes.md's "Behaviours verified as correct" for the full mechanism.
Verified against the real seeded database: `eirdu.txt` reports `Recursion (3)` directly; `wilhelt.txt`
has the same 3 real supporting cards (confirmed via direct signal inspection) but doesn't surface in
its displayed theme list — it ties `Drain` at `cardCount: 3` and loses the alphabetical tie-break for
the deck's 8th and last `MAX_THEMES` slot, a pre-existing cutoff mechanism unrelated to this
archetype's own correctness. Re-measured after shipping: **770 of 4,049 commander-eligible cards now
produce zero active signals**, down from 777.

**`tapForValue` is shipped, completing Phase C2.** The seventh and last archetype in the tier: tapping
and untapping your own permanents as a resource, and where combo _ingredients_ get classified — per
the "flag ingredients, do not detect loops" rule above, this catalogs the parts (an untapper, a mana
producer that taps), not the combo itself, which stays Commander Spellbook's job. Also unqualified,
`definingRole: produces` — the same shape as `drain`/`cyclingDiscard`/`recursion`/`freeSpells`. Like
`recursion`, only one of the tier table's two decks has confirmed textual backing: kalamax.txt, via
the six mana-tap enablers the `enables`/`protects` section above already names by card (Springleaf
Drum, Holdout Settlement, Survivors' Encampment, Gene Pollinator, Relic of Legends, Honor-Worn Shaku)
as the reason `enables` needed to exist in the first place — shipped on that grounding alone rather
than inventing a second deck. `produces` covers tapping a _different_ permanent you control as a cost
for something else (never a card's own bare `{T}:` ability, which is ubiquitous and not itself
evidence of anything), and untapping your own permanents for free (Seedborn Muse). Kalamax herself
doesn't register — her text only reads `"if Kalamax is tapped"` as a condition; she's the beneficiary
of this archetype, not its identity, and a dedicated test guards against that. Verified against the
real seeded database: `kalamax.txt` reports `Tap for Value (7)`, matching its own doc-confirmed axis
exactly, with no false positives elsewhere in the corpus. Re-measured after shipping: **764 of 4,049
commander-eligible cards now produce zero active signals**, down from 770.

**Phase C2 is now complete** — all seven archetypes (`lifegain`, `gameState`, `drain`,
`cyclingDiscard`, `temporaryEffects`, `recursion`, `tapForValue`) shipped and merged. Phase C3's own
tier row had no visible grounding at the time (no description, no named decks or cards, unlike every
earlier tier), so — per the repo owner's own decision — the plan moved to **Phase E** instead of
guessing at it. Phase E (wildcard kindred, Changeling, the kindred lifecycle) is now also complete;
see its own section below.

**Phase C3 policy, set by the repo owner once Phase E finished: build ahead of named-deck
confirmation rather than wait on it for every remaining archetype.** Real oracle text, pulled from
the seeded database, stays the only thing any matcher is ever written against — that discipline does
not relax — and every new archetype is still checked against the full legal card pool for false
positives before it ships. What changes is only whether a named deck in the corpus is confirmed to
build around it; `archetypes.md`'s own "Grounding: vetted vs inferred" section is the full policy and
applies retroactively to every archetype in this document, not just the new ones.

That policy shift also prompted a re-check of Phase C3's own tier row against `archetypes.md`'s
corpus table — and turned up a correction: six of Phase C3's seven archetypes were never actually
ungrounded. `burn` (kalamax.txt), `bigMana` and `graveyardToolbox` (trazyn.txt, one deck backing
both), `powerMatters` (radagast.txt), `cardDraw` (watcher-in-the-water.txt, primary; miles.txt,
secondary), and `pillowfort` (yshtola.txt) are all named explicitly in that table's own "Confirmed
axes" column — the "zero grounding" read came from the tier row alone, which never named decks, not
from checking the corpus table underneath it. Only `monoColorDevotion` is genuinely ungrounded so
far, confirmed by a direct search (`grep -il devotion` across every fixture's comments and body, zero
hits) rather than assumed absent.

**`cardDraw` is shipped, the first of Phase C3's archetypes.** See `archetypes.md`'s own entry for
the full account, including the two real false-positive shapes a full-card-pool sweep found before it
shipped (a third-person "draws" naming only an opponent as its subject; a replacement effect that
redirects a draw into something else entirely) — checking the full pool, not just the two grounding
decks, is what caught both. Re-measured with Phase F's coverage report: **653 of 4,049**
commander-eligible cards now produce zero active signals, down from 761 — by far the largest single
movement this coverage number has ever seen, consistent with "draw a card" being one of the most
common templated effects in the game rather than a sign of over-matching (the false-positive sweep
above is what actually rules out over-matching, not the size of the number alone).

**`burn` is shipped, the second of Phase C3's archetypes.** One deck, kalamax.txt, whose own
confirmed axes name it directly ("Copy, burn, power-into-damage, go-wide" — `copyEffects` and
`goWide` already cover the other two). See `archetypes.md`'s own entry for the full account,
including a real bug a full-card-pool sweep caught before shipping: an early version of the
`amplifies` doubler's exclusion from `produces` keyed on the literal phrase "that much damage" rather
than the doubler's actual replacement-effect shape, which wrongly stripped `produces` from Donna
Noble — a genuine reflect-effect commander with no doubler structure at all. Re-measured with Phase
F's coverage report: **591 of 4,049** commander-eligible cards now produce zero active signals, down
from 653 — 62 commanders rescued, cleanly split across the power-into-damage template, fixed/X-damage
payoffs, and doublers, with no false positive surviving manual review.

**`bigMana` and `graveyardToolbox` are shipped, the third and fourth of Phase C3's archetypes.** One
deck, trazyn.txt, whose own confirmed axes name both directly ("graveyard toolbox, big mana into X").
Both `definingRole: produces`, the same no-separate-payoff-role shape as `freeSpells`. See
`archetypes.md`'s own entries for the full account, including a real bug the full-card-pool sweep
caught: an early version of `graveyardToolbox`'s "return ... card ... to your hand" pattern didn't
distinguish "return **this** card" (repeatable self-recursion — Squee, Goblin Nabob; Adéwalé, Breaker
of Chains) from "return **target** card" (a genuine choice among different cards, the archetype's
actual identity), which wrongly counted both self-only commanders. Re-measured with Phase F's coverage
report: **576 of 4,049** commander-eligible cards now produce zero active signals, down from 591 — 5
rescued by `bigMana` alone, 9 by `graveyardToolbox` alone, no false positive surviving manual review.

**`powerMatters` is shipped, Phase C3's fifth archetype.** One deck, radagast.txt, whose own corpus
note names four cards by hand (Ghalta, Goreclaw, Outcaster Trailblazer, Return of the Wildspeaker).
Two roles: `enables` for cost reduction scaled by power, `rewards` for a payoff gated by or scaled by
power. See `archetypes.md`'s own entry for the full account, including a real bug the full-card-pool
sweep caught: "power N or greater" also describes a blocker-size restriction ("can't be blocked by
creatures with power N or greater" — Delney, Streetwise Lookout; April O'Neil, Kunoichi Trainee), a
threat to opponents' blockers with no connection to the controller having big creatures, which an
early version wrongly counted as the same payoff shape. Re-measured with Phase F's coverage report:
**568 of 4,049** commander-eligible cards now produce zero active signals, down from 576 — 8 rescued
by `powerMatters` alone, no false positive surviving manual review.

**`pillowfort` is shipped, Phase C3's sixth archetype.** One deck, yshtola.txt, whose own confirmed
axes name it directly — the deck plays Ghostly Prison and Propaganda outright. `definingRole:
produces`, the same no-separate-payoff-role shape as `bigMana`/`graveyardToolbox`. See
`archetypes.md`'s own entry for the full account, including a real bug the full-card-pool sweep
caught: an early version of the "can't attack you" pattern didn't distinguish Ghostly Prison's
board-wide tax from the common Vow-Aura/Assault Suit cycle's single-creature lockdown ("Enchanted/
Equipped creature ... can't attack you"), which wrongly counted any deck running one of that cycle as
pillowfort. Re-measured with Phase F's coverage report: **566 of 4,049** commander-eligible cards now
produce zero active signals, down from 568 — 2 rescued by `pillowfort` alone, no false positive
surviving manual review. **This completes Phase C3's grounded archetypes** — only `monoColorDevotion`,
the tier's one genuinely Inferred entry, remains.

**`monoColorDevotion` is shipped, Phase C3's seventh and final archetype — and its first genuinely
Inferred one.** No deck in the corpus is confirmed to build around it, confirmed absent by directly
searching every fixture rather than assumed. Built entirely from CR 700.6 (devotion to a color is the
number of mana symbols of that color among the mana costs of permanents you control) and verified
against the full legal card pool alone, since there is no grounding deck to check it against. Gains a
genuinely new `QualifierKind`: `'color'`, the five WUBRG names — see `archetypes.md`'s own entry for
the full account, including why a two-color devotion threshold (six real Theros gods) is deliberately
excluded rather than folded in, and why Nykthos, Shrine to Nyx's "devotion to _that_ color" is a known,
accepted gap rather than a bug. Re-measured with Phase F's coverage report: **564 of 4,049**
commander-eligible cards now produce zero active signals, down from 566 — 2 rescued by
`monoColorDevotion` alone (Thassa, Deep-Dwelling; Thassa, God of the Sea), and every one of the 45
cards it matched across the whole pool a real Theros-block devotion payoff correctly qualified by
color — no false positive found. **This completes Phase C3.**

**Phase C4, decided by the repo owner: attempt it.** C1–C3 hold up — every archetype shipped this
rework has been checked against its own grounding deck (or the full pool, for the two Inferred
entries) with no surviving false positive, and the full test suite and coverage report have stayed
clean at every step. `storm` and `alternateWin` ship if they can be kept crisp; `politics` — the
fuzziest concept in the catalog — ships only if it can be, and gets dropped rather than shipped vague
if not.

Re-checking C4's own tier row against `archetypes.md`'s corpus table found the same correction Phase
C3's own tier row needed: two of its three archetypes were never actually ungrounded. `alternateWin`
(shadow.txt, via Knuckles the Echidna) and `politics` (yshtola.txt's own confirmed axes name it
directly) are both named explicitly in the corpus table — only `storm` has no deck's own confirmed
axes naming it, confirmed by checking directly (real Storm-keyword cards exist in the corpus, but
incidentally, not as a deck's own intentional plan).

**`alternateWin` is shipped, Phase C4's first archetype.** `definingRole: produces`, the same
no-separate-payoff-role shape as `freeSpells`/`drain` — reads the precomputed `CardFacts.alternateWin`
fact (Phase B) directly rather than re-deriving the pattern, since that fact was already built and
verified against The Book of Exalted Deeds' symmetric "can't lose/win" grant. See `archetypes.md`'s
own entry for the full account. Checked against the full legal card pool: only 4 commander-eligible
cards in the entire game carry a genuine "you win the game" clause, all four correctly matched, no
false positive — a small number by design, since an outright win condition is one of the rarest,
most heavily-costed effects in the game. Re-measured with Phase F's coverage report: **563 of 4,049**
commander-eligible cards now produce zero active signals, down from 564.

**`politics` is shipped, Phase C4's second archetype — the catalog's own flagged-fuzziest concept,
kept crisp rather than dropped.** One deck, yshtola.txt, whose own confirmed axes name it directly.
`definingRole: produces`, no separate payoff role — the same shape as `pillowfort`/`alternateWin`.
Unifies three textually different but real, well-defined social tools: Goad (a real Scryfall
keyword, read directly off `CardFacts.keywords`), giving away a permanent ("target player \[...\]
gains control of", scoped to exclude self-sacrifice-for-value engines that always say "target
opponent" instead), and the symmetric reveal-and-exchange shape Parker Luck and Keen Duelist share
verbatim. See `archetypes.md`'s own entry for the full account. Checked against the full legal card
pool before shipping: the donate pattern found exactly its four real cards and no others; the
symmetric pattern found exactly its two grounding cards and nothing else in the entire pool — the
deliberately narrow design paying off exactly as intended. Re-measured with Phase F's coverage
report: **560 of 4,049** commander-eligible cards now produce zero active signals, down from 563 —
3 rescued by `politics` alone, all real goad commanders, no false positive found.

**`storm` is shipped, Phase C4's third and final archetype — and with it, the entire signal-engine
rework plan.** No deck's own confirmed axes name it; real Storm-keyword cards exist in the corpus
(krenko.txt's Empty the Warrens and Haze of Rage; tenth-doctor-rose-tyler.txt's All of History, All
at Once) but neither deck's own note claims Storm as an intentional plan. **Inferred**, built from
CR 702.39 (the Storm keyword itself) and the real, recurring "spells you've cast this turn" payoff
template. `definingRole: produces` — the Storm keyword itself is this archetype's namesake
mechanic, the same no-separate-payoff-role shape as `freeSpells`/`drain`/`bigMana`. `produces`
reads the Storm keyword directly off `CardFacts.keywords`; `rewards` catches a payoff scaled
directly by spells cast this turn (Aetherflux Reservoir's life gain, Gnostro's X, Volcanic
Torrent's damage, Rionya's tokens), excluding cost reduction scaled by the same count (Demilich,
Urza — `spellslinger`'s `enables` territory, not a storm payoff) and a flat effect for the turn
that doesn't scale by anything (Domri, Anarch of Bolas's "can't be countered"). One real bug
surfaced mid-implementation and was caught by the full-pool sweep before shipping: an early
version's cost-reduction exclusion used `\bcost\b`, whose word-boundary semantics don't match the
plural "costs" — Demilich's own "This spell costs {U} less to cast..." slipped through as a false
positive until the exclusion was widened to `\bcosts?\b`. See `archetypes.md`'s own entry for the
full account. Checked against the full legal card pool before shipping: 19 real cards matched after
both exclusions, all genuine count-scaled payoffs, none of them cost reduction. Re-measured with
Phase F's coverage report: **559 of 4,049** commander-eligible cards now produce zero active
signals, down from 560 — 1 rescued by `storm` alone (Hurkyl, Master Wizard), no false positive
found.

**This completes Phase C4 — and the entire A → B → C1 → C2 → C3 → C4 → E → F signal-engine rework
plan.** Every archetype shipped this rework has been checked against its own grounding deck (or the
full legal card pool, for the two genuinely Inferred entries — `monoColorDevotion` and `storm`, the
only ones in the whole catalog with no corpus deck confirmed to build around them) with no
surviving false positive, and the full test suite and coverage report have stayed clean at every
step.

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

## Phase D — Keyword split _(deferred — see Sequencing; now shipped)_

Replace the single `EXCLUDED_KEYWORDS` set with three buckets and teach `countsTowardTheme` about
them: `MECHANIC_KEYWORDS` (count on membership), `COMBAT_KEYWORDS` (keep the active-role
requirement), `IGNORED_KEYWORDS` (the Partner family, plus Scryfall's _keyword actions_ and ability
words — `Treasure`, `Double`, `Heal`, `Regenerate`, `Scry`, `Fateseal`, `Typecycling`, all confirmed
present in live data).

**Re-measure before building this.** It may reduce to little more than `IGNORED_KEYWORDS`.

**Shipped, after the rest of the plan (A through C4, E, F) closed out — the repo owner's own
follow-up call once the mandatory backbone finished.** `countsTowardTheme` no longer exists by that
name (Phase A's own kindred-exemption removal superseded it); the equivalent integration point is
`definingRequirement`, which now takes an optional `qualifier` alongside the archetype key, read only
for `keywordCare` — both call sites (`deckAnalysis.ts`'s theme loop, `synergy.ts`'s supporter-counting
loop) now pass `signal.qualifier` through. `COMBAT_KEYWORDS` needed no enumerated set of its own: it
is simply every keyword in neither of the other two, so the unchanged default (`role: 'rewards'`) is
what "keep the active-role requirement" already meant before this phase.

The re-measurement this phase's own text calls for caught something the original design sketch
didn't anticipate. The sketch assumed that once a dedicated archetype reads a keyword by name
(`f.keywords.includes(...)`), a parallel `keywordCare` theme for the same keyword is pure
duplication — but `f.keywords` only ever reflects a card's _own_ printed keyword, never a keyword it
_grants_ to something else, and most of the archetypes shipped in Phase C only check the former.
Building the full three-bucket split on that assumption and then re-measuring against the real card
pool with the same before/after "zero active signals" coverage-report methodology every archetype in
this catalog uses caught 14 real commanders dropping to zero active signals: Jhoira of the Ghitu and
Kang Prime grant Suspend without having it themselves; Prismari, the Inspiration grants Storm; Peri
Brown grants Convoke; Wildsear, Yidris, and Zhulodok grant Cascade; Glorfindel, Kenessos, and Alrund
care about Scry, which turned out to be covered by no dedicated archetype at all; Okaun, Tanazir
Quandrix, The Thing, and Vorel of the Hull Clade all key off the generic, cross-resource "Double"
ability-word tag, likewise uncovered elsewhere. Two keywords survived the corrected, line-by-line
check for a _separate_ granting-shaped matcher rather than just a structural one: Lifelink
(`lifegain`'s own granting regex) and Persist/Undying (`recursion`'s own grant pattern, verified
against Isilu, Carrier of Twilight and Mikaeus, the Unhallowed) — plus Crew and Treasure, safe for a
different reason: `artifacts`'s `is` role reads the type line's own printed subtype directly, a
structural fact with no "granted" shape to miss in the first place. `IGNORED_KEYWORDS` shipped at
five entries beyond the unchanged Partner family, not the dozens the original sketch (and this
section's own example list above) anticipated — see `archetypes.md`'s own "Behaviours verified as
correct" entry for the full account, including why Scry and Double specifically, both named in this
section's own original `IGNORED_KEYWORDS` example list, turned out to be wrong calls.

`MECHANIC_KEYWORDS` shipped at two entries: Flashback and Escape, both genuine "cast from the
graveyard as a resource, without returning it to hand" mechanics deliberately excluded from
`recursion`'s own pattern as "a different plan" that was never actually built. Membership-counting
only relaxes the _supporter_-counting gate (a submitted list's own cards), not the gate a candidate
commander's own signal must clear to be suggested at all (`hasActiveRole`, unconditional and
archetype-agnostic by design, per `synergy.ts`'s own "cares, not shares" comment) — so unlike a Phase
C archetype, this phase was never expected to rescue a zero-signal commander, only to redistribute
and deduplicate which label a submitted list's own theme reports under.

Re-measured with the corrected set: 559 of 4,049 commander-eligible cards produce zero active
signals, identical to the pre-Phase-D baseline (Phase C4's own final number) — no regression, and no
rescue, exactly as expected for a phase that changes labels and supporter-counting rather than adding
detection. **This completes Phase D — the last item in the entire signal-engine rework plan, mandatory
sequence and every conditional phase alike.**

---

## Phase E — Kindred as an engine

- **A `kindred` lifecycle — shipped, completing Phase E.** `lifecycleFor` already keyed on archetype
  alone and `groupByTheme` already scoped participants by qualifier, so one spec serves every
  creature type with no mechanism change, exactly as planned. Five slots, not the six originally
  named — see `archetypes.md`'s "Lifecycles" section for the full table and for why "evasion and
  haste" folds into the existing `rewards` payoff slot rather than becoming a second, redundant
  `enables` slot next to it, and why the tutor slot is honestly named "Toolbox" (`produces` already
  meant "makes a token of the type" before this landed, so a tutor scoped to the type is the same
  role, not a new one — Krenko's Command and Sliver Overlord fill the same slot for different
  reasons). Retires the "membership groups rather than engines" carve-out in `lifecycle.ts`'s
  header — the Sliver deck was always its counterexample.

  Three new `detectKindred` checks feed the two slots the pre-existing roles didn't already cover,
  each scoped by the same `wordPattern(type)` clause gate every other per-type check already uses: a
  mana ability granted to the type or mana restricted to spending on it is `enables` (Gemhide Sliver,
  Manaweft Sliver, Sliver Hive); `"Affinity for [Type]"` is cost reduction and `enables`, needing its
  own check since it's a keyword ability rather than the wildcard branch's `"cost {N} less to cast"`
  text pattern (Thrumming Hivepool); `"search your library for a [Type] card"` is `produces`
  (Sliver Overlord). Card selection scoped to a _named_ type — the per-type counterpart of the
  wildcard's own "look at the top card" — wasn't found anywhere in the corpus, so it's left
  uncovered rather than invented.

  Verified against the real seeded database and confirmed through the actual browser UI, not just
  the API: `first-sliver.txt`'s Sliver Kindred theme (56 cards) reports complete, all five slots
  filled (47/46/9/6/3 cards respectively). `brigid.txt`'s Kithkin Kindred theme (26 cards) also
  reports complete. A sweep of every other fixture deck's kindred themes shows realistic partial
  completion with no anomalies — see `archetypes.md`'s "Known tensions" for the accepted
  imprecisions this surfaced (a tutor and a token-maker sharing one role; a tutor's pre-existing,
  untouched `rewards` role also counting it toward "Lords & anthems"). Re-measured with Phase F's
  coverage report: **761 of 4,049** commander-eligible cards now produce zero active signals, down
  from 763 — the new `enables`/`produces` checks are active roles, unlike kindred's own `is`.

- **Wildcard kindred (`*`) — shipped.** Emits `{ archetype: 'kindred', qualifier: '*' }` for
  `"choose a creature type"` cards (Herald's Horn, Vanquisher's Banner, Gathering Stone, Three Tree
  City, Secluded Courtyard, Unclaimed Territory, Realmwalker) and for Path of Ancestry's dynamic
  variant (`"shares a creature type with your commander"`), which never says "choose" at all but is
  the same shape. `ownSignalContains` (synergy.ts) now accepts `qualifier === '*'` alongside the
  existing unqualified case, which fixes both `supporterMatches` and `playsDefiningRole` for free —
  they share that one helper. `groupByTheme` (deckAnalysis.ts) folds `kindred:*`'s participants into
  every other kindred group the same way it already folds unqualified groups, then drops the `kindred:
*` group itself. `findCardsBySignals` (db.ts) does the equivalent join in SQL, since it's the
  candidate-lookup path rather than the in-memory analysis path.

  All three needed to accept the wildcard; two of the three also needed a depth gate the plan above
  didn't anticipate, found by running the real First Sliver corpus deck through both the deck-summary
  and the scoring path before merging, not just the detection unit tests. `groupByTheme`'s ungated
  first draft read three of the deck's own cards' incidental type mentions (Realmwalker's printed
  Shapeshifter type, Sliver Overlord's printed Mutant type, Forbidden Orchard's opponent-facing Spirit
  token) as real membership and let the 8 wildcard cards inflate each into a full phantom theme.
  Worse, `ownSignalContains`'s wildcard acceptance alone — with no bucket-level view of how deep any
  given qualifier actually is — let those same 8 cards back _every_ kindred-caring commander in the
  whole candidate pool at the scoring layer, not just this deck's real themes: commanders for types
  the list owned zero real cards of (Kithkin, Ooze, Mercenary, Archer, dozens more) each scored "8
  supporting cards", drowning out the deck's one genuine 56-card Sliver signal. Both fixed with the
  same rule, applied at each layer separately: a wildcard card only counts toward a qualifier once
  that qualifier already has real (non-wildcard) structural depth of its own —
  `groupByTheme`'s fold gates on `MIN_THEME_CARDS` worth of `is`-role bodies before it runs;
  `gateWildcardKindredSupporters` (synergy.ts, new) gates `scoreCommanders`'s supporter bucket the
  same way, exempting only the rare commander whose own signal genuinely _is_ the wildcard (Kolvori,
  God of Kinship; Morophon, the Boundless). `findCardsBySignals`'s SQL join needed no equivalent gate:
  its only kindred caller (`packages.ts`'s `requiredSignalKeys`) only ever asks for a qualifier that
  is already a reported `DeckTheme`, i.e. one that already cleared `groupByTheme`'s gate — see the
  `includeWildcard` comment in `db.ts`. Verified against the real seeded database:
  `first-sliver.txt` reports `Sliver Kindred (56)` (was 48 before this landed) with all 8 wildcard
  cards present and no phantom theme for any other type, and a full sweep of every fixture deck's
  scoring output shows kindred support confined to real themes plus the two genuinely wildcard-native
  commanders. This catalog's original claim was ten wildcard cards; only eight were confirmed by
  direct database search — see `archetypes.md`'s "Known tensions" for that gap. Re-measured after
  shipping: **763 of 4,049** commander-eligible cards now produce zero active signals, down from 764.

- **Changeling → `@mtg/rules` — shipped** (hard rule 2). New `hasChangeling` primitive citing **CR
  702.73a** alongside `parseCreatureTypes`, reading Scryfall's own `keywords` array rather than
  parsing text — Changeling's reminder ("This card is every creature type.") names no type words for
  either `parseCreatureTypes` or a text matcher to find. `import-scryfall.ts` stores it as a plain
  `is_changeling` column (like `is_legendary`/`is_background`) rather than expanding
  `creature_types` into Magic's ~300-type catalog per changeling card, which would undo
  `candidateTypes`' own performance optimisation (proportional to a card's own text, not to Magic's
  type list) for every changeling printing.

  `detectKindred` honours the flag by pushing exactly one _unqualified_ `kindred[is]` signal
  (`qualifier: undefined`, never `'*'`) rather than enumerating types. That single choice is what
  makes `supporterMatches` need no direct edit at all: `ownSignalContains`'s `s.qualifier ===
undefined` branch has existed since Phase B for the unqualified-reanimator case, so a changeling
  card is accepted as support for _any_ kindred qualifier the instant `detectKindred` emits the
  signal — the same "for free" fix wildcard kindred got from the same shared helper. `groupByTheme`
  needed no change either, for the same reason: an unqualified `kindred` group already folds into
  every qualified sibling via Phase B's pre-existing, deliberately ungated fold. Deliberately _not_
  the wildcard's `qualifier: '*'` treatment, and deliberately _not_ gated the way
  `gateWildcardKindredSupporters` gates the wildcard: crediting a wildcard card to a specific type is
  a guess about a future player choice, so it needs real depth in that type first; crediting a
  Changeling card is not a guess — CR 702.73a makes it unconditionally true of the printed card,
  the same unconditional shape as Wilhelt's generic reanimation spell, so it rides that exact
  mechanism instead of a third parallel one.

  Verified against the real Brigid corpus deck: all three of its changeling creatures (Chomping
  Changeling, Flock Impostor, Crib Swap — none mentions a specific creature type anywhere in its own
  text) now correctly appear in the deck's real `Kithkin Kindred (26)` theme, with no phantom type
  anywhere in the corpus sweep. Only four real cards ground this feature (Realmwalker plus those
  three); see `archetypes.md`'s "Known tensions" for what that thin sample doesn't cover. Re-measured
  after shipping: still **763 of 4,049** — unchanged, since `is` is a passive role and this signal
  never carries an active one on its own.

**Phase E is now complete** — all three sub-items (wildcard kindred, Changeling, and the kindred
lifecycle) shipped and merged. Per the Sequencing section above, Phase F's own remaining items are
next; there is no Phase after F in the original plan, so re-measuring and reconciling `archetypes.md`
against what actually shipped is what's left.

---

## Phase F — Measurement and documentation

### Import-time coverage report

**Landed**, as a checkpoint between Phase C1 and C2 rather than waiting for the rest of Phase F —
the sequencing note above calls for re-measuring between C tiers, and this is what that number is.

`signals.ts` concedes that its weights "were set before any measurement was possible". **Obeka makes
that concrete: a real, legal, played commander that no input can ever return**, because
`scoreCommanders` skips any unit with no active signal.

`import-scryfall.ts` now prints, alongside its existing signal count, **how many commander-eligible
cards produced zero _active_ signals**, with a sample — not merely zero rows in `card_signals`.
Obeka herself has two: `kindred:Ogre[is]` and `kindred:Wizard[is]`, both structural and neither in
`ACTIVE_ROLES`, so she'd have looked covered under a naive "any row exists" check while
`scoreCommanders` still skips her exactly as before. Tracked via `hasActiveRole` during the same pass
that inserts `card_signals`, not a second query afterward. It re-runs free on every `prepare-data`
and turns catalog coverage from an opinion into a number.

**Measured: 898 commander-eligible cards produce zero active signals**, out of 4,049 total (as of
this measurement). Between the doc's own two reference points — ~20 meaning extend the catalog, ~2,000
meaning build a colour-identity-only fallback — closer to the "extend the catalog" end. **Decided:
keep extending via Phase C rather than building the fallback yet**; re-measure again after C2/C3.

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
