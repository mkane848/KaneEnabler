import { describe, expect, it } from 'vitest';
import glc from './data/glc.json';
import { BAN_ID_FIXES, createLegality } from './legality';
import { card, hasCard, index } from './test/snapshot';

const legality = createLegality(index);
const legal = (id: string, format: Parameters<typeof legality.isLegal>[1]) =>
  legality.isLegal(card(id), format);

describe('Standard (TCGdex filter: regulation marks)', () => {
  it('follows the vendored regulation marks, not a hard-coded rotation', () => {
    expect(index.legality.standard.includes.regulationMarks).toEqual(['H', 'I', 'J']);
    expect(legal('me01-131', 'standard')).toBe(true); // Ultra Ball [I]
    expect(legal('sv01-003', 'standard')).toBe(false); // Shroomish [G]
    expect(legal('bw5-102', 'standard')).toBe(false); // Ultra Ball, Black & White print
  });

  it('allows basic Energy, which carries no regulation mark', () => {
    expect(card('sve-001').regulationMark).toBeUndefined();
    expect(legal('sve-001', 'standard')).toBe(true);
  });
});

describe('Expanded (TCGdex filter: series minus bans)', () => {
  it('allows Black & White onward and nothing earlier', () => {
    expect(legal('bw5-102', 'expanded')).toBe(true);
    expect(legal('sv01-003', 'expanded')).toBe(true);
    expect(legal('base1-1', 'expanded')).toBe(false);
  });

  it('applies the ban list, including the id TCGdex misspells', () => {
    expect(legal('bw3-67', 'expanded')).toBe(false); // Archeops
    expect(legal('sm3.5-45', 'expanded')).toBe(false); // Marshadow, listed as sm35-45
  });

  it('every ban id names a real card once fixed, and every fix is still needed', () => {
    for (const id of index.legality.expanded.excludes.cards) {
      expect(hasCard(BAN_ID_FIXES[id] ?? id), id).toBe(true);
    }
    for (const [raw, fixed] of Object.entries(BAN_ID_FIXES)) {
      expect(hasCard(raw), `${raw} exists now; drop the fix`).toBe(false);
      expect(hasCard(fixed)).toBe(true);
    }
  });
});

describe('Gym Leader Challenge (its own pool and ban list)', () => {
  it('allows Black & White onward', () => {
    expect(legal('bw5-102', 'glc')).toBe(true);
    expect(legal('base1-1', 'glc')).toBe(false);
  });

  it('applies its ban list by print, and Double Colorless Energy by name', () => {
    expect(legal('sm7-133', 'glc')).toBe(false); // Hiker
    expect(legal('sma-SV85', 'glc')).toBe(false); // Hiker, Shiny Vault
    expect(legal('xy1-130', 'glc')).toBe(false); // Double Colorless Energy, a print not listed
    expect(legal('swsh4-50', 'glc')).toBe(false); // Raikou (Vivid Voltage)
  });

  it('allows only Reshiram and Zekrom from Celebrations Classic Collection', () => {
    expect(legal('cel25cc-CC020', 'glc')).toBe(true); // Reshiram
    expect(legal('cel25cc-CC021', 'glc')).toBe(true); // Zekrom
    expect(legal('cel25cc-CC002', 'glc')).toBe(false); // Charizard
  });

  it('every ban-list id names the printed card', () => {
    for (const entry of glc.banList) {
      const printedName = entry.printed.split(' (')[0]!.replace('’', "'"); // split always yields one part
      for (const id of entry.ids) expect(card(id).name, entry.printed).toBe(printedName);
    }
  });
});

describe('Unlimited', () => {
  it('allows everything', () => {
    expect(legal('base1-1', 'unlimited')).toBe(true);
    expect(legal('bw3-67', 'unlimited')).toBe(true);
  });
});

describe('seriesFor', () => {
  it('names only the series a format can draw from', () => {
    expect(legality.seriesFor('standard', index.series)).toEqual(['me', 'sv']);
    expect(legality.seriesFor('expanded', index.series).sort()).toEqual(
      ['bw', 'me', 'sm', 'sv', 'swsh', 'xy'].sort(),
    );
    expect(legality.seriesFor('glc', index.series).sort()).toEqual(
      ['bw', 'me', 'sm', 'sv', 'swsh', 'xy'].sort(),
    );
    expect(legality.seriesFor('unlimited', index.series)).toHaveLength(index.series.length);
  });
});
