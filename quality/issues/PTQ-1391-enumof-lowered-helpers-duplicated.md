---
id: PTQ-1391
title: enumOf and lowered helper functions byte-identical between enum-body-unclosed-at-eof.test.ts and schema-body-unclosed-at-eof.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/enum-body-unclosed-at-eof.test.ts:253-263
  - tests/enum-body-unclosed-at-eof.test.ts:280-294
  - tests/schema-body-unclosed-at-eof.test.ts:228-238
  - tests/schema-body-unclosed-at-eof.test.ts:258-272
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# enumOf and lowered helper functions byte-identical between enum-body-unclosed-at-eof.test.ts and schema-body-unclosed-at-eof.test.ts

## Observation
`tests/enum-body-unclosed-at-eof.test.ts` and
`tests/schema-body-unclosed-at-eof.test.ts` each declare an `enumOf(doc:
ThetaDocument): EnumDecl` function and a `lowered(doc: ThetaDocument):
Record<string, unknown>` function; both functions are byte-identical between
the two files (the same declaration-count guard message, the same
`buildBodyTypeSchemas` assembly). No canonical helper under `tests/helpers/`
exports either.

## Evidence
tests/enum-body-unclosed-at-eof.test.ts:253-263:
```ts
function enumOf(doc: ThetaDocument): EnumDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "enum") as EnumDecl[];
  expect(
    decls.length,
    `exactly one \`enum\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}, diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`enum\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}
```

tests/schema-body-unclosed-at-eof.test.ts:228-238:
```ts
function enumOf(doc: ThetaDocument): EnumDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "enum") as EnumDecl[];
  expect(
    decls.length,
    `exactly one \`enum\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}, diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`enum\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}
```

tests/enum-body-unclosed-at-eof.test.ts:280-294:
```ts
function lowered(doc: ThetaDocument): Record<string, unknown> {
  const schemas = (doc.body.statements.filter((s) => s.kind === "schema") as SchemaDecl[]).map(
    (s) => ({
      name: s.name,
      ...(s.fields === undefined ? {} : { fields: s.fields }),
      ...(s.arms === undefined ? {} : { arms: s.arms }),
    }),
  );
  const enums = (doc.body.statements.filter((s) => s.kind === "enum") as EnumDecl[]).map((d) => ({
    name: d.name,
    ...(d.variants === undefined ? {} : { variants: d.variants }),
    ...(d.variantValues === undefined ? {} : { variantValues: d.variantValues }),
  }));
  return Object.fromEntries(buildBodyTypeSchemas(schemas, enums).entries());
}
```

tests/schema-body-unclosed-at-eof.test.ts:258-272: identical body to the above
(verified by direct read; both files' `lowered` differ from each other by zero
bytes).

Search: `grep -rn "function lowered(doc: ThetaDocument)\|function enumOf(doc: ThetaDocument)" tests/*.test.ts` — 2 hits per function name, the four sites cited above.

## Why this is a problem
Both files are the two siblings of the same "unclosed body at EOF" bug family
(bug 0259 for `enum`, bug 0245 for `schema`) and each independently retyped
the same two helper functions — including the identical guard message text and
the identical `buildBodyTypeSchemas` assembly logic — rather than sharing one
definition, so a change to how a lowered fragment is assembled from parsed
`schema`/`enum` statements requires editing both files in lockstep with
nothing to force that.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of `lowered` (and `enumOf`, alongside the
existing exported `topKinds`/`diagnosticHarness` helpers both files already
import) is where the two files' identical bodies already point.

## False-positive check
Not a gate/pin file (neither file matches `*gate*.test.ts` or kin — both are
plain bug-fixture parse tests). Not a recording double / MUST-NOT witness.
Searched `quality/issues`, `quality/resolved`, `quality/intake` for
"buildBodyTypeSchemas" — two hits (PTQ-1004, PTQ-1212, both resolved) address
an unrelated cannot-fail assertion and a lexer/parser-affinity question in
different files, not this `enumOf`/`lowered` duplication. Not a coverage
claim: each file's own assertions over its parsed document are unaffected;
only the repeated helper bodies are observed.

## Triage
verdict: confirmed — reproduces: `diff` of enum-body-unclosed-at-eof.test.ts:253-263/280-294 against schema-body-unclosed-at-eof.test.ts:228-238/258-272 is empty for both `enumOf` and `lowered`; the stated grep returns exactly the four cited sites; no tests/helpers/ export assembles `buildBodyTypeSchemas` over parsed statements (e2e-s1's `loweredAnnotation` wraps `lowerQueryResponseSchema`, a different facility, and `schemaDeclsOf`/`enumDeclsOf` are only the filters); neither file is a gate/pin test or cited by docs/reference/coverage-matrix.md; resolved rows touching these files (PTQ-0507/0604/0804/0835/0870/1004) cover registry-oracle, msg(), other files' decl filters and an unrelated cannot-fail, not this pair — D7 boilerplate duplication, mechanical dedupe into tests/helpers/ (triage: claude-fable-5-1)
