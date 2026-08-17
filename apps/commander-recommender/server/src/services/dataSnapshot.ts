/**
 * Which Scryfall bulk snapshot the local data came from.
 *
 * Scryfall publishes full snapshots, never diffs — but every snapshot gets
 * its own content-addressed URL (`oracle-cards-20260731210300.jsonl.gz`) and
 * an `updated_at`, so an exact "has anything changed?" answer is one cheap
 * API call away. That is strictly better than a time-based refresh rule,
 * which either does needless work when nothing changed or serves stale data
 * when something did.
 *
 * Two separate questions, deliberately answered by two separate records:
 *
 *   - *Is the file on disk current?* — the sidecar written next to the
 *     downloaded JSONL, read and written by fetch-scryfall.
 *   - *Was the database built from the file on disk?* — the `meta` table
 *     inside cards.sqlite, written by import-scryfall.
 *
 * They can legitimately disagree: a download that hasn't been imported yet.
 * Collapsing them into one record would make that state unrepresentable and
 * silently skip the import.
 */
import fs from 'node:fs';

/** Identifies one published Scryfall bulk snapshot. */
export interface SnapshotInfo {
  /** Scryfall's own timestamp for the snapshot. The identity we compare on. */
  updatedAt: string;
  /** The content-addressed download URL, kept for debugging a mismatch. */
  downloadUri: string;
  /** When we fetched it. Ours, not Scryfall's. */
  fetchedAt: string;
}

/**
 * Bumped whenever import-scryfall (or anything it reads — eligibility,
 * cardNames, the table schemas) changes in a way that would produce a
 * different database from identical input.
 *
 * This exists because skipping an import on unchanged *data* is only safe if
 * the *code* is also unchanged. Without it, editing an import rule and
 * re-running would appear to succeed while silently keeping the old
 * database — the worst kind of bug, because everything downstream looks
 * fine and is wrong.
 *
 * If you touch import logic and don't bump this, your change won't take
 * effect on any machine that already has a current database.
 */
export const IMPORT_VERSION = 8;

/** Where the sidecar lives, given the JSONL path it describes. */
export function sidecarPathFor(jsonlPath: string): string {
  return `${jsonlPath}.meta.json`;
}

export function readSidecar(jsonlPath: string): SnapshotInfo | null {
  const path = sidecarPathFor(jsonlPath);
  if (!fs.existsSync(path)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf-8')) as Partial<SnapshotInfo>;
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

export function writeSidecar(jsonlPath: string, info: SnapshotInfo): void {
  fs.writeFileSync(sidecarPathFor(jsonlPath), JSON.stringify(info, null, 2));
}

/**
 * Whether the data on disk already is the published snapshot.
 *
 * Requires the JSONL itself to be present and non-empty: a sidecar without
 * its file (an interrupted download, a manual delete) must not read as
 * "nothing to do".
 */
export function diskHasSnapshot(jsonlPath: string, publishedUpdatedAt: string): boolean {
  if (!fs.existsSync(jsonlPath)) return false;
  if (fs.statSync(jsonlPath).size === 0) return false;
  const sidecar = readSidecar(jsonlPath);
  return sidecar?.updatedAt === publishedUpdatedAt;
}
