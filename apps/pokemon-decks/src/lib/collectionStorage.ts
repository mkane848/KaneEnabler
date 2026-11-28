/**
 * The pasted collection, kept in this browser so a visit doesn't start from
 * an empty box. Stored as the raw text the player pasted: it's re-parsed
 * against whatever snapshot is current, so a card added by a data refresh
 * resolves next visit instead of being frozen as "not found".
 */
const KEY = 'pokemon-decks:collection:v1';

export function loadCollectionText(): string {
  try {
    const raw = localStorage.getItem(KEY);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
}

export function saveCollectionText(text: string): void {
  try {
    if (text.trim()) localStorage.setItem(KEY, text);
    else localStorage.removeItem(KEY);
  } catch {
    // Private browsing or a full quota — the session still works, it just won't be remembered.
  }
}
