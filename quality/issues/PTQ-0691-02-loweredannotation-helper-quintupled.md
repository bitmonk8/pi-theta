---
id: PTQ-0691
title: A `loweredAnnotation` helper ("the lowered response schema for an annotation, or a loud failure") is independently redeclared in five test files, including the in-scope schema-slug-canonical-form-mints.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-slug-canonical-form-mints.test.ts:220-243
  - tests/annotation-root-brace-union-lowering.test.ts:445-461
  - tests/inline-object-nested-lowering.test.ts:524-537
  - tests/params-brace-union-rhs-lowering.test.ts:447-460
  - tests/generic-argument-literal-lowering.test.ts:1390-1404
sites: 5
fix_scope: cross-module
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# A `loweredAnnotation` helper ("the lowered response schema for an annotation, or a loud failure") is independently redeclared in five test files, including the in-scope schema-slug-canonical-form-mints.test.ts

## Observation
Five test files each declare a local function named `loweredAnnotation` whose
job is identical: take a label/cell and an `@<...>` annotation string, run it
through `lowerQueryResponseSchema`, and throw a loud, cell-named error if the
result is `undefined` rather than silently returning it. Three of the five
(`annotation-root-brace-union-lowering.test.ts`,
`inline-object-nested-lowering.test.ts`, `params-brace-union-rhs-lowering.test.ts`)
share a near-byte-identical doc comment and body against a pre-built
`TRIAGE_DECLS` constant; the other two (the in-scope
`schema-slug-canonical-form-mints.test.ts` and
`generic-argument-literal-lowering.test.ts`) share a second near-identical
variant that parses a fresh document with `parseDoc`, asserts its diagnostics,
then lowers the annotation against the parsed schemas/enums. No
`tests/helpers/` module exports either variant.

## Evidence

tests/schema-slug-canonical-form-mints.test.ts:220-243 (in scope; re-read
immediately before filing):
```ts
/**
 * Load `@<annotation>` through the SHIPPED path: `parseThetaDocument` for the
 * declarations and the diagnostics, then `lowerQueryResponseSchema` for the
 * annotation itself (the same pair the typed-query mechanism drives).
 */
function loweredAnnotation(cell: string, annotation: string, expectedCodes: readonly string[]): LoweredSchema {
  const doc = parseDoc(
    `---\nmode: prompt\n---\nlet r = @<${annotation}>\`hi\`\nr\n`,
    "bug0099.theta",
  );
  expect(
    doc.diagnostics.map((d) => d.code),
    `${cell}: the fixture's disposition is a precondition of the slug claim — a differently ` +
      `refused annotation lowers a different fragment; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([...expectedCodes]);
  const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
  const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `${cell}: \`@<${annotation}>\` lowered to NOTHING, so there is no fragment for ` +
        `schema-subset.md:98 to hash and no respond tool to name`,
    );
  }
  return lowered;
}
```

tests/generic-argument-literal-lowering.test.ts:1390-1404 — the same
parse-then-lower-with-diagnostics shape, same throw structure, same purpose:
```ts
  function loweredAnnotation(cell: string, annotation: string): LoweredSchema {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0164.theta");
    expect(
      diagLines(doc),
      `${cell}: the declaration fixture must load clean or nothing resolves; observed ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
    if (lowered === undefined) {
      throw new Error(
        `${cell}: \`@<${annotation}>\` produced no lowered document, so there is no fragment to ` +
          `register a respond tool over and nothing for the model to be constrained by`,
      );
    }
    return lowered;
  }
