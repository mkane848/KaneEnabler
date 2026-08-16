# Rules Audit

Findings from a review of the Magic: The Gathering rules logic in both incoming projects. Line
references are against the state of each repo at the point of consolidation
(`HardlyKnowHer` @ `25d978c`, `DrWhoCompanionEDH` @ `ecf9037`). Phase 0 has landed: prepend
`apps/commander-recommender/` to every `HardlyKnowHer` path below (e.g. `server/src/db.ts` →
`apps/commander-recommender/server/src/db.ts`) and `apps/time-counters/` to every
`DrWhoCompanionEDH` path (e.g. `src/hooks/useGameState.ts` →
`apps/time-counters/src/hooks/useGameState.ts`). Line numbers are unchanged from the cited commits.

**Working assumption: the legacy logic is not necessarily correct.** Both codebases are unusually
well-documented and cite Comprehensive Rules numbers in comments, which makes them *easier* to
audit, not automatically right. Several defects below sit directly underneath a comment that
describes the correct rule.

Each item should get a **failing test first**, then the fix.

---

## Severity 1 — Wrong rules output

### 1. Fading resolves one turn early

**`DrWhoCompanionEDH`** — `src/hooks/useGameState.ts:43-46`, `src/utils/counters.ts:76-77`

CR 702.32b: *"At the beginning of your upkeep, remove a fade counter from it. **If you can't,
sacrifice it.**"* The sacrifice happens on the upkeep at which you cannot remove a counter — so
**Fading N gives you N+1 turns**, while Vanishing N gives you N.

The app treats the two identically: `hasHitTarget` returns true at `count <= 0` for both, and
`defaultResolveNote` returns the same `'Sacrifice this permanent.'` string. A Fading permanent is
therefore reported as dying one turn before it actually does.

This is the clearest correctness bug found in either project, and it is notable that the same file
gets the *harder* distinction right — `usesTimeCounters` correctly excludes fade and lore counters
from time-counter effects (`counters.ts:100-110`).

### 2. Manual count edits bypass Saga chapter triggering

**`DrWhoCompanionEDH`** — `src/hooks/useGameState.ts:147-164` (`setCount`), `:171-188` (`adjustCount`)

Neither mutation calls `newlyTriggeredChapters`, and neither updates `triggeredChapters`.

Concretely: a Saga at 0 lore counters, manually set to 2, fires **no** chapter abilities. The next
`nextTurn` then calls `newlyTriggeredChapters(chapters, 2, 3, [])`, which fires only chapter III —
chapters I and II are silently lost.

