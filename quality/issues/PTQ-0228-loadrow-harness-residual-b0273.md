---
id: PTQ-0228
title: b0273 redeclares startPositions, expectCaptured, and expectRows verbatim from the load-row-harness module it already imports five other symbols from
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0273-query-result-error-side-unresolved-name.test.ts:7-13
  - tests/b0273-query-result-error-side-unresolved-name.test.ts:185-189
  - tests/b0273-query-result-error-side-unresolved-name.test.ts:198-211
  - tests/b0273-query-result-error-side-unresolved-name.test.ts:219-231
  - tests/helpers/load-row-harness.ts:146-150
  - tests/helpers/load-row-harness.ts:158-171
  - tests/helpers/load-row-harness.ts:179-191
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0273 redeclares startPositions, expectCaptured, and expectRows verbatim from the load-row-harness module it already imports five other symbols from

## Observation
tests/b0273-query-result-error-side-unresolved-name.test.ts imports
`loadRowFromBody`, `registered`, `registryLineOf`, `registryMessageOf`, and
`type LoadRow` from `tests/helpers/load-row-harness.ts` in one statement, then
separately declares its own module-scope `startPositions`, `expectCaptured`,
and `expectRows` functions. All three bodies are byte-for-byte identical to
the same-named functions the same helper module already exports under
`export`. Sibling file
tests/b0272-enclosing-annotation-refusal-nested-head.test.ts, which imports
from the same module, also keeps local `expectCaptured`/`expectRows`
functions (and an `extents` function in place of `startPositions`), but its
own header comment states why: those local versions take an added
`statements`/`expectedExtents` parameter the shared versions do not. b0273's
header comment makes no such claim — it calls its own three functions
"unchanged" from the shared shape.

## Evidence
tests/b0273-query-result-error-side-unresolved-name.test.ts:7-13 — the
existing import, naming the module the three functions could join:
```ts
import {
  loadRowFromBody,
  registered,
  registryLineOf,
  registryMessageOf,
  type LoadRow,
} from "./helpers/load-row-harness";
```

tests/b0273-query-result-error-side-unresolved-name.test.ts:185-189 — the
local `startPositions`:
```ts
function startPositions(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}
```

tests/helpers/load-row-harness.ts:146-150 — the module's own export, same
body:
```ts
export function startPositions(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}
```

tests/b0273-query-result-error-side-unresolved-name.test.ts:198-211 — the
local `expectCaptured`:
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

tests/helpers/load-row-harness.ts:158-171 — the module's own export, same
parameter names, same body, same two literal precondition strings:
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

tests/b0273-query-result-error-side-unresolved-name.test.ts:219-231 — the
local `expectRows`:
```ts
function expectRows(
  rows: readonly LoadRow[],
  expected: readonly (readonly string[])[],
  expectedLines: () => readonly (readonly string[])[],
): void {
  expect(rows.map((r) => [r.label, r.codes])).toEqual(
    rows.map((r, i) => [r.label, expected[i]]),
  );
  const wanted = expectedLines();
  expect(rows.map((r) => [r.label, r.lines])).toEqual(
    rows.map((r, i) => [r.label, wanted[i]]),
  );
}
```

tests/helpers/load-row-harness.ts:179-191 — the module's own export, same
signature, same body:
```ts
export function expectRows(
  rows: readonly LoadRow[],
  expected: readonly (readonly string[])[],
  expectedLines: () => readonly (readonly string[])[],
): void {
  expect(rows.map((r) => [r.label, r.codes])).toEqual(
    rows.map((r, i) => [r.label, expected[i]]),
  );
  const wanted = expectedLines();
  expect(rows.map((r) => [r.label, r.lines])).toEqual(
    rows.map((r, i) => [r.label, wanted[i]]),
  );
}
```

