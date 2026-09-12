---
id: PTQ-0241
title: b0295 cell (C) asserts err.kind is not "invoke_callee" after already binding it to the literal "cancelled", so the second assertion cannot independently fail
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0295-child-internal-cancel-wrap-arm.test.ts:365-370
sites: 1
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0295 cell (C) asserts err.kind is not "invoke_callee" after already binding it to the literal "cancelled", so the second assertion cannot independently fail

## Observation
In bug 0295's race cell (C), the test first asserts `err.kind` (a plain
`string`-typed field, per `QueryError`'s `query-error.ts` declaration) equals
the literal `"cancelled"` via `.toBe(...)`, then immediately asserts the same
`err.kind` is `not.toBe("invoke_callee")`. `.toBe` uses `Object.is` strict
equality, so once the first line passes, `err.kind` is bound to the exact
value `"cancelled"` for the remainder of the test; `"cancelled"` and
`"invoke_callee"` are distinct string literals that can never be equal, so the
second line cannot fail in any run that reaches it.

## Evidence
tests/b0295-child-internal-cancel-wrap-arm.test.ts:365-370:
```ts
    const err = surfacedError(exec);
    expect(
      err.kind,
      "the adjudicated race disposition is bare cancelled (parent's own signal fired first), never a source-keyed invoke_callee wrap",
    ).toBe("cancelled");
    expect(err.kind).not.toBe("invoke_callee");
```

tests/b0295-child-internal-cancel-wrap-arm.test.ts:356-364 — the surrounding
`describe`/`it` this excerpt sits inside, for context (the cell's own name
promises a "not invoke_callee" observation, which is what line 370 restates):
```ts
describe("bug 0295 (C) — envelope-after-abort race (signal aborted at wrap time) stays bare cancelled", () => {
  it("the wrap seam is reached with the parent signal aborted, and the cancelled envelope passes bare (not invoke_callee)", async () => {
    const { exec, controller } = await runSeam({ leaf: cancelledLeaf(), abortDuringDrive: true });

    expect(
      controller.signal.aborted,
      "the parent's own signal fired during the drive — this is the parent-own arm the fix gates bare",
    ).toBe(true);
```

## Why this is a problem
Line 369's `.toBe("cancelled")` uses vitest's `toBe` matcher, which is
`Object.is` strict equality: for it to pass, the runtime value of `err.kind`
at that point in the test must be exactly the four-character string
`"cancelled"`. Any other value throws there and the test fails before line
370 ever runs. Given that line 369 passed, line 370's
`expect(err.kind).not.toBe("invoke_callee")` re-reads the same field, which is
already known to hold the value `"cancelled"` — and `"cancelled"` is a
different string literal from `"invoke_callee"` independent of anything the
test drives, so this second expectation is entailed by the first and
contributes no additional failure-detecting power: no code path that reaches
line 370 can make it throw. A reader relying on line 370 as a guard against a
regression where the wrap seam starts returning `invoke_callee` for this race
input would be relying on a check that could never catch that regression —
line 369 would already have failed first, for the same reason, before line
370 is reached.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether a
distinct assertion (e.g. against `hops.length` staying `0`, the only other
race-cell observable this cell does not already check) belongs in the second
line's place.

## False-positive check
- Gate-pin check: `tests/b0295-child-internal-cancel-wrap-arm.test.ts` does
  not match `*gate*.test.ts` or the named kin.
- Recording-double check: `err.kind` is a plain field read off an
  already-returned `QueryError`, not a call-recording double; the cited
  assertion is not a MUST-NOT-called negative witness, so that carve-out does
  not apply.
- docs/bugs/ signature search: `docs/bugs/0295-child-internal-cancel-wrap-arm-unreachable.md`
  is **Status: fixed (0.337.0)**; its witness section describes cell (C) as a
  race-disposition guard but does not pin or discuss this specific
  `not.toBe("invoke_callee")` line. `npx vitest run
  tests/b0295-child-internal-cancel-wrap-arm.test.ts` reproduces 7/7 passing at
  HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0295-child-internal-cancel-wrap-arm" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename, or deletion of the cell —
  only that one line within it is redundant given the line immediately above
  it — so no witness-list citation is disturbed.
- Pattern context (not claimed as additional in-scope sites): the identical
  shape — a `.toBe(<other kind>)` immediately followed by
  `expect(...).not.toBe("invoke_callee")` on the same field — recurs at
  `tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:481` and
  `tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:440,497`
  (`grep -n "\.not\.toBe(\"invoke_callee\")" tests/*.test.ts` → these 3 lines
  plus this finding's own line 370, 4 hits total, across 3 files in the same
  cancel/wrap-arm bug family). Neither b0347 nor b0349 is in this wave's review
  scope; they are cited only as pattern context confirming the shape is not a
  one-off typo, and are not claimed as `locations` here.
- Coverage check: this finding does not claim a missing assertion or path; it
  is limited to one existing line's inability to independently fail given the
  line immediately preceding it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: line 369's passing `.toBe("cancelled")` (Object.is) fixes the plain-field `err.kind`, so line 370's `.not.toBe("invoke_callee")` can never independently fail; excerpts, the fixed-status bug doc's silence on this line, the 0-hit coverage-matrix search, the 4-hit pattern grep, and gate/recording-double carve-outs all reproduce, and no duplicate exists (sibling b0347 finding cites this line only as pattern context) (triage: claude-opus-5)
