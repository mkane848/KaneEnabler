/**
 * Spot-checks buildCommanderUnits against real Scryfall data, not the
 * hand-authored fixtures partners.test.ts uses for exhaustive coverage of
 * the pairing rules themselves. Every field below was copied verbatim from
 * a real `pnpm run prepare-data` import (2026-08-18) — oracle_id,
 * type_line, and creature_types exactly as Scryfall printed them and
 * import-scryfall.ts computed them — per this project's "never write
 * oracle text from memory" rule. See docs/commander-recommender.md's
 * "Partner / Background support" section, which flagged this real-data
 * check as still outstanding after the pairing logic itself was only
 * validated against fixtures modeled on real card templating.
 */
import { describe, expect, it } from 'vitest';
import { buildCommanderUnits, unitKey, type PartnerCardLike } from './partners';

const TYMNA: PartnerCardLike = {
  oracle_id: 'd15642e4-e61c-4d29-af48-de837991245e',
  name_lower: 'tymna the weaver',
  type_line: 'Legendary Creature — Human Cleric',
  creature_types: '["Human","Cleric"]',
  partner_ability: 'partner',
  partner_target: null,
};
const KRAUM: PartnerCardLike = {
  oracle_id: '5f694f2d-9349-4988-b2b4-788136d4293e',
  name_lower: "kraum, ludevic's opus",
  type_line: 'Legendary Creature — Zombie Horror',
  creature_types: '["Zombie","Horror"]',
  partner_ability: 'partner',
  partner_target: null,
};
const LUDEVIC: PartnerCardLike = {
  oracle_id: '3b9d587c-39d2-44a2-9802-e4217ed389c0',
  name_lower: 'ludevic, necro-alchemist',
  type_line: 'Legendary Creature — Human Wizard',
  creature_types: '["Human","Wizard"]',
  partner_ability: 'partner',
  partner_target: null,
};

const HALSIN: PartnerCardLike = {
  oracle_id: '01ab3603-6c2f-4d65-9bb2-da95efdbe622',
  name_lower: 'halsin, emerald archdruid',
  type_line: 'Legendary Creature — Elf Druid',
  creature_types: '["Elf","Druid"]',
  partner_ability: 'choose_background',
  partner_target: null,
};
const KARLACH: PartnerCardLike = {
  oracle_id: '037355be-71e7-4866-80a6-80352c304970',
  name_lower: 'karlach, fury of avernus',
  type_line: 'Legendary Creature — Tiefling Barbarian',
  creature_types: '["Tiefling","Barbarian"]',
  partner_ability: 'choose_background',
  partner_target: null,
};
const DUNGEON_DELVER: PartnerCardLike = {
  oracle_id: '0073d731-e60d-433a-ac35-a22af855da20',
  name_lower: 'dungeon delver',
  type_line: 'Legendary Enchantment — Background',
  creature_types: '[]',
  partner_ability: null,
  partner_target: null,
};
const RAISED_BY_GIANTS: PartnerCardLike = {
  oracle_id: '1682cf24-17a3-49ad-8b6f-9b7f13ebf53c',
  name_lower: 'raised by giants',
  type_line: 'Legendary Enchantment — Background',
  creature_types: '[]',
  partner_ability: null,
  partner_target: null,
};

const SOPHINA: PartnerCardLike = {
  oracle_id: '095dabda-4570-4764-8d62-4a29eb19d3e6',
  name_lower: 'sophina, spearsage deserter',
  type_line: 'Legendary Creature — Human Soldier',
  creature_types: '["Human","Soldier"]',
  partner_ability: 'friends_forever',
  partner_target: null,
};
const OTHELM: PartnerCardLike = {
  oracle_id: '4ee401bf-dc86-41a9-84f9-57aa0a314d08',
  name_lower: 'othelm, sigardian outcast',
  type_line: 'Legendary Creature — Human',
  creature_types: '["Human"]',
  partner_ability: 'friends_forever',
  partner_target: null,
};

const NYSSA: PartnerCardLike = {
  oracle_id: '07802bd6-29ca-40c5-beba-c2baf7a92555',
  name_lower: 'nyssa of traken',
  type_line: 'Legendary Creature — Human Scientist',
  creature_types: '["Human","Scientist"]',
  partner_ability: 'doctors_companion',
  partner_target: null,
};
const TENTH_DOCTOR: PartnerCardLike = {
  oracle_id: '23af0a0a-1d12-47c7-b191-2bd3f84eea93',
  name_lower: 'the tenth doctor',
  type_line: 'Legendary Creature — Time Lord Doctor',
  creature_types: '["Time Lord","Doctor"]',
  partner_ability: null,
  partner_target: null,
};
const FOURTH_DOCTOR: PartnerCardLike = {
  oracle_id: 'c19fdee3-5fbc-4e2d-ac23-85b46eacafdc',
  name_lower: 'the fourth doctor',
  type_line: 'Legendary Creature — Time Lord Doctor',
  creature_types: '["Time Lord","Doctor"]',
  partner_ability: null,
  partner_target: null,
};

