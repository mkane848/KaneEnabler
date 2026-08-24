# Colour filter: restore subset ("fits inside these colours") semantics

**Status:** approved by the repo owner, not started.
**Branch:** `claude/filter-commander-identity-bug-76s2zs` — already carries this document; the
implementation goes on top of it.
**Scope:** `apps/commander-recommender/client` only. No server changes, no `packages/*` changes.

Read [`../CLAUDE.md`](../CLAUDE.md) and
[`../apps/commander-recommender/CLAUDE.md`](../apps/commander-recommender/CLAUDE.md) before
starting — they carry hard rules this change depends on, notably hard rule 2 ("Magic rules go in
`@mtg/rules`, once").

---

## 1. The bug as reported

The owner filtered the recommender's Colours row to **Red + Green** (both pips ringed green =
included) and still saw **Myrkul, Lord of Bones** — a W/B/G (Abzan) commander — in the results.

## 2. Diagnosis

Not drift, not a defect in the wiring — the predicate is doing what it was written to do.

`apps/commander-recommender/client/src/lib/filters.ts:77-88`

```ts
function matchesColors(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length > 0) {
    const allowed = new Set(include);
    if (!suggestion.colorIdentity.some((color) => allowed.has(color))) return false; // ← here
  }
  if (exclude.length > 0) {
    const excluded = new Set(exclude);
    if (suggestion.colorIdentity.some((color) => excluded.has(color))) return false;
  }
  return true;
}
```

