/**
 * Tests for command-zone pairing (rule 702.124): which "commander units" —
 * solo cards, or legal pairs — get built from a pool of eligible candidates.
 * Run with: npm test
 *
 * Oracle text below is modeled on real card templating (reminder text
 * included), since that's exactly what naive detection trips over — every
 * one of these abilities restates its own keyword inside parentheses.
 */
import assert from 'node:assert';
import type { CardRow } from '../src/types';
import { buildCommanderUnits, unitKey, type CommanderUnit } from '../src/services/partners';

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
    type_line: 'Legendary Creature — Human',
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
    is_legendary: 1,
    is_commander_eligible: 1,
    image_uri: null,
    back_image_uri: null,
    back_name: null,
    ...overrides,
  };
}

/** Sorted list of unit keys, for order-independent comparisons. */
function keys(units: CommanderUnit[]): string[] {
  return units.map(unitKey).sort();
}

// --- solo units ------------------------------------------------------

check('every candidate gets its own solo unit, regardless of partner ability', () => {
  const plain = makeCard({ name: 'Solo Only' });
  const partner = makeCard({ name: 'Has Partner', partner_ability: 'partner' });
  const units = buildCommanderUnits([plain, partner], []);
  assert.ok(keys(units).includes(unitKey({ cards: [plain] })));
  assert.ok(keys(units).includes(unitKey({ cards: [partner] })));
});

check('an empty candidate pool produces no units', () => {
  assert.deepStrictEqual(buildCommanderUnits([], []), []);
});

// --- plain Partner -----------------------------------------------------

check('two plain-Partner cards pair with each other', () => {
  const a = makeCard({ name: 'Tymna the Weaver', partner_ability: 'partner' });
  const b = makeCard({ name: 'Thrasios, Triton Hero', partner_ability: 'partner' });
  const units = buildCommanderUnits([a, b], []);
  assert.ok(keys(units).includes(unitKey({ cards: [a, b] })), 'expected the pair to exist');
  // 2 solo + 1 pair.
  assert.strictEqual(units.length, 3);
});

check('three plain-Partner cards produce every pairwise combination', () => {
  const a = makeCard({ name: 'A', partner_ability: 'partner' });
  const b = makeCard({ name: 'B', partner_ability: 'partner' });
  const c = makeCard({ name: 'C', partner_ability: 'partner' });
  const pairs = buildCommanderUnits([a, b, c], []).filter((u) => u.cards.length === 2);
  assert.strictEqual(pairs.length, 3); // C(3,2)
});

check('a plain-Partner card does not pair with a non-partner card', () => {
  const a = makeCard({ name: 'Has Partner', partner_ability: 'partner' });
  const b = makeCard({ name: 'No Ability' });
  const units = buildCommanderUnits([a, b], []);
  assert.strictEqual(
    units.filter((u) => u.cards.length === 2).length,
    0
  );
});

// --- Partner — [suffix] -------------------------------------------------

check('Partner—[text] pairs only within the same suffix group', () => {
  const father = makeCard({ name: 'Rograkh, Son of Rohgahh', partner_ability: 'partner_suffix', partner_target: 'father & son' });
  const son = makeCard({ name: 'Silas Renn, Seeker Adept', partner_ability: 'partner_suffix', partner_target: 'father & son' });
  const other = makeCard({ name: 'Different Group', partner_ability: 'partner_suffix', partner_target: 'a different group' });

  const units = buildCommanderUnits([father, son, other], []);
  const pairs = units.filter((u) => u.cards.length === 2);
  assert.strictEqual(pairs.length, 1);
  assert.strictEqual(unitKey(pairs[0]), unitKey({ cards: [father, son] }));
});

// --- Partner with [Name] ------------------------------------------------

check('"Partner with [Name]" pairs when both cards name each other', () => {
  const kraum = makeCard({
    name: "Kraum, Ludevic's Opus",
    partner_ability: 'partner_with',
    partner_target: "ludevic's test subject",
  });
  const subject = makeCard({
    name: "Ludevic's Test Subject",
    partner_ability: 'partner_with',
    partner_target: "kraum, ludevic's opus",
  });
  const units = buildCommanderUnits([kraum, subject], []);
  assert.ok(keys(units).includes(unitKey({ cards: [kraum, subject] })));
});