The doc comment at `counters.ts:126-128` claims the logic "stays correct if a manual edit or Time
Travel jumps the count by more than one." That is true of the *function* and false of its *call
sites*. `CLAUDE.md:85-89` names this exact bug class ("always trigger per-chapter, never just check
the final target") — the helper honours it, the callers don't.

### 3. Bad Wolf under-counts suspended cards

**`DrWhoCompanionEDH`** — `src/hooks/useGameState.ts:437`

Rose Tyler's trigger counts *"each suspended card you own and each **other** permanent you control
with a time counter on it."* Those are two clauses with different conditions, collapsed into one
predicate: `usesTimeCounters(c.mechanic) && c.count > 0`.

`count > 0` is correct for the second clause — a permanent with no time counters isn't "a permanent
with a time counter on it." It is wrong for the first: a suspended card qualifies **unconditionally**,
regardless of how many time counters remain. Narrow window in practice, but the clauses should be
separated.

### 4. Time Travel offered for suspended cards at 0 counters

**`DrWhoCompanionEDH`** — `src/App.tsx:55`

The target filter tests mechanic only, not count. A suspended card whose last time counter was
removed has already been cast — it is no longer "a suspended card you own" and should not be a
Time Travel target. `TimeTravelPanel.tsx:146` disables `−1` at zero but leaves `+1` enabled.

### 5. Creature-type parsing splits multi-word types

**`HardlyKnowHer`** — `server/src/services/signals.ts:253-262` vs `server/src/services/partners.ts:116`

`parseCreatureTypes` splits the subtype line on whitespace, so `Creature — Time Lord` yields
`['Time', 'Lord']`. Meanwhile Doctor's companion pairing checks for an exact set equality against
`{'Time Lord', 'Doctor'}`.

These two cannot both be right. Verify against real Scryfall data before choosing a fix — the
`knownTypes` filter (Scryfall's `catalog/creature-types`) may be masking the problem in one path
and not the other. Worth noting the Doctor Who deck that the sibling app is built around makes this
more than theoretical.

### 6. No ban-list check on the user's own cards

**`HardlyKnowHer`** — `server/src/db.ts:110`, `server/src/services/synergy.ts`

Only *commanders* are filtered by `legality_commander = 'legal'`. A banned card sitting in the
submitted list still counts as synergy support and can be cited as a reason for a suggestion.

### 7. Commander eligibility doesn't check the power/toughness box

**`HardlyKnowHer`** — `server/src/services/eligibility.ts:73-91`

The comment at `:78-81` correctly states that CR 903.3 admits a Vehicle or Spacecraft "with a
power/toughness box" — but the implementation only substring-matches the type line for
`Creature` / `Vehicle` / `Spacecraft` and never checks for the box. Also note substring rather than
word-boundary matching throughout.

### 8. Singleton limit silently falls through on digits and large numbers

**`HardlyKnowHer`** — `server/src/services/singleton.ts:23-59`

`UP_TO_N` captures `(\w+)` and resolves it through a hardcoded `NUMBER_WORDS` map covering one
through twelve. A card printed as "up to 7 cards named…" or with a count above twelve resolves to
`undefined` and falls through to a limit of **1**, silently. The failure direction is at least
conservative, but it is silent.

---

## Severity 2 — Architectural inconsistency

### 9. Two competing signal-detection paths

**`HardlyKnowHer`** — `server/src/services/synergy.ts:178-193` vs `server/src/db.ts:143-183`

Two different implementations detect card signals from the same cards:

- `card_signals` — precomputed at import, vocabulary spanning every type and keyword in the game.
  Used by the deck analyser.
- `unitSignals` — computed per request, vocabulary scoped to the submitted list. Used by the scorer.

`import-scryfall.ts:191-197` argues the precomputed path is *more* correct. The scorer should read
the table. Doing so also eliminates redundant recomputation: a card appearing in *k* Partner pairs
is currently processed *k+1* times per request.

**This is the largest single inconsistency in either codebase.**

### 10. Kindred over-detection

**`HardlyKnowHer`** — `server/src/services/signals.ts:656-667` (`candidateTypes`), `:707` (catch-all)

`candidateTypes` harvests creature types from *every word* of a card's oracle text, and
`detectKindred` ends with a catch-all that grants an active `rewards` role for any remaining
mention. Together, any card whose rules text happens to contain a common English word that is also
a creature type — Wall, Scout, Seal, Elder, Noble, Citizen, Mount, Guest, Toy — becomes a kindred
payoff for that type, provided the submitted list holds 3+ citable cards of it.

### 11. Rules constants duplicated across files

- **Commander tax (`castCount * 2`, CR 903.10)** — three copies in `DrWhoCompanionEDH`:
  `CommanderTaxModal.tsx:46`, `CommanderFieldTile.tsx:27`, and inline at `useGameState.ts:375`.
- **`parseJsonArray`** — five identical definitions in `HardlyKnowHer`: `signals.ts:197`,
  `synergy.ts:98`, `partners.ts:13`, `routes/combos.ts:9`, `routes/recommend.ts:27`.
- **Colour-identity subset test** — three inline copies in `HardlyKnowHer`
  (`synergy.ts:261-262`, `packages.ts:57-59`, `combos.ts:69`), plus `DrWhoCompanionEDH`'s
  `colorIdentity.mjs:21-24` — which is the only one deliberately extracted to a shared module,
  with a comment explaining that drift here "would show up as cards silently appearing or
  vanishing."
- **`hasHitTarget` / "is this card ready"** — four expressions of one rule in
  `DrWhoCompanionEDH`: `useGameState.ts:43-46`, `CardTile.tsx:26`, `ActiveCardsList.tsx:21-25`,
  `TimeTravelPanel.tsx:147-151`.

### 12. Dead code that is nonetheless tested

- `turnStepForMechanic` (`DrWhoCompanionEDH` `counters.ts:113-115`) is exported, documented in
  `CLAUDE.md`, and unit-tested at `counters.test.ts:72-80` — but **never imported by production
  code**. `nextTurn` hardcodes the branch twice instead (`useGameState.ts:231`, `:248`). Adding a
  third turn-step mechanic means editing both inline conditions while the tested helper provides
  false confidence.
- `supports()` (`HardlyKnowHer` `signals.ts:826`) — nothing imports it.
- `visibleKeywordLabels` (`HardlyKnowHer` `client/src/lib/suggestions.ts:38`) — never imported.
- `CardDetailDialog` takes a `bracket` prop it never reads; every caller passes it.

---

## Severity 3 — Rendering and data-model defects

### 13. Hybrid and Phyrexian mana render as text

**`HardlyKnowHer`** — `client/src/components/ManaCost.tsx:23-32`

Any symbol without a basic glyph falls back to a grey disc containing its literal text. So `{W/U}`
renders as "W/U", `{W/P}` as "W/P", `{2/W}` as "2/W", `{S}` as "S".

The sibling project handles all of these correctly (`DrWhoCompanionEDH` `manaSymbols.ts:78-103`,
with true split discs). The irony is that the app with the broken renderer is the one whose card
pool is every card ever printed, while the app with the correct one is restricted to Jeskai.

### 14. Modal DFC mana costs are joined, producing phantom pips

**`DrWhoCompanionEDH`** — `scripts/fetch-card-data.mjs:137-146` (`faceField`)

A modal double-faced card has no top-level `mana_cost`, so `faceField` joins both faces:
`"{1}{G} // {3}{G}{G}"`. That string flows into `parseManaCost`, which matches every `{...}` on
both sides of the separator and renders **five pips for a two-mana card**.

### 15. Design token already drifted

`--pip-generic` is `#cdc3ad` in `HardlyKnowHer` (hardcoded ~1,439 lines into a 2,042-line
`index.css`) and `#b3aaa1` in `DrWhoCompanionEDH` (a proper token). The six coloured pip values are
byte-identical in both. The one that drifted is precisely the one that wasn't a token.

### 16. Mana glyph data is hand-copied against an absent dependency

**`HardlyKnowHer`** — `client/src/lib/manaSymbols.ts:13-14`

The header comment instructs the reader to "re-extract from `node_modules/mana-font/svg/…`" — but
`mana-font` is not in `client/package.json`. The instruction cannot be followed. The sibling project
generates the same data with `scripts/gen-mana-glyphs.mjs`, including three fail-loud validations.

---

## Severity 4 — Resilience and UX

### 17. No error boundaries anywhere

Neither app has a React error boundary. A render throw white-screens the app — mid-game, in the case
of the counter tracker, with no state recovery UI.

### 18. No server error handling on the main endpoint

**`HardlyKnowHer`** — `server/src/routes/recommend.ts`

`/api/recommend` has no `try`/`catch` and the app registers no Express error middleware. Any throw
inside scoring returns Express's default 500 with a stack trace.

### 19. Saves are validated shallowly

**`DrWhoCompanionEDH`** — `src/utils/storage.ts:10`

Validation checks only that `turn` is a number and `cards` is an array. A save containing
`cards: [{}]` passes and then crashes `CardTile` on missing fields. Individual `TrackedCard`s are
never validated. There is also no undo for `removeCard`, whose trigger is a ~20px `×` button.

### 20. Touch targets below guideline in a mobile-first app

**`DrWhoCompanionEDH`** — `src/components/CardTile.module.css:185-187`

The `−`/`+` counter steppers — the most-tapped controls in the app — are **24×24px**, against
44×44 (Apple) and 48×48 (Material) guidance. `.removeBtn` is roughly 20×20 and deletes a tracked
card with no undo.

There is exactly **one** `@media` rule in the entire codebase, and it is `prefers-reduced-motion`.
No width breakpoints at all. `index.html` sets `viewport-fit=cover` but `env(safe-area-inset-*)` is
never used, so content can sit under a notch or home indicator — a problem the sibling project
already solved.

### 21. Hand-rolled modals lack focus management

**`DrWhoCompanionEDH`** — five components repeat an identical backdrop/dialog structure with no
focus trap, no focus restoration, no Escape handler, and no scroll lock. The backdrop is
click-to-close but unreachable by keyboard, so `aria-modal="true"` is asserted without being
enforced. The sibling project gets all of this from Radix Dialog.

### 22. Theme token bypassed in the header

**`DrWhoCompanionEDH`** — `src/components/Header.module.css:5` hardcodes `rgba(20, 22, 43, 0.92)`,
which is the *Claude* theme's background colour. The sticky header therefore renders in the wrong
theme's colour under the Doctor Who theme — contradicting the project's own documented rule that
every component reads colour from CSS custom properties.

---

## Not defects — deliberate decisions worth preserving

Recorded so a future reader doesn't "fix" them:

- **Front-face-only commander eligibility with `split` excluded** (`eligibility.ts:44-64`). CR 712.4
  and CR 709.4. This is correct and was itself a bug fix.
- **`usesTimeCounters` excluding fade and lore counters** (`counters.ts:100-110`). CR 702.32.
- **Colour identity contributing zero to the synergy score** (`synergy.ts:245-250`). Reach lets a
  commander play your cards; it is not a reason to prefer one.
- **Sacrifice detection requiring an indefinite object** (`signals.ts:443`). A fetch land
  sacrificing itself is not the Aristocrats archetype.
- **Reminder text stripped before signal detection** (`signals.ts:373-375`).
- **Kindred requiring the card to *care* about a type, not merely *have* it.**
- **Never writing oracle text from memory** — Scryfall has moved much self-referential wording to
  "this creature"/"this land", which silently broke two rules written from recall.
