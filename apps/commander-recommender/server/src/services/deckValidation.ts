import {
  COMMANDER_DECK_SIZE,
  buildCommanderUnits,
  combinedColorIdentity,
  findColorIdentityViolations,
  isValidDeckSize,
  singletonLimit,
  unitKey,
} from '@mtg/rules';
import type { ParsedListEntry } from './parseList';
import { partitionSubmittedCards } from './legality';
import { parseJsonArray, type CardRow } from '../types';

export interface CommanderVerdict {
  names: string[];
  colorIdentity: string[];
  /** Every named commander is a legal commander itself (baked is_commander_eligible). */
  eligible: boolean;
  /** The named set is an allowed commander unit under the Partner-family (702.124). */
  pairingLegal: boolean;
  /** Named commanders the pasted list does not contain (903.5a — the 100
   * cards include the commander, so a list without it is a 101-card deck). */
  missingFromList: string[];
}

export interface ColorViolation {
  name: string;
  color_identity: string[];
  quantity: number;
}

export interface SingletonViolation {
  name: string;
  quantity: number;
  /** What the format allows for this card — 1, N for "up to N", never
   * Infinity here since an exempt card can't violate. */
  limit: number;
}

export interface DeckValidationResult {
  isValid: boolean;
  commander: CommanderVerdict;
  deckSize: {
    /** Every card the user pasted, resolved or not — a banned or unparseable
     * card still occupies a deck slot, so counting only the legal ones makes
     * a 100-card deck with one banned card read as 99. */
    total: number;
    expected: number;
    isValid: boolean;
  };
  colorIdentity: {
    combined: string[];
    violations: ColorViolation[];
  };
  singleton: {
    violations: SingletonViolation[];
  };
  legality: {
    banned: string[];
    notFound: string[];
  };
}

/**
 * Pure validation of a parsed decklist against Commander rules (CR 903.4,
 * 903.5a/903.5b), plus Partner-family commander-unit legality (702.124).
 * Deliberately free of database access: the route resolves names into a Map
 * and passes it in, so every rules decision here is exercised by seedless
 * unit tests.
 */
export function validateDeck(
  parsed: ParsedListEntry[],
  nameMap: Map<string, CardRow>,
  commanders: CardRow[],
  backgrounds: CardRow[],
): DeckValidationResult {
  const { submitted, notFound, banned } = partitionSubmittedCards(parsed, nameMap);

  // Commander unit validity: every named card must itself be a legal commander
  // (903.3 — a "Sol Ring" named as commander passes every identity check while
  // being impossible), and 1-2 named cards must form a real commander unit
  // under the Partner-family abilities (702.124). buildCommanderUnits returns
  // every legal unit over the submitted commanders; the named set is legal
  // exactly when its unit key appears among them.
  const eligible = commanders.every((c) => c.is_commander_eligible === 1);
  const namedUnit = unitKey({ cards: commanders });
  const legalUnits = buildCommanderUnits(commanders, backgrounds);
  const pairingLegal = eligible && legalUnits.some((u) => unitKey(u) === namedUnit);

  const commanderColorIdentity = Array.from(
    combinedColorIdentity(commanders.map((c) => parseJsonArray(c.color_identity))),
  );

  // 903.5a: the 100 cards include the commander. Match on oracle_id, not the
  // name string, so a DFC listed by its front face still counts as present
  // (the route's nameMap carries the face-name keys). Banned cards count as
  // listed too — they're already reported separately, and "missing" on top
  // would be a second, misleading complaint about the same card.
  const listedOracleIds = new Set<string>();
  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (row) listedOracleIds.add(row.oracle_id);
  }
  const missingFromList = commanders
    .filter((c) => !listedOracleIds.has(c.oracle_id))
    .map((c) => c.name);

  // 903.5a: exactly 100 cards. The pasted total is the deck as it stands —
  // cards reported as banned or unresolvable were still written down and still
  // fill slots, and telling a player "add a card" when the real fix is "swap
  // the banned one" is the misdirection this endpoint exists to prevent.
  const total = parsed.reduce((sum, p) => sum + p.quantity, 0);
  const deckSizeValid = isValidDeckSize(total);

  const resolved = submitted.map((card) => ({
    ...card,
    color_identity: parseJsonArray(card.row.color_identity),
  }));
  const violations = findColorIdentityViolations(resolved, new Set(commanderColorIdentity)).map(
    (card): ColorViolation => ({
      name: card.row.name,
      color_identity: card.color_identity,
      quantity: card.quantity,
    }),
  );

  // 903.5b: singleton. Sum quantities per oracle_id first — parseCardList
  // keeps repeated lines as separate entries, and two "1 Sol Ring" rows are
  // two copies of one card. singletonLimit reads the exemption off the card
  // itself (basic lands, "any number", "up to N"), so no name list to stale.
  const quantityByOracleId = new Map<string, { row: CardRow; quantity: number }>();
  for (const card of submitted) {
    const existing = quantityByOracleId.get(card.row.oracle_id);
    if (existing) existing.quantity += card.quantity;
    else quantityByOracleId.set(card.row.oracle_id, { row: card.row, quantity: card.quantity });
  }
  const singletonViolations: SingletonViolation[] = [];
  for (const { row, quantity } of quantityByOracleId.values()) {
    const limit = singletonLimit(row);
    if (quantity > limit) singletonViolations.push({ name: row.name, quantity, limit });
  }

  const isValid =
    deckSizeValid &&
    violations.length === 0 &&
    singletonViolations.length === 0 &&
    missingFromList.length === 0 &&
    banned.length === 0 &&
    notFound.length === 0 &&
    pairingLegal;

  return {
    isValid,
    commander: {
      names: commanders.map((c) => c.name),
      colorIdentity: commanderColorIdentity,
      eligible,
      pairingLegal,
      missingFromList,
    },
    deckSize: {
      total,
      expected: COMMANDER_DECK_SIZE,
      isValid: deckSizeValid,
    },
    colorIdentity: {
      combined: commanderColorIdentity,
      violations,
    },
    singleton: {
      violations: singletonViolations,
    },
    legality: { banned, notFound },
  };
}
