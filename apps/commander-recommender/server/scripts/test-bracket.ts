/**
 * Tests for the Game-Changer-count -> Bracket estimate heuristic. Run with:
 * npm test
 */
import assert from 'node:assert';
import { estimateBracket } from '../src/services/bracket';

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

check('zero Game Changers -> Bracket 1-2', () => {
  assert.strictEqual(estimateBracket(0).range, 'Bracket 1–2');
});

check('1 to 3 Game Changers -> Bracket 3', () => {
  assert.strictEqual(estimateBracket(1).range, 'Bracket 3');
  assert.strictEqual(estimateBracket(3).range, 'Bracket 3');
});

check('more than 3 Game Changers -> Bracket 4-5', () => {
  assert.strictEqual(estimateBracket(4).range, 'Bracket 4–5');
  assert.strictEqual(estimateBracket(10).range, 'Bracket 4–5');
});

check('the note pluralises "Game Changer" correctly', () => {
  assert.match(estimateBracket(1).note, /1 Game Changer detected/);
  assert.match(estimateBracket(2).note, /2 Game Changers detected/);
});

if (failures > 0) {
  console.error(`\n${failures} bracket cases failed.`);
  process.exit(1);
}
console.log('\nAll bracket cases passed.');
