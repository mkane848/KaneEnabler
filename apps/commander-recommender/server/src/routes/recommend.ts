import { Router } from 'express';
import {
  isSeeded,
  findCardsByNames,
  findCardsBySignals,
  findSignalsByOracleIds,
  getCommanderCandidates,
  getBackgroundCards,
} from '../db';
import { parseCardList } from '../services/parseList';
import {
  buildCollectionProfile,
  scoreCommanders,
  selectSuggestions,
  type OwnedCard,
  type SupportingCard,
} from '../services/synergy';
import { buildCommanderUnits, unitKey } from '../services/partners';
import { estimateBracket } from '../services/bracket';
import { applySingletonLimits } from '../services/singleton';
import { createCardIndex } from '../services/cardIndex';
import { analyzeDeck } from '../services/deckAnalysis';
import { attachSuggestions, collectionColors, requiredSignalKeys } from '../services/packages';

const router = Router();

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

router.post('/recommend', (req, res) => {
  if (!isSeeded) {
    return res.status(503).json({
      error:
        'The card database is empty. Download the Scryfall Oracle Cards bulk file and run "npm run import-scryfall" in /server first — see the README.',
    });
  }

  // req.body is undefined — not {} — when no body was parsed at all, e.g. a
  // POST with no Content-Type. Express 4 always left an object here; 5 does
  // not, and destructuring it directly throws a 500 instead of answering 400.
  const { list } = (req.body ?? {}) as { list?: unknown };
  if (typeof list !== 'string' || !list.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "list" string.' });
  }

  const parsed = parseCardList(list);
  const nameMap = findCardsByNames(parsed.map((p) => p.name));

  const submitted: OwnedCard[] = [];
  const notFound: string[] = [];

  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (row) {
      submitted.push({ row, quantity: entry.quantity });
    } else {
      notFound.push(entry.name);
    }
  }

  // Recommend against a legal Commander deck, not the raw paste. A list
  // exported from a collection can hold several copies of a card, and
  // counting them all would let one card stand in for a whole strategy.
  const { owned, ignoredCopies } = applySingletonLimits(submitted);

  const profile = buildCollectionProfile(owned);
  const candidates = getCommanderCandidates();
  const backgrounds = getBackgroundCards();
  const units = buildCommanderUnits(candidates, backgrounds);
  // Two bars, not one. scoreCommanders drops anything with no identity fit
  // or no real signal; selectSuggestions then drops the long tail whose
  // whole case is a single bare-minimum signal, which is what made result
  // counts run into four figures. Still no cap beyond that — the client
  // owns pagination over whatever survives, since it needs the full set for
  // the filter bar's counts and options anyway.
  const scored = scoreCommanders(units, profile, owned);

  // What the *list* is doing, independent of any commander. Reads the same
  // precomputed relationships the scorer does rather than deriving its own,
  // then queries them in reverse to fill whichever part of a game plan the
  // list cannot execute.
  const analysis = analyzeDeck(
    owned,
    findSignalsByOracleIds(owned.map((entry) => entry.row.oracle_id))
  );
  const deck = attachSuggestions(analysis, {
    candidatesByKey: findCardsBySignals(requiredSignalKeys(analysis)),
    ownedOracleIds: new Set(owned.map((entry) => entry.row.oracle_id)),
    allowedColors: collectionColors(owned.map((entry) => entry.row)),
  });
  const { suggestions: selected, weakMatchesOnly } = selectSuggestions(scored);

  // Cited cards go out once, referenced by position — see cardIndex.ts. This
  // is filled as the suggestions below are serialized, so it must be read
  // after that map, not during it.
  const cardIndex = createCardIndex();
  const cite = (cards: SupportingCard[]) => cards.map((card) => cardIndex.indexOf(card));

  const suggestions = selected.map((s) => {
    // Every card in the unit counts toward the Bracket, alongside any Game
    // Changers in the list that fit its color identity — a Partner pair is
    // jointly "the commander" (702.124e), so both halves' own status matters.
    const gameChangerCount = s.cards.filter((c) => c.game_changer).length + s.gameChangerCards.length;
    const colorIdentity = [...new Set(s.cards.flatMap((c) => parseJsonArray(c.color_identity)))];

    return {
      unitId: unitKey(s),
      cards: s.cards.map((c) => ({
        oracleId: c.oracle_id,
        name: c.name,
        imageUri: c.image_uri,
        backImageUri: c.back_image_uri ?? null,
        backName: c.back_name ?? null,
        colorIdentity: parseJsonArray(c.color_identity),
        typeLine: c.type_line,
        oracleText: c.oracle_text,
        manaCost: c.mana_cost,
        manaValue: c.cmc,
        power: c.power,
        toughness: c.toughness,
        scryfallUri: c.scryfall_uri,
        isGameChanger: !!c.game_changer,
      })),
      colorIdentity,
      // One decimal, not whole numbers: density-based scores are small, so
      // rounding to an integer would collapse genuinely different matches
      // onto the same value and flatten the match badge's percentages.
      score: Math.round(s.score * 10) / 10,
      matchedThemes: s.matchedThemes,
      matchedCreatureTypes: s.matchedCreatureTypes,
      matchedKeywords: s.matchedKeywords,
      includedCardCount: s.includedCardCount,
      themeSupport: s.themeSupport.map((t) => ({ ...t, cards: cite(t.cards) })),
      kindredSupport: s.kindredSupport.map((k) => ({ ...k, cards: cite(k.cards) })),
      keywordSupport: s.keywordSupport.map((k) => ({ ...k, cards: cite(k.cards) })),
      gameChangerCards: cite(s.gameChangerCards),
      gameChangerCount,
      bracket: estimateBracket(gameChangerCount),
    };
  });

  res.json({
    // What was submitted, versus what was actually scored. These differ by
    // the cards we could not find *and* the copies the format does not
    // allow, so `ignoredCopies` is reported alongside rather than folded in
    // — otherwise a legal-but-trimmed list would look like a failed lookup.
    totalParsed: parsed.reduce((sum, p) => sum + p.quantity, 0),
    totalMatched: owned.reduce((sum, c) => sum + c.quantity, 0),
    ignoredCopies,
    notFound,
    // True when no commander showed a real pattern and these are just the
    // closest few. The client says so rather than presenting them as
    // confident recommendations.
    weakMatchesOnly,
    // Every card cited by a suggestion, once. `themeSupport` and friends
    // hold positions into this rather than repeating whole card objects.
    cardIndex: cardIndex.cards,
    // The list's own strongest archetypes, and whether each one actually
    // functions — answerable without picking a commander at all.
    deck,
    suggestions,
  });
});

export default router;
