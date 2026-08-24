# /clearfelt-writing setup

The onboarding session. First-run by default, but freely re-runnable any time the user wants to update a voice or domain profile. Never treat this as one-shot. Covers two independent things: voice (per-writer, see "Voice mode" below) and domain (per-project, shared by everyone, see "Domain profile" below).

## Wizard rule

This is the one rule that governs the whole interview, both sections below: one question at a time, through the harness's structured-question tool, never a form dump or a plain-text prompt.

Ask exactly one question per turn, through the harness's own structured single-choice question tool (Claude Code: `AskUserQuestion`), wait for the answer, then ask the next. Never present the full question list in a single message, even summarized, even as a numbered list "for reference." A user answering an 11-item list in one reply is not a wizard, it's a form, and it produces exactly the rushed, unconsidered answers a real interview is meant to avoid.

**Every question goes through the picker, including the ones with no natural fixed answer set** (a writing sample, a list of preferred words, non-negotiables). Never fall back to a plain conversational text prompt just because a question is open-ended:

- Give 2-3 concrete, genuinely useful preset options: a plausible example answer, plus a "None of these, I'll type my own" option pointing at the picker's own "Other" slot. Not filler options invented just to hit a minimum count.
- The "Other" slot always exists and always accepts a free-text answer of any length, so an open-ended question still runs through the structured tool instead of a bare prompt.
- Include a "Skip this one" option. Every question, without exception, has a way to skip.

If the user says something like "let's just go with defaults" or "skip the interview," stop the wizard immediately, confirm that's what they want, and write both files straight from the bundled defaults per Step 4 / domain Step 3 below. Don't keep asking questions after that.

**This skip path is a first-class option, not something the user has to already know to ask for.** Setup isn't a prerequisite either, see `README.md`'s "60-second start", `/clearfelt-writing audit`/`rewrite`/`write` already work with zero configuration, bundled defaults apply and nothing blocks. Mention both of these plainly before the first question: this interview produces a better-calibrated result, but skipping it entirely, or answering just one or two questions and stopping, both work fine too.

## Voice mode

