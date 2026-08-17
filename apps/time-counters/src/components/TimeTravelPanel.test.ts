import { describe, expect, it } from 'vitest';
import type { RoseTylerState, TrackedCard } from '../types';
import { buildTimeTravelTargets } from './TimeTravelPanel';

function trackedCard(overrides: Partial<TrackedCard> = {}): TrackedCard {
  return {
    instanceId: 'c1',
    cardId: 'card1',
    name: 'Test Card',
    mechanic: 'suspend',
    count: 2,
    startingCount: 3,
    direction: 'decrement',
    autoAdjust: true,
    resolveNote: 'Cast it for free from exile (ignore timing restrictions).',
    turnAdded: 1,
    ...overrides,
  };
}

function rose(overrides: Partial<RoseTylerState> = {}): RoseTylerState {
  return { castCount: 0, onBattlefield: false, timeCounters: 0, ...overrides };
}

describe('buildTimeTravelTargets', () => {
  it('offers a suspended card with counters remaining', () => {
    const targets = buildTimeTravelTargets(
      [trackedCard({ mechanic: 'suspend', count: 2 })],
      rose(),
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ id: 'c1', mechanic: 'suspend', count: 2 });
  });

  it('excludes a suspended card once its last counter is removed — it has already been cast', () => {
    const targets = buildTimeTravelTargets(
      [trackedCard({ mechanic: 'suspend', count: 0 })],
      rose(),
    );
    expect(targets).toEqual([]);
  });

  it('excludes a Vanishing card at 0 counters the same way', () => {
    const targets = buildTimeTravelTargets(
      [trackedCard({ mechanic: 'vanishing', count: 0 })],
      rose(),
    );
    expect(targets).toEqual([]);
  });

  it('never offers Fading or Saga, regardless of count', () => {
    const targets = buildTimeTravelTargets(
      [
        trackedCard({ mechanic: 'fading', count: 2 }),
        trackedCard({
          instanceId: 'c2',
          mechanic: 'saga',
          direction: 'increment',
          count: 1,
          targetCount: 3,
        }),
      ],
      rose(),
    );
    expect(targets).toEqual([]);
  });

  it('offers Rose Tyler herself only once she has Bad Wolf counters', () => {
    expect(buildTimeTravelTargets([], rose({ timeCounters: 0 }))).toEqual([]);
    const targets = buildTimeTravelTargets([], rose({ timeCounters: 3 }));
    expect(targets).toEqual([expect.objectContaining({ id: 'rose', count: 3 })]);
  });
});
