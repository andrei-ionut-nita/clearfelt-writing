// Regression suite for scripts/explain.mjs. Runs the script as a real
// subprocess, same convention as the other tests/*.test.mjs files, since
// it's a script (unconditional `main()` at the bottom), not a library. Pre-
// existing gap closed here: explain.mjs had zero test coverage before this
// file, invisible even in the coverage report (a file with no test never
// gets loaded, so it never even appears in the table), not just a low
// number.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGlobalSettings, acquireLock, releaseLock } from './helpers/global-settings.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXPLAIN = join(ROOT, 'scripts', 'explain.mjs');
const SHIPPED_CONFIG = join(ROOT, 'clearfelt-writing.config.md');
const FIXTURES = join(__dirname, 'fixtures');

function run(extraArgs = []) {
  const out = execFileSync(process.execPath, [EXPLAIN, ...extraArgs], { cwd: FIXTURES, encoding: 'utf8' });
  return JSON.parse(out);
}

test('--help prints usage and exits zero', () => {
  const out = execFileSync(process.execPath, [EXPLAIN, '--help'], { cwd: FIXTURES, encoding: 'utf8' });
  assert.match(out, /Usage:/);
});

test('stateMap: always reports all five state locations, in every case, regardless of what exists on disk', () => {
  const result = run();
  assert.equal(result.stateMap.length, 5);
  const locations = result.stateMap.map((entry) => entry.location);
  assert.deepEqual(locations, [
    'clearfelt-writing.config.md',
    '~/.clearfelt-writing/settings.md',
    '.clearfelt-writing/domain.md',
    '.clearfelt-writing/voice-profile.md (or .clearfelt-writing/voices/<name>.md)',
    '.clearfelt-writing/hook-state.md',
  ]);
  for (const entry of result.stateMap) {
    assert.equal(typeof entry.scope, 'string');
    assert.equal(typeof entry.holds, 'string');
    assert.equal(typeof entry.precedence, 'string');
    assert.ok(entry.scope.length > 0 && entry.holds.length > 0 && entry.precedence.length > 0);
  }
});

test('no .clearfelt-writing/ at all: reports voice/domain absent, personalCalibration is the not-computed message', () => {
  const result = run();
  assert.equal(result.voice.exists, false);
  assert.equal(result.domain.exists, false);
  assert.equal(typeof result.voice.personalCalibration, 'string');
  assert.match(result.voice.personalCalibration, /not computed/);
});

