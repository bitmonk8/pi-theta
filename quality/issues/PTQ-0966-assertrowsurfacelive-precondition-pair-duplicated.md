---
id: PTQ-0966
title: invoke-arg-array-literal-provable.test.ts's assertRowSurfaceLive/assertParamTypeDeclarable precondition-guard pair is redeclared verbatim in invoke-arg-type-mismatch-wired.test.ts
lens: D7
wave: qw20260918131151
status: open
verdict: confirmed
locations:
  - tests/invoke-arg-array-literal-provable.test.ts:475-505
  - tests/invoke-arg-type-mismatch-wired.test.ts:529-560
sites: 2
fix_scope: module
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# invoke-arg-array-literal-provable.test.ts's assertRowSurfaceLive/assertParamTypeDeclarable precondition-guard pair is redeclared verbatim in invoke-arg-type-mismatch-wired.test.ts

## Observation
`tests/invoke-arg-array-literal-provable.test.ts` declares a private `function assertRowSurfaceLive(): void` (the shared positive control every absence cell reads: it asserts the row's message was notified at least once and that a diagnostic line attributes it to a named control caller, each with an "unmet precondition" failure message) and a private `function assertParamTypeDeclarable(calleeStem, paramType): void` (asserting a callee's declared param type drew no `theta/parse/*` diagnostic). `tests/invoke-arg-type-mismatch-wired.test.ts` declares the identical two-function pair, structurally byte-for-byte (same body shape, same two `expect` calls per function, same "unmet precondition" framing), differing only in the literal caller/callee stem strings each file's own fixtures use.

## Evidence
`tests/invoke-arg-array-literal-provable.test.ts:475-505` (re-read immediately before filing):
```ts
function assertRowSurfaceLive(): void {
  expect(
    outcome.notifications,
    `unmet precondition: ${CODE} never surfaced for the control caller ` +
      '(`invoke("./b0146k12.theta", 1)` at a `params: x: string` callee), so this ' +
      "workspace produces no instance of the row and no ABSENCE below measures " +
      "anything. Notified: " + JSON.stringify(outcome.notifications),
  ).toContain(invokeArgMessage(0, "x", "string", "integer"));
  expect(
    linesForCode("b0146c12", CODE).length,
    `unmet precondition: no diagnostic line attributes ${CODE} to the control caller, so ` +
      "the per-caller channel every absence cell below reads is not carrying the row " +
      "and cannot witness its absence for one caller. Lines for that caller: " +
      JSON.stringify(linesFor("b0146c12")),
  ).toBeGreaterThan(0);
}

function assertParamTypeDeclarable(calleeStem: string, paramType: string): void {
  expect(
    linesFor(calleeStem).filter((line) => line.includes("theta/parse/")),
    `unmet precondition: the callee declaring \`params: x: ${paramType}\` drew a parse ` +
      "diagnostic, so this param type is not declarable and the cell over it is " +
      "measuring a rejected declaration rather than an argument mismatch",
  ).toEqual([]);
}
```

`tests/invoke-arg-type-mismatch-wired.test.ts:529-560`:
```ts
function assertRowSurfaceLive(): void {
  expect(
    outcome.notifications,
    `unmet precondition: ${CODE} never surfaced for the a1 caller ` +
      "(`invoke(\"./ca.theta\", 1)` at a `params: x: string` callee), so this " +
      "workspace produces no instance of the row and no ABSENCE below measures " +
      "anything. Notified: " + JSON.stringify(outcome.notifications),
  ).toContain(invokeArgMessage(0, "x", "string", "integer"));
  expect(
    linesForCode("a1inv", CODE).length,
    `unmet precondition: no diagnostic line attributes ${CODE} to the a1 caller, so ` +
      "the per-caller channel every absence cell below reads is not carrying the " +
      "row and cannot witness its absence for one caller. Lines for that caller: " +
      JSON.stringify(linesFor("a1inv")),
  ).toBeGreaterThan(0);
}

