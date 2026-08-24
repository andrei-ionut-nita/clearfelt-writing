// Regression suite for scripts/check.mjs. Runs the script as a real
// subprocess against fixtures under tests/fixtures/check/, same convention
// as tests/detect.test.mjs. Uses only node:test/node:assert, no new
// dependency, per CLAUDE.md's dependency-free rule.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { withGlobalSettings } from './helpers/global-settings.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHECK = join(ROOT, 'scripts', 'check.mjs');
const FIXTURES = join(__dirname, 'fixtures', 'check');

// Every hard-fail test below runs check.mjs with cwd: FIXTURES, and
// check.mjs's own hard-fail path writes a real timestamped file into
// FIXTURES/reports/ each time (see check.mjs's "Opt-in, nice-to-have"
// comment). Gitignored, so it never reaches a commit, but with no cleanup
// it grows by one file per hard-fail test on every `node --test` run;
// across repeated dev-session runs this once reached 2,525 stray files.
// Cleaning up once after this file's own tests finish keeps local repo
// scans (find, grep) from wading through accumulated scratch output.
after(() => {
  rmSync(join(FIXTURES, 'reports'), { recursive: true, force: true });
});

function run(before, after, extraArgs = []) {
  try {
    const out = execFileSync(
      process.execPath,
      [CHECK, '--before', join(FIXTURES, before), '--after', join(FIXTURES, after), ...extraArgs],
      { cwd: FIXTURES, encoding: 'utf8' },
    );
    return { status: 0, result: JSON.parse(out) };
  } catch (err) {
    // check.mjs exits 1 on verdict "fail"; the JSON report is still on stdout.
    return { status: err.status, result: JSON.parse(err.stdout) };
  }
}

test('locked-span mismatch: hard-fails, exit code 1', () => {
  const { status, result } = run('locked-span-before.md', 'locked-span-mismatch-after.md');
  assert.equal(status, 1);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.lockedSpans.count, 1);
  assert.equal(result.lockedSpans.mismatches.length, 1);
  assert.equal(result.lockedSpans.mismatches[0].reason, 'locked-span content changed');
});

test('locked-span count mismatch (a span removed entirely): hard-fails, distinct reason from a content change', () => {
  const { status, result } = run('locked-span-before.md', 'locked-span-count-mismatch-after.md');
  assert.equal(status, 1);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.lockedSpans.mismatches.length, 1);
  assert.equal(result.lockedSpans.mismatches[0].index, null);
  assert.match(result.lockedSpans.mismatches[0].reason, /count changed: 1 before, 0 after/);
});

test('clean rewrite with no locked spans and no dropped/added facts: passes', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md');
  assert.equal(status, 0);
  assert.equal(result.verdict, 'pass');
  assert.deepEqual(result.lockedSpans, { count: 0, mismatches: [] });
  assert.deepEqual(result.fingerprint.dropped, []);
  assert.deepEqual(result.fingerprint.added, []);
});

test('dropped number: warns by default, exit code 0', () => {
  const { status, result } = run('dropped-number-before.md', 'dropped-number-after.md');
  assert.equal(status, 0);
  assert.equal(result.verdict, 'warn');
  const droppedNumbers = result.fingerprint.dropped.filter((d) => d.type === 'number');
  assert.equal(droppedNumbers.length, 1);
  assert.equal(droppedNumbers[0].value, '42');
});

test('identical text: no locked spans, no fingerprint diff, passes', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-before.md');
  assert.equal(status, 0);
  assert.equal(result.verdict, 'pass');
});

test('no constraints given: constraints field is null, verdict unaffected', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md');
  assert.equal(status, 0);
  assert.equal(result.constraints, null);
});

test('--max-chars: hard-fails when the candidate exceeds it, regardless of hard_fail_on_constraint_violation', () => {
  // "We plan to use this straightforward solution going forward." is well
  // over 30 characters; max_chars must always hard-fail, unlike
  // must_contain/must_not_contain which are toggleable.
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--max-chars', '30']);
  assert.equal(status, 1);
  assert.equal(result.verdict, 'fail');
  const maxChars = result.constraints.find((c) => c.rule === 'max_chars');
  assert.equal(maxChars.pass, false);
  assert.equal(maxChars.limit, 30);
});

test('--max-chars: passes when the candidate fits', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--max-chars', '200']);
  assert.equal(status, 0);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.constraints.find((c) => c.rule === 'max_chars').pass, true);
});

