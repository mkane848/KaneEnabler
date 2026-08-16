/**
 * What the card database was built from, recorded inside the database itself.
 *
 * Kept apart from `dataSnapshot.ts` on purpose: that module answers "is the
 * *file on disk* current?", this one answers "was the *database* built from
 * that file, by this version of the import?". They can legitimately disagree
 * — a download that hasn't been imported yet — and merging them would make
 * that state unrepresentable.
 *
 * Read from two places with different needs, which is why it opens its own
 * connection rather than importing db.ts: the import script runs before a
 * database necessarily exists, and db.ts opens one eagerly at module load.
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';

export interface ImportedSnapshot {
  /** Scryfall's `updated_at` for the snapshot this database came from. */
  updatedAt: string;
  /** IMPORT_VERSION at the time of the import. */
  importVersion: number;
  /** When the import ran. */
  importedAt: string;
}

const META_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/** Creates the meta table if absent. Safe to call on every import. */
export function ensureMetaTable(db: Database.Database): void {
  db.exec(META_TABLE_SQL);
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return row !== undefined;
}

/**
 * Reads a database's recorded snapshot without holding the connection open.
 *
 * Returns null for anything unreadable — a missing file, a database predating
 * the meta table, a partial row. Every one of those means "we can't prove
 * this is current", and the only safe response is to re-import.
 */
export function readImportedSnapshot(dbPath: string): ImportedSnapshot | null {
  if (!fs.existsSync(dbPath)) return null;

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    if (!tableExists(db, 'meta')) return null;

    const rows = db.prepare('SELECT key, value FROM meta').all() as {
      key: string;
      value: string;
    }[];
    const values = new Map(rows.map((r) => [r.key, r.value]));

    const updatedAt = values.get('scryfall_snapshot_updated_at');
    const importVersion = Number(values.get('import_version'));
    if (!updatedAt || !Number.isFinite(importVersion)) return null;

    return {
      updatedAt,
      importVersion,
      importedAt: values.get('imported_at') ?? '',
    };
  } catch {
    // A corrupt or locked database should mean "re-import", not "crash".
    return null;
  } finally {
    db?.close();
  }
}

/** Records what this import consumed. Called at the end of a successful run. */
export function writeImportedSnapshot(
  db: Database.Database,
  snapshot: Omit<ImportedSnapshot, 'importedAt'>
): void {
  ensureMetaTable(db);
  const upsert = db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  db.transaction(() => {
    upsert.run('scryfall_snapshot_updated_at', snapshot.updatedAt);
    upsert.run('import_version', String(snapshot.importVersion));
    upsert.run('imported_at', new Date().toISOString());
  })();
}
