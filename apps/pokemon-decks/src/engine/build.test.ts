/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { DECK_SIZE } from '@ptcg/rules';
import { realCard, testCatalog } from '../test/catalog';
import { buildDeck, damageValue } from './build';
import { summarizeOwned } from './collection';
import { buildPool } from './pool';

const total = (cards: { count: number }[]) => cards.reduce((n, c) => n + c.count, 0);

describe('damageValue', () => {
  it('reads the printed number', () => {
    expect(damageValue('30')).toBe(30);
    expect(damageValue('50+')).toBe(50);
    expect(damageValue('30×')).toBe(30);
    expect(damageValue(undefined)).toBe(0);
  });
});

describe('buildDeck — Standard', () => {
  const catalog = testCatalog('standard');
  const pool = buildPool(catalog, 'standard');
  const gengar = realCard(catalog, 'sv05-104'); // Gengar ex, Stage 2, Darkness
  const deck = buildDeck(gengar, pool)!;

  it('builds a legal 60-card list around a Stage 2 attacker', () => {
    expect(deck).not.toBeNull();
    expect(total(deck.cards)).toBe(DECK_SIZE);
    expect(deck.violations).toEqual([]);
  });

  it('runs the whole line, Basic first, plus Stage 2 shortcuts', () => {
    expect(deck.line.map((c) => c.name)).toEqual(['Gastly', 'Haunter', 'Gengar ex']);
    expect(deck.cards.filter((c) => c.slot === 'line').map((c) => c.count)).toEqual([4, 2, 3]);
    expect(deck.cards.some((c) => c.slot === 'skipStage' && c.card.name === 'Rare Candy')).toBe(
      true,
    );
  });

  it("matches the Energy to the attacker's costs", () => {
    expect(deck.energyType).toBe('Darkness');
    expect(deck.cards.find((c) => c.slot === 'energy')?.card.name).toMatch(/Darkness Energy$/);
  });

  it('fills every Trainer role it can', () => {
    const slots = new Set(deck.cards.map((c) => c.slot));
    for (const role of ['draw', 'pokemonSearch', 'gust', 'switch', 'recovery']) {
      expect(slots.has(role as never), role).toBe(true);
    }
  });

  it('reports everything as missing when nothing is owned', () => {
    expect(deck.ownedCopies).toBe(0);
    expect(total(deck.missing.map((m) => ({ count: m.need })))).toBe(DECK_SIZE);
  });

  it('prefers owned cards for a role and counts them', () => {
    const owned = summarizeOwned(
      [
        { card: realCard(catalog, 'sv10.5w-082'), count: 2 }, // Energy Retrieval
        { card: realCard(catalog, 'sv05-104'), count: 1 },
      ],
      pool.energyTypes,
    );
    const mine = buildDeck(gengar, pool, { owned })!;
    expect(mine.cards.find((c) => c.slot === 'recovery')?.card.name).toBe('Energy Retrieval');
    expect(mine.ownedCopies).toBe(3);
    expect(mine.violations).toEqual([]);
  });
});

describe('buildDeck — Gym Leader Challenge', () => {
  const catalog = testCatalog('glc');
  const pool = buildPool(catalog, 'glc');

  it('builds a singleton, single-type list', () => {
    const deck = buildDeck(realCard(catalog, 'svp-089'), pool)!; // Feraligatr
    expect(deck.violations).toEqual([]);
    expect(total(deck.cards)).toBe(DECK_SIZE);
    for (const c of deck.cards) if (c.slot !== 'energy') expect(c.count, c.card.name).toBe(1);
  });

  it('refuses a rule-box attacker', () => {
    expect(buildDeck(realCard(catalog, 'sv05-104'), pool)).toBeNull(); // Gengar ex
  });
});
