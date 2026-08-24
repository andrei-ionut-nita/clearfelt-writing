# Contributing to clearfelt-writing

The rule dictionary drifts out of date as AI writing habits change, so keeping it current matters more than almost anything else in this repo. Every rule in `rules/` carries a `source:` field pointing to an entry in [docs/SOURCES.md](docs/SOURCES.md), so a reader can check where a claim actually came from instead of taking clearfelt-writing's word for it. New additions need the same bar: a real source, not a guess dressed up as one.

## Adding a shared pattern or word

1. Pick the right file. Multi-word phrases and structural patterns go under `rules/antipatterns/<category>.md`. Single words and short fixed phrases go under `rules/banned_words/<list>.md`. If nothing fits, propose a new category file rather than forcing it into an existing one.
2. Add a bullet in this shape:
   - Antipatterns: `- "the pattern" | severity: N | source: <key>`
   - Banned words: `- word | severity: N | tier: N | source: <key>`
   - Antipatterns that describe a *shape* rather than fixed wording ("It's
     not X. It's Y.") need `| regex: true` and a real regex in place of the
     pattern, not bracketed placeholder text: `scripts/detect.mjs` matches
     every non-regex bullet as a literal string, so `"It's not X. It's Y."`
     would only ever match that exact sentence with literal capital X and Y
     in it. See `rules/antipatterns/binary_contrasts.md` for examples. The
     bullet line is still `|`-delimited, so a literal `|` inside the regex
     (an alternation group) must be written `\|`, not a bare `|`, or it gets
     read as a field separator instead of part of the pattern: write
     `"diligenc\w*\s+(?:it\|this\|that\|them)\b"`, not
     `"diligenc\w*\s+(?:it|this|that|them)\b"`. A literal `\` in the pattern
     itself (rare) is written `\\` the same way. `scripts/lint.mjs` fails
     loudly on a pattern that still contains a stray double-quote character,
     the tell-tale sign of a forgotten `\|`, so a mistake here doesn't ship
     as a silently corrupted rule. If the pattern can't be expressed as a
     regex at all
     (it requires comparing the meaning of multiple sentences, like
     restating one point three different ways), it doesn't belong in
     `rules/` as a bullet; propose it as a `/clearfelt-writing rewrite` reasoning
     step under "Qualitative signals" in `reference/audit.md` instead.
3. Pick a severity from 1 to 9, matching how strongly the pattern reads as AI-generated. Look at the existing entries in that file for calibration before picking a number out of thin air.
4. For banned words, pick a tier: `1` if it should always be flagged, `2` if it should only be flagged when clustered with other hits, `3` if it should only be flagged once it's clearly dense in the document. Tiers exist to cut false positives on words that are sometimes completely legitimate.
5. **Pick a real `source:` key.** Options, in order of preference:
   - A paper or institutional report already listed in [docs/SOURCES.md](docs/SOURCES.md): use its key.
   - A paper or report not yet listed: add a row to SOURCES.md's academic table first, with a real, checkable URL, then reference its key.
   - A pattern you've seen repeatedly in AI output but can't point to a study for: that's legitimate, but say so honestly with `source: clearfelt-writing-heuristic`, not by inventing a citation.
   - Never invent a URL or attribute a claim to a paper you haven't actually read. If you're not sure a source says what you think it says, add it to SOURCES.md's "Referenced but unresolved" table instead of the main table, and use an `unresolved-*` key.
6. Open a PR with a one-line description of where you saw the pattern, matching the source key you used.

## Personal-only additions

If you just want to flag a word for yourself without proposing it for everyone, don't open a PR. Copy `rules/antipatterns.local.example.md` or `rules/banned_words.local.example.md` to the matching `.local.md` file in the same folder. Both are gitignored.

`.clearfelt-writing/voice-profile.md` (or `.clearfelt-writing/voices/<name>.md` in multi-voice mode) and `.clearfelt-writing/domain.md` are project-scoped, not shared rule files. They don't need a `source:` field and aren't PR material, same as the `.local.md` overrides above.

## Changing `scripts/detect.mjs`

The script has zero external dependencies on purpose, so `git clone` is still the entire install. Any change should keep using Node's standard library only.
