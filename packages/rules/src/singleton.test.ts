import { describe, expect, it, vi } from 'vitest';
import { singletonLimit, type SingletonCardLike } from './singleton.js';

function card(overrides: Partial<SingletonCardLike> = {}): SingletonCardLike {
  return { name: 'Test Card', type_line: 'Creature — Human', oracle_text: '', ...overrides };
}

describe('singletonLimit (CR 903.5b)', () => {
  it('an ordinary card is limited to a single copy', () => {
    expect(singletonLimit(card({ name: 'Sol Ring', type_line: 'Artifact' }))).toBe(1);
  });

  it('basic lands are unlimited', () => {
    expect(singletonLimit(card({ name: 'Swamp', type_line: 'Basic Land — Swamp' }))).toBe(Infinity);
  });

  it('snow basics and Wastes are unlimited too', () => {
    // Exempted by supertype, so neither needs naming individually.
    expect(
      singletonLimit(card({ name: 'Snow-Covered Forest', type_line: 'Basic Snow Land — Forest' })),
    ).toBe(Infinity);
    expect(singletonLimit(card({ name: 'Wastes', type_line: 'Basic Land' }))).toBe(Infinity);
  });

  it('a nonbasic land sharing a basic land type is still singleton', () => {
    // "Land — Forest" (e.g. a dual) is not a *basic* Forest.
    expect(singletonLimit(card({ name: 'Bayou', type_line: 'Land — Swamp Forest' }))).toBe(1);
  });

  it('"any number" cards are unlimited', () => {
    const rats = card({
      name: 'Relentless Rats',
      oracle_text: 'A deck can have any number of cards named Relentless Rats.',
    });
    expect(singletonLimit(rats)).toBe(Infinity);
  });

  it('"up to N" cards are limited to N', () => {
    const dwarves = card({
      name: 'Seven Dwarves',
      oracle_text: 'A deck can have up to seven cards named Seven Dwarves.',
    });
    expect(singletonLimit(dwarves)).toBe(7);
    const nazgul = card({
      name: 'Nazgûl',
      oracle_text: 'A deck can have up to nine cards named Nazgûl.',
    });
    expect(singletonLimit(nazgul)).toBe(9);
  });

  it('"up to N" with a digit instead of a spelled-out word still resolves to N', () => {
    // Both real "up to N" cards (Seven Dwarves, Nazgûl) spell the number out
    // today, but nothing about the rule requires that — a future card is
    // free to print a digit instead.
    const c = card({
      name: 'Hypothetical Card',
      oracle_text: 'A deck can have up to 7 cards named Hypothetical Card.',
    });
    expect(singletonLimit(c)).toBe(7);
  });

  it('a digit above twelve resolves to N instead of silently falling back to 1', () => {
    // NUMBER_WORDS tops out at twelve; a digit must not depend on it.
    const c = card({
      name: 'Hypothetical Card',
      oracle_text: 'A deck can have up to 15 cards named Hypothetical Card.',
    });
    expect(singletonLimit(c)).toBe(15);
  });

  it('a value that is neither a digit nor a known word still falls back to 1, but warns instead of failing silently', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = card({
      name: 'Hypothetical Card',
      oracle_text: 'A deck can have up to lots cards named Hypothetical Card.',
    });
    expect(singletonLimit(c)).toBe(1);
    expect(warnSpy.mock.calls.length).toBe(1);
    warnSpy.mockRestore();
  });
});
