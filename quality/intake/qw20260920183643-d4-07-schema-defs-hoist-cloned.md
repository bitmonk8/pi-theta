---
id: pending
title: Schema nested $defs hoist algorithm duplicated in parser and runtime lowering
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/params.ts:540-556
  - src/runtime/query-schema-lowering.ts:293-310
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Schema nested $defs hoist algorithm duplicated in parser and runtime lowering

## Observation
`src/parser/params.ts` owns a private helper `hoistNestedDefs` that lifts nested JSON Schema `$defs` to the top level of a fragment map, using a queue and a `hoisted` name set as a cycle/termination guard and stripping `$defs` by shallow clone. `src/runtime/query-schema-lowering.ts` contains the same queue loop inline, differing only in the input variable name (`defs` vs `defsMap`) and one explanatory comment. Both implement the same transitive-closure hoisting step for schema lowering.

## Evidence
`src/parser/params.ts:540-556` (clone-map group G003):
```ts
  const hoisted: Record<string, Record<string, unknown>> = {};
  const queue: [string, Record<string, unknown>][] = Object.entries(defs);
  while (queue.length > 0) {
    const [name, body] = queue.shift() as [string, Record<string, unknown>];
    if (hoisted[name] !== undefined) {
      continue;
    }
    const nested = body["$defs"];
    if (nested === undefined || nested === null || typeof nested !== "object") {
      hoisted[name] = body;
      continue;
    }
    queue.push(...Object.entries(nested as Record<string, Record<string, unknown>>));
    const stripped: Record<string, unknown> = { ...body };
    delete stripped["$defs"];
    hoisted[name] = stripped;
  }
```

`src/runtime/query-schema-lowering.ts:293-310` (clone-map group G003):
```ts
  const hoisted: Record<string, Record<string, unknown>> = {};
  const queue: [string, Record<string, unknown>][] = Object.entries(defsMap);
  while (queue.length > 0) {
    const [name, body] = queue.shift() as [string, Record<string, unknown>];
    if (hoisted[name] !== undefined) {
      continue;
    }
    const nested = body["$defs"];
    if (nested === undefined || nested === null || typeof nested !== "object") {
      hoisted[name] = body;
      continue;
    }
    queue.push(...Object.entries(nested as Record<string, Record<string, unknown>>));
    // STRIP by shallow clone — the shared fragment itself is never mutated.
    const stripped: Record<string, unknown> = { ...body };
    delete stripped["$defs"];
    hoisted[name] = stripped;
  }
```

Verdict: renamed-only (identifier `defs` → `defsMap`) plus one added comment. Same algorithm, same control flow, same data structures.

## Why this is a problem
The two sites are two independent implementations of the same load-bearing schema-lowering step. If a future fix changes cycle handling, ordering, or the strip-by-clone behavior in one copy, the other copy must receive the same change or the parser and runtime lowering paths will produce different fragment maps for the same schema. The comments in each file describe the same cycle/termination invariant, confirming the copies are meant to behave identically.

## Suggested direction (non-binding, optional)
The natural shared home is an existing schema-lowering helper module under `src/parser/` or `src/runtime/`; `params.ts` already names the algorithm as `hoistNestedDefs`, so exporting and reusing that helper is one possible consolidation point.

## False-positive check
- Re-verified both spans at HEAD; both copies are live and reachable.
- `hoistNestedDefs` is used in `params.ts` at line 504; the inline loop in `query-schema-lowering.ts` is used during runtime schema lowering.
- Not a spec-normative reference vector (the spec describes the algorithm, but the implementation is not spec-anchored in both places).
- Not generated code and not in `tests/`.

## Triage
