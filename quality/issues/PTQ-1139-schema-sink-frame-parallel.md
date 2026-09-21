---
id: PTQ-1139
title: Typed-query schema-sink frame classification split between producer and consumer
lens: D4
status: open
verdict: confirmed
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
fix_skips: 1
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
verdict: questionable — accounting verified independently: `SchemaSinkFrame` has 7 members (inference.ts:83-90, cited 48-72 — line drift only, content byte-matches), `resolveQuerySchemaSink` switch covers 7/7 (179-208) with no `default`/`never` guard, and the producer emits all 7 kinds (let :212, fn-return :259-263, stop ×~20, propagate :397, ternary :408-409, array-literal :416, call-arg :474/:500/:557/:578-591); both modules live (theta-document.ts:91 → resolve; resolve:65-66 + runtime/query-schema-lowering.ts:145 → inference); not a duplicate (resolved PTQ-0052/PTQ-0165 are D2 deadness on the same union, different root cause); but it is one closed union with a typed importer, not two independent copies, so whether a construct→frame table is a real shared source of truth is a design ruling for a human (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at HEAD: `SchemaSinkFrame` has 7 members (inference.ts:83-90; cited 48-72 is line drift, content byte-exact), `resolveQuerySchemaSink` switch covers 7/7 (:179-208) with no `default`/`never` guard so a new union member would compile unhandled, and the producer emits all 7 (let :202, fn-return :249-253, propagate :387, ternary :398-399, array-literal :406, call-arg :464/:490/:547/:568-581, stop ×19; callArgFrame excerpt matches :563-583 with comments elided); both modules live (importers: theta-document.ts, type-layer-checks.ts, runtime/query-schema-lowering.ts); not a duplicate (PTQ-0052/PTQ-0165 are resolved D2 deadness on the same union, no open D4 row names it); but the "parallel" is one closed union's typed producer and its switch consumer — producer-side drift is compile-refuted, only consumer-side omission is not — so whether a construct→frame table is a real second source of truth or ordinary discriminated-union usage is a design ruling for a human (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.

## Fix attempts
- qw20260921165908: skipped — [PTQ-1139-schema-sink-frame-parallel.md] PTQ-1140 (D4 clone): sites had drifted — hasUnterminatedStringLiteral and topLevelColon were already consolidated into src/parser/type-text-split.ts, splitParamValue moved to frontmatter-params.ts, braceGroupCarriesUnmatchedCloseToken to annotation-validation.ts. Extracted ONE shared quote/escape helper `skipQuotedRegion` into the existing helper module type-text-split.ts (444→464 LOC pre-gate, well under the 1000 justify band) and replaced the quote-core in all five cited copies (findCutBracketGroupText in params.ts, splitParamValue in frontmatter-params.ts, braceGroupCarriesUnmatchedCloseToken in annotation-validation.ts, plus the two type-text-split residents) with calls; the deliberately divergent bracket handling per bug 0238 (typed stack vs bare depth vs angle-only floor) is untouched, so behaviour is identical; non-cited scanners (isSingleEnclosingBraceGroup, isBraceBalanced, splitTopLevelSegments, classifyGenericArgumentSegments) left alone per minimal scope; updated the annotation-validation mirror comment to name the shared helper. All imports are same-directory (src/parser), no new cross-directory edge. PTQ-1141 (D4 clone): the three splitters now live in src/parser/annotation-compat.ts (380 LOC per size-scan, under the band, so it is the home). Extracted ONE shared nesting scan `topLevelDelimiterIndices(text, delimiter, trackBraces)` and rewrote splitTopLevelObjectFields / topLevelColonIndex (trackBraces=true) and splitTopLevelUnion (trackBraces=false) as calls — the union splitter's angle-only bracket set (bug 0130/0252 recorded residual, cell F4) is preserved via the parameter, so behaviour is byte-identical at every call site including runtime/tool-call-static-checks.ts. PTQ-1139 (D4 parallel): skipped — parallel class requires a human ruling under ## Triage naming the shape to implement; the batch ratification confirms the finding only, and all three triage passes explicitly defer whether a construct→frame table is a real shared source of truth to a human design ruling; none is named, so per the lens rule I must not pick a design silently. Verified the parallel still exists (SchemaSinkFrame produced in query-schema-resolve.ts, consumed in query-schema-inference.ts). PTQ-1142 (D4 parallel): skipped for the same reason — the binder walk (now src/parser/local-binders.ts) still parallels the type-layer walk (src/parser/type-layer-walk.ts), but the ratification names no traversal-rules design to implement and triage defers it to a human ruling. Gate run verbatim: npx tsc --noEmit clean, npm test 698 files / 11617 tests all green. | review unconfirmed: PTQ-1139-schema-sink-frame-parallel.md: untouched — shed by the fixer; the SchemaSinkFrame producer/consumer parallel remains split between src/parser/query-schema-inference.ts (union + resolveQuerySchemaSink switch) and src/parser/query-schema-resolve.ts (frame construction in statement/expression rewriting and callArgFrame); neither file was modified. PTQ-1142-binder-walk-parallels-type-walk.md: untouched — shed by the fixer; the binder-collection walk (walkStmtForLocalBinders/walkExprForLocalBinders, now living in src/parser/local-binders.ts after post-filing drift) still parallels the type-layer walkStmt/walkExpr; no working-tree change addresses it. ||
