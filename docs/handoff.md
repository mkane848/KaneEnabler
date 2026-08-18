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

## Current status (2026-08-18)

**All seven phases below have landed**, including every package (`@mtg/config`, `@mtg/mana`,
`@mtg/ui`, `@mtg/rules`, `@mtg/card-model`, `@mtg/profile`, `@mtg/scryfall`) and the hard-rule-gated
Phase 7 (user profiles) and `@mtg/scryfall` work. A fresh session with no more assigned work from
the repo owner should treat this as a stable resting point, not a queue of pending tasks — read the
specific phase section below before touching anything, since "landed" often comes with a documented
scope difference from what the phase originally proposed.

What's genuinely still open, gathered here so a fresh session doesn't have to re-scan every phase:

- **Phase 3a (CR ingestion) is blocked, not done** — this sandbox's egress proxy blocks all three
  source domains (re-confirmed 2026-08-18). Needs to run locally or in GitHub Actions; see that
  section for why the ingestion script itself was deliberately not written blind.
- **`@mtg/profile`'s Supabase-backed hooks have no test coverage** (`useAuth`,
  `useCardPreferences`/`useSetCardPreference`/`useRemoveCardPreference`, the combo equivalents,
  `rows.ts`) — only `comboKey.ts` is tested. The Phase 6 coverage-threshold work made this honestly
  visible (9.3% statements) rather than hidden behind Vitest's default of only counting imported
  files, but didn't fix it.
- **No integration test for `/api/recommend`** end-to-end (parse → singleton → collection profile →
  units → score → select → analysis → serialise) — see Verification, item 3.
- **The real Scryfall fetch isn't exercised in CI**, only manually / at deploy time — see
  Verification, item 5. `import-scryfall.ts`'s floor check (Phase 6) now exists to catch a bad
  import, but nothing runs it on a schedule to catch a bad _fetch_ before it's deployed.
- **Favourited-combo-renders-from-snapshot-with-network-blocked is untested**, and has no view to
  run it against yet — see Verification, item 6, and Phase 7's "no dedicated profile/browse page."
- **Deck-size and whole-deck color-identity validation** (`@mtg/rules`' `deckLegality.ts`) are
  tested and CR-cited but not wired into either app — neither has a deck-list-validation feature
  for them to back yet. See Phase 3b's primitives table.
- **The Spellbook cache is per-process, in-memory** — fine for one user, not once accounts exist.
  See `api-policy.md`'s "known violations," item 2.

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

**Landed.** Hard-rule gated (docs/api-policy.md) — implemented only after explicit repo-owner
sign-off on the one real behavior change it required: DWC's cache check moves from "reuse if the
local file is under 7 days old" (zero network calls most runs) to HKH's "compare Scryfall's
published `updated_at`" (one small `GET /bulk-data` request every run, full download only when the
snapshot actually changed). Confirmed: DWC's own 7-day heuristic was "wrong in both directions" the
same way HKH's superseded one was, per HKH's own comment recorded before this landed.

What moved into the package: `ensureOracleCardsSnapshot` (list → compare `updated_at` against a
sidecar → stream-download-and-gunzip only on change — HKH's streamed approach, kept, over DWC's
buffer-then-`gunzipSync`), `describeFailure`, and `buildUserAgent`. Both `fetch-scryfall.ts` and
`fetch-card-data.mjs` now derive their `User-Agent` version from their own `package.json` — see
[`api-policy.md`](./api-policy.md)'s "known violations" entry for what this fixed and the one place
(`spellbook.ts`) it deliberately didn't reach.

What stayed local to HKH, on purpose: `IMPORT_VERSION` and the sqlite `meta`-table comparison
(`dataSnapshot.ts`/`importedSnapshot.ts`) — that's "was the _database_ built from this file, by this
version of the _import_?", which depends on HKH's own import code and has no DWC equivalent (DWC has
one fetch-and-write stage, not a separate fetch-then-import pipeline). HKH's
`fetchCreatureTypes`/`fetchFlavorNames` companion fetches stayed put too — they're real Scryfall
calls, but never were duplicated between the two apps, so there was nothing to consolidate. Also
added: a floor check on `import-scryfall.ts`'s final imported-card count (mirrors DWC's own
`output.length < 1000` check, scaled to HKH's ~36k unfiltered count) — the doc's original ask,
implemented as HKH's own analogous check rather than shared code, since the two counts and their
filtering logic have nothing in common to share. Not carried over: DWC's `SCRYFALL_BULK_INDEX` env
override (undocumented dead capability — nothing in the repo ever set it) and a seed-fallback for
HKH matching DWC's `ensure-catalog.mjs` (HKH already degrades cleanly pre-import via a 503, not a
crash; committing a seed dataset and wiring a new fallback script felt like scope growth for a
consolidation pass, not something this bullet's own "adopt X" phrasing clearly asked for).

