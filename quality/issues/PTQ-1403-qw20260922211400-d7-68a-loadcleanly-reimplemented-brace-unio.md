---
id: PTQ-1403
title: params-brace-union-rhs-lowering.test.ts reimplements the exported loadCleanly instead of composing over it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-brace-union-rhs-lowering.test.ts:445-478
  - tests/helpers/e2e-s1.ts:682-704
  - tests/params-block-mapping-rhs-refusal.test.ts:18-19
  - tests/params-block-mapping-rhs-refusal.test.ts:322-338
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# params-brace-union-rhs-lowering.test.ts reimplements the exported loadCleanly instead of composing over it

## Observation
`tests/helpers/e2e-s1.ts` exports a `loadCleanly(label, source, path?)` function
(lines 682-704) that parses a fixture, asserts an empty diagnostic list, and
throws (naming the missing intermediate) if `frontmatter`, `params`, or
`loweredSchema` is absent. `tests/params-block-mapping-rhs-refusal.test.ts`
imports it as `loadCleanlyShared` (line 18) and composes its own wider
`loadCleanly` on top of it (lines 322-338), destructuring `defs` and
`loweredSchema` from the shared call and adding only the `properties` /
`required` / `fields` reads the bug-0041 fixtures need.
`tests/params-brace-union-rhs-lowering.test.ts`, the sibling file in this same
review scope, instead declares its own local `loadCleanly` (lines 445-478) that
re-derives the identical four-throw sequence — empty-diagnostics assertion,
null-frontmatter throw, undefined-params throw, undefined-loweredSchema throw —
byte-for-byte in wording and shape, before adding the same `properties` /
`required` / `fields` extension the other file gets by composition.

## Evidence

tests/helpers/e2e-s1.ts:682-704
```ts
export function loadCleanly(label: string, source: string | ThetaDocument, path = "test.theta"): LoadedParams {
  const doc = typeof source === "string" ? parseDoc(source, path) : source;
  expect(
    diagLines(doc),
    `${label}: this fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return { defs: (lowered["$defs"] ?? {}) as Record<string, unknown>, loweredSchema: lowered };
}
```

tests/params-brace-union-rhs-lowering.test.ts:445-478
```ts
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0097.theta");
  expect(
    diagLines(doc),
    `${label}: this declaration is legal theta (grammar.md:94/:101/:105), so the fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    properties: properties as Record<string, unknown>,
    required: (lowered["required"] ?? []) as readonly string[],
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
    ...
  };
}
```

tests/params-block-mapping-rhs-refusal.test.ts:322-338 (the composing sibling, same scope, for contrast)
```ts
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0041.theta");
  const { defs, loweredSchema: lowered } = loadCleanlyShared(label, doc);
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    properties: properties as Record<string, unknown>,
    required: (lowered["required"] ?? []) as readonly string[],
    defs,
    fields: doc.frontmatter!.params!.fields,
    loweredSchema: lowered,
  };
}
```

## Why this is a problem
The four-throw sequence (empty-diagnostics check, null-frontmatter throw,
undefined-params throw, undefined-loweredSchema throw) in
`params-brace-union-rhs-lowering.test.ts:445-467` is a verbatim restatement of
the exported `loadCleanly` in `tests/helpers/e2e-s1.ts:682-701`, which the
sibling file in the very same review scope already imports and composes over
under the alias `loadCleanlyShared` rather than restating. The canonical
helper accepts a `path` parameter that would let this file pass
`"bug0097.theta"` without change, so nothing about this file's needs required
departing from composition.

## Suggested direction (non-binding, optional)
The natural home for the extra `properties`/`required`/`fields` reads this
file adds is the same composition pattern its sibling already uses over
`loadCleanlyShared`, as observed in `params-block-mapping-rhs-refusal.test.ts`.

## False-positive check
- Recording-double check: not applicable — no double is involved, this is a
  parse-and-read helper.
- Gate-pin check: not applicable — neither file matches `*gate*.test.ts` or
  the named gate kin.
- docs/bugs/ signature search: the file documents bug 0097 throughout; the
  duplication is unrelated to the bug's pinned red/green shape and does not
  touch a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -l
  params-brace-union-rhs-lowering docs/reference/coverage-matrix.md
  docs/bugs/*.md` was not needed for this claim — the finding proposes no
  merge, rename, or deletion of any test, only naming that a canonical helper
  already composed by the sibling file is available.
- Coverage: this finding does not claim any behaviour is untested; both files
  drive the real load path and assert on real diagnostics/schemas throughout.

## Triage
verdict: confirmed — independently re-verified: the private `loadCleanly` reproduces at tests/params-brace-union-rhs-lowering.test.ts:445-478 and the canonical export at tests/helpers/e2e-s1.ts:682-704 (with the `path` parameter the filing names); a mktemp diff of the shared bodies shows all three `throw new Error` clauses byte-identical, the only deltas being the `expect` message wording, the `"bug0097.theta"` path literal, and the extra `properties` guard + `properties`/`required`/`fields` return that the composing sibling at params-block-mapping-rhs-refusal.test.ts:322-338 (import `loadCleanly as loadCleanlyShared` at :18) already derives by composition; the copy is live (31 `loadCleanly` references), the file's e2e-s1 import at :13 names `loweredAnnotation, loadSchemaDecls, parseDoc, fieldOf, diagLines` but not `loadCleanly`; not a gate/kin file, no recording double, no red-test carve-out, and the docs/bugs/0097 + coverage citations of the file are immaterial since no cell is merged/renamed/deleted; not a duplicate — PTQ-0212 (7-site original, fixed by 2594cd44 which migrated only annotation-root-brace-union-lowering), PTQ-0879 (inline-object-nested-lowering), PTQ-0884 (schema-alias-union-decl) and PTQ-1082 (params-block-mapping-rhs-refusal, fixed) are all resolved per-file rows for OTHER files, and no open row in quality/issues names this file or `loadCleanly`; D7 boilerplate duplication, mechanical fix is import + the sibling's thin wrapper (triage: claude-fable-5-1)
