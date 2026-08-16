import { useEffect, useId, useRef, useState } from 'react';
import { ComboFinder } from './ComboFinder';
import { CardDetailDialog } from './CardDetailDialog';
import { CardImageDialog } from './CardImageDialog';
import { cardCount, SupportingCardList } from './SupportingCards';
import { useAppStore } from '../store/useAppStore';
import { identityName, sortWubrg } from '../lib/mtg';
import { visibleKeywordSupport, visibleThemeSupport, visibleKindredSupport } from '../lib/suggestions';
import { ManaSymbol } from './ManaSymbol';
import type { BracketEstimateDTO, CommanderCardDTO, CommanderSuggestionDTO } from '../types';

/**
 * The raw score this suggestion was ranked by, shown as-is.
 *
 * Deliberately not normalised into a percentage or a confidence label: while
 * the scoring model is still being tuned, the actual number is the useful
 * thing to see — a percentage of the top result hides whether the whole
 * field scored 3 or 300, and reads as a confidence it was never measuring.
 * The explanation below it stays, since *why* a number came out that way is
 * exactly what a raw figure doesn't tell you.
 *
 * The tooltip stays in the DOM and is shown/hidden with CSS (:hover,
 * :focus-within) so desktop hover needs no JS at all — `open` only exists to
 * make tap-to-toggle work on touch devices, which have no hover state.
 */
