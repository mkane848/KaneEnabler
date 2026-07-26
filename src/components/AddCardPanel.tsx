import { useMemo, useState, type FormEvent } from 'react';
import type { CardData, Direction, Mechanic } from '../types';
import { searchCards } from '../utils/cardCatalog';
import { useCardCatalog } from '../hooks/useCardCatalog';
import {
  MECHANIC_COLOR,
  MECHANIC_LABEL,
  defaultAutoAdjust,
  defaultResolveNote,
  detectMechanic,
  mechanicDirection,
  resolveFieldLabel,
} from '../utils/counters';
import type { AddCardInput } from '../hooks/useGameState';
import ManaCost from './ManaCost';
import styles from './AddCardPanel.module.css';

const MECHANICS: Mechanic[] = ['suspend', 'vanishing', 'fading', 'saga', 'level', 'custom'];

interface AddCardPanelProps {
  onAdd: (input: AddCardInput) => void;
}

type Stage = 'closed' | 'search' | 'configure';

/**
 * A card can be suspended by an effect that isn't its own Suspend keyword —
 * The Tenth Doctor's ability is the reason this deck needs it, but Delay and
 * Clockspinning do the same thing. Rather than hardcode any one source's
 * exact wording, this just pre-selects the Suspend mechanic and flags where
 * the note came from; the player fills in the counter count either way.
 */
const SUSPENDED_BY_EFFECT_NOTE =
  'Suspended by an effect rather than its own Suspend cost — cast it for free from exile when the last counter is removed.';

