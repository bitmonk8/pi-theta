---
id: PTQ-1486
title: load-row-harness.ts's render() re-derives the range string inline instead of calling its own imported at()
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/load-row-harness.ts:731-743
  - tests/helpers/load-row-harness.ts:199-208
  - tests/helpers/load-row-harness.ts:28
  - tests/helpers/e2e-s1.ts:241-246
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# load-row-harness.ts's render() re-derives the range string inline instead of calling its own imported at()

## Observation
`tests/helpers/load-row-harness.ts` imports `at` from `./e2e-s1` on line 28 and
uses it correctly, by that name, inside `diagnosticHarness`'s `triples`/`quads`
closures (lines 207 and 221: `at: at(d.range)`). Its own `render` function
(lines 731-743), a few dozen lines later in the same file, declares a local
`const at = r === undefined ? "-" : ...` that hand-rebuilds the identical
`start.line:start.column-end.line:end.column` string the imported `at()`
already produces, shadowing the import inside that function's scope instead
of calling it.

## Evidence
tests/helpers/load-row-harness.ts:28
```ts
import { at, topKinds, parseDoc, diagLines, isLoadParseError } from "./e2e-s1";
```

tests/helpers/load-row-harness.ts:199-208 (the imported `at` used correctly, by name):
```ts
export function diagnosticHarness(
  msg: (code: string, fills: ReadonlyArray<readonly [string, string]>) => string,
) {
  /** The structural triples of every diagnostic, in report order. */
  function triples(doc: ThetaDocument): Triple[] {
    return doc.diagnostics.map((d: Diagnostic) => ({
      severity: d.severity,
      code: d.code,
      at: at(d.range),
    }));
  }
```

tests/helpers/load-row-harness.ts:731-743 (the same file's `render`, shadowing that import with a local re-derivation):
```ts
export function render(doc: ThetaDocument, includeHint = false): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const at =
        r === undefined
          ? "-"
          : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      const hint = includeHint ? ` [hint=${d.hint ?? "-"}]` : "";
      return `${d.severity} ${d.code} @${at}: ${d.message}${hint}`;
    }),
  );
}
```

e2e-s1.ts's `at`, the function being shadowed instead of called (tests/helpers/e2e-s1.ts:241-246):
```ts
/** `l:c-l:c`, 1-indexed, end-column exclusive; `-` for an unlocated diagnostic. */
export function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}
```

## Why this is a problem
The three fragments read byte-for-byte the same range-rendering logic
(`start.line:start.column-end.line:end.column`, `"-"` for `undefined`): one is
the exported canonical `at()` in `e2e-s1.ts`, one is that same `at` imported
and called correctly at lines 207/221 of this very file, and the third
(`render`, lines 731-743) re-derives it locally under a shadowing name in the
same file that already imports and correctly uses the original. This is not a
cross-file drift risk in the abstract — it is a same-file, same-import-list
inconsistency: one function in `load-row-harness.ts` calls `at(r)` and another
rebuilds `at(r)`'s body by hand three lines later in the file.

## Suggested direction (non-binding, optional)
`render`'s local computation could call the imported `at(r)` directly in place
of its shadowing `const at = ...` — observation, not a design.

## False-positive check
- Gate-pin check: `load-row-harness.ts` is not a `*gate*.test.ts` file; not
  applicable.
- Recording-double check: `render` and `at` are plain string renderers, not
  recording doubles; not applicable.
- docs/bugs/ signature search: `grep -rn "shadow.*\bat\b" docs/bugs/` and a
  manual read of `render`'s surrounding comments found no cited open bug
  documenting this shadowing as a correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "render(" docs/reference/coverage-matrix.md`
  found no citation of this specific `render` helper by name; no citation
  constraint applies.
- Coverage drift check: this finding is about the duplicated logic inside an
  existing helper file, not about any test's assertions, and proposes no
  merge/rename/delete of a cited test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: load-row-harness.ts:28 imports `at` from ./e2e-s1 and calls it by name at :207/:221, while `render` (:731-743) declares a shadowing `const at = r === undefined ? "-" : \`${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}\`` byte-identical to e2e-s1.ts:241-246's exported body and uses it at :740; both copies live (`render` exported, 5 in-file call sites), git shows the inline landed 2026-09-18 (93ed4e00) and the `at` import arrived 2026-09-19 (319f79ec) without migrating it; stated docs/bugs and coverage-matrix greps reproduce (0 relevant hits), all locations under tests/, D7 boilerplate-duplication class (same shadowed-import pattern as PTQ-0663/0674/1071), not a gate file, not a recording double, no merge/rename/delete; not a duplicate — PTQ-0973 is match-arm-scope-inference-pass.test.ts (resolved), same-wave sibling d7-01 tracks `range()` not `at`, PTQ-0858/0882/0934 cite other files (triage: claude-fable-5-1)
