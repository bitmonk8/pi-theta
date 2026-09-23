---
id: pending
title: grandchild-callee-drop test repeats the identical notified/offChannel no-side-effect assertion pair ten times
lens: D7
status: intake
verdict: pending
locations:
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:407-408
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:437-438
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:467-468
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:521-522
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:563-564
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:602-603
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:641-642
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:679-680
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:739-740
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:800-801
sites: 10
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# grandchild-callee-drop test repeats the identical notified/offChannel no-side-effect assertion pair ten times

## Observation
`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` ends ten of its `it()` bodies (cells A, B, C, D, CYC1, CYC2, DEPTH3, ESC, ESC2, ESC3) with the exact same two-statement, argument-free assertion pair verifying the load pass produced no UI toast and put nothing off the system-note channel.

## Evidence
Exact search: `grep -n "pass.notified).toEqual(\[\]);" tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` returns 10 hits (lines 407, 437, 467, 521, 563, 602, 641, 679, 739, 800), each immediately followed by the identical `pass.offChannel).toEqual([]);` line.

`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:407-408` (cell A):
```ts
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
```

`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:800-801` (cell ESC3, the tenth and last occurrence):
```ts
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
```

All ten occurrences are byte-identical two-line pairs (verified against the surrounding context at lines 437-438, 467-468, 521-522, 563-564, 602-603, 641-642, 679-680, 739-740 as well).

## Why this is a problem
The same two-statement assertion, carrying no per-cell message and no per-cell parameter, is retyped verbatim at the end of ten separate test bodies in the one file. Both `pass.notified` and `pass.offChannel` are already read through helpers defined in `tests/helpers/compose-workspace-harness.ts` (`makeHost`'s `notified` field, `runLoadPass`'s `offChannel` field), so the pair is not incidental setup but a recurring end-of-cell check with no cell-specific content — exactly the shape a shared one-line assertion in that same helpers file would collapse to a single call site instead of ten hand-copied ones.

## Suggested direction (non-binding, optional)
A single `expectNoSideNotifications(pass)` (or similarly named) helper in `tests/helpers/compose-workspace-harness.ts`, alongside the other `LoadPass`-reading helpers already there (`errorFilesOf`, `requireDriven`, `describeNotes`), is the natural home for this pair, as an observation about where the other `LoadPass` observation helpers already live.

## False-positive check
Gate-pin check: this file is not a `*gate*.test.ts` census/pin file — n/a. Recording-double check: `pass.notified` and `pass.offChannel` are themselves negative-witness reads over the `HostDouble`'s recording arrays (legitimate MUST-NOT witnesses per the carve-out), but the finding is about the ten hand-copied CALL SITES asserting on them, not about the recording mechanism itself, so the carve-out does not cover this claim. docs/bugs/ signature search: `grep -rln "grandchild-callee-drop\|b0271" docs/bugs/` finds bug 0271's own report but it does not pin this assertion pair's repetition as intentional. coverage-matrix/bug-doc citation search: `grep -n "grandchild-callee-drop-un-registers-depth-two-caller" docs/reference/coverage-matrix.md` returns no hits, so no citation pins the ten cells' current per-cell duplicated tail; this finding proposes no merge, rename or deletion of any cell, only naming where the shared tail could live.

## Triage
verdict: questionable — independently re-verified: the stated grep reproduces exactly (10 hits at 407/437/467/521/563/602/641/679/739/800, each immediately followed by `expect(pass.offChannel).toEqual([]);`, byte-identical modulo the two deeper-indented cells CYC1/CYC2 at 563-564/602-603), the file is not a gate/census test, `pass.notified`/`pass.offChannel` are the canonical `runLoadPass` LoadPass fields (tests/helpers/compose-workspace-harness.ts:238-239, 257-258), bug 0271 (:396) cites the file only as "ten cells" and coverage-matrix has 0 hits, and no existing PTQ tracks this pair (PTQ-0427 mentions it only as an ordinary content assertion; PTQ-0398/0803 are different tails) — so the observation is real and in D7's boilerplate class; but the anchor is thin enough to need a human ruling: the repeated unit is two argument-free, message-free one-line `expect(...).toEqual([])` statements with no per-cell text that could drift, so collapsing them to one helper call trades two visible assertion targets for an opaque name with near-zero drift benefit, and the candidate's `sites: 10 / fix_scope: localized` understates the actual shape (the same pair recurs 45 times across 10 tests/ files — b0275 ×5, b0280 ×5, callee-post-parse ×6, callee-tools-missing ×6, lex-drop ×4, thetalib-reparse ×4, b0320 ×2, shared-subtree ×2, b0268 ×1), meaning any helper is a harness-wide convention decision, not a one-file localized fix (triage: claude-fable-5-1)
verdict: questionable — re-verified on a second pass: `grep -n "pass.notified).toEqual(\[\]);"` returns exactly the 10 cited lines (407/437/467/521/563/602/641/679/739/800) and `grep -A1` confirms all 10 are immediately followed by `expect(pass.offChannel).toEqual([]);`; `notified`/`offChannel` are the canonical `LoadPass` fields at tests/helpers/compose-workspace-harness.ts:238-239 (built :257-258) and no `expectNoSideNotifications`-style helper exists in tests/helpers/; not a gate/census file, 0 coverage-matrix hits, bug 0271 does not pin the tail; not a duplicate — resolved PTQ-0230/0267/0427/0716 concern the `runLoadPass` harness itself, not this assertion tail — so the boilerplate observation is real and in-scope, but the anchor is taste-thin (two argument-free, message-free `toEqual([])` one-liners with no per-cell text to drift) and the shape is harness-wide, not localized: the same `notified).toEqual([])` recurs in 13 tests/ files (54 sites: grandchild ×10, callee-post-parse ×6, callee-tools-missing ×6, b0275 ×5, b0280 ×5, bootstrap-sink-liveness ×5, lex-drop ×4, thetalib-reparse ×4, shared-subtree ×3, b0268-separator ×2, b0320 ×2, b0268-load-note ×1, bootstrap-production-wiring ×1), so whether to name the pair is a convention ruling for a human (triage: claude-fable-5-1)
verdict: questionable — third independent pass reproduces every claim: `grep -n "pass.notified).toEqual(\[\]);"` returns exactly the 10 cited lines (407/437/467/521/563/602/641/679/739/800) and `grep -A1 | grep -c offChannel` returns 10, so every occurrence is followed by the identical `expect(pass.offChannel).toEqual([]);`; `notified`/`offChannel` are canonical `LoadPass` fields (tests/helpers/compose-workspace-harness.ts:238-239, built :257-258) and no `expectNoSideNotifications`-style helper exists under tests/helpers/; not a gate/census file, 0 coverage-matrix hits, bug 0271 does not pin the tail, and no open/resolved PTQ tracks this pair (PTQ-0427 only mentions it in passing; PTQ-0398/0803 are different assertion tails) — real, in-scope D7 boilerplate; but the anchor is taste-thin: two argument-free, message-free `toEqual([])` one-liners carry no per-cell text that can drift, so a helper trades two visible assertion targets for an opaque name, and the pattern spans 13 tests/ files / 54 sites (grandchild ×10, callee-tools-missing ×6, callee-post-parse ×6, bootstrap-sink-liveness ×5, b0280 ×5, b0275 ×5, thetalib-reparse ×4, lex-drop ×4, shared-subtree ×3, b0320 ×2, b0268-separator ×2, bootstrap-production-wiring ×1, b0268-load-note ×1), so `fix_scope: localized` understates it and the decision is a harness-wide convention ruling for a human (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
