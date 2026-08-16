/**
 * Tests for WUBRG color ordering and identity naming.
 *
 * These are the two conventions players notice immediately if they slip:
 * pips out of WUBRG order, or a guild called by the wrong name.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { COLOR_ORDER, identityName, sortWubrg, WUBRG } from './mtg';

describe('mtg helpers', () => {
  it('sortWubrg puts colors in WUBRG order regardless of input order', () => {
    assert.deepStrictEqual(sortWubrg(['G', 'R', 'B', 'U', 'W']), ['W', 'U', 'B', 'R', 'G']);
    assert.deepStrictEqual(sortWubrg(['B', 'W']), ['W', 'B']);
  });

  it('sortWubrg is a no-op on an already-sorted or empty identity', () => {
    assert.deepStrictEqual(sortWubrg(['W', 'U']), ['W', 'U']);
    assert.deepStrictEqual(sortWubrg([]), []);
  });

  it('COLOR_ORDER ranks W < U < B < R < G', () => {
    for (let i = 0; i < WUBRG.length - 1; i++) {
      assert.ok((COLOR_ORDER.get(WUBRG[i]!) ?? 0) < (COLOR_ORDER.get(WUBRG[i + 1]!) ?? 0));
    }
  });

  it('identityName covers mono, guild, shard/wedge and five-color identities', () => {
    assert.strictEqual(identityName([]), 'Colorless');
    assert.strictEqual(identityName(['U']), 'Mono-Blue');
    assert.strictEqual(identityName(['B', 'U']), 'Dimir'); // order-independent input
    assert.strictEqual(identityName(['W', 'U', 'B']), 'Esper');
    assert.strictEqual(identityName(['W', 'U', 'B', 'R', 'G']), 'Five-Color');
  });

  it('identityName falls back to a color count for an identity outside WUBRG', () => {
    // Not a real Magic identity — pins the fallback branch for whatever
    // wouldn't resolve to a named combination.
    assert.strictEqual(identityName(['W', 'W']), '2-Color');
  });
});
