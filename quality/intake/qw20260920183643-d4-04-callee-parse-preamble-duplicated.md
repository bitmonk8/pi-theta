---
id: pending
title: Callee parse preamble duplicated between arity and return-type resolution
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:2444-2473
  - src/extension/production-composition.ts:2492-2524
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Callee parse preamble duplicated between arity and return-type resolution

## Observation
`resolveCalleeArity` and `resolveCalleeReturnType` in `src/extension/production-composition.ts` both read a `.theta` callee file, parse it through the pass-scoped cache, reject unreadable or unparseable results, and then project the `params:` fields. The first three steps are identical in both functions. The second function's own doc-comment describes it as "parallel to `resolveCalleeArity`" and says it parses the callee "via the same pass-scoped cache".

## Evidence

`src/extension/production-composition.ts:2444-2473` (`resolveCalleeArity`):
```typescript
async function resolveCalleeArity(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<CalleeArity | undefined> {
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  // Bug 0264: route through the pass-scoped cache — this callee may already
  // have been parsed this pass (a discovered theta, or another `.theta`-callable
  // arity check reaching the same file).
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  const fields = document.frontmatter.params?.fields ?? [];
```

`src/extension/production-composition.ts:2492-2524` (`resolveCalleeReturnType`):
```typescript
async function resolveCalleeReturnType(
  fs: FileSystem,
  absolutePath: string,
  deps: PassParseDeps,
): Promise<CompatType | undefined> {
  const bytes = await fs.readBytes(absolutePath).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return undefined;
  }
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
    return undefined;
  }
  // Same `wireName`/`type` projection `checkTypeLayer`'s own caller
  // (theta-document.ts) uses to build `ParamsFieldSource[]` from frontmatter.
  const paramsFields = (document.frontmatter.params?.fields ?? []).map((field) => ({
    name: field.wireName,
    typeSource: field.type,
  }));
```

Diff verdict: renamed-only. The executable preamble (`readBytes`, `parseViaPassCache`, load/parse-error guard) is byte-identical; the only differences are the local variable name (`fields` vs `paramsFields`) and the trailing projection. Clone-map group id: G011, 103 tokens.

## Why this is a problem
Both functions implement static resolution of the same callee `.theta` file — one for INV-3 arity counts and one for the cross-file `invoke<Schema>` return-type payload. They share the same precondition contract about which callee files are resolvable at load time. If one copy changes — for example, by adding an additional readability check, switching caches, or altering the rejection shape — the other will silently disagree about which callees are statically resolvable, causing arity and return-type inference to diverge. The doc-comment already calls the second function parallel to the first, so they are intended to stay in step.

## Suggested direction (non-binding, optional)
The natural shared home is a single helper in `src/extension/production-composition.ts` that reads, parses, and validates the callee and returns the parsed document or `undefined`. `resolveCalleeArity` and `resolveCalleeReturnType` would consume that helper and then project their own specific fields.

## False-positive check
- Re-verified both spans at the cited line numbers; both functions are live and called from the composition pass.
- Confirmed clone-map group G011 matches these exact line ranges.
- The second function's doc-comment explicitly references the first as its parallel; the similarity is not a spec-normative vector table.
- No test files are involved; both copies are production sources under `src/`.

## Triage
