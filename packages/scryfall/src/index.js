/**
 * The single choke point for all Scryfall traffic (docs/api-policy.md) —
 * bulk-data snapshot fetching, shared between commander-recommender/server's
 * `fetch-scryfall.ts` and time-counters' `fetch-card-data.mjs`.
 *
 * Plain .js with JSDoc types, not .ts, throughout this package — like
 * @mtg/card-model, this is imported directly by fetch-card-data.mjs, which
 * runs under bare `node` with no build step or TypeScript loader. See that
 * package's own src/index.js for the fuller explanation and the dual
 * CJS/ESM story this package needed for the same reason (commander-
 * recommender/server has no `"type": "module"`, so tsx compiles
 * fetch-scryfall.ts's `import` syntax down to a `require()` call at
 * runtime).
 *
 * What's shared is the *fetching and cache mechanics* — list the current
 * "oracle_cards" bulk entry, compare its `updated_at` against a sidecar
 * next to the downloaded file, stream-download and gunzip only when it
 * changed. What's downstream of that (parsing the JSONL, filtering to a
 * color identity, importing into SQLite, fetching flavor-name/creature-type
 * catalogs) is each app's own business and stays in that app's own script.
 */
export { buildUserAgent } from './userAgent.js';
export { sidecarPathFor, readSidecar, writeSidecar, diskHasSnapshot } from './snapshot.js';
export {
  describeFailure,
  fetchOracleCardsEntry,
  downloadBulkFile,
  ensureOracleCardsSnapshot,
} from './bulkData.js';
