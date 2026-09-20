---
id: pending
title: TypeLayerWalk.walkExpr is 248 LOC with the par-for and binary arms carrying inline check logic every other arm delegates to a named helper
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:3186-3433
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts#TypeLayerWalk.walkExpr
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# TypeLayerWalk.walkExpr is 248 LOC with the par-for and binary arms carrying inline check logic every other arm delegates to a named helper

## Observation
`walkExpr` (src/parser/type-layer-checks.ts:3186-3433, 248 LOC, strong band) is the expression-recursion dispatch of the type-layer walk. Most arms follow one shape — call a named `check*` helper, then recurse into children (`method-call` -> `checkMethodCall`, `member` -> `checkMemberAccess`, `object` -> `checkObjectFields`, `index` -> `checkIndex`). Two arms break that shape and inline their checks: `binary` (3204-3256, 53 LOC) inlines the boolean-position judgement for `&&`/`||`/`!` plus a five-way operator-family gate, and `par-for` (3353-3411, 59 LOC) inlines the iterand contract, the whole `max`-operand integer check with two diagnostic literals constructed in place, and the loop-variable binding.

## Evidence
Step inventory (arm boundaries from `grep -n 'case "'` over 3192-3433):

| phase (arm) | lines | LOC | locals read/written |
|---|---|---|---|
| ternary boolean-position + recursion | 3193-3203 | 11 | — |
| binary: `&&`/`||` operand loop, `!` synthetic-null handling, `+`/ordering/arithmetic/unary-arithmetic gate | 3204-3256 | 53 | reads ORDERING_OPS, ARITHMETIC_OPS, e.unary |
| try / array / index / match / method-call / member | 3257-3318 | 62 | sunkArrays (array arm) |
| call: checkFnCallArgs sink consumption + with-clause walk | 3319-3337 | 19 | sunkArgs |
| invoke / object / result-ctor | 3338-3352 | 15 | — |
| par-for: iterand contract, `max` integer sink (two inline diagnostic pushes), element binding, body walk | 3353-3411 | 59 | rawIterandType, iterDiag, maxType, r, iterandType, inner, elementType |
| query / block / default | 3412-3433 | 22 | — |

Excerpt of the inline `max` diagnostic construction (3378-3385):
```ts
if (r === "integer-narrowing") {
  this.diagnostics.push({
    severity: "error",
    code: "theta/parse/integer-narrowing",
    file: this.file,
    range: e.max.range,
    message: "cannot narrow number to integer",
  });
```

## Why this is a problem
Strong band: presumption of breakdown absent a strong concrete reason. Reasons considered and defeated: closed-enumeration dispatch — concrete (arms mirror the `Expr` union), but the two long arms (59 and 53 LOC) are not short, and in the strong band a concrete reason alone does not suffice; no spec-cited single critical section (the one ordering constraint, bug 0345's query-arm push order, is contained inside the 9-line `query` arm and untouched by any seam elsewhere); no measured cost, no reverted split, no exemptions.json entry. Single algorithm with shared local state — defeated: the par-for arm's seven locals are arm-private, and the class's own convention (every other checking arm) already demonstrates the seam shape.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the par-for arm's check body (3353-3411) -> private `checkParFor` (hypothesis) — 0 exports moved, mirrors the existing `checkMethodCall`/`checkIndex` delegation shape the sibling arms already use. Seam B: the binary arm's operator-family gate (3204-3256) -> private `checkBinaryOperands` (hypothesis), same shape.

## False-positive check
Band check: 248 LOC ≥ 200 (strong) per the authoritative map. Reasons-considered list recorded above with defeating evidence. Exemptions check: no D9 key for this host in quality/exemptions.json. Generated-code check: hand-written (bugs 0145, 0226, 0315, 0324, 0345, 0367, 0392 cited in-body). Spec-mirror check: arms mirror the `Expr` union; recorded and defeated on arm length plus the strong-band bar. Duplicate check: the wave's qw20260920202922-d9-07-walkexpr-query-arm-176-loc targets src/parser/theta-document.ts#walkExpr (a different host, verified by its `d9_host` line); no filing targets this method.

## Triage
verdict: questionable — accounting verified at HEAD: `size-scan map` over src/parser/type-layer-checks.ts reports `TypeLayerWalk.walkExpr — 3186-3433 — 248 LOC — band strong` (FN_BANDS strong=200), host key exact; arm boundaries match the inventory (ternary 3193-3203, binary 3204-3256 = 53 LOC, try..member 3257-3318, call 3319-3337, invoke/object/result-ctor 3338-3352, par-for 3353-3411 = 59 LOC, query/block/default 3412-3433) and the integer-narrowing push excerpt matches verbatim at 3378-3385; rows are distinct `Expr`-union arms (union at theta-document.ts:463-483, 20 members), no function-scope local is shared across arms (every `const` is arm-block-private), so the ≥6-shared-locals reason does not apply; the bug 0345 push-order invariant is confined to the 9-line query arm (3412-3420); `grep type-layer-checks quality/exemptions.json` → no match; `git log -S checkParFor` / `-S checkBinaryOperands` → no prior extraction ever landed, so no reverted split; the closed-enumeration reason is real but concrete-only, and the two long arms (53/59 LOC) mean the strong-band bar the filing applies is correctly stated. Dedupe: qw20260920202922-d9-07-walkexpr-query-arm-176-loc has `d9_host: src/parser/theta-document.ts#walkExpr` (different host); no open/resolved PTQ carries `d9_host: src/parser/type-layer-checks` (PTQ-0169 only mentions these arms in a D2 header-roster context). D9 breakdown target shape (Seam A/B or otherwise) is a human ruling, never confirmed (triage: claude-fable-5-1)
