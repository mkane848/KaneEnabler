import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavBar } from './NavBar';

const links = [
  { label: 'Home', href: '/', current: true },
  { label: 'Recommender', href: '/recommender/' },
  { label: 'Time Counters', href: '/time-counters/' },
];

describe('NavBar', () => {
  it('renders the brand and every link', () => {
    render(<NavBar brand={{ label: 'KaneEnabler', href: '/' }} links={links} />);
    expect(screen.getByRole('link', { name: 'KaneEnabler' })).toHaveAttribute('href', '/');
    for (const link of links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href);
    }
  });

  it('marks the current link with aria-current', () => {
    render(<NavBar brand={{ label: 'KaneEnabler', href: '/' }} links={links} />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Recommender' })).not.toHaveAttribute('aria-current');
  });

  it('renders accountSlot and extraSlot content', () => {
    render(
      <NavBar
        brand={{ label: 'KaneEnabler', href: '/' }}
        links={links}
        accountSlot={<span>Sign in</span>}
        extraSlot={<span>Theme</span>}
      />,
    );
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('toggles the mobile panel open and closed', () => {
    render(<NavBar brand={{ label: 'KaneEnabler', href: '/' }} links={links} />);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the mobile panel when a link is clicked', () => {
    render(<NavBar brand={{ label: 'KaneEnabler', href: '/' }} links={links} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('link', { name: 'Recommender' }));
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
