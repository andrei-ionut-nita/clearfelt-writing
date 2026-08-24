# ADR 0027: scripts/lib/'s four-module boundary

**Status:** Implemented (backfilled)
**Date:** 2026-08-24 (documents a decision already shipped by the time of writing; see "Backfill note")

## Context

`CHANGELOG.md` records the mechanical event: "`scripts/detect.mjs` (829 lines) split into `scripts/lib/`: `config.mjs` (config precedence, voice/domain overrides), `rules.mjs` (rule-dictionary parsing and matching), `score.mjs` (statistical signals, readability, the score formula), `report.mjs` (summaries and the single-file orchestration)." No ADR ever recorded why the boundary falls exactly there, why four modules and not two or six, or why this split happened when it did. This backfills that record.

The proximate trigger is visible in the same release round: `scripts/check.mjs` and `scripts/explain.mjs` both needed config-precedence logic (`loadConfig`, voice/domain override resolution) that, before this split, only existed inside `detect.mjs` as unexported internals. Two real choices followed from that:

1. **Split by responsibility, not by caller.** The alternative would have been extracting only the specific functions `check.mjs`/`explain.mjs` needed, leaving the rest of `detect.mjs`'s internals in place. That would have left the actual scoring formula and rule-matching logic still locked inside a CLI script, unimportable and only exercisable by re-invoking `detect.mjs` as a subprocess, which is exactly the gap `tests/score.test.mjs`'s own header comment later named directly: score.mjs "was previously exercised only indirectly through detect.mjs's subprocess tests, which never constructed the edge-case inputs... needed to reach several of its branches." Splitting along responsibility (config, rules, scoring, reporting) rather than caller-driven extraction made every piece independently importable and independently testable, not just the two functions the immediate need required.
2. **Four modules, at these specific seams.** `config.mjs` (precedence and override resolution), `rules.mjs` (dictionary parsing and matching), `score.mjs` (statistical signals and the score formula), `report.mjs` (summaries and single-file orchestration) are four genuinely separable concerns: config answers "what settings apply," rules answers "what in this text matches the dictionary," score answers "what number does that produce," and report answers "how does this get assembled and presented." Each has a distinct, narrow set of callers today (`detect.mjs`, `check.mjs`, `calibrate.mjs`, and `explain.mjs` each import a different subset, never all four uniformly), which is itself evidence the seams are real rather than arbitrary: a caller that only needs config precedence (`explain.mjs`) doesn't have to pull in the scoring formula to get it.

## Decision

Keep the four-module boundary as it already exists. `scripts/detect.mjs` stays a thin CLI entrypoint (arg parsing, mode dispatch) importing from `scripts/lib/`; `scripts/check.mjs`, `scripts/calibrate.mjs`, and `scripts/explain.mjs` import only the specific modules they need, never re-implementing config precedence or rule matching independently.

## Consequences

- A new script needing config precedence, rule matching, or scoring imports the relevant `scripts/lib/` module directly; re-implementing any of it locally (the failure mode this split exists to prevent) is a bug to fix, not a style preference.
- `score.mjs` stays a pure function library (see `tests/score.test.mjs`'s own convention: tested by direct import, not as a subprocess, unlike every real CLI entrypoint) specifically because this split kept it free of CLI parsing and file-system concerns; a future change that reintroduces `process.argv` handling or `console.log` calls into `score.mjs` would be quietly eroding this boundary back toward the pre-split single-file shape.
- `scripts/lint.mjs`'s `checkConfigDrift()` scans every `.mjs` file under `scripts/` (not a hardcoded `detect.mjs`/`hook.mjs` file list) specifically because this split already happened once and a hardcoded file list would have silently stopped catching drift the moment config-reading code moved.

## Backfill note

This ADR was written after the fact, reconstructing the reasoning from `CHANGELOG.md`'s entry for the split and the caller-shape evidence still visible in the current code (which script imports which module), not from a contemporaneous discussion. Treat the "Context" section's reasoning as a good-faith reconstruction consistent with the evidence in the repo, not a transcript of the actual decision as it happened.
