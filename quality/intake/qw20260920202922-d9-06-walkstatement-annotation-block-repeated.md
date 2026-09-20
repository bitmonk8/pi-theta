---
id: pending
title: walkStatement is 386 LOC because the annotation-position check block is written out in four arms
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:9492-9877
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#walkStatement
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# walkStatement is 386 LOC because the annotation-position check block is written out in four arms

## Observation
walkStatement (src/parser/theta-document.ts:9492-9877, 386 LOC, strong band) is the structural-check dispatch over the Stmt union (19 kinds, declared at 969-987). Twelve of its arms are 3-15 LOC recursion/delegation; the let, fn, and schema arms carry, written out in place, the same four-step annotation-position sequence: parseTypeExpression, the guard-1 error window, the propagation/absorption withhold, then the collectUnresolvedNamedTypes reserved-keyword and unresolved-name emission loops.

## Evidence
Arm inventory (arm | lines | LOC):

| arm | lines | LOC |
|---|---|---|
| let (annotation block 9508-9569) | 9500-9573 | 74 |
| reassign, if, while, for, break, continue | 9574-9632 | 59 |
| fn (param annotation block 9640-9700; return annotation block 9702-9764) | 9633-9746 | 114 |
| return, query, tool-call, invoke, expr | 9747-9788 | 42 |
| schema (per-field type block 9800-9855) | 9789-9858 | 70 |
| enum + default | 9859-9877 | 19 |

The repeated sequence, at four sites — let annotation (9508-9569), fn param (9640-9700), fn return (9702-9764), schema field (9800-9855, unspellable variant) — ends identically each time (excerpt from the let arm, 9563-9572; the fn-param and fn-return copies differ only in the propagation key and window):

```ts
          for (const keyword of letReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
          }
          for (const name of letUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
          }
```

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required. Reasons considered and defeated: (1) closed-enumeration dispatch — the switch does mirror the closed Stmt union (969-987), but the reason requires each arm short, and the fn arm is 114 LOC / the let arm 74 LOC; the length is the repeated annotation block, not the enumeration; (2) single algorithm with shared local state — each annotation block reads only (typeSource, propagation key, absorption flag, window, refs, out): six values that are exactly a helper signature, not state that resists extraction — the blocks already recompute their own diagStart window per site; (3) strong extras — the per-annotation guard-1 window (bug 0124) is a within-block ordering, preserved verbatim by extraction; no measured cost, no reverted split, no exemption entry.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: Seam A: the four annotation blocks -> checkAnnotationPosition(typeSource, propagationKey, absorbed, window, refs, range, file, out) beside the existing captureWindowAlreadyRefused/captureAbsorptionWindow helpers (hypothesis) — ~150 LOC collapsing to ~40, 0 exported symbols moved, 0 external importers, four calls back from the let/fn/schema arms (the schema-field variant keeps its unspellable tail). None identified yet beyond it.

## False-positive check
Band check: 386 LOC >= 200, strong. Reasons considered recorded; the closed-dispatch reason defeated by the 114-LOC fn arm measurement. Exemptions check: no D9 entry for this host in quality/exemptions.json. Generated-code check: hand-written (bug 0124/0262/0279 rationale inline at each copy). Spec-mirror check: the Stmt union is code-declared, and the over-threshold LOC is the repeated block, not the union's arity. The four-site repetition is cited here as the step inventory's seam evidence, not filed as a D4 duplication (the copies differ per position key). Range 9492-9877 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives walkStatement 9492-9877 / 386 LOC / band strong, excerpt matches at 9563-9569, arm ranges match, closed-dispatch reason defeated by the 114-LOC fn arm, no shared locals across arms, no D9 exemption for the host; one correction — the schema-field block (9800-9855) is NOT a fourth copy of the four-step sequence (no propagatedToQuery/captureWindowAlreadyRefused withhold, bare refs.typeNames, guard-1 gates only the unspellable tail), so the repetition is three full copies (let/fn-param/fn-return, ~186 LOC) plus a partial, which still carries the over-threshold LOC; not a duplicate of any tracked issue (PTQ-0091 is a resolved comment note; intake siblings d4-15 clone-dedupe and d9-01 file-level are distinct root causes, though a d4-15 fix would likely shrink this host); target shape needs a human ruling (triage: claude-fable-5-1)
