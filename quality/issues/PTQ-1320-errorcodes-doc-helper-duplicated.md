---
id: PTQ-1320
title: "b0406 and b0408 each redeclare an identical local `errorCodes(doc)` helper already covered by e2e-s1's exported reader"
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0406-object-typed-params-misclassified-string.test.ts:33-36
  - tests/b0408-scalar-union-params-render-json-row.test.ts:22-25
  - tests/helpers/e2e-s1.ts:414-420
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0406 and b0408 each redeclare an identical local `errorCodes(doc)` helper already covered by e2e-s1's exported reader

## Observation
Both in-scope files declare a private, byte-identical helper with the same
leading doc comment:

```ts
/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return errors(doc.diagnostics).map((d) => d.code);
}
```

Both files already import `errors` from `tests/helpers/e2e-s1.ts` for this
purpose. `tests/helpers/e2e-s1.ts` itself exports two functions that already
cover this exact computation: `errors(diags)` (the filter the local helper
calls) and `errorCodes(thetaText, thetaPath)` (a same-named, same-purpose
reader that parses a source directly rather than accepting a pre-parsed doc).

## Evidence

`tests/b0406-object-typed-params-misclassified-string.test.ts:33-36`:
```ts
/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return errors(doc.diagnostics).map((d) => d.code);
}
```

`tests/b0408-scalar-union-params-render-json-row.test.ts:22-25`:
```ts
/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return errors(doc.diagnostics).map((d) => d.code);
}
```

`tests/helpers/e2e-s1.ts:414-420` (already imported by both files for `errors`):
```ts
/** Error-severity diagnostics only. */
export function errors(diags: readonly Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => d.severity === "error");
}

/** The error-severity load/parse codes `parseDoc` attributes to one source, sorted. */
export function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics).map((d) => d.code).sort();
}
```

Search: `grep -rn "function errorCodes(doc: ReturnType<typeof parseDoc>): string\[\] {" tests/**/*.ts`
finds 6 identical hits, each with the identical leading doc comment: the two
in-scope sites above, plus `tests/b0427-alias-schema-param-permissive-string-terminal.test.ts:41-44`,
`tests/b0441-inline-object-embedded-schema-refs-not-descended.test.ts:26-29`,
`tests/b0442-alias-blind-outbound-sidecar-construction.test.ts:29-32`, and
`tests/b0443-union-alias-spellings-drop-arm-translation.test.ts:28-31` (out of
this wave's scope, cited only to show the pattern is not confined to the two
briefed files).

## Why this is a problem
The two in-scope files copy-paste the same two-line function, under the same
doc comment, rather than reusing (or extending) the reader `e2e-s1.ts` already
exports under the identical name `errorCodes` for the identical purpose (the
existing export differs only in taking `(thetaText, thetaPath)` instead of a
pre-parsed `doc`, and in sorting). Both files already import `errors` from
that module, so the dependency is already present at the call site.

## Suggested direction (non-binding, optional)
Naming the natural home as observation: a doc-accepting overload or a second
named export alongside `e2e-s1.ts`'s existing `errorCodes(thetaText, thetaPath)`
would let both sites (and the four out-of-scope siblings) drop their local
redeclaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a listed gate
  kin; not a census/pin test.
- Recording-double check: `errorCodes` is a plain projection, not a
  negative-witness recording double.
- docs/bugs/ signature search: neither file's `errorCodes` helper is cited by
  any documented correct-reason red; both bug docs (0406, 0408) concern the
  production `toSystemParamType`/render behaviour, not this test helper.
- coverage-matrix/bug-doc citation search: `grep -rn "errorCodes" docs/reference/coverage-matrix.md`
  and `docs/bugs/*.md` returned no citation of this specific test helper by
  name.
- Confirmed this claim is pure duplication, not a coverage gap: the finding is
  about the redundant helper code, not about any missing test.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: excerpts match at b0406:33-36 and b0408:22-25, a mktemp sed-range diff of the two helpers is empty (byte-identical incl. doc comment), the stated grep reproduces exactly 6 hits repo-wide (2 in-scope + b0427/b0441/b0442/b0443), both copies are live (b0406 calls errorCodes(doc) at 9 sites :104-337, b0408 at :143), both files already import `errors` (and `parseDoc`) from ./helpers/e2e-s1 whose `errors` (:414-416) and same-named `errorCodes(thetaText, thetaPath)` (:419-420) already cover the computation, so the fix is a mechanical hoist of a doc-accepting variant + import swap; all 3 locations under tests/, D7 boilerplate-duplication class, neither file is a gate/pin test or recording double, docs/bugs 0406/0408 cite the files' cells but not this helper, coverage-matrix grep → 0; not a duplicate — resolved PTQ-1040 covers the different `errorCodes(thetaText, thetaPath)` copies in tests/live/acceptance/b0406live+b0444live, PTQ-0756/1034/1057 cover other files/names, and the same-wave intake sibling (errorcodes-helper-triplicated-b0441-b0442-b0443) cites disjoint files — the two should be fixed together against one shared export (triage: claude-fable-5-1)
