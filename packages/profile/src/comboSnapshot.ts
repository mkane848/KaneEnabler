/**
 * The fields a stored combo snapshot is guaranteed to have after parsing.
 *
 * `combo_preferences.snapshot` is jsonb written by ComboFavoriteButton at
 * favourite time (the whole `ComboDTO` as shown) and read back with no
 * server-side validation — only RLS ownership. This type + guard move the
 * trust decision to the read boundary in `fromComboRow`, so a drifted or
 * externally-written blob fails *here* (gracefully, into a safe empty
 * snapshot) rather than at render time in the profile page.
 */
export interface ComboSnapshot {
  permalink: string | null;
  cards: string[];
  produces: string[];
  description: string | null;
}

/** The full ComboDTO may carry more, but only these fields are ever read
 * back for display — so this is what we validate and retain. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Defensively parses an untyped snapshot into a `ComboSnapshot`, dropping
 * anything that isn't the expected shape. Never throws: a malformed or
 * externally-written blob becomes a safe empty snapshot rather than a
 * render-time crash.
 */
export function parseComboSnapshot(value: unknown): ComboSnapshot {
  if (!isRecord(value)) {
    return { permalink: null, cards: [], produces: [], description: null };
  }
  return {
    permalink: asNullableString(value.permalink),
    cards: asStringArray(value.cards),
    produces: asStringArray(value.produces),
    description: asNullableString(value.description),
  };
}
