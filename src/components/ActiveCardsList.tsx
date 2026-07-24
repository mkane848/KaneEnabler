import type { TrackedCard } from '../types';
import ActiveCardItem from './ActiveCardItem';
import styles from './ActiveCardsList.module.css';

interface ActiveCardsListProps {
  cards: TrackedCard[];
  onSetCount: (instanceId: string, count: number) => void;
  onRemove: (instanceId: string) => void;
}

export default function ActiveCardsList({ cards, onSetCount, onRemove }: ActiveCardsListProps) {
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

  const sorted = [...cards].sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    return a.turnAdded - b.turnAdded;
  });

  return (
    <div className={styles.wrap}>
      <p className={styles.sectionLabel}>Tracking {cards.length} card{cards.length === 1 ? '' : 's'}</p>
      {sorted.map(card => (
        <ActiveCardItem key={card.instanceId} card={card} onSetCount={onSetCount} onRemove={onRemove} />
      ))}
    </div>
  );
}
