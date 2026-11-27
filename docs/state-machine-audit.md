# Implicit state machines: audit, findings, and fix plan

**Status:** done. All four fix PRs landed: B1, B3, B4, B5 (D1, D6); D7, D8 and the card-catalog
retry; B2, B7 (D2, D3); and B6 (D4, D5) plus the Spellbook cooldown/dedup/eviction. The optional
M5 panel-state refactor and M1 game-state reducer (§5 item 5) are done, along with the remaining
minor §3.2 items (note re-sync; the `useAuth` race). D9 (multi-tab sync) was first left as-is,
then shipped as option (b) in time-counters 1.8.0 at the owner's request (issue #92).
**Audited at:** `9903e07` (line numbers below are as of that commit — re-check before editing).
**Scope:** `apps/time-counters`, `apps/commander-recommender` (client + server), `packages/profile`.

Read [`../AGENTS.md`](../AGENTS.md), [`../apps/time-counters/AGENTS.md`](../apps/time-counters/AGENTS.md)
and [`../apps/commander-recommender/AGENTS.md`](../apps/commander-recommender/AGENTS.md) first. Three
of their rules bind this work directly:

- **Hard rule 1 (`docs/api-policy.md`).** B6 and D5 change what triggers a Commander Spellbook call.
  Even a change that _reduces_ traffic needs the owner's explicit go-ahead before implementation.
- **Tests before fixes** for anything in the rules audit — B2/B3/B7 are rules defects.
- **Confirm rules text, don't recall it.** D2 and D3 below hinge on CR wording that this audit could
  not fetch (the sandbox's egress refused `api.scryfall.com` on the day; `media.wizards.com` is
  always blocked). Both are written as _open questions_, not facts.

---

## 1. Method

Each place where state is spread across several `useState`s / fields with no named state was
modelled abstractly as **states × events**, and every cell was checked against the code: is the
event accepted, ignored, or impossible in that state, and is what happens correct? Suspicious
cells were turned into throwaway Vitest probes that pass **iff the bug is real** (§3 has the code).
Probes were deleted afterwards; the working tree was left clean.

## 2. The machines

States are derived, not stored, unless noted. "Guard" = something that refuses the event in a
state where it makes no sense.

