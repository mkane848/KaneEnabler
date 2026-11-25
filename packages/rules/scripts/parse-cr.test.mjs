import { describe, expect, it } from 'vitest';
import { parseCr, parentOf, parseEffectiveDate } from './parse-cr.mjs';

/** A miniature in the observed shapes of the real document: packed Contents,
 * blank-separated body, headings with commas/internal periods, rules ending
 * in ")" and ":", single- and double-letter subrules, an indented continuation
 * line, an example, and blank-block glossary entries with awkward terms. */
const FIXTURE = String.fromCharCode(0xfeff) + `Magic: The Gathering Comprehensive Rules

These rules are effective as of November 6, 2026.

Contents

1. Game Concepts
100. General
101. The Magic Golden Rules

Glossary
Credits

1. Game Concepts

100. General

100.1. These rules apply to any Magic game with two or more players.
     A continuation line joins the rule text with a space.

100.1a A two-player game is a game that begins with only two players.

100.1aa A double-letter subrule exists for insertion after the fact.

101. The Magic Golden Rules

101.1. An instruction that’s impossible to perform is ignored. (See rule 101.3.)
Example: Something happens, and the game continues.

101.2. There are four general categories of abilities:

101.2a A category follows.

6. Spells, Abilities, and Effects

808. Team vs. Team Variant

808.1. A variant rule ends with a colon:

Glossary

Active Player, Nonactive Player Order
The order in which players make choices.
See rule 101.4.

For Mirrodin!
A keyword ability. (See rule 702.150.)

Credits

© 2026 Wizards.
`;

describe('parseCr', () => {
  const parsed = parseCr(FIXTURE);

  it('reads the effective date into a version and an ISO date', () => {
    expect(parsed.version).toBe('20261106');
    expect(parsed.effectiveDate).toBe('2026-11-06');
  });

  it('separates headings from rules, including commas and internal periods in titles', () => {
    expect(parsed.sections).toEqual({
      1: 'Game Concepts',
      100: 'General',
      101: 'The Magic Golden Rules',
      6: 'Spells, Abilities, and Effects',
      808: 'Team vs. Team Variant',
    });
    expect(Object.keys(parsed.rules).sort()).toEqual([
      '100.1',
      '100.1a',
      '100.1aa',
      '101.1',
      '101.2',
      '101.2a',
      '808.1',
    ]);
  });

  it('joins indented continuation lines into the rule text', () => {
    expect(parsed.rules['100.1'].text).toBe(
      'These rules apply to any Magic game with two or more players. A continuation line joins the rule text with a space.',
    );
  });

  it('attaches examples to the preceding rule without the "Example:" prefix', () => {
    expect(parsed.rules['101.1'].examples).toEqual(['Something happens, and the game continues.']);
    expect(parsed.rules['100.1'].examples).toEqual([]);
  });

  it('computes parents by stripping one letter, then one dot component', () => {
    expect(parsed.rules['100.1aa'].parent).toBe('100.1a');
    expect(parsed.rules['100.1a'].parent).toBe('100.1');
    expect(parsed.rules['100.1'].parent).toBe('100');
    expect(parsed.rules['808.1'].parent).toBe('808');
  });

  it('reads glossary blocks structurally, term line then definition lines', () => {
    expect(parsed.glossary).toEqual({
      'Active Player, Nonactive Player Order':
        'The order in which players make choices.\nSee rule 101.4.',
      'For Mirrodin!': 'A keyword ability. (See rule 702.150.)',
    });
  });

  it('rejects a document without an effective date', () => {
    expect(() => parseCr('1. Game Concepts\n\n100. General\n')).toThrow(/effective-date/);
  });

  it('rejects a duplicate rule number', () => {
    const bad = FIXTURE.replace(
      '101.2a A category follows.',
      '101.2a A category follows.\n\n100.1. A duplicate.',
    );
    expect(() => parseCr(bad)).toThrow(/Duplicate rule/);
  });

  it('rejects an example with no preceding rule', () => {
    const bad = FIXTURE.replace(
      '100.1. These rules apply',
      'Example: orphaned.\n100.1. These rules apply',
    );
    expect(() => parseCr(bad)).toThrow(/Example without a preceding rule/);
  });
});

describe('parentOf', () => {
  it('strips a comma fragment before anything else', () => {
    expect(parentOf('113.6a,1')).toBe('113.6a');
  });
});

describe('parseEffectiveDate', () => {
  it('pads month and day', () => {
    expect(parseEffectiveDate('These rules are effective as of January 1, 2027.')).toEqual({
      effectiveDate: '2027-01-01',
      version: '20270101',
    });
  });

  it('rejects an unknown month', () => {
    expect(() => parseEffectiveDate('effective as of Smarch 1, 2027')).toThrow(/Unknown month/);
  });
});
