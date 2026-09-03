// @ts-check
import globals from 'globals';
import base from '@mtg/config/eslint.base.js';

export default [
  ...base,
  {
    languageOptions: {
      // Calls fetch/setTimeout/Date — global in both browsers and Node 22+.
      globals: { ...globals.browser, fetch: 'readonly' },
    },
  },
];
