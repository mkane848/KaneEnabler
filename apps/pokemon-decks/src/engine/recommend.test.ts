/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { hasRuleBox } from '@ptcg/rules';
import { parseList } from '../lib/parseList';
import { testCatalog } from '../test/catalog';
import { summarizeOwned } from './collection';
import { buildPool } from './pool';
import { attackerCandidates, recommendDecks } from './recommend';

describe('recommendDecks', () => {
  const catalog = testCatalog('standard');
  const pool = buildPool(catalog, 'standard');
  const collection = parseList(
    [
      '3 Gastly MEG 48', // wrong print (MEG 48 is Raikou): resolved by name instead
      '2 Haunter',
      '2 Gengar ex TEF 104',
      '2 Rare Candy',
      '4 Buddy-Buddy Poffin',
      "2 Lillie's Determination",
      '1 Yanma',
      '10 Basic Darkness Energy',
    ].join('\n'),
    catalog,
  );
  const owned = summarizeOwned(collection.entries, pool.energyTypes);
  const decks = recommendDecks(pool, owned);

  it('ranks the deck the collection is built for first', () => {
    expect(decks[0]?.attacker.name).toBe('Gengar ex');
    expect(decks[0]?.breakdown.line).toBe(1);
  });

  it('only suggests attackers whose line the player owns part of', () => {
    for (const deck of decks) {
      expect(
        deck.line.some((c) => (owned.byName.get(c.name) ?? 0) > 0),
        deck.attacker.name,
      ).toBe(true);
    }
    expect(decks.some((d) => d.attacker.name.startsWith('Yanmega'))).toBe(true);
  });

  it('returns only legal decks, best first, one per attacker name', () => {
    const scores = decks.map((d) => d.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(decks.every((d) => d.violations.length === 0)).toBe(true);
    const names = decks.map((d) => d.attacker.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('counts owned copies toward the score', () => {
    const top = decks[0]!; // the first test pins that there is one
    expect(top.ownedCopies).toBeGreaterThan(15);
    expect(top.missing.length).toBeGreaterThan(0);
  });
});

describe('attackerCandidates', () => {
  it('leaves out rule-box Pokémon in Gym Leader Challenge', () => {
    const pool = buildPool(testCatalog('glc'), 'glc');
    const candidates = attackerCandidates(pool);
    expect(candidates.length).toBeGreaterThan(100);
    expect(candidates.some(hasRuleBox)).toBe(false);
  });
});