test('voice-profile.md with a Personal calibration section: reports the computed object, and config reflects the override', () => {
  // tests/fixtures/.clearfelt-writing/ is the SAME shared directory
  // tests/detect.test.mjs also writes to (both files' FIXTURES constant
  // resolve to tests/fixtures), and node --test runs separate test files
  // concurrently by default: acquireLock/releaseLock (same primitive
  // withGlobalSettings uses) prevents this test and one of detect.test.mjs's
  // from racing on the same directory. Found the same way the
  // ~/.clearfelt-writing/settings.md race was found: a coverage-driven test
  // addition here started intermittently failing.
  acquireLock();
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const profilePath = join(clearfeltWritingDir, 'voice-profile.md');
  const alreadyExisted = existsSync(clearfeltWritingDir);

  try {
    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(
      profilePath,
      [
        '# Voice profile',
        '',
        '## Personal calibration (computed)',
        '',
        '- baseline_mattr: 0.5',
        '- baseline_burstiness_cv: 0.6',
        '- baseline_paragraph_cv: 0.7',
        '- sample_word_count: 4000',
        '',
      ].join('\n'),
    );

    const result = run();
    assert.deepEqual(result.voice.personalCalibration, {
      vocabulary_diversity_baseline: 0.5,
      burstiness_baseline: 0.6,
      paragraph_variety_baseline: 0.7,
    });
    // The three overridden config keys must show the computed value and a
    // source pointing at the voice profile, not the shipped/default value
    // silently left in place, or /clearfelt-writing explain would lie about what's
    // actually driving the score.
    assert.equal(result.config.vocabulary_diversity_baseline.value, 0.5);
    assert.match(result.config.vocabulary_diversity_baseline.source, /voice-profile\.md \(computed\)/);
    assert.equal(result.config.burstiness_baseline.value, 0.6);
    assert.equal(result.config.paragraph_variety_baseline.value, 0.7);
  } finally {
    if (existsSync(profilePath)) rmSync(profilePath);
    if (!alreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    releaseLock();
  }
});

test('voice-profile.md without a calibration section: personalCalibration stays the not-computed message, not an empty object', () => {
  acquireLock();
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const profilePath = join(clearfeltWritingDir, 'voice-profile.md');
  const alreadyExisted = existsSync(clearfeltWritingDir);

  try {
    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(profilePath, ['# Voice profile', '', '## Words I want to keep using', '', '- honestly', ''].join('\n'));

    const result = run();
    assert.equal(result.voice.exists, true);
    assert.equal(typeof result.voice.personalCalibration, 'string');
    assert.match(result.voice.personalCalibration, /not computed/);
  } finally {
    if (existsSync(profilePath)) rmSync(profilePath);
    if (!alreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    releaseLock();
  }
});

test('.clearfelt-writing/domain.md with every field set: all reported, "(unset)" sentinel treated as unset, custom grade range wins over config default', () => {
  acquireLock();
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const domainPath = join(clearfeltWritingDir, 'domain.md');
  const alreadyExisted2 = existsSync(clearfeltWritingDir);

  try {
    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(
      domainPath,
      [
        '# Domain profile',
        '',
        '## Domain',
        '',
        'Developer tooling.',
        '',
        '## Technical terms exempt from flagging',
        '',
        '- robust',
        '- leverage',
        '',
        '## Target reading level',
        '',
        '- target_grade_level_min: 8',
        '- target_grade_level_max: 14',
        '',
        '## Preferred intensity',
        '',
        '- preferred_intensity: balanced',
        '',
        '## Preferred length',
        '',
        '- preferred_length: (unset)',
        '',
        '## Mode',
        '',
        '- mode: technical',
        '',
        '## Risk tier',
        '',
        '- risk_tier: sensitive',
        '',
      ].join('\n'),
    );

    const result = run();
    assert.equal(result.domain.exists, true);
    assert.equal(result.domain.riskTier, 'sensitive');
    assert.equal(result.domain.mode, 'technical');
    assert.equal(result.domain.preferredIntensity, 'balanced');
    assert.equal(result.domain.preferredLength, null, '(unset) sentinel must read as not set, not the literal string');
    assert.equal(result.domain.targetGradeLevel.min, 8);
    assert.equal(result.domain.targetGradeLevel.max, 14);
    assert.equal(result.domain.targetGradeLevel.source, '.clearfelt-writing/domain.md');
    assert.equal(result.domain.exemptTermCount, 2);
  } finally {
    if (existsSync(domainPath)) rmSync(domainPath);
    if (!alreadyExisted2 && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    releaseLock();
  }
});

test('multi-voice mode: --voice <name> resolves .clearfelt-writing/voices/<name>.md instead of voice-profile.md', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const voicesDir = join(clearfeltWritingDir, 'voices');
  const clearfeltWritingDirAlreadyExisted = existsSync(clearfeltWritingDir);

  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    try {
      mkdirSync(voicesDir, { recursive: true });
      writeFileSync(
        join(voicesDir, 'sarah.md'),
        ['# Voice profile: sarah', '', '## Words I want to keep using', '', '- honestly', '- look', ''].join('\n'),
      );

      const result = run(['--voice', 'sarah']);
      assert.equal(result.voice.mode, 'multi');
      assert.match(result.voice.profilePath, /\.clearfelt-writing[/\\]voices[/\\]sarah\.md$/);
      assert.equal(result.voice.exists, true);
      assert.equal(result.voice.keptWordsCount, 2);
    } finally {
      if (existsSync(voicesDir)) rmSync(voicesDir, { recursive: true, force: true });
      if (!clearfeltWritingDirAlreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    }
  });
});

test('a config key with no shipped clearfelt-writing.config.md row at all falls back to CONFIG_DEFAULTS, source "default"', () => {
  // config.mjs's loadConfigWithProvenance() has three layers (defaults,
  // shipped, global). The shipped file covers every default by design (that
  // is what checkConfigDrift/checkConfigDefaultsDrift in scripts/lint.mjs
  // exist to enforce), so the "default" source branch is not reachable
  // through the real shipped file as it normally exists. Reaching it
  // honestly means removing one real row and putting it back, the same
  // mutate-then-restore discipline the ~/.clearfelt-writing/settings.md regression
  // test in tests/detect.test.mjs already uses for the global-override
  // layer; this is the equivalent for the shipped layer. Narrow window,
  // synchronous, full content restored in finally even on assertion failure.
  // clearfelt-writing.config.md (the shipped config, not a per-test fixture) is read
  // by every test file's subprocess calls to loadConfig(), so mutating it
  // needs the same cross-file lock every other shared-mutable-state mutation
  // in this suite uses, or a concurrent file's subprocess spawn during this
  // window would read the temporarily-missing row too. Missed on first
  // write (found via an intermittent CI failure elsewhere in this same
  // file, not this test directly, but the same class of gap).
  acquireLock();
  const originalContent = readFileSync(SHIPPED_CONFIG, 'utf8');
  assert.match(originalContent, /\|\s*deduction_cap\s*\|/, 'expected clearfelt-writing.config.md to actually ship a deduction_cap row');

  try {
    const withoutRow = originalContent
      .split('\n')
      .filter((line) => !/^\|\s*deduction_cap\s*\|/.test(line))
      .join('\n');
    assert.notEqual(withoutRow, originalContent, 'the filter must have actually removed a line');
    writeFileSync(SHIPPED_CONFIG, withoutRow);

    const result = run();
    assert.equal(result.config.deduction_cap.source, 'default');
    assert.equal(result.config.deduction_cap.value, 65, 'CONFIG_DEFAULTS.deduction_cap, not an arbitrary fallback');
  } finally {
    writeFileSync(SHIPPED_CONFIG, originalContent);
    releaseLock();
  }
});

test('-h (short flag) behaves identically to --help', () => {
  const out = execFileSync(process.execPath, [EXPLAIN, '-h'], { cwd: FIXTURES, encoding: 'utf8' });
  assert.match(out, /Usage:/);
});

test('--voice given while voice.mode is single (default, no multi override): resolves the same voice-profile.md path as no --voice at all, mode stays "single"', () => {
  // Depends on ~/.clearfelt-writing/settings.md being in its true default state
  // (voice.mode unset), same race as every other test in this file that
  // asserts default behavior: acquireLock() prevents another test file's
  // concurrent withGlobalSettings call from setting voice.mode: multi in the
  // real file while this subprocess call is reading it. Found via an
  // intermittent CI failure on exactly this assertion.
  acquireLock();
  try {
    const withoutVoiceFlag = run();
    const withVoiceFlag = run(['--voice', 'someone']);
    assert.equal(withVoiceFlag.voice.mode, 'single');
    assert.equal(withVoiceFlag.voice.profilePath, withoutVoiceFlag.voice.profilePath);
  } finally {
    releaseLock();
  }
});

test('voice.mode: multi but no --voice given: still resolves voice-profile.md, not a voices/ path (voiceName absent short-circuits the multi branch)', () => {
  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    const result = run();
    assert.equal(result.voice.mode, 'multi');
    assert.match(result.voice.profilePath, /voice-profile\.md$/);
    assert.doesNotMatch(result.voice.profilePath, /voices[/\\]/);
  });
});

