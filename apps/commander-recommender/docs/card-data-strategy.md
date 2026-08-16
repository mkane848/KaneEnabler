# Card data strategy

How this app gets Scryfall's card data, why it works the way it does, and the
options we looked at and didn't take. Written down so the next person doesn't
have to re-measure it.

## What happens today

`server/data/cards.sqlite` is built from Scryfall's **Oracle Cards** bulk
export in two steps:

| step | what it does | time | transfer |
|---|---|---|---|
| `fetch-scryfall` | downloads the snapshot, gunzips it to `oracle-cards.jsonl`, and fetches re-skinned printing names | ~5s | 24 MB |
| `import-scryfall` | parses 193 MB of JSONL and writes ~36k rows | ~7s | — |

On a deploy, both run in `buildCommand` (see `render.yaml`). **Not**
`startCommand` — so a server wake-up hits Scryfall zero times. This is worth
repeating because it is the most common wrong assumption about this setup: the
free instance sleeping and being woken by a visitor costs nothing.

### Skipping work that isn't needed

Scryfall publishes **full snapshots, never diffs** — but each one has its own
`updated_at` and its own content-addressed URL
(`oracle-cards-20260731210300.jsonl.gz`), so "has anything changed?" is one
small API call, not a 24 MB download.

Two records track this, deliberately separate:

- **`oracle-cards.jsonl.meta.json`** (sidecar) — which snapshot the *file on
  disk* is. Written by `fetch-scryfall`, only after the download completes.
- **the `meta` table in `cards.sqlite`** — which snapshot the *database* was
  built from, and under which `IMPORT_VERSION`. Written by `import-scryfall`,
  only on success.

They can legitimately disagree: a download that hasn't been imported yet.
Merging them would make that state unrepresentable.

With both current, `npm run prepare-data` takes ~2s and transfers almost
nothing. `--force` overrides either step.

> **`IMPORT_VERSION` in `src/services/dataSnapshot.ts` must be bumped whenever
> import logic changes.** Skipping an import on unchanged *data* is only safe
> if the *code* is unchanged too. Forget it, and your change appears to apply
> while the old database is silently kept — everything downstream looks fine
> and is wrong.

This was previously a 7-day file-mtime heuristic, which was wrong in both
directions: it served a week-old copy after Scryfall had published something
new, and forced a full re-download of a file that hadn't changed.

## Why deploys still rebuild from scratch

Render's free plan has an **ephemeral build filesystem**. Every deploy starts
with no `data/` directory, so there is nothing to compare against and nothing
to reuse. The skip logic above is a local-development win; it does not and
cannot help a deploy without somewhere persistent to keep state.

That is the constraint every option below is really about.

## Options considered and not taken

Revisit these when the trigger condition next to each is actually met — not
before.

### B. Render persistent disk

Mount a disk, keep `cards.sqlite` across deploys, let the skip logic work in
production too.

- **Cost:** a paid Render plan. Disks are not available on free.
- **Trigger:** the project is already on a paid plan for another reason.
- **Verdict:** not worth paying for on its own. Deploy cost today is 12
  seconds.

### C. Build the database in CI, publish it as a release asset

A scheduled GitHub Actions job runs `prepare-data` nightly and attaches the
resulting `cards.sqlite` to a release. Render's build downloads the prebuilt
22 MB database instead of doing the work.

- **Gains:** deploys drop to ~3s, and — more importantly — **deploys stop
  depending on Scryfall being reachable**. Today, if Scryfall is down or
  changes their API shape mid-build, the deploy fails outright. That happened
  once already (the `download_uri` → `jsonl_download_uri` change), and it
  would have blocked every deploy until fixed.
- **Cost:** a new moving part, plus a stale-data window between CI runs.
- **Trigger:** build time starts hurting — most likely once Stage 2's
  precomputed `card_signals` table lands and the import has to score ~36k
  cards — or a Scryfall outage blocks a deploy you actually needed.
- **Verdict:** the real answer to both fragility and build time. Premature
  until one of those bites.

### D. Commit `cards.sqlite` to the repository

- **Verdict:** no. A 22 MB binary that changes daily is exactly what git is
  worst at, and every clone pays for the whole history of it.

### E. A time-based refresh (e.g. "re-pull if older than 24 hours")

Considered and superseded. Since Scryfall hands us an exact change signal, a
time window can only be wrong in one of two ways: doing needless work when
nothing changed, or serving stale data when something changed an hour ago.
Comparing `updated_at` has neither failure mode.

## Notes on being a good Scryfall citizen

Bulk data exists precisely so tools download a snapshot rather than hitting
the REST API per card. One 24 MB CDN pull per deploy is the intended usage.
Their guidance on request pacing applies to the REST API — which this app
touches twice per data refresh: once for the bulk listing, and ~4 paginated
requests for re-skinned names, at 100 ms intervals.

The one thing to keep honouring: Scryfall requires a `User-Agent` that
identifies this app specifically, and answers HTTP 400 without it.
