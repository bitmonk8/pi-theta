---
id: PTQ-0254
title: Three diagnostics-primitive.test.ts tests assert a hand-built Diagnostic literal's own fields against the exact values just assigned to them
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/diagnostics-primitive.test.ts:30-38
  - tests/diagnostics-primitive.test.ts:91-98
  - tests/diagnostics-primitive.test.ts:108-115
sites: 3
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# Three diagnostics-primitive.test.ts tests assert a hand-built Diagnostic literal's own fields against the exact values just assigned to them

## Observation
In three of the seven `it()` blocks in tests/diagnostics-primitive.test.ts, the
test builds a `Diagnostic` object literal and then, before calling
`renderDiagnosticLine` (the function under test), asserts that one or two of
that same literal's own fields equal — or are absent, per `.toBeUndefined()` —
exactly what the literal a few lines above already assigned (or omitted). No
function call, seam, or production import sits between the literal's
construction and these particular `expect()` calls. `Diagnostic`
(src/diagnostics/diagnostic.ts:39-43) is a plain interface of readonly fields
with no getters or computed properties, so an object literal's `code`/`file`/
`range` keys hold exactly what was written and nothing else can set them.

## Evidence

tests/diagnostics-primitive.test.ts:30-38 (re-read verbatim immediately before
filing):
```ts
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/parse/unterminated-string",
      file: "entry.theta",
      range: { start: { line: 3, column: 5 }, end: { line: 3, column: 6 } },
      message: "unterminated string literal",
    };

    expect(diagnostic.code).toBe("theta/parse/unterminated-string");
```

tests/diagnostics-primitive.test.ts:91-98:
```ts
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/load/missing-source",
      message: "discovery source path does not exist: pi.theta[0]",
    };

    expect(diagnostic.file).toBeUndefined();
    expect(diagnostic.range).toBeUndefined();
```

tests/diagnostics-primitive.test.ts:108-115:
```ts
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "theta/load/invalid-encoding",
      file: "broken.theta",
      message: "invalid UTF-8 encoding at byte offset 12",
    };

    expect(diagnostic.range).toBeUndefined();
```

src/diagnostics/diagnostic.ts:39-43 — `Diagnostic`'s plain shape (no getters,
no computed fields):
```ts
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly file?: string;
  readonly range?: SourceRange;
```

Exact search performed: `grep -n "const diagnostic: Diagnostic = {\|expect(diagnostic\.\|expect(renderDiagnosticLine" tests/diagnostics-primitive.test.ts` → the file declares exactly 5 single-object `const diagnostic: Diagnostic = {` literals (lines 30, 48, 66, 91, 108), one per DIAG-1 `it()`. Of those 5, exactly 3 (lines 30, 91, 108 — cited above) are followed by an `expect(diagnostic.<field>)` field check before the same test's `expect(renderDiagnosticLine(diagnostic))` call; the other 2 (line 48, the "hint" test, and line 66, the "related site" test) go straight to the `renderDiagnosticLine` assertion with no preceding field check.

## Why this is a problem
`expect(diagnostic.code).toBe("theta/parse/unterminated-string")` (line 38)
reads a readonly field that was set, verbatim, to that exact string two lines
above (line 32) in the same literal, in the same test, with no function call
in between. JavaScript/TypeScript object-literal assignment guarantees
`{ code: "X" }.code === "X"`; the only way this assertion could fail is if the
language's own property semantics broke, so it observes nothing about
`renderDiagnosticLine`, `assembleDiagnostics`, or any other production code.
The same mechanism produces `expect(diagnostic.file).toBeUndefined()` and
`expect(diagnostic.range).toBeUndefined()` (lines 97-98): the literal at lines
91-95 never declares a `file` or `range` key, so property lookup on an absent
key trivially yields `undefined` — no production decision is exercised. Line
115's `expect(diagnostic.range).toBeUndefined()` repeats the same shape: the
literal at lines 108-113 omits `range`. In all three tests the very next
statement — `expect(renderDiagnosticLine(diagnostic)).toBe(...)` — does
exercise the function under test, so the test as a whole is not vacuous; the
finding is narrowly that the field-check assertion immediately preceding it in
each of these three tests cannot fail and verifies nothing the surrounding
docstring (which already states the same precondition in prose) and the
subsequent render assertion don't already establish.

## Suggested direction (non-binding, optional)
Each of the three field checks re-states, as an assertion, exactly what its
own literal declares a few lines above and what the test's leading comment
already states in prose; the render assertion immediately following is what
actually exercises `renderDiagnosticLine`'s located/file-only/location-less
branching these tests are titled after.

## False-positive check
- Gate-pin check: tests/diagnostics-primitive.test.ts matches none of
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); not applicable.
- Recording-double check: none of the three assertions reads a call-recording
  double or backs a "never called" witness — each reads a field directly off a
  hand-built literal declared moments earlier in the same test; the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "diagnostics-primitive"
  docs/bugs/` → 2 hits, docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md
  (cites this file's :169-237, the separate "Multi-error assembly" test's
  synthetic `.thetalib` file paths) and
  docs/bugs/0139-fn-parameter-name-case-rule-unenforced.md (cites this file's
  :149 and :216, the same Multi-error-assembly test's use of
  `binding-case-mismatch` as a registry fixture). Neither citation's line range
  overlaps the three sites cited here (30-38, 91-98, 108-115), and `npx vitest
  run tests/diagnostics-primitive.test.ts` passes 7/7 at HEAD, so this is an
  ordinary green test, not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "diagnostics-primitive"
  docs/reference/coverage-matrix.md` → 0 hits. The file is named in the two bug
  docs above, but only for its other lines/tests (see above); this finding
  proposes no merge, rename, or deletion of any test, `it()`, or `describe()`
  — only that three specific pre-existing assertions verify nothing beyond the
  object-literal semantics used to build their own fixture.
- Coverage check: this finding does not claim any DIAG-1 rendering behaviour is
  untested — the render assertion in each of the three tests does exercise
  `renderDiagnosticLine`; the claim is narrowly that the additional field-check
  assertion preceding it, in each of the three tests, cannot fail.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: literals/asserts at 30-38, 91-98, 108-115 and Diagnostic's plain readonly shape at diagnostic.ts:39-43 all match exactly, the grep reproduces 5 literals/4 field-checks/5 render-calls, docs/bugs 0132 (:169-237) and 0139 (:149,:216) cite only the separate Multi-error-assembly test with no overlap, coverage-matrix has 0 hits, and `npx vitest run tests/diagnostics-primitive.test.ts` passes 7/7 — each cited assertion reads a plain field off a hand-built literal with no intervening call, making it strictly unfalsifiable per JS property semantics, matching the already-confirmed D7 "assertion that cannot fail" class (PTQ-0231/0233/0234/0241) with no gate/recording-double/coverage carve-out and no existing duplicate (triage: claude-opus-5)
