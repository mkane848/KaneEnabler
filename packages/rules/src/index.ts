/**
 * Magic: The Gathering rules primitives shared by both apps. Every export
 * here cites the Comprehensive Rules number it implements and is tested
 * against it (see root CLAUDE.md's hard rule 2) — a primitive belongs here
 * once, and an app consumes it rather than re-deriving it locally.
 *
 * Internal relative imports in this package need an explicit `.js`
 * extension (even though the source is `.ts`) — this package is also built
 * to real CommonJS for commander-recommender/server (see
 * tsconfig.build.json), and that build's node16 resolution requires it.
 * Vite/bundler resolution, which is all the client and time-counters ever
 * use, accepts the same extension against the `.ts` source too.
 */
export { isWithinColorIdentity } from './colorIdentity.js';
export { commanderTax } from './commanderTax.js';
export {
  frontFaceCharacteristics,
  isCommanderEligible,
  type FaceCharacteristics,
  type ScryfallCardLike,
} from './eligibility.js';
export { singletonLimit, type SingletonCardLike } from './singleton.js';
export {
  buildCommanderUnits,
  unitKey,
  type CommanderUnit,
  type PartnerAbility,
  type PartnerCardLike,
} from './partners.js';
export {
  MINUS_ONE_MINUS_ONE_KEYWORDS,
  TIME_COUNTER_KEYWORDS,
  TIME_COUNTER_MECHANICS,
  turnStepForMechanic,
  usesTimeCounters,
  type CounterMechanic,
  type TurnStep,
} from './counters.js';
export { hasChangeling, parseCreatureTypes } from './creatureTypes.js';
export { isCommanderLegal, type LegalityCardLike } from './legality.js';
export {
  COMMANDER_DECK_SIZE,
  combinedColorIdentity,
  findColorIdentityViolations,
  isValidDeckSize,
  type DeckCardLike,
} from './deckLegality.js';
