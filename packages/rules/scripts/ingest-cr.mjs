#!/usr/bin/env node
/**
 * Ingests the official Comprehensive Rules .txt into a vendored snapshot at
 * packages/rules/data/cr-<version>.json (docs/handoff.md Phase 3a).
 *
 *   node scripts/ingest-cr.mjs                 # discover, fetch, parse, cross-check, write
 *   node scripts/ingest-cr.mjs --url <txt url> # pin a specific revision
 *   node scripts/ingest-cr.mjs --check-only    # report whether a newer CR exists; write nothing
 *
 * The primary source is Wizards' own .txt; the Academy Ruins API (AGPL-3.0) is
 * a cross-check only — none of its data is copied into the snapshot. The rule
 * set and rule text must match it exactly (headings included: their /cr carries
 * subsection headings as entries). Examples are checked directionally — losing
 * one theirs has fails the run, having more is a warning, because their parser
 * drops trailing examples (613.6, 707.3, 800.4a). Glossary and toc are warnings:
 * both carry known artifacts of their own (a "Credits" glossary entry, a toc
 * that stops at whole-number sections).
 *
 * Runs wherever egress to magic.wizards.com / media.wizards.com /
 * api.academyruins.com exists: locally, or the scheduled cr-refresh workflow.
 * See docs/api-policy.md for the cadence and the owner sign-off on record.
 */
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCr } from './parse-cr.mjs';

const RULES_PAGE = 'https://magic.wizards.com/en/rules';
const ACADEMY_RUINS = 'https://api.academyruins.com';
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

/** The current official txt link, straight off the rules page. */
async function discoverUrl() {
  const res = await fetch(RULES_PAGE);
  if (!res.ok) throw new Error(`${RULES_PAGE} responded ${res.status}`);
  const match = /href="(https:\/\/media\.wizards\.com\/[^"]+?\.txt)"/.exec(await res.text());
  if (!match) throw new Error('No media.wizards.com .txt link found on the rules page');
  return match[1];
}

function versionFromUrl(url) {
  const match = /(\d{8})\.txt$/.exec(url);
  if (!match) throw new Error(`No YYYYMMDD revision in url: ${url}`);
  return match[1];
}

