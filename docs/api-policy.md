# External API Policy

**This is a hard rule for this project.** Every external data source we call has published limits
or a stated etiquette, and we abide by them.

> **Any change to what we call, how often, or what triggers the call must be confirmed with the
> repo owner before implementation** — including changes that look incidental, such as moving a
> lookup from a click handler into a route loader, a `useEffect`, or a prefetch.

The reason this is a written policy rather than a habit: the riskiest changes to outbound traffic
don't look like network changes. They look like refactors.

## Sources and their contracts

### Scryfall

| Constraint | Detail                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate       | ≤10 requests/second sustained (100ms spacing). `/cards/collection` is capped tighter at 2/second.                                                                 |
| Headers    | A descriptive `User-Agent` **and** an `Accept` header on **every** request. Scryfall answers HTTP 400 without them — this broke a real deploy of the recommender. |
| Caching    | Cache downloaded data locally for **at least 24 hours**. Prices update once daily; fetching more often gains nothing.                                             |
| Bulk       | For mass lookups (names, images, prices), use the bulk-data exports. Never loop per-card against the API.                                                         |
| Backoff    | On 429 or 503, retry with exponential backoff and jitter — or don't retry at all.                                                                                 |

**Enforced in:** `packages/scryfall` (`@mtg/scryfall`) — the bulk-data snapshot fetch/cache
mechanics (`ensureOracleCardsSnapshot`) and the `User-Agent` formatter (`buildUserAgent`) both apps'
fetch scripts use. Not a hard rule that every Scryfall call routes through it: each app's own
companion fetches (HKH's creature-type catalog and re-skinned-name lookups in `fetch-scryfall.ts`)
call `fetch()` directly, since they aren't duplicated between the two apps — but they build their
headers from this package too, so a `User-Agent` fix here reaches every request, not just the bulk
download.

### Commander Spellbook

The politeness measures here are the reason calling them is acceptable at all. From
`apps/commander-recommender/server/src/services/spellbook.ts:1-17`:

| Constraint | Detail                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger    | **Click-only.** Never on page load, never on a timer, never as part of generating a recommendation.                                                                                                                               |
| Endpoint   | `find-my-combos` — the endpoint built for this exact question. Do not crawl their database.                                                                                                                                       |
| Caching    | 1 hour, keyed on commander names + card set, in a SQLite file (`server/data/spellbook-cache.sqlite`) so answers and the cooldown survive a process restart. Repeat clicks cost them nothing; expired entries are pruned on write. |
| 429        | Surface their `Retry-After` and **stop** — no automatic retry, and the server holds a cooldown until that window passes (60s if the header is missing).                                                                           |
| Dedup      | Identical concurrent lookups share one in-flight request instead of racing two.                                                                                                                                                   |
| Bounds     | `MAX_CARDS = 250`; 12s request timeout.                                                                                                                                                                                           |
| Identity   | Identifying `User-Agent` naming the app and linking the repo.                                                                                                                                                                     |

**Favorited combos must render from a stored snapshot, never a live call.** See
[`handoff.md`](./handoff.md) Phase 7.

### EDHREC

**Not built, and not to be built without explicit confirmation.** A non-functional, `disabled`
placeholder button sits in `ComboFinder.tsx`. The instruction on record is that this should wait
until it can be done responsibly — not that it is ruled out in principle. When it is built, it
should follow the Spellbook shape: click-triggered, per-commander, cached, identified,
rate-respecting. Never bulk, never scraped.

### Wizards of the Coast / Academy Ruins (Comprehensive Rules)

The CR is ingested as a **vendored snapshot** committed to the repo
(`packages/rules/data/cr-<version>.json`), refreshed at most once per CR release (roughly 4× a
year) via a scheduled workflow that opens a PR. Runtime never fetches rules. **Shipped 2026-11-25**
(Phase 3a); sources, cadence and trigger confirmed with the repo owner that day.

| Constraint  | Detail                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger     | The monthly `cr-refresh.yml` check (1st, 14:00 UTC) plus manual `workflow_dispatch` / local `pnpm --filter @mtg/rules run ingest:cr`. Never at runtime, never per build.                                                                                                                                                                                       |
| Discovery   | One GET of `magic.wizards.com/en/rules` per check, to read the current official `.txt` link.                                                                                                                                                                                                                                                                   |
| Primary     | One GET of the `media.wizards.com/…/MagicCompRules <YYYYMMDD>.txt` per refresh — Wizards' own text is the source of record.                                                                                                                                                                                                                                    |
| Cross-check | `api.academyruins.com` (`/cr`, `/cr/glossary`, `/cr/toc`) at ingestion only. AGPL-3.0: verification source, **none of its data is vendored**. Rule set and rule text must match exactly; examples are checked directionally and glossary/toc as warnings, because their own parse has known artifacts (dropped trailing examples, a "Credits" glossary entry). |
| Volume      | ~4 refreshes/year × 4 requests; the monthly check is 1 request when nothing changed.                                                                                                                                                                                                                                                                           |

Distribution follows the [WotC Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy):
free, carrying the unofficial-content notice, no WotC logos or trademarks. Both apps already ship
this disclaimer in their About dialogs — keep it there.

### Supabase

Free-tier row, bandwidth, and auth limits apply once user profiles ship. Profile reads should be
cached client-side via TanStack Query rather than re-queried per navigation.

## Known violations to fix

1. ~~**Stale `User-Agent`.**~~ **Fixed.** `fetch-scryfall.ts` and `fetch-card-data.mjs` now derive
   their version from their own app's `package.json` via `@mtg/scryfall`'s `buildUserAgent`, so it
   can't drift the way `CommanderIHardlyKnowEr/1.0.0` did while the app moved on to 1.7.1.
   `spellbook.ts` is the one exception, and stays hand-synced on purpose: it lives in `server/src/`,
   inside `tsconfig.build.json`'s `rootDir`, so importing `../../package.json` there would
   reintroduce the exact `__dirname`/`rootDir` mismatch that broke a deploy once (see its own
   comment). Its version was bumped to 1.7.1 as part of this fix, but will drift again the same way
   until something resolves that constraint — it already has once, re-synced to 1.8.0 by hand at
   that release; the same manual step is needed at every one after, until it is.

2. ~~**Per-process in-memory Spellbook cache.**~~ **Fixed 2026-11-25 (owner sign-off).** The cache
   and the 429 cooldown live in `server/data/spellbook-cache.sqlite` (`spellbookCache.ts`), so a
   process restart forgets neither. Deliberately not an external store: Render's free tier has an
   ephemeral filesystem, so a redeploy starts the cache empty — bounded by the 1-hour TTL — and a
   Supabase/Key Value store would add credentials and a failure mode for a cache whose job is
   politeness. (The audit's "N users = N calls" framing was partly off: one process already shared
   the Map across users; the real loss was cache-on-restart.)

## Regression guards

These belong in CI so the policy survives future refactors:

- A test that fails if any Scryfall or Spellbook request is issued without the shared headers.
- A test asserting Commander Spellbook is **never** called during page load or route loading.
- **Landed:** `.github/workflows/scryfall-fetch-check.yml` runs the real Scryfall fetch (not just
  the import against a file already on disk) weekly, separate from the main CI workflow so a normal
  PR generates no extra Scryfall traffic — confirmed with the repo owner before implementation, per
  this doc's own rule, including the cadence. Catches a bad _fetch_ (a changed bulk-data shape, a
  moved field) via each script's own floor check before a real deploy hits it. The same workflow now
  also runs `recommend.integration.test.ts` (`server/src/routes/`) right after the fetch, exercising
  the whole `/api/recommend` pipeline against real freshly-imported data — that test `skipIf`s itself
  everywhere else, since normal CI and fresh clones have no seeded database.
- **Landed:** `ComboFavoriteButton.test.tsx` (`client/src/components/`) stubs `global.fetch` to throw
  and asserts a favourited combo still renders — liked, disliked, or neither — from
  `useComboPreferences`' stored `snapshot` alone, with zero network calls. There's no dedicated
  favourites-browsing page yet (`ComboFinder.tsx` only fetches live results after an explicit
  click), so this is the one component that reads a stored combo preference back today.
- **Landed:** `ComboFinder.test.tsx` (`client/src/components/`) asserts no combo lookup happens until
  the button is clicked, and that changing the submitted list requires a fresh click rather than
  reusing the previous consent.
- **Landed:** `spellbook.test.ts` (`server/src/services/`) asserts a 429 holds a server-side cooldown
  (no further calls until it expires) and that identical concurrent lookups share one request.
