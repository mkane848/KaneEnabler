/**
 * Tests for WUBRG color ordering and identity naming. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the server's test scripts —
 * these are the two conventions players notice immediately if they slip:
 * pips out of WUBRG order, or a guild called by the wrong name.
 */
import assert from 'node:assert';
import { COLOR_ORDER, identityName, sortWubrg, WUBRG } from '../src/lib/mtg';

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

check('sortWubrg puts colors in WUBRG order regardless of input order', () => {
  assert.deepStrictEqual(sortWubrg(['G', 'R', 'B', 'U', 'W']), ['W', 'U', 'B', 'R', 'G']);
  assert.deepStrictEqual(sortWubrg(['B', 'W']), ['W', 'B']);
});

check('sortWubrg is a no-op on an already-sorted or empty identity', () => {
  assert.deepStrictEqual(sortWubrg(['W', 'U']), ['W', 'U']);
  assert.deepStrictEqual(sortWubrg([]), []);
});

check('COLOR_ORDER ranks W < U < B < R < G', () => {
  for (let i = 0; i < WUBRG.length - 1; i++) {
    assert.ok((COLOR_ORDER.get(WUBRG[i]) ?? 0) < (COLOR_ORDER.get(WUBRG[i + 1]) ?? 0));
  }
});

check('identityName covers mono, guild, shard/wedge and five-color identities', () => {
  assert.strictEqual(identityName([]), 'Colorless');
  assert.strictEqual(identityName(['U']), 'Mono-Blue');
  assert.strictEqual(identityName(['B', 'U']), 'Dimir'); // order-independent input
  assert.strictEqual(identityName(['W', 'U', 'B']), 'Esper');
  assert.strictEqual(identityName(['W', 'U', 'B', 'R', 'G']), 'Five-Color');
});

check('identityName falls back to a color count for an identity outside WUBRG', () => {
  // Not a real Magic identity — pins the fallback branch for whatever
  // wouldn't resolve to a named combination.
  assert.strictEqual(identityName(['W', 'W']), '2-Color');
});

if (failures > 0) {
  console.error(`\n${failures} mtg helper cases failed.`);
  process.exit(1);
}
console.log('\nAll mtg helper cases passed.');
