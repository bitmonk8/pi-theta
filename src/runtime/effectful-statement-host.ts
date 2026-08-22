// V19d / V19d-T — effectful statement wiring: the real query / tool-call /
// invoke hosts assembled into the `V19c` executor's `StatementEvalHost` seam.
//
// This module owns the assembly seam the paired `V19d` implementation leaf fills
// in: `createEffectfulStatementHost(deps)` builds the concrete
// `StatementEvalHost` (the `V19c` executor's effect boundary — query / tool-call
// / invoke evaluation) that dispatches each checkpointed body effect through the
// REAL effectful hosts against the driven conversation, and NOT through test
// doubles:
//
//   - an `@`-query executes through the real query-model driver — the
//     `query-tool-loop.md` two-phase loop (`runUntypedQueryLoop` /
//     `runTypedQueryLoop`) — servicing the tool-call loop and resolving to the
//     final response (QRY-13 … QRY-16 integration witnesses, owned on `V13*`);
//   - a `<name>(args)` code-tool call dispatches through the real code-side
//     tool-call path and lowering sink (`runCodeSideToolCall`) against the
//     driven conversation (`tool-calls.md`, `cka-13` / `cka-46` integration
//     witnesses, owned on `V14*`);
//   - an `invoke(...)` executes through the real invoke trampoline
//     (`runInvokeChild`) against a freshly spawned isolated session, honouring
//     argument binding and the depth bound, and honouring the invoke-dispatch
//     cancellation checkpoint (`cka-47`, `V15m` facet) on that real host
//     (INV-1 … INV-4 integration witnesses, owned on `V15*`).
//
// This leaf closes NO new coverage-matrix row; every behaviour above is an
// integration-realisation witness that the existing seams execute against the
// real driven conversation under the `V19c` executor.
//
// V19d-T (this tests task) declares the assembly seam and stubs the
// behaviour-bearing `runEffect` inertly: the returned host dispatches NO effect
// through the real query / tool-call / invoke hosts — it returns an inert
// `Ok(null)` — so every paired integration assertion reds on its own primary
// expectation (an un-serviced query loop, an un-dispatched tool call, an
// un-driven invoke child, an out-of-order effect log, or an un-interrupted
// invoke-checkpoint cancellation), not on a compile error, a missing fixture, or
// a harness throw. The paired `V19d` implementation leaf fills `runEffect` in.
//
// Spec: query.md, query/query-tool-loop.md, query/query-forms.md,
// query/query-failure-and-repair.md, tool-calls.md, invocation.md,
// pi-integration-contract/conversation-drive.md, slash-invocation.md.

import type {
  CallExpr,
  Expr,
  InvokeExpr,
  QueryExpr,
  SubagentSessionConfig,
} from "../parser/theta-document";
import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { OperationResult } from "./cancellation-core";
import { makeCancelledError } from "./cancellation-core";
import type { CheckpointDescriptor, StatementEvalHost } from "./statement-executor";
import type { LexicalEnvironment } from "./lexical-environment";
import type { ThetaValue } from "./value";
import { makeErr, makeOk } from "./value";
import type {
  QueryModelDriver,
  QueryToolLoopConfig,
  TypedQuerySchemaValidation,
} from "./query-tool-loop";
import { runTypedQueryLoop, runUntypedQueryLoop } from "./query-tool-loop";
import { renderEmptyShortCircuit } from "../render/query-render";
import type { CodeSideToolCall, ToolLoweringSink } from "./tool-call-execute";
import { runCodeSideToolCall } from "./tool-call-execute";
import { ToolReturnShapeDefectError } from "./tool-call-off-surface";
import type { InvokeChild } from "./invoke-cancellation";
import { runInvokeChild } from "./invoke-cancellation";
import { surfaceThetaCallableCalleeFailure } from "./tool-call";
import type { InvokeCalleeError, QueryError } from "./query-error";
import { summariseErrorField } from "./err-field-summary";
import type { InvokeCallSite } from "./invoke-provenance";

