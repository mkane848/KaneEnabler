import { useEffect, useId, useRef, useState } from 'react';
import { ComboFinder } from './ComboFinder';
import { CardDetailDialog } from './CardDetailDialog';
import { CardImageDialog } from './CardImageDialog';
import { LikeDislikeButtons } from './LikeDislikeButtons';
import { cardCount, SupportingCardList } from './SupportingCards';
import { useAppStore } from '../store/useAppStore';
import { identityName, sortWubrg } from '../lib/mtg';
import {
  visibleKeywordSupport,
  visibleThemeSupport,
  visibleKindredSupport,
} from '../lib/suggestions';
import { ManaSymbol } from './ManaSymbol';
import type {
  AlsoPlayableSuggestionDTO,
  BracketEstimateDTO,
  CommanderCardDTO,
  CommanderSuggestionDTO,
} from '../types';

/** A card renders either a confident suggestion or an "also playable"
 * coverage pick — the latter carries `coverageReason`/`coveredCards` on top
 * of everything a plain suggestion has. */
type CardSuggestion = CommanderSuggestionDTO | AlsoPlayableSuggestionDTO;

function isCoveragePick(suggestion: CardSuggestion): suggestion is AlsoPlayableSuggestionDTO {
  return 'coverageReason' in suggestion;
}

/** "In your list" for a commander you already own; "Covers X, Y" for a
 * relaxed pick, naming the cards it rescues — the reason this weaker tier is
 * here at all, per docs/recommendation-coverage.md. */
function CoverageBadge({ suggestion }: { suggestion: AlsoPlayableSuggestionDTO }) {
  if (suggestion.coverageReason === 'owned') {
    return <span className="badge badge-coverage">In your list</span>;
  }
  const names = suggestion.coveredCards.map((c) => c.name);
  if (names.length === 0) return null;
  return <span className="badge badge-coverage">Covers {names.join(', ')}</span>;
}

/** One signal's contribution to the score, flattened out of the three
 * support families so they can be ranked against each other. `cards` is the
 * distinct-card count the density was measured on, not the quantity-summed
 * count the explain panel shows. */
interface ScoreRow {
  /** Family-prefixed, because a creature type and an archetype label could
   * in principle collide and these three lists are rendered as one. */
  key: string;
  label: string;
  cards: number;
  points: number;
}

/** Enough to show what drove a score without turning a tooltip into a table;
 * whatever is left over is summed into one trailing row so the breakdown
 * still accounts for the whole number. */
const BREAKDOWN_ROWS = 3;

const round1 = (n: number) => Math.round(n * 10) / 10;

function scoreRows(suggestion: CommanderSuggestionDTO): ScoreRow[] {
  return [
    ...visibleKindredSupport(suggestion).map((k) => ({
      key: `kindred:${k.type}`,
      label: k.type,
      cards: k.cards.length,
      points: k.points,
    })),
    ...visibleThemeSupport(suggestion).map((t) => ({
      key: `theme:${t.key}`,
      label: t.label,
      cards: t.cards.length,
      points: t.points,
    })),
    ...visibleKeywordSupport(suggestion).map((k) => ({
      key: `keyword:${k.keyword}`,
      label: k.keyword,
      cards: k.cards.length,
      points: k.points,
    })),
  ].sort((a, b) => b.points - a.points);
}

/**
 * How far to trust the number, in the terms the server actually measured it
 * in — `evidence` restates the same structural bar that decides which
 * suggestions are shown at all, so this says out loud what the engine was
 * already judging silently.
 */
function evidenceNote(suggestion: CommanderSuggestionDTO, rows: ScoreRow[]): string {
  const deepest = rows.reduce((most, row) => Math.max(most, row.cards), 0);
  // "different cards", not just "cards": this is the distinct-card pool the
  // density was measured on, and the card's own "Fits N cards" line above
  // sums quantity, so four basics make the two numbers disagree on purpose.
  const backing = `${deepest} of the ${suggestion.poolSize} different cards it can play from your list`;

  switch (suggestion.evidence) {
    case 'strong':
      return `${rows.length} separate signals, the deepest backed by ${backing}. Deep and broad enough to rank on.`;
    case 'moderate':
      return rows.length > 1
        ? `${rows.length} signals, none backed by more than ${backing}. Real, but thinner than a focused match.`
        : `One signal, backed by ${backing}. Deep, but it is the only thing tying this commander to your list.`;
    case 'thin':
      return `One signal on ${deepest} card${deepest === 1 ? '' : 's'} — too little to tell this apart from every other commander that does the same thing.`;
  }
}

/**
 * The score this suggestion was ranked by, broken down into the signals that
 * earned it.
 *
 * Still the raw number rather than a percentage: a percentage of the top
 * result hides whether the whole field scored 3 or 300, and reads as a
 * confidence it never measured. What the number needs is not normalising but
 * accounting for — so the tooltip itemises which signals contributed what,
 * and the rows add up to the badge exactly (`recommend.ts` sums the score
 * from the same rounded figures for that reason).
 *
 * The strength beside it is the server's own `evidenceStrength`, i.e. the
 * structural bar that already decides which suggestions are worth showing —
 * not a new judgement invented for display.
 *
 * The tooltip stays in the DOM and is shown/hidden with CSS (:hover,
 * :focus-within) so desktop hover needs no JS at all — `open` only exists to
 * make tap-to-toggle work on touch devices, which have no hover state.
 */
