---
id: PTQ-0224
title: Two b0349 assertions check `err.kind` is not `invoke_callee` right after a `.toBe()` already pinned it to a different literal
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:435-440
  - tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:493-497
sites: 2
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# Two b0349 assertions check `err.kind` is not `invoke_callee` right after a `.toBe()` already pinned it to a different literal

## Observation
In cell (C) and cell (E) of `tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts`, each `it` block asserts `err.kind` with a message-carrying `.toBe(<specific literal>)`, then on the very next statement asserts the same `err.kind` with a bare `.not.toBe("invoke_callee")`. `err.kind` is a discriminated-union string literal read off the same already-settled `QueryError` object between the two lines; nothing mutates it in between.

## Evidence
`tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:435-440` (cell C):
```ts
    const err = surfacedError(exec);
    expect(
      err.kind,
      "the adjudicated race disposition is bare cancelled (caller's own signal fired first), never a source-keyed invoke_callee wrap",
    ).toBe("cancelled");
    expect(err.kind).not.toBe("invoke_callee");
```

`tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:493-497` (cell E):
```ts
    expect(
      err.kind,
      "a boundary-minted infra Err stays bare (its own leaf kind), never wrapped as invoke_callee (bug 0294 provenance)",
    ).toBe("invoke_infra");
    expect(err.kind).not.toBe("invoke_callee");
```

Exact search: `grep -n "\.not\.toBe(" tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts` returns exactly these 2 lines (440 and 497) in this file; no other `.not.toBe(` / `.not.toEqual(` site in the file's other four cells (A, B, D, F).

## Why this is a problem
Vitest's `expect(...).toBe(...)` throws synchronously on a mismatch, so control reaches the next statement only once the preceding assertion has already succeeded. In cell C, line 439 has already established `err.kind === "cancelled"` before line 440 runs; in cell E, line 496 has already established `err.kind === "invoke_infra"` before line 497 runs. `"cancelled"` and `"invoke_infra"` are each mechanically distinct from the literal `"invoke_callee"`, so the moment either preceding `.toBe(...)` line passes, the following `.not.toBe("invoke_callee")` is guaranteed to pass too — there is no value `err.kind` could hold at that point that would make it fail. This is the "tautologies" shape of an assertion that cannot fail: the line carries no discriminating power beyond what the immediately preceding line already fixed.

## Suggested direction (non-binding, optional)
A reader auditing what cells (C) and (E) actually pin would look only at the preceding `.toBe("cancelled")` / `.toBe("invoke_infra")` lines; the two `.not.toBe("invoke_callee")` lines add nothing beyond what those already establish.

## False-positive check
- Recording-double / MUST-NOT-witness carve-out: the two cited lines assert on `err.kind` (a plain value read off the surfaced `QueryError`), not on a recording double's call log. The file's genuine negative-witness assertions on the `hops` recording double (`expect(hops.length, ...).toBe(0)` at line 498 in cell E, and the `hops.length` checks in cells A/D) are separate lines and are not cited by this finding.
- Gate-pin carve-out: the file name does not match `*gate*.test.ts` and is not one of the named census/pin gates (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); not applicable.
- docs/bugs/ signature search: read `docs/bugs/0349-theta-callable-code-call-leg-child-internal-cancel-bare.md` in full. Its "Fix (0.338.0)" section describes the 6-cell witness by behaviour per arm (wrap / bare) and its "Gates" section pins cell outcomes only via the surfaced kind (bare `cancelled`, bare `invoke_infra`); neither section mentions or relies on the specific `.not.toBe("invoke_callee")` lines, so this is not a documented, sanctioned redundancy.
- coverage-matrix / bug-doc witness-list citation search: `grep -rn "b0349-codecall-child-internal-cancel-wrap-arm" docs/reference/coverage-matrix.md` returns no match; the only citations of this filename are inside `docs/bugs/0349-...md` itself (its own "what shipped" and "Gates" entries), naming the file as a whole, not these two lines. This finding does not propose merging, renaming, or deleting the test — only that two specific lines within it are redundant — so the citation-pinning rule for renames/deletes does not bind regardless.
- Not a bug/behaviour claim: ran `npx vitest run tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts` — all 6 tests currently pass (the bug is fixed at 0.338.0 per the bug doc's Status line). The claim here is purely structural (these two lines cannot fail given the line immediately before them), independent of which side of the fix the suite sits on, so this is not a flaky/wrong-behaviour bug report in disguise.
- Coverage: this finding does not claim any path or behaviour is untested — the surrounding assertions in both cells (the `.toBe("cancelled")` / `.toBe("invoke_infra")` lines, plus the `hops` checks) already exercise the production code being verified; only the two named redundant lines are in scope.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified at exact lines (435-440, 493-497): err.kind is a plain, unmutated field and Vitest's .toBe() throws synchronously on failure, so once .toBe("cancelled")/.toBe("invoke_infra") passes, .not.toBe("invoke_callee") on the same read cannot fail; no carve-out applies (not a recording double, not a gate, not cited by coverage-matrix.md or the bug doc's Gates section for these lines specifically) (triage: claude-opus-5)
