---
id: PTQ-0278
title: call-with-clause-failure-arms.test.ts reimplements call-with-clause-harness.ts's exported R() dummy source range three separate ways in one file
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/call-with-clause-failure-arms.test.ts:74-76
  - tests/call-with-clause-failure-arms.test.ts:354
  - tests/call-with-clause-failure-arms.test.ts:361
  - tests/call-with-clause-failure-arms.test.ts:372
  - tests/call-with-clause-failure-arms.test.ts:375
  - tests/call-with-clause-failure-arms.test.ts:494-496
  - tests/helpers/call-with-clause-harness.ts:61-63
sites: 7                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# call-with-clause-failure-arms.test.ts reimplements call-with-clause-harness.ts's exported R() dummy source range three separate ways in one file

## Observation
tests/helpers/call-with-clause-harness.ts exports `R()`, a one-line dummy
`SourceRange` (`{ start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }`)
for tests that hand-build AST nodes and do not assert on positions.
tests/call-with-clause-failure-arms.test.ts already imports nine other names
from that exact module, but never imports `R`. Instead it re-derives the
identical value three separate ways inside itself: a local `span()` function
(byte-identical body to `R()`), a second local `span2()` function defined
later in the same file (also byte-identical to `R()`), and four more
occurrences where the same literal object is typed out by hand instead of
calling either local helper. A sibling file reviewed in this same batch,
tests/call-with-clause-static-checks.test.ts, imports and uses `R` directly
from the same module.

## Evidence
tests/helpers/call-with-clause-harness.ts:61-63 — the canonical export
(already imported into tests/call-with-clause-failure-arms.test.ts's own
`import { … } from "./helpers/call-with-clause-harness"` for nine other
names):
```ts
export function R(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/call-with-clause-static-checks.test.ts:39 — the sibling file in this
same review batch already taking the direct route:
```ts
import { R, strExpr, withClause, type FakeCallWithClause } from "./helpers/call-with-clause-harness";
```

tests/call-with-clause-failure-arms.test.ts:74-76 — the first local
reimplementation, byte-identical to `R()`'s body:
```ts
function span() {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```
`span()` is then called repeatedly earlier in the file than the block cited
next, e.g. at line 82 (`range: span(),`) and lines 212/216
(`range: span(), … range: span(),`), so it is in active use before the
inline duplicates below appear.

tests/call-with-clause-failure-arms.test.ts:350-363 — two of the four raw
inline duplicates (lines 354 and 361), appearing in the same file, after
`span()` is already defined and already in use:
```ts
  it("a clause on a callee that turns out prompt-mode at runtime refuses before any spawn, and the refusal is observable once the invoke result is bound", async () => {
    const promptCallee = {
      sourcePath: "/thetadir/child.theta",
      frontmatter: { mode: "prompt" } as unknown as import("../src/parser/frontmatter").ParsedFrontmatter,
      body: { statements: [], tail: { kind: "string", value: "hi", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } } as unknown as import("../src/parser/theta-document").Expr },
    };
    const invokeExpr = {
      kind: "invoke",
      path: CHILD_LITERAL,
      returnSchema: null,
      args: [],
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      withClause: withClause(strExpr("sub/dir")),
    } as unknown as InvokeExpr;
```

tests/call-with-clause-failure-arms.test.ts:364-375 — the other two inline
duplicates (lines 372 and 375), continuing the same statement:
```ts
    const callerBody: ThetaBody = {
      statements: [
        {
          kind: "let",
          name: "r",
          mutable: false,
          annotation: null,
          init: invokeExpr,
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
        } as unknown as ThetaBody["statements"][number],
      ],
      tail: { kind: "ident", name: "r", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } } as unknown as Expr,
```

tests/call-with-clause-failure-arms.test.ts:494-496 — a second, differently
named local reimplementation, defined later in the same file:
```ts
function span2() {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

Exact searches: `grep -c "start: { line: 1, column: 1 }, end: { line: 1,
column: 2 } }" tests/call-with-clause-failure-arms.test.ts` → 6 matching
lines across the file (the `span()` and `span2()` return statements, plus
the four inline spellings at 354/361/372/375) — one written value, produced
six times, none of them the imported `R`. `grep -n "^function span[0-9]*("
tests/call-with-clause-failure-arms.test.ts` → exactly the two definitions
cited above (lines 74 and 494).

## Why this is a problem
`tests/helpers/call-with-clause-harness.ts`'s `R()` already exists to serve
exactly this need (its own doc comment: "A dummy 1-char source range; no
test in this file asserts on positions"), and
tests/call-with-clause-failure-arms.test.ts already has an open import
statement to that module. Within this one file the identical value is
nonetheless produced three distinguishable ways — a `span()` helper, a
`span2()` helper defined later with the same body, and four verbatim inline
spellings interspersed among calls to `span()` itself — none of which
imports the already-available `R`. A sibling file reviewed in the same
batch, tests/call-with-clause-static-checks.test.ts, demonstrates that
importing `R` from this exact module is already an established, working
option immediately next to this file.

## Suggested direction (non-binding, optional)
Importing `R` from `./helpers/call-with-clause-harness` — the route
tests/call-with-clause-static-checks.test.ts already takes — covers every
site cited above and removes both local helpers.

## False-positive check
- Gate-pin check: the file matches neither `*gate*.test.ts` nor the named
  gate kin; the cited lines are dummy-range scaffolding, not a pinned count
  or inventory.
- Recording-double check: `R()`/`span()`/`span2()` are dummy position
  fixtures, not recording doubles backing a "never called" witness; not
  applicable.
- docs/bugs/ signature search: `grep -n "call-with-clause-failure-arms"
  docs/bugs/*.md docs/reference/coverage-matrix.md` → 0 hits; not a pinned
  or documented-red test.
- Run check: `npx vitest run tests/call-with-clause-failure-arms.test.ts` →
  10/10 passing at HEAD.
- Convention-breadth check: a bare `span()`-shaped local helper for a dummy
  1-char `SourceRange` is a common ad hoc idiom across the wider suite
  (`grep -rl "^function span(" tests --include="*.test.ts"` → 47 files), so
  this finding does not rest on "span() is duplicated somewhere else in the
  suite." It rests on a narrower, in-file fact that breadth does not excuse:
  this specific file already imports nine other names from the one module
  that exports the exact drop-in replacement, that module's export is
  already used by a sibling file inside this same six-file review batch, and
  the file still produces the identical value three inconsistent ways
  (`span`, `span2`, and four hand-typed literals) rather than the one form it
  already has direct access to.
- Coverage check: this finding does not claim a missing test path; every
  cited line backs an assertion or AST-construction argument already
  exercised by this file's own passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — span()/span2() (74-76/494-496) and the four inline literals (354,361,372,375) are verified byte-identical reimplementations of the already-imported module's doc-commented R() (harness.ts:61-63, same commit 96303cc3), a same-batch sibling already imports R directly, every cited line/grep/10-10-passing run reproduces exactly, and the wider suite's 47-file span() idiom is independent of this harness and doesn't reach this file's compounding in-file triple duplication (triage: claude-opus-5)
