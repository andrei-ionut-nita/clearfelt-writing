# Writing principles

This is clearfelt-writing's editorial doctrine: what it considers bad writing, what it always preserves, and when it should not rewrite at all. It governs the product's judgment, not any one user's style, that layer is `voice.md` and `.clearfelt-writing/voice-profile.md`. Read this before authoring a new rule, changing a scoring weight, or editing `prompts/audit_loop.xml`'s rewrite instructions: a change that contradicts this file is a signal to update this file first, not to quietly drift past it.

This file is referenced by the scoring and rewrite pipeline (`SKILL.md`, `prompts/audit_loop.xml`), not just stored as background reading. If a rule or a rewrite instruction stops matching what's written here, one of the two is wrong.

## Doctrine

- **Writing quality is context-dependent.** The same sentence can be a tell in one register and correct in another. `rules/` flags surface patterns; `.clearfelt-writing/domain.md`'s exemption list and `risk_tier` are how context overrides a surface match, not an afterthought bolted onto the score.
- **Formality is not a flaw.** Dense, hedged, technically precise writing is not the same problem as AI-generated writing, even though both can look formal from a distance. `docs/RESEARCH.md`'s "Human situatedness" section and `reference/audit.md`'s qualitative signals exist because the actual tell is over-resolution and absence of stakes, not sentence complexity. A rule that would flag careful legal, medical, or technical prose for being careful is a bad rule, not a strict one.
- **Clarity and specificity matter more than warmth.** The Human Score is not a warmth meter; "sounds warmer" is not clearfelt-writing's actual success criterion; `docs/decisions/0008` deliberately keeps readability separate from the score for the same reason, being easy to read and sounding human are different axes. Do not add a rule or rewrite instruction whose only justification is "this would sound friendlier."
- **Genre conventions must be respected.** A support reply, an executive summary, and a legal clause are not failing to sound human when they sound like a support reply, an executive summary, or a legal clause. See the "sensitive" bucket in `tests/fixtures/eval/manifest.json` for a fixture built specifically to check this: dense, hedged, legalese-adjacent text should score high, not get punished for its register.
- **Deterministic, not decorative.** Every claim this file makes about what clearfelt-writing does should be checkable by reading `scripts/detect.mjs`, `rules/`, or `prompts/audit_loop.xml`, the same standard `docs/decisions/` holds itself to. If this file describes behavior the code doesn't actually implement, the code is out of date, or this file is wrong; fix whichever one is actually true.

## What clearfelt-writing improves

- Generic, inflated, or costless-sounding phrasing (`rules/antipatterns/`, `rules/banned_words/`).
- Repetition: literal (`trigramRepetitionRatio`), and to the extent it can be checked without comparing sentence meanings, synonym cycling (see "Qualitative signals" in `reference/audit.md`).
- Structural tells: uniform sentence and paragraph rhythm, wall-of-text formatting, throat-clearing openers, fake-profound closers, binary-contrast rhetoric.
- Claims that skip past any real difficulty, risk, or tradeoff (`frictionless_claims.md`, and the whole-piece "does this admit any real stakes" reasoning step in `reference/audit.md`).

## What clearfelt-writing preserves

- **Meaning and facts, always the instruction, verified where verification can be trusted.** The no-fabrication rule (`docs/decisions/0004`): a rewrite is never instructed to introduce a name, date, statistic, or citation absent from the source. Vague language gets tightened, never replaced with an invented specific. `scripts/check.mjs` (`docs/decisions/0016`) verifies this after the fact, and the two guarantees are not the same strength: a locked span is a deterministic, always-blocking check; a dropped or added number, date, proper noun, or quote is regex-based heuristic detection, warns by default, and only blocks the write if a project has explicitly turned on `check.hard_fail_on_dropped_fact`/`check.hard_fail_on_added_fact`. "Always" describes the standard the rewrite instruction is held to, not a claim that every violation of it is automatically caught.
- **A user's stated voice**, over the shipped rule files, for that project (`docs/decisions/0004`'s voice-profile precedence; see `voice.md`).
- **Domain-specific terms and target reading level** a project has explicitly declared exempt (`.clearfelt-writing/domain.md`).
- **Hedges, qualifiers, and attributions in a document marked `risk_tier: sensitive`**, at every intensity tier, including `structural_rework` (`docs/decisions/0010`, enforced directly in `prompts/audit_loop.xml`, not just documented).
- **Any span wrapped in `<!-- clearfelt-writing-lock -->` markers**, at every intensity tier, a narrower, per-span version of the same guarantee for content that doesn't need the whole project marked sensitive (`docs/decisions/0015`, `reference/rewrite.md`'s "Locked spans").
- **Paragraph structure and length**, at the two most conservative intensity tiers (`light_touch`, `balanced`); only `full_rewrite` and `structural_rework` are allowed to restructure at all, and even then bounded by everything above (`reference/rewrite.md`).

## Refusal and conservatism rules

- Do not rewrite past what the resolved intensity tier scopes in (`reference/rewrite.md`'s tier table is the actual boundary, not a suggestion).
- Do not write to a file without explicit confirmation, ever, by default (`docs/decisions/0006`); this is not a threshold-dependent judgment call.
- Do not soften a hedge, qualifier, or attribution in `risk_tier: sensitive` content regardless of how aggressive the requested intensity is.
- When a document already scores above `human_score_threshold`, or a passage isn't flagged by either the report or the tier-suppression-bypassed scan, leave it alone; "could this be punchier" is not a rewrite justification on its own.

## Editorial rule

Only change text when the change improves clarity, specificity, or reader trust without weakening meaning, without erasing a genre convention that belongs there, and without touching what the sections above say to preserve. Everything else in `rules/`, `clearfelt-writing.config.md`, and `prompts/audit_loop.xml` is an implementation of this one sentence; when they seem to disagree with it, this sentence wins, and the implementation should be fixed to match.
