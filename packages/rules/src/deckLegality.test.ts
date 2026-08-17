import { describe, expect, it } from 'vitest';
import {
  combinedColorIdentity,
  findColorIdentityViolations,
  isValidDeckSize,
} from './deckLegality';

describe('isValidDeckSize (CR 903.5a)', () => {
  it('exactly 100 cards is valid', () => {
    expect(isValidDeckSize(100)).toBe(true);
  });

  it('fewer than 100 is invalid', () => {
    expect(isValidDeckSize(99)).toBe(false);
  });

  it('more than 100 is invalid', () => {
    expect(isValidDeckSize(101)).toBe(false);
  });

  it('an empty deck is invalid', () => {
    expect(isValidDeckSize(0)).toBe(false);
  });
});

describe('combinedColorIdentity', () => {
  it('a single commander keeps its own identity', () => {
    expect(combinedColorIdentity([['G', 'W']])).toEqual(new Set(['G', 'W']));
  });

  it('a Partner pair unions both halves rather than intersecting them', () => {
    expect(combinedColorIdentity([['W'], ['U']])).toEqual(new Set(['W', 'U']));
  });

  it('a color shared by both commanders is not duplicated', () => {
    expect(
      combinedColorIdentity([
        ['W', 'U'],
        ['U', 'B'],
      ]),
    ).toEqual(new Set(['W', 'U', 'B']));
  });

  it('no commanders produces an empty (colorless-only) identity', () => {
    expect(combinedColorIdentity([])).toEqual(new Set());
  });
});

describe('findColorIdentityViolations (CR 903.4)', () => {
  it('an empty result means every card fits the identity', () => {
    const deck = [{ color_identity: ['G'] }, { color_identity: ['W'] }, { color_identity: [] }];
    expect(findColorIdentityViolations(deck, new Set(['G', 'W']))).toEqual([]);
  });

  it("reports a card whose identity reaches outside the commander's", () => {
    const legal = { color_identity: ['G'] };
    const illegal = { color_identity: ['G', 'U'] };
    expect(findColorIdentityViolations([legal, illegal], new Set(['G', 'W']))).toEqual([illegal]);
  });

  it('reports every violation, in deck order, not just the first', () => {
    const first = { color_identity: ['U'] };
    const ok = { color_identity: ['G'] };
    const second = { color_identity: ['B'] };
    expect(findColorIdentityViolations([first, ok, second], new Set(['G', 'W']))).toEqual([
      first,
      second,
    ]);
  });

  it('an empty deck has no violations', () => {
    expect(findColorIdentityViolations([], new Set(['G', 'W']))).toEqual([]);
  });
});
