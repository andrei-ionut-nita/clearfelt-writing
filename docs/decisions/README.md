# Architecture decision records

Short records of the real calls made while designing clearfelt, kept here so the reasoning survives past the conversation that produced it.

## ADR vs Note

Every entry below is a full ADR: a real architectural call, something that changes how existing pieces of the system compose (0021's `extends:` changed voice resolution itself; 0011's deduction cap changed how every score is computed). That bar is right for changes at that scale, and wrong to apply to everything: two ADRs came out of one real integration over two days (0021, 0022), and per-edge-case full-ADR documentation doesn't scale past a single user without either becoming a bottleneck or quietly eroding into something shorter than an ADR in practice, while still being called one.

`docs/decisions/notes/` is the lighter tier for the other kind of change: one new, optional, backward-compatible capability that doesn't touch how anything existing behaves (a new CLI flag with a default that changes nothing for callers who don't pass it, one new exported function nothing else is required to call). The actual test: does this change how two existing pieces compose, or does it only add something new alongside them? The former is an ADR. The latter is a Note, same short Context/Decision/Why shape, no separate Consequences section required since there usually isn't one beyond "this is additive." `--exempt-repetition` (0022) is a real, if retroactive, example of a change that could have been a Note: it added one optional parameter to one function, default `[]`, byte-identical behavior for every existing caller. It stayed a full ADR since it was already written that way before this tier existed; nothing here renumbers or downgrades past decisions.

## ADRs

- [0001: Deterministic, script-backed scoring instead of LLM judgment](0001-deterministic-scored-detection.md)
- [0002: Markdown, not JSON, for every user-facing rule and config file](0002-markdown-only-data-files.md)
- [0003: XML for the rewrite pipeline, despite the markdown-only rule](0003-xml-pipeline-format.md)
- [0004: No-fabrication rule and voice-profile precedence](0004-no-fabrication-and-voice-precedence.md)
- [0005: Every rule carries a disclosed source](0005-sourced-rules.md)
- [0006: Confirm before writing, always by default](0006-confirm-before-write.md)
- [0007: Opt-in multi-voice profiles, plus a shared domain profile](0007-multi-voice-and-domain-profiles.md)
- [0008: Readability metrics, tracked separately from the Empathy Index](0008-readability-metrics.md)
- [0009: A four-tier intensity ladder, asked upfront, saved somewhere that survives an update](0009-intensity-ladder-and-saved-preference.md)
- [0010: A risk tier for sensitive documents, an automated test suite, and a lightweight eval set](0010-risk-tier-and-test-suite.md)
- [0011: Cap rule-hit deduction, rescale the statistical signal weights, defer percentile rescaling](0011-deduction-cap-and-signal-rebalance.md)
- [0012: Length-normalized vocabulary diversity (Root TTR), plus lexicon additions](0012-length-normalized-vocabulary-diversity.md)
- [0013: writing.md and voice.md as root-level product doctrine](0013-writing-and-voice-doctrine.md)
- [0014: Multi-dimensional scoring, what shipped and what didn't](0014-multi-dimensional-scoring-scope.md)
- [0015: Locked spans, a per-span preservation guarantee](0015-locked-spans.md)
- [0016: A code-verified preservation checker, not just prompt instruction](0016-preservation-checker.md)
- [0017: Windowed vocabulary diversity (MATTR), replacing Root TTR](0017-windowed-vocabulary-diversity.md)
- [0018: Fixes from a three-persona review (writing, engineering, pipeline design)](0018-multi-persona-review-fixes.md)
- [0019: Model-judged command routing, not a `commands/` directory](0019-model-judged-command-routing.md)
- [0020: Confirm-before-write asks where, not just whether](0020-write-target-menu.md)
- [0021: Platform-scoped voice inheritance, driven by setup](0021-platform-scoped-voice-inheritance.md)
- [0022: Declared repetition exemptions (--exempt-repetition)](0022-repetition-exemptions.md)
- [0023: A disclosed language-confidence warning, not silent misscoring](0023-language-scope-warning.md)
- [0024: Voice register, a non-scored tone-match advisory](0024-voice-register.md)
- [0025: Percentile rescaling stays deferred, with a real bar this time](0025-percentile-rescaling-still-deferred.md)
- [0026: A reference file per command, presentation split from behavior (backfilled)](0026-reference-file-per-command-split.md)
- [0027: scripts/lib/'s four-module boundary (backfilled)](0027-scripts-lib-module-boundary.md)
- [0028: hook.mjs and pin.mjs, adapted from the impeccable skill (backfilled)](0028-hook-and-pin-adapted-from-impeccable.md)
