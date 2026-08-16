/**
 * Tests for Commander's singleton rule (903.5b) as applied to a submitted
 * list.
 */
import assert from 'node:assert';
import { describe, it, vi } from 'vitest';
import type { CardRow } from '../types';
import { applySingletonLimits, singletonLimit } from './singleton';
import type { OwnedCard } from './synergy';

let counter = 0;
function makeCard(overrides: Partial<CardRow> = {}): CardRow {
  const name = overrides.name ?? `Test Card ${counter++}`;
  return {
    oracle_id: overrides.oracle_id ?? name,
    name,
    name_lower: name.toLowerCase(),
    mana_cost: null,
    cmc: 0,
    type_line: 'Creature — Human',
    oracle_text: '',
    colors: '[]',
    color_identity: '[]',
    keywords: '[]',
    creature_types: '[]',
    power: '1',
    toughness: '1',
    scryfall_uri: null,
    partner_ability: null,
    partner_target: null,
    is_background: 0,
    legality_commander: 'legal',
    game_changer: 0,
    is_legendary: 0,
    is_commander_eligible: 0,
    image_uri: null,
    back_image_uri: null,
    back_name: null,
    ...overrides,
  };
}

function owned(row: CardRow, quantity = 1): OwnedCard {
  return { row, quantity };
}

describe('singletonLimit', () => {
  it('an ordinary card is limited to a single copy', () => {
    assert.strictEqual(singletonLimit(makeCard({ name: 'Sol Ring', type_line: 'Artifact' })), 1);
  });

  it('basic lands are unlimited', () => {
    assert.strictEqual(
      singletonLimit(makeCard({ name: 'Swamp', type_line: 'Basic Land — Swamp' })),
      Infinity,
    );
  });

  it('snow basics and Wastes are unlimited too', () => {
    // Exempted by supertype, so neither needs naming individually.
    assert.strictEqual(
      singletonLimit(
        makeCard({ name: 'Snow-Covered Forest', type_line: 'Basic Snow Land — Forest' }),
      ),
      Infinity,
    );
    assert.strictEqual(
      singletonLimit(makeCard({ name: 'Wastes', type_line: 'Basic Land' })),
      Infinity,
    );
  });

  it('a nonbasic land sharing a basic land type is still singleton', () => {
    // "Land — Forest" (e.g. a dual) is not a *basic* Forest.
    assert.strictEqual(
      singletonLimit(makeCard({ name: 'Bayou', type_line: 'Land — Swamp Forest' })),
      1,
    );
  });

  it('"any number" cards are unlimited', () => {
    const rats = makeCard({
      name: 'Relentless Rats',
      oracle_text: 'A deck can have any number of cards named Relentless Rats.',
    });
    assert.strictEqual(singletonLimit(rats), Infinity);
  });

  it('"up to N" cards are limited to N', () => {
    const dwarves = makeCard({
      name: 'Seven Dwarves',
      oracle_text: 'A deck can have up to seven cards named Seven Dwarves.',
    });
    assert.strictEqual(singletonLimit(dwarves), 7);
    const nazgul = makeCard({
      name: 'Nazgûl',
      oracle_text: 'A deck can have up to nine cards named Nazgûl.',
    });
    assert.strictEqual(singletonLimit(nazgul), 9);
  });

  it('"up to N" with a digit instead of a spelled-out word still resolves to N', () => {
    // Both real "up to N" cards (Seven Dwarves, Nazgûl) spell the number out
    // today, but nothing about the rule requires that — a future card is
    // free to print a digit instead.
    const card = makeCard({
      name: 'Hypothetical Card',
      oracle_text: 'A deck can have up to 7 cards named Hypothetical Card.',
    });
    assert.strictEqual(singletonLimit(card), 7);
  });

  it('a digit above twelve resolves to N instead of silently falling back to 1', () => {
    // NUMBER_WORDS tops out at twelve; a digit must not depend on it.
    const card = makeCard({
      name: 'Hypothetical Card',
      oracle_text: 'A deck can have up to 15 cards named Hypothetical Card.',
    });
    assert.strictEqual(singletonLimit(card), 15);
  });

  it('a value that is neither a digit nor a known word still falls back to 1, but warns instead of failing silently', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const card = makeCard({
      name: 'Hypothetical Card',
      oracle_text: 'A deck can have up to lots cards named Hypothetical Card.',
    });
    assert.strictEqual(singletonLimit(card), 1);
    assert.strictEqual(warnSpy.mock.calls.length, 1);
    warnSpy.mockRestore();
  });
});

describe('applySingletonLimits', () => {
  it('extra copies of an ordinary card are dropped', () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact' });
    const result = applySingletonLimits([owned(solRing, 4)]);
    assert.strictEqual(result.owned.length, 1);
    assert.strictEqual(result.owned[0]!.quantity, 1);
    assert.strictEqual(result.ignoredCopies, 3);
  });

  it('basic lands keep every copy', () => {
    const swamp = makeCard({ name: 'Swamp', type_line: 'Basic Land — Swamp' });
    const result = applySingletonLimits([owned(swamp, 12)]);
    assert.strictEqual(result.owned[0]!.quantity, 12);
    assert.strictEqual(result.ignoredCopies, 0);
  });

  it('an "up to N" card keeps N copies and drops the rest', () => {
    const dwarves = makeCard({
      name: 'Seven Dwarves',
      oracle_text: 'A deck can have up to seven cards named Seven Dwarves.',
    });
    const result = applySingletonLimits([owned(dwarves, 10)]);
    assert.strictEqual(result.owned[0]!.quantity, 7);
    assert.strictEqual(result.ignoredCopies, 3);
  });

  it('the same card on several lines is merged, then limited', () => {
    // The list parser does not combine repeated lines, so this is the shape a
    // real paste produces when a card appears in two sections.
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact' });
    const result = applySingletonLimits([owned(solRing, 1), owned(solRing, 1), owned(solRing, 1)]);
    assert.strictEqual(result.owned.length, 1);
    assert.strictEqual(result.owned[0]!.quantity, 1);
    assert.strictEqual(result.ignoredCopies, 2);
  });

  it('merging repeats does not let one card pose as several distinct cards', () => {
    // The signal threshold counts distinct cards, so three lines of one card
    // must collapse to one entry rather than reading as three supporters.
    const seer = makeCard({ name: 'Viscera Seer', oracle_text: 'Sacrifice a creature: scry 1.' });
    const result = applySingletonLimits([owned(seer), owned(seer), owned(seer)]);
    assert.strictEqual(result.owned.length, 1);
  });

  it('distinct cards are all kept', () => {
    const a = makeCard({ name: 'Card A' });
    const b = makeCard({ name: 'Card B' });
    const result = applySingletonLimits([owned(a), owned(b)]);
    assert.strictEqual(result.owned.length, 2);
    assert.strictEqual(result.ignoredCopies, 0);
  });

  it("the caller's entries are not mutated", () => {
    const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact' });
    const input = [owned(solRing, 4)];
    applySingletonLimits(input);
    assert.strictEqual(input[0]!.quantity, 4);
  });
});
