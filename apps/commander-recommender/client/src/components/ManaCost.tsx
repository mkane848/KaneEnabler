import type { CSSProperties } from 'react';
import { MANA_GLYPHS, MANA_VIEWBOX, parseManaCost, toPip, type Face } from '@mtg/mana';

function FaceContent({ face }: { face: Face }) {
  if ('glyph' in face) {
    return (
      <svg viewBox={MANA_VIEWBOX} focusable="false" aria-hidden="true">
        <path d={MANA_GLYPHS[face.glyph]} />
      </svg>
    );
  }
  return <span className="pip-text">{face.text}</span>;
}

/**
 * Renders a mana cost as pips, e.g. {2}{W/U}{R} -> three symbols.
 *
 * Hybrids split the disc corner to corner, each half tinted by its own
 * symbol, the same way they're printed; Phyrexian mana ({W/P}) draws as one
 * glyph on one disc rather than a two-way split — toPip already resolves
 * that distinction, this just renders whatever it returns. Anything with no
 * glyph (generic amounts, X) falls back to text on a neutral disc.
 */
export function ManaCost({ cost }: { cost: string }) {
  const symbols = parseManaCost(cost);
  if (symbols.length === 0) return null;

  return (
    <span className="mana-cost" role="img" aria-label={`Mana cost: ${symbols.join(', ')}`}>
      {symbols.map((symbol, i) => {
        const pip = toPip(symbol);
        const hybrid = pip.faces.length === 2;
        const [first, second = first] = pip.colors;

        return (
          <span
            key={i}
            className={hybrid ? 'pip pip-hybrid' : 'pip'}
            style={
              {
                '--pip-bg-a': `var(--pip-${first})`,
                '--pip-bg-b': `var(--pip-${second})`,
                '--pip-ink-a': `var(--pip-${first}-ink)`,
                '--pip-ink-b': `var(--pip-${second}-ink)`,
              } as CSSProperties
            }
            title={pip.label}
          >
            {pip.faces.map((face, j) =>
              hybrid ? (
                <span key={j} className="pip-half">
                  <FaceContent face={face} />
                </span>
              ) : (
                <FaceContent key={j} face={face} />
              ),
            )}
          </span>
        );
      })}
    </span>
  );
}
