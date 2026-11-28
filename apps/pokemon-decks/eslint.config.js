// @ts-check
import globals from 'globals';
import react from '@mtg/config/eslint.react.js';

export default [
  ...react,
  // The committed snapshot is generated data, not source.
  { ignores: ['public/data/**'] },
  {
    // Build-time scripts run under plain Node, not the browser.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
