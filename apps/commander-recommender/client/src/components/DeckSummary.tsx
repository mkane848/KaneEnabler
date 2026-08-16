import { useState } from 'react';
import { SupportingCardList } from './SupportingCards';
import type { DeckAnalysisDTO, DeckThemeDTO, SlotStatusDTO, SlotSuggestionDTO } from '../types';

/** Suggestions revealed at a time, and how many more each press adds. */
const SUGGESTION_PAGE = 5;

/**
 * The hint that a slot is the one this archetype usually lacks.
 *
 * Presented as a guess and labelled as one. It is a judgement call baked into
 * the lifecycle definitions, not a measurement — nothing in the data backs it
 * yet — so it gets a star and a tooltip that says exactly that, rather than
 * the confident phrasing the rest of these panels use.
 */
function CommonlyMissingHint() {
  return (
    <span
      className="slot-hint"
      title="Low confidence: a guess at the slot this archetype usually lacks, not something measured. We'll revisit it once there are enough real lists to check it against."
    >
      ★ often the missing piece
    </span>
  );
}

function SuggestionList({ suggestions }: { suggestions: SlotSuggestionDTO[] }) {
  const [shown, setShown] = useState(SUGGESTION_PAGE);
  const visible = suggestions.slice(0, shown);

  return (
    <div className="slot-suggestions">
      <p className="slot-suggestions-label">Cards that would fill it, in your colors:</p>
      <SupportingCardList
        cards={visible}
        trailing={(card) =>
          card.alsoFits.length > 0 && (
            <span className="slot-also-fits" title={`Also feeds: ${card.alsoFits.join(', ')}`}>
              also {card.alsoFits.join(', ')}
            </span>
          )
        }
      />
      {shown < suggestions.length && (
        <button
          type="button"
          className="link-button"
          onClick={() => setShown((n) => n + SUGGESTION_PAGE)}
        >
          Show {Math.min(SUGGESTION_PAGE, suggestions.length - shown)} more
        </button>
      )}
    </div>
  );
}

function Slot({ slot }: { slot: SlotStatusDTO }) {
  return (
    <li className={`deck-slot ${slot.filled ? 'is-filled' : 'is-short'}`}>
      <div className="deck-slot-head">
        <span className="deck-slot-mark" aria-hidden="true">
          {slot.filled ? '✓' : '○'}
        </span>
        <span className="deck-slot-label">{slot.label}</span>
        <span className="deck-slot-count">
          {slot.cards.length}
          {/* The target is only worth showing when it hasn't been met —
              "8/2" reads as a shortfall at a glance when it is the opposite. */}
          {!slot.filled && ` of ${slot.minimum}`}
        </span>
        {!slot.filled && slot.commonlyMissing && <CommonlyMissingHint />}
      </div>
      <p className="deck-slot-description">{slot.description}</p>

      {slot.cards.length > 0 && (
        <details className="deck-slot-cards">
          <summary>
            {slot.cards.length} card{slot.cards.length === 1 ? '' : 's'} from your list
          </summary>
          <SupportingCardList cards={slot.cards} />
        </details>
      )}

      {!slot.filled && slot.suggestions.length > 0 && <SuggestionList suggestions={slot.suggestions} />}
    </li>
  );
}

function Theme({ theme }: { theme: DeckThemeDTO }) {
  const shortSlots = theme.slots.filter((s) => !s.filled);

  return (
    <details className="deck-theme" open={!theme.complete}>
      <summary>
        <span className="deck-theme-label">{theme.label}</span>
        <span className="deck-theme-count">
          {theme.cardCount} card{theme.cardCount === 1 ? '' : 's'}
        </span>
        {/* Kindred and the like have no chain, so neither badge applies —
            saying "complete" about a pile of Goblins would be meaningless,
            and saying "incomplete" would invent a problem. */}
        {theme.slots.length > 0 &&
          (theme.complete ? (
            <span className="deck-theme-status is-complete">Complete</span>
          ) : (
            <span className="deck-theme-status is-short">
              Missing {shortSlots.map((s) => s.label.toLowerCase()).join(', ')}
            </span>
          ))}
      </summary>

      <p className="deck-theme-description">{theme.description}</p>

      {theme.slots.length > 0 ? (
        <ul className="deck-slots">
          {theme.slots.map((slot) => (
            <Slot key={slot.key} slot={slot} />
          ))}
        </ul>
      ) : (
        <SupportingCardList cards={theme.cards} />
      )}
    </details>
  );
}

/**
 * What the submitted list is doing, before any commander is involved.
 *
 * The rest of this page answers "which commander fits these cards?". This
 * answers "what deck is this, and what is it missing?" — which is actionable
 * without picking a commander at all, and is usually the more useful question
 * when a list is still being assembled.
 */
export function DeckSummary({ deck }: { deck: DeckAnalysisDTO }) {
  if (deck.themes.length === 0) return null;

  return (
    <section className="deck-summary">
      <h2>What this list is doing</h2>
      <p className="deck-summary-intro">
        The strongest patterns in your cards, and whether each one has everything it needs to actually work. A
        theme is a chain, not a pile — nine death triggers and no sacrifice outlet is a deck that can't execute.
      </p>
      <div className="deck-themes">
        {deck.themes.map((theme) => (
          <Theme key={`${theme.archetype}:${theme.qualifier ?? ''}`} theme={theme} />
        ))}
      </div>
    </section>
  );
}
