/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { buildSnapshot, trimCard } from './snapshot.mjs';

const serie = { id: 'sv', name: { en: 'Scarlet & Violet' } };
const set = {
  id: 'sv10',
  name: { en: 'Destined Rivals' },
  serie,
  releaseDate: '2025-05-30',
  abbreviations: { official: 'DRI', fr: 'RVD' },
  cardCount: { official: 182 },
};

/** A trimmed-down copy of TCGdex's Yanmega ex (sv10). */
const yanmega = {
  name: { en: 'Yanmega ex', fr: 'Yanmega-ex' },
  suffix: 'ex',
  rarity: 'Double rare',
  category: 'Pokemon',
  hp: 280,
  types: ['Grass'],
  evolveFrom: { en: 'Yanma', fr: 'Yanma' },
  stage: 'Stage1',
  abilities: [
    {
      type: 'Ability',
      name: { en: 'Buzzing Boost' },
      effect: {
        en: 'Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may search your deck for up to 3 Basic {G} Energy cards and attach them to this Pokémon. Then, shuffle your deck.',
      },
    },
  ],
  illustrator: 'takuyoa',
  variants: [{ type: 'holo' }],
  regulationMark: 'I',
};

describe('trimCard', () => {
  it('keeps English text and the fields the app reads, and drops the rest', () => {
    expect(trimCard({ serie, set, localId: '003', card: yanmega })).toEqual({
      id: 'sv10-003',
      setId: 'sv10',
      localId: '003',
      name: 'Yanmega ex',
      category: 'Pokemon',
      rarity: 'Double rare',
      stage: 'Stage1',
      suffix: 'ex',
      hp: 280,
      types: ['Grass'],
      evolveFrom: 'Yanma',
      abilities: [
        {
          type: 'Ability',
          name: 'Buzzing Boost',
          effect: yanmega.abilities[0].effect.en,
        },
      ],
      regulationMark: 'I',
    });
  });

  it('skips cards with no English printing', () => {
    expect(trimCard({ serie, set, localId: '1', card: { name: { fr: 'Balignon' } } })).toBeNull();
  });

  it('normalises the stray lowercase and "None" regulation marks', () => {
    const mark = (regulationMark) =>
      trimCard({ serie, set, localId: '1', card: { name: { en: 'X' }, regulationMark } })
        ?.regulationMark;
    expect(mark('j')).toBe('J');
    expect(mark('None')).toBeUndefined();
  });

  it('keeps damage as printed text', () => {
    const card = {
      name: { en: 'X' },
      attacks: [
        { name: { en: 'A' }, cost: ['Fire'], damage: 30 },
        { name: { en: 'B' }, cost: [], damage: '30+', effect: { en: 'Flip a coin.' } },
      ],
    };
    expect(trimCard({ serie, set, localId: '1', card })?.attacks).toEqual([
      { name: 'A', cost: ['Fire'], damage: '30' },
      { name: 'B', cost: [], damage: '30+', effect: 'Flip a coin.' },
    ]);
  });
});

describe('buildSnapshot', () => {
  const raw = (localId, extra = {}) => ({
    serie,
    set,
    localId,
    card: { name: { en: `Card ${localId}` }, category: 'Trainer', ...extra },
  });
  const legals = {
    standard: {
      includes: { series: [], sets: [], regulationMark: ['H', 'I', 'J'] },
      excludes: { sets: [], cards: [] },
    },
    expanded: {
      includes: { series: ['bw', 'sv'], sets: [], regulationMark: [] },
      excludes: { sets: [], cards: ['bw3-67'] },
    },
  };
  const source = { repo: 'r', commit: 'abc', committedAt: '2026-11-24T15:01:10Z' };

  it('groups by series in numeric localId order, with the PTCGL set code and marks per series', () => {
    const { index, series } = buildSnapshot(
      [
        raw('10', { regulationMark: 'I' }),
        raw('9'),
        raw('TG01'),
        raw('2', { regulationMark: 'H' }),
      ],
      legals,
      source,
    );
    expect(series.get('sv')?.map((c) => c.localId)).toEqual(['2', '9', '10', 'TG01']);
    expect(index.cardCount).toBe(4);
    expect(index.sets).toEqual([
      {
        id: 'sv10',
        name: 'Destined Rivals',
        serieId: 'sv',
        code: 'DRI',
        releaseDate: '2025-05-30',
        official: 182,
      },
    ]);
    expect(index.series).toEqual([
      { id: 'sv', name: 'Scarlet & Violet', cardCount: 4, regulationMarks: ['H', 'I'] },
    ]);
    expect(index.legality.standard.includes.regulationMarks).toEqual(['H', 'I', 'J']);
    expect(index.legality.expanded.excludes.cards).toEqual(['bw3-67']);
  });

  it('is deterministic: the same input always produces the same output', () => {
    const cards = [raw('3'), raw('1'), raw('2')];
    const a = buildSnapshot(cards, legals, source);
    const b = buildSnapshot([...cards].reverse(), legals, source);
    expect(JSON.stringify([a.index, [...a.series]])).toBe(JSON.stringify([b.index, [...b.series]]));
  });
});
