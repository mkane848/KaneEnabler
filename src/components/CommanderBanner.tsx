import { useCardCatalog } from '../hooks/useCardCatalog';
import { findCardByName } from '../utils/cardCatalog';
import styles from './CommanderBanner.module.css';

const COMMANDER_NAMES = ['The Tenth Doctor', 'Rose Tyler'];

/**
 * A quiet caption crediting this deck's commanders. Portraits appear once the
 * card catalog has loaded and has art for them; until then this degrades to
 * plain text rather than reserving empty space.
 */
export default function CommanderBanner() {
  const { cards: catalog } = useCardCatalog();

  const portraits = catalog
    ? COMMANDER_NAMES.map(name => findCardByName(catalog, name)).filter(
        (c): c is NonNullable<typeof c> => Boolean(c?.imageSmall),
      )
    : [];

  return (
    <div className={styles.wrap}>
      {portraits.length > 0 && (
        <span className={styles.portraits}>
          {portraits.map(card => (
            <img
              key={card.id}
              className={styles.portrait}
              src={card.imageSmall}
              alt={card.name}
              title={card.artist ? `${card.name} — art by ${card.artist}, via Scryfall` : card.name}
            />
          ))}
        </span>
      )}
      <span className={styles.label}>
        Commanders: <strong>The Tenth Doctor</strong> &amp; <strong>Rose Tyler</strong>
      </span>
    </div>
  );
}
