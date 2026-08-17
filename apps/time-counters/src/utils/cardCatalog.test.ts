import { describe, expect, it } from 'vitest';
import type { CardData } from '../types';
import { findCardByName, searchCards } from './cardCatalog';

/** loadCatalog keeps the real catalog alphabetized — these fixtures do too,
 * since searchCards relies on that order instead of sorting its own output. */
function card(name: string): CardData {
  return {
    id: `id:${name.toLowerCase()}`,
    name,
    typeLine: 'Creature',
    manaCost: '',
    colorIdentity: [],
  };
}

describe('searchCards', () => {
  const catalog = [
    'Ancestral Vision',
    'Bolt Hound',
    'Fire',
    'Firebolt',
    'Firecat Blitz',
    'Lightning Bolt',
    'Rift Bolt',
    'Time Stop',
    'Time Warp',
    'Timely Reinforcements',
  ].map(card);

  it('returns nothing for a blank query', () => {
    expect(searchCards(catalog, '')).toEqual([]);
    expect(searchCards(catalog, '   ')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(searchCards(catalog, 'FIRE').map((c) => c.name)).toContain('Fire');
  });

  it('ranks name-anchored matches before merely-contains matches', () => {
    // "Bolt Hound" starts with "bolt"; the other three merely contain it
    // ("fireBOLT", "Lightning BOLT", "Rift BOLT").
    const result = searchCards(catalog, 'bolt');
    expect(result.map((c) => c.name)).toEqual([
      'Bolt Hound',
      'Firebolt',
      'Lightning Bolt',
      'Rift Bolt',
    ]);
  });

  it('keeps each bucket in catalog (alphabetical) order without a separate sort', () => {
    const result = searchCards(catalog, 'fire');
    expect(result.map((c) => c.name)).toEqual(['Fire', 'Firebolt', 'Firecat Blitz']);
  });

  it('respects the limit, anchored matches first', () => {
    const result = searchCards(catalog, 'fire', 2);
    expect(result.map((c) => c.name)).toEqual(['Fire', 'Firebolt']);
  });

  it('stops scanning once the limit is filled by anchored matches alone — no contains matches leak in', () => {
    // "Time Stop" and "Time Warp" alone already fill a limit of 2, so
    // "Timely Reinforcements" (also anchored, but later in the catalog)
    // must not appear either.
    const result = searchCards(catalog, 'time', 2);
    expect(result.map((c) => c.name)).toEqual(['Time Stop', 'Time Warp']);
  });

  it('fills remaining slots from contains-matches once anchored matches run out', () => {
    // Only "Bolt Hound" is anchored; a limit of 3 needs two more from the
    // contains bucket, in catalog order.
    const result = searchCards(catalog, 'bolt', 3);
    expect(result.map((c) => c.name)).toEqual(['Bolt Hound', 'Firebolt', 'Lightning Bolt']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchCards(catalog, 'zzz')).toEqual([]);
  });
});

describe('findCardByName', () => {
  const catalog = ['Sol Ring', 'Arcane Signet'].map(card);

  it('finds an exact, case-insensitive match', () => {
    expect(findCardByName(catalog, 'sol ring')?.name).toBe('Sol Ring');
  });

  it('returns undefined for no match', () => {
    expect(findCardByName(catalog, 'Not A Card')).toBeUndefined();
  });
});
