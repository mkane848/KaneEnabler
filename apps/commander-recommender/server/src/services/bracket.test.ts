/**
 * Tests for the Game-Changer-count -> Bracket estimate heuristic.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { estimateBracket } from './bracket';

describe('estimateBracket', () => {
  it('zero Game Changers -> Bracket 1-2', () => {
    assert.strictEqual(estimateBracket(0).range, 'Bracket 1–2');
  });

  it('1 to 3 Game Changers -> Bracket 3', () => {
    assert.strictEqual(estimateBracket(1).range, 'Bracket 3');
    assert.strictEqual(estimateBracket(3).range, 'Bracket 3');
  });

  it('more than 3 Game Changers -> Bracket 4-5', () => {
    assert.strictEqual(estimateBracket(4).range, 'Bracket 4–5');
    assert.strictEqual(estimateBracket(10).range, 'Bracket 4–5');
  });

  it('the note pluralises "Game Changer" correctly', () => {
    assert.match(estimateBracket(1).note, /1 Game Changer detected/);
    assert.match(estimateBracket(2).note, /2 Game Changers detected/);
  });
});
