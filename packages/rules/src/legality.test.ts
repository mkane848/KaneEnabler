import { describe, expect, it } from 'vitest';
import { isCommanderLegal } from './legality';

describe('isCommanderLegal', () => {
  it('is true only for legality_commander === "legal"', () => {
    expect(isCommanderLegal({ legality_commander: 'legal' })).toBe(true);
    expect(isCommanderLegal({ legality_commander: 'banned' })).toBe(false);
    expect(isCommanderLegal({ legality_commander: 'not_legal' })).toBe(false);
    expect(isCommanderLegal({ legality_commander: 'restricted' })).toBe(false);
  });
});
