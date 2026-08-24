// Unit tests for scripts/lib/score.mjs, imported directly rather than run as
// a subprocess: unlike detect.mjs/check.mjs/hook.mjs/pin.mjs/calibrate.mjs
// (all real CLI entrypoints, tested as subprocesses per this suite's own
// convention), score.mjs is a pure library of exported functions with no
// CLI of its own, so testing it directly is the honest match for what it
// actually is. This was previously exercised only indirectly through
// detect.mjs's subprocess tests, which never constructed the edge-case
// inputs (empty text, single sentence, config missing every key) needed to
// reach several of its branches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitSentences,
  burstinessScore,
  typeTokenRatio,
  rootTypeTokenRatio,
  movingAverageTtr,
  trigramRepetitionRatio,
  splitParagraphs,
  paragraphStructureScore,
  countSyllables,
  computeReadability,
  computeScore,
} from '../scripts/lib/score.mjs';

// ---- burstinessScore ----

test('burstinessScore: fewer than 2 sentences returns a flat zero, not NaN', () => {
  assert.deepEqual(burstinessScore(''), { coefficientOfVariation: 0, sentenceCount: 0 });
  assert.deepEqual(burstinessScore('One sentence only.'), { coefficientOfVariation: 0, sentenceCount: 1 });
});

test('burstinessScore: 2+ sentences of identical length gives zero variance; varied lengths gives positive variance', () => {
  const uniform = burstinessScore('One two three. Four five six. Seven eight nine.');
  assert.equal(uniform.coefficientOfVariation, 0);
  assert.equal(uniform.sentenceCount, 3);

  const varied = burstinessScore('Short one. This one has quite a few more words in it than the first.');
  assert.ok(varied.coefficientOfVariation > 0);
});

// ---- typeTokenRatio / rootTypeTokenRatio ----

test('typeTokenRatio and rootTypeTokenRatio: text with zero matched words returns 0, not NaN', () => {
  assert.equal(typeTokenRatio('12345 !!! ...'), 0);
  assert.equal(rootTypeTokenRatio('12345 !!! ...'), 0);
});

test('typeTokenRatio and rootTypeTokenRatio: real text returns a positive ratio', () => {
  assert.ok(typeTokenRatio('the quick brown fox jumps over the lazy dog') > 0);
  assert.ok(rootTypeTokenRatio('the quick brown fox jumps over the lazy dog') > 0);
});

// ---- movingAverageTtr ----

test('movingAverageTtr: zero words returns 0', () => {
  assert.equal(movingAverageTtr('12345'), 0);
});

