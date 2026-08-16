/**
 * Tests for the "Colors, name, mana value" sort mode: fewest colors first,
 * WUBRG order within a color count, then name, then mana value. Run with:
 * npm test
 */
import assert from 'node:assert';
import { sortSuggestions } from '../src/lib/sort';
import { makeCommanderCard, makeSuggestion } from './fixtures';

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

function unitName(suggestion: ReturnType<typeof makeSuggestion>): string {
  return suggestion.cards.map((c) => c.name).join(' + ');
}

check('relevance mode is a no-op that returns the same array reference', () => {
  const input = [makeSuggestion({ cards: [makeCommanderCard({ name: 'B' })] }), makeSuggestion({ cards: [makeCommanderCard({ name: 'A' })] })];
  const result = sortSuggestions(input, 'relevance');
  assert.strictEqual(result, input);
});

check('fewest colors sorts before more colors', () => {
  const mono = makeSuggestion({ cards: [makeCommanderCard({ name: 'Mono' })], colorIdentity: ['U'] });
  const two = makeSuggestion({ cards: [makeCommanderCard({ name: 'Two' })], colorIdentity: ['U', 'B'] });
  const three = makeSuggestion({ cards: [makeCommanderCard({ name: 'Three' })], colorIdentity: ['U', 'B', 'R'] });

  const sorted = sortSuggestions([three, mono, two], 'colorNameValue');
  assert.deepStrictEqual(sorted.map(unitName), ['Mono', 'Two', 'Three']);
});

check('same color count sorts by WUBRG order of the identity itself', () => {
  const monoGreen = makeSuggestion({ cards: [makeCommanderCard({ name: 'Green' })], colorIdentity: ['G'] });
  const monoWhite = makeSuggestion({ cards: [makeCommanderCard({ name: 'White' })], colorIdentity: ['W'] });
  const monoBlack = makeSuggestion({ cards: [makeCommanderCard({ name: 'Black' })], colorIdentity: ['B'] });

  const sorted = sortSuggestions([monoGreen, monoBlack, monoWhite], 'colorNameValue');
  assert.deepStrictEqual(sorted.map(unitName), ['White', 'Black', 'Green']);
});

check('two-color identities sort by WUBRG precedence of their first differing color', () => {
  // Orzhov (WB) before Dimir (UB) before Rakdos (BR): W < U < B in WUBRG.
  const orzhov = makeSuggestion({ cards: [makeCommanderCard({ name: 'Orzhov' })], colorIdentity: ['W', 'B'] });
  const dimir = makeSuggestion({ cards: [makeCommanderCard({ name: 'Dimir' })], colorIdentity: ['U', 'B'] });
  const rakdos = makeSuggestion({ cards: [makeCommanderCard({ name: 'Rakdos' })], colorIdentity: ['B', 'R'] });

  const sorted = sortSuggestions([rakdos, dimir, orzhov], 'colorNameValue');
  assert.deepStrictEqual(sorted.map(unitName), ['Orzhov', 'Dimir', 'Rakdos']);
});

check('same identity sorts alphabetically by name', () => {
  const zed = makeSuggestion({ cards: [makeCommanderCard({ name: 'Zedruu' })], colorIdentity: ['U'] });
  const anj = makeSuggestion({ cards: [makeCommanderCard({ name: 'Anje' })], colorIdentity: ['U'] });

  const sorted = sortSuggestions([zed, anj], 'colorNameValue');
  assert.deepStrictEqual(sorted.map(unitName), ['Anje', 'Zedruu']);
});

check('a Partner pair sorts by its joined display name', () => {
  const pair = makeSuggestion({
    cards: [makeCommanderCard({ name: 'Tymna the Weaver' }), makeCommanderCard({ name: 'Thrasios, Triton Hero' })],
    colorIdentity: ['U'],
  });
  const solo = makeSuggestion({ cards: [makeCommanderCard({ name: 'Zedruu' })], colorIdentity: ['U'] });

  const sorted = sortSuggestions([pair, solo], 'colorNameValue');
  assert.deepStrictEqual(sorted.map(unitName), ['Tymna the Weaver + Thrasios, Triton Hero', 'Zedruu']);
});

