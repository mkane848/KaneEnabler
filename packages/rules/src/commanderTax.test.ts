import { describe, expect, it } from 'vitest';
import { commanderTax } from './commanderTax';

describe('commanderTax (CR 903.10)', () => {
  it('is 0 before any cast', () => {
    expect(commanderTax(0)).toBe(0);
  });

  it('adds {2} per previous cast', () => {
    expect(commanderTax(1)).toBe(2);
    expect(commanderTax(3)).toBe(6);
    expect(commanderTax(10)).toBe(20);
  });
});
