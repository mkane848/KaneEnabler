# KaneEnabler - Architecture Audit

- **Date:** 2026-09-02
- **Auditor:** Codex (Kimi K3), at the repo owner's request
- **Commit audited:** `origin/main` @ `8b27076` ("Merge pull request #76 ... Release commander-recommender 1.12.1"), fetched and confirmed current on 2026-09-02.
- **Method note:** the local checkout (`codex/kimi-audit` @ `11c89ca`, "submodule setup") predates the monorepo consolidation and is a fossil. Every finding below was read directly from `origin/main` via `git show` / `git grep`, so a reviewer can reproduce each claim with the same commands. No dev server was run; runtime behavior claims are limited to what the code states.

---

## 1. Executive summary

KaneEnabler is a pnpm/Turborepo monorepo formed by merging two independently built Magic: The
Gathering projects - the Commander recommender (formerly HardlyKnowHer) and the Doctor Who
time-counters companion (formerly DrWhoCompanionEDH) - plus a third, new app (`apps/home`) that
turned them into one platform with a shared sign-in and a profile page.

The consolidation is in good shape and unusually well documented (`docs/handoff.md`,
`docs/rules-audit.md`, `docs/api-policy.md`, `docs/signals-rework.md`). The shared packages are
real and adopted, not aspirational. The remaining disjointedness concentrates exactly where the
merge is newest:

- **User preferences (Phases 7-8):** the data layer (Supabase + `@mtg/profile`) is solid and
  well-tested, but the feature set is half-delivered - dislikes don't affect recommendations,
  and the profile page exposes data per-row without the grouped "seven lists" views its own
  docstring promises.
- **Card recommending (Phase 9):** the signal engine is mid-rework. The big architectural win
  (precomputed `card_signals` for candidates) has landed; the per-request half (re-deriving
  signals for the submitted collection on every call) has not.

The easiest wins are in the preference UI plumbing: a shared auth context, hoisted preference
lookups, batched writes, and one shared wake-retry fetch helper. Details in section 6.

---

## 2. Architecture as it exists today

### Apps

