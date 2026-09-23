---
id: pending
title: evalCheckpointedEffect, the executor's checkpointed-effect dispatch, sits in executor-result-flow.ts, whose header does not name it, while its two pre-dispatch helpers and the executor's other checkpoint site stay in statement-executor.ts
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/executor-result-flow.ts:140-234
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260923185337
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# evalCheckpointedEffect, the executor's checkpointed-effect dispatch, sits in executor-result-flow.ts, whose header does not name it, while its two pre-dispatch helpers and the executor's other checkpoint site stay in statement-executor.ts

## Observation
`evalCheckpointedEffect` (src/runtime/executor-result-flow.ts:140-234, 95 LOC per the structural map; the host is 337 LOC, band exempt, so placement review only) is the executor's single path for putting a checkpointed effect (query / tool-call / invoke) onto `runCancellableSequence`. It pre-evaluates tool arguments, publishes the trace, runs the one-statement sequence, and handles the outcome. Commit 8fd179a2 (the PTQ-1457 dedupe fix) moved it here from statement-executor.ts, where it was a non-exported function. The host's header lists its members as "the `Result`-consumption forms", naming `evalAsResult` / `asResultValue` / `evalTry` / `evalMatch` / `toRuntimePattern`, and leaves `evalCheckpointedEffect` out. Its caller outside this file is `evalExpr`'s fall-through tail (statement-executor.ts:585). Both of its pre-dispatch helpers are still exported from statement-executor.ts.

## Evidence
Host role (src/runtime/executor-result-flow.ts:1-7):
```ts
// V19c / V19c-T — the statement executor's result/match disposition family.
//
// This module carries the `Result`-consumption forms the executor evaluates
// itself (never the pure host): the `?`-operand / `match`-scrutinee
// normalisation (`evalAsResult` / `asResultValue`), the `?` propagation
// (`evalTry`, ERR-18), and the `match` arm selection and arm-body drive
// (`evalMatch` / `toRuntimePattern`). Mutually recursive with the expression
```

Affinity, counted both ways (members declared in a src/ module, excluding the shared `EvalResult`/`ExecuteBodyDeps` types and `value.ts` primitives):
- Touches **2 members of statement-executor.ts**: `preEvaluateToolArgs` (called at executor-result-flow.ts:164) and `traceEffectDispatch` (called at :174).
- Touches **1 member of its own host**: `asResultValue` (:196, :205).
- Callers: 1 own (`evalAsResult`, :131) and 1 foreign (`evalExpr`, statement-executor.ts:585, imported at statement-executor.ts:48).

Import exclusivity. `grep -nw` over executor-result-flow.ts shows that 7 imported names are used only inside 140-234 and by no other declaration in the file: `runCancellableSequence` (18→177), `CancellableStatement` (17→168), `CancellableSequenceOutcome` (18→175), `handlePartialTerminalOutcome` (27→212,214), `preEvaluateToolArgs` (39→164), `traceEffectDispatch` (41→174), `makeErr` (30→227). The file's whole `./cancellation-core` and `./terminal-outcomes` imports are there only for this one function.

Dispatch core (src/runtime/executor-result-flow.ts:164-176):
```ts
  const preArgs = await preEvaluateToolArgs(expr, env, deps);
  if (!preArgs.ok) {
    return preArgs.flow;
  }
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(expr, env, preArgs.args, deps.invokeChain),
  };
  const settleTrace = traceEffectDispatch(env, deps, checkpoint.kind, checkpoint.site);
  let outcome: CancellableSequenceOutcome;
  try {
    outcome = await runCancellableSequence(
```

Sibling pattern. The executor's other checkpoint site is the `loop-iter` pair `loopIterSite` / `loopIterCheckpoint` (statement-executor.ts:869-889). Its cancel path "mirror[s] the checkpointed-effect cancel path" (statement-executor.ts:880) and calls the same `handlePartialTerminalOutcome`. That pair stays in statement-executor.ts together with `traceEffectDispatch` (129-139) and `preEvaluateToolArgs` (166-230). statement-executor.ts's header still claims this function's job (statement-executor.ts:9-11):
```ts
// `V3c`), `break`/`continue`, `return`, and expression-statements — segmenting
// each checkpointed effect sub-expression onto `V17a`'s `runCancellableSequence`
// (`CancellableStatement` / `CancellableSequenceDeps`) so the five fixed
```
statement-executor.ts no longer imports `./cancellation-core` at all (import block 35-94).

