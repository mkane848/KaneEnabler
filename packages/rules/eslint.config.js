// @ts-check
import base from '@mtg/config/eslint.base.js';
import node from '@mtg/config/eslint.node.js';

// The CR ingestion scripts are bare Node (like commander-recommender/server's
// scripts); src/ stays environment-agnostic, so the node globals are scoped to
// scripts/ rather than applied package-wide.
const nodeGlobals = node.at(-1);

export default [...base, { ...nodeGlobals, files: ['scripts/**/*.mjs'] }];