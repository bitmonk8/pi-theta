---
id: PTQ-1187
title: TypeLayerWalk.walkExpr is 248 LOC with the par-for and binary arms carrying inline check logic every other arm delegates to a named helper
lens: D9
status: fixed
verdict: confirmed
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
verdict: questionable — accounting re-verified independently at HEAD: `size-scan map --files` over src/parser/type-layer-checks.ts reproduces `TypeLayerWalk.walkExpr — 3186-3433 — 248 LOC — band strong` (FN_BANDS strong=200), host key exact; all seven inventory rows sit at the cited `case` boundaries (binary 3204-3256 = 53, par-for 3353-3411 = 59) and the integer-narrowing push matches verbatim at 3378-3385; the 20 `case` arms map one-for-one onto the code-defined 20-member `Expr` union (theta-document.ts:463-483, not a spec table), every `const` (sunkArgs, rawIterandType, iterDiag, maxType, r, iterandType, inner, elementType) is arm-block-private so no ≥6-shared-locals reason applies; bug 0345's push-order invariant is confined to the query arm (3412-3420); `grep type-layer-checks quality/exemptions.json` empty, `git log -S checkParFor`/`-S checkBinaryOperands` empty (no reverted split); closed-enumeration is the only applicable reason and is concrete-only; dedupe clean — same-wave d9-01/02/03 carry hosts `src/parser/type-layer-checks.ts` (file), `#TypeLayerWalk.walkStmt`, `#TypeLayerWalk.provableArgType`, d9-07 targets `theta-document.ts#walkExpr`, and no PTQ in issues/ or resolved/ names this method; whether the two long arms warrant private-method seams is a design ruling for a human, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at HEAD with post-filing drift: `size-scan map --files` (mktemp manifest) now gives `TypeLayerWalk.walkExpr — 2920-3160 — 241 LOC — band strong` (filed 3186-3433/248; the −7 LOC and −266 line shift are resolved PTQ-1133's fix in 71af3b5b/bb21dacc, which replaced the par-for arm's inline `iterDiag` block with `checkIterand` from ./type-layer-iterand — so the inventory's `iterDiag` local no longer exists and the par-for arm is 3087-3138 = 52 LOC, not 59), band unchanged (FN_BANDS strong=200), no `type-layer-checks` key in quality/exemptions.json; the remaining rows hold — binary 2938-2990 = 53 LOC with the `&&`/`||`/`!` boolean-position judgement and five-way operator-family gate inline, par-for still inlines the `max` integer sink (both pushes, integer-narrowing excerpt byte-exact at 3101-3108, non-integer-max at 3109-3116) and the element binding while the eleven sibling checking arms delegate to named helpers; 15 `case` labels + default (ident/number/string/bool/null) cover the 20-member code-declared `Expr` union at theta-document.ts:474 (closed-enumeration is concrete-only, no spec table), zero function-scope locals so every `const` is arm-block-private and the ≥6-shared-locals reason does not apply, bug 0345's push order sits inside the 9-line query arm, `git log -S checkParFor`/`-S checkBinaryOperands` empty (no reverted split); not a duplicate — PTQ-1133 (D4 clone, resolved) covered only the 15-line iterand check now extracted, and its fix leaves this filing's max-sink/binding/binary-gate root cause intact; siblings d9-01/02/03 carry the file, `#walkStmt`, `#provableArgType` keys and d9-07 is theta-document.ts#walkExpr; the seam shape is a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
