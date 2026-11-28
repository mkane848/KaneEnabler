import { describe, expect, it } from 'vitest';
import { OFFICIAL, PENDING_QUOTE } from './official';

/**
 * The official quotes still owed by the repo owner (pokemon.com can't be read
 * from the sandbox). Remove a key here as its quote lands in official.ts; the
 * #98 PR stays a draft until this list is empty.
 */
const STILL_PENDING = [
  'deckSize',
  'copyLimit',
  'basicPokemon',
  'aceSpec',
  'radiant',
  'prismStar',
  'ruleBox',
  'basicEnergyLegal',
  'reprints',
  'banList',
];

describe('official citations', () => {
  it('lists exactly the quotes still pending', () => {
    const pending = Object.entries(OFFICIAL)
      .filter(([, c]) => c.quote === PENDING_QUOTE)
      .map(([key]) => key);
    expect(pending).toEqual(STILL_PENDING);
  });

  it('names a source document for every citation', () => {
    for (const c of Object.values(OFFICIAL)) expect(c.source).toMatch(/pokemon\.com/);
  });
});