check('"Partner with [Name]" is rejected when only one side names the other', () => {
  const kraum = makeCard({
    name: "Kraum, Ludevic's Opus",
    partner_ability: 'partner_with',
    partner_target: "ludevic's test subject",
  });
  // Names something else entirely — does not reciprocate.
  const impostor = makeCard({
    name: "Ludevic's Test Subject",
    partner_ability: 'partner_with',
    partner_target: 'some other card',
  });
  const units = buildCommanderUnits([kraum, impostor], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
});

check('"Partner with [Name]" does not pair with a same-named plain-Partner card', () => {
  const kraum = makeCard({
    name: "Kraum, Ludevic's Opus",
    partner_ability: 'partner_with',
    partner_target: "ludevic's test subject",
  });
  // Right name, but plain Partner instead of Partner with — should not count.
  const wrongAbility = makeCard({ name: "Ludevic's Test Subject", partner_ability: 'partner' });
  const units = buildCommanderUnits([kraum, wrongAbility], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
});

// --- Friends forever -----------------------------------------------------

check('two Friends-forever creatures pair with each other', () => {
  const a = makeCard({ name: 'Friend A', partner_ability: 'friends_forever' });
  const b = makeCard({ name: 'Friend B', partner_ability: 'friends_forever' });
  const units = buildCommanderUnits([a, b], []);
  assert.ok(keys(units).includes(unitKey({ cards: [a, b] })));
});

check('a non-creature Friends-forever card is excluded from pairing (702.124k)', () => {
  const creature = makeCard({ name: 'Friend Creature', partner_ability: 'friends_forever' });
  const notCreature = makeCard({
    name: 'Friend Non-Creature',
    partner_ability: 'friends_forever',
    type_line: 'Legendary Enchantment',
  });
  const units = buildCommanderUnits([creature, notCreature], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
  // Still gets its own solo unit, though.
  assert.ok(keys(units).includes(unitKey({ cards: [notCreature] })));
});

// --- Choose a Background -------------------------------------------------

check('a Choose-a-Background card pairs with every legal Background passed in', () => {
  const chooser = makeCard({ name: 'Tiana, Ship’s Caretaker', partner_ability: 'choose_background' });
  const bg1 = makeCard({
    name: 'Raised by Giants',
    type_line: 'Legendary Enchantment — Background',
    is_background: 1,
    is_commander_eligible: 0,
  });
  const bg2 = makeCard({
    name: 'Ranger Class',
    type_line: 'Legendary Enchantment — Background',
    is_background: 1,
    is_commander_eligible: 0,
  });
  const units = buildCommanderUnits([chooser], [bg1, bg2]);
  assert.ok(keys(units).includes(unitKey({ cards: [chooser, bg1] })));
  assert.ok(keys(units).includes(unitKey({ cards: [chooser, bg2] })));
});

check('two Choose-a-Background cards do not pair with each other', () => {
  const a = makeCard({ name: 'Chooser A', partner_ability: 'choose_background' });
  const b = makeCard({ name: 'Chooser B', partner_ability: 'choose_background' });
  const units = buildCommanderUnits([a, b], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
});

check('a Background never appears as its own solo unit', () => {
  const bg = makeCard({
    name: 'Solo Background',
    type_line: 'Legendary Enchantment — Background',
    is_background: 1,
    is_commander_eligible: 0,
  });
  // Backgrounds aren't part of the candidate pool passed in (matching
  // getCommanderCandidates' own exclusion) — only ever reached via the
  // second `buildCommanderUnits` argument.
  const units = buildCommanderUnits([], [bg]);
  assert.strictEqual(units.length, 0);
});

// --- Doctor's companion ---------------------------------------------------

check("a Doctor's companion pairs with an exact {Time Lord, Doctor} creature", () => {
  const companion = makeCard({ name: 'The Companion', partner_ability: 'doctors_companion' });
  const doctor = makeCard({
    name: 'The Fourteenth Doctor',
    type_line: 'Legendary Creature — Time Lord Doctor',
    creature_types: JSON.stringify(['Time Lord', 'Doctor']),
  });
  const units = buildCommanderUnits([companion, doctor], []);
  assert.ok(keys(units).includes(unitKey({ cards: [companion, doctor] })));
});

check("a Doctor's companion rejects a creature with extra subtypes beyond Time Lord Doctor", () => {
  const companion = makeCard({ name: 'The Companion', partner_ability: 'doctors_companion' });
  const notQuiteDoctor = makeCard({
    name: 'Time Lord Doctor Wizard',
    type_line: 'Legendary Creature — Time Lord Doctor Wizard',
    creature_types: JSON.stringify(['Time Lord', 'Doctor', 'Wizard']),
  });
  const units = buildCommanderUnits([companion, notQuiteDoctor], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
});

check("a Doctor's companion rejects a creature missing one of the two required types", () => {
  const companion = makeCard({ name: 'The Companion', partner_ability: 'doctors_companion' });
  const justDoctor = makeCard({
    name: 'Just a Doctor',
    type_line: 'Legendary Creature — Doctor',
    creature_types: JSON.stringify(['Doctor']),
  });
  const units = buildCommanderUnits([companion, justDoctor], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
});

// --- cross-variant isolation ----------------------------------------------

check('different partner-family variants never pair with each other (702.124f)', () => {
  const plain = makeCard({ name: 'Plain Partner', partner_ability: 'partner' });
  const forever = makeCard({ name: 'Forever Friend', partner_ability: 'friends_forever' });
  const suffix = makeCard({ name: 'Suffix Card', partner_ability: 'partner_suffix', partner_target: 'group' });
  const units = buildCommanderUnits([plain, forever, suffix], []);
  assert.strictEqual(units.filter((u) => u.cards.length === 2).length, 0);
});

// --- unitKey ---------------------------------------------------------------

check('unitKey is stable regardless of card order', () => {
  const a = makeCard({ oracle_id: 'aaa', name: 'A' });
  const b = makeCard({ oracle_id: 'bbb', name: 'B' });
  assert.strictEqual(unitKey({ cards: [a, b] }), unitKey({ cards: [b, a] }));
});

if (failures > 0) {
  console.error(`\n${failures} partner-pairing cases failed.`);
  process.exit(1);
}
console.log('\nAll partner-pairing cases passed.');
