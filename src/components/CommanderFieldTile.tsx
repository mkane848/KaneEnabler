import { useState } from 'react';
import type { CommanderId } from '../types';
import styles from './CommanderFieldTile.module.css';

export interface CommanderFieldCard {
  id: CommanderId;
  name: string;
  imageSmall?: string;
  castCount: number;
}

interface CommanderFieldTileProps {
  commander: CommanderFieldCard;
  onManage: (id: CommanderId, imageSmall?: string) => void;
  onReturnToCommandZone: (id: CommanderId) => void;
}

/**
 * A commander currently on the battlefield, shown as a card on the board
 * like everything else — same tap-to-expand tile shell as CardTile, but
 * there's no counter to step: tax and Bad Wolf live in CommanderTaxModal,
 * so this just links out to it plus a quick "leave the battlefield" action.
 */
export default function CommanderFieldTile({ commander, onManage, onReturnToCommandZone }: CommanderFieldTileProps) {
  const [expanded, setExpanded] = useState(false);
  const { id, name, imageSmall, castCount } = commander;
  const nextTax = castCount * 2;

  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={styles.artButton}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={`${name}, on the battlefield. ${expanded ? 'Collapse' : 'Expand'} details.`}
      >
        {imageSmall ? (
          <img className={styles.art} src={imageSmall} alt={name} />
        ) : (
          <div className={styles.artFallback}>
            <span className={styles.artFallbackName}>{name}</span>
          </div>
        )}
        <span className={styles.badge}>{castCount > 0 ? `+${nextTax}` : '0'}</span>
      </button>

      {expanded && (
        <div className={styles.details}>
          <div className={styles.name}>{name}</div>
          <div className={styles.subRow}>
            <span className={styles.commanderTag}>Commander</span>
          </div>
          <p className={styles.body}>
            Cast {castCount} time{castCount === 1 ? '' : 's'} this game.
            {castCount > 0 && ` Next cast costs an extra {${nextTax}}.`}
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onManage(id, imageSmall)}>
              Tax / Bad Wolf →
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onReturnToCommandZone(id)}>
              Return to command zone
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
