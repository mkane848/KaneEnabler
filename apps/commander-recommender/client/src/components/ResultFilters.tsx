import type { ReactNode } from 'react';
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
} from '../lib/filters';
import { SORT_MODE_LABELS, type SortDirection, type SortMode } from '../lib/sort';
import { SUGGESTIONS_PAGE_SIZE_OPTIONS } from '../store/usePreferencesStore';

interface Props {
  filters: SuggestionFilters;
  onChange: (filters: SuggestionFilters) => void;
  availableBrackets: string[];
  availableThemes: string[];
  hasColorless: boolean;
  hasMulticolor: boolean;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (direction: SortDirection) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  shown: number;
  total: number;
}

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

function nextModeDescription(current: FilterMode | null): string {
  if (current === null) return 'not filtered — click to require';
  if (current === 'include') return 'required — click to exclude instead';
  return 'excluded — click to clear';
}

/**
 * Colors read differently from every other facet, so they get their own
 * wording. Including Bracket 3 or a theme *requires* it; including White does
 * not require white, it permits it — a commander shows when its whole color
 * identity fits inside what you have allowed. Picking White and Black is the
 * Orzhov question ("what could I build here?"), which is why mono-black still
 * appears, and why calling this "require" was actively misleading.
 */
function nextColorModeDescription(current: FilterMode | null): string {
  if (current === null) return 'not filtered — click to allow this color';
  if (current === 'include') return 'allowed — click to exclude it instead';
  return 'excluded — click to clear';
}

export function ResultFilters({
  filters,
  onChange,
  availableBrackets,
  availableThemes,
  hasColorless,
  hasMulticolor,
  sortMode,
  onSortModeChange,
  sortDirection,
  onSortDirectionChange,
  pageSize,
  onPageSizeChange,
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
            return (
              <button
                key={color}
                type="button"
                className={`toggle-pip toggle-pip-${mode ?? 'off'}`}
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
              onClick={() => updateFacet('colorCategory', cycleSelection(filters.colorCategory, 'colorless'))}
              describe={(m) => `Colorless: ${nextModeDescription(m)}`}
            />
          )}
          {hasMulticolor && (
            <FacetChip
              label="Multicolor"
              mode={modeOf(filters.colorCategory, 'multicolor')}
              onClick={() => updateFacet('colorCategory', cycleSelection(filters.colorCategory, 'multicolor'))}
              describe={(m) => `Multicolor: ${nextModeDescription(m)}`}
            />
          )}
        </div>
        <span className="filter-hint">click to allow a color, again to exclude — results fit within the allowed colors</span>
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
                  describe={(m) => `Bracket ${bracket.replace('Bracket ', '')}: ${nextModeDescription(m)}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {availableThemes.length > 0 && (
        <div className="filter-row">
          <span className="filter-label" id="filter-theme-label">
            Themes
          </span>
          <div className="toggle-group" role="group" aria-labelledby="filter-theme-label">
            {availableThemes.map((theme) => {
              const mode = modeOf(filters.themes, theme);
              return (
                <FacetChip
                  key={theme}
                  label={theme}
                  mode={mode}
                  onClick={() => updateFacet('themes', cycleSelection(filters.themes, theme))}
                  describe={(m) => `${theme}: ${nextModeDescription(m)}`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="filter-footer">
        <span className="filter-count">
          {shown === total ? `${total} commanders` : `${shown} of ${total} commanders`}
        </span>

        <label className="sort-control">
          <span className="filter-label">Sort</span>
          <select value={sortMode} onChange={(event) => onSortModeChange(event.target.value as SortMode)}>
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

        {/* Remembered across visits (see usePreferencesStore) — a page size
            picked once is a standing preference, not a one-off for this
            list. */}
        <label className="sort-control">
          <span className="filter-label">Show</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {SUGGESTIONS_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        {active && (
          <button type="button" className="filter-clear" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
