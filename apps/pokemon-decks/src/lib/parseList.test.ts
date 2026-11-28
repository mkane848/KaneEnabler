/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { realCard, testCatalog } from '../test/catalog';
import { exportList } from './exportList';
import { normalizeName, parseList } from './parseList';

const catalog = testCatalog('standard');

describe('parseList', () => {
  it('resolves a PTCG Live export to exact prints and skips its headers', () => {
    const { entries, unmatched, total } = parseList(
      [
        'Pokémon: 4',
        '4 Yanmega ex DRI 3',
        '',
        'Trainer: 4',
        '4 Ultra Ball MEG 131',
        'Total Cards: 8',
      ].join('\n'),
      catalog,
    );
    expect(unmatched).toEqual([]);
    expect(entries.map((e) => [e.card.id, e.count])).toEqual([
      ['sv10-003', 4],
      ['me01-131', 4],
    ]);
    expect(total).toBe(8);
  });

  it('reads bare names and "count name" lines, ignoring apostrophe style and case', () => {
    const { entries } = parseList('2 boss’s orders\nIono', catalog);
    expect(entries.map((e) => [e.card.name, e.count])).toEqual([
      ["Boss's Orders", 2],
      ['Iono', 1],
    ]);
  });

  it('falls back to the name when the print is unknown, and adds up repeats', () => {
    const { entries } = parseList('2 Ultra Ball XXX 999\n1 Ultra Ball', catalog);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(3);
  });

  it("ignores a set code and number that name a different card, and goes by the line's name", () => {
    const { entries } = parseList('3 Gastly MEG 48', catalog); // MEG 48 is Raikou
    expect(entries.map((e) => [e.card.name, e.count])).toEqual([['Gastly', 3]]);
  });

  it('reports what it could not resolve, and why', () => {
    expect(parseList('3 Definitely Not A Card', catalog).unmatched).toEqual([
      {
        line: '3 Definitely Not A Card',
        reason: "No card named “Definitely Not A Card” in this format's card pool.",
      },
    ]);
  });

  it('normalizes the differences a paste introduces', () => {
    expect(normalizeName('  Boss’s   Orders ')).toBe("boss's orders");
  });
});

describe('exportList', () => {
  it('writes a list the parser reads straight back', () => {
    const cards = [
      { card: realCard(catalog, 'sv10-003'), count: 4 },
      { card: realCard(catalog, 'me01-131'), count: 4 },
      { card: realCard(catalog, 'sve-001'), count: 2 },
    ];
    const text = exportList(cards, catalog);
    expect(text.split('\n')[0]).toBe('Pokémon: 4');
    const back = parseList(text, catalog);
    expect(back.unmatched).toEqual([]);
    expect(back.entries.map((e) => [e.card.id, e.count])).toEqual(
      cards.map((c) => [c.card.id, c.count]),
    );
  });
});
