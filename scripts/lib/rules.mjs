// Rule engine: parses the Markdown rule dictionary under rules/, and matches
// it against a target text. Split out of detect.mjs along with scoring
// (scripts/lib/score.mjs) and reporting (scripts/lib/report.mjs).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ROOT } from './config.mjs';

// ---- code / quote exclusion guard ----

export function stripExcludedRegions(text) {
  let stripped = text.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length));
  stripped = stripped.replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
  stripped = stripped
    .split('\n')
    .map((line) => (/^\s*>/.test(line) ? ' '.repeat(line.length) : line))
    .join('\n');
  return stripped;
}

// ---- rule file parsing ----

// Splits a bullet's `|`-delimited fields, treating `\|` as a literal pipe
// (unescaped to `|` in the result, not a field separator) and `\\` as a
// literal backslash, so a regex bullet's pattern can contain a real
// alternation group (`(foo\|bar)`) instead of being unable to express one at
// all (the previous limitation, documented in CONTRIBUTING.md before this
// function existed). Only these two sequences are special-cased: any other
// backslash (`\w`, `\s`, `\b`, `\d`, `\.`, ...) passes through completely
// unchanged, so every existing regex bullet's real escape sequences keep
// meaning exactly what they meant before.
export function splitBulletFields(str) {
  const fields = [];
  let current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && (str[i + 1] === '|' || str[i + 1] === '\\')) {
      current += str[i + 1];
      i++;
      continue;
    }
    if (ch === '|') {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

export function parseBulletLine(line) {
  const m = line.match(/^-\s+(.+)$/);
  if (!m) return null;
  const parts = splitBulletFields(m[1]).map((p) => p.trim());
  const rawPattern = parts[0].replace(/^"(.*)"$/, '$1');
  const fields = { pattern: rawPattern };
  for (const part of parts.slice(1)) {
    const kv = part.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    fields[key] = /^\d+$/.test(value) ? Number(value) : value;
  }
  return fields;
}

export function parseRuleFile(filePath, category) {
  const text = readFileSync(filePath, 'utf8');
  const entries = [];
  for (const line of text.split('\n')) {
    const parsed = parseBulletLine(line);
    if (parsed) entries.push({ ...parsed, category, severity: parsed.severity ?? 5, tier: parsed.tier ?? 1 });
  }
  return entries;
}

export function loadRuleDir(dirPath) {
  if (!existsSync(dirPath)) return [];
  const entries = [];
  for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.md'))) {
    const category = basename(file, '.md');
    entries.push(...parseRuleFile(join(dirPath, file), category));
  }
  return entries;
}

export function mergeLocal(base, localFile) {
  if (!existsSync(localFile)) return base;
  const text = readFileSync(localFile, 'utf8');
  let currentCategory = null;
  const merged = [...base];
  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      currentCategory = heading[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      continue;
    }
    const parsed = parseBulletLine(line);
    if (!parsed) continue;
    const entry = { ...parsed, category: currentCategory ?? 'local', severity: parsed.severity ?? 5, tier: parsed.tier ?? 1 };
    const existingIdx = merged.findIndex((e) => e.pattern.toLowerCase() === entry.pattern.toLowerCase());
    if (existingIdx >= 0) merged[existingIdx] = { ...merged[existingIdx], ...entry };
    else merged.push(entry);
  }
  return merged;
}

// An "unresolved-*" source key (see docs/SOURCES.md) discloses that a rule's
// citation couldn't be verified, not that one exists: shipping it as a
// scored default anyway would contradict "every rule cites... nothing
// asserted without a disclosed origin" (README.md). Off by default, per
// rules.include_unresolved in clearfelt-writing.config.md; a project that wants
// these anyway (or has independently verified the citation) can opt in.
// Applies uniformly to shared and .local.md entries alike: an unresolved
// citation is the same disclosed gap regardless of which file it's in.
function filterUnresolved(entries, includeUnresolved) {
  if (includeUnresolved) return entries;
  return entries.filter((entry) => !String(entry.source ?? '').startsWith('unresolved-'));
}

export function loadRules(config = {}) {
  const includeUnresolved = config['rules.include_unresolved'] === true;
  const antipatterns = filterUnresolved(
    mergeLocal(loadRuleDir(join(ROOT, 'rules', 'antipatterns')), join(ROOT, 'rules', 'antipatterns.local.md')),
    includeUnresolved,
  );
  const bannedWords = filterUnresolved(
    mergeLocal(loadRuleDir(join(ROOT, 'rules', 'banned_words')), join(ROOT, 'rules', 'banned_words.local.md')),
    includeUnresolved,
  );
  return { antipatterns, bannedWords, all: [...antipatterns, ...bannedWords] };
}

// Register lists (docs/decisions/0024) are a separate load path from
// loadRules() on purpose: they never feed computeScore, so they don't belong
// in the "all" set that does, and they're not subject to the
// rules.include_unresolved filter, since that filter exists to gate a scored
// deduction on an unverifiable AI-detection claim, and a register hit is
// neither scored nor an AI-detection claim (see rules/register/*.md's own
// header on why these entries carry source: editorial instead of a
// docs/SOURCES.md key). Both lists load unconditionally and cheaply; which
// one applies to a given document is decided by the caller from the
// resolved register value, not by this loader.
export function loadRegisterRules() {
  const entries = loadRuleDir(join(ROOT, 'rules', 'register'));
  return {
    accusatory: entries.filter((r) => r.category === 'accusatory'),
    hedging: entries.filter((r) => r.category === 'hedging'),
  };
}

