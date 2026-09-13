---
id: PTQ-0300
title: b0275 and b0280 each declare an identical expectCallerRefusedWithCalleeHasErrors assertion helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:282-298
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:255-271
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260913183958
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-13
---

# b0275 and b0280 each declare an identical expectCallerRefusedWithCalleeHasErrors assertion helper

## Observation
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts and
tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts each declare
a module-scope function named `expectCallerRefusedWithCalleeHasErrors`, with
the identical `(pass: LoadPass, callerPath: string, callerStem: string): void`
signature and the identical three-step body: assert `callerStem` is absent
from `pass.registered`, assert `errorRowsAt(pass, callerPath).map(d =>
d.code)` equals exactly `[CALLEE_HAS_ERRORS_CODE]`, and assert that row's
message matches `normativeMessagePattern(CALLEE_HAS_ERRORS_CODE)`. The two
bodies differ in exactly one place: an interpolated noun inside one
failure-message string ("escaping entry" in b0275, "prompt-mode entry" in
b0280). Both files already import `errorRowsAt`, `describeNotes` and
`normativeMessagePattern` (the three primitives this function is built from)
from `tests/helpers/compose-workspace-harness.ts` in the same statement; no
module under tests/helpers/ exports a function of this shape.

## Evidence

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:282-291:
```ts
function expectCallerRefusedWithCalleeHasErrors(
  pass: LoadPass,
  callerPath: string,
  callerStem: string,
): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:293-298:
```ts
  const rows = errorRowsAt(pass, callerPath);
  expect(
    rows.map((d) => d.code),
    `one escaping entry below this caller is one condition, so exactly one error-severity ` +
      `row belongs at ${callerPath}, and it is ${CALLEE_HAS_ERRORS_CODE}\n` +
      describeNotes(pass.notes),
```

tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:255-264 —
byte-identical to the b0275 excerpt above:
```ts
function expectCallerRefusedWithCalleeHasErrors(
  pass: LoadPass,
  callerPath: string,
  callerStem: string,
): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);
```

tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:266-271 —
identical except for the one interpolated noun:
```ts
  const rows = errorRowsAt(pass, callerPath);
  expect(
    rows.map((d) => d.code),
    `one prompt-mode entry below this caller is one condition, so exactly one error-severity ` +
      `row belongs at ${callerPath}, and it is ${CALLEE_HAS_ERRORS_CODE}\n` +
      describeNotes(pass.notes),
```

Exact search: `grep -rln "^function expectCallerRefusedWithCalleeHasErrors"
tests --include="*.test.ts"` → exactly 2 files (b0275, b0280); the remaining
lines of each function immediately following the excerpts above (a
`.toEqual([CALLEE_HAS_ERRORS_CODE])` on the mapped codes, then a
`normativeMessagePattern(CALLEE_HAS_ERRORS_CODE)` message match) are identical
in both files too.

## Why this is a problem
This is the "Boilerplate duplication" class: a ten-plus-line domain assertion
helper — built entirely out of primitives (`errorRowsAt`, `describeNotes`,
`normativeMessagePattern`) both files already import from
`tests/helpers/compose-workspace-harness.ts` — is retyped whole into each
file rather than shared, with a single interpolated word the only
difference between the two copies. b0280's own header comment states the
harness it carries "is modelled on, and duplicated from rather than shared
with" tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts;
`expectCallerRefusedWithCalleeHasErrors` is one of the pieces that admission
covers. Two prior fixes to this same file pair (tracked in-file as PTQ-0230
for the load-pass/diagnostic-reading primitives this function is built on,
and PTQ-0237 for the registry read) already centralised the pieces beneath
and beside this function; the function itself was not among the pieces
either fix moved, and it still has no shared home.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts`, which both files already
import `errorRowsAt`, `describeNotes` and `normativeMessagePattern` from, is
the module the same convention already established for this file pair's
other shared primitives points at for this function too.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin;
  not applicable, and the cited function is a reusable assertion helper, not
  a pinned count or inventory assertion.
- Recording-double check: `expectCallerRefusedWithCalleeHasErrors` reads an
  already-produced `LoadPass` (itself built on a recording host double this
  finding does not touch); this finding does not claim any assertion inside
  the function cannot fail — it claims the function's own DEFINITION is
  copy-pasted across the two files rather than shared, a distinct claim the
  negative-witness carve-out does not cover.
- docs/bugs/ signature search: docs/bugs/0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md
  — Status "fixed (0.274.0)"; docs/bugs/0280-prompt-mode-declaration-below-immediate-callee-never-read.md
  — Status "fixed (0.276.0)". `npx vitest run
  tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts
  tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts` → 10
  passed (10) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0275-escaping-tools-entry-below-immediate-callee\|b0280-prompt-mode-declaration-below-immediate-callee"
  docs/reference/coverage-matrix.md` → 0 hits. Neither bug document cites the
  other or names this function. This finding proposes no merge, rename or
  deletion of either file or any `it()`/`describe()` — only that one helper
  function could be shared rather than redeclared — so no citation is
  affected.
- Overlap check against already-filed/resolved topics: PTQ-0230 ("b0275
  redefines an 8-function load-pass/diagnostic-reading harness…") lists its
  own Evidence functions by name (`normativeMessagePattern`, `runLoadPass`,
  `noteDiagnostics`, `allDiagnostics`, `describeNotes`, `errorRowsAt`,
  `errorFilesOf`, `requireDriven`); `expectCallerRefusedWithCalleeHasErrors`
  is not among them, and both b0275 and b0280 currently import all eight of
  those names from `tests/helpers/compose-workspace-harness.ts` (confirmed
  by both files' own import statements, re-read above) — that fix already
  landed. PTQ-0237 is confined to the `RegistryRow`/`REGISTRY` read and
  likewise never names this function. Neither prior finding's Evidence or
  `locations` covers this function.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; the function is exercised by the tests in both of its
  files (10/10 passing, confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — the function bodies reproduce byte-for-byte at the cited lines in both files (only the "escaping"/"prompt-mode" noun differs), `grep -rln "^function expectCallerRefusedWithCalleeHasErrors" tests --include="*.test.ts"` reproduces at exactly 2 files, both docs/bugs are fixed (0.274.0/0.276.0) with 10/10 vitest passing and 0 coverage-matrix hits, and PTQ-0230/PTQ-0237's own Evidence lists (checked directly) never name this function — a genuine leftover from the same harness-centralisation convention those two confirmed, fixed findings already applied to this exact file pair (triage: claude-opus-5)
