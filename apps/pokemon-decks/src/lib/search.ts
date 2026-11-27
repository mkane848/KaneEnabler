import { FORMATS, type Format } from '@ptcg/rules';

/** URL state, so a format choice survives a reload and can be shared. */
export interface DeckSearch {
  format: Format;
}

export const DEFAULT_SEARCH: DeckSearch = { format: 'standard' };

export function validateDeckSearch(search: Record<string, unknown>): DeckSearch {
  const format = FORMATS.includes(search.format as Format)
    ? (search.format as Format)
    : DEFAULT_SEARCH.format;
  return { format };
}