Verified against the live API (this sandbox can reach `api.scryfall.com`) for both apps, both
directions: a real download-and-cache run and a real skip-because-current run, followed by a full
`import-scryfall` run (35,931 cards imported, floor check didn't trip) and a real `fetch-cards` run
(18,407 Jeskai cards), each confirmed against the actually-running app in a browser.

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
constraints instead of respecting them; sharing the _reading_, not the _shape_, is what the
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
>
> Re-confirmed 2026-08-18 (`curl` against `api.academyruins.com`, `magic.wizards.com`, and
> `mtgjson.com` all failed identically: `CONNECT tunnel failed, response 403`) — still blocked, no
> change from when this was first written. Deliberately not attempting the ingestion script itself
> from here even as unrun code: CR parsing (nested rule numbers like 702.32a, cross-references,
> examples, glossary entries) is exactly the kind of text-processing task this project's own "never
> write oracle text from memory" rule exists for, and that principle applies just as much to parsing
> logic nobody can verify against the real source text in this environment. Writing it blind would
> trade the appearance of progress for something that looks plausible and might be subtly wrong in a
> way nothing here could catch. This genuinely needs to run — and be checked against real output —
> somewhere with egress to those three domains.

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

**Landed — all 22 findings.** [`rules-audit.md`](./rules-audit.md) is fully fixed or resolved as
not-actually-defects — see that doc's own "Status" section (added 2026-08-18, checked against
current code and, for #10, real imported-card data rather than trusted from when the audit was
originally written) for the item-by-item breakdown. The three originally called out here as highest
priority — **Fading resolving one turn early**, **manual edits bypassing Saga chapter triggering**,
and **two competing signal-detection paths** — are all fixed, along with everything else the audit
raised, including #20's touch targets (an invisible expanded hit area, not a bigger visible button —
see `CHANGELOG.md`).

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

