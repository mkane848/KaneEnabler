/**
 * Parser for the official Comprehensive Rules .txt published by Wizards of the
 * Coast (magic.wizards.com/en/rules → media.wizards.com/…/MagicCompRules <date>.txt).
 *
 * Written against the real 20261106 text, not from memory — the same discipline
 * as the repo's "never write oracle text from memory" rule, applied to parsing
 * logic: every shape below was observed in the source before being coded, and
 * the ingestion script cross-checks its output against the Academy Ruins API
 * (AGPL-3.0, used as a verification source only — none of its data is vendored).
 *
 * Observed source shapes:
 *   - UTF-8 with BOM; curly quotes.
 *   - Header, Introduction, then a Contents block whose entries are packed
 *     (no blank line between a section and its first subsection), followed by
 *     the body, where every block is separated by blank lines.
 *   - Headings and rules share the `NNN. text` shape ("100. General",
 *     "702.32. Fading", "6. Spells, Abilities, and Effects" vs "100.1. These
 *     Magic rules apply…"). They are told apart by the text: a heading is a
 *     short title (<= 60 chars) with no colon, parentheses, quotes or terminal
 *     sentence punctuation — internal periods and commas occur ("Team vs.
 *     Team Variant"). Rules are prose, and may end in ")" or ":" as well as
 *     ".". Subrules ("702.32a …", "704.5aa …") carry a one-or-two-letter
 *     suffix and no trailing dot, and are always rules.
 *   - A rule's text can continue on indented follow-on lines (205.4c, 509.1b);
 *     they join the rule text with a space.
 *   - Examples are single lines starting "Example:" (278 of them in 20261106,
 *     zero multi-line continuations), attached to the preceding rule.
 *   - The glossary is the last section: blank-separated blocks of a term line
 *     (any shape) followed by one or more definition lines, ending at the
 *     Credits/trademark block.
 */

/** A rule number: 100, 100.1, 702.32a, 704.5aa, and (defensively) comma fragments. */
const NUMBER = String.raw`\d+(?:\.\d+)*(?:[a-z]{1,2})?(?:,\d+)?`;
const NUMBERED_LINE = new RegExp(`^(${NUMBER})(\\.?)\\s+(.+)$`);

/** A heading is a short title: no colon/parens/quotes, no terminal sentence
 * punctuation. Internal periods and commas are legal ("Team vs. Team
 * Variant", "Spells, Abilities, and Effects"). Verified against the full
 * 20261106 rule set — see the cross-check in ingest-cr.mjs. */
const isHeadingText = (t) => t.length <= 60 && !/[:()"“”]/.test(t) && !/[.!?]$/.test(t);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "702.32a" -> "702.32"; "100.1" -> "100"; "113.6a,1" -> "113.6a". */
export function parentOf(ruleNumber) {
  const comma = ruleNumber.indexOf(',');
  if (comma !== -1) return ruleNumber.slice(0, comma);
  if (/[a-z]$/.test(ruleNumber)) return ruleNumber.slice(0, -1);
  const dot = ruleNumber.lastIndexOf('.');
  return dot === -1 ? ruleNumber : ruleNumber.slice(0, dot);
}

/** "November 6, 2026" -> { effectiveDate: "2026-11-06", version: "20261106" }. */
export function parseEffectiveDate(line) {
  const match = /effective as of ([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(line);
  if (!match) throw new Error(`No effective date found in line: ${line}`);
  const month = MONTHS.indexOf(match[1]);
  if (month === -1) throw new Error(`Unknown month in effective date: ${match[1]}`);
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(Number(match[2])).padStart(2, '0');
  return { effectiveDate: `${match[3]}-${mm}-${dd}`, version: `${match[3]}${mm}${dd}` };
}

/**
 * Parse the full official text into { version, effectiveDate, sections, rules,
 * glossary }. `sections` maps heading numbers to titles ("702.32": "Fading");
 * `rules` maps rule numbers to { ruleNumber, text, examples, parent };
 * `glossary` maps terms to their definition text (newlines preserved).
 */
export function parseCr(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);

  const dateLine = lines.find((l) => l.includes('effective as of'));
  if (!dateLine) throw new Error('No effective-date line in document');
  const { effectiveDate, version } = parseEffectiveDate(dateLine);

  // The Contents block packs "1. Game Concepts" directly against "100. General";
  // the body separates them with a blank line. That blank is the boundary.
  const bodyStart = lines.findIndex(
    (l, i) => /^1\. Game Concepts$/.test(l) && (lines[i + 1] ?? '').trim() === '',
  );
  if (bodyStart === -1) throw new Error('Could not locate the body start');

  const glossaryStart = lines.findLastIndex((l) => /^Glossary$/.test(l));
  if (glossaryStart === -1 || glossaryStart < bodyStart) {
    throw new Error('Could not locate the glossary after the body');
  }

  const sections = {};
  const rules = {};
  let current = null; // rule number whose text/examples a continuation line extends
  let currentExample = false;

  for (let i = bodyStart; i < glossaryStart; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const example = /^Example:\s*(.*)$/.exec(line);
    if (example) {
      if (!current) throw new Error(`Example without a preceding rule at line ${i + 1}`);
      rules[current].examples.push(example[1]);
      currentExample = true;
      continue;
    }

    const numbered = NUMBERED_LINE.exec(line);
    if (numbered) {
      const [, number, dot, rest] = numbered;
      const isSubrule = /[a-z]{1,2}(?:,\d+)?$/.test(number);
      const isRule = isSubrule || !isHeadingText(rest);
      if (isRule) {
        if (rules[number]) throw new Error(`Duplicate rule number ${number} at line ${i + 1}`);
        rules[number] = { ruleNumber: number, text: rest, examples: [], parent: parentOf(number) };
        current = number;
        currentExample = false;
      } else {
        if (dot !== '.') throw new Error(`Unexpected undotted heading ${number} at line ${i + 1}`);
        sections[number] = rest;
        current = null;
        currentExample = false;
      }
      continue;
    }

    // Continuation of the previous rule's text or example. The 20261106 text
    // has none, but a future revision wrapping a line must not silently drop it.
    if (!current) throw new Error(`Unclassified line ${i + 1}: ${line.slice(0, 80)}`);
    if (currentExample) {
      const examples = rules[current].examples;
      examples[examples.length - 1] += ` ${line.trim()}`;
    } else {
      rules[current].text += ` ${line.trim()}`;
    }
  }

  // Each glossary entry is a blank-separated block: the term on its own line
  // (any shape — "For Mirrodin!", 'Banding, “Bands with Other”'), then one or
  // more definition lines. Structure, not a term-shape heuristic: the terms
  // are too varied for a character class to tell from a definition sentence.
  const glossary = {};
  let block = [];
  const flush = () => {
    if (!block.length) return;
    const [term, ...definition] = block;
    if (glossary[term]) throw new Error(`Duplicate glossary term ${term}`);
    glossary[term] = definition.join('\n');
    block = [];
  };
  for (let i = glossaryStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^Credits$/.test(line) || /^(©|TM &)/.test(line)) break;
    if (!line.trim()) flush();
    else block.push(line);
  }
  flush();

  return { version, effectiveDate, sections, rules, glossary };
}
