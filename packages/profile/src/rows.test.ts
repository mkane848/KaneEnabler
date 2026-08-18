import { describe, expect, it } from 'vitest';
import { fromCardRow, fromComboRow, type CardPreferenceRow, type ComboPreferenceRow } from './rows';

describe('fromCardRow', () => {
  it('maps every snake_case field to its camelCase counterpart, unchanged', () => {
    const row: CardPreferenceRow = {
      id: 'row-1',
      user_id: 'user-1',
      oracle_id: 'oracle-1',
      sentiment: 'dislike',
      tags: ['jank', 'combo-piece'],
      note: 'cute but bad',
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(fromCardRow(row)).toEqual({
      id: 'row-1',
      userId: 'user-1',
      oracleId: 'oracle-1',
      sentiment: 'dislike',
      tags: ['jank', 'combo-piece'],
      note: 'cute but bad',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('preserves a null note rather than coercing it', () => {
    const row: CardPreferenceRow = {
      id: 'row-1',
      user_id: 'user-1',
      oracle_id: 'oracle-1',
      sentiment: 'like',
      tags: [],
      note: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(fromCardRow(row).note).toBeNull();
  });
});

describe('fromComboRow', () => {
  it('maps every snake_case field to its camelCase counterpart, unchanged', () => {
    const row: ComboPreferenceRow = {
      id: 'row-1',
      user_id: 'user-1',
      combo_key: 'combo-key-1',
      sentiment: 'like',
      spellbook_id: 'spellbook-1',
      snapshot: { cards: ['A', 'B'] },
      fetched_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(fromComboRow(row)).toEqual({
      id: 'row-1',
      userId: 'user-1',
      comboKey: 'combo-key-1',
      sentiment: 'like',
      spellbookId: 'spellbook-1',
      snapshot: { cards: ['A', 'B'] },
      fetchedAt: '2026-01-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('preserves a null spellbook_id rather than coercing it', () => {
    const row: ComboPreferenceRow = {
      id: 'row-1',
      user_id: 'user-1',
      combo_key: 'combo-key-1',
      sentiment: 'like',
      spellbook_id: null,
      snapshot: {},
      fetched_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(fromComboRow(row).spellbookId).toBeNull();
  });

  it('passes the snapshot through opaquely, whatever shape it is', () => {
    const snapshot = { arbitrary: 'shape', nested: { count: 3 } };
    const row: ComboPreferenceRow = {
      id: 'row-1',
      user_id: 'user-1',
      combo_key: 'combo-key-1',
      sentiment: 'like',
      spellbook_id: null,
      snapshot,
      fetched_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(fromComboRow(row).snapshot).toBe(snapshot);
  });
});
