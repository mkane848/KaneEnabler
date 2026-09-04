import { clearState } from '../utils/storage';
import styles from './ErrorFallback.module.css';

interface ErrorFallbackProps {
  error: Error;
  onRetry: () => void;
}

/**
 * Shown in place of the whole app when a render throws (see
 * docs/rules-audit.md item 17) — mid-game, with no other way back, so this
 * is the one screen in the app that can't assume useGameState is still
 * mounted. "Reset Game" clears the save directly rather than going through
 * the hook's own resetGame, and reloads so a fresh mount picks up the
 * (now-empty) state cleanly.
 */
export default function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.box}>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.body}>
          The tracker hit an unexpected error and couldn't continue. Your last save is still on this
          device — try again first, or reset the game if that keeps happening.
        </p>
        <p className={styles.detail}>{error.message}</p>
        <div className={styles.actions}>
          <button type="button" className="mtg-btn mtg-btn-primary" onClick={onRetry}>
            Try again
          </button>
          <button
            type="button"
            className="mtg-btn mtg-btn-danger"
            onClick={() => {
              clearState();
              window.location.reload();
            }}
          >
            Reset game
          </button>
        </div>
      </div>
    </div>
  );
}
