---
id: PTQ-0030
title: static-type-inference narrates a V20c consumer for the published InferredTypeMap, but the sole production infer() call discards the map
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/static-type-inference.ts:3-8
  - src/parser/static-type-inference.ts:56-68
  - src/parser/static-type-inference.ts:113-134
  - src/parser/type-layer-checks.ts:349-352
  - src/parser/type-layer-checks.ts:1508
  - src/parser/type-layer-checks.ts:2976
sites: 6
fix_scope: module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# static-type-inference narrates a V20c consumer for the published InferredTypeMap, but the sole production infer() call discards the map

## Observation
The module header and the `InferredTypeMap` doc-comment state that the pass
"publishes a per-node inferred-type lookup the `V20c` type-layer checkers
consume". In current code, the only production call to `infer` is
type-layer-checks.ts:352, which discards the returned map. The V20c checkers
consume the pass through the pure per-node `typeOf` (:1508) and
`declaredFieldType` (:2976) methods instead; the second and third production
constructors of the pass (invoke-static-checks.ts:943, :1386) never call
`infer` at all. `infer` builds only local state and mutates nothing on the
instance, so the discarded-result call has no observable effect.

## Evidence
src/parser/static-type-inference.ts:3-8 (module header) and :56-59 (interface
doc) — the consumer claim:

```ts
// This module owns the seam the paired `V20b` implementation leaf fills in: a
// read-only whole-program pass over a parsed `V19a` `ThetaBody` that assigns a
// static type to every expression node (literal, identifier, binary, ternary,
// member, index, call, `match`, enum, `Ok`/`Err`) using the `V2b`
// type-compatibility engine (`⊑`), and publishes a per-node inferred-type
// lookup the `V20c` type-layer checkers consume.
```

```ts
/**
 * The per-node inferred-type lookup the pass publishes and the `V20c`
 * type-layer checkers consume: keyed by the expression node itself.
 */
export interface InferredTypeMap {
```

src/parser/static-type-inference.ts:113-134 — `infer` writes only the local
`types`/`nodes` and returns them (instance-pure; discarding the result
discards everything the call computed):

```ts
  infer(body: ThetaBody, env: TypeEnv): InferredTypeMap {
    const types = new Map<Expr, CompatType>();
    const nodes: Expr[] = [];
    ...
    this.#walkBlock(body, record, env);
    return {
      typeOf: (node: Expr): CompatType | undefined => types.get(node),
      nodes,
    };
  }
```

src/parser/type-layer-checks.ts:349-352 — the sole production call; the
returned map is not bound:

```ts
  // Run the `V20b` read-only whole-program pass in production: it types every
  // statement-level node and validates the substrate composes with the parse.
  pass.infer(body, env);
```

src/parser/type-layer-checks.ts:1508 and :2976 — what the V20c checkers
actually consume:

```ts
    return this.pass.typeOf(expr, this.env, bindings);
```
```ts
          : this.pass.declaredFieldType(expr, this.env, bindings);
```

Search evidence: grep `\.infer\(` over all *.ts — one src hit
(type-layer-checks.ts:352) and three hits in
tests/static-type-inference.test.ts (:146, :155, :243), which are the only
readers of the returned map's `typeOf`/`nodes` members anywhere.

## Why this is a problem
Historical narration with a mechanical mismatch: the docs name a consumer
(V20c) for the published lookup, and that consumer provably does not consume it
— it binds the pass object and queries `typeOf`/`declaredFieldType` per node,
while the one `infer` call it makes throws the published map away. The
discarded-result call is a leftover of the publish-then-consume design the
narration describes (its own comment claims it "validates the substrate
composes with the parse", but a call whose result is discarded and whose
callee raises no diagnostics validates nothing a type-check does not already).
The witness tests in tests/static-type-inference.test.ts do consume the
returned map, so the map itself is deliberate seam surface and is not claimed
dead here; the cruft is the false consumer claim and the no-op production
call it leaves behind.

## Suggested direction (non-binding, optional)
Align the narration with the code: either state that the published map is a
seam surface consumed by the witness tests while production consumes the pure
`typeOf`/`declaredFieldType` seams (and drop or justify the discarded-result
call), or make the production wiring actually consume the map. The fix stage
owns the choice.

## False-positive check
Reference searches: grep `\.infer\(` across src/, tests/, extensions/, tools/
— 1 production call (result discarded) + 3 test calls; grep
`InferredTypeMap|\.nodes` across src/ — no production reader of the map or its
`nodes` member (the theta-document.ts `docScan.nodes` hit is an unrelated
symbol); grep `typePass\.|importerPass\.|this\.pass\.` in
invoke-static-checks.ts and type-layer-checks.ts — consumption is exclusively
`typeOf`/`declaredFieldType`. Witness-test check: tests/static-type-inference.test.ts
reads `inferred.typeOf(...)` and `inferred.nodes.length` — the map is
test-witnessed, so this finding does NOT claim `infer`/`InferredTypeMap` is
dead code; it targets the stale consumer narration and the discarded-result
production call. Instance-purity check: `infer` writes only function-local
`types`/`nodes` (:114-133); no field of `StaticTypeInferencePass` is assigned
outside the constructor, so the discarded call cannot have a side effect on
later `typeOf` answers.

## Triage
verdict: confirmed — reproduced: sole production `pass.infer(body, env)` (type-layer-checks.ts:352) discards the map and `infer` is externally pure (writes only local `types`/`nodes`, copies binding scopes at :348/:420, no `throw` in static-type-inference.ts/type-compat.ts/match-result.ts, so it validates nothing), while V20c/invoke-static-checks consume only `pass.typeOf`/`declaredFieldType` (:1508, :2976) — `InferredTypeMap` has no production reader, making the header (:3-8) and interface (:56-59) "the `V20c` type-layer checkers consume" claim stale; not a test-only-caller filing, and distinct from the enumNames/checkCompatible siblings. (triage: claude-opus-5)
