# Handoff: KaneEnabler — MTG Tools Monorepo

A standalone brief. A fresh session should be able to execute from this document without
re-deriving the analysis behind it.

Companion documents:

- [`rules-audit.md`](./rules-audit.md) — every rules defect found, with file:line citations
- [`api-policy.md`](./api-policy.md) — the external-API rule, which is a **hard project rule**

---

## What this repo is for

`KaneEnabler` is the root of all Magic: The Gathering tooling in this account. Today it contains
nothing but two git submodules pointing at projects built independently of each other:

- **HardlyKnowHer** (`mtg-commander-recommender` v1.7.1) — paste a card list, get ranked Commander
  suggestions with cited synergies. React 19 + Vite client, Express 5 + better-sqlite3 server,
  ~5,700 lines of app code, 17 hand-rolled test files.
- **DrWhoCompanionEDH** (`mtg-time-tracker` v1.2.0) — an in-game counter companion for one specific
  Jeskai _Doctor Who_ deck. React 19 + Vite, no backend, localStorage, Vitest.

The goal is one place where the game's rules are modelled once, correctly, and consumed by every
tool without being re-derived per feature — so adding a module doesn't mean re-implementing colour
identity or commander legality for the third time.

Both projects are unusually well documented for hobby work (near-total "why" comment coverage, a
683-line `handoff.md`, real CHANGELOGs). Neither has a linter. Both encode overlapping Magic rules
knowledge **differently**, which is where the bugs are.

## Decisions on record

| Question                | Decision                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Consolidation           | Absorb both into `apps/` **preserving history** via `git subtree`. Drop `.gitmodules`.                                                      |
| Rules depth             | Structured CR data + a typed primitives package. **Not** a rules engine.                                                                    |
| DrWhoCompanionEDH scope | **Stays deck-specific.** Extract shared code; do not generalise to arbitrary commanders.                                                    |
| Tech stack              | TanStack **Router on the existing Vite setup — not Start.** Adopt Router, Table, Virtual, Form; keep Query + Zustand. **No RSC.**           |
| User profiles           | Supabase auth + Postgres. Preferences **filter and annotate only** — no scoring change. Combos stored as snapshots taken at favourite time. |

## Target shape

```
KaneEnabler/
  pnpm-workspace.yaml         pnpm workspaces + Turborepo task graph
  turbo.json
  apps/
    commander-recommender/    ← HardlyKnowHer (keeps its client/ + server/ split)
    time-counters/            ← DrWhoCompanionEDH (stays the Doctor Who deck's companion)
  packages/
    rules/                    @mtg/rules      — CR-cited rules primitives + vendored CR snapshot
    scryfall/                 @mtg/scryfall   — bulk-data client, one User-Agent, snapshot cache
    card-model/               @mtg/card-model — normalized Card + fromScryfall() face/DFC rules
    mana/                     @mtg/mana       — glyphs, cost parsing, hybrid/Phyrexian pips, tokens
    ui/                       @mtg/ui         — Radix-backed Modal, AboutDialog, card image/flip
    profile/                  @mtg/profile    — Supabase client, preference types, hooks
    config/                   shared tsconfig / eslint / prettier / vitest bases
```

---

## Phase 0 — Consolidation

`git subtree` keeps full history and needs no submodule ceremony afterwards.

```bash
git remote add hkh https://github.com/mkane848/HardlyKnowHer
git remote add dwc https://github.com/mkane848/DrWhoCompanionEDH
git fetch hkh && git fetch dwc
git rm .gitmodules && git rm --cached HardlyKnowHer DrWhoCompanionEDH
git subtree add --prefix=apps/commander-recommender hkh main
git subtree add --prefix=apps/time-counters        dwc main
```

Then archive both origin repos read-only on GitHub with a README note pointing here. Move
HardlyKnowHer's `handoff.md` to `docs/commander-recommender.md`; fold both projects' `CLAUDE.md` /
`CONTRIBUTING.md` into one root `CLAUDE.md` plus per-app files.

