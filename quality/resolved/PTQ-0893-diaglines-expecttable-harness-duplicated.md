---
id: PTQ-0893
title: The range-rendering diagLines/lines/at/expectTable table-assertion harness is redeclared verbatim in fn-return-void-query-sink.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/let-annotation-query-double-emission.test.ts:107-137
  - tests/let-annotation-query-double-emission.test.ts:139-154
  - tests/fn-return-void-query-sink.test.ts:150-181
  - tests/fn-return-void-query-sink.test.ts:187-198
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The range-rendering diagLines/lines/at/expectTable table-assertion harness is redeclared verbatim in fn-return-void-query-sink.test.ts

## Observation
`tests/let-annotation-query-double-emission.test.ts` declares four
module-private functions — `diagLines(doc)` (rendering each diagnostic as
`` `${severity} ${code} @ ${start}-${end}` `` with an inline `expect(range,
...).toBeDefined()` guard), `lines(src)` (parses then calls `diagLines`),
`at(code, range)` (renders one expected line), and `expectTable(cells, why)`
(asserts a whole label→lines map in one `toEqual`). `tests/fn-return-void-query-sink.test.ts`
declares the identical four functions under the identical names, with
byte-identical bodies apart from the bug number and one sentence of prose in
each of `diagLines`'s doc comment and its `expect` message, and the fixture
label string passed to `parseDoc` inside `lines`. Neither file imports the
other's declaration, and no `tests/helpers/` module exports this shape.

## Evidence
`tests/let-annotation-query-double-emission.test.ts:107-137`:
```ts
/**
 * Each diagnostic as `<severity> <code> @ <start>-<end>`, in emission order. A
 * range-less diagnostic (the located-site classification admits file-only and
 * location-less ones) would render no range to compare, so its absence is
 * asserted rather than defaulted — a silent placeholder would let a collapsed
 * pair read as a pass.
 */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => {
    const range = d.range;
    expect(
      range,
      `bug 0093: ${d.code} arrived with no range, so the two entries of a doubling pair — ` +
        "which differ ONLY in range — cannot be distinguished at this position",
    ).toBeDefined();
    const r = range as NonNullable<typeof range>;
    return (
      `${d.severity} ${d.code} @ ${r.start.line}:${r.start.column}` +
      `-${r.end.line}:${r.end.column}`
    );
  });
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src, "bug0093.theta"));
}

/** One rendered error line at one range. */
function at(code: string, range: string): string {
  return `error ${code} @ ${range}`;
}
```

`tests/fn-return-void-query-sink.test.ts:150-181` — the same four functions,
same names, same bodies, differing only in the bug number and one sentence
of prose:
```ts
/**
 * Each diagnostic as `<severity> <code> @ <start>-<end>`, in emission order. A
 * range-less diagnostic (the located-site classification admits file-only and
 * location-less ones) would render no range to compare, so its absence is
 * asserted rather than defaulted — a silent placeholder would let a
 * declaration-ranged line read as a query-ranged one.
 */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => {
    const range = d.range;
    expect(
      range,
      `bug 0220: ${d.code} arrived with no range, so a line at the QUERY's range — the ` +
        "defect — cannot be distinguished from one at the declaration's own range, which is " +
        "correct and out of scope",
    ).toBeDefined();
    const r = range as NonNullable<typeof range>;
    return (
      `${d.severity} ${d.code} @ ${r.start.line}:${r.start.column}` +
      `-${r.end.line}:${r.end.column}`
    );
  });
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src, "bug0220.theta"));
}

/** One rendered error line at one range. */
function at(code: string, range: string): string {
  return `error ${code} @ ${range}`;
}
```

`tests/let-annotation-query-double-emission.test.ts:139-154`:
```ts
/**
 * The whole ordered diagnostic list of every cell of a table, asserted in one
 * equality so a divergence names the row rather than stopping at the first one.
 */
function expectTable(
  cells: ReadonlyArray<readonly [string, string, readonly string[]]>,
  why: string,
): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const [label, src, want] of cells) {
    actual[label] = lines(src);
    expected[label] = [...want];
  }
  expect(actual, why).toEqual(expected);
}
```

`tests/fn-return-void-query-sink.test.ts:187-198` — byte-identical:
```ts
/**
 * The whole ordered diagnostic list of every cell of a table, asserted in one
 * equality so a divergence names the row rather than stopping at the first one.
 */
