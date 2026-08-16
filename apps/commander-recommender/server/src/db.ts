import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { CardRow } from './types';
import {
  archetypeDisplay,
  signalKey,
  type SignalCandidate,
  type SignalKey,
  type SignalMatch,
} from './services/signals';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'cards.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function tableExists(name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return !!row;
}

function columnExists(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

// True once `npm run import-scryfall` has been run at least once.
// Routes check this so they can return a helpful message instead of a
// confusing SQL error when the database is still empty.
export const isSeeded = tableExists('cards');

// Guarded like the tables below, and for a sharper reason: `cards` is the
// table isSeeded checks for, so preparing against it unconditionally made an
// unseeded database throw "no such table: cards" while this module was still
// loading — before any route could read isSeeded and answer with the helpful
// "run npm run import-scryfall" message it exists to give.
const exactNameStmt = isSeeded
  ? db.prepare('SELECT * FROM cards WHERE name_lower = ? LIMIT 1')
  : null;

// card_face_names is a newer table than `cards`; a database seeded before it
// existed would still pass isSeeded. Guard its existence rather than let a
// stale local DB crash the server on the first prepared statement — the
// fallback below just degrades to exact-name-only matching, same as before
// this table existed.
// Ordered by face_index so a front face outranks a back face when two cards
// share a face name — "Lightning Bolt" should never resolve to "Emeritus of
// Conflict // Lightning Bolt". Exact full-name matching (below) already wins
// over this table outright; this only settles ties *within* it.
//
// COALESCE keeps a database seeded before face_index existed working: older
// rows read as 0 rather than making the whole statement fail.
const faceNameStmt = tableExists('card_face_names')
  ? db.prepare(`
      SELECT cards.* FROM card_face_names
      JOIN cards ON cards.oracle_id = card_face_names.oracle_id
      WHERE card_face_names.face_name_lower = ?
      ORDER BY COALESCE(card_face_names.face_index, 0) ASC
      LIMIT 1
    `)
  : null;

// Re-skinned printing names ("Dracula, Voyager" -> Edgar, Charmed Groom).
// Guarded like card_face_names: a database seeded before this table existed
// still passes isSeeded, and degrades to matching without re-skins.
const flavorNameStmt = tableExists('card_flavor_names')
  ? db.prepare(`
      SELECT cards.* FROM card_flavor_names
      JOIN cards ON cards.oracle_id = card_flavor_names.oracle_id
      WHERE card_flavor_names.flavor_name_lower = ?
      LIMIT 1
    `)
  : null;

/**
 * Resolves written-down card names to rows, in decreasing order of certainty:
 *
 *   1. the exact full name, which is what most cards are;
 *   2. a face name, front faces before back faces;
 *   3. a re-skinned printing's name.
 *
 * The order is what keeps the broader matching safe. 27 face names are also
 * the real name of a different card — "Lightning Bolt" is a card, and the
 * back face of "Emeritus of Conflict // Lightning Bolt" — so exact matching
 * has to win outright, and re-skins come last for the same reason.
 */
export function findCardsByNames(names: string[]): Map<string, CardRow> {
  const map = new Map<string, CardRow>();
  for (const name of names) {
    const lower = name.toLowerCase();
    const row = (exactNameStmt?.get(lower) ??
      faceNameStmt?.get(lower) ??
      flavorNameStmt?.get(lower)) as CardRow | undefined;
    if (row) map.set(lower, row);
  }
  return map;
}

export function getCommanderCandidates(): CardRow[] {
  return db
    .prepare(
      `SELECT * FROM cards WHERE is_commander_eligible = 1 AND legality_commander = 'legal'`
    )
    .all() as CardRow[];
}

// is_background is newer than `cards` itself, same story as card_face_names
// above: guard it so a database seeded before Partner/Background support
// existed degrades to "no Backgrounds available" instead of crashing the
// server when this statement is first prepared.
const hasBackgroundColumn = columnExists('cards', 'is_background');

/** Legal, legendary Background enchantments — pairing targets for "choose a Background", never a candidate on their own. */
export function getBackgroundCards(): CardRow[] {
  if (!hasBackgroundColumn) return [];
  return db
    .prepare(
      `SELECT * FROM cards WHERE is_background = 1 AND is_legendary = 1 AND legality_commander = 'legal'`
    )
    .all() as CardRow[];
}

// Precomputed card relationships. Guarded like the other newer tables: a
// database seeded before card_signals existed still passes isSeeded, and
// degrades to no deck analysis rather than crashing on first query.
const hasSignalsTable = tableExists('card_signals');

/**
 * The archetypes each of these cards participates in, and in what capacity.
 *
 * Reads the relationship layer rather than deriving anything — see
 * `card_signals` in import-scryfall.ts. Returns an empty map when the table
 * is missing, so callers get "no themes found" rather than an error.
 */
export function findSignalsByOracleIds(oracleIds: string[]): Map<string, SignalMatch[]> {
  const map = new Map<string, SignalMatch[]>();
  if (!hasSignalsTable || oracleIds.length === 0) return map;

  // Chunked because SQLite caps host parameters (999 by default), and a
  // pasted collection can exceed that.
  const CHUNK = 400;
  for (let i = 0; i < oracleIds.length; i += CHUNK) {
    const chunk = oracleIds.slice(i, i + CHUNK);
    const rows = db
      .prepare(
        `SELECT oracle_id, archetype, qualifier, qualifier_kind, roles
         FROM card_signals
         WHERE oracle_id IN (${chunk.map(() => '?').join(',')})`
      )
      .all(...chunk) as {
      oracle_id: string;
      archetype: string;
      qualifier: string | null;
      qualifier_kind: string | null;
      roles: string;
    }[];

    for (const row of rows) {
      const def = archetypeDisplay(row.archetype, row.qualifier);
      const signal: SignalMatch = {
        archetype: row.archetype,
        label: def.label,
        description: def.description,
        weight: def.weight,
        qualifier: row.qualifier ?? undefined,
        qualifierKind: (row.qualifier_kind as SignalMatch['qualifierKind']) ?? undefined,
        roles: JSON.parse(row.roles) as SignalMatch['roles'],
      };
      const existing = map.get(row.oracle_id);
      if (existing) existing.push(signal);
      else map.set(row.oracle_id, [signal]);
    }
  }
  return map;
}

/**
 * Every legal card participating in each of these archetypes.
 *
 * The reverse of `findSignalsByOracleIds`: that asks "what does this card do?",
 * this asks "who does X?" — the query the relationship layer was precomputed
 * for. Callers filter by role and color identity themselves, because they
 * generally want several different role cuts of the same archetype and a
 * single pass is cheaper than a query each.
 */
export function findCardsBySignals(keys: SignalKey[]): Map<string, SignalCandidate[]> {
  const map = new Map<string, SignalCandidate[]>();
  if (!hasSignalsTable) return map;

  for (const key of keys) {
    const cacheKey = signalKey(key);
    if (map.has(cacheKey)) continue;

    // IS NOT DISTINCT FROM would be tidier, but SQLite's `IS` already treats
    // NULL as a comparable value, which is exactly what unqualified
    // archetypes need.
    const rows = db
      .prepare(
        `SELECT cards.*, card_signals.roles AS signal_roles
         FROM card_signals
         JOIN cards ON cards.oracle_id = card_signals.oracle_id
         WHERE card_signals.archetype = ?
           AND card_signals.qualifier IS ?
           AND cards.legality_commander = 'legal'`
      )
      .all(key.archetype, key.qualifier ?? null) as (CardRow & { signal_roles: string })[];

    map.set(
      cacheKey,
      rows.map(({ signal_roles, ...row }) => ({
        row: row as CardRow,
        roles: JSON.parse(signal_roles) as SignalMatch['roles'],
      }))
    );
  }

  return map;
}
