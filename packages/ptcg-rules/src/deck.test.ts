import { describe, expect, it } from 'vitest';
import { sharedPokemonTypes, validateDeck, type DeckEntry } from './deck';
import { createLegality, type Format } from './legality';
import { PENDING_QUOTE } from './official';
import { card, index } from './test/snapshot';

const legality = createLegality(index);
const deck = (...entries: [string, number][]): DeckEntry[] =>
  entries.map(([id, count]) => ({ card: card(id), count }));
const codes = (entries: DeckEntry[], format: Format) =>
  validateDeck(entries, format, legality).map((v) => v.code);

// Shroomish [G] has rotated out of Standard, so the Standard shell needs a
// Basic with a current mark.
const standardBasic = 'me01-001'; // Bulbasaur [I]

describe('validateDeck — official construction rules', () => {
  it('passes a 60-card Standard deck', () => {
    expect(card(standardBasic).stage).toBe('Basic');
    expect(codes(deck([standardBasic, 4], ['me01-131', 4], ['sve-001', 52]), 'standard')).toEqual(
      [],
    );
  });

  it('reports every broken rule at once', () => {
    const result = codes(deck(['me01-131', 5], ['sve-001', 50]), 'standard');
    expect(result).toEqual(['deck-size', 'no-basic-pokemon', 'copy-limit']);
  });

  it('counts copies by name across prints, and exempts basic Energy', () => {
    const entries = deck([standardBasic, 4], ['me01-131', 3], ['me02.5-213', 2], ['sve-001', 51]);
    const copy = validateDeck(entries, 'standard', legality).find((v) => v.code === 'copy-limit');
    expect(copy?.message).toBe('5 copies of Ultra Ball; the limit is 4.');
    expect(copy?.cardIds).toEqual(['me01-131', 'me02.5-213']);
  });

  it('flags cards outside the format', () => {
    const result = validateDeck(deck(['sv01-003', 4], ['sve-001', 56]), 'standard', legality);
    expect(result.find((v) => v.code === 'not-legal')?.cardIds).toEqual(['sv01-003']);
  });

  it('allows one ACE SPEC and one Radiant Pokémon, not two', () => {
    const two = deck(
      ['sv01-003', 4],
      ['sv08.5-116', 1],
      ['sv05-157', 1],
      ['swsh10-027', 1],
      ['swsh10-046', 1],
      ['sve-001', 52],
    );
    expect(codes(two, 'expanded')).toEqual(['ace-spec', 'radiant']);
    const one = deck(['sv01-003', 4], ['sv08.5-116', 1], ['swsh10-027', 1], ['sve-001', 54]);
    expect(codes(one, 'expanded')).toEqual([]);
  });

  it('allows only one copy of a Prism Star card by name', () => {
    expect(codes(deck(['sv01-003', 4], ['sm5-120', 2], ['sve-001', 54]), 'expanded')).toEqual([
      'prism-star',
    ]);
  });

  it('cites the official text, pending its quote', () => {
    const [v] = validateDeck(deck(['sve-001', 60]), 'unlimited', legality);
    expect(v?.citation.source).toMatch(/rulebook/);
    expect(v?.citation.quote).toBe(PENDING_QUOTE);
  });
});

describe('validateDeck — Gym Leader Challenge', () => {
  it('passes a singleton, single-type deck', () => {
    const singles = ['sv01-001', 'sv01-002', 'sv01-003'].map((id): [string, number] => [id, 1]);
    expect(codes(deck(...singles, ['sve-001', 57]), 'glc')).toEqual([]);
  });

  it('enforces singleton, but any number of basic Energy', () => {
    const v = validateDeck(deck(['sv01-003', 2], ['sve-001', 58]), 'glc', legality);
    expect(v.map((x) => x.code)).toEqual(['copy-limit']);
    expect(v[0]?.citation.quote).toBe(
      'Only one of each card with the same name allowed in a deck, except for Basic Energy.',
    );
  });

  it('bans Rule Box cards and ACE SPECs, citing the GLC text', () => {
    const v = validateDeck(
      deck(['sv01-003', 1], ['sv10-003', 1], ['sm5-120', 1], ['sv08.5-116', 1], ['sve-001', 56]),
      'glc',
      legality,
    );
    expect(v.map((x) => x.code)).toEqual(['glc-ace-spec', 'glc-rule-box']);
    expect(v[1]?.cardIds).toEqual(['sv10-003', 'sm5-120']);
  });

  it('needs every Pokémon to share a type; a dual-type card fits either', () => {
    const fireAndGrass = deck(['sv01-003', 1], ['sv01-030', 1], ['sve-001', 58]);
    expect(codes(fireAndGrass, 'glc')).toEqual(['glc-type']);
    // Volcarona is Fire/Grass, so it sits in a Grass deck…
    expect(sharedPokemonTypes(deck(['sv01-003', 1], ['xy11-15', 1]))).toEqual(['Grass']);
    // …but doesn't make Fire and Grass Basics compatible with each other.
    expect(sharedPokemonTypes(deck(['sv01-003', 1], ['sv01-030', 1], ['xy11-15', 1]))).toEqual([]);
  });

  it('applies to Pokémon only — Trainers and Energy have no type to match', () => {
    expect(sharedPokemonTypes(deck(['me01-131', 1], ['sve-001', 1]))).toEqual([]);
  });
});
