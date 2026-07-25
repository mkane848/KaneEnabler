import { manaSymbolClass, parseManaCost } from '../utils/manaSymbols';
import styles from './ManaCost.module.css';

interface ManaCostProps {
  cost?: string;
}

/** Renders a mana cost as Mana-font pips, e.g. {2}{W/U}{R} -> three icons. */
export default function ManaCost({ cost }: ManaCostProps) {
  const symbols = parseManaCost(cost);
  if (symbols.length === 0) return null;

  return (
    <span className={styles.row} aria-label={`Mana cost ${cost}`}>
      {symbols.map((symbol, i) => (
        <i key={i} className={`ms ms-${manaSymbolClass(symbol)} ms-cost ms-shadow`} aria-hidden="true" />
      ))}
    </span>
  );
}
