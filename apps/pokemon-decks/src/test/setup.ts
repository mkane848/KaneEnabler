import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

afterEach(() => {
  // Engine and script tests run in Node, which has no localStorage.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
