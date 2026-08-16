/**
 * Tests for the cited-card index. Run with: npm test
 *
 * The whole point of this is that a card cited under fifty commanders is
 * serialized once, so the cases below are about identity and stability.
 */
import assert from 'node:assert';
import { createCardIndex } from '../src/services/cardIndex';
import type { SupportingCard } from '../src/services/synergy';

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

function card(name: string, quantity = 1): SupportingCard {
  return {
    name,
    quantity,
    typeLine: 'Creature — Human',
    isGameChanger: false,
    manaValue: 2,
    manaCost: '{1}{B}',
    imageUri: null,
    backImageUri: null,
    backName: null,
    scryfallUri: null,
  };
}

check('the same card cited twice is stored once', () => {
  const index = createCardIndex();
  const first = index.indexOf(card('Blood Artist'));
  const second = index.indexOf(card('Blood Artist'));
  assert.strictEqual(first, second);
  assert.strictEqual(index.cards.length, 1);
});

check('different cards get different positions', () => {
  const index = createCardIndex();
  assert.strictEqual(index.indexOf(card('Blood Artist')), 0);
  assert.strictEqual(index.indexOf(card('Viscera Seer')), 1);
  assert.strictEqual(index.cards.length, 2);
});

check('positions resolve back to the card that was cited', () => {
  // The property the client depends on: index.cards[indexOf(c)] is c.
  const index = createCardIndex();
  const names = ['Blood Artist', 'Viscera Seer', 'Grave Pact'];
  const positions = names.map((name) => index.indexOf(card(name)));
  assert.deepStrictEqual(
    positions.map((position) => index.cards[position].name),
    names
  );
});

check('a card citation keeps the quantity from the list', () => {
  // Quantity comes from the uploaded list, not the commander, so every
  // citation of a card carries the same one and storing it once is safe.
  const index = createCardIndex();
  index.indexOf(card('Swamp', 9));
  assert.strictEqual(index.cards[0].quantity, 9);
});

check('positions are stable as more cards are added', () => {
  // Suggestions are serialized in order and cite as they go, so an earlier
  // position must never shift when a later card appears.
  const index = createCardIndex();
  const first = index.indexOf(card('Blood Artist'));
  for (let i = 0; i < 20; i++) index.indexOf(card(`Filler ${i}`));
  assert.strictEqual(index.indexOf(card('Blood Artist')), first);
  assert.strictEqual(index.cards[first].name, 'Blood Artist');
});

check('an index nothing was cited into is empty, not undefined', () => {
  assert.deepStrictEqual(createCardIndex().cards, []);
});

if (failures > 0) {
  console.error(`\n${failures} card-index case(s) failed.`);
  process.exit(1);
}
console.log('\nAll card-index cases passed.');
