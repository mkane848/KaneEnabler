// @ts-check

/** @type {import('vitest/config').UserConfig['test']} */
export const baseTestConfig = {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
  },
};
