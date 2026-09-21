// RFC 0003 par-for fan-out: iteration execution, scheduling, and result collection.

import type { CallExpr, ParForExpr } from "../parser/theta-document";
import { assembleDiagnostics, type Diagnostic } from "../diagnostics/diagnostic";
import { makeCancelledError } from "./cancellation-core";
import { HostFatal, isThetaPanic, pushPanicFrame } from "./runtime-panics";
import type { QueryError } from "./query-error";
import type { LexicalEnvironment } from "./lexical-environment";
import { handlePartialTerminalOutcome } from "./terminal-outcomes";
import { makeErr, makeOk, type ThetaValue, type ResultValue } from "./value";
import { ForIterandKindDefectError, ParForUnwrittenSlotError } from "./executor-defects";
import { evalExpr, executeBlock, panicSiteFile, type ExecuteBodyDeps, type EvalResult, type Flow, type StatementEvalHost } from "./statement-executor";

/**
 * The `par for` in-flight width throttle (control-flow.md CTRL-2 /
 * hard-ceilings.md #par-for-width-throttle): at most 64 iterations in flight
 * per loop. It is a per-loop scheduling bound, NOT a routing-class ceiling
 * (NOCEIL-5): reaching it queues rather than breaches.
 */
const PAR_FOR_THROTTLE = 64;

// Shared by both `par-max-non-integer` emission sites (finite-non-integral and
// non-number/non-finite) so the registered message can't drift between them
// (bug 0438).
const PAR_MAX_NON_INTEGER_MESSAGE =
  "'par for' max operand is not a finite integer; in-flight width clamped to 1";

/** The outcome of one `par for` iteration body evaluation. */
type ParForIterationOutcome =
  | {
      readonly kind: "result";
      readonly result: ResultValue;
      readonly diagnostics: readonly Diagnostic[] | undefined;
    }
  | { readonly kind: "whole-theta-cancel" };

/**
 * Build the element `Err` for a `par for` iteration downgrade (ERR-20, which
 * extends the invoke-boundary downgrade). The `cause` discriminates exactly as
 * the invoke boundary does (`runInvokeChild`): a thrown `ThetaPanic` — every
 * class `isThetaPanic` admits, the six `theta/runtime/*` sources plus QRY-18's
 * parse-coded fallback — is a genuine panic → `cause:"panic"`; any other
 * unexpected interpreter throw is a runtime defect → `cause:"internal_error"`.
 * For the no-invoke case the enclosing `.theta` source file names the
 * `callee_path` (there is no invoked callee to name) for BOTH causes.
 */
function parForPanicError(thrown: unknown, file: string): QueryError {
  const message =
    thrown instanceof Error ? thrown.message : String(thrown);
  return {
    kind: "invoke_infra",
    cause: isThetaPanic(thrown) ? "panic" : "internal_error",
    message,
    callee_path: file,
  };
}

/** Wrap an iteration's effect host to capture diagnostics and refuse runtime tools. */
function makeParForIterationHost(
  baseHost: StatementEvalHost,
  diagnosticsSink: Diagnostic[],
): StatementEvalHost {
  // Wrap the host so each effect result's optional `childDiagnostics` transport
  // is captured for this iteration (RFC 0003 obligation (A)).
  return {
    evaluatePure: (e, en, chain) => baseHost.evaluatePure(e, en, chain),
    checkpointFor: (e) => baseHost.checkpointFor(e),
    runEffect: async (e, en, args, chain) => {
      // RFC 0011 §6.4: runtime `par for` backstop — a runtime tool called from
      // a `par for` body (including through a plain `fn` the body calls)
      // surfaces the execution-Err immediately, never reaching the adapter.
      // The static walk (§5.3) covers direct calls; this covers the fn-hop
      // path the walk cannot see. Inert for child-process dispatch (those
      // classify `"theta-callable"`, not `"runtime-tool"`).
      if (
        e.kind === "call" &&
        baseHost.classifyCall?.(e as CallExpr, en) === "runtime-tool"
      ) {
        // Return as a failed operation (ok: false) so the executor routes it
        // through the fail/value disposition (atTerminal-dependent), mirroring
        // how `runCodeSideToolCall`’s execution-error arm surfaces
        // CodeToolError. This avoids the double-wrap that `ok: true` with an
        // Err value would cause at the par-for element boundary.
        return {
          ok: false,
          error: {
            kind: "code_tool",
            message: `session-control tool '${(e as CallExpr).callee}' is not available inside a par for body`,
            tool_name: (e as CallExpr).callee,
            cause: "execution",
          } as unknown as QueryError,
        };
      }
      const result = await baseHost.runEffect(e, en, args, chain);
      const childDiagnostics = (
        result as { readonly childDiagnostics?: readonly Diagnostic[] }
      ).childDiagnostics;
      if (childDiagnostics !== undefined) {
        diagnosticsSink.push(...childDiagnostics);
      }
      return result;
    },
    ...(baseHost.classifyCall !== undefined
      ? { classifyCall: baseHost.classifyCall.bind(baseHost) }
      : {}),
  };
}

