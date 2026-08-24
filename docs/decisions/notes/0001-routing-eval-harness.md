# Note 0001: A routing-judgment eval harness

**Date:** 2026-08-24

## Context

`docs/decisions/0019` chose model-judged command routing (`SKILL.md`'s Routing section) over a Claude-Code-specific `commands/` directory, on purpose, to keep `/clearfelt-writing audit`/`rewrite`/`write`/`setup`/`explain` dispatchable from plain instructions on any Skills-compatible agent. That ADR's own "Why" section calls the residual risk "a description/synonym-coverage problem," but nothing in the repo ever measured that coverage: every other reasoning-shaped or scored signal in this project has a fixture set and a script that reports how well it's doing (`scripts/eval.mjs` for the Human Score, `scripts/qualitative-eval.mjs` for the five qualitative signals in `reference/audit.md`), except routing, which had zero fixtures and zero automated check of any kind.

## Decision

`tests/fixtures/routing/manifest.json`, 19 labeled requests (five explicit commands, ten SKILL.md-listed or closely paraphrased synonyms, four ambiguous-or-bare-invocation cases expecting the menu fallback), plus `scripts/routing-eval.mjs` and `tests/fixtures/routing/runs/README.md`, built to the exact same shape `qualitative-eval.mjs` already established: routing is a model-judgment call this dependency-free, no-API-calls repo cannot automate, so the script only scores judgments a Claude Code session already recorded (`runs/*.json`), reporting per-run accuracy against the manifest and pairwise agreement once two or more runs exist. `schemas/routing-manifest.schema.json` documents the manifest shape, same documentation-only role as `schemas/qualitative-manifest.schema.json`.

Seeded with two runs to validate the harness itself: one from the session that authored the manifest, one from an independent subagent given only `SKILL.md` and the 19 request texts, no expected labels. Both scored 19/19 against the manifest, 100% pairwise agreement, an honest first data point, not proof the routing table is bulletproof at a scale this small.

This is additive only: no change to `SKILL.md`'s actual routing behavior, `scripts/detect.mjs`, or any existing script's output. It only adds a new, optional, standalone way to measure something that was previously unmeasured, the same "does this change how existing pieces compose, or only add something alongside them" test `docs/decisions/README.md`'s ADR-vs-Note section sets, which is why this is a Note rather than a full ADR.
