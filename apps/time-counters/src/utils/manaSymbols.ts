import { MANA_GLYPHS } from './manaGlyphs';

/**
 * Turning Scryfall's `mana_cost` string into something drawable.
 *
 * A cost is a run of braced symbols, and they are not all the same shape:
 * `{3}` is a number, `{W}` is a glyph, `{W/U}` is two of them on a split
 * disc, `{W/P}` is a Phyrexian symbol tinted by a colour it doesn't draw.
 * Parsing therefore can't just map a symbol to an icon name — it has to say
 * what kind of thing each symbol is, and the renderer draws accordingly.
 *
 * Anything unrecognised degrades to its own text on a neutral disc. Magic
 * keeps inventing symbols; a cost with an unknown one in it should look
 * slightly plain, not blow a hole in the card list.
 */

/** Splits a mana cost like "{2}{W/U}{R}" into its bracketed symbols, e.g. ["2", "W/U", "R"]. */
export function parseManaCost(manaCost?: string): string[] {
  if (!manaCost) return [];
  return manaCost.match(/\{[^}]+\}/g)?.map(s => s.slice(1, -1)) ?? [];
}

/** One half of a pip: either an inlined glyph or a short piece of text. */
export type Face = { glyph: string } | { text: string };

export interface Pip {
  /** One face for an ordinary symbol, two for a hybrid. */
  faces: Face[];
  /**
   * Colour keys for the disc, one per face. A single key fills it; two make
   * the diagonal split hybrids use. Keys match the --pip-* CSS variables.
   */
  colors: string[];
  /** Spoken description, e.g. "white or blue mana". */
  label: string;
}

const COLOR_NAMES: Record<string, string> = {
  w: 'white',
  u: 'blue',
  b: 'black',
  r: 'red',
  g: 'green',
  c: 'colorless',
  s: 'snow',
};

/** A symbol that stands for a colour of mana, as opposed to an amount of it. */
function isColorKey(key: string): boolean {
  return key in COLOR_NAMES;
}

function faceFor(part: string): Face {
  const key = part.toLowerCase();
  return isColorKey(key) && MANA_GLYPHS[key] ? { glyph: key } : { text: part.toUpperCase() };
}

/** Colour key driving the disc behind a part — generic amounts get the neutral disc. */
function colorFor(part: string): string {
  const key = part.toLowerCase();
  return isColorKey(key) ? key : 'generic';
}

function nameFor(part: string): string {
  const key = part.toLowerCase();
  if (COLOR_NAMES[key]) return `${COLOR_NAMES[key]} mana`;
  if (/^\d+$/.test(part)) return `${part} generic mana`;
  return `${part.toUpperCase()} mana`;
}

/**
 * Describes how to draw one symbol.
 *
 * Phyrexian is the odd one: `{W/P}` reads as a slash-pair but is drawn as a
 * single Phyrexian glyph on that colour's disc, not as a split. It's checked
 * before the general hybrid case for exactly that reason.
 */
export function toPip(symbol: string): Pip {
  const parts = symbol.split('/');

  if (parts.length === 2 && parts[1].toLowerCase() === 'p') {
    const color = colorFor(parts[0]);
    return {
      faces: [MANA_GLYPHS.p ? { glyph: 'p' } : { text: 'P' }],
      colors: [color],
      label: `Phyrexian ${nameFor(parts[0])}`,
    };
  }

  if (parts.length === 2) {
    return {
      faces: [faceFor(parts[0]), faceFor(parts[1])],
      colors: [colorFor(parts[0]), colorFor(parts[1])],
      label: `${nameFor(parts[0])} or ${nameFor(parts[1])}`,
    };
  }

  return {
    faces: [faceFor(symbol)],
    colors: [colorFor(symbol)],
    label: nameFor(symbol),
  };
}
