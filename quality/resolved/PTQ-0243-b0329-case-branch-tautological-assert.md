---
id: PTQ-0243
title: b0329 cell (D) asserts its own if/else guard variable against the literal it just branched on, in both arms
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:380-382
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:404
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:417
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:430
sites: 2
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0329 cell (D) asserts its own if/else guard variable against the literal it just branched on, in both arms

## Observation
tests/b0329-hash-mismatch-refuses-invocation.test.ts's cell (D) has one `it()`
that reads `const caseInsensitive = filesystemIsCaseInsensitive(workspaceDir)`
once, then branches `if (caseInsensitive) { … } else { … }`. Inside the `if`
arm it executes `expect(caseInsensitive, "case-insensitive filesystem
branch").toBe(true)`; inside the `else` arm it executes
`expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false)`.
`caseInsensitive` is a `const` assigned once, before the branch, and is never
reassigned in either arm.

## Evidence
tests/b0329-hash-mismatch-refuses-invocation.test.ts:380-382 (the guard):
```ts
    const caseInsensitive = filesystemIsCaseInsensitive(workspaceDir);

    if (caseInsensitive) {
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:404 (the `if`-arm
restatement — no reassignment of `caseInsensitive` occurs between line 382 and
this line):
```ts
      expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true);
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:417 (the arm boundary):
```ts
    } else {
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:430 (the `else`-arm
restatement):
```ts
      expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false);
```

## Why this is a problem
At line 404, control has already passed the `if (caseInsensitive)` test at
line 382 with no intervening assignment to `caseInsensitive` — TypeScript
narrows the binding to the literal type `true` for the remainder of that
block — so `expect(caseInsensitive, …).toBe(true)` restates, rather than
tests, the fact the `if` already established: it cannot be false at that
program point for any value `filesystemIsCaseInsensitive` could have
returned. The symmetric case holds at line 430: reaching the `else` arm
already proves `caseInsensitive === false`, so `.toBe(false)` there is
equally unfalsifiable. This is the "tautologies" instance of D7's
"assertions that cannot fail" class (AGENTS.md "Assert on real
observables"). The file's own comment immediately above line 404 states the
purpose is to put "the branch … on the record when this runs" — a
documentation goal, not a check of anything the surrounding code could get
wrong. Every OTHER assertion in both arms of this same cell (the
`not.toContain("zqx-main")` / `not.toContain("zqx-helper")` /
`toContain("zqx-Helper")` calls against `outcome.registered`) is a genuine,
falsifiable check of the production outcome; only these two
`expect(caseInsensitive, …)` calls restate the branch condition itself. This
is the same mechanical shape this store already confirmed once, in
PTQ-0234 (tests/b0293-invoke-callee-cause-partition.test.ts cell (C), a
single `if`-guarded restatement) — here the identical restatement recurs a
second time, as the mirror-image assertion in the paired `else` arm, in a
different file driving a different bug's subject.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether the
two `expect(caseInsensitive, …)` lines are removed, replaced with a plain
comment, or reshaped some other way.

## False-positive check
- Gate-pin check: tests/b0329-hash-mismatch-refuses-invocation.test.ts does
  not match `*gate*.test.ts` or its named kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate). Cell (D) probes one filesystem's case
  sensitivity and asserts a hash-mismatch drop, not a pinned corpus census or
  inventory count.
- Recording-double check: `outcome.registered` is read from the real
  `runCompose`/`composeExtensionInstance` recording double, and every
  `not.toContain`/`toContain` assertion built on it in this cell is a
  legitimate, falsifiable MUST-NOT/MUST witness this finding does not
  dispute. What is flagged is narrower and distinct: the two
  `expect(caseInsensitive, …)` calls read a local `const` boolean the same
  `it()` body branched on moments earlier — they are not built on the
  recording double at all.
- docs/bugs/ signature search: `grep -rn "case-insensitive filesystem
  branch\|filesystemIsCaseInsensitive" docs/bugs/` → 0 hits.
  docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md (this
  test's own originating bug; Status "fixed (0.322.0)") documents the
  hash-mismatch drop cell (D)'s other assertions verify, and states no
  rationale for the `expect(caseInsensitive, …)` pairing.
  `npx vitest run tests/b0329-hash-mismatch-refuses-invocation.test.ts` → 5
  passed (5) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0329-hash-mismatch-refuses-invocation" docs/reference/coverage-matrix.md`
  → 0 hits. This finding does not propose merging, renaming, or deleting the
  cell or the file — only that two `expect` statements inside it restate
  their own guard.
- Established-convention check: the identical
  `expect(caseInsensitive, "case-…-sensitive filesystem branch").toBe(…)`
  idiom also recurs in tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts
  (three times) and tests/b0379-tools-entry-byte-match.test.ts — both outside
  this wave's reviewed scope (shard-02), so no claim is filed against them;
  their existence is surfaced here, and in this shard's routing notes,
  rather than concealed. Recurrence elsewhere does not change the mechanical
  argument at lines 404/430 of this file: each instance, wherever it occurs,
  restates its own immediately-preceding guard.
- Coverage-drift check: this is not a claim that a filesystem branch is
  untested; cell (D)'s substantive assertions (`not.toContain`/`toContain`
  against `outcome.registered`) already exercise both the case-insensitive
  and case-sensitive paths for the production hash-mismatch drop — the claim
  is narrowly that two specific `expect` calls, as written, cannot fail.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified byte-exact at lines 380/382/404/417/430: `caseInsensitive` is an unreassigned `const` TS narrows to literal `true`/`false` inside each arm of its own `if`/`else`, so both `expect(caseInsensitive, …).toBe(...)` calls restate rather than test the guard (same shape as confirmed PTQ-0234); independently reran all false-positive checks (no gate-name match, asserts read the local const not the recording double, bug 0329 is "fixed (0.322.0)" with 5/5 tests green at HEAD so not a documented-red case, 0 coverage-matrix hits, no deletion/rename proposed) and found no carve-out applies (triage: claude-opus-5)
