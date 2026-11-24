import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CardPreference } from '@mtg/profile';
import { CardPreferenceRow } from './CardPreferenceRow';

const setMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock('@mtg/profile', () => ({
  useSetCardPreference: () => ({ mutate: setMutate }),
  useRemoveCardPreference: () => ({ mutate: removeMutate }),
}));

const PREF: CardPreference = {
  id: 'p1',
  userId: 'u1',
  oracleId: 'o1',
  sentiment: 'like',
  tags: [],
  note: 'first',
  createdAt: '2026-01-01T00:00:00Z',
};

function noteBox() {
  return screen.getByRole('textbox');
}

describe('CardPreferenceRow', () => {
  it('re-syncs the note when the stored value changes', () => {
    const { rerender } = render(
      <CardPreferenceRow userId="u1" preference={PREF} card={undefined} />,
    );
    expect(noteBox()).toHaveValue('first');

    rerender(
      <CardPreferenceRow userId="u1" preference={{ ...PREF, note: 'second' }} card={undefined} />,
    );
    expect(noteBox()).toHaveValue('second');
  });

  it('keeps an unsaved draft when the stored value changes underneath it', () => {
    const { rerender } = render(
      <CardPreferenceRow userId="u1" preference={PREF} card={undefined} />,
    );
    fireEvent.change(noteBox(), { target: { value: 'my edit' } });

    rerender(
      <CardPreferenceRow userId="u1" preference={{ ...PREF, note: 'second' }} card={undefined} />,
    );
    expect(noteBox()).toHaveValue('my edit');
  });
});
