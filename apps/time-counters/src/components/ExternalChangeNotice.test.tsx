import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExternalChangeNotice from './ExternalChangeNotice';

describe('ExternalChangeNotice', () => {
  it('announces an update from another tab and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<ExternalChangeNotice change="updated" onDismiss={onDismiss} />);
    expect(screen.getByRole('status')).toHaveTextContent('This game was updated in another tab');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('says so when the other tab started a new game', () => {
    render(<ExternalChangeNotice change="reset" onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('A new game was started in another tab');
  });
});
