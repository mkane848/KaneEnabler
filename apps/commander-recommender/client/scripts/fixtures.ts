import type { CommanderCardDTO, CommanderSuggestionDTO, SupportingCardDTO } from '../src/types';

let counter = 0;

/** A supporting card, for tests that only care about its name/quantity. */
export function makeSupportingCard(overrides: Partial<SupportingCardDTO> = {}): SupportingCardDTO {
  return {
    name: 'Fake Card',
    quantity: 1,
    typeLine: null,
    isGameChanger: false,
    manaValue: null,
    manaCost: null,
    imageUri: null,
    backImageUri: null,
    backName: null,
    scryfallUri: null,
    ...overrides,
  };
}

/** One card of a commander unit, for tests that build a suggestion by hand. */
export function makeCommanderCard(overrides: Partial<CommanderCardDTO> = {}): CommanderCardDTO {
  const name = overrides.name ?? `Test Commander ${counter++}`;
  return {
    oracleId: name,
    name,
    imageUri: null,
    backImageUri: null,
    backName: null,
    colorIdentity: [],
    typeLine: null,
    oracleText: null,
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    scryfallUri: null,
    isGameChanger: false,
    ...overrides,
  };
}

/** A minimally-filled, single-card suggestion, so each test only has to
 * spell out the fields it actually cares about. Pass `cards` directly to
 * test a Partner/Background pair instead of the default solo unit. */
export function makeSuggestion(overrides: Partial<CommanderSuggestionDTO> = {}): CommanderSuggestionDTO {
  const cards = overrides.cards ?? [makeCommanderCard()];
  return {
    unitId: cards.map((c) => c.oracleId).join('+'),
    cards,
    colorIdentity: [],
    score: 0,
    matchedThemes: [],
    matchedCreatureTypes: [],
    matchedKeywords: [],
    includedCardCount: 0,
    themeSupport: [],
    kindredSupport: [],
    keywordSupport: [],
    gameChangerCards: [],
    gameChangerCount: 0,
    bracket: { label: 'Exhibition / Core', range: 'Bracket 1–2', note: '' },
    ...overrides,
  };
}