function ScoreBadge({ suggestion }: { suggestion: CommanderSuggestionDTO }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  const rows = scoreRows(suggestion);
  const shown = rows.slice(0, BREAKDOWN_ROWS);
  const rest = rows.slice(BREAKDOWN_ROWS);
  const restPoints = round1(rest.reduce((sum, row) => sum + row.points, 0));

  return (
    <span className={`match-badge-wrap${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`badge badge-match${suggestion.evidence === 'thin' ? ' is-thin' : ''}`}
        aria-describedby={tooltipId}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        score {suggestion.score}
        {rows.length > 0 && (
          // The separator is a real text node, not a CSS ::before: it is part
          // of how the badge is announced, not decoration.
          <span> · {suggestion.evidence}</span>
        )}
      </button>
      <span role="tooltip" id={tooltipId} className="match-tooltip">
        {rows.length === 0 ? (
          <span className="match-tooltip-note">
            Not ranked on synergy — no theme, kindred type, or keyword in your list backs this
            commander. It is here for the reason on its badge, not for its score.
          </span>
        ) : (
          <>
            <span className="match-breakdown">
              {shown.map((row) => (
                <span className="match-breakdown-row" key={row.key}>
                  <span className="match-breakdown-label">{row.label}</span>
                  <span className="match-breakdown-cards">
                    {row.cards} card{row.cards === 1 ? '' : 's'}
                  </span>
                  <span className="match-breakdown-points">+{round1(row.points)}</span>
                </span>
              ))}
              {rest.length > 0 && (
                <span className="match-breakdown-row is-rest">
                  <span className="match-breakdown-label">{rest.length} more</span>
                  <span className="match-breakdown-cards" />
                  <span className="match-breakdown-points">+{restPoints}</span>
                </span>
              )}
            </span>
            <span className="match-tooltip-note">{evidenceNote(suggestion, rows)}</span>
            {/* The pool a signal is measured against is not credit in its own
                right — colors decide what is eligible and score nothing, so
                the wording must not imply that playing more of your list is
                itself what earned the score. */}
            <span className="match-tooltip-note">
              The score ranks commanders against each other for this list only. It is not a rating
              out of anything, and colors decide which cards count, never how good the match is.
            </span>
          </>
        )}
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
      <button
        type="button"
        className="commander-art-trigger"
        aria-label={`Show the full card for ${card.name}`}
      >
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
          <button
            type="button"
            className="commander-oracle-button"
            aria-label={`Show the full card for ${card.name}`}
          >
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

export function CommanderCard({ suggestion }: { suggestion: CardSuggestion }) {
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
    <article
      className={`commander-card${expanded ? ' is-expanded' : ''}${isPair ? ' is-pair' : ''}`}
    >
      {isPair ? (
        <div className="commander-image-row">
          {suggestion.cards.map((card) => (
            <CommanderArt key={card.oracleId} card={card} />
          ))}
        </div>
      ) : (
        // !isPair means cards.length <= 1, and a unit always has 1 or 2 cards.
        <CommanderArt card={suggestion.cards[0]!} />
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
            sortWubrg(suggestion.colorIdentity).map((color) => (
              <ManaSymbol key={color} color={color} />
            ))
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
          <CommanderFace
            key={card.oracleId}
            card={card}
            bracket={suggestion.bracket}
            inPair={isPair}
          />
        ))}

        <div className="badge-row">
          <LikeDislikeButtons oracleIds={suggestion.cards.map((c) => c.oracleId)} />
          {isCoveragePick(suggestion) && <CoverageBadge suggestion={suggestion} />}
          <ScoreBadge suggestion={suggestion} />
          {/* Bracket badge and its note are hidden while the estimate is
              being reworked — `bracket` is still on the DTO and still drives
              the Game Changer count below, so restoring this is a one-line
              change rather than a re-plumb. */}
          {suggestion.gameChangerCount > 0 && (
            <span className="badge badge-gc">
              {suggestion.gameChangerCount} Game Changer
              {suggestion.gameChangerCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <p className="commander-meta">
          Fits {suggestion.includedCardCount} card{suggestion.includedCardCount === 1 ? '' : 's'}{' '}
          from your list
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
                      {kindred.type}{' '}
                      <span className="explain-count">{cardCount(kindred.cards)} in your list</span>
                    </summary>
                    <p className="explain-group-desc">
                      This commander's own rules text calls out {kindred.type} — merely sharing a
                      creature type is not a reason to pick a commander, but caring about one is.
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
                      {theme.label}{' '}
                      <span className="explain-count">{cardCount(theme.cards)} in your list</span>
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
                      {kw.keyword}{' '}
                      <span className="explain-count">{cardCount(kw.cards)} in your list</span>
                    </summary>
                    <p className="explain-group-desc">
                      This commander has {kw.keyword}, and enough of your list does too for it to be
                      a real pattern, not a coincidence.
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
                    <span className="explain-count">
                      {cardCount(suggestion.gameChangerCards)} in your list
                    </span>
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
              Matches come from card text, keywords, and creature types, not a model of how the deck
              actually plays. Treat this as a starting point.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
