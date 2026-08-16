import type { TurnChange, TurnStep } from '../types';
import { chapterRoman, triggerLabel } from '../utils/counters';
import styles from './ChangeSummaryModal.module.css';

interface ChangeSummaryModalProps {
  changes: TurnChange[];
  turn: number;
  onResolve: (instanceId: string) => void;
  onClose: () => void;
}

const STEP_LABEL: Record<TurnStep, string> = {
  upkeep: 'Upkeep',
  precombatMain: 'Precombat main',
};

const STEP_ORDER: TurnStep[] = ['upkeep', 'precombatMain'];

/**
 * The Next Turn summary, grouped by the step each change actually happens
 * on — upkeep (Suspend/Vanishing/Fading) always shown before precombat main
 * (Sagas), matching turn order, so a Saga chapter reads as "this is what
 * happened after upkeep," not lumped in with unrelated counters.
 */
export default function ChangeSummaryModal({ changes, turn, onResolve, onClose }: ChangeSummaryModalProps) {
  const readyCount = changes.filter(c => c.hitTarget).length;
  const groups = STEP_ORDER.map(step => ({ step, items: changes.filter(c => c.step === step) })).filter(
    g => g.items.length > 0,
  );

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
            Turn {turn}
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

        {groups.map(group => (
          <div key={group.step}>
            <h3 className={styles.stepHeading}>{STEP_LABEL[group.step]}</h3>
            <div className={styles.list}>
              {group.items.map((c, i) => (
                <div key={`${c.instanceId}-${i}`} className={`${styles.row} ${c.hitTarget ? styles.rowReady : ''}`}>
                  <div>
                    <div className={styles.name}>{c.name}</div>
                    {c.chapter && (
                      <div className={styles.readyNote}>
                        <span className={styles.readyLabel}>Chapter {chapterRoman(c.chapter.number)}:</span>{' '}
                        {c.chapter.text}
                      </div>
                    )}
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
        ))}
      </div>
    </div>
  );
}
