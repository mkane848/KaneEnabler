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

| Constraint | Detail                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Trigger    | **Click-only.** Never on page load, never on a timer, never as part of generating a recommendation. |
| Endpoint   | `find-my-combos` — the endpoint built for this exact question. Do not crawl their database.         |
| Caching    | 1 hour, keyed on commander names + card set. Repeat clicks cost them nothing.                       |
| 429        | Surface their `Retry-After` to the user and **stop**. No automatic retry.                           |
| Bounds     | `MAX_CARDS = 250`; 12s request timeout.                                                             |
| Identity   | Identifying `User-Agent` naming the app and linking the repo.                                       |

**Favorited combos must render from a stored snapshot, never a live call.** See
[`handoff.md`](./handoff.md) Phase 7.

### EDHREC

**Not built, and not to be built without explicit confirmation.** A non-functional, `disabled`
placeholder button sits in `ComboFinder.tsx`. The instruction on record is that this should wait
until it can be done responsibly — not that it is ruled out in principle. When it is built, it
should follow the Spellbook shape: click-triggered, per-commander, cached, identified,
rate-respecting. Never bulk, never scraped.

### Wizards of the Coast / Academy Ruins (Comprehensive Rules)

The CR is ingested as a **vendored snapshot** committed to the repo, refreshed at most once per CR
release (roughly 4× a year) via a scheduled workflow that opens a PR. Runtime never fetches rules.

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
   until something resolves that constraint.

2. **Per-process in-memory Spellbook cache.** Fine for a single user. Once accounts exist, N users
   asking the same question costs them N calls instead of one. Move to a shared, persistent cache.

## Regression guards

These belong in CI so the policy survives future refactors:

- A test that fails if any Scryfall or Spellbook request is issued without the shared headers.
- A test asserting Commander Spellbook is **never** called during page load or route loading.
- A test that loads a user profile with the network blocked and asserts favorited combos still
  render from their stored snapshot.
