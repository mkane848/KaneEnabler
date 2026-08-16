import type {
  RecommendResponse,
  SupportingCardDTO,
  WireRecommendResponse,
} from '../types';

/**
 * Swaps the wire response's card positions back for card objects.
 *
 * A cited card is one of the cards you uploaded, so the same handful repeats
 * under every commander — one measured list carried 26,618 citations of 28
 * distinct cards, 84% of a 12.2 MB response. The server sends them once and
 * cites positions; this puts them back, once, at the API boundary.
 *
 * Everything below this layer keeps working with whole cards, which is why
 * the components have no idea any of this happens.
 */
export function rehydrateRecommendations(wire: WireRecommendResponse): RecommendResponse {
  const { cardIndex, suggestions, ...rest } = wire;

  // Positions come from the same response that carries the index, so an
  // out-of-range one would mean the server contradicted itself. Dropping the
  // citation rather than rendering `undefined` keeps that a missing row
  // instead of a crash halfway down the page.
  const resolve = (positions: number[]): SupportingCardDTO[] =>
    positions.map((position) => cardIndex[position]).filter((card): card is SupportingCardDTO => !!card);

  return {
    ...rest,
    suggestions: suggestions.map((suggestion) => ({
      ...suggestion,
      themeSupport: suggestion.themeSupport.map((theme) => ({
        ...theme,
        cards: resolve(theme.cards),
      })),
      kindredSupport: suggestion.kindredSupport.map((kindred) => ({
        ...kindred,
        cards: resolve(kindred.cards),
      })),
      keywordSupport: suggestion.keywordSupport.map((keyword) => ({
        ...keyword,
        cards: resolve(keyword.cards),
      })),
      gameChangerCards: resolve(suggestion.gameChangerCards),
    })),
  };
}
