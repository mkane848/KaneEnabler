import type { TurnChange } from '../types';
import { triggerLabel } from '../utils/counters';
import styles from './ChangeSummaryModal.module.css';

interface ChangeSummaryModalProps {
  changes: TurnChange[];
  turn: number;
  onResolve: (instanceId: string) => void;
  onClose: () => void;
}

export default function ChangeSummaryModal({ changes, turn, onResolve, onClose }: ChangeSummaryModalProps) {
  const readyCount = changes.filter(c => c.hitTarget).length;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-summary-title"
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="change-summary-title" className={styles.title}>
            Upkeep — turn {turn}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
        {readyCount > 0 && (
          <p className={styles.subtitle}>
            {readyCount} card{readyCount === 1 ? '' : 's'} ready to resolve
          </p>
        )}

        <div className={styles.list}>
          {changes.map(c => (
            <div key={c.instanceId} className={`${styles.row} ${c.hitTarget ? styles.rowReady : ''}`}>
              <div>
                <div className={styles.name}>{c.name}</div>
                {c.hitTarget && (
                  <div className={styles.readyNote}>
                    <span className={styles.readyLabel}>{triggerLabel(c.mechanic)}:</span> {c.resolveNote}
                  </div>
                )}
              </div>
              <div className={styles.right}>
                <span className={styles.change}>
                  {c.from} → {c.to}
                </span>
                {c.hitTarget && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onResolve(c.instanceId)}>
                    Done
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
