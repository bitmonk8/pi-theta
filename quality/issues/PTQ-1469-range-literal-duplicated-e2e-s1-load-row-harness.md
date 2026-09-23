---
id: PTQ-1469
title: range() source-range literal builder duplicated verbatim in e2e-s1.ts and load-row-harness.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/e2e-s1.ts:305-316
  - tests/helpers/load-row-harness.ts:690-701
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# range() source-range literal builder duplicated verbatim in e2e-s1.ts and load-row-harness.ts

## Observation
Both `tests/helpers/e2e-s1.ts` and `tests/helpers/load-row-harness.ts` declare an
exported function named `range`, with an identical docstring and an identical
body, that builds a `SourceRange` literal from four 1-indexed, end-exclusive-column
coordinates. `load-row-harness.ts` already imports five other members from
`./e2e-s1` (`at, topKinds, parseDoc, diagLines, isLoadParseError`) on its line 28,
so the same-directory canonical source for this helper is already wired into the
file's import statement; `range` alone is redeclared locally instead of added to
that import list.

## Evidence
tests/helpers/e2e-s1.ts:305-316
```ts
/** A 1-indexed, end-exclusive-column source range literal. */
export function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}
```

tests/helpers/load-row-harness.ts:690-701
```ts
/** A 1-indexed, end-exclusive-column source range literal. */
export function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}
```

tests/helpers/load-row-harness.ts:28 (the existing import from the canonical source):
```ts
import { at, topKinds, parseDoc, diagLines, isLoadParseError } from "./e2e-s1";
```

Search performed: `grep -n "^export function range(" tests/helpers/e2e-s1.ts tests/helpers/load-row-harness.ts` — 2 hits, one per file, bodies byte-identical (docstring included).

## Why this is a problem
Both declarations are exported, byte-identical, twelve-line functions living
in `tests/helpers/`, the natural home this repository's own comment in
`load-row-harness.ts` names for shared harness parts ("This module centralises
the parts that are byte-for-byte identical across those files"). The two
copies are exactly the shape that comment describes for the rest of the file's
own helpers, but `range` itself was left out of that centralisation and instead
copy-pasted, in the same file that already imports other members from the
original.

## Suggested direction (non-binding, optional)
`load-row-harness.ts` could import `range` from `./e2e-s1` alongside the other
five members already imported on line 28, dropping its own local
redeclaration — observation, not a design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a census/pin-gate
  filename; not applicable.
- Recording-double check: `range` is a plain literal builder, not a recording
  double; not applicable.
- docs/bugs/ signature search: `grep -rn "export function range(" docs/bugs/`
  — no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rln "range(" docs/reference/coverage-matrix.md`
  found no citation of either `range` declaration by name; no citation
  constraint applies.
- Coverage drift check: this finding is about the duplicated helper's source
  code, not about any test's assertions or missing coverage; it does not
  propose merging or renaming a cited test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both `export function range(` declarations reproduce byte-identical (docstring included) at e2e-s1.ts:305-316 and load-row-harness.ts:690-701; both copies are live (load-row-harness's is called at its line 711 and imported by 5 tests, e2e-s1's imported by 4), load-row-harness.ts:28 already imports five e2e-s1 members, no docs/bugs or coverage-matrix citation, no gate/recording-double carve-out, and no open/resolved PTQ tracks this pair (PTQ-0522/PTQ-0973 cite different files) — D7 copy-paste boilerplate with a mechanical fix (import, re-export to keep the five downstream importers) (triage: claude-fable-5-1)
