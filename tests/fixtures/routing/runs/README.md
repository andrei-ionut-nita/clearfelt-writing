# Recording a routing-judgment run

`SKILL.md`'s Routing section decides which command (`setup`, `audit`, `rewrite`, `write`, `explain`, or the Commands-table menu for no argument or a genuinely ambiguous request) a plain-language request maps to. This is a model-judgment call by design (`docs/decisions/0019` chose model-judged routing over a `commands/` directory specifically so any agent, not just Claude Code, can dispatch these five commands from plain instructions), so there is no script in this repo that can judge it itself: this project stays dependency-free and makes no API calls of its own (see `CLAUDE.md`), so judging a request means a Claude Code session reading `SKILL.md`'s Routing section, then reading a request, and recording which command it would dispatch to. `scripts/routing-eval.mjs` only ever scores what's already been recorded here; it cannot produce a judgment on its own.

## To record a run

1. Read `SKILL.md`'s Commands table and Routing section fresh, the same text a real session deciding what to do with an incoming request would read.
2. For each fixture in `../manifest.json`, read the `request` text as if it were a real user message and decide which command it routes to: `setup`, `audit`, `rewrite`, `write`, `explain`, or `menu` (show the Commands table rather than picking one).
3. Write a new file here, `run-<N>.json` (next unused number), shaped:
   ```json
   {
     "runId": "run-1",
     "date": "2026-08-24",
     "judge": "one line on who/what judged: a live Claude Code session, a specific model, a spawned subagent, a human reviewer",
     "judgments": {
       "explicit-audit": "audit",
       "...": "one entry per fixture id in manifest.json, keyed by the fixture's id field, valued with the command name or \"menu\""
     }
   }
   ```
4. Run `node scripts/routing-eval.mjs` to see this run's accuracy against `manifest.json`'s expected commands, and, once two or more runs exist, the pairwise agreement between every pair of runs, the actual measure of how consistent the routing call is from one pass to the next, not just whether any one run happened to be right.

Judge each request independently: don't read another run's file before judging, and ideally don't let the same context that judged run N also judge run N+1 without a fresh read, since that measures memory, not independent judgment. A subagent with no prior context (see the `Agent` tool) is a cleaner second rater than the same session re-judging its own earlier read.

Low agreement between runs is itself the finding this harness exists to produce, the same honest-reporting standard `scripts/eval.mjs` already holds the numeric score to, and the same convention `tests/fixtures/qualitative/runs/README.md` already established for the five qualitative signals. Don't discard a low-agreement run or adjust the manifest's expected commands to make disagreement disappear; a real, repeatable miss is a synonym-list gap in `SKILL.md`'s Routing section to go fix there, not a fixture to relabel.
