import { useState, type FormEvent } from 'react';
import { Modal, ModalClose, ModalTitle } from '@mtg/ui';
import type { Mechanic, RoseTylerState, TrackedCard } from '../types';
import type { TimeTravelTargetId } from '../hooks/useGameState';
import { MECHANIC_COLOR, MECHANIC_LABEL, usesTimeCounters } from '../utils/counters';
import styles from './TimeTravelPanel.module.css';

type Delta = -1 | 0 | 1;

/** One object eligible for a Time Travel choice — a tracked Suspend/Vanishing card, or Rose Tyler's own Bad Wolf counters. */
export interface TimeTravelTarget {
  id: TimeTravelTargetId;
  name: string;
  mechanic: Mechanic;
  label: string;
  count: number;
  direction: TrackedCard['direction'];
  targetCount?: number;
}

/**
 * Which cards and commander state are valid Time Travel targets right now —
 * Suspend/Vanishing cards (fade and lore counters aren't time counters, see
 * usesTimeCounters) and, once she has any, Rose Tyler's own Bad Wolf
 * counters. A card needs an actual counter still on it: once the last one's
 * removed, a suspended card has already been cast (rule 702.61) and a
 * Vanishing permanent has no time counter left either, so neither is a
 * legal target for "add or remove a time counter" anymore.
 */
export function buildTimeTravelTargets(
  cards: TrackedCard[],
  rose: RoseTylerState,
): TimeTravelTarget[] {
  return [
    ...cards
      .filter((c) => usesTimeCounters(c.mechanic) && c.count > 0)
      .map((c) => ({
        id: c.instanceId,
        name: c.name,
        mechanic: c.mechanic,
        label: MECHANIC_LABEL[c.mechanic],
        count: c.count,
        direction: c.direction,
        targetCount: c.targetCount,
      })),
    ...(rose.timeCounters > 0
      ? [
          {
            id: 'rose' as const,
            name: 'Rose Tyler — Bad Wolf',
            mechanic: 'custom' as const,
            label: 'Bad Wolf',
            count: rose.timeCounters,
            direction: 'increment' as const,
            targetCount: undefined,
          },
        ]
      : []),
  ];
}

interface TimeTravelPanelProps {
  targets: TimeTravelTarget[];
  initialPasses?: number;
  onApply: (
    choices: { id: TimeTravelTargetId; delta: Delta }[],
    passInfo: { current: number; total: number },
  ) => void;
  onClose: () => void;
}

/**
 * Time Travel: "For each suspended card you own and each permanent you
 * control with a time counter on it, you may add or remove a time
 * counter." One pass is one independent choice per eligible object, not a
 * free stepper — the whole point is that you can only ever move a counter
 * by one in either direction per invocation. Fading and Saga cards are
 * never eligible (fade counters and lore counters aren't time counters —
 * see usesTimeCounters in utils/counters.ts), so the caller only ever
 * passes Suspend/Vanishing cards and, when she has any, Rose Tyler.
 *
 * Some sources of Time Travel say "time travel N times" (The Tenth
 * Doctor's Timey-Wimey ability, for {7}, does it three times — pass
 * `initialPasses={3}` from that shortcut), so this asks up front how many
 * passes are being resolved and walks through them one at a time — each
 * pass's choices apply immediately, so nothing is lost if the sheet gets
 * closed partway through, and the player always knows how many passes are
 * left instead of losing count.
 */
export default function TimeTravelPanel({
  targets,
  initialPasses,
  onApply,
  onClose,
}: TimeTravelPanelProps) {
  const [stage, setStage] = useState<'setup' | 'pass'>(initialPasses ? 'pass' : 'setup');
  const [timesDraft, setTimesDraft] = useState(String(initialPasses ?? 1));
  const [totalPasses, setTotalPasses] = useState(initialPasses ?? 1);
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

  function setChoice(id: string, delta: Delta) {
    setChoices((prev) => ({ ...prev, [id]: prev[id] === delta ? 0 : delta }));
  }

  function commitPass() {
    onApply(
      targets.map((t) => ({ id: t.id, delta: choices[t.id] ?? 0 })),
      { current: currentPass, total: totalPasses },
    );
    if (currentPass >= totalPasses) {
      onClose();
    } else {
      setCurrentPass((p) => p + 1);
      setChoices({});
    }
  }

  const remaining = totalPasses - currentPass;
  const isLastPass = remaining <= 0;

  return (
    <Modal onClose={onClose} overlayClassName={styles.backdrop} contentClassName={styles.sheet}>
      {stage === 'setup' ? (
        <form onSubmit={startPasses}>
          <div className={styles.header}>
            <ModalTitle asChild>
              <h2 className={styles.title}>Time Travel</h2>
            </ModalTitle>
            <ModalClose asChild>
              <button type="button" className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </ModalClose>
          </div>
          <p className={styles.subtitle}>
            For each card, you may add or remove one time counter. How many times are you resolving
            Time Travel?
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
            onChange={(e) => setTimesDraft(e.target.value)}
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
            <ModalTitle asChild>
              <h2 className={styles.title}>
                Time Travel — pass {currentPass} of {totalPasses}
              </h2>
            </ModalTitle>
            <ModalClose asChild>
              <button type="button" className="btn btn-ghost btn-sm">
                Stop here
              </button>
            </ModalClose>
          </div>
          <p className={styles.subtitle}>
            {isLastPass
              ? 'Last pass.'
              : `${remaining} more pass${remaining === 1 ? '' : 'es'} after this one.`}
          </p>

          <div className={styles.list}>
            {targets.length === 0 && (
              <p className={styles.subtitle}>
                No suspended cards, Vanishing permanents, or Bad Wolf counters to choose from right
                now.
              </p>
            )}
            {targets.map((target) => {
              const color = MECHANIC_COLOR[target.mechanic];
              const choice = choices[target.id] ?? 0;
              const canRemove = target.count > 0;
              const canAdd = !(
                target.direction === 'increment' &&
                target.targetCount != null &&
                target.count >= target.targetCount
              );

              return (
                <div key={target.id} className={styles.row}>
                  <div className={styles.rowMeta}>
                    <div className={styles.name}>{target.name}</div>
                    <span className={styles.tag} style={{ ['--tag-color' as string]: color }}>
                      {target.label}
                    </span>
                  </div>
                  <div className={styles.rowRight}>
                    <span className={styles.preview}>
                      {choice !== 0 ? `${target.count} → ${target.count + choice}` : target.count}
                    </span>
                    <div className={styles.choiceRow}>
                      <button
                        type="button"
                        className={`${styles.choiceBtn} ${choice === -1 ? styles.choiceBtnActive : ''}`}
                        onClick={() => setChoice(target.id, -1)}
                        disabled={!canRemove}
                        aria-label={`Remove one time counter from ${target.name}`}
                        aria-pressed={choice === -1}
                      >
                        −1
                      </button>
                      <button
                        type="button"
                        className={`${styles.choiceBtn} ${choice === 0 ? styles.choiceBtnActive : ''}`}
                        onClick={() => setChoice(target.id, 0)}
                        aria-label={`Leave ${target.name} unchanged`}
                        aria-pressed={choice === 0}
                      >
                        skip
                      </button>
                      <button
                        type="button"
                        className={`${styles.choiceBtn} ${choice === 1 ? styles.choiceBtnActive : ''}`}
                        onClick={() => setChoice(target.id, 1)}
                        disabled={!canAdd}
                        aria-label={`Add one time counter to ${target.name}`}
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
    </Modal>
  );
}
