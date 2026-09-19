import { Router } from 'express';
import { isSeeded, findCardsByNames, getBackgroundCards } from '../db';
import { parseCardList } from '../services/parseList';
import { validateDeck } from '../services/deckValidation';
import type { CardRow } from '../types';

const router = Router();

/**
 * Validates a pasted Commander decklist against the format's rules: exactly
 * 100 cards (903.5a), every card within the commander unit's color identity
 * (903.4), Partners/companions that actually pair (702.124), and no
 * banned/unparseable cards silently dropped. Reuses @mtg/rules' CR-cited
 * primitives rather than re-deriving any rule here — see services/
 * deckValidation.ts.
 */
router.post('/deck-validity', (req, res) => {
  if (!isSeeded) {
    return res.status(503).json({
      error:
        'The card database is empty. Download the Scryfall Oracle Cards bulk file and run "npm run import-scryfall" in /server first — see the README.',
    });
  }

  // See the note in recommend.ts: Express 5 leaves req.body undefined when
  // there is no parseable body, so guard before destructuring.
  const { list, commanderNames } = (req.body ?? {}) as {
    list?: unknown;
    commanderNames?: unknown;
  };
  if (typeof list !== 'string' || !list.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "list" string.' });
  }
  if (
    !Array.isArray(commanderNames) ||
    commanderNames.length === 0 ||
    commanderNames.length > 2 ||
    !commanderNames.every((n) => typeof n === 'string' && n.trim())
  ) {
    return res
      .status(400)
      .json({ error: 'Request body must include a "commanderNames" array of 1-2 names.' });
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

  res.json(validateDeck(parsed, nameMap, commanders, getBackgroundCards()));
});

export default router;