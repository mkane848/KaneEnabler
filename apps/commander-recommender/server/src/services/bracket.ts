export interface BracketEstimate {
  label: string;
  range: string;
  note: string;
}

/**
 * Estimates a Bracket range from the number of Game Changer cards involved
 * (the suggested commander plus any of the user's matched cards that are
 * on the official Game Changers list).
 *
 * This is a deliberately simple heuristic, not a full bracket calculator.
 * The real Bracket system also weighs combo speed, mass land destruction,
 * and extra-turn density — none of which can be reliably detected from
 * card text alone — so treat this as a starting estimate, not a verdict.
 */
export function estimateBracket(gameChangerCount: number): BracketEstimate {
  if (gameChangerCount === 0) {
    return {
      label: 'Exhibition / Core',
      range: 'Bracket 1–2',
      note: 'No Game Changers detected among the matched cards.',
    };
  }

  if (gameChangerCount <= 3) {
    return {
      label: 'Upgraded',
      range: 'Bracket 3',
      note: `${gameChangerCount} Game Changer${gameChangerCount === 1 ? '' : 's'} detected — Bracket 3 allows up to 3.`,
    };
  }

  return {
    label: 'Optimized / cEDH',
    range: 'Bracket 4–5',
    note: `${gameChangerCount} Game Changers detected — Brackets 4 and 5 allow any number.`,
  };
}
