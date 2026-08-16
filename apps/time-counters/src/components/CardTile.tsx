import { useState } from 'react';
import type { TrackedCard } from '../types';
import { MECHANIC_COLOR, MECHANIC_LABEL, chapterRoman, triggerLabel } from '../utils/counters';
import styles from './CardTile.module.css';

interface CardTileProps {
  card: TrackedCard;
  onSetCount: (instanceId: string, count: number) => void;
  onAdjustCount: (instanceId: string, delta: number) => void;
  onRemove: (instanceId: string) => void;
}

/**
 * One card on the virtual tabletop: its art with a color-coded count badge,
 * tap to reveal the controls underneath. A card that's hit its target stays
 * expanded regardless of the tap state — the resolve action shouldn't be
 * something the player has to remember to go looking for.
 */
export default function CardTile({ card, onSetCount, onAdjustCount, onRemove }: CardTileProps) {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(card.count));

  const color = MECHANIC_COLOR[card.mechanic];
  const label =
    card.mechanic === 'custom' ? card.customLabel || 'Custom' : MECHANIC_LABEL[card.mechanic];
  const isReady =
    card.direction === 'decrement'
      ? card.count <= 0
      : card.targetCount != null && card.count >= card.targetCount;
  const expanded = manuallyExpanded || isReady;
  const badgeText =
    card.direction === 'increment' && card.targetCount != null
      ? `${card.count}/${card.targetCount}`
      : String(card.count);
  // The chapter this Saga is currently sitting on — the most recent one its lore count has reached,
  // shown as a standing reference so "what's active right now" never depends on remembering the last
  // precombat-main popup. Doesn't require isReady, since only the *final* chapter counts as ready.
  const currentChapter =
    card.mechanic === 'saga' && card.chapters && card.count > 0
      ? card.chapters[card.count - 1]
      : null;

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
    <div
      className={`${styles.tile} ${isReady ? styles.tileReady : ''}`}
      style={{ ['--tile-accent' as string]: color }}
    >
      <button
        type="button"
        className={styles.artButton}
        onClick={() => setManuallyExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${card.name}, ${card.count} counters. ${expanded ? 'Collapse' : 'Expand'} details.`}
      >
        {card.imageSmall ? (
          <img className={styles.art} src={card.imageSmall} alt={card.name} />
        ) : (
          <div className={`${styles.artFallback} ${card.isToken ? styles.artFallbackToken : ''}`}>
            <span className={styles.artFallbackName}>{card.name}</span>
            {card.isToken && <span className={styles.artFallbackTokenTag}>TOKEN</span>}
          </div>
        )}
        <span className={styles.badge} style={{ background: color }}>
          {badgeText}
        </span>
      </button>

      {expanded && (
        <div className={styles.details}>
          <div className={styles.name}>{card.name}</div>
          <div className={styles.subRow}>
            <span className={styles.mechanicTag} style={{ ['--tag-color' as string]: color }}>
              {label}
            </span>
            {card.isToken && <span className={styles.tokenTag}>Token</span>}
            {!card.autoAdjust && <span className={styles.manualNote}>manual only</span>}
          </div>

          <div className={styles.counterRow}>
            {editing ? (
              <input
                autoFocus
                className={styles.numberInput}
                type="number"
                min={0}
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.numberBtn}
                onClick={startEditing}
                aria-label={`${card.count} counters. Tap to edit.`}
                title="Tap to set an exact count"
              >
                {card.count}
              </button>
            )}
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
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => step(1)}
                aria-label="Add one counter"
              >
                +
              </button>
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

          {currentChapter && !isReady && (
            <div className={styles.resolveBox}>
              <span className={styles.resolveLabel}>Chapter {chapterRoman(card.count)}</span>
              <span className={styles.resolveText}>{currentChapter}</span>
            </div>
          )}

          {isReady && card.resolveNote && (
            <div className={styles.resolveBox}>
              <span className={styles.resolveLabel}>{triggerLabel(card.mechanic)}</span>
              {currentChapter && (
                <span className={styles.resolveText}>
                  Chapter {chapterRoman(card.count)} — {currentChapter}
                </span>
              )}
              <span className={styles.resolveText}>{card.resolveNote}</span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onRemove(card.instanceId)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
