import type { CommanderId, RoseTylerState } from '../types';
import styles from './CommanderTaxModal.module.css';

interface CommanderTaxModalProps {
  commanderId: CommanderId;
  name: string;
  imageSmall?: string;
  castCount: number;
  onBattlefield: boolean;
  roseState?: RoseTylerState;
  onCast: () => void;
  onReturnToCommandZone: () => void;
  onClose: () => void;
  onAdjustRoseTimeCounters?: (delta: number) => void;
  onRoseAttacks?: () => void;
  onOpenTimeyWimey?: () => void;
}

/**
 * Per-commander scratchpad, opened by tapping that commander's portrait.
 * Commander tax (rule 903.10) is tracked here for both commanders — it's a
 * command-zone property that accumulates for the whole game, separate from
 * anything on the battlefield, so it doesn't belong on the card board.
 *
 * Rose Tyler additionally gets a "Bad Wolf" section: her own time counters
 * (she's +1/+1 per counter) and a one-tap "Rose attacks" action that counts
 * this game's tracked Suspend/Vanishing cards for you instead of making you
 * count the board by hand every combat. The Tenth Doctor instead gets a
 * shortcut straight into Time Travel pre-set to his Timey-Wimey ability's
 * three passes.
 */
export default function CommanderTaxModal({
  commanderId,
  name,
  imageSmall,
  castCount,
  onBattlefield,
  roseState,
  onCast,
  onReturnToCommandZone,
  onClose,
  onAdjustRoseTimeCounters,
  onRoseAttacks,
  onOpenTimeyWimey,
}: CommanderTaxModalProps) {
  const nextTax = castCount * 2;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`commander-tax-title-${commanderId}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            {imageSmall && <img className={styles.portrait} src={imageSmall} alt="" />}
            <h2 id={`commander-tax-title-${commanderId}`} className={styles.title}>
              {name}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Done
          </button>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Commander tax</h3>
          <p className={styles.taxBody}>
            Cast from the command zone <strong>{castCount}</strong> time{castCount === 1 ? '' : 's'} this game.
            {castCount > 0 && (
              <>
                {' '}
                Next cast costs an extra <strong>{'{'}{nextTax}{'}'}</strong>.
              </>
            )}
            {onBattlefield && ' Currently on the battlefield.'}
          </p>
          {onBattlefield ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onReturnToCommandZone}>
              Return {name} to the command zone
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={onCast}>
              Cast {name} from the command zone
            </button>
          )}
        </section>

        {roseState && onAdjustRoseTimeCounters && onRoseAttacks && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Bad Wolf — time counters</h3>
            <p className={styles.taxBody}>
              Rose gets +1/+1 for each time counter on her. Attacking puts a counter on her for each suspended
              card you own and each other permanent you control with a time counter on it.
            </p>
            <div className={styles.counterRow}>
              <span className={styles.counterValue}>{roseState.timeCounters}</span>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => onAdjustRoseTimeCounters(-1)}
                  disabled={roseState.timeCounters <= 0}
                  aria-label="Remove one time counter from Rose Tyler"
                >
                  −
                </button>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => onAdjustRoseTimeCounters(1)}
                  aria-label="Add one time counter to Rose Tyler"
                >
                  +
                </button>
              </div>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={onRoseAttacks}>
              Rose attacks — count the board
            </button>
          </section>
        )}

        {onOpenTimeyWimey && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Timey-Wimey</h3>
            <p className={styles.taxBody}>
              {'{7}'}: Time travel three times. Activate only as a sorcery.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenTimeyWimey}>
              Time Travel ×3 →
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
