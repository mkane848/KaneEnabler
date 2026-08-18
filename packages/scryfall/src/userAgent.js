// @ts-check

/**
 * Formats a Scryfall-identifying User-Agent, the same way for every caller.
 *
 * Scryfall requires a descriptive `User-Agent` on every request and answers
 * HTTP 400 without one — see docs/api-policy.md. `version` is meant to be
 * read from the caller's own `package.json` at call time (see
 * fetch-scryfall.ts / fetch-card-data.mjs) rather than hardcoded, so it
 * can't drift the way both apps' copies previously did — one was three
 * major versions stale.
 *
 * @param {{ product: string, version: string, contact: string }} info
 * @returns {string}
 */
export function buildUserAgent({ product, version, contact }) {
  return `${product}/${version} (${contact})`;
}