> **Note:** HardlyKnowHer's `handoff.md` file map is already stale. It omits `signals.ts` (879
> lines), `deckAnalysis.ts`, `lifecycle.ts`, `packages.ts`, `cardIndex.ts`, `cardNames.ts`,
> `dataSnapshot.ts` and `importedSnapshot.ts`, and describes a scoring formula
> (`kindred*15 + theme*10 + keyword*8 + archetype*20`) that no longer matches the per-archetype
> weights of 16–22 in `signals.ts`. Reconcile against the code during the move. The code wins.

## Phase 1 — Toolchain baseline

Do this before touching app code; nothing compiles cleanly until the drift is fixed.

- **pnpm workspaces + Turborepo**, `workspace:*` for internal deps.
- **Resolve version drift:** TypeScript `^6.0.3` (HKH) vs `^7.0.2` (DWC); `@types/node` `^22` vs
  `^26`. Pick TS 7 and one Node types version at the root.
- **One test runner: Vitest.** HKH's 17 hand-rolled `tsx scripts/test-*.ts` files each copy-paste a
  `check(label, fn)` harness; assertions are already `node:assert`, so conversion is mechanical.
  Large diff, low risk — **keep every existing case**.
- **Add ESLint + Prettier.** Neither project has a linter, yet `import-scryfall.ts:82,286` carry
  `eslint-disable` directives for one that was never installed.
- **Shared tsconfig base.** The two app configs are near-identical (differing in `"Bundler"` vs
  `"bundler"` casing, `allowJs`, and an `include`). Add `noUncheckedIndexedAccess` — its absence
  hides a latent bug at `counters.ts:140`, where `chapters[n-1]` is typed `string` and is safe only
  by argument.
- **One CI workflow** on a Turborepo task graph. Generalise HKH's `release.yml` (version-vs-tag
  check + CHANGELOG extraction) to the workspace.
- **CI must exercise the card-data fetch.** Neither project's CI runs it today, and that is exactly
  the gap that caused DWC's v1.1.1 production incident (`download_uri` → `jsonl_download_uri`).

## Phase 2 — Shared packages

Ordered by duplication removed ÷ risk.

### `@mtg/mana`

The `MANA_GLYPHS` path data is **byte-identical** between the two projects. HKH's copy is
hand-maintained against an absent dependency; DWC's is generated with validation and has 8 glyphs
to HKH's 6.

**Take DWC's version wholesale.** This fixes HKH's hybrid/Phyrexian rendering as a side effect
(audit items 13 and 16) and un-drifts `--pip-generic` (item 15). Ship DWC's `--pip-*` /
`--pip-*-ink` token pair, which is the better-designed layer.

### `@mtg/scryfall`

Two near-line-for-line reimplementations, including a `describeFailure` helper that is
character-for-character the same. Both independently discovered the `jsonl_download_uri` migration.

Merge to **HKH's snapshot-based cache**, which compares the _published_ `updated_at` — its own
comment records that this replaced a 7-day mtime heuristic that was "wrong in both directions."
**DWC is still running exactly that superseded heuristic.** Keep HKH's streamed gunzip and
sidecar-written-last discipline; adopt DWC's `output.length < 1000` floor check and its
`ensure-catalog.mjs` seed fallback.

One `User-Agent` constant, derived from `package.json` — see [`api-policy.md`](./api-policy.md).

### `@mtg/card-model` — landed narrower than planned above, and why

The original plan was one normalised `Card` plus one `fromScryfall()` owning all face/DFC rules,
reasoning that `CardData`, `CommanderCardDTO`, and `CardRow` had ~7 of 9 core fields overlapping.
Two things changed that by the time this phase actually ran:

- **`CardRow` grew a lot of import-time-computed fields that were never raw Scryfall data in the
  first place** — `is_commander_eligible`, `legality_commander`, `game_changer`, `partner_ability`/
  `partner_target`, `is_background`. A "normalised Card" that included these would be modelling this
  app's own derived facts, not Scryfall's; one that excluded them would be a much smaller overlap
  with `CardRow` than the ~7/9 estimate assumed.
