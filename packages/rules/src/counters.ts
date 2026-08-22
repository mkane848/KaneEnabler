/**
 * Which of a tracked mechanic's counters are real *time* counters versus
 * fade or lore counters, and which turn step auto-adjusts each one — the
 * taxonomy a Suspend/Vanishing/Fading/Saga tracker's turn-cycle logic
 * (e.g. "next turn", "time travel") is built on.
 */

/**
 * The mechanics this taxonomy knows how to place, plus 'custom' as an
 * escape hatch for a caller-tracked counter with no fixed Magic rule
 * behind it. 'custom' matches neither TIME_COUNTER_MECHANICS nor Saga
 * below, so it falls through to each function's default (not a time
 * counter; upkeep) rather than needing a case of its own.
 */
export type CounterMechanic = 'suspend' | 'vanishing' | 'fading' | 'saga' | 'custom';

/** Which turn step produced a change — see turnStepForMechanic. */
export type TurnStep = 'upkeep' | 'precombatMain';

/**
 * Mechanics that use real *time counters* (rule 702.62): Suspend places
 * them at exile, and Vanishing adopted the same counter object rather
 * than defining its own. Fading uses fade counters instead (rule 702.32)
 * and Saga uses lore counters (rule 714) — neither is a time counter,
 * even though a caller may track all four through the same
 * increment/decrement UI.
 */
export const TIME_COUNTER_MECHANICS: readonly CounterMechanic[] = ['suspend', 'vanishing'];

export function usesTimeCounters(mechanic: CounterMechanic): boolean {
  return TIME_COUNTER_MECHANICS.includes(mechanic);
}

/**
 * Which turn step auto-adjusts a given mechanic's counter: Suspend,
 * Vanishing, and Fading all tick down at upkeep (rules 500–514), while a
 * Saga gains a lore counter as precombat main begins (rule 714).
 */
export function turnStepForMechanic(mechanic: CounterMechanic): TurnStep {
  return mechanic === 'saga' ? 'precombatMain' : 'upkeep';
}

/**
 * Keywords whose own reminder text — stripped by any caller that reads
 * printed rules text rather than the keyword's mechanical effect — is the
 * *only* place they ever say what counter they use. Both put -1/-1
 * counters on a creature without printing "-1/-1" anywhere else: Blight (a
 * keyword action, rule 701.68) chooses a creature and puts N on it;
 * Persist (rule 702.79) returns the permanent with one on death.
 */
export const MINUS_ONE_MINUS_ONE_KEYWORDS: readonly string[] = ['blight', 'persist'];

/**
 * Words that mean *time counter* (rule 702.62) beyond the bare phrase
 * itself: Suspend (702.62) and Vanishing (702.63) both use time counters
 * without either keyword naming them outside reminder text, and Time
 * Travel (a keyword action, rule 701.56) directly adds or removes them.
 */
export const TIME_COUNTER_KEYWORDS: readonly string[] = [...TIME_COUNTER_MECHANICS, 'time travel'];