function ScoreBadge({ suggestion }: { suggestion: CommanderSuggestionDTO }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  // Each entry names its own kind and carries its own plural, so they read
  // correctly joined together without a trailing noun to agree with.
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const signals: string[] = [];
  if (suggestion.matchedCreatureTypes.length > 0) {
    signals.push(plural(suggestion.matchedCreatureTypes.length, 'kindred match'));
  }
  if (suggestion.matchedThemes.length > 0) {
    signals.push(plural(suggestion.matchedThemes.length, 'theme'));
  }
  if (suggestion.matchedKeywords.length > 0) {
    signals.push(plural(suggestion.matchedKeywords.length, 'keyword'));
  }

  return (
    <span className={`match-badge-wrap${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="badge badge-match"
        aria-describedby={tooltipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        score {suggestion.score}
      </button>
      {/* The card count is the pool each signal is measured against, not
          credit in its own right — colors decide what is eligible and score
          nothing, so the wording must not imply that playing more of your
          list is itself what earned the score. */}
      <span role="tooltip" id={tooltipId} className="match-tooltip">
        Ranked on {suggestion.score}
        {signals.length > 0 ? `, from ${signals.join(', ')}` : ''}, weighed against the{' '}
        {suggestion.includedCardCount} card{suggestion.includedCardCount === 1 ? '' : 's'} it can play from your list.
        Each signal counts for the share of that pool backing it. Colors decide which cards count, never how good the
        match is.
      </span>
    </span>
  );
}

/** One face's own art, opening a whole-card image preview when tapped. */
function CommanderArt({ card }: { card: CommanderCardDTO }) {
  if (!card.imageUri) return null;
  return (
    <CardImageDialog
      name={card.name}
      imageUri={card.imageUri}
      backImageUri={card.backImageUri}
      backName={card.backName}
      scryfallUri={card.scryfallUri}
    >
      <button type="button" className="commander-art-trigger" aria-label={`Show the full card for ${card.name}`}>
        <img className="commander-image" src={card.imageUri} alt={card.name} loading="lazy" />
      </button>
    </CardImageDialog>
  );
}

/**
 * One card's own name, type line and rules text within a commander unit.
 * A solo commander renders one of these; a Partner/Background pair renders
 * two, one per card — each is jointly "the commander" (702.124e), so neither
 * gets top billing over the other.
 */
function CommanderFace({
  card,
  bracket,
  inPair,
}: {
  card: CommanderCardDTO;
  bracket: BracketEstimateDTO;
  /** Within a pair the two names are already shown together above, so each
   * face carries a small caption instead of a second full-size heading —
   * enough to tell which text belongs to which card, without repeating the
   * title at title weight. */
  inPair: boolean;
}) {
  // Whether the clamped rules text is actually cut off, so "Read more" only
  // appears when there is more to read. Measured rather than guessed from
  // character count: how many lines an ability takes depends on the column
  // width, which changes as the grid reflows — hence the ResizeObserver
  // rather than a single measurement on mount.
  const oracleRef = useRef<HTMLSpanElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const node = oracleRef.current;
    if (!node) return;

    const measure = () => setIsClamped(node.scrollHeight > node.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [card.oracleText]);

  return (
    <div className="commander-face">
      {inPair ? (
        <p className="commander-face-label">{card.name}</p>
      ) : (
        <h3 className="commander-name">{card.name}</h3>
      )}
      {card.typeLine && <p className="commander-type">{card.typeLine}</p>}

      {/* Rules text in a card's own reading order: name, types, then the
          text box. Clamped so one wordy commander can't dominate the grid,
          and tappable at any length to open the full card. */}
      {card.oracleText && (
        <CardDetailDialog card={card} bracket={bracket}>
          <button type="button" className="commander-oracle-button" aria-label={`Show the full card for ${card.name}`}>
            <span ref={oracleRef} className="commander-oracle">
              {card.oracleText}
            </span>
            {isClamped && <span className="oracle-more">Read more</span>}
          </button>
        </CardDetailDialog>
      )}
    </div>
  );
}

export function CommanderCard({ suggestion }: { suggestion: CommanderSuggestionDTO }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const dismiss = useAppStore((s) => s.dismiss);

  const displayName = suggestion.cards.map((c) => c.name).join(' + ');
  const isPair = suggestion.cards.length > 1;

  // Themes/kindred/keywords the collection profile matched globally can still
  // end up with zero cards once narrowed to ones that fit this commander's
  // color identity — that's not a real reason to suggest it, so it's
  // filtered out here rather than shown as an empty group.
  const kindredSupport = visibleKindredSupport(suggestion);
  const themeSupport = visibleThemeSupport(suggestion);
  const keywordSupport = visibleKeywordSupport(suggestion);
  const kindredTypes = kindredSupport.map((t) => t.type);
  const themeLabels = themeSupport.map((t) => t.label);
  const keywordLabels = keywordSupport.map((k) => k.keyword);

  const hasReasons =
    themeSupport.length > 0 ||
    kindredSupport.length > 0 ||
    keywordSupport.length > 0 ||
    suggestion.gameChangerCards.length > 0;

  return (
    <article className={`commander-card${expanded ? ' is-expanded' : ''}${isPair ? ' is-pair' : ''}`}>
      {isPair ? (
        <div className="commander-image-row">
          {suggestion.cards.map((card) => (
            <CommanderArt key={card.oracleId} card={card} />
          ))}
        </div>
      ) : (
        <CommanderArt card={suggestion.cards[0]} />
      )}
      <button
        type="button"
        className="dismiss-button"
        onClick={() => dismiss(suggestion.unitId)}
        aria-label={`Dismiss ${displayName}`}
        title="Dismiss this suggestion"
      >
        <span aria-hidden="true">×</span>
      </button>

      <div className="commander-body">
        <div className="pip-row">
          {suggestion.colorIdentity.length === 0 ? (
            <ManaSymbol color="C" />
          ) : (
            sortWubrg(suggestion.colorIdentity).map((color) => <ManaSymbol key={color} color={color} />)
          )}
          <span className="identity-name">{identityName(suggestion.colorIdentity)}</span>
        </div>

        {/* Both halves of a pair are named together, up front. Rendering each
            face's full heading in sequence pushed the second name below a type
            line and a whole text box, so reading "who is this pairing?" meant
            scanning the length of the card. They are jointly the commander
            (702.124e) and now read as one title. */}
        {isPair && (
          <h3 className="commander-name commander-name-pair">
            {suggestion.cards.map((card, index) => (
              <span key={card.oracleId}>
                {index > 0 && <span className="pair-plus"> + </span>}
                {card.name}
              </span>
            ))}
          </h3>
        )}

        {suggestion.cards.map((card) => (
          <CommanderFace key={card.oracleId} card={card} bracket={suggestion.bracket} inPair={isPair} />
        ))}

        <div className="badge-row">
          <ScoreBadge suggestion={suggestion} />
          {/* Bracket badge and its note are hidden while the estimate is
              being reworked — `bracket` is still on the DTO and still drives
              the Game Changer count below, so restoring this is a one-line
              change rather than a re-plumb. */}
          {suggestion.gameChangerCount > 0 && (
            <span className="badge badge-gc">
              {suggestion.gameChangerCount} Game Changer{suggestion.gameChangerCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <p className="commander-meta">
          Fits {suggestion.includedCardCount} card{suggestion.includedCardCount === 1 ? '' : 's'} from your list
        </p>

        {kindredTypes.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Kindred</span> {kindredTypes.join(', ')}
          </p>
        )}
        {themeLabels.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Themes</span> {themeLabels.join(', ')}
          </p>
        )}
        {keywordLabels.length > 0 && (
          <p className="commander-tags">
            <span className="commander-tags-label">Keywords</span> {keywordLabels.join(', ')}
          </p>
        )}

        {hasReasons && (
          <button
            type="button"
            className="explain-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide why' : 'Why this commander?'}
            <span aria-hidden="true" className="explain-chevron">
              {expanded ? '▲' : '▼'}
            </span>
          </button>
        )}

        {hasReasons && expanded && (
          <div className="explain-panel" id={detailsId}>
            {/* No "What it does" section here — the rules text is on the card
                face now, so repeating it would just push the reasoning down. */}
            {kindredSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Kindred overlap</h4>
                {kindredSupport.map((kindred) => (
                  <details key={kindred.type} className="explain-group">
                    <summary className="explain-group-title">
                      {kindred.type} <span className="explain-count">{cardCount(kindred.cards)} in your list</span>
                    </summary>
                    <p className="explain-group-desc">
                      This commander's own rules text calls out {kindred.type} — merely sharing a creature
                      type is not a reason to pick a commander, but caring about one is.
                    </p>
                    <SupportingCardList cards={kindred.cards} />
                  </details>
                ))}
              </section>
            )}

            {themeSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Themes you're already building</h4>
                {themeSupport.map((theme) => (
                  <details key={theme.key} className="explain-group">
                    <summary className="explain-group-title">
                      {theme.label} <span className="explain-count">{cardCount(theme.cards)} in your list</span>
                    </summary>
                    <p className="explain-group-desc">{theme.description}</p>
                    <SupportingCardList cards={theme.cards} />
                  </details>
                ))}
              </section>
            )}

            {keywordSupport.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Shared keywords</h4>
                {keywordSupport.map((kw) => (
                  <details key={kw.keyword} className="explain-group">
                    <summary className="explain-group-title">
                      {kw.keyword} <span className="explain-count">{cardCount(kw.cards)} in your list</span>
                    </summary>
                    <p className="explain-group-desc">
                      This commander has {kw.keyword}, and enough of your list does too for it to be a real pattern,
                      not a coincidence.
                    </p>
                    <SupportingCardList cards={kw.cards} />
                  </details>
                ))}
              </section>
            )}

            {suggestion.gameChangerCards.length > 0 && (
              <section className="explain-section">
                <h4 className="explain-heading">Game Changers</h4>
                {/* Collapsed like the signal groups above, so no one section
                    is left stretching the panel on its own. */}
                <details className="explain-group">
                  <summary className="explain-group-title">
                    Game Changers{' '}
                    <span className="explain-count">{cardCount(suggestion.gameChangerCards)} in your list</span>
                  </summary>
                  <p className="explain-group-desc">
                    These cards are on Wizards' official Game Changers list.
                  </p>
                  <SupportingCardList cards={suggestion.gameChangerCards} />
                </details>
              </section>
            )}

            <ComboFinder commanderNames={suggestion.cards.map((c) => c.name)} />

            <p className="explain-caveat">
              Matches come from card text, keywords, and creature types, not a model of how the deck actually
              plays. Treat this as a starting point.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