// ---- matching ----

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A rule for "leverage" should also catch "leveraging"; a rule for "seamless"
// should also catch "seamlessly." Exact-literal-form matching missed these
// (found via testing, see docs/decisions/0009 and the round-9/10 dogfooding
// notes in CHANGELOG.md). This is a heuristic, not real stemming: it handles
// the common case (silent-e drop before -ing/-ed, plus -s/-es/-ed/-ing/-ly)
// and won't catch irregular derivations (e.g. "synergistic" from "synergy"),
// which still need their own separate rule entry.
export function inflectionPattern(word) {
  if (/e$/i.test(word)) {
    const stem = escapeRegex(word.slice(0, -1));
    return `(?:${stem}(?:e|es|ed|ing)?)`;
  }
  if (/[^aeiou]y$/i.test(word)) {
    // consonant + y: synergy -> synergies, not "synergys"
    const stem = escapeRegex(word.slice(0, -1));
    return `(?:${escapeRegex(word)}|${stem}ies)`;
  }
  return `(?:${escapeRegex(word)}(?:s|es|ed|ing|ly)?)`;
}

// Most bullets are literal text (escaped before matching) or single words
// (given light inflection support below). `regex: true` opts a bullet out
// of literal-string escaping entirely, for patterns that describe a shape
// rather than fixed wording ("It's not X. It's Y."). A literal `|` inside
// the pattern (an alternation group) must be written `\|`, see
// splitBulletFields above: the bullet-line format is still `|`-delimited,
// so an unescaped `|` is still a field separator, not part of the pattern.
export function buildMatcher(rule) {
  if (rule.regex === 'true') return new RegExp(rule.pattern, 'gi');
  const isSingleWord = !rule.pattern.includes(' ');
  return isSingleWord
    ? new RegExp(`\\b${inflectionPattern(rule.pattern)}\\b`, 'gi')
    : new RegExp(escapeRegex(rule.pattern), 'gi');
}

export function toHit(rule, occ) {
  return {
    category: rule.category,
    pattern: rule.pattern,
    severity: rule.severity,
    tier: rule.tier,
    source: rule.source ?? 'unattributed',
    line: occ.line,
    snippet: occ.snippet,
  };
}

export function findHits(text, rules, config, overrides, { includeSuppressed = false } = {}) {
  const lines = text.split('\n');

  // Cumulative word count before each line, so a match's line + in-line
  // character offset can be converted to one global word position, needed
  // below for tier-2's cluster-window check.
  const lineWordOffsets = [];
  let wordsSoFar = 0;
  for (const line of lines) {
    lineWordOffsets.push(wordsSoFar);
    wordsSoFar += (line.match(/\S+/g) || []).length;
  }

  const perRule = [];
  for (const rule of rules) {
    if (overrides.has(rule.pattern.toLowerCase())) continue;
    const regex = buildMatcher(rule);

    const occurrences = [];
    lines.forEach((line, idx) => {
      const lineRegex = new RegExp(regex.source, 'gi');
      let match;
      while ((match = lineRegex.exec(line)) !== null) {
        const wordsBeforeMatch = (line.slice(0, match.index).match(/\S+/g) || []).length;
        occurrences.push({
          line: idx + 1,
          snippet: line.trim().slice(0, 120),
          wordPos: lineWordOffsets[idx] + wordsBeforeMatch,
        });
        if (match[0].length === 0) lineRegex.lastIndex += 1; // avoid an infinite loop on a zero-width regex match
      }
    });
    if (occurrences.length > 0) perRule.push({ rule, occurrences });
  }

  // Tiering exists to keep the SCORE honest (a single legitimate "robust"
  // shouldn't tank a document). --mode scan (includeSuppressed) bypasses it
  // deliberately: /clearfelt-writing rewrite's balanced/full_rewrite/structural_rework
  // tiers need to see every occurrence, not just the ones that survived
  // tier-suppression, or they can never touch the words tiering was hiding
  // from the score. .clearfelt-writing/domain.md's exemption list is still the right
  // tool for genuinely legitimate jargon; tiering was never meant to protect
  // rewrite's editing scope, only the scored number.
  if (includeSuppressed) {
    return perRule.flatMap(({ rule, occurrences }) => occurrences.map((occ) => toHit(rule, occ)));
  }

  // Tier-2's actual rule, per clearfelt-writing.config.md: "a tier-2 word only
  // counts as a hit when ANOTHER flagged word appears within
  // tier2_cluster_window words of it." That's a proximity check against
  // every hit in the document (any rule, any category), not "this same
  // pattern occurred more than once" (the old, unconfigurable approximation).
  const allWordPositions = perRule.flatMap(({ occurrences }) => occurrences.map((o) => o.wordPos));
  const clusterWindow = config.tier2_cluster_window ?? 40;
  function hasNearbyHit(wordPos) {
    let skippedSelf = false;
    for (const pos of allWordPositions) {
      if (pos === wordPos && !skippedSelf) {
        skippedSelf = true; // don't let the occurrence count as its own neighbor
        continue;
      }
      if (Math.abs(pos - wordPos) <= clusterWindow) return true;
    }
    return false;
  }

  const hits = [];
  for (const { rule, occurrences } of perRule) {
    if (rule.tier === 3 && occurrences.length < (config.tier3_density_threshold ?? 3)) continue;
    for (const occ of occurrences) {
      if (rule.tier === 2 && !hasNearbyHit(occ.wordPos)) continue;
      hits.push(toHit(rule, occ));
    }
  }
  return hits;
}
