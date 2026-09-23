// Subagent-fn call boundary: isolated execution and caller-visible outcome mapping.

import type { CallExpr, Expr, FnDecl } from "../parser/theta-document";
import type { LexicalEnvironment } from "./lexical-environment";
import type { InvokeCalleeError, InvokeInfraError, QueryError } from "./query-error";
import { HostFatal, isThetaPanic } from "./runtime-panics";
import { pushCountableFrame } from "./invoke-depth-cycle";
import { makeErr, type ThetaValue } from "./value";
import { evalExpr, executeBlock, panicSiteFile, ThetaFnArityError, type ExecuteBodyDeps, type EvalResult, type SubagentFnChildOutcome } from "./statement-executor";

/**
 * Build the caller-visible `InvokeCalleeError` for a `subagent fn` callee that
 * returned / `?`-propagated its own `Err` (RFC 0001 FN-6; invocation.md
 * §Failures). The subagent boundary crosses exactly as an `invoke` of a
 * subagent-mode callee: the callee's raw `QueryError` rides as `inner` under a
 * single `invoke_callee` wrapper. The inline callee is named by the FUNCTION,
 * not a `.theta` path.
 */
function subagentCalleeError(inner: ThetaValue, fnName: string): InvokeCalleeError {
  return {
    kind: "invoke_callee",
    message: `subagent fn ${fnName} callee returned Err`,
    callee_path: fnName,
    inner: inner as unknown as QueryError,
  };
}

/**
 * Build the caller-visible `InvokeInfraError` for a panic inside a `subagent fn`
 * body (RFC 0001 FN-6; invocation.md §Failures / ERR-20 boundary). A genuine
 * `ThetaPanic` (one of the closed panic sources) downgrades with `cause:"panic"`;
 * any other unexpected interpreter throw is a runtime defect with
 * `cause:"internal_error"`. An uncatchable `HostFatal` never reaches this builder
 * — it is rethrown at the boundary.
 */
function subagentInfraError(thrown: unknown, fnName: string): InvokeInfraError {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return {
    kind: "invoke_infra",
    message,
    callee_path: fnName,
    cause: isThetaPanic(thrown) ? "panic" : "internal_error",
  };
}

/**
 * Execute a `subagent fn` call `<name>(args)` across a fresh isolated subagent
 * boundary (RFC 0001 FN-6…FN-9). Unlike a plain `fn` (which runs inline in the
 * caller's conversation, `evalUserFnCall`), each call:
 *   - evaluates its positional arguments in the caller's scope and binds them
 *     BY VALUE into a fresh isolated scope that shares the file's top-level
 *     declarations but captures none of the caller's locals (no closure);
 *   - enters a fresh isolated subagent session for the body via the host
 *     (`spawnSubagentSession`, config inherit-then-`with`-override per FN-7), so
 *     the body's `@` queries target the spawned session and the caller's
 *     conversation stays unpolluted, restoring it on return (`exitSubagentSession`);
 *   - maps the body outcome across the boundary exactly as an `invoke` of a
 *     subagent-mode callee: success → the final value; a callee Err →
 *     `Err(InvokeCalleeError)`; a body panic → `Err(InvokeInfraError{cause})`
 *     without crashing the caller (a `HostFatal` is rethrown, NOCEIL-3).
 */
export async function evalSubagentFnCall(
  fn: FnDecl,
  expr: CallExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  moduleEnv?: LexicalEnvironment,
): Promise<EvalResult> {
  const bound = await bindSubagentFnArguments(fn, expr, env, deps, moduleEnv);
  if (!("scope" in bound)) {
    return bound;
  }
  const { scope, argValues } = bound;

  // RFC 0012 §10 — production: the body runs in a spawned child process; this
  // process never executes it. The host pushes the countable `subagent-fn`
  // frame (INV-4) and marshals the depth to the child; a ceiling breach on that
  // push throws out of the hook and is downgraded here, at the same boundary,
  // to the caller's `Err(InvokeInfraError{cause:"panic"})`.
  if (deps.host.runSubagentFnChild !== undefined) {
    return runSubagentFnViaChild(fn, argValues, expr, env, deps);
  }
  return runSubagentFnInProcess(fn, scope, deps);
}

