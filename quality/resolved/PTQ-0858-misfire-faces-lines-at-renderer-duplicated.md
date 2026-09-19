---
id: PTQ-0858
title: reserved-keyword-misfire-faces.test.ts's lines()/at() diagnostic-rendering closure is restated verbatim in reserved-keyword-remaining-identifier-positions.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/reserved-keyword-misfire-faces.test.ts:214-237
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:242-266
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reserved-keyword-misfire-faces.test.ts's lines()/at() diagnostic-rendering closure is restated verbatim in reserved-keyword-remaining-identifier-positions.test.ts

## Observation
`tests/reserved-keyword-misfire-faces.test.ts` declares module-scope `lines(doc)` — mapping every diagnostic to `` `${d.severity} ${d.code} @${at}: ${d.message}` `` with `at` derived from `d.range` — and `at(code, message, line, column, endColumn)`, a single-line-range literal builder returning `` `error ${code} @${line}:${column}-${line}:${endColumn}: ${message}` ``. `tests/reserved-keyword-remaining-identifier-positions.test.ts` declares the same two functions, byte-identical body for body, under the same two names. Neither `tests/helpers/e2e-s1.ts` (whose own `diagLines` renders `` `${d.severity} ${d.code}: ${d.message}` `` with no range) nor any other `tests/helpers/` module exports this range-carrying variant.

## Evidence
`tests/reserved-keyword-misfire-faces.test.ts:214-226`:
```ts
/**
 * Every diagnostic rendered `severity code @l:c-l:c: message`, in report order,
 * over the UNFILTERED list — the assertion vocabulary of the whole file.
 */
function lines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code} @${at}: ${d.message}`;
  });
}
```

`tests/reserved-keyword-misfire-faces.test.ts:228-237`:
```ts
/** One rendered `error`-severity diagnostic line, single-line range. */
function at(
  code: string,
  message: string,
  line: number,
  column: number,
  endColumn: number,
): string {
  return `error ${code} @${line}:${column}-${line}:${endColumn}: ${message}`;
}
```

`tests/reserved-keyword-remaining-identifier-positions.test.ts:246-266` — the same two functions, byte-identical bodies:
```ts
function lines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code} @${at}: ${d.message}`;
  });
}

/** One rendered `error`-severity diagnostic line, single-line range. */
function at(
  code: string,
  message: string,
  line: number,
  column: number,
  endColumn: number,
): string {
  return `error ${code} @${line}:${column}-${line}:${endColumn}: ${message}`;
}
```

Exact search: `grep -rln '@\${at}: \${d.message}' tests/*.test.ts` returns 11 files, of which the in-scope file and `reserved-keyword-remaining-identifier-positions.test.ts` share the identical `function lines(doc: ThetaDocument): string[]` declaration name and body verbatim (`grep -n "^function lines(doc: ThetaDocument)"` matches both files, once each); the other nine hits (`capitalised-bare-match-pattern-refusal.test.ts`, `fn-arg-type-mismatch-wired.test.ts`, `fn-param-name-case.test.ts`, `fn-param-name-reserved-keyword.test.ts`, `object-pattern-head-field-set-refusal.test.ts`, `object-pattern-head-unresolved-refusal.test.ts`, `pattern-field-literal-integer-narrowing-refusal.test.ts`, `reserved-keyword-inline-object-and-literal-keys.test.ts`, `reserved-keyword-object-pattern-head-refusal.test.ts`) wrap the same inner mapping under a differently-named `render`/`shapes` scaffold already tracked by `PTQ-0646` (whose six named sites include this review's other in-scope file, `reserved-keyword-object-pattern-head-refusal.test.ts`, but not this one).

## Why this is a problem
The same "reduce every diagnostic to `severity code @range: message`, and build one such line from literal line/column/endColumn arguments" pair of functions is authored from scratch in two files with no shared source of truth. A change to the range-rendering format (the `l:c-l:c` shape, or the `-` sentinel for a rangeless diagnostic) has to be hand-applied at both declaration sites.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already exports a rangeless `diagLines` for the same "reduce every diagnostic to one rendered line" job; a range-carrying sibling export there is the natural point these two files' `lines()`/`at()` pair already converge on.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kind; not a census/pin gate.
- Recording-double check: `lines()`/`at()` render diagnostics/build literal strings; neither is a fake, double, or MUST-NOT witness.
- docs/bugs/ signature search: `grep -rl "function lines(doc" docs/bugs/` returns 0 hits; no documented correct-reason red names either declaration.
- coverage-matrix/bug-doc citation search: `grep -n "reserved-keyword-misfire-faces\|reserved-keyword-remaining-identifier-positions" docs/reference/coverage-matrix.md` returns 0 hits; no merge, rename, or deletion of either file or any cell is proposed — only that the two `lines()`/`at()` declarations could converge on one export.
- Prior-filing search: `grep -rl "reserved-keyword-remaining-identifier-positions" quality/issues quality/intake` before this filing returns no hits; `PTQ-0646` tracks a same-shape but differently-named (`shapes`/`render`/`DiagShape`) scaffold across six other files, including this review's other in-scope file, but does not name `reserved-keyword-misfire-faces.test.ts` or the `lines`/`at` function-name pairing cited here, so this is a distinct, unfiled duplication pair.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/reserved-keyword-misfire-faces.test.ts:218-237 and tests/reserved-keyword-remaining-identifier-positions.test.ts:246-265, sed-extracted lines()/at() bodies diff to zero (byte-identical), both copies live (87/57 lines( and 49/7 at( call sites), the 11-file `@${at}: ${d.message}` grep and the two-file `^function lines(doc: ThetaDocument)` grep reproduce exactly, no tests/helpers module exports a range-carrying `severity code @l:c-l:c: message` renderer (e2e-s1 diagLines is rangeless; load-row-harness renders `l:c`/`unlocated`), both files under tests/, D7 boilerplate-duplication class, not gate files, not doubles, 0 coverage-matrix hits, 0 docs/bugs hits for the declaration and no merge/rename/delete proposed; not a duplicate — PTQ-0205 (fixed) covered only the rangeless diagLines/diagCodes, PTQ-0751/0733 track `lines(src,path)=diagLines(parseDoc(...))`/diagLines shadows, and PTQ-0522/0592/0646 track differently-shaped render()/DiagShape scaffolds in disjoint files with no `at(code,message,line,column,endColumn)` builder; accounting note for acceptance: the filing's claim that the other nine grep hits are all PTQ-0646's is wrong (PTQ-0646 names six files; fn-param-name-* are PTQ-0592) and tests/reserved-keyword-inline-object-and-literal-keys.test.ts:162-170 carries a byte-identical untracked third at() with the same inner mapping — fold it into this issue's location list (sites 3) at acceptance, and the fixer should mint one range-carrying helper that PTQ-0522's render() copies can also converge on (triage: claude-fable-5-1)
