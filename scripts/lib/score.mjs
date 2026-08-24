// Scoring engine: statistical signals (burstiness, vocabulary diversity,
// repetition, paragraph structure), readability formulas, and the Human
// Score formula that combines rule hits with those signals. Split out of
// detect.mjs along with rule matching (scripts/lib/rules.mjs) and reporting
// (scripts/lib/report.mjs).

// computeScore()'s fallbacks below read CONFIG_DEFAULTS directly rather than
// restating each number as a second literal: those two used to be
// independently hand-maintained copies of the same value, kept in sync only
// by scripts/lint.mjs's config-defaults-drift check, and did drift once for
// real (docs/decisions/0018: CONFIG_DEFAULTS still held pre-0011 weights
// after this file and clearfelt-writing.config.md had both already moved
// on). Importing the one constant makes that specific drift structurally
// impossible instead of only detectable; clearfelt-writing.config.md, the
// third, human-editable copy, still gets checked against CONFIG_DEFAULTS by
// that same lint check, since a Markdown file and a JS object have no way to
// share a single literal the way two JS files can.
import { CONFIG_DEFAULTS } from './config.mjs';

// ---- statistical signals ----

export function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function burstinessScore(text) {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length).filter((n) => n > 0);
  if (lengths.length < 2) return { coefficientOfVariation: 0, sentenceCount: lengths.length };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  // mean can never be 0 here: lengths only ever holds values already
  // filtered to > 0 (see the .filter((n) => n > 0) above), so an all-zero
  // (and therefore zero-mean) set can't reach this point.
  return { coefficientOfVariation: stdDev / mean, sentenceCount: lengths.length };
}

export function typeTokenRatio(text) {
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  if (words.length === 0) return 0;
  const unique = new Set(words);
  return unique.size / words.length;
}

// Raw type-token ratio is length-biased: it falls as a document gets longer
// (more chances to reuse a word), independent of how genuinely varied the
// vocabulary is. Measured against every fixture in tests/fixtures and
// tests/fixtures/eval (see docs/decisions/0012-length-normalized-vocabulary-diversity.md):
// short single-paragraph AI-heavy samples and short human samples both land
// in the same 0.78-0.93 raw-TTR band, so raw TTR does not separate them at
// all at this length, and vocabulary_diversity_weight (raised in ADR 0011)
// was rewarding the short AI samples for their length, not their quality, a
// known regression disclosed in CHANGELOG.md 0.2.0. Root TTR (Guiraud's R,
// unique words / sqrt(total words), Guiraud 1954, see docs/SOURCES.md)
// grows roughly with the square root of length instead of falling with raw
// length, which is a much weaker length dependence and gave real separation
// between the AI and human fixture sets when measured (AI: 5.9-6.8, human:
// 6.4-9.6). Reported alongside raw typeTokenRatio for transparency, not in
// place of it; only rootTypeTokenRatio feeds the score.
export function rootTypeTokenRatio(text) {
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  if (words.length === 0) return 0;
  const unique = new Set(words);
  return unique.size / Math.sqrt(words.length);
}

// Root TTR reduces length dependence (see the comment above) but does not
// eliminate it: measured against 16 fixtures capped at 84 words plus one
// external 841-word AI-generated document (see docs/decisions/0017), Root
// TTR climbed from a 5.7-7.4 band at fixture length to 15.4 at 841 words,
// more than double the highest value the score's weight was ever calibrated
// against, an out-of-distribution extrapolation the weight had no way to
// stay sane under. The root cause is not noise in the formula, it is
// accumulating unique words over the WHOLE document: a longer document
// naturally covers more subtopics and therefore uses more distinct words
// almost regardless of whether a human or a model wrote it, so whole-
// document vocabulary count is confounded with topic breadth, not a clean
// proxy for authorship. MATTR (Moving-Average Type-Token Ratio, Covington
// and McFall 2010, see docs/SOURCES.md) fixes this by construction rather
// than by degree: it computes ordinary TTR inside a fixed-size sliding
// window (every window is exactly windowSize words, so length stops being a
// variable at all once a document exceeds the window) and averages across
// every window position. Measured on the same fixtures plus the 841-word
// document, MATTR-50 landed at 0.889, squarely inside the existing 16-
// fixture spread (0.80 to 0.95) instead of an outlier, while still keeping
// a real, if modest, separation between the ai-labeled mean (0.862) and the
// human-labeled mean (0.879). Falls back to plain whole-document TTR when a
// text is shorter than the window, since there is no length-bias left to
// correct for at that size, matching typeTokenRatio's existing behavior for
// short documents. rootTypeTokenRatio is still reported alongside this for
// transparency, only movingAverageTtr feeds the score now.
export function movingAverageTtr(text, windowSize = 50) {
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  if (words.length === 0) return 0;
  if (words.length <= windowSize) return new Set(words).size / words.length;
  let sum = 0;
  let windowCount = 0;
  for (let i = 0; i <= words.length - windowSize; i++) {
    sum += new Set(words.slice(i, i + windowSize)).size / windowSize;
    windowCount++;
  }
  return sum / windowCount;
}

