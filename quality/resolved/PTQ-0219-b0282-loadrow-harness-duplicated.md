---
id: PTQ-0219
title: b0282 reimplements the LoadRow/registry diagnostic-load harness that tests/helpers/load-row-harness.ts already centralises
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:128-314
  - tests/helpers/load-row-harness.ts:34-191
  - tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:3-14
  - tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:3-15
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0282 reimplements the LoadRow/registry diagnostic-load harness that tests/helpers/load-row-harness.ts already centralises

## Observation
tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts declares,
module-scope, its own `RegistryRow` interface, `REGISTRY`/`REGISTRY_PATH`
constants, a `msg`/`line` message renderer, a `LoadRow` interface, a
`FRONTMATTER` constant, a `row`/`theta`/`paramsTheta` fixture-parsing trio, a
`registered` predicate, a `startPositions` projector, and an `expectCaptured`/
`expectRows` assertion pair — the same bundle that
tests/helpers/load-row-harness.ts already exports for exactly this purpose.
Two sibling files in the same bug-report family,
tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts and
tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts, import
this bundle from that module rather than redeclaring it. b0282 imports nothing
from tests/helpers/load-row-harness.ts and carries no comment naming it or any
other file as a source or convention for its local copy.

## Evidence

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:209-216
— the local `LoadRow` interface:
```ts
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}
```

tests/helpers/load-row-harness.ts:99-106 — the exported counterpart, identical
apart from the `export` keyword:
```ts
export interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:286-299
— the local `expectCaptured`, confirmed byte-identical to the helper's version
below via `diff` (once the `export` keyword is stripped):
```ts
function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
  ).toEqual([]);
}
```

tests/helpers/load-row-harness.ts:158-171 — the exported version (`diff` shows
zero differences against the excerpt above, apart from `export`):
```ts
export function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
  ).toEqual([]);
}
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:263-265
— `registered`, identical logic to the helper's `registered` with the
parameter renamed `row` → `r` (the same rename pattern PTQ-0206 recorded
between b0274 and b0277 before both were migrated to the shared helper):
```ts
function registered(r: LoadRow): boolean {
  return !r.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:248-253
— `paramsTheta`, byte-identical to the same-named function in the sibling file
tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:189-194
(confirmed by direct comparison of both bodies), even though b0277's copy sits
on top of the imported `row` and b0282's on top of its own local `row`:
```ts
function paramsTheta(label: string, typeText: string): LoadRow {
  return row(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
  );
}
```

tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:3-14 —
a sibling file in the identical bug-report family importing the shared bundle
instead of redeclaring it:
```ts
import {
  expectCaptured,
  expectRows,
  loadRowFromBody,
  PARSE_REGISTRY as REGISTRY,
  PARSE_REGISTRY_PATH as REGISTRY_PATH,
  registered,
  registryLineOf,
  registryMessageOf,
  startPositions,
  type LoadRow,
} from "./helpers/load-row-harness";
```

Pattern-wide search: `grep -rl "^function expectCaptured(rows: readonly
LoadRow\[\], names: readonly string\[\]): void {" tests --include="*.test.ts"`
→ b0282 is one of exactly 8 files sharing this signature (the other 7 are
tests/b0262-unresolved-named-type-reference-positions.test.ts,
tests/b0273-query-result-error-side-unresolved-name.test.ts,
tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts,
tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts,
tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts,
tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts, and
tests/b0284-non-identifier-applied-generic-head.test.ts) — a count this same
lens already recorded once, in the now-fixed PTQ-0206, which cited only b0274
and b0277 as the files to migrate and left b0282 unaddressed.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: b0282's `LoadRow` interface,
`registered`, `expectCaptured` and `paramsTheta` are byte-identical (via
`diff`, quoted above) to pieces tests/helpers/load-row-harness.ts already
exports for this exact purpose, and to a sibling file's local copy of the one
piece (`paramsTheta`) the shared module does not export. The canonical helper
is not speculative — two files in the same bug-report family already import it
in place of the identical local declarations b0282 still carries, and the
helper's own header comment states it was created to centralise precisely this
bundle (citing PTQ-0206 and PTQ-0207 by number). b0282 is the one file PTQ-0206
explicitly counted as sharing the pattern but did not cite as a migration
target, so its copy survived that fix unchanged.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts is the module two sibling files in this same
bug-report family already import the `LoadRow`/`registered`/`expectCaptured`/
`expectRows` bundle from; it is the existing, demonstrated home for the pieces
b0282 still redeclares locally.

## False-positive check
- Gate-pin: tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts
  matches `*gate*.test.ts` by filename, but this finding cites no pinned count
  or inventory the file asserts — `LoadRow`/`registered`/`expectCaptured` are
  plain helper functions, not `expect` calls over a fixed corpus size — so the
  census/pin carve-out does not apply.
- Recording-double: none of the cited functions records a call to assert
  something was never invoked; `registered`/`expectCaptured` read fields off an
  already-returned `LoadRow` built from a synchronous `parseDoc` call. Not
  applicable.
- docs/bugs/ signature search: docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md
  Status "fixed (0.280.0)". `npx vitest run
  tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts` → 11
  passed (11) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0282-unknown-applied-generic-head-gate-at-nine-positions"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rl
  "b0282-unknown-applied-generic-head-gate-at-nine-positions" docs/bugs/` →
  docs/bugs/0284-non-identifier-applied-generic-head-silent-at-five-captures.md,
  whose witness list marks this file "comment-only: its `params.ts` line
  citations, shifted by this gate's insertion, re-derived. Every hunk
  classified; no assertion touched." That pin covers this file's prose
  citations of `params.ts` line numbers, not its internal harness-function
  definitions; this finding proposes no merge, rename or deletion of the file,
  any `it()`/`describe()`, or any assertion — only that the cited internal
  functions could be imported rather than redeclared — so the pin is
  unaffected.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every function cited is exercised by the tests in
  its own file (11/11 passing).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — LoadRow (209-216), expectCaptured (286-299), registered (263-265) and paramsTheta (248-253, matching b0277's local copy) independently reproduce as byte-identical/near-identical duplicates of tests/helpers/load-row-harness.ts, which b0274/b0277 already import while b0282 imports nothing and names no source; the cited "8-file" pattern-search is stale (re-run today gives 6 files, not 8, and b0274/b0277 no longer match since PTQ-0206 migrated them) but this doesn't undermine the independently-verified core excerpts; correctly scoped D7 boilerplate-duplication with gate-pin/recording-double/coverage-matrix carve-outs properly ruled out, and not a duplicate of already-fixed PTQ-0206/0207 (those targeted different files; b0282 was named but left unmigrated) (triage: claude-opus-5)
