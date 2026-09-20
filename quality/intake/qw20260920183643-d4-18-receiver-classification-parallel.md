---
id: pending
title: Receiver classification for member and index access is a parallel truth
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:228-243
  - src/parser/type-compat.ts:525-541
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Receiver classification for member and index access is a parallel truth

## Observation
`classifyReceiver` in `src/parser/type-layer-checks.ts` maps a `CompatType` to a built-in receiver kind for member/method access, while `classifyIndexReceiver` in `src/parser/type-compat.ts` maps a `CompatType` to an index-receiver kind for index access. Clone-map group G069 flags their structural similarity. Both functions must classify the same set of `CompatType` constructors and must agree on which types are objects, arrays, primitives, or unknown.

## Evidence
`src/parser/type-layer-checks.ts:220-234` (`classifyReceiver`; clone-map group G069 spans 228-243):
```ts
function classifyReceiver(type: CompatType, env: TypeEnv): BuiltinReceiver {
  switch (type.kind) {
    case "prim":
      return type.name;
    case "literal":
      return type.typesAs;
    case "array":
      return "array";
    case "object":
      return "object";
    case "union":
      return "unknown";
    case "named": {
      const decl = resolveNamedRef(env, type);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      return classifyReceiver(decl.rhs, env);
    }
  }
}
```

`src/parser/type-compat.ts:525-539` (`classifyIndexReceiver`; clone-map group G069 spans 525-541):
```ts
export function classifyIndexReceiver(
  type: CompatType,
  env: TypeEnv,
): IndexReceiverKind {
  switch (type.kind) {
    case "array":
      return "array";
    case "object":
      return "object";
    case "prim":
    case "literal":
      return "primitive";
    case "union":
      return "unknown";
    case "named": {
      const decl = resolveNamedRef(env, type);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      // A transparent alias: classify its resolved RHS (TYPE-11).
      return classifyIndexReceiver(decl.rhs, env);
    }
  }
}
```

Parallel coverage count: `CompatType` has the six constructors `prim`, `literal`, `array`, `object`, `union`, and `named`. Both functions cover all six constructors, so coverage is 6 of 6 today.

## Why this is a problem
This is the parallel class the brief highlights: two passes over the same discriminated type (`CompatType`) that must stay in step. Member access and index access are different operations, but they must agree on the underlying shape of the receiver. If a new `CompatType` constructor is added, or if the handling of transparent aliases or object schemas changes, both classifiers must be updated. Today they already diverge in one observable detail: `classifyReceiver` distinguishes `prim` and `literal` by returning the literal's `typesAs`, while `classifyIndexReceiver` collapses both to `"primitive"`. That divergence is currently intentional, but any future change to `named` resolution or alias transparency must be kept consistent or the two access kinds will disagree on which types are resolvable.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis) would be a single `CompatType` classifier parameterized by the desired granularity at the leaf level, co-located with the `CompatType` definition or in `src/parser/type-compat.ts`.

## False-positive check
- Re-verified both spans at HEAD; both functions are live.
- Confirmed clone-map group G069 matches these exact line ranges.
- Searched `quality/intake/` for `classifyReceiver` and `classifyIndexReceiver`: no existing D4 filing covers this parallel.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