function expectTable(
  cells: ReadonlyArray<readonly [string, string, readonly string[]]>,
  why: string,
): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const [label, src, want] of cells) {
    actual[label] = lines(src);
    expected[label] = [...want];
  }
  expect(actual, why).toEqual(expected);
}
```

Exact search re-run immediately before filing: `grep -n "^function diagLines\|^function lines\|^function at\|^function expectTable" tests/let-annotation-query-double-emission.test.ts tests/fn-return-void-query-sink.test.ts` returns exactly one declaration of each of the four names per file, at the cited lines; `sed -n` extracts of the four ranges from each file, diffed pairwise, show the `expectTable` and `at` bodies with zero byte difference and the `diagLines`/`lines` bodies differing only in the bug number token and one sentence of the doc comment / `expect` message. `grep -rln "function expectTable\|r.start.line" tests/helpers/` → 0 hits: no `tests/helpers/` module hosts this range-rendering table-assertion shape.

## Why this is a problem
Four functions that together form one cohesive harness — render a
range-qualified diagnostic line with a fail-loud range guard, wrap it with a
per-fixture parse, render one expected line, and assert a whole label→lines
table in one equality — are declared a second time under the identical
names and (for two of the four) byte-identical bodies, rather than composed
from one place. Both files already import `parseDoc` from
`./helpers/e2e-s1` and `expect` from `vitest`, so the missing piece is a
shared `tests/helpers/` export for this shape, which does not exist today.

## Suggested direction (non-binding, optional)
A shared module exporting this range-rendering `diagLines`/`at`/`expectTable`
trio, parameterised over the bug-number token used in the range-guard
message and the `parseDoc` fixture label, would sit naturally beside
`tests/helpers/e2e-s1.ts`'s existing message-only `diagLines` export, as a
hypothesis only.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: this harness renders an already-produced,
  already-parsed diagnostics array for a positive table assertion; it
  records no call and backs no "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rln "diagLines\|expectTable" docs/bugs/`
  → 0 hits; no open bug document cites either helper by name or argues for
  keeping the two copies unshared.
- coverage-matrix/bug-doc citation search: `grep -n
  "let-annotation-query-double-emission\|fn-return-void-query-sink"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` in either file —
  only that the four harness functions could be composed from one shared
  export — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated harness
  DEFINITION, not a missing test path; both copies are fully exercised by
  their own file's cells at HEAD.
- Prior-finding overlap check: `grep -rl "fn-return-void-query-sink"
  quality/intake quality/issues` → `qw20260918050411-d7-01-generic-argument-msg-reimplements-registrymessageof.md`,
  `PTQ-0673-03-queryschemas-walk-duplicated.md`,
  `PTQ-0747-registry-oracle-reimplemented-fn-param-void-sink.md`; none of
  these three cites `diagLines`, `at`, or `expectTable` in their evidence or
  location lists — PTQ-0673 covers a disjoint root cause (the `querySchemas`
  generic tree-walk, cited at
  `tests/fn-return-void-query-sink.test.ts:225-253`, well outside this
  finding's 150-198 range) between the same two files plus a third. This
  finding's function set does not overlap PTQ-0673's, PTQ-0757's (a
  registry-read duplication, resolved for the current text of this file —
  the file now imports `readRegistry` from `tests/helpers/registry-oracle`
  rather than reimplementing the read, so that finding no longer matches
  current code), or the rejected FM/TAIL/`body()` finding (a disjoint
  fixture-string root cause).

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: sed-extracted 107-137/139-154 vs 150-181/183-198 and diffed under $TEMP — `at` and `expectTable` zero-diff, `diagLines`/`lines` differ only in the bug-number token, one prose sentence and the `parseDoc` label; all four helpers live in both files (expectTable 9/6 calls, at 23/10); `^function expectTable` greps to exactly these two files in all of tests/ and no tests/helpers/ module exports the shape; docs/bugs name neither helper (exit 1) and coverage-matrix names neither file, and although 8 docs/bugs cite the two test files the direction is helper extraction not merge/rename/delete so no carve-out triggers; both locations under tests/, D7 boilerplate-duplication class, not a gate/recording-double/red-test; not a duplicate — PTQ-0205 (fixed) covered the message-only diagLines shape and PTQ-0522 (open) covers only the missing shared `l:c-l:c` range formatter, whose fix would serve the `diagLines` render line but leave `expectTable`/`lines`/`at(code, range)` untouched, so the fixer should compose on PTQ-0522's formatter rather than mint a second one; PTQ-0673/0747/0757/0500 cite disjoint functions and ranges in these files (triage: claude-fable-5-1)
