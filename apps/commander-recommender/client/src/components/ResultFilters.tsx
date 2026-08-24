import { useId, useState, type ReactNode } from 'react';
import { COLOR_LABELS, WUBRG } from '../lib/mtg';
import { ManaSymbol } from './ManaSymbol';
import {
  EMPTY_FILTERS,
  cycleSelection,
  hasActiveFilters,
  modeOf,
  type FilterMode,
  type FilterSelection,
  type SuggestionFilters,
  type ThemeFacetOption,
} from '../lib/filters';
import { SORT_MODE_LABELS, type SortDirection, type SortMode } from '../lib/sort';

interface Props {
  filters: SuggestionFilters;
  onChange: (filters: SuggestionFilters) => void;
  availableBrackets: string[];
  availableThemeFacets: ThemeFacetOption[];
  availableKindredFacets: ThemeFacetOption[];
  availableColors: Set<string>;
  hasColorless: boolean;
  hasMulticolor: boolean;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (direction: SortDirection) => void;
  shown: number;
  total: number;
}

/** Once an archetype has 2+ real qualifiers, the nested list can still run
 * long (a big, varied decklist can turn up 30+ creature types under Kindred
 * or Go-Wide Combat) — a plain filter box beats scrolling a wall of chips to
 * find one tribe. Below this, the chip list alone is faster than typing. */
const QUALIFIER_SEARCH_THRESHOLD = 12;

const MODE_ICON: Record<FilterMode, string> = { include: '+', exclude: '−' };

/**
 * Bracket filtering is hidden while the Bracket estimate itself is hidden on
 * each card (see CommanderCard's badge row) — filtering by a number the
 * results no longer display would be filtering blind. Everything behind it
 * still works; flip this back to `true` when the estimate returns.
 */
const SHOW_BRACKET_FILTER = false;

/** Each facet chip cycles off → include → exclude → off on click, so a
 * single control covers "must have" and "must not have" without doubling
 * the number of buttons on screen. */
function FacetChip({
  label,
  mode,
  onClick,
  describe,
}: {
  label: ReactNode;
  mode: FilterMode | null;
  onClick: () => void;
  describe: (mode: FilterMode | null) => string;
}) {
  return (
    <button
      type="button"
      className={`toggle-chip toggle-chip-${mode ?? 'off'}`}
      onClick={onClick}
      aria-label={describe(mode)}
      title={describe(mode)}
    >
      {mode && (
        <span className="chip-mode-icon" aria-hidden="true">
          {MODE_ICON[mode]}
        </span>
      )}
      {label}
    </button>
  );
}

/**
 * One archetype-shaped facet chip: either a plain `FacetChip` (an archetype
 * with 0 or 1 qualifier present just renders exactly as before), or — once
 * `option.qualifiers` has 2+ entries — a base chip meaning "this archetype,
 * any qualifier or none" plus a disclosure revealing the specific qualifiers
 * underneath. This is what turns "Go-Wide Combat (Dinosaur)", "Go-Wide
 * Combat (Dragon)", ... into one "Go-Wide Combat" chip with a narrowed list
 * behind it, and is reused as-is for the Kindred row.
 */