- **Phase 3b landed first and already centralised the hardest part.** `frontFaceCharacteristics`
  (front-face-only `type_line`/`oracle_text`, CR 712.4 — the actual domain knowledge behind audit
  item 14, the client-side MDFC mana-cost bug that was already fixed directly) now lives in
  `@mtg/rules`, tested and shared by both apps. There was no eligibility-adjacent face logic left
  for this package to own.

What was still genuinely duplicated, once eligibility was out of the picture, was narrower: how
`server/scripts/import-scryfall.ts` and `time-counters/scripts/fetch-card-data.mjs` each
independently read a face-aware field (mana cost, power, toughness), an image URI, and a back
face's name/picture off a raw Scryfall card object — plus, in the process of comparing the two,
**a real bug**: `import-scryfall.ts`'s own `mana_cost` read had no front-face fallback at all (unlike
its `power`/`toughness`/`colors` reads, which did), so every modal DFC's stored `mana_cost` was
`null` and the client showed it with no pips — the same failure mode as audit item 14, just on the
server's import instead of the client's render, and never separately caught. `@mtg/card-model`
ships that toolkit (`frontFaceField`, `frontImageUri`, `backImageUri`, `backFaceName`,
`isTwoSidedLayout`) and both scripts now call it; the bug is fixed as part of the same rewiring.

`@mtg/card-model` did **not** land as one shared `Card` type. Each app's own shape stayed exactly as
narrow as it already was, for reasons that turned out to be real rather than historical accident —
`CardRow`'s SQLite JSON-string columns, `CardData`'s deliberately sparse `oracleText` (only ~100 of
~18,000 cards), `CommanderCardDTO`'s wire-dedup shape (see `cardIndex.ts` in
`docs/commander-recommender.md`). Forcing all three through one wide shape would have fought those
constraints instead of respecting them; sharing the *reading*, not the *shape*, is what the
duplication was.

