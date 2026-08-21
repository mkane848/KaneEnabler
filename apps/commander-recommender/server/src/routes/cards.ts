import { Router } from 'express';
import { isSeeded, findCardsByOracleIds } from '../db';
import { toCardDTO } from '../services/cardDTO';

const router = Router();

// No real user has anywhere near this many liked/disliked cards or jank
// tags — this is a request-size bound, not a product limit, the same
// purpose Spellbook's own MAX_CARDS serves in services/spellbook.ts.
const MAX_IDS = 500;

/**
 * Resolves oracle_ids back to card data — what `@mtg/profile`'s
 * `card_preferences` (Phase 7) needs to render a liked/disliked card's
 * name/image, since that table stores only the oracle_id. Read-only SQLite
 * lookup, not a Scryfall call, so it isn't gated by docs/api-policy.md.
 */
router.get('/cards', (req, res) => {
  if (!isSeeded) {
    return res
      .status(503)
      .json({ error: 'The card database is empty — run "npm run prepare-data" first.' });
  }

  const { ids } = req.query;
  if (typeof ids !== 'string' || !ids.trim()) {
    return res.status(400).json({ error: 'Query must include a non-empty "ids" parameter.' });
  }

  const oracleIds = [
    ...new Set(
      ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (oracleIds.length > MAX_IDS) {
    return res.status(400).json({ error: `"ids" cannot list more than ${MAX_IDS} cards.` });
  }
  const rows = findCardsByOracleIds(oracleIds);
  res.json({
    cards: rows.map((row) => ({
      ...toCardDTO(row),
      isCommanderEligible: !!row.is_commander_eligible,
    })),
  });
});

export default router;
