# /clearfelt-writing explain

Read-only. Prints every currently-resolved setting and where it came from, before running anything else. Modeled on the same simplicity as `reference/hooks.md`: one script, one JSON payload, presented as tables.

## Flow

1. If `voice.mode` is `multi` (see `clearfelt-writing.config.md`) and no voice was named in the request, ask which voice applies before continuing, then pass it as `--voice <name>`.
2. Run: `node scripts/explain.mjs [--voice <name>]`
3. Present the JSON following [reference/format/explain.md](format/explain.md)'s template, itself built on [reference/format/conventions.md](format/conventions.md): tables, not a prose summary. One table for voice/domain state, one table for config (Setting | Value | Source), one table for hook state.
4. If `.clearfelt-writing/voice-profile.md` or `.clearfelt-writing/domain.md` doesn't exist, say so plainly in the relevant row rather than leaving a blank cell, and mention once that `/clearfelt-writing setup` builds them.
5. Never edits anything. If the user wants to change what's shown, point them at `/clearfelt-writing setup` (voice/domain), `$clearfelt-writing hooks` (hook state), or a direct edit to `clearfelt-writing.config.md` / `~/.clearfelt-writing/settings.md` / `.clearfelt-writing/domain.md` depending on which layer they want to change.

## Why this exists

`/clearfelt-writing rewrite` and `/clearfelt-writing audit` already surface *some* resolved state inline (which intensity is running and why, whether a project is marked sensitive), but only the pieces relevant to that one run, and only once, in the middle of another command's output. `/clearfelt-writing explain` is the one place to see everything at once, before committing to a run: which voice profile is active and how many words it overrides, whether a domain profile exists and what its risk tier and preferred intensity are, every config setting's final value and which of the three layers (default, shipped `clearfelt-writing.config.md`, global `~/.clearfelt-writing/settings.md`) it actually came from, and whether the auto-audit hook is currently on.

## Output

`scripts/explain.mjs` returns:

- `voice`: `mode`, `profilePath`, `exists`, `keptWordsCount` (how many words the active voice profile protects from the shipped rule dictionary).
- `domain`: `exists`, `riskTier`, `mode`, `preferredIntensity`, `targetGradeLevel` (with its own `source`), `exemptTermCount`.
- `config`: every setting from `clearfelt-writing.config.md`, each as `{ value, source }` where `source` is `"default"`, `"shipped (clearfelt-writing.config.md)"`, or `"global (~/.clearfelt-writing/settings.md)"`.
- `hook`: `enabled`, `quiet`, `ignoreRules`, `ignoreFiles` (same shape `$clearfelt-writing hooks status` prints).
- `stateMap`: the canonical, always-current version of the table below (five entries, `location`/`scope`/`holds`/`precedence`). Present the same information from this static field, not by re-deriving it from `voice`/`domain`/`config`/`hook` yourself, so it can't drift from what those fields actually show.

## Where state lives (the canonical map)

Every other reference file explains one piece of this precedence picture in passing, where it's directly relevant, `reference/rewrite.md`'s "Resolving which intensity runs" for `preferred_intensity` specifically, `voice.md` for the voice-profile override axis, and so on. This table is the one place all five locations are listed together, so a reader doesn't have to reconstruct the full picture by reading every command's reference file. `/clearfelt-writing explain`'s presentation should include this table (or the equivalent `stateMap` field above) even when every individual value it lists is unset, so a first-time user sees the whole shape before touching anything.

| Location | Scope | What it holds | Precedence |
|---|---|---|---|
| `clearfelt-writing.config.md` (repo root) | Skill-level, every project using this install | Every scoring/behavior tunable, one Markdown table. Tracked in git, reset on every skill update. | Base layer for every numeric/boolean setting. |
| `~/.clearfelt-writing/settings.md` (home directory) | User-level, every project on this machine | A user's saved global preference for any `clearfelt-writing.config.md` key (`intensity`, `length`, thresholds, ...). Never shipped, never touched by an update. | Overrides `clearfelt-writing.config.md`. Itself overridden, for the handful of keys with a project-level counterpart below, by `.clearfelt-writing/domain.md`. |
| `.clearfelt-writing/domain.md` (project) | Project-level, shared by everyone on the project | `mode`, `risk_tier`, `preferred_intensity`, `preferred_length`, `target_grade_level_min`/`max`, technical-term exemptions. | Highest precedence for the specific fields it sets. Falls through to `~/.clearfelt-writing/settings.md`, then `clearfelt-writing.config.md`, for anything it leaves unset. |
| `.clearfelt-writing/voice-profile.md` (or `.clearfelt-writing/voices/<name>.md`) (project) | Project-level, per-writer (or per-platform via `extends:`) | Vocabulary preferences, sentence-rhythm notes, register, personal calibration. A stated preference here always overrides the shipped rule dictionary for its own scope (`docs/decisions/0004`). | Its own axis, not part of the numeric-config chain above: this overrides *rule matching*, not a config value. |
| `.clearfelt-writing/hook-state.md` (project) | Project-level | Auto-audit hook on/off, ignored rules/files, quiet mode. | Its own axis, managed only through `$clearfelt-writing hooks`, never resolved through the config chain above. |