test('--must-contain: fails on a missing literal, passes on a present one', () => {
  const missing = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--must-contain', 'nonexistent-phrase']);
  assert.equal(missing.status, 1);
  assert.equal(missing.result.verdict, 'fail');
  assert.equal(missing.result.constraints.find((c) => c.rule === 'must_contain').pass, false);

  const present = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--must-contain', 'straightforward']);
  assert.equal(present.status, 0);
  assert.equal(present.result.verdict, 'pass');
});

test('--must-not-contain: fails when the forbidden text is present', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--must-not-contain', 'straightforward']);
  assert.equal(status, 1);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.constraints.find((c) => c.rule === 'must_not_contain').pass, false);
});

test('--must-not-contain: supports /regex/ syntax, not just literal substrings', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--must-not-contain', '/^We plan/']);
  assert.equal(status, 1);
  assert.equal(result.verdict, 'fail');
});

test('check.hard_fail_on_constraint_violation: false demotes a must_contain miss to warn, not fail', () => {
  withGlobalSettings(
    ['## Preservation checking', '', '| Setting | Default |', '|---|---|', '| check.hard_fail_on_constraint_violation | false |', ''],
    () => {
      const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--must-contain', 'nonexistent-phrase']);
      assert.equal(status, 0);
      assert.equal(result.verdict, 'warn');
    },
  );
});

test('named constraint set (.clearfelt-writing/constraints/<name>.md) loads and applies, inline flags extend it', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing', 'constraints');
  const constraintPath = join(clearfeltWritingDir, 'test-set.md');
  const alreadyExisted = existsSync(join(FIXTURES, '.clearfelt-writing'));

  try {
    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(
      constraintPath,
      ['# Constraints: test-set', '', '## Limits', '', '| Setting | Value |', '|---|---|', '| max_chars | 30 |', '', '## Must contain', '', '## Must not contain', ''].join(
        '\n',
      ),
    );

    // Named set alone: max_chars: 30 fails against the fixture.
    const namedOnly = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--constraints', 'test-set']);
    assert.equal(namedOnly.status, 1);
    assert.equal(namedOnly.result.constraints.find((c) => c.rule === 'max_chars').limit, 30);

    // Inline --max-chars overrides the named set's own value.
    const overridden = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--constraints', 'test-set', '--max-chars', '200']);
    assert.equal(overridden.status, 0);
    assert.equal(overridden.result.constraints.find((c) => c.rule === 'max_chars').limit, 200);

    // Inline --must-contain extends (does not replace) the named set.
    const extended = run('clean-rewrite-before.md', 'clean-rewrite-after.md', [
      '--constraints',
      'test-set',
      '--max-chars',
      '200',
      '--must-contain',
      'straightforward',
    ]);
    assert.equal(extended.status, 0);
    assert.ok(extended.result.constraints.some((c) => c.rule === 'must_contain'));
  } finally {
    if (existsSync(constraintPath)) rmSync(constraintPath);
    if (!alreadyExisted && existsSync(join(FIXTURES, '.clearfelt-writing'))) rmSync(join(FIXTURES, '.clearfelt-writing'), { recursive: true, force: true });
  }
});

test('named constraint set: max_words row, and Must contain/Must not contain bullet lists, all parse and apply', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing', 'constraints');
  const constraintPath = join(clearfeltWritingDir, 'full-set.md');
  const alreadyExisted = existsSync(join(FIXTURES, '.clearfelt-writing'));

  try {
    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(
      constraintPath,
      [
        '# Constraints: full-set',
        '',
        '## Limits',
        '',
        '| Setting | Value |',
        '|---|---|',
        '| max_words | 5 |',
        '',
        '## Must contain',
        '',
        '- straightforward',
        '',
        '## Must not contain',
        '',
        '- nonexistent-phrase-that-is-absent',
        '',
      ].join('\n'),
    );

    const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--constraints', 'full-set']);
    assert.equal(status, 1, 'max_words: 5 must fail against the 9-word fixture text');
    assert.equal(result.constraints.find((c) => c.rule === 'max_words').limit, 5);
    assert.equal(result.constraints.find((c) => c.rule === 'must_contain').pass, true);
    assert.equal(result.constraints.find((c) => c.rule === 'must_not_contain').pass, true);
  } finally {
    if (existsSync(constraintPath)) rmSync(constraintPath);
    if (!alreadyExisted && existsSync(join(FIXTURES, '.clearfelt-writing'))) rmSync(join(FIXTURES, '.clearfelt-writing'), { recursive: true, force: true });
  }
});

