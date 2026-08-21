import { useEffect } from 'react';
import styles from './UndoToast.module.css';

const AUTO_DISMISS_MS = 6000;

interface UndoToastProps {
  /** Uniquely identifies which removal this toast is for — see the effect below for why this can't just be cardName. */
  instanceId: string;
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
export default function UndoToast({ instanceId, cardName, onUndo, onDismiss }: UndoToastProps) {
  useEffect(() => {
    // Keyed on instanceId, not cardName: removing two copies of the
    // same-named card (a common case — two Suspended copies of a spell, two
    // same-named tokens) within one undo window must restart the timer for
    // the second removal, not let the first one's still-running timer cut
    // the second toast's window short.
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [instanceId, onDismiss]);

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