test('extends: one-hop resolution unions kept-words across base and override, inherits calibration from base when override has none', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const voicesDir = join(clearfeltWritingDir, 'voices');
  const clearfeltWritingDirAlreadyExisted = existsSync(clearfeltWritingDir);

  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    try {
      mkdirSync(voicesDir, { recursive: true });
      writeFileSync(
        join(voicesDir, 'general.md'),
        [
          '# Voice profile: general',
          '',
          '## Words I want to keep using',
          '',
          '- honestly',
          '- look',
          '',
          '## Personal calibration (computed)',
          '',
          '- baseline_mattr: 0.5',
          '- baseline_burstiness_cv: 0.6',
          '- baseline_paragraph_cv: 0.7',
          '- sample_word_count: 4000',
          '',
        ].join('\n'),
      );
      writeFileSync(
        join(voicesDir, 'linkedin.md'),
        ['extends: general', '', '# Voice profile: linkedin', '', '## Words I want to keep using', '', '- friction', ''].join(
          '\n',
        ),
      );

      const result = run(['--voice', 'linkedin']);
      assert.equal(result.voice.extends, 'general');
      assert.match(result.voice.basePath, /voices[/\\]general\.md$/);
      // Union, not override: linkedin's own word plus both of general's.
      assert.equal(result.voice.keptWordsCount, 3);
      assert.equal(result.voice.keptWordsFromOverride, 1);
      assert.equal(result.voice.keptWordsFromBase, 2);
      // No calibration section in linkedin.md itself: inherits general's.
      assert.deepEqual(result.voice.personalCalibration, {
        vocabulary_diversity_baseline: 0.5,
        burstiness_baseline: 0.6,
        paragraph_variety_baseline: 0.7,
      });
      assert.match(result.voice.personalCalibrationSource, /general\.md \(inherited via extends: general\)/);
    } finally {
      if (existsSync(voicesDir)) rmSync(voicesDir, { recursive: true, force: true });
      if (!clearfeltWritingDirAlreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    }
  });
});

