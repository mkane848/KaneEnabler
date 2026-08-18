import { describe, expect, it } from 'vitest';
import { buildUserAgent } from './userAgent.js';

describe('buildUserAgent', () => {
  it('formats product/version with the contact text in parens', () => {
    expect(
      buildUserAgent({
        product: 'CommanderIHardlyKnowEr',
        version: '1.7.1',
        contact: 'hobby project; https://github.com/mkane848/HardlyKnowHer',
      }),
    ).toBe(
      'CommanderIHardlyKnowEr/1.7.1 (hobby project; https://github.com/mkane848/HardlyKnowHer)',
    );
  });

  it('formats a second caller identically, given its own values', () => {
    expect(
      buildUserAgent({
        product: 'mtg-time-tracker',
        version: '1.3.2',
        contact: 'personal Commander companion app',
      }),
    ).toBe('mtg-time-tracker/1.3.2 (personal Commander companion app)');
  });
});
