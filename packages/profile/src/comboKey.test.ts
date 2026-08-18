import { describe, expect, it } from 'vitest';
import { comboKey } from './comboKey';

describe('comboKey', () => {
  it('is order-independent', () => {
    expect(comboKey(['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'])).toBe(
      comboKey(['Zealous Conscripts', 'Kiki-Jiki, Mirror Breaker']),
    );
  });

  it('is case-independent', () => {
    expect(comboKey(['Splinter Twin'])).toBe(comboKey(['SPLINTER TWIN']));
  });

  it('ignores surrounding whitespace', () => {
    expect(comboKey(['Deceiver Exarch'])).toBe(comboKey(['  Deceiver Exarch  ']));
  });

  it('is deterministic', () => {
    const names = ["Thassa's Oracle", 'Demonic Consultation'];
    expect(comboKey(names)).toBe(comboKey(names));
  });

  it('differs for different combos', () => {
    expect(comboKey(['Kiki-Jiki, Mirror Breaker', 'Zealous Conscripts'])).not.toBe(
      comboKey(['Splinter Twin', 'Deceiver Exarch']),
    );
  });

  it('differs for a subset vs. the full combo', () => {
    expect(comboKey(['A', 'B'])).not.toBe(comboKey(['A', 'B', 'C']));
  });
});
