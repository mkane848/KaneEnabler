import { COLOR_LABELS } from '../lib/mtg';
import { MANA_GLYPHS, MANA_VIEWBOX } from '../lib/manaSymbols';

interface Props {
  /** W, U, B, R, G, or C. */
  color: string;
  /** Rendered as a decorative pip when the surrounding text already names it. */
  decorative?: boolean;
  className?: string;
}

/**
 * One mana symbol: the colored disc from CSS, the glyph from inlined path
 * data. Matches how the printed symbols look — colored circle, dark glyph,
 * subtle drop shadow — without pulling in a webfont for six icons.
 */
export function ManaSymbol({ color, decorative, className }: Props) {
  const key = color.toLowerCase();
  const glyph = MANA_GLYPHS[key];
  const label = COLOR_LABELS[color.toUpperCase()] ?? color;

  return (
    <span
      className={`pip pip-${key}${className ? ` ${className}` : ''}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      title={label}
    >
      {glyph && (
        <svg viewBox={MANA_VIEWBOX} focusable="false" aria-hidden="true">
          <path d={glyph} />
        </svg>
      )}
    </span>
  );
}