/**
 * How to drive one `@`-query through the real two-phase query loop: whether the
 * query is typed (the forced-respond terminator branch) and the real
 * `QueryModelDriver` + `QueryToolLoopConfig` the loop reads. `V19d` resolves
 * these from the query expression against the driven conversation.
 */
export interface QueryHostDispatch {
  readonly typed: boolean;
  readonly model: QueryModelDriver;
  readonly config: QueryToolLoopConfig;
  /**
   * QRY-6 / SNK-b: the query's FULLY-RENDERED template body (interpolation +
   * newline-trim + dedent applied; the typed-query schema conveyance NOT
   * appended). The empty-rendered-template short-circuit is evaluated over this
   * text before any provider turn is issued, for both untyped and typed queries.
   * Every production `resolveQuery` (prompt-mode and subagent-mode) populates
   * it; optional only so pre-QRY-6 test doubles that never exercise the empty
   * path stay valid — an absent value skips the short-circuit (guard inert).
   */
  readonly renderedText?: string;
  /**
   * V13e-T seam (QRY-22): the typed-query schema-validation collaborators the
   * execution path orchestrates for a typed query (resolution → lowering →
   * `AjvSchemaValidator` → `runRespondRepairLoop`). Present only for a typed
   * query; the paired `V13e` implementation resolves it from the query
   * expression's declared schema against the driven conversation.
   */
  readonly schemaValidation?: TypedQuerySchemaValidation;
  /**
   * The typed query's inbound translation step (runtime-value-model.md
   * §"Wire-name translation", the typed-query-results boundary): translate the
   * AJV-validated respond payload to its theta-side value before it binds.
   * Applied to the loop's `value` outcome, which is where BOTH validated arms
   * converge — the terminal forced-respond payload (`query-tool-loop.ts`'s
   * terminal return) and the respond-repair arm's re-validated value — so ONE
   * call satisfies the pass for both, after each arm's own AJV verdict and
   * before the value binds. Present only for a typed query whose annotation
   * lowered; absent binds the payload raw. The host does not fall back to
   * deriving the step from `schemaValidation`: the declared `schema` / `enum`
   * name sets that derivation needs are the caller's to hold, and re-deriving
   * them here would restate per call site the rule `runtime-value-model.md`
   * §"Wire-name translation" states once for all four inbound boundaries.
   */
  readonly decodeInbound?: (validated: unknown) => ThetaValue;
}

/**
 * The collaborators the effectful `StatementEvalHost` dispatches through. The
 * real query / tool-call / invoke hosts are threaded the SAME `checkpoint` and
 * `signal` the `V19c` executor gates on, so the invoke-dispatch cancellation
 * checkpoint (`cka-47`, `V15m` facet) is honoured on the real invoke host.
 *
 *   - `evaluatePure` evaluates a pure (non-checkpointed) sub-expression.
 *   - `resolveQuery` / `resolveToolCall` / `resolveInvoke` bind one effect
 *     expression to the real host inputs (the query model driver + config, the
 *     code-side tool call, the invoke child) against the driven conversation.
 */
