---
id: pending
title: err-field-summary's rule-5 rationale says summariseNonResultOperand has "two call sites" while the descriptor is called from five sites in three files
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/err-field-summary.ts:32-35
  - src/runtime/err-field-summary.ts:117-124
  - src/runtime/runtime-panics.ts:446-450
  - src/runtime/runtime-panics.ts:506-510
  - src/runtime/stdlib-array.ts:152-156
sites: 5
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# err-field-summary's rule-5 rationale says summariseNonResultOperand has "two call sites" while the descriptor is called from five sites in three files

## Observation
`err-field-summary.ts`'s module header justifies reusing
`summariseNonResultOperand` for the bug-0177 rule-5 fallback with the sentence
"one descriptor implementation, two call sites that both need a bounded,
non-throwing fallback". The descriptor is called from five expressions today,
spread over three files: twice inside `summariseErrorField` itself (the cycle
arm and the over-cap arm), twice in `runtime-panics.ts`
(`QuestionOperandDefectError`, `StdlibMethodArgumentKindDefectError`), and once
in `stdlib-array.ts` (`StdlibJoinElementDefectError`). Under either reading of
"call sites" — literal call expressions (5) or distinct consuming positions (4)
— the stated count no longer matches the code.

## Evidence
src/runtime/err-field-summary.ts:32-35 — the claim:

```ts
// Rule 5 reuses `summariseNonResultOperand` rather than duplicating its
// own-key-list logic — one descriptor implementation, two call sites that
// both need a bounded, non-throwing fallback for a value outside the
// contract the surrounding code was written against. The cycle half of rule
```

src/runtime/err-field-summary.ts:117-124 — rule 5's own two calls:

```ts
  if (hasCycle(value, new Set())) {
    return summariseNonResultOperand(value as ThetaValue);
  }
  const json = JSON.stringify(value);
  if (json !== undefined && json.length <= JSON_CAP) {
    return json;
  }
  return summariseNonResultOperand(value as ThetaValue);
```

src/runtime/runtime-panics.ts:446-450 — the `?`-operand belt (the original
consumer):

```ts
export class QuestionOperandDefectError extends Error {
  public constructor(operand: ThetaValue) {
    super(
      `internal defect: '?' operand evaluated to a non-Result value (${summariseNonResultOperand(operand)}); the parse-time ERR-18 operand gate (theta/parse/question-on-non-result) did not reject this site — a gate gap (bug 0019)`,
    );
```

src/runtime/runtime-panics.ts:506-510 — a third consuming position added for
bugs 0394/0402:

```ts
export class StdlibMethodArgumentKindDefectError extends Error {
  public constructor(method: string, argIndex: number, expectedKind: string, actual: ThetaValue) {
    super(
      `internal defect: stdlib method '${method}' argument ${argIndex} expects ${expectedKind}, got ${summariseNonResultOperand(actual)}; the parse-time stdlib-arg-type-mismatch gate covers only statically-resolvable mismatches, so this site's argument reached the runtime belt unjudged (bugs 0394/0402)`,
    );
```

src/runtime/stdlib-array.ts:152-156 — a fourth consuming position added for
bug 0366:

```ts
export class StdlibJoinElementDefectError extends Error {
  public constructor(element: ThetaValue) {
    super(
      `internal defect: array.join reached a non-string element (${summariseNonResultOperand(element)}) at runtime; the parse-time element gate (theta/parse/non-string-array-join) deferred on a laundered/withheld receiver and did not reject this site — no implicit type conversion in theta 1.0 (bug 0366)`,
    );
```

Exact search used for the count:
`grep -rn "summariseNonResultOperand" --include=*.ts src/ tests/` — 5 call
expressions (err-field-summary.ts:118, :124; runtime-panics.ts:449, :509;
stdlib-array.ts:155), one definition (runtime-panics.ts:526), one import
(err-field-summary.ts:41), plus prose mentions.

## Why this is a problem
A stated count the current code contradicts — the same stale-count class as
the already-filed call-site-count findings. The comment's whole purpose is to
tell a reader how widely the descriptor is shared, so that they can judge
whether a change to `summariseNonResultOperand`'s output format is local or
fan-out. Git shows the drift mechanically: the sentence landed with bug 0177
(`db98c7b6`, 2026-08-22, `git blame -L 32,34`), and two further consumer sites
were added afterwards — `stdlib-array.ts:155` in `7a513015b` (2026-09-02, bug
0366) and `runtime-panics.ts:509` in `31bb73cfc` (2026-09-04, bugs 0394/0402)
— neither of which revisited the count.

## Suggested direction (non-binding, optional)
Drop the numeral (state that the descriptor is shared by the runtime defect
belts and this rule-5 fallback) so the sentence does not have to be re-counted
each time a belt is added.

## False-positive check
- Reference search: `grep -rn "summariseNonResultOperand" --include=*.ts src/
  tests/ extensions/ tools/` — 5 call expressions in 3 files, listed above; no
  dynamic/string-keyed access (`grep -rn "summariseNonResult" --include=*.ts .`
  shows no bracket-indexed or re-exported form).
- Not a deadness claim: every cited site is live production code; no test-only
  reachability question arises.
- Alternate-reading check: counted "distinct consuming positions" as well as
  literal call expressions — 4 and 5 respectively, neither equal to 2.
- Git intent: `git blame -L 32,34 src/runtime/err-field-summary.ts` → `db98c7b6`
  (2026-08-22); `git blame -L 153,157 src/runtime/stdlib-array.ts` →
  `7a513015b` (2026-09-02); `git blame -L 505,512 src/runtime/runtime-panics.ts`
  → `31bb73cfc` (2026-09-04) for the `summariseNonResultOperand` line. The
  comment predates two of the consumers.
- Duplicate check: the only filed finding naming this file
  (qw20260907183353-d2-02-err-field-summary-citations-drifted) cites :8, :30,
  :91 for drifted line numbers — a different root cause and different lines;
  it does not touch :32-35's count.

## Triage
