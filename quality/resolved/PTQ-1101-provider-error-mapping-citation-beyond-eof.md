---
id: PTQ-1101
title: "#classifyBinderAttempt cites provider-error-mapping.ts:311, :388, :399 for the message-carrier claim, but that file is only 265 lines long"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:1495-1501
  - src/binder/provider-error-mapping.ts:1-265
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# #classifyBinderAttempt cites provider-error-mapping.ts:311, :388, :399 for the message-carrier claim, but that file is only 265 lines long

## Observation
`#classifyBinderAttempt`'s comment on the classifier-produced message claims
"both overflow arms carry the provider's own text in the same field the
transport arm does", anchored with the citation
`provider-error-mapping.ts:311, :388, :399`. `src/binder/provider-error-mapping.ts`
is currently 265 lines long in total, so none of the three cited line numbers
exist in the file at all.

## Evidence
`src/extension/production-theta-producer.ts:1495-1501`:
```ts
      // The classifier-produced message renders whenever it exists, whichever
      // kind produced it: both overflow arms carry the provider's own text
      // in the same field the transport arm does
      // (provider-error-mapping.ts:311, :388, :399), and the outcome below is
      // transport-class regardless of `kind` (determinism-cancellation-failure.md:36).
      // The fixed fallback is the no-text case only, matching the fallback's
      // specified meaning elsewhere (queryerror-variants.md:106,
```

`wc -l src/binder/provider-error-mapping.ts` → `265`, confirming lines 311,
388, and 399 do not exist in the current file.

The current `message` carriers the comment is pointing at are at
`src/binder/provider-error-mapping.ts:167-177` (the overflow gate's `message`,
read then re-carried) and `:249,:260` (the transport-classification arm's
`message: input.errorMessage ?? ""`), all well inside the 265-line file, not
at :311/:388/:399.

## Why this is a problem
The citation's job is to let a reader jump to the provider-error-mapping.ts
code that proves "both overflow arms carry the provider's own text in the
same field the transport arm does". All three cited line numbers are past
the end of the 265-line file, so following any of them lands nowhere — the
cited file has shrunk since the comment was written and the numbers were
never refreshed.

## Suggested direction (non-binding, optional)
Update the citation to the current `message` carrier lines (167-177, 249,
260), or drop the raw line numbers in favour of a symbol/anchor reference
that survives future edits to the cited file.

## False-positive check
- `wc -l src/binder/provider-error-mapping.ts` → 265 lines total; lines 311,
  388, 399 are beyond end-of-file.
- `grep -n "message" src/binder/provider-error-mapping.ts` enumerated every
  `message`-bearing line in the file; the constructs the comment describes
  (overflow arm and transport arm `message` carriers) sit at lines 167-177,
  249, and 260 — none at the cited numbers.
- Checked the prior resolved finding on this file
  (`quality/resolved/PTQ-0069-producer-line-citations-drifted.md`), which
  re-verified this exact citation as holding on 2026-09-07 ("provider-error-
  mapping.ts:311, :388, :399 resolve to the three `message` carriers claimed
  (holds)"); `git log --oneline -- src/binder/provider-error-mapping.ts`
  shows the file was rewritten afterward (`1ec8b63f quality:
  qw20260917154546 fix d9/src__binder__provider-error-mapping.ts`), which is
  the drift mechanism — the citation was correct when PTQ-0069 checked it and
  has since gone stale as the cited file shrank.

## Triage
<!-- triage appends its note below this line -->
verdict: confirmed — reproduced: production-theta-producer.ts:1498 cites provider-error-mapping.ts:311/:388/:399 but `wc -l` = 265 (all three past EOF); the three `message` carriers the comment describes now sit at :177 (signature overflow arm), :249 (stop-reason overflow arm), :260 (transport arm); PTQ-0069 verified the citation holding on 2026-09-07 and commit 1ec8b63f rewrote the cited file afterward; no open PTQ tracks this (REVIEW_LOG 2026-09-14 lists it as unfiled), so not a duplicate (triage: claude-fable-5-1)
