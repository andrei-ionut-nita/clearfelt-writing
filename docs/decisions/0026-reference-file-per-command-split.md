# ADR 0026: A reference file per command, presentation split from behavior

**Status:** Implemented (backfilled)
**Date:** 2026-08-24 (documents a decision already shipped by the time of writing; see "Backfill note")

## Context

This decision was already live in the repo (`SKILL.md` as a thin router pointing at `reference/audit.md`, `reference/rewrite.md`, `reference/write.md`, `reference/explain.md`, `reference/setup.md`, plus a separate `reference/format/*.md` for each command's output template) before this ADR was written. `docs/ARCHITECTURE.md` describes the split in prose ("full behavior for each command, loaded on demand" and "the presentation template for each command's output, kept separate from behavior"), but no ADR ever recorded why, despite `CLAUDE.md`'s stated norm that a consequential architectural choice gets one. This backfills that record.

Two separate design questions are bundled into one decision here, both real:

1. **Why per-command files at all, instead of one large behavior document?** `SKILL.md` is loaded into every session regardless of which command runs; a monolithic behavior file would mean every invocation pays the context cost of every command's full instructions, even `/clearfelt-writing explain`'s few lines paying for `/clearfelt-writing rewrite`'s much longer preservation-checking and confirmation-flow logic. Splitting by command means only the relevant file loads on demand.
2. **Why split presentation (`reference/format/*.md`) from behavior (`reference/*.md`) instead of one file per command covering both?** The CHANGELOG shows this pair evolving somewhat independently: a single `reference/output-format.md` (see the "Output format contract" entry) was introduced once, generically, to fix a real dogfooding failure (a dense, arrow-heavy response repeating the exact habit the tool exists to remove), and needed to apply uniformly across every command's output (the em-dash and arrow-character ban, the verdict-line convention, the lede-before-every-table rule). A rule that has to be consistent across all five commands belongs in one shared file (`reference/format/conventions.md`) referenced by all of them, not restated five times with the risk of drifting on the fifth restatement; per-command output specifics (the exact table shape for `/clearfelt-writing audit`'s "Where" section, versus `/clearfelt-writing write`'s "What the draft adds") still need their own file, hence `reference/format/<command>.md` per command, mirroring the behavior split at `reference/<command>.md`.

## Decision

Keep both splits as they already exist:

- `SKILL.md`: routing only, no command's full behavior lives here.
- `reference/<command>.md`: full behavior for exactly one command, loaded only when that command runs.
- `reference/format/conventions.md`: presentation rules shared by every command (tables not prose, verdict-before-evidence, the em-dash/arrow ban, lede-per-table).
- `reference/format/<command>.md`: the specific output template and worked example for one command, built on `conventions.md`.

## Consequences

- A new command needs four things, not two: a `reference/<command>.md` (behavior), a `reference/format/<command>.md` (output template), a row in `SKILL.md`'s Commands table, and (per `docs/decisions/0019`) a routing synonym entry.
- A presentation rule that should apply to every command's output goes in `reference/format/conventions.md`; a rule specific to one command's output goes in that command's own `reference/format/<command>.md`. Putting a shared rule in a per-command file is the mistake this split exists to prevent, restating it four more times instead of once.
- `prompts/audit_loop.xml` and `prompts/write_loop.xml` cite `reference/format/*.md` by path. This ADR's backfill was prompted in part by finding that both files still cited the pre-split singular filename, `reference/output-format.md`, in six places, a stale cross-reference from before the split that was never propagated, now fixed.

## Backfill note

This ADR was written after the fact, reconstructing the reasoning from `docs/ARCHITECTURE.md`'s existing prose description and `CHANGELOG.md`'s entries for the original `reference/output-format.md` introduction, not from a contemporaneous discussion. Treat the "Context" section's reasoning as a good-faith reconstruction consistent with the evidence in the repo, not a transcript of the actual decision as it happened.
