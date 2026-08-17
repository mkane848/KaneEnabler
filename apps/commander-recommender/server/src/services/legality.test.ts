import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import type { ParsedListEntry } from './parseList';
import { isCommanderLegal, partitionSubmittedCards } from './legality';

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
    oracle_text: null,
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

function entry(name: string, quantity = 1): ParsedListEntry {
  return { name, quantity, raw: name };
}

describe('isCommanderLegal', () => {
  it('is true only for legality_commander === "legal"', () => {
    assert.strictEqual(isCommanderLegal(makeCard({ legality_commander: 'legal' })), true);
    assert.strictEqual(isCommanderLegal(makeCard({ legality_commander: 'banned' })), false);
    assert.strictEqual(isCommanderLegal(makeCard({ legality_commander: 'not_legal' })), false);
    assert.strictEqual(isCommanderLegal(makeCard({ legality_commander: 'restricted' })), false);
  });
});

describe('partitionSubmittedCards', () => {
  it('a banned card is reported separately, not counted as submitted', () => {
    const griselbrand = makeCard({ name: 'Griselbrand', legality_commander: 'banned' });
    const solRing = makeCard({ name: 'Sol Ring', legality_commander: 'legal' });
    const nameMap = new Map([
      [griselbrand.name_lower, griselbrand],
      [solRing.name_lower, solRing],
    ]);

    const result = partitionSubmittedCards([entry('Griselbrand'), entry('Sol Ring')], nameMap);

    assert.deepStrictEqual(result.banned, ['Griselbrand']);
    assert.deepStrictEqual(result.notFound, []);
    assert.strictEqual(result.submitted.length, 1);
    assert.strictEqual(result.submitted[0]?.row.name, 'Sol Ring');
  });

  it('a name with no matching row is notFound, not banned', () => {
    const result = partitionSubmittedCards([entry('Not A Real Card')], new Map());
    assert.deepStrictEqual(result.notFound, ['Not A Real Card']);
    assert.deepStrictEqual(result.banned, []);
    assert.deepStrictEqual(result.submitted, []);
  });

  it('a legal card carries its quantity through to submitted', () => {
    const card = makeCard({ name: 'Forest' });
    const nameMap = new Map([[card.name_lower, card]]);
    const result = partitionSubmittedCards([entry('Forest', 12)], nameMap);
    assert.strictEqual(result.submitted[0]?.quantity, 12);
  });
});
