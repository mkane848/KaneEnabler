import { describe, expect, it } from 'vitest';
import {
  backFaceName,
  backImageUri,
  frontFaceField,
  frontImageUri,
  isTwoSidedLayout,
} from './scryfallFields.js';

function singleFacedCard(overrides = {}) {
  return {
    name: 'Rift Bolt',
    mana_cost: '{2}{R}',
    power: undefined,
    toughness: undefined,
    image_uris: {
      small: 'https://example.com/rift-bolt-small.jpg',
      normal: 'https://example.com/rift-bolt.jpg',
    },
    ...overrides,
  };
}

function modalDfcCard(overrides = {}) {
  return {
    name: 'Bala Ged Recovery // Bala Ged Sanctuary',
    layout: 'modal_dfc',
    // Scryfall gives a modal DFC no top-level mana_cost or image_uris — it's
    // cast as one face or the other, never both, and each face has its own
    // picture.
    card_faces: [
      {
        name: 'Bala Ged Recovery',
        mana_cost: '{2}{G}',
        power: undefined,
        toughness: undefined,
        image_uris: {
          small: 'https://example.com/front-small.jpg',
          normal: 'https://example.com/front.jpg',
        },
      },
      {
        name: 'Bala Ged Sanctuary',
        mana_cost: '',
        image_uris: {
          small: 'https://example.com/back-small.jpg',
          normal: 'https://example.com/back.jpg',
        },
      },
    ],
    ...overrides,
  };
}

function transformDfcCard(overrides = {}) {
  return {
    name: 'Delver of Secrets // Insectile Aberration',
    layout: 'transform',
    // A transform DFC's front face IS castable on its own, so Scryfall does
    // give it a top-level mana_cost and image_uris — unlike a modal DFC.
    mana_cost: '{U}',
    power: '1',
    toughness: '1',
    image_uris: {
      small: 'https://example.com/delver-small.jpg',
      normal: 'https://example.com/delver.jpg',
    },
    card_faces: [
      { name: 'Delver of Secrets', mana_cost: '{U}', power: '1', toughness: '1' },
      {
        name: 'Insectile Aberration',
        mana_cost: '',
        power: '3',
        toughness: '2',
        image_uris: {
          small: 'https://example.com/aberration-small.jpg',
          normal: 'https://example.com/aberration.jpg',
        },
      },
    ],
    ...overrides,
  };
}

function splitCard(overrides = {}) {
  return {
    name: 'Fire // Ice',
    layout: 'split',
    // A split card is one physical face — one shared image. Its top-level
    // mana_cost is both halves joined (CR 709.3: a split card has both
    // halves' mana cost outside the stack), unlike a modal DFC's absent one.
    mana_cost: '{1}{R} // {1}{U}',
    image_uris: {
      small: 'https://example.com/fire-ice-small.jpg',
      normal: 'https://example.com/fire-ice.jpg',
    },
    card_faces: [
      { name: 'Fire', mana_cost: '{1}{R}' },
      { name: 'Ice', mana_cost: '{1}{U}' },
    ],
    ...overrides,
  };
}

function adventureCard(overrides = {}) {
  return {
    name: 'Bonecrusher Giant',
    layout: 'adventure',
    // Scryfall gives an adventure card a top-level mana_cost that is BOTH
    // faces joined, same shape as split — but unlike split, only the front
    // (creature) face's own cost is real outside the stack (CR 712.4-style
    // front-face-only, same as frontFaceCharacteristics in @mtg/rules).
    mana_cost: '{2}{R} // {1}{R}',
    power: '4',
    toughness: '3',
    card_faces: [
      { name: 'Bonecrusher Giant', mana_cost: '{2}{R}', power: '4', toughness: '3' },
      { name: 'Stomp', mana_cost: '{1}{R}', power: undefined, toughness: undefined },
    ],
    ...overrides,
  };
}

