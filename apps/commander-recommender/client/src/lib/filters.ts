import { isWithinColorIdentity } from '@mtg/rules';
import type { CommanderSuggestionDTO } from '../types';
import { visibleThemeSupport, visibleKindredSupport } from './suggestions';

/** A facet's selection: values the user wants to require, and values they
 * want to rule out. A value never appears in both at once. */
export interface FilterSelection {
  include: string[];
  exclude: string[];
}

export type FilterMode = 'include' | 'exclude';

export interface SuggestionFilters {
  colors: FilterSelection;
  /**
   * A further, independent restriction by identity *size* rather than
   * membership: colorless (identity is empty) or multicolor (2+ colors).
   * Kept as its own facet rather than folded into `colors` — "must be a
   * subset of {B, G}" and "must have 2+ colors" are different kinds of
   * question — but its values ('colorless' | 'multicolor') use the same
   * include/exclude cycle as every other facet, and render as chips inside
   * the same "Colors" filter row.
   */
  colorCategory: FilterSelection;
  brackets: FilterSelection;
  themes: FilterSelection;
  /** Separate from `themes` — kindred is its own suggestion field
   * (`kindredSupport`), not one of the archetypes in `themeSupport`, and
   * reads differently to a player ("what tribe" vs. "what plan"), so it gets
   * its own filter row rather than being folded in. Same grouped facet shape
   * and matching semantics as `themes`, though — see `groupFacetOptions`. */
  kindred: FilterSelection;
}

const EMPTY_SELECTION: FilterSelection = { include: [], exclude: [] };

export const EMPTY_FILTERS: SuggestionFilters = {
  colors: EMPTY_SELECTION,
  colorCategory: EMPTY_SELECTION,
  brackets: EMPTY_SELECTION,
  themes: EMPTY_SELECTION,
  kindred: EMPTY_SELECTION,
};

export function hasActiveFilters(filters: SuggestionFilters): boolean {
  return (Object.values(filters) as FilterSelection[]).some(
    (selection) => selection.include.length > 0 || selection.exclude.length > 0,
  );
}

/** Where a value currently sits in a facet: required, ruled out, or neither. */
export function modeOf(selection: FilterSelection, value: string): FilterMode | null {
  if (selection.include.includes(value)) return 'include';
  if (selection.exclude.includes(value)) return 'exclude';
  return null;
}

/** Cycles a single value through off → include → exclude → off. */
export function cycleSelection(selection: FilterSelection, value: string): FilterSelection {
  const mode = modeOf(selection, value);
  const include = selection.include.filter((v) => v !== value);
  const exclude = selection.exclude.filter((v) => v !== value);

  if (mode === null) return { include: [...include, value], exclude };
  if (mode === 'include') return { include, exclude: [...exclude, value] };
  return { include, exclude };
}

/**
 * Color filtering is subset (CR 903.4) for "include": picking {R, G} keeps
 * only identities that fit entirely inside {R, G} — mono-R, mono-G, Gruul,
 * and colourless (the empty identity is vacuously a subset of anything) —
 * matching Scryfall/EDHREC colour filters and "what could I build from this
 * pool?" rather than "what touches this pool at all?". "Exclude" is
 * unchanged: the literal complement, dropping any identity that touches an
 * excluded color at all.
 *
 * This used to be "touches this color" (picking Black kept anything whose
 * identity intersected it, Golgari and five-colour piles included) because
 * subset semantics made a narrow-identity commander vanish from a rainbow
 * pool — no way to ask "what's the best black deck in this pool?" once
 * mono-black couldn't clear the scorer's signal-count bar on its own. That's
 * now handled by the "Also playable" coverage tier (see
 * docs/recommendation-coverage.md), which surfaces a narrowest-identity pick
 * regardless of signal count, so subset semantics no longer starve it out.
 */
function matchesColors(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length > 0) {
    if (!isWithinColorIdentity(suggestion.colorIdentity, new Set(include))) return false;
  }
  if (exclude.length > 0) {
    const excluded = new Set(exclude);
    if (suggestion.colorIdentity.some((color) => excluded.has(color))) return false;
  }
  return true;
}