export interface EffectfulStatementHostDeps {
  readonly checkpoint: Checkpoint;
  readonly signal: AbortSignal;
  readonly sink: ToolLoweringSink;
  /** The theta source file the checkpoint site is stamped with. */
  readonly file: string;
  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue;
  resolveQuery(expr: QueryExpr, env: LexicalEnvironment): QueryHostDispatch;
  /**
   * Bind one code-side `<name>(args)` call to its `CodeSideToolCall`.
   * `evaluatedToolArgs` (RFC 0002) carries the Pi-tool argument's field values
   * already evaluated left-to-right by the executor; when present it is the
   * concrete params object the tool receives (the resolver skips the pure
   * argument lowering). Absent for a `.theta`-callable / non-object-literal
   * call, where the ordinary lowering applies.
   */
  resolveToolCall(
    expr: CallExpr,
    env: LexicalEnvironment,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): CodeSideToolCall;
  resolveInvoke(expr: InvokeExpr, env: LexicalEnvironment): InvokeChild;
  /**
   * Bug 0088 (slash-invocation.md SLSH-5): record this executed `invoke` hop's
   * provenance against the `invoke_callee` wrapper `runInvokeEffect` just built,
   * so the SLSH-5 chain suffix has a `ChainHop` to render at the slash-dispatch
   * boundary. `calleePath` is the literal callee path from the `invoke(...)`
   * expression (the same value on the wrapper's own `callee_path` field);
   * `callSite` is the call-site token descriptor (invoke-provenance.ts). Absent
   * dep (a caller with no ledger to record into) leaves the SLSH-5 chain empty
   * for every hop it would otherwise have covered.
   */
  recordInvokeHop?(
    wrapper: InvokeCalleeError,
    calleePath: string,
    callSite: InvokeCallSite,
  ): Promise<void>;
  /**
   * H8b live-resolver routing. Classify a `<name>(args)` call by its resolved
   * callee against the theta's callable set (frontmatter `tools:`): a name bound
   * to a Pi tool routes to the tool-`execute` dispatch (`resolveToolCall`), a
   * name bound to a `.theta`-callable routes to the invoke spawn-and-drive path
   * (`resolveCallAsInvoke`). Absent ⇒ every `<name>(args)` call is treated as a
   * Pi tool, preserving the `V19d`-double runner behaviour.
   */
  classifyCall?(expr: CallExpr, env: LexicalEnvironment): "pi-tool" | "theta-callable";
  /**
   * H8b live-resolver. Resolve a `<name>(args)` call bound to a `.theta`-callable
   * to its invoke child — the same `InvokeChild` boundary `resolveInvoke`
   * returns — so it drives through the real `runInvokeChild` trampoline and
   * returns the callee's typed top-level `Result` across the boundary (FN-5).
   * Consulted only when `classifyCall` returns `"theta-callable"`.
   */
  resolveCallAsInvoke?(expr: CallExpr, env: LexicalEnvironment): InvokeChild;
  /**
   * RFC 0001 (`subagent fn`) production spawn seam. Spawn a REAL fresh isolated
   * subagent session for a `subagent fn` body under the resolved
   * `SubagentSessionConfig` (FN-7: `system` / `model` / `tools` / `tool_loop` /
   * `respond_repair`) and return the session-scoped effect resolvers the body's
   * `@`-queries / calls / invokes route through while the session is active,
   * plus a `dispose()` that discards it on return (FN-6 isolation). The
   * countable depth frame (INV-4 / FN-6, threaded through the production chain)
   * is pushed by the producer inside this seam. Absent ⇒ a `subagent fn` body
   * runs against the SAME host with no session switch (the in-memory /
   * test-double behaviour).
   */
  spawnSubagentFnSession?(
    config: SubagentSessionConfig,
  ): SubagentFnSession | Promise<SubagentFnSession>;
}

/**
 * A spawned `subagent fn` session (RFC 0001 FN-6). `deps` are the session-scoped
 * effect resolvers the body's checkpointed effects dispatch through while the
 * session is active (routing the body's `@`-queries / calls / invokes to the
 * fresh isolated session, not the caller's conversation); `dispose` discards the
 * spawned session on return (PIC-65 teardown + the ActiveInvocationRegistry
 * finish, mirroring an `invoke` callee's exit).
 */
export interface SubagentFnSession {
  readonly deps: EffectfulStatementHostDeps;
  dispose(): void | Promise<void>;
}

/** Build a `CheckpointSite` from an expression's source span. */
function siteOf(expr: Expr, file: string): CheckpointSite {
  return { file, line: expr.range.start.line, column: expr.range.start.column };
}

/**
 * Dispatch one `@`-query through the real two-phase query-model driver
 * (`runUntypedQueryLoop` / `runTypedQueryLoop`) against the driven conversation
 * (QRY-13 … QRY-16 integration witness, owned on `V13*`). A terminating turn's
 * final response — the untyped plain-text turn or the typed forced-respond
 * value — flows back as the query value; a cancellation observed at the query
 * checkpoint surfaces the cancel `Err`; an exhaustion / validation failure
 * surfaces its `QueryError`.
 */
