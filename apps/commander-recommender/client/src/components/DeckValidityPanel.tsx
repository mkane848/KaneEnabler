import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useDeckValidity } from '../api/queries';
import { identityName } from '../lib/mtg';
import type { DeckValidityResponse } from '../types';

/**
 * The other thing you can do with a pasted list: not "which commander fits
 * these cards?" but "is this finished deck legal?" — size, singleton, color
 * identity, commander eligibility/pairing, ban-list. Collapsed by default so
 * the recommend flow stays the screen's primary purpose; the verdict reads
 * the same submitted-snapshot pattern the results grid uses, so editing the
 * textarea never re-fires a check.
 */
export function DeckValidityPanel() {
  const rawList = useAppStore((s) => s.rawList);
  const submittedValidation = useAppStore((s) => s.submittedValidation);
  const submitValidation = useAppStore((s) => s.submitValidation);

  const [commanderName, setCommanderName] = useState('');
  const [secondName, setSecondName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const panelId = useId();

  const { data, isFetching, error } = useDeckValidity(submittedValidation);

  // Same wake-up honesty as the upload panel: past a few seconds it's almost
  // always the free instance stirring, not a hang.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!isFetching) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [isFetching]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!rawList.trim()) {
      setFormError('Paste or upload the full deck list first — including its commander(s).');
      return;
    }
    const names = [commanderName.trim(), secondName.trim()].filter(Boolean);
    if (names.length === 0) {
      setFormError("Name the deck's commander — and its partner or Background, if it has one.");
      return;
    }
    setFormError(null);
    submitValidation(rawList, names);
  }

  return (
    <section className="validity-panel" aria-label="Check a finished deck">
      <button
        type="button"
        className="validity-collapse-toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="validity-label">Check a finished deck</span>
        {collapsed && data && (
          <span className="validity-collapsed-summary">
            {data.isValid ? 'Last check: legal' : 'Last check: not legal'}
          </span>
        )}
        <span aria-hidden="true" className="explain-chevron">
          {collapsed ? '▼' : '▲'}
        </span>
      </button>

      {!collapsed && (
        <div id={panelId} className="validity-collapsible">
          <p className="validity-intro">
            Already have a commander? Paste the full 100-card deck above — commanders included — and
            name them here. This checks size, singleton, color identity, the ban-list, and whether
            the commanders actually pair.
          </p>
          <form className="validity-form" onSubmit={handleSubmit}>
            <div className="validity-names">
              <label className="validity-name-field">
                <span className="validity-name-label">Commander</span>
                <input
                  type="text"
                  className="mtg-input validity-name-input"
                  value={commanderName}
                  onChange={(event) => setCommanderName(event.target.value)}
                  placeholder="e.g. Atraxa, Praetors' Voice"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="validity-name-field">
                <span className="validity-name-label">Partner / Background (optional)</span>
                <input
                  type="text"
                  className="mtg-input validity-name-input"
                  value={secondName}
                  onChange={(event) => setSecondName(event.target.value)}
                  placeholder="Second card of the pair, if any"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            </div>
            {formError && <p className="status-error">{formError}</p>}
            {slow && (
              <p className="status-waking" aria-live="polite">
                Waking the server — it sleeps after a spell of inactivity, so the first request can
                take up to a minute.
              </p>
            )}
            <div className="validity-actions">
              <button
                type="submit"
                className="mtg-btn mtg-btn-primary validity-check-button"
                disabled={isFetching}
              >
                {isFetching ? 'Checking…' : 'Check deck'}
              </button>
            </div>
          </form>

          {error && (
            <p className="status-error" role="alert">
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          {data && <Verdict result={data} />}
        </div>
      )}
    </section>
  );
}

/** One line of the verdict: a pass/fail mark, what was checked, and — when it
 * failed — exactly which cards are the problem. */
function Check({ pass, label, detail }: { pass: boolean; label: string; detail?: ReactNode }) {
  return (
    <li className={`validity-check ${pass ? 'is-pass' : 'is-fail'}`}>
      <span aria-hidden="true" className="validity-check-mark">
        {pass ? '✓' : '✕'}
      </span>
      <span className="mtg-visually-hidden">{pass ? 'Pass:' : 'Fail:'}</span>
      <span className="validity-check-body">
        <span className="validity-check-label">{label}</span>
        {!pass && detail && <span className="validity-check-detail">{detail}</span>}
      </span>
    </li>
  );
}

function Verdict({ result }: { result: DeckValidityResponse }) {
  const { commander, deckSize, colorIdentity, singleton, legality } = result;
  return (
    <div
      className={`validity-verdict ${result.isValid ? 'is-valid' : 'is-invalid'}`}
      aria-live="polite"
    >
      <p className="validity-banner">
        {result.isValid ? 'This deck is legal.' : "This deck isn't legal yet."}
      </p>
      <ul className="validity-checks">
        <Check
          pass={deckSize.isValid}
          label={`Deck size — ${deckSize.total} of ${deckSize.expected} cards`}
          detail={
            deckSize.total < deckSize.expected
              ? `Add ${deckSize.expected - deckSize.total} card(s). Banned and unrecognized cards still count toward the total.`
              : `Remove ${deckSize.total - deckSize.expected} card(s). Banned and unrecognized cards still count toward the total.`
          }
        />
        <Check
          pass={commander.eligible && commander.pairingLegal}
          label={`Commander — ${commander.names.join(' + ')} (${identityName(commander.colorIdentity)})`}
          detail={
            !commander.eligible
              ? 'Not every named card is a legal commander on its own.'
              : 'These cards do not form a legal commander pair under the Partner-family abilities.'
          }
        />
        <Check
          pass={commander.missingFromList.length === 0}
          label="Commander(s) in the list"
          detail={`Not in the pasted list: ${commander.missingFromList.join(', ')}. The 100 cards include the commander.`}
        />
        <Check
          pass={colorIdentity.violations.length === 0}
          label={`Color identity — every card within ${identityName(colorIdentity.combined)}`}
          detail={
            <ul className="validity-card-list">
              {colorIdentity.violations.map((v) => (
                <li key={v.name}>
                  {v.name} ({identityName(v.color_identity)})
                  {v.quantity > 1 ? ` ×${v.quantity}` : ''}
                </li>
              ))}
            </ul>
          }
        />
        <Check
          pass={singleton.violations.length === 0}
          label="Singleton — one copy of each card (basic lands excepted)"
          detail={
            <ul className="validity-card-list">
              {singleton.violations.map((v) => (
                <li key={v.name}>
                  {v.name}: {v.quantity} copies, limit {v.limit}
                </li>
              ))}
            </ul>
          }
        />
        <Check
          pass={legality.banned.length === 0}
          label="Ban-list"
          detail={`Banned in Commander: ${legality.banned.join(', ')}.`}
        />
        <Check
          pass={legality.notFound.length === 0}
          label="Every card recognized"
          detail={`Not in the card database: ${legality.notFound.join(', ')}. Check spelling, or use the full double-faced name.`}
        />
      </ul>
    </div>
  );
}