describe('isTwoSidedLayout', () => {
  it('is true only for transform and modal_dfc', () => {
    expect(isTwoSidedLayout('transform')).toBe(true);
    expect(isTwoSidedLayout('modal_dfc')).toBe(true);
  });

  it('is false for layouts that print on one physical face', () => {
    expect(isTwoSidedLayout('split')).toBe(false);
    expect(isTwoSidedLayout('adventure')).toBe(false);
    expect(isTwoSidedLayout('flip')).toBe(false);
    expect(isTwoSidedLayout('normal')).toBe(false);
  });

  it('is false for a card with no layout at all', () => {
    expect(isTwoSidedLayout(undefined)).toBe(false);
  });
});

describe('frontFaceField', () => {
  it('reads a single-faced card field directly', () => {
    expect(frontFaceField(singleFacedCard(), 'mana_cost')).toBe('{2}{R}');
  });

  it('falls back to the front face for a modal DFC, which has no top-level value', () => {
    expect(frontFaceField(modalDfcCard(), 'mana_cost')).toBe('{2}{G}');
  });

  it('does not combine both faces — only the front face is ever read', () => {
    const card = transformDfcCard();
    expect(frontFaceField(card, 'power')).toBe('1');
    expect(frontFaceField(card, 'toughness')).toBe('1');
  });

  it('returns undefined when neither the card nor its front face has the field', () => {
    expect(frontFaceField(singleFacedCard({ mana_cost: undefined }), 'mana_cost')).toBeUndefined();
  });

  it("reads a split card's combined top-level mana cost — both halves are real outside the stack", () => {
    expect(frontFaceField(splitCard(), 'mana_cost')).toBe('{1}{R} // {1}{U}');
  });

  it('reads only the front face for an adventure card, not the joined top-level value', () => {
    // Regression test: Scryfall's top-level mana_cost for an adventure card
    // is the two faces joined, same shape as split — but only the front
    // (creature) face's own cost is real outside the stack. Preferring the
    // top-level value whenever it's defined (the old implementation) read
    // "{2}{R} // {1}{R}" here instead of the creature's real "{2}{R}".
    const card = adventureCard();
    expect(frontFaceField(card, 'mana_cost')).toBe('{2}{R}');
    expect(frontFaceField(card, 'power')).toBe('4');
    expect(frontFaceField(card, 'toughness')).toBe('3');
  });
});

describe('frontImageUri', () => {
  it('reads a single-faced card image directly', () => {
    expect(frontImageUri(singleFacedCard(), 'small')).toBe(
      'https://example.com/rift-bolt-small.jpg',
    );
  });

  it('falls back to the front face for a modal DFC, which has no top-level image_uris', () => {
    expect(frontImageUri(modalDfcCard(), 'normal')).toBe('https://example.com/front.jpg');
  });

  it('prefers the top-level image over the front face for a layout that has both', () => {
    expect(frontImageUri(transformDfcCard(), 'normal')).toBe('https://example.com/delver.jpg');
  });

  it('a split card reads its one shared image at the top level', () => {
    expect(frontImageUri(splitCard(), 'small')).toBe('https://example.com/fire-ice-small.jpg');
  });

  it('returns null when no image is available at either level', () => {
    expect(frontImageUri({}, 'small')).toBeNull();
  });
});

describe('backImageUri', () => {
  it('returns the back face image for a transform card', () => {
    expect(backImageUri(transformDfcCard(), 'normal')).toBe('https://example.com/aberration.jpg');
  });

  it('returns the back face image for a modal DFC', () => {
    expect(backImageUri(modalDfcCard(), 'small')).toBe('https://example.com/back-small.jpg');
  });

  it('is null for a split card even though it has card_faces', () => {
    expect(backImageUri(splitCard(), 'small')).toBeNull();
  });

  it('is null for a single-faced card', () => {
    expect(backImageUri(singleFacedCard(), 'small')).toBeNull();
  });
});

describe('backFaceName', () => {
  it("returns the back face's own name for a transform card", () => {
    expect(backFaceName(transformDfcCard())).toBe('Insectile Aberration');
  });

  it("returns the back face's own name for a modal DFC", () => {
    expect(backFaceName(modalDfcCard())).toBe('Bala Ged Sanctuary');
  });

  it('is null for a split card even though it has two named faces', () => {
    expect(backFaceName(splitCard())).toBeNull();
  });

  it('is null for a single-faced card', () => {
    expect(backFaceName(singleFacedCard())).toBeNull();
  });
});
