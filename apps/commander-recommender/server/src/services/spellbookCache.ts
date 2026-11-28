/**
 * SQLite-backed store for the Commander Spellbook cache and 429 cooldown.
 *
 * Replaces the per-process Map (docs/api-policy.md's known-violations item 2,
 * KimiAudit W9; owner sign-off 2026-11-25). What the file buys: the cache and
 * the cooldown survive a process restart within the instance's lifetime, and
 * the cooldown in particular must not be forgotten just because the process
 * bounced — a 429 is the service telling us to stop, not a per-process hint.
 * What it deliberately does not buy: persistence across a redeploy. Render's
 * free tier has an ephemeral filesystem, so a deploy starts the cache empty;
 * with a one-hour TTL that loss is bounded and acceptable, and a shared
 * external store (Supabase/Key Value) would add credentials and a new failure
 * mode for a cache whose whole job is politeness.
 *
 * Separate file from cards.sqlite on purpose: that one is rebuilt from
 * Scryfall on every deploy, and nothing about this cache should be coupled to
 * the card-data import lifecycle.
 */
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { ComboLookup } from './spellbook.js';

export type CachedCombos = Omit<ComboLookup, 'cached'>;

const DATA_DIR = path.join(__dirname, '..', 'data');
/** Overridable so tests run against a throwaway file (or ':memory:'). */
const dbPath = () =>
  process.env.SPELLBOOK_CACHE_DB ?? path.join(DATA_DIR, 'spellbook-cache.sqlite');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const file = dbPath();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS combo_cache (
      key TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

/** A fresh entry for this key, or null when absent or past its TTL. */
export function readCached(
  key: string,
  now: number,
  ttlMs: number,
): { at: number; value: CachedCombos } | null {
  const row = getDb().prepare('SELECT at, payload FROM combo_cache WHERE key = ?').get(key) as
    { at: number; payload: string } | undefined;
  if (!row || now - row.at >= ttlMs) return null;
  return { at: row.at, value: JSON.parse(row.payload) as CachedCombos };
}

/** Stores an entry and drops everything past its TTL, so the file stays bounded. */
export function writeCached(key: string, value: CachedCombos, now: number, ttlMs: number): void {
  const store = getDb();
  store.prepare('DELETE FROM combo_cache WHERE at <= ?').run(now - ttlMs);
  store
    .prepare(
      'INSERT INTO combo_cache (key, at, payload) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at, payload = excluded.payload',
    )
    .run(key, now, JSON.stringify(value));
}

/** Epoch ms until which a 429's Retry-After says we must not call again; 0 when none. */
export function readCooldownUntil(): number {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = 'cooldownUntil'").get() as
    { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

export function writeCooldownUntil(until: number): void {
  getDb()
    .prepare(
      "INSERT INTO meta (key, value) VALUES ('cooldownUntil', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(String(until));
}

/** Exposed so tests (and the adapter's clearComboCache) start from a known state. */
export function clearSpellbookCacheStore(): void {
  const store = getDb();
  store.exec('DELETE FROM combo_cache; DELETE FROM meta;');
}

/** Closes the handle so the next read reopens the file — a restart in miniature,
 * which is exactly what the persistence test exercises. */
export function closeSpellbookCacheDb(): void {
  db?.close();
  db = null;
}