const LORE_WEAVER: PartnerCardLike = {
  oracle_id: '040f6f11-7fbe-4635-b935-442e41f1e704',
  name_lower: 'lore weaver',
  type_line: 'Creature — Human Wizard',
  creature_types: '["Human","Wizard"]',
  partner_ability: 'partner_with',
  partner_target: 'ley weaver',
};
const LEY_WEAVER: PartnerCardLike = {
  oracle_id: '24f1f0e9-8c9b-4f32-95ec-7af883bbeef4',
  name_lower: 'ley weaver',
  type_line: 'Creature — Human Druid',
  creature_types: '["Human","Druid"]',
  partner_ability: 'partner_with',
  partner_target: 'lore weaver',
};

const DONATELLO: PartnerCardLike = {
  oracle_id: '1ba2f763-5895-4663-b38f-95591ebb2ef4',
  name_lower: 'donatello, the brains',
  type_line: 'Legendary Creature — Mutant Ninja Turtle',
  creature_types: '["Mutant","Ninja","Turtle"]',
  partner_ability: 'partner_suffix',
  partner_target: 'character select',
};
const RAPHAEL: PartnerCardLike = {
  oracle_id: '22008c3b-6e15-41cc-a15c-7871495191aa',
  name_lower: 'raphael, the muscle',
  type_line: 'Legendary Creature — Mutant Ninja Turtle',
  creature_types: '["Mutant","Ninja","Turtle"]',
  partner_ability: 'partner_suffix',
  partner_target: 'character select',
};

// Not a Partner-family card at all as printed today — docs/commander-recommender.md's suggested
// spot-check list named her alongside real Partner/Background examples, but her real
// partner_ability is null. Kept as a negative case: a real, ordinary legendary creature must
// produce only a solo unit, never an accidental pairing.
const TIANA: PartnerCardLike = {
  oracle_id: '80f8fb4c-cc6d-4b41-abb3-471dc96d4b2a',
  name_lower: "tiana, ship's caretaker",
  type_line: 'Legendary Creature — Angel Artificer',
  creature_types: '["Angel","Artificer"]',
  partner_ability: null,
  partner_target: null,
};

describe('buildCommanderUnits — real Scryfall data', () => {
  it('pairs two real plain-Partner commanders (Tymna the Weaver + Kraum)', () => {
    const units = buildCommanderUnits([TYMNA, KRAUM, LUDEVIC], []);
    const keys = units.map(unitKey);
    expect(keys).toContain(unitKey({ cards: [TYMNA, KRAUM] }));
    expect(keys).toContain(unitKey({ cards: [TYMNA, LUDEVIC] }));
    expect(keys).toContain(unitKey({ cards: [KRAUM, LUDEVIC] }));
    // Each also gets its own solo unit.
    expect(keys).toContain(unitKey({ cards: [TYMNA] }));
  });

  it('pairs a real Choose-a-Background commander with real legendary Backgrounds', () => {
    const units = buildCommanderUnits(
      [HALSIN, KARLACH],
      [DUNGEON_DELVER, RAISED_BY_GIANTS],
    );
    const keys = units.map(unitKey);
    expect(keys).toContain(unitKey({ cards: [HALSIN, DUNGEON_DELVER] }));
    expect(keys).toContain(unitKey({ cards: [HALSIN, RAISED_BY_GIANTS] }));
    expect(keys).toContain(unitKey({ cards: [KARLACH, DUNGEON_DELVER] }));
    // Two Choose-a-Background cards never pair with each other (only with a Background).
    expect(keys).not.toContain(unitKey({ cards: [HALSIN, KARLACH] }));
    // A Background never appears as its own solo unit.
    expect(keys).not.toContain(unitKey({ cards: [DUNGEON_DELVER] }));
  });

  it('pairs two real Friends-forever commanders', () => {
    const units = buildCommanderUnits([SOPHINA, OTHELM], []);
    expect(units.map(unitKey)).toContain(unitKey({ cards: [SOPHINA, OTHELM] }));
  });

  it("pairs a real Doctor's companion with real Time Lord Doctor creatures, and only those", () => {
    // TIANA is in the candidate pool to prove a non-{Time Lord, Doctor} legendary
    // creature is correctly excluded from the doctors pool.
    const units = buildCommanderUnits([NYSSA, TENTH_DOCTOR, FOURTH_DOCTOR, TIANA], []);
    const keys = units.map(unitKey);
    expect(keys).toContain(unitKey({ cards: [NYSSA, TENTH_DOCTOR] }));
    expect(keys).toContain(unitKey({ cards: [NYSSA, FOURTH_DOCTOR] }));
    expect(keys).not.toContain(unitKey({ cards: [NYSSA, TIANA] }));
  });

  it('pairs two real "Partner with [Name]" cards that name each other', () => {
    const units = buildCommanderUnits([LORE_WEAVER, LEY_WEAVER], []);
    expect(units.map(unitKey)).toContain(unitKey({ cards: [LORE_WEAVER, LEY_WEAVER] }));
  });

  it('pairs two real "Partner—[text]" cards sharing the same suffix group', () => {
    const units = buildCommanderUnits([DONATELLO, RAPHAEL], []);
    expect(units.map(unitKey)).toContain(unitKey({ cards: [DONATELLO, RAPHAEL] }));
  });

  it('a real ordinary legendary creature with no partner ability gets only a solo unit', () => {
    const units = buildCommanderUnits([TIANA, TYMNA], []);
    const tianaUnits = units.filter((u) => u.cards.some((c) => c.oracle_id === TIANA.oracle_id));
    expect(tianaUnits).toHaveLength(1);
    expect(tianaUnits[0]).toEqual({ cards: [TIANA] });
  });
});
