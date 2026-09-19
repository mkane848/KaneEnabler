import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { CardRow } from '../types';
import type { ParsedListEntry } from './parseList';
import { validateDeck } from './deckValidation';

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
    is_changeling: 0,
    image_uri: null,
    back_image_uri: null,
    back_name: null,
    ...overrides,
  };
}

function entry(name: string, quantity = 1): ParsedListEntry {
  return { name, quantity, raw: name };
}

function nameMapOf(cards: CardRow[]): Map<string, CardRow> {
  return new Map(cards.map((c) => [c.name_lower, c]));
}

function eligibleCommander(overrides: Partial<CardRow> = {}): CardRow {
  return makeCard({ is_legendary: 1, is_commander_eligible: 1, ...overrides });
}

/** The quantity filler every deck-sized test needs. A real basic land, so
 * singletonLimit exempts it — makeCard's default creature type line would
 * (correctly) flag 99 copies as a singleton violation. */
function basicLand(
  name: 'Plains' | 'Island' | 'Wastes',
  overrides: Partial<CardRow> = {},
): CardRow {
  return makeCard({ name, type_line: `Basic Land — ${name}`, color_identity: '[]', ...overrides });
}

describe('validateDeck — deck size (903.5a)', () => {
  it('exactly 100 cards with a legal commander is valid', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["W"]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Plains', 99)],
      nameMapOf([commander, basicLand('Plains', { color_identity: '["W"]' })]),
      [commander],
      [],
    );

    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.deckSize.total, 100);
    assert.strictEqual(result.deckSize.isValid, true);
  });

  it('99 cards is invalid — CR 903.5a sets both the minimum and the maximum at 100', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["W"]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Plains', 97)],
      nameMapOf([commander, basicLand('Plains', { color_identity: '["W"]' })]),
      [commander],
      [],
    );

    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.deckSize.total, 98);
    assert.strictEqual(result.deckSize.isValid, false);
  });

  it('a banned card still occupies a deck slot in the count', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["W"]' });
    const banned = makeCard({ name: 'Banned Card', legality_commander: 'banned' });

    // 99 legal + 1 banned pasted = a 100-card deck. The count must read 100 —
    // the fix here is "swap the banned card", and a count of 99 would tell the
    // player to add one instead. Regression for the auditor's plan, which only
    // summed `submitted`.
    const result = validateDeck(
      [entry('Test Commander'), entry('Plains', 98), entry('Banned Card')],
      nameMapOf([commander, basicLand('Plains', { color_identity: '["W"]' }), banned]),
      [commander],
      [],
    );

    assert.strictEqual(result.deckSize.total, 100);
    assert.strictEqual(result.deckSize.isValid, true);
    assert.deepStrictEqual(result.legality.banned, ['Banned Card']);
    assert.strictEqual(result.isValid, false);
  });

  it('an unparseable card still occupies a deck slot in the count', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["W"]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Plains', 97), entry('Not A Real Card', 2)],
      nameMapOf([commander, basicLand('Plains', { color_identity: '["W"]' })]),
      [commander],
      [],
    );

    assert.strictEqual(result.deckSize.total, 100);
    assert.deepStrictEqual(result.legality.notFound, ['Not A Real Card']);
    assert.strictEqual(result.isValid, false);
  });
});

describe('validateDeck — color identity (903.4)', () => {
  it('decodes the JSON-string color_identity column before checking (parseJsonArray)', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["U"]' });
    // The stored column is a JSON string, not an array. Passing it straight to
    // @mtg/rules would iterate its characters instead of its colors.
    const offIdentity = makeCard({ name: 'Illegal Card', color_identity: '["U","W"]' });
    const plainsCount = 97;

    const result = validateDeck(
      [entry('Test Commander'), entry('Illegal Card'), entry('Island', plainsCount)],
      nameMapOf([commander, offIdentity, basicLand('Island', { color_identity: '["U"]' })]),
      [commander],
      [],
    );

    assert.strictEqual(result.isValid, false);
    assert.deepStrictEqual(result.colorIdentity.violations, [
      { name: 'Illegal Card', color_identity: ['U', 'W'], quantity: 1 },
    ]);
  });

  it('a colorless deck is vacuously within any identity', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["W"]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Wastes', 99)],
      nameMapOf([commander, basicLand('Wastes')]),
      [commander],
      [],
    );

    assert.strictEqual(result.colorIdentity.violations.length, 0);
    assert.strictEqual(result.isValid, true);
  });
});