function QualifiableFacet({
  option,
  selection,
  onToggle,
}: {
  option: ThemeFacetOption;
  selection: FilterSelection;
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const panelId = useId();

  if (option.qualifiers.length === 0) {
    return (
      <FacetChip
        label={option.label}
        mode={modeOf(selection, option.value)}
        onClick={() => onToggle(option.value)}
        describe={(m) => `${option.label}: ${nextModeDescription(m)}`}
      />
    );
  }

  const showSearch = option.qualifiers.length > QUALIFIER_SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const visibleQualifiers =
    showSearch && needle
      ? option.qualifiers.filter((q) => q.label.toLowerCase().includes(needle))
      : option.qualifiers;

  return (
    <div className="facet-group">
      <div className="facet-group-header">
        <FacetChip
          label={option.label}
          mode={modeOf(selection, option.value)}
          onClick={() => onToggle(option.value)}
          describe={(m) => `${option.label}, any type: ${nextModeDescription(m)}`}
        />
        <button
          type="button"
          className="facet-group-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((e) => !e)}
        >
          {option.qualifiers.length} types
          <span aria-hidden="true" className="explain-chevron">
            {expanded ? '▲' : '▼'}
          </span>
        </button>
      </div>
      {expanded && (
        <div id={panelId} className="facet-group-panel">
          {showSearch && (
            <input
              type="text"
              className="facet-search"
              placeholder={`Search ${option.qualifiers.length} types…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search ${option.label} types`}
            />
          )}
          <div
            className="toggle-group facet-group-chips"
            role="group"
            aria-label={`${option.label} types`}
          >
            {visibleQualifiers.map((q) => (
              <FacetChip
                key={q.value}
                label={q.label}
                mode={modeOf(selection, q.value)}
                onClick={() => onToggle(q.value)}
                describe={(m) => `${option.label} (${q.label}): ${nextModeDescription(m)}`}
              />
            ))}
            {visibleQualifiers.length === 0 && <span className="facet-no-match">No matches</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function nextModeDescription(current: FilterMode | null): string {
  if (current === null) return 'not filtered — click to require';
  if (current === 'include') return 'required — click to exclude instead';
  return 'excluded — click to clear';
}

/**
 * Colors read differently from every other facet, so they get their own
 * wording. Including Bracket 3 or a theme *requires* it; including White
 * keeps anything that *fits inside* the colors picked so far — White alone
 * keeps mono-white and colourless, not Orzhov or a five-colour pile. A
 * colourless commander is a subset of every color combination, so it
 * survives any include; the `colorless` chip alongside these pips is how to
 * ask for *only* those instead.
 */
function nextColorModeDescription(current: FilterMode | null): string {
  if (current === null) return 'not filtered — click to include this color';
  if (current === 'include') return 'included — click to exclude it instead';
  return 'excluded — click to clear';
}

export function ResultFilters({
  filters,
  onChange,
  availableBrackets,
  availableThemeFacets,
  availableKindredFacets,
  availableColors,
  hasColorless,
  hasMulticolor,
  sortMode,
  onSortModeChange,
  sortDirection,
  onSortDirectionChange,
  shown,
  total,
}: Props) {
  const active = hasActiveFilters(filters);

  function updateFacet(key: keyof SuggestionFilters, selection: FilterSelection) {
    onChange({ ...filters, [key]: selection });
  }

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-label" id="filter-colors-label">
          Colors
        </span>
        <div className="toggle-group" role="group" aria-labelledby="filter-colors-label">
          {WUBRG.map((color) => {
            const mode = modeOf(filters.colors, color);
            const name = COLOR_LABELS[color];
            const unavailable = !availableColors.has(color);
            return (
              <button
                key={color}
                type="button"
                className={`toggle-pip toggle-pip-${mode ?? 'off'}${unavailable ? ' toggle-pip-unavailable' : ''}`}
                onClick={() => updateFacet('colors', cycleSelection(filters.colors, color))}
                aria-label={`${name}: ${nextColorModeDescription(mode)}`}
                title={`${name}: ${nextColorModeDescription(mode)}`}
              >
                <ManaSymbol color={color} decorative />
              </button>
            );
          })}
          {hasColorless && (
            <FacetChip
              label="Colorless"
              mode={modeOf(filters.colorCategory, 'colorless')}
              onClick={() =>
                updateFacet('colorCategory', cycleSelection(filters.colorCategory, 'colorless'))
              }
              describe={(m) => `Colorless: ${nextModeDescription(m)}`}
            />
          )}
          {hasMulticolor && (
            <FacetChip
              label="Multicolor"
              mode={modeOf(filters.colorCategory, 'multicolor')}
              onClick={() =>
                updateFacet('colorCategory', cycleSelection(filters.colorCategory, 'multicolor'))
              }
              describe={(m) => `Multicolor: ${nextModeDescription(m)}`}
            />
          )}
        </div>
        <span className="filter-hint">
          click to include a color, again to exclude — results fit inside the colors you include
        </span>
      </div>

      {SHOW_BRACKET_FILTER && availableBrackets.length > 1 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-bracket-label">
            Bracket
          </span>
          <div className="toggle-group" role="group" aria-labelledby="filter-bracket-label">
            {availableBrackets.map((bracket) => {
              const mode = modeOf(filters.brackets, bracket);
              return (
                <FacetChip
                  key={bracket}
                  label={bracket.replace('Bracket ', '')}
                  mode={mode}
                  onClick={() => updateFacet('brackets', cycleSelection(filters.brackets, bracket))}
                  describe={(m) =>
                    `Bracket ${bracket.replace('Bracket ', '')}: ${nextModeDescription(m)}`
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {availableThemeFacets.length > 0 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-theme-label">
            Themes
          </span>
          <div className="toggle-group" role="group" aria-labelledby="filter-theme-label">
            {availableThemeFacets.map((option) => (
              <QualifiableFacet
                key={option.value}
                option={option}
                selection={filters.themes}
                onToggle={(value) => updateFacet('themes', cycleSelection(filters.themes, value))}
              />
            ))}
          </div>
        </div>
      )}

      {availableKindredFacets.length > 0 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-kindred-label">
            Kindred
          </span>
          <div className="toggle-group" role="group" aria-labelledby="filter-kindred-label">
            {availableKindredFacets.map((option) => (
              <QualifiableFacet
                key={option.value}
                option={option}
                selection={filters.kindred}
                onToggle={(value) => updateFacet('kindred', cycleSelection(filters.kindred, value))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="filter-footer">
        <span className="filter-count">
          {shown === total ? `${total} commanders` : `${shown} of ${total} commanders`}
        </span>

        <label className="sort-control">
          <span className="filter-label">Sort</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          >
            {(Object.entries(SORT_MODE_LABELS) as [SortMode, string][]).map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="sort-direction"
          onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
          aria-label={`Sort ${sortDirection === 'asc' ? 'ascending' : 'descending'} — click to reverse`}
          title={`Sort ${sortDirection === 'asc' ? 'ascending' : 'descending'} — click to reverse`}
        >
          <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        </button>

        {active && (
          <button type="button" className="filter-clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