test('extends: override with its own calibration wins outright, does not blend with base', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const voicesDir = join(clearfeltWritingDir, 'voices');
  const clearfeltWritingDirAlreadyExisted = existsSync(clearfeltWritingDir);

  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    try {
      mkdirSync(voicesDir, { recursive: true });
      writeFileSync(
        join(voicesDir, 'general.md'),
        [
          '# Voice profile: general',
          '',
          '## Personal calibration (computed)',
          '',
          '- baseline_mattr: 0.5',
          '- baseline_burstiness_cv: 0.6',
          '- baseline_paragraph_cv: 0.7',
          '- sample_word_count: 4000',
          '',
        ].join('\n'),
      );
      writeFileSync(
        join(voicesDir, 'x.md'),
        [
          'extends: general',
          '',
          '# Voice profile: x',
          '',
          '## Personal calibration (computed)',
          '',
          '- baseline_mattr: 0.9',
          '- baseline_burstiness_cv: 0.95',
          '- baseline_paragraph_cv: 0.4',
          '- sample_word_count: 1200',
          '',
        ].join('\n'),
      );

      const result = run(['--voice', 'x']);
      assert.deepEqual(result.voice.personalCalibration, {
        vocabulary_diversity_baseline: 0.9,
        burstiness_baseline: 0.95,
        paragraph_variety_baseline: 0.4,
      });
      assert.match(result.voice.personalCalibrationSource, /voices[/\\]x\.md$/);
    } finally {
      if (existsSync(voicesDir)) rmSync(voicesDir, { recursive: true, force: true });
      if (!clearfeltWritingDirAlreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    }
  });
});

test('extends: pointing at a file that does not exist errors plainly instead of silently resolving', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const voicesDir = join(clearfeltWritingDir, 'voices');
  const clearfeltWritingDirAlreadyExisted = existsSync(clearfeltWritingDir);

  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    try {
      mkdirSync(voicesDir, { recursive: true });
      writeFileSync(join(voicesDir, 'linkedin.md'), ['extends: nonexistent', '', '# Voice profile: linkedin', ''].join('\n'));

      assert.throws(() => run(['--voice', 'linkedin']));
    } finally {
      if (existsSync(voicesDir)) rmSync(voicesDir, { recursive: true, force: true });
      if (!clearfeltWritingDirAlreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    }
  });
});

