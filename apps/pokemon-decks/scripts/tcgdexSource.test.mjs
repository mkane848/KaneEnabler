import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  parseDataModule,
  parseNamedExports,
  readDatabase,
  UnreadableLiteral,
} from './tcgdexSource.mjs';

// Shapes copied from real files in tcgdex/cards-database (Destined Rivals 005,
// SVP 213, meta/legals.ts), cut down to the parts the parser has to handle.
const CARD = `import { Card } from "../../../interfaces"
import Set from "../Destined Rivals"

const card: Card = {
	dexId: [285],
	set: Set,
	name: { en: "Shroomish", fr: "Balignon" },
	category: "Pokemon",
	hp: 60,
	types: ["Grass"],
	stage: "Basic",
	attacks: [{
		cost: ["Colorless", "Colorless"],
		name: { en: "Rolling Tackle" },
		damage: 30
	}],
	weaknesses: [{ type: "Fire", value: "×2", }],
	retreat: 1,
	regulationMark: "I",
}

export default card
`;

describe('parseDataModule', () => {
  it('reads a card literal and turns the imported set into a reference', () => {
    const { value } = parseDataModule(CARD, 'card.ts');
    expect(value).toMatchObject({
      dexId: [285],
      set: { $ref: '../Destined Rivals' },
      name: { en: 'Shroomish', fr: 'Balignon' },
      hp: 60,
      attacks: [{ cost: ['Colorless', 'Colorless'], name: { en: 'Rolling Tackle' }, damage: 30 }],
      regulationMark: 'I',
    });
  });

  it('joins an effect split across lines with +', () => {
    const src = `const card = { effect: { en: "Flip a coin. " +\n "If heads, draw." } }\nexport default card`;
    expect(parseDataModule(src, 'x.ts').value).toEqual({
      effect: { en: 'Flip a coin. If heads, draw.' },
    });
  });

  it('reads a direct `export default {…}` and negative numbers', () => {
    expect(parseDataModule('export default { a: -1, b: null, c: true }', 'x.ts').value).toEqual({
      a: -1,
      b: null,
      c: true,
    });
  });

  it('refuses anything it would have to execute', () => {
    expect(() => parseDataModule('export default { a: run() }', 'x.ts')).toThrow(UnreadableLiteral);
    expect(() => parseDataModule('export default { ...base }', 'x.ts')).toThrow(UnreadableLiteral);
    expect(() => parseDataModule('export default { a: 1 + 2 }', 'x.ts')).toThrow(UnreadableLiteral);
    expect(() => parseDataModule('export default { a: notImported }', 'x.ts')).toThrow(
      /unknown identifier/,
    );
  });
});

describe('parseNamedExports', () => {
  it("reads legals.ts's exported filters", () => {
    const src = `import { Filter } from '../interfaces'
export const standard: Filter = {
	includes: { series: [], sets: [], regulationMark: ['H', 'I', 'J'] },
	excludes: { sets: [], cards: [] }
}
const notExported = { a: 1 }
export const expanded: Filter = {
	includes: { series: ['bw', 'xy'], sets: [], regulationMark: [] },
	excludes: { sets: [], cards: [ 'bw3-67', ] }
}`;
    expect(parseNamedExports(src, 'legals.ts')).toEqual({
      standard: {
        includes: { series: [], sets: [], regulationMark: ['H', 'I', 'J'] },
        excludes: { sets: [], cards: [] },
      },
      expanded: {
        includes: { series: ['bw', 'xy'], sets: [], regulationMark: [] },
        excludes: { sets: [], cards: ['bw3-67'] },
      },
    });
  });
});

describe('readDatabase', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tcgdex-test-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const write = (rel, body) => {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  write(
    'data/Scarlet & Violet.ts',
    'const serie = { id: "sv", name: { en: "Scarlet & Violet" } }\nexport default serie',
  );
  write(
    'data/Scarlet & Violet/Destined Rivals.ts',
    'import serie from "../Scarlet & Violet"\nconst set = { id: "sv10", name: { en: "Destined Rivals" }, serie: serie }\nexport default set',
  );
  write('data/Scarlet & Violet/Destined Rivals/005.ts', CARD);
  write('data/Scarlet & Violet/Destined Rivals/006.ts', 'export default { name: compute() }');
  write('data/Pokémon TCG Pocket.ts', 'export default { id: "tcgp" }');
  write('data/Pokémon TCG Pocket/A1.ts', 'export default { id: "A1" }');
  write('data/Pokémon TCG Pocket/A1/001.ts', CARD);

  it('yields each card with its set, series and localId, and skips what it is told to', () => {
    const { cards, unreadable } = readDatabase(root, { skipSeries: (id) => id === 'tcgp' });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ serie: { id: 'sv' }, set: { id: 'sv10' }, localId: '005' });
    expect(unreadable).toEqual([expect.stringContaining('006.ts')]);
  });
});