One more constraint decided the package's own implementation: `fetch-card-data.mjs` runs under bare
`node` with no build step, so — unlike every other `packages/*` — this one is plain `.js` with JSDoc
types, not `.ts` (same reason `time-counters/src/utils/colorIdentity.mjs` already isn't `.ts`). It
still needs the same dual CJS/ESM story `@mtg/rules` needed, for the same underlying reason
(commander-recommender/server has no `"type": "module"`, so `tsx`-run scripts there resolve it via
`require()` at runtime) — see the package's own `src/index.js` for the exact mechanics.

Two landmines from the original plan, now moot but worth remembering if a real shared `Card` type is
ever revisited: `CardData.id` is Scryfall's **printing** id, while HKH keys everything on
`oracle_id` — same field name, different identifier space. And `CardData.oracleText` being sparse
by design (not a gap to fill) is exactly the kind of thing a wide shared shape would silently lie
about.

### `@mtg/ui`

DWC hand-rolls five modals with no focus trap, no Escape, no focus restoration and no scroll lock
(audit item 21). HKH gets all of it free from Radix Dialog. One shared `<Modal>` fixes five
components at once.

## Phase 3 — `@mtg/rules`

Two layers, deliberately separate.

### 3a. Vendored Comprehensive Rules snapshot

`packages/rules/data/cr-<version>.json` — `{ ruleNumber, text, examples[], parent }` plus the
glossary, committed to the repo.

> **Network constraint:** the remote sandbox can reach `api.scryfall.com` only.
> `media.wizards.com`, `mtgjson.com` and `api.academyruins.com` are blocked by the egress proxy.
> The ingestion script must therefore run **where egress exists** — locally, or in GitHub Actions —
> and commit its output. That is the right design regardless: the CR changes roughly 4× a year, and
> a vendored snapshot keeps builds deterministic and offline-capable.

- Primary source: the official CR `.txt` from magic.wizards.com/en/rules
- Cross-check: [Academy Ruins API](https://api.academyruins.com) (AGPL-3.0), which already publishes
  the CR as structured JSON
- A scheduled workflow opens a PR when a new CR version ships, making rules updates a review rather
  than a chore
- Distribution follows the WotC Fan Content Policy — see [`api-policy.md`](./api-policy.md)

### 3b. Rules primitives

Typed functions, each citing the CR rule it implements, each tested against it. **Every rule lives
here once; tools consume it and never re-derive it.** This is the answer to not wanting to revisit
rules support every time a new feature is imagined.

| Primitive                                          | CR                  | Landed in `@mtg/rules`                                                                                                                                                                        |
| -------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isCommanderEligible` / `frontFaceCharacteristics` | 903.3, 712.4, 709.4 | `eligibility.ts` — moved wholesale from HKH's copy                                                                                                                                            |
| `singletonLimit`                                   | 903.5b              | `singleton.ts` — the pure rule only; `applySingletonLimits`' list-merge orchestration isn't a Magic rule and stayed in HKH's `services/singleton.ts`, calling this                            |
| `buildCommanderUnits` (all six Partner variants)   | 702.124             | `partners.ts` — HKH's own `services/partners.ts` is now a thin facade re-exporting this                                                                                                       |
| `commanderTax(castCount)`                          | 903.10              | `commanderTax.ts` — DWC's 3 inline copies now call this                                                                                                                                       |
| `isWithinColorIdentity`                            | 903.4               | `colorIdentity.ts` — every identity-subset check in both apps now calls this. `sortWubrg`/`identityName` stayed in HKH — display formatting, not a rule, and only ever had one implementation |
| Counter taxonomy: time vs fade vs lore             | 702.32, 702.62, 714 | `counters.ts` — moved from DWC's `utils/counters.ts`                                                                                                                                          |
| Turn steps that matter (upkeep, precombat main)    | 500–514             | `counters.ts` — same file; DWC's two hardcoded copies now call this                                                                                                                           |
| `parseCreatureTypes`                               | 205.3m              | `creatureTypes.ts` — moved from HKH's `signals.ts`                                                                                                                                            |
| Commander format legality                          | —                   | `legality.ts` — `isCommanderLegal` centralized here; ban list / Game Changers are still raw Scryfall fields, no primitive needed                                                              |
| Deck size (100 cards)                              | 903.5a              | `deckLegality.ts` — new                                                                                                                                                                       |
| Deck-wide colour-identity legality                 | 903.4               | `deckLegality.ts` — new (`combinedColorIdentity` + `findColorIdentityViolations`)                                                                                                             |

The last two are genuinely new: neither app has a deck-list-level validation feature today (both only
score/suggest against a _submitted_ list, never validate a completed 100-card deck), so these two are
tested and CR-cited but **not called from either app yet** — wire them in when a feature needs them,
rather than leaving the rule undocumented until then.

## Phase 4 — Rules audit

See [`rules-audit.md`](./rules-audit.md) for the full findings: 8 severity-1 correctness defects,
4 architectural inconsistencies, 4 rendering/data-model defects, and 6 resilience/UX items.

Highest priority: **Fading resolves one turn early** (a genuine rules bug), **manual edits bypass
Saga chapter triggering**, and **two competing signal-detection paths** in the recommender.

Each item should get a failing test before its fix.

## Phase 5 — TanStack Router on Vite

**Start was considered and dropped.** Both apps keep their current shape. Reasons, recorded so this
isn't relitigated:

- **Release-candidate status** for a solo hobby project, where Router/Query/Table/Form/Virtual are
  all stable today.
- **SSR is the per-route default** (`ssr: true`). Taking it would put the whole recommendation
  pipeline on the critical path for first HTML, on a free instance that sleeps for 30–60s. Today a
  sleeping API still leaves a CDN-served client painting instantly behind a "waking the server"
  banner — that is what the 75-second wake budget in `api/client.ts` buys. Full SSR replaces that
  with a browser error page and no shell to render the banner in. SPA mode avoids this, but then
  Start does very little that Router alone doesn't.
- **It doesn't collapse the deploy topology.** Keeping the CDN-served shell means keeping a static
  target _plus_ a Node target for SQLite either way.
- **The migration cost lands on the least-broken part of the codebase.** The client/server split
  works; the rules logic is what has defects.

Revisit Start if the recommender needs SSR for SEO, or if time-counters grows a server (shared game
state across players' devices would be the trigger).

### What to adopt

| Module      | Decision                                                                                                                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Router**  | Both apps. Type-safe routes; URL-as-state for the recommender's filters/sort/page, which today lives in component state and is lost on refresh and unshareable. Also gives the CR rules browser real routes.                                                                                                                     |
| **Query**   | Keep. Already used correctly with deliberate non-default config. Also replaces DWC's hand-rolled ~25-line cache/in-flight/retry logic in `cardCatalog.ts`.                                                                                                                                                                       |
| **Table**   | Adopt properly in the recommender. Currently headless-for-pagination-only, with filtering and sorting as separate hand-written passes. Folding them into the table model puts filter/sort/paginate in one state machine Router can serialise to the URL, and removes the `useEffect` that resets pagination on page-size change. |
| **Virtual** | Both. DWC's `searchCards` is an O(n) scan over ~18,000 cards per keystroke that sorts _all_ matches before taking 8, un-debounced. HKH's suggestion grid renders 12–96 unmemoised 361-line `CommanderCard`s that all re-render on any filter change; virtualising lets the page-size cap come off entirely.                      |
| **Form**    | **DWC `AddCardPanel.tsx` only.** 16 `useState` hooks in one 485-line component, three conditional entry modes, a variable-length `chapters: string[]` field array, and a hand-rolled `resetAll()` that resets 15 of 16 values and silently misses `mechanic`. Not for HKH, whose only form is a textarea plus a file input.      |
| **Store**   | No. Alpha, and Zustand already does this job well here.                                                                                                                                                                                                                                                                          |
| **DB**      | No. Sync/offline-first is its purpose; neither app syncs anything.                                                                                                                                                                                                                                                               |

**Keep** Zustand + TanStack Query with the split the recommender already uses correctly — Zustand
for client state only, Query owning everything fetched. The `retry: false` /
`refetchOnWindowFocus: false` defaults are load-bearing: they throttle Commander Spellbook.

### React Server Components

**Verdict: no.** Recorded so the question is settled.

- React's own team scopes RSC at content-heavy sites; interactivity gains are incremental.
- The recommender's results view filters/sorts/paginates up to ~1,400 suggestions and
  **deliberately** fetches the whole set client-side because the filter bar needs full counts.
  Moving that to RSC means a server round trip per filter click — replacing a documented design
  decision with a slower one.
- time-counters is a localStorage game companion with no server at all. RSC is inapplicable.
- The one genuine candidate was the CR rules browser. Without Start, plain Vite prerendering covers
  it at a fraction of the cost.

## Phase 6 — Quality pass

- React error boundaries in both apps; Express error middleware in the recommender.
- Per-card save validation in DWC, plus undo for `removeCard`.
- Split the 2,042-line `index.css`; adopt DWC's `--pip-*` / `--mechanic-*` token layer.
- Component tests: HKH has **zero**. DWC's `applyTimeTravel` — its most rules-dense and
  most-recently-corrected function — has **zero** coverage. `AddCardPanel` has none.
- Add `@vitest/coverage-v8` with a threshold.
- Fix `useCommanderCards` (new object literal every render, two linear scans over ~18k cards) and
  memoise the two derived arrays in DWC's `App.tsx`.

## Phase 7 — User profiles

The project's first **writable** data.

> This breaks a documented assumption. HKH's `handoff.md` states the card SQLite is _"static
> read-only reference data, not app state"_ — which is why Render rebuilds it per deploy instead of
> paying for a persistent disk. **Keep that true.** Profiles go in Supabase Postgres, entirely
> separate from the card database. Nothing about the card-data pipeline changes. The "no user
> accounts" non-goal is superseded; update it rather than leaving it to contradict the code.

### Data model — seven lists, two tables

The seven requested categories are **views, not tables**:

```sql
card_preferences (
  user_id, oracle_id, sentiment 'like'|'dislike', tags text[], note, created_at,
  unique (user_id, oracle_id)          -- you cannot both like and dislike a card
)
combo_preferences (
  user_id, combo_key, sentiment 'like'|'dislike', spellbook_id nullable,
  snapshot jsonb, fetched_at, created_at,
  unique (user_id, combo_key)
)
```

| Requested list                  | How it's derived                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cards they like / dislike       | `card_preferences.sentiment`                                                                                                                                                                    |
| Favourite jank cards            | `sentiment = 'like' AND 'jank' = ANY(tags)`. **Jank is a tag, not a list** — a jank card is a card you like _for being jank_. A separate list would duplicate the row and let the two disagree. |
| Favourite / disliked commanders | The same rows joined against `cards.is_commander_eligible`, already a column. A commander **is** a card; a second table would drift.                                                            |
| Combos they like / hate         | `combo_preferences.sentiment`                                                                                                                                                                   |

Key on **`oracle_id`**, not printing id — HKH already does this, and DWC's `CardData.id` being a
printing id is one of the landmines `@mtg/card-model` exists to resolve.

`combo_key` is a hash of the sorted card names, **not** `spellbook_id` — that field is nullable in
`ComboResult`, and the live Commander Spellbook contract is unverified.

### Behaviour

- **Filter and annotate only.** Disliked cards/commanders are hidden or demoted; liked ones get a
  badge. `synergy.ts` scoring is untouched — it has three unresolved calibration questions already
  open (score floor, tie-breakers, density-denominator choice A/B), and layering preference weights
  on an uncalibrated score compounds two unknowns. Revisit after those land.
- **Combo snapshots render offline.** The profile never calls Commander Spellbook to display a
  favourited combo; it renders `snapshot`. Re-resolution happens only on an explicit per-combo
  refresh click. **Zero new outbound traffic** — see [`api-policy.md`](./api-policy.md).
- **RLS on both tables**, owner-only. This is the project's first PII: add a privacy note to the
  About dialog and keep profile data out of logging.
- Lives in `@mtg/profile` so future tools consume it without re-implementing it. time-counters stays
  deck-specific and doesn't need it, but nothing blocks it later.

---

## Verification

Each phase must leave the tree green.

1. `pnpm install && pnpm turbo run typecheck lint test build` at the root.
2. **Rules primitives:** every function in `@mtg/rules` has a test naming its CR rule. Each
   `rules-audit.md` defect gets a failing test first, then the fix.
3. **Recommender end-to-end:** `pnpm --filter commander-recommender dev`, paste a real decklist,
   confirm suggestions return. There is currently **no integration test for `/api/recommend`** — add
   one covering parse → singleton → collection profile → units → score → select → analysis →
   serialise. (Note: "profile" there is `CollectionProfile`, unrelated to Phase 7.)
4. **Time-counters end-to-end:** `pnpm --filter time-counters dev`, add a Suspend card, advance a
   turn, run Time Travel, confirm the log. Re-verify Fading N grants N+1 turns after that fix.
5. **Card data:** run the real Scryfall fetch in CI, not just the seed. Assert the floor check fires.
6. **Profiles:** RLS tested by querying another user's rows and asserting zero results. Favourite a
   combo, then load the profile **with the network blocked** — it must render from `snapshot`. Any
   Spellbook request during that load is a test failure.
7. Playwright is pre-installed in the remote environment — drive both UIs for the touch-target and
   modal-accessibility fixes.

Plus the API-limits regression guards in [`api-policy.md`](./api-policy.md).

## Sequencing

Phases 0–2 are prerequisites. Phases 3 and 4 can proceed in parallel once packages exist. Phase 5 is
Router first (it unblocks URL-as-state, the rules browser, and Phase 7's profile screens), then
Table and Virtual in the recommender, then Form in `AddCardPanel`. Phase 7 follows Router. Phase 6
is continuous.

Ship each phase as its own PR.