/**
 * `colorCategory` matches on identity *size* rather than membership, so
 * each value is checked as its own boolean rather than set membership.
 * Selecting both 'colorless' and 'multicolor' as "include" is a legal but
 * self-defeating combination (nothing is both) — that falls out of the
 * same AND semantics every other include facet already uses, rather than
 * needing special-casing here.
 */
function matchesColorCategory(
  suggestion: CommanderSuggestionDTO,
  selection: FilterSelection,
): boolean {
  const { include, exclude } = selection;
  if (include.length === 0 && exclude.length === 0) return true;
  const isColorless = suggestion.colorIdentity.length === 0;
  const isMulticolor = suggestion.colorIdentity.length >= 2;
  const satisfies = (value: string) => (value === 'colorless' ? isColorless : isMulticolor);
  if (include.length > 0 && !include.every(satisfies)) return false;
  if (exclude.length > 0 && exclude.some(satisfies)) return false;
  return true;
}

/**
 * Every filter value a suggestion satisfies for one archetype-shaped facet
 * (themes or kindred): the bare archetype ("goWide") for every qualified or
 * unqualified match it has, *and* each specific qualified key ("goWide:
 * Dinosaur") — so selecting the base chip means "this archetype at all, any
 * qualifier or none" while selecting a narrowed chip still means exactly
 * that qualifier. Matched against the same "still has supporting cards after
 * the identity filter" set the card display uses, so a filter chip never
 * claims a theme a suggestion isn't actually showing as a reason.
 */
function themePresentValues(suggestion: CommanderSuggestionDTO): Set<string> {
  const present = new Set<string>();
  for (const theme of visibleThemeSupport(suggestion)) {
    present.add(theme.archetype);
    present.add(theme.key);
  }
  return present;
}

/** Kindred has no server-sent `key`/`archetype` of its own (unlike
 * `themeSupport`, it's just a creature type) — `'kindred'`/`` `kindred:${type}` ``
 * are built here purely as this facet's own opaque filter-value scheme, the
 * same shape `signalKey` gives `themeSupport`, not parsed back out of
 * anything. */
function kindredPresentValues(suggestion: CommanderSuggestionDTO): Set<string> {
  const present = new Set<string>();
  for (const kindred of visibleKindredSupport(suggestion)) {
    present.add('kindred');
    present.add(`kindred:${kindred.type}`);
  }
  return present;
}

/** Included values are AND-ed (must have all); excluded values are ruled out
 * if the suggestion has any of them. Shared by every facet built from a
 * present-value set (`themePresentValues`, `kindredPresentValues`). */
function matchesPresentValues(present: Set<string>, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length === 0 && exclude.length === 0) return true;
  if (include.length > 0 && !include.every((value) => present.has(value))) return false;
  if (exclude.length > 0 && exclude.some((value) => present.has(value))) return false;
  return true;
}

function matchesThemes(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  return matchesPresentValues(themePresentValues(suggestion), selection);
}

function matchesKindred(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  return matchesPresentValues(kindredPresentValues(suggestion), selection);
}

function matchesBracket(suggestion: CommanderSuggestionDTO, selection: FilterSelection): boolean {
  const { include, exclude } = selection;
  if (include.length > 0 && !include.includes(suggestion.bracket.range)) return false;
  if (exclude.length > 0 && exclude.includes(suggestion.bracket.range)) return false;
  return true;
}

export function applyFilters<T extends CommanderSuggestionDTO>(
  suggestions: T[],
  filters: SuggestionFilters,
): T[] {
  return suggestions.filter(
    (s) =>
      matchesColors(s, filters.colors) &&
      matchesColorCategory(s, filters.colorCategory) &&
      matchesBracket(s, filters.brackets) &&
      matchesThemes(s, filters.themes) &&
      matchesKindred(s, filters.kindred),
  );
}

