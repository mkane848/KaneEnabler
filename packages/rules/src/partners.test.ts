/**
 * Tests for command-zone pairing (rule 702.124): which "commander units" —
 * solo cards, or legal pairs — get built from a pool of eligible candidates.
 *
 * Oracle text below is modeled on real card templating (reminder text
 * included), since that's exactly what naive detection trips over — every
 * one of these abilities restates its own keyword inside parentheses.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCommanderUnits,
  unitKey,
  type CommanderUnit,
  type PartnerCardLike,
} from './partners.js';

let counter = 0;
function makeCard(overrides: Partial<PartnerCardLike> = {}): PartnerCardLike {
  const name = overrides.name_lower ?? `test card ${counter++}`;
  return {
    oracle_id: overrides.oracle_id ?? name,
    name_lower: name,
    type_line: 'Legendary Creature — Human',
    creature_types: '[]',
    partner_ability: null,
    partner_target: null,
    ...overrides,
  };
}

/** Sorted list of unit keys, for order-independent comparisons. */
function keys(units: CommanderUnit[]): string[] {
  return units.map(unitKey).sort();
}

describe('buildCommanderUnits', () => {
  // --- solo units ------------------------------------------------------

  it('every candidate gets its own solo unit, regardless of partner ability', () => {
    const plain = makeCard({ oracle_id: 'solo-only', name_lower: 'solo only' });
    const partner = makeCard({
      oracle_id: 'has-partner',
      name_lower: 'has partner',
      partner_ability: 'partner',
    });
    const units = buildCommanderUnits([plain, partner], []);
    expect(keys(units)).toContain(unitKey({ cards: [plain] }));
    expect(keys(units)).toContain(unitKey({ cards: [partner] }));
  });

  it('an empty candidate pool produces no units', () => {
    expect(buildCommanderUnits([], [])).toEqual([]);
  });

  // --- plain Partner -----------------------------------------------------

  it('two plain-Partner cards pair with each other', () => {
    const a = makeCard({
      oracle_id: 'tymna',
      name_lower: 'tymna the weaver',
      partner_ability: 'partner',
    });
    const b = makeCard({
      oracle_id: 'thrasios',
      name_lower: 'thrasios, triton hero',
      partner_ability: 'partner',
    });
    const units = buildCommanderUnits([a, b], []);
    expect(keys(units)).toContain(unitKey({ cards: [a, b] }));
    // 2 solo + 1 pair.
    expect(units.length).toBe(3);
  });

  it('three plain-Partner cards produce every pairwise combination', () => {
    const a = makeCard({ oracle_id: 'a', name_lower: 'a', partner_ability: 'partner' });
    const b = makeCard({ oracle_id: 'b', name_lower: 'b', partner_ability: 'partner' });
    const c = makeCard({ oracle_id: 'c', name_lower: 'c', partner_ability: 'partner' });
    const pairs = buildCommanderUnits([a, b, c], []).filter((u) => u.cards.length === 2);
    expect(pairs.length).toBe(3); // C(3,2)
  });

  it('a plain-Partner card does not pair with a non-partner card', () => {
    const a = makeCard({
      oracle_id: 'has-partner',
      name_lower: 'has partner',
      partner_ability: 'partner',
    });
    const b = makeCard({ oracle_id: 'no-ability', name_lower: 'no ability' });
    const units = buildCommanderUnits([a, b], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  // --- Partner — [suffix] -------------------------------------------------

  it('Partner—[text] pairs only within the same suffix group', () => {
    const father = makeCard({
      oracle_id: 'rograkh',
      name_lower: 'rograkh, son of rohgahh',
      partner_ability: 'partner_suffix',
      partner_target: 'father & son',
    });
    const son = makeCard({
      oracle_id: 'silas',
      name_lower: 'silas renn, seeker adept',
      partner_ability: 'partner_suffix',
      partner_target: 'father & son',
    });
    const other = makeCard({
      oracle_id: 'different',
      name_lower: 'different group',
      partner_ability: 'partner_suffix',
      partner_target: 'a different group',
    });

    const units = buildCommanderUnits([father, son, other], []);
    const pairs = units.filter((u) => u.cards.length === 2);
    expect(pairs.length).toBe(1);
    expect(unitKey(pairs[0]!)).toBe(unitKey({ cards: [father, son] }));
  });

  // --- Partner with [Name] ------------------------------------------------

  it('"Partner with [Name]" pairs when both cards name each other', () => {
    const kraum = makeCard({
      oracle_id: 'kraum',
      name_lower: "kraum, ludevic's opus",
      partner_ability: 'partner_with',
      partner_target: "ludevic's test subject",
    });
    const subject = makeCard({
      oracle_id: 'subject',
      name_lower: "ludevic's test subject",
      partner_ability: 'partner_with',
      partner_target: "kraum, ludevic's opus",
    });
    const units = buildCommanderUnits([kraum, subject], []);
    expect(keys(units)).toContain(unitKey({ cards: [kraum, subject] }));
  });

  it('"Partner with [Name]" is rejected when only one side names the other', () => {
    const kraum = makeCard({
      oracle_id: 'kraum',
      name_lower: "kraum, ludevic's opus",
      partner_ability: 'partner_with',
      partner_target: "ludevic's test subject",
    });
    // Names something else entirely — does not reciprocate.
    const impostor = makeCard({
      oracle_id: 'subject',
      name_lower: "ludevic's test subject",
      partner_ability: 'partner_with',
      partner_target: 'some other card',
    });
    const units = buildCommanderUnits([kraum, impostor], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  it('"Partner with [Name]" does not pair with a same-named plain-Partner card', () => {
    const kraum = makeCard({
      oracle_id: 'kraum',
      name_lower: "kraum, ludevic's opus",
      partner_ability: 'partner_with',
      partner_target: "ludevic's test subject",
    });
    // Right name, but plain Partner instead of Partner with — should not count.
    const wrongAbility = makeCard({
      oracle_id: 'subject',
      name_lower: "ludevic's test subject",
      partner_ability: 'partner',
    });
    const units = buildCommanderUnits([kraum, wrongAbility], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  // --- Friends forever -----------------------------------------------------

  it('two Friends-forever creatures pair with each other', () => {
    const a = makeCard({
      oracle_id: 'friend-a',
      name_lower: 'friend a',
      partner_ability: 'friends_forever',
    });
    const b = makeCard({
      oracle_id: 'friend-b',
      name_lower: 'friend b',
      partner_ability: 'friends_forever',
    });
    const units = buildCommanderUnits([a, b], []);
    expect(keys(units)).toContain(unitKey({ cards: [a, b] }));
  });

  it('a non-creature Friends-forever card is excluded from pairing (702.124k)', () => {
    const creature = makeCard({
      oracle_id: 'friend-creature',
      name_lower: 'friend creature',
      partner_ability: 'friends_forever',
    });
    const notCreature = makeCard({
      oracle_id: 'friend-non-creature',
      name_lower: 'friend non-creature',
      partner_ability: 'friends_forever',
      type_line: 'Legendary Enchantment',
    });
    const units = buildCommanderUnits([creature, notCreature], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
    // Still gets its own solo unit, though.
    expect(keys(units)).toContain(unitKey({ cards: [notCreature] }));
  });

  // --- Choose a Background -------------------------------------------------

  it('a Choose-a-Background card pairs with every legal Background passed in', () => {
    const chooser = makeCard({
      oracle_id: 'tiana',
      name_lower: 'tiana, ship’s caretaker',
      partner_ability: 'choose_background',
    });
    const bg1 = makeCard({
      oracle_id: 'raised-by-giants',
      name_lower: 'raised by giants',
      type_line: 'Legendary Enchantment — Background',
    });
    const bg2 = makeCard({
      oracle_id: 'ranger-class',
      name_lower: 'ranger class',
      type_line: 'Legendary Enchantment — Background',
    });
    const units = buildCommanderUnits([chooser], [bg1, bg2]);
    expect(keys(units)).toContain(unitKey({ cards: [chooser, bg1] }));
    expect(keys(units)).toContain(unitKey({ cards: [chooser, bg2] }));
  });

  it('two Choose-a-Background cards do not pair with each other', () => {
    const a = makeCard({
      oracle_id: 'chooser-a',
      name_lower: 'chooser a',
      partner_ability: 'choose_background',
    });
    const b = makeCard({
      oracle_id: 'chooser-b',
      name_lower: 'chooser b',
      partner_ability: 'choose_background',
    });
    const units = buildCommanderUnits([a, b], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  it('a Background never appears as its own solo unit', () => {
    const bg = makeCard({
      oracle_id: 'solo-background',
      name_lower: 'solo background',
      type_line: 'Legendary Enchantment — Background',
    });
    // Backgrounds aren't part of the candidate pool passed in (matching a
    // caller's own exclusion) — only ever reached via the second
    // buildCommanderUnits argument.
    const units = buildCommanderUnits([], [bg]);
    expect(units.length).toBe(0);
  });

  // --- Doctor's companion ---------------------------------------------------

  it("a Doctor's companion pairs with an exact {Time Lord, Doctor} creature", () => {
    const companion = makeCard({
      oracle_id: 'companion',
      name_lower: 'the companion',
      partner_ability: 'doctors_companion',
    });
    const doctor = makeCard({
      oracle_id: 'fourteenth-doctor',
      name_lower: 'the fourteenth doctor',
      type_line: 'Legendary Creature — Time Lord Doctor',
      creature_types: JSON.stringify(['Time Lord', 'Doctor']),
    });
    const units = buildCommanderUnits([companion, doctor], []);
    expect(keys(units)).toContain(unitKey({ cards: [companion, doctor] }));
  });

  it("a Doctor's companion rejects a creature with extra subtypes beyond Time Lord Doctor", () => {
    const companion = makeCard({
      oracle_id: 'companion',
      name_lower: 'the companion',
      partner_ability: 'doctors_companion',
    });
    const notQuiteDoctor = makeCard({
      oracle_id: 'time-lord-doctor-wizard',
      name_lower: 'time lord doctor wizard',
      type_line: 'Legendary Creature — Time Lord Doctor Wizard',
      creature_types: JSON.stringify(['Time Lord', 'Doctor', 'Wizard']),
    });
    const units = buildCommanderUnits([companion, notQuiteDoctor], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  it("a Doctor's companion rejects a creature missing one of the two required types", () => {
    const companion = makeCard({
      oracle_id: 'companion',
      name_lower: 'the companion',
      partner_ability: 'doctors_companion',
    });
    const justDoctor = makeCard({
      oracle_id: 'just-a-doctor',
      name_lower: 'just a doctor',
      type_line: 'Legendary Creature — Doctor',
      creature_types: JSON.stringify(['Doctor']),
    });
    const units = buildCommanderUnits([companion, justDoctor], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  // --- cross-variant isolation ----------------------------------------------

  it('different partner-family variants never pair with each other (702.124f)', () => {
    const plain = makeCard({
      oracle_id: 'plain',
      name_lower: 'plain partner',
      partner_ability: 'partner',
    });
    const forever = makeCard({
      oracle_id: 'forever',
      name_lower: 'forever friend',
      partner_ability: 'friends_forever',
    });
    const suffix = makeCard({
      oracle_id: 'suffix',
      name_lower: 'suffix card',
      partner_ability: 'partner_suffix',
      partner_target: 'group',
    });
    const units = buildCommanderUnits([plain, forever, suffix], []);
    expect(units.filter((u) => u.cards.length === 2).length).toBe(0);
  });

  // --- unitKey ---------------------------------------------------------------

  it('unitKey is stable regardless of card order', () => {
    const a = makeCard({ oracle_id: 'aaa', name_lower: 'a' });
    const b = makeCard({ oracle_id: 'bbb', name_lower: 'b' });
    expect(unitKey({ cards: [a, b] })).toBe(unitKey({ cards: [b, a] }));
  });
});
