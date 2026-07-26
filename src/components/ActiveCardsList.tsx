import type { Mechanic, TrackedCard } from '../types';
import { MECHANIC_COLOR, MECHANIC_LABEL } from '../utils/counters';
import MechanicGroup from './MechanicGroup';
import styles from './ActiveCardsList.module.css';

interface ActiveCardsListProps {
  cards: TrackedCard[];
  onSetCount: (instanceId: string, count: number) => void;
  onAdjustCount: (instanceId: string, delta: number) => void;
  onRemove: (instanceId: string) => void;
  onOpenTimeTravel: () => void;
}

/** Built-in mechanics group first, in this order; custom counter names follow, alphabetically. */
const MECHANIC_ORDER: Mechanic[] = ['suspend', 'vanishing', 'fading', 'custom'];

/** Cards sharing a mechanic sit together; 'custom' cards also split by their own counter name — an Age counter and a Charge counter aren't the same thing just because both fell back to 'custom'. */
function groupKey(card: TrackedCard): string {
  return card.mechanic === 'custom' ? `custom:${card.customLabel || 'Custom'}` : card.mechanic;
}

function groupLabel(card: TrackedCard): string {
  return card.mechanic === 'custom' ? card.customLabel || 'Custom' : MECHANIC_LABEL[card.mechanic];
}

/** How many steps remain before this card's counter reaches its trigger — smaller sorts first. Open-ended increments (no target) have no urgency signal, so they sort last. */
function distanceToTarget(card: TrackedCard): number {
  if (card.direction === 'decrement') return card.count;
  if (card.targetCount != null) return Math.max(0, card.targetCount - card.count);
  return Number.POSITIVE_INFINITY;
}

interface Group {
  key: string;
  label: string;
  color: string;
  cards: TrackedCard[];
}

function buildGroups(cards: TrackedCard[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const card of cards) {
    const key = groupKey(card);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: groupLabel(card), color: MECHANIC_COLOR[card.mechanic], cards: [] };
      byKey.set(key, group);
    }
    group.cards.push(card);
  }

  for (const group of byKey.values()) {
    group.cards.sort((a, b) => {
      const d = distanceToTarget(a) - distanceToTarget(b);
      if (d !== 0) return d;
      return a.turnAdded - b.turnAdded;
    });
  }

  return [...byKey.values()].sort((a, b) => {
    const aMechanic = a.cards[0].mechanic;
    const bMechanic = b.cards[0].mechanic;
    const aOrder = MECHANIC_ORDER.indexOf(aMechanic);
    const bOrder = MECHANIC_ORDER.indexOf(bMechanic);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.label.localeCompare(b.label);
  });
}

export default function ActiveCardsList({
  cards,
  onSetCount,
  onAdjustCount,
  onRemove,
  onOpenTimeTravel,
}: ActiveCardsListProps) {
  if (cards.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Nothing tracked yet</div>
          <p className={styles.emptyBody}>
            Suspend a spell or drop a Vanishing creature? Tap “Add a card” above to start tracking its counters.
          </p>
        </div>
      </div>
    );
  }

  const groups = buildGroups(cards);

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionRow}>
        <p className={styles.sectionLabel}>Tracking {cards.length} card{cards.length === 1 ? '' : 's'}</p>
        <button type="button" className={styles.timeTravelLink} onClick={onOpenTimeTravel}>
          Time Travel →
        </button>
      </div>
      {groups.map(group => (
        <MechanicGroup
          key={group.key}
          label={group.label}
          color={group.color}
          cards={group.cards}
          onSetCount={onSetCount}
          onAdjustCount={onAdjustCount}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
