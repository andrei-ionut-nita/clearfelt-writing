# clearfelt-writing

A deterministic editorial toolkit built for Claude Code, and usable on any Skills-compatible agent: strip AI-sounding writing, keep every writer's voice consistent, catch what doesn't read at the right level, all backed by a real, sourced, runnable score instead of an LLM's opinion of itself.

## Why

Most anti-AI-slop tools work the same way: a big prompt tells the model what to avoid, and you trust the rewrite. clearfelt-writing is deterministic and scored instead. `scripts/detect.mjs` parses the Markdown rule files in this repo and computes a 0 to 100 Human Score in code, so the number is reproducible by anyone who runs the script, on any file, at any time, not just something an LLM estimated while reading your text.

**Runs entirely on your machine.** `scripts/detect.mjs` and everything it imports have zero dependencies, Node's standard library only, no network calls: nothing you write is ever sent anywhere. Verifiable directly from the code, not just a claim, see "Quick start" below.

**Scope.** clearfelt-writing helps your own writing sound like you, consistently, across drafts. It's not built or intended to help disguise AI-generated text as human-written in a context where that distinction actually matters, an academic submission, a byline, anywhere an authorship claim carries real weight. See `docs/ROADMAP.md`'s Feature E for the related, and rejected, "clearfelt-writing viral" idea.

## 60-second start

No setup, no voice profile, no config file, no `.clearfelt-writing/` directory. Just run it against any file:

```bash
node scripts/detect.mjs --mode report yourfile.md
```

Real output, from a fresh file in an empty directory, nothing configured first:

```json
{
  "target": "yourfile.md",
  "score": 22,
  "leadDriver": "Rule-hit deduction (capped from 67) (-65 of the score)",
  ...
}
```

Everything past this point, voice profiles, domain context, personal calibration, constraint sets, is optional depth you add later with `/clearfelt-writing setup` when you want it, never a prerequisite to get a first real score.

## Major features

