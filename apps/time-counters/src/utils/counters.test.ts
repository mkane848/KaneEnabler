import { describe, expect, it } from 'vitest';
import {
  chapterRoman,
  detectMechanic,
  hasHitTarget,
  mechanicDirection,
  newlyTriggeredChapters,
  resolveFieldLabel,
  turnStepForMechanic,
  usesTimeCounters,
} from './counters';

describe('detectMechanic', () => {
  it('detects Suspend N and returns a decrementing count', () => {
    expect(detectMechanic('Suspend 3—{1}{R}')).toEqual({
      mechanic: 'suspend',
      direction: 'decrement',
      count: 3,
    });
  });

  it('detects Suspend X as a null (manual-entry) count', () => {
    expect(detectMechanic('Suspend X—{X}{U}')).toEqual({
      mechanic: 'suspend',
      direction: 'decrement',
      count: null,
    });
  });

  it('detects Vanishing N', () => {
    expect(detectMechanic('Vanishing 4')).toEqual({
      mechanic: 'vanishing',
      direction: 'decrement',
      count: 4,
    });
  });

  it('detects Vanishing via the reminder-text phrasing when the keyword count is on a separate line', () => {
    expect(
      detectMechanic('This permanent enters the battlefield with four time counters on it.'),
    ).toEqual({
      mechanic: 'vanishing',
      direction: 'decrement',
      count: 4,
    });
  });

  it('detects Fading N', () => {
    expect(detectMechanic('Fading 2 (This creature enters with two fade counters on it.)')).toEqual(
      {
        mechanic: 'fading',
        direction: 'decrement',
        count: 2,
      },
    );
  });

  it('returns null for oracle text with no recognized keyword', () => {
    expect(detectMechanic('Flying, vigilance')).toBeNull();
  });

  it('returns null when there is no oracle text at all', () => {
    expect(detectMechanic(undefined)).toBeNull();
  });
});

describe('hasHitTarget', () => {
  it('a decrementing card (Suspend/Vanishing) hits its target at 0', () => {
    expect(hasHitTarget({ mechanic: 'suspend', count: 0, direction: 'decrement' })).toBe(true);
    expect(hasHitTarget({ mechanic: 'vanishing', count: 1, direction: 'decrement' })).toBe(false);
  });

  it('an incrementing card hits its target once count reaches it', () => {
    expect(
      hasHitTarget({ mechanic: 'custom', count: 3, direction: 'increment', targetCount: 3 }),
    ).toBe(true);
    expect(
      hasHitTarget({ mechanic: 'custom', count: 2, direction: 'increment', targetCount: 3 }),
    ).toBe(false);
  });

  it('an open-ended increment (no targetCount) never hits a target', () => {
    expect(hasHitTarget({ mechanic: 'custom', count: 99, direction: 'increment' })).toBe(false);
  });

  it('CR 702.32b — a Fading card at 0 has not hit its target until a fade-counter removal has actually failed', () => {
    expect(hasHitTarget({ mechanic: 'fading', count: 0, direction: 'decrement' })).toBe(false);
    expect(
      hasHitTarget({
        mechanic: 'fading',
        count: 0,
        direction: 'decrement',
        fadeExhausted: false,
      }),
    ).toBe(false);
  });

  it('a Fading card hits its target once fadeExhausted is set, regardless of count', () => {
    expect(
      hasHitTarget({
        mechanic: 'fading',
        count: 0,
        direction: 'decrement',
        fadeExhausted: true,
      }),
    ).toBe(true);
  });
});

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

describe('newlyTriggeredChapters', () => {
  const chapters = ['Chapter I text', 'Chapter II text', 'Chapter III text'];

  it('fires each chapter the lore count newly reaches, not just the final one', () => {
    expect(newlyTriggeredChapters(chapters, 0, 1)).toEqual([{ number: 1, text: 'Chapter I text' }]);
    expect(newlyTriggeredChapters(chapters, 1, 2)).toEqual([
      { number: 2, text: 'Chapter II text' },
    ]);
  });

  it('fires every chapter skipped over when the count jumps by more than one', () => {
    expect(newlyTriggeredChapters(chapters, 0, 3)).toEqual([
      { number: 1, text: 'Chapter I text' },
      { number: 2, text: 'Chapter II text' },
      { number: 3, text: 'Chapter III text' },
    ]);
  });

  it('does not refire a chapter already marked triggered', () => {
    expect(newlyTriggeredChapters(chapters, 0, 2, [1])).toEqual([
      { number: 2, text: 'Chapter II text' },
    ]);
  });

  it('never fires past the last written chapter', () => {
    expect(newlyTriggeredChapters(chapters, 2, 5)).toEqual([
      { number: 3, text: 'Chapter III text' },
    ]);
  });
});

describe('chapterRoman', () => {
  it('renders known chapter numbers as roman numerals', () => {
    expect(chapterRoman(1)).toBe('I');
    expect(chapterRoman(3)).toBe('III');
  });

  it('falls back to the plain number past the known range', () => {
    expect(chapterRoman(99)).toBe('99');
  });
});

describe('resolveFieldLabel', () => {
  it('decrementing mechanics always resolve at 0', () => {
    expect(resolveFieldLabel('decrement')).toBe('What happens at 0');
  });

  it('an incrementing mechanic with a known target names it', () => {
    expect(resolveFieldLabel('increment', 3)).toBe('What happens at 3');
  });

  it('an open-ended increment has no single trigger point', () => {
    expect(resolveFieldLabel('increment')).toBe('Notes (optional)');
  });
});

describe('mechanicDirection', () => {
  it('built-in mechanics have a fixed direction regardless of fallback', () => {
    expect(mechanicDirection('suspend', 'increment')).toBe('decrement');
    expect(mechanicDirection('saga', 'decrement')).toBe('increment');
  });

  it('custom uses the fallback direction', () => {
    expect(mechanicDirection('custom', 'increment')).toBe('increment');
    expect(mechanicDirection('custom')).toBe('decrement');
  });
});
