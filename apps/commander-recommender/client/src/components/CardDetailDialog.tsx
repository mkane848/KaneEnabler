import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { identityName, sortWubrg } from '../lib/mtg';
import { ManaSymbol } from './ManaSymbol';
import { ManaCost } from './ManaCost';
import type { BracketEstimateDTO, CommanderCardDTO } from '../types';

interface Props {
  card: CommanderCardDTO;
  /** Currently unused: the Bracket estimate row is hidden while the
   * calculation is reworked. Kept on the props (and still passed by every
   * caller) so restoring that row is a one-line change. */
  bracket: BracketEstimateDTO;
  children: ReactNode;
}

/**
 * The full card, laid out the way a card is: art, then name and mana cost,
 * then type line, then the complete rules text and power/toughness.
 *
 * Radix Dialog handles the parts that are easy to get wrong by hand — focus
 * trapping, restoring focus to the trigger on close, Escape, scroll locking,
 * and the aria wiring between trigger, title and description.
 *
 * Deliberately stops short of reimplementing Scryfall: printings, rulings,
 * prices and legality across every format are all a click away on the real
 * page, which this links to rather than approximating badly.
 */
export function CardDetailDialog({ card, children }: Props) {
  const { power, toughness } = card;
  const hasStats = power !== null && toughness !== null;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          <div className="dialog-card">
            {card.imageUri && <img className="dialog-art" src={card.imageUri} alt="" loading="lazy" />}

            <div className="dialog-body">
              <div className="dialog-titlebar">
                <Dialog.Title className="dialog-name">{card.name}</Dialog.Title>
                {card.manaCost && <ManaCost cost={card.manaCost} />}
              </div>

              {card.typeLine && <p className="dialog-type">{card.typeLine}</p>}

              {card.oracleText && <p className="dialog-oracle">{card.oracleText}</p>}

              {hasStats && (
                <p className="dialog-stats">
                  {power}/{toughness}
                </p>
              )}

              <dl className="dialog-meta">
                <div>
                  <dt>Color identity</dt>
                  <dd>
                    <span className="dialog-pips">
                      {card.colorIdentity.length === 0 ? (
                        <ManaSymbol color="C" decorative />
                      ) : (
                        sortWubrg(card.colorIdentity).map((color) => (
                          <ManaSymbol key={color} color={color} decorative />
                        ))
                      )}
                    </span>
                    {identityName(card.colorIdentity)}
                  </dd>
                </div>
                <div>
                  <dt>Commander</dt>
                  <dd>Legal{card.isGameChanger ? ' · Game Changer' : ''}</dd>
                </div>
                {/* Bracket estimate hidden alongside the badge on each card
                    while the calculation is being reworked. `bracket` stays
                    on the props so restoring this needs no re-plumbing. */}
              </dl>

              {card.scryfallUri && (
                <a className="dialog-link" href={card.scryfallUri} target="_blank" rel="noreferrer noopener">
                  View on Scryfall — printings, rulings, prices
                </a>
              )}
            </div>
          </div>

          <Dialog.Close className="dialog-close" aria-label="Close">
            <span aria-hidden="true">×</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