| #   | Machine                             | Where                                                                                        | States                                                                                                                                                                                                | Notes                                                                                                                                                                                                 |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Game session overlays               | `time-counters/src/hooks/useGameState.ts` (`TrackerState`, l.115) + `App.tsx:108-160`        | Playing · Upkeep summary (`lastUpkeep` non-empty) · Undo window (`lastRemoved` set) — the last two can overlap                                                                                        | Only the Radix modal's focus trap stops `nextTurn` while a summary is up; the hook has no guard. Undo window is not closed by time moving on → **B1**                                                 |
| M2  | Per-card counter lifecycle          | `TrackedCard` + `hasHitTarget` (`utils/counters.ts:133`)                                     | Counting · Ready · (removed) — Fading adds "at 0, not yet exhausted" via `fadeExhausted`; Saga carries a monotonic `triggeredChapters` sub-machine                                                    | Transition rules re-implemented in `setCount`, `adjustCount`, `nextTurn`, `applyTimeTravel`. `addCard` never seeds `triggeredChapters` → **B3**                                                       |
| M3  | Commander zone                      | `castCommander` / `returnCommanderToCommandZone` (`useGameState.ts:510`, `:541`)             | Command zone · Battlefield (`onBattlefield`) + `castCount`                                                                                                                                            | Return is guarded; Cast is not → **B4**                                                                                                                                                               |
| M4  | Turn counter                        | `setTurn` (`useGameState.ts:265`)                                                            | Integer ≥ 1                                                                                                                                                                                           | Backward edits leave `turnAdded` > `turn` and an out-of-order log → **B5**                                                                                                                            |
| M5  | Add-card wizard                     | `time-counters/src/components/AddCardPanel.tsx:63-78`                                        | `stage` ∈ closed/search/configure is explicit, but `manualMode`, `quickSuspend`, `creatingToken`, `selected`, `detectedCount` add hidden sub-states (search × {normal, quick-suspend, token, manual}) | No bug found; impossible combinations (`creatingToken && manualMode`) are representable and the render works around them. `resetAll()` resets eight setters by hand. Refactor candidate, not a defect |
| M6  | Time Travel passes                  | `TimeTravelPanel.tsx:97-127`                                                                 | setup → pass 1…N → closed                                                                                                                                                                             | Clean. No change                                                                                                                                                                                      |
| M7  | Combo lookup                        | `recommender/client/src/components/ComboFinder.tsx:101-120`                                  | idle · fetching · error · results(shown/collapsed), from `requested` + TanStack Query                                                                                                                 | `requested` outlives a change of `submittedList` → **B6**                                                                                                                                             |
| M8  | List upload panel / app store       | `CardListUpload.tsx`, `store/useAppStore.ts`                                                 | editing → submitted → loading → slow (4 s) → loaded+collapsed; `dismissed` resets on a _different_ list                                                                                               | Clean                                                                                                                                                                                                 |
| M9  | Auth session                        | `packages/profile/src/useAuth.tsx:41-75`                                                     | unconfigured · loading · signed-out · signed-in                                                                                                                                                       | Low-risk race, see §3.2                                                                                                                                                                               |
| M10 | Auth dialog                         | `packages/profile/src/AuthDialog.tsx:18-46`                                                  | {sign-in, sign-up} × {idle, submitting, error} + terminal "confirmation sent"                                                                                                                         | Dead end + mid-flight mode switch, see §3.2                                                                                                                                                           |
| M11 | Card catalog load                   | `time-counters/src/utils/cardCatalog.ts` + `hooks/useCardCatalog.ts`                         | empty → in-flight → cached (module, retryable) · loading → loaded/error (hook, terminal)                                                                                                              | Hook can't retry, see §3.2                                                                                                                                                                            |
| M12 | Inline edits, tri-state chips       | `CardTile.tsx:27`, `Header.tsx:25`, `lib/filters.ts:60`, `LikeDislikeButtons.tsx:32`         | display → editing(draft) → commit/cancel; off → include → exclude → off; like/dislike/neutral                                                                                                         | Edits and chips clean; like/dislike has no pending state, see §3.2                                                                                                                                    |
| M13 | Server: wake retry, Spellbook cache | `packages/api-client/src/wakeRetry.ts:59`, `recommender/server/src/services/spellbook.ts:60` | attempt → backoff → … → success/error/deadline; cache entry missing/fresh/stale                                                                                                                       | 429 not remembered; no in-flight dedup; no eviction, see §3.2                                                                                                                                         |

## 3. Findings

### 3.1 Confirmed

Every probe below **passed** at `9903e07`, i.e. the bug is real. To use one as the committed
failing-first test, flip the marked assertion to the post-fix behaviour chosen in §4.

**B1 — Undo after Next Turn restores a card that skipped its upkeep.** (M1 × M2)
Remove a card → Next Turn within the 6 s toast → Undo. The card returns with its pre-upkeep count.
`nextTurn`, `setTurn` and `applyTimeTravel` don't touch `lastRemoved`. Fix depends on **D1**.

**B2 — Bad Wolf counts a Suspend card at 0 time counters.** (M2, rules)
`roseAttacks` (`useGameState.ts:598-602`) counts `c.mechanic === 'suspend'` regardless of count.
The realistic window is exactly the dangerous one: upkeep takes the last counter, the player casts
the card, hasn't hit "resolve" in the tracker yet, and attacks with Rose the same turn. Meanwhile
`buildTimeTravelTargets` (`TimeTravelPanel.tsx:37`) _excludes_ the same card. Fix depends on **D2**.

**B3 — A Saga added past chapter I can re-fire chapters.** (M2, rules)
`addCard` sets `triggeredChapters: []` whatever `startingCount` is (`useGameState.ts:153`). Add at
lore 1, edit to 0, edit back to 1 → the log says "triggers Chapter I" a second time. Independent of
**D3**, the fix is to seed `triggeredChapters` with `1..startingCount`.

**B4 — Casting a commander already on the battlefield increases its tax.** (M3)
`castCommander` has no `onBattlefield` guard; only `CommanderTaxModal.tsx:83`'s button swap stops
it. Fix: `if (commander.onBattlefield) return prev;`, mirroring `returnCommanderToCommandZone`.
Not a product decision.

