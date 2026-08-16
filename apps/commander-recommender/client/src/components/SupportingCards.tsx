import { useMemo } from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';
import { CardImageDialog } from './CardImageDialog';
import { ManaCost } from './ManaCost';
import type { SupportingCardDTO } from '../types';

export function cardCount(cards: SupportingCardDTO[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

/**
 * A card's name, with its art appearing on hover.
 *
 * HoverCard rather than a hand-rolled CSS tooltip because it portals its
 * content to `document.body` — `.support-cards` sets `overflow: hidden` for
 * its own rounded-corner row backgrounds, which would clip a plain
 * absolutely-positioned preview nested inside it. HoverCard also handles
 * viewport collision (flips below when there's no room above) for free.
 *
 * Deliberately hover-only, not tap: a touch device has no hover to fire this
 * from, but tapping already opens the full CardImageDialog below, which
 * shows the same art at a size actually usable on a small screen — a
 * floating thumbnail next to your own finger would be worse there, not
 * better, so there is nothing to add for touch.
 */
export function SupportingCardName({ card }: { card: SupportingCardDTO }) {
  const nameButton = (
    <CardImageDialog
      name={card.name}
      imageUri={card.imageUri}
      backImageUri={card.backImageUri}
      backName={card.backName}
      scryfallUri={card.scryfallUri}
    >
      <button type="button" className="support-name" aria-label={`Show the card ${card.name}`}>
        {card.name}
      </button>
    </CardImageDialog>
  );

  if (!card.imageUri) return nameButton;

  return (
    <HoverCard.Root openDelay={150} closeDelay={0}>
      {/* A <span>, not the dialog trigger itself — that renders a custom
          component rather than a DOM node, which asChild has nothing to
          forward hover listeners onto. */}
      <HoverCard.Trigger asChild>
        <span className="support-name-wrap">{nameButton}</span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className="card-hover-preview" side="top" align="start" sideOffset={8}>
          <img src={card.imageUri} alt="" loading="lazy" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

/**
 * A list of cards in curve order.
 *
 * `trailing` renders after the mana cost on each row, for callers that have
 * something else to say about a card — the deck summary uses it to note the
 * other themes a suggested card would also feed.
 */
export function SupportingCardList<T extends SupportingCardDTO>({
  cards,
  trailing,
}: {
  cards: T[];
  trailing?: (card: T) => React.ReactNode;
}) {
  // Curve order, the way a decklist is read: cheapest first, ties alphabetical.
  // Cards without a mana value — lands, mostly — sort last rather than as
  // zero, since a land is not a one-drop.
  const ordered = useMemo(
    () =>
      [...cards].sort((a, b) => {
        const aValue = a.manaValue ?? Number.POSITIVE_INFINITY;
        const bValue = b.manaValue ?? Number.POSITIVE_INFINITY;
        if (aValue !== bValue) return aValue - bValue;
        return a.name.localeCompare(b.name);
      }),
    [cards]
  );

  return (
    <ul className="support-cards">
      {ordered.map((card) => (
        <li key={card.name} className="support-card">
          {card.quantity > 1 && <span className="support-qty">{card.quantity}×</span>}
          <SupportingCardName card={card} />
          {/* The printed cost, not "MV 3" — pips are what a player reads, and
              they carry the colors as well as the number. Falls back to
              nothing for lands and anything else without a cost. */}
          {card.manaCost && (
            <span className="support-cost">
              <ManaCost cost={card.manaCost} />
            </span>
          )}
          {card.isGameChanger && (
            <span className="support-gc" title="On the Game Changers list">
              GC
            </span>
          )}
          {trailing?.(card)}
        </li>
      ))}
    </ul>
  );
}
