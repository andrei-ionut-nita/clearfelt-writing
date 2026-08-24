#!/usr/bin/env node
/**
 * Repo-consistency checks that catch the exact class of bug this project has
 * shipped before: config rows nothing reads (the 0.2.0 category-weight bug,
 * the removed dead Hooks section), a rule with no resolvable source, an
 * em-dash slipping into the project that removes them from other people's
 * writing. Zero dependencies, Node stdlib only, same rule as detect.mjs.
 *
 * Usage: node scripts/lint.mjs
 * Exit code 0 if every check passes, 1 if any check fails.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseRuleFile } from './lib/rules.mjs';
import { CONFIG_SECTIONS, CONFIG_DEFAULTS } from './lib/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const failures = [];
const warnings = [];

function fail(check, message) {
  failures.push(`[${check}] ${message}`);
}
function warn(check, message) {
  warnings.push(`[${check}] ${message}`);
}

function walk(dir, exts) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, exts));
    } else if (exts.has(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

// ---- check: em-dash prohibition ----
// Built via fromCharCode (U+2014) rather than typed as a literal character,
// so this check's own source file has nothing for the check to trip on.
const EM_DASH = String.fromCharCode(0x2014);
// CLAUDE.md and docs/DEVELOP.md each show the grep command used to search
// for an em-dash (quoting the character as the search target), the one
// legitimate reason a line may contain it. Matched by content, not a
// hardcoded file:line pair, since line numbers shift every time either file
// is edited above that point and a stale pair would either miss a real
// violation or false-fail on the example itself, exactly the kind of drift
// this whole script exists to catch elsewhere.
const GREP_EXAMPLE = `grep -rn "${EM_DASH}"`;

function checkEmDash() {
  const files = walk(ROOT, new Set(['.md', '.mjs', '.xml', '.json']));
  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (line.includes(EM_DASH) && !line.includes(GREP_EXAMPLE)) {
        fail('em-dash', `${rel}:${idx + 1} contains an em-dash character`);
      }
    });
  }
}

// ---- check: SKILL.md frontmatter ----
function checkFrontmatter() {
  const text = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    fail('frontmatter', 'SKILL.md has no --- frontmatter block');
    return;
  }
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  if (!fields.name) fail('frontmatter', 'SKILL.md frontmatter is missing required field: name');
  if (!fields.description) fail('frontmatter', 'SKILL.md frontmatter is missing required field: description');
  if (fields.description && fields.description.length > 1024) {
    fail('frontmatter', `SKILL.md description is ${fields.description.length} chars, over the 1024 limit`);
  }
  if (fields.name && /[<>]/.test(fields.name)) fail('frontmatter', 'SKILL.md name contains XML-tag-like characters');
  const standardFields = new Set(['name', 'description', 'license']);
  for (const field of Object.keys(fields)) {
    if (!standardFields.has(field)) {
      warn('frontmatter', `SKILL.md has non-standard frontmatter field "${field}" (only name/description/license are in Anthropic's spec; likely ignored by strict parsers)`);
    }
  }
}

// ---- check: XML well-formedness ----
function checkXml() {
  const path = join(ROOT, 'prompts', 'audit_loop.xml');
  const xml = readFileSync(path, 'utf8');
  const tagRe = /<\/?([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;
  const stack = [];
  let m;
  while ((m = tagRe.exec(xml))) {
    const [full, tag, selfClose] = m;
    if (full.startsWith('</')) {
      const top = stack.pop();
      if (top !== tag) {
        fail('xml', `prompts/audit_loop.xml: mismatched closing tag </${tag}>, expected </${top ?? '(nothing open)'}>`);
        return;
      }
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  if (stack.length !== 0) fail('xml', `prompts/audit_loop.xml: unclosed tag(s): ${stack.join(', ')}`);
}

// ---- check: rule source completeness ----
function loadSourceKeys() {
  const text = readFileSync(join(ROOT, 'docs', 'SOURCES.md'), 'utf8');
  const keys = new Set();
  for (const m of text.matchAll(/^\|\s*`([\w.:-]+)`\s*\|/gm)) keys.add(m[1]);
  return keys;
}

function parseBulletSourceKeys(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const keys = [];
  text.split('\n').forEach((line, idx) => {
    const bullet = line.match(/^-\s+(.+)$/);
    if (!bullet) return;
    const sourceMatch = bullet[1].match(/source:\s*([\w.:-]+)/);
    if (sourceMatch) keys.push({ key: sourceMatch[1], line: idx + 1 });
  });
  return keys;
}

function checkRuleSources() {
  const sourceKeys = loadSourceKeys();
  const ruleDirs = [join(ROOT, 'rules', 'antipatterns'), join(ROOT, 'rules', 'banned_words')];
  for (const dir of ruleDirs) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const filePath = join(dir, file);
      for (const { key, line } of parseBulletSourceKeys(filePath)) {
        const known = sourceKeys.has(key) || key.startsWith('unresolved-');
        if (!known) {
          fail('rule-sources', `${relative(ROOT, filePath)}:${line}: source "${key}" has no matching row in docs/SOURCES.md`);
        }
      }
    }
  }
}

// ---- check: rule bullet shape (schemas/rule-bullet.schema.json) ----
// Targeted, hand-written checks against the documented shape, not generic
// JSON-Schema interpretation (this repo stays dependency-free, see
// CLAUDE.md). checkRuleSources() above already catches a missing/unresolved
// `source:`; this catches the other required field (a rule with no pattern
// text at all, effectively unreachable) and an out-of-range severity, which
// today silently parses and just produces an oversized or undersized
// deduction with no warning.
function checkRuleBulletShape() {
  const ruleDirs = [join(ROOT, 'rules', 'antipatterns'), join(ROOT, 'rules', 'banned_words')];
  for (const dir of ruleDirs) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const filePath = join(dir, file);
      const category = file.replace(/\.md$/, '');
      for (const entry of parseRuleFile(filePath, category)) {
        const rel = relative(ROOT, filePath);
        if (!entry.pattern || entry.pattern.trim() === '') {
          fail('rule-shape', `${rel}: a bullet has an empty pattern`);
        }
        if (typeof entry.severity !== 'number' || entry.severity < 1 || entry.severity > 9) {
          fail('rule-shape', `${rel}: "${entry.pattern}" has severity ${entry.severity}, expected an integer 1-9`);
        }
        if (![1, 2, 3].includes(entry.tier)) {
          fail('rule-shape', `${rel}: "${entry.pattern}" has tier ${entry.tier}, expected 1, 2, or 3`);
        }
        // A correctly-parsed pattern never contains a literal double-quote:
        // the file's own quoting convention only ever uses `"..."` as the
        // bullet-wrapper syntax, never as pattern content. A stray `"`
        // surviving into entry.pattern means splitBulletFields()
        // (scripts/lib/rules.mjs) split on an unescaped `|` inside what was
        // meant to be one quoted field, the parser's own quote-stripping
        // regex then failed to match (no matching trailing quote on its own
        // fragment) and left the leading quote in place. This is exactly
        // the "forgot to write \| instead of |" mistake CONTRIBUTING.md
        // warns about: catching it here turns a silent misparse (a corrupted
        // pattern, and every field after it shifted one column over) into a
        // loud failure instead.
        if (entry.pattern && entry.pattern.includes('"')) {
          fail(
            'rule-shape',
            `${rel}: pattern "${entry.pattern}" contains a literal double-quote, a sign an unescaped "|" inside the pattern broke field-splitting. A literal "|" in a regex bullet must be written "\\|", see CONTRIBUTING.md.`,
          );
        }
      }
    }
  }
}

// ---- check: config-to-code drift ----
// CONFIG_SECTIONS is imported from lib/config.mjs (the same list loadConfigFile
// actually parses against), not redeclared here: a hand-duplicated copy of this
// list is exactly the failure shape checkConfigDefaultsDrift() below exists to
// catch elsewhere, so this file doesn't get to have its own.

function parseConfigHeadings(text) {
  return [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
}

function parseConfigTableKeys(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return [];
  const keys = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    const row = line.match(/^\|\s*([\w.]+)\s*\|/);
    if (row && row[1] !== 'Setting' && row[1] !== 'Category') keys.push(row[1]);
  }
  return keys;
}

function checkConfigDrift() {
  const configText = readFileSync(join(ROOT, 'clearfelt-writing.config.md'), 'utf8');
  const headings = parseConfigHeadings(configText);
  for (const heading of headings) {
    if (!CONFIG_SECTIONS.includes(heading)) {
      fail('config-drift', `clearfelt-writing.config.md has a "## ${heading}" section not in detect.mjs's CONFIG_SECTIONS, it will never be parsed (this is exactly the round-9 category-weight bug's shape)`);
    }
  }

  // Scans every .mjs file under scripts/ (including scripts/lib/), not just
  // detect.mjs and hook.mjs by name: once detect.mjs's config-reading code
  // moved into scripts/lib/ (see the split described in docs/decisions), a
  // hardcoded two-file list here would false-positive-fail every row whose
  // reference moved with it. Read as one string is deliberate (matches the
  // old behavior of concatenating detect.mjs + hook.mjs) since this check
  // only needs "does this key appear literally anywhere in the scripts,"
  // not which file.
  const scriptsText = walk(join(ROOT, 'scripts'), new Set(['.mjs']))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const categoryFiles = [
    ...readdirSync(join(ROOT, 'rules', 'antipatterns')).filter((f) => f.endsWith('.md')),
    ...readdirSync(join(ROOT, 'rules', 'banned_words')).filter((f) => f.endsWith('.md')),
  ].map((f) => f.replace(/\.md$/, ''));

  for (const heading of CONFIG_SECTIONS) {
    const keys = parseConfigTableKeys(configText, heading);
    for (const key of keys) {
      if (heading === 'Category severity weights') {
        // These keys are matched dynamically (config[category]), not as a
        // literal string in the script; the real invariant is that the row
        // corresponds to an actual rule category file, not stale or
        // misspelled.
        if (!categoryFiles.includes(key)) {
          warn('config-drift', `clearfelt-writing.config.md's "Category severity weights" row "${key}" doesn't match any rules/**/${key}.md file`);
        }
        continue;
      }
      const referenced = scriptsText.includes(key);
      if (!referenced) {
        fail('config-drift', `clearfelt-writing.config.md's "${heading}" row "${key}" is never referenced in scripts/detect.mjs or scripts/hook.mjs`);
      }
    }
  }
}