/** Check arity and bind caller-evaluated arguments into the isolated scope. */
async function bindSubagentFnArguments(
  fn: FnDecl,
  expr: CallExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  moduleEnv?: LexicalEnvironment,
): Promise<{ readonly scope: LexicalEnvironment; readonly argValues: ThetaValue[] } | EvalResult> {
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  // Isolate against the DECLARING module's environment for an imported
  // `subagent fn` (bug 0303, fix design point 10) so the body's free names
  // resolve against the lib that declared it; a same-file `subagent fn` passes
  // no `moduleEnv` and isolates against the caller's root unchanged.
  const scope = (moduleEnv ?? env).spawnIsolatedScope();
  const argValues: ThetaValue[] = [];
  for (let i = 0; i < fn.params.length; i += 1) {
    const arg = await evalExpr(expr.args[i] as Expr, env, deps);
    if (arg.flow !== "value") {
      return arg;
    }
    argValues.push(arg.value);
    scope.defineLocal((fn.params[i] as FnDecl["params"][number]).name, arg.value, false);
  }
  return { scope, argValues };
}

/** Run the production child-process regime with the FN-6 boundary downgrade. */
async function runSubagentFnViaChild(
  fn: FnDecl,
  argValues: ThetaValue[],
  expr: CallExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<EvalResult> {
  let outcome: SubagentFnChildOutcome;
  try {
    outcome = await deps.host.runSubagentFnChild!(
      {
        fn,
        args: argValues,
        call: expr,
        env,
        site: { file: panicSiteFile(env, deps), line: expr.range.start.line, column: expr.range.start.column },
      },
      deps.invokeChain,
    );
  } catch (thrown) { // allow-broad-catch: FN-6 subagent boundary — invocation.md §Failures
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    return {
      flow: "value",
      value: makeErr(subagentInfraError(thrown, fn.name) as unknown as ThetaValue),
    };
  }
  return mapSubagentFnChildOutcome(outcome, fn.name, deps.signal);
}

/** Run the isolated in-process session, restoring it before mapping its flow. */
async function runSubagentFnInProcess(
  fn: FnDecl,
  scope: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<EvalResult> {
  // Enter the fresh isolated session and run the body inside the SAME try, so a
  // depth-ceiling breach on the spawn (the production seam pushes the countable
  // `subagent-fn` frame here, INV-4 / FN-6) is downgraded at the boundary to the
  // caller's `Err(InvokeInfraError{cause:"panic"})` — the runtime backstop, the
  // same nested surfacing an `invoke` overflow takes — rather than crashing the
  // caller. `entered` guards `exitSubagentSession` so a spawn that threw before
  // pushing a session is not popped.
  let entered = false;
  let flow: EvalResult;
  try {
    await deps.host.spawnSubagentSession?.(fn.sessionConfig ?? {}, deps.invokeChain);
    entered = true;
    // INV-4 / FN-6: the `subagent-fn` frame is a countable frame on the active
    // chain, so the executor advances its OWN live chain by that frame before
    // running the body. This parallels the producer's spawned-session
    // `childChain` (which pushes the same frame on the bind lane) at the SAME
    // depth, so a query / invoke / nested `subagent fn` reached from inside the
    // body threads its override at the active depth and the spawned session's
    // `overrideChain ?? childChain` reads the override — counting the
    // subagent-fn frame exactly once (the producer's `childChain` is then only
    // the fallback / cap-breach / nested-spawn seed). Kept inside the boundary
    // `try` so a cap breach on this push still downgrades to
    // `Err(InvokeInfraError{cause:"panic"})`.
    const bodyDeps: ExecuteBodyDeps =
      deps.invokeChain !== undefined
        ? { ...deps, invokeChain: pushCountableFrame(deps.invokeChain, "subagent-fn") }
        : deps;
    flow = await executeBlock(fn.body, scope, bodyDeps);
  } catch (thrown) { // allow-broad-catch: FN-6 subagent boundary — invocation.md §Failures
    // An uncatchable host fatal (NOCEIL-3) must terminate the process and is
    // rethrown unwrapped — never downgraded to an Err at the subagent boundary.
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    // A panic (incl. a depth-ceiling breach) inside the spawned session is
    // downgraded to the caller's Err(InvokeInfraError) so it never crashes the
    // caller (FN-6).
    if (entered) {
      await deps.host.exitSubagentSession?.();
    }
    return {
      flow: "value",
      value: makeErr(subagentInfraError(thrown, fn.name) as unknown as ThetaValue),
    };
  }
  await deps.host.exitSubagentSession?.();
  return mapSubagentFnFlow(flow, fn);
}

/** Map a completed in-process body flow across the subagent-fn boundary. */
function mapSubagentFnFlow(flow: EvalResult, fn: FnDecl): EvalResult {
  switch (flow.flow) {
    case "return":
    case "value":
      // Success — the callee's final value (FN-5) crosses the boundary.
      return { flow: "value", value: flow.value };
    case "break":
    case "continue":
      // Barred inside a `fn` body; defensively a `null` final value.
      return { flow: "value", value: null };
    case "propagate":
    case "fail": {
      // A callee-returned / `?`-propagated Err crosses wrapped as
      // InvokeCalleeError{inner:<raw Err>}, exactly like an invoked subagent
      // callee (invocation.md §Failures).
      const raw = flow.flow === "propagate" ? flow.err : flow.error;
      return {
        flow: "value",
        value: makeErr(subagentCalleeError(raw, fn.name) as unknown as ThetaValue),
      };
    }
    case "cancel":
      return { flow: "cancel" };
    default: {
      // Exhaustiveness tether (paired with `mapSubagentFnChildOutcome`'s
      // outcome switch): a new `EvalResult` flow kind is a compile error here
      // until this boundary projection maps it, so the two execution regimes'
      // observables cannot drift apart silently (FN-6; GOV-15).
      const exhaustive: never = flow;
      return exhaustive;
    }
  }
}

/**
 * RFC 0012 §10 — project the child's envelope outcome onto the value the
 * in-process drive returned for the same body, so a `subagent fn` call's
 * observable is unchanged by where the body ran (FN-6; GOV-15):
 *
 *   - a bare tail `x` → `x`; an `Ok(x)` tail (`fn_tail: "ok"`) → `Ok(x)`; an
 *     `Err(e)` tail (`fn_tail: "err"`) → the bare `Err(e)` — exactly the three
 *     values `executeBlock`'s `normal` / `return` flow yielded;
 *   - a `?`-propagated / effect-failure `Err` the body itself surfaced
 *     (`callee-returned`, no tail marker) → `Err(InvokeCalleeError{inner})`, the
 *     `propagate` / `fail` arm's wrap;
 *   - a boundary-minted `Err` (the child's internal-error / validation /
 *     return-validation arms, a spawn or envelope failure) → bare, as the
 *     in-process panic arm was (`invoke_infra`, never wrapped);
 *   - a cancellation the CALLER's own signal explains → the `cancel` flow (the
 *     in-process `cancel` arm); a child-internal cancel wraps like any other
 *     callee-returned failure (bug 0295's two-arm rule).
 */
function mapSubagentFnChildOutcome(
  outcome: SubagentFnChildOutcome,
  fnName: string,
  signal: AbortSignal,
): EvalResult {
  switch (outcome.kind) {
    case "cancelled":
      return { flow: "cancel" };
    case "value":
      break;
    default: {
      // Exhaustiveness tether (paired with `mapSubagentFnFlow`'s flow
      // switch): a new `SubagentFnChildOutcome` kind is a compile error here
      // until this boundary projection maps it, so the two execution regimes'
      // observables cannot drift apart silently (FN-6; GOV-15).
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
  const { result } = outcome;
  if (result.ok) {
    return { flow: "value", value: outcome.fnTail === "ok" ? result : result.value };
  }
  if (outcome.fnTail === "err") {
    return { flow: "value", value: result };
  }
  const innerKind = (result.error as { readonly kind?: unknown } | null)?.kind;
  if (innerKind === "cancelled" && signal.aborted) {
    return { flow: "cancel" };
  }
  if (outcome.source === "boundary-minted") {
    return { flow: "value", value: result };
  }
  return {
    flow: "value",
    value: makeErr(subagentCalleeError(result.error, fnName) as unknown as ThetaValue),
  };
}
