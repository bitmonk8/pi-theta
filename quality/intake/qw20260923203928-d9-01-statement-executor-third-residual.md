---
id: pending
title: statement-executor.ts is 1030 LOC (justify band) after the PTQ-1154/PTQ-1433/PTQ-1457 moves and still holds six declaration clusters, including a user-fn call boundary whose subagent sibling already lives in subagent-fn-call.ts and a loop driver
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:1-1030
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts
d9_band: justify
wave: qw20260923203928
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# statement-executor.ts is 1030 LOC (justify band) after the PTQ-1154/PTQ-1433/PTQ-1457 moves and still holds six declaration clusters, including a user-fn call boundary whose subagent sibling already lives in subagent-fn-call.ts and a loop driver

## Observation
The structural map gives src/runtime/statement-executor.ts 1030 LOC, band justify (FILE_BANDS justify = 1000). It has 18 declarations and 0 type declarations. The header (lines 1-5) describes the file as the tree-walking statement executor that "drives statements and expressions, delegating par-for, defects, subagent calls, the host-contract type substrate, the scalar operator family, and the result/match disposition family to sibling modules". Earlier breakdown rulings PTQ-1154 (2681 LOC) and PTQ-1433 (1831 LOC) are ratified and fixed. The PTQ-1457 dedupe (commit 8fd179a2) then moved `evalCheckpointedEffect` out. The previous residual candidate, qw20260923145222-d9-07, was rejected as false-positive only because its 1129-LOC accounting predated that move. Its triage note says "a refiling carrying the post-8fd179a2 accounting could be weighed as questionable". This filing supplies that accounting from the current map.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map; the remaining 304 lines are header, imports/re-exports at 34-94, doc comments and section banners):

| concern | members | line ranges | LOC |
|---|---|---|---|
| panic-site / trace residence helpers | panicSiteFile, traceEffectDispatch | 103-105, 129-139 | 14 |
| Pi-tool argument pre-evaluation | preEvaluateToolArgs | 166-230 | 65 |
| user-fn call boundary | ThetaFnArityError, resolveUserFn, evalUserFnCall | 240-244, 253-267, 285-375 | 111 |
| expression-kind evaluation | requireBoolean, evalExpr, resolveEnumMemberRead, evalBinary | 386-391, 414-586, 589-627, 642-689 | 266 |
| statement / block / body driver | executeStatement, executeBlock, executeIf, executeBody | 700-799, 808-843, 846-862, 999-1030 | 185 |
| loop driver and loop-iter checkpoint | loopIterSite, loopIterCheckpoint, executeWhile, executeFor | 869-871, 882-889, 901-929, 940-984 | 85 |

Coupling between rows (counted with `grep -oE` over each range):
- The user-fn call boundary (evalUserFnCall 285-375) calls these host members: `evalExpr` ×1, `executeBlock` ×1, `panicSiteFile` ×2, `ThetaFnArityError` ×1. Its other calls go to foreign modules: `thetalibFnFrameKind`, `pushCountableFrame` (invoke-depth-cycle.ts), `isThetaPanic` ×2, `attachPanicSite`, `pushPanicFrame` (runtime-panics.ts), `makeErr` (value.ts).
- Its sibling-in-kind, the subagent-fn call boundary, already lives in its own module and imports the same host members (src/runtime/subagent-fn-call.ts:1, :9):
```ts
// Subagent-fn call boundary: isolated execution and caller-visible outcome mapping.
import { evalExpr, executeBlock, panicSiteFile, ThetaFnArityError, type ExecuteBodyDeps, type EvalResult, type SubagentFnChildOutcome } from "./statement-executor";
```
- `evalExpr`'s call arm picks between the two siblings (src/runtime/statement-executor.ts:455-466):
```ts
  if (expr.kind === "call") {
    const resolved = resolveUserFn(expr.callee, env);
    if (resolved !== undefined) {
      // RFC 0001 (`subagent fn`): a call to a `subagent`-modified `fn` spawns a
      // fresh isolated subagent session for the body and crosses the invoke
      // boundary; an ordinary `fn` runs inline in the caller's conversation.
      // `resolved.moduleEnv` threads the DECLARING module's environment (bug
      // 0303) into either path so the body's free names resolve there.
      return resolved.fn.subagent === true
        ? evalSubagentFnCall(resolved.fn, expr, env, deps, resolved.moduleEnv)
        : evalUserFnCall(resolved.fn, expr, env, deps, resolved.moduleEnv);
    }
  }
```
- The loop driver (866-984) calls `evalExpr` ×2, `executeBlock` ×2, `requireBoolean` ×1 and `traceEffectDispatch` ×2 in the host, and `evaluateForLoop` (control-flow.ts) and `handlePartialTerminalOutcome` (terminal-outcomes.ts) outside it. Its only callers are the two `executeStatement` arms at 771 and 773. par-for-executor.ts:12 already crosses the same boundary for the concurrent loop form (`import { evalExpr, executeBlock, panicSiteFile, … } from "./statement-executor"`).
- Module-level state: `grep -nE "^(let|var|const) "` returns 0 hits. The rows communicate only through the `(env, deps)` parameters and the call edges above.

Importer counts (structural map, quoted): executeBody 3/93, executeBlock 2/0, evalExpr 3/0, panicSiteFile 3/0, ThetaFnArityError 2/0, resolveUserFn 1/0, traceEffectDispatch 1/0, preEvaluateToolArgs 1/0. All other declarations are 0/0 and not exported.

