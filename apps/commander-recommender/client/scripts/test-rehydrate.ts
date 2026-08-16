/**
 * Tests for putting cited cards back together. Run with: npm test
 *
 * The API sends each cited card once and cites it by position; this layer is
 * what lets every component below it go on working with whole cards. If it is
 * wrong, the wrongness shows up as the wrong card's name under a commander —
 * which looks like a scoring bug and isn't.
 */
import assert from 'node:assert';
import { rehydrateRecommendations } from '../src/lib/rehydrate';
import type { SupportingCardDTO, WireRecommendResponse } from '../src/types';

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

function card(name: string): SupportingCardDTO {
  return {
    name,
    quantity: 1,
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

/** A response citing `cardIndex` positions from one suggestion. */
function wire(
  cardIndex: SupportingCardDTO[],
  cites: {
    theme?: number[];
    kindred?: number[];
    keyword?: number[];
    gameChangers?: number[];
  }
): WireRecommendResponse {
  return {
    totalParsed: 1,
    totalMatched: 1,
    ignoredCopies: 0,
    notFound: [],
    weakMatchesOnly: false,
    deck: { themes: [] },
    cardIndex,
    suggestions: [
      {
        unitId: 'unit',
        cards: [],
        colorIdentity: ['B'],
        score: 10,
        matchedThemes: [],
        matchedCreatureTypes: [],
        matchedKeywords: [],
        includedCardCount: 1,
        themeSupport: [
          { key: 'aristocrats', label: 'Aristocrats', description: '', cards: cites.theme ?? [] },
        ],
        kindredSupport: [{ type: 'Vampire', cards: cites.kindred ?? [] }],
        keywordSupport: [{ keyword: 'Flying', cards: cites.keyword ?? [] }],
        gameChangerCards: cites.gameChangers ?? [],
        gameChangerCount: 0,
        bracket: { label: 'Core', range: '1-3', note: '' },
      },
    ],
  };
}

const INDEX = [card('Blood Artist'), card('Viscera Seer'), card('Grave Pact')];

check('a cited position becomes the card at that position', () => {
  const result = rehydrateRecommendations(wire(INDEX, { theme: [2, 0] }));
  assert.deepStrictEqual(
    result.suggestions[0].themeSupport[0].cards.map((c) => c.name),
    ['Grave Pact', 'Blood Artist']
  );
});

check('citation order is preserved, not index order', () => {
  // The server cites in curve order; re-sorting here would silently undo it.
  const result = rehydrateRecommendations(wire(INDEX, { theme: [1, 2, 0] }));
  assert.deepStrictEqual(
    result.suggestions[0].themeSupport[0].cards.map((c) => c.name),
    ['Viscera Seer', 'Grave Pact', 'Blood Artist']
  );
});

check('every support block is resolved, not just themes', () => {
  const result = rehydrateRecommendations(
    wire(INDEX, { theme: [0], kindred: [1], keyword: [2], gameChangers: [0, 1] })
  );
  const s = result.suggestions[0];
  assert.strictEqual(s.kindredSupport[0].cards[0].name, 'Viscera Seer');
  assert.strictEqual(s.keywordSupport[0].cards[0].name, 'Grave Pact');
  assert.deepStrictEqual(
    s.gameChangerCards.map((c) => c.name),
    ['Blood Artist', 'Viscera Seer']
  );
});

check('one card cited by several blocks resolves in all of them', () => {
  // The entire reason the index exists — the duplication is the norm.
  const result = rehydrateRecommendations(
    wire(INDEX, { theme: [0], kindred: [0], keyword: [0] })
  );
  const s = result.suggestions[0];
  for (const name of [
    s.themeSupport[0].cards[0].name,
    s.kindredSupport[0].cards[0].name,
    s.keywordSupport[0].cards[0].name,
  ]) {
    assert.strictEqual(name, 'Blood Artist');
  }
});

check('an out-of-range position is dropped rather than rendered as undefined', () => {
  // Would mean the server contradicted itself. A missing row beats a crash
  // partway down a page of results.
  const result = rehydrateRecommendations(wire(INDEX, { theme: [0, 99] }));
  assert.deepStrictEqual(
    result.suggestions[0].themeSupport[0].cards.map((c) => c.name),
    ['Blood Artist']
  );
});

check('everything outside the citations is passed through untouched', () => {
  const input = wire(INDEX, { theme: [0] });
  const result = rehydrateRecommendations(input);
  assert.strictEqual(result.totalParsed, input.totalParsed);
  assert.strictEqual(result.weakMatchesOnly, input.weakMatchesOnly);
  assert.strictEqual(result.suggestions[0].score, 10);
  assert.strictEqual(result.suggestions[0].bracket.label, 'Core');
  // And the index itself does not leak into the rehydrated shape.
  assert.ok(!('cardIndex' in result));
});

check('an empty result set rehydrates to an empty result set', () => {
  const empty: WireRecommendResponse = {
    totalParsed: 0,
    totalMatched: 0,
    ignoredCopies: 0,
    notFound: [],
    weakMatchesOnly: false,
    deck: { themes: [] },
    cardIndex: [],
    suggestions: [],
  };
  assert.deepStrictEqual(rehydrateRecommendations(empty).suggestions, []);
});

if (failures > 0) {
  console.error(`\n${failures} rehydrate case(s) failed.`);
  process.exit(1);
}
console.log('\nAll rehydrate cases passed.');
