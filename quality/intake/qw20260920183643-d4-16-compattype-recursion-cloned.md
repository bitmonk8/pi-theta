---
id: pending
title: CompatType recursive traversal cloned for named-type and withheld-binder checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:398-409
  - src/parser/type-layer-checks.ts:611-622
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# CompatType recursive traversal cloned for named-type and withheld-binder checks

## Observation
`src/parser/type-layer-checks.ts` defines two structurally identical recursive walks over `CompatType`: `containsNamedType` returns `true` if any leaf is a `named` node, and `containsWithheldBinderType` returns `true` if any leaf is a `named` node marked `withheld`. Clone-map group G058 flags the overlap.

## Evidence
`src/parser/type-layer-checks.ts:398-409` (clone-map group G058):
```ts
function containsNamedType(type: CompatType): boolean {
  switch (type.kind) {
    case "named":
      return true;
    case "array":
      return containsNamedType(type.element);
    case "union":
      return type.arms.some((arm) => containsNamedType(arm));
    case "object":
      return type.fields.some((field) => containsNamedType(field.type));
    case "prim":
    case "literal":
      return false;
  }
}
```

`src/parser/type-layer-checks.ts:611-622` (clone-map group G058):
```ts
function containsWithheldBinderType(type: CompatType): boolean {
  switch (type.kind) {
    case "named":
      return type.withheld === true;
    case "array":
      return containsWithheldBinderType(type.element);
    case "union":
      return type.arms.some((arm) => containsWithheldBinderType(arm));
    case "object":
      return type.fields.some((field) => containsWithheldBinderType(field.type));
    case "prim":
    case "literal":
      return false;
  }
}
```

Diff verdict: renamed-only (clone-map group G058). The only difference is the leaf test: `return true` vs. `return type.withheld === true`.

## Why this is a problem
Both functions must recurse through exactly the same `CompatType` shape. If a new `CompatType` constructor is added and one traversal is updated while the other is missed, the type layer will silently stop looking into that new shape, causing either false deferrals or false verdicts. Because the two predicates are used in different places (`inferCalleeReturnPayload` vs. the withheld-binder guards), a drift here is easy to overlook.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/type-layer-checks.ts` or the existing `CompatType` utility module (`src/parser/type-compat.ts`). A single fold over `CompatType` parameterized by the leaf predicate would replace both copies.

## False-positive check
- Re-verified both spans at HEAD; both functions are live and called from production paths.
- Confirmed clone-map group G058 matches these exact line ranges.
- Searched `quality/intake/` for `containsNamedType` and `containsWithheldBinderType`: no existing D4 filing covers them.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
