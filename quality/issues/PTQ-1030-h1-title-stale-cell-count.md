---
id: PTQ-1030
title: "CONTROL H1" test title claims 49 cells name the new row while the assertion it runs checks 50
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-wire-name-rename-refusal.test.ts:1452
  - tests/inline-object-wire-name-rename-refusal.test.ts:1459-1465
  - tests/inline-object-wire-name-rename-refusal.test.ts:741-744
  - tests/inline-object-wire-name-rename-refusal.test.ts:170-171
sites: 1
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "CONTROL H1" test title claims 49 cells name the new row while the assertion it runs checks 50

## Observation
The test titled `"CONTROL H1: 67 diagnostic-list cells, 49 of them naming the
new row"` asserts `withNewRow.length` against the module constant
`NEW_ROW_LIST_CELLS`, whose declared value is `50`, not `49`. The suite
passes at HEAD (`npx vitest run … -t "CONTROL H1"` → 1 passed), so the
measured `withNewRow.length` is `50`; the title's own number disagrees with
the value the test's body actually checks. A third, still different number
(`47`) appears in the file's top-of-file "ANTI-VACUITY" doc comment
describing the same inventory.

## Evidence
`tests/inline-object-wire-name-rename-refusal.test.ts:741-744` (re-read
immediately before filing):
```ts
/** Declared inventory size — cell H1 recomputes it (anti-vacuity). */
const TOTAL_LIST_CELLS = 67;
/** Declared count of cells carrying the new row — cell H1 recomputes it. */
const NEW_ROW_LIST_CELLS = 50;
```

`tests/inline-object-wire-name-rename-refusal.test.ts:1452,1459-1465` (re-read
immediately before filing):
```ts
  it("CONTROL H1: 67 diagnostic-list cells, 49 of them naming the new row", () => {
    const cells = allCells();
    ...
    const withNewRow = cells.filter((c) => c.expected.some((e) => e.code === RENAMED_INLINE));
    expect(
      withNewRow.length,
      "H1 — the declared count of cells carrying a NON-EMPTY expectation that names " +
        `${RENAMED_INLINE}. A cell weakened to \`[]\` to make the file green would move this ` +
        "count, which is what makes the red set above non-vacuous",
    ).toBe(NEW_ROW_LIST_CELLS);
```

`tests/inline-object-wire-name-rename-refusal.test.ts:170-171` — a third,
independently drifted count of the same inventory, in the file's own
top-of-file doc comment:
```ts
// ANTI-VACUITY: the diagnostic-list inventory below is 67 cells, of which 47
// carry a non-empty expectation naming `theta/parse/renamed-inline-field-name`.
```

Confirmed by running the suite: `npx vitest run tests/inline-object-wire-name-rename-refusal.test.ts -t "CONTROL H1"` → `1 passed`, which is only possible if `withNewRow.length === NEW_ROW_LIST_CELLS === 50`, since a mismatch would throw at the cited `expect(...).toBe(NEW_ROW_LIST_CELLS)` line.

## Why this is a problem
A reader who reads only the test's own name — `"CONTROL H1: 67
diagnostic-list cells, 49 of them naming the new row"` — takes away that 49
of the 67 cells carry the refusal row. The test that name is attached to
does not check 49 anywhere; it checks the cell count against
`NEW_ROW_LIST_CELLS`, which is declared as `50` two lines above the test and
is the value the passing suite proves is correct. The name and the checked
value have drifted apart from each other (and from a third number, 47, in
the file's own header comment describing the identical inventory), so the
title is not a reliable restatement of what the test verifies.

## Suggested direction (non-binding, optional)
The test title (and the stale "47" in the top-of-file ANTI-VACUITY comment)
could be brought into agreement with the `NEW_ROW_LIST_CELLS = 50` value the
assertion already checks and the passing suite already confirms.

## False-positive check
- Gate-pin check: this file is not `*gate*.test.ts` and is not one of the
  named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); `NEW_ROW_LIST_CELLS` is a self-declared
  module constant checked against a self-computed filter, not a pinned
  corpus census.
- Recording-double check: not applicable — no fake/double/recording object is
  involved; this is a plain count comparison.
- docs/bugs/ signature search: `grep -n "CONTROL H1\|49 of them naming\|NEW_ROW_LIST_CELLS" docs/bugs/0160-*.md docs/bugs/0228-*.md docs/bugs/0229-*.md docs/bugs/0231-*.md docs/bugs/0233-*.md` returns no hits; no documented correct-reason-red covers this title/count mismatch as deliberate.
- coverage-matrix/bug-doc citation search: `grep -n "CONTROL H1" docs/reference/coverage-matrix.md` returns no hits; this finding proposes no merge, rename, or deletion of any `it()`/`describe()` block — only that the title text (and the unrelated header comment) be brought into agreement with the value already asserted.
- Prior-filing overlap search: `grep -rl "CONTROL H1\|NEW_ROW_LIST_CELLS\|49 of them naming" quality/issues quality/intake quality/resolved` (before this filing) returns no hits — no existing filing names this title/value drift.
- Coverage-drift check: the claim is about a test NAME disagreeing with the value its own body checks in code that exists and passes today; no claim is made about any missing test or untested path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim (:170-171 header says 47, :744 `NEW_ROW_LIST_CELLS = 50`, :1452 title says 49, :1459-1465 asserts `.toBe(NEW_ROW_LIST_CELLS)`) and `npx vitest run … -t "CONTROL H1"` → 1 passed so the measured count is 50; `git log -L` shows the drift mechanism — 0160 (v0.172.0) filed title+constant at 47, 0229 (v0.182.0) moved both to 49, 0233 (v0.196.0) bumped only the constant to 50 and left the title at 49 while the header comment was never moved past 47 — so the title asserts a superseded claim (D7 misleading-name class, ruled confirmed on the identical title≠pinned-constant shape in PTQ-0745 and by the PTQ-0266/0280 precedent); not a gate/census file, no recording double, not cited by coverage-matrix, no it() merge/rename/delete proposed, and the stated docs/bugs + quality/ greps reproduce with no prior filing naming `CONTROL H1`/`NEW_ROW_LIST_CELLS` (other filings on this file cover unrelated helper duplication) (triage: claude-fable-5-1)