**B5 — Moving the turn backward leaves cards "added in the future".** (M4)
Set turn 5 → add a card → set turn 2: `turnAdded` stays 5 and the log runs out of order. Fix
depends on **D6**.

**B6 — Combo lookup re-fires without a click.** (M7, **hard rule 1**)
`requested` is component state; `useCombos`' key includes `submittedList`. If the grid stays
mounted while the list changes, a ComboFinder that was clicked for list A silently fetches for list
B. The grid unmounts whenever the new list's recommendations aren't cached
(`RecommendationResults.tsx:251`, `if (!result) return null`), so the reachable path is switching to
a list whose recommendations _are_ cached (A → B → A within the 1 h `gcTime`) with the same
commander unit (`key={suggestion.unitId}`) still shown and expanded. Narrow, but it breaks
api-policy's "Click-only" rule. Fix depends on **D4**.

**B7 — `docs/rules-audit.md` contradicts itself on "suspended".** (docs, rules)
Entry #3 says a suspended card counts for Bad Wolf "unconditionally, regardless of how many time
counters remain". Entry #4 says a suspended card at 0 "has already been cast — it is no longer 'a
suspended card you own'". Both are `[FIXED]`, and the code implements both, which is how B2 exists.
Resolved by **D2**; whichever entry loses must be corrected in the same PR.

#### Probe code

time-counters (`apps/time-counters/src/hooks/*.test.ts`; same helpers as `useGameState.test.ts`):

```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useGameState, type AddCardInput } from './useGameState';

const base = (o: Partial<AddCardInput> = {}): AddCardInput => ({
  card: { id: 'c1', name: 'Rift Bolt' },
  mechanic: 'suspend',
  startingCount: 3,
  direction: 'decrement',
  autoAdjust: true,
  ...o,
});
beforeEach(() => localStorage.clear());

it('B1', () => {
  const { result } = renderHook(() => useGameState());
  act(() => result.current.addCard(base()));
  const id = result.current.state.cards[0]!.instanceId;
  act(() => result.current.removeCard(id));
  act(() => result.current.nextTurn());
  act(() => result.current.undoRemove());
  expect(result.current.state.cards[0]!.count).toBe(3); // BUG; under D1(a): cards has length 0
});

it('B2', () => {
  const { result } = renderHook(() => useGameState());
  act(() => result.current.addCard(base({ startingCount: 1 })));
  act(() => result.current.nextTurn()); // count → 0
  act(() => result.current.roseAttacks());
  expect(result.current.state.commanders.roseTyler.timeCounters).toBe(1); // BUG if D2 = "needs a counter"
});

it('B3', () => {
  const { result } = renderHook(() => useGameState());
  act(() =>
    result.current.addCard(
      base({
        mechanic: 'saga',
        direction: 'increment',
        startingCount: 1,
        targetCount: 3,
        chapters: ['a', 'b', 'c'],
      }),
    ),
  );
  const id = result.current.state.cards[0]!.instanceId;
  act(() => result.current.setCount(id, 0));
  act(() => result.current.setCount(id, 1));
  expect(result.current.state.log.at(-1)!.detail).toContain('triggers Chapter I'); // BUG
});

it('B4', () => {
  const { result } = renderHook(() => useGameState());
  act(() => result.current.castCommander('tenthDoctor'));
  act(() => result.current.castCommander('tenthDoctor'));
  expect(result.current.state.commanders.tenthDoctor.castCount).toBe(2); // BUG; should be 1
});

it('B5', () => {
  const { result } = renderHook(() => useGameState());
  act(() => result.current.setTurn(5));
  act(() => result.current.addCard(base()));
  act(() => result.current.setTurn(2));
  expect(result.current.state.cards[0]!.turnAdded).toBe(5); // BUG; under D6: 2
});
```

Also checked and **fine**: `resetGame` clears the undo window (Remove → Reset → Undo restores
nothing).

recommender client (`apps/commander-recommender/client/src/components/*.test.tsx`):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { ComboFinder } from './ComboFinder';

