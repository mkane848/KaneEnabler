import { describe, expect, it } from 'vitest';
import { parseManaCost, toPip } from './symbols';

describe('parseManaCost', () => {
  it('splits a cost into its bracketed symbols', () => {
    expect(parseManaCost('{2}{W/U}{R}')).toEqual(['2', 'W/U', 'R']);
  });

  it('returns an empty array for no cost', () => {
    expect(parseManaCost(undefined)).toEqual([]);
    expect(parseManaCost('')).toEqual([]);
  });

  it('a cost with one symbol', () => {
    expect(parseManaCost('{G}')).toEqual(['G']);
  });
});

describe('toPip', () => {
  it('an ordinary color symbol is one glyph face on its own disc', () => {
    const pip = toPip('W');
    expect(pip.faces).toEqual([{ glyph: 'w' }]);
    expect(pip.colors).toEqual(['w']);
    expect(pip.label).toBe('white mana');
  });

  it('a generic number has no glyph — text on the neutral disc', () => {
    const pip = toPip('2');
    expect(pip.faces).toEqual([{ text: '2' }]);
    expect(pip.colors).toEqual(['generic']);
    expect(pip.label).toBe('2 generic mana');
  });

  it('a hybrid symbol is two faces, each on its own color', () => {
    const pip = toPip('W/U');
    expect(pip.faces).toEqual([{ glyph: 'w' }, { glyph: 'u' }]);
    expect(pip.colors).toEqual(['w', 'u']);
    expect(pip.label).toBe('white mana or blue mana');
  });

  it('Phyrexian mana is one glyph on that color, not a two-way split', () => {
    // {W/P} reads like a slash pair but draws as a single Phyrexian glyph on
    // white's disc — checked before the general hybrid case for that reason.
    const pip = toPip('W/P');
    expect(pip.faces).toEqual([{ glyph: 'p' }]);
    expect(pip.colors).toEqual(['w']);
    expect(pip.label).toBe('Phyrexian white mana');
  });

  it('a hybrid Phyrexian pairing still resolves each half independently', () => {
    const pip = toPip('2/W');
    expect(pip.faces).toEqual([{ text: '2' }, { glyph: 'w' }]);
    expect(pip.colors).toEqual(['generic', 'w']);
  });

  it('snow mana has its own glyph and color', () => {
    const pip = toPip('S');
    expect(pip.faces).toEqual([{ glyph: 's' }]);
    expect(pip.colors).toEqual(['s']);
    expect(pip.label).toBe('snow mana');
  });

  it('an unrecognized symbol falls back to text on the neutral disc', () => {
    const pip = toPip('X');
    expect(pip.faces).toEqual([{ text: 'X' }]);
    expect(pip.colors).toEqual(['generic']);
  });

  it('color-key matching is case-insensitive', () => {
    expect(toPip('w')).toEqual(toPip('W'));
  });
});
