import styles from './CountPips.module.css';

const MAX_PIPS = 10;

interface CountPipsProps {
  count: number;
  startingCount: number;
  color: string;
}

/**
 * A quick visual read of "how close is this to resolving" — filled pips are
 * counters still on the card, hollow pips are ones already removed. Falls
 * back to nothing (just the numeral, rendered by the caller) once the
 * starting count is too high to scan at a glance.
 */
export default function CountPips({ count, startingCount, color }: CountPipsProps) {
  if (startingCount <= 0 || startingCount > MAX_PIPS) return null;

  return (
    <div className={styles.row} aria-hidden="true">
      {Array.from({ length: startingCount }, (_, i) => i < count).map((filled, i) => (
        <span
          key={i}
          className={filled ? styles.pipFilled : styles.pipEmpty}
          style={filled ? { background: color } : undefined}
        />
      ))}
    </div>
  );
}
