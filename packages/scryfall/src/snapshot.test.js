import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diskHasSnapshot, readSidecar, sidecarPathFor, writeSidecar } from './snapshot.js';

/** @type {string} */
let dir;
/** @type {string} */
let dataPath;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scryfall-snapshot-test-'));
  dataPath = path.join(dir, 'oracle-cards.jsonl');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('sidecarPathFor', () => {
  it('appends .meta.json to the data path', () => {
    expect(sidecarPathFor('/a/b/oracle-cards.jsonl')).toBe('/a/b/oracle-cards.jsonl.meta.json');
  });
});

describe('readSidecar', () => {
  it('returns null when no sidecar exists', () => {
    expect(readSidecar(dataPath)).toBeNull();
  });

  it('returns null for a corrupt sidecar rather than throwing', () => {
    fs.writeFileSync(sidecarPathFor(dataPath), '{not valid json');
    expect(readSidecar(dataPath)).toBeNull();
  });

  it('returns null for a sidecar missing updatedAt', () => {
    fs.writeFileSync(sidecarPathFor(dataPath), JSON.stringify({ downloadUri: 'x' }));
    expect(readSidecar(dataPath)).toBeNull();
  });

  it('round-trips what writeSidecar wrote', () => {
    writeSidecar(dataPath, {
      updatedAt: '2026-08-01T00:00:00Z',
      downloadUri: 'https://example.com/cards.jsonl.gz',
      fetchedAt: '2026-08-01T00:05:00Z',
    });
    expect(readSidecar(dataPath)).toEqual({
      updatedAt: '2026-08-01T00:00:00Z',
      downloadUri: 'https://example.com/cards.jsonl.gz',
      fetchedAt: '2026-08-01T00:05:00Z',
    });
  });

  it('defaults missing optional fields to empty strings', () => {
    fs.writeFileSync(
      sidecarPathFor(dataPath),
      JSON.stringify({ updatedAt: '2026-08-01T00:00:00Z' }),
    );
    expect(readSidecar(dataPath)).toEqual({
      updatedAt: '2026-08-01T00:00:00Z',
      downloadUri: '',
      fetchedAt: '',
    });
  });
});

describe('diskHasSnapshot', () => {
  it('is false when the data file does not exist', () => {
    expect(diskHasSnapshot(dataPath, '2026-08-01T00:00:00Z')).toBe(false);
  });

  it('is false when the data file exists but is empty — an interrupted download', () => {
    fs.writeFileSync(dataPath, '');
    writeSidecar(dataPath, {
      updatedAt: '2026-08-01T00:00:00Z',
      downloadUri: '',
      fetchedAt: '',
    });
    expect(diskHasSnapshot(dataPath, '2026-08-01T00:00:00Z')).toBe(false);
  });

  it('is false when the file exists but has no sidecar at all', () => {
    fs.writeFileSync(dataPath, '{"id":"1"}\n');
    expect(diskHasSnapshot(dataPath, '2026-08-01T00:00:00Z')).toBe(false);
  });

  it('is false when the sidecar names a different published snapshot', () => {
    fs.writeFileSync(dataPath, '{"id":"1"}\n');
    writeSidecar(dataPath, {
      updatedAt: '2026-07-01T00:00:00Z',
      downloadUri: '',
      fetchedAt: '',
    });
    expect(diskHasSnapshot(dataPath, '2026-08-01T00:00:00Z')).toBe(false);
  });

  it('is true when the file is non-empty and the sidecar matches the published snapshot', () => {
    fs.writeFileSync(dataPath, '{"id":"1"}\n');
    writeSidecar(dataPath, {
      updatedAt: '2026-08-01T00:00:00Z',
      downloadUri: '',
      fetchedAt: '',
    });
    expect(diskHasSnapshot(dataPath, '2026-08-01T00:00:00Z')).toBe(true);
  });
});
