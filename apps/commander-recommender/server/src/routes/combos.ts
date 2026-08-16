import { Router } from 'express';
import { isSeeded, findCardsByNames } from '../db';
import { parseCardList } from '../services/parseList';
import { findCombos, SpellbookError } from '../services/spellbook';
import type { CardRow } from '../types';

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

/**
 * Looks up Commander Spellbook combos for one commander unit (one card, or
 * two under a Partner-family ability) plus the cards from the user's list
 * that could legally go in that deck.
 *
 * Only ever reached by an explicit click on a suggestion — see the note at
 * the top of services/spellbook.ts for why that matters.
 */
router.post('/combos', async (req, res) => {
  if (!isSeeded) {
    return res.status(503).json({ error: 'The card database is empty — run "npm run prepare-data" first.' });
  }

  // See the note in recommend.ts: Express 5 leaves req.body undefined when
  // there is no parseable body, so guard before destructuring.
  const { list, commanderNames } = (req.body ?? {}) as { list?: unknown; commanderNames?: unknown };
  if (typeof list !== 'string' || !list.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "list" string.' });
  }
  if (
    !Array.isArray(commanderNames) ||
    commanderNames.length === 0 ||
    commanderNames.length > 2 ||
    !commanderNames.every((n) => typeof n === 'string' && n.trim())
  ) {
    return res.status(400).json({ error: 'Request body must include a "commanderNames" array of 1-2 names.' });
  }
  const names = commanderNames as string[];

  const parsed = parseCardList(list);
  const nameMap = findCardsByNames([...parsed.map((p) => p.name), ...names]);

  const commanders: CardRow[] = [];
  for (const name of names) {
    const row = nameMap.get(name.toLowerCase());
    if (!row) {
      return res.status(404).json({ error: `"${name}" isn't in the card database.` });
    }
    commanders.push(row);
  }

  // Only cards that fit the commander unit's color identity (union across
  // both cards, per 702.124e) — the rest could not go in the deck, so a
  // combo involving them would be misleading.
  const identity = new Set(commanders.flatMap((c) => parseJsonArray(c.color_identity)));
  const commanderOracleIds = new Set(commanders.map((c) => c.oracle_id));
  const deckCards: string[] = [];
  for (const entry of parsed) {
    const row = nameMap.get(entry.name.toLowerCase());
    if (!row || commanderOracleIds.has(row.oracle_id)) continue;
    if (parseJsonArray(row.color_identity).every((c) => identity.has(c))) {
      deckCards.push(row.name);
    }
  }

  try {
    const lookup = await findCombos(
      commanders.map((c) => c.name),
      deckCards
    );
    res.json({ ...lookup, searchedCardCount: deckCards.length });
  } catch (err) {
    if (err instanceof SpellbookError) {
      return res.status(err.status === 429 ? 429 : 502).json({
        error: err.message,
        retryAfterSeconds: err.retryAfterSeconds,
      });
    }
    res.status(502).json({ error: 'Could not read the response from Commander Spellbook.' });
  }
});

export default router;
