---
id: pending
title: Callee params-field projection duplicated across arity, return-type and type-layer consumers
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:2556-2583
  - src/extension/production-composition.ts:2598-2614
  - src/parser/theta-document.ts:478-486
sites: 3
fix_scope: cross-module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Callee params-field projection duplicated across arity, return-type and type-layer consumers

## Observation
Three production call sites each build a `ParamsFieldSource[]` (or equivalent name/type-source projection) by mapping over `frontmatter.params.fields` and extracting `field.wireName` as `name` and `field.type` as `typeSource`. Two of the sites live in `src/extension/production-composition.ts` (`resolveCalleeArity` and `resolveCalleeReturnType`); the third lives in `src/parser/theta-document.ts` where `checkTypeLayer` is called. The second function's own doc-comment describes it as "parallel to `resolveCalleeArity`" and says it uses the "same `wireName`/`type` projection `checkTypeLayer`'s own caller (theta-document.ts) uses to build `ParamsFieldSource[]` from frontmatter." No shared helper produces this projection; each consumer inlines the same `(f) => ({ name: f.wireName, typeSource: f.type })` shape.

## Evidence

`src/extension/production-composition.ts:2556-2583` (`resolveCalleeArity`):
```typescript
async function resolveCalleeArity(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<CalleeArity | undefined> {
  const document = await readCalleeDocument(fs, absolutePath, deps);
  if (document === undefined) {
    return undefined;
  }
  const fields = document.frontmatter.params?.fields ?? [];
  const requiredCount = fields.filter(
    (field) => !field.hasDefault && field.optional !== true,
  ).length;
  return {
    requiredCount,
    totalCount: fields.length,
    // Bug 0072 / bug 0137: both per-argument type-mismatch checks
    // (`theta/parse/tool-arg-type-mismatch`, `theta/parse/invoke-arg-type-mismatch`;
    // tool-calls.md §"Argument shape", invocation.md §"Argument binding") need
    // each `params:` field's verbatim declared type AND name, positionally —
    // `field.type` / `field.wireName` ARE that verbatim source
    // (frontmatter.ts's `splitParamValue` sets `type` unchanged; `wireName` is
    // the `params:` YAML key exactly as written, `BypassParamsField`).
    fields: fields.map((field) => ({ typeSource: field.type, name: field.wireName })),
    // RFC 0009 (invocation.md INV-8): the call-site `with` clause's static mode
    // gate reads the callee's declared mode off the SAME pass-cached parse the
    // arity counts come from — no second callee read.
    mode: document.frontmatter.mode,
  };
}
```

`src/extension/production-composition.ts:2598-2614` (`resolveCalleeReturnType`):
```typescript
async function resolveCalleeReturnType(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<CompatType | undefined> {
  const document = await readCalleeDocument(fs, absolutePath, deps);
  if (document === undefined) {
    return undefined;
  }
  // Same `wireName`/`type` projection `checkTypeLayer`'s own caller
  // (theta-document.ts) uses to build `ParamsFieldSource[]` from frontmatter.
  const paramsFields = (document.frontmatter.params?.fields ?? []).map((field) => ({
    name: field.wireName,
    typeSource: field.type,
  }));
  return inferCalleeReturnPayload(document.body, absolutePath, paramsFields);
}
```

`src/parser/theta-document.ts:478-486` (`checkTypeLayer` caller):
```typescript
  const runtimeToolSuccessTypes = buildRuntimeToolSuccessTypes(
    frontmatter?.tools,
  );
  const typeLayerDiags = checkTypeLayer(
    { statements, tail: resolvedTail },
    file,
    (frontmatter?.params?.fields ?? []).map((f) => ({ name: f.wireName, typeSource: f.type })),
    runtimeToolSuccessTypes,
  );
```

Diff verdict: identical projection logic, renamed locals (`field` vs `f`, `paramsFields` vs inline argument). All three map `BypassParamsField.wireName` to `name` and `BypassParamsField.type` to `typeSource`. No clone-map group id (the scanner reported no clone groups for this shard).

## Why this is a problem
The `ParamsFieldSource` interface (defined in `src/parser/type-layer-checks.ts:274-279`) exists as the canonical type-layer binding shape, yet every consumer rebuilds it from `BypassParamsField` inline. The three cited sites are load-bearing parallel truths: `resolveCalleeArity` seeds INV-3 arity and per-slot type checks in `invoke-static-checks.ts`; `resolveCalleeReturnType` seeds cross-file `invoke<Schema>` return-type inference; `theta-document.ts` seeds the in-file type-layer walk. If one site changes the projection — for example by reading a different source field, swapping `wireName` for `name`, or renaming `typeSource` to `typeAnnotation` — the other two will silently disagree with it about which identifier carries which declared type. The `BypassParamsField` type already defines the source shape; a single projection helper would make the mapping one fact instead of three.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/type-layer-checks.ts` alongside the `ParamsFieldSource` interface and `paramsFieldBindings`, or `src/parser/frontmatter.ts` if the helper should live near the source type. A helper such as `paramsFieldsFromFrontmatter(frontmatter?.params?.fields)` returning `readonly ParamsFieldSource[]` would collapse the three inline projections to one definition; every cited caller already imports from or lives near one of those modules.

## False-positive check
- Re-verified all three spans at the cited lines; all are live production code.
- Confirmed the clone-scan map for this shard reports no clone groups, so the similarity is below the token-window floor but still conceptually the same projection.
- The second function's doc-comment explicitly calls the projection parallel to the first and to `theta-document.ts`, so the similarity is load-bearing, not incidental.
- Checked already-filed issues for `resolveCalleeArity`, `resolveCalleeReturnType`, `ParamsFieldSource`, and `wireName.*typeSource`: PTQ-1125 filed and fixed the read/parse/guard preamble duplication between the two `production-composition.ts` functions, but its resolution extracted only `readCalleeDocument` and left the params-field projection inline. No other issue tracks the projection duplication itself.
- No spec-normative vector table is involved; this is a code-source-of-truth concern, not a repeated specification vector.
- No test files are cited.

## Triage
verdict: questionable — accounting verified: all three excerpts match verbatim at production-composition.ts:2556-2583/:2598-2614 and theta-document.ts:478-486 on HEAD; grep of `name: \w+.wireName` across src/ yields exactly these three `{name: wireName, typeSource: type}` projections (the fourth hit, production-theta-producer.ts:1349, is a distinct argument-echo shape with value/tookDefault, correctly uncounted); clone-scan map on production-composition.ts lists no group at these ranges (sub-floor, as filed); all three copies are live (arity/return-type composed at :1389-1392 into checkInvokeStaticResolution deps; checkTypeLayer is the in-file parse path); no `paramsFieldsFrom*`/`toParamsFieldSource` helper exists; PTQ-1125's fix extracted only `readCalleeDocument` and its suggested-direction text explicitly left each function to "project their own specific fields", so this is not a duplicate; no exemptions.json row for either host; additionally the target shapes are two structurally identical but separately declared interfaces (`ParamsFieldSource` type-layer-checks.ts:274-279 vs `CalleeArityField` invoke-callee-arity.ts:48-59), so the shared source of truth (one helper feeding both types, or unifying the types, and its home) is a design decision for a human ruling per the D4 parallel rule (triage: claude-fable-5-1)
