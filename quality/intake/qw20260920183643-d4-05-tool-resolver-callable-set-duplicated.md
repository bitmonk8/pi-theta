---
id: pending
title: Tool resolver duplicated in main and stub callable-set dependencies
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:2848-2872
  - src/extension/production-composition.ts:3675-3700
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Tool resolver duplicated in main and stub callable-set dependencies

## Observation
`src/extension/production-composition.ts` constructs two `CallableSetDeps` objects during tools-allowlist resolution: `deps` for the primary pass and `stubDeps` for recursive grandchild structural checks. Both objects contain the same `resolvePiTool` arrow function: look up the name as a built-in Pi tool, then as an extension tool from the registry snapshot, and return either `{ kind: "pi-tool", toolDefinition: ... }` or `undefined`. The executable code is byte-identical; the first copy carries an explanatory comment that the second omits.

## Evidence

`src/extension/production-composition.ts:2848-2872` (`deps`):
```typescript
  const deps: CallableSetDeps = {
    resolvePiTool: (name) => {
      const builtin = resolvePiTool(name, ctx);
      if (builtin !== undefined) {
        // Built-in Pi tools resolve in both modes (unchanged in prompt mode).
        return { kind: "pi-tool", toolDefinition: builtin };
      }
      // frontmatter-fields-a.md §`tools` (bug 0001): registry-snapshot
      // admission is MODE-INDEPENDENT — an extension-supplied tool present in
      // `pi.getAllTools()` is admitted to the allowlist in prompt and subagent
      // mode alike (schema carried for the RFC-0002 disjointness check; the
      // launch-path trust inference reads its own fresh `pi.getAllTools()`
      // snapshot at spawn, never this entry). A name that is neither a
      // built-in, a `getAllTools()` name, nor a discovered `.theta` callable
      // still fails load with `theta/load/unknown-tool`.
      const extension = resolveRegistryExtensionTool(name, getAllTools);
      if (extension !== undefined) {
        return { kind: "pi-tool", toolDefinition: extension };
      }
      return undefined;
    },
    ...(inProcessToolNames !== undefined ? { inProcessToolNames } : {}),
    resolveThetaCallee: (thetaPath) => {
```

`src/extension/production-composition.ts:3675-3700` (`stubDeps`):
```typescript
  const stubDeps: CallableSetDeps = {
    resolvePiTool: (name) => {
      const builtin = resolvePiTool(name, ctx);
      if (builtin !== undefined) {
        return { kind: "pi-tool", toolDefinition: builtin };
      }
      const extension = resolveRegistryExtensionTool(name, getAllTools);
      if (extension !== undefined) {
        return { kind: "pi-tool", toolDefinition: extension };
      }
      return undefined;
    },
    ...(inProcessToolNames !== undefined ? { inProcessToolNames } : {}),
    // `undefined` ONLY for a spec the pre-resolution probe above recorded
    // unreadable — the one condition `resolveEntry`'s `resolved === undefined`
    // arm needs to raise `theta/load/unresolvable-theta-path` against the
    // callee. Every other spec's `mode` comes from `declaredMode` when the
    // probe above parsed the spec's frontmatter (bug 0280 §Fix route (a));
    // `"subagent"` remains the default for a spec `declaredMode` never
    // entered — an escaping spec (withhold (a)) or one whose grandchild
    // verdict is otherwise carried through `grandchildFails` instead of the
    // stub's shape (`tests/nested-tools-entry-containment.test.ts:729–743`
    // needs that default to stay neutral for the escape arm).
    resolveThetaCallee: (thetaPath) => {
```

Diff verdict: renamed-only (comments only; executable code identical). Clone-map group id: G016, 98 tokens.

## Why this is a problem
`resolvePiTool` encodes the load-time admission rule for built-in Pi tools and extension-supplied tools. This rule must be identical for the primary composition pass and the recursive grandchild structural-check pass; if one copy changes — for example, by adding a new admission gate or changing the fallback behavior — a tool name could be admitted in one frame and rejected in another, producing inconsistent `tools:` allowlist verdicts. The two objects are not independently varying by design; `stubDeps` differs from `deps` only in its `resolveThetaCallee` implementation.

## Suggested direction (non-binding, optional)
The natural shared home is a single `resolvePiTool` helper inside `src/extension/production-composition.ts` that both `CallableSetDeps` objects reference, leaving only the theta-callee resolution logic distinct between `deps` and `stubDeps`.

## False-positive check
- Re-verified both spans at the cited line numbers; both `deps` and `stubDeps` are live and used during tools resolution.
- Confirmed clone-map group G016 matches these exact line ranges.
- Searched `src/extension/production-composition.ts` for `resolvePiTool: (name) =>`: exactly these two occurrences.
- Not a spec-normative vector table; this is tool-admission logic repeated in two dependency objects.
- No test files are involved; both copies are production sources under `src/`.

## Triage
