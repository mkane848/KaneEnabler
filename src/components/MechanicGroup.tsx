import type { TrackedCard } from '../types';
import CardTile from './CardTile';
import styles from './MechanicGroup.module.css';

interface MechanicGroupProps {
  label: string;
  color: string;
  cards: TrackedCard[];
  onSetCount: (instanceId: string, count: number) => void;
  onAdjustCount: (instanceId: string, delta: number) => void;
  onRemove: (instanceId: string) => void;
}

/** One counter type's section of the board — a labeled, color-keyed grid of card tiles. */
export default function MechanicGroup({
  label,
  color,
  cards,
  onSetCount,
  onAdjustCount,
  onRemove,
}: MechanicGroupProps) {
  return (
    <section className={styles.group}>
      <header className={styles.header}>
        <span className={styles.dot} style={{ background: color }} />
        <h2 className={styles.label}>{label}</h2>
        <span className={styles.count}>{cards.length}</span>
      </header>
      <div className={styles.grid}>
        {cards.map(card => (
          <CardTile
            key={card.instanceId}
            card={card}
            onSetCount={onSetCount}
            onAdjustCount={onAdjustCount}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  );
}
