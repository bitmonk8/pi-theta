---
id: pending
title: Typed-query schema-sink frame classification split between producer and consumer
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/query-schema-inference.ts:48-72
  - src/parser/query-schema-inference.ts:175-208
  - src/parser/query-schema-resolve.ts:200-265
  - src/parser/query-schema-resolve.ts:390-525
  - src/parser/query-schema-resolve.ts:570-600
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Typed-query schema-sink frame classification split between producer and consumer

## Observation
`src/parser/query-schema-inference.ts` defines the closed union `SchemaSinkFrame` and consumes it in `resolveQuerySchemaSink`, which switches over `frame.kind` to classify each frame as transparent or opaque and to decide which written annotation reaches a typed query. `src/parser/query-schema-resolve.ts` imports `SchemaSinkFrame` and constructs frame values of the same kinds while rewriting statements and expressions. The two files are the producer and consumer halves of one classification: one decides which frame kind an AST construct receives, the other decides what that frame kind means for schema inference.

## Evidence
Consumer — `src/parser/query-schema-inference.ts:48-72` defines the frame kinds:
```ts
export type SchemaSinkFrame =
  | { readonly kind: "propagate" }
  | { readonly kind: "ternary" }
  | { readonly kind: "array-literal" }
  | { readonly kind: "let"; readonly annotation: InferredSchema }
  | { readonly kind: "call-arg"; readonly paramType?: InferredSchema }
  | { readonly kind: "fn-return"; readonly returnType?: InferredSchema }
  | { readonly kind: "stop" };
```

Consumer — `src/parser/query-schema-inference.ts:175-208` resolves them:
```ts
  for (const frame of input.frames) {
    switch (frame.kind) {
      case "propagate":
      case "ternary":
        // Transparent: continue the outward walk.
        break;
      case "array-literal":
        arrayDepth++;
        break;
      case "let":
        return { schema: unwrapArrayLevels(frame.annotation, arrayDepth), frame };
      case "call-arg":
        return frame.paramType === undefined
          ? undefined
          : { schema: unwrapArrayLevels(frame.paramType, arrayDepth), frame };
      case "fn-return":
        if (frame.returnType !== undefined) {
          return { schema: unwrapArrayLevels(frame.returnType, arrayDepth), frame };
        }
        break;
      case "stop":
        return undefined;
    }
  }
```

Producer — `src/parser/query-schema-resolve.ts:200-265` emits `let` and `fn-return` frames from statement-level constructs; `src/parser/query-schema-resolve.ts:390-525` emits `propagate`, `ternary`, `array-literal`, `stop`, and `call-arg` frames from expression-level constructs. For example:
```ts
        const operand = this.rewriteExpr(expr.operand, [{ kind: "propagate" }, ...frames]);
```
```ts
          consequent: this.rewriteExpr(expr.consequent, [{ kind: "ternary" }, ...frames]),
          alternate: this.rewriteExpr(expr.alternate, [{ kind: "ternary" }, ...frames]),
```
```ts
        const elements = expr.elements.map((el) =>
          this.rewriteExpr(el, [{ kind: "array-literal" }, ...frames]),
        );
```

Producer — `src/parser/query-schema-resolve.ts:570-600` builds the `call-arg` frame with optional `paramType`:
```ts
  private callArgFrame(callee: string, index: number): OriginFrame {
    const fn = this.fns.get(callee);
    if (fn === undefined) {
      return { kind: "call-arg" };
    }
    const param = fn.params[index];
    if (param === undefined || param.type.length === 0) {
      return { kind: "call-arg" };
    }
    const paramType = annotationToInferred(param.type);
    return paramType === undefined
      ? { kind: "call-arg" }
      : {
          kind: "call-arg",
          paramType,
          origin: { capture: { kind: "fn-param", range: fn.range, paramIndex: index } },
        };
  }
```

## Why this is a problem
This is a load-bearing parallel truth. When `SchemaSinkFrame` gains a case, or when the semantics of an existing case change, both the producer (`query-schema-resolve.ts`) and the consumer (`query-schema-inference.ts`) must update in lockstep. Today the consumer switch covers all 7 frame kinds the producer emits, so coverage is 7 of 7. However, the producer logic is scattered across statement rewriting, expression rewriting, and `callArgFrame`; the meaning of each kind is stated once in the consumer. A change to whether a construct is transparent or opaque, or a new transparent construct such as a parenthesisation-preserving AST node, would require matching changes on both sides.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): keep the closed union and its consumer switch in one place, and express the producer choices through a small table or helper that maps AST constructs to frame kinds, co-located with the union definition.

## False-positive check
- Re-verified all spans at HEAD; both files are live and imported by the typed-query pipeline.
- `query-schema-resolve.ts` imports `SchemaSinkFrame` from `query-schema-inference.ts` at line 65.
- The union is closed, so TypeScript enforces exhaustiveness in the consumer switch; this finding is not about a missing case today but about the mirrored producer/consumer semantics.
- Not a spec-normative vector table; not generated; not in `tests/`.

## Triage
verdict: questionable — accounting verified: SchemaSinkFrame has 7 kinds, resolver switch covers 7, producer emits all 7 (union body actually at inference.ts:83-90, minor drift); both modules live; no exhaustiveness guard on the switch; but the "parallel" is one closed union produced/consumed across two modules, not two independent copies, so whether a producer-side table adds a real source of truth is a human design ruling (triage: claude-fable-5-1)
