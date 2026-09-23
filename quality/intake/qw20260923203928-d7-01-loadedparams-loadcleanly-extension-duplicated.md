---
id: pending
title: Both in-scope files re-derive an identical LoadedParams/loadCleanly extension over the shared e2e-s1 loadCleanly
lens: D7
status: intake
verdict: pending
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:292-322
  - tests/params-brace-union-rhs-lowering.test.ts:417-442
sites: 2
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# Both in-scope files re-derive an identical LoadedParams/loadCleanly extension over the shared e2e-s1 loadCleanly

## Observation
Both files import the canonical `loadCleanly` (aliased `loadCleanlyShared`) and
`LoadedParams` (aliased `SharedLoadedParams`) from `tests/helpers/e2e-s1.ts`,
which already asserts a clean diagnostic list and throws, naming the absent
intermediate, when `frontmatter`, `params`, or `loweredSchema` is missing.
Each file then declares its own local `interface LoadedParams extends
SharedLoadedParams` adding the same three fields (`properties`, `required`,
`fields`), and its own local `function loadCleanly` that calls
`loadCleanlyShared`, extracts `properties` off the returned `loweredSchema`
with the identical presence guard and identical throw message, and returns the
identical five-key object shape. The two function bodies are byte-identical
apart from the literal fixture filename passed to `parseDoc` (`"bug0041.theta"`
vs `"bug0097.theta"`) and the wording of the preceding doc comment.

## Evidence

tests/params-block-mapping-rhs-refusal.test.ts:292-322
```ts
interface LoadedParams extends SharedLoadedParams {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly fields: readonly BypassParamsField[];
}
...
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

tests/params-brace-union-rhs-lowering.test.ts:417-442
```ts
interface LoadedParams extends SharedLoadedParams {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly fields: readonly BypassParamsField[];
}
...
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0097.theta");
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

Pattern search: `grep -n "interface LoadedParams extends SharedLoadedParams" tests/*.test.ts` finds exactly three hits repository-wide —
`params-block-mapping-rhs-refusal.test.ts:292`, `params-brace-union-rhs-lowering.test.ts:417`, and one outside this review's
scope, `params-inline-object-lowering.test.ts:297` (a near-identical fourth field, `doc`, added and a slightly reordered guard).
The two in-scope sites are the ones cited above and are byte-identical in the `interface` block and in the `function` body except
for the fixture-name string literal.

## Why this is a problem
The `properties`-extraction throw guard, its message text, and the five-key
return shape are maintained twice in this review's scope, with no shared
origin beyond the base `loadCleanly`/`LoadedParams` that `tests/helpers/e2e-s1.ts`
already exports. A change to how `properties` is read off a lowered schema, to
the guard's error message, or to the returned field set would need to be made
in each file's private copy for the two files in scope (and in a third,
`params-inline-object-lowering.test.ts`, outside this review's scope) to stay
consistent; nothing enforces that they do.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already owns the base `loadCleanly`/`LoadedParams`
pair that both files compose over; the `properties`/`required`/`fields`
extension the two in-scope files add is identical enough that a shared
extension living beside the base pair is where a reader would look for it.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns; not a census/pin gate.
- Recording-double check: `loadCleanly` reads a parsed document and throws; it
  is not a recording double and asserts no MUST-NOT-called witness.
- docs/bugs/ signature search: `grep -rn "params-block-mapping-rhs-refusal\|params-brace-union-rhs-lowering" docs/bugs/` returns citations to specific
  test groups/line ranges (e.g. bug 0059's group (c1) residual, bug 0097's own
  witness command) but none cites the `loadCleanly`/`LoadedParams` declaration
  lines (292-322 / 417-442) as a pinned witness — the cited line ranges sit
  elsewhere in each file (e.g. bug 0060 cites `:634-712`, bug 0097 cites the
  whole file by name for its cell count). Moving the shared extension would not
  contradict any of these citations.
- coverage-matrix.md / bug-doc witness-list citation search: `grep -rn
  "params-block-mapping-rhs-refusal\|params-brace-union-rhs-lowering"
  docs/reference/coverage-matrix.md` returns no hits.
- Coverage drift: this finding does not propose that a test should exist or
  that a path is untested; it is limited to code that exists in both files
  today.

## Triage
verdict: questionable — observation reproduces (interface blocks at block-mapping :292-296 / brace-union :417-421 byte-identical; a mktemp diff of the `loadCleanly` bodies differs only in the `bug0041`/`bug0097` literal; both are live, with 10 and 31 `loadCleanly(` hits; not a gate file and no carve-out applies), but these two wrappers are exactly the thin per-file wrapper shape that the confirmed fixes PTQ-1082 and PTQ-1403 prescribed (PTQ-1403's direction was literally "the same composition pattern its sibling already uses"), and the filing undercounts it: the identical `properties`-guard throw message recurs in 10 test files (for example inline-object-nested-lowering:519-532, params-inline-object-lowering:313-331, reserved-keyword-type-position:343, params-default-string-literal-raw-newline:352, and others), not 2-3. So whether to lift a shared properties/required/fields extension into e2e-s1 across all those variants, against the per-file-wrapper convention triage has endorsed so far, is a cross-file design call for a human, not a localized two-site dedupe (triage: claude-opus-5-5)