async function runQueryEffect(
  expr: QueryExpr,
  env: LexicalEnvironment,
  deps: EffectfulStatementHostDeps,
): Promise<OperationResult> {
  const dispatch = deps.resolveQuery(expr, env);
  // QRY-6 empty-rendered-template short-circuit (errors-and-results.md
  // ValidationError cause `empty_template`): when the fully-rendered template
  // body is empty or ASCII-whitespace-only, the runtime MUST refuse to issue a
  // provider turn and instead surface `Err(ValidationError{cause:
  // "empty_template", ...})` with no round-trip. Evaluated ahead of the
  // typed/untyped branch so it governs both query forms; the typed path's
  // schema conveyance is scaffolding and is deliberately excluded from the body
  // the predicate reads.
  const emptyTemplate =
    dispatch.renderedText !== undefined
      ? renderEmptyShortCircuit(dispatch.renderedText)
      : undefined;
  if (emptyTemplate !== undefined) {
    // QRY-8 (query-failure-and-repair.md): a query NEVER throws — both forms
    // return a `Result`. The empty-template short-circuit is the query's RESULT
    // VALUE `Err(ValidationError{cause:"empty_template"})`, not an effect
    // failure that aborts the body: `let r = @`\n`` must bind `r` to that `Err`
    // (a `match`/`?` then observes it) and the theta continues (query-forms.md
    // QRY-6). Surfaced as `ok: true` carrying the `Err` value so `evalExpr`
    // binds it and `evalAsResult` passes the already-`Result` value through.
    return { ok: true, value: makeErr(emptyTemplate as unknown as ThetaValue) };
  }
  if (dispatch.typed) {
    const outcome = await runTypedQueryLoop(
      deps.checkpoint,
      deps.signal,
      dispatch.model,
      dispatch.config,
      dispatch.schemaValidation,
    );
    switch (outcome.kind) {
      case "value": {
        const { decodeInbound } = dispatch;
        return {
          ok: true,
          value: decodeInbound === undefined ? outcome.value : decodeInbound(outcome.value),
        };
      }
      case "validation":
      case "propagated":
        // A terminal schema-validation failure (QRY-22) or a proximate
        // non-validation failure respond-repair propagated (QRY-11) surfaces as
        // the typed query's `Err`.
        return { ok: false, error: outcome.error };
      case "transport":
        // PIC-50/51: a prompt-mode provider transport failure on the typed
        // query's forced-respond (or free-phase) turn surfaces as the query's
        // `Err(TransportError)` — never masked as a bound value.
        return { ok: false, error: outcome.error };
      case "cancelled":
        return { ok: false, error: makeCancelledError() };
    }
  }
  const outcome = await runUntypedQueryLoop(deps.checkpoint, deps.signal, dispatch.model, dispatch.config);
  switch (outcome.kind) {
    case "text":
      return { ok: true, value: outcome.text };
    case "tool_loop_exhausted":
      return { ok: false, error: outcome.error };
    case "transport":
      // PIC-50/51: a prompt-mode provider transport failure on the untyped
      // query's free-phase turn surfaces as the query's `Err(TransportError)`.
      return { ok: false, error: outcome.error };
    case "cancelled":
      return { ok: false, error: makeCancelledError() };
  }
}

/**
 * Dispatch one `<name>(args)` code-tool call through the real code-side
 * tool-call path and lowering sink (`runCodeSideToolCall`) against the driven
 * conversation (`cka-13` / `cka-46` integration witness, owned on `V14*`). A
 * clean resolution and an `execute()` throw both yield the lowered `Result`
 * value (`Ok(<text>)` / `Err(CodeToolError)`) as the tool-call expression's
 * value; a cancellation observed at the tool-call checkpoint surfaces the cancel
 * `Err`.
 */
