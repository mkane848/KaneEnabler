import { Router } from 'express';
import { isSeeded, findCardsByOracleIds } from '../db';
import { toCardDTO } from '../services/cardDTO';

const router = Router();

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
  const rows = findCardsByOracleIds(oracleIds);
  res.json({
    cards: rows.map((row) => ({
      ...toCardDTO(row),
      isCommanderEligible: !!row.is_commander_eligible,
    })),
  });
});

export default router;
