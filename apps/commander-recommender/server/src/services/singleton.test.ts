/**
 * Tests for applying Commander's singleton rule (903.5b) to a submitted
 * list — merging repeated lines and capping quantities. The rule itself
 * (`singletonLimit`) is tested in @mtg/rules.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import { applySingletonLimits } from './singleton';
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
