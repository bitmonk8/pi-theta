---
id: PTQ-1495
title: union-generic-arm-lowering.test.ts's local schemaDeclsOf inlines the filters e2e-s1.ts already exports as schemaDeclsOf/enumDeclsOf
lens: D7
status: open
verdict: confirmed
locations:
  - tests/union-generic-arm-lowering.test.ts:213-221
  - tests/helpers/e2e-s1.ts:719-721
  - tests/helpers/e2e-s1.ts:753-755
sites: 1
fix_scope: localized
d7_class: copy-paste-fixture
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# union-generic-arm-lowering.test.ts's local schemaDeclsOf inlines the filters e2e-s1.ts already exports as schemaDeclsOf/enumDeclsOf

## Observation
`tests/union-generic-arm-lowering.test.ts` declares a module-private
`function schemaDeclsOf(body: string)` that parses a fixture document and
then, inline, filters `doc.body.statements` for `s.kind === "schema"` and
`s.kind === "enum"` to build `{schemas, enums}`. `tests/helpers/e2e-s1.ts` —
already imported by this file for `yamlQuoted`, `parseDoc`, `diagLines` —
exports `schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[]` and
`enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[]`, each doing the exact
same one-line `.filter((s): s is X => s.kind === "...")`. The local function
reimplements both filters inline against a document it parses itself,
instead of calling `parseDoc` (as it already does) and then the two exported
filters.

## Evidence
`tests/union-generic-arm-lowering.test.ts:213-221` (re-read immediately
before filing):
```ts
function schemaDeclsOf(body: string): {
  readonly schemas: readonly SchemaDecl[];
  readonly enums: readonly EnumDecl[];
} {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}let inert = 1\ninert\n`, "bug0043.theta");
  return {
    schemas: doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema"),
    enums: doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum"),
  };
}
```

`tests/helpers/e2e-s1.ts:719-721`:
```ts
/** Top-level declarations of this kind, preserving source order. */
export function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

`tests/helpers/e2e-s1.ts:753-755`:
```ts
export function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}
```

The filter predicate bodies — `s.kind === "schema"` / `s.kind === "enum"`
inside a `.filter((s): s is X => ...)` type-guard — are byte-identical
between the local inline code and the two exported functions; the file
imports `parseDoc` from the same module (`./helpers/e2e-s1`) that exports
both filters, at line 21 of this file.

## Why this is a problem
`schemaDeclsOf`/`enumDeclsOf` over a `ThetaDocument` already have one home
under `tests/helpers/e2e-s1.ts`, which this very file imports from for its
other document-reading primitives. The local function reimplements both
filters' bodies rather than calling `parseDoc(...)` and then the two exports
on the resulting document.

## Suggested direction (non-binding, optional)
Calling `schemaDeclsOf(doc)` and `enumDeclsOf(doc)` from `./helpers/e2e-s1`
after the local `parseDoc` call would give this function the same
`{schemas, enums}` pair without re-declaring either filter; naming the
existing exports is an observation of the home already in place, not a
design.

## False-positive check
- Gate-pin carve-out: `union-generic-arm-lowering.test.ts` does not match
  `*gate*.test.ts` or any named census/pin family; N/A.
- Recording-double carve-out: this is a pure AST filter over parsed
  statements, not a recording double witnessing a MUST-NOT call; N/A.
- docs/bugs/ signature search: `grep -rn "schemaDeclsOf\|enumDeclsOf"
  docs/bugs/` returns no hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "union-generic-arm-lowering" docs/reference/coverage-matrix.md` found no
  hit; no merge/rename/delete of a cited test is proposed.
- Checked prior/resolved filings: `quality/resolved/PTQ-0604-...md` and
  `quality/resolved/PTQ-0870-...md` (status: fixed) confirm
  `schemaDeclsOf`/`enumDeclsOf` were minted as exports on `e2e-s1.ts` and
  that the fix swept only the files those two reports named (neither names
  `tests/union-generic-arm-lowering.test.ts`); PTQ-0870's own triage note
  states "the repo tracks post-fix unmigrated sites as fresh rows" for
  exactly this situation, and this file — which was not among the swept
  set and takes a `(body: string)` signature the export does not offer — is
  such an unmigrated site. `grep -rl "union-generic-arm-lowering"
  quality/intake quality/issues quality/resolved` returns no other filing
  against this file for this function.

## Triage
verdict: confirmed — independently re-verified: the local `schemaDeclsOf(body: string)` reproduces verbatim at tests/union-generic-arm-lowering.test.ts:213-221 and its two inline `.filter((s): s is X => s.kind === "schema"|"enum")` predicates are byte-identical to the exported `schemaDeclsOf`/`enumDeclsOf` at tests/helpers/e2e-s1.ts:719-721 and :753-755, which the file already imports from (line 12: `yamlQuoted, parseDoc, diagLines`); the local copy is live (callers at :285 and :841); stated searches reproduce — docs/bugs hits (0028/0174/0180/0465) all describe the PRODUCTION module-private pair, not this test; coverage-matrix has 0 hits for the file; not a gate or tests/live file, pure AST filter not a recording double, no merge/rename/delete proposed — D7 copy-paste-fixture/boilerplate-duplication class; dedupe holds: PTQ-0574 (fixed) explicitly excluded this file's `{schemas, enums}` variant from its count, PTQ-0604/PTQ-0870 (fixed) named other files only, and same-wave d7-02 (readAt/fragmentOf harness) cites disjoint lines :230-322 — a post-fix unmigrated site tracked as a fresh row per the PTQ-0870 precedent (triage: claude-fable-5-1)
