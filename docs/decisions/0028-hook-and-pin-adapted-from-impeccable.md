# ADR 0028: hook.mjs and pin.mjs, adapted from the impeccable skill

**Status:** Implemented (backfilled)
**Date:** 2026-08-24 (documents a decision already shipped by the time of writing; see "Backfill note")

## Context

`docs/ARCHITECTURE.md` already states this plainly: "`scripts/hook.mjs`, `scripts/pin.mjs`: hook admin/runtime and shortcut-skill creation, adapted from the `impeccable` skill's equivalent scripts." `scripts/pin.mjs`'s own header comment confirms it directly ("Adapted from impeccable's scripts/pin.mjs: same harness-directory discovery, same pin-marker-comment convention"), and `CHANGELOG.md` records the sibling `~/.clearfelt-writing/settings.md` global-settings pattern as "modeled directly on impeccable's home-directory settings pattern (verified by inspection, not assumed)." What never got recorded as its own decision is the scope boundary this borrowing sits inside: `hook.mjs` and `pin.mjs` are the two places `CLAUDE.md`'s "Claude Code only, v1" rule actually bites, the two scripts in the whole repo allowed to be harness-specific, and that carve-out deserves its own record rather than living only as a passing mention in a different ADR (`docs/decisions/0019`) about routing.

Two real choices are bundled here:

1. **Reuse an existing, working pattern rather than design a new one.** `impeccable` (a sibling skill, referenced elsewhere in this repo's own doctrine, `docs/decisions/0013` explicitly avoided a filename collision with it) had already solved hook-registration and shortcut-skill creation against Claude Code's actual `.claude/settings.local.json` format and harness directory layout. Re-deriving that from scratch would have meant re-solving already-solved problems (where Claude Code actually looks for hook config, how a shortcut skill's `SKILL.md` needs to be shaped, how to avoid clobbering a user's unrelated skill when pinning) with no benefit over adapting a design already verified to work.
2. **Confine the borrowing to exactly these two scripts, not the rest of the skill.** `CLAUDE.md`'s "Claude Code only, v1" rule states the boundary explicitly: everything else in the skill, `/clearfelt-writing audit`/`rewrite`/`write`/`setup`/`explain`, stays "plain instructions any agent can follow" specifically so the `npx skills add` distribution path keeps working on other Skills-compatible agents, per `docs/decisions/0019`. `hook.mjs` and `pin.mjs` are allowed to break that portability rule only because they have no way to do their job at all without Claude Code's actual config format (`.claude/settings.local.json`) and harness directory layout; a hook or a pinned shortcut has no meaningful equivalent to fall back to on an agent that doesn't share that format.

## Decision

Keep `hook.mjs` and `pin.mjs` as adaptations of `impeccable`'s equivalent scripts, and keep the scope boundary as `CLAUDE.md` already states it: these two scripts, and no others, are allowed to be Claude Code-specific. Any future script that would need harness-specific behavior needs the same explicit justification (no meaningful cross-agent equivalent exists) before joining this list, per `CLAUDE.md`'s own process for revisiting the "Claude Code only, v1" rule.

## Consequences

- A behavior change to how Claude Code stores hook config or harness skill directories should be checked against `impeccable`'s own handling first, not solved independently in this repo, keeping the two skills' approaches from silently diverging on the same underlying mechanism.
- `docs/DEVELOP.md`'s "Testing pin/unpin" section's marker-comment safeguard (`unpin` only ever removes a directory whose `SKILL.md` carries `<!-- clearfelt-writing-pinned-skill -->`) is inherited from `impeccable`'s own design, not a clearfelt-writing-specific invention; a future contributor auditing this safeguard for correctness should know it has already been exercised in a second codebase, not treat it as unverified here.
- This is the concrete precedent `docs/decisions/0019`'s "What would change this" section points back to: if the "Claude Code only, v1" scope rule is ever revisited for the interactive commands, `hook.mjs`/`pin.mjs`'s existing carve-out is the model for how a justified, narrow exception gets scoped, not a reason to assume the same exception should widen automatically.

## Backfill note

This ADR was written after the fact, reconstructing the reasoning from `docs/ARCHITECTURE.md`'s existing prose, `scripts/pin.mjs`'s own header comment, and `CLAUDE.md`'s stated scope rule, not from a contemporaneous discussion. Treat the "Context" section's reasoning as a good-faith reconstruction consistent with the evidence in the repo, not a transcript of the actual decision as it happened.