describe('validateDeck — commander unit legality (903.3 / 702.124)', () => {
  it('a card that is not commander-eligible cannot be named commander', () => {
    const notEligible = makeCard({ name: 'Sol Ring', color_identity: '[]' });

    const result = validateDeck(
      [entry('Plains', 99)],
      nameMapOf([notEligible, basicLand('Plains', { color_identity: '["U"]' })]),
      [notEligible],
      [],
    );

    assert.strictEqual(result.commander.eligible, false);
    assert.strictEqual(result.commander.pairingLegal, false);
    assert.strictEqual(result.isValid, false);
  });

  it('a legal Partner pair is one commander unit with the union identity (702.124e)', () => {
    const a = eligibleCommander({
      name: 'Partner A',
      color_identity: '["W"]',
      partner_ability: 'partner',
      creature_types: '["Creature"]',
    });
    const b = eligibleCommander({
      name: 'Partner B',
      color_identity: '["U"]',
      partner_ability: 'partner',
      creature_types: '["Creature"]',
    });

    const result = validateDeck(
      [entry('Partner A'), entry('Partner B'), entry('Plains', 98)],
      nameMapOf([a, b, basicLand('Plains', { color_identity: '["U"]' })]),
      [a, b],
      [],
    );

    assert.strictEqual(result.commander.eligible, true);
    assert.strictEqual(result.commander.pairingLegal, true);
    assert.deepStrictEqual(new Set(result.commander.colorIdentity), new Set(['W', 'U']));
    assert.strictEqual(result.isValid, true);
  });

  it('two legendary cards without a pairing ability are not a legal unit', () => {
    const a = eligibleCommander({ name: 'Legend A', color_identity: '["W"]' });
    const b = eligibleCommander({ name: 'Legend B', color_identity: '["U"]' });

    const result = validateDeck(
      [entry('Legend A'), entry('Legend B'), entry('Plains', 98)],
      nameMapOf([a, b, basicLand('Plains', { color_identity: '["U"]' })]),
      [a, b],
      [],
    );

    assert.strictEqual(result.commander.pairingLegal, false);
    assert.strictEqual(result.isValid, false);
  });

  it('a Background companion needs the legal Background to pair', () => {
    const chooser = eligibleCommander({
      name: 'Commander with Background',
      color_identity: '["W"]',
      partner_ability: 'choose_background',
      creature_types: '["Creature"]',
    });
    const background = makeCard({
      name: 'A Legal Background',
      color_identity: '["W"]',
      partner_ability: null,
      is_background: 1,
    });

    const result = validateDeck(
      [entry('Commander with Background'), entry('Plains', 99)],
      nameMapOf([chooser, basicLand('Plains', { color_identity: '["W"]' })]),
      [chooser],
      [background],
    );

    assert.strictEqual(result.commander.pairingLegal, true);
    assert.strictEqual(result.isValid, true);
  });
});

