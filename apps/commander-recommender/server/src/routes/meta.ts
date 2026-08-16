import { Router } from 'express';
import path from 'node:path';
import { readImportedSnapshot } from '../services/importedSnapshot';

const router = Router();

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cards.sqlite');

/**
 * How current the card data is.
 *
 * Deliberately not folded into /api/health: that endpoint is a liveness
 * probe and should stay trivial. This one reads the database, and its answer
 * is a product detail rather than an operational one.
 *
 * Read per request rather than cached at boot. It's a single indexed lookup
 * against a handful of rows, and caching it would make a re-import invisible
 * until the process restarted — which, on a long-lived local dev server, is
 * exactly when you'd want to see it change.
 */
router.get('/meta', (_req, res) => {
  const snapshot = readImportedSnapshot(DB_PATH);
  res.json({
    // Null when the database predates snapshot tracking, or was built from a
    // hand-placed file with no metadata alongside it. The client shows
    // nothing rather than guessing.
    cardDataUpdatedAt: snapshot?.updatedAt ?? null,
    importedAt: snapshot?.importedAt || null,
  });
});

export default router;
