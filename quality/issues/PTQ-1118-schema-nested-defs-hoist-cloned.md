---
id: PTQ-1118
title: Nested $defs hoisting algorithm duplicated between params.ts and query-schema-lowering.ts
lens: D4
status: open
verdict: confirmed
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

# Nested $defs hoisting algorithm duplicated between params.ts and query-schema-lowering.ts

## Observation
`src/parser/params.ts` already contains a private helper `hoistNestedDefs` that walks a JSON-Schema `$defs` map, lifts nested `$defs` entries to the top level with first-wins deduplication, and strips the nested `$defs` key by shallow clone. The same queue-based hoist loop is repeated inline inside `pruneDocumentDefs` in `src/runtime/query-schema-lowering.ts`. Both copies perform identical steps: initialize a queue from `Object.entries(defs)`, shift entries, skip already-hoisted names, recurse into nested `$defs`, and shallow-clone each body before deleting its `$defs` key.

## Evidence

**Copy 1 — `src/parser/params.ts:540-556`:**
```typescript
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

**Copy 2 — `src/runtime/query-schema-lowering.ts:293-310`:**
```typescript
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

**Diff verdict:** renamed-only / type-identical. The only differences are the input variable name (`defs` vs `defsMap`) and an explanatory comment in the runtime copy. The algorithm, data structures, null/undefined/object guards, first-wins `continue`, shallow-clone strip, and queue recursion are byte-for-byte the same. Clone-map group id: **G003**.

## Why this is a problem
The hoist is load-bearing: it determines which `$defs` entries are visible to AJV for named-schema references. `params.ts` uses it when lowering `params:` field types; `query-schema-lowering.ts` uses it when lowering typed `@<Schema>` query response schemas. If the copies drift, the same named-type reference can resolve to different JSON-Schema documents in parameter bindings versus query responses, breaking the invariant that both paths lower the same Theta type to the same validating schema. The duplication is incidental in the sense that neither copy owns the other, but the shared behavior is load-bearing because both are production lowering paths that must agree.

## Suggested direction (non-binding, optional)
The natural shared home is a parser-layer helper module, since `query-schema-lowering.ts` already imports from `src/parser/` and `hoistNestedDefs` originates there. Exporting the existing helper from `src/parser/params.ts` (or moving it to a smaller shared schema-lowering utility such as `src/parser/query-schema-inference.ts`) and consuming it in `pruneDocumentDefs` would collapse the two copies without changing behavior.

## False-positive check
- Re-verified both cited spans at HEAD; both copies are live production code (not dead, not tests, not generated).
- `grep -R hoistNestedDefs src/` shows the helper is defined only in `params.ts` and used at `params.ts:504`; no other copy exists.
- The two functions serve the same schema-lowering purpose for different Theta positions, not a spec-normative vector table that the spec itself repeats.
- No existing D4 finding in `quality/intake/` addresses this specific duplicated `$defs` hoist loop.

## Triage
verdict: confirmed — re-verified at HEAD: both excerpts match at the cited lines, my diff shows only `defs`→`defsMap` plus one comment (renamed-only), clone-scan lists G003 at exactly these spans, both copies live (hoistNestedDefs called params.ts:504; pruneDocumentDefs called at 3 sites, module imported by 6 src/ modules), params.ts:523-527 doc itself states the two paths must perform the same lift; no PTQ tracks it — same-wave sibling d4-07 cites identical spans and should be marked duplicate of this earlier filing (triage: claude-fable-5-1)
