---
id: PTQ-0565
title: Cell r5's name promises the integer-narrowing code is absent but its assertion cannot see that code at all
lens: D7
status: open
verdict: confirmed
locations:
  - tests/fn-arg-type-mismatch-wired.test.ts:1107-1122
  - tests/fn-arg-type-mismatch-wired.test.ts:705-715
  - tests/fn-arg-type-mismatch-wired.test.ts:449-458
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Cell r5's name promises the integer-narrowing code is absent but its assertion cannot see that code at all

## Observation
Cell `r5`'s name is `` r5: `fn g(n: integer)` called `g(1.5)` fires once, through THIS code and not integer-narrowing ``, and its body-level comment states the routing claim it exists to pin: `checkFnArgCompat` "returns for `"compatible"` and `"unknown"` only, so a `number → integer` narrowing outcome falls through to this code — unlike the two sibling sinks, which route that outcome to `theta/parse/integer-narrowing`." The cell's only assertion is `expectOneFnArgMismatch`, which is built on `locatedHits(doc, CODE)` — a helper that filters `doc.diagnostics` down to entries whose `code` equals `CODE` (`theta/parse/fn-arg-type-mismatch`) before comparing anything. Neither `expectOneFnArgMismatch` nor `locatedHits` ever reads `theta/parse/integer-narrowing`, and the cell asserts nothing else.

## Evidence
`tests/fn-arg-type-mismatch-wired.test.ts:1107-1122` — the cell in full:
```ts
  it("r5: `fn g(n: integer)` called `g(1.5)` fires once, through THIS code and not integer-narrowing", () => {
    // The routing pin. `checkFnArgCompat` (src/parser/type-compat.ts:463–472)
    // returns for `"compatible"` and `"unknown"` only, so a
    // `number → integer` narrowing outcome falls through to this code — unlike
    // the two sibling sinks, which route that outcome to
    // `theta/parse/integer-narrowing`. TYPE-9 (type-system.md:50) names one
    // code for this slot, and the emitter already implements it that way.
    const doc = parse(R5);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "n", "integer", "number"),
      argument,
      "r5 — TYPE-2's one-way widening fails at this slot through the fn-arg row, which is what the emitter's fall-through already decides",
    );
  });
```

`tests/fn-arg-type-mismatch-wired.test.ts:705-715` — `expectOneFnArgMismatch`, the cell's sole assertion, filters to `CODE` before comparing:
```ts
function expectOneFnArgMismatch(
  doc: ThetaDocument,
  message: string,
  argument: SourceRange,
  why: string,
): void {
  expect(
    locatedHits(doc, CODE),
    `${why}\n  ${CODE} has no emission site in src/ at this HEAD, so this list is empty until the §Fix wires one.\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([`error ${message} @${at(argument)}`]);
}
```

`tests/fn-arg-type-mismatch-wired.test.ts:449-458` — `locatedHits`, showing the filter that discards every non-`CODE` diagnostic before the comparison ever runs:
```ts
function locatedHits(doc: ThetaDocument, code: string): string[] {
  return doc.diagnostics
    .filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => {
      const r = d.range;
      const at = r === undefined ? "-" : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.message} @${at}`;
    })
    .sort();
}
```
`CODE` is `"theta/parse/fn-arg-type-mismatch"` (line 214); no `INTEGER_NARROWING_CODE` constant or `theta/parse/integer-narrowing` string literal appears anywhere in this file (`grep -n "integer-narrowing" tests/fn-arg-type-mismatch-wired.test.ts` hits only the cell's own title on line 1107 and the body comment on line 1112).

## Why this is a problem
`locatedHits(doc, CODE)` throws away every diagnostic whose `code` is not `theta/parse/fn-arg-type-mismatch` before `expectOneFnArgMismatch` ever compares anything, so whether `g(1.5)` also draws `theta/parse/integer-narrowing` is mechanically invisible to this cell: the assertion would pass byte-for-byte identically whether or not the emitter also fired that code on this fixture. A reader following the name "fires once, through THIS code and NOT integer-narrowing" would take the cell as pinning both halves of the routing claim the body comment states — that the code fires, and that the sibling code does not — and would expect a regression that made `g(1.5)` also draw `integer-narrowing` to red this cell. It would not: `render(doc)` (the whole-list diagnostic string used elsewhere in this same file, e.g. cell u13me at tests/fn-arg-type-mismatch-wired.test.ts:2989-2999, for exactly this kind of "no second code arrived" pin) is never invoked here, so the negative half of the title is asserted nowhere in the cell body.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether the missing half is added as a second `locatedHits`/`render` check or the title is narrowed to what the body actually measures.

## False-positive check
Gate-pin check: the file is not `*gate*.test.ts` or named gate kin; not applicable. Recording-double check: `expectOneFnArgMismatch`/`locatedHits` are read-only filters over `doc.diagnostics`, not a recording double asserting a MUST-NOT witness; not applicable. docs/bugs/ signature search: `grep -rln "integer-narrowing" docs/bugs/` finds no open bug doc whose pinned failure signature names this cell or this gap — this is not a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -n "\br5\b" docs/reference/coverage-matrix.md` and a repo-wide search for `r5` as a witness-list entry in `docs/bugs/0050-*` both return no citation of this specific cell by name that would pin its current shape; the finding proposes no rename, merge or deletion of the cell in any case, only that its title claims more than its body checks. This is a claim about an existing assertion's blind spot, not a proposal that a new test should exist, so it does not drift into coverage.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim (cell 1107-1122, expectOneFnArgMismatch 705-715, locatedHits 449-458; CODE at line 210), `grep integer-narrowing` hits only the title (1107) and comment (1112), and `locatedHits` filters `d.code === CODE` before comparing so the title's "and not integer-narrowing" half is mechanically unassertable by the cell's sole check (render(doc) appears only in the failure-message template) — D7 misleading-name; the same file's u13me cell (2989-2999) already uses a `render(doc)` whole-list pin with a comment stating a located pin "cannot see a SECOND emission", and bug 0050:194 treats r5 as the witness that "neither code appears", so the title's promise is intended and unpinned; cell is green (vitest -t r5 → 1 passed), not a gate/recording-double/documented-red, r5's title is cited by neither coverage-matrix.md nor bug 0050's witness list, and no existing PTQ covers this cell (triage: claude-fable-5-1)
