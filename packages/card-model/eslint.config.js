// @ts-check
import globals from 'globals';
import base from '@mtg/config/eslint.base.js';

export default [
  ...base,
  {
    // Every file here runs under plain Node (tsx or bare node), never a
    // browser/bundler context — see src/index.js's doc comment.
    files: ['**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
