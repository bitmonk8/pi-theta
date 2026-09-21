---
id: pending
title: walkCallSiteExpr is 191 LOC because its call arm alone is 95 LOC of callee-resolution judgement
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:8388-8578
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#walkCallSiteExpr
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# walkCallSiteExpr is 191 LOC because its call arm alone is 95 LOC of callee-resolution judgement

## Observation
walkCallSiteExpr (src/parser/theta-document.ts:8388-8578, 191 LOC, justify band) is the lexical call-site dispatch over the Expr union (21 variants, declared at 463-483). Thirteen arms are 3-15 LOC of recursion with scope threading; the call arm is 95 LOC: it resolves the callee (local shadow, runtime tool, Pi tool, other) and emits four codes — shadowed-callable-call, session-tool-in-isolated-body, tool-arg-arity/shape, bare-object-literal — from that one resolution, then recurses into arguments and clause values.

## Evidence
Arm inventory (arm | lines | LOC):

| arm | lines | LOC |
|---|---|---|
| call (resolution + four emissions + recursion) | 8395-8489 | 95 |
| binary, ternary, try, invoke, member, index, method-call, object, array, result-ctor | 8490-8535 | 46 |
| match (arm-binder scope build) | 8536-8549 | 14 |
| par-for (isolated-body flag flip) | 8550-8564 | 15 |
| block + default | 8565-8578 | 14 |

The call arm's resolution ladder (excerpt 8409-8415):

```ts
      const resolvesToRuntimeTool =
        walkCtx.runtimeTools.has(e.callee) &&
        localBinder === undefined &&
        !walkCtx.fnImportDecls.has(e.callee);
      // RFC 0011 §5.3 / §0 C4: a runtime tool called inside a `par for` body
      // addresses the enclosing conversation and is not available there.
      // Emitted AFTER the shadow check (a shadowed name keeps its own verdict)
```

The arm reads four values (e, locals, insideParFor, walkCtx) — the function's own parameters — and shares no locals with any other arm.

## Why this is a problem
Justify band: presumption of breakdown, filed unless a concrete reason to keep whole is found. Reasons considered and defeated: (1) closed-enumeration dispatch — the switch mirrors the closed Expr union, but the reason requires each arm short and the call arm is 95 LOC (half the function); (2) single algorithm with shared local state — the call arm's inputs are exactly the function's four parameters, so extraction threads four, not six; (3) one grammar production family / data-only / generated — inapplicable (a checker walk, hand-written per RFC 0011 / bug 0003 / bug 0016 / bug 0072 comments).

## Suggested direction (non-binding, optional)
Hypothesis, unproven: Seam A: the call arm's judgement body (8396-8483, before the recursion loop) -> checkCallSiteCall(e, localBinder, insideParFor, walkCtx) beside shadowedCallableCallDiagnostic/toolArgShapeDiagnostic at 7597-8080 (hypothesis) — ~85 LOC, 0 exported symbols moved, 0 external importers, one call back from the arm. None identified yet beyond it.

## False-positive check
Band check: 191 LOC, justify (100-199). Reasons considered recorded; the closed-dispatch reason defeated by the 95-LOC arm measurement. Exemptions check: no D9 entry for this host in quality/exemptions.json. Generated-code check: hand-written. Spec-mirror check: the four emissions cite four different bug/RFC sources, not one spec table of arms. The sibling traversal-skeleton duplication across this file's walkers is D4 territory (PTQ-0288 already filed) and is not re-filed here. Range 8388-8578 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan reports 191 LOC / justify band, no exemption; arm boundaries at 8395/8490/8536/8550/8565/8572 reproduce the 95/46/14/15/14 inventory and the call arm's locals (localBinder, resolvesToRuntimeTool, resolvesToPiTool) escape to no other arm; no overlooked keep-whole reason (Expr union has 20 variants, not 21 — immaterial); target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map on a one-line manifest gives walkCallSiteExpr 8388-8578 / 191 LOC / band justify (FN_BANDS justify=100, strong=200), `exemptions --lens D9` lists no theta-document host; excerpt 8409-8415 byte-exact; arm boundaries 8395-8489 (call, 95), 8490-8535 (46), 8536-8549 (14), 8550-8564 (15), 8565-8578 (14) reproduce the inventory; the call arm's four locals (localBinder, resolvesToRuntimeTool, resolvesToPiTool, first) are read by no other arm and the arm consumes only the function's four parameters, so the ≥ 6-shared-locals reason does not apply; the Expr switch is a closed-union dispatch but not a spec-table mirror and its RFC 0011 emission-ordering comments are intra-arm invariants an extraction preserves; no prior split/revert in git history; not a duplicate (d9-01 is the file-level breakdown, PTQ-0288 is D4 walker-skeleton duplication); Expr has 20 variants not 21 — immaterial; target shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified at the function's post-drift location: commit bb21dacc (qw20260920223212 src/parser__p2) shifted the file so walkCallSiteExpr now sits at 8112-8302, but size-scan map on a one-line manifest still gives 191 LOC / band justify (FN_BANDS justify=100, strong=200) with 0/0 importers and `exemptions --lens D9` names no theta-document host; the 8409-8415 excerpt is byte-exact at 8133-8139; arm boundaries 8119-8213 (call, 95), 8214-8259 (46), 8260-8273 (14), 8274-8288 (15), 8289-8302 (14) plus the 7-line header sum to 191 and reproduce the inventory; the call arm's four locals (localBinder, resolvesToRuntimeTool, resolvesToPiTool, first) are read by no other arm and the arm consumes only the function's four parameters, so the ≥ 6-shared-locals reason does not apply; the switch dispatches the closed Expr union (20 variants at 474, not 21 — immaterial) but mirrors no spec table, and the RFC 0011 shadow-before-isolated-body ordering is intra-arm; `git log -S walkCallSiteExpr` shows only its bug-0016 introduction and the bug-0224 par-for descent — no split/revert; not a duplicate: PTQ-0288/0373/0374 are fixed D4 clones over other ranges (walker skeleton, invoke-static-checks guards/loops) and none tracks the call arm's judgement body; the split shape is a design decision for a human ruling (triage: claude-fable-5-1)
