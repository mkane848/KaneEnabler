import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from './SiteFooter';

describe('SiteFooter', () => {
  it('renders the shared attribution every app owes', () => {
    render(<SiteFooter />);
    expect(screen.getByText(/Card data via Scryfall/)).toBeInTheDocument();
    expect(screen.getByText(/Wizards of the Coast/)).toBeInTheDocument();
  });

  it('renders an app-specific line above the shared attribution', () => {
    render(
      <SiteFooter>
        <p>Suggestions are a heuristic.</p>
      </SiteFooter>,
    );
    const footer = screen.getByRole('contentinfo');
    const paragraphs = Array.from(footer.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs[0]).toBe('Suggestions are a heuristic.');
    expect(paragraphs[1]).toMatch(/Card data via Scryfall/);
  });

  it('keeps the shared class when an app adds its own', () => {
    render(<SiteFooter className="app-footer" />);
    expect(screen.getByRole('contentinfo')).toHaveClass('mtg-footer', 'app-footer');
  });

  it('omits the extra class when none is given', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo').getAttribute('class')).toBe('mtg-footer');
  });
});
