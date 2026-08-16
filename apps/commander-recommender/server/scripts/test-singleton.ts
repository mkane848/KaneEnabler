/**
 * Tests for Commander's singleton rule (903.5b) as applied to a submitted
 * list. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import { applySingletonLimits, singletonLimit } from '../src/services/singleton';
import type { OwnedCard } from '../src/services/synergy';

let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

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

// --- singletonLimit --------------------------------------------------------

check('an ordinary card is limited to a single copy', () => {
  assert.strictEqual(singletonLimit(makeCard({ name: 'Sol Ring', type_line: 'Artifact' })), 1);
});

check('basic lands are unlimited', () => {
  assert.strictEqual(singletonLimit(makeCard({ name: 'Swamp', type_line: 'Basic Land — Swamp' })), Infinity);
});

check('snow basics and Wastes are unlimited too', () => {
  // Exempted by supertype, so neither needs naming individually.
  assert.strictEqual(
    singletonLimit(makeCard({ name: 'Snow-Covered Forest', type_line: 'Basic Snow Land — Forest' })),
    Infinity
  );
  assert.strictEqual(singletonLimit(makeCard({ name: 'Wastes', type_line: 'Basic Land' })), Infinity);
});

check('a nonbasic land sharing a basic land type is still singleton', () => {
  // "Land — Forest" (e.g. a dual) is not a *basic* Forest.
  assert.strictEqual(singletonLimit(makeCard({ name: 'Bayou', type_line: 'Land — Swamp Forest' })), 1);
});

check('"any number" cards are unlimited', () => {
  const rats = makeCard({
    name: 'Relentless Rats',
    oracle_text: 'A deck can have any number of cards named Relentless Rats.',
  });
  assert.strictEqual(singletonLimit(rats), Infinity);
});

check('"up to N" cards are limited to N', () => {
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

// --- applySingletonLimits --------------------------------------------------

check('extra copies of an ordinary card are dropped', () => {
  const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact' });
  const result = applySingletonLimits([owned(solRing, 4)]);
  assert.strictEqual(result.owned.length, 1);
  assert.strictEqual(result.owned[0].quantity, 1);
  assert.strictEqual(result.ignoredCopies, 3);
});

check('basic lands keep every copy', () => {
  const swamp = makeCard({ name: 'Swamp', type_line: 'Basic Land — Swamp' });
  const result = applySingletonLimits([owned(swamp, 12)]);
  assert.strictEqual(result.owned[0].quantity, 12);
  assert.strictEqual(result.ignoredCopies, 0);
});

check('an "up to N" card keeps N copies and drops the rest', () => {
  const dwarves = makeCard({
    name: 'Seven Dwarves',
    oracle_text: 'A deck can have up to seven cards named Seven Dwarves.',
  });
  const result = applySingletonLimits([owned(dwarves, 10)]);
  assert.strictEqual(result.owned[0].quantity, 7);
  assert.strictEqual(result.ignoredCopies, 3);
});

check('the same card on several lines is merged, then limited', () => {
  // The list parser does not combine repeated lines, so this is the shape a
  // real paste produces when a card appears in two sections.
  const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact' });
  const result = applySingletonLimits([owned(solRing, 1), owned(solRing, 1), owned(solRing, 1)]);
  assert.strictEqual(result.owned.length, 1);
  assert.strictEqual(result.owned[0].quantity, 1);
  assert.strictEqual(result.ignoredCopies, 2);
});

check('merging repeats does not let one card pose as several distinct cards', () => {
  // The signal threshold counts distinct cards, so three lines of one card
  // must collapse to one entry rather than reading as three supporters.
  const seer = makeCard({ name: 'Viscera Seer', oracle_text: 'Sacrifice a creature: scry 1.' });
  const result = applySingletonLimits([owned(seer), owned(seer), owned(seer)]);
  assert.strictEqual(result.owned.length, 1);
});

check('distinct cards are all kept', () => {
  const a = makeCard({ name: 'Card A' });
  const b = makeCard({ name: 'Card B' });
  const result = applySingletonLimits([owned(a), owned(b)]);
  assert.strictEqual(result.owned.length, 2);
  assert.strictEqual(result.ignoredCopies, 0);
});

check('the caller\'s entries are not mutated', () => {
  const solRing = makeCard({ name: 'Sol Ring', type_line: 'Artifact' });
  const input = [owned(solRing, 4)];
  applySingletonLimits(input);
  assert.strictEqual(input[0].quantity, 4);
});

if (failures > 0) {
  console.error(`\n${failures} singleton case(s) failed.`);
  process.exit(1);
}
console.log('\nAll singleton cases passed.');