function latestCommittedVersion() {
  const versions = readdirSync(DATA_DIR)
    .map((f) => /^cr-(\d{8})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .sort();
  return versions.at(-1) ?? null;
}

/** Collapse whitespace only — both sources use UTF-8 curly quotes verbatim. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function crossCheck(parsed) {
  const [arRules, arGlossary, arToc] = await Promise.all([
    getJson(`${ACADEMY_RUINS}/cr`),
    getJson(`${ACADEMY_RUINS}/cr/glossary`),
    getJson(`${ACADEMY_RUINS}/cr/toc`),
  ]);
  const problems = [];
  const warnings = [];

  // Academy Ruins' /cr carries subsection headings ("702.2": "Deathtouch")
  // alongside real rules, but not top-level sections ("100", "6") — those are
  // checked against its toc below. Compare like with like.
  const combined = { ...parsed.rules };
  for (const [number, title] of Object.entries(parsed.sections)) {
    if (number.includes('.')) combined[number] = { text: title, examples: [] };
  }
  const ours = Object.keys(combined);
  const theirs = Object.keys(arRules);
  const missing = theirs.filter((k) => !combined[k]);
  const extra = ours.filter((k) => !arRules[k]);
  if (missing.length)
    problems.push(
      `entries missing vs Academy Ruins (${missing.length}): ${missing.slice(0, 10).join(', ')}`,
    );
  if (extra.length)
    problems.push(
      `entries not in Academy Ruins (${extra.length}): ${extra.slice(0, 10).join(', ')}`,
    );

  let textDiffs = 0;
  let exampleDiffs = 0;
  let exampleExtras = 0;
  for (const key of ours) {
    const ar = arRules[key];
    if (!ar) continue;
    if (norm(combined[key].text) !== norm(ar.ruleText ?? '')) {
      textDiffs++;
      if (textDiffs <= 5)
        problems.push(
          `text differs for ${key}:\n  ours: ${combined[key].text.slice(0, 120)}\n  theirs: ${(ar.ruleText ?? '').slice(0, 120)}`,
        );
    }
    // Directional: we must not lose an example Academy Ruins has, but having
    // more is fine — their parser demonstrably drops trailing examples (613.6,
    // 707.3, 800.4a each carry four in the official text, three in theirs).
    const arExamples = (ar.examples ?? []).map(norm);
    const ourExamples = combined[key].examples.map(norm);
    const lost = arExamples.filter((ex) => !ourExamples.includes(ex));
    if (lost.length) {
      exampleDiffs++;
      if (exampleDiffs <= 5)
        problems.push(`examples lost vs Academy Ruins for ${key}: ${lost[0].slice(0, 100)}`);
    }
    const gained = ourExamples.filter((ex) => !arExamples.includes(ex));
    if (gained.length) exampleExtras += gained.length;
  }
  if (textDiffs > 5) problems.push(`…and ${textDiffs - 5} more text differences`);
  if (exampleDiffs > 5) problems.push(`…and ${exampleDiffs - 5} more lost-example entries`);
  if (exampleExtras)
    warnings.push(
      `examples present in the official text but not in Academy Ruins: ${exampleExtras} (their parser drops trailing examples)`,
    );

  // Glossary and toc: warn, don't gate (Academy Ruins' own parse has artifacts).
  // Their glossary is keyed lower-case; the case-preserving name is in `term`.
  const arGloss = {};
  for (const entry of Object.values(arGlossary)) {
    if (entry.term !== 'Credits') arGloss[entry.term] = entry.definition ?? '';
  }
  const arTerms = Object.keys(arGloss);
  const ourTerms = Object.keys(parsed.glossary);
  const glossMissing = arTerms.filter((t) => !parsed.glossary[t]);
  const glossExtra = ourTerms.filter((t) => !(t in arGloss));
  if (glossMissing.length)
    warnings.push(
      `glossary terms only in Academy Ruins (${glossMissing.length}): ${glossMissing.slice(0, 10).join(', ')}`,
    );
  if (glossExtra.length)
    warnings.push(
      `glossary terms only in ours (${glossExtra.length}): ${glossExtra.slice(0, 10).join(', ')}`,
    );
  let glossDiffs = 0;
  for (const term of ourTerms) {
    if (term in arGloss && norm(parsed.glossary[term]) !== norm(arGloss[term])) glossDiffs++;
  }
  if (glossDiffs) warnings.push(`glossary definitions differing on shared terms: ${glossDiffs}`);

  const tocSections = {};
  const walk = (nodes) => {
    for (const node of nodes) {
      tocSections[String(node.number)] = node.title;
      if (node.subsections) walk(node.subsections);
    }
  };
  walk(arToc);
  // Their toc stops at whole-number sections; dotted subsection headings are
  // already gated by the /cr comparison above.
  const ourTocSections = Object.fromEntries(
    Object.entries(parsed.sections).filter(([k]) => !k.includes('.')),
  );
  const tocMissing = Object.keys(tocSections).filter((k) => ourTocSections[k] !== tocSections[k]);
  const tocExtra = Object.keys(ourTocSections).filter((k) => !(k in tocSections));
  if (tocMissing.length)
    warnings.push(
      `toc entries missing/mismatched (${tocMissing.length}): ${tocMissing.slice(0, 10).join(', ')}`,
    );
  if (tocExtra.length)
    warnings.push(
      `sections not in Academy Ruins toc (${tocExtra.length}): ${tocExtra.slice(0, 10).join(', ')}`,
    );

  console.log(
    `Cross-check: ${ours.length} rules ours / ${theirs.length} theirs; ${ourTerms.length} glossary terms ours / ${arTerms.length} theirs; ${Object.keys(parsed.sections).length} sections.`,
  );
  for (const w of warnings) console.log(`WARN: ${w}`);
  if (problems.length) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    throw new Error(`Cross-check failed with ${problems.length} problem(s)`);
  }
  console.log('Cross-check clean: rule set, rule text and examples match Academy Ruins.');
}

async function main() {
  const url = urlArg ?? (await discoverUrl());
  const current = versionFromUrl(url);
  const committed = latestCommittedVersion();

  if (checkOnly) {
    console.log(JSON.stringify({ current, committed, refreshNeeded: current !== committed }));
    return;
  }

  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const parsed = parseCr(Buffer.from(await res.arrayBuffer()).toString('utf8'));
  if (parsed.version !== current) {
    throw new Error(
      `Document effective date ${parsed.version} disagrees with url revision ${current}`,
    );
  }
  await crossCheck(parsed);

  const snapshot = {
    version: parsed.version,
    effectiveDate: parsed.effectiveDate,
    source: url,
    generatedAt: new Date().toISOString(),
    sections: parsed.sections,
    rules: parsed.rules,
    glossary: parsed.glossary,
  };
  const out = path.join(DATA_DIR, `cr-${parsed.version}.json`);
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  // One current snapshot: git history is the archive of older revisions, and
  // a 1.3 MB file per refresh would otherwise accumulate four times a year.
  for (const file of readdirSync(DATA_DIR)) {
    if (/^cr-\d{8}\.json$/.test(file) && file !== path.basename(out)) {
      unlinkSync(path.join(DATA_DIR, file));
      console.log(`Removed superseded snapshot ${file}`);
    }
  }
  console.log(
    `Wrote ${out} (${Object.keys(parsed.rules).length} rules, ${Object.keys(parsed.glossary).length} glossary terms)`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
