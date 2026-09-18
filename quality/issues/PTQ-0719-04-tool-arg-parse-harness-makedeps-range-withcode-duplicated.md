---
id: PTQ-0719
title: tool-arg-parse-checks.test.ts and tool-arg-shape-enforcement.test.ts redeclare an identical makeDeps/range/withCode parse harness, and makeDeps duplicates tests/helpers/e2e-s1.ts's parseDeps
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tool-arg-parse-checks.test.ts:150-158
  - tests/tool-arg-parse-checks.test.ts:165-167
  - tests/tool-arg-parse-checks.test.ts:185-195
  - tests/tool-arg-shape-enforcement.test.ts:136-146
  - tests/tool-arg-shape-enforcement.test.ts:153-155
  - tests/tool-arg-shape-enforcement.test.ts:166-176
  - tests/helpers/e2e-s1.ts:38-40
sites: 6
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# tool-arg-parse-checks.test.ts and tool-arg-shape-enforcement.test.ts redeclare an identical makeDeps/range/withCode parse harness, and makeDeps duplicates tests/helpers/e2e-s1.ts's parseDeps

## Observation
tests/tool-arg-parse-checks.test.ts and tests/tool-arg-shape-enforcement.test.ts
each declare a local `makeDeps(): ParseThetaDocumentDeps`, a local
`range(startLine, startColumn, endLine, endColumn): SourceRange`, and a local
`withCode(diags, code): Diagnostic[]` — all three byte-identical (modulo one
line-wrap) between the two files. `makeDeps` is itself a re-derivation of
tests/helpers/e2e-s1.ts's exported `parseDeps()`, which returns the same
`{ systemNote, modelMatcher }` shape built from the same inert
sendMessage/notify/emitDiagnostic no-ops and the same trivially-resolving
model matcher. tests/tool-arg-parse-checks.test.ts's own comment even names
the pattern's origin ("the tests/shadowed-callable-call.test.ts makeDeps
pattern") without naming e2e-s1.ts's exported equivalent.

## Evidence
tests/tool-arg-parse-checks.test.ts:150-158 (`makeDeps`):
```ts
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/tool-arg-shape-enforcement.test.ts:136-146 (`makeDeps`, same body with
`modelMatcher` split across two lines):
```ts
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/helpers/e2e-s1.ts:38-40 — the exported original, built from the same
module's `inertSystemNote()` and `resolvingMatcher`:
```ts
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

tests/tool-arg-parse-checks.test.ts:165-167 and
tests/tool-arg-shape-enforcement.test.ts:153-155 (`withCode`, byte-identical):
```ts
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}
```

tests/tool-arg-parse-checks.test.ts:185-195 and
tests/tool-arg-shape-enforcement.test.ts:166-176 (`range`, byte-identical):
```ts
function range(
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

## Why this is a problem
Three functions are declared identically in two sibling files in scope, and
one of the three (`makeDeps`) is additionally a re-derivation of an already
exported tests/helpers/e2e-s1.ts function (`parseDeps`) built from the same
module's own `inertSystemNote()`/`resolvingMatcher` primitives. This is the
same class of redundant redeclaration tests/helpers/e2e-s1.ts and the several
other registry/harness helper modules in this tree already exist to prevent.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already exports the `makeDeps` equivalent
(`parseDeps`); `range` and `withCode` have no existing exported home but are
small enough to join it, since both sibling files already import other types
from `../src/parser/theta-document` and `../src/diagnostics/diagnostic`
alongside their local copies.

## False-positive check
Gate-pin carve-out: neither filename matches `*gate*.test.ts` or the named
gate kin — does not apply. Recording-double carve-out: none of the three
functions are recording doubles or MUST-NOT witnesses — does not apply.
docs/bugs/ search: grepped docs/bugs/ for both file names and "makeDeps" — no
hits tying either file's local copy to a documented correct-reason red.
coverage-matrix/bug-doc citation search: grepped
docs/reference/coverage-matrix.md and docs/bugs/*.md for both file names — no
citation pins either copy against consolidation. No coverage claim is made.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts match verbatim at the cited lines (makeDeps 150-158/136-146, withCode 165-167/153-155, range 185-195/166-176, identical modulo the modelMatcher line-wrap), and e2e-s1.ts:38-40 parseDeps() builds the same { systemNote, modelMatcher } from inertSystemNote()'s three no-ops and the same "resolved" matcher (199 tests/ files already import from ./helpers/e2e-s1); tests/helpers exports only zero-arg fixed R()/span() ranges, so the 4-arg range/withCode pair indeed has no exported home; both files are under tests/, neither is a gate test, no recording double, bug docs 0003/0072 cite the files only as witnesses (no test is merged/deleted), and no open/resolved PTQ names either file (PTQ-0214/0314/0386/0405 are the same class against other files) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
