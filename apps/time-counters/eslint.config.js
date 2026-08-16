// @ts-check
import globals from 'globals';
import react from '@mtg/config/eslint.react.js';

export default [
  ...react,
  {
    // Build-time scripts run under plain Node, not the browser — separate
    // from the app itself, which the base react config already covers.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
