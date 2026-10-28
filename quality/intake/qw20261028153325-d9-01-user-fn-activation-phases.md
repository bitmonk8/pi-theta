---
id: pending
title: evalUserFnCall combines argument binding, activation-depth preparation, panic framing, and flow projection in one body.
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:286-384
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts#evalUserFnCall
d9_band: zone
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# evalUserFnCall combines argument binding, activation-depth preparation, panic framing, and flow projection in one body.

## Observation
The authoritative map measures `evalUserFnCall` at 99 LOC, zone band, at lines 286–384. The module header describes a tree-walking statement executor that delegates par-for, subagent calls, operators, and result/match disposition to siblings. This private function retains the ordinary-function activation path: caller-side argument evaluation, declaring-module depth preparation, body execution with panic framing, and caller-visible flow projection. The zone band has no presumption of breakdown; the evidence here is the separate state and phase inventory, not the size alone.

## Evidence
Step inventory for `src/runtime/statement-executor.ts:286-384`. LOC below are inclusive source spans within the map's 99-LOC declaration, including signature and rationale comments, not a second code-only measurement.

| concern / phase | members / operations | line ranges | LOC | locals read / written and seam cost |
|---|---|---|---|---|
| call inputs | function signature | 286-293 | 8 | inputs `fn`, `expr`, `env`, `deps`, `atTerminal`, `moduleEnv` |
| argument bindings | arity check, `childFnActivation`, argument evaluation, `defineLocal` | 294-315 | 22 | reads `fn`, `expr`, `env`, `deps`, `moduleEnv`; creates `scope`; `i` and `arg` stay within the loop; produces either `scope` or an early `EvalResult` |
| activation context | return disposition, `thetalibFnFrameKind`, `pushCountableFrame`, depth-breach panic site | 316-348 | 33 | reads `fn.returnType`, `atTerminal`, `moduleEnv`, `env`, `deps`, `expr.range`; creates `bodyAtTerminal`, writes `bodyDeps`; `kind` and `thrown` are phase-private; does not read `scope` or argument-loop locals |
| body execution and panic frames | `executeBlock`, `pushPanicFrame` | 349-365 | 17 | reads `fn`, `scope`, `bodyDeps`, `bodyAtTerminal`, `env`, `deps`, `expr`; writes `flow`; catch-local `thrown`; this phase can remain the orchestrator |
| call-result projection | `switch (flow.flow)`, `discardForVoid`, `makeErr` | 366-383 | 18 | reads only `flow` and `fn.returnType`; no access to `scope`, `bodyDeps`, `bodyAtTerminal`, `moduleEnv`, `env`, or `deps` |
| function boundary | closing brace | 384-384 | 1 | none |

Argument binding excerpt, `src/runtime/statement-executor.ts:308-315`:

```ts
  const scope = (moduleEnv ?? env).childFnActivation();
  for (let i = 0; i < fn.params.length; i += 1) {
    const arg = await evalExpr(expr.args[i] as Expr, env, deps);
    if (arg.flow !== "value") {
      return arg;
    }
    scope.defineLocal((fn.params[i] as FnDecl["params"][number]).name, arg.value, false);
  }
```

Activation-context excerpt, `src/runtime/statement-executor.ts:328-337`:

```ts
  const bodyAtTerminal = fn.returnType === "void" ? true : atTerminal;
  let bodyDeps: ExecuteBodyDeps = { ...deps, returnAtTerminal: bodyAtTerminal };
  if (moduleEnv !== undefined && deps.invokeChain !== undefined) {
    const kind = thetalibFnFrameKind({
      callerFile: env.currentResidence() ?? deps.file,
      calleeResidence: moduleEnv.currentResidence() ?? deps.file,
    });
    if (kind !== undefined) {
      try {
        bodyDeps = { ...bodyDeps, invokeChain: pushCountableFrame(deps.invokeChain, kind) };
```

Call-result excerpt, `src/runtime/statement-executor.ts:375-383`:

```ts
    case "propagate":
      // A `?` inside the body returns from THIS `fn` with `Err(e)`; the call
      // evaluates to that `Err` value so an enclosing `?`/`match` sees it.
      return { flow: "value", value: makeErr(flow.err) };
    case "fail":
      return { flow: "fail", error: flow.error, ...(flow.event !== undefined ? { event: flow.event } : {}) };
    case "cancel":
      return { flow: "cancel" };
  }
```

Importer counts quoted from the authoritative map: `evalUserFnCall` is not exported, **0 src / 0 test importers**. Its enclosing evaluator `evalExpr` has **3 src / 2 test importers**; neither hypothesis below moves that exported entry point. The call-result projection shares two inputs with its caller, whereas argument binding produces one scope and activation preparation produces two context values. No six-local bundle crosses every phase boundary.

## Why this is a problem
The zone-band requirement is met by the argument-binding, activation-context, body-panic-frame, and call-result inventories: these operate on different state subsets and implement different boundaries. Argument binding evaluates caller expressions; activation preparation stamps return disposition and a countable cross-file frame; body execution attaches unwind frames; the final projection converts the completed body's control-flow signal to the call's value.

Reasons considered:
- **Closed-enumeration dispatch:** only the final 18-LOC phase enumerates `EvalResult.flow`. That switch does not account for argument evaluation, residence-based depth classification, or panic framing before it. `functions.md` FN-1/FN-4/FN-5 and `invocation.md` INV-4 specify those obligations, not one closed enumeration whose arm count accounts for the whole function.
- **Single algorithm with shared local state:** the body-execution phase reads several handles, but the projection reads only `flow` and `fn.returnType`. Argument-loop locals never reach the depth or projection phases. Splitting the projection therefore does not require threading six locals through every helper or inventing a shared state object.
- **Data-only module or type family:** this host executes expressions, modifies an environment, awaits a body, and catches/rethrows panics; its length is not a data/type table.
- **One grammar production family:** the host evaluates an already parsed call; it does not recognize a grammar production.
- **Generated code:** the header identifies a hand-authored V19c executor and the body contains bug-specific runtime rationale, not a generator marker.

The ordering requirement is retained in the evidence: arguments run before the activation context is installed, and the countable frame is prepared before the body starts. The projection consumes an already completed `flow`; its seam does not reorder those operations.

## Suggested direction (non-binding, optional)
Unproven hypotheses, for human ratification: **Seam A:** call-result projection (366–383) -> `mapUserFnFlow` in-file helper (hypothesis) — 18 LOC, 0 exported symbols moved, 0/0 external importers, 0 cross-references back into host declarations (it uses imported `discardForVoid` and `makeErr`). **Seam B:** arity and argument binding (294–315) -> `bindUserFnArguments` in-file helper (hypothesis) — 22 LOC, 0 exported symbols moved, 0/0 external importers, 2 host-declaration back-references: `ThetaFnArityError` and `evalExpr`.

## False-positive check
**Band:** zone, 99 LOC from the supplied map; no justify-band presumption is claimed. **Reasons considered:** the five reason classes and their defeating evidence are recorded above. **Exemptions:** `quality/exemptions.json` was read and contains no key for this function. **Generated-code check:** no generator marker in the reviewed host/header. **Spec-mirror check:** the flow switch is a closed projection, but only 18 LOC of the declaration; FN-1/FN-4/FN-5 and INV-4 do not make the preceding phases enumeration arms. **Reference check:** `grep -R -n 'evalUserFnCall' src/runtime tests extensions tools --include='*.ts'` shows the declaration and the direct evaluator call, with other hits being comments; the private declaration is not a re-export or dynamically selected member. The map, not that textual search, supplies importer counts. **Duplicate check:** no existing finding with `d9_host: src/runtime/statement-executor.ts#evalUserFnCall` was found in intake/issues/resolved; PTQ-1154 and PTQ-1433 concern the enclosing file's extracted families, and PTQ-1163 concerns `#evalExpr`, not this ordinary-function activation body. No duplication, defect, or test finding is included here. All cited production ranges were re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 286–384, 99 LOC, zone band, private 0/0 importers (evalExpr 3/2); all excerpts and the 22/33/17/18-LOC phase spans match. Binding, activation preparation, panic-framed execution and projection have distinct state subsets; projection reads only flow and fn.returnType, not a six-local bundle. No exemption or overlooked keep-whole reason: FN-1/FN-4/FN-5 and INV-4 constrain semantics and ordering, not this function boundary. The reference search reproduces. PTQ-1531 tracks moving the whole call family, not its internal breakdown; PTQ-1154/1433/1163 likewise have different inventories. Target shape needs a human ruling (triage: claude-opus-5-5)
