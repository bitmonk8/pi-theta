---
id: PTQ-1479
title: unresolved-annotation-lowering.test.ts's compile()-then-toBeDefined() pair cannot fail
lens: D7
status: open
verdict: confirmed
locations:
  - tests/unresolved-annotation-lowering.test.ts:238-244
  - tests/unresolved-annotation-lowering.test.ts:629-638
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# unresolved-annotation-lowering.test.ts's compile()-then-toBeDefined() pair cannot fail

## Observation
The file's `compile()` helper either returns the object `ajv().compile(lowered)`
produces, or calls vitest's `expect.fail(...)` in its `catch` arm — which
throws — on any compile-time error. There is no code path through which
`compile()` returns `undefined` or `null`: it returns a real
`CompiledValidator` or the call never returns at all. In the "RED COMPILE"
test, the return value of `compile()` is bound to `validator` and then
asserted `expect(validator, ...).toBeDefined()`.

## Evidence
`tests/unresolved-annotation-lowering.test.ts:238-244` (re-read immediately
before filing) — the helper's full body:
```ts
function compile(lowered: LoweredSchema, why: string): CompiledValidator {
  try {
    return ajv().compile(lowered);
  } catch (thrown) {
    expect.fail(
      `${why} — the real AjvSchemaValidator refused to compile ` +
        `${JSON.stringify(lowered)}: ${String(thrown)}`,
    );
  }
}
```

`tests/unresolved-annotation-lowering.test.ts:629-638` (re-read immediately
before filing) — the vacuous assertion:
```ts
    const validator = compile(
      lowered,
      "a recursive $ref whose fragment is hoisted is inside the pinned subset " +
        "(schema-subset.md:10)",
    );
    expect(
      validator,
      "the compiled validator exists, so neither the DEFECT GUARD nor AJV's " +
        "reference resolver refused the recursive document",
    ).toBeDefined();
```

## Why this is a problem
This is the "assertions that cannot fail" class, tautology sub-case:
`compile()`'s only normal-return path is `ajv().compile(lowered)`, an AJV
`compile()` call that — per the AJV/`AjvSchemaValidator` seam this suite
otherwise trusts throughout the file (e.g. the `lower()` helper's own
try/catch at lines 220-226) — either returns a compiled validator object or
throws. `compile()`'s `catch` arm calls `expect.fail`, which itself throws,
so the function body has exactly one value-returning path and it is always
defined. By the time execution reaches line 634's
`expect(validator, ...).toBeDefined()`, `validator` can mechanically only
ever hold a defined `CompiledValidator` — the `catch` branch would have
already ended the test via `expect.fail`'s throw before this line is
reached. There is no runtime state in which this specific `.toBeDefined()`
assertion observes `undefined`.

## Suggested direction (non-binding, optional)
The `why` string argument to `compile()` documents the intent this
assertion tries to state (that compile did not throw); that intent is
already fully covered by `compile()`'s own `catch`/`expect.fail` arm, so the
follow-up `toBeDefined()` line adds no additional observable and is
noted as removable without loss.

## False-positive check
- gate-pin: not a `*gate*.test.ts` file; no pinned census/inventory count.
- recording-double: `compile()` drives the real `AjvSchemaValidator`, not a
  recording double; this is not a MUST-NOT negative witness.
- docs/bugs/ signature search: `grep -rn "unresolved-annotation-lowering"
  docs/bugs/` finds no report matching this test file's own name; the file's
  header cites bug 0028
  (`docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md`),
  which does not mention `compile()`'s `toBeDefined()` shape and does not
  pin this specific assertion's wording, so this is not a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "unresolved-annotation-lowering" docs/reference/coverage-matrix.md`
  returns no hit; no rename/merge/delete of the test is proposed.
- coverage drift: this finding does not claim a behaviour is untested — the
  surrounding assertions in the same `it()` block (`validator.validate(...)`
  in the sibling DEPTH tests) exercise the real observable; only this one
  redundant `.toBeDefined()` line is cited.

## Triage
<!-- triage appends its note below this line -->
verdict: confirmed — excerpts reproduce at :238-247 and :629-638; `ajv()` is `new AjvSchemaValidator(...)` (tests/helpers/scripted-live-session-harness.ts:147) whose `compile()` (src/seams/ajv-schema-validator.ts:376-401) returns either the cached validator or `#build()`'s object literal (:423-445) on every path and never `undefined`, and vitest `expect.fail` throws, so the helper's sole value-returning path is always defined and `.toBeDefined()` at :634 cannot red; carve-outs clear — not a gate test, real seam not a recording double, bug 0028:267-272 names "the AJV compile assertion" (the `compile()` call itself, which stays) not the trailing `toBeDefined()`, coverage-matrix has no hit; prior toBeDefined-cannot-fail filings (PTQ-0818/0847/0903/1004/1047, all resolved) cite other files (triage: claude-fable-5-1)
