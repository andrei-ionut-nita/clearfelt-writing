#!/usr/bin/env node
/**
 * Scores recorded routing-judgment runs (tests/fixtures/routing/runs/*.json)
 * against tests/fixtures/routing/manifest.json's expected command for each
 * request. Which command SKILL.md's Routing section dispatches to is a
 * model-judgment call (docs/decisions/0019 chose model-judged routing over a
 * commands/ directory on purpose), so unlike scripts/eval.mjs this script
 * cannot produce a judgment itself; it only reports on judgments a Claude
 * Code session already recorded. See tests/fixtures/routing/runs/README.md
 * for how to record one.
 *
 * Usage: node scripts/routing-eval.mjs
 *
 * With zero runs recorded, this prints the manifest and instructions, not
 * an error: an empty runs/ directory is the expected starting state, not a
 * broken one, the same convention scripts/qualitative-eval.mjs already uses.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURES_DIR = join(ROOT, 'tests', 'fixtures', 'routing');
const RUNS_DIR = join(FIXTURES_DIR, 'runs');

const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8'));

function loadRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8')));
}

function accuracy(run) {
  let correct = 0;
  let total = 0;
  const misses = [];
  for (const fixture of manifest.fixtures) {
    const judged = run.judgments[fixture.id];
    if (judged === undefined) continue;
    total += 1;
    if (judged === fixture.expected) {
      correct += 1;
    } else {
      misses.push({ id: fixture.id, request: fixture.request, expected: fixture.expected, judged });
    }
  }
  return { correct, total, misses };
}

// Simple percent-agreement between two runs' judgments on the same request
// set. Not Cohen's kappa (no chance-agreement correction): this repo stays
// dependency-free and the fixture set is small enough that a kappa's extra
// assumptions would outrun what a couple dozen fixtures can actually
// support, the same reasoning scripts/qualitative-eval.mjs already applies.
function pairwiseAgreement(runA, runB) {
  let agree = 0;
  let total = 0;
  for (const fixture of manifest.fixtures) {
    const a = runA.judgments[fixture.id];
    const b = runB.judgments[fixture.id];
    if (a === undefined || b === undefined) continue;
    total += 1;
    if (a === b) agree += 1;
  }
  return { agree, total };
}

const runs = loadRuns();

if (runs.length === 0) {
  console.log(`No runs recorded yet in ${join('tests', 'fixtures', 'routing', 'runs')}/.`);
  console.log(`${manifest.fixtures.length} requests are labeled and waiting to be judged.`);
  console.log('\nSee tests/fixtures/routing/runs/README.md for how to record a judgment run.');
  process.exit(0);
}

console.log(`${runs.length} run(s) recorded.\n`);

for (const run of runs) {
  const { correct, total, misses } = accuracy(run);
  console.log(`${run.runId} (${run.judge}, ${run.date}): ${correct}/${total} requests routed to the expected command`);
  for (const miss of misses) {
    console.log(`  MISS  ${miss.id}: "${miss.request}" expected ${miss.expected}, judged ${miss.judged}`);
  }
}

if (runs.length >= 2) {
  console.log('\nPairwise agreement between runs (the actual consistency measure, not just correctness against the manifest):');
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const { agree, total } = pairwiseAgreement(runs[i], runs[j]);
      const pct = total > 0 ? Math.round((100 * agree) / total) : 0;
      console.log(`  ${runs[i].runId} vs ${runs[j].runId}: ${agree}/${total} (${pct}%)`);
    }
  }
} else {
  console.log('\nOnly one run recorded; record a second, independent run to see pairwise agreement (the consistency measure this harness exists for, not just one pass\'s accuracy).');
}