test('extends: a two-hop chain (base itself declares extends:) is rejected, not silently walked', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const voicesDir = join(clearfeltWritingDir, 'voices');
  const clearfeltWritingDirAlreadyExisted = existsSync(clearfeltWritingDir);

  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    try {
      mkdirSync(voicesDir, { recursive: true });
      writeFileSync(join(voicesDir, 'root.md'), ['# Voice profile: root', ''].join('\n'));
      writeFileSync(join(voicesDir, 'middle.md'), ['extends: root', '', '# Voice profile: middle', ''].join('\n'));
      writeFileSync(join(voicesDir, 'leaf.md'), ['extends: middle', '', '# Voice profile: leaf', ''].join('\n'));

      let stderr = '';
      try {
        run(['--voice', 'leaf']);
        assert.fail('expected explain.mjs to exit non-zero on a two-hop extends: chain');
      } catch (err) {
        stderr = String(err.stderr || err.message || '');
      }
      assert.match(stderr, /[Cc]hained inheritance is not supported/);
    } finally {
      if (existsSync(voicesDir)) rmSync(voicesDir, { recursive: true, force: true });
      if (!clearfeltWritingDirAlreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    }
  });
});

test('no extends: line at all behaves exactly as before (zero migration for existing multi-voice users)', () => {
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const voicesDir = join(clearfeltWritingDir, 'voices');
  const clearfeltWritingDirAlreadyExisted = existsSync(clearfeltWritingDir);

  withGlobalSettings(['## Voice', '', '| Setting | Default |', '|---|---|', '| voice.mode | multi |', ''], () => {
    try {
      mkdirSync(voicesDir, { recursive: true });
      writeFileSync(
        join(voicesDir, 'sarah.md'),
        ['# Voice profile: sarah', '', '## Words I want to keep using', '', '- honestly', ''].join('\n'),
      );

      const result = run(['--voice', 'sarah']);
      assert.equal(result.voice.extends, null);
      assert.equal(result.voice.basePath, null);
      assert.equal(result.voice.keptWordsFromBase, null);
      assert.equal(result.voice.keptWordsFromOverride, null);
      assert.equal(result.voice.keptWordsCount, 1);
    } finally {
      if (existsSync(voicesDir)) rmSync(voicesDir, { recursive: true, force: true });
      if (!clearfeltWritingDirAlreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    }
  });
});

test('.clearfelt-writing/domain.md with only the "## Domain" heading present: every other field falls back to its default (field() line-absent branch, not just the "(unset)" sentinel)', () => {
  acquireLock();
  const clearfeltWritingDir = join(FIXTURES, '.clearfelt-writing');
  const domainPath = join(clearfeltWritingDir, 'domain.md');
  const alreadyExisted = existsSync(clearfeltWritingDir);

  try {
    // Captured before domain.md exists, so this is a genuine "no domain.md
    // at all" baseline to diff the minimal-domain.md result against below,
    // not accidentally computed with the file already in place.
    const withoutDomain = run();

    mkdirSync(clearfeltWritingDir, { recursive: true });
    writeFileSync(domainPath, ['# Domain profile', '', '## Domain', '', 'General audience, nothing else set.', ''].join('\n'));

    const result = run();
    assert.equal(result.domain.exists, true);
    assert.equal(result.domain.riskTier, 'standard', 'a completely absent risk_tier line must fall back to "standard"');
    assert.equal(result.domain.mode, null);
    assert.equal(result.domain.preferredIntensity, null);
    assert.equal(result.domain.preferredLength, null);
    assert.equal(result.domain.exemptTermCount, 0);
    // No target_grade_level lines at all: falls all the way back to
    // config's own resolved value/source, identical to no domain.md existing.
    assert.deepEqual(result.domain.targetGradeLevel, withoutDomain.domain.targetGradeLevel);
  } finally {
    if (existsSync(domainPath)) rmSync(domainPath);
    if (!alreadyExisted && existsSync(clearfeltWritingDir)) rmSync(clearfeltWritingDir, { recursive: true, force: true });
    releaseLock();
  }
});
