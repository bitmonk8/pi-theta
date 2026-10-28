---
id: PTQ-1761
title: "The unterminated-literal inventory test names nine position refusals but counts refusals across two groups."
lens: D7
status: open
verdict: confirmed
locations:
  - tests/unterminated-literal-params-type-refusal.test.ts:568-587
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The unterminated-literal inventory test names nine position refusals but counts refusals across two groups.

## Observation
The inventory test is named `CONTROL: 27 position cells, 9 of which expect the params: refusal`. Its first assertion counts the position cells, but its refusal assertion concatenates those cells with the separate lowering cells before filtering. The assertion's own explanation identifies the nine as two A9 position cells plus seven B1–B7 lowering cells, not nine of the 27 position cells. The pinned counts and the assertions themselves are not challenged here.

## Evidence
`tests/unterminated-literal-params-type-refusal.test.ts:568-579`:
```ts
/** Declared inventory sizes — the cell below recomputes them. */
const POSITION_CELLS = 27;
const REFUSAL_CELLS = 9;

describe("bug 0232 (F) — the inventory is counted", () => {
  it("CONTROL: 27 position cells, 9 of which expect the params: refusal", () => {
    const cells = positionRows();
    expect(
      cells.length,
      "F — three columns (U1, U2, CTL) over nine positions. A cell deleted or a column dropped " +
        "moves this count, so the file cannot shrink unnoticed",
    ).toBe(POSITION_CELLS);
```

`tests/unterminated-literal-params-type-refusal.test.ts:580-587`:
```ts
    expect(
      [...cells, ...loweringCells().map((c) => ({ cell: c.cell, expected: c.expected }))].filter(
        (c) => c.expected.some((e) => e.code === PARAMS_NOT_EXPR),
      ).length,
      `F — the declared count of cells naming ${PARAMS_NOT_EXPR} across groups (A) and (B): two ` +
        "A9 cells plus B1–B7. A cell weakened to `[]` to buy green would move this count, which " +
        "is what makes the red set non-vacuous",
    ).toBe(REFUSAL_CELLS);
```

## Why this is a problem
This is the D7 misleading-test-name class: a reader following “9 of which” would infer that nine of the 27 position cells assert the params refusal. The body instead verifies a nine-refusal total across the position and lowering groups, with only two contributed by the position group. Consequently the name describes a different inventory relation from the one that can make this test fail.

## False-positive check
- Gate-pin check: group (F) is an inventory pin by design. Neither the expected counts nor the use of pinned inventories is alleged to be a tautology; the claim is solely the name/body mismatch in the counted domain.
- Recording-double check: the cited inventory assertion uses fixture arrays, not a recording double or a MUST-NOT call witness.
- docs/bugs/ signature search: searched for the scoped file in `docs/bugs/` and inspected bug 0232's disposition. This finding does not concern its historical correct-reason reds. A targeted current run, `npx vitest run tests/unterminated-literal-params-type-refusal.test.ts -t '27 position cells'`, passed the named test; the other four tests were excluded by the reviewer-supplied name filter, not skipped by test code.
- Coverage-matrix/bug-doc citation search: the exact test name has no matches in `docs/reference/coverage-matrix.md` or `docs/bugs/`. The file is cited as a witness in bug docs 0232, 0233, 0238, 0239, 0245 and 0085. Any name correction would rename this existing test, but would not merge or delete its assertions; those file-level witness citations remain applicable.
- Duplicate check: the supplied issue list and a search of `quality/` for `27 position cells`, `9 of which`, `inventory is counted`, and `REFUSAL_CELLS` revealed no existing finding for this title/count relation. PTQ-0745 concerns another file's census title.
- Coverage boundary: no missing test or untested behaviour is claimed. The finding judges only the name and assertions of the existing inventory test.

## Triage
verdict: confirmed — The title says nine of the 27 position cells expect the params refusal, but positionRows() supplies only two (A9 U1/U2); the assertion reaches nine by adding seven lowering cells (B1–B7). Excerpts and the passing targeted run reproduce; this is a D7 misleading name, not a challenge to the inventory pins. Bug-doc file-level witness citations are acknowledged and remain valid, and no existing issue or resolved prescription tracks this name/domain mismatch. (triage: claude-opus-5-5)
