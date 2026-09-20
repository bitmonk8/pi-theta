---
id: pending
title: walkExpr is 380 LOC because its query arm alone is 176 LOC of annotation resolution
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:10063-10442
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#walkExpr
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# walkExpr is 380 LOC because its query arm alone is 176 LOC of annotation resolution

## Observation
walkExpr (src/parser/theta-document.ts:10063-10442, 380 LOC, strong band) is the structural-check dispatch over the Expr union (21 variants, declared at 463-483). Fourteen arms are 3-25 LOC of recursion; the invoke arm (59 LOC) walks the `<T>` return annotation, and the query arm (176 LOC) resolves the `@<T>` annotation: interpolation checks, response-part position rules with three withhold gates, reserved-keyword and unresolved-name loops for the response part, the same pair again for the error-model part with cross-slot dedup sets, and a non-arity-2 Result fallback that filters one arity diagnostic out of a whole-annotation walk.

## Evidence
Arm inventory (arm | lines | LOC):

| arm | lines | LOC |
|---|---|---|
| ident, binary, ternary, try | 10072-10094 | 23 |
| call (direct-arg carve-out + clause values) | 10095-10125 | 31 |
| invoke (returnSchema annotation block) | 10126-10184 | 59 |
| member, index, object, match, result-ctor, method-call, array | 10185-10242 | 58 |
| query (annotation resolution) | 10243-10418 | 176 |
| par-for, block, default | 10419-10442 | 24 |

The query arm's shape (excerpt 10281-10289):

```ts
      if (e.schema !== null && e.schema.trim().length > 0) {
        const responseAnnotation = queryResponseAnnotation(e.schema);
        if (responseAnnotation !== undefined) {
          // `@<Schema>` is a type ASCRIPTION (query-forms.md:44, :57), and
          // `TypePosition`'s closed classification (type-grammar.ts) puts an
```

The arm's only inputs are e (QueryExpr), refs.typeNames, file, out — no walk-locals; its whole body is sequential over one node and never recurses.

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required. Reasons considered and defeated: (1) closed-enumeration dispatch — the switch mirrors the closed Expr union (463-483), but the reason requires short arms and the query arm is 176 LOC (46% of the function); the length is one node's annotation algorithm, not the enumeration; (2) single algorithm with shared local state — the query arm reads four values (e, refs, file, out) and shares no locals with any other arm, so extraction threads four parameters, not six; (3) strong extras — the withhold gates (bugs 0093/0203/0273/0277/0278) order pushes within the arm only, preserved verbatim by an extraction; no measured cost, no reverted split, no exemption entry.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: Seam A: the query arm's annotation body (10254-10418) -> checkQueryAnnotation(e, refs, file, out) beside the existing queryResponseAnnotation/queryErrorModelAnnotation helpers at 7987-8020 (hypothesis) — ~165 LOC, 0 exported symbols moved, 0 external importers, one call back from the arm. Seam B: the invoke arm's returnSchema block (10143-10180) -> the same helper family (hypothesis) — ~38 LOC, 0 exports, 0 external importers. None identified yet beyond these.

## False-positive check
Band check: 380 LOC >= 200, strong. Reasons considered recorded; the closed-dispatch reason defeated by the 176-LOC arm measurement. Exemptions check: no D9 entry for this host in quality/exemptions.json. Generated-code check: hand-written (bug 0093/0203/0273/0277/0278 rationale inline). Spec-mirror check: the Expr union is code-declared; the over-threshold LOC is one arm's algorithm. Range 10063-10442 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan gives walkExpr 10063-10442 = 380 LOC band strong; case-label boundaries reproduce the inventory exactly (query arm 10243-10418 = 176, invoke 10126-10184 = 59); the query arm reads only e/refs.typeNames/file/out and no walk-locals; no D9 exemption for this host, no prior split/revert in git; closed-dispatch reason correctly defeated since the over-threshold LOC is one arm's algorithm — note 106 of the 176 query-arm lines are comments (~70 executable); target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: `size-scan map --files` reproduces `walkExpr — 10063-10442 — 380 LOC — band strong` (FN_BANDS strong=200), host key exact; the seventeen `case` labels (10072…10438) reproduce every inventory row (query 10243-10418 = 176, invoke 10126-10184 = 59); the query arm references neither `scope` nor `bareObjectAllowed`, never recurses, and every `const` is block-private, so no ≥6-shared-locals reason applies; the switch mirrors the code-declared `Expr` union (20 members at 466-485, not 21 at 463-483 — filing miscount, immaterial) and not a spec table, and the 176-LOC arm defeats the short-arms premise; `grep theta-document quality/exemptions.json` empty, `grep checkQueryAnnotation` in src empty (no prior split to have reverted); excerpt is byte-exact but at 10261-10265, not 10281-10289; 106/176 arm lines are comments (70 executable) yet the whole function is still 217 executable lines so the band holds on either count; dedupe clean — PTQ-1131 (D4 clone, confirmed) covers only the invoke arm (this filing's optional Seam B), the query-arm root cause is untracked, and d9-01/d9-04/d9-06 carry different d9_host keys; target shape is a design ruling for a human, never confirmed (triage: claude-fable-5-1)