async function runToolCallEffect(
  expr: CallExpr,
  env: LexicalEnvironment,
  deps: EffectfulStatementHostDeps,
  evaluatedToolArgs?: Record<string, ThetaValue>,
): Promise<OperationResult> {
  // A `<name>(args)` call bound to a `.theta`-callable (frontmatter `tools:`) is
  // semantically an invoke: drive it through the real invoke trampoline and
  // return the callee's typed top-level `Result` directly (FN-5), NOT the
  // string-lowered tool-call value. A name bound to a Pi tool falls through to
  // the code-side `execute` dispatch below.
  if (
    deps.classifyCall?.(expr, env) === "theta-callable" &&
    deps.resolveCallAsInvoke !== undefined
  ) {
    const child = deps.resolveCallAsInvoke(expr, env);
    const invokeOutcome = await runInvokeChild(
      deps.checkpoint,
      deps.signal,
      siteOf(expr, deps.file),
      child,
    );
    switch (invokeOutcome.kind) {
      case "value":
        return { ok: true, value: invokeOutcome.result };
      case "cancelled":
        return { ok: false, error: makeCancelledError() };
    }
  }
  const call = deps.resolveToolCall(expr, env, evaluatedToolArgs);
  const outcome = await runCodeSideToolCall(
    deps.checkpoint,
    deps.signal,
    siteOf(expr, deps.file),
    call,
    deps.sink,
  );
  switch (outcome.kind) {
    case "value":
    case "execution-error":
    // A ceiling-#4 code-tool-arg depth breach (CIO-3) surfaces its wrapped
    // `Err(CodeToolError { cause: "validation" })` as the tool-call
    // expression's value — the tool never executed. Same shape as the
    // `execution-error` arm: the `Err` value flows through as the expression
    // value, not a failed operation.
    case "arg-depth-error":
    // Bug 0072 §Fix runtime half (b): a pre-dispatch AJV schema rejection is
    // the same shape as the depth breach above — an `Err(CodeToolError)` value
    // with no dispatch, not a failed operation.
    case "arg-schema-error":
      return { ok: true, value: outcome.result };
    case "return-shape-defect":
      // V14c non-conforming return shape (host-interfaces-core.md §"Tool
      // execution from theta code"; tool-calls.md §"Outcome enumeration"): the
      // resolved `execute()` envelope violated the `{ content }` shape. This is
      // routed *off* the `CodeToolError` surface — it is NOT an
      // `Err(QueryError)` the theta binds and can `match` on. The call site
      // observes the `theta/runtime/internal-error` routing per
      // errors-and-results.md §"Runtime panics", so the seam raises the
      // `ToolReturnShapeDefectError` carrier (a non-`ThetaPanic` throw). At the
      // `invoke` boundary `runInvokeChild` re-wraps it as
      // `Err(InvokeInfraError { cause: "internal_error" })`; at a top-level
      // slash dispatch it unwinds as the runtime-defect surface. The diagnostic
      // (already emitted on the lowering sink by `runCodeSideToolCall`) rides on
      // the carrier so a catch site owning a live diagnostic channel can surface
      // it verbatim with its `details.kind = "tool-return-shape"`.
      throw new ToolReturnShapeDefectError(outcome.diagnostic);
    case "cancelled":
      return { ok: false, error: makeCancelledError() };
  }
}

/**
 * Dispatch one `invoke(...)` through the real invoke trampoline
 * (`runInvokeChild`) against a freshly spawned isolated session (INV-1 … INV-4
 * integration witness, owned on `V15*`), honouring the invoke-dispatch
 * cancellation checkpoint on the real host (`cka-47`, `V15m` facet). The
 * completed callee's top-level `Result` flows back as the invoke value; a
 * cancellation observed at the invoke checkpoint interrupts dispatch before the
 * spawn and surfaces the cancel `Err`.
 */
