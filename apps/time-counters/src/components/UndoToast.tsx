import { useEffect } from 'react';
import styles from './UndoToast.module.css';

const AUTO_DISMISS_MS = 6000;

interface UndoToastProps {
  cardName: string;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * A brief, dismissible prompt after removing a tracked card — the trigger
 * for removal is a ~20px × button, easy to fat-finger, and there's no other
 * way back once a card is gone. Auto-dismisses so it doesn't linger as
 * clutter once the window to undo has meaningfully passed.
 */
export default function UndoToast({ cardName, onUndo, onDismiss }: UndoToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [cardName, onDismiss]);

  return (
    <div className={styles.toast} role="status">
      <span className={styles.text}>{cardName} removed</span>
      <button type="button" className={styles.undoBtn} onClick={onUndo}>
        Undo
      </button>
      <button type="button" className={styles.dismissBtn} onClick={onDismiss} aria-label="Dismiss">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
