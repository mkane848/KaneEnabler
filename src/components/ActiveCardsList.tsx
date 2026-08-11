import type { CommanderId, Mechanic, TrackedCard } from '../types';
import CardTile from './CardTile';
import CommanderFieldTile, { type CommanderFieldCard } from './CommanderFieldTile';
import styles from './ActiveCardsList.module.css';

interface ActiveCardsListProps {
  cards: TrackedCard[];
  commanderCards: CommanderFieldCard[];
  onSetCount: (instanceId: string, count: number) => void;
  onAdjustCount: (instanceId: string, delta: number) => void;
  onRemove: (instanceId: string) => void;
  onOpenTimeTravel: () => void;
  onManageCommander: (id: CommanderId, imageSmall?: string) => void;
  onReturnCommanderToCommandZone: (id: CommanderId) => void;
}

/** Built-in mechanics sort first, in this order; custom counter names follow, alphabetically. */
const MECHANIC_ORDER: Mechanic[] = ['suspend', 'vanishing', 'fading', 'saga', 'custom'];

/** How many steps remain before this card's counter reaches its trigger — smaller sorts first. Open-ended increments (no target) have no urgency signal, so they sort last. */
function distanceToTarget(card: TrackedCard): number {
  if (card.direction === 'decrement') return card.count;
  if (card.targetCount != null) return Math.max(0, card.targetCount - card.count);
  return Number.POSITIVE_INFINITY;
}

function customLabel(card: TrackedCard): string {
  return card.customLabel || 'Custom';
}

/**
 * One flat, sorted list — commanders currently on the battlefield first,
 * then tracked cards grouped by mechanic (Suspend, Vanishing, Fading, Saga,
 * Custom-by-label) and by urgency within each. There's no section-per-
 * mechanic layout here on purpose: on mobile that wasted a header's worth of
 * vertical space per mechanic even when a group had one card in it. Each
 * tile's own colored badge/accent (see CardTile, CommanderFieldTile) is what
 * tells mechanics apart now, not a row break.
 */
function sortCards(cards: TrackedCard[]): TrackedCard[] {
  return [...cards].sort((a, b) => {
    if (a.mechanic !== b.mechanic) {
      const orderDiff = MECHANIC_ORDER.indexOf(a.mechanic) - MECHANIC_ORDER.indexOf(b.mechanic);
      if (orderDiff !== 0) return orderDiff;
    }
    if (a.mechanic === 'custom' && b.mechanic === 'custom') {
      const labelDiff = customLabel(a).localeCompare(customLabel(b));
      if (labelDiff !== 0) return labelDiff;
    }
    const distanceDiff = distanceToTarget(a) - distanceToTarget(b);
    if (distanceDiff !== 0) return distanceDiff;
    return a.turnAdded - b.turnAdded;
  });
}

export default function ActiveCardsList({
  cards,
  commanderCards,
  onSetCount,
  onAdjustCount,
  onRemove,
  onOpenTimeTravel,
  onManageCommander,
  onReturnCommanderToCommandZone,
}: ActiveCardsListProps) {
  if (cards.length === 0 && commanderCards.length === 0) {
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

  const sorted = sortCards(cards);
  const total = cards.length + commanderCards.length;

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionRow}>
        <p className={styles.sectionLabel}>Tracking {total} card{total === 1 ? '' : 's'}</p>
        <button type="button" className={styles.timeTravelLink} onClick={onOpenTimeTravel}>
          Time Travel →
        </button>
      </div>
      <div className={styles.grid}>
        {commanderCards.map(commander => (
          <CommanderFieldTile
            key={commander.id}
            commander={commander}
            onManage={onManageCommander}
            onReturnToCommandZone={onReturnCommanderToCommandZone}
          />
        ))}
        {sorted.map(card => (
          <CardTile
            key={card.instanceId}
            card={card}
            onSetCount={onSetCount}
            onAdjustCount={onAdjustCount}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
