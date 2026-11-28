/**
 * The SQLite cache store behind the Spellbook adapter: TTL, pruning, cooldown
 * persistence, and the property the Map could not have — answers surviving a
 * process restart (simulated by closing and reopening the handle).
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spellbook-cache-test-'));
const TTL = 60_000;
const value = { ready: [], almost: [] };

let store: typeof import('./spellbookCache');

describe('spellbookCache', () => {
  beforeAll(async () => {
    process.env.SPELLBOOK_CACHE_DB = path.join(dir, 'cache.sqlite');
    store = await import('./spellbookCache.js');
  });

  afterAll(() => {
    store.closeSpellbookCacheDb();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a value and misses on an unknown key', () => {
    store.clearSpellbookCacheStore();
    store.writeCached('k', value, 1_000, TTL);
    assert.deepStrictEqual(store.readCached('k', 2_000, TTL), { at: 1_000, value });
    assert.strictEqual(store.readCached('absent', 2_000, TTL), null);
  });

  it('expires an entry exactly at its TTL', () => {
    store.clearSpellbookCacheStore();
    store.writeCached('k', value, 1_000, TTL);
    assert.ok(store.readCached('k', 1_000 + TTL - 1, TTL));
    assert.strictEqual(store.readCached('k', 1_000 + TTL, TTL), null);
  });

  it('prunes expired entries on write, so the file stays bounded', () => {
    store.clearSpellbookCacheStore();
    store.writeCached('old', value, 0, TTL);
    store.writeCached('new', value, TTL + 10, TTL);
    assert.strictEqual(store.readCached('old', TTL + 10, TTL), null);
    assert.ok(store.readCached('new', TTL + 10, TTL));
  });

  it('overwrites an existing key rather than duplicating it', () => {
    store.clearSpellbookCacheStore();
    store.writeCached('k', value, 1_000, TTL);
    const updated = { ready: [], almost: [] };
    store.writeCached('k', updated, 2_000, TTL);
    assert.deepStrictEqual(store.readCached('k', 2_500, TTL), { at: 2_000, value: updated });
  });

  it('survives a close/reopen — the restart the Map forgot', () => {
    store.clearSpellbookCacheStore();
    store.writeCached('k', value, 1_000, TTL);
    store.closeSpellbookCacheDb();
    assert.deepStrictEqual(store.readCached('k', 2_000, TTL), { at: 1_000, value });
  });

  it('persists the cooldown across a reopen too', () => {
    store.clearSpellbookCacheStore();
    store.writeCooldownUntil(123_456);
    store.closeSpellbookCacheDb();
    assert.strictEqual(store.readCooldownUntil(), 123_456);
  });

  it('reads zero cooldown when none was written', () => {
    store.clearSpellbookCacheStore();
    assert.strictEqual(store.readCooldownUntil(), 0);
  });

  it('clear empties both the cache and the cooldown', () => {
    store.writeCached('k', value, 1_000, TTL);
    store.writeCooldownUntil(999);
    store.clearSpellbookCacheStore();
    assert.strictEqual(store.readCached('k', 1_000, TTL), null);
    assert.strictEqual(store.readCooldownUntil(), 0);
  });
});
