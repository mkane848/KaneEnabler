import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSidecar } from './snapshot.js';
import {
  describeFailure,
  downloadBulkFile,
  ensureOracleCardsSnapshot,
  fetchOracleCardsEntry,
} from './bulkData.js';

const HEADERS = { 'User-Agent': 'test/1.0 (test)', Accept: 'application/json' };

/**
 * @param {unknown} body
 * @param {{ ok?: boolean, status?: number }} [opts]
 */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') };
}

/**
 * @param {string} text
 * @param {{ ok?: boolean, status?: number }} [opts]
 */
function gzipBodyResponse(text, { ok = true, status = 200 } = {}) {
  const compressed = gzipSync(Buffer.from(text));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    },
  });
  return { ok, status, body, text: () => Promise.resolve('') };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('describeFailure', () => {
  it('falls back to just the status when the body is empty', async () => {
    const res = /** @type {Response} */ ({ status: 503, text: () => Promise.resolve('') });
    expect(await describeFailure(res)).toBe('HTTP 503');
  });

  it('includes the response body when present', async () => {
    const res = /** @type {Response} */ ({
      status: 400,
      text: () => Promise.resolve('{"details":"missing User-Agent"}'),
    });
    expect(await describeFailure(res)).toBe('HTTP 400: {"details":"missing User-Agent"}');
  });

  it('truncates a very long body rather than printing it in full', async () => {
    const res = /** @type {Response} */ ({
      status: 500,
      text: () => Promise.resolve('x'.repeat(600)),
    });
    const message = await describeFailure(res);
    expect(message).toBe(`HTTP 500: ${'x'.repeat(500)}…`);
  });

  it("doesn't let an unreadable body swallow the status code", async () => {
    const res = /** @type {Response} */ ({
      status: 502,
      text: () => Promise.reject(new Error('stream already consumed')),
    });
    expect(await describeFailure(res)).toBe('HTTP 502');
  });
});

describe('fetchOracleCardsEntry', () => {
  it('returns the oracle_cards entry from the bulk-data listing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            data: [
              { type: 'card_kingdoms', updated_at: 'x' },
              {
                type: 'oracle_cards',
                updated_at: '2026-08-01T00:00:00Z',
                jsonl_download_uri: 'https://example.com/oracle-cards.jsonl.gz',
                compressed_size: 12345,
              },
            ],
          }),
        ),
      ),
    );
    const entry = await fetchOracleCardsEntry(HEADERS);
    expect(entry).toEqual({
      downloadUri: 'https://example.com/oracle-cards.jsonl.gz',
      updatedAt: '2026-08-01T00:00:00Z',
      compressedSize: 12345,
    });
  });

  it('throws if the listing request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({}, { ok: false, status: 503 }))),
    );
    await expect(fetchOracleCardsEntry(HEADERS)).rejects.toThrow(
      'Failed to list Scryfall bulk data',
    );
  });

  it('throws if no oracle_cards entry is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ data: [{ type: 'rulings' }] }))),
    );
    await expect(fetchOracleCardsEntry(HEADERS)).rejects.toThrow(
      'Could not find an "oracle_cards" entry',
    );
  });

  it('throws a specific error if Scryfall renamed jsonl_download_uri again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            data: [{ type: 'oracle_cards', updated_at: 'x', download_uri: 'old-shape' }],
          }),
        ),
      ),
    );
    await expect(fetchOracleCardsEntry(HEADERS)).rejects.toThrow('has no `jsonl_download_uri`');
  });
});

describe('downloadBulkFile', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let destPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scryfall-download-test-'));
    destPath = path.join(dir, 'oracle-cards.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('streams and decompresses the response body to disk', async () => {
    const text = '{"id":"1","name":"Test Card"}\n{"id":"2","name":"Another Card"}\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(gzipBodyResponse(text))),
    );
    await downloadBulkFile('https://example.com/oracle-cards.jsonl.gz', HEADERS, destPath);
    expect(fs.readFileSync(destPath, 'utf8')).toBe(text);
  });

  it('throws if the download request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(gzipBodyResponse('', { ok: false, status: 500 }))),
    );
    await expect(downloadBulkFile('https://example.com/x', HEADERS, destPath)).rejects.toThrow(
      'Failed to download bulk file',
    );
  });

  it('throws if the response has no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, body: null, text: () => Promise.resolve('') }),
      ),
    );
    await expect(downloadBulkFile('https://example.com/x', HEADERS, destPath)).rejects.toThrow(
      'Bulk file response had no body',
    );
  });
});

describe('ensureOracleCardsSnapshot', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let destPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scryfall-ensure-test-'));
    destPath = path.join(dir, 'oracle-cards.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * @param {string} updatedAt
   * @param {string} text
   */
  function stubListingThenDownload(updatedAt, text) {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            type: 'oracle_cards',
            updated_at: updatedAt,
            jsonl_download_uri: 'https://example.com/oracle-cards.jsonl.gz',
            compressed_size: 999,
          },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(gzipBodyResponse(text));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('downloads and writes a sidecar when nothing is on disk yet', async () => {
    const fetchMock = stubListingThenDownload('2026-08-01T00:00:00Z', '{"id":"1"}\n');
    const result = await ensureOracleCardsSnapshot({ destPath, headers: HEADERS });
    expect(result).toEqual({
      downloaded: true,
      updatedAt: '2026-08-01T00:00:00Z',
      compressedSize: 999,
    });
    expect(fs.readFileSync(destPath, 'utf8')).toBe('{"id":"1"}\n');
    expect(readSidecar(destPath)?.updatedAt).toBe('2026-08-01T00:00:00Z');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips the download when the disk copy already matches the published snapshot', async () => {
    // Seed disk with a snapshot claiming to already be current.
    const seeded = stubListingThenDownload('2026-08-01T00:00:00Z', '{"id":"1"}\n');
    await ensureOracleCardsSnapshot({ destPath, headers: HEADERS });
    expect(seeded).toHaveBeenCalledTimes(2);

    // Re-run against the same published updatedAt — only the cheap listing
    // call should happen this time, not a second download.
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            type: 'oracle_cards',
            updated_at: '2026-08-01T00:00:00Z',
            jsonl_download_uri: 'https://example.com/oracle-cards.jsonl.gz',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureOracleCardsSnapshot({ destPath, headers: HEADERS });
    expect(result.downloaded).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-downloads when force is set, even if the disk copy is already current', async () => {
    stubListingThenDownload('2026-08-01T00:00:00Z', '{"id":"1"}\n');
    await ensureOracleCardsSnapshot({ destPath, headers: HEADERS });

    const fetchMock = stubListingThenDownload('2026-08-01T00:00:00Z', '{"id":"1"}\n{"id":"2"}\n');
    const result = await ensureOracleCardsSnapshot({
      destPath,
      headers: HEADERS,
      force: true,
    });
    expect(result.downloaded).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(destPath, 'utf8')).toBe('{"id":"1"}\n{"id":"2"}\n');
  });

  it('downloads when the published snapshot has changed since the last one on disk', async () => {
    stubListingThenDownload('2026-08-01T00:00:00Z', '{"id":"1"}\n');
    await ensureOracleCardsSnapshot({ destPath, headers: HEADERS });

    const fetchMock = stubListingThenDownload('2026-09-01T00:00:00Z', '{"id":"1"}\n{"id":"2"}\n');
    const result = await ensureOracleCardsSnapshot({ destPath, headers: HEADERS });
    expect(result).toEqual({
      downloaded: true,
      updatedAt: '2026-09-01T00:00:00Z',
      compressedSize: 999,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
