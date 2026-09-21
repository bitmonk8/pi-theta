---
id: pending
title: TypeLayerWalk.checkFnCallArgs is 116 LOC in the justify band, bundling callee resolution, the arity gate, and the per-argument compat+sink loop
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:2460-2575
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts#TypeLayerWalk.checkFnCallArgs
d9_band: justify
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# TypeLayerWalk.checkFnCallArgs is 116 LOC in the justify band, bundling callee resolution, the arity gate, and the per-argument compat+sink loop

## Observation
`checkFnCallArgs` (src/parser/type-layer-checks.ts:2460-2575, 116 LOC, band justify per the wave's structural map) is the same-file user-`fn` call check inside `TypeLayerWalk` (the V20c type-layer diagnostics walk per the module header). It resolves the callee through three ordered guards, runs the arity gate, then runs a per-argument loop that judges each argument's type compatibility and feeds array-literal arguments to the parameter-type element sink, returning the set of sunk argument nodes.

## Evidence
Step inventory (function 2460-2575; locals each phase reads/writes):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| signature + `sunkArgs` init | 2460-2467 | 8 | `e`, `bindings` | `sunkArgs` |
| shadowed-local guard (expressions.md §"Identifier resolution") | 2468-2473 | 6 | `this.shadowedNames`, `e.callee` | — (early return `sunkArgs`) |
| imported-symbol guard (bug 0138 Route 2 — judged at LOAD pass instead) | 2474-2487 | 14 | `this.importedSymbols`, `e.callee` | — (early return `sunkArgs`) |
| `fnDecls` resolution guard | 2488-2495 | 8 | `this.fnDecls`, `e.callee` | `fn` (early return `sunkArgs`) |
| arity gate (bug 0131 §(c); invocation.md §Argument arity) | 2496-2520 | 25 | `fn.params`, `e.args`, `this.file` | `paramsAreIdents`, `arityDiags`, `this.diagnostics` (early return `sunkArgs`) |
| per-argument compat + element-sink loop (bugs 0156/0157) | 2521-2574 | 54 | `fn.params`, `e.args`, `bindings`, `this.env`, `this.file` | `matchedCount`, `p`, `paramType`, `arg`, `argType`, `unfolded`, `this.diagnostics`, `sunkArgs` |
| return | 2575 | 1 | `sunkArgs` | — |

Excerpt of the guard chain (2460-2473):
```ts
  private checkFnCallArgs(
    e: CallExpr,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlySet<Expr> {
    // A per-call, per-argument answer: two calls of the same `fn` in one
    // document must each narrow their own literal, never a slot shared
    // across invocations.
    const sunkArgs = new Set<Expr>();
    if (this.shadowedNames.has(e.callee)) {
      // expressions.md §"Identifier resolution": a local binding (arm 1)
      // outranks a top-level `fn` (arm 2), so a call of a locally-bound name
      // is never a user-`fn` call at this site.
      return sunkArgs;
    }
```

## Why this is a problem
The justify band carries a presumption of breakdown unless a concrete reason to keep the host whole is found. Reasons considered and defeated: (a) closed-enumeration dispatch — the three guards do mirror expressions.md §"Identifier resolution" ranking, but the dominant phase (the 54-LOC per-argument loop) is not an enumeration arm, so the enumeration does not own the length; (b) single algorithm with shared local state — extracting the per-argument loop as a private method threads only `fn`, `e`, `bindings`, `sunkArgs` (4 explicit locals; `diagnostics`/`env`/`file` ride `this`), well under the 6-local bar, so no state object need be invented; (c) data-only / grammar-production / generated code — none apply (the body is control flow, not tables; the file is hand-written). No entry for this host exists in quality/exemptions.json.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the per-argument compat + element-sink loop (2521-2574) -> private `checkFnCallArgAt`/`checkFnCallArgLoop` — 54 LOC, 0 exported symbols moved, 0 external importers affected, cross-references back into the host: `this.provableArgType`, `this.checkArrayLiteral`, `this.diagnostics`. Seam B (hypothesis, unproven): the arity gate (2496-2520) -> private `checkFnCallArity` wrapper next to the loop — 25 LOC, 0 exports moved, mirrors the delegation shape `checkInvokeCall` (invoke-diagnostics.ts) already uses.

## False-positive check
Band: 116 LOC, justify (map-quoted, not recounted). Reasons-considered list: closed-enumeration dispatch, shared-local-state algorithm, data-only module, grammar production family, generated code — each defeated as above with counts. Exemptions check: quality/exemptions.json has no `src/parser/type-layer-checks.ts#TypeLayerWalk.checkFnCallArgs` entry. Generated-code check: file header describes hand-authored V20c wiring; no generator cited. Spec-mirror check: the guard chain cites expressions.md and the arity gate cites invocation.md, but the spec-mirrored parts total ~45 LOC while the loop dominates. Duplicate check: prior-wave D9 filings against this file target the file itself, walkStmt, provableArgType, and walkExpr — none targets this host key; grep of quality/intake and quality/issues for `checkFnCallArgs` finds it only as a passing mention inside the walkExpr filing's inventory.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces TypeLayerWalk.checkFnCallArgs at 2460-2575 / 116 LOC / band justify with no quality/exemptions.json row; the excerpt is byte-exact at 2460-2473 and the phase LOC (8+6+14+8+25+54+1) sum to 116; the rows are real distinct concerns (three callee-resolution guards each early-returning on a different `this.*` map, an arity gate writing `paramsAreIdents`/`arityDiags` only, a per-argument loop writing `sunkArgs`) not one concern split by adjectives; my own cross-phase local count is 4 (`fn`, `e`, `bindings`, `sunkArgs` — `matchedCount` is born inside the loop phase at 2521, `paramsAreIdents`/`arityDiags` never leave the arity gate), so the prior wave's "7 threaded locals" keep-whole reason counted loop-internal temporaries and the ≥ 6-shared-locals reason is correctly defeated; no other concrete/strong reason applies (git history shows no prior split of this host — introduced at 3efdb4ac, arity gate added at 0759f529 — and the invocation.md arity-before-type ordering survives a private-method extraction unchanged; the checkInvokeCall delegation-shape claim reproduces at invoke-diagnostics.ts:577); not a duplicate — checkFnCallArgs appears in quality/ only as a row inside the pending walkExpr filing qw20260920202922-d9-04 (triage: claude-fable-5-1)
