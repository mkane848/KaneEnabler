import { describe, expect, it } from 'vitest';
import {
  MINUS_ONE_MINUS_ONE_KEYWORDS,
  TIME_COUNTER_KEYWORDS,
  turnStepForMechanic,
  usesTimeCounters,
} from './counters';

describe('usesTimeCounters', () => {
  it('is true only for suspend and vanishing', () => {
    expect(usesTimeCounters('suspend')).toBe(true);
    expect(usesTimeCounters('vanishing')).toBe(true);
    expect(usesTimeCounters('fading')).toBe(false);
    expect(usesTimeCounters('saga')).toBe(false);
    expect(usesTimeCounters('custom')).toBe(false);
  });
});

describe('turnStepForMechanic', () => {
  it('routes Saga to precombat main and everything else to upkeep', () => {
    expect(turnStepForMechanic('saga')).toBe('precombatMain');
    expect(turnStepForMechanic('suspend')).toBe('upkeep');
    expect(turnStepForMechanic('vanishing')).toBe('upkeep');
    expect(turnStepForMechanic('fading')).toBe('upkeep');
    expect(turnStepForMechanic('custom')).toBe('upkeep');
  });
});

describe('MINUS_ONE_MINUS_ONE_KEYWORDS', () => {
  it('names Blight and Persist, both of which use -1/-1 counters', () => {
    expect(MINUS_ONE_MINUS_ONE_KEYWORDS).toContain('blight');
    expect(MINUS_ONE_MINUS_ONE_KEYWORDS).toContain('persist');
  });
});

describe('TIME_COUNTER_KEYWORDS', () => {
  it('includes TIME_COUNTER_MECHANICS plus Time Travel', () => {
    expect(TIME_COUNTER_KEYWORDS).toContain('suspend');
    expect(TIME_COUNTER_KEYWORDS).toContain('vanishing');
    expect(TIME_COUNTER_KEYWORDS).toContain('time travel');
  });
});
