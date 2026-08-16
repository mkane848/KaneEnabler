// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared base: JS + TS recommended rules, no type-checked linting (too slow
 * and too strict to introduce across ~20k lines of previously unlinted code
 * in one pass — see docs/handoff.md Phase 1). Consuming configs add
 * environment-specific globals/plugins (eslint.react.js, eslint.node.js).
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.turbo/**',
      'node_modules/**',
      // tsc -b (project references) emits these next to vite.config.ts /
      // vitest.config.ts as a build byproduct — never hand-written, never
      // imported. Both apps' .gitignore already exclude them.
      '**/vite.config.js',
      '**/vite.config.d.ts',
      '**/vitest.config.js',
      '**/vitest.config.d.ts',
    ],
  },
  {
    rules: {
      // Both codebases lean on `_`-prefixed params for intentionally-unused
      // ones (matches the noUnusedParameters convention already in tsconfig).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `/// <reference types="vitest/config" />` is Vitest's own documented
      // way to bring the merged `test` config property into scope — there's
      // no equivalent `import` form. Only relax `types`; `path`/`lib`
      // triple-slash refs stay disallowed.
      '@typescript-eslint/triple-slash-reference': [
        'error',
        { path: 'never', types: 'always', lib: 'never' },
      ],
    },
  },
);
