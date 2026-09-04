import type { ReactNode } from 'react';

export interface SiteFooterProps {
  /** App-specific line, rendered above the shared attribution. */
  children?: ReactNode;
  className?: string;
}

/**
 * The line every app closes with. The Scryfall and Wizards attributions are
 * the same obligation on every tool, so they live here rather than being
 * retyped (and drifting) per app — time-counters carried its copy as inline
 * styles on a bare <footer>, which is how the two ended up looking nothing
 * alike. Anything an individual app needs to add goes in `children`.
 */
export function SiteFooter({ children, className }: SiteFooterProps) {
  return (
    <footer className={['mtg-footer', className].filter(Boolean).join(' ')}>
      {children}
      <p>Card data via Scryfall. Magic: The Gathering is © Wizards of the Coast.</p>
    </footer>
  );
}