| Module      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Router**  | Both apps. Type-safe routes; URL-as-state for the recommender's filters/sort/page, which today lives in component state and is lost on refresh and unshareable. Also gives the CR rules browser real routes. **Landed.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Query**   | Keep. Already used correctly with deliberate non-default config. Also replaces DWC's hand-rolled ~25-line cache/in-flight/retry logic in `cardCatalog.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Table**   | **Not adopted — the row below explains why, since this reverses what this table originally said.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Virtual** | **Recommender only — landed differently than planned; DWC explicitly not, see below.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Form**    | **Landed — DWC `AddCardPanel.tsx` only.** The fields actually submitted by the "configure" stage (mechanic, direction, customLabel, starting/target count, autoAdjust, resolveNote, and the variable-length `chapters: string[]` array) now live in one `useForm()` instance, wired via one outer `form.Subscribe` and per-field `form.Field`s; `chapters` uses Form's `mode: 'array'`. Panel flow/selection state that was never a submitted field — stage, search query, manual/quick-suspend/token-creation mode flags, the selected card, the oracle-text-detected-count hint — stayed as plain `useState`, not folded into the form. (The `resetAll()` silently-misses-`mechanic` defect cited here originally was already fixed directly, before Form landed — a one-line addition, not a reason to adopt Form on its own; the rest of the case for Form held.) Not for HKH, whose only form is a textarea plus a file input. |
| **Store**   | No. Alpha, and Zustand already does this job well here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **DB**      | No. Sync/offline-first is its purpose; neither app syncs anything.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Keep** Zustand + TanStack Query with the split the recommender already uses correctly — Zustand
for client state only, Query owning everything fetched. The `retry: false` /
`refetchOnWindowFocus: false` defaults are load-bearing: they throttle Commander Spellbook.

**Table and Virtual, revisited** (both landed after this table was originally written, and not the
way it predicted):

- **Table was never adopted, and shouldn't be now.** Its whole case was folding filter/sort/paginate
  into one state machine so Router could serialise it to the URL. The URL-serialisation half of
  that happened anyway, directly — `RecommendationResults.tsx`'s filters/sort became URL search
  params (`searchSchema.ts`) without Table's involvement. Once Virtual replaced pagination outright
  (below), the other half of Table's case — a shared pagination state machine — stopped applying too:
  there's no pagination left to unify. Adopting Table now would mean bolting it onto working,
  already-shipped code for a benefit that no longer exists.
- **Virtual landed in the recommender, not DWC, and did something bigger than "virtualise" there.**
  The recommender's suggestion grid now renders the full sorted/filtered set (`useWindowVirtualizer`,
  window-scrolled since the page itself scrolls, not an inner pane) instead of paginating —
  `Pagination.tsx`, the `suggestionsPerPage` preference, and the `page` URL param are gone; only
  rows near the viewport are mounted, sized dynamically via `measureElement` since a Partner-pair
  card is taller than a solo one. Column count is computed in JS (`useGridColumns`, matching what
  CSS `repeat(auto-fill, minmax(260px, 1fr))` would have produced) since a virtualizer has to know
  row membership before anything paints.
  DWC's `searchCards`, on inspection, was never a rendering problem — the result list was already
  capped at 8 items, so there was nothing to virtualize. Its real cost was the _scan_: sorting every
  match before slicing to 8, on every keystroke, unthrottled. Fixed directly instead: the catalog is
  already alphabetized, so bucketing into "starts with" / "contains" during a single pass (stopping
  early once the anchored bucket alone fills the limit) replaces the sort entirely, and
  `useDeferredValue` on the query keeps a fast typist from queueing scans back to back. No new
  dependency in DWC.

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

- **Landed.** React error boundaries in both apps (`@mtg/ui`'s `ErrorBoundary`, wrapping each app's
  root in `main.tsx`); Express error middleware in the recommender (`errorHandler.ts`, registered
  last in `index.ts`).
- **Landed.** Per-card save validation in DWC (`storage.ts` drops a corrupted card and logs how many,
  rather than failing the whole load), plus undo for `removeCard` (`UndoToast` + `undoRemove`).
- **Landed.** Split HKH's 2,364-line `index.css` into `styles/tokens.css` plus one file per UI
  area (`layout`, `upload`, `results`, `filters`, `commander-card`, `dialogs`, `combos`,
  `deck-summary`, `error-fallback`, `auth`), `index.css` reduced to a plain `@import` manifest —
  verified line-for-line against the original (sorted-content diff showed only the expected
  `@media` wrapper duplication from splitting one shared breakpoint block across four files) and
  visually, in a live run against seeded data, before and after. `--pip-*`/`--pip-*-ink` turned out
  to already be shared identically between both apps' `index.css` files — that part of this bullet
  was actually satisfied back in Phase 2's `@mtg/mana` work, just not marked as such here.
  `--mechanic-*` (Suspend/Vanishing/Fading/Saga color coding) wasn't adopted — HKH has no
  counter-mechanic concept to code by color, so that token family is DWC-specific domain
  vocabulary, not a generically shareable design token. `--radius-*`/`--shadow-*` were considered
  and also not adopted: DWC's uniform 3-step radius scale doesn't fit HKH's actual usage (14
  distinct `border-radius` values on inspection, several one-off compound corners for card-shaped
  elements), so forcing DWC's specific values in would be a lossy visual change for a cleanup item,
  not a genuine deduplication.
- **Landed.** Component tests for HKH (`ResultFilters`, `LikeDislikeButtons`, `CommanderCard` —
  a meaningful subset, not exhaustive coverage of every component; deferred ones are unremarkable
  props-in/JSX-out or gated behind the same network/auth concerns already stood in for here) plus
  `jsdom` + Testing Library infra (`vitest.config.ts`, `src/test/setup.ts`) it had none of before.
  DWC's `applyTimeTravel` now has a dedicated `describe` block covering clamping at 0, the no-upper-
  bound increment case, no-op/no-log deltas, Rose Tyler's sentinel `'rose'` id, and multi-card/
  multi-pass log content. `AddCardPanel` (DWC) now covers Suspend/Vanishing auto-detection, Saga's
  chapter-row validation and submit payload, manual entry, the quick-suspend flow, and Cancel —
  10 cases, one of which caught a real async-timing gotcha: TanStack Form's `handleSubmit()` is a
  `Promise` even with no validators, so a submission assertion needs a `waitFor`, not a bare
  post-click check.
- **Landed.** `@vitest/coverage-v8` wired into every package via the shared
  `packages/config/vitest.base.ts`, with per-package thresholds set as a regression floor at each
  package's real current numbers, not an aspirational target. Along the way: Vitest 4 only counts a
  file toward coverage if a test actually imports it, so `@mtg/profile` reported 100% by default
  while only 1 of its 8 source files (`comboKey.ts`) had any test at all — `coverage.include:
['src/**']` in the shared base surfaces the honest number (9.3%) instead. That gap itself
  (`useAuth`/`useCardPreferences`/`useComboPreferences`/`rows.ts` all untested) is real and still
  open — not fixed here, just no longer hidden.
- **Landed.** `useCommanderCards` now memoizes on `catalog` (stable after its one `useCardCatalog`
  load) instead of re-scanning on every render; `App.tsx`'s `commanderFieldCards` and
  `timeTravelTargets` are memoized too. Found the same bug independently duplicated in
  `CommanderBanner.tsx` — its own unmemoized `findCardByName` loop — while fixing this; it now
  consumes `useCommanderCards()` instead of re-deriving the same lookup.

## Phase 7 — User profiles

**Landed** — commander-recommender only, per the "DWC stays deck-specific" decision below. The
schema, RLS, and `@mtg/profile` package match this plan closely; three things differ from what's
written below, recorded so they aren't mistaken for gaps in the plan rather than deliberate v1
scope:

- **Email/password only** — this section didn't specify a sign-in method. No OAuth provider, no
  magic link; the smallest surface that works, since a profile is optional scaffolding around the
  recommender's actual job, not a product of its own.
- **No dedicated profile/browse page.** The "seven lists" below are all annotations at the point
  you'd want them — a heart/✕ on a suggestion card and on a combo, a jank toggle in the card detail
  view — not a separate screen that lists everything you've ever liked. Revisit if that's wanted;
  the data model already supports it (`useCardPreferences`/`useComboPreferences` return everything,
  a browse page would just be a new consumer of hooks that already exist).
- **"Hidden or demoted" landed as annotated only.** A disliked card/commander shows the same ✕
  badge as a like, unfilled — nothing currently hides it from the grid or sorts it lower. This
  app already has a session-only "dismiss" for exactly the "get this out of my results" need
  (`useAppStore`); wiring a persistent dislike into that same behavior, or into `sort.ts`, is a
  reasonable follow-up but wasn't done here to avoid reaching into the sort/filter pipeline in the
  same pass as the data layer.

Runs on its own Supabase project ("kaneenabler"), not the account's other one — that one already
holds an unrelated app's data (campaigns/characters/party, nothing to do with Magic).

RLS verified directly against the live project (two throwaway users, impersonated via
`SET LOCAL request.jwt.claims`, cleaned up after): user A's `SELECT` never returns user B's row,
an `UPDATE` targeting user B's row while authenticated as A affects nothing, and an `INSERT`
claiming `user_id = B` while authenticated as A is rejected by the `WITH CHECK` clause. What
_isn't_ verified: the actual signed-in browser flow (sign up → confirm → sign in → like/tag/
favourite) — this sandbox's egress proxy rejects `ctkrhgvboeohmijcpiji.supabase.co` with a 403
("policy denial"), the same class of restriction as the Scryfall-image case elsewhere in this doc.
The UI itself is exercised as far as that block allows (rendering, mode-switching, validation, and
a real network failure surfacing as an inline error rather than a crash); the rest needs a real
browser outside this sandbox, or the block lifted.

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
6. **Profiles:** RLS tested by querying another user's rows and asserting zero results — **done**,
   see Phase 7 above. Still open: favourite a combo, then load the profile **with the network
   blocked** — it must render from `snapshot`. Any Spellbook request during that load is a test
   failure. (There's no profile-browsing view yet to run this against — see Phase 7's "no dedicated
   profile/browse page" note.)
7. Playwright is pre-installed in the remote environment — drive both UIs for the touch-target and
   modal-accessibility fixes.

Plus the API-limits regression guards in [`api-policy.md`](./api-policy.md).

## Sequencing

Phases 0–2 are prerequisites. Phases 3 and 4 can proceed in parallel once packages exist. Phase 5 is
Router first (it unblocks URL-as-state, the rules browser, and Phase 7's profile screens), then
Virtual in the recommender (Table turned out not to apply — see "Table and Virtual, revisited"
above), then Form in `AddCardPanel`. Phase 7 follows Router. Phase 6 is continuous.

Ship each phase as its own PR.