async function runInvokeEffect(
  expr: InvokeExpr,
  env: LexicalEnvironment,
  deps: EffectfulStatementHostDeps,
): Promise<OperationResult> {
  const child = deps.resolveInvoke(expr, env);
  const outcome = await runInvokeChild(deps.checkpoint, deps.signal, siteOf(expr, deps.file), child);
  switch (outcome.kind) {
    case "value": {
      const result = outcome.result;
      if (result.ok) {
        // INVCEIL-3 (discovery-cli.md §Typed return; invocation.md §Typed
        // return): an UNTYPED `invoke(...)` (no `<Schema>` annotation) returns
        // `Result<null, QueryError>` — the runtime discards the callee's
        // return value entirely, so the parent's `Ok` payload is `null`, not
        // the child's final value. A typed `invoke<Schema>(...)` keeps its
        // AJV-validated value (returned unchanged by the callee-drive
        // return-validation step).
        if (expr.returnSchema === null) {
          return { ok: true, value: makeOk(null) };
        }
        return { ok: true, value: result };
      }
      // XMODE-1 (errors-and-results.md §InvokeCalleeError; invocation.md
      // §Failures / §Final-value-propagation): a callee that returns or
      // propagates its OWN `Err` MUST be wrapped as
      // `InvokeCalleeError { kind: "invoke_callee", callee_path, inner, message }`
      // so a spec-conformant parent can read `e.kind == "invoke_callee"`,
      // `e.inner` (the callee's original `QueryError`), and `e.callee_path`.
      // Two envelopes are NOT callee-returned Errs and pass through unchanged:
      //   - `invoke_infra` — an infra-side error the trampoline already
      //     produced (panic / internal_error / return_validation, see
      //     `runInvokeChild` and the typed-return validation path); and
      //   - `cancelled` — cancellation is its own terminal outcome.
      // Every other `QueryError` (the callee's own validation / code_tool /
      // transport / model_tool / context_overflow / tool_loop_exhausted /
      // invoke_callee failure) is the callee's returned `Err` and is wrapped.
      // `invoke_callee` is NOT special-cased: each invoke hop adds exactly one
      // wrapper (the SLSH-5 chain), so a deeper hop's `invoke_callee` is
      // wrapped again. This applies to both untyped and typed invoke.
      const innerKind = (result.error as { readonly kind?: unknown } | null)?.kind;
      if (innerKind === "invoke_infra" || innerKind === "cancelled") {
        return { ok: true, value: result };
      }
      const wrapped = surfaceThetaCallableCalleeFailure(
        child.calleePath,
        result.error as unknown as QueryError,
        `invoke of ${child.calleePath} callee returned Err(${summariseErrorField(innerKind)})`,
      );
      // Bug 0088: record this hop's provenance against the wrapper just built,
      // before the wrapper propagates anywhere. The call-site token is the
      // `invoke(` keyword's own start position (SLSH-5's `<line>` — never a
      // receiving binding's).
      await deps.recordInvokeHop?.(wrapped as InvokeCalleeError, child.calleePath, {
        style: "literal_invoke",
        invokeToken: expr.range.start,
      });
      return { ok: true, value: makeErr(wrapped as unknown as ThetaValue) };
    }
    case "cancelled":
      return { ok: false, error: makeCancelledError() };
  }
}

/**
 * Assemble the concrete `StatementEvalHost` the `V19c` executor drives its body
 * effects through: `checkpointFor` classifies each `@`-query / `<name>(args)` /
 * `invoke(...)` as its checkpointed effect kind, and `runEffect` dispatches the
 * effect through the matching REAL host against the driven conversation,
 * normalising the host outcome to the executor's `OperationResult`.
 *
 * V19d-T stub: `runEffect` is inert — it dispatches NO effect through the real
 * query / tool-call / invoke hosts and returns an inert `Ok(null)`, so every
 * integration assertion reds. The paired `V19d` leaf fills it in.
 */
