---
id: pending
title: statement-executor.ts bundles six declaration clusters (seam types, call dispatch, defect-error family, expression evaluation, par-for engine, statement drivers) in one 2681-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:1-2681
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# statement-executor.ts bundles six declaration clusters (seam types, call dispatch, defect-error family, expression evaluation, par-for engine, statement drivers) in one 2681-LOC module

## Observation
src/runtime/statement-executor.ts is 2681 LOC — strong band (>= 2000). Its
header names the module's role: "the theta tree-walking statement executor …
`executeBody(body, deps)` walks the parsed `ThetaBody` statement AST" (lines
1-12). The structural map shows 54 declarations grouped into six line-contiguous
clusters; only `executeBody` (2650-2681) and the seam types are exported, and
the map records 2 src / 95 test importers on `executeBody`.

## Evidence
Distinct-concern inventory (line ranges and LOC from the authoritative
structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| executor seam types & flow lattice | panicSiteFile, CheckpointDescriptor, StatementEvalHost, SubagentFnChildRequest, SubagentFnChildOutcome, ExecuteBodyDeps, BodyExecution, Flow, EvalResult, terminalFlow | 101-399 | ~211 |
| call dispatch (Pi-tool arg pre-eval, user fn, subagent fn) | preEvaluateToolArgs, ThetaFnArityError, resolveUserFn, evalUserFnCall, subagentCalleeError, subagentInfraError, evalSubagentFnCall, mapSubagentFnChildOutcome | 426-859 | ~346 |
| runtime defect-error class family | requireBoolean, CompoundNonNumericError, BinaryNonNumericError, UnaryNonNumericError, BinaryMixedOperandError, ForIterandKindDefectError, BooleanPositionKindDefectError, ParForUnwrittenSlotError, IndexKindDefectError, RejectedWriteDefectError, UnknownVariantDefectError | 870-1127 | ~84 |
| expression evaluation | applyCompound, evalExpr, evalBinary, applyBinaryScalar, applyStdlibMethod, evalAsResult, asResultValue, evalTry, evalMatch, toRuntimePattern | 1141-1926 | ~596 |
| par-for fan-out engine (RFC 0003) | PAR_FOR_THROTTLE, PAR_MAX_NON_INTEGER_MESSAGE, ParForIterationOutcome, parForPanicError, runParForIteration, evalParFor | 1938-2342 | ~360 |
| statement/block/loop drivers | executeStatement, executeBlock, executeIf, loopIterSite, loopIterCheckpoint, executeWhile, executeFor, executeBody | 2353-2681 | ~268 |

Header excerpt (src/runtime/statement-executor.ts:1-4):

```
// V19c / V19c-T — the theta tree-walking statement executor.
//
// This module owns the runtime seam the paired `V19c` implementation leaf fills
// in: `executeBody(body, deps)` walks `V19a`'s parsed `ThetaBody` statement AST
```

Cross-references between clusters are call edges only: `evalParFor` /
`runParForIteration` reach back through `evalExpr` (2148, statement-executor.ts)
and `executeBlock` (2052); the defect-error classes are constructed at single
sites inside the expression cluster.

## Why this is a problem
Strong band carries a presumption of breakdown. Reasons considered and
defeated: closed-enumeration dispatch — the file is six clusters, not one
dispatch (only `executeStatement` and `evalExpr` are dispatches, and they are
separately dispositioned); single algorithm with shared local state — the
clusters communicate through the already-threaded `(env, deps)` pair and two
function call edges (`evalExpr`, `executeBlock`), not through 6+ shared locals
(extracting the par-for engine threads exactly those two handles); data-only
module — declarations are ~84 LOC of 2681 (3%), far under 80%; grammar
production family — the file spans statements, expressions, calls, and the
RFC 0003 concurrency engine, four spec areas (control-flow.md, functions.md,
error-model.md, RFC 0003), not one production; generated code — hand-written.
Strong reasons: no spec-cited single critical section spans the file (the
header's cka-50 sequentiality claim is per-invocation turn order, preserved
across module boundaries); no measured cost; no reverted split in git log; no
entry in quality/exemptions.json.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: par-for fan-out engine -> `par-for-executor.ts`
(hypothesis) — ~360 LOC, 0 exported symbols move (all private), 0 external
importers, cross-references back into the host: `evalExpr`, `executeBlock`
(passable as handles). Seam B: defect-error class family -> `executor-defects.ts`
(hypothesis) — ~84 LOC, 7 exported classes move (importer counts per map: 0-1
src each), no back-references. Seam C: subagent-fn call boundary
(evalSubagentFnCall, mapSubagentFnChildOutcome, subagentCalleeError,
subagentInfraError) -> `subagent-fn-call.ts` (hypothesis) — ~170 LOC, 0
exported symbols move, back-references: `evalExpr`, `executeBlock`,
`panicSiteFile`.

## False-positive check
Band check: 2681 LOC >= 2000 (strong) per the map. Reasons-considered list
above with defeating evidence per reason. Exemptions check:
quality/exemptions.json has no key for src/runtime/statement-executor.ts.
Generated-code check: hand-authored header, bug-numbered rationale comments
throughout, no generator citation. Spec-mirror check: the file cites four
distinct spec areas (control-flow.md, functions.md, error-model.md,
cancellation.md) plus two RFCs — no single spec enumeration accounts for the
length. Prior-filing check: PTQ-0701/PTQ-0779 and the d4 wave findings against
this file are test-harness/duplication topics, not a file-level breakdown.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 2681 LOC / strong band and all 54 declarations at the cited lines; six inventory rows are real distinct clusters (no module-level shared state, only `(env, deps)` threading plus `evalExpr`/`executeBlock` call edges at 2151/2052); no exemptions.json key, no reverted split in git log, cka-50 is a per-invocation sequencing invariant not a same-module requirement; sibling intake d9-02/03/05/06 filings key on `#function` hosts, not this file — minor narrative slip only (defect classes are also constructed in the par-for and driver clusters at 2161/2337/2416/2601, not solely the expression cluster); target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map re-run gives src/runtime/statement-executor.ts 2681 LOC / band strong (FILE_BANDS strong=2000) with all 54 declarations at the cited ranges; no key in quality/exemptions.json; the six inventory rows are real distinct clusters — module level holds no mutable state (only the two par-for consts at 1938/1943), clusters communicate via the threaded `(env, deps)` pair and call edges (`executeBlock` 2052, `evalExpr` 2151/2172) not shared locals; data/type LOC is ~271 (~10 %, the filing understates it as 84/3 % by counting classes only) still far under 80 %; header cites four spec areas + cka-50 whose sequentiality is per-invocation turn order, not a same-module pin; `git log --follow` shows no reverted split and no par-for-executor/executor-defects/subagent-fn-call file ever existed; minor narrative slip: defect classes are constructed outside the expression cluster too (872, 2161, 2337, 2416, 2601); same-wave siblings d9-02/03/05/06/09 key on `#function` hosts or misplacement, PTQ-0701/0779 are D7 harness topics — not a duplicate; D9 breakdown caps at questionable, target shape (Seam A/B/C or keep-whole) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces 2681 LOC / band strong (FILE_BANDS strong=2000) and all 54 declarations at the cited ranges; quality/exemptions.json (4 rows) has no key for src/runtime/statement-executor.ts; the six rows are real distinct clusters — no module-level `let`/`var`, only two par-for consts (1938/1943), clusters linked solely by `(env, deps)` threading and call edges (executeStatement→evalExpr 2358-2436, evalExpr→resolveUserFn/evalSubagentFnCall/preEvaluateToolArgs 1250/1258/1437, evalParFor→executeBlock 2052 / evalExpr 2151/2172), so no ≥ 6-shared-locals single algorithm and no single dispatch; header cites four spec areas plus cka-50 whose sequentiality is per-invocation await order, not a same-module pin; git log --follow (50 commits) shows no reverted split and par-for-executor/executor-defects/subagent-fn-call never existed; only slip is narrative (defect classes also constructed at 872/2161/2337/2416/2601 outside the expression cluster), which does not touch the inventory; dedupe: quality/issues has no entry citing this file, PTQ-0701/0779 are resolved D7 filings on tests/statement-executor.test.ts, same-wave d9-02/03/05/06 key on `#evalExpr`/`#evalParFor`/`#evalSubagentFnCall`/`#runParForIteration` — different root cause; D9 breakdown never confirms, target shape needs a human ruling (triage: claude-fable-5-1)