| App                          | Stack                                               | Role                                                                                            |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/commander-recommender` | React/Vite client + Express + better-sqlite3 server | Commander recommendations from a pasted card pool; combo lookup via Commander Spellbook         |
| `apps/time-counters`         | React/Vite SPA                                      | In-game counter companion for one specific Doctor Who deck; fully migrated onto shared packages |
| `apps/home`                  | React/Vite SPA                                      | Platform landing page + `/profile` browse page over the preference tables                       |

### Shared packages

`@mtg/config` (toolchain bases), `@mtg/rules` (CR-cited rules primitives: commander tax, color
identity, partners, eligibility, counters, legality), `@mtg/profile` (Supabase auth +
preference hooks), `@mtg/scryfall` (bulk-data/snapshot helpers - plain `.js`),
`@mtg/card-model` (Scryfall field handling - plain `.js`), `@mtg/mana` (glyphs/symbols),
`@mtg/ui` (NavBar, Modal, ErrorBoundary).

### Deploy topology (root `render.yaml`)

- One combined static site, `kaneenabler-platform`: `apps/home` at the root, the two tools
  built under `/recommender` and `/time-counters` by `scripts/build-platform.mjs`. Same-origin
  subpaths are the mechanism that makes the single Supabase session (browser localStorage)
  carry across all three tools - this is the stated point of merging the deploy.
- One free-tier Node service, `mtg-recommender-server`: builds its own SQLite card database
  from Scryfall bulk data during the build step (ephemeral filesystem is fine because the data
  is read-only reference data - an explicit, documented invariant).

### Governance

`docs/api-policy.md` is a hard project rule: any change to what external APIs are called, how
often, or what triggers the call needs owner sign-off. It also carries a known-violations list
(see F7). `docs/handoff.md` is the phase plan (Phases 0-9); `docs/signals-rework.md` tracks the
recommender engine rework; root `CLAUDE.md` + per-app `CLAUDE.md` x2 + `AGENTS.md` give agent
instructions.

---

## 3. The recommendation pipeline

Request path (`apps/commander-recommender/server/src/routes/recommend.ts`):

1. `getCommanderCandidates()` (`server/src/db.ts:150`) - every legal commander from SQLite;
   `buildCommanderUnits` (`server/src/services/partners.ts`) pairs Partners/Backgrounds into
   single units.
2. `buildCollectionProfile` (`server/src/services/synergy.ts`, ~lines 150-200) - two passes
   over the submitted pool, then `buildCardFacts` + `detectSignals` **per card, per request**
   (lines 178-180), with the detection vocabulary scoped to creature types/keywords present in
   the list.
3. Candidate signals are **not** recomputed: `unitSignals` reads the precomputed `card_signals`
   table via `findSignalsByOracleIds` (`db.ts:190`). The comment at `synergy.ts:219` records
   why: candidate relationships don't depend on the submitted list, and the old path
   reprocessed a card k+1 times per request when it appeared in k Partner pairs. Precompute
   happens at import time (`import-scryfall.ts` during `prepare-data`, i.e. per deploy).
4. `scoreCommanders` -> `analyzeDeck` -> `findCardsBySignals` (`db.ts:246`, one JOIN per
   required archetype) -> `buildCoverage` (`server/src/services/coverage.ts`): a dedicated tier
   that guarantees every submitted card gets _some_ commander recommended, even when it clears
   no synergy bar (see `docs/recommendation-coverage.md` for the bug this fixed).

### Signal engine status (`docs/signals-rework.md`)

Phases A, A2, B, C1 have landed; C2 has started (`gameState` shipped); Phase F's import-time
coverage report landed and measured **898 of 4,049 commander-eligible cards producing zero
active signals** - the doc's own scale says "extend the catalog" (Phase C continues) rather
than build the fallback. The rework is validated against a committed corpus of 20 real decks
(`server/src/services/__fixtures__/decks/` - the old standalone `DeckData/` folder, including
`miles.txt` and `tenth-doctor-rose-tyler.txt`, now lives on as test fixtures).

`db.ts` deserves a mention for doing the unglamorous thing right: schema-tolerant prepared
statements that degrade for stale local databases (`hasSignalsTable`,
`hasQualifierSourceColumn`, lines ~173-181) instead of crashing on first use.

---

## 4. Preferences and profile system

### Data layer

- Supabase project "kaneenabler", email/password auth only (deliberate v1 scope per
  `docs/handoff.md` Phase 7). RLS verified via impersonated-role SQL tests; the live browser
  sign-up flow is documented as _not_ verified (sandbox egress blocks Supabase).
- `card_preferences (user_id, oracle_id, sentiment, tags[], note, created_at)` - unique per
  (user, card); keyed on `oracle_id`, not printing id (an explicit `@mtg/card-model` decision).
- `combo_preferences (user_id, combo_key, sentiment, spellbook_id?, snapshot jsonb,
fetched_at, created_at)` - `combo_key` is FNV-1a over sorted, lowercased card names
  (`packages/profile/src/comboKey.ts`), chosen because Spellbook's own id is nullable and its
  contract unverified. The `snapshot` is the whole combo DTO as shown; **favouriting never
  re-queries Commander Spellbook** - a requirement from both Phase 7 and `api-policy.md`, with
  a regression test that renders a favourite with the network stubbed to throw.
- `packages/profile/src/client.ts` degrades to `null` when env vars are absent, so every app
  works fully signed-out; consumers gate on `configured`.

### Write points (recommender client)

- `LikeDislikeButtons.tsx` - like/dislike a suggestion (Partner/Background units written as
  both cards together).
- `CardDetailDialog.tsx` - jank toggle that preserves other tags.
- `ComboFavoriteButton.tsx` - favourite/hate a combo, storing the snapshot.

### Read views

- `apps/home/src/routes/Profile.tsx` - `/profile` page. Renders four sections (liked cards,
  disliked cards, favourite combos, hated combos). `CardPreferenceRow.tsx` adds per-row jank
  toggle and the first UI for the `note` field (saved on blur).
- Card resolution: `card_preferences` stores bare oracle_ids; `apps/home` resolves them
  through a new `GET /api/cards` on the recommender server (`server/src/routes/cards.ts`,
  capped - "no real user has anywhere near this many"), reusing `/api/recommend`'s DTO
  mapping (`services/cardDTO.ts`).

### Separate, deliberately

`usePreferencesStore.ts` (zustand + localStorage) holds only `combosPerPage` - durable _UI_
prefs, session state stays unpersisted, and `suggestionsPerPage` was removed with a versioned
migration when the suggestion grid virtualized. This split is documented and clean.

---

## 5. Findings - disjointed or unfinished work

Ordered by weight. Each cites where it was observed.

**F1. Dislikes are decorative (documented deferral, but the gap is real).** — **CLOSED 2026-09-03.**
A persistent dislike now hides the commander from the results grid, with a "N disliked / Show"
control beside the dismissal count and a Partner pair hiding only when both halves are disliked
(`client/src/lib/disliked.ts`). It stays on the filter side of Phase 7's "filter and annotate only"
decision — `sort.ts` and the server's ranking are untouched. Original finding follows.

Nothing filters or demotes a disliked commander anywhere in client or server
(`git grep -n dislike origin/main -- apps/commander-recommender` finds only UI annotation).
`docs/handoff.md` Phase 7 records this as deliberate: "'Hidden or demoted' landed as annotated
only ... wiring a persistent dislike into that same behavior, or into `sort.ts`, is a reasonable
follow-up." The follow-up was never scheduled into a later phase. This is currently the
largest gap between what "user preferences" implies and what the product does.

**F2. The profile page implements four of its seven promised views.** — **CLOSED 2026-09-03.**
All seven ship, as an "Everything / Commanders / Jank" filter over the two card sections rather
than seven stacked lists: the sets overlap (a liked, jank-tagged commander is in three at once), so
stacking would have rendered the same card three times on one page. Original finding follows.

`Profile.tsx`'s own docstring describes seven lists as views over the two tables; the page
renders four sections. Jank is a per-row toggle in `CardPreferenceRow.tsx` and commanders get
a badge - but there is no "favourite jank cards" list, no "favourite commanders" list, no
"disliked commanders" list. The data model fully supports them (`sentiment + tags`,
`isCommanderEligible` already resolved); only the grouping UI is missing.

**F3. `useAuth` is per-component-instance state, not a shared context.**
Every caller (`packages/profile/src/useAuth.ts`) runs its own `getSession()` and registers its
own `onAuthStateChange` subscription. `LikeDislikeButtons` and `ComboFavoriteButton` render
once per suggestion/combo row, so a results view holds N independent auth subscriptions that
all agree with each other.

**F4. Preference lookups are rebuilt per row, per render.**
`LikeDislikeButtons.tsx` builds a fresh `Map` over _all_ of the user's preferences inside every
suggestion card; `ComboFavoriteButton.tsx` does a linear `.find` per combo row. With the
virtualized grid this is bounded by visible rows, but it's NxM work on every render for no
reason - the data arrives once via one shared react-query key.

**F5. Partner-unit preference writes are N sequential mutations.**
`LikeDislikeButtons.toggle` loops `oracleIds` and fires one Supabase mutation per card (2
upserts or 2 deletes for a pair). `useSetCardPreference` upserts one row per call. One
array-upsert (or `.in('oracle_id', ...)` delete) would halve the round trips and make the
two-card write atomic.

**F6. Docs and repo artifacts disagree with reality.**

- `TODO.md` still lists "retire the three superseded static sites" as unchecked, while root
  `render.yaml`'s comment says they "have been retired from the Render dashboard and removed
  from this file."
- `apps/home/render.yaml` is a stale standalone blueprint for the retired `kaneenabler-home`
  service (unlike `apps/commander-recommender/render.yaml`, whose standalone purpose the root
  file explicitly blesses).
- The local checkout carries untracked leftovers from the pre-monorepo era (`DeckData/`,
  `TODO_manual.md`) on a fossil branch - worth pruning so the next session doesn't read them
  as current.

**F7. The Spellbook service's politeness metadata is drifting.**
`server/src/services/spellbook.ts` hardcodes `User-Agent: CommanderIHardlyKnowEr/1.11.0` with a
comment explaining it must be hand-synced (rootDir constraint) - and it's already one release
stale (repo is at 1.12.1). The per-process in-memory cache (line ~60, 1h TTL) is on
`api-policy.md`'s own known-violations list as needing a shared/persistent replacement "once
accounts exist" - accounts now exist.

**F8. Two module systems inside `packages/`.**
`@mtg/scryfall` and `@mtg/card-model` are plain `.js` while every other package is TypeScript.
It works (and `@mtg/rules` even dual-builds CJS for the bare-Node server), but it's a quiet
contributor to "two projects joined later" feel, and it opts those packages out of typechecking.

**F9. time-counters' `src/utils/counters.ts` is a deliberate-looking but undocumented split.** —
**CLOSED** (documented in `cf2d0e5`). Original finding follows.

Rules predicates moved to `@mtg/rules` (`commanderTax`, `usesTimeCounters`,
`turnStepForMechanic`), while presentation constants stayed local (`MECHANIC_COLOR`,
`MECHANIC_LABEL`, `chapterRoman`, `triggerLabel`, `hasHitTarget` - imported by 6+ files).
Reasonable boundary, but nobody wrote down that it's the intended end state rather than an
unfinished extraction.

**F10. `ComboPreference.snapshot` is `unknown` end to end.**
Written as a full `ComboDTO`, read back with no validation. If the client type or the stored
shape ever drifts, the favourites page fails at render time, not at the boundary. A zod schema
or a type guard in `@mtg/profile` would make the blob honest.

**F11. `/profile` is coupled to the recommender server being awake.**
Rendering your own saved cards requires the free-tier API to cold-start
(`apps/home/src/api/cards.ts` carries the same 75s wake-budget retry loop as the recommender's
own client). Architecturally fine - it reuses `cardDTO.ts` - but it means the _platform's_
profile page inherits the _recommender's_ availability and its sleep cycle.

**F12. Five overlapping instruction/governance surfaces.**
Root `CLAUDE.md`, two app-level `CLAUDE.md`s, `AGENTS.md`, `docs/handoff.md`, `TODO.md` -
individually good, collectively drifting (F6 is the proof). A short "where truth lives"
section in the root file, with the others pointing inward, would stop the decay.

---

## 5a. Follow-up: UI/UX consistency pass (2026-09-03)

The audit above is an architecture audit and treats the three apps' unrelated palettes only
obliquely (F12's "collectively drifting"). A separate pass at the repo owner's request took the
visual side directly, on the brief that _the Doctor Who skin should be the time-counters module's
only difference from the rest of the site_. What it found, and did:

- **Three unrelated palettes and two type systems.** apps/home was violet on near-black, the
  recommender brass on ink, time-counters TARDIS blue (default) or navy-and-gold. Each defined a
  palette from scratch and mapped it _outward_ onto the `--mtg-*` tokens the shared chrome reads,
  so the three agreed on the NavBar and nothing else. Now inverted: `@mtg/ui/theme.css` holds the
  palette (the recommender's, per the owner's pick) and each app aliases its local names inward.
- **The Doctor Who skin was the default,** with the app's original styling offered as an equal
  alternative — the single largest reason that tool read as a separate product. Now the platform
  theme is the default and the skin is a labelled switch; the retired `claude` theme value migrates
  to the platform theme so nobody is flipped _into_ the skin on upgrade.
- **Duplicated frame.** Reset, focus ring, reduced-motion block, page measure/gutters, button and
  input primitives, and the footer were reimplemented per app (time-counters' footer was inline
  styles on a bare `<footer>`). All now shared; per-app copies deleted.
- **A second brand line.** time-counters printed "Commander companion / Time Counters" directly
  under the NavBar's own "Time Counters". Replaced by a visually-hidden `<h1>` for the outline.
- **Two real defects surfaced by the sweep**, both pre-existing: the recommender drew a disliked
  commander's ✕ in `--danger`, a fill colour at roughly 1.5:1 against its own background; and three
  `.btn` rules written inside time-counters CSS Modules were scoped-and-hashed, so they had never
  matched the global `btn` class in the markup and had silently never applied.

Not attempted: converting the recommender's ~2,300 lines of bespoke control CSS onto the shared
`.mtg-btn`/`.mtg-input` primitives. Its buttons now read from shared tokens and so match in colour
and radius, but they are still its own rules. That is the largest remaining piece of visual
duplication and the obvious next increment.

## 6. Easy optimization wins, ranked

Roughly effort-ascending; W1-W5 are each well under a day.

1. **W1 - Shared `AuthProvider` in `@mtg/profile`.** One `getSession` + one subscription at the
   provider; `useAuth` reads context. Mechanical, removes F3, touches only consumers' imports.
2. **W2 - Hoist the preference index.** Build the `Map<oracleId, preference>` (and a
   `Map<comboKey, sentiment>`) once where the query result already lives - a small context
   above the grid, or a selector hook in `@mtg/profile` - and pass per-row sentiment down.
   Removes F4.
3. **W3 - Batch partner writes.** Array-upsert in `useSetCardPreference` and an
   `.in('oracle_id', ids)` delete; atomic per unit, half the requests. Removes F5.
4. **W4 - `staleTime` for static data in `apps/home`.** The recommender client sets a 1-hour
   `staleTime`/`gcTime` globally (`client/src/main.tsx:27-28`); home's `QueryClient`
   (`apps/home/src/main.tsx:18`) sets neither, so `resolved-cards` - immutable reference data
   keyed by sorted oracle_ids - refetches on every mount. Give it hours.
5. **W5 - Extract the wake-retry fetch helper.** The 75s budget / 2s-to-8s backoff /
   `isUnreachable` TypeError check is duplicated near-verbatim between
   `apps/home/src/api/cards.ts` and `commander-recommender/client/src/api/client.ts`. One
   helper (a tiny `@mtg/api-client`, or inside `@mtg/scryfall`) kills the pair.
6. **W6 - Memoize `buildCollectionProfile` by content hash.** The per-request signal detection
   over the submitted pool (`synergy.ts:178-180`) is deterministic for a given list. A small
   LRU keyed on a hash of the sorted oracle_ids removes the expensive half of repeat
   submissions (users re-paste with one card changed constantly). Single-process, no
   infrastructure.
7. **W7 - Repo hygiene sweep.** Update the stale `TODO.md` item, delete or annotate
   `apps/home/render.yaml`, prune the local fossil branch leftovers (`DeckData/`,
   `TODO_manual.md`), and add the "where truth lives" pointer (F12).
8. **W8 - Fix the Spellbook User-Agent drift** (F7): bump to the current release, or inject
   the version as an env var at build so the hand-sync comment stops being a trap.
9. **W9 - Shared/persistent Spellbook cache.** Already on `api-policy.md`'s known-violations
   list; with accounts live, a Supabase table (or Render Key Value) replaces the per-process
   `Map` and survives restarts. Needs owner sign-off per the policy, since it changes what gets
   persisted.

Not recommended as "easy": porting `@mtg/scryfall`/`@mtg/card-model` to TS (F8) and the
dislike-integration product decision (F1) - both are real work with design tradeoffs, not wins.

---

## 7. What's already in good shape

Credit where due - these are load-bearing and correct:

- **`docs/api-policy.md` as a hard rule with regression guards**, and `spellbook.ts`'s
  politeness posture (identifying UA, 12s timeout, no retry on 429, click-only triggering).
- **The combo-snapshot pattern**: favourites render offline from stored data, verified by a
  test that stubs `fetch` to throw.
- **Precomputed `card_signals`** with schema-tolerant prepared statements for stale local DBs.
- **The coverage tier** (`coverage.ts`) guaranteeing every submitted card gets a commander.
- **The 20-deck real-world fixture corpus** driving the signals rework, with measured coverage
  (898/4,049 zero-signal commanders) instead of vibes.
- **Consistent modern client stack**: TanStack Router + Query in all three apps, URL-as-state
  via `searchSchema.ts`, virtualized suggestion grid, versioned localStorage migrations.
- **Deploy comments that encode hard-won knowledge** (the rootDir/lockfile/npm-fallback trap,
  the corepack EROFS failure) directly in `render.yaml` and `build-platform.mjs`.

---

## 8. Open questions for the owner

1. ~~Should dislikes filter or demote recommendations (the Phase 7 follow-up)? If yes: same
   behavior as session dismiss, or a score penalty in `sort.ts`?~~ **Answered 2026-09-03: same
   behavior as session dismiss.** Shipped; see F1.
2. ~~Finish the `/profile` grouped views (jank, commander lists), or narrow the "seven lists"
   language in the docs to the four that exist?~~ **Answered 2026-09-03: finish them.** Shipped as
   a filter rather than stacked lists; see F2.
3. Delete `apps/home/render.yaml`, or is a standalone home deploy still a supported path?
   (Deleted in `cf2d0e5`; left here in case the standalone path is wanted back.)
4. Port `@mtg/scryfall` + `@mtg/card-model` to TypeScript, or bless the `.js`?
5. ~~Is the time-counters presentation/rules split (F9) the intended end state?~~ **Answered:
   yes**, documented at the top of `utils/counters.ts` in `cf2d0e5`.
6. **New:** should the recommender's bespoke control CSS move onto the shared `.mtg-btn`/
   `.mtg-input` primitives? It's the last large piece of visual duplication (see section 5a), but
   it's a wide diff across ~2,300 lines of styles with real regression risk, so it wasn't taken
   without a decision.

---

## 9. Verification guide for the reviewing agent

Every claim above was observed on `origin/main` @ `8b27076` and can be re-derived:

```
git fetch origin main
git show origin/main:<path>            # any cited file
git grep -n dislike origin/main -- apps/commander-recommender   # F1
git log --oneline -3 origin/main                                # audited commit
```

Key files: `docs/handoff.md` (phases 7-9), `docs/signals-rework.md` (engine status),
`docs/api-policy.md` (known violations), `packages/profile/src/*` (preference layer),
`apps/commander-recommender/server/src/{routes/recommend.ts, services/synergy.ts,
services/coverage.ts, services/spellbook.ts, db.ts}` (recommender),
`apps/home/src/{routes/Profile.tsx, components/CardPreferenceRow.tsx, api/cards.ts}`
(profile page).

Not verified in this audit: no test suite was executed, no dev server was run, and the live
Supabase browser flow remains unverified per the handoff's own note (sandbox egress blocks
Supabase). Runtime performance claims (F3/F4/W6) are code-reading inferences, not measurements.
