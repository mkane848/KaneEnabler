import { useState } from 'react';
import CommanderBanner from './CommanderBanner';
import type { CommanderId } from '../types';
import styles from './Header.module.css';

interface HeaderProps {
  turn: number;
  onSetTurn: (turn: number) => void;
  onNextTurn: () => void;
  onReset: () => void;
  onOpenLog: () => void;
  onOpenAbout: () => void;
  onOpenCommander: (id: CommanderId, imageSmall?: string) => void;
}

export default function Header({
  turn,
  onSetTurn,
  onNextTurn,
  onReset,
  onOpenLog,
  onOpenAbout,
  onOpenCommander,
}: HeaderProps) {
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
    if (
      window.confirm('Start a new game? This clears every tracked card and resets the turn to 1.')
    ) {
      onReset();
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.titleBlock}>
          {/* Kept for the document outline, not shown: the NavBar directly
              above already brands the page ("KaneEnabler" / "Time Counters"),
              and printing the app name a second time under it was the most
              visible way this tool read as its own separate site. What the
              bar shows instead is game state — the commanders, the turn. */}
          <h1 className="mtg-visually-hidden">Time Counters</h1>
          <CommanderBanner onOpenCommander={onOpenCommander} />
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.logBtn} onClick={onOpenLog}>
            Game Log
          </button>
          <button type="button" className={styles.logBtn} onClick={onOpenAbout}>
            About
          </button>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            New game
          </button>
        </div>
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
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
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

        <button type="button" className="mtg-btn mtg-btn-primary" onClick={onNextTurn}>
          Next turn →
        </button>
      </div>
    </header>
  );
}