// ---- check: config table rows parse cleanly ----
// parseConfigTable's row regex (/^\|\s*([\w.]+)\s*\|\s*([^|]+?)\s*\|/) silently
// skips any line it doesn't match: a typo'd pipe, a setting name with a space
// or hyphen instead of an underscore, a dropped column. That row's value then
// falls through to whatever CONFIG_DEFAULTS or a hardcoded fallback supplies,
// with nothing telling a hand-editing user their edit didn't take. This check
// flags any line under a CONFIG_SECTIONS heading that looks like a table row
// (starts with a pipe) but doesn't match the parser's own row shape, so a
// malformed edit fails loudly here instead of silently reverting to a default.
function checkConfigRowSyntax() {
  const path = join(ROOT, 'clearfelt-writing.config.md');
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  for (const heading of CONFIG_SECTIONS) {
    const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
    if (start === -1) continue;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^##\s+/.test(line)) break;
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) continue;
      if (/^\|\s*-+\s*\|/.test(trimmed)) continue; // header separator row, e.g. |---|---|
      if (/^\|\s*(Setting|Category)\s*\|/.test(trimmed)) continue; // column-label header row
      if (/^\|\s*([\w.]+)\s*\|\s*([^|]+?)\s*\|/.test(trimmed)) continue; // parses fine
      fail(
        'config-syntax',
        `clearfelt-writing.config.md:${i + 1} under "## ${heading}" looks like a table row but doesn't match parseConfigTable's expected "| key | value |" shape, so it will be silently skipped and fall back to a default: ${trimmed}`
      );
    }
  }
}

