import { describe, expect, it } from 'vitest';
import legacyAceSpecs from './data/legacy-ace-specs.json';
import {
  hasRuleBox,
  isAceSpec,
  isBasicEnergy,
  isBasicPokemon,
  isEnergy,
  isPokemon,
  isPrismStar,
  isRadiant,
  isTrainer,
} from './kinds';
import { card } from './test/snapshot';

describe('category', () => {
  it('sorts cards into Pokémon, Trainer and Energy', () => {
    expect([isPokemon, isTrainer, isEnergy].map((f) => f(card('sv01-003')))).toEqual([
      true,
      false,
      false,
    ]);
    expect([isPokemon, isTrainer, isEnergy].map((f) => f(card('me01-131')))).toEqual([
      false,
      true,
      false,
    ]);
    expect([isPokemon, isTrainer, isEnergy].map((f) => f(card('sve-001')))).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('isBasicEnergy', () => {
  it('accepts basic Energy whether or not TCGdex typed it', () => {
    expect(isBasicEnergy(card('sve-001'))).toBe(true); // Grass Energy, energyType Normal
    expect(isBasicEnergy(card('tk-hs-g-2'))).toBe(true); // Water Energy, no energyType
  });

  it('rejects Special Energy, including the ones TCGdex marks Normal', () => {
    expect(card('me02-124').energyType).toBe('Normal'); // the data quirk this guards against
    expect(isBasicEnergy(card('me02-124'))).toBe(false); // Ignition Energy
    expect(isBasicEnergy(card('col1-86'))).toBe(false); // Special Darkness Energy
  });
});

describe('isBasicPokemon', () => {
  it('reads the stage when there is one', () => {
    expect(isBasicPokemon(card('sv01-003'))).toBe(true); // Shroomish
    expect(isBasicPokemon(card('xy11-15'))).toBe(false); // Volcarona, Stage1
  });

  it('infers it from evolveFrom when the stage is missing', () => {
    expect(card('bwp-BW36').stage).toBeUndefined();
    expect(isBasicPokemon(card('bwp-BW36'))).toBe(true); // Reshiram-EX
    expect(card('ex6-104').stage).toBeUndefined();
    expect(isBasicPokemon(card('ex6-104'))).toBe(false); // Blastoise ex, evolves from Wartortle
  });

  it('is false for non-Pokémon', () => {
    expect(isBasicPokemon(card('sve-001'))).toBe(false);
  });
});

describe('isAceSpec', () => {
  it('reads the ACE SPEC Rare rarity on modern prints', () => {
    expect(isAceSpec(card('sv08.5-116'))).toBe(true); // Max Rod
    expect(isAceSpec(card('sv05-157'))).toBe(true); // Prime Catcher
    expect(isAceSpec(card('me01-131'))).toBe(false); // Ultra Ball
  });

  it('uses the vendored list for Black & White prints TCGdex leaves as plain Rare', () => {
    expect(card('bw7-137').rarity).toBe('Rare');
    expect(isAceSpec(card('bw7-137'))).toBe(true); // Computer Search
  });

  it('vendors only ids that exist in the snapshot under the same name', () => {
    for (const { id, name } of legacyAceSpecs.cards) expect(card(id).name).toBe(name);
  });
});

describe('isRadiant / isPrismStar', () => {
  it('recognises Radiant Pokémon and Prism Star cards of every kind', () => {
    expect(isRadiant(card('swsh10-027'))).toBe(true); // Radiant Heatran
    expect(isRadiant(card('sv01-003'))).toBe(false);
    expect(isPrismStar(card('sm7-107'))).toBe(true); // Latias ◇
    expect(isPrismStar(card('sm5-120'))).toBe(true); // Cyrus ◇, a Supporter
    expect(isPrismStar(card('sm5-136'))).toBe(true); // Super Boost Energy ◇
  });
});

describe('hasRuleBox', () => {
  it.each([
    ['sv10-003', 'Yanmega ex (suffix ex)'],
    ['30th-c-026', 'Mew VMAX (stage VMAX)'],
    ['swsh10-027', 'Radiant Heatran'],
    ['sm7-107', 'Latias ◇'],
    ['sm5-120', 'Cyrus ◇, a Prism Star Trainer'],
    ['sv08.5-116', 'Max Rod, an ACE SPEC'],
    ['smp-SM211', 'Charizard GX — no suffix in the data, read from the name'],
    ['xyp-XY35', 'M Metagross EX — no suffix in the data, read from the name'],
  ])('%s: %s', (id) => {
    expect(hasRuleBox(card(id))).toBe(true);
  });

  it('is false for ordinary Pokémon, Trainers and Energy', () => {
    expect(hasRuleBox(card('sv01-003'))).toBe(false); // Shroomish
    expect(hasRuleBox(card('xy11-15'))).toBe(false); // Volcarona
    expect(hasRuleBox(card('me01-131'))).toBe(false); // Ultra Ball
    expect(hasRuleBox(card('sve-001'))).toBe(false); // Grass Energy
  });
});