/** A qualifier chip nested under a grouped base chip — "Dinosaur" under
 * "Go-Wide Combat", or "Sliver" under "Kindred". */
export interface FacetQualifierOption {
  value: string;
  label: string;
}

/**
 * One filter chip for an archetype-shaped facet (themes or kindred).
 *
 * `qualifiers` is only ever non-empty once the archetype has 2+ distinct
 * qualifiers actually present in the current result set — that's what turns
 * dozens of "Go-Wide Combat (Dinosaur)", "Go-Wide Combat (Dragon)", ...
 * chips into one "Go-Wide Combat" chip with a narrowed, searchable list
 * underneath, without hardcoding which archetypes get this treatment: any
 * archetype (`qualifiable` or not, present or future) that happens to
 * qualify against 2+ real values gets grouped, and everything else — most of
 * the 29 archetypes never qualify at all — renders as a single flat chip
 * exactly as before.
 */
export interface ThemeFacetOption {
  value: string;
  label: string;
  qualifiers: FacetQualifierOption[];
}

interface QualifiableEntry {
  key: string;
  label: string;
  archetype: string;
  archetypeLabel: string;
  qualifier?: string;
}

function groupFacetOptions(entries: QualifiableEntry[]): ThemeFacetOption[] {
  const byArchetype = new Map<string, { archetypeLabel: string; entries: Map<string, QualifiableEntry> }>();
  for (const entry of entries) {
    let group = byArchetype.get(entry.archetype);
    if (!group) {
      group = { archetypeLabel: entry.archetypeLabel, entries: new Map() };
      byArchetype.set(entry.archetype, group);
    }
    group.entries.set(entry.key, entry);
  }

  const facets: ThemeFacetOption[] = [];
  for (const [archetype, group] of byArchetype) {
    const distinct = [...group.entries.values()];
    const distinctQualifiers = new Set(
      distinct.map((e) => e.qualifier).filter((q): q is string => q !== undefined),
    );
    if (distinctQualifiers.size >= 2) {
      facets.push({
        value: archetype,
        label: group.archetypeLabel,
        qualifiers: distinct
          .filter((e): e is QualifiableEntry & { qualifier: string } => e.qualifier !== undefined)
          .map((e) => ({ value: e.key, label: e.qualifier }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      });
    } else {
      for (const e of distinct) {
        facets.push({ value: e.key, label: e.label, qualifiers: [] });
      }
    }
  }
  return facets.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The filter values worth offering, taken from the results themselves — no
 * point showing a Bracket 4–5 toggle when nothing in the list is Bracket 4–5.
 * Themes and kindred are drawn from the same "still has supporting cards"
 * set the card display uses, so a filter chip never offers a theme no
 * suggestion actually shows.
 */
export function availableFilterValues(suggestions: CommanderSuggestionDTO[]) {
  const brackets = new Set<string>();
  const themeEntries: QualifiableEntry[] = [];
  const kindredEntries: QualifiableEntry[] = [];
  const colors = new Set<string>();
  let hasColorless = false;
  let hasMulticolor = false;

  for (const suggestion of suggestions) {
    brackets.add(suggestion.bracket.range);
    themeEntries.push(...visibleThemeSupport(suggestion));
    for (const kindred of visibleKindredSupport(suggestion)) {
      kindredEntries.push({
        key: `kindred:${kindred.type}`,
        label: `${kindred.type} Kindred`,
        archetype: 'kindred',
        archetypeLabel: 'Kindred',
        qualifier: kindred.type,
      });
    }
    suggestion.colorIdentity.forEach((color) => colors.add(color));
    if (suggestion.colorIdentity.length === 0) hasColorless = true;
    if (suggestion.colorIdentity.length >= 2) hasMulticolor = true;
  }

  return {
    brackets: [...brackets].sort(),
    themeFacets: groupFacetOptions(themeEntries),
    kindredFacets: groupFacetOptions(kindredEntries),
    colors,
    hasColorless,
    hasMulticolor,
  };
}