const fetchCombos = vi.fn(async () => ({
  ready: [],
  almost: [],
  cached: false,
  searchedCardCount: 1,
}));
vi.mock('../api/client', async (orig) => ({
  ...(await orig<object>()),
  fetchCombos: (...a: unknown[]) => fetchCombos(...(a as [])),
}));

it('B6', async () => {
  useAppStore.setState({ submittedList: 'Sol Ring' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ComboFinder commanderNames={['Krenko, Mob Boss']} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('Find combos'));
  await waitFor(() => expect(fetchCombos).toHaveBeenCalledTimes(1));
  act(() => useAppStore.setState({ submittedList: 'Sol Ring\nArcane Signet' }));
  await waitFor(() => expect(fetchCombos).toHaveBeenCalledTimes(2)); // BUG; should stay at 1
});
```

The probe isolates the component; it doesn't exercise the cached-recommendations path in
`RecommendationResults`. A committed regression test should also assert the "Find combos" button
reappears after the list changes.

### 3.2 Found by reading, not reproduced

Verify each with a test before fixing; some may turn out to be acceptable.

- **Like/dislike has no pending state** (`LikeDislikeButtons.tsx:38-49`). The active button comes
  from the server cache and the buttons are never disabled, so a fast second tap re-sends "like"
  instead of removing it, and like→dislike in quick succession races two upserts. See **D7**.
- **Sign-up confirmation is a dead end** (`AuthDialog.tsx:60`, `:107`). Once `confirmSent`, the
  mode switch is hidden; the dialog has to be closed and reopened to sign in. Also: switching mode
  while a request is in flight lets the old mode's error land under the new mode's title. See **D8**.
- **Card catalog failure is terminal** (`useCardCatalog.ts`). The hook has no retry even though
  `loadCatalog` deliberately clears `inFlight` so a later call can retry. Fix: expose a `retry`
  that re-runs the effect; manual entry in `AddCardPanel` remains the fallback meanwhile. Not a
  network-policy change (same-origin static `cards.json`), but say so in the PR.
- **Spellbook server forgets rate limits** (`spellbook.ts:146-205`). After a 429, the next click is
  forwarded to Spellbook anyway; two identical concurrent requests both reach Spellbook; expired
  cache entries are never evicted. See **D5** (hard rule 1).
- **Minor:** `CardPreferenceRow.tsx:25`'s note never re-syncs from server data; two time-counters
  tabs overwrite each other's saved game (see **D9**); `useAuth`'s `getSession()` can resolve after
  `onAuthStateChange` has already fired and overwrite a newer user — low risk.

## 4. Decisions

Recommendation first. **Owner** = needs the repo owner's answer before implementing.

| #   | Question                                                                            | Options                                                                                                                              | Recommendation                                                                                                                                                              | Who                     |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| D1  | What does Undo mean once time has passed? (B1)                                      | (a) any Next Turn / turn edit / Time Travel closes the undo window · (b) replay the missed steps on restore · (c) leave as is        | **(a)** — simple and honest; (b) gets hairy with Fading/Saga                                                                                                                | agreed in session       |
| D2  | Is a Suspend card at 0 time counters still "suspended"? (B2, B7)                    | (a) no — needs a time counter (fix Bad Wolf, correct audit #3) · (b) yes — unconditional (fix Time Travel targets, correct audit #4) | **(a)**, on the auditor's recollection of CR 702.62b — **unverified**, confirm the exact CR text first                                                                      | **Owner** (rules)       |
| D3  | What lore count does a newly added Saga start at?                                   | (a) default 1, chapters ≤ start recorded as fired · (b) keep 0 ("about to cast")                                                     | **(a)**, on the auditor's recollection that a Saga enters with a lore counter and chapter I triggers then (CR 714.3a) — **unverified**. B3's seeding fix applies either way | **Owner** (rules)       |
| D4  | Is one "Find combos" click consent for the commander, or the commander + list? (B6) | (a) commander + submitted list — reset `requested` when `submittedList` changes · (b) commander only (current behaviour)             | **(a)**                                                                                                                                                                     | **Owner** (hard rule 1) |
| D5  | Should the server enforce Spellbook's `Retry-After`?                                | (a) server-side cooldown after a 429 + dedup identical in-flight lookups + evict expired entries · (b) leave to the user             | **(a)** — api-policy already says "stop" on 429; only the user enforces it today                                                                                            | **Owner** (hard rule 1) |
| D6  | What does a backward turn edit mean? (B5)                                           | (a) a correction: clamp `turnAdded` down to the new turn, log "Turn corrected" · (b) forbid lowering the turn                        | **(a)** — forbidding gets in the way at the table                                                                                                                           | agreed in session       |
| D7  | Like/dislike while a write is in flight                                             | (a) optimistic update via `onMutate` on the shared `card-preferences` query, rolled back on error · (b) disable while pending        | **(a)** — taps feel instant and toggle correctly                                                                                                                            | agreed in session       |
| D8  | Sign-up confirmation screen                                                         | add a "Back to sign in" link that resets `confirmSent`; disable the mode switch while `submitting`                                   | **yes**                                                                                                                                                                     | agreed in session       |
| D9  | Sync time-counters across tabs?                                                     | (a) leave it · (b) `storage` event sync                                                                                              | **(b)**, reversing (a) on 2026-11-27 (issue #92): last write wins with a notice, overlays close, unchanged saves skipped so tabs can't echo                                 | agreed in session       |
| D10 | Undo depth                                                                          | keep single-level                                                                                                                    | **keep**                                                                                                                                                                    | agreed in session       |

"Agreed in session" means the owner was shown the recommendation and didn't object; it was not
explicitly signed off. A cheap confirmation in the PR description is still courteous.

## 5. Implementation plan

Separate PRs, in this order. Each: failing test first (from §3), then the fix, then
`pnpm turbo run lint typecheck test build --filter <pkg>`, then exercise the UI in a browser (see
root `AGENTS.md`'s Playwright proxy note).

1. **time-counters — game state (B1, B3, B4, B5; D1, D6).** All in `useGameState.ts`:
   clear `lastRemoved` in `nextTurn`/`setTurn`/`applyTimeTravel`; seed `triggeredChapters` in
   `addCard`; guard `castCommander`; clamp `turnAdded` in `setTurn` (and extend
   `storage.ts`'s validation only if a field changes shape — it shouldn't). Patch bump +
   `CHANGELOG.md` `Fixed` entry; update `README.md`'s Undo/turn wording if any.
2. **time-counters — rules (B2, B7; D2, D3).** Blocked on the owner's rules answers. Prefer
   putting the "is this card suspended?" predicate in `@mtg/rules` (hard rule 2) with its CR
   citation and test, and have both `roseAttacks` and `buildTimeTravelTargets` call it so the two
   can't disagree again. Correct the losing `rules-audit.md` entry. If D3(a), change
   `AddCardPanel.tsx`'s Saga default. Patch bump.
3. **profile — UI states (D7, D8, catalog retry).** `LikeDislikeButtons` optimistic update lives
   in `packages/profile`'s mutation hooks so every consumer benefits; `AuthDialog` back link;
   `useCardCatalog` retry (time-counters). Bump each app whose user-visible behaviour changes.
4. **recommender — Spellbook traffic (B6; D4, D5).** Blocked on owner confirmation (hard rule 1).
   Client: key `requested` to `submittedList` (e.g. store the list it was requested for and compare).
   Server: per-process cooldown until `Retry-After` expires, an in-flight `Map<key, Promise>`, and
   pruning stale entries on write. Update `docs/api-policy.md`'s Spellbook table and add the
   regression guard it already lists ("Spellbook is never called during page load").
   `[Unreleased]` CHANGELOG entry.
5. **Optional refactor (M5, M1).** Replace `AddCardPanel`'s flag soup with one tagged union
   (`{ stage: 'search', source: 'catalog' | 'manual' | 'token' | 'quick-suspend' } | …`), and
   consider a reducer for `useGameState` so "what's allowed while an upkeep summary is open" is
   explicit. No user-visible change, no version bump. Only after 1–2 land.

## 6. Done when

- Every B-item has a committed regression test that fails on `9903e07` and passes after.
- D2/D3 answered by the owner with the CR text quoted from the database or CR source, not recall;
  `rules-audit.md` no longer contradicts itself.
- D4/D5 either implemented with owner confirmation recorded in the PR, or explicitly deferred here.
- This document's **Status** line updated to say what shipped, as the other briefs do.