- **Deterministic Human Score.** `scripts/detect.mjs` computes the score in code, reproducible by anyone, not estimated by an LLM.
- **Sourced rule dictionary.** Every rule cites real research ([docs/SOURCES.md](docs/SOURCES.md)) or named prior art, nothing asserted without a disclosed origin. A handful of words carry an honestly-labeled `unresolved-*` source, a citation nobody could verify, and stay off by default rather than counting against your score; see `rules.include_unresolved` in `clearfelt-writing.config.md`.
- **Confirms before it writes anything.** `/clearfelt-writing rewrite` walks you through a before/after and asks first; it never silently overwrites your file.
- **Multi-voice for teams, or multiple platforms for one writer.** One shared voice by default, a separate profile per writer, or (new) a shared base profile with `extends:` overrides per platform, so a writer publishing to LinkedIn and a newsletter shares 90% of one voice profile instead of maintaining two full copies.
- **Domain-aware, no false positives on real jargon.** `.clearfelt-writing/domain.md` exempts legitimate technical terms a generic banlist would otherwise flag.
- **Readability, tracked separately from AI-tell scoring.** Flesch-Kincaid, Gunning Fog, and processing-fluency signals, so audience-fit and slop-detection never get conflated into one blurry number. Calibrated for US-school-grade, English-language, general-audience text; not validated for other languages or specialist audiences, set your own range in `.clearfelt-writing/domain.md` if that doesn't fit.
- **Everything hand-editable, no JSON.** Rules, config, voice, and domain files are all plain Markdown.
- **Baseline diffing, hooks, and pin shortcuts.** Built for repeated use on an expanding pile of drafts, not a one-off scan. Baseline diffing runs anywhere; the auto-audit hook and pin shortcuts only work in Claude Code (see "Quick start").
- **Sorted, not dumped.** The score report leads with what actually drove the number, groups repeated hits into one row with an occurrence count, and shows category point subtotals sorted by impact, not a flat list in rule-file order.
- **`/clearfelt-writing write` for a blank page, not just an existing draft.** Turns a seed (a rough note, a paragraph pasted directly into the request) into a full first draft at a chosen length (short, medium, or long), gathered through a quick interview, then runs the draft through the identical scoring and preservation-check pass `/clearfelt-writing rewrite` uses. Never overwrites the seed.
- **Hard, checkable constraints, not just a hope the rewrite lands under a limit.** `--max-chars`/`--max-words`/`--must-contain`/`--must-not-contain` on `/clearfelt-writing rewrite` or `/clearfelt-writing write`, inline or as a reusable `.clearfelt-writing/constraints/<name>.md` set, verified by `scripts/check.mjs` against the candidate text it actually produced, no prompt-only promise involved.
- **Locked spans.** Wrap any text in `<!-- clearfelt-writing-lock -->` / `<!-- /clearfelt-writing-lock -->` to keep it byte-identical through every rewrite intensity, for a verbatim quote or a legal boilerplate footer without marking the whole project sensitive.
- **Personal calibration.** `scripts/calibrate.mjs`, run automatically by `/clearfelt-writing setup` when you hand it a writing sample or a folder of past writing, measures your own natural sentence-length variance, paragraph-length variance, and vocabulary diversity and stores them in your voice profile, so scoring compares you to your own rhythm instead of a generic baseline.
- **A risk tier for sensitive documents.** Set `risk_tier: sensitive` in `.clearfelt-writing/domain.md` for a shareholder letter, a filing, anything Legal has reviewed, and `/clearfelt-writing rewrite`/`write` stop rewriting away hedges and qualifiers and force the confirmation gate on, regardless of other settings.
- **A durable log of every write.** `/clearfelt-writing rewrite` and `/clearfelt-writing write` append to `.clearfelt-writing/audit.log` on every approved write, the first record that survives past the terminal session that approved it.
- **A code-verified preservation guarantee, not just a prompt instruction.** `scripts/check.mjs` deterministically diffs a rewrite candidate against its source: a locked span that changed, or a constraint that's missed, always blocks the write; a dropped or added number, date, proper noun, or quote surfaces as a disclosed warning by default.
- **See exactly what's active before you run anything.** `/clearfelt-writing explain` prints every resolved config setting and which layer set it (default, shipped, or your global override), plus voice/domain/hook state, in one place.
- **Voice register, an advisory tone check, never scored.** Set `register: direct` or `register: warm` in a voice profile (default: `neutral`, off) and `/clearfelt-writing audit` flags words that don't match, hedging past the point of a real position, or accusatory language sharper than the voice calls for, as a plain note, never a score deduction. See `docs/decisions/0024-voice-register.md`.
- **Tested, not just trusted.** `node --test` runs a real regression suite (197 tests) against every script, not just `scripts/detect.mjs`; `node scripts/eval.mjs` checks the score against a labeled corpus and reports the pass rate honestly, including where it currently falls short; `node scripts/lint.mjs` catches repo-consistency drift (stale config defaults, an undocumented rule source, a malformed config row) before it ships; `node scripts/routing-eval.mjs` scores recorded judgment runs against a labeled set of requests to check how reliably `SKILL.md`'s Routing section dispatches to the right command, the same honest, no-API-call approach `scripts/qualitative-eval.mjs` already uses for the score's reasoning-only signals.

## Quick start

```bash
npx skills add andrei-ionut-nita/clearfelt-writing
```

