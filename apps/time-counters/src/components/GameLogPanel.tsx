import type { LogEntry, Mechanic } from '../types';
import { MECHANIC_COLOR, MECHANIC_LABEL } from '../utils/counters';
import styles from './GameLogPanel.module.css';

interface GameLogPanelProps {
  log: LogEntry[];
  currentTurn: number;
  onClose: () => void;
}

function mechanicColor(mechanic: Mechanic): string {
  return MECHANIC_COLOR[mechanic];
}

interface TurnGroup {
  turn: number;
  entries: LogEntry[];
}

/** Newest turn first, newest entry first within a turn — a quick "what just happened" read. */
function groupByTurn(log: LogEntry[]): TurnGroup[] {
  const byTurn = new Map<number, LogEntry[]>();
  for (const entry of log) {
    const list = byTurn.get(entry.turn);
    if (list) list.push(entry);
    else byTurn.set(entry.turn, [entry]);
  }
  return [...byTurn.entries()]
    .map(([turn, entries]) => ({ turn, entries: [...entries].reverse() }))
    .sort((a, b) => b.turn - a.turn);
}

/**
 * Game log — a SpellTable-style history of every effect that changed
 * something, grouped by turn. Implemented as a slide-in side drawer rather
 * than a permanently docked sidebar: this app is mobile-first, and there
 * isn't screen width to keep a sidebar visible alongside the board on a
 * phone, so it's reference material you pull up and dismiss like the other
 * panels rather than a fixed pane.
 */
export default function GameLogPanel({ log, currentTurn, onClose }: GameLogPanelProps) {
  const groups = groupByTurn(log);

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-log-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="game-log-title" className={styles.title}>
            Game Log
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {groups.length === 0 ? (
          <p className={styles.empty}>
            Nothing logged yet — actions you take show up here as you play.
          </p>
        ) : (
          <div className={styles.groups}>
            {groups.map((group) => (
              <section key={group.turn} className={styles.group}>
                <h3 className={styles.turnHeading}>
                  Turn {group.turn}
                  {group.turn === currentTurn && <span className={styles.currentTag}>current</span>}
                </h3>
                <div className={styles.entries}>
                  {group.entries.map((entry) => (
                    <div key={entry.id} className={styles.entry}>
                      <div className={styles.entryTitle}>{entry.title}</div>
                      {entry.changes && entry.changes.length > 0 ? (
                        <ul className={styles.changeList}>
                          {entry.changes.map((c, i) => (
                            <li key={i} className={styles.changeRow}>
                              <span
                                className={styles.changeDot}
                                style={{ background: mechanicColor(c.mechanic) }}
                                title={MECHANIC_LABEL[c.mechanic]}
                              />
                              <span className={styles.changeName}>{c.name}</span>
                              <span className={styles.changeValue}>
                                {c.from} → {c.to}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        entry.detail && <p className={styles.entryDetail}>{entry.detail}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