export function createEffectfulStatementHost(baseDeps: EffectfulStatementHostDeps): StatementEvalHost {
  // RFC 0001 (`subagent fn`): a stack of active spawned-session scopes. Empty by
  // default, so `active()` returns `baseDeps` and every effect dispatches
  // through the caller's conversation exactly as before (byte-identical to the
  // pre-RFC path). A `subagent fn` call pushes a spawned-session scope whose
  // resolvers route the body's effects to a fresh isolated session; the return
  // pops and disposes it (LIFO, so nested subagent fns stack correctly).
  const sessions: SubagentFnSession[] = [];
  const active = (): EffectfulStatementHostDeps =>
    sessions.length === 0
      ? baseDeps
      : (sessions[sessions.length - 1] as SubagentFnSession).deps;
  const host: StatementEvalHost = {
    evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
      return active().evaluatePure(expr, env);
    },
    // RFC 0002 pre-evaluation gate: expose the H8b call classifier so the
    // executor's `preEvaluateToolArgs` only pre-evaluates a Pi-tool call's
    // computed field values. A `.theta`-callable call routes through the invoke
    // trampoline (`runToolCallEffect`) which ignores `evaluatedToolArgs` and
    // re-lowers, so pre-evaluating it would double-dispatch effectful field
    // values. An absent `baseDeps.classifyCall` leaves this undefined, and the
    // executor then treats every call as a Pi tool (the double behaviour).
    ...(baseDeps.classifyCall !== undefined
      ? {
          classifyCall(expr: CallExpr, env: LexicalEnvironment): "pi-tool" | "theta-callable" {
            const current = active();
            return (current.classifyCall ?? baseDeps.classifyCall!)(expr, env);
          },
        }
      : {}),
    checkpointFor(expr: Expr): CheckpointDescriptor | null {
      const file = active().file;
      switch (expr.kind) {
        case "query":
          return { kind: "query", site: siteOf(expr, file) };
        case "call":
          return { kind: "tool-call", site: siteOf(expr, file) };
        case "invoke":
          return { kind: "invoke", site: siteOf(expr, file) };
        default:
          return null;
      }
    },
    async runEffect(
      expr: Expr,
      env: LexicalEnvironment,
      evaluatedToolArgs?: Record<string, ThetaValue>,
    ): Promise<OperationResult> {
      // Dispatch the checkpointed effect through the REAL host against the
      // currently-active conversation (the caller's, or the top spawned
      // `subagent fn` session), threading the SAME `checkpoint` + `signal` the
      // `V19c` executor gates on (so the invoke-dispatch cancellation checkpoint
      // — `cka-47`, `V15m` facet — is honoured on the real trampoline), and
      // normalise the host outcome to the executor's `OperationResult`.
      const deps = active();
      switch (expr.kind) {
        case "query":
          return runQueryEffect(expr, env, deps);
        case "call":
          return runToolCallEffect(expr, env, deps, evaluatedToolArgs);
        case "invoke":
          return runInvokeEffect(expr, env, deps);
        default:
          // `checkpointFor` only classifies query / tool-call / invoke as
          // checkpointed effects, so `runEffect` is never invoked for any other
          // expression kind; treat a pure value inertly if it ever is.
          return { ok: true, value: deps.evaluatePure(expr, env) };
      }
    },
  };
  // RFC 0001 (`subagent fn`) session-switch hooks — exposed only when the
  // producer supplied the real spawn seam; an in-memory host without it omits
  // both, and a `subagent fn` body then runs against the caller's session
  // (unchanged). `spawnSubagentSession` spawns a fresh isolated session and
  // pushes its scope; `exitSubagentSession` pops and disposes it (LIFO).
  if (baseDeps.spawnSubagentFnSession !== undefined) {
    return {
      ...host,
      async spawnSubagentSession(config: SubagentSessionConfig): Promise<string> {
        // INV-4 / FN-6 depth accumulation: route the nested spawn through the
        // ACTIVE session's seam, NOT the fixed `baseDeps` closure. Each spawned
        // session's `effectHostDeps.spawnSubagentFnSession` is bound to THAT
        // session's chain-advanced `childChain` (production-theta-producer.ts
        // `#spawnSubagentFnSession` → `spawnSubagentConversation({ chain:
        // childChain })`), so spawning through `active()` pushes the new
        // `subagent-fn` frame at depth+1 from the caller's session. Binding to
        // `baseDeps` would push every nested spawn onto the ORIGINAL chain,
        // pinning depth at 1 and defeating the recursion backstop. `active()`
        // falls back to `baseDeps` at the top level (empty session stack), so
        // the first spawn still pushes the depth-1 frame.
        const seam = active().spawnSubagentFnSession ?? baseDeps.spawnSubagentFnSession!;
        const session = await seam(config);
        sessions.push(session);
        return `subagent-fn-${sessions.length}`;
      },
      async exitSubagentSession(): Promise<void> {
        const session = sessions.pop();
        if (session !== undefined) {
          await session.dispose();
        }
      },
    };
  }
  return host;
}
