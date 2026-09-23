---
id: PTQ-1472
title: schemaDecl and armsOf declaration-lookup helpers are near-verbatim duplicated across two test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:498-515
  - tests/schema-alias-union-decl.test.ts:538-547
  - tests/schema-alias-rhs-malformed.test.ts:370-383
  - tests/schema-alias-rhs-malformed.test.ts:384-397
sites: 2
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# schemaDecl and armsOf declaration-lookup helpers are near-verbatim duplicated across two test files

## Observation
Both `tests/schema-alias-union-decl.test.ts` and `tests/schema-alias-rhs-malformed.test.ts` declare a local `schemaDecl(doc, name, label)` function that finds a `schema` statement by name and throws a loud error naming the missing declaration and the current statement/diagnostic state if it is absent, and both declare a local `armsOf(doc, name, label)` function that reads the `arms` array off that declaration and throws a loud error if it is not an array. The two implementations differ only in which local rendering helper (`stmtSig`/`diagLines` vs `stmtSpans`/`renderDiags`) they interpolate into the error messages; the control flow, the `Record<string, unknown>` casts, and the throw conditions are identical.

## Evidence
tests/schema-alias-union-decl.test.ts:498-515
```ts
function schemaDecl(
  doc: ThetaDocument,
  name: string,
  label: string,
): Record<string, unknown> {
  const decl = doc.body.statements.find((stmt) => {
    const record = stmt as unknown as Record<string, unknown>;
    return record["kind"] === "schema" && record["name"] === name;
  });
  if (decl === undefined) {
    throw new Error(
      `${label}: no \`schema ${name}\` declaration in the statement list ` +
        `${JSON.stringify(stmtSig(doc))}; diagnostics=${JSON.stringify(diagLines(doc))}`,
    );
  }
  return decl as unknown as Record<string, unknown>;
}
```

tests/schema-alias-union-decl.test.ts:538-547
```ts
function armsOf(doc: ThetaDocument, name: string, label: string): readonly string[] {
  const arms = schemaDecl(doc, name, label)["arms"];
  if (!Array.isArray(arms)) {
    throw new Error(
      `${label}: \`schema ${name}\` carries no alias/union arm list, so the right-hand side ` +
        `was not captured as a declaration at all; diagnostics=${JSON.stringify(diagLines(doc))}`,
    );
  }
  return arms as readonly string[];
}
```

tests/schema-alias-rhs-malformed.test.ts:370-383
```ts
/** The named `schema` declaration node, or a loud failure naming the parse. */
function schemaDecl(doc: ThetaDocument, name: string, label: string): Record<string, unknown> {
  const decl = doc.body.statements.find((stmt) => {
    const record = stmt as unknown as Record<string, unknown>;
    return record["kind"] === "schema" && record["name"] === name;
  });
  if (decl === undefined) {
    throw new Error(
      `${label}: no \`schema ${name}\` declaration in the statement list ` +
        `${JSON.stringify(stmtSpans(doc, 0))}; diagnostics=${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  return decl as unknown as Record<string, unknown>;
}
```

tests/schema-alias-rhs-malformed.test.ts:384-397
```ts
/**
 * The alias/union arm sources the named declaration captured, or a loud failure.
 * A capture that ran past the declaration shows up here as a joined arm; one
 * that ran short shows up as a missing arm.
 */
function armsOf(doc: ThetaDocument, name: string, label: string): readonly string[] {
  const arms = schemaDecl(doc, name, label)["arms"];
  if (!Array.isArray(arms)) {
    throw new Error(
      `${label}: \`schema ${name}\` carries no alias/union arm list, so the right-hand side was ` +
        `not captured as a declaration at all; diagnostics=${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  return arms as readonly string[];
}
```

## Why this is a problem
The two `schemaDecl` bodies and the two `armsOf` bodies are structurally identical (same `find` predicate, same cast pattern, same undefined/non-array guard, same throw shape) with only the interpolated rendering-helper names differing. Neither file imports the other's copy, and no helper under `tests/helpers/` exports either function — `grep` of `tests/helpers/*.ts` for `schemaDecl` or `armsOf` returns no hits. This is the same declaration-lookup fixture reimplemented in two sibling bug-fixture files rather than shared.

## Suggested direction (non-binding, optional)
A shared home for a declaration-by-name lookup and its arm-list accessor under `tests/helpers/` is the natural landing observed here, parameterized over the caller's own diagnostic-rendering helper.

## False-positive check
Searched `quality/issues/*.md` and `quality/intake/*.md` for `schema-alias-rhs-malformed` (no hits) and for prior filings on `tests/schema-alias-union-decl.test.ts` covering `schemaDecl`/`armsOf` specifically — the already-filed PTQ-0506, PTQ-0834, PTQ-0869, PTQ-1346 on this file cover the registry-oracle, `registryMessageOf`, `diagLines`, and `capturingAjv` reimplementations respectively, none of which name `schemaDecl`/`armsOf`. Both cited files are ordinary unit/offline fixture files (not gate/census tests, not `tests/live/**`), so the pinned-count and live-suite carve-outs do not apply. No recording-double is involved (these are plain lookup accessors, not negative witnesses). Neither test name appears in `docs/reference/coverage-matrix.md` or in any `docs/bugs/*.md` witness list (grep, no hits), so no citation constraint applies to a consolidation direction.

## Triage
verdict: confirmed — all four excerpts reproduce byte-for-byte at the cited lines (union-decl :499-515/:538-547, rhs-malformed :371-383/:390-397); the two schemaDecl and two armsOf bodies are identical apart from the interpolated renderer (stmtSig/diagLines vs stmtSpans/renderDiags); re-run grep confirms no tests/helpers/*.ts exports either (the only by-name schema find in helpers is an inline block inside load-row-harness.ts:582-584, not an export), the same-signature copies exist only in these two files (lexical-environment/binder-bypass/match-pattern/union-arm-literal `schemaDecl`/`armsOf` are different-signature homonyms), and both copies are live (armsOf: 26 call sites in rhs-malformed, 22 in union-decl); D7 copy-paste-fixture class in tests/ only, neither file is a gate or tests/live/** test; no existing filing covers schemaDecl/armsOf (PTQ-0506/0834/0869/1346 name other helpers in this file; PTQ-1394/0920/0604/0870/0574 are different lookup helpers in different files); one correction on record: docs/bugs/0033, 0039 and 0042 DO cite tests/schema-alias-union-decl.test.ts as a witness (the filing's "no hits" claim is wrong), but that carve-out guards merge/rename/delete of a test, not hoisting two local helpers, so it does not apply (triage: claude-fable-5-1)
