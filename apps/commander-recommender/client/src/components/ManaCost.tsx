import { ManaSymbol } from './ManaSymbol';
import { MANA_GLYPHS } from '../lib/manaSymbols';

/** Splits "{3}{U}{B}" into ["3", "U", "B"]. */
function parseCost(cost: string): string[] {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

/**
 * Renders a mana cost as symbols.
 *
 * Only the five colors and colorless have inlined glyphs, so anything else —
 * generic amounts, {X}, {T}, hybrids — falls back to a neutral disc with the
 * symbol's text in it. That covers every cost legibly without inlining the
 * ~300 glyphs the full set would need.
 */
export function ManaCost({ cost }: { cost: string }) {
  const symbols = parseCost(cost);
  if (symbols.length === 0) return null;

  return (
    <span className="mana-cost" role="img" aria-label={`Mana cost: ${symbols.join(', ')}`}>
      {symbols.map((symbol, index) => {
        const key = symbol.toLowerCase();
        return MANA_GLYPHS[key] ? (
          <ManaSymbol key={index} color={symbol} decorative />
        ) : (
          <span key={index} className="pip pip-generic" aria-hidden="true">
            {symbol}
          </span>
        );
      })}
    </span>
  );
}
