---
id: PTQ-0409
title: b0046 test file redeclares LoadRow, registered, expectRows and the registry-message renderer that tests/helpers/load-row-harness.ts already exports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0046-by-clause-undecided-inputs.test.ts:189-196
  - tests/b0046-by-clause-undecided-inputs.test.ts:197-206
  - tests/b0046-by-clause-undecided-inputs.test.ts:149-163
  - tests/b0046-by-clause-undecided-inputs.test.ts:230-232
  - tests/b0046-by-clause-undecided-inputs.test.ts:256-268
  - tests/helpers/load-row-harness.ts:99-106
  - tests/helpers/load-row-harness.ts:111-120
  - tests/helpers/load-row-harness.ts:62-78
  - tests/helpers/load-row-harness.ts:141-143
  - tests/helpers/load-row-harness.ts:179-191
sites: 5
fix_scope: localized
wave: qw20260917121953
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0046 test file redeclares LoadRow, registered, expectRows and the registry-message renderer that tests/helpers/load-row-harness.ts already exports

## Observation
`tests/b0046-by-clause-undecided-inputs.test.ts` declares a local `LoadRow`
interface, a `rowOf` builder, a `registered` predicate, an `expectDeclared`
precondition, and an `expectRows` two-stage assertion. `tests/helpers/load-row-harness.ts`
exports an interface of the same name and shape (`LoadRow`), a `toLoadRow`
builder of the same body, a `registered` predicate, an `expectCaptured`
precondition, and an `expectRows` function. The `registered` and `expectRows`
functions in the two files are byte-for-byte identical in body; the doc
comments above them are near word-for-word identical as well.

## Evidence
tests/b0046-by-clause-undecided-inputs.test.ts:189-196 (local `LoadRow`):
```
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly doc: ThetaDocument;
}
```
tests/helpers/load-row-harness.ts:99-106 (exported `LoadRow`):
```
export interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}
```

tests/b0046-by-clause-undecided-inputs.test.ts:197-206 (`rowOf`):
```
function rowOf(label: string, doc: ThetaDocument): LoadRow {
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    doc,
  };
```
tests/helpers/load-row-harness.ts:111-120 (`toLoadRow`, same field derivations
plus one extra `statements` field):
```
function toLoadRow(label: string, doc: ThetaDocument): LoadRow {
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    statements: doc.body.statements.length,
    doc,
```

tests/b0046-by-clause-undecided-inputs.test.ts:224-232 (`registered`, comment
and body):
```
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. Every fixture's refusal code below is `theta/parse/…`, so the
 * code-prefix half of the real predicate is always satisfied here.
 */
function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}
```
tests/helpers/load-row-harness.ts:135-143 (`registered`, same comment core and
identical body):
```
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered.
 */
export function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}
```

tests/b0046-by-clause-undecided-inputs.test.ts:256-268 (`expectRows`, full
body):
```
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
tests/helpers/load-row-harness.ts:179-191 (`expectRows`, identical body):
```
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

tests/b0046-by-clause-undecided-inputs.test.ts:149-163 (`msg`) mirrors
tests/helpers/load-row-harness.ts:62-78 (`registryMessageOf`) in structure and
in the wording of its doc comment ("Definedness and placeholder presence are
asserted first, so … reds by naming the registry page rather than by a bare
`undefined` comparison downstream"):
```
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
```

## Why this is a problem
`tests/helpers/load-row-harness.ts`'s own header states its reason for
existing: "Several `b02xx` files independently redeclared the same `LoadRow`
shape, the same `parseDoc`-wrapping row builder, the same composition-root
registration mirror, and the same registry-message renderer (PTQ-0206,
PTQ-0207). This module centralises the parts that are byte-for-byte identical
across those files." `tests/b0046-by-clause-undecided-inputs.test.ts` carries
exactly the parts that module names as byte-for-byte identical: the
`LoadRow` shape, the row builder, the registration mirror (`registered`, whose
body and doc-comment core match verbatim), and `expectRows` (whose body
matches verbatim). This is the same class of duplication the helper module
was built to remove, now present as a fifth (unmigrated) instance.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts` is named in this file's own history as the
natural home for this shape (PTQ-0206/PTQ-0207); a later pass could route
`b0046`'s `LoadRow`/`rowOf`/`registered`/`expectRows` through the exported
`loadRow`/`registered`/`expectRows` there, leaving the file's own `msg`/`line`/
`absentLine`/`byOnObjectLine` message builders local, matching the helper
module's own stated intent to keep per-file message rendering local.

## False-positive check
- Gate-pin: the filename does not match `*gate*.test.ts` or any of the named
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this is not a
  census/pin gate file.
- Recording-double: `registered`/`expectRows` are not negative-witness
  recording doubles; they are plain assertion helpers over parsed diagnostics.
- docs/bugs/ signature search: `docs/bugs/0046-by-clause-undecided-inputs-load-silently.md`
  is the report this file is titled for; nothing in it prescribes the file's
  internal helper shape, only its cell inventory and dispositions, so the
  duplication is not a documented correct-reason artefact.
- coverage-matrix/bug-doc citation search: `grep -rn
  "b0046-by-clause-undecided-inputs" docs/reference/coverage-matrix.md
  docs/bugs/*.md` finds the file named in
  `docs/bugs/0046-by-clause-undecided-inputs-load-silently.md` (as its own
  witness) and in `docs/bugs/0262-...md` (cited as a witness for a shared
  `by`-clause boundary). This finding proposes no merge, rename or deletion of
  the test file or its cells — only routing its internal harness functions
  through an existing helper module — so the citation does not block filing.
- Coverage: this finding does not claim any behaviour is untested; it is
  scoped to the test code's own harness-definition duplication.

## Triage
verdict: confirmed — all excerpts reproduce at the cited lines; `registered` (b0046:230-232 vs harness:141-143) and `expectRows` (b0046:256-268 vs harness:179-191) diff byte-identical modulo `export`, `LoadRow`/`rowOf` match the helper's shape minus `statements`, and `msg` is `registryMessageOf` with REGISTRY/REGISTRY_PATH closed over; b0046 was added 2026-08-23 (0544c61a), the helper 2026-09-11 (2594cd44), and b0046 is not among the helper's 5 importers; not a gate file, direction proposes no merge/rename/delete of the bug-doc-cited witness, and no existing PTQ (0206/0207/0219/0228 cover b027x/b0282 only; 0214 cites b0046 for an unrelated parseDeps root cause) tracks this file (triage: claude-fable-5-1)
