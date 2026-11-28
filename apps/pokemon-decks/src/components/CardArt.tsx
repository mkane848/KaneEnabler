import { useState } from 'react';
import type { PtcgCard } from '@ptcg/rules';

/**
 * A card's picture, loaded by the visitor's browser straight from TCGdex's
 * image CDN — the same arrangement as the Magic tools and Scryfall's
 * (docs/api-policy.md). Lazy, so only cards actually on screen are
 * requested; and nothing at all when TCGdex has no image or the request
 * fails, since every place this is used already says the card's name.
 */
export function CardArt({
  card,
  className,
  decorative = false,
}: {
  card: PtcgCard;
  className?: string;
  /** True where the card's name is already right beside the picture. */
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!card.image || failed) return null;
  return (
    <img
      className={className}
      src={`${card.image}/low.webp`}
      alt={decorative ? '' : card.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
