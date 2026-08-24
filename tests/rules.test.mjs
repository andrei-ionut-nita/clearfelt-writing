// Regression suite for scripts/lib/rules.mjs, exercised the same way every
// other suite here does: through the real detect.mjs subprocess against
// real fixture text, not by importing internals, so this stays honest about
// what actually ships (see tests/detect.test.mjs's own header comment for
// the reasoning, shared across this whole suite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { acquireLock, releaseLock } from './helpers/global-settings.mjs';
import {
  parseBulletLine,
  parseRuleFile,
  loadRuleDir,
  mergeLocal,
  findHits,
  loadRules,
  loadRegisterRules,
  splitBulletFields,
} from '../scripts/lib/rules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DETECT = join(ROOT, 'scripts', 'detect.mjs');
const FIXTURES = join(__dirname, 'fixtures');

function run(fixture, extraArgs = []) {
  const out = execFileSync(process.execPath, [DETECT, '--mode', 'report', join(FIXTURES, fixture), ...extraArgs], {
    cwd: FIXTURES,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function writeFixture(name, text) {
  const path = join(FIXTURES, name);
  writeFileSync(path, text);
  return path;
}

// ---- tier-2 clustering: self-match exclusion, and isolated-word suppression ----
// findHits' hasNearbyHit() walks every rule occurrence's word position to
// check for a neighbor within tier2_cluster_window words, explicitly
// skipping the occurrence's own position so a tier-2 word can't count as its
// own neighbor (every occurrence trivially "contains" itself at distance 0,
// which would make tier-2 clustering meaningless if not excluded).

test('tier-2 word appearing twice, close together: each occurrence counts as the other\'s neighbor (self-match excluded, real neighbor found)', () => {
  const path = writeFixture(
    'tier2-self-skip-test.md',
    'This quarter felt impactful for the team. Everyone said the launch was impactful too.\n',
  );
  try {
    const result = run('tier2-self-skip-test.md');
    const impactfulHits = result.hits.filter((h) => h.pattern === 'impactful');
    assert.equal(impactfulHits.length, 2, 'both occurrences must count as hits, each using the other as its cluster neighbor');
  } finally {
    rmSync(path);
  }
});

test('an isolated tier-2 word with nothing else nearby is suppressed from the score, but still visible in --mode scan', () => {
  const filler = Array(30).fill('The quarter went smoothly with steady, ordinary progress across every team.').join(' ');
  const path = writeFixture('tier2-isolated-test.md', `${filler} The rollout felt impactful. ${filler}\n`);
  try {
    const reported = run('tier2-isolated-test.md');
    assert.ok(
      !reported.hits.some((h) => h.pattern === 'impactful'),
      'an isolated tier-2 word with no nearby flagged word must not count as a scored hit',
    );

    const scanOut = execFileSync(process.execPath, [DETECT, '--mode', 'scan', join(FIXTURES, 'tier2-isolated-test.md')], {
      cwd: FIXTURES,
      encoding: 'utf8',
    });
    const scanned = JSON.parse(scanOut);
    assert.ok(
      scanned.occurrences.some((o) => o.pattern === 'impactful'),
      '--mode scan bypasses tier-suppression, so the same word must still show up there',
    );
  } finally {
    rmSync(path);
  }
});

// ---- local rule dictionary merging (rules/*.local.md) ----
// mergeLocal() is entirely untested through the normal fixture suite: no
// project (including this repo's own real rules/ directory during a normal
// test run) actually has a rules/antipatterns.local.md or
// rules/banned_words.local.md file, since they're gitignored, per-user
// files (see templates in rules/*.local.example.md). Exercising the real
// merge behavior means temporarily writing one of those two real files,
// same mutate-then-restore discipline as tests/explain.test.mjs's shipped
// clearfelt-writing.config.md test, under the same shared lock (this mutates real
// repository state every other test file's detect.mjs subprocess call also
// reads, so it needs the same cross-file exclusivity).
test('rules/antipatterns.local.md: a new category is loaded, and overrides an existing pattern by matching text case-insensitively', () => {
  const localPath = join(ROOT, 'rules', 'antipatterns.local.md');
  acquireLock();
  try {
    assert.ok(!existsSync(localPath), 'this repo should not ship a real antipatterns.local.md (gitignored, per-user)');

    // "what nobody tells you" is a real shipped structural_tells pattern,
    // severity 7 (see rules/antipatterns/structural_tells.md). Overriding
    // its severity here, plus adding a brand-new category, exercises both
    // mergeLocal code paths in one file: the existingIdx >= 0 branch (merge
    // over an existing entry) and the else branch (push a new one).
    writeFileSync(
      localPath,
      [
        '## structural_tells',
        '',
        '- what nobody tells you | severity: 2',
        '',
        '## my_custom_category',
        '',
        '- zzz totally custom local phrase | severity: 9',
        '',
      ].join('\n'),
    );

    const path = writeFixture(
      'local-rules-merge-test.md',
      'Here is what nobody tells you about this. A zzz totally custom local phrase shows up here too.\n',
    );
    try {
      const result = run('local-rules-merge-test.md');
      const overridden = result.hits.find((h) => h.pattern === 'what nobody tells you');
      assert.ok(overridden, 'the overridden pattern must still match');
      assert.equal(overridden.severity, 2, 'the local file\'s severity must win over the shipped severity of 7');

      const custom = result.hits.find((h) => h.pattern === 'zzz totally custom local phrase');
      assert.ok(custom, 'a genuinely new local-only pattern must be picked up');
      assert.equal(custom.category, 'my_custom_category');
      assert.equal(custom.severity, 9);
    } finally {
      rmSync(path);
    }
  } finally {
    if (existsSync(localPath)) rmSync(localPath);
    releaseLock();
  }
});

test('rules/banned_words.local.md merges independently of rules/antipatterns.local.md', () => {
  const localPath = join(ROOT, 'rules', 'banned_words.local.md');
  acquireLock();
  try {
    assert.ok(!existsSync(localPath), 'this repo should not ship a real banned_words.local.md (gitignored, per-user)');
    writeFileSync(localPath, ['## my_word_category', '', '- zzz another custom local word | severity: 4', ''].join('\n'));

    const path = writeFixture('local-banned-words-merge-test.md', 'This has a zzz another custom local word in it.\n');
    try {
      const result = run('local-banned-words-merge-test.md');
      const custom = result.hits.find((h) => h.pattern === 'zzz another custom local word');
      assert.ok(custom);
      assert.equal(custom.category, 'my_word_category');
    } finally {
      rmSync(path);
    }
  } finally {
    if (existsSync(localPath)) rmSync(localPath);
    releaseLock();
  }
});

// ---- direct-import unit tests ----
// Every test above goes through the real detect.mjs subprocess against this
// repo's own shipped rules/ directory, which always exists and where every
// bullet always specifies an explicit severity/tier/source (checked with
// `grep -L "source:" rules/*/*.md`, no hits). That leaves several defensive
// branches (a missing rule directory, a bullet line missing an optional
// field, a config missing an optional key) genuinely unreachable through the
// fixture suite, not because they're dead, but because this repo's own data
// happens to always populate them. rules.mjs's parsing/merging functions are
// exported specifically so a reusable-library-style function like this can
// be unit-tested directly instead of only through one particular caller.

test('parseBulletLine: a non-bullet line (blank, heading, prose) returns null', () => {
  assert.equal(parseBulletLine(''), null);
  assert.equal(parseBulletLine('## Some heading'), null);
  assert.equal(parseBulletLine('Just a line of prose, no leading dash.'), null);
});

// ---- splitBulletFields: | escaping (CONTRIBUTING.md's documented footgun) ----

test('splitBulletFields: an unescaped | always splits, even with none, one, or several fields', () => {
  assert.deepEqual(splitBulletFields('just one field'), ['just one field']);
  assert.deepEqual(splitBulletFields('a | b'), ['a ', ' b']);
  assert.deepEqual(splitBulletFields('a | b | c | d'), ['a ', ' b ', ' c ', ' d']);
});

test('splitBulletFields: \\| is a literal pipe, unescaped into the field, not a field separator', () => {
  // splitBulletFields doesn't trim (that's parseBulletLine's job on top of
  // it), so the space before the real separator survives into the field.
  assert.deepEqual(splitBulletFields('a\\|b | c'), ['a|b ', ' c']);
  assert.deepEqual(splitBulletFields('(?:foo\\|bar\\|baz) | regex: true'), ['(?:foo|bar|baz) ', ' regex: true']);
});

test('splitBulletFields: \\\\ is a literal backslash, and a real separator right after it still splits', () => {
  assert.deepEqual(splitBulletFields('a\\\\|b'), ['a\\', 'b']);
});

test('splitBulletFields: every other backslash sequence (\\w, \\s, \\b, \\d) passes through completely unchanged', () => {
  assert.deepEqual(splitBulletFields('diligenc\\w*\\s+it\\b'), ['diligenc\\w*\\s+it\\b']);
});

test('parseBulletLine: a regex pattern with an escaped internal alternation parses as one field with a real |, not several corrupted fields', () => {
  const parsed = parseBulletLine('- "diligenc\\w*\\s+(?:it\\|this\\|that\\|them)\\b" | regex: true | severity: 4 | source: clearfelt-writing-heuristic');
  assert.equal(parsed.pattern, 'diligenc\\w*\\s+(?:it|this|that|them)\\b');
  assert.equal(parsed.regex, 'true');
  assert.equal(parsed.severity, 4);
  assert.equal(parsed.source, 'clearfelt-writing-heuristic');
  // The whole point: the reconstructed pattern must itself be a valid regex.
  assert.doesNotThrow(() => new RegExp(parsed.pattern));
});

test('parseBulletLine: a FORGOTTEN escape (bare | inside the pattern) corrupts the parse in a detectable way, a literal quote survives into pattern', () => {
  const parsed = parseBulletLine('- "diligenc\\w*\\s+(?:it|this|that|them)\\b" | regex: true | severity: 4 | source: clearfelt-writing-heuristic');
  // Documenting the failure mode scripts/lint.mjs's checkRuleBulletShape()
  // now catches (a stray double-quote in the parsed pattern), not asserting
  // this is desirable: this is exactly the "silent misparse" CONTRIBUTING.md
  // now warns against, still possible if a contributor forgets \|.
  assert.ok(parsed.pattern.includes('"'), 'a forgotten escape should leave a tell-tale stray quote in the parsed pattern');
});

test('parseRuleFile: a bullet with no explicit severity/tier gets the 5/1 defaults; one with explicit values keeps them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clearfelt-writing-rules-unit-test-'));
  const filePath = join(dir, 'test_category.md');
  try {
    writeFileSync(filePath, ['- bare pattern with no fields', '- explicit pattern | severity: 9 | tier: 2', ''].join('\n'));
    const entries = parseRuleFile(filePath, 'test_category');
    const bare = entries.find((e) => e.pattern === 'bare pattern with no fields');
    assert.equal(bare.severity, 5);
    assert.equal(bare.tier, 1);
    const explicit = entries.find((e) => e.pattern === 'explicit pattern');
    assert.equal(explicit.severity, 9);
    assert.equal(explicit.tier, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadRuleDir: a directory that does not exist returns an empty array, not a throw', () => {
  assert.deepEqual(loadRuleDir(join(tmpdir(), 'clearfelt-writing-rules-dir-does-not-exist')), []);
});

test('mergeLocal: a bullet before any ## heading falls back to the "local" category; explicit severity/tier still win over the 5/1 default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clearfelt-writing-rules-unit-test-'));
  const localPath = join(dir, 'local.md');
  try {
    writeFileSync(localPath, ['- no heading above this one', '', '## real_category', '', '- with a heading | severity: 8', ''].join('\n'));
    const merged = mergeLocal([], localPath);
    const noHeading = merged.find((e) => e.pattern === 'no heading above this one');
    assert.equal(noHeading.category, 'local');
    assert.equal(noHeading.severity, 5);
    assert.equal(noHeading.tier, 1);
    const withHeading = merged.find((e) => e.pattern === 'with a heading');
    assert.equal(withHeading.category, 'real_category');
    assert.equal(withHeading.severity, 8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadRules: a local-only entry with no source field is not filtered out (unresolved-* check tolerates an absent source)', () => {
  const localPath = join(ROOT, 'rules', 'antipatterns.local.md');
  acquireLock();
  try {
    assert.ok(!existsSync(localPath), 'this repo should not ship a real antipatterns.local.md (gitignored, per-user)');
    writeFileSync(localPath, ['## no_source_category', '', '- zzz pattern with no source field at all', ''].join('\n'));
    const { all } = loadRules({});
    const entry = all.find((e) => e.pattern === 'zzz pattern with no source field at all');
    assert.ok(entry, 'an entry with no source field must still be included when rules.include_unresolved is off');
  } finally {
    if (existsSync(localPath)) rmSync(localPath);
    releaseLock();
  }
});

test('findHits: a config with no tier2_cluster_window key falls back to the default of 40', () => {
  const rules = [{ pattern: 'impactful', category: 'test', severity: 5, tier: 2, source: 'test' }];
  const text =
    'Something impactful happened. Thirty words later, something else impactful happened too, close enough to cluster under the default window.';
  const overrides = new Set();
  const withDefault = findHits(text, rules, {}, overrides);
  assert.ok(withDefault.some((h) => h.pattern === 'impactful'), 'the default 40-word window must still cluster these two occurrences');
});

// ---- loadRegisterRules (docs/decisions/0024) ----

test('loadRegisterRules: returns the accusatory and hedging lists as separate arrays, not merged into one', () => {
  const { accusatory, hedging } = loadRegisterRules();
  assert.ok(accusatory.length > 0, 'rules/register/accusatory.md must load at least one entry');
  assert.ok(hedging.length > 0, 'rules/register/hedging.md must load at least one entry');
  assert.ok(accusatory.every((r) => r.category === 'accusatory'));
  assert.ok(hedging.every((r) => r.category === 'hedging'));
  assert.ok(
    accusatory.every((r) => !hedging.some((h) => h.pattern === r.pattern)),
    'the two lists should not share a pattern; they flag opposite directions of mismatch',
  );
});

test('loadRegisterRules: entries are never returned by loadRules (register hits must stay out of the scored set)', () => {
  const { all } = loadRules({});
  const { accusatory, hedging } = loadRegisterRules();
  for (const r of [...accusatory, ...hedging]) {
    assert.ok(
      !all.some((e) => e.category === r.category && e.pattern === r.pattern),
      `register entry "${r.pattern}" (${r.category}) must not appear in loadRules()'s scored "all" set`,
    );
  }
});

// ---- rules/antipatterns/corporate_neologisms.md ----

test('corporate_neologisms: "diligences it" (verbed noun + pronoun object) is flagged, but "due diligence document" and "diligence a term sheet" are not', () => {
  const path = writeFixture(
    'corporate-neologism-test.md',
    "Nobody diligences it the way they'd diligence a term sheet. This is a due diligence document.\n",
  );
  try {
    const result = run('corporate-neologism-test.md');
    const hits = result.hits.filter((h) => h.category === 'corporate_neologisms');
    assert.equal(hits.length, 1, 'only the pronoun-object form should be flagged');
    assert.match(hits[0].snippet, /diligences it/);
  } finally {
    rmSync(path);
  }
});

// The rule file collapsed four near-duplicate bullets (one per pronoun) into
// one regex with an escaped internal alternation (\|) once splitBulletFields
// (below) made that possible; this locks in that all four pronoun forms
// still fire from the single merged bullet, not just the one the test above
// happens to cover.
test('corporate_neologisms: all four pronoun forms (it/this/that/them) fire from the single merged regex bullet', () => {
  const path = writeFixture(
    'corporate-neologism-pronouns-test.md',
    'They diligence it. She diligences this. We diligence that. I diligence them.\n',
  );
  try {
    const result = run('corporate-neologism-pronouns-test.md');
    const hits = result.hits.filter((h) => h.category === 'corporate_neologisms');
    assert.equal(hits.length, 4, 'each of the four pronoun forms should be its own hit');
  } finally {
    rmSync(path);
  }
});