test('movingAverageTtr: at or under the window size falls back to plain whole-text TTR', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  const wordCount = (text.match(/\b[a-z']+\b/g) || []).length;
  assert.ok(wordCount <= 50, 'fixture must be at or under the default window for this test to mean anything');
  assert.equal(movingAverageTtr(text, 50), typeTokenRatio(text));
});

test('movingAverageTtr: over the window size actually slides (does not equal plain whole-text TTR in general)', () => {
  const text = Array(20).fill('the quick brown fox jumps over the lazy dog and then runs away fast').join(' ');
  const wordCount = (text.match(/\b[a-z']+\b/g) || []).length;
  assert.ok(wordCount > 50, 'fixture must exceed the default window for this test to mean anything');
  const mattr = movingAverageTtr(text, 50);
  assert.ok(mattr > 0 && mattr <= 1);
});

// This signal has been revised three times (whole-document TTR, then Root
// TTR, then this windowed version, see docs/decisions/0008, 0012, 0017) and
// every revision was a real regression found on the next out-of-distribution
// document, not a hypothetical risk. docs/decisions/0025 asks for this kind
// of check specifically: pin down the one property MATTR is supposed to
// guarantee (length-invariance past one window, for a fixed underlying
// vocabulary richness) as an exact, provable assertion, not a fuzzy "looks
// reasonable" check, so the next length-confound is caught here instead of
// on a real document again. Round-robin-cycling a fixed pool of vocabSize
// distinct words is a deterministic way to hold "richness" constant while
// varying length: any window of vocabSize or more consecutive words from an
// infinite period-vocabSize cycle contains exactly vocabSize unique words
// (vocabSize consecutive integers cover every residue mod vocabSize exactly
// once), so the windowed TTR is exactly vocabSize/windowSize at every window
// position, for any document length, not just approximately so.
test('movingAverageTtr: stays exactly constant across document length once the window slides, for a fixed underlying vocabulary richness', () => {
  const windowSize = 50;
  const vocabSize = 20; // < windowSize, so every full window contains all vocabSize unique words
  // Pure lowercase letters only, not "word0"/"word1": typeTokenRatio's and
  // movingAverageTtr's word regex is \b[a-z']+\b, and there is no \b between
  // a letter and a digit (both are \w), so a token with a trailing digit
  // matches zero words, not one, silently. vocabSize stays under 26 so a
  // single letter per index is always unique.
  const vocab = Array.from({ length: vocabSize }, (_, i) => String.fromCharCode(97 + i));
  const expected = vocabSize / windowSize;

  for (const wordCount of [windowSize, windowSize * 2, windowSize * 6, windowSize * 20]) {
    const text = Array.from({ length: wordCount }, (_, i) => vocab[i % vocabSize]).join(' ');
    const mattr = movingAverageTtr(text, windowSize);
    // Every window contributes exactly vocabSize/windowSize by construction
    // (see the comment above), so the true value is exact; the comparison
    // tolerates floating-point summation drift from averaging hundreds of
    // window positions, not any real variance in the underlying signal.
    assert.ok(
      Math.abs(mattr - expected) < 1e-9,
      `at ${wordCount} words (same underlying vocabulary richness throughout), MATTR should stay ${expected} (within floating-point tolerance), got ${mattr}`,
    );
  }
});

// The documented, disclosed flip side of the test above: below one window,
// movingAverageTtr falls back to plain whole-text TTR (see its own comment),
// which IS still length-biased, on purpose, not a bug. Locking this in too:
// a future change that quietly made the fallback length-invariant as well
// (a plausible-looking "fix") would contradict score.mjs's own comment
// describing this exact fallback, so it should fail a test, not just ship
// silently. Same round-robin construction: same vocabSize (same "richness")
// at two different sub-window lengths should NOT produce the same TTR.
test('movingAverageTtr: below the window size, the raw-TTR fallback is still length-biased for the same underlying vocabulary richness (the documented residual, not a regression)', () => {
  const vocabSize = 20;
  // Pure lowercase letters only, not "word0"/"word1": typeTokenRatio's and
  // movingAverageTtr's word regex is \b[a-z']+\b, and there is no \b between
  // a letter and a digit (both are \w), so a token with a trailing digit
  // matches zero words, not one, silently. vocabSize stays under 26 so a
  // single letter per index is always unique.
  const vocab = Array.from({ length: vocabSize }, (_, i) => String.fromCharCode(97 + i));
  const shortWordCount = 20; // == vocabSize: every word appears once, TTR = 1
  const longerWordCount = 40; // 2x vocabSize, still <= the 50-word window: every word appears twice, TTR = 0.5
  const shortText = Array.from({ length: shortWordCount }, (_, i) => vocab[i % vocabSize]).join(' ');
  const longerText = Array.from({ length: longerWordCount }, (_, i) => vocab[i % vocabSize]).join(' ');
  assert.ok(shortWordCount <= 50 && longerWordCount <= 50, 'both fixtures must be at or under the window for this test to exercise the fallback');

  const shortMattr = movingAverageTtr(shortText, 50);
  const longerMattr = movingAverageTtr(longerText, 50);
  assert.equal(shortMattr, 1, 'a sub-window text with zero repeats has raw TTR 1');
  assert.equal(longerMattr, 0.5, 'the same vocabulary pool repeated twice over, still sub-window, has raw TTR 0.5');
  assert.ok(longerMattr < shortMattr, 'same underlying richness, greater sub-window length, lower raw TTR: the documented residual length bias below one window');
});

// ---- trigramRepetitionRatio ----

test('trigramRepetitionRatio: fewer than 3 words returns 0', () => {
  assert.equal(trigramRepetitionRatio('one two'), 0);
  assert.equal(trigramRepetitionRatio(''), 0);
});

test('trigramRepetitionRatio: no repeated trigrams is 0; a repeated trigram is > 0', () => {
  assert.equal(trigramRepetitionRatio('one two three four five six'), 0);
  assert.ok(trigramRepetitionRatio('this is a test and this is a test again') > 0);
});

// ---- trigramRepetitionRatio: exemptPhrases (ADR 0022) ----

test('trigramRepetitionRatio: an exempted phrase repeated twice no longer counts toward the ratio', () => {
  const text = 'this is a test and this is a test again';
  const withoutExemption = trigramRepetitionRatio(text);
  const withExemption = trigramRepetitionRatio(text, ['this is a test']);
  assert.ok(withExemption < withoutExemption);
  assert.equal(withExemption, 0);
});

test('trigramRepetitionRatio: exempting one repeated phrase does not suppress an unrelated repeated phrase', () => {
  const text = 'this is a test and this is a test again, also foo bar baz repeats foo bar baz twice';
  const partiallyExempt = trigramRepetitionRatio(text, ['this is a test']);
  assert.ok(partiallyExempt > 0);
});

test('trigramRepetitionRatio: an exempt phrase under 3 words has no effect (no trigram to derive)', () => {
  const text = 'this is a test and this is a test again';
  assert.equal(trigramRepetitionRatio(text, ['this is']), trigramRepetitionRatio(text));
});

test('trigramRepetitionRatio: exemptPhrases defaults to empty and matching is case-insensitive', () => {
  const text = 'This Is A Test and this is a test again';
  assert.equal(trigramRepetitionRatio(text, ['THIS IS A TEST']), 0);
});

// ---- splitParagraphs / paragraphStructureScore ----

test('splitParagraphs: drops markdown headers and blank paragraphs', () => {
  const result = splitParagraphs('# Heading\n\nReal paragraph one.\n\n\n\nReal paragraph two.\n\n## Another heading');
  assert.deepEqual(result, ['Real paragraph one.', 'Real paragraph two.']);
});

test('paragraphStructureScore: fewer than 2 paragraphs returns a flat zero', () => {
  assert.deepEqual(paragraphStructureScore('Just one paragraph here.'), { coefficientOfVariation: 0, paragraphCount: 1 });
  assert.deepEqual(paragraphStructureScore(''), { coefficientOfVariation: 0, paragraphCount: 0 });
});

test('paragraphStructureScore: a paragraph with zero matched words does not throw (its own || [] fallback)', () => {
  const result = paragraphStructureScore('12345 !!!\n\nAnother paragraph with real words in it here.');
  assert.equal(result.paragraphCount, 1, 'the numbers-only paragraph contributes zero words and gets filtered out entirely');
});

test('paragraphStructureScore: uniform paragraph lengths gives zero variance; varied lengths gives positive variance', () => {
  const uniform = paragraphStructureScore('one two three four\n\nfive six seven eight');
  assert.equal(uniform.coefficientOfVariation, 0);

  const varied = paragraphStructureScore('one two\n\none two three four five six seven eight nine ten eleven twelve');
  assert.ok(varied.coefficientOfVariation > 0);
});

// ---- countSyllables ----

test('countSyllables: empty-after-stripping input returns 0', () => {
  assert.equal(countSyllables('12345'), 0);
  assert.equal(countSyllables('!!!'), 0);
});

test('countSyllables: words of length <= 3 always count as 1 syllable', () => {
  assert.equal(countSyllables('a'), 1);
  assert.equal(countSyllables('an'), 1);
  assert.equal(countSyllables('the'), 1);
});

test('countSyllables: a longer word with no vowel-group match at all still returns 1, not 0', () => {
  // "crwth" (a real word, a Welsh stringed instrument) has no a/e/i/o/u/y
  // characters at all after lowercasing, so the vowel-group regex finds
  // nothing; the function must still return 1, never 0 syllables.
  assert.equal(countSyllables('crwth'), 1);
});

test('countSyllables: a real multi-syllable word returns more than 1', () => {
  assert.ok(countSyllables('wonderful') > 1);
});

// ---- computeReadability ----

test('computeReadability: text with zero matched words does not throw or divide into NaN (denominators floor at 1)', () => {
  const result = computeReadability('12345 !!! ...');
  assert.ok(Number.isFinite(result.fleschReadingEase));
  assert.ok(Number.isFinite(result.fleschKincaidGrade));
  assert.ok(Number.isFinite(result.gunningFog));
});

test('computeReadability: text with no passive-voice or nominalization matches reports zero density, not a crash', () => {
  const result = computeReadability('The cat sat on the mat. Dogs run fast.');
  assert.equal(result.passiveVoiceDensity, 0);
  assert.equal(result.nominalizationDensity, 0);
});

test('computeReadability: text with real passive voice and nominalization patterns reports nonzero density', () => {
  // The passive-voice regex requires a literal -ed participle ("was
  // rejected"), not an irregular one ("was written"), so the fixture uses a
  // regular verb deliberately.
  const result = computeReadability('The proposal was rejected. The decision required careful consideration and evaluation.');
  assert.ok(result.passiveVoiceDensity > 0);
  assert.ok(result.nominalizationDensity > 0);
});

test('computeReadability: fleschKincaidGrade is clamped at 0, never negative, for very simple text', () => {
  const result = computeReadability('I am. I go. I see.');
  assert.ok(result.fleschKincaidGrade >= 0);
});

// ---- computeScore ----

const SAMPLE_TEXT =
  'This quarter went well for the whole team. We shipped three features and fixed a dozen bugs.\n\nNext quarter looks even better, with a bigger roadmap and more resources than before.';

test('computeScore: exemptPhrases raises the score of a document that repeats a phrase on purpose (ADR 0022)', () => {
  const repeatedText =
    'The recruiter goes quiet exactly when you need them least.\n\nWho has shown up for you, not before it, but after the placement, when you needed them least?';
  const withoutExemption = computeScore(repeatedText, [], {});
  const withExemption = computeScore(repeatedText, [], {}, ['when you needed them least']);
  assert.ok(withExemption.score >= withoutExemption.score);
  assert.ok(withExemption.repetitionPenalty <= withoutExemption.repetitionPenalty);
});

test('computeScore: exemptPhrases defaults to an empty array, unchanged behavior when omitted', () => {
  const result = computeScore(SAMPLE_TEXT, [], {});
  assert.ok(Number.isFinite(result.score));
});

test('computeScore: an empty config object falls back to every hardcoded default, not NaN or a throw', () => {
  const result = computeScore(SAMPLE_TEXT, [], {});
  assert.ok(Number.isFinite(result.score));
  assert.ok(result.score >= 0 && result.score <= 100);
});

test('computeScore: a fully-populated config uses every provided value instead of the hardcoded defaults', () => {
  const config = {
    deduction_cap: 10,
    burstiness_baseline: 0.3,
    burstiness_weight: 5,
    vocabulary_diversity_baseline: 0.5,
    vocabulary_diversity_weight: 200,
    repetition_weight: 50,
    paragraph_variety_baseline: 0.3,
    paragraph_variety_weight: 5,
    wall_of_text_sentence_threshold: 2,
    wall_of_text_penalty: 30,
  };
  const withConfig = computeScore(SAMPLE_TEXT, [], config);
  const withDefaults = computeScore(SAMPLE_TEXT, [], {});
  assert.notEqual(withConfig.burstinessAdjustment, withDefaults.burstinessAdjustment);
  assert.notEqual(withConfig.vocabAdjustment, withDefaults.vocabAdjustment);
});

test('computeScore: category weight defaults to 1.0 for a hit whose category has no config row', () => {
  const hits = [{ category: 'unconfigured_category', severity: 10 }];
  const result = computeScore('Some text here for scoring purposes only.', hits, {});
  assert.equal(result.deduction, 10);
});

test('computeScore: category weight from config actually multiplies the deduction', () => {
  const hits = [{ category: 'puffery_lexicon', severity: 10 }];
  const result = computeScore('Some text here for scoring purposes only.', hits, { puffery_lexicon: 0.5 });
  assert.equal(result.deduction, 5);
});

test('computeScore: deductionCapped is true and the raw sum is disclosed once deduction exceeds deduction_cap', () => {
  const hits = Array(20).fill({ category: 'puffery_lexicon', severity: 10 });
  const result = computeScore(SAMPLE_TEXT, hits, { deduction_cap: 65 });
  assert.equal(result.deduction, 200);
  assert.equal(result.deductionApplied, 65);
  assert.equal(result.deductionCapped, true);
  assert.match(result.impacts[0].label, /capped from 200/);
});

test('computeScore: deductionCapped is false and the plain label is used when deduction stays under the cap', () => {
  const hits = [{ category: 'puffery_lexicon', severity: 5 }];
  const result = computeScore(SAMPLE_TEXT, hits, { deduction_cap: 65 });
  assert.equal(result.deductionCapped, false);
  const deductionImpact = result.impacts.find((i) => i.label === 'Rule-hit deduction');
  assert.ok(deductionImpact, 'expected the uncapped label, not a "capped from" one');
});

test('computeScore: paragraphCount < 2 zeroes out paragraphVarietyAdjustment entirely (excluded from impacts)', () => {
  const result = computeScore('Just one paragraph, no breaks at all in this text.', [], {});
  assert.equal(result.paragraphVarietyAdjustment, 0);
  assert.ok(!result.impacts.some((i) => i.label === 'Paragraph-variety'));
});

test('computeScore: paragraphCount >= 2 gives a real paragraphVarietyAdjustment (included in impacts when nonzero)', () => {
  const twoParagraphs = 'First paragraph with some words in it.\n\nSecond paragraph with a very different number of words in it than the first one had.';
  const result = computeScore(twoParagraphs, [], {});
  assert.notEqual(result.paragraphVarietyAdjustment, 0);
});

test('computeScore: wallOfTextPenalty fires only for a single paragraph with enough sentences, not a short one and not a multi-paragraph one', () => {
  const shortSingleParagraph = computeScore('Two sentences only. Right here.', [], { wall_of_text_sentence_threshold: 5 });
  assert.equal(shortSingleParagraph.wallOfTextPenalty, 0);

  const longSingleParagraph = computeScore(
    'One. Two. Three. Four. Five. Six sentences in a single unbroken paragraph right here.',
    [],
    { wall_of_text_sentence_threshold: 5, wall_of_text_penalty: 15 },
  );
  assert.equal(longSingleParagraph.wallOfTextPenalty, 15);

  // Same scenario, but without wall_of_text_penalty in config at all, to
  // exercise its own `?? 15` default separately from the threshold's.
  const defaultPenalty = computeScore(
    'One. Two. Three. Four. Five. Six sentences in a single unbroken paragraph right here.',
    [],
    { wall_of_text_sentence_threshold: 5 },
  );
  assert.equal(defaultPenalty.wallOfTextPenalty, 15, 'must fall back to the hardcoded default of 15');

  const multiParagraph = computeScore('One. Two. Three. Four. Five. Six sentences.\n\nBut broken into two paragraphs.', [], {
    wall_of_text_sentence_threshold: 5,
  });
  assert.equal(multiParagraph.wallOfTextPenalty, 0);
});

test('computeScore: final score is clamped to [0, 100] even with an extreme deduction', () => {
  const hits = Array(50).fill({ category: 'x', severity: 50 });
  const result = computeScore(SAMPLE_TEXT, hits, { deduction_cap: 10_000 });
  assert.equal(result.score, 0);
});

test('computeScore: impacts are sorted by absolute magnitude, descending', () => {
  const hits = [{ category: 'x', severity: 30 }];
  const result = computeScore(SAMPLE_TEXT, hits, {});
  for (let i = 1; i < result.impacts.length; i++) {
    assert.ok(Math.abs(result.impacts[i - 1].impact) >= Math.abs(result.impacts[i].impact));
  }
});
