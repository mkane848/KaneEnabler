import type { CSSProperties } from 'react';
import { MANA_GLYPHS, MANA_VIEWBOX } from '../utils/manaGlyphs';
import { parseManaCost, toPip, type Face } from '../utils/manaSymbols';
import styles from './ManaCost.module.css';

interface ManaCostProps {
  cost?: string;
}

function FaceContent({ face }: { face: Face }) {
  if ('glyph' in face) {
    return (
      <svg className={styles.glyph} viewBox={MANA_VIEWBOX} focusable="false" aria-hidden="true">
        <path d={MANA_GLYPHS[face.glyph]} />
      </svg>
    );
  }
  return <span className={styles.text}>{face.text}</span>;
}

/**
 * Renders a mana cost as pips, e.g. {2}{W/U}{R} -> three symbols.
 *
 * Each pip carries its disc colour and a matching ink colour as inline custom
 * properties. The ink has to travel with the colour rather than come from a
 * class, because dark discs (blue, black, red, green) need a light glyph and
 * pale ones (white, snow, generic) need a dark one — and a hybrid can pair
 * one of each in a single circle.
 *
 * These are named --disc-*, deliberately not --pip-*: the palette in index.css
 * already owns --pip-b for black mana, and setting a property of that name here
 * would shadow it for everything inside the pip. A black symbol would then
 * resolve to --pip-b: var(--pip-b), which is circular, and CSS throws the whole
 * declaration away — leaving an invisible disc.
 *
 * The whole cost gets one label rather than one per pip, so a screen reader
 * reads "mana cost {2}{W/U}{R}" and moves on instead of spelling out every
 * symbol; the pips themselves are decorative once the cost has been read.
 */
export default function ManaCost({ cost }: ManaCostProps) {
  const symbols = parseManaCost(cost);
  if (symbols.length === 0) return null;

  return (
    <span className={styles.row} role="img" aria-label={`Mana cost ${cost}`}>
      {symbols.map((symbol, i) => {
        const pip = toPip(symbol);
        const hybrid = pip.faces.length === 2;
        const [first, second = first] = pip.colors;

        return (
          <span
            key={i}
            className={hybrid ? `${styles.pip} ${styles.hybrid}` : styles.pip}
            style={
              {
                '--disc-a': `var(--pip-${first})`,
                '--disc-b': `var(--pip-${second})`,
                '--ink-a': `var(--pip-${first}-ink)`,
                '--ink-b': `var(--pip-${second}-ink)`,
              } as CSSProperties
            }
            title={pip.label}
          >
            {pip.faces.map((face, j) => (
              <span key={j} className={hybrid ? styles.half : styles.whole}>
                <FaceContent face={face} />
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}