Importer counts (structural map, quoted): `evalCheckpointedEffect` 1 src / 0 tests; `preEvaluateToolArgs` 1/0; `traceEffectDispatch` 1/0. In each case the single src importer is the other module of this pair, so the effect-dispatch path crosses the module boundary twice: out to `evalCheckpointedEffect`, then back to `preEvaluateToolArgs` / `traceEffectDispatch`.

## Why this is a problem
Counted affinity: the function uses 2 statement-executor.ts members and 1 member of its own host. 7 of its host's imported names serve it alone. Its host's header describes a different role (the `Result`-consumption forms). The module whose header does claim the checkpointed-effect segmentation (statement-executor.ts:9-11) keeps the function's pre-dispatch helpers and the executor's other checkpoint site. The result is a split family: the cancellable-effect dispatch path (`preEvaluateToolArgs` → `traceEffectDispatch` → `runCancellableSequence` → cancel disposition) sits across two modules, and each of the three members has exactly one importer, which is the other half. Counter-consideration, recorded rather than hidden: the function's last ~50 lines dispose the outcome by consumption position (`atTerminal`), which is close to the host's result-disposition role. That is why the affinity is 2:1 and not 2:0.

## Suggested direction (non-binding, optional)
Home hypotheses, unproven, for the human to ratify. Home A: gather the cancellable-effect dispatch family into one module, `executor-effect-dispatch.ts` (hypothesis): `evalCheckpointedEffect` (95 LOC) + `preEvaluateToolArgs` (65) + `traceEffectDispatch` (11), about 171 LOC. Exported symbols moved: those three (external importers 1/0, 1/0, 1/0 per the map). Cross-references back: `evalExpr` from statement-executor.ts, and `asResultValue` from executor-result-flow.ts. This is the same regrouping the pending statement-executor breakdown candidate names as its Seam B (qw20260923145222-d9-07). If that seam is ratified, this placement is resolved with it. Home B: return the function to statement-executor.ts. Rejected as a first choice because that host is 1030 LOC in the justify band.

## False-positive check
- Affinity counts both ways: listed above with member names and line numbers, from `grep -nw` over the host. Own-host touches = 1 (`asResultValue`). Foreign statement-executor.ts touches = 2.
- Sibling-pattern citation: `loopIterSite`/`loopIterCheckpoint` (statement-executor.ts:869-889), `traceEffectDispatch` (129-139), `preEvaluateToolArgs` (166-230), all in statement-executor.ts. statement-executor.ts's header at 9-11 claims the segmentation.
- History: `git log -S "export async function evalCheckpointedEffect"` returns only 8fd179a2, which deletes `async function evalCheckpointedEffect(` from statement-executor.ts and adds the exported copy here. That was a dedupe fix (PTQ-1457, D4 clone), not a placement ruling. PTQ-1457's resolution text rules only on the clone.
- Not a barrel/facade: the host declares bodies, and its header states a role.
- Exemptions: quality/exemptions.json has no key for either file.
- Dedupe: PTQ-1457 (resolved, D4 clone) and PTQ-1433/PTQ-1154 (resolved, statement-executor breakdown) have different root causes. The pending qw20260923145222-d9-07 is a breakdown of statement-executor.ts. Its inventory (1129 LOC) predates this move and lists `evalCheckpointedEffect` as a statement-executor member, so it does not record the function's current placement in executor-result-flow.ts. The overlap in the suggested regrouping is noted above.
- Layer check: both modules are in src/runtime/, so no layer crossing is claimed.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: `size-scan map --files` gives executor-result-flow.ts 337 LOC, band exempt (placement review only), with evalCheckpointedEffect at 140-234 (95 LOC, 1/0 importers). The header at 1-7 does name evalAsResult/asResultValue/evalTry/evalMatch/toRuntimePattern and omits it. `grep -nw` confirms the function calls 2 foreign statement-executor members (preEvaluateToolArgs :164, traceEffectDispatch :174, both exported from statement-executor.ts at 166/129) and 1 own-host member (asResultValue :205). Its callers are evalAsResult :131 and evalExpr statement-executor.ts:585. The 7 imported names are used only inside 140-234, and statement-executor.ts no longer imports ./cancellation-core even though its header at 9-11 claims the segmentation. The only src importer of each helper is the other module of the pair. Commit 8fd179a2 (the PTQ-1457 dedupe) is the only commit found by the stated `git log -S`. There is no exemptions key. The d9-07 breakdown candidate ends on a false-positive that notes this move, so this is not a duplicate. Caveat for the ruling: traceEffectDispatch also serves the loop-iter sites (statement-executor.ts:908,968), so it has its own affinity to statement-executor.ts, which Home A would need to account for (triage: claude-opus-5-5)
