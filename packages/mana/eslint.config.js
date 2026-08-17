// @ts-check
import globals from 'globals';
import base from '@mtg/config/eslint.base.js';

export default [
  ...base,
  {
    // The glyph generator runs under plain Node, not the browser/bundler
    // context the rest of this package is authored for.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
