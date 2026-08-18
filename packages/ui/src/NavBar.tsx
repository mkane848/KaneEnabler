import { useState, type ReactNode } from 'react';

export interface NavBarLink {
  label: string;
  href: string;
  /** Marks this link as the current page — styling only, no router integration. */
  current?: boolean;
}

export interface NavBarProps {
  brand: { label: string; href: string };
  links: NavBarLink[];
  /** Sign-in state/menu — each app passes @mtg/profile's AccountMenu here. */
  accountSlot?: ReactNode;
  /** App-specific controls that belong in the bar but aren't a cross-app link or the account menu — e.g. time-counters' theme toggle, the recommender's About trigger. */
  extraSlot?: ReactNode;
  className?: string;
}

/**
 * The site chrome shared by every app on the platform: brand, cross-app
 * links, and wherever each app plugs in its account menu / extra controls.
 * Styled entirely through the --mtg-* platform tokens each app's own
 * tokens.css/App.css/index.css defines (see those files), so it re-themes
 * per app — and, for time-counters, per the Doctor Who/Claude toggle
 * passed via extraSlot — without per-app overrides. Unlike Modal/
 * ErrorBoundary this ships its own layout CSS (NavBar.css) rather than
 * being fully unstyled: the mobile-disclosure behavior below isn't
 * something each app should reimplement.
 */
export function NavBar({ brand, links, accountSlot, extraSlot, className }: NavBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className={['mtg-navbar', className].filter(Boolean).join(' ')}>
      <div className="mtg-navbar-row">
        <a className="mtg-navbar-brand" href={brand.href}>
          {brand.label}
        </a>

        <button
          type="button"
          className="mtg-navbar-toggle"
          aria-expanded={open}
          aria-controls="mtg-navbar-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="mtg-navbar-toggle-bar" />
          <span className="mtg-navbar-toggle-bar" />
          <span className="mtg-navbar-toggle-bar" />
          <span className="mtg-navbar-visually-hidden">Menu</span>
        </button>

        <div
          id="mtg-navbar-panel"
          className={['mtg-navbar-panel', open && 'mtg-navbar-panel-open']
            .filter(Boolean)
            .join(' ')}
        >
          <nav className="mtg-navbar-links" aria-label="Tools">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={['mtg-navbar-link', link.current && 'mtg-navbar-link-current']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={link.current ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {extraSlot && <div className="mtg-navbar-extra">{extraSlot}</div>}
          {accountSlot && <div className="mtg-navbar-account">{accountSlot}</div>}
        </div>
      </div>
    </header>
  );
}