export default function AddCardPanel({ onAdd }: AddCardPanelProps) {
  const { cards: catalog, error: catalogError, loading: catalogLoading } = useCardCatalog();
  const [stage, setStage] = useState<Stage>('closed');
  const [query, setQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const [quickSuspend, setQuickSuspend] = useState(false);

  const [selected, setSelected] = useState<CardData | null>(null);
  const [mechanic, setMechanic] = useState<Mechanic>('custom');
  const [direction, setDirection] = useState<Direction>('decrement');
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [startingCount, setStartingCount] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [autoAdjust, setAutoAdjust] = useState(true);
  const [resolveNote, setResolveNote] = useState('');

  // ~16k cards, so only re-scan when the query or the catalog actually changes.
  const results = useMemo(
    () => (stage === 'search' && catalog ? searchCards(catalog, query) : []),
    [stage, catalog, query],
  );

  function resetAll() {
    setStage('closed');
    setQuery('');
    setManualMode(false);
    setManualName('');
    setQuickSuspend(false);
    setSelected(null);
    setCustomLabel('');
    setStartingCount('');
    setTargetCount('');
    setDirection('decrement');
    setAutoAdjust(true);
    setResolveNote('');
    setDetectedCount(null);
  }

  function openQuickSuspend() {
    setQuickSuspend(true);
    setStage('search');
  }

  function selectCard(card: CardData) {
    const detection = quickSuspend ? null : detectMechanic(card.oracleText);
    const nextMechanic = quickSuspend ? 'suspend' : detection?.mechanic ?? 'custom';
    const nextDirection = detection?.direction ?? mechanicDirection(nextMechanic);

    setSelected(card);
    setMechanic(nextMechanic);
    setDirection(nextDirection);
    setDetectedCount(detection?.count ?? null);
    setStartingCount(detection?.count != null ? String(detection.count) : '');
    setTargetCount(detection?.targetCount != null ? String(detection.targetCount) : '');
    setAutoAdjust(defaultAutoAdjust(nextMechanic));
    setResolveNote(quickSuspend ? SUSPENDED_BY_EFFECT_NOTE : defaultResolveNote(nextMechanic));
    setCustomLabel('');
    setStage('configure');
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    selectCard({ id: `manual:${name.toLowerCase()}`, name });
  }

  function changeMechanic(next: Mechanic) {
    setMechanic(next);
    setDirection(mechanicDirection(next, direction));
    setResolveNote(defaultResolveNote(next));
    setAutoAdjust(defaultAutoAdjust(next));
    // Keep the detected count/target only if it still applies to the newly chosen mechanic.
    if (!detectedCount) setStartingCount('');
    if (next !== mechanic) setTargetCount('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const count = Number(startingCount);
    if (!Number.isFinite(count) || count < 0) return;
    const target = targetCount.trim() === '' ? undefined : Number(targetCount);
    if (target != null && (!Number.isFinite(target) || target <= 0)) return;

    onAdd({
      card: selected,
      mechanic,
      customLabel: mechanic === 'custom' ? customLabel.trim() || undefined : undefined,
      startingCount: Math.round(count),
      direction,
      targetCount: target,
      autoAdjust,
      resolveNote,
    });
    resetAll();
  }

  if (stage === 'closed') {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.toggle} onClick={() => setStage('search')}>
          <span className={styles.plus}>+</span> Add a card
        </button>
        <button type="button" className={styles.quickLink} onClick={openQuickSuspend}>
          Suspend a card via an effect (e.g. The Tenth Doctor) →
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            {stage === 'search' ? (quickSuspend ? 'Suspend a card via an effect' : 'Add a card') : 'Set up counters'}
          </span>
          <button type="button" className={styles.closeBtn} onClick={resetAll}>
            Close
          </button>
        </div>

        {stage === 'search' && !manualMode && (
          <>
            <input
              autoFocus
              className="input"
              type="text"
              placeholder={catalogLoading ? 'Loading card catalog…' : 'Search any Jeskai card…'}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query.trim().length > 0 && catalog && (
              <ul className={styles.results}>
                {results.map(card => (
                  <li key={card.id}>
                    <button type="button" className={styles.resultItem} onClick={() => selectCard(card)}>
                      <span className={styles.resultName}>
                        {card.name}
                        <ManaCost cost={card.manaCost} />
                      </span>
                      {card.typeLine && <span className={styles.resultType}>{card.typeLine}</span>}
                    </button>
                  </li>
                ))}
                {results.length === 0 && (
                  <li>
                    <div className={styles.resultItem} style={{ color: 'var(--color-text-faint)' }}>
                      No Jeskai-legal card matches that name.
                    </div>
                  </li>
                )}
              </ul>
            )}
            <p className={styles.emptyHint}>
              {catalogLoading && <>Loading every Commander-legal Jeskai card… </>}
              {catalogError && (
                <>
                  Couldn&apos;t load the card catalog ({catalogError}). You can still add cards by name.{' '}
                </>
              )}
              {catalog && <>Searching {catalog.length.toLocaleString()} Jeskai-legal cards. </>}
              Can&apos;t find it?{' '}
              <button type="button" className={styles.manualLink} onClick={() => setManualMode(true)}>
                Add it by name
              </button>
              .
            </p>
          </>
        )}

        {stage === 'search' && manualMode && (
          <form onSubmit={handleManualSubmit}>
            <label className={styles.fieldLabel} htmlFor="manual-name">
              Card name
            </label>
            <div className={styles.manualRow}>
              <input
                id="manual-name"
                autoFocus
                className="input"
                type="text"
                placeholder="e.g. Ancestral Vision"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Next
              </button>
            </div>
            <p className={styles.emptyHint}>
              <button type="button" className={styles.manualLink} onClick={() => setManualMode(false)}>
                ← Back to search
              </button>
            </p>
          </form>
        )}

        {stage === 'configure' && selected && (
          <form onSubmit={handleSubmit}>
            <div className={styles.selectedRow}>
              {selected.imageSmall ? (
                <img className={styles.selectedThumb} src={selected.imageSmall} alt="" />
              ) : (
                <div className={styles.selectedThumbFallback} />
              )}
              <span className={styles.selectedName}>{selected.name}</span>
              <ManaCost cost={selected.manaCost} />
              <button type="button" className={styles.changeBtn} onClick={() => setStage('search')}>
                Change
              </button>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Mechanic</span>
              <div className={styles.mechanicRow}>
                {MECHANICS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.mechanicBtn} ${mechanic === m ? styles.mechanicBtnActive : ''}`}
                    style={{ ['--mechanic-color' as string]: MECHANIC_COLOR[m] }}
                    onClick={() => changeMechanic(m)}
                  >
                    {MECHANIC_LABEL[m]}
                  </button>
                ))}
              </div>
              {detectedCount != null && (
                <p className={styles.detectedHint}>Detected {MECHANIC_LABEL[mechanic]} {detectedCount} from card text.</p>
              )}
            </div>

            {mechanic === 'custom' && (
              <>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="custom-label">
                    Counter name
                  </label>
                  <input
                    id="custom-label"
                    className="input"
                    type="text"
                    placeholder="e.g. Age counter"
                    value={customLabel}
                    onChange={e => setCustomLabel(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Direction</span>
                  <div className={styles.directionRow}>
                    <button
                      type="button"
                      className={`${styles.directionBtn} ${direction === 'decrement' ? styles.directionBtnActive : ''}`}
                      onClick={() => setDirection('decrement')}
                    >
                      Counts down
                    </button>
                    <button
                      type="button"
                      className={`${styles.directionBtn} ${direction === 'increment' ? styles.directionBtnActive : ''}`}
                      onClick={() => setDirection('increment')}
                    >
                      Counts up
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className={styles.countStartRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="starting-count">
                  Starting counters
                </label>
                <input
                  id="starting-count"
                  className="input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={startingCount}
                  onChange={e => setStartingCount(e.target.value)}
                  required
                />
              </div>
              {direction === 'increment' && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="target-count">
                    Target count (optional)
                  </label>
                  <input
                    id="target-count"
                    className="input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="Open-ended"
                    value={targetCount}
                    onChange={e => setTargetCount(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={autoAdjust} onChange={e => setAutoAdjust(e.target.checked)} />
                {direction === 'decrement' ? 'Remove one each of my upkeeps' : 'Add one each of my upkeeps'}
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="resolve-note">
                {resolveFieldLabel(direction, targetCount.trim() === '' ? undefined : Number(targetCount))}
              </label>
              <textarea
                id="resolve-note"
                className="input"
                rows={2}
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
              />
            </div>

            <div className={styles.actions}>
              <button type="button" className="btn btn-ghost" onClick={resetAll}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Add to tracker
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
