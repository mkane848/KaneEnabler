/**
 * Tests for commander eligibility, especially the front-face rule for
 * double-faced cards. Run with: npm test
 *
 * Dependency-free (node:assert + tsx), matching the other test scripts here.
 * Card shapes below mirror what Scryfall's bulk data actually contains —
 * notably that a DFC's top-level `type_line` is the two faces joined.
 */
import assert from 'node:assert';
import { frontFaceCharacteristics, isCommanderEligible, type ScryfallCardLike } from '../src/services/eligibility';

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

// --- the reported bug -------------------------------------------------------

check('a transforming land with a legendary creature back is NOT eligible', () => {
  // Westvale Abbey // Ormendahl, Profane Prince. In the command zone this is
  // a non-legendary Land; Ormendahl only exists once it has transformed on
  // the battlefield. Scryfall's joined type_line contains both "Legendary"
  // and "Creature", which is what made this look eligible.
  const westvaleAbbey: ScryfallCardLike = {
    layout: 'transform',
    type_line: 'Land // Legendary Creature — Demon',
    card_faces: [
      { type_line: 'Land', oracle_text: '{T}: Add {C}.' },
      { type_line: 'Legendary Creature — Demon', oracle_text: 'Flying, trample, haste' },
    ],
  };
  assert.strictEqual(isCommanderEligible(westvaleAbbey), false);
});

check('a flip card whose back is legendary is NOT eligible', () => {
  // Bushi Tenderfoot // Kenzo the Hardhearted — same shape of mistake as
  // Westvale Abbey, different layout. Only the flipped side is legendary.
  const bushiTenderfoot: ScryfallCardLike = {
    layout: 'flip',
    type_line: 'Creature — Human Soldier // Legendary Creature — Human Samurai',
    card_faces: [
      { type_line: 'Creature — Human Soldier', oracle_text: 'When Bushi Tenderfoot is dealt damage, flip it.' },
      { type_line: 'Legendary Creature — Human Samurai', oracle_text: 'Double strike' },
    ],
  };
  assert.strictEqual(isCommanderEligible(bushiTenderfoot), false);
});

// --- still eligible ---------------------------------------------------------

check('a DFC with a legendary creature FRONT is eligible', () => {
  // Halvar, God of Battle // Sword of the Realms — the front is the commander.
  const halvar: ScryfallCardLike = {
    layout: 'modal_dfc',
    type_line: 'Legendary Creature — God // Legendary Artifact — Equipment',
    card_faces: [
      { type_line: 'Legendary Creature — God', oracle_text: 'Creatures you control with auras have double strike.' },
      { type_line: 'Legendary Artifact — Equipment', oracle_text: 'Equipped creature gets +1/+0.' },
    ],
  };
  assert.strictEqual(isCommanderEligible(halvar), true);
});

check('an ordinary legendary creature is eligible', () => {
  const card: ScryfallCardLike = {
    layout: 'normal',
    type_line: 'Legendary Creature — Human Assassin',
    oracle_text: 'Whenever a creature you control dies, draw a card.',
  };
  assert.strictEqual(isCommanderEligible(card), true);
});

check('a legendary Vehicle is eligible even with no "Creature" in its type', () => {
  // 903.3 covers Vehicles/Spacecraft; an unanimated Vehicle never says
  // "Creature", so this guards the earlier Vehicle fix against regression.
  const vehicle: ScryfallCardLike = {
    layout: 'normal',
    type_line: 'Legendary Artifact — Vehicle',
    oracle_text: 'Crew 3',
  };
  assert.strictEqual(isCommanderEligible(vehicle), true);
});

check('"can be your commander" on a non-creature still qualifies', () => {
  // Teferi, Temporal Archmage and the other Oathbreaker-style planeswalkers.
  const teferi: ScryfallCardLike = {
    layout: 'normal',
    type_line: 'Legendary Planeswalker — Teferi',
    oracle_text: 'Teferi, Temporal Archmage can be your commander.',
  };
  assert.strictEqual(isCommanderEligible(teferi), true);
});

check('an adventure creature is read from its creature face', () => {
  const adventurer: ScryfallCardLike = {
    layout: 'adventure',
    type_line: 'Legendary Creature — Giant // Sorcery — Adventure',
    card_faces: [
      { type_line: 'Legendary Creature — Giant', oracle_text: 'Trample' },
      { type_line: 'Sorcery — Adventure', oracle_text: 'Destroy target artifact.' },
    ],
  };
  assert.strictEqual(isCommanderEligible(adventurer), true);
});

// --- not eligible -----------------------------------------------------------

check('a non-legendary creature is not eligible', () => {
  const card: ScryfallCardLike = {
    layout: 'normal',
    type_line: 'Creature — Human Wizard',
    oracle_text: 'Draw a card.',
  };
  assert.strictEqual(isCommanderEligible(card), false);
});

check('a legendary non-creature permanent is not eligible', () => {
  const card: ScryfallCardLike = {
    layout: 'normal',
    type_line: 'Legendary Enchantment',
    oracle_text: 'Whenever you cast a spell, scry 1.',
  };
  assert.strictEqual(isCommanderEligible(card), false);
});

check('"can be your commander" on a back face does not qualify the card', () => {
  // A back face has none of its abilities while the card is in the command
  // zone, so a grant printed there cannot apply to itself.
  const card: ScryfallCardLike = {
    layout: 'transform',
    type_line: 'Land // Legendary Creature — Horror',
    card_faces: [
      { type_line: 'Land', oracle_text: '{T}: Add {B}.' },
      { type_line: 'Legendary Creature — Horror', oracle_text: 'This card can be your commander.' },
    ],
  };
  assert.strictEqual(isCommanderEligible(card), false);
});

// --- frontFaceCharacteristics -----------------------------------------------

check('a split card keeps both halves (709.4), unlike a DFC', () => {
  // One physical face, so it genuinely has both halves' characteristics in
  // every zone — reading only the first half would be wrong on its own terms.
  const split: ScryfallCardLike = {
    layout: 'split',
    type_line: 'Instant // Instant',
    card_faces: [
      { type_line: 'Instant', oracle_text: 'Destroy target artifact.' },
      { type_line: 'Instant', oracle_text: 'Draw a card.' },
    ],
  };
  const { typeLine, oracleText } = frontFaceCharacteristics(split);
  assert.strictEqual(typeLine, 'Instant // Instant');
  assert.ok(oracleText.includes('Destroy target artifact.'));
  assert.ok(oracleText.includes('Draw a card.'));
});

check('a single-faced card falls back to its top-level fields', () => {
  const card: ScryfallCardLike = {
    layout: 'normal',
    type_line: 'Legendary Creature — Elf',
    oracle_text: 'Tap ten untapped Elves you control: win.',
  };
  const { typeLine, oracleText } = frontFaceCharacteristics(card);
  assert.strictEqual(typeLine, 'Legendary Creature — Elf');
  assert.strictEqual(oracleText, 'Tap ten untapped Elves you control: win.');
});

check('missing fields degrade to empty strings rather than throwing', () => {
  const { typeLine, oracleText } = frontFaceCharacteristics({});
  assert.strictEqual(typeLine, '');
  assert.strictEqual(oracleText, '');
  assert.strictEqual(isCommanderEligible({}), false);
});

if (failures > 0) {
  console.error(`\n${failures} eligibility case(s) failed.`);
  process.exit(1);
}
console.log('\nAll eligibility cases passed.');