/** Map a completed iteration's flow to its element result or whole-theta cancellation. */
function parForOutcomeOf(
  flow: Flow,
  signal: AbortSignal,
  diagnostics: readonly Diagnostic[] | undefined,
): ParForIterationOutcome {
  switch (flow.kind) {
    case "normal":
      return { kind: "result", result: makeOk(flow.value), diagnostics };
    case "return":
      // Barred by the parser (par-return-in-body); defensively folded into the
      // iteration's own result rather than propagated outward, exactly as a
      // normal body completion is.
      return { kind: "result", result: makeOk(flow.value), diagnostics };
    case "break":
    case "continue":
      // Barred by the parser (par-break-continue); defensively a no-value Ok.
      return { kind: "result", result: makeOk(null), diagnostics };
    case "propagate":
      // A `?` inside the body propagates to THIS iteration's result (CTRL-5).
      return { kind: "result", result: makeErr(flow.err), diagnostics };
    case "fail":
      return { kind: "result", result: makeErr(flow.error), diagnostics };
    case "cancel":
      if (signal.aborted) {
        // Whole-theta cancellation: terminal, no per-element value flows.
        return { kind: "whole-theta-cancel" };
      }
      // Per-element cancellation within the run-to-completion model: the
      // iteration's child work was cancelled but the enclosing theta is NOT
      // aborted, so it becomes that element's Err(cancelled) (CTRL-5).
      return {
        kind: "result",
        result: makeErr(makeCancelledError() as unknown as ThetaValue),
        diagnostics,
      };
  }
}

/**
 * Evaluate one `par for` iteration: bind the fresh immutable loop variable, run
 * the body through the SAME executor / effect host (so each iteration's effects
 * route through `runEffect` and its depth-32 invoke ceiling applies unshared),
 * and normalise the body outcome to that element's `Result` (CTRL-5):
 *   - a body tail value `U` → `Ok(U)`;
 *   - a `?`-propagated / unhandled effect `Err` → that element's `Err` (does
 *     NOT propagate out of the loop);
 *   - a per-element cancellation (enclosing signal un-aborted) → `Err(cancelled)`;
 *   - a whole-theta cancellation (enclosing signal aborted) → the
 *     `whole-theta-cancel` sentinel, handled by the caller;
 *   - a runtime panic (thrown) → `Err(invoke_infra, cause:"panic")` (ERR-20).
 * Child diagnostics attached to the iteration's effect results
 * (`OperationResult.childDiagnostics`) are collected for the CTRL-3 join drain.
 */
