---
id: PTQ-1013
title: "ternary evaluates ONLY the taken branch" cell in nested-control-in-pure-position.test.ts asserts only the taken value, never that the alternate went unevaluated
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/nested-control-in-pure-position.test.ts:285-291
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "ternary evaluates ONLY the taken branch" cell in nested-control-in-pure-position.test.ts asserts only the taken value, never that the alternate went unevaluated

## Observation
`tests/nested-control-in-pure-position.test.ts:285` names its cell "ternary
evaluates ONLY the taken branch", but the cell's alternate branch is the pure
literal `numberExpr("0")`, which has no observable side effect. The cell's
only assertions check the outcome and the resulting value (`9`), which is
exactly what the ternary would also produce if the implementation evaluated
both branches and merely discarded the alternate's value — the body cannot
tell "only the taken branch ran" apart from "both branches ran, the taken
one's value was kept" for this specific fixture.

## Evidence
`tests/nested-control-in-pure-position.test.ts:285-291` (re-read immediately before filing):
```ts
  it("ternary evaluates ONLY the taken branch: `true ? [ match Ok(9){...} ][0] : 0` -> 9", async () => {
    const indexed = indexExpr(arrayExpr([unwrapOrMatch(okCtor(numberExpr("9")), numberExpr("0"))]), numberExpr("0"));
    const theta = promptTheta(body([], ternaryExpr(boolExpr(true), indexed, numberExpr("0"))));
    const r = await runBody(producer({}), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(9);
  });
```
The alternate operand passed to `ternaryExpr` is `numberExpr("0")` — a bare
number literal, evaluated purely and synchronously with no dispatch, no
mutation, and no recording double attached to it. Nothing in the cell reads
or records whether that literal was visited.

Contrast the very next cell, which DOES prove non-evaluation of the untaken
branch by giving it an effect with a recording double
(`tests/nested-control-in-pure-position.test.ts:293-301`):
```ts
  it("ternary does NOT dispatch an effect in the not-taken branch: `false ? [ grep() ][0] : 5` -> 5, no dispatch", async () => {
    const tool = okGrep();
    const indexed = indexExpr(arrayExpr([grepCall()]), numberExpr("0"));
    const theta = promptTheta(body([], ternaryExpr(boolExpr(false), indexed, numberExpr("5"))), ["grep"]);
    const r = await runBody(producer({ resolvePiTool: tool.resolvePiTool }), theta);
    expect(r.outcome).toBe("success");
    expect(r.value).toBe(5);
    expect(tool.received(), "the not-taken branch's effect must NOT dispatch").toBeUndefined();
  });
```
This second cell attaches `okGrep()`'s recording double to the NOT-taken
branch and asserts `tool.received()` is `undefined` — the mechanism the
first cell's title claims but the first cell's own body never applies to its
own (taken-branch) scenario or its own alternate.

## Why this is a problem
A reader following the first cell's name — "ternary evaluates ONLY the taken
branch" — would expect that cell itself to demonstrate exclusivity (that the
untaken branch is skipped, not merely that the taken branch's value comes
through). Mechanically, `expect(r.value).toBe(9)` passes identically whether
the ternary is lazy (evaluates only the `true` arm) or eager (evaluates both
arms and selects the `true` arm's value) because the `false` arm here is a
side-effect-free literal — there is no observable difference between the two
implementations for this fixture. The "ONLY" claim in the name is proven
elsewhere in the file (the next cell, via a dispatch-recording double on the
untaken branch), not by this cell's own assertions.

## Suggested direction (non-binding, optional)
Renaming this cell to state what it actually shows (that the ternary's
result is the taken branch's evaluated value) would align the name with the
body; the "ONLY" / exclusivity claim is already covered by the adjacent
"does NOT dispatch an effect in the not-taken branch" cell.

## False-positive check
- Gate-pin check: `tests/nested-control-in-pure-position.test.ts` does not
  match `*gate*.test.ts` or any named gate kin; not applicable.
- Recording-double check: this specific cell attaches no recording double to
  either branch, so there is no MUST-NOT-called witness here for the
  carve-out to protect; the sibling cell that DOES use a recording double
  (`okGrep()`) is cited only as contrast, not as the subject of this finding.
- docs/bugs/ signature search: `grep -n "ONLY the taken branch\|evaluates ONLY"
  docs/bugs/*.md` → 0 hits; no open bug document pins this cell's name or
  asserts a documented correct-reason reading of "ONLY" that the body
  intentionally leaves unproven.
- coverage-matrix/bug-doc citation search: `grep -n
  "nested-control-in-pure-position" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any cited
  witness — only that this one cell's own name overclaims what its own body
  demonstrates; the file's suite composition and cell count are untouched.
- Not a coverage claim: the "ONLY" behaviour IS exercised in this same file
  (the adjacent cell), so this is not "a path is untested" — it is that this
  particular cell's name promises a proof its own assertions do not, and
  cannot, supply for the fixture it drives.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/nested-control-in-pure-position.test.ts:285-291 and :293-301; the cell's alternate operand is the pure literal `numberExpr("0")` with no recording double attached and its only expects are `outcome === "success"` / `value === 9` (:289-290), which an eager both-arms ternary would satisfy identically, so the title's exclusivity claim ("ONLY the taken branch") is not checkable by this body — the D7 misleading-name class per precedents PTQ-0784/0791/0968/0943/0917 (title asserts what the body cannot observe); title and body unchanged since introducing commit d23c22be (only Loom→Theta rename since); stated searches reproduce (docs/bugs "ONLY the taken branch|evaluates ONLY" → 0, coverage-matrix → 0; docs/bugs/0199:250 lists the FILE among seven "surfaces a fix re-derives", not a witness roster pinning this cell); not a gate file, the sibling :293 recording-double cell is contrast only, file green 27/27; no accepted PTQ tracks this cell (PTQ-0639 covered the file's harness duplication, a distinct root cause); fix is a title-only rename (triage: claude-fable-5-1)