Check `voice.mode` in `clearfelt-writing.config.md` (it's a skill-level setting, shared across every project using this install, not something this run flips silently).

**`single` (default):**

1. Check whether `.clearfelt-writing/voice-profile.md` already exists in the current project. If it does, tell the user you're updating it, not starting over, and show its current contents before asking anything.
2. Before anything else, resolve whether the project already has its own voice or style document, unrelated to clearfelt-writing and not something this system created. This step never writes to that file, it only ever reads it, the same read-only treatment a pasted writing sample gets. Everything `/clearfelt-writing setup` writes goes to `.clearfelt-writing/voice-profile.md`; a user's own `docs/voice.md` (or wherever it lives) is their file, not clearfelt-writing's, and stays untouched by this or any other command.

   **Resolve a path, in this order:**
   1. Auto-check these paths, first match wins: `voice.md`, `VOICE.md`, `docs/voice.md`, `docs/VOICE.md`, `STYLE.md`, `docs/STYLE.md`.
   2. If none of those exist, still ask before assuming there isn't one: through the picker, "Do you already have a voice or style guide for this project somewhere?" with options **Yes, let me give you the path** (pointing at Other, a free-text path) / **No, none exists** / **Skip this question**. A project's own style doc could live anywhere (`writing/`, a wiki export, a differently-named file); a handful of conventional paths coming up empty is not the same as confirming one doesn't exist.
   3. If a path came back from either check, confirm it actually exists and is readable. If it doesn't resolve, say so plainly and fall back to treating it as if "No, none exists" had been the answer.
   4. If a real path is in hand, show it, then ask through the picker: **Keep using this file as my voice reference** / **No, build a new clearfelt-writing voice profile from scratch**.

   **Path A: keeping an existing file.** Taken when the previous question resolves to "keep using this file."
   1. Read the existing file the same way a pasted writing sample would be read: observed sentence-length patterns, recurring word choices.
   2. Check it against the four things a voice profile actually needs (`voice.md`'s "What the system asks for, and why"): words to keep, words to avoid, sentence rhythm, non-negotiables. Don't re-ask what the file already covers.
   3. For whichever of the four it doesn't address, ask only those, through the same picker questions as step 3 below, framed as filling a gap rather than starting over (e.g. "Your `docs/voice.md` doesn't mention any hard non-negotiables, want to add any here?").
   4. Everything gathered this way is purely additive to the user's original file: it fills a field the source left blank, and never restates, reinterprets, or overrides anything the source already says. If an answer would contradict the source (rare, but possible if the user answers loosely), point that out and ask which should win rather than silently picking one.
   5. Go to step 4's confirmation, then step 5. The resulting `.clearfelt-writing/voice-profile.md` must open with an explicit source note naming the original file (e.g. "This profile mirrors this project's own `docs/voice.md`, plus a few fields it didn't cover; edit the original file, then re-run `/clearfelt-writing setup`, to update it.") before its four working sections. Don't silently absorb the content as if clearfelt-writing generated it from scratch: `scripts/lib/config.mjs`'s override lookup only ever reads `.clearfelt-writing/voice-profile.md` directly, it never follows a reference to another file at runtime, so the derived file has to stay the functional source even while the note makes clear the original file is the one a human should keep editing.

   **Path B: no file to keep.** Taken when no path ever resolved, or the user chose "build a new clearfelt-writing voice profile from scratch." Continue to step 3 below exactly as if no existing file had been found.
3. Ask, one at a time through the picker, waiting for each answer before moving on:
   - **Writing sample.** Options: a "Skip, no sample handy" choice, an "I'll paste one (choose Other below)" choice pointing at the picker's free-text slot since a whole sample can't be reduced to fixed options, and "I have a folder of past writing" pointing at Other for a directory path instead of pasted text. A directory gives `scripts/calibrate.mjs` (step 4 below) sturdier numbers than one short paragraph; prefer it when the user has one (a blog's post directory, a folder of old drafts, anything genuinely theirs).
   - **Words or phrases they actually like using**, even if the base rule files would flag them (these become entries under "Words I want to keep using"). Options: one or two plausible examples (e.g. "honestly", "in fact") they can pick as a starting point, "None, I'll type my own" pointing at Other, and "Skip".
   - **Anything they specifically want avoided** beyond the shipped banlist. Same pattern: a plausible example option, an Other-pointing option, and Skip.
   - **How they'd describe their own rhythm.** Fixed option set: Short and punchy / Long and winding / Mixed / Formal / Casual, plus the picker's own Other and skip affordances.
   - **Any hard non-negotiables** ("never use bullet points", "always British spelling", etc.). Same open-question pattern: a plausible example, an Other-pointing option, Skip.
4. If a writing sample was given (pasted or typed in step 3, or read from an existing project file in step 2), note observed sentence-length patterns and recurring word choices as a starting point, then confirm those observations with the user (a fixed yes/no/let-me-adjust picker question) rather than assuming they're right. Skipped automatically when step 2 already resolved the keep-existing-file path, that path's confirmation already happened there.
5. **Personal calibration, only when a sample or directory was given (paste or Other-typed text does not count, this step needs a real file or directory path)**: run `node scripts/calibrate.mjs <path>` and read its JSON output (`baseline_mattr`, `baseline_burstiness_cv`, `baseline_paragraph_cv`, `wordCount`, and an optional `warning` on a thin sample). Show the user the numbers and, if `warning` is present, mention it plainly (calibration still proceeds, thin or not, it's their call) rather than silently deciding for them. This is a compute step only, not a new interview question, don't ask the picker anything here.
6. Write or update `.clearfelt-writing/voice-profile.md` using the structure in `templates/voice-profile.example.md`, filling in what was learned and leaving the rest as bundled defaults. Prepend the source note from step 2 first if this run took the keep-existing-file path. If step 5 ran, fill in the "Personal calibration (computed)" section's four fields from its output (`sample_word_count` from `wordCount`); otherwise leave all four as `(unset)` so the shipped generic defaults keep applying.

**`multi` (opt-in, for more than one writer sharing a project, more than one platform one writer publishes to, or both):**

0. Ask through the picker what this project's multi-voice is for: **Multiple writers sharing this project** / **Multiple platforms for one writer** / **Both**. This determines which of the three flows below runs; it doesn't change the underlying file format (`.clearfelt-writing/voices/<name>.md` either way), just what the wizard asks and what `<name>` ends up meaning.

**Multiple writers** (today's original flow, unchanged):

1. List any existing files under `.clearfelt-writing/voices/`. Ask through the picker whether this run is adding a new voice or updating an existing one: New voice / Update an existing one (listing the names found).
2. Ask for a name through the picker (an open question: an example like "e.g. sarah" as one option, an Other-pointing option, no meaningful skip here since the filename is required to continue) (used as the filename, `.clearfelt-writing/voices/<name>.md`).
3. Run the same one-question-at-a-time interview as `single` mode above, writing to `.clearfelt-writing/voices/<name>.md` instead of `.clearfelt-writing/voice-profile.md`.

**Multiple platforms for one writer** (see [docs/decisions/0021](../docs/decisions/0021-platform-scoped-voice-inheritance.md) for the design this implements):

1. Always create or update `.clearfelt-writing/voices/general.md` first, no `extends:` line, running the same one-question-at-a-time interview as `single` mode (steps 2-6 above). This is the base every platform below extends, and it always exists even if the writer only ever answers platform-specific questions afterward.
2. Then loop, once per platform: ask through the picker for a platform name. **The picker offers no named-platform buttons, only General-as-base is a fixed concept here, not a specific platform**, and free text via **Other** for anything real (LinkedIn, X, a newsletter, print, an internal wiki, whatever the writer actually publishes to), with a couple of platforms named only as illustrative example text inside the question's description, never as their own dedicated option. A hardcoded platform button here would fail this project's own generality test (`docs/ROADMAP.md`: "can it be described without naming a platform, a person, or a project?") the same way a feature request for platform-specific virality scoring already failed it, just at smaller scale.
3. For the named platform: write `.clearfelt-writing/voices/<platform>.md` starting with `extends: general`, then ask only what's platform-specific, one question at a time: "Anything about how you write differs on \<platform\>? A different hook length, a rule that applies here but not generally, something the general voice gets wrong for this platform." Skippable like every other setup question; skipping still writes a valid file, just `extends: general` with nothing else, correctly inheriting everything from the base.
4. After each platform, ask a plain yes/no: "Add another platform?" Loop back to step 2 if yes, stop if no. This is a loop over an open-ended list, not a multi-select over a fixed one, since the wizard has no way to know a writer's platforms in advance.

**Both** (a direct composition of the two flows above; no new UX or file-format decision of its own, see ADR 0021 for the underlying `extends:` design both flows already share):

1. Run the "Multiple writers" loop's steps 1-2 above, unchanged: list existing writers (see the naming note below for how a writer is recognized in Both mode specifically), ask New voice / Update an existing one, resolve or create a writer name.
2. Within that writer: if `.clearfelt-writing/voices/<writer>-general.md` doesn't exist yet, create it now, running the same one-question-at-a-time interview as `single` mode (steps 2-6 above), no `extends:` line. If it already exists (an "Update an existing one" writer), show its current contents before asking anything, same as the domain-profile flow below does.
3. Then run the "Multiple platforms" loop (steps 2-4 above) nested under this writer, with one change to step 2: the picker's list of existing platforms to offer as "Update an existing one" options is filtered to this writer's own files only (every `.clearfelt-writing/voices/<writer>-*.md` except `<writer>-general.md` itself), not every platform file in the directory, since a different writer's platform files aren't this writer's to update. Each platform file is named `.clearfelt-writing/voices/<writer>-<platform>.md` and starts with `extends: <writer>-general`, not the bare `extends: general` the platform-only flow above uses.
4. **Naming note.** Step 1's "list existing writers" in Both mode means: every `.clearfelt-writing/voices/*-general.md` file, with the writer name being everything before `-general.md`, not every file in the directory (a directory with only "Multiple platforms for one writer" files in it, `general.md` and `linkedin.md` with no writer prefix, has zero Both-mode writers to list, a different, single-writer namespace, and offering it as an "existing writer" would be showing the wrong thing).
5. **`--voice` resolution in Both mode.** `scripts/lib/config.mjs`'s `voiceProfilePath()` does a flat `.clearfelt-writing/voices/<name>.md` lookup with no writer-to-general shorthand, so selecting a specific writer's general (non-platform) profile from the command line needs the full stem: `--voice sarah-general`, not `--voice sarah`. A bare `--voice sarah` looks for `.clearfelt-writing/voices/sarah.md`, which Both mode never creates, and fails with "no file at that path" rather than falling back to `sarah-general.md`. Mention this explicitly the first time a Both-mode project's `--voice` usage comes up, since the shorter form looking plausible but not resolving is the one real rough edge this composition has relative to either single-axis flow on its own.

If the user wants multi-voice but `voice.mode` is currently `single`, explain that this is a global setting shared across every project using this skill install, then offer to write `voice.mode: multi` into `~/.clearfelt-writing/settings.md` (the user's home directory, never touched by a skill update) before continuing. Don't edit `clearfelt-writing.config.md` directly for this: that file lives inside the skill's own repo and gets reset on the next update, so an edit there wouldn't stick.

## Domain profile

Run once per project, independent of voice mode; a domain profile is shared by everyone working on the project, not tied to one writer. Same wizard rule as above: one question at a time.

1. Check whether `.clearfelt-writing/domain.md` already exists. If it does, show its current contents before asking anything.
2. Ask, one at a time through the picker, waiting for each answer:
   - **Subject domain**, a sentence or two (e.g. "software engineering / developer tooling," "healthcare," "general audience"). Open-question pattern: a plausible example for this project, an Other-pointing option, and a "Skip, use bundled defaults" option.
   - **Which of these this project's writing mostly is.** Fixed option set: Technical / Marketing / Support / Executive / Personal / Sensitive (see "Mode" in `templates/domain.example.md`; "None of these" and skip are covered by the picker's own affordances). This is context for `/clearfelt-writing rewrite`'s qualitative judgment, not a separate switch; if the user picks Sensitive, still ask the risk-tier question below too rather than assuming mode covers it.
   - **Technical terms that should never be flagged** even though the shared rule files would otherwise catch them (these become entries under "Technical terms exempt from flagging"). Give one or two concrete example options from `rules/banned_words/` or `rules/antipatterns/` (a real word from those files, not an abstract placeholder) to prompt for real answers, plus an Other-pointing option and Skip.
   - **Target reading grade-level range.** Fixed option set: Use the default (6-12) / Set a custom range (prompts a follow-up open question for the actual numbers if chosen).
   - **Preferred `/clearfelt-writing rewrite` intensity for this project** (see the four-tier table in `reference/rewrite.md`). Fixed option set: Light touch / Balanced / Full rewrite / Structural rework / Ask me each time (no preference saved).
   - **Whether this project's writing is legally or reputationally sensitive** (shareholder letters, regulatory filings, anything reviewed by Legal). Fixed option set: Yes, set risk_tier: sensitive / No, standard is fine. If Yes, see `reference/rewrite.md`'s "Risk tier" section for what this changes. Ask this as a plain either/or, not a scary gate.
3. Write or update `.clearfelt-writing/domain.md` using the structure in `templates/domain.example.md`.

## Wrap-up

Confirm what was written (voice, domain, or both) and remind the user they can run `/clearfelt-writing setup` again any time to change it.

## What this is not

This does not touch the user's private voice-profile files in any other project. It builds from what the user tells it in this conversation only.

## Example

Voice mode, single, Path A (existing file found and kept):

```
Auto-check finds docs/voice.md.

"Found docs/voice.md, want to use it as your voice reference?"
> Keep using this file as my voice reference

Reading docs/voice.md: short sentences, contractions throughout, no bullet
points in body copy. Checked against the four fields: words to keep, words
to avoid, and sentence rhythm are all covered. Non-negotiables aren't
mentioned.

"Your docs/voice.md doesn't mention any hard non-negotiables, want to add
any here?"
> "always write numbers as digits, never spelled out"

Writing .clearfelt-writing/voice-profile.md:

  This profile mirrors this project's own docs/voice.md, plus one field
  it didn't cover. Edit the original file, then re-run /clearfelt-writing setup,
  to update it.

  Words to keep: (from docs/voice.md)
  Words to avoid: (from docs/voice.md)
  Sentence rhythm: (from docs/voice.md)
  Non-negotiables: always write numbers as digits, never spelled out
```

