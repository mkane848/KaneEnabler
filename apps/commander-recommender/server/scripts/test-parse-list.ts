/**
 * Tests for the deck-list parser, covering the export formats from the sites
 * people actually paste from. Run with: npm test
 *
 * Deliberately dependency-free (node:assert + tsx, both already here) — the
 * parser is the one piece of this project that silently degrades when it
 * breaks, since an unparsed line just shows up as "not found" rather than
 * as an error.
 */
import assert from 'node:assert';
import { parseCardList } from '../src/services/parseList';

interface Case {
  label: string;
  input: string;
  expected: { name: string; quantity: number }[];
}

const cases: Case[] = [
  {
    label: 'bare names and simple quantities',
    input: ['Sol Ring', '1 Sol Ring', '1x Sol Ring', '1 x Sol Ring', '10 Forest', '4X Lightning Bolt'].join('\n'),
    expected: [
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Forest', quantity: 10 },
      { name: 'Lightning Bolt', quantity: 4 },
    ],
  },
  {
    label: 'Moxfield / Arena / MTGO: set code, collector number, markers',
    input: [
      '1 Sol Ring (C21) 263',
      '1 Sol Ring (C21) 263 *F*',
      "1 Atraxa, Praetors' Voice (2XM) 190 *CMDR*",
      '1 Arcane Signet (ELD) 331a',
      '1 Lightning Bolt (SLD) 84★',
    ].join('\n'),
    expected: [
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Sol Ring', quantity: 1 },
      { name: "Atraxa, Praetors' Voice", quantity: 1 },
      { name: 'Arcane Signet', quantity: 1 },
      { name: 'Lightning Bolt', quantity: 1 },
    ],
  },
  {
    label: 'Archidekt: lowercase set codes, categories, labels, combined',
    input: [
      '1x Sol Ring (c21) 263 [Ramp]',
      "1x Atraxa, Praetors' Voice (2xm) 190 [Commander{top}]",
      '1x Command Tower (cmr) 350 *F* [Lands] ^Have,#7289DA^',
      '1x Cultivate (m21) 177 ^Buy,#ff0000^',
    ].join('\n'),
    expected: [
      { name: 'Sol Ring', quantity: 1 },
      { name: "Atraxa, Praetors' Voice", quantity: 1 },
      { name: 'Command Tower', quantity: 1 },
      { name: 'Cultivate', quantity: 1 },
    ],
  },
  {
    label: 'TCGplayer Mass Entry: set code in square brackets',
    input: [
      '1 Lightning Bolt [SLD] 84',
      '1 Sol Ring [C21]',
      '2 Counterspell [MH2] 267',
      '1 Sol Ring [Commander 2021]',
    ].join('\n'),
    expected: [
      { name: 'Lightning Bolt', quantity: 1 },
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Counterspell', quantity: 2 },
      { name: 'Sol Ring', quantity: 1 },
    ],
  },
  {
    label: 'structure lines are skipped',
    input: [
      'Deck',
      'Commander',
      'Commanders (1)',
      'Sideboard',
      'Maybeboard',
      'Companion',
      'About',
      'Creature (12)',
      'Artifacts (5)',
      '// a comment',
      '# another comment',
      '',
      '   ',
      '1 Sol Ring',
    ].join('\n'),
    expected: [{ name: 'Sol Ring', quantity: 1 }],
  },
  {
    label: 'MTGO inline sideboard prefix',
    input: ['SB: 1 Sol Ring', 'SB: 2 Lightning Bolt (2XM) 129'].join('\n'),
    expected: [
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Lightning Bolt', quantity: 2 },
    ],
  },
  {
    label: 'double-faced card names keep their // separator',
    input: [
      '1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki',
      '1x Malakir Rebirth // Malakir Mire (znr) 111 [Removal]',
    ].join('\n'),
    expected: [
      { name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', quantity: 1 },
      { name: 'Malakir Rebirth // Malakir Mire', quantity: 1 },
    ],
  },
  {
    label: 'names containing digits, commas and apostrophes survive',
    input: [
      "1 Sisay, Weatherlight Captain (dmu) 213",
      '1x Borrowing 100,000 Arrows (chk) 55',
      "1 Urza's Saga (mh2) 259 *F*",
      '1 Ratchet Bomb',
    ].join('\n'),
    expected: [
      { name: 'Sisay, Weatherlight Captain', quantity: 1 },
      { name: 'Borrowing 100,000 Arrows', quantity: 1 },
      { name: "Urza's Saga", quantity: 1 },
      { name: 'Ratchet Bomb', quantity: 1 },
    ],
  },
  {
    label: 'CRLF line endings and stray whitespace',
    input: '  1 Sol Ring  \r\n\r\n\t2x Forest\t\r\n',
    expected: [
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Forest', quantity: 2 },
    ],
  },
];

let failures = 0;

for (const testCase of cases) {
  const actual = parseCardList(testCase.input).map(({ name, quantity }) => ({ name, quantity }));
  try {
    assert.deepStrictEqual(actual, testCase.expected);
    console.log(`  ok   ${testCase.label}`);
  } catch {
    failures++;
    console.error(`  FAIL ${testCase.label}`);
    console.error(`       expected: ${JSON.stringify(testCase.expected)}`);
    console.error(`       actual:   ${JSON.stringify(actual)}`);
  }
}

// The `raw` field should always carry the original line through untouched,
// since the UI reports unmatched entries using it.
const rawCheck = parseCardList('1x Sol Ring (c21) 263 [Ramp]');
assert.strictEqual(rawCheck[0].raw, '1x Sol Ring (c21) 263 [Ramp]');

if (failures > 0) {
  console.error(`\n${failures} of ${cases.length} parser cases failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} parser cases passed.`);
