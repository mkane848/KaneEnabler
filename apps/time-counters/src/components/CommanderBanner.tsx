import { useCommanderCards } from '../hooks/useCommanderCards';
import type { CommanderId } from '../types';
import { COMMANDER_IDS, COMMANDER_NAME } from '../utils/commanders';
import styles from './CommanderBanner.module.css';

interface CommanderBannerProps {
  onOpenCommander: (id: CommanderId, imageSmall?: string) => void;
}

/**
 * A quiet caption crediting this deck's commanders. Portraits appear once the
 * card catalog has loaded and has art for them; until then this degrades to
 * plain text rather than reserving empty space. Tapping a portrait opens
 * that commander's tax/Bad-Wolf tracker (CommanderTaxModal).
 */
export default function CommanderBanner({ onOpenCommander }: CommanderBannerProps) {
  // useCommanderCards already does (and memoizes) the same catalog lookup —
  // this used to redo it here with its own unmemoized findCardByName loop.
  const commanderCards = useCommanderCards();

  const portraits = COMMANDER_IDS.map((id) => ({
    id,
    name: COMMANDER_NAME[id],
    card: commanderCards[id],
  })).filter((c): c is typeof c & { card: NonNullable<typeof c.card> } =>
    Boolean(c.card?.imageSmall),
  );

  return (
    <div className={styles.wrap}>
      {portraits.length > 0 && (
        <span className={styles.portraits}>
          {portraits.map(({ id, card }) => (
            <button
              key={card.id}
              type="button"
              className={styles.portraitBtn}
              onClick={() => onOpenCommander(id, card.imageSmall)}
              title={`${card.name} — tap to track commander tax`}
              aria-label={`${card.name} — open commander tax tracker`}
            >
              <img className={styles.portrait} src={card.imageSmall} alt={card.name} />
            </button>
          ))}
        </span>
      )}
      <span className={styles.label}>
        Commanders:{' '}
        <button
          type="button"
          className={styles.labelLink}
          onClick={() => onOpenCommander('tenthDoctor')}
        >
          <strong>The Tenth Doctor</strong>
        </button>{' '}
        &amp;{' '}
        <button
          type="button"
          className={styles.labelLink}
          onClick={() => onOpenCommander('roseTyler')}
        >
          <strong>Rose Tyler</strong>
        </button>
      </span>
    </div>
  );
}
