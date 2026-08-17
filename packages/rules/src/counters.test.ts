import { describe, expect, it } from 'vitest';
import { turnStepForMechanic, usesTimeCounters } from './counters';

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
