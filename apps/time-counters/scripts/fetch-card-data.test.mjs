import { describe, expect, it } from 'vitest';
import { toCardData } from './fetch-card-data.mjs';

function singleFacedCard(overrides = {}) {
  return {
    id: 'test-single-1',
    name: 'Rift Bolt',
    type_line: 'Sorcery',
    mana_cost: '{2}{R}',
    color_identity: ['R'],
    oracle_text: 'Suspend 1—{R}\nRift Bolt deals 3 damage to any target.',
    ...overrides,
  };
}

function modalDfcCard(overrides = {}) {
  return {
    id: 'test-mdfc-1',
    name: 'Front Spell // Back Spell',
    layout: 'modal_dfc',
    type_line: 'Instant // Sorcery',
    // Scryfall gives a modal DFC no top-level mana_cost — it's cast as one
    // face or the other, never both.
    color_identity: ['G'],
    card_faces: [
      {
        name: 'Front Spell',
        mana_cost: '{1}{G}',
        type_line: 'Instant',
        oracle_text: 'Front effect.',
      },
      {
        name: 'Back Spell',
        mana_cost: '{3}{G}{G}',
        type_line: 'Sorcery',
        oracle_text: 'Back effect.',
      },
    ],
    ...overrides,
  };
}

function transformDfcCard(overrides = {}) {
  return {
    id: 'test-transform-1',
    name: 'Delver of Secrets // Insectile Aberration',
    layout: 'transform',
    type_line: 'Creature — Human Wizard',
    // A transform DFC's front face IS castable on its own, so Scryfall
    // does give it a top-level mana_cost — unlike a modal DFC.
    mana_cost: '{U}',
    color_identity: ['U'],
    card_faces: [
      { name: 'Delver of Secrets', mana_cost: '{U}', type_line: 'Creature — Human Wizard' },
      { name: 'Insectile Aberration', mana_cost: '', type_line: 'Creature — Human Insect' },
    ],
    ...overrides,
  };
}

describe('toCardData — mana cost', () => {
  it('an ordinary single-faced card keeps its own mana cost', () => {
    expect(toCardData(singleFacedCard()).manaCost).toBe('{2}{R}');
  });

  it('a modal DFC with no top-level mana_cost uses the front face only, not both faces joined', () => {
    // The bug: joining "{1}{G}" and "{3}{G}{G}" with " // " produces
    // "{1}{G} // {3}{G}{G}", which a mana-cost parser reads as five pips
    // for a card that's actually cast for one or the other, never both.
    expect(toCardData(modalDfcCard()).manaCost).toBe('{1}{G}');
  });

  it('a transform DFC already has a top-level mana_cost and is unaffected', () => {
    expect(toCardData(transformDfcCard()).manaCost).toBe('{U}');
  });
});

describe('toCardData — oracle text (unaffected by the mana-cost fix)', () => {
  it('still joins both faces of a modal DFC for time-counter detection', () => {
    const card = modalDfcCard({
      card_faces: [
        {
          name: 'Front Spell',
          mana_cost: '{1}{G}',
          type_line: 'Instant',
          oracle_text: 'Suspend 2—{G}',
        },
        {
          name: 'Back Spell',
          mana_cost: '{3}{G}{G}',
          type_line: 'Sorcery',
          oracle_text: 'Back effect.',
        },
      ],
    });
    expect(toCardData(card).oracleText).toContain('Suspend 2');
  });
});