// ---- check: config defaults drift (two sources of truth for one number, and a regression guard for the third) ----
// clearfelt-writing.config.md's shipped defaults and scripts/lib/config.mjs's
// CONFIG_DEFAULTS fallback-of-last-resort are the two remaining independent
// places a default can live; a Markdown file and a JS object have no way to
// share one literal the way two JS files can, so this pair still needs a
// runtime comparison. score.mjs's own inline `config.<key> ?? <literal>`
// fallbacks used to be a third, hand-maintained copy, and did drift once for
// real (CONFIG_DEFAULTS still held the pre-docs/decisions/0011 weights for
// burstiness/vocabulary/repetition after the shipped config and score.mjs
// had both already moved on). score.mjs now imports CONFIG_DEFAULTS and
// writes `config.<key> ?? CONFIG_DEFAULTS.<key>` instead of restating each
// number, collapsing that copy into a direct reference, so it can't drift
// from CONFIG_DEFAULTS again by construction, not just by staying caught.
// checkScoreReferencesConfigDefaults() below is the regression guard for
// that: it fails if score.mjs ever grows a hardcoded numeric literal
// fallback again for one of the keys this collapse fixed, the exact
// anti-pattern reappearing, and separately fails if a `config.<key> ??
// CONFIG_DEFAULTS.<otherKey>` mismatched pair ever gets typo'd in.
function parseConfigTableValues(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return {};
  const values = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    const row = line.match(/^\|\s*([\w.]+)\s*\|\s*([^|]+?)\s*\|/);
    if (row && row[1] !== 'Setting' && row[1] !== 'Category') values[row[1]] = row[2].trim();
  }
  return values;
}