async function runParForIteration(
  expr: ParForExpr,
  element: ThetaValue,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<ParForIterationOutcome> {
  // A `par for` iteration scope is a write boundary (bug 0396 belt): a body
  // write that walks out to an outer binding is the CTRL-4 concurrent-write
  // hazard the parse-side scan exists to refuse, so this must reject rather
  // than land silently if the scan ever misses.
  const scope = env.bindParIterationVariable(expr.variable, element);
  const collectedDiagnostics: Diagnostic[] = [];
  const iterationHost = makeParForIterationHost(deps.host, collectedDiagnostics);
  const iterationDeps: ExecuteBodyDeps = { ...deps, host: iterationHost };

  let flow: Flow;
  try {
    flow = await executeBlock(expr.body, scope, iterationDeps);
  } catch (thrown) { // allow-broad-catch: ERR-20 — errors-and-results.md#err-20
    // ERR-20 iteration-boundary downgrade (extends the invoke-boundary downgrade
    // of `runInvokeChild`). An uncatchable host fatal (NOCEIL-3) must terminate
    // the process and is rethrown unwrapped — it is never downgraded to an Err
    // element. Any other thrown value becomes that element's Err, discriminated
    // by `parForPanicError`: a `ThetaPanic` → cause:"panic", any other
    // unexpected interpreter throw → cause:"internal_error". Siblings run to
    // completion and the loop still yields a full array.
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    // The `par for` lane body boundary: push the lane frame before the ERR-20
    // downgrade below neutralises the panic into this element's `Err` (bug
    // 0476 §Fix). No shipped route re-surfaces it today — ERR-20 always
    // downgrades a lane panic before it could reach a top-level note — but the
    // frame rides the panic object for the same reason every other boundary
    // attaches one: uniform plumbing, not a currently-observable effect here.
    if (isThetaPanic(thrown)) {
      pushPanicFrame(thrown, {
        kind: "par-for",
        file: panicSiteFile(env, deps),
        range: expr.range,
      });
    }
    return {
      kind: "result",
      result: makeErr(parForPanicError(thrown, deps.file) as unknown as ThetaValue),
      diagnostics:
        collectedDiagnostics.length > 0 ? collectedDiagnostics : undefined,
    };
  }

  // Computed after the body ran, so it reflects every effect's captured
  // `childDiagnostics` transport (not the empty pre-run snapshot).
  const diagnostics =
    collectedDiagnostics.length > 0 ? collectedDiagnostics : undefined;

  return parForOutcomeOf(flow, deps.signal, diagnostics);
}

/**
 * Evaluate a `par for` expression (RFC 0003; control-flow.md CTRL-1…CTRL-5).
 * The iterand is snapshotted once at loop entry (CTRL-1); the body is scheduled
 * concurrently per element, at most `min(max ?? 64, 64)` in flight through a
 * bounded worker pool (CTRL-2); one `Result` per element is collected into an
 * input-index-ordered `array<Result<T, QueryError>>` (CTRL-3). Iterations run to
 * completion independently (CTRL-5): a per-element `Err` / panic does not cancel
 * siblings. Whole-theta cancellation (the enclosing signal fires) is terminal:
 * in-flight iterations are cancelled, not-yet-started iterations do not start,
 * and no final value flows.
 */
export async function evalParFor(
  expr: ParForExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<EvalResult> {
  // CTRL-1 — evaluate the iterand exactly once at loop entry. A non-checkpointed
  // iterand (a binding, an array literal, a member access — the common case) is
  // pure synchronous work, so it is evaluated through the pure host in one call
  // (no per-element microtask), which keeps the fan-out's first scheduled batch
  // reaching the effect host promptly rather than trailing the snapshot build.
  // A checkpointed iterand (a bare `invoke` / `.theta` call / `@`-query as the
  // iterand) is dispatched through the effect path so its effect commits once
  // at loop entry (CTRL-1).
  let iterandValue: ThetaValue;
  if (deps.host.checkpointFor(expr.iterand) === null) {
    iterandValue = deps.host.evaluatePure(expr.iterand, env, deps.invokeChain);
  } else {
    const iterand = await evalExpr(expr.iterand, env, deps);
    if (iterand.flow !== "value") {
      return iterand;
    }
    iterandValue = iterand.value;
  }
  // Bug 0369 belt: this must fire BEFORE the CTRL-2 width resolution and worker
  // scheduling below, so a laundered non-array iterand aborts loudly instead of
  // scheduling a fabricated empty fan-out.
  if (!Array.isArray(iterandValue)) {
    throw new ForIterandKindDefectError(iterandValue);
  }
  const snapshot: readonly ThetaValue[] = iterandValue;

  const resolvedWidth = await resolveParForWidth(expr, env, deps);
  if (!("width" in resolvedWidth)) {
    return resolvedWidth;
  }
  const { width } = resolvedWidth;

  const n = snapshot.length;

  // CTRL-5 — whole-theta cancellation already fired at loop entry: no iteration
  // starts and the terminal outcome is Cancelled with no final value.
  if (deps.signal.aborted) {
    handlePartialTerminalOutcome(
      { path: "cancelled", mode: deps.mode, committed: [] },
      deps.mutator,
    );
    return { flow: "cancel" };
  }

  const results: (ResultValue | undefined)[] = new Array(n);
  const childDiagnostics: (readonly Diagnostic[] | undefined)[] = new Array(n);
  let wholeThetaCancelled = false;
  let nextIndex = 0;

  // RFC 0010 (execution-status.md EXST-3(c)): open one lane set for this
  // fan-out. The width handed to the observer is the POST-CTRL-2 clamped
  // `workerCount` (resolved just below), so the rendered `w<n>` is the width
  // actually in flight, not the requested `max`. Absent hooks ⇒ every call
  // below is a `?.` no-op and this loop is byte-identical to the pre-RFC one
  // (EXST-3's no-observable-effect rule).
  const workerCount = Math.min(width, n);
  const laneSet = deps.statusLanes?.open(n, workerCount);

  // A bounded worker pool: `min(width, n)` workers each pull the next input
  // index, run its iteration to completion, and record the result at that
  // index. Index claiming is synchronous (no await between read and
  // increment), so each element dispatches exactly once (CTRL-1).
  const worker = async (): Promise<void> => {
    for (;;) {
      if (wholeThetaCancelled) {
        return;
      }
      // Not-yet-started iterations do not start once the signal fires (CTRL-5).
      if (deps.signal.aborted) {
        wholeThetaCancelled = true;
        return;
      }
      const index = nextIndex;
      if (index >= n) {
        return;
      }
      nextIndex += 1;
      // Published immediately after the SYNCHRONOUS claim (no await between
      // the read and the increment above), so the observer sees the same claim
      // order the pool dispatched in.
      laneSet?.claim(index);
      const element = snapshot[index] as ThetaValue;
      const outcome = await runParForIteration(expr, element, env, deps);
      if (outcome.kind === "whole-theta-cancel") {
        // CTRL-5 whole-theta cancel: the lane never settles — it drops with the
        // node at end of invocation.
        wholeThetaCancelled = true;
        return;
      }
      results[index] = outcome.result;
      childDiagnostics[index] = outcome.diagnostics;
      laneSet?.settle(index, outcome.result.ok ? "done" : "err");
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers); // allow: CTRL-2 — control-flow.md#par-for
  // Every exit path below (value AND cancel) leaves the fan-out here, so the
  // lane set closes exactly once, before either.
  laneSet?.close();

  // CTRL-5 — whole-theta cancellation observed (pre- or mid-flight): terminal
  // Cancelled outcome, no partial array surfaced as a value.
  if (wholeThetaCancelled || deps.signal.aborted) {
    handlePartialTerminalOutcome(
      { path: "cancelled", mode: deps.mode, committed: [] },
      deps.mutator,
    );
    return { flow: "cancel" };
  }

  // CTRL-3 — drain child diagnostics grouped by input index (ascending), then
  // by the existing (file, line, col) order.
  const sink = deps.host.drainChildDiagnostics;
  if (sink !== undefined) {
    for (let index = 0; index < n; index += 1) {
      const diags = childDiagnostics[index];
      if (diags !== undefined && diags.length > 0) {
        sink.call(deps.host, index, assembleDiagnostics([diags]));
      }
    }
  }

  // CTRL-3 — the value is the input-index-ordered array of per-element Results.
  // An unwritten slot here means a claimed index never got a worker write — a
  // scheduling-invariant violation, not a normal outcome, so it throws rather
  // than fabricating a success (bug 0325).
  const collected: ThetaValue[] = new Array(n);
  for (let index = 0; index < n; index += 1) {
    const slot = results[index];
    if (slot === undefined) {
      throw new ParForUnwrittenSlotError(index);
    }
    collected[index] = slot;
  }
  return { flow: "value", value: collected };
}

/** Resolve the CTRL-2 width and emit clamp diagnostics before workers start. */
async function resolveParForWidth(
  expr: ParForExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<{ readonly width: number } | EvalResult> {
  // CTRL-2 — resolve the in-flight width: `max` (evaluated once at loop entry)
  // only lowers the width, and the 64 throttle is the hard upper bound; a `max`
  // above the throttle clamps down to it, a `max` in [1, 64] lowers to it, and a
  // width resolving below 1 clamps UP to 1 with
  // `theta/runtime/par-max-non-positive` (bug 0326).
  let width = PAR_FOR_THROTTLE;
  if (expr.max !== null) {
    const maxResult = await evalExpr(expr.max, env, deps);
    if (maxResult.flow !== "value") {
      return maxResult;
    }
    if (typeof maxResult.value === "number" && Number.isFinite(maxResult.value)) {
      // A non-finite number (NaN, +Infinity, -Infinity) is not an interpretable
      // width: `Math.floor`/`Math.max`/`Math.min` all propagate NaN through the
      // ≥1 floor (bug 0325), and `Infinity` survives the floor to run
      // unthrottled instead of clamped. `Number.isFinite` is the corpus's
      // non-finite leaf test (cf. subagent-envelope.ts), so it gates the
      // number branch the same way here.
      const requested = Math.floor(maxResult.value);
      if (requested < 1) {
        // CTRL-2 grants `max` only the power to LOWER the width; a resolved
        // width below 1 (max 0 / a negative operand) admits no work as
        // written, so it clamps up to the panic-free floor of 1 and is
        // diagnosed rather than silent (bug 0326).
        width = 1;
        deps.emitDiagnostic?.({
          severity: "error",
          code: "theta/runtime/par-max-non-positive",
          file: deps.file,
          range: expr.max.range,
          message: "'par for' max operand must be at least 1; in-flight width clamped to 1",
        });
      } else if (!Number.isInteger(maxResult.value)) {
        // CTRL-2 (`n` is any `integer`-typed expression): a finite value whose
        // floor is ≥1 but which is itself non-integral (`2.5`) is still not an
        // `integer` width. The direct spelling is parse-refused
        // (`theta/parse/integer-narrowing`), so this is only reachable through
        // the deferred/`unknown` path — the same laundered-fractional class the
        // 0365/0402 integrality doctrine diagnoses rather than silently
        // truncates (bug 0438). Routed into the existing non-integer code
        // rather than a new one: its clamp-to-1 disposition already fits.
        width = 1;
        deps.emitDiagnostic?.({
          severity: "error",
          code: "theta/runtime/par-max-non-integer",
          file: deps.file,
          range: expr.max.range,
          message: PAR_MAX_NON_INTEGER_MESSAGE,
        });
      } else {
        width = Math.max(1, Math.min(requested, PAR_FOR_THROTTLE));
      }
    } else {
      // CTRL-2: `max` only ever LOWERS the width. A non-number operand value
      // (reached through the deferred/`unknown` static path) or a non-finite
      // number value (NaN/±Infinity, reached through `n % 0` / `n / 0`) is
      // unintelligible as a width, so the panic-free floor is the clamp-to-1
      // disposition — never the clause-absent 64 throttle, which would invert
      // the clause's one granted power.
      width = 1;
      deps.emitDiagnostic?.({
        severity: "error",
        code: "theta/runtime/par-max-non-integer",
        file: deps.file,
        range: expr.max.range,
        message: PAR_MAX_NON_INTEGER_MESSAGE,
      });
    }
  }
  return { width };
}
