import { useState } from 'react';
import CommanderBanner from './CommanderBanner';
import styles from './Header.module.css';

interface HeaderProps {
  turn: number;
  onSetTurn: (turn: number) => void;
  onNextTurn: () => void;
  onReset: () => void;
}

export default function Header({ turn, onSetTurn, onNextTurn, onReset }: HeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(turn));

  function startEditing() {
    setDraft(String(turn));
    setEditing(true);
  }

  function commitEdit() {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed >= 1) {
      onSetTurn(Math.round(parsed));
    }
    setEditing(false);
  }

  function handleReset() {
    if (window.confirm('Start a new game? This clears every tracked card and resets the turn to 1.')) {
      onReset();
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>Commander companion</span>
          <h1 className={styles.title}>Time Counters</h1>
          <CommanderBanner />
        </div>
        <button type="button" className={styles.resetBtn} onClick={handleReset}>
          New game
        </button>
      </div>

      <div className={styles.turnRow}>
        <div className={styles.turnLabelGroup}>
          <span className={styles.turnLabel}>My turn</span>
          {editing ? (
            <input
              autoFocus
              className={styles.turnInput}
              type="number"
              min={1}
              inputMode="numeric"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.turnNumberBtn}
              onClick={startEditing}
              aria-label={`Turn ${turn}. Tap to edit.`}
              title="Tap to edit turn number"
            >
              {turn}
            </button>
          )}
        </div>

        <button type="button" className="btn btn-primary" onClick={onNextTurn}>
          Next turn →
        </button>
      </div>
    </header>
  );
}