function checkConfigDefaultsDrift() {
  const configText = readFileSync(join(ROOT, 'clearfelt-writing.config.md'), 'utf8');
  const shipped = {};
  for (const heading of CONFIG_SECTIONS) Object.assign(shipped, parseConfigTableValues(configText, heading));

  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    if (key in shipped && String(shipped[key]) !== String(value)) {
      fail(
        'config-defaults-drift',
        `scripts/lib/config.mjs's CONFIG_DEFAULTS has "${key}": ${value}, but clearfelt-writing.config.md ships ${shipped[key]}. These must agree, a mismatch means CONFIG_DEFAULTS is stale.`,
      );
    }
  }
}

// The keys score.mjs used to hardcode a literal fallback for, before this
// collapse. Listed explicitly (not derived from CONFIG_DEFAULTS wholesale)
// since not every CONFIG_DEFAULTS key is something score.mjs ever reads;
// this check is specifically about the keys that already drifted once, not
// every tunable in the file.
const SCORE_DEFAULT_KEYS = [
  'deduction_cap',
  'burstiness_baseline',
  'burstiness_weight',
  'vocabulary_diversity_baseline',
  'vocabulary_diversity_weight',
  'repetition_weight',
  'paragraph_variety_baseline',
  'paragraph_variety_weight',
  'wall_of_text_sentence_threshold',
  'wall_of_text_penalty',
];

function checkScoreReferencesConfigDefaults() {
  const text = readFileSync(join(ROOT, 'scripts', 'lib', 'score.mjs'), 'utf8');

  if (!/import\s*\{[^}]*\bCONFIG_DEFAULTS\b[^}]*\}\s*from\s*['"]\.\/config\.mjs['"]/.test(text)) {
    fail('config-defaults-drift', 'scripts/lib/score.mjs no longer imports CONFIG_DEFAULTS from ./config.mjs.');
    return;
  }

  for (const key of SCORE_DEFAULT_KEYS) {
    const literalRegex = new RegExp(`config\\.${key}\\s*\\?\\?\\s*(-?\\d+(?:\\.\\d+)?)`);
    const literalMatch = text.match(literalRegex);
    if (literalMatch) {
      fail(
        'config-defaults-drift',
        `scripts/lib/score.mjs has "config.${key} ?? ${literalMatch[1]}", a hardcoded literal fallback. It should read CONFIG_DEFAULTS.${key} instead, the exact hand-maintained-copy pattern that already drifted once (see this check's own header comment).`,
      );
      continue;
    }
    const referenceRegex = new RegExp(`config\\.${key}\\s*\\?\\?\\s*CONFIG_DEFAULTS\\.(\\w+)`);
    const referenceMatch = text.match(referenceRegex);
    if (!referenceMatch) {
      fail('config-defaults-drift', `scripts/lib/score.mjs no longer has a "config.${key} ?? CONFIG_DEFAULTS.${key}" fallback at all.`);
    } else if (referenceMatch[1] !== key) {
      fail(
        'config-defaults-drift',
        `scripts/lib/score.mjs has "config.${key} ?? CONFIG_DEFAULTS.${referenceMatch[1]}", a mismatched key on the two sides of the fallback.`,
      );
    }
  }
}

