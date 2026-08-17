import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import type { CardData, Direction, Mechanic } from '../types';
import { searchCards } from '../utils/cardCatalog';
import { useCardCatalog } from '../hooks/useCardCatalog';
import {
  MECHANIC_COLOR,
  MECHANIC_LABEL,
  chapterRoman,
  defaultResolveNote,
  detectMechanic,
  mechanicDirection,
  resolveFieldLabel,
} from '../utils/counters';
import type { AddCardInput } from '../hooks/useGameState';
import ManaCost from './ManaCost';
import styles from './AddCardPanel.module.css';

const MECHANICS: Mechanic[] = ['suspend', 'vanishing', 'fading', 'saga', 'custom'];
const DEFAULT_CHAPTER_ROWS = ['', '', ''];

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
  // Tokens (e.g. the Human Noble token from The Girl in the Fireplace) aren't
  // real cards, so they're never in the Scryfall catalog — this skips search
  // entirely and goes straight to naming one by hand.
  const [creatingToken, setCreatingToken] = useState(false);

  const [selected, setSelected] = useState<CardData | null>(null);
  const [mechanic, setMechanic] = useState<Mechanic>('custom');
  const [direction, setDirection] = useState<Direction>('decrement');
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [startingCount, setStartingCount] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [autoAdjust, setAutoAdjust] = useState(true);
  const [resolveNote, setResolveNote] = useState('');
  const [chapters, setChapters] = useState<string[]>(DEFAULT_CHAPTER_ROWS);

  // The input's own value stays synced to every keystroke immediately (it's
  // a controlled input; typing has to feel instant), but the search itself
  // runs against a deferred copy — React drops a stale in-flight scan and
  // starts the next one rather than queuing every keystroke's worth of
  // ~16k-card scans back to back on a fast typist.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => (stage === 'search' && catalog ? searchCards(catalog, deferredQuery) : []),
    [stage, catalog, deferredQuery],
  );

  function resetAll() {
    setStage('closed');
    setQuery('');
    setManualMode(false);
    setManualName('');
    setQuickSuspend(false);
    setCreatingToken(false);
    setSelected(null);
    setMechanic('custom');
    setCustomLabel('');
    setStartingCount('');
    setTargetCount('');
    setDirection('decrement');
    setAutoAdjust(true);
    setResolveNote('');
    setDetectedCount(null);
    setChapters(DEFAULT_CHAPTER_ROWS);
  }

  function openQuickSuspend() {
    setQuickSuspend(true);
    setStage('search');
  }

  function openCreateToken() {
    setCreatingToken(true);
    setStage('search');
  }

  function selectCard(card: CardData) {
    const detection = quickSuspend ? null : detectMechanic(card.oracleText);
    const nextMechanic = quickSuspend ? 'suspend' : (detection?.mechanic ?? 'custom');
    const nextDirection = detection?.direction ?? mechanicDirection(nextMechanic);

    setSelected(card);
    setMechanic(nextMechanic);
    setDirection(nextDirection);
    setDetectedCount(detection?.count ?? null);
    setStartingCount(detection?.count != null ? String(detection.count) : '');
    setTargetCount(detection?.targetCount != null ? String(detection.targetCount) : '');
    setAutoAdjust(true);
    setResolveNote(quickSuspend ? SUSPENDED_BY_EFFECT_NOTE : defaultResolveNote(nextMechanic));
    setCustomLabel('');
    setStage('configure');
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    if (creatingToken) {
      selectCard({ id: `token:${name.toLowerCase()}`, name, isToken: true });
    } else {
      selectCard({ id: `manual:${name.toLowerCase()}`, name });
    }
  }

  function changeMechanic(next: Mechanic) {
    setMechanic(next);
    setDirection(mechanicDirection(next, direction));
    setResolveNote(defaultResolveNote(next));
    setAutoAdjust(true);
    // Keep the detected count/target only if it still applies to the newly chosen mechanic.
    if (!detectedCount) setStartingCount(next === 'saga' ? '0' : '');
    if (next !== mechanic) setTargetCount('');
    if (next === 'saga' && chapters.length === 0) setChapters(DEFAULT_CHAPTER_ROWS);
  }

  function setChapterText(index: number, text: string) {
    setChapters((prev) => prev.map((c, i) => (i === index ? text : c)));
  }

  function addChapterRow() {
    setChapters((prev) => [...prev, '']);
  }

  function removeChapterRow(index: number) {
    setChapters((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const trimmedChapters = chapters.map((c) => c.trim());
  const sagaReady =
    mechanic !== 'saga' ||
    (trimmedChapters.length > 0 && trimmedChapters.every((c) => c.length > 0));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const count = Number(startingCount);
    if (!Number.isFinite(count) || count < 0) return;

    if (mechanic === 'saga') {
      if (!sagaReady) return;
      onAdd({
        card: selected,
        mechanic,
        startingCount: Math.round(count),
        direction: 'increment',
        targetCount: trimmedChapters.length,
        autoAdjust,
        resolveNote,
        chapters: trimmedChapters,
      });
      resetAll();
      return;
    }

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
        <button type="button" className={styles.quickLink} onClick={openCreateToken}>
          Create a token (e.g. The Girl in the Fireplace) →
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            {stage === 'search'
              ? quickSuspend
                ? 'Suspend a card via an effect'
                : creatingToken
                  ? 'Create a token'
                  : 'Add a card'
              : 'Set up counters'}
          </span>
          <button type="button" className={styles.closeBtn} onClick={resetAll}>
            Close
          </button>
        </div>

        {stage === 'search' && !manualMode && !creatingToken && (
          <>
            <input
              autoFocus
              className="input"
              type="text"
              placeholder={catalogLoading ? 'Loading card catalog…' : 'Search any Jeskai card…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim().length > 0 && catalog && (
              <ul className={styles.results}>
                {results.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      className={styles.resultItem}
                      onClick={() => selectCard(card)}
                    >
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
                  Couldn&apos;t load the card catalog ({catalogError}). You can still add cards by
                  name.{' '}
                </>
              )}
              {catalog && <>Searching {catalog.length.toLocaleString()} Jeskai-legal cards. </>}
              Can&apos;t find it?{' '}
              <button
                type="button"
                className={styles.manualLink}
                onClick={() => setManualMode(true)}
              >
                Add it by name
              </button>
              .
            </p>
          </>
        )}

        {stage === 'search' && (manualMode || creatingToken) && (
          <form onSubmit={handleManualSubmit}>
            <label className={styles.fieldLabel} htmlFor="manual-name">
              {creatingToken ? 'Token name' : 'Card name'}
            </label>
            <div className={styles.manualRow}>
              <input
                id="manual-name"
                autoFocus
                className="input"
                type="text"
                placeholder={creatingToken ? 'e.g. Human Noble' : 'e.g. Ancestral Vision'}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Next
              </button>
            </div>
            {creatingToken ? (
              <p className={styles.emptyHint}>
                Tokens aren&apos;t cataloged cards, so there&apos;s no art or oracle text — just
                name it and pick its mechanic next (e.g. Vanishing 3 for the token The Girl in the
                Fireplace creates).
              </p>
            ) : (
              <p className={styles.emptyHint}>
                <button
                  type="button"
                  className={styles.manualLink}
                  onClick={() => setManualMode(false)}
                >
                  ← Back to search
                </button>
              </p>
            )}
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
                {MECHANICS.map((m) => (
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
                <p className={styles.detectedHint}>
                  Detected {MECHANIC_LABEL[mechanic]} {detectedCount} from card text.
                </p>
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
                    onChange={(e) => setCustomLabel(e.target.value)}
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

            {mechanic === 'saga' && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Chapters</span>
                <p className={styles.emptyHint}>
                  A lore counter is added as your precombat main begins, not at upkeep — this Saga's
                  chapter abilities fire in order as that lore count reaches each chapter, one at a
                  time, with the last chapter followed by sacrificing the Saga.
                </p>
                {chapters.map((text, i) => (
                  <div key={i} className={styles.manualRow}>
                    <input
                      className="input"
                      type="text"
                      placeholder={`Chapter ${chapterRoman(i + 1)} — what happens`}
                      value={text}
                      onChange={(e) => setChapterText(i, e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className={styles.changeBtn}
                      onClick={() => removeChapterRow(i)}
                      disabled={chapters.length <= 1}
                      aria-label={`Remove chapter ${chapterRoman(i + 1)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.manualLink} onClick={addChapterRow}>
                  + Add chapter {chapterRoman(chapters.length + 1)}
                </button>
              </div>
            )}

            <div className={styles.countStartRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="starting-count">
                  {mechanic === 'saga' ? 'Starting lore counters' : 'Starting counters'}
                </label>
                <input
                  id="starting-count"
                  className="input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={startingCount}
                  onChange={(e) => setStartingCount(e.target.value)}
                  required
                />
              </div>
              {direction === 'increment' && mechanic !== 'saga' && (
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
                    onChange={(e) => setTargetCount(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={autoAdjust}
                  onChange={(e) => setAutoAdjust(e.target.checked)}
                />
                {mechanic === 'saga'
                  ? 'Add a lore counter each of my precombat mains'
                  : direction === 'decrement'
                    ? 'Remove one each of my upkeeps'
                    : 'Add one each of my upkeeps'}
              </label>
            </div>

            {mechanic !== 'saga' && (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="resolve-note">
                  {resolveFieldLabel(
                    direction,
                    targetCount.trim() === '' ? undefined : Number(targetCount),
                  )}
                </label>
                <textarea
                  id="resolve-note"
                  className="input"
                  rows={2}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                />
              </div>
            )}

            <div className={styles.actions}>
              <button type="button" className="btn btn-ghost" onClick={resetAll}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!sagaReady}>
                Add to tracker
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
