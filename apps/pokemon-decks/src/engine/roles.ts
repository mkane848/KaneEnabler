/**
 * What a card does for a deck, read from its printed text.
 *
 * Every pattern here was written against real card text in the snapshot (the
 * card it was written for is named beside it and pinned in roles.test.ts),
 * never from memory of how a card reads — the same lesson as the Magic
 * recommender's AGENTS.md hard rule 4.
 */
import type { PtcgCard } from '@ptcg/rules';

export type Role =
  /** Refills the hand. */
  | 'draw'
  /** Finds Pokémon from the deck. */
  | 'pokemonSearch'
  /** Finds basic Energy from the deck. */
  | 'energySearch'
  /** Finds a Trainer from the deck. */
  | 'trainerSearch'
  /** Drags an opponent's Benched Pokémon into the Active Spot. */
  | 'gust'
  /** Swaps your own Active Pokémon out. */
  | 'switch'
  /** Gets cards back from the discard pile. */
  | 'recovery'
  /** Puts Energy into play beyond the one-per-turn attachment. */
  | 'energyAccel'
  /** Evolves a Basic straight to its Stage 2. */
  | 'skipStage';

export const ROLE_LABELS: Record<Role, string> = {
  draw: 'Draw',
  pokemonSearch: 'Pokémon search',
  energySearch: 'Energy search',
  trainerSearch: 'Trainer search',
  gust: 'Gust',
  switch: 'Switching',
  recovery: 'Recovery',
  energyAccel: 'Energy acceleration',
  skipStage: 'Stage 2 shortcut',
};

const PATTERNS: Record<Role, RegExp> = {
  // Professor's Research "draw 7 cards"; Lillie's Determination "draw 6
  // cards"; Iono "draws a card for each of their remaining Prize cards".
  draw: /\bdraws? (?:\d+|a|an) cards?\b|\bdraws? a card for each\b|\bdraw cards until\b/i,
  // Ultra Ball "for a Pokémon"; Nest Ball "for a Basic Pokémon"; Buddy-Buddy
  // Poffin "for up to 2 Basic Pokémon"; Precious Trolley "for any number of
  // Basic Pokémon".
  pokemonSearch:
    /search your deck for (?:up to \d+ |any number of |an? |\d+ )?(?:Basic |Evolution |Stage \d )?Pokémon\b/i,
  // Earthen Vessel "for up to 2 Basic Energy cards"; Energy Search "for a
  // Basic Energy card". Only the generic kind: a card that fetches one type
  // ("Basic {F} Energy", Fighting Gong) helps only a deck of that type.
  energySearch: /search your deck for (?:up to \d+ |an? |\d+ )?Basic Energy/i,
  // Arven "Search your deck for an Item card and a Pokémon Tool card".
  trainerSearch:
    /search your deck for (?:up to \d+ |an? |\d+ )?(?:Item|Supporter|Stadium|Pokémon Tool|Trainer) cards?/i,
  // Boss's Orders, Counter Catcher, Prime Catcher.
  gust: /switch in 1 of your opponent's Benched Pokémon to the Active Spot/i,
  // Switch; Prime Catcher's second half.
  switch: /switch your Active Pokémon with 1 of your Benched Pokémon/i,
  // Super Rod "from your discard pile into your deck"; Night Stretcher and
  // Energy Retrieval "from your discard pile into your hand".
  recovery: /from your discard pile into your (?:hand|deck)/i,
  // Yanmega ex's Buzzing Boost "…up to 3 Basic {G} Energy cards and attach
  // them to this Pokémon".
  energyAccel:
    /\battach (?:it|them|up to \d+ [^.]{0,30}Energy|an? [^.]{0,30}Energy|\d+ [^.]{0,30}Energy)/i,
  // Rare Candy "…to evolve it, skipping the Stage 1".
  skipStage: /skipping the Stage 1/i,
};

/** Every bit of rules text a card prints: Trainer/Energy effect, abilities, attack effects. */
export function cardText(card: PtcgCard): string {
  return [
    card.effect ?? '',
    ...(card.abilities ?? []).map((a) => a.effect),
    ...(card.attacks ?? []).map((a) => a.effect ?? ''),
  ].join('\n');
}

export function rolesOf(card: PtcgCard): Role[] {
  const text = cardText(card);
  if (!text.trim()) return [];
  return (Object.keys(PATTERNS) as Role[]).filter((role) => PATTERNS[role].test(text));
}

/**
 * How many slots of each role a 60-card deck aims for, before format
 * constraints. These are the engine's own heuristic defaults, not a rule —
 * the UI says so — sized so a deck lands near the usual shape of roughly a
 * dozen Pokémon, two dozen Trainers and the rest Energy.
 */
export const ROLE_TARGETS: Partial<Record<Role, number>> = {
  draw: 8,
  pokemonSearch: 7,
  gust: 2,
  switch: 2,
  recovery: 2,
};
