# Developing clearfelt-writing

Notes for working on clearfelt-writing itself, not for using it.

## Running the detector locally

```bash
node scripts/detect.mjs --mode report path/to/file.md
node scripts/detect.mjs --mode score path/to/file.md
```

No install step. `scripts/detect.mjs` uses only Node's standard library (`fs`, `path`, `url`, `child_process`), so `git clone` is the entire setup. Any change to the script should keep that constraint: no `npm install`, no `package.json` dependency, ever.

## Running the automated test suite

```bash
node --test
```

Runs `tests/detect.test.mjs` (Node's built-in test runner, no new dependency) against the fixtures in `tests/fixtures/`: a known-slop sample with a golden expected score and hit list, a known-clean sample expected to score high, and a regression test that reproduces the round-9 category-severity-weight bug and asserts it stays fixed. Run this before opening a PR that touches `scripts/detect.mjs`, `clearfelt-writing.config.md`'s parsing, or any rule file the fixtures rely on. If a legitimate rule or weight change moves a fixture's expected score, update the assertion in `tests/detect.test.mjs` deliberately, don't just let it fail silently or skip it.

For a rough sanity check of whether the scoring weights are in the right neighborhood (not full validation, see `docs/decisions/0010-risk-tier-and-test-suite.md` for why): `node scripts/eval.mjs` runs the labeled fixtures in `tests/fixtures/eval/` and reports how many land in their expected score band.

## Testing a rule change

1. Edit the relevant file under `rules/antipatterns/` or `rules/banned_words/`.
2. Write a one or two sentence sample that should trigger it into a scratch file.
3. Run `node scripts/detect.mjs --mode report <scratch-file>` and confirm the hit shows up with the category and severity you expect.
4. Run it again against a sample that should NOT trigger the rule, to catch overly broad patterns before they ship.
5. If the rule is significant (a new category, a materially different severity), add or update a case in `tests/fixtures/` and `tests/detect.test.mjs` so the behavior is locked in, not just eyeballed once.

## Testing a routing change

If you touch `SKILL.md`'s Commands table or Routing section, `node scripts/routing-eval.mjs` scores recorded judgment runs against the labeled requests in `tests/fixtures/routing/manifest.json`, the same reasoning-only-signal pattern `scripts/qualitative-eval.mjs` uses: nothing in this repo can judge routing itself (see `docs/decisions/notes/0001-routing-eval-harness.md`), so record a fresh run per `tests/fixtures/routing/runs/README.md` after a real change, don't rely on the two runs already checked in staying representative of the new wording.

## Testing the hook

```bash
node scripts/hook.mjs status
node scripts/hook.mjs on
cat .claude/settings.local.json   # confirm the PostToolUse entry
node scripts/hook.mjs off
```

`.claude/settings.local.json` and `.clearfelt-writing/` are gitignored. Clean them up after a manual test so they don't leak into a commit.

## Testing pin/unpin

```bash
node scripts/pin.mjs pin rewrite
ls .claude/skills/clearfelt-writing-rewrite/
node scripts/pin.mjs unpin rewrite
```

`unpin` only removes a skill directory if its `SKILL.md` contains the `<!-- clearfelt-writing-pinned-skill -->` marker, so it never deletes a real user skill by accident. `pin` mirrors the same guard on the write side: it refuses to overwrite a `SKILL.md` that already exists at the target path and lacks the marker, so pinning never clobbers an unrelated skill someone already has at `clearfelt-writing-<command>`. Verify both behaviors specifically if you touch `pin.mjs`; `tests/pin.test.mjs` covers both against a throwaway project directory.

## Testing the XML pipeline

`node scripts/lint.mjs` (see below) checks tag balance with no extra dependency. For a second opinion, or if you don't trust a hand-rolled tag-balance check on its own:

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('prompts/audit_loop.xml'); print('OK')"
```

`prompts/audit_loop.xml` is the only non-Markdown file in the repo on purpose. See [decisions/0003-xml-pipeline-format.md](decisions/0003-xml-pipeline-format.md).

## Running the linter

```bash
node scripts/lint.mjs
```

Checks, in one pass, everything `docs/decisions/0010`'s test-suite ADR called out as missing: `SKILL.md` frontmatter (required fields, non-standard fields as a warning), `prompts/audit_loop.xml` tag balance, every rule's `source:` key resolving to a real row in `docs/SOURCES.md`, every `clearfelt-writing.config.md` row actually being read somewhere in `scripts/`, and the em-dash prohibition across the whole repo (not just the diff). Zero dependencies, same rule as `scripts/detect.mjs`. Exits 1 if anything fails; warnings don't fail the run but are worth reading, they're often the same bug shape a future failure will be.

## Before opening a PR

- Run `node --test`, `node scripts/eval.mjs`, and `node scripts/lint.mjs`. All three, not just the one that seems relevant: `lint.mjs` in particular catches config-to-code drift and dead rule sources that `node --test` won't, since nothing in the test suite exercises every config row or every rule file.
- No em-dash characters anywhere in the diff, `scripts/lint.mjs` checks the whole repo, not just your diff, but check your own changes specifically before running it on everything.
- No JSON in any user-facing rule or config file. See [decisions/0002-markdown-only-data-files.md](decisions/0002-markdown-only-data-files.md) for why.
- If you added a rule, follow the format and severity/tier guidance in [CONTRIBUTING.md](../CONTRIBUTING.md).
