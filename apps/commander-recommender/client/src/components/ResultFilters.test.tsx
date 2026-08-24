import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultFilters } from './ResultFilters';
import { EMPTY_FILTERS, type SuggestionFilters } from '../lib/filters';
import { WUBRG } from '../lib/mtg';

const BASE_PROPS = {
  filters: EMPTY_FILTERS,
  onChange: vi.fn(),
  availableBrackets: [],
  availableThemeFacets: [
    { value: 'aristocrats', label: 'Aristocrats', qualifiers: [] },
    { value: 'reanimator', label: 'Reanimator', qualifiers: [] },
  ],
  availableKindredFacets: [],
  availableColors: new Set(WUBRG),
  hasColorless: false,
  hasMulticolor: false,
  sortMode: 'relevance' as const,
  onSortModeChange: vi.fn(),
  sortDirection: 'desc' as const,
  onSortDirectionChange: vi.fn(),
  shown: 5,
  total: 10,
};

describe('ResultFilters', () => {
  it('shows how many of the total are currently displayed', () => {
    render(<ResultFilters {...BASE_PROPS} />);
    expect(screen.getByText('5 of 10 commanders')).toBeInTheDocument();
  });

  it('collapses the count to just the total once nothing is filtered out', () => {
    render(<ResultFilters {...BASE_PROPS} shown={10} total={10} />);
    expect(screen.getByText('10 commanders')).toBeInTheDocument();
  });

  it('clicking a color pip cycles include -> exclude -> off', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ResultFilters {...BASE_PROPS} onChange={onChange} />);

    const whitePip = screen.getByLabelText('White: not filtered — click to include this color');
    whitePip.click();
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      colors: { include: ['W'], exclude: [] },
    });

    const includedFilters: SuggestionFilters = {
      ...EMPTY_FILTERS,
      colors: { include: ['W'], exclude: [] },
    };
    rerender(<ResultFilters {...BASE_PROPS} filters={includedFilters} onChange={onChange} />);
    screen.getByLabelText('White: included — click to exclude it instead').click();
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      colors: { include: [], exclude: ['W'] },
    });

    const excludedFilters: SuggestionFilters = {
      ...EMPTY_FILTERS,
      colors: { include: [], exclude: ['W'] },
    };
    rerender(<ResultFilters {...BASE_PROPS} filters={excludedFilters} onChange={onChange} />);
    screen.getByLabelText('White: excluded — click to clear').click();
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTERS);
  });

  it('mutes a color pip absent from availableColors but still lets it cycle', () => {
    const onChange = vi.fn();
    render(
      <ResultFilters
        {...BASE_PROPS}
        availableColors={new Set(['U', 'B', 'R', 'G'])}
        onChange={onChange}
      />,
    );

    const whitePip = screen.getByLabelText('White: not filtered — click to include this color');
    expect(whitePip.className).toContain('toggle-pip-unavailable');

    whitePip.click();
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      colors: { include: ['W'], exclude: [] },
    });
  });

  it('renders a chip per available theme and cycles its filter state on click', () => {
    const onChange = vi.fn();
    render(<ResultFilters {...BASE_PROPS} onChange={onChange} />);

    expect(screen.getByText('Aristocrats')).toBeInTheDocument();
    expect(screen.getByText('Reanimator')).toBeInTheDocument();

    screen.getByText('Aristocrats').click();
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      themes: { include: ['aristocrats'], exclude: [] },
    });
  });

  it('hides the themes row entirely when there are none to filter by', () => {
    render(<ResultFilters {...BASE_PROPS} availableThemeFacets={[]} />);
    expect(screen.queryByText('Themes')).not.toBeInTheDocument();
  });

  // --- grouped facets: the "Go-Wide Combat (Dinosaur)" explosion fix -----

  it('a qualified archetype with 2+ qualifiers groups into a base chip with a collapsed narrowed list', () => {
    const onChange = vi.fn();
    const facets = [
      {
        value: 'goWide',
        label: 'Go-Wide Combat',
        qualifiers: [
          { value: 'goWide:Goblin', label: 'Goblin' },
          { value: 'goWide:Sliver', label: 'Sliver' },
        ],
      },
    ];
    render(<ResultFilters {...BASE_PROPS} availableThemeFacets={facets} onChange={onChange} />);

    // Collapsed by default — the narrowed chips aren't in the DOM yet, only
    // the one base chip and its disclosure toggle.
    expect(screen.getByText('Go-Wide Combat')).toBeInTheDocument();
    expect(screen.queryByText('Sliver')).not.toBeInTheDocument();

    // The disclosure toggle only flips its own local state (no callback
    // prop to observe), so it needs fireEvent's act() wrapping to flush
    // synchronously — unlike the FacetChip clicks below, which just need
    // their onChange call args checked.
    fireEvent.click(screen.getByText('2 types'));
    expect(screen.getByText('Sliver')).toBeInTheDocument();
    expect(screen.getByText('Goblin')).toBeInTheDocument();

    // The base chip means "this archetype, any qualifier or none".
    screen.getByText('Go-Wide Combat').click();
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      themes: { include: ['goWide'], exclude: [] },
    });

    // A narrowed chip means exactly that qualifier.
    screen.getByText('Sliver').click();
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      themes: { include: ['goWide:Sliver'], exclude: [] },
    });
  });

  it('an archetype with a single qualifier renders as one flat chip, not a base+disclosure group', () => {
    const facets = [{ value: 'goWide:Sliver', label: 'Go-Wide Combat (Sliver)', qualifiers: [] }];
    render(<ResultFilters {...BASE_PROPS} availableThemeFacets={facets} />);

    expect(screen.getByText('Go-Wide Combat (Sliver)')).toBeInTheDocument();
    expect(screen.queryByText(/types$/)).not.toBeInTheDocument();
  });

  it('does not show a search box for a small narrowed list', () => {
    const small = [
      {
        value: 'goWide',
        label: 'Go-Wide Combat',
        qualifiers: [
          { value: 'goWide:Goblin', label: 'Goblin' },
          { value: 'goWide:Sliver', label: 'Sliver' },
        ],
      },
    ];
    render(<ResultFilters {...BASE_PROPS} availableThemeFacets={small} />);
    fireEvent.click(screen.getByText('2 types'));
    expect(screen.queryByPlaceholderText(/Search/)).not.toBeInTheDocument();
  });

  it('shows a search box once a narrowed list has more than 12 entries', () => {
    const large = [
      {
        value: 'kindred',
        label: 'Kindred',
        qualifiers: Array.from({ length: 13 }, (_, i) => ({
          value: `kindred:Type${i}`,
          label: `Type${i}`,
        })),
      },
    ];
    render(<ResultFilters {...BASE_PROPS} availableThemeFacets={large} />);
    fireEvent.click(screen.getByText('13 types'));
    expect(screen.getByPlaceholderText(/Search 13 types/)).toBeInTheDocument();
  });

  // --- the Kindred row: its own facet, same grouped shape as Themes ------

  it('renders the Kindred row, separately from Themes, using the same grouped shape', () => {
    const onChange = vi.fn();
    const kindredFacets = [
      {
        value: 'kindred',
        label: 'Kindred',
        qualifiers: [
          { value: 'kindred:Goblin', label: 'Goblin' },
          { value: 'kindred:Sliver', label: 'Sliver' },
        ],
      },
    ];
    render(
      <ResultFilters {...BASE_PROPS} availableKindredFacets={kindredFacets} onChange={onChange} />,
    );

    expect(screen.getAllByText('Kindred').length).toBeGreaterThan(0);
    screen.getByLabelText(/Kindred, any type/).click();
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTERS,
      kindred: { include: ['kindred'], exclude: [] },
    });
  });

  it('hides the Kindred row entirely when there is nothing to filter by', () => {
    render(<ResultFilters {...BASE_PROPS} availableKindredFacets={[]} />);
    expect(screen.queryByText('Kindred')).not.toBeInTheDocument();
  });

  it('only shows "Clear filters" once a filter is active, and it resets everything', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ResultFilters {...BASE_PROPS} onChange={onChange} />);
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();

    const active: SuggestionFilters = {
      ...EMPTY_FILTERS,
      colors: { include: ['W'], exclude: [] },
    };
    rerender(<ResultFilters {...BASE_PROPS} filters={active} onChange={onChange} />);
    screen.getByText('Clear filters').click();
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('changing the sort mode dropdown calls onSortModeChange', () => {
    const onSortModeChange = vi.fn();
    render(<ResultFilters {...BASE_PROPS} onSortModeChange={onSortModeChange} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    select.value = 'colorNameValue';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSortModeChange).toHaveBeenCalledWith('colorNameValue');
  });

  it('clicking the sort direction button reverses it', () => {
    const onSortDirectionChange = vi.fn();
    render(
      <ResultFilters
        {...BASE_PROPS}
        sortDirection="desc"
        onSortDirectionChange={onSortDirectionChange}
      />,
    );
    screen.getByLabelText(/Sort descending/).click();
    expect(onSortDirectionChange).toHaveBeenCalledWith('asc');
  });
});
