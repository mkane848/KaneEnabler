import { describe, expect, it } from 'vitest';
import { hasChangeling, parseCreatureTypes } from './creatureTypes';

describe('parseCreatureTypes', () => {
  const CREATURE_TYPES = new Set(['Boar', 'Lhurgoyf', 'Knight', 'Goblin', 'Elf', 'Wall']);

  it('a card with no subtypes has no creature types', () => {
    expect(parseCreatureTypes('Instant')).toEqual([]);
  });

  it('a non-creature card contributes no creature types', () => {
    // "Battle — Control Point" is the one that broke it: every card reading
    // "creatures you control" was detected as caring about Control Kindred.
    expect(parseCreatureTypes('Battle — Control Point', CREATURE_TYPES)).toEqual([]);
    expect(parseCreatureTypes('Land — Cave', CREATURE_TYPES)).toEqual([]);
    expect(parseCreatureTypes('Artifact — Equipment', CREATURE_TYPES)).toEqual([]);
    expect(parseCreatureTypes('Enchantment — Aura', CREATURE_TYPES)).toEqual([]);
  });

  it("a creature card's non-creature subtypes are dropped", () => {
    // The subtypes of one card are mixed and not positionally separable, so
    // the catalog is what settles it.
    expect(parseCreatureTypes('Artifact Creature — Equipment Boar', CREATURE_TYPES)).toEqual([
      'Boar',
    ]);
    expect(parseCreatureTypes('Enchantment Creature — Saga Knight', CREATURE_TYPES)).toEqual([
      'Knight',
    ]);
  });

  it('Kindred cards carry creature types even without being creatures', () => {
    expect(parseCreatureTypes('Kindred Enchantment — Lhurgoyf Aura', CREATURE_TYPES)).toEqual([
      'Lhurgoyf',
    ]);
  });

  it('without a catalog it falls back to type-line structure alone', () => {
    // A database seeded before the catalog file existed still gets the
    // Creature/Kindred gate rather than nothing.
    expect(parseCreatureTypes('Battle — Control Point')).toEqual([]);
    expect(parseCreatureTypes('Creature — Goblin Wizard')).toEqual(['Goblin', 'Wizard']);
  });

  it('recognizes a multi-word creature type from the catalog instead of splitting it into two words', () => {
    // "Time Lord" is Scryfall's only multi-word creature type today (verified
    // against the live catalog/creature-types endpoint) — a word-by-word
    // filter can never match it, since neither "Time" nor "Lord" is a type
    // on its own.
    const types = new Set(['Time Lord', 'Doctor', 'Wizard']);
    expect(parseCreatureTypes('Legendary Creature — Time Lord Doctor', types)).toEqual([
      'Time Lord',
      'Doctor',
    ]);
  });

  it('still recognizes ordinary single-word types alongside a multi-word one', () => {
    const types = new Set(['Time Lord', 'Doctor', 'Wizard']);
    expect(parseCreatureTypes('Legendary Creature — Time Lord Doctor Wizard', types)).toEqual([
      'Time Lord',
      'Doctor',
      'Wizard',
    ]);
  });

  it('drops a word that almost starts a multi-word type but does not complete it', () => {
    // "Time Wizard" isn't a real type in this fixture's catalog — "Time"
    // must not be kept on its own just because it's the first word of a
    // different known multi-word type ("Time Lord").
    const types = new Set(['Time Lord', 'Wizard']);
    expect(parseCreatureTypes('Creature — Time Wizard', types)).toEqual(['Wizard']);
  });
});

describe('hasChangeling', () => {
  it('recognizes the Changeling keyword', () => {
    // Realmwalker — real Scryfall `keywords` array.
    expect(hasChangeling(['Changeling'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hasChangeling(['changeling'])).toBe(true);
  });

  it('recognizes Changeling alongside other keywords, in any position', () => {
    // Flock Impostor — real Scryfall `keywords` array.
    expect(hasChangeling(['Changeling', 'Flying', 'Flash'])).toBe(true);
  });

  it('a card without Changeling is not every creature type', () => {
    expect(hasChangeling(['Flying', 'Trample'])).toBe(false);
    expect(hasChangeling([])).toBe(false);
  });
});