describe('validateDeck — singleton (903.5b)', () => {
  it('two copies of a nonbasic card are a violation even when the deck is otherwise legal', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '[]' });
    const solRing = makeCard({ name: 'Sol Ring', color_identity: '[]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Sol Ring', 2), entry('Wastes', 97)],
      nameMapOf([commander, solRing, basicLand('Wastes')]),
      [commander],
      [],
    );

    assert.strictEqual(result.deckSize.total, 100);
    assert.deepStrictEqual(result.singleton.violations, [
      { name: 'Sol Ring', quantity: 2, limit: 1 },
    ]);
    assert.strictEqual(result.isValid, false);
  });

  it('duplicate lines naming the same card sum toward the limit', () => {
    // parseCardList does not merge repeated lines — two "1 Sol Ring" rows are
    // two entries for one card, and the format counts cards, not lines.
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '[]' });
    const solRing = makeCard({ name: 'Sol Ring', color_identity: '[]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Sol Ring'), entry('Sol Ring'), entry('Wastes', 98)],
      nameMapOf([commander, solRing, basicLand('Wastes')]),
      [commander],
      [],
    );

    assert.deepStrictEqual(result.singleton.violations, [
      { name: 'Sol Ring', quantity: 2, limit: 1 },
    ]);
    assert.strictEqual(result.isValid, false);
  });

  it('basic lands are exempt', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '[]' });

    const result = validateDeck(
      [entry('Test Commander'), entry('Wastes', 99)],
      nameMapOf([commander, basicLand('Wastes')]),
      [commander],
      [],
    );

    assert.deepStrictEqual(result.singleton.violations, []);
    assert.strictEqual(result.isValid, true);
  });

  it('a card that grants "any number" is exempt', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["B"]' });
    const rats = makeCard({
      name: 'Relentless Rats',
      color_identity: '["B"]',
      oracle_text: 'A deck can have any number of cards named Relentless Rats.',
    });

    const result = validateDeck(
      [entry('Test Commander'), entry('Relentless Rats', 99)],
      nameMapOf([commander, rats]),
      [commander],
      [],
    );

    assert.deepStrictEqual(result.singleton.violations, []);
    assert.strictEqual(result.isValid, true);
  });

  it('an "up to N" card allows N copies and no more', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '["R"]' });
    const dwarves = makeCard({
      name: 'Seven Dwarves',
      color_identity: '["R"]',
      oracle_text: 'A deck can have up to seven cards named Seven Dwarves.',
    });
    const nameMap = nameMapOf([commander, dwarves, basicLand('Wastes')]);

    const legal = validateDeck(
      [entry('Test Commander'), entry('Seven Dwarves', 7), entry('Wastes', 92)],
      nameMap,
      [commander],
      [],
    );
    assert.deepStrictEqual(legal.singleton.violations, []);
    assert.strictEqual(legal.isValid, true);

    const illegal = validateDeck(
      [entry('Test Commander'), entry('Seven Dwarves', 8), entry('Wastes', 91)],
      nameMap,
      [commander],
      [],
    );
    assert.deepStrictEqual(illegal.singleton.violations, [
      { name: 'Seven Dwarves', quantity: 8, limit: 7 },
    ]);
    assert.strictEqual(illegal.isValid, false);
  });
});

describe('validateDeck — the commander must be in the list (903.5a)', () => {
  it('a named commander absent from the pasted list is reported and invalidates the deck', () => {
    const commander = eligibleCommander({ name: 'Test Commander', color_identity: '[]' });

    // 100 cards, none of them the commander: the deck as it stands is 100
    // cards PLUS the commander — 101 in reality. The count alone can't see
    // this; the named set has to be checked against the list.
    const result = validateDeck(
      [entry('Wastes', 100)],
      nameMapOf([commander, basicLand('Wastes')]),
      [commander],
      [],
    );

    assert.strictEqual(result.deckSize.total, 100);
    assert.deepStrictEqual(result.commander.missingFromList, ['Test Commander']);
    assert.strictEqual(result.isValid, false);
  });

  it('a commander named by its front face counts as present (DFC)', () => {
    const fable = eligibleCommander({
      name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
      color_identity: '["R"]',
    });
    // The face-name key findCardsByNames adds via card_face_names, so a list
    // naming only the front face resolves to the same oracle row.
    const nameMap = nameMapOf([fable, basicLand('Wastes')]);
    nameMap.set('fable of the mirror-breaker', fable);

    const result = validateDeck(
      [entry('Fable of the Mirror-Breaker'), entry('Wastes', 99)],
      nameMap,
      [fable],
      [],
    );

    assert.deepStrictEqual(result.commander.missingFromList, []);
    assert.strictEqual(result.isValid, true);
  });

  it('each commander of a pair must be in the list', () => {
    const a = eligibleCommander({
      name: 'Partner A',
      color_identity: '[]',
      partner_ability: 'partner',
    });
    const b = eligibleCommander({
      name: 'Partner B',
      color_identity: '[]',
      partner_ability: 'partner',
    });

    const result = validateDeck(
      [entry('Partner A'), entry('Wastes', 99)],
      nameMapOf([a, b, basicLand('Wastes')]),
      [a, b],
      [],
    );

    assert.strictEqual(result.commander.pairingLegal, true);
    assert.deepStrictEqual(result.commander.missingFromList, ['Partner B']);
    assert.strictEqual(result.isValid, false);
  });
});