test('named constraint set: a file with no "Must not contain" heading at all reports an empty list, not a crash', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing', 'constraints');
  const constraintPath = join(clearfeltWritingDir, 'no-heading-set.md');
  const alreadyExisted = existsSync(join(FIXTURES, '.clearfelt-writing'));

  try {
    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(constraintPath, ['# Constraints: no-heading-set', '', '## Limits', '', '| Setting | Value |', '|---|---|', '| max_chars | 30 |', ''].join('\n'));

    const { result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--constraints', 'no-heading-set']);
    assert.equal(result.constraints.find((c) => c.rule === 'must_not_contain'), undefined, 'no heading means no must_not_contain constraint was configured at all');
  } finally {
    if (existsSync(constraintPath)) rmSync(constraintPath);
    if (!alreadyExisted && existsSync(join(FIXTURES, '.clearfelt-writing'))) rmSync(join(FIXTURES, '.clearfelt-writing'), { recursive: true, force: true });
  }
});

test('--max-words: hard-fails over the limit, passes under it', () => {
  // "We plan to use this straightforward solution going forward." is 9 words.
  const over = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--max-words', '5']);
  assert.equal(over.status, 1);
  assert.equal(over.result.verdict, 'fail');
  const maxWords = over.result.constraints.find((c) => c.rule === 'max_words');
  assert.equal(maxWords.pass, false);
  assert.equal(maxWords.actual, 9);

  const under = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--max-words', '20']);
  assert.equal(under.status, 0);
  assert.equal(under.result.constraints.find((c) => c.rule === 'max_words').pass, true);
});

test('--max-words: candidate text with zero word characters (symbols only) counts as 0 words, not a crash', () => {
  const { status, result } = run('clean-rewrite-before.md', 'zero-words-after.md', ['--max-words', '5']);
  assert.equal(status, 0);
  assert.equal(result.constraints.find((c) => c.rule === 'max_words').actual, 0);
});

