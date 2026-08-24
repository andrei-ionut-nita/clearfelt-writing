# ADR 0025: Percentile rescaling stays deferred, with a real bar this time

**Status:** Decided
**Date:** 2026-08-24

## Context

`docs/decisions/0011` deferred rescaling the Human Score's statistical signals to percentile/z-score bands against a labeled corpus, judging a 10-document eval corpus "too small and noisy to rank against meaningfully," and set its own reopening condition: "revisit once the eval corpus is grown well past 10 documents per label." `docs/decisions/0012` grew the corpus to 16. `docs/decisions/0018` grew it to 28, adding bucket labels (`support`, `executive`, `marketing`, `technical`, `personal`, `sensitive`, plus the original 10 unbucketed fixtures). Both changes satisfied "well past 10" on a literal reading. Neither one reopened the percentile-rescaling question. No ADR between 0012 and this one even mentions it. That's a real gap, a deferred decision whose own stated condition fired silently and sat unaddressed, not a judgment call anyone actually revisited and consciously re-deferred.

Checking the actual current distribution (`tests/fixtures/eval/manifest.json`) before deciding anything:

| Bucket | AI | Human | Total |
|---|---|---|---|
| (unbucketed) | 5 | 5 | 10 |
| support | 2 | 2 | 4 |
| sensitive | 2 | 2 | 4 |
| marketing | 2 | 2 | 4 |
| executive | 1 | 1 | 2 |
| technical | 1 | 1 | 2 |
| personal | 1 | 1 | 2 |

28 total, but the smallest three buckets have exactly one AI and one human fixture each. `writing.md`'s own doctrine ("genre conventions must be respected," "formality is not a flaw") is precisely why percentile rescaling would need to be genre-aware in the first place, a `sensitive`-bucket document and a `marketing`-bucket document plausibly need different reference distributions for the same statistical signal, not one pooled ranking. Ranking a document against a distribution built from one same-genre example on each side is not meaningfully different from the hand-tuned weight it would replace; it just hides the arbitrariness behind a percentile instead of a coefficient.

## Decision

**Percentile rescaling stays deferred.** "Well past 10" was the wrong bar to set in the first place, not just a bar that got crossed unnoticed: `docs/decisions/0011` was reasoning about the eval corpus's fitness for its actual job (checking whether hand-tuned weights land known-labeled fixtures in the right band), a different statistical requirement than what a rescaling reference distribution needs (enough samples per stratum for a percentile estimate to be stable, not just enough samples to run a pass/fail check against). Conflating the two is most of why this condition could be satisfied on paper while still being obviously premature on inspection.

**The real reopening condition, stated as a checkable number instead of a vague comparison:** at least 15 fixtures per label (AI and human) in every genre bucket the score would need to rank within, not just in the pooled total. 15 is a floor, not a target: it's the low end of the commonly-cited rule of thumb for a percentile estimate to stop being dominated by which handful of samples happened to get picked, not a number backed by this project's own data (there isn't enough data yet to derive one). Pooling across buckets to hit a total instead of growing every bucket does not satisfy this condition; a `sensitive`-bucket document still needs to rank against `sensitive`-bucket fixtures, `docs/decisions/0018`'s whole reason for adding buckets and a per-bucket eval breakdown was to stop a strong aggregate number from hiding a weak genre, and a pooled rescaling reference would reintroduce exactly that blind spot one level deeper.

**Made self-surfacing, not just documented.** The condition silently firing once already is the actual failure this ADR exists to close, and prose alone didn't stop it the first time. `scripts/eval.mjs`'s per-bucket output now prints the smallest bucket's size next to this ADR's stated floor on every run, so a future contributor growing the corpus sees the gap closing in the tool's own output, not only in a document nobody was checking against.

## Consequences

- No change to `scripts/lib/score.mjs`'s scoring formula. The hand-tuned linear weights (`docs/decisions/0011`, `0012`, `0017`) stay as they are.
- `scripts/eval.mjs`'s by-bucket summary gained one line reporting the smallest bucket's fixture count against this ADR's 15-per-bucket-per-label floor, so growing the corpus toward a real reopening is visible in normal use, not something that requires re-reading this file to notice.
- The next person who grows the eval corpus should grow every bucket together, not just the total, and should re-open this specific ADR number when the floor is met, rather than letting a future ADR's corpus-growth changelog entry satisfy this one by coincidence the way `0012` and `0018` did for `0011`.
