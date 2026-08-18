// @ts-check
import fs from 'node:fs';

/**
 * Which Scryfall bulk snapshot the local data came from.
 *
 * Scryfall publishes full snapshots, never diffs — but every snapshot gets
 * its own content-addressed URL (`oracle-cards-20260731210300.jsonl.gz`) and
 * an `updated_at`, so an exact "has anything changed?" answer is one cheap
 * API call away. That is strictly better than a time-based refresh rule,
 * which either does needless work when nothing changed or serves stale data
 * when something did — commander-recommender/server used to compare against
 * this sidecar already; time-counters used to compare against local file
 * age instead, which is "wrong in both directions" the same way.
 *
 * This only answers "is the file on disk current?" — a second, separate
 * question, "was the database/catalog *built* from the file on disk?", is
 * app-specific (commander-recommender/server's own `meta` table inside
 * cards.sqlite, bumped by its own `IMPORT_VERSION`) and stays local to that
 * app rather than living here: it depends on that app's own import code,
 * which this package knows nothing about.
 *
 * @typedef {Object} SnapshotInfo
 * @property {string} updatedAt - Scryfall's own timestamp for the snapshot. The identity compared on.
 * @property {string} downloadUri - The content-addressed download URL, kept for debugging a mismatch.
 * @property {string} fetchedAt - When this was fetched. Ours, not Scryfall's.
 */

/**
 * Where the sidecar lives, given the data file path it describes.
 * @param {string} dataPath
 */
export function sidecarPathFor(dataPath) {
  return `${dataPath}.meta.json`;
}

/**
 * @param {string} dataPath
 * @returns {SnapshotInfo | null}
 */
export function readSidecar(dataPath) {
  const path = sidecarPathFor(dataPath);
  if (!fs.existsSync(path)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf-8'));
    if (!parsed.updatedAt) return null;
    return {
      updatedAt: parsed.updatedAt,
      downloadUri: parsed.downloadUri ?? '',
      fetchedAt: parsed.fetchedAt ?? '',
    };
  } catch {
    // A corrupt sidecar should mean "re-download", not "crash".
    return null;
  }
}

/**
 * @param {string} dataPath
 * @param {SnapshotInfo} info
 */
export function writeSidecar(dataPath, info) {
  fs.writeFileSync(sidecarPathFor(dataPath), JSON.stringify(info, null, 2));
}

/**
 * Whether the data on disk already is the published snapshot.
 *
 * Requires the data file itself to be present and non-empty: a sidecar
 * without its file (an interrupted download, a manual delete) must not read
 * as "nothing to do".
 *
 * @param {string} dataPath
 * @param {string} publishedUpdatedAt
 */
export function diskHasSnapshot(dataPath, publishedUpdatedAt) {
  if (!fs.existsSync(dataPath)) return false;
  if (fs.statSync(dataPath).size === 0) return false;
  const sidecar = readSidecar(dataPath);
  return sidecar?.updatedAt === publishedUpdatedAt;
}
