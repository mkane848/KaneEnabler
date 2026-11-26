import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integrity of the vendored snapshot (docs/handoff.md Phase 3a): the parser's
 * output is only as trustworthy as its checks, so beyond the cross-check at
 * ingestion time, the committed snapshot must stay internally consistent and
 * must actually contain every rule the package's own primitives cite.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const srcDir = path.join(here, '..', 'src');

const latest = readdirSync(dataDir)
  .filter((f) => /^cr-\d{8}\.json$/.test(f))
  .sort()
  .at(-1);
const snapshot = JSON.parse(readFileSync(path.join(dataDir, latest), 'utf8'));

describe(`vendored snapshot ${latest}`, () => {
  it('version and effective date agree', () => {
    expect(snapshot.version).toBe(snapshot.effectiveDate.replace(/-/g, ''));
    expect(latest).toBe(`cr-${snapshot.version}.json`);
  });

  it('every rule parent resolves to a rule or a section', () => {
    for (const rule of Object.values(snapshot.rules)) {
      const parentExists = rule.parent in snapshot.rules || rule.parent in snapshot.sections;
      expect(parentExists, `parent ${rule.parent} of ${rule.ruleNumber}`).toBe(true);
    }
  });

  it('contains every CR number cited by the package source', () => {
    const cited = new Set();
    for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(path.join(srcDir, file), 'utf8');
      for (const match of text.matchAll(/\b(?:CR|rule)\s+(\d{3}(?:\.\d+)*[a-z]{0,2})\b/g)) {
        cited.add(match[1]);
      }
    }
    expect(cited.size).toBeGreaterThan(10);
    for (const number of cited) {
      const exists = number in snapshot.rules || number in snapshot.sections;
      expect(exists, `cited CR ${number}`).toBe(true);
    }
  });

  it('carries the glossary and the keyword sections the primitives rely on', () => {
    expect(Object.keys(snapshot.glossary).length).toBeGreaterThan(700);
    expect(snapshot.sections['702.32']).toBe('Fading');
    expect(snapshot.rules['702.32a'].text).toContain('Fading is a keyword');
  });
});
