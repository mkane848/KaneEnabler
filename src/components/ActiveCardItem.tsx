import { useState } from 'react';
import type { TrackedCard } from '../types';
import { MECHANIC_COLOR, MECHANIC_LABEL } from '../utils/counters';
import CountPips from './CountPips';
import styles from './ActiveCardItem.module.css';

interface ActiveCardItemProps {
  card: TrackedCard;
  onSetCount: (instanceId: string, count: number) => void;
  onAdjustCount: (instanceId: string, delta: number) => void;
  onRemove: (instanceId: string) => void;
}

export default function ActiveCardItem({
  card,
  onSetCount,
  onAdjustCount,
  onRemove,
}: ActiveCardItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(card.count));

  const color = MECHANIC_COLOR[card.mechanic];
  const label = card.mechanic === 'custom' ? card.customLabel || 'Custom' : MECHANIC_LABEL[card.mechanic];
  const isReady = card.count <= 0;

  function startEditing() {
    setDraft(String(card.count));
    setEditing(true);
  }

  function commit() {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onSetCount(card.instanceId, parsed);
    setEditing(false);
  }

  function step(delta: number) {
    // Relative, so back-to-back taps accumulate instead of each recomputing
    // from the count this render happened to capture.
    onAdjustCount(card.instanceId, delta);
  }

  return (
    <div className={`${styles.card} ${isReady ? styles.cardReady : ''}`}>
      <div className={styles.top}>
        {card.imageSmall ? (
          <img className={styles.thumb} src={card.imageSmall} alt="" />
        ) : (
          <div className={styles.thumbFallback} />
        )}
        <div className={styles.meta}>
          <div className={styles.name}>{card.name}</div>
          <div className={styles.subRow}>
            <span className={styles.badge} style={{ ['--badge-color' as string]: color }}>
              <span className={styles.badgeDot} />
              {label}
            </span>
            <span className={styles.addedNote}>· added turn {card.turnAdded}</span>
            {!card.autoDecrement && <span className={styles.manualNote}>· manual only</span>}
          </div>
        </div>
        <button
          type="button"
          className={styles.removeBtn}
          onClick={() => onRemove(card.instanceId)}
          aria-label={`Remove ${card.name} from tracker`}
          title="Remove from tracker"
        >
          ×
        </button>
      </div>

      <div className={styles.counterRow}>
        <div className={styles.pipsAndNumber}>
          <CountPips count={card.count} startingCount={card.startingCount} color={color} />
          {editing ? (
            <input
              autoFocus
              className={styles.numberInput}
              type="number"
              min={0}
              inputMode="numeric"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.numberBtn}
              onClick={startEditing}
              aria-label={`${card.count} of ${card.startingCount} counters remaining. Tap to edit.`}
              title="Tap to set an exact count"
            >
              {card.count}
            </button>
          )}
        </div>

        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => step(-1)}
            disabled={card.count <= 0}
            aria-label="Remove one counter"
          >
            −
          </button>
          <button type="button" className={styles.stepBtn} onClick={() => step(1)} aria-label="Add one counter">
            +
          </button>
        </div>
      </div>

      {isReady && (
        <div className={styles.resolveBox}>
          <span className={styles.resolveText}>{card.resolveNote}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onRemove(card.instanceId)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