test('an invalid /regex/ pattern fails closed (never silently treated as passing or as a literal)', () => {
  const { status, result } = run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--must-contain', '/[/']);
  assert.equal(status, 1);
  assert.equal(result.verdict, 'fail');
  const mustContain = result.constraints.find((c) => c.rule === 'must_contain');
  assert.equal(mustContain.pass, false);
  assert.ok(mustContain.error, 'an invalid regex must surface its parse error, not fail silently with no explanation');
});

test('repeated --must-contain flags all apply, not just the last one', () => {
  const allPresent = run('clean-rewrite-before.md', 'clean-rewrite-after.md', [
    '--must-contain',
    'straightforward',
    '--must-contain',
    'solution',
  ]);
  assert.equal(allPresent.status, 0);
  assert.equal(allPresent.result.constraints.filter((c) => c.rule === 'must_contain').length, 2);
  assert.ok(allPresent.result.constraints.filter((c) => c.rule === 'must_contain').every((c) => c.pass));

  const oneMissing = run('clean-rewrite-before.md', 'clean-rewrite-after.md', [
    '--must-contain',
    'straightforward',
    '--must-contain',
    'nonexistent-phrase',
  ]);
  assert.equal(oneMissing.status, 1, 'one failing must-contain among several must still fail the whole run');
  assert.equal(oneMissing.result.verdict, 'fail');
});

test('unknown --constraints name exits with a clear error, not a silent no-op', () => {
  // check.mjs prints its error to stderr and exits before printing any JSON
  // to stdout, so run()'s own JSON.parse(err.stdout) fails too; either way,
  // this must throw, not silently return a passing report.
  assert.throws(() => run('clean-rewrite-before.md', 'clean-rewrite-after.md', ['--constraints', 'does-not-exist']));
});

test('--help prints usage (to stderr, same as every other usage message here) and exits zero', () => {
  const { status, stderr } = spawnSync(process.execPath, [CHECK, '--help'], { cwd: FIXTURES, encoding: 'utf8' });
  assert.equal(status, 0);
  assert.match(stderr, /Usage:/);
});

test('missing --after (or --before) prints usage and exits non-zero', () => {
  assert.throws(() => execFileSync(process.execPath, [CHECK, '--before', join(FIXTURES, 'clean-rewrite-before.md')], { cwd: FIXTURES }));
});

test('a --before/--after path that does not exist exits non-zero with a clear error', () => {
  assert.throws(() =>
    execFileSync(process.execPath, [CHECK, '--before', 'does-not-exist.md', '--after', 'clean-rewrite-after.md'], {
      cwd: FIXTURES,
    }),
  );
});

test('a --before/--after path outside the project directory is refused', () => {
  const outsideFile = join(tmpdir(), 'clearfelt-writing-check-outside-test.md');
  writeFileSync(outsideFile, 'text');
  try {
    assert.throws(() =>
      execFileSync(process.execPath, [CHECK, '--before', outsideFile, '--after', join(FIXTURES, 'clean-rewrite-after.md')], {
        cwd: FIXTURES,
      }),
    );
  } finally {
    if (existsSync(outsideFile)) rmSync(outsideFile);
  }
});

test('best-effort reports/ write on a hard fail never masks the real verdict, even if the write itself fails', () => {
  // Force mkdirSync('reports', {recursive:true}) to throw by putting a plain
  // FILE at that exact path first: creating a directory where a same-named
  // file already exists is a real, reachable failure mode (a stray file
  // checked in by mistake, a prior crashed run), not a contrived one, and it
  // exercises the catch-and-continue block without needing to mock fs.
  const reportsPath = join(FIXTURES, 'reports');
  const reportsAlreadyExisted = existsSync(reportsPath);
  const backupPath = join(FIXTURES, 'reports.test-backup');
  try {
    if (reportsAlreadyExisted) {
      execFileSync('mv', [reportsPath, backupPath]);
    }
    writeFileSync(reportsPath, 'not a directory');

    const { status, result } = run('locked-span-before.md', 'locked-span-mismatch-after.md');
    assert.equal(status, 1, 'the real verdict must still be reported even though the best-effort log write failed');
    assert.equal(result.verdict, 'fail');
  } finally {
    if (existsSync(reportsPath)) rmSync(reportsPath, { force: true });
    if (reportsAlreadyExisted) execFileSync('mv', [backupPath, reportsPath]);
  }
});

// ---- remaining branches: hard_fail toggles actually firing, warn-path
// combinations, and the fingerprint extractors' own less-common shapes ----

test('check.hard_fail_on_dropped_fact: true actually blocks (fail), not just warns, on a real dropped number', () => {
  withGlobalSettings(['## Preservation checking', '', '| Setting | Default |', '|---|---|', '| check.hard_fail_on_dropped_fact | true |', ''], () => {
    const { status, result } = run('dropped-number-before.md', 'dropped-number-after.md');
    assert.equal(status, 1);
    assert.equal(result.verdict, 'fail');
  });
});

test('check.hard_fail_on_added_fact: true actually blocks (fail) on a fact present in "after" but not "before"', () => {
  const beforePath = join(FIXTURES, 'added-fact-before.md');
  const afterPath = join(FIXTURES, 'added-fact-after.md');
  writeFileSync(beforePath, 'The team shipped the feature this quarter.\n');
  writeFileSync(afterPath, 'The team shipped the feature on 2026-03-14, ahead of schedule.\n');
  try {
    withGlobalSettings(['## Preservation checking', '', '| Setting | Default |', '|---|---|', '| check.hard_fail_on_added_fact | true |', ''], () => {
      const { status, result } = run('added-fact-before.md', 'added-fact-after.md');
      assert.equal(status, 1);
      assert.equal(result.verdict, 'fail');
      assert.ok(result.fingerprint.added.some((f) => f.type === 'date'));
    });
  } finally {
    rmSync(beforePath);
    rmSync(afterPath);
  }
});

test('check.hard_fail_on_locked_span_mismatch: false demotes a locked-span mismatch to warn instead of fail', () => {
  withGlobalSettings(
    ['## Preservation checking', '', '| Setting | Default |', '|---|---|', '| check.hard_fail_on_locked_span_mismatch | false |', ''],
    () => {
      const { status, result } = run('locked-span-before.md', 'locked-span-mismatch-after.md');
      assert.equal(status, 0);
      assert.equal(result.verdict, 'warn');
    },
  );
});

test('extractLockedSpans: an unterminated lock marker (no closing comment) is dropped, not treated as an open-ended span', () => {
  const beforePath = join(FIXTURES, 'unterminated-lock-before.md');
  const afterPath = join(FIXTURES, 'unterminated-lock-after.md');
  writeFileSync(beforePath, 'Some intro text.\n\n<!-- clearfelt-writing-lock -->\nThis never gets closed.\n');
  writeFileSync(afterPath, 'Some intro text.\n\n<!-- clearfelt-writing-lock -->\nThis never gets closed, and changed too.\n');
  try {
    const { status, result } = run('unterminated-lock-before.md', 'unterminated-lock-after.md');
    assert.equal(result.lockedSpans.count, 0, 'an unterminated marker pair must not count as a real locked span');
    assert.equal(status, 0);
    assert.equal(result.verdict, 'pass');
  } finally {
    rmSync(beforePath);
    rmSync(afterPath);
  }
});

test('extractQuotes: straight quotes, curly quotes, and blockquote lines are all extracted', () => {
  const beforePath = join(FIXTURES, 'quote-shapes-before.md');
  const afterPath = join(FIXTURES, 'quote-shapes-after.md');
  writeFileSync(
    beforePath,
    [
      'She said “this changes everything” at the meeting.',
      '',
      'He replied "we should ship it" right away.',
      '',
      '> A blockquoted line worth keeping exactly.',
      '',
    ].join('\n'),
  );
  // Drop the straight quote, curly quote, and blockquote line in "after" so they show up in fingerprint.dropped.
  writeFileSync(afterPath, 'The meeting happened, nothing else to report.\n');
  try {
    const { result } = run('quote-shapes-before.md', 'quote-shapes-after.md');
    const droppedQuotes = result.fingerprint.dropped.filter((f) => f.type === 'quote').map((f) => f.value);
    assert.ok(droppedQuotes.includes('we should ship it'), 'straight-quote extraction must have caught this');
    assert.ok(droppedQuotes.includes('this changes everything'), 'curly-quote extraction must have caught this');
    assert.ok(droppedQuotes.includes('A blockquoted line worth keeping exactly.'), 'blockquote extraction must have caught this');
  } finally {
    rmSync(beforePath);
    rmSync(afterPath);
  }
});

test('extractDates: ISO, month-name, and contextual-year forms are all detected; extractNumbers catches a percentage too', () => {
  const beforePath = join(FIXTURES, 'date-number-shapes-before.md');
  const afterPath = join(FIXTURES, 'date-number-shapes-after.md');
  writeFileSync(
    beforePath,
    'Launched on 2026-03-14. Revenue grew since 2024 after the March 3rd announcement, up 42% year over year.\n',
  );
  writeFileSync(afterPath, 'Nothing about dates or growth numbers survived into this rewrite at all.\n');
  try {
    const { result } = run('date-number-shapes-before.md', 'date-number-shapes-after.md');
    const droppedDates = result.fingerprint.dropped.filter((f) => f.type === 'date').map((f) => f.value);
    assert.ok(droppedDates.includes('2026-03-14'), 'ISO date form');
    assert.ok(droppedDates.includes('March 3rd'), 'month-name date form');
    assert.ok(droppedDates.includes('2024'), 'contextual bare year form ("since 2024")');
    const droppedNumbers = result.fingerprint.dropped.filter((f) => f.type === 'number').map((f) => f.value);
    // The trailing \b after the optional %? doesn't hold across "% " (both
    // sides non-word characters), so the percent sign itself isn't part of
    // the captured value, only the digits are; this asserts the actual
    // extractor behavior, not an idealized one.
    assert.ok(droppedNumbers.includes('42'), 'the number preceding a percent sign must still be caught');
  } finally {
    rmSync(beforePath);
    rmSync(afterPath);
  }
});

test('extractProperNouns: a word capitalized only at sentence-start is excluded; the same word capitalized mid-sentence elsewhere is included', () => {
  const beforePath = join(FIXTURES, 'proper-noun-before.md');
  const afterPath = join(FIXTURES, 'proper-noun-after.md');
  // "Reports" opens a sentence (would be filtered as ordinary capitalization)
  // AND appears capitalized mid-sentence elsewhere (the cross-check that
  // promotes it back to a real candidate). "Also" only ever appears
  // sentence-initial, so it must stay excluded.
  writeFileSync(
    beforePath,
    'Reports came in late this week. The team reviewed every Reports document before the deadline. Also, nothing else changed.\n',
  );
  writeFileSync(afterPath, 'Nothing about reports or timing changed this week at all.\n');
  try {
    const { result } = run('proper-noun-before.md', 'proper-noun-after.md');
    const droppedProperNouns = result.fingerprint.dropped.filter((f) => f.type === 'properNoun').map((f) => f.value);
    assert.ok(droppedProperNouns.includes('Reports'), 'a word capitalized both sentence-initially and mid-sentence must count');
    assert.ok(!droppedProperNouns.includes('Also'), 'a word capitalized only sentence-initially must not count as a proper noun');
  } finally {
    rmSync(beforePath);
    rmSync(afterPath);
  }
});