function assertParamTypeDeclarable(calleeStem: string, paramType: string): void {
  expect(
    linesFor(calleeStem).filter((line) => line.includes("theta/parse/")),
    `unmet precondition: the callee declaring \`params: x: ${paramType}\` drew a ` +
      "parse diagnostic, so this param type is not declarable and the cell over it " +
      "is measuring a rejected declaration rather than an argument mismatch",
  ).toEqual([]);
}
```

Exact search: `grep -n "^function assertRowSurfaceLive" tests/*.test.ts` returns 4 files (`division-result-type-number-invoke.test.ts:292`, `invoke-arg-array-literal-provable.test.ts:475`, `invoke-arg-type-mismatch-wired.test.ts:530`, `modulo-zero-result-type-number.test.ts:1848`); `grep -n "^function assertParamTypeDeclarable" tests/*.test.ts` returns exactly the two files cited above. The two files cited in this finding's locations carry the full, byte-identical two-function pair; the other two `assertRowSurfaceLive`-only files are noted here as pattern context but not cited as locations since only `assertParamTypeDeclarable`'s two sites and this file's own copy are asserted duplicated in this filing.

## Why this is a problem
Both functions exist so that an absence assertion elsewhere in the same file is sound rather than vacuous (the header comments on both copies say so in near-identical words: "Without it an absence assertion passes while the row is unreachable and nothing is being measured"). The two files reinvent the identical two-function precondition-guard pair, keyed only by their own fixture's literal stems, rather than sharing one parameterised implementation. A change to the "unmet precondition" framing or to which channels the positive control reads needs the same hand-edit applied to both copies to stay in sync.

## Suggested direction (non-binding, optional)
Both functions take no state beyond the file's own module-scope `outcome`/`CODE`/`invokeArgMessage`/`linesFor`/`linesForCode`; a parameterised version accepting the caller's control-cell stem, expected message, and diagnostic-line reader is the shape both copies already point toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double check: neither function is a "never called" negative-witness double; both assert a POSITIVE precondition (the row fired at least once) so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "invoke-arg-array-literal-provable\|invoke-arg-type-mismatch-wired" docs/bugs/*.md` returns no hit naming either file's precondition-guard pair as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-arg-array-literal-provable\|invoke-arg-type-mismatch-wired" docs/reference/coverage-matrix.md` returns no hit; this finding proposes no merge, rename or deletion of any `it()`/`describe()`, only that the guard-pair declaration be shared rather than retyped.
- Prior-filing search: `grep -rl "assertRowSurfaceLive\|assertParamTypeDeclarable" quality/issues quality/intake quality/resolved` (excluding this file) returns only `quality/REVIEW_LOG.md`'s prior-wave note recording this exact pair as "left unfiled ... a future wave could re-evaluate" — no PTQ file currently tracks it, so this is not a re-file of an existing candidate.
- Coverage-drift check: this claim is about a duplicated helper-function DECLARATION that exists in both files today; no assertion is made that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/invoke-arg-array-literal-provable.test.ts:475-505 and tests/invoke-arg-type-mismatch-wired.test.ts:530-560 (one-line drift on the second); mktemp `diff` of the two 31-line blocks shows only the control-stem literals (b0146k12/b0146c12/"control caller" vs ca.theta/a1inv/"a1 caller") and two string-concatenation wrap points, and after normalising those the pair is byte-identical; both copies are live (assertRowSurfaceLive 11/8 and assertParamTypeDeclarable 6/4 call sites), `RowSurfaceLive|ParamTypeDeclarable` → 0 hits in tests/helpers/, src/, extensions/, tools/ so no shared export exists; the `^function assertRowSurfaceLive` search reproduces at 4 files and the `sites: 2` scoping is accurate — the division/modulo copies are a different single-channel one-`expect` shape with no assertParamTypeDeclarable; D7 boilerplate-duplication class, both locations under tests/, not a gate file, a positive control not a recording double, coverage-matrix → 0, no merge/rename/delete of any it()/describe() proposed; not a duplicate — PTQ-0814 tracks the adjacent linesFor/linesForCode pair (distinct functions) and PTQ-0557 is an unrelated call-with-clause deps block, and the REVIEW_LOG note explicitly left this pair unfiled; one filing inaccuracy is immaterial to the class — the docs/bugs grep actually returns 13 files and 0137/0146 name `assertRowSurfaceLive` in their witness lists as the positive control (not as a correct-reason red), which a shared parameterised helper leaves intact; fixer note: the guards read linesFor/linesForCode, so coordinate with PTQ-0814's lift (triage: claude-fable-5-1)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
