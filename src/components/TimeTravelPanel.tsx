import { useState, type FormEvent } from 'react';
import type { TrackedCard } from '../types';
import { MECHANIC_COLOR, MECHANIC_LABEL } from '../utils/counters';
import styles from './TimeTravelPanel.module.css';

type Delta = -1 | 0 | 1;

interface TimeTravelPanelProps {
  cards: TrackedCard[];
  onApply: (choices: { instanceId: string; delta: Delta }[], passInfo: { current: number; total: number }) => void;
  onClose: () => void;
}

/**
 * Time Travel: "For each suspended card you own and each permanent you
 * control with a time counter on it, you may add or remove a time
 * counter." One pass is one independent choice per card, not a free
 * stepper — the whole point is that you can only ever move a counter by
 * one in either direction per invocation.
 *
 * Some sources of Time Travel say "time travel N times" (The Tenth
 * Doctor's Timey-Wimey ability, for {7}, does it three times), so this
 * asks up front how many passes are being resolved and walks through them
 * one at a time — each pass's choices apply immediately, so nothing is
 * lost if the sheet gets closed partway through, and the player always
 * knows how many passes are left instead of losing count.
 */
export default function TimeTravelPanel({ cards, onApply, onClose }: TimeTravelPanelProps) {
  const [stage, setStage] = useState<'setup' | 'pass'>('setup');
  const [timesDraft, setTimesDraft] = useState('1');
  const [totalPasses, setTotalPasses] = useState(1);
  const [currentPass, setCurrentPass] = useState(1);
  const [choices, setChoices] = useState<Record<string, Delta>>({});

  function startPasses(e: FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.round(Number(timesDraft)) || 1);
    setTotalPasses(n);
    setCurrentPass(1);
    setChoices({});
    setStage('pass');
  }

  function setChoice(instanceId: string, delta: Delta) {
    setChoices(prev => ({ ...prev, [instanceId]: prev[instanceId] === delta ? 0 : delta }));
  }

  function commitPass() {
    onApply(
      cards.map(c => ({ instanceId: c.instanceId, delta: choices[c.instanceId] ?? 0 })),
      { current: currentPass, total: totalPasses },
    );
    if (currentPass >= totalPasses) {
      onClose();
    } else {
      setCurrentPass(p => p + 1);
      setChoices({});
    }
  }

  const remaining = totalPasses - currentPass;
  const isLastPass = remaining <= 0;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-travel-title"
        onClick={e => e.stopPropagation()}
      >
        {stage === 'setup' ? (
          <form onSubmit={startPasses}>
            <div className={styles.header}>
              <h2 id="time-travel-title" className={styles.title}>
                Time Travel
              </h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
            </div>
            <p className={styles.subtitle}>
              For each card, you may add or remove one time counter. How many times are you
              resolving Time Travel?
            </p>
            <label className={styles.fieldLabel} htmlFor="times-count">
              Number of times
            </label>
            <input
              id="times-count"
              autoFocus
              className="input"
              type="number"
              min={1}
              inputMode="numeric"
              value={timesDraft}
              onChange={e => setTimesDraft(e.target.value)}
            />
            <div className={styles.actions}>
              <button type="submit" className="btn btn-primary">
                Start
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className={styles.header}>
              <h2 id="time-travel-title" className={styles.title}>
                Time Travel — pass {currentPass} of {totalPasses}
              </h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Stop here
              </button>
            </div>
            <p className={styles.subtitle}>
              {isLastPass
                ? 'Last pass.'
                : `${remaining} more pass${remaining === 1 ? '' : 'es'} after this one.`}
            </p>

            <div className={styles.list}>
              {cards.map(card => {
                const color = MECHANIC_COLOR[card.mechanic];
                const label =
                  card.mechanic === 'custom' ? card.customLabel || 'Custom' : MECHANIC_LABEL[card.mechanic];
                const choice = choices[card.instanceId] ?? 0;
                const canRemove = card.count > 0;
                const canAdd = !(
                  card.direction === 'increment' &&
                  card.targetCount != null &&
                  card.count >= card.targetCount
                );

                return (
                  <div key={card.instanceId} className={styles.row}>
                    <div className={styles.rowMeta}>
                      <div className={styles.name}>{card.name}</div>
                      <span className={styles.tag} style={{ ['--tag-color' as string]: color }}>
                        {label}
                      </span>
                    </div>
                    <div className={styles.rowRight}>
                      <span className={styles.preview}>
                        {choice !== 0 ? `${card.count} → ${card.count + choice}` : card.count}
                      </span>
                      <div className={styles.choiceRow}>
                        <button
                          type="button"
                          className={`${styles.choiceBtn} ${choice === -1 ? styles.choiceBtnActive : ''}`}
                          onClick={() => setChoice(card.instanceId, -1)}
                          disabled={!canRemove}
                          aria-label={`Remove one time counter from ${card.name}`}
                          aria-pressed={choice === -1}
                        >
                          −1
                        </button>
                        <button
                          type="button"
                          className={`${styles.choiceBtn} ${choice === 0 ? styles.choiceBtnActive : ''}`}
                          onClick={() => setChoice(card.instanceId, 0)}
                          aria-label={`Leave ${card.name} unchanged`}
                          aria-pressed={choice === 0}
                        >
                          skip
                        </button>
                        <button
                          type="button"
                          className={`${styles.choiceBtn} ${choice === 1 ? styles.choiceBtnActive : ''}`}
                          onClick={() => setChoice(card.instanceId, 1)}
                          disabled={!canAdd}
                          aria-label={`Add one time counter to ${card.name}`}
                          aria-pressed={choice === 1}
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.actions}>
              <button type="button" className="btn btn-primary" onClick={commitPass}>
                {isLastPass ? 'Finish' : `Continue to pass ${currentPass + 1} of ${totalPasses}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
