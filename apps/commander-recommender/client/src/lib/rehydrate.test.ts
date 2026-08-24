/**
 * Tests for putting cited cards back together.
 *
 * The API sends each cited card once and cites it by position; this layer is
 * what lets every component below it go on working with whole cards. If it is
 * wrong, the wrongness shows up as the wrong card's name under a commander —
 * which looks like a scoring bug and isn't.
 */
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { rehydrateRecommendations } from './rehydrate';
import type { SupportingCardDTO, WireRecommendResponse } from '../types';

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
  },
): WireRecommendResponse {
  return {
    totalParsed: 1,
    totalMatched: 1,
    ignoredCopies: 0,
    notFound: [],
    banned: [],
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
    alsoPlayable: [],
  };
}

/** Same shape as `wire`'s one suggestion, but as an alsoPlayable entry. */
function wireWithAlsoPlayable(
  cardIndex: SupportingCardDTO[],
  coverageReason: 'owned' | 'covers',
  coveredCards: number[],
): WireRecommendResponse {
  return {
    ...wire(cardIndex, {}),
    suggestions: [],
    alsoPlayable: [
      {
        unitId: 'unit',
        cards: [],
        colorIdentity: ['B'],
        score: 0,
        matchedThemes: [],
        matchedCreatureTypes: [],
        matchedKeywords: [],
        includedCardCount: 1,
        themeSupport: [],
        kindredSupport: [],
        keywordSupport: [],
        gameChangerCards: [],
        gameChangerCount: 0,
        bracket: { label: 'Core', range: '1-3', note: '' },
        coverageReason,
        coveredCards,
      },
    ],
  };
}

const INDEX = [card('Blood Artist'), card('Viscera Seer'), card('Grave Pact')];

describe('rehydrateRecommendations', () => {
  it('a cited position becomes the card at that position', () => {
    const result = rehydrateRecommendations(wire(INDEX, { theme: [2, 0] }));
    assert.deepStrictEqual(
      result.suggestions[0]!.themeSupport[0]!.cards.map((c) => c.name),
      ['Grave Pact', 'Blood Artist'],
    );
  });

  it('citation order is preserved, not index order', () => {
    // The server cites in curve order; re-sorting here would silently undo it.
    const result = rehydrateRecommendations(wire(INDEX, { theme: [1, 2, 0] }));
    assert.deepStrictEqual(
      result.suggestions[0]!.themeSupport[0]!.cards.map((c) => c.name),
      ['Viscera Seer', 'Grave Pact', 'Blood Artist'],
    );
  });

  it('every support block is resolved, not just themes', () => {
    const result = rehydrateRecommendations(
      wire(INDEX, { theme: [0], kindred: [1], keyword: [2], gameChangers: [0, 1] }),
    );
    const s = result.suggestions[0]!;
    assert.strictEqual(s.kindredSupport[0]!.cards[0]!.name, 'Viscera Seer');
    assert.strictEqual(s.keywordSupport[0]!.cards[0]!.name, 'Grave Pact');
    assert.deepStrictEqual(
      s.gameChangerCards.map((c) => c.name),
      ['Blood Artist', 'Viscera Seer'],
    );
  });

  it('one card cited by several blocks resolves in all of them', () => {
    // The entire reason the index exists — the duplication is the norm.
    const result = rehydrateRecommendations(
      wire(INDEX, { theme: [0], kindred: [0], keyword: [0] }),
    );
    const s = result.suggestions[0]!;
    for (const name of [
      s.themeSupport[0]!.cards[0]!.name,
      s.kindredSupport[0]!.cards[0]!.name,
      s.keywordSupport[0]!.cards[0]!.name,
    ]) {
      assert.strictEqual(name, 'Blood Artist');
    }
  });

  it('an out-of-range position is dropped rather than rendered as undefined', () => {
    // Would mean the server contradicted itself. A missing row beats a crash
    // partway down a page of results.
    const result = rehydrateRecommendations(wire(INDEX, { theme: [0, 99] }));
    assert.deepStrictEqual(
      result.suggestions[0]!.themeSupport[0]!.cards.map((c) => c.name),
      ['Blood Artist'],
    );
  });

  it('everything outside the citations is passed through untouched', () => {
    const input = wire(INDEX, { theme: [0] });
    const result = rehydrateRecommendations(input);
    assert.strictEqual(result.totalParsed, input.totalParsed);
    assert.strictEqual(result.weakMatchesOnly, input.weakMatchesOnly);
    assert.strictEqual(result.suggestions[0]!.score, 10);
    assert.strictEqual(result.suggestions[0]!.bracket.label, 'Core');
    // And the index itself does not leak into the rehydrated shape.
    assert.ok(!('cardIndex' in result));
  });

  it('an empty result set rehydrates to an empty result set', () => {
    const empty: WireRecommendResponse = {
      totalParsed: 0,
      totalMatched: 0,
      ignoredCopies: 0,
      notFound: [],
      banned: [],
      weakMatchesOnly: false,
      deck: { themes: [] },
      cardIndex: [],
      suggestions: [],
      alsoPlayable: [],
    };
    const result = rehydrateRecommendations(empty);
    assert.deepStrictEqual(result.suggestions, []);
    assert.deepStrictEqual(result.alsoPlayable, []);
  });

  it('alsoPlayable entries are rehydrated the same way suggestions are', () => {
    const result = rehydrateRecommendations(wireWithAlsoPlayable(INDEX, 'owned', []));
    assert.strictEqual(result.alsoPlayable.length, 1);
    assert.strictEqual(result.alsoPlayable[0]!.coverageReason, 'owned');
  });

  it('coveredCards resolves the same way any other citation does', () => {
    const result = rehydrateRecommendations(wireWithAlsoPlayable(INDEX, 'covers', [2, 0]));
    assert.deepStrictEqual(
      result.alsoPlayable[0]!.coveredCards.map((c) => c.name),
      ['Grave Pact', 'Blood Artist'],
    );
  });
});