`.some()` means "touches **at least one** included colour". Myrkul's identity contains Green, so an
include set of `{R, G}` keeps it. The hint text at `ResultFilters.tsx:156-158` ("results touch at
least one included color") describes this accurately — the UI is self-consistent; the _semantics_
are what the owner disagrees with.

Facts worth knowing before starting:

- **Filtering is 100% client-side.** `server/src/routes/recommend.ts:43` destructures only
  `{ list }` from the request body; `client/src/api/queries.ts` POSTs only `submittedList`. There
  is no server-side colour filter to keep in sync.
- **Filter state lives in the URL**, not `useState` — TanStack Router search params validated by
  `client/src/lib/searchSchema.ts`. The `{ include: string[], exclude: string[] }` shape is
  unchanged by this work, so there is no schema or migration concern.
- **Both result tiers already run through the same `applyFilters`** — the main grid
  (`RecommendationResults.tsx:157`) and the "Also playable" coverage tier (`:175-178`). Fixing the
  predicate fixes both at once.

## 3. The decision, and why it reverses a documented one

**Approved semantics: subset.** Including `{R, G}` keeps only identities that fit entirely inside
`{R, G}` — mono-R, mono-G, Gruul, and colourless. Myrkul drops. This matches Scryfall/EDHREC
colour filters and the question the owner is actually asking: "what could I build from this Gruul
pool?"

This **reverses a deliberate decision** recorded in two places. They are not reasons to stop, but
read them so the amendments in §4d are accurate:

- `apps/commander-recommender/CHANGELOG.md`, `[Unreleased]` → Changed → "Colour filter pips now
  mean 'touches this colour,' not 'fits inside these colours.'"
- [`recommendation-coverage.md`](./recommendation-coverage.md) `:81-88` (problem statement) and
  `:103-106` ("Decisions already taken", marked _confirmed with the repo owner_).

**Why the reversal is correct now.** The original reason for "touches" was that under subset
semantics, clicking Black on a wide rainbow pool returned _nothing_ — no narrow-identity commander
ever cleared the scorer's signal-count bar to reach the results at all. That root cause has since
been fixed independently: `server/src/services/coverage.ts` adds the "Also playable" tier —
commanders already in your list (`owned`) plus a relaxed, **narrowest-identity-first** pick
(`covers`) — and that tier is filtered by the same filter bar. So a mono-black Tergrid in a rainbow
pool now surfaces under Black even with subset semantics. The workaround can be withdrawn because
the defect it worked around is gone.

The owner **declined** a semantics mode toggle and declined an AND reading ("identity must contain
every picked colour"). Don't reintroduce either.

## 4. Changes

### 4a. `client/src/lib/filters.ts` — the predicate

Replace the `include` branch (lines 79-82) with a subset test, **reusing the existing CR 903.4
primitive rather than writing a fresh `.every()` inline**:

```ts
import { isWithinColorIdentity } from '@mtg/rules';
```

`packages/rules/src/colorIdentity.ts:7` is exactly `cardColors.every((c) => identity.has(c))`,
exported from `packages/rules/src/index.ts:14` and tested in `colorIdentity.test.ts` (including the
empty-identity case at `:14-15`). `@mtg/rules` is **already** a `workspace:*` dependency of the
client (`client/package.json:20`) — no new dependency to add. This becomes the client's first
consumer of the package; the server and `deckLegality.ts` already use it.

Three things to get right:

- **Leave the `exclude` branch (lines 83-86) alone.** "Drop anything touching an excluded colour"
  remains the correct complement and stays meaningful when nothing is included. Its existing test
  should keep passing untouched — treat that as the signal you didn't overreach.
- **Colourless now survives a colour include** (`[]` is trivially a subset — `isWithinColorIdentity`
  already returns `true` for it). This is correct Magic semantics and restores pre-1.8.0 behaviour.
  The `colorless` chip in the `colorCategory` facet keeps its independent job: asking for _only_
  colourless.
- **Rewrite the doc comment at lines 62-76.** As written it is a detailed argument _for_ the
  "touches" semantics, and would read to a future maintainer as grounds to revert this change.
  Replace it with the subset rationale plus one line noting that the narrow-commander starvation it
  used to solve is now handled by the coverage tier. Match the house style — explain _why_, not
  _what_, and keep it load-bearing rather than narrating.
- While you're there: the `colorCategory` comment at lines 15-23 already says colours mean
  `"must be a subset of {B, G}"`. That sentence becomes true again — verify it reads correctly
  rather than blindly editing it.

### 4b. `client/src/components/ResultFilters.tsx` — wording and pip availability

**Hint text (line 157):** replace
`click to include a color, again to exclude — results touch at least one included color`
with wording for subset, e.g. `click to include a color, again to exclude — results fit inside the
colors you include`.

**`nextColorModeDescription` (lines 78-90):** its doc comment says "including White doesn't require
white on its own — it keeps anything that touches white, Orzhov and five-colour piles included",
and that a colourless commander "drops out the moment any color is included". Both statements
invert under this change; rewrite the comment. The returned a11y strings themselves ("not filtered
— click to include this color", etc.) stay accurate as-is.

**Pip availability — the dead `colors` set.** `availableFilterValues` computes a `colors` `Set`
(`filters.ts:156, 163, 171`) that `RecommendationResults.tsx:162` never destructures — it takes
only `{ brackets, themes, hasColorless, hasMulticolor }`. So all five WUBRG pips always render
identically and there is no signal that a colour is absent from the pool. Thread the set through as
a new `availableColors: Set<string>` prop and mute a pip for a colour no suggestion has.

> **Mute, do not disable — this matters.** Under subset semantics, adding a colour to the include
> set _widens_ the result set. Building up `{R}` → `{R, G}` legitimately passes through a possibly
> empty `{R}` state, so disabling pips would break the natural interaction. Muting is honest
> information ("nothing in this pool is red") without blocking anything. The existing empty state at
> `RecommendationResults.tsx:299-309` already handles a zero-result combination and offers
> "Clear filters".

**`client/src/styles/filters.css`:** add a `.toggle-pip-unavailable` rule alongside the existing
`.toggle-pip-include` / `-exclude` block (lines 63-75), matching their comment-explains-why style.
Note the base `.toggle-pip` is _already_ `opacity: 0.45` with a `:hover` lift to `0.8` — an
unavailable pip has to be visibly distinct from a plain "off" pip, not just dimmer by a hair.
Something like a lower opacity plus `filter: grayscale(1)` and no hover lift. Check it in both
themes before calling it done.

### 4c. Tests

`client/src/lib/filters.test.ts` — the section header at line 61 reads
`// --- color filtering (any-touch-include, any-touch-exclude) ---` and three tests pin the old
behaviour:

| Line | Test                                                                | What happens                                                                                                                                  |
| ---- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 63   | `'color include keeps anything touching an included color'`         | **Rewrite.** With `include: ['B']` and the existing fixtures, keeps `monoBlack`, drops `golgari`, `wb`, `boros`. Rename to say "fits inside". |
| 74   | `'color include drops a colourless commander — it touches nothing'` | **Inverts.** Colourless is now kept. Rename accordingly.                                                                                      |
| 83   | `'color exclude drops anything touching an excluded color'`         | **Unchanged, must still pass.**                                                                                                               |

**Add the reported case — nothing currently covers a multi-colour include at all.** With
`include: ['R', 'G']`: keeps Gruul `['R','G']`, mono-R, mono-G, and colourless `[]`; drops an Abzan
`['W','B','G']` fixture. Name it after the bug ("Abzan does not survive an R+G include") so a later
cleanup doesn't quietly delete the regression guard. Fixtures come from
`client/src/test/fixtures.ts` — `makeSuggestion({ colorIdentity: [...] })`.

`client/src/components/ResultFilters.test.tsx` — add `availableColors` to `BASE_PROPS` (lines
6-19), and add one case asserting a colour absent from `availableColors` renders muted **and still
cycles on click** (that second half is the guard against someone later "improving" it into
`disabled`).

### 4d. Docs

- **`apps/commander-recommender/CHANGELOG.md`:** the "touches this colour" entry is still under
  `[Unreleased]` and has never shipped in a released version (current version is 1.9.0 across
  `client`, `server`, and the app root `package.json`). **Rewrite that entry in place** rather than
  stacking a contradicting "reverted" entry underneath it — `[Unreleased]` should describe the net
  change since 1.9.0, and a reader shouldn't have to reconcile two entries that cancel out. State:
  subset behaviour, that colourless survives a colour include, and that the coverage tier is what
  makes narrow identities reachable. Match the level of detail of the surrounding entries.
- **[`recommendation-coverage.md`](./recommendation-coverage.md) `:103-106`** — amend the "Colour
  pips change to 'touches this colour'" bullet under "Decisions already taken" with a dated note
  recording the reversal and its reason, so a future reader treats subset as the _current_ decision
  rather than a regression to fix. Leave the historical problem statement at `:81-88` intact, but
  point it at the amendment.
- **This document**: mark it shipped once the work lands, the way `signals-rework.md` and
  `recommendation-coverage.md` are.
- **No [`commander-recommender.md`](./commander-recommender.md) file-map change** — no files added,
  renamed, or removed.

## 5. Files touched

| File                                              | Change                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `client/src/lib/filters.ts`                       | `matchesColors` include → `isWithinColorIdentity`; rewrite comments |
| `client/src/components/ResultFilters.tsx`         | hint text, colour-mode comment, `availableColors` prop, muted pips  |
| `client/src/components/RecommendationResults.tsx` | destructure `colors` at line 162, pass down                         |
| `client/src/styles/filters.css`                   | `.toggle-pip-unavailable`                                           |
| `client/src/lib/filters.test.ts`                  | flip 2 colour tests, add the R+G regression test                    |
| `client/src/components/ResultFilters.test.tsx`    | new prop, muted-pip case                                            |
| `apps/commander-recommender/CHANGELOG.md`         | rewrite the `[Unreleased]` colour-filter entry                      |
| `docs/recommendation-coverage.md`                 | amend the recorded decision                                         |

All paths under `client/` are relative to `apps/commander-recommender/`.

## 6. Verification

Run from the repo root.

1. `pnpm --filter mtg-recommender-client test` — flipped colour tests and the new R+G regression
   test pass; the exclude test still passes untouched.
2. `pnpm --filter mtg-recommender-client typecheck` and `pnpm --filter mtg-recommender-client lint`
   — `noUncheckedIndexedAccess` is on and the new prop threads through two components.
3. `pnpm turbo run test typecheck --filter mtg-recommender-server` — expected untouched; run it to
   confirm the new `@mtg/rules` import didn't disturb that package's CommonJS build path (the
   server consumes `@mtg/rules` through a real CJS build — see `packages/rules/tsconfig.build.json`).
4. **Run the app.** The app's own `CLAUDE.md` requires this for any user-visible change — a clean
   typecheck doesn't catch a CSS rule that silently stopped applying.
   `pnpm --filter mtg-recommender-server dev` + `pnpm --filter mtg-recommender-client dev`.
   Needs a seeded `server/data/cards.sqlite`; if absent, `cd server && pnpm run prepare-data`
   (network to Scryfall — read [`api-policy.md`](./api-policy.md) first, it's a hard project rule).
   - Submit a wide multi-colour list. Include **R** and **G**. Confirm Myrkul and every other
     identity carrying W, U, or B disappears from **both** the main grid and the "Also playable"
     tier, and Gruul / mono-R / mono-G / colourless remain.
   - Confirm a colour with no suggestions renders muted but still clicks.
   - Refresh the page — the filter survives (URL search params, shape unchanged, should be free).
   - **Click Black alone on that same rainbow pool.** The main grid may well be empty, but the
     "Also playable" tier should show narrow black picks. This is the check that the coverage tier
     really does make subset semantics viable again. **If it comes back completely empty, stop and
     report it to the owner rather than shipping** — that would mean the premise in §3 doesn't hold
     and the decision needs revisiting.

## 7. Wrapping up

- Commit to `claude/filter-commander-identity-bug-76s2zs` and push with
  `git push -u origin claude/filter-commander-identity-bug-76s2zs`.
- A draft PR for that branch may already exist (this document was pushed to it). If not, open one.
- No version bump — the changelog entry goes under `[Unreleased]`, where the entry being rewritten
  already sits.

## 8. Things not to do

- Don't add a semantics mode toggle, and don't implement AND ("identity must contain every picked
  colour"). Both were offered to the owner and declined.
- Don't `disable` unavailable pips (see the callout in §4b).
- Don't touch the `exclude` branch of `matchesColors`.
- Don't write a local `.every()` subset helper in the client — `@mtg/rules` owns that primitive
  (root `CLAUDE.md` hard rule 2), it's already a dependency, and it's CR-cited and tested.
- Don't change anything server-side. The `shown`/`total` footer undercount (it counts only the main
  grid, not the "Also playable" tier) was raised with the owner and **deliberately left out of
  scope** — leave it.
