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

| Constraint | Detail                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate       | ≤10 requests/second sustained (100ms spacing). `/cards/collection` is capped tighter at 2/second.                                                                                                                                                                                                                                                       |
| Headers    | A descriptive `User-Agent` **and** an `Accept` header on **every** request. Scryfall answers HTTP 400 without them — this broke a real deploy of the recommender.                                                                                                                                                                                       |
| Caching    | Cache downloaded data locally for **at least 24 hours**. Prices update once daily; fetching more often gains nothing.                                                                                                                                                                                                                                   |
| Bulk       | For mass lookups (names, images, prices), use the bulk-data exports. Never loop per-card against the API.                                                                                                                                                                                                                                               |
| Backoff    | On 429 or 503, retry with exponential backoff and jitter — or don't retry at all.                                                                                                                                                                                                                                                                       |
| Images     | Image URLs come from the bulk data (recommender `image_uri`, time-counters `imageSmall` via `@mtg/card-model`'s `frontImageUri`) and the visitor's browser loads them straight from Scryfall's image CDN; nothing is re-hosted. Lazy in the recommender, so only cards on screen are requested. Recorded 2026-11-28; the practice predates this policy. |

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

| Constraint | Detail                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger    | **Click-only.** Never on page load, never on a timer, never as part of generating a recommendation.                                                     |
| Endpoint   | `find-my-combos` — the endpoint built for this exact question. Do not crawl their database.                                                             |
| Caching    | 1 hour, keyed on commander names + card set. Repeat clicks cost them nothing; expired entries are pruned on write.                                      |
| 429        | Surface their `Retry-After` and **stop** — no automatic retry, and the server holds a cooldown until that window passes (60s if the header is missing). |
| Dedup      | Identical concurrent lookups share one in-flight request instead of racing two.                                                                         |
| Bounds     | `MAX_CARDS = 250`; 12s request timeout.                                                                                                                 |
| Identity   | Identifying `User-Agent` naming the app and linking the repo.                                                                                           |

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

### TCGdex (Pokémon card data)

The Pokémon deck recommender (`apps/pokemon-decks`) reads card data from a **vendored snapshot**
of TCGdex's card database (`github.com/tcgdex/cards-database`, MIT), committed as
`apps/pokemon-decks/public/data/` and served as the app's own static assets. Runtime never calls
TCGdex. Source, cadence and trigger confirmed with the repo owner on 2026-11-27, replacing the
originally planned Pokémon TCG API: that project's own dataset README says the API goes offline on
**March 1, 2027** and that its data is no longer maintained.

| Constraint | Detail                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Published  | From [tcgdex.dev/faq](https://tcgdex.dev/faq) (read 2026-11-27): _"There are no published hard rate limits, but please be considerate. For bulk data needs, cache responses locally rather than fetching the same data repeatedly."_ A vendored snapshot is the strongest form of that.                                                                                                                       |
| Source     | One `git clone --depth 1` of the database repo per refresh (`apps/pokemon-decks/scripts/build-snapshot.mjs`), plus one GET of the image manifest `assets.tcgdex.net/datas.json` with an identifying `User-Agent` — the manifest is how TCGdex's own API decides which cards have an image. **No requests to `api.tcgdex.net`.** The repo's files are TypeScript modules; they are parsed, never executed.     |
| Trigger    | The monthly `pokemon-data-refresh.yml` workflow (opens a PR) plus manual `workflow_dispatch` / local `pnpm --filter pokemon-decks run build-snapshot`. Never at runtime, per build, or per deploy.                                                                                                                                                                                                            |
| Images     | **Same arrangement as Scryfall's, owner-approved 2026-11-28.** The snapshot stores each card's image base URL (`assets.tcgdex.net/en/<series>/<set>/<number>`, only for cards the manifest lists, plus the two sets TCGdex's compiler exempts); the visitor's browser loads `…/low.webp` straight from TCGdex's CDN, lazily, only for cards on screen. Missing or failed images fall back to the card's text. |
| Volume     | ~12 refreshes/year, each one clone and one manifest GET.                                                                                                                                                                                                                                                                                                                                                      |

**One-time source, 2026-11-27:** TCGdex doesn't mark Black & White-era ACE SPEC cards. Their ids
were read once from the frozen `github.com/PokemonTCG/pokemon-tcg-data` (29 Black & White and XY
set files via `raw.githubusercontent.com`, each card's `subtypes`), confirmed with the repo owner,
and vendored as ids and names only in `packages/ptcg-rules/src/data/legacy-ace-specs.json`. Those
sets never change, so there is no refresh and nothing calls that repository again.

Attribution: the app footer credits TCGdex as the card-data source. TCGdex is a fan database, not
The Pokémon Company — the app also carries an unofficial-content notice.

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

2. **Per-process in-memory Spellbook cache.** Fine for a single user. Once accounts exist, N users
   asking the same question costs them N calls instead of one. Move to a shared, persistent cache.

## Regression guards

These belong in CI so the policy survives future refactors:

- **Landed:** `apiPolicy.test.ts` (`apps/commander-recommender/server/src/`) statically scans the
  whole workspace and fails if any file issues a request (`fetch`, `http(s).get/request`, XHR,
  `sendBeacon`) without being on its `ALLOWED_CALL_SITES` list, each entry with the reason it may
  call out. Every third-party entry must build a `User-Agent`; for `@mtg/scryfall`'s
  `bulkData.js`, which forwards headers its callers supply, the check moves to every caller.
  A new call site therefore fails CI until someone adds it to the list — which is the moment to
  read this policy and confirm the change with the repo owner.
- **Landed:** `spellbookConsent.test.tsx` (`apps/commander-recommender/client/src/`) renders the
  whole recommender through the real router, with a list submitted, results on screen, search
  params in the URL, and the explanation panel open, and asserts that nothing reaches
  `/api/combos` until "Find combos" is clicked. Exactly one request follows the click.
  `ComboFinder.test.tsx` pins the component's own click-consent rules. This one catches the
  regression that looks like a refactor: a combos query moved into a route loader, a prefetch, or
  an `enabled` default.
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