## Why this is a problem
The justify band presumes breakdown unless a concrete reason to keep the file whole is found. Each reason was checked:
- Closed-enumeration dispatch: `evalExpr` switches over the 20-member `Expr` union (src/parser/theta-ast.ts:339) and `executeStatement` over the 18-member `Stmt` union (:829). That accounts for those two functions' length (273 LOC together), not the file's. Four of the six rows are not arms of either dispatch.
- Single algorithm with shared local state: there is no module-level state (0 hits), and no local is shared across rows. The only coupling is parameter threading plus call edges, which the three existing sibling modules already cross (subagent-fn-call.ts:9, par-for-executor.ts:12, and executor-result-flow.ts, which imports `preEvaluateToolArgs`/`resolveUserFn`/`traceEffectDispatch`).
- Data-only / type family: the file has 0 type declarations since statement-executor-types.ts took them. The only class is ThetaFnArityError (5 LOC), well under 80%.
- Grammar production family: this is an evaluator, not a parser.
- Generated code: the header is hand-authored ("V19c / V19c-T") and no generator is cited.
- Mutual recursion (`evalExpr` ↔ `executeBlock`): not a listed reason. The existing seams show it does not force the members into one module.
- Spec invariant: the header's `cka-50` strict-sequencing clause is per-invocation await order and does not require a single module. It is the same clause PTQ-1154 and PTQ-1433 were ratified against.

With no concrete reason found, the presumption stands. Counter-consideration: the pending placement candidate qw20260923185337-d9-01 (Home A) would move `preEvaluateToolArgs` and its doc (~89 lines) out. That would put the host at about 941 LOC, in the zone band. The inventory above would still have 5 rows, which meets the zone band's 2-or-more-concern test, so the finding does not depend on that ruling.

## Suggested direction (non-binding, optional)
Hypotheses only, unproven; the human ratifies one. Seam A: the user-fn call boundary (`resolveUserFn` + `evalUserFnCall`, 246-375, 106 declared LOC) -> `user-fn-call.ts` (hypothesis), the in-process sibling of subagent-fn-call.ts. It moves 1 exported symbol (`resolveUserFn`, 1/0 importers: executor-result-flow.ts). It references back into the host `evalExpr`, `executeBlock` and `panicSiteFile`, the set subagent-fn-call.ts:9 already imports, and the host imports both functions back for the call arm at 455-466. `ThetaFnArityError` is excluded here because this wave's placement candidate d9-02 re-homes it. Seam B: the loop driver (`loopIterSite`, `loopIterCheckpoint`, `executeWhile`, `executeFor`, 864-984, 85 declared LOC) -> `executor-loops.ts` (hypothesis). It moves 0 exported symbols (0 external importers). It references back `evalExpr`, `executeBlock`, `requireBoolean` and `traceEffectDispatch`, and the host calls it from 771 and 773, the same pattern as par-for-executor.ts. Seam C: none identified yet beyond the pending qw20260923185337-d9-01 regrouping of `preEvaluateToolArgs`/`traceEffectDispatch`, which is left to that candidate.

## False-positive check
- Band: the map quotes 1030 LOC, band justify, and `wc -l` gives 1030. The file is not exempt-band.
- Exemptions check: `grep -n "statement-executor" quality/exemptions.json` exits 1, so there is no key for the file or its functions.
- Generated-code check: the header is hand-authored and no generator is cited.
- Spec-mirror check: `Expr`/`Stmt` unions at theta-ast.ts:339/:829 cover only the two dispatch functions. The header's spec list (implementation-notes.md §Runtime, cancellation.md, control-flow.md, functions.md, return.md, error-model.md) pins behaviour, not a single module.
- Reasons-considered list: given above, each with the count or citation that defeated it.
- Prior split reverted: `git log --oneline -- src/runtime/statement-executor.ts` shows only forward moves (d1461328 PTQ-1154 seams, dd12c482 PTQ-1433 seams, c2ac6d12 / 8fd179a2 / 9e5580c8 later fixes). `git log -i --grep=revert` on the file finds only 64e0697a and 655e4d39, whose "revert" mentions are witness guard-reverts in bug fixes, not split reversions.
- Dedupe: PTQ-1154 and PTQ-1433 are resolved/fixed, so this is the post-fix residual, following the PTQ-1284/PTQ-1287 precedent. qw20260923145222-d9-07 was rejected only for stale accounting, and this filing re-derives every range from the current map. Pending qw20260923185337-d9-01 is a placement filing on executor-result-flow.ts#evalCheckpointedEffect with a different root cause; its overlap (`preEvaluateToolArgs`) is kept out of these seams. The pending qw20260923185337-d4-04 is a D4 parallel-evaluator filing. PTQ-1409 covers D2 dead re-exports.
- Every cited range was re-read at HEAD before filing (1-94, 103-139, 166-230, 240-375, 414-689, 700-1030; subagent-fn-call.ts:1-9; par-for-executor.ts:12).

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling. size-scan map gives 1030 LOC, band justify (≥1000), and the 18 declaration ranges match the six-row inventory (14/65/111/266/185/85 LOC). The coupling counts reproduce: evalUserFnCall calls evalExpr×1, executeBlock×1, panicSiteFile×2, ThetaFnArityError×1; the loop range calls evalExpr×2, executeBlock×2, requireBoolean×1, traceEffectDispatch×2. The rows share no module-level state (0 top-level let/var/const). The excerpts at 1-5, 455-466, subagent-fn-call.ts:9 and par-for-executor.ts:12 match, and exemptions.json has no key for the file. No overlooked reason: the closed dispatch covers only evalExpr/executeStatement, there is no generator, and no split was reverted. The prior residual qw20260923145222-d9-07 was rejected for stale accounting, so this is not a duplicate (triage: claude-opus-5-5)
