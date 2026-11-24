import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { useForm } from '@tanstack/react-form';
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

type SearchSource = 'catalog' | 'quick-suspend' | 'manual' | 'token';

/**
 * One explicit state instead of `stage` plus a pile of flags. The old model
 * could represent `creatingToken && manualMode` at once; this can't. The
 * search variants are `source`s rather than separate booleans, and
 * `configure` remembers where the card came from so "Change" returns to the
 * right search.
 */
type PanelState =
  | { stage: 'closed' }
  | { stage: 'search'; source: SearchSource }
  | { stage: 'configure'; card: CardData; detectedCount: number | null; source: SearchSource };

/** The "configure" stage's fields — everything `onAdd` needs beyond the selected card. */
interface ConfigureFormValues {
  mechanic: Mechanic;
  direction: Direction;
  customLabel: string;
  startingCount: string;
  targetCount: string;
  autoAdjust: boolean;
  resolveNote: string;
  chapters: string[];
}

const DEFAULT_CONFIGURE_VALUES: ConfigureFormValues = {
  mechanic: 'custom',
  direction: 'decrement',
  customLabel: '',
  startingCount: '',
  targetCount: '',
  autoAdjust: true,
  resolveNote: '',
  chapters: DEFAULT_CHAPTER_ROWS,
};

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
  const {
    cards: catalog,
    error: catalogError,
    loading: catalogLoading,
    retry: retryCatalog,
  } = useCardCatalog();
  const [panel, setPanel] = useState<PanelState>({ stage: 'closed' });
  const [query, setQuery] = useState('');
  const [manualName, setManualName] = useState('');

  // What the panel is configuring, and a read-only hint about it — neither is
  // a submitted field, so both stay outside the form: `configure.card` picks
  // which card `onAdd` receives, and `detectedCount` only ever drives the
  // "Detected Suspend 3 from card text" hint, never a value the player edits.
  const configure = panel.stage === 'configure' ? panel : null;
  const selected = configure?.card ?? null;
  const detectedCount = configure?.detectedCount ?? null;
  const searchSource =
    panel.stage === 'search' && (panel.source === 'catalog' || panel.source === 'quick-suspend')
      ? panel.source
      : null;
  const nameEntrySource =
    panel.stage === 'search' && (panel.source === 'manual' || panel.source === 'token')
      ? panel.source
      : null;
  const stage = panel.stage;
  const source = panel.stage === 'closed' ? null : panel.source;

  const form = useForm({
    defaultValues: DEFAULT_CONFIGURE_VALUES,
    onSubmit: ({ value }) => {
      if (!selected) return;
      const count = Number(value.startingCount);
      if (!Number.isFinite(count) || count < 0) return;

      if (value.mechanic === 'saga') {
        const trimmedChapters = value.chapters.map((c) => c.trim());
        if (trimmedChapters.length === 0 || trimmedChapters.some((c) => c.length === 0)) return;
        onAdd({
          card: selected,
          mechanic: value.mechanic,
          startingCount: Math.round(count),
          direction: 'increment',
          targetCount: trimmedChapters.length,
          autoAdjust: value.autoAdjust,
          resolveNote: value.resolveNote,
          chapters: trimmedChapters,
        });
        resetAll();
        return;
      }

      const target = value.targetCount.trim() === '' ? undefined : Number(value.targetCount);
      if (target != null && (!Number.isFinite(target) || target <= 0)) return;

      onAdd({
        card: selected,
        mechanic: value.mechanic,
        customLabel:
          value.mechanic === 'custom' ? value.customLabel.trim() || undefined : undefined,
        startingCount: Math.round(count),
        direction: value.direction,
        targetCount: target,
        autoAdjust: value.autoAdjust,
        resolveNote: value.resolveNote,
      });
      resetAll();
    },
  });

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
    setPanel({ stage: 'closed' });
    setQuery('');
    setManualName('');
    form.reset();
  }

  function openQuickSuspend() {
    setPanel({ stage: 'search', source: 'quick-suspend' });
  }

  function openCreateToken() {
    setPanel({ stage: 'search', source: 'token' });
  }

  function selectCard(card: CardData, from: SearchSource) {
    const quick = from === 'quick-suspend';
    const detection = quick ? null : detectMechanic(card.oracleText);
    const nextMechanic = quick ? 'suspend' : (detection?.mechanic ?? 'custom');
    const nextDirection = detection?.direction ?? mechanicDirection(nextMechanic);

    // keepDefaultValues: true — otherwise this reset's values become the
    // form's new `defaultValues` (per TanStack Form's own reset() semantics),
    // which then mismatch the static DEFAULT_CONFIGURE_VALUES this component
    // keeps passing to useForm() every render; useForm's per-render sync
    // effect treats that mismatch as an external defaultValues change and
    // snaps the values right back to DEFAULT_CONFIGURE_VALUES on the very
    // next render, discarding what was just selected here.
    form.reset(
      {
        mechanic: nextMechanic,
        direction: nextDirection,
        customLabel: '',
        startingCount: detection?.count != null ? String(detection.count) : '',
        targetCount: detection?.targetCount != null ? String(detection.targetCount) : '',
        autoAdjust: true,
        resolveNote: quick ? SUSPENDED_BY_EFFECT_NOTE : defaultResolveNote(nextMechanic),
        chapters: DEFAULT_CHAPTER_ROWS,
      },
      { keepDefaultValues: true },
    );
    setPanel({ stage: 'configure', card, detectedCount: detection?.count ?? null, source: from });
  }

  function handleManualSubmit(e: FormEvent, from: 'manual' | 'token') {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    selectCard(
      from === 'token'
        ? { id: `token:${name.toLowerCase()}`, name, isToken: true }
        : { id: `manual:${name.toLowerCase()}`, name },
      from,
    );
  }

  function changeMechanic(next: Mechanic) {
    const currentMechanic = form.getFieldValue('mechanic');
    const currentDirection = form.getFieldValue('direction');
    const currentChapters = form.getFieldValue('chapters');

    form.setFieldValue('mechanic', next);
    form.setFieldValue('direction', mechanicDirection(next, currentDirection));
    form.setFieldValue('resolveNote', defaultResolveNote(next));
    form.setFieldValue('autoAdjust', true);
    // Keep the detected count/target only if it still applies to the newly chosen mechanic.
    // A Saga without read ahead enters with a lore counter (CR 714.3a), so the
    // natural default is 1 — chapter I has already triggered on arrival.
    if (!detectedCount) form.setFieldValue('startingCount', next === 'saga' ? '1' : '');
    if (next !== currentMechanic) form.setFieldValue('targetCount', '');
    if (next === 'saga' && currentChapters.length === 0)
      form.setFieldValue('chapters', DEFAULT_CHAPTER_ROWS);
  }

  if (stage === 'closed') {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setPanel({ stage: 'search', source: 'catalog' })}
        >
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
              ? source === 'quick-suspend'
                ? 'Suspend a card via an effect'
                : source === 'token'
                  ? 'Create a token'
                  : 'Add a card'
              : 'Set up counters'}
          </span>
          <button type="button" className={styles.closeBtn} onClick={resetAll}>
            Close
          </button>
        </div>

        {searchSource && (
          <>
            <input
              autoFocus
              className="mtg-input"
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
                      onClick={() => selectCard(card, searchSource)}
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
                  Couldn&apos;t load the card catalog ({catalogError}).{' '}
                  <button type="button" className={styles.manualLink} onClick={retryCatalog}>
                    Try again
                  </button>
                  .{' '}
                </>
              )}
              {catalog && <>Searching {catalog.length.toLocaleString()} Jeskai-legal cards. </>}
              Can&apos;t find it?{' '}
              <button
                type="button"
                className={styles.manualLink}
                onClick={() => setPanel({ stage: 'search', source: 'manual' })}
              >
                Add it by name
              </button>
              .
            </p>
          </>
        )}

        {nameEntrySource && (
          <form onSubmit={(e) => handleManualSubmit(e, nameEntrySource)}>
            <label className={styles.fieldLabel} htmlFor="manual-name">
              {nameEntrySource === 'token' ? 'Token name' : 'Card name'}
            </label>
            <div className={styles.manualRow}>
              <input
                id="manual-name"
                autoFocus
                className="mtg-input"
                type="text"
                placeholder={nameEntrySource === 'token' ? 'e.g. Human Noble' : 'e.g. Ancestral Vision'}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <button type="submit" className="mtg-btn mtg-btn-primary mtg-btn-sm">
                Next
              </button>
            </div>
            {nameEntrySource === 'token' ? (
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
                  onClick={() => setPanel({ stage: 'search', source: 'catalog' })}
                >
                  ← Back to search
                </button>
              </p>
            )}
          </form>
        )}

        {configure && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <div className={styles.selectedRow}>
              {configure.card.imageSmall ? (
                <img className={styles.selectedThumb} src={configure.card.imageSmall} alt="" />
              ) : (
                <div className={styles.selectedThumbFallback} />
              )}
              <span className={styles.selectedName}>{configure.card.name}</span>
              <ManaCost cost={configure.card.manaCost} />
              <button
                type="button"
                className={styles.changeBtn}
                onClick={() => setPanel({ stage: 'search', source: configure.source })}
              >
                Change
              </button>
            </div>

            {/* One subscription drives every conditional section below — the
                component re-rendered wholesale on any field's keystroke before
                this was a form too, so subscribing field-by-field here would
                only add indirection, not save any renders. */}
            <form.Subscribe selector={(state) => state.values}>
              {(values) => (
                <>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Mechanic</span>
                    <div className={styles.mechanicRow}>
                      {MECHANICS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`${styles.mechanicBtn} ${values.mechanic === m ? styles.mechanicBtnActive : ''}`}
                          style={{ ['--mechanic-color' as string]: MECHANIC_COLOR[m] }}
                          onClick={() => changeMechanic(m)}
                        >
                          {MECHANIC_LABEL[m]}
                        </button>
                      ))}
                    </div>
                    {detectedCount != null && (
                      <p className={styles.detectedHint}>
                        Detected {MECHANIC_LABEL[values.mechanic]} {detectedCount} from card text.
                      </p>
                    )}
                  </div>

                  {values.mechanic === 'custom' && (
                    <>
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor="custom-label">
                          Counter name
                        </label>
                        <form.Field name="customLabel">
                          {(field) => (
                            <input
                              id="custom-label"
                              className="mtg-input"
                              type="text"
                              placeholder="e.g. Age counter"
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                            />
                          )}
                        </form.Field>
                      </div>

                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Direction</span>
                        <div className={styles.directionRow}>
                          <button
                            type="button"
                            className={`${styles.directionBtn} ${values.direction === 'decrement' ? styles.directionBtnActive : ''}`}
                            onClick={() => form.setFieldValue('direction', 'decrement')}
                          >
                            Counts down
                          </button>
                          <button
                            type="button"
                            className={`${styles.directionBtn} ${values.direction === 'increment' ? styles.directionBtnActive : ''}`}
                            onClick={() => form.setFieldValue('direction', 'increment')}
                          >
                            Counts up
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {values.mechanic === 'saga' && (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Chapters</span>
                      <p className={styles.emptyHint}>
                        A lore counter is added as your precombat main begins, not at upkeep — this
                        Saga's chapter abilities fire in order as that lore count reaches each
                        chapter, one at a time, with the last chapter followed by sacrificing the
                        Saga.
                      </p>
                      <form.Field name="chapters" mode="array">
                        {(chaptersField) => (
                          <>
                            {chaptersField.state.value.map((_, i) => (
                              <form.Field key={i} name={`chapters[${i}]`}>
                                {(chapterField) => (
                                  <div className={styles.manualRow}>
                                    <input
                                      className="mtg-input"
                                      type="text"
                                      placeholder={`Chapter ${chapterRoman(i + 1)} — what happens`}
                                      value={chapterField.state.value}
                                      onChange={(e) => chapterField.handleChange(e.target.value)}
                                      required
                                    />
                                    <button
                                      type="button"
                                      className={styles.changeBtn}
                                      onClick={() => chaptersField.removeValue(i)}
                                      disabled={chaptersField.state.value.length <= 1}
                                      aria-label={`Remove chapter ${chapterRoman(i + 1)}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}
                              </form.Field>
                            ))}
                            <button
                              type="button"
                              className={styles.manualLink}
                              onClick={() => chaptersField.pushValue('')}
                            >
                              + Add chapter {chapterRoman(chaptersField.state.value.length + 1)}
                            </button>
                          </>
                        )}
                      </form.Field>
                    </div>
                  )}

                  <div className={styles.countStartRow}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="starting-count">
                        {values.mechanic === 'saga'
                          ? 'Starting lore counters'
                          : 'Starting counters'}
                      </label>
                      <form.Field name="startingCount">
                        {(field) => (
                          <input
                            id="starting-count"
                            className="mtg-input"
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            required
                          />
                        )}
                      </form.Field>
                    </div>
                    {values.direction === 'increment' && values.mechanic !== 'saga' && (
                      <div className={styles.field}>
                        <label className={styles.fieldLabel} htmlFor="target-count">
                          Target count (optional)
                        </label>
                        <form.Field name="targetCount">
                          {(field) => (
                            <input
                              id="target-count"
                              className="mtg-input"
                              type="number"
                              min={1}
                              inputMode="numeric"
                              placeholder="Open-ended"
                              value={field.state.value}
                              onChange={(e) => field.handleChange(e.target.value)}
                            />
                          )}
                        </form.Field>
                      </div>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.checkboxRow}>
                      <form.Field name="autoAdjust">
                        {(field) => (
                          <input
                            type="checkbox"
                            checked={field.state.value}
                            onChange={(e) => field.handleChange(e.target.checked)}
                          />
                        )}
                      </form.Field>
                      {values.mechanic === 'saga'
                        ? 'Add a lore counter each of my precombat mains'
                        : values.direction === 'decrement'
                          ? 'Remove one each of my upkeeps'
                          : 'Add one each of my upkeeps'}
                    </label>
                  </div>

                  {values.mechanic !== 'saga' && (
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="resolve-note">
                        {resolveFieldLabel(
                          values.direction,
                          values.targetCount.trim() === '' ? undefined : Number(values.targetCount),
                        )}
                      </label>
                      <form.Field name="resolveNote">
                        {(field) => (
                          <textarea
                            id="resolve-note"
                            className="mtg-input"
                            rows={2}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        )}
                      </form.Field>
                    </div>
                  )}

                  <div className={styles.actions}>
                    <button type="button" className="mtg-btn mtg-btn-ghost" onClick={resetAll}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="mtg-btn mtg-btn-primary"
                      disabled={
                        values.mechanic === 'saga' &&
                        values.chapters.some((c) => c.trim().length === 0)
                      }
                    >
                      Add to tracker
                    </button>
                  </div>
                </>
              )}
            </form.Subscribe>
          </form>
        )}
      </div>
    </div>
  );
}
