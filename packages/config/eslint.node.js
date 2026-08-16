// @ts-check
import globals from 'globals';
import base from './eslint.base.js';

export default [
  ...base,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