```

tests/annotation-root-brace-union-lowering.test.ts:445-461 — the other
variant, byte-near-identical doc comment ("The lowered response schema for an
annotation, or a loud failure. `undefined` is reserved for the EMPTY
annotation alone..."):
```ts
/**
 * The lowered response schema for an annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
function loweredAnnotation(
  label: string,
  annotation: string,
  decls: readonly SchemaDecl[] = TRIAGE_DECLS,
): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, decls);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so QRY-22 would bind an UNVALIDATED response; only the empty annotation may lower to undefined`,
    );
  }
```

tests/inline-object-nested-lowering.test.ts:524-537 — the same doc comment
verbatim, same throw message verbatim:
```ts
/**
 * The lowered response schema for an inline annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
function loweredAnnotation(label: string, annotation: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, TRIAGE_DECLS);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so QRY-22 would bind an UNVALIDATED response; only the empty annotation may lower to undefined`,
    );
  }
  return lowered;
}
```

tests/params-brace-union-rhs-lowering.test.ts:447-460 — same doc comment, same
body shape, only the throw message's tail differs:
```ts
/**
 * The lowered response schema for an annotation, or a loud failure.
 * `undefined` is reserved for the EMPTY annotation alone, so it is a harness
 * error here rather than a fixture outcome.
 */
function loweredAnnotation(label: string, annotation: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, TRIAGE_DECLS);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so there is no reference document to compare the \`params:\` position against`,
    );
  }
  return lowered;
}
```

Search performed: `grep -rn "function loweredAnnotation" tests/*.ts` → exactly
these five hits, one per file, no `tests/helpers/` occurrence.

## Why this is a problem
The same named helper, with the same purpose stated the same way ("the
lowered response schema for an annotation, or a loud failure … `undefined` is
reserved for the EMPTY annotation alone"), is hand-typed five times across
five files rather than declared once. Three copies are near-byte-identical
(same doc comment, same throw-message wording, differing only in a default
`decls` parameter); the other two share a second near-identical
parse-then-lower body. `tests/helpers/` (37 files per `ls tests/helpers/`) has
no module exporting either shape, so all five declarations are independent
hand-copies.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the two `loweredAnnotation` shapes (the
pre-built-decls form and the parse-then-lower form) is the natural home five
independent copies already point toward; which shape becomes canonical is a
decision for the fix stage.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the named
  gate kin; the cited lines are a helper-function declaration, not a pinned
  count or inventory.
- Recording-double check: `loweredAnnotation` is a loud-failure loader, not a
  recording double backing a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -rln "loweredAnnotation" docs/bugs/*.md`
  → 0 hits; none of the five files is cited by a documented correct-reason red
  for this helper's shape.
- coverage-matrix/bug-doc citation search: `grep -n "schema-slug-canonical-form-mints\|annotation-root-brace-union-lowering\|inline-object-nested-lowering\|params-brace-union-rhs-lowering\|generic-argument-literal-lowering" docs/reference/coverage-matrix.md`
  → 0 hits; this finding proposes no merge, rename, or deletion of any of the
  five files or their `it()`/`describe()` blocks.
- Overlap check: `grep -rli "loweredAnnotation" quality/intake/*.md
  quality/resolved/*.md` (excluding this file) → 0 hits; no prior finding names
  this duplication.
- Coverage-drift check: this claim is about a helper declaration repeated
  across files that already exist and already pass; it makes no claim that any
  behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `grep "function loweredAnnotation" tests/` → exactly the five cited declarations (lines 450/529/452/225/1391, within the cited ranges), 0 hits in tests/helpers/, src/, extensions/, tools/ and no `lowerQueryResponseSchema` wrapper anywhere under tests/helpers/; mechanical diff shows the three TRIAGE_DECLS copies differ only by one doc-comment word ("inline"), the throw-message tail, and one optional `decls = TRIAGE_DECLS` default param, while the two parse-then-lower copies share a byte-identical filter-schemas/filter-enums/lower/throw-on-undefined/return tail and diverge only in fixture composition (annotation embedded + `expectedCodes` vs `DECLS` fixture + `[]`) and message wording — same-shape boilerplate the fixer must parameterise, not a clean clone; all five copies live (18/16/5/4/4 call sites); all locations under tests/, none gate-named, coverage-matrix 0 hits, docs/bugs 0 hits for the helper, no merge/rename/delete proposed; not a duplicate — PTQ-0410 is the canonical-slug oracle quadruplet in the same files and same-wave sibling d7-02 is the adjacent `schemaDeclsOf` harness whose triage note defers this helper to this filing; stray `d4_class` field on a D7 filing is extraneous but non-blocking (triage: claude-fable-5-1)
