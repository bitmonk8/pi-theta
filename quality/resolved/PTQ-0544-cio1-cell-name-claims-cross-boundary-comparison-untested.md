---
id: PTQ-0544
title: The CIO-1 cell's name claims a runtime-vs-slash-load boundary distinction its body never exercises
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/invoke-ceiling-depth.test.ts:157-178
  - tests/invoke-ceiling-depth.test.ts:44-68
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The CIO-1 cell's name claims a runtime-vs-slash-load boundary distinction its body never exercises

## Observation
tests/invoke-ceiling-depth.test.ts's third `describe`/`it` pair names itself around a claim that this test distinguishes the runtime `invoke(...)` `params` boundary from the binder slash-load `params` boundary ("targets the runtime `invoke` boundary, not the binder slash-load `params` boundary"; "the slash-load `params` boundary cross-routes to ceiling #3 ... and does not surface an `InvokeInfraError` here"). The test body calls only `enforceInvokeParamsDepth` — the same function, the same `CALLEE_PATH`, the same `DEPTH_6_VALUE` argument already asserted against in the file's first test — and asserts a subset of that first test's fields (`error.kind`, `error.cause`). No slash-load code path, no ceiling-#3 classifier, and no comparison between two boundaries appears anywhere in the body.

## Evidence
tests/invoke-ceiling-depth.test.ts:157-178 — the cell under review:
```ts
describe("V15j-T — the invoke `params` vector targets the runtime `invoke` boundary, not the binder slash-load `params` boundary (CIO-1, cka-10)", () => {
  it("ceiling-4-table (`params` row) / CIO-1: the `params` live carrier here is the runtime `invoke(...)` boundary; the slash-load `params` boundary cross-routes to ceiling #3 (witnessed at V11f / V4e) and does not surface an `InvokeInfraError` here", () => {
    // ceilings-3-and-4.md#ceiling-4-table + #cio-1: the slash-load `params`
    // arm routes through ceiling #3's load-time system-note classification
    // rather than ceiling #4's recoverable-`Err` path — that arm is witnessed
    // at V11f / V4e, not here. This seam is the runtime `invoke` boundary only,
    // so a depth-6 `params` value surfaces the recoverable `Err(InvokeInfraError
    // { cause: "validation" })` (the invoke arm), never a ceiling-#3 load-time
    // note.
    const breach = enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE);

    // Primary: the runtime `invoke` boundary surfaces the recoverable `Err`
    // carrier — proving this vector is the invoke arm, not the cross-routed
    // slash-load arm.
    expect(breach, "the runtime invoke `params` boundary surfaces an InvokeInfraError").toBeDefined();
    if (breach === undefined) {
      throw new Error("unreachable: the runtime invoke `params` boundary must surface a breach");
    }
    expect(breach.error.kind).toBe("invoke_infra");
    expect(breach.error.cause).toBe("validation");
  });
});
```

The file's first test, whose call and assertions this cell's body is a strict subset of, tests/invoke-ceiling-depth.test.ts:44-68:
```ts
  it("ceiling-4-table (`params` invoke row) / CIO-3: a depth-6 runtime `invoke(...)` `params` argument trips the theta-owned depth walk before AJV and surfaces as Err(InvokeInfraError { cause: 'validation' }) carrying schema_keyword `maxDepth` (cka-10)", () => {
    // ...
    const breach = enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE);

    expect(breach, "a depth-6 runtime invoke `params` argument must trip ceiling #4").toBeDefined();
    if (breach === undefined) {
      throw new Error("unreachable: a depth-6 `params` argument must breach the depth ceiling");
    }

    expect(breach.result.ok, "the depth-6 breach surfaces as an Err").toBe(false);

    expect(breach.error.kind).toBe("invoke_infra");
    expect(breach.error.cause).toBe("validation");
    expect(breach.error.callee_path).toBe(CALLEE_PATH);
    // ... (schema_keyword / message assertions follow)
```

Exact search: `grep -n "enforceInvokeParamsDepth\|enforceInvokeReturnDepth" tests/invoke-ceiling-depth.test.ts` shows both calls to `enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE)` (lines 51 and 166) are the only two invocations of that function against that argument pair in the file; no call to any binder slash-load function, ceiling-#3 classifier, or system-note-related helper appears anywhere in this file (`grep -n "system.note\|slash.load\|ceiling.3\|classify" tests/invoke-ceiling-depth.test.ts` → 0 hits outside comments).

## Why this is a problem
The `describe`/`it` name promises a test that distinguishes two boundaries — "targets the runtime boundary, not the [slash-load] boundary" and "the slash-load boundary ... does not surface an `InvokeInfraError` here" — which a reader would take to mean the test drives (or at least references through a second, independent code path) the slash-load arm and shows it diverges from the runtime arm. The body does neither: it calls the identical function with the identical arguments already exercised by the file's first test (`enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE)`), and checks two of that first test's already-asserted fields (`error.kind`, `error.cause`). The comparative claim in the name is not something this test's assertions can establish — the assertions establish only that the function returns `cause: "validation"`, a fact already pinned by the earlier CIO-3 cell — so a reader relying on the name to mean "this test shows the two boundaries route differently" is misled about what the assertions in front of them actually check.

## Suggested direction (non-binding, optional)
None offered beyond the observation itself; the naming/scoping choice here is a documentation matter for the test's own header, not a design this finding proposes.

## False-positive check
- Gate-pin carve-out: `tests/invoke-ceiling-depth.test.ts` does not match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double carve-out: no recording double or negative witness is involved in this cell; not applicable.
- docs/bugs/ signature search: `grep -rl "V15j\|CIO-1" docs/bugs/*.md` → 0 hits; no documented correct-reason-red signature covers this cell's naming, and the test is green at HEAD (its primary assertions pass against the wired `enforceInvokeParamsDepth`).
- coverage-matrix/bug-doc citation search: `grep -n "invoke-ceiling-depth" docs/reference/coverage-matrix.md` → 0 hits; `grep -n "V15j" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of this test, only that its name overstates what its body verifies.
- Coverage check: this finding is not "the slash-load boundary is untested" (a routing note, not a filing) — it is that THIS test's own name claims a distinguishing verification its own body does not perform; whether the slash-load boundary has its own test elsewhere (the comment cites V11f/V4e) is out of scope for this finding and is not disputed here.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: excerpts match verbatim at :157-178 and :44-68; the CIO-1 cell's body (`enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE)` + toBeDefined/kind/cause) is a strict subset of the CIO-3 cell's assertions at :51-67, and no non-comment slash-load / ceiling-#3 / system-note reference exists in the file (only the two titles hit), so the title's asserted negative about the slash-load arm ("does not surface an `InvokeInfraError` here") and the body comment's "proving … not the cross-routed slash-load arm" cannot be established by any assertion present — D7 misleading-name per the PTQ-0266/0280 precedent that the class is about what the title asserts; correction: the candidate's `docs/bugs` grep is not 0 hits (bug 0066, fixed 0.88.0, matches on CIO-1) but 0066 cites the file only as generic "seam-level coverage", never this cell, and coverage-matrix has no citation, so no carve-out applies; test green 5/5 at HEAD; no prior PTQ or REVIEW_LOG row covers this cell (triage: claude-fable-5-1)
