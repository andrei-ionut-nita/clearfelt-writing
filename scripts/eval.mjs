#!/usr/bin/env node
/**
 * Lightweight sanity check for the Human Score's scoring weights, not a
 * substitute for real validation. Runs every fixture in
 * tests/fixtures/eval/manifest.json through detect.mjs and reports how many
 * land in their labeled expected band. A low pass rate is a real finding
 * about the detector's precision or recall, report it plainly, don't tune
 * the bands until it passes.
 *
 * Usage: node scripts/eval.mjs [--out <file>] [--min-pass-rate <fraction>]
 *
 * --out writes the same pass/fail summary as JSON to <file> (default: no
 * file, unchanged behavior). Intended for reports/eval-<date>.json, a
 * gitignored, opt-in location (see CLAUDE.md), so a release checklist can
 * diff eval pass-rate trend across versions instead of only ever seeing the
 * latest run.
 *
 * --min-pass-rate exits 1 if the aggregate pass rate falls below it (a
 * fraction, e.g. 0.85), otherwise exits 0. Omitted, this script never fails
 * the process regardless of pass rate, same as before this flag existed: a
 * disclosed recall gap a maintainer is actively investigating shouldn't
 * block a local run just for existing. CI passes this flag (see
 * .github/workflows/ci.yml) so a real regression, the eval corpus's pass
 * rate actually getting worse, fails the build instead of only showing up
 * in a log nobody is required to read; the floor is set below the current
 * pass rate on purpose, to catch a real drop, not to demand every fixture
 * pass before every merge.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DETECT = join(ROOT, 'scripts', 'detect.mjs');
const EVAL_DIR = join(ROOT, 'tests', 'fixtures', 'eval');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const gateIdx = args.indexOf('--min-pass-rate');
const minPassRate = gateIdx !== -1 ? Number(args[gateIdx + 1]) : null;

const manifest = JSON.parse(readFileSync(join(EVAL_DIR, 'manifest.json'), 'utf8'));

let passed = 0;
const results = [];

for (const entry of manifest.fixtures) {
  const out = execFileSync(process.execPath, [DETECT, '--mode', 'score', join(EVAL_DIR, entry.file)], {
    cwd: EVAL_DIR,
    encoding: 'utf8',
  });
  const { score } = JSON.parse(out);
  const min = entry.expectedMin ?? 0;
  const max = entry.expectedMax ?? 100;
  const inBand = score >= min && score <= max;
  if (inBand) passed++;
  results.push({ file: entry.file, label: entry.label, score, band: `${min}-${max}`, inBand });
}

for (const r of results) {
  const mark = r.inBand ? 'in-band ' : 'OUT OF BAND';
  console.log(`${mark}  ${r.file.padEnd(14)} label=${r.label.padEnd(6)} score=${String(r.score).padStart(3)}  expected ${r.band}`);
}
console.log(`\n${passed}/${manifest.fixtures.length} fixtures scored within their expected band`);

// Per-bucket breakdown, not just the flat aggregate: writing.md's own
// doctrine (formality isn't a flaw, genre conventions must be respected)
// implies failure modes are genre-specific, and a single pass rate hides
// that a detector could be strong on marketing copy and weak on technical
// writing while still reporting a healthy-looking overall number.
// Fixtures with no "bucket" field (the original ai/human-1..5) are grouped
// under "(unbucketed)" rather than silently dropped from this view.
const byBucket = new Map();
for (const [i, entry] of manifest.fixtures.entries()) {
  const bucket = entry.bucket ?? '(unbucketed)';
  if (!byBucket.has(bucket)) byBucket.set(bucket, { passed: 0, total: 0 });
  const stat = byBucket.get(bucket);
  stat.total += 1;
  if (results[i].inBand) stat.passed += 1;
}
console.log('\nBy bucket:');
for (const [bucket, stat] of [...byBucket.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${bucket.padEnd(14)} ${stat.passed}/${stat.total}`);
}

// docs/decisions/0025's reopening condition for percentile rescaling
// (docs/decisions/0011, deferred) is 15+ fixtures per label in every bucket,
// not just a pooled total, the exact vague-condition-silently-satisfied gap
// that ADR exists to close. Printed here, every run, so growing the corpus
// toward that floor is visible in normal use instead of requiring anyone to
// re-read the ADR to check.
const PERCENTILE_RESCALING_PER_LABEL_FLOOR = 15;
let smallestPerLabelBucket = null;
let smallestPerLabelCount = Infinity;
{
  const perLabelCounts = new Map();
  for (const entry of manifest.fixtures) {
    const bucket = entry.bucket ?? '(unbucketed)';
    const key = `${bucket}/${entry.label}`;
    perLabelCounts.set(key, (perLabelCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of perLabelCounts) {
    if (count < smallestPerLabelCount) {
      smallestPerLabelCount = count;
      smallestPerLabelBucket = key;
    }
  }
}
console.log(
  `\nPercentile-rescaling reopening bar (docs/decisions/0025): ${PERCENTILE_RESCALING_PER_LABEL_FLOOR}+ fixtures per label per bucket. ` +
    `Smallest today: ${smallestPerLabelBucket} at ${smallestPerLabelCount}.`,
);

if (outFile) {
  const outPath = join(ROOT, outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  const byBucketObj = Object.fromEntries(byBucket);
  writeFileSync(
    outPath,
    JSON.stringify({ date: new Date().toISOString(), passed, total: manifest.fixtures.length, byBucket: byBucketObj, results }, null, 2),
  );
  console.log(`Wrote summary to ${outFile}`);
}

if (minPassRate !== null) {
  const rate = passed / manifest.fixtures.length;
  if (rate < minPassRate) {
    console.error(
      `\nFAIL: pass rate ${(rate * 100).toFixed(1)}% is below the required --min-pass-rate ${(minPassRate * 100).toFixed(1)}%.`,
    );
    process.exit(1);
  }
}