// A repeated trigram is usually filler (the AI-slop signal this exists to
// catch), but not always: "No message at 90 days. No check-in during
// onboarding." repeats a device (anaphora) on purpose, and a hook/CTA
// callback ("goes quiet exactly when you need them least" / "shown up for
// you... not before it") deliberately echoes a phrase to close a loop.
// Neither is detectable from the text alone without risking exactly the
// false-confidence problem docs/ROADMAP.md's Feature C already declined to
// ship (a statistical proxy can't tell "same phrase, filler" from "same
// phrase, device"). So this doesn't try to detect intent; a caller states it
// instead, the same "human declares, tool doesn't guess" shape as
// domain.md's jargon exemption list. exemptPhrases are turned into their own
// trigrams and subtracted from the repeated tally, not the total: an
// exempted phrase still counts toward "how much text this is," it just
// doesn't count against the writer for repeating it on purpose.
export function exemptTrigramSet(exemptPhrases) {
  const exempt = new Set();
  for (const phrase of exemptPhrases) {
    const words = String(phrase).toLowerCase().match(/\b[a-z']+\b/g) || [];
    for (let i = 0; i <= words.length - 3; i++) exempt.add(words.slice(i, i + 3).join(' '));
  }
  return exempt;
}

export function trigramRepetitionRatio(text, exemptPhrases = []) {
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  if (words.length < 3) return 0;
  const trigrams = [];
  for (let i = 0; i <= words.length - 3; i++) trigrams.push(words.slice(i, i + 3).join(' '));
  const exempt = exemptTrigramSet(exemptPhrases);
  const counts = new Map();
  for (const t of trigrams) counts.set(t, (counts.get(t) || 0) + 1);
  const repeated = [...counts.entries()]
    .filter(([t, c]) => c > 1 && !exempt.has(t))
    .reduce((a, [, c]) => a + c, 0);
  // trigrams.length can never be 0 here: the words.length < 3 guard above
  // already ensures at least one trigram exists by the time this runs.
  return repeated / trigrams.length;
}

// Sentence burstiness is blind to paragraph structure entirely: splitSentences
// flattens the whole text into one stream, so two documents with identical
// sentences but different paragraph breaks score identically on every signal
// above. This is a real gap, found via testing: a "structural_rework" pass
// that only changed paragraph boundaries moved nothing. Paragraph-length
// variety (the same coefficient-of-variation approach as burstinessScore,
// one level up) and an explicit penalty for a long document crammed into a
// single paragraph close it.
export function splitParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^#{1,6}\s/.test(p));
}

export function paragraphStructureScore(text) {
  const paragraphs = splitParagraphs(text);
  const lengths = paragraphs.map((p) => (p.match(/\b[a-z']+\b/gi) || []).length).filter((n) => n > 0);
  if (lengths.length < 2) {
    return { coefficientOfVariation: 0, paragraphCount: lengths.length };
  }
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  // Same reasoning as burstinessScore above: lengths is already filtered to
  // > 0 values only, so mean === 0 can't happen here.
  return { coefficientOfVariation: stdDev / mean, paragraphCount: lengths.length };
}

// ---- readability (Flesch, Flesch-Kincaid, Gunning Fog, processing fluency) ----
// Formulas: Flesch, R. (1948), Journal of Applied Psychology, 32(3), 221-233.
// Kincaid et al. (1975), Navy Research Branch Report 8-75. Gunning, R. (1952),
// The Technique of Clear Writing. See docs/SOURCES.md for verified citations.

export function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

export function computeReadability(text) {
  const sentences = splitSentences(text);
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = Math.max(words.length, 1);
  const syllableCounts = words.map(countSyllables);
  const syllableTotal = syllableCounts.reduce((a, b) => a + b, 0);
  const complexWordCount = syllableCounts.filter((c) => c >= 3).length;

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = syllableTotal / wordCount;

  const fleschReadingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const fleschKincaidGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  const gunningFog = 0.4 * (wordsPerSentence + 100 * (complexWordCount / wordCount));

  const passiveMatches = text.match(/\b(?:is|are|was|were|be|been|being)\s+\w+ed\b/gi) || [];
  const nominalizationMatches = text.match(/\b\w+(?:tion|ment|ance|ence|ity)s?\b/gi) || [];

  return {
    fleschReadingEase: Number(fleschReadingEase.toFixed(1)),
    fleschKincaidGrade: Number(Math.max(0, fleschKincaidGrade).toFixed(1)),
    gunningFog: Number(gunningFog.toFixed(1)),
    passiveVoiceDensity: Number((passiveMatches.length / sentenceCount).toFixed(2)),
    nominalizationDensity: Number((nominalizationMatches.length / wordCount).toFixed(3)),
  };
}

// ---- scoring ----

export function computeScore(text, hits, config, exemptPhrases = []) {
  const categoryWeight = (category) => config[category] ?? 1.0;
  let deduction = 0;
  for (const hit of hits) deduction += hit.severity * categoryWeight(hit.category);

  // Rule-hit deduction is an unbounded linear sum, one document can rack up
  // 80+ points, while every statistical signal below is bounded to a small
  // range by its own formula. Measured across 17 real documents scored
  // during development (see docs/decisions/0011), deduction spanned 0-86
  // while the statistical signals combined never exceeded about 5 points in
  // either direction. Past a handful of rule hits, deduction doesn't just
  // dominate the score, it mathematically zeroes out everything else's
  // ability to matter at all. deduction_cap stops that: once deduction
  // exceeds the cap, the document is already unambiguously in "needs work"
  // territory (below human_score_threshold's default of 85 many times over),
  // and further raw deduction adds no decision-relevant resolution, so
  // capping it here preserves headroom for the other signals to still mean
  // something instead of losing that ability whenever a document is bad
  // enough. The raw, uncapped sum is still reported (deductionRaw) so
  // nothing is silently hidden, only the score-affecting value is capped.
  const deductionCap = config.deduction_cap ?? CONFIG_DEFAULTS.deduction_cap;
  const deductionApplied = Math.min(deduction, deductionCap);

  const { coefficientOfVariation } = burstinessScore(text);
  const burstinessAdjustment =
    (Math.min(coefficientOfVariation, 1) - (config.burstiness_baseline ?? CONFIG_DEFAULTS.burstiness_baseline)) *
    (config.burstiness_weight ?? CONFIG_DEFAULTS.burstiness_weight);

  const ttr = typeTokenRatio(text);
  const rootTtr = rootTypeTokenRatio(text);
  const mattr = movingAverageTtr(text, 50);
  const vocabAdjustment =
    (mattr - (config.vocabulary_diversity_baseline ?? CONFIG_DEFAULTS.vocabulary_diversity_baseline)) *
    (config.vocabulary_diversity_weight ?? CONFIG_DEFAULTS.vocabulary_diversity_weight);

  const repetition = trigramRepetitionRatio(text, exemptPhrases);
  const repetitionPenalty = repetition * (config.repetition_weight ?? CONFIG_DEFAULTS.repetition_weight) * 10;

  const { sentenceCount } = burstinessScore(text);
  const { coefficientOfVariation: paragraphCV, paragraphCount } = paragraphStructureScore(text);
  const paragraphVarietyAdjustment =
    paragraphCount >= 2
      ? (Math.min(paragraphCV, 1) - (config.paragraph_variety_baseline ?? CONFIG_DEFAULTS.paragraph_variety_baseline)) *
        (config.paragraph_variety_weight ?? CONFIG_DEFAULTS.paragraph_variety_weight)
      : 0;
  const wallOfTextPenalty =
    paragraphCount <= 1 && sentenceCount >= (config.wall_of_text_sentence_threshold ?? CONFIG_DEFAULTS.wall_of_text_sentence_threshold)
      ? config.wall_of_text_penalty ?? CONFIG_DEFAULTS.wall_of_text_penalty
      : 0;

  let score =
    100 -
    deductionApplied +
    burstinessAdjustment +
    vocabAdjustment -
    repetitionPenalty +
    paragraphVarietyAdjustment -
    wallOfTextPenalty;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Every component above gets folded into the final score with a mix of
  // "+" and "-" in the formula, which is fine for the math but confusing to
  // present raw: some fields (repetitionPenalty, wallOfTextPenalty) are
  // stored as positive magnitudes that always subtract, others
  // (burstinessAdjustment, vocabAdjustment, paragraphVarietyAdjustment) are
  // already signed and can go either way. `impacts` normalizes all of them
  // to "how many points this actually added or removed," one consistent
  // sign convention, sorted by magnitude so the biggest driver of the score
  // is always first, not buried in a fixed formula-order list. Uses
  // deductionApplied, the capped value, since that's what actually moved
  // the score; deductionRaw is still available separately for anyone
  // debugging why a document with a very high raw deduction didn't score
  // as low as they expected.
  const deductionCapped = deduction > deductionCap;
  const impacts = [
    {
      label: deductionCapped ? `Rule-hit deduction (capped from ${deduction})` : 'Rule-hit deduction',
      impact: -deductionApplied,
    },
    { label: 'Sentence-rhythm (burstiness)', impact: burstinessAdjustment },
    { label: 'Vocabulary diversity', impact: vocabAdjustment },
    { label: 'Repeated-phrase penalty', impact: -repetitionPenalty },
    { label: 'Paragraph-variety', impact: paragraphVarietyAdjustment },
    { label: 'Wall-of-text penalty', impact: -wallOfTextPenalty },
  ]
    .map((row) => ({ ...row, impact: Number(row.impact.toFixed(2)) }))
    .filter((row) => row.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    score,
    deduction,
    deductionApplied,
    deductionCapped,
    burstinessAdjustment,
    vocabAdjustment,
    repetitionPenalty,
    paragraphVarietyAdjustment,
    wallOfTextPenalty,
    typeTokenRatio: ttr,
    rootTypeTokenRatio: rootTtr,
    movingAverageTtr: mattr,
    trigramRepetitionRatio: repetition,
    paragraphCount,
    impacts,
  };
}
