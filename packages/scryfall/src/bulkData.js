// @ts-check
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { diskHasSnapshot, writeSidecar } from './snapshot.js';

/**
 * Builds the "what went wrong" half of a failure message.
 *
 * Scryfall explains rejections in the response body — a JSON error object
 * whose `details` field says exactly what it objected to — while the status
 * code alone rarely narrows it down. These requests only ever run
 * unattended in a build log, so there's no chance to re-run them by hand
 * with more logging; whatever is printed here is all you get.
 *
 * @param {Response} res
 */
export async function describeFailure(res) {
  let body = '';
  try {
    body = (await res.text()).trim();
  } catch {
    // An unreadable body shouldn't swallow the status code.
  }
  if (!body) return `HTTP ${res.status}`;
  // Bounded in case a proxy or error page answers with a wall of HTML.
  const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return `HTTP ${res.status}: ${snippet}`;
}

/**
 * Looks up Scryfall's current "oracle_cards" bulk-data entry: one small
 * request, since its `updated_at` is the only thing that can answer "is my
 * copy current?" without downloading a multi-hundred-MB file to find out.
 *
 * Scryfall changed this shape once already: entries used to carry
 * `download_uri` (a plain uncompressed JSON array) and `size`. Both are
 * gone, replaced by `jsonl_download_uri` (newline-delimited JSON, gzipped)
 * and `compressed_size` — reading the old field names silently yielded
 * `undefined`, which surfaced as "Failed to parse URL from undefined" and a
 * download size of "~NaNMB". This throws an explicit error instead, if
 * Scryfall ever renames the field again.
 *
 * @param {Record<string, string>} headers
 */
export async function fetchOracleCardsEntry(headers) {
  const res = await fetch('https://api.scryfall.com/bulk-data', { headers });
  if (!res.ok) {
    throw new Error(`Failed to list Scryfall bulk data (${await describeFailure(res)})`);
  }
  const { data } = /** @type {{ data: Array<Record<string, unknown>> }} */ (await res.json());
  const entry = data.find((e) => e.type === 'oracle_cards');
  if (!entry) {
    throw new Error('Could not find an "oracle_cards" entry in the Scryfall bulk data list.');
  }
  const downloadUri = entry.jsonl_download_uri;
  if (typeof downloadUri !== 'string') {
    throw new Error(
      'The "oracle_cards" bulk entry has no `jsonl_download_uri`. Scryfall has probably renamed ' +
        'the field again — check https://scryfall.com/docs/api/bulk-data for the current shape. ' +
        `Fields present: ${Object.keys(entry).join(', ')}`,
    );
  }
  return {
    downloadUri,
    updatedAt: /** @type {string} */ (entry.updated_at),
    compressedSize: /** @type {number | undefined} */ (entry.compressed_size),
  };
}

/**
 * Streams a gzip-compressed JSONL bulk file straight to disk, decompressing
 * as it goes. The file is tens of MB compressed but expands to several
 * hundred MB uncompressed, and there's no reason to hold all of that in
 * memory on the way to disk.
 *
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {string} destPath
 */
export async function downloadBulkFile(url, headers, destPath) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download bulk file (${await describeFailure(res)})`);
  }
  if (!res.body) {
    throw new Error('Bulk file response had no body.');
  }
  await pipeline(
    Readable.fromWeb(/** @type {import('stream/web').ReadableStream} */ (res.body)),
    createGunzip(),
    fs.createWriteStream(destPath),
  );
}

/**
 * Ensures `destPath` holds Scryfall's current "oracle_cards" bulk snapshot
 * as raw JSONL text, downloading only when the published snapshot has
 * actually changed (or `force` is set) — never on a time-based guess. The
 * sidecar is written only once the file is fully on disk, so an interrupted
 * download can never leave it claiming a snapshot that isn't really there.
 *
 * @param {{ destPath: string, headers: Record<string, string>, force?: boolean }} opts
 * @returns {Promise<{ downloaded: boolean, updatedAt: string, compressedSize?: number }>}
 */
export async function ensureOracleCardsSnapshot({ destPath, headers, force = false }) {
  const entry = await fetchOracleCardsEntry(headers);
  if (!force && diskHasSnapshot(destPath, entry.updatedAt)) {
    return { downloaded: false, updatedAt: entry.updatedAt, compressedSize: entry.compressedSize };
  }
  await downloadBulkFile(entry.downloadUri, headers, destPath);
  writeSidecar(destPath, {
    updatedAt: entry.updatedAt,
    downloadUri: entry.downloadUri,
    fetchedAt: new Date().toISOString(),
  });
  return { downloaded: true, updatedAt: entry.updatedAt, compressedSize: entry.compressedSize };
}
