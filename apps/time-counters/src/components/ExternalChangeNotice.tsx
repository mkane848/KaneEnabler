import styles from './UndoToast.module.css';

interface ExternalChangeNoticeProps {
  change: 'updated' | 'reset';
  onDismiss: () => void;
}

/**
 * Explains a board that just changed with nobody touching it: another open
 * tab saved its game and this one adopted it (useGameState's cross-tab
 * sync). Shares UndoToast's look and spot — the two never show together,
 * since adopting a game closes the undo window and acting here clears this.
 *
 * No auto-dismiss, unlike UndoToast: that one offers an action with a
 * deadline, this one explains a change the player may not have watched
 * happen, and it already goes away on their next action.
 */
export default function ExternalChangeNotice({ change, onDismiss }: ExternalChangeNoticeProps) {
  return (
    <div className={styles.toast} role="status">
      <span className={styles.text}>
        {change === 'reset'
          ? 'A new game was started in another tab'
          : 'This game was updated in another tab'}
      </span>
      <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label="Dismiss">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
