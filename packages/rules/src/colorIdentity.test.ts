import { describe, expect, it } from 'vitest';
import { isWithinColorIdentity } from './colorIdentity';

describe('isWithinColorIdentity (CR 903.4)', () => {
  it('a mono-color card fits an identity containing that color', () => {
    expect(isWithinColorIdentity(['G'], new Set(['G', 'W']))).toBe(true);
  });

  it('a card touching a color outside the identity does not fit', () => {
    expect(isWithinColorIdentity(['G', 'U'], new Set(['G', 'W']))).toBe(false);
  });

  it('a colorless card fits any identity, including an empty one', () => {
    expect(isWithinColorIdentity([], new Set(['G', 'W']))).toBe(true);
    expect(isWithinColorIdentity([], new Set())).toBe(true);
  });

  it('exact identity match fits', () => {
    expect(
      isWithinColorIdentity(['W', 'U', 'B', 'R', 'G'], new Set(['W', 'U', 'B', 'R', 'G'])),
    ).toBe(true);
  });

  it('a five-color card does not fit a narrower identity', () => {
    expect(isWithinColorIdentity(['W', 'U', 'B', 'R', 'G'], new Set(['G', 'W']))).toBe(false);
  });
});
