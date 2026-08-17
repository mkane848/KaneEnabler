import type { CommanderUnit as RulesCommanderUnit } from '@mtg/rules';
import type { CardRow } from '../types';

export { buildCommanderUnits, unitKey } from '@mtg/rules';

/**
 * A commander as actually played: one card, or two under a Partner-family
 * ability (702.124). Every card in `cards` is jointly "the commander" —
 * there's no primary/secondary in the rules (702.124e), so this is an array
 * rather than a "main card + optional partner" shape.
 *
 * The pairing rules themselves live in `@mtg/rules` — this is just that
 * package's `CommanderUnit` specialized to this app's own `CardRow`, so
 * existing callers don't need to name the generic themselves.
 */
export type CommanderUnit = RulesCommanderUnit<CardRow>;