check('mana value only breaks ties once identity and name already match', () => {
  const cheap = makeSuggestion({
    cards: [makeCommanderCard({ name: 'Same Name', manaValue: 2 })],
    colorIdentity: ['U'],
  });
  const expensive = makeSuggestion({
    cards: [makeCommanderCard({ name: 'Same Name', manaValue: 5 })],
    colorIdentity: ['U'],
  });

  const sorted = sortSuggestions([expensive, cheap], 'colorNameValue');
  assert.deepStrictEqual(
    sorted.map((s) => s.cards[0].manaValue),
    [2, 5]
  );
});

check('a Partner pair breaks mana-value ties on its combined cost', () => {
  const cheapPair = makeSuggestion({
    cards: [
      makeCommanderCard({ name: 'Same Pair', manaValue: 1 }),
      makeCommanderCard({ name: 'Same Pair', manaValue: 1 }),
    ],
    colorIdentity: ['U'],
  });
  const expensivePair = makeSuggestion({
    cards: [
      makeCommanderCard({ name: 'Same Pair', manaValue: 3 }),
      makeCommanderCard({ name: 'Same Pair', manaValue: 3 }),
    ],
    colorIdentity: ['U'],
  });

  const sorted = sortSuggestions([expensivePair, cheapPair], 'colorNameValue');
  assert.strictEqual(sorted[0], cheapPair);
});

check('colorNameValue mode does not mutate the input array', () => {
  const input = [makeSuggestion({ cards: [makeCommanderCard({ name: 'B' })] }), makeSuggestion({ cards: [makeCommanderCard({ name: 'A' })] })];
  const original = [...input];
  sortSuggestions(input, 'colorNameValue');
  assert.deepStrictEqual(input, original);
});

// --- sort direction ---------------------------------------------------------

check('relevance defaults to descending — the server order, untouched', () => {
  const input = [
    makeSuggestion({ cards: [makeCommanderCard({ name: 'A' })] }),
    makeSuggestion({ cards: [makeCommanderCard({ name: 'B' })] }),
  ];
  // Same array reference back, since there is nothing to do — and 'desc' is
  // the default, so omitting it must behave identically.
  assert.strictEqual(sortSuggestions(input, 'relevance'), input);
  assert.strictEqual(sortSuggestions(input, 'relevance', 'desc'), input);
});

check('relevance ascending reverses the server order', () => {
  const a = makeSuggestion({ cards: [makeCommanderCard({ name: 'A' })] });
  const b = makeSuggestion({ cards: [makeCommanderCard({ name: 'B' })] });
  assert.deepStrictEqual(sortSuggestions([a, b], 'relevance', 'asc'), [b, a]);
});

check('colorNameValue descending reverses its natural order', () => {
  const first = makeSuggestion({ cards: [makeCommanderCard({ name: 'A' })], colorIdentity: ['W'] });
  const second = makeSuggestion({ cards: [makeCommanderCard({ name: 'B' })], colorIdentity: ['U'] });
  assert.deepStrictEqual(sortSuggestions([second, first], 'colorNameValue', 'asc'), [first, second]);
  assert.deepStrictEqual(sortSuggestions([second, first], 'colorNameValue', 'desc'), [second, first]);
});

check('reversing does not mutate the input array', () => {
  const input = [
    makeSuggestion({ cards: [makeCommanderCard({ name: 'A' })] }),
    makeSuggestion({ cards: [makeCommanderCard({ name: 'B' })] }),
  ];
  const original = [...input];
  sortSuggestions(input, 'relevance', 'asc');
  sortSuggestions(input, 'colorNameValue', 'desc');
  assert.deepStrictEqual(input, original);
});

if (failures > 0) {
  console.error(`\n${failures} sort cases failed.`);
  process.exit(1);
}
console.log('\nAll sort cases passed.');
