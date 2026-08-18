import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultFilters } from './ResultFilters';
import { EMPTY_FILTERS, type SuggestionFilters } from '../lib/filters';

const BASE_PROPS = {
  filters: EMPTY_FILTERS,
  onChange: vi.fn(),
  availableBrackets: [],
  availableThemes: ['Aristocrats', 'Reanimator'],
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

    const whitePip = screen.getByLabelText('White: not filtered — click to allow this color');
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
    screen.getByLabelText('White: allowed — click to exclude it instead').click();
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

  it('renders a chip per available theme and cycles its filter state on click', () => {
    const onChange = vi.fn();
    render(<ResultFilters {...BASE_PROPS} onChange={onChange} />);

    expect(screen.getByText('Aristocrats')).toBeInTheDocument();
    expect(screen.getByText('Reanimator')).toBeInTheDocument();

    screen.getByText('Aristocrats').click();
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      themes: { include: ['Aristocrats'], exclude: [] },
    });
  });

  it('hides the themes row entirely when there are none to filter by', () => {
    render(<ResultFilters {...BASE_PROPS} availableThemes={[]} />);
    expect(screen.queryByText('Themes')).not.toBeInTheDocument();
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