// ---- check: command table drift (SKILL.md vs README.md) ----
// SKILL.md's Commands table is what actually governs routing; README.md's
// Usage table restates the same commands for a human reader in a different
// column layout (Reference link vs. prose "Does" summary). Two hand-written
// copies of the same "which commands exist" fact, with nothing previously
// catching a command added to one table and not the other, the same shape
// checkConfigDefaultsDrift() above exists to catch for numeric defaults.
// Compares only which command names appear in each file, not full row
// content: the columns legitimately differ, so line-for-line equality would
// be a false-positive machine, not a real drift check.
function parseCommandNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/`\/clearfelt-writing (\w+)/g)) names.add(m[1]);
  return names;
}

function checkCommandTableDrift() {
  const skillCommands = parseCommandNames(readFileSync(join(ROOT, 'SKILL.md'), 'utf8'));
  const readmeCommands = parseCommandNames(readFileSync(join(ROOT, 'README.md'), 'utf8'));

  for (const cmd of skillCommands) {
    if (!readmeCommands.has(cmd)) {
      fail('command-table-drift', `SKILL.md documents "/clearfelt-writing ${cmd}" but README.md never mentions it.`);
    }
  }
  for (const cmd of readmeCommands) {
    if (!skillCommands.has(cmd)) {
      fail('command-table-drift', `README.md documents "/clearfelt-writing ${cmd}" but SKILL.md's Commands table doesn't mention it.`);
    }
  }
}

// ---- check: detect.mjs / check.mjs output shape (schemas/*-report.schema.json) ----
// The rule-bullet and eval-manifest schemas under schemas/ document the two
// input formats; nothing previously checked the actual JSON shape detect.mjs
// and check.mjs print on the way OUT, the boundary where a model reads that
// output over Bash with no schema validation between the two. A field
// rename or removal there would silently confuse the model mid-pipeline
// instead of failing loudly, unlike everything else this script checks.
// Walks each schema's own `required`/`properties` (not a generic
// JSON-Schema engine, same "targeted, hand-written checks against the
// documented shape" rule checkRuleBulletShape() above already follows), so
// the schema file and this check can't drift apart from each other either.
function assertRequiredKeys(obj, schema, path, checkName, sourceLabel) {
  if (obj === null || typeof obj !== 'object') {
    fail(checkName, `${sourceLabel}: expected an object at ${path || '(root)'}, got ${obj === null ? 'null' : typeof obj}`);
    return;
  }
  for (const key of schema.required ?? []) {
    if (!(key in obj)) {
      fail(checkName, `${sourceLabel}: missing required field "${path}${path ? '.' : ''}${key}" (see schemas/${schema.$id.split('/').pop()})`);
    }
  }
  for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
    if (subSchema.type === 'object' && subSchema.required && key in obj) {
      assertRequiredKeys(obj[key], subSchema, `${path}${path ? '.' : ''}${key}`, checkName, sourceLabel);
    }
  }
}

function checkOutputShape() {
  const detectSchema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'detect-report.schema.json'), 'utf8'));
  const checkSchema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'check-report.schema.json'), 'utf8'));

  const sampleFile = join(ROOT, 'tests', 'fixtures', 'human-sample.md');
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'detect.mjs'), '--mode', 'report', sampleFile], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assertRequiredKeys(JSON.parse(out), detectSchema, '', 'output-shape', 'detect.mjs --mode report');
  } catch (err) {
    fail('output-shape', `detect.mjs --mode report failed to run against ${relative(ROOT, sampleFile)}: ${err.message}`);
  }

  const beforeFile = join(ROOT, 'tests', 'fixtures', 'check', 'clean-rewrite-before.md');
  const afterFile = join(ROOT, 'tests', 'fixtures', 'check', 'clean-rewrite-after.md');
  try {
    const out = execFileSync(
      process.execPath,
      [join(ROOT, 'scripts', 'check.mjs'), '--before', beforeFile, '--after', afterFile],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assertRequiredKeys(JSON.parse(out), checkSchema, '', 'output-shape', 'check.mjs');
  } catch (err) {
    // check.mjs exits 1 on verdict "fail"; err.stdout still has the JSON.
    if (err.stdout) {
      assertRequiredKeys(JSON.parse(err.stdout), checkSchema, '', 'output-shape', 'check.mjs');
    } else {
      fail('output-shape', `check.mjs failed to run against its clean-rewrite fixtures: ${err.message}`);
    }
  }
}

// ---- run ----
checkEmDash();
checkFrontmatter();
checkXml();
checkRuleSources();
checkRuleBulletShape();
checkConfigDrift();
checkConfigRowSyntax();
checkConfigDefaultsDrift();
checkScoreReferencesConfigDefaults();
checkCommandTableDrift();
checkOutputShape();

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const f of failures) console.error(`FAIL  ${f}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed, ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`All checks passed (${warnings.length} warning(s)).`);
