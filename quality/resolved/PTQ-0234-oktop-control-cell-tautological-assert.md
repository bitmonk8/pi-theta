---
id: PTQ-0234
title: b0293-invoke-callee-cause-partition.test.ts cell (C) asserts `count` equals 0 inside a branch its own `if` already required to equal 0
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0293-invoke-callee-cause-partition.test.ts:245-263
  - tests/b0293-invoke-callee-cause-partition.test.ts:174-179
sites: 1
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0293-invoke-callee-cause-partition.test.ts cell (C) asserts `count` equals 0 inside a branch its own `if` already required to equal 0

## Observation
Cell (C) reads `const count = errNoteCount("oktop")` and then branches on
`if (count === 0)`. Inside that branch, its only statement is
`expect(count, "...").toBe(0)`. `errNoteCount` returns a plain `number`
(`Array.prototype.filter(...).length`), so inside the `count === 0` branch
`count` is already known — by the `if` test that selected this branch — to
equal `0`; the `expect` call re-checks the exact condition the surrounding
`if` just evaluated. The `else` branch (a real, falsifiable loop of three
`not.toContain` checks) is the only branch the cell's own header comment
says will ever be entered ("Green now and after the fix" — i.e. `count` is
expected to be `0` on both sides of the bug fix).

## Evidence
`tests/b0293-invoke-callee-cause-partition.test.ts:245-263` (the whole
cell):
```ts
  it("(C) CONTROL: a readable + parseable callee takes none of the load/parse/internal arms — ", () => {
    // Green now and after the fix — the fence that proves the (A)/(B) flips are
    // driven by the FAILURE class, not by the harness reclassifying every invoke.
    // Observed offline: `okcallee`'s body value flows back and the untyped invoke
    // yields `Ok(null)`, so `oktop` succeeds and emits ZERO top-level Err notes.
    const count = errNoteCount("oktop");
    if (count === 0) {
      expect(count, "the readable+parseable callee's invoke did not fail").toBe(0);
    } else {
```
(continued)
```ts
      // Defensive both-branch: were a note emitted, it must not carry any of the
      // three intake-failure causes — a readable/parseable callee is none of them.
      const note = errNote("oktop");
      for (const cause of ["load_failure", "parse_failure", "internal_error"]) {
        expect(
          note,
          `a readable+parseable callee must not render intake cause ${cause}`,
        ).not.toContain(`failed (${cause})`);
      }
    }
  });
```

`errNoteCount`'s definition, showing its return type is a plain `number`
with no side channel the `if`/`expect` pair could disagree about.
`tests/b0293-invoke-callee-cause-partition.test.ts:174-179`:
```ts
/** Count of top-level `Err` notes a dispatch produced (0 for the CONTROL). */
function errNoteCount(slashName: string): number {
  return noteContents().filter((content) =>
    content.startsWith(`theta /${slashName} returned Err:`),
  ).length;
}
```

## Why this is a problem
`expect(count, "...").toBe(0)` at line 252 executes only when control
reaches it, and control reaches it only through the `if (count === 0)` guard
at line 251 — the same `count` binding, the same literal `0`, no
intervening reassignment or async gap. TypeScript itself narrows `count`'s
type to the literal `0` inside that branch, so the `expect` call restates,
rather than tests, the fact the `if` already established: it cannot be
false at that program point for any value `errNoteCount` could have
returned, including a wrong one. This is the "tautologies" instance of
D7's "assertions that cannot fail" class (AGENTS.md "Assert on real
observables"): had the same check been written unconditionally
(`expect(count, "...").toBe(0);`, no branch), it would be a real,
falsifiable negative witness on the recording channel — the branch is what
converts it into a restatement. Per the cell's own comment, the `else`
branch — the only code in this cell that can still fail — is not expected
to execute either before or after bug 0293's fix, leaving the cell's
active path carrying one assertion that cannot fail.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether the
branch or the assertion changes.

## False-positive check
- Gate-pin check: `tests/b0293-invoke-callee-cause-partition.test.ts` does
  not match `*gate*.test.ts` or its named kin; this cell asserts a
  per-callee note count, not a pinned corpus census or inventory.
- Recording-double check: `errNoteCount`/`notes` is a recording double, and
  a direct, unconditional `expect(count).toBe(0)` against it would be
  exactly the legitimate "assert something was never called" MUST-NOT
  witness the carve-out protects. What is flagged here is narrower: the
  code does not assert that directly — it first re-derives the identical
  fact via `if (count === 0)` and only then asserts it inside the branch
  that guard already selected, which is what makes this specific `expect`
  call a tautology rather than the (otherwise legitimate) negative witness
  it would be without the surrounding `if`.
- docs/bugs/ signature search: `docs/bugs/0293-invoke-callee-load-parse-causes-shifted.md`
  is this test's own originating bug; it documents the load/parse/internal
  cause partition the cell's `else` branch checks, and states no rationale
  for the `if`/`expect(0)` pairing being deliberate. No other docs/bugs
  entry names this file.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0293-invoke-callee-cause-partition" docs/reference/coverage-matrix.md`
  → 0 hits. This finding does not propose merging, renaming, or deleting
  the cell or the file — only that one `expect` statement inside it is
  redundant with its own guard.
- Coverage-drift check: this is not a claim that a path is untested; cell
  (C)'s `else` branch, and the sibling cells (A)/(B)/(G) in the same file,
  already exercise `errNote`/`errNoteCount` against real dispatch outcomes
  — the claim is narrowly that this one `expect` call, in the branch it
  currently sits in, cannot fail.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified byte-exact: line 251's `if (count === 0)` and line 252's `expect(count).toBe(0)` share the same unreassigned `const` binding with no intervening code, so the assert is unreachable except when already true (TS narrows `count` to literal `0`), the guarded `else` is the file's only real check, no gate/recording-double/coverage-matrix/docs-bugs carve-out applies (independently re-run), and no sibling CONTROL cell in this or neighboring b0294 file repeats this guard shape, so it is not a documented convention (triage: claude-opus-5)