tests/b0273-query-result-error-side-unresolved-name.test.ts's own header
comment (preceding the `theta()` helper), naming the three as unchanged from
the shared shape:
```
// `LoadRow`, `registered` and `theta`/`msg`/`line`'s shared rendering are the
// harness in `tests/helpers/load-row-harness.ts` (also used by
// tests/b0272-enclosing-annotation-refusal-nested-head.test.ts); this file's
// own `startPositions`/`expectCaptured`/`expectRows` below are unchanged.
```

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: `tests/helpers/load-row-harness.ts`
is the canonical shared module for this harness family — its own header states
it centralises pieces that were independently redeclared across several
`b02xx` bug-report test files — and b0273 already imports five other symbols
from it in one statement. `startPositions`, `expectCaptured`, and
`expectRows` are three further symbols the module already exports, and each
one's body (and, for `expectCaptured`/`expectRows`, its JSDoc and its two
literal precondition strings) matches b0273's local copy exactly. The
comparison file b0272 shows that keeping a local copy is not automatically a
problem when the shapes genuinely differ: b0272's own `expectCaptured`/
`expectRows` take an added `statements`/`expectedExtents` argument the shared
versions do not, and its header comment states this divergence outright
("this file's own `extents`/`expectCaptured`/`expectRows` diverge from that
shared shape ... and stay local"). b0273 makes no such claim — its own
comment calls the three functions "unchanged" — and the bodies cited above
show no divergence that would explain keeping them out of the existing
import statement.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts already exports `startPositions`,
`expectCaptured`, and `expectRows` beside the five symbols b0273 already
imports from it in one statement; that import list is where the three names
would join.

## False-positive check
- Gate-pin: tests/b0273-query-result-error-side-unresolved-name.test.ts does
  not match `*gate*.test.ts` or the named kin; not applicable, and none of the
  three duplicated functions is a pinned count or inventory assertion — each
  is a generic list-equality helper parameterised entirely by caller-supplied
  expected values.
- Recording-double: none of `startPositions`/`expectCaptured`/`expectRows`
  records a call or backs a "never called" witness; each reads fields off an
  already-produced `LoadRow`/`LoadRow[]`. Not applicable.
- docs/bugs/ signature search: docs/bugs/0273-propagated-result-error-side-unresolved-name-silent.md
  — Status "fixed (0.267.0)"; the document does not mention `expectCaptured`,
  `expectRows`, or `startPositions` anywhere, so there is no documented
  rationale for keeping these three local. `npx vitest run
  tests/b0273-query-result-error-side-unresolved-name.test.ts
  tests/b0272-enclosing-annotation-refusal-nested-head.test.ts` passes 18/18
  at HEAD; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0273-query-result-error-side-unresolved-name" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the test
  file or any `it()`/`describe()` — only that three internal helper functions
  could be imported rather than redeclared — so no citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0207 ("b0272 and
  b0273 duplicate their LoadRow/theta/registered fixture-load harness and
  msg/line message renderer almost byte-for-byte", status fixed) is
  specifically about b0272 and b0273, but its own Observation enumerates a
  five-piece harness (`msg`/`line`/`LoadRow`/`FRONTMATTER`/`theta`/
  `registered`) that does not include `startPositions`, `expectCaptured`, or
  `expectRows`; those three names are absent from its Evidence and its
  `locations` field. PTQ-0206 ("...same LoadRow/registered/expectCaptured/
  expectRows diagnostic-load harness", status fixed) does name
  `expectCaptured`/`expectRows`, but its cited `locations` are
  tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts,
  tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts, and
  tests/helpers/e2e-s1.ts; b0273 appears in that finding only inside a
  pattern-wide grep count listing eight files sharing the function's exact
  signature, not as a location the finding's remediation addressed, and
  tests/helpers/load-row-harness.ts (the module this finding is about) is not
  mentioned in PTQ-0206 at all. Neither prior finding's cited locations or
  evidence is this specific pairing (b0273 as an importer of
  tests/helpers/load-row-harness.ts that still shadows three of its exports);
  this finding is that, as the tree stands today, that pairing still diverges.
- Coverage check: the claim is entirely about a repeated function DEFINITION
  already available for import; every function cited is exercised by the
  tests in its own file (confirmed passing above), so no coverage claim is
  made.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — startPositions/expectCaptured/expectRows at tests/b0273-...ts:185-231 are byte-identical in body (plus expectCaptured's two literal precondition strings) to the exports at tests/helpers/load-row-harness.ts:146-191, which b0273 already imports 5 other symbols from in one statement; its header calls the trio "unchanged" while b0272's parallel header states a real divergence (verified: extra statements/expectedExtents params) — all excerpts, line numbers, docs/bugs status (fixed, no mention of the trio), 18/18 vitest pass, 0-hit coverage-matrix search, and PTQ-0206/PTQ-0207 (read in full; neither cites this trio for b0273) reproduce as claimed (triage: claude-opus-5)
