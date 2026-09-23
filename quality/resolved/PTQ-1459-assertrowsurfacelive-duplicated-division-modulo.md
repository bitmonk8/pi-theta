---
id: PTQ-1459
title: assertRowSurfaceLive positive-control precondition helper duplicated between division-result-type-number-invoke.test.ts and modulo-zero-result-type-number.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/division-result-type-number-invoke.test.ts:155-170
  - tests/modulo-zero-result-type-number.test.ts:1256-1270
sites: 2
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# assertRowSurfaceLive positive-control precondition helper duplicated between division-result-type-number-invoke.test.ts and modulo-zero-result-type-number.test.ts

## Observation
Both `tests/division-result-type-number-invoke.test.ts` and
`tests/modulo-zero-result-type-number.test.ts` declare a module-private
`assertRowSurfaceLive(): void` function with the identical shape: read
`linesForCode(<one caller>, <the code under test>).length`, assert it is
`> 0`, and fail with a message naming the unmet precondition (the row never
surfaced for that caller in this workspace) plus the caller's own diagnostic
lines. The two bodies differ only in the caller stem literal (`"divint"` vs
`"divplain"`), the code constant name, and the prose inside the failure
string. Neither file imports the other's declaration, and no
`tests/helpers/` module exports this shape.

## Evidence
`tests/division-result-type-number-invoke.test.ts:155-170` (re-read
immediately before filing):
```ts
function assertRowSurfaceLive(): void {
  expect(
    linesForCode("divint", CODE).length,
    `unmet precondition: ${CODE} never surfaced for the divint caller (a \`/\` argument at a \`params: x: string\` callee), so this workspace produces no instance of the row and no absence below measures anything. Lines for that caller: ${JSON.stringify(linesFor("divint"))}`,
  ).toBeGreaterThan(0);
}
```

`tests/modulo-zero-result-type-number.test.ts:1256-1270` (re-read immediately
before filing):
```ts
function assertRowSurfaceLive(): void {
  expect(
    linesForCode("divplain", INVOKE_ARG_CODE).length,
    `unmet precondition: ${INVOKE_ARG_CODE} never surfaced for the divplain caller (a \`/\` argument at a \`params: x: string\` callee, which bug 0142's shipped mirror already fires on), so this workspace produces no instance of the row and nothing below measures anything. Lines for that caller: ${JSON.stringify(linesFor("divplain"))}`,
  ).toBeGreaterThan(0);
}
```

Search: `grep -rn "function assertRowSurfaceLive" tests/*.test.ts` — exactly
these two hits, no other file declares the name.

## Why this is a problem
Both files drive the same shared `production-load-harness.ts` (`runProductionLoad`,
`diagnosticLineReaders`) against a planted `.pi/theta/` workspace and both
need the identical shaped positive-control precondition — a named caller's
channel must carry at least one instance of the code under test before any
absence assertion in the file can mean anything (the "NO SILENT SKIPPING"
posture both files' own header comments cite). The two files independently
wrote the same five-line control rather than sharing one parameterised
version, so a change to the control's shape (the failure-message wording, or
what "the row surfaced" should mean against this harness) requires editing
both bodies in lockstep with nothing to force that.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export parameterised on the caller stem and the
code constant is where both call sites' near-identical bodies already point.

## False-positive check
Not a gate/pin file (neither name matches `*gate*.test.ts` or kin). Not a
recording-double MUST-NOT witness — this is a presence-count positive
control, not a call-never-happened assertion. Searched `quality/issues`,
`quality/resolved`, `quality/intake` for "assertRowSurfaceLive" and for both
file names — no existing filing addresses this specific pair. Not a coverage
claim: each file's own test assertions are unaffected; only the repeated
precondition helper is observed.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/division-result-type-number-invoke.test.ts:163-168 and tests/modulo-zero-result-type-number.test.ts:1264-1269 (8-line drift each), bodies identical in shape (one `expect(linesForCode(stem, CODE).length, msg).toBeGreaterThan(0)`) differing only in stem literal (divint/divplain), code constant name and failure-string prose; both copies live (2 and 3 call sites); `function assertRowSurfaceLive` grep → these two plus tests/helpers/production-load-harness.ts:187, which is PTQ-0966's fix `invokeArgPreconditions` — a two-channel variant requiring `notifications()`/`expectedMessage()` that the division file's own header (lines 61-65) deliberately refuses to read, so the candidate's "no helpers export" claim is inaccurate in letter but holds for this single-channel shape (fixer may parameterise or extend that helper); D7 boilerplate-duplication class, both under tests/, positive control not a recording double, not gate files, no it()/describe() merge/rename/delete proposed; not a duplicate — PTQ-0966 (resolved) covers only the invoke-arg-array-literal-provable/invoke-arg-type-mismatch-wired pair and its triage explicitly excluded these two copies, and REVIEW_LOG.md:321 left this exact pair unfiled "for a future wave"; docs/bugs 0137/0146 name assertRowSurfaceLive as a positive control, which a shared parameterised helper leaves intact (triage: claude-fable-5-1)
