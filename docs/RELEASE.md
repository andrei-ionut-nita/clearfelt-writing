# Cutting a release

clearfelt-writing uses plain tags (`v0.1.0`, not `skill-v0.1.0`) since there's only one product in this repo, unlike a multi-surface project that needs a prefix to disambiguate a CLI release from an extension release.

## Versioning

[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the project is pre-1.0:

- Patch (`0.1.1`): rule additions to `rules/`, doc fixes, bug fixes in `scripts/` that don't change behavior anyone depends on.
- Minor (`0.2.0`): a new command, a new script capability (new `detect.mjs` flag, new hook action), a new rule category.
- Treat any breaking change to `scripts/detect.mjs`'s JSON output shape, `clearfelt-writing.config.md`'s setting names, or the rule file bullet format as minor-or-higher and call it out explicitly in the changelog entry, since other tools or scripts might parse these.

## Steps

1. **Update the version.** `SKILL.md`'s frontmatter deliberately does not carry a `version:` field (only `name`/`description`/`license` are in Anthropic's spec, see `scripts/lint.mjs`'s frontmatter check); the version lives in [CHANGELOG.md](../CHANGELOG.md) and the "Current version" line at the bottom of [README.md](../README.md)'s Changelog section. Update that README line to the new version number.
2. **Update the changelog.** Add a new `## [x.y.z] - YYYY-MM-DD` section at the top of [CHANGELOG.md](../CHANGELOG.md), under the `## [Unreleased]` heading if one exists. Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)'s `Added` / `Changed` / `Fixed` / `Removed` grouping.
3. **Audit the skill's own prose.** `detect.mjs` only ever reads the first positional path (`args.paths[0]`), so run it once per file, not one invocation with all four paths (which silently checks only the first and drops the rest): `for f in SKILL.md writing.md voice.md README.md; do node scripts/detect.mjs --mode score "$f"; done` (or `/clearfelt-writing audit` on each) and get every one back above `human_score_threshold` before tagging. A tool whose entire pitch is "a real, sourced, runnable score, not an LLM's opinion of itself" shipping its own pitch document below the bar it enforces on everyone else is not a cosmetic issue, see `docs/decisions/0018`. This drifts on its own even when no one touches these files by hand: prose that scored 90 last release can drift below threshold after an unrelated edit to a neighboring sentence, so this is a real check every release, not a one-time fix.
4. **Update README.md so it actually reflects what's shipping**, not just the version number. Don't skip this, the README is the first thing a new user reads and drifts silently otherwise. Specifically check:
   - **"Major features"** lists every feature added since the last release, not just the ones from the release that first introduced the section.
   - **"Before and after"** example scores are still accurate. These are real, `/clearfelt-writing`-computed numbers, not illustrative round numbers, re-run `node scripts/detect.mjs --mode score <scratch-file>` against both snippets and update the displayed scores if a scoring-formula change (a new signal, a reweighted one, a new cap) moved them. An inaccurate worked example in a deterministic-scoring tool's own README undermines the thing the tool exists to prove.
   - **"Usage"** table and the paragraph below it match every current command flag and behavior (`--mode scan`, intensity tiers, `risk_tier`, whatever shipped this release).
   - **"Architecture"** diagram lists every top-level file or directory a new contributor would actually find (add a line for anything new: a `tests/` directory, a new `scripts/*.mjs`, a new top-level config file).
   - **"Customization"** covers any new hand-editable setting or file (a new `.clearfelt-writing/*` field, a new `clearfelt-writing.config.md` section).
   - Do the same staleness check on `SKILL.md`'s "Configuration" line and [docs/ARCHITECTURE.md](ARCHITECTURE.md)'s file-by-file breakdown (`CLAUDE.md`'s own architecture section is now just a pointer to that file, so the real per-file notes live and drift there), both name specific settings and files by hand.
5. **Run the full verification pass** from [DEVELOP.md](DEVELOP.md): `node --test`, `node scripts/eval.mjs`, `node scripts/qualitative-eval.mjs` (if a new judgment run was recorded this cycle), `node scripts/routing-eval.mjs` (if `SKILL.md`'s Routing section changed, or a new judgment run was recorded this cycle), `node scripts/lint.mjs` (frontmatter, XML well-formedness, rule-source completeness, config-to-code drift, config-defaults drift, `detect.mjs`/`check.mjs` output shape, and the em-dash scan across the whole repo, all in one command), `detect.mjs` against a sample file, the hook on/off round-trip, and the pin/unpin round-trip. CI (`.github/workflows/ci.yml`) runs the first three on every push and PR, but a tag should still get one direct local run before it's pushed.
6. **Commit.** A single commit covering the changelog entry, prose-audit fixes, and README/doc sync is fine; don't bundle unrelated feature work into a release commit.
7. **Tag.**
   ```bash
   git tag -a vX.Y.Z -m "clearfelt-writing vX.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```
8. **Create the GitHub release.**
   ```bash
   gh release create vX.Y.Z --title "clearfelt-writing vX.Y.Z" --notes-file -
   ```
   Pipe in release notes drawn directly from that version's CHANGELOG.md entry, not a fresh summary written from scratch, so the changelog and the release notes never drift apart.

## What doesn't ship in a release

There's nothing to build or publish beyond the repo itself: no npm package, no compiled artifact. The tag and the release are a pointer at a commit, not a build step. `scripts/detect.mjs` and everything else runs directly from the cloned repo at whatever tag the user is on.
