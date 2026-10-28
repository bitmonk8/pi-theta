---
id: PTQ-1702
title: StaticTypeInferencePass still describes its implemented substrate as missing.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/static-type-inference.ts:13-22
  - src/parser/static-type-inference.ts:155-165
  - src/parser/type-layer-checks.ts:376-390
  - src/parser/type-layer-checks.ts:401-406
  - src/parser/type-layer-walk.ts:151-154
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# StaticTypeInferencePass still describes its implemented substrate as missing.

## Observation
The module header says there is no whole-program static-type walk and that the type-phase checkers have nothing to run against in production. The same module implements the walk, and the production type-layer checker constructs this pass and queries its per-expression seam. The header retains the pre-implementation description alongside a paragraph describing the implemented walk.

## Evidence
The header's missing-substrate claim and its following implementation description, `src/parser/static-type-inference.ts:13-22`:

```ts
// The pass is the missing "Bucket B" substrate between `V2b`'s compatibility
// engine and the type-phase checkers: there is a `checkCompatible` relation but
// no whole-program walk that assigns a static type to every expression node, so
// the type-phase checkers have nothing to run against in production. The pass
// is constructor-injected over the `V2b` engine and holds no module-level
// mutable state; it is the seam `V20c` binds against.
//
// V20b implements the walk: `infer` performs a read-only recursive pass over
// the parsed body, assigns a static type to every statement-level expression
// node, and publishes the per-node inferred-type lookup keyed by node identity.
```

The implemented recording and traversal, `src/parser/static-type-inference.ts:155-165`:

```ts
    const record = (expr: Expr): void => {
      if (types.has(expr)) {
        return;
      }
      types.set(expr, this.#typeExpr(expr, env, noBindings));
      nodes.push(expr);
    };
    this.#walkBlock(body, record);
    return {
      typeOf: (node: Expr): CompatType | undefined => types.get(node),
      nodes,
```

The production checker's pass construction and injection, `src/parser/type-layer-checks.ts:376-390`:

```ts
  const pass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(body.statements),
    fnCallReturnTypes: collectFnCallReturnTypes(body.statements, shadowedNames),
    ...(runtimeToolSuccessTypes !== undefined ? { runtimeToolSuccessTypes } : {}),
  });
  const checker = new TypeLayerWalk(
    pass,
    env,
    file,
    fnReturns,
    fnDecls,
    importedSymbols,
    shadowedNames,
  );
```

The production walk entry, `src/parser/type-layer-checks.ts:401-406`:

```ts
): Diagnostic[] {
  const { checker } = buildTypeLayerWalk(body, file, paramsFields, runtimeToolSuccessTypes);
  checker.walkBlock(body, paramsFieldBindings(paramsFields), {
    returnScope: { kind: "inferred" },
  });
  return checker.diagnostics;
```

Its type query, `src/parser/type-layer-walk.ts:151-154`:

```ts
  /** The static type the `V20b` pass assigns `expr` under the in-scope bindings. */
  public typeOf(expr: Expr, bindings: ReadonlyMap<string, CompatType>): CompatType {
    return this.pass.typeOf(expr, this.env, bindings);
  }
```

## Why this is a problem
This is historical header narration presented as the module's current state. The claim that production checkers have no substrate conflicts with the constructed and injected pass, while the claimed missing walk is implemented in the same file. It does not describe a remaining implementation obligation.

## False-positive check
Read the pass header, `infer`, and the production `buildTypeLayerWalk`/`checkTypeLayer` wiring and `TypeLayerWalk.typeOf` at the cited locations. The header's opening paragraph already distinguishes the witness-facing whole-body map from production's per-node queries; this finding does not treat that distinction, or the witness-facing walk, as cruft. `git log --oneline -S 'The pass is the missing' -- src/parser/static-type-inference.ts` identifies `57dd14ef` (the failing-test substrate commit). `git show b059bd6e:src/parser/static-type-inference.ts` shows the subsequent implementation commit retaining the quoted missing-substrate paragraph alongside its implemented-walk description. No deadness claim is made.

## Triage
verdict: confirmed — All excerpts and history claims reproduce: the header's missing-walk/no-production-substrate wording survives from 57dd14ef despite b059bd6e implementing infer and current checkTypeLayer/TypeLayerWalk wiring querying the pass in production; this is stale D2 header narration, with no existing same-root finding found. (triage: claude-opus-5-5)