Uses the [skills CLI](https://github.com/vercel-labs/skills), which auto-detects Claude Code (and 70-plus other agents) and installs clearfelt-writing into the right `skills/` directory for you. Add `-g` to install globally instead of per-project, or `-a claude-code` to target Claude Code specifically if you have more than one agent installed.

**Compatibility.** `/clearfelt-writing setup`, `audit`, `rewrite`, `write`, and `explain` are plain Markdown instructions with no Claude Code-specific tool calls, so they work on any agent that supports the Skills format, not just Claude Code. `$clearfelt-writing hooks` and `scripts/pin.mjs`'s pin shortcuts are the exception: both write into `.claude/settings.local.json`, Claude Code's own config format, which has no equivalent on other agents.

Prefer to manage it yourself:

```bash
git clone <this-repo> ~/.claude/skills/clearfelt-writing
```

Either way, that's the whole install. `scripts/detect.mjs` has zero external dependencies, only Node's standard library, so nothing else to `npm install`.

Then, in Claude Code, in any project:

```
/clearfelt-writing setup
```

Optional, but recommended first: a short adaptive interview that builds a voice profile and a domain profile, so audit, rewrite, and write all preserve your own quirks and don't flag your field's normal jargon. Skip it and every command still works fine on bundled defaults.

```
/clearfelt-writing audit path/to/draft.md
```

You'll get a score, a readability report, and a list of hits with line numbers. Nothing gets edited. When you're ready to fix it:

```
/clearfelt-writing rewrite path/to/draft.md
```

First it previews what it would change and asks how far to go, light touch (just those items) up to structural rework (paragraph breaks and reordering too). Then it runs the pass, hands you a diff, and waits for a yes before touching the file. Two separate approvals, not one.

Starting from an idea instead of a draft:

```
/clearfelt-writing write path/to/notes.md
```

or paste the seed directly into the request. A quick round of questions (format, length, audience) fills in whatever the seed doesn't already say, then it drafts, scores, and runs the same preservation check as `rewrite`, and writes to a new file next to the seed (never overwriting it) once you approve.

## Before and after

Scores below are real, computed by running `scripts/detect.mjs` against these exact snippets, not illustrative round numbers. They move whenever the scoring formula does, see `docs/RELEASE.md`'s release checklist for keeping them current.

**Before** (Human Score: 22)

> In today's fast-paced digital world, it is important to note that AI is transforming every industry. It's not a tool. It's a revolution. Experts agree that companies must delve into this technology to unlock seamless growth. The future isn't coming. It's already here.

**After** (Human Score: 100)

> AI is already changing how most industries work, and that's not really in dispute anymore. What's less obvious is how fast companies actually need to move on it. We've seen teams get real traction just by picking one workflow and testing it for a month. That's usually enough to know if it's worth the bigger commitment.

**Before** (Human Score: 62)

> Our platform offers a seamless, robust solution that delivers pivotal insights. Studies show that businesses leveraging our tools see paramount improvements. In conclusion, this is a game-changer for your organization.

**After** (Human Score: 100)

> Our platform gives you insights you can actually act on, without the setup headache most tools come with. Teams using it tend to see real gains fast. If your org is stuck deciding, this is probably the push you need.

## Usage

| Command | Does |
|---|---|
| `/clearfelt-writing setup` | Builds or updates a voice profile (or profiles, in multi-voice mode) and a domain profile. Optional, recommended first, re-runnable any time. |
| `/clearfelt-writing audit [path]` | Scores a file or directory, reports every hit plus a separate readability report, never edits anything. |
| `/clearfelt-writing rewrite [path]` | Rewrites the file in memory, looping the scrub, re-score, and preservation-check steps until it clears the threshold (default 85) or hits the iteration cap (default 3), then shows a before/after and asks before writing. |
| `/clearfelt-writing write [seed]` | Drafts a new piece from a seed (a file path or pasted text) at a chosen length, runs it through the same scoring and preservation check as `rewrite`, and writes to a new file next to the seed, never the seed itself, after you approve. |
| `/clearfelt-writing explain` | Prints every currently-resolved config setting and where it came from, plus voice/domain/hook state. Never edits anything. |
| `$clearfelt-writing hooks <status\|on\|off\|ignore-rule\|ignore-file\|reset>` | Manages an auto-audit hook that scores text files after you edit them. |
| `node scripts/pin.mjs <pin\|unpin> <audit\|rewrite\|write\|explain\|setup>` | Creates or removes a `$clearfelt-writing-<command>` shortcut skill. |

`/clearfelt-writing rewrite` asks which of four intensities to use (light touch, balanced, full rewrite, structural rework), previewing the target list first; `/clearfelt-writing write` asks a length instead (short/medium/long), since there's no existing text to decide how much of to touch. Answer once and either command offers to remember the choice: globally (`~/.clearfelt-writing/settings.md`, your home directory, safe across skill updates) or just for this project (`.clearfelt-writing/domain.md`). The file itself isn't touched until you sign off on the result; set `rewrite.require_confirmation: false` in `clearfelt-writing.config.md` only for a deliberately unattended run (this gate is shared by `write`, not a second setting for the same guarantee). Every approved write lands a line in `.clearfelt-writing/audit.log`. For a project where a rewrite carries real legal or reputational weight, set `risk_tier: sensitive` in `.clearfelt-writing/domain.md`: hedges and qualifiers stop being fair game, and the sign-off step becomes mandatory regardless of any other setting.

## Using it on content pipelines

If you're running clearfelt-writing repeatedly over a growing set of drafts (a content calendar, a blog backlog, a batch of LinkedIn posts), save a baseline after your first pass and diff against it later so you only see new slop, not the same old hits every time:

```bash
node scripts/detect.mjs --mode report drafts/ --save-baseline .clearfelt-writing/baseline.json
# ...later, after adding more drafts...
node scripts/detect.mjs --mode report drafts/ --baseline .clearfelt-writing/baseline.json
```

If your team has more than one writer, set `voice.mode: multi` in `clearfelt-writing.config.md`, run `/clearfelt-writing setup` once per writer, and pass `--voice <name>` (or let the skill ask which voice applies):

```bash
node scripts/detect.mjs --mode report drafts/sarah-post.md --voice sarah
```

If instead it's one writer publishing to more than one platform, `/clearfelt-writing setup` can build a shared `general.md` plus a thin `extends: general` override per platform, so you're not maintaining two nearly-identical profiles by hand:

```bash
node scripts/detect.mjs --mode report drafts/linkedin-post.md --voice linkedin
```

If a draft deliberately repeats a phrase, a hook/CTA callback or anaphora, not AI-model filler, tell the scorer so the repeated-phrase penalty doesn't fight a real writing technique (see `docs/decisions/0022`):

```bash
node scripts/detect.mjs --mode report drafts/linkedin-post.md --exempt-repetition "when you need them least"
```

## Customization

Every file you're meant to hand-edit is plain Markdown. No JSON, no code syntax to break.

- **Add or remove a banned word:** open the relevant file under `rules/banned_words/`, or copy `rules/banned_words.local.example.md` to `banned_words.local.md` in the same folder for a personal-only addition that never touches the shared files.
- **Add a banned phrase or pattern:** same idea, under `rules/antipatterns/`, with `rules/antipatterns.local.example.md` as the personal-only template.
- **Change scoring behavior:** every threshold, weight, and setting lives in one table-based file, `clearfelt-writing.config.md`.
- **Set your own voice:** run `/clearfelt-writing setup`, or hand-edit `.clearfelt-writing/voice-profile.md` directly using `templates/voice-profile.example.md` as a guide. A preference stated there always overrides the shipped banlist. For a team with multiple writers, or one writer with multiple platforms, see `voice.mode` above and `templates/voice-profile.example.md` per writer or platform under `.clearfelt-writing/voices/`; a platform file can start with `extends: <base-name>` to inherit a shared profile instead of duplicating it, see `templates/voice-profile.example.md`'s own top section for the merge policy.
- **Exempt your domain's jargon:** run `/clearfelt-writing setup`, or hand-edit `.clearfelt-writing/domain.md` using `templates/domain.example.md` as a guide. Shared by everyone on the project, unlike a voice profile.
- **Mark a project legally or reputationally sensitive:** set `risk_tier: sensitive` in `.clearfelt-writing/domain.md`. See `reference/rewrite.md`'s "Risk tier" section for exactly what this changes.
- **Save a preference across every project:** hand-edit `~/.clearfelt-writing/settings.md` (same table format as `clearfelt-writing.config.md`), or let `/clearfelt-writing rewrite`/`write`'s save prompt write it for you. This file lives outside the skill's repo entirely, so it's the one place a customization survives a `git pull` or reinstall of the skill itself.
- **Protect a specific piece of text through any rewrite:** wrap it in `<!-- clearfelt-writing-lock -->` / `<!-- /clearfelt-writing-lock -->` markers, on their own lines, directly in the file. Byte-identical afterward, at every intensity, no config needed. See `reference/rewrite.md`'s "Locked spans" section.
- **Hold a rewrite or draft to a hard limit:** `--max-chars`/`--max-words`/`--must-contain`/`--must-not-contain` inline on the command, or copy `templates/constraints.example.md` to `.clearfelt-writing/constraints/<name>.md` for a reusable named set and pass `--constraints <name>`. Checked against the actual output by `scripts/check.mjs`, not just prompt-instructed.
- **Calibrate scoring to your own writing rhythm:** give `/clearfelt-writing setup` a sample of your writing, or point it at a directory of past drafts, and it runs `scripts/calibrate.mjs` for you, storing the result in your voice profile's "Personal calibration" section so the statistical signals compare you to yourself, not a generic baseline.
- **Check what's actually active:** run `/clearfelt-writing explain` to see every resolved setting and which of the three layers above set it, before running anything else.

## Architecture

```
SKILL.md               thin router: commands table, routing rules
reference/*.md          full behavior for each command, loaded on demand
reference/format/*.md   the presentation template for each command's output, kept separate from behavior
scripts/detect.mjs      thin CLI entrypoint: arg parsing, mode dispatch
scripts/lib/config.mjs  config precedence, voice/domain profile overrides
scripts/lib/rules.mjs   rule-dictionary parsing and matching
scripts/lib/score.mjs   statistical signals, readability, the score formula
scripts/lib/report.mjs  pattern/category summaries, baseline diff, orchestration
scripts/check.mjs       preservation checker, diffs a rewrite/write candidate against its source or seed
scripts/calibrate.mjs   computes a writer's own baseline statistical signals from a sample or corpus
scripts/explain.mjs     prints every resolved config setting and its provenance
scripts/eval.mjs        lightweight scoring sanity check against a labeled corpus
scripts/qualitative-eval.mjs  scores recorded judgment runs on the five qualitative signals
scripts/routing-eval.mjs      scores recorded judgment runs on SKILL.md's command routing
scripts/hook.mjs        auto-audit hook admin and runtime body
scripts/pin.mjs         $clearfelt-writing-<command> shortcut creation
scripts/lint.mjs        repo-consistency checks, run before any PR
rules/antipatterns/     phrase and structural patterns, one file per category
rules/banned_words/     single words and short phrases, tiered
clearfelt-writing.config.md     every tunable, one Markdown table
prompts/audit_loop.xml  the 3-pass rewrite pipeline for /clearfelt-writing rewrite
prompts/write_loop.xml  the interview-then-draft pipeline for /clearfelt-writing write, reusing audit_loop's scoring and preservation passes
templates/               bundled voice-profile, domain-profile, and constraint-set defaults
schemas/                 documents the rule-bullet, eval-manifest, qualitative-manifest, routing-manifest, and detect/check output JSON shapes
reports/                 gitignored, opt-in saved artifacts (audit/eval/check output)
tests/                   node --test suite (one file per script) plus fixtures/eval/'s, fixtures/qualitative/'s, and fixtures/routing/'s labeled corpora
```

`prompts/audit_loop.xml` and `prompts/write_loop.xml` are the only two files in this repo that aren't Markdown. They're the literal prompt text fed to Claude to run the rewrite and write loops, not something you're meant to hand-edit day to day, and XML tags are Anthropic's own recommended way to structure a multi-step prompt reliably. `write_loop.xml` reuses `audit_loop.xml`'s scoring and preservation-checking passes rather than duplicating them; the interview and draft-generation steps are the only genuinely new logic. Everything you'd actually customize lives in the Markdown files above them.

The router pattern (a thin `SKILL.md` pointing to `reference/*.md`, plus a hooks and pin layer) is adapted from a design already running in production elsewhere, applied here to keep this skill's own context footprint small.

Working on clearfelt-writing itself, rather than using it: see [docs/DEVELOP.md](docs/DEVELOP.md). The writing style it enforces, as a standalone reference: [docs/STYLE.md](docs/STYLE.md). Why the repo is shaped the way it is: [docs/decisions/](docs/decisions/). Cutting a release: [docs/RELEASE.md](docs/RELEASE.md).

## Evidence base

Every rule in `rules/` carries a `source:` field. Run `/clearfelt-writing audit` and the score report includes a source key for each hit; look it up in [docs/SOURCES.md](docs/SOURCES.md) to find the actual paper, institutional report, or community tool behind it. [docs/RESEARCH.md](docs/RESEARCH.md) has the condensed synthesis of what the underlying research actually found. Nothing is cited without a checkable trail: claims that came up in research but couldn't be traced to a real paper are labeled `unresolved-*` rather than given a made-up citation. If you've seen a pattern repeatedly and it isn't here yet, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [Andrei Nita](https://andreinita.co/). [LinkedIn](https://www.linkedin.com/in/nitaionutandrei/).

## License

MIT. See [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Current version: 0.8.0.
