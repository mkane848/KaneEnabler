import { useState, type FormEvent } from 'react';
import type { CardData, Mechanic } from '../types';
import { catalogSize, searchCards } from '../utils/cardCatalog';
import { MECHANIC_COLOR, MECHANIC_LABEL, defaultResolveNote, detectMechanic } from '../utils/counters';
import type { AddCardInput } from '../hooks/useGameState';
import styles from './AddCardPanel.module.css';

const MECHANICS: Mechanic[] = ['suspend', 'vanishing', 'fading', 'custom'];

interface AddCardPanelProps {
  onAdd: (input: AddCardInput) => void;
}

type Stage = 'closed' | 'search' | 'configure';

export default function AddCardPanel({ onAdd }: AddCardPanelProps) {
  const [stage, setStage] = useState<Stage>('closed');
  const [query, setQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');

  const [selected, setSelected] = useState<CardData | null>(null);
  const [mechanic, setMechanic] = useState<Mechanic>('custom');
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [startingCount, setStartingCount] = useState('');
  const [autoDecrement, setAutoDecrement] = useState(true);
  const [resolveNote, setResolveNote] = useState('');

  const results = stage === 'search' ? searchCards(query) : [];

  function resetAll() {
    setStage('closed');
    setQuery('');
    setManualMode(false);
    setManualName('');
    setSelected(null);
    setCustomLabel('');
    setStartingCount('');
    setAutoDecrement(true);
    setResolveNote('');
    setDetectedCount(null);
  }

  function selectCard(card: CardData) {
    const detection = detectMechanic(card.oracleText);
    const nextMechanic = detection?.mechanic ?? 'custom';
    setSelected(card);
    setMechanic(nextMechanic);
    setDetectedCount(detection?.count ?? null);
    setStartingCount(detection?.count != null ? String(detection.count) : '');
    setResolveNote(defaultResolveNote(nextMechanic));
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
    setResolveNote(defaultResolveNote(next));
    // Keep the detected count only if it still applies to the newly chosen mechanic.
    if (!detectedCount) setStartingCount('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const count = Number(startingCount);
    if (!Number.isFinite(count) || count < 0) return;
    onAdd({
      card: selected,
      mechanic,
      customLabel: mechanic === 'custom' ? customLabel.trim() || undefined : undefined,
      startingCount: Math.round(count),
      autoDecrement,
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
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>{stage === 'search' ? 'Add a card' : 'Set up counters'}</span>
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
              placeholder="Search your deck list…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query.trim().length > 0 && (
              <ul className={styles.results}>
                {results.map(card => (
                  <li key={card.id}>
                    <button type="button" className={styles.resultItem} onClick={() => selectCard(card)}>
                      <span>{card.name}</span>
                      {card.typeLine && <span className={styles.resultType}>{card.typeLine}</span>}
                    </button>
                  </li>
                ))}
                {results.length === 0 && (
                  <li>
                    <div className={styles.resultItem} style={{ color: 'var(--color-text-faint)' }}>
                      No matches in the loaded deck list.
                    </div>
                  </li>
                )}
              </ul>
            )}
            <p className={styles.emptyHint}>
              {catalogSize() === 0 && (
                <>
                  No card data loaded yet — run <code>npm run fetch-cards</code> to pull your deck list from
                  Scryfall, or{' '}
                </>
              )}
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
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={autoDecrement}
                  onChange={e => setAutoDecrement(e.target.checked)}
                />
                Remove one each of my upkeeps
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="resolve-note">
                What happens at 0
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
