// V19c / V19c-T — the theta tree-walking statement executor.
//
// This module owns the runtime seam the paired `V19c` implementation leaf fills
// in: `executeBody(body, deps)` walks `V19a`'s parsed `ThetaBody` statement AST
// top-to-bottom against `V19b`'s lexical environment — `let`/reassign,
// `if`/`while`/`for` (driving the real `ForLoopHost` / `evaluateForLoop` from
// `V3c`), `break`/`continue`, `return`, and expression-statements — segmenting
// each checkpointed effect sub-expression onto `V17a`'s `runCancellableSequence`
// (`CancellableStatement` / `CancellableSequenceDeps`) so the five fixed
// checkpoint sites gate real work, and producing the `functions.md` FN-5
// top-level-block final value together with the `error-model.md` terminal
// outcome.
//
// The un-anchored driver / top-to-bottom-sequencing obligation this seam closes
// is the `coverage-matrix.md` code-keyed-area token `cka-50`
// (implementation-notes.md §Runtime — "drives it turn-by-turn"; "Within a
// single invocation the interpreter is strictly sequential … the next theta
// expression cannot run until the awaited Promise resolves"). The five
// checkpoint sites are owned by `cka-47` (`V17a` / `V17c`); the final-value rule
// by FN-5 (`V3d`); the mid-stream-cancellation non-mutation obligations by
// ERR-8 … ERR-12 (`V4c`) — this executor witnesses those at real hosts without
// re-closing them.
//
// This executor is the seam `V19d` supplies real effectful hosts to (the
// `StatementEvalHost` boundary — query / tool-call / invoke evaluation) and
// `V19e`'s composition producer drives.
//
// Spec: implementation-notes.md (§Runtime), cancellation.md (§Granularity,
// §"Statement boundaries are not checkpoints", CNCL-5/CNCL-6), control-flow.md
// (CTRL-1), functions.md (FN-4/FN-5), return.md (RET-1/RET-2/RET-3),
// errors-and-results/error-model.md (§Terminal outcomes, ERR-8 … ERR-12).

import type {
  BinaryExpr,
  Block,
  CallExpr,
  Expr,
  FnDecl,
  ForStmt,
  IfStmt,
  ParForExpr,
  ThetaBody,
  MatchExpr,
  PatternNode,
  Stmt,
  SubagentSessionConfig,
  TryExpr,
  WhileStmt,
} from "../parser/theta-document";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../seams/checkpoint";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { assembleDiagnostics } from "../diagnostics/diagnostic";
import type { CancellableStatement, OperationResult } from "./cancellation-core";
import { makeCancelledError, runCancellableSequence } from "./cancellation-core";
import { HostFatal, isThetaPanic } from "./runtime-panics";
import type { InvokeCalleeError, InvokeInfraError, QueryError } from "./query-error";
import { evaluateForLoop, type ForLoopHost } from "./control-flow";
import { PiToolArgShapeDefectError, ShadowedCalleeDispatchDefectError } from "./tool-call";
import { functionResult, type FunctionResult, type TerminalOutcome } from "./function-result";
import type { LexicalEnvironment } from "./lexical-environment";
import {
  evaluateIndexAccess,
  evaluateMemberAccess,
  evaluateQuestion,
  nonObjectReceiverRejection,
  QuestionOperandDefectError,
} from "./runtime-panics";
import { evaluateStringMember } from "./stdlib-string";
import { evaluateArrayMember } from "./stdlib-array";
import { evaluateObjectMember } from "./stdlib-object";
import { evaluateMatch, type Bindings, type MatchArm, type Pattern } from "./match-result";
import {
  handlePartialTerminalOutcome,
  type CommittedConversationMutator,
  type DrivenConversationMode,
} from "./terminal-outcomes";
import {
  buildObjectSchemaValue,
  defineRecordField,
  isObjectValue,
  isResultValue,
  makeErr,
  makeOk,
  valuesEqual,
  type ThetaValue,
  type ResultValue,
} from "./value";

/**
 * The checkpoint a checkpointed effect sub-expression gates on (one of the five
 * fixed sites of cancellation.md §Granularity — `query`, `tool-call`, `invoke`;
 * a loop's per-iteration `loop-iter` boundary is driven by the loop path). Its
 * `kind` and `site` are handed to `V17a`'s `runCancellableSequence` /
 * `Checkpoint.before(kind, site)`.
 */
export interface CheckpointDescriptor {
  readonly kind: CheckpointKind;
  readonly site: CheckpointSite;
}

/**
 * The effect boundary the executor drives expression evaluation through — the
 * seam `V19d` supplies the real effectful hosts to (query / tool-call / invoke
 * evaluation), and a V19c-T test supplies a recording double.
 *
 *   - `evaluatePure` evaluates a pure (non-checkpointed) sub-expression
 *     synchronously to its value. Pure work is not a checkpoint and runs to
 *     completion (cancellation.md §Granularity — "Synchronous in-process work …
 *     is not a checkpoint").
 *   - `checkpointFor` reports whether `expr` is a checkpointed effect (an
 *     `@`-query, a code-tool call, or an `invoke`) and its checkpoint kind/site,
 *     or `null` for a pure expression. The executor segments each checkpointed
 *     effect in a linear run onto `runCancellableSequence`.
 *   - `runEffect` runs one checkpointed effect sub-expression — committing its
 *     effect — and returns its `OperationResult` (`V17a`). It is invoked from
 *     inside `runCancellableSequence`, after that statement's pre-dispatch
 *     `Checkpoint.before(...)` signal read.
 */
export interface StatementEvalHost {
  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue;
  checkpointFor(expr: Expr): CheckpointDescriptor | null;
  /**
   * Run one checkpointed effect. `evaluatedToolArgs` (RFC 0002) carries a
   * Pi-tool call's field values already evaluated left-to-right by the executor
   * (`preEvaluateToolArgs`); the tool-call host lowers those concrete values
   * instead of re-deriving them purely. Absent for queries, invokes, and
   * `.theta`-callable / non-object-literal calls.
   */
  runEffect(
    expr: Expr,
    env: LexicalEnvironment,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult>;
  /**
   * RFC 0002 pre-evaluation gate. Classify a `<name>(args)` call by its resolved
   * callee: a Pi-tool call consumes the executor-pre-evaluated `evaluatedToolArgs`
   * on its `runEffect`, whereas a `.theta`-callable call routes through the
   * invoke trampoline, which ignores `evaluatedToolArgs` and re-lowers the
   * argument itself. Pre-evaluating a `.theta`-callable call would therefore
   * double-evaluate effectful field values, so `preEvaluateToolArgs` skips it.
   * Absent ⇒ the call is treated as a Pi tool (the `V19d`-double behaviour,
   * where every checkpointed call is a code tool).
   */
  classifyCall?(expr: CallExpr, env: LexicalEnvironment): "pi-tool" | "theta-callable";
  /**
   * RFC 0003 (`par for`) child-diagnostic drain sink. At a `par for` join —
   * after all iterations settle — the executor calls this once per input index
   * in ASCENDING index order, each call carrying that iteration's child
   * diagnostics in the existing `(file, line, col)` order, so the
   * nondeterministic completion order becomes the deterministic
   * (input-index, then (file,line,col)) drain order (control-flow.md CTRL-3).
   * Optional: a host that does not aggregate child diagnostics omits it.
   */
  drainChildDiagnostics?(
    index: number,
    diagnostics: readonly Diagnostic[],
  ): void;
  /**
   * RFC 0001 (`subagent fn`) session-switch hook. Around a `subagent fn` CALL
   * the executor enters a fresh isolated subagent session for the body
   * (`spawnSubagentSession`, returning its id) and discards it on return
   * (`exitSubagentSession`), so the body's `@` queries / calls target the
   * spawned session and the caller's conversation stays unpolluted (FN-6). The
   * spawned session's configuration (`system` / `model` / `tools`, FN-7) is
   * inherit-then-`with`-override resolved on the `subagent fn` node. Optional:
   * a host with no isolation substrate omits both, and a `subagent fn` body then
   * runs against the same host with no session switch.
   */
  spawnSubagentSession?(config: SubagentSessionConfig): string | Promise<string>;
  exitSubagentSession?(): void | Promise<void>;
}

/**
 * The collaborators the executor walks the body against. `env` is `V19b`'s
 * real lexical environment; `host` is the `V19d` effect boundary; `checkpoint`
 * and `signal` are `V17a`'s `Checkpoint` seam substrate and the `thetaAbort`
 * signal (never `ctx.signal` directly) the linear-run `runCancellableSequence`
 * reads through; `mutator` and `mode` are the `V4c` partial-append /
 * non-mutation surface a mid-stream terminal event routes through
 * (`handlePartialTerminalOutcome`).
 */
export interface ExecuteBodyDeps {
  readonly env: LexicalEnvironment;
  readonly host: StatementEvalHost;
  readonly checkpoint: Checkpoint;
  readonly signal: AbortSignal;
  readonly mutator: CommittedConversationMutator;
  readonly mode: DrivenConversationMode;
  /**
   * The theta source file stamped onto the `loop-iter` `CheckpointSite` (the
   * per-iteration cancellation checkpoint of `executeWhile` / `executeFor`);
   * the other four checkpoint sites are stamped by the effect host from the
   * same source file. Matches `EffectfulStatementHostDeps.file`.
   */
  readonly file: string;
  /**
   * The runtime-diagnostic channel (bug 0324): `evalParFor`'s width resolve
   * calls this on a non-number `max` value (the clamp-to-1 disposition) so the
   * clamp is not silent. OPTIONAL because existing constructors of this
   * interface omit it; a required field would flip every one of them outside
   * this fix's enumerated scope.
   */
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
}

/**
 * The outcome of driving a `ThetaBody` to completion: the `error-model.md`
 * terminal outcome (`success` / `fail` / `cancel`) and the FN-5 top-level-block
 * final value (present only on the success path).
 */
export interface BodyExecution {
  readonly outcome: TerminalOutcome;
  readonly result: FunctionResult;
  /**
   * The `Err` payload that unwound the body — the theta's terminal `Result` on
   * the fail path is `Err(error)`. Present on the fail outcome for BOTH a
   * `?`-propagation (ERR-18) and an unhandled non-cancel effect `Err` in
   * tail/statement position (ERR-19 — e.g. a `tool_loop_exhausted` breach): the
   * effect's own terminating `QueryError` is carried through so the caller sees
   * the real leaf kind, not a fabricated `cancelled`. Absent for the cancel
   * outcome (whose surface is `CancelledError`) and for a thrown `ThetaPanic`
   * (which never reaches a `fail` outcome). A mode's `surface` projects this
   * onto the caller-visible `Err` (FN-5 fail path).
   */
  readonly error?: ThetaValue;
}

// ---------------------------------------------------------------------------
// Internal control-flow signal
// ---------------------------------------------------------------------------

/**
 * The control-flow signal one statement or block produces as the walk unwinds.
 *
 *   - `normal`   — fall through to the next statement; `value` is the last
 *     evaluated value (a block's tail value, or `null`).
 *   - `return`   — an explicit `return expr` short-circuits the body to `value`.
 *   - `break` / `continue` — steer the nearest enclosing loop.
 *   - `fail`     — an unhandled non-cancel effect `Err` in tail/statement
 *     position (an unhandled `@`-query exhaustion / validation breach not
 *     consumed by a caller `match` and not `?`-propagated) — the
 *     `error-model.md` fail terminal outcome. It carries the effect's own
 *     terminating `QueryError` as `error` so the body's terminal `Result` is
 *     `Err(error)`, exactly as `propagate` carries a `?`-propagated `Err`; no
 *     FN-5 final value flows. (A runtime panic is a thrown `ThetaPanic`, not a
 *     `fail` flow, so it never reaches this variant.)
 *   - `cancel`   — a mid-body cancellation surfaced at a checkpoint — the cancel
 *     terminal outcome; no final value flows (FN-5).
 */
type Flow =
  | { readonly kind: "normal"; readonly value: ThetaValue }
  | { readonly kind: "return"; readonly value: ThetaValue }
  | { readonly kind: "break" }
  | { readonly kind: "continue" }
  | { readonly kind: "fail"; readonly error: ThetaValue }
  | { readonly kind: "propagate"; readonly err: ThetaValue }
  | { readonly kind: "cancel" };

/**
 * The outcome of evaluating a single sub-expression (pure or checkpointed).
 * `return` / `break` / `continue` (bug 0082 §Fix) are reachable only
 * from a `BlockExpr` — the block's own statement list can carry any `Stmt`,
 * including these three control-flow forms, and `evalExpr`'s `"block"` case
 * lifts `executeBlock`'s `Flow` onto these matching `EvalResult` variants so
 * the signal propagates through the ordinary EvalResult chain (every other
 * `evalExpr` call site already forwards a non-`"value"` result unchanged)
 * until it reaches a site that converts back to `Flow` via `terminalFlow`.
 */
type EvalResult =
  | { readonly flow: "value"; readonly value: ThetaValue }
  | { readonly flow: "fail"; readonly error: ThetaValue }
  | { readonly flow: "propagate"; readonly err: ThetaValue }
  | { readonly flow: "return"; readonly value: ThetaValue }
  | { readonly flow: "break" }
  | { readonly flow: "continue" }
  | { readonly flow: "cancel" };

/**
 * Lift a terminal `EvalResult` (every variant but `value`) onto the matching
 * `Flow`. A `?`-propagation carries its `Err` payload through so the body's
 * terminal `Result` is `Err(err)` (ERR-18 / FN-5 fail path); `return` /
 * `break` / `continue` carry a `BlockExpr`'s own non-normal flow back onto the
 * `Flow` the enclosing statement / block unwinds on (bug 0082 §Fix).
 */
function terminalFlow(result: Exclude<EvalResult, { flow: "value" }>): Flow {
  switch (result.flow) {
    case "fail":
      return { kind: "fail", error: result.error };
    case "propagate":
      return { kind: "propagate", err: result.err };
    case "return":
      return { kind: "return", value: result.value };
    case "break":
      return { kind: "break" };
    case "continue":
      return { kind: "continue" };
    case "cancel":
      return { kind: "cancel" };
  }
}

/**
 * RFC 0002 (docs/rfcs/0002-computed-tool-arguments.md) — evaluate a Pi-tool
 * call's single bare-object argument field values through the effectful executor
 * BEFORE the outer tool dispatches. Each field value is a full Theta expression
 * (identifier, operator, nested tool call, `?`, `${...}` interpolation, or a
 * nested array/object whose leaves are expressions), evaluated left-to-right in
 * source order so nested effects dispatch in order and a panic or early-returning
 * `?` inside a field aborts the call before dispatch (the outer tool is not
 * dispatched). Returns the concrete lowered params on `{ ok: true, args }`, or
 * carries a field's non-`value` short-circuit flow verbatim on
 * `{ ok: false, flow }`. A non-`call` effect, a `.theta`-callable call (the
 * invoke trampoline lowers its own argument), or a ZERO-argument Pi-tool call
 * yields `args: undefined` so the host lowers arguments on its ordinary path.
 * A call whose callee is a callable-set name shadowed by an activation-local
 * binding is an internal DEFECT (bug 0016): the parse gate
 * (`theta/parse/shadowed-callable-call`) rejects that call site, so
 * dispatching it would execute a callable the site does not lexically denote
 * — it throws `ShadowedCalleeDispatchDefectError` before ANY argument
 * handling. A Pi-tool call carrying a non-object first argument is an internal
 * DEFECT (bug 0003): the parse-time shape gate
 * (`theta/parse/tool-arg-not-object-literal`) rejects that form, so silently
 * lowering it here would drop the author's argument object — it throws
 * `PiToolArgShapeDefectError`. Both defects route to the
 * `theta/runtime/internal-error` surface.
 */
async function preEvaluateToolArgs(
  expr: Expr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<
  | { readonly ok: true; readonly args: Record<string, ThetaValue> | undefined }
  | { readonly ok: false; readonly flow: EvalResult }
> {
  if (expr.kind !== "call") {
    return { ok: true, args: undefined };
  }
  // Bug 0016 belt-and-braces: never dispatch on a lexically shadowed callee.
  // This seam is shared by BOTH executor dispatch sites (the `evalExpr` call
  // arm and `evalAsResult`, the `?`/`match` operand path), so one guard covers
  // every dispatch route; it sits BEFORE the theta-callable skip and the
  // zero-arg early return below because a shadowed `.theta`-callable name and
  // a shadowed zero-arg call are equally parse-rejected
  // (`theta/parse/shadowed-callable-call`) — skipping first would dispatch
  // them. Arm-"fn"/"import" callees never reach here (`resolveUserFn`
  // intercepts them before the effect path); unshadowed / non-colliding
  // callees pass through unchanged (see `localShadowsCallable`).
  if (env.localShadowsCallable(expr.callee)) {
    throw new ShadowedCalleeDispatchDefectError(expr.callee);
  }
  // RFC 0002 / Finding #3: only a Pi-tool call consumes the pre-evaluated
  // `evaluatedToolArgs`. A `.theta`-callable call dispatches through the invoke
  // trampoline (`runToolCallEffect`'s `resolveCallAsInvoke` path), which ignores
  // `evaluatedToolArgs` and re-lowers its argument — pre-evaluating here would
  // dispatch effectful field values twice. Skip it (args left to the invoke
  // path). An absent classifier treats the call as a Pi tool, preserving the
  // executor-double behaviour.
  if (deps.host.classifyCall?.(expr, env) === "theta-callable") {
    return { ok: true, args: undefined };
  }
  const first = expr.args[0];
  if (first === undefined) {
    // Zero-argument Pi-tool calls stay legal (parse admits `read()`); the host
    // lowers them to `{}` on its ordinary path.
    return { ok: true, args: undefined };
  }
  if (first.kind !== "object") {
    // Bug 0003 belt-and-braces: the shadowed-callee guard and the
    // theta-callable skip above already ran, so this IS an unshadowed Pi-tool
    // call whose first argument the parse gate must have rejected. Failing
    // loudly here (instead of the pre-0.16.0 `args: undefined` degradation)
    // keeps any future parse-gate gap from silently arg-dropping.
    throw new PiToolArgShapeDefectError(expr.callee);
  }
  const args: Record<string, ThetaValue> = {};
  for (const field of first.fields) {
    const evaluated = await evalExpr(field.value, env, deps);
    if (evaluated.flow !== "value") {
      return { ok: false, flow: evaluated };
    }
    defineRecordField(args, field.name, evaluated.value);
  }
  return { ok: true, args };
}

/**
 * A `<name>(args)` call whose arg count does not match the resolved `fn`'s
 * declared parameter count. Arity is a type-phase concern the theta grammar
 * expects to be well-formed by execution time, so a mismatch reaching the
 * runtime is a defect: it surfaces as a thrown error (routed to the extension's
 * command-execution error surface, `theta/runtime/internal-error`) rather than
 * silently binding `null` for a missing arg or crashing the host.
 */
export class ThetaFnArityError extends Error {
  public constructor(name: string, expected: number, actual: number) {
    super(`function '${name}' expects ${expected} argument(s) but received ${actual}`);
  }
}

/**
 * Whether a resolved identifier names an executable user `fn` — a hoisted
 * top-level `fn` (`arm: "fn"`) or an imported `.thetalib fn` (`arm: "import"`),
 * both carrying the `FnDecl` body. A `.theta`-callable / Pi-tool call (the
 * `callable` arm) is NOT a user `fn`; it stays on the effect (tool-call /
 * invoke) path.
 */
function resolveUserFn(
  callee: string,
  env: LexicalEnvironment,
): { readonly fn: FnDecl; readonly moduleEnv?: LexicalEnvironment } | undefined {
  const r = env.resolve(callee);
  if ((r.arm === "fn" || r.arm === "import") && r.fn !== undefined) {
    // `moduleEnv` is present only on the `import` arm for an imported `fn`
    // (bug 0303): the declaring lib's own environment the body must be opened
    // against instead of the caller's, so its free names resolve in the file
    // that declared it. A same-file `fn` carries no `moduleEnv` — its file IS
    // the caller's file (fix constraint 2).
    return { fn: r.fn, ...(r.moduleEnv !== undefined ? { moduleEnv: r.moduleEnv } : {}) };
  }
  return undefined;
}

/**
 * Execute a user `fn` call `<name>(args)` in-process (functions.md FN-1…FN-5) —
 * NOT as a host tool-call or an invoke, and NOT against the invoke-depth ceiling
 * (intra-file `fn` calls are unbounded, hard-ceilings NOCEIL-3/-4). Each argument
 * is evaluated in the caller's scope through the same expression machinery (so a
 * nested effect / user-`fn` argument runs on its normal path), bound as an
 * immutable local into a fresh child scope, and the `fn` body runs through the
 * SAME `executeBlock` the top-level body and the invoke callee use. The body's
 * final value flows back as the call's value: an explicit `return` or the block's
 * tail expression (FN-3…FN-5); a `?`-propagation inside the body early-returns
 * the `fn` with `Err(e)` (the enclosing function of a `?` is this `fn`); a
 * `break`/`continue` with no enclosing loop yields the `null` final value.
 */
async function evalUserFnCall(
  fn: FnDecl,
  expr: CallExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  moduleEnv?: LexicalEnvironment,
): Promise<EvalResult> {
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  // The body scope chains to the DECLARING module's environment when `fn` is
  // an imported `.thetalib` fn (bug 0303: `moduleEnv`, so its free names
  // resolve against the file that declared it) or to the caller's environment
  // for a same-file `fn` (fix constraint 2: its file IS the caller's file). In
  // both cases the scope is marked an ACTIVATION BOUNDARY (bug 0016): theta
  // 1.0 has no closures, so a caller-frame local must never count as an
  // in-scope shadow when `preEvaluateToolArgs` asks `localShadowsCallable`
  // inside the body — the parse gate resolves the body's call sites against
  // the whole-file declarations plus these parameters only. Arguments are
  // still evaluated in the CALLER's `env` (positional args are the caller's
  // values, not the declaring module's).
  const scope = (moduleEnv ?? env).childFnActivation();
  for (let i = 0; i < fn.params.length; i += 1) {
    const arg = await evalExpr(expr.args[i] as Expr, env, deps);
    if (arg.flow !== "value") {
      return arg;
    }
    scope.defineLocal((fn.params[i] as FnDecl["params"][number]).name, arg.value, false);
  }
  const flow = await executeBlock(fn.body, scope, deps);
  switch (flow.kind) {
    case "return":
    case "normal":
      return { flow: "value", value: flow.value };
    case "break":
    case "continue":
      return { flow: "value", value: null };
    case "propagate":
      // A `?` inside the body returns from THIS `fn` with `Err(e)`; the call
      // evaluates to that `Err` value so an enclosing `?`/`match` sees it.
      return { flow: "value", value: makeErr(flow.err) };
    case "fail":
      return { flow: "fail", error: flow.error };
    case "cancel":
      return { flow: "cancel" };
  }
}

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
async function evalSubagentFnCall(
  fn: FnDecl,
  expr: CallExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  moduleEnv?: LexicalEnvironment,
): Promise<EvalResult> {
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  // Isolate against the DECLARING module's environment for an imported
  // `subagent fn` (bug 0303, fix design point 10) so the body's free names
  // resolve against the lib that declared it; a same-file `subagent fn` passes
  // no `moduleEnv` and isolates against the caller's root unchanged.
  const scope = (moduleEnv ?? env).spawnIsolatedScope();
  for (let i = 0; i < fn.params.length; i += 1) {
    const arg = await evalExpr(expr.args[i] as Expr, env, deps);
    if (arg.flow !== "value") {
      return arg;
    }
    scope.defineLocal((fn.params[i] as FnDecl["params"][number]).name, arg.value, false);
  }

  // Enter the fresh isolated session and run the body inside the SAME try, so a
  // depth-ceiling breach on the spawn (the production seam pushes the countable
  // `subagent-fn` frame here, INV-4 / FN-6) is downgraded at the boundary to the
  // caller's `Err(InvokeInfraError{cause:"panic"})` — the runtime backstop, the
  // same nested surfacing an `invoke` overflow takes — rather than crashing the
  // caller. `entered` guards `exitSubagentSession` so a spawn that threw before
  // pushing a session is not popped.
  let entered = false;
  let flow: Flow;
  try {
    await deps.host.spawnSubagentSession?.(fn.sessionConfig ?? {});
    entered = true;
    flow = await executeBlock(fn.body, scope, deps);
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

  switch (flow.kind) {
    case "return":
    case "normal":
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
      const raw = flow.kind === "propagate" ? flow.err : flow.error;
      return {
        flow: "value",
        value: makeErr(subagentCalleeError(raw, fn.name) as unknown as ThetaValue),
      };
    }
    case "cancel":
      return { flow: "cancel" };
  }
}

/** A theta condition is a boolean; only the literal `true` steers control flow. */
function isTruthy(value: ThetaValue): boolean {
  return value === true;
}

/**
 * Bug 0314 (docs/bugs/0314-compound-assign-non-numeric-silent-zero.md)
 * belt-and-braces: a compound operator is defined by desugaring,
 * `x <op>= e ≡ x = x <op> e` (bindings.md §Reassignment), and the parse-time
 * type-layer routes `+=`'s implied `x + e` pair through the shared
 * `+`-operand classifier (`theta/parse/mixed-plus-operands`), which fires
 * only when both operands are statically resolvable; an unresolvable pair
 * defers exactly as the spelled binary `x = x + e` does and takes the same
 * runtime `+` arm. So a `+=` reaching here carries two strings, two
 * numbers, or an unresolvable pair that the shared `+` arm computes
 * identically to the spelled binary.
 * `-=`/`*=`/`/=`/`%=` have no parse-time operand gate: bug 0332 added one only
 * for the SPELLED `-`/`*`/`/`/`%` binaries in expression position
 * (`theta/parse/non-numeric-arithmetic-operands`, `type-layer-checks.ts`'s
 * `checkArithmeticOperands`), and its §Non-goals leaves the compound forms on
 * this runtime belt as their 0314 disposition — so a non-number operand can
 * still reach them; fabricating a `0` there silently overwrites the binding
 * with a value of a different type (the original defect), so this throws a
 * loud, specific defect instead — never a catch-all, never a fabricated number.
 */
export class CompoundNonNumericError extends Error {
  public constructor(op: "-=" | "*=" | "/=" | "%=", current: ThetaValue, delta: ThetaValue) {
    super(
      `internal defect: compound operator '${op}' requires two numbers, got ${typeof current} and ${typeof delta}; a non-number operand reached a numeric compound after the reassign type gate (bug 0314)`,
    );
    this.name = "CompoundNonNumericError";
  }
}

/**
 * Bug 0332 (docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
 * belt: the sibling of `CompoundNonNumericError` for the SPELLED `-`/`*`/`/`/`%`
 * binaries. The parse-time gate (`type-layer-checks.ts`'s
 * `checkArithmeticOperands`) refuses every statically-resolvable non-numeric
 * pair; a pair it deferred on (an unresolvable operand) can still reach
 * `applyBinaryScalar`, and casting it to `number` there would silently
 * JS-coerce (the original defect: `"a" - "b"` → `NaN`, `[1] - [2]` → `-1`).
 * A plain `Error`, NOT a `ThetaPanic` — it propagates uncaught out of
 * `executeBody` and is reframed one layer up through `surfaceUnexpectedThrow`
 * to `INTERNAL_ERROR_CODE`, exactly as `CompoundNonNumericError` is.
 */
export class BinaryNonNumericError extends Error {
  public constructor(op: "-" | "*" | "/" | "%", left: ThetaValue, right: ThetaValue) {
    super(
      `internal defect: arithmetic operator '${op}' requires two numbers, got ${typeof left} and ${typeof right}; a non-number operand reached a numeric binary after the spelled-binary type gate (bug 0332)`,
    );
    this.name = "BinaryNonNumericError";
  }
}

/**
 * Apply a compound-assignment operator. `+=` mirrors `applyBinaryScalar`'s
 * `+` arm exactly (string+string concatenates, else numeric addition) — the
 * shared runtime semantics for `+`, since bindings.md defines `x += e` as
 * `x = x + e` and the parse-time `+`-operand gate has already refused every
 * statically-resolvable mixed pair; an unresolvable pair defers and takes
 * the same shared `+` arm as the spelled binary. `-=`/`*=`/`/=`/`%=` are
 * numeric-only: a non-number operand throws `CompoundNonNumericError` rather
 * than silently computing over a fabricated `0` (bug 0314).
 */
function applyCompound(
  op: "+=" | "-=" | "*=" | "/=" | "%=",
  current: ThetaValue,
  delta: ThetaValue,
): ThetaValue {
  if (op === "+=") {
    return typeof current === "string" && typeof delta === "string"
      ? current + delta
      : (current as number) + (delta as number);
  }
  if (typeof current !== "number" || typeof delta !== "number") {
    throw new CompoundNonNumericError(op, current, delta);
  }
  switch (op) {
    case "-=":
      return current - delta;
    case "*=":
      return current * delta;
    case "/=":
      return current / delta;
    case "%=":
      return current % delta;
  }
}

// ---------------------------------------------------------------------------
// Expression evaluation — pure vs. checkpointed effect
// ---------------------------------------------------------------------------

/**
 * Evaluate one sub-expression. A pure expression (`host.checkpointFor` returns
 * `null`) is evaluated synchronously through `host.evaluatePure` and is NOT a
 * cancellation checkpoint (cancellation.md §Granularity — synchronous in-process
 * work is not a checkpoint; a straight-line statement boundary is not a
 * checkpoint). A checkpointed effect is segmented onto `V17a`'s
 * `runCancellableSequence` as a single-statement sequence so the five fixed
 * checkpoint sites gate the effect: the runner awaits `checkpoint.before(...)`
 * and reads `signal` before dispatching the effect, so a signal flipped
 * mid-body preempts at the next checkpointed sub-expression and every completed
 * effect is retained verbatim (CNCL-5). A completed `Err` whose kind is
 * `cancelled` surfaces the cancel outcome and routes through `V4c`'s
 * `handlePartialTerminalOutcome` (ERR-8 … ERR-12); any other `Err` is disposed
 * by consumption-time position (`atTerminal`): a value position binds the
 * `Err` as a `Result`, a terminal/returning/discarding position surfaces the
 * fail outcome.
 */
async function evalExpr(
  expr: Expr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  atTerminal: boolean = false,
): Promise<EvalResult> {
  // `?` (try) and `match` are control-flow forms whose operand / scrutinee may
  // itself be a checkpointed effect. They are evaluated by the executor (not the
  // pure host) so a `?`-propagation early-returns from the body and a `match`
  // dispatches the real effect before applying the sync V4a/V4b semantics.
  if (expr.kind === "try") {
    return evalTry(expr, env, deps);
  }
  if (expr.kind === "match") {
    // The enclosing position carries through to the selected arm body (a
    // DIRECT effect there inherits whether this `match` itself sits at a
    // terminal / returning / discarding position) — a `match` is a pass-through,
    // not a boundary.
    return evalMatch(expr, env, deps, atTerminal);
  }
  // RFC 0003 `par for`: fan the body out concurrently over the iterand snapshot
  // and collect one `Result` per element into an input-index-ordered array.
  if (expr.kind === "par-for") {
    return evalParFor(expr, env, deps);
  }
  // A `BlockExpr` (grammar.md §"Block expressions", the two grammar.md:114 sites: a
  // `let`-RHS, a `match`-arm body): run the existing `executeBlock` in a CHILD
  // scope, so a name the block's own `let`s bind does not leak into `env`, and
  // the block's value is its tail expression's value — the same `Flow`
  // conversion `executeIf` / `executeWhile` / `executeFor` apply at their own
  // `executeBlock` call sites, lifted onto `EvalResult` here because a block is
  // an EXPRESSION, not a statement.
  if (expr.kind === "block") {
    const flow = await executeBlock(expr.body, env.child(), deps);
    switch (flow.kind) {
      case "normal":
        return { flow: "value", value: flow.value };
      case "return":
        return { flow: "return", value: flow.value };
      case "break":
        return { flow: "break" };
      case "continue":
        return { flow: "continue" };
      case "fail":
        return { flow: "fail", error: flow.error };
      case "propagate":
        return { flow: "propagate", err: flow.err };
      case "cancel":
        return { flow: "cancel" };
    }
  }
  // A `<name>(args)` call whose callee resolves to a user `fn` executes the
  // function body in-process (FN-1…FN-5); it is not a host tool-call / invoke
  // effect, so it never reaches `checkpointFor`.
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
  // Composite literals are decomposed on the executor path (not the sync pure
  // host) so a nested `match` / `?` or an effect (query / tool-call / invoke /
  // user-`fn` call) in a field value or an array element runs through this same
  // evaluation path instead of the pure evaluator's `default: return null`
  // safety net (which would silently corrupt the value to `null`). A genuinely
  // pure object/array recurses to the same values the pure host would produce
  // (identical schema branding). Any field/element whose evaluation is a
  // non-`value` flow (a `?`-propagation, an effect `fail`, or a cancel)
  // short-circuits and carries that terminal flow verbatim.
  if (expr.kind === "array") {
    const values: ThetaValue[] = [];
    for (const element of expr.elements) {
      const evaluated = await evalExpr(element, env, deps);
      if (evaluated.flow !== "value") {
        return evaluated;
      }
      values.push(evaluated.value);
    }
    return { flow: "value", value: values };
  }
  if (expr.kind === "object") {
    const obj: Record<string, ThetaValue> = {};
    for (const field of expr.fields) {
      const evaluated = await evalExpr(field.value, env, deps);
      if (evaluated.flow !== "value") {
        return evaluated;
      }
      defineRecordField(obj, field.name, evaluated.value);
    }
    // Reorder into the declaring schema's DECLARATION order and brand, so
    // QRY-18 interpolation can recover the schema for outbound wire-name
    // translation and every downstream key-order consumer (`keys()`,
    // `values()`, `JSON.stringify`) agrees with the schema rather than with
    // this constructor's own field order (bug 0080 §Fix; mirrors the pure
    // host's `case "object"`).
    const value = buildObjectSchemaValue(obj, expr.typeName, (name) => env.resolveSchema(name));
    return { flow: "value", value };
  }
  // A pure OPERATOR node (`index` / `member` / `binary` / `ternary` /
  // `method-call`) whose operand subtree holds a control/effect form — typically
  // an inline composite such as `[<effect>][0]` or `{ f: <effect> }.f` written
  // with no intervening `let` — must have that operand evaluated through the
  // async executor. Handed wholesale to the sync pure host, the operand recurses
  // into `evaluatePureExpression`'s `default: return null` safety net (a silent
  // `null`, or a coerced derivative such as `"nullx"` for `+`). Each operand
  // subtree is routed through `evalExpr` (so a nested `match` / `?` / effect
  // dispatches through the single real path), any non-`value` flow short-circuits
  // and carries that terminal flow verbatim (identical to tail position), then
  // the SAME pure-operator primitive the pure host uses is applied to the
  // resolved operand values (`evaluateIndexAccess` / `evaluateMemberAccess` /
  // `valuesEqual` + the arithmetic disposition / the stdlib member surface).
  // Semantics are preserved exactly: `&&` / `||` short-circuit, a ternary
  // evaluates ONLY the taken branch, and a method-call evaluates receiver-then-
  // args left-to-right. A genuinely-pure operator produces the identical value
  // the pure host would (same primitives), so valid pure thetas are unaffected.
  if (expr.kind === "index") {
    const target = await evalExpr(expr.target, env, deps);
    if (target.flow !== "value") {
      return target;
    }
    const index = await evalExpr(expr.index, env, deps);
    if (index.flow !== "value") {
      return index;
    }
    const key = typeof index.value === "number" ? index.value : String(index.value);
    return { flow: "value", value: evaluateIndexAccess(target.value, key) };
  }
  if (expr.kind === "member") {
    // `Enum.Variant`: a member on a non-local ident naming a registered enum is a
    // pure enum-value read (runtime-value-model.md), NOT a member access on a
    // target value — no effect can nest, so short-circuit to the variant
    // (mirrors the pure host's `case "member"`).
    if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
      const variant = env.resolveEnumVariant(expr.target.name, expr.field);
      if (variant !== undefined) {
        return { flow: "value", value: variant };
      }
    }
    const target = await evalExpr(expr.target, env, deps);
    if (target.flow !== "value") {
      return target;
    }
    return { flow: "value", value: evaluateMemberAccess(target.value, expr.field) };
  }
  if (expr.kind === "ternary") {
    const condition = await evalExpr(expr.condition, env, deps);
    if (condition.flow !== "value") {
      return condition;
    }
    // Only the taken branch is evaluated — a not-taken effect never dispatches.
    // The enclosing position carries through: a ternary is a pass-through, not
    // a boundary, so a DIRECT effect in the taken branch inherits it.
    return evalExpr(condition.value === true ? expr.consequent : expr.alternate, env, deps, atTerminal);
  }
  if (expr.kind === "binary") {
    return evalBinary(expr, env, deps);
  }
  if (expr.kind === "method-call") {
    const receiver = await evalExpr(expr.target, env, deps);
    if (receiver.flow !== "value") {
      return receiver;
    }
    const args: ThetaValue[] = [];
    for (const arg of expr.args) {
      const evaluated = await evalExpr(arg, env, deps);
      if (evaluated.flow !== "value") {
        return evaluated;
      }
      args.push(evaluated.value);
    }
    return { flow: "value", value: applyStdlibMethod(receiver.value, expr.method, args) };
  }
  // `Ok(arg)` / `Err(arg)`: the constructor argument is the same class of nested
  // position — an inline composite / effect handed to the sync pure host hits the
  // `null` safety net. Decompose the argument on the executor and reconstruct the
  // Result (mirrors the pure host's `case "result-ctor"`).
  if (expr.kind === "result-ctor") {
    const arg = await evalExpr(expr.arg, env, deps);
    if (arg.flow !== "value") {
      return arg;
    }
    return { flow: "value", value: expr.ctor === "Ok" ? makeOk(arg.value) : makeErr(arg.value) };
  }

  const checkpoint = deps.host.checkpointFor(expr);
  if (checkpoint === null) {
    // Pure, synchronous, non-checkpointed work — runs to completion regardless
    // of the abort signal (a straight-line statement boundary is not a
    // checkpoint).
    return { flow: "value", value: deps.host.evaluatePure(expr, env) };
  }

  // A checkpointed effect: segment it onto the real `runCancellableSequence` so
  // the effect gates on `Checkpoint.before(kind, site)` and the pre-dispatch
  // signal read. Each checkpointed effect is its own single-statement sequence
  // so a preceding effect's completed `Err` short-circuits the walk before the
  // next effect is entered (see notes.md — per-effect sequencing decision).
  //
  // RFC 0002: a Pi-tool call's computed field values evaluate left-to-right
  // before dispatch. Pre-evaluating them here (before the outer effect's
  // checkpoint fires) makes a field's nested effect dispatch in source order and
  // a field `?` early-return abort the outer call before it is dispatched.
  const preArgs = await preEvaluateToolArgs(expr, env, deps);
  if (!preArgs.ok) {
    return preArgs.flow;
  }
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(expr, env, preArgs.args),
  };
  const outcome = await runCancellableSequence(
    { checkpoint: deps.checkpoint, signal: deps.signal },
    [statement],
  );
  const result = outcome.result;
  if (result.ok) {
    return { flow: "value", value: result.value as ThetaValue };
  }
  if (result.error.kind === "cancelled") {
    // A mid-stream cancellation: turns Pi has committed remain final — the
    // runtime mutates no committed surface and injects no compensating turn
    // (ERR-8 / ERR-9 / ERR-10 / ERR-12). `handlePartialTerminalOutcome` calls
    // nothing on the mutator; routing through it makes the contract explicit.
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return { flow: "cancel" };
  }
  // Handledness is judged AT CONSUMPTION (QRY-8 / error-model.md:10), not at the
  // effect site: a value position (let-init, array element, object field, ctor
  // arg, …) binds the failure as `Err(error)` so a downstream `match`/`?` can
  // observe it — the caller has not yet discarded or returned it, so it is not
  // unhandled. Only a terminal / returning / discarding position (a bare tail,
  // a bare action statement, a `return` operand) reaches `fail`: there the `Err`
  // has nowhere further to be consumed, exactly as a `?`-propagation carries its
  // `Err` — not a fabricated `cancelled` — through the body's terminal `Result`
  // (ERR-19).
  if (!atTerminal) {
    return { flow: "value", value: makeErr(result.error as unknown as ThetaValue) };
  }
  return { flow: "fail", error: result.error as unknown as ThetaValue };
}

/**
 * Decompose a `binary` node on the executor so an operand subtree holding a
 * control/effect form dispatches through `evalExpr`. The evaluation order and
 * short-circuit are the pure host's `evaluateBinaryExpression`
 * (production-theta-producer.ts) verbatim: `!` / unary `-` (the parser models
 * both as a binary; unary `-` has a synthetic `null` left) evaluate only the
 * right operand and are checked before the left is evaluated; `&&` / `||`
 * evaluate the right operand only when the left does not decide the result (so
 * a short-circuited operand's effect never dispatches); every other operator
 * evaluates left-then-right and applies the scalar disposition. Any operand
 * whose evaluation is a non-`value` flow short-circuits and carries that
 * terminal flow verbatim.
 */
async function evalBinary(expr: BinaryExpr, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  if (expr.op === "!") {
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    return { flow: "value", value: !(right.value as boolean) };
  }
  if (expr.op === "-" && expr.left.kind === "null") {
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    return { flow: "value", value: -(right.value as number) };
  }
  const left = await evalExpr(expr.left, env, deps);
  if (left.flow !== "value") {
    return left;
  }
  if (expr.op === "&&") {
    if (left.value !== true) {
      return { flow: "value", value: false };
    }
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    return { flow: "value", value: right.value === true };
  }
  if (expr.op === "||") {
    if (left.value === true) {
      return { flow: "value", value: true };
    }
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    return { flow: "value", value: right.value === true };
  }
  const right = await evalExpr(expr.right, env, deps);
  if (right.flow !== "value") {
    return right;
  }
  return { flow: "value", value: applyBinaryScalar(expr.op, left.value, right.value) };
}

/**
 * Apply a non-short-circuit binary operator to resolved operands — the exact
 * disposition of the pure host's `evaluateBinaryExpression` and the V3a
 * expression-evaluator (`expression-evaluator.ts`): structural `==` / `!=` via
 * the shared V2c `valuesEqual` relation (a cross-type pair is `false`, never a
 * panic), string `+` concatenation vs IEEE-754 addition, non-panicking div/mod,
 * and signed-IEEE-754 / UTF-16 ordering (expressions.md §Equality / §Ordering /
 * §"Other arithmetic"). Reuses the same `valuesEqual` primitive as the pure host
 * so the two paths cannot diverge.
 */
function applyBinaryScalar(op: string, left: ThetaValue, right: ThetaValue): ThetaValue {
  switch (op) {
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    case "+":
      return typeof left === "string" && typeof right === "string"
        ? left + right
        : (left as number) + (right as number);
    case "-":
    case "*":
    case "/":
    case "%": {
      // Bug 0332 belt: the parse-time gate
      // (`type-layer-checks.ts`'s `checkArithmeticOperands`) refuses a
      // statically-resolvable non-numeric pair before this runs; a pair it
      // DEFERRED on (an unannotated fn param, WITHHELD) can still reach here,
      // so a non-number operand throws loudly rather than being cast and
      // JS-coerced (the original silent-`NaN`/small-integer defect). `NaN` is
      // `typeof "number"` and is NOT caught here — `1 % 0` → `NaN` and
      // `3 / 0` → `Infinity` stay the spec's non-panicking div/mod behaviour.
      if (typeof left !== "number" || typeof right !== "number") {
        throw new BinaryNonNumericError(op, left, right);
      }
      switch (op) {
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
      }
    }
    case "<":
      return (left as number | string) < (right as number | string);
    case "<=":
      return (left as number | string) <= (right as number | string);
    case ">":
      return (left as number | string) > (right as number | string);
    case ">=":
      return (left as number | string) >= (right as number | string);
    default:
      return null;
  }
}

/**
 * Dispatch a stdlib method on resolved operands by the receiver's runtime type —
 * mirrors the pure host's `evaluateStdlibMethod`, reusing the same exported
 * member surfaces (`stdlib-string` / `stdlib-array` / `stdlib-object`); a
 * non-string/array/object receiver yields the inert `null`. An enum value or a
 * `Result` value satisfies the object arm's `typeof` test but is gated ahead of
 * `evaluateObjectMember` (bug 0027 §Fix): neither is an object value in the
 * language's sense, so the call rejects with `theta/runtime/non-object-receiver`
 * rather than answering the carrier's own enumerable properties. This
 * effectful executor and the pure host's `evaluateStdlibMethod`
 * (production-theta-producer.ts) move in lockstep — a gate on one alone leaves
 * the other leaking.
 */
function applyStdlibMethod(receiver: ThetaValue, method: string, args: readonly ThetaValue[]): ThetaValue {
  if (typeof receiver === "string") {
    return evaluateStringMember(receiver, method, args);
  }
  if (Array.isArray(receiver)) {
    return evaluateArrayMember(receiver, method, args);
  }
  if (typeof receiver === "object" && receiver !== null) {
    if (!isObjectValue(receiver)) {
      throw nonObjectReceiverRejection(`.${method}()`, receiver);
    }
    return evaluateObjectMember(receiver as { readonly [k: string]: ThetaValue }, method, args);
  }
  return null;
}

/**
 * Evaluate an expression *as a theta `Result` value* — the operand of `?` and the
 * scrutinee of `match`, both of which operate on `Result` values. A checkpointed
 * effect (query / tool-call / invoke) is dispatched through the real host (so
 * the live resolvers fire for `?`- and `match`-wrapped calls — the "look through
 * `try`/`match` to the inner effect" obligation) and its outcome is normalised
 * to a `Result`:
 *
 *   - a clean dispatch whose value is already a `Result` flows through verbatim
 *     (tool-call / invoke / a bare query that already models `Result`); any
 *     other clean value is wrapped `Ok(value)` (a query's plain terminating
 *     text / typed value);
 *   - a non-cancel effect `Err` (a query exhaustion / validation failure) is
 *     surfaced as the theta `Err(error)` so `?` propagates it and `match` can
 *     catch it;
 *   - a cancellation surfaces the cancel flow (never a `Result`).
 *
 * A pure operand is evaluated through the host and returned verbatim — a
 * `match` scrutinee is whatever value the pure expression produced, and a `?`
 * operand's `Result`-ness is enforced at the unwrap by the ERR-18 parse gate
 * plus `evalTry`'s brand guard (bug 0019: the gate is partial for
 * statically-unresolvable operand types, so the guard is what keeps a raw
 * non-`Result` from reaching the unwrap).
 *
 * `wrapInlineComposites` (default `true`) governs bullet-1 only, and only for
 * the non-`fn`-call kinds: a user-`fn` call is a fallible-computation boundary
 * (FN-5's value is the fn's own final value, so the caller normalises to
 * total `Ok`/`Err` coverage for `?` propagation — CONV-6, bug 0017) and stays
 * wrapped regardless of this flag. An inline object/array literal or a nested
 * `try`/`match` is not a boundary — it is the scrutinee's own value — so
 * `evalMatch` passes `false` to see it raw for by-value arm matching (bug
 * 0316); `evalTry` leaves the default so every `?` operand still normalises.
 */
async function evalAsResult(
  operand: Expr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  wrapInlineComposites = true,
): Promise<EvalResult> {
  // Bullet-1: a nested `try` / `match`, an inline object / array literal, or a
  // user-`fn` call, all evaluated through the executor. Only a user-`fn` call
  // is a fallible-computation boundary whose value is normalised to a `Result`
  // unconditionally; the composite / control-flow kinds normalise only when
  // `wrapInlineComposites` (the header explains why `evalMatch` opts out).
  if (
    operand.kind === "try" ||
    operand.kind === "match" ||
    operand.kind === "object" ||
    operand.kind === "array" ||
    (operand.kind === "call" && resolveUserFn(operand.callee, env) !== undefined)
  ) {
    const isUserFnCall = operand.kind === "call" && resolveUserFn(operand.callee, env) !== undefined;
    const inner = await evalExpr(operand, env, deps);
    if (inner.flow !== "value") {
      return inner;
    }
    const wrap = isUserFnCall || wrapInlineComposites;
    return { flow: "value", value: wrap ? asResultValue(inner.value) : inner.value };
  }

  // A pure OPERATOR expression as the `?`-operand / `match`-scrutinee: evaluate
  // it through the async executor so a nested inline-composite effect (e.g.
  // `[someQuery()][0]`) dispatches, and return the RAW resolved value. NO
  // `asResultValue` wrap — `match` needs the true scrutinee value (wrapping a
  // non-Result value in `Ok(...)` would break by-value arm matching); a `?`
  // operand's `Result`-ness is enforced at the unwrap by ERR-18 plus
  // `evalTry`'s brand guard (bug 0019 — the raw value may be a non-`Result`
  // the partial gate could not classify, and the guard rejects it loudly
  // instead of letting the unwrap corrupt). `evalExpr` fully handles
  // these kinds (bullet-2), carrying short-circuit / fail / cancel flows and the
  // same branding primitives as the pure host, so value/branding cannot diverge.
  if (
    operand.kind === "index" ||
    operand.kind === "member" ||
    operand.kind === "binary" ||
    operand.kind === "ternary" ||
    operand.kind === "method-call" ||
    operand.kind === "result-ctor"
  ) {
    return evalExpr(operand, env, deps);
  }

  const checkpoint = deps.host.checkpointFor(operand);
  if (checkpoint === null) {
    return { flow: "value", value: deps.host.evaluatePure(operand, env) };
  }

  // RFC 0002: pre-evaluate a Pi-tool call's computed field values left-to-right
  // before the outer effect dispatches (see `preEvaluateToolArgs`), so a
  // `?`- or `match`-wrapped Pi-tool call honours the same field ordering and
  // field-`?` abort as a bare call.
  const preArgs = await preEvaluateToolArgs(operand, env, deps);
  if (!preArgs.ok) {
    return preArgs.flow;
  }
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(operand, env, preArgs.args),
  };
  const outcome = await runCancellableSequence(
    { checkpoint: deps.checkpoint, signal: deps.signal },
    [statement],
  );
  const result = outcome.result;
  if (result.ok) {
    return { flow: "value", value: asResultValue(result.value as ThetaValue) };
  }
  if (result.error.kind === "cancelled") {
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return { flow: "cancel" };
  }
  // A non-cancel effect failure is the theta `Err(error)` — the `Result` value
  // `?` propagates and `match` dispatches on.
  return { flow: "value", value: makeErr(result.error as unknown as ThetaValue) };
}

/** Normalise an effect's clean value to a `Result`: a `Result` passes through, else `Ok(value)`. */
function asResultValue(value: ThetaValue): ResultValue {
  return isResultValue(value) ? value : makeOk(value);
}

/**
 * Evaluate `operand?` (ERR-18 / expressions.md §`?` operator): dispatch the
 * operand to its `Result`, then apply the sync V4b `?` propagation —
 * `Ok(v)` yields `v`, `Err(e)` early-returns the body with `Err(e)` (the
 * `propagate` flow). A panic thrown while producing the operand bypasses `?`
 * unchanged.
 */
async function evalTry(expr: TryExpr, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  const operand = await evalAsResult(expr.operand, env, deps);
  if (operand.flow !== "value") {
    return operand;
  }
  // Bug 0019 belt-and-braces: the guard lives HERE, not in `evalAsResult` —
  // that path also serves `match` scrutinees, which legitimately need the raw
  // non-`Result` value for by-value arm matching. And it sits AFTER
  // `evalAsResult` so bullet-1 operands (object / array / user-`fn` call) are
  // already `asResultValue`-normalised (the pinned implicit-`Ok` wrap-unwrap
  // stays a silent success) and a genuine stored `Result` passes the brand
  // test. What remains is a value the partial ERR-18 gate could not classify
  // (member / index / identifier operands, unknowable-typed ingress):
  // blind-unwrapping it forges `Err(undefined)` or strips the payload, so
  // throw the defect instead.
  const rv = operand.value;
  if (!isResultValue(rv)) {
    throw new QuestionOperandDefectError(rv);
  }
  const q = evaluateQuestion(() => rv);
  if (q.kind === "value") {
    return { flow: "value", value: q.value };
  }
  return { flow: "propagate", err: q.err };
}

/**
 * Evaluate `match <scrutinee> { arm, … }` (expressions.md §`match` expression):
 * dispatch the scrutinee (an effect fires its real host), then apply the sync
 * V4a `evaluateMatch` — first matching arm wins, the selected arm's body is
 * evaluated with the pattern's bindings installed in a child scope. A
 * non-exhaustive match raises `MatchError` (a panic that bypasses `?`/`match`).
 */
async function evalMatch(
  expr: MatchExpr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  atTerminal: boolean = false,
): Promise<EvalResult> {
  const scrutinee = await evalAsResult(expr.scrutinee, env, deps, false);
  if (scrutinee.flow !== "value") {
    return scrutinee;
  }
  // V20e — pure/async evaluator unification. Select the matching arm and its
  // pattern bindings through the sync `V4a` pattern dispatch (`evaluateMatch`,
  // which still raises `MatchError` on a non-exhaustive scrutinee), but do NOT
  // evaluate the arm body inside that sync thunk: the selecting thunk only
  // records the chosen arm index and its bindings. The selected arm body is
  // then evaluated through the REAL executor (`evalExpr`) rather than the
  // producer's partial `evaluatePureExpression` — so a nested `match` in the arm
  // body, or an effectful expression (a user-`fn` call whose body dispatches an
  // effect, an `@`-query, a tool-call) in that pure sub-expression position,
  // resolves through the single `V19c` evaluation path instead of the partial
  // pure evaluator's `default: return null` safety net.
  let selection: { readonly index: number; readonly bindings: Bindings } | undefined;
  const arms: MatchArm[] = expr.arms.map((arm, index) => ({
    pattern: toRuntimePattern(arm.pattern),
    body: (bindings) => {
      selection = { index, bindings };
      // A sentinel: the real arm body runs asynchronously through `evalExpr`
      // below; `evaluateMatch`'s returned value is discarded.
      return null;
    },
  }));
  // Drives the `V4a` pattern dispatch + `MatchError` raise; the thunk above sets
  // `selection` for the first matching arm (a non-selected arm's body thunk is
  // never invoked).
  evaluateMatch(scrutinee.value, arms);
  // `evaluateMatch` returned normally, so a matching arm's thunk ran and set
  // `selection` (a non-exhaustive scrutinee would have thrown `MatchError`).
  const chosen = selection as { readonly index: number; readonly bindings: Bindings };
  const armEnv = env.child();
  for (const [name, value] of Object.entries(chosen.bindings)) {
    armEnv.defineLocal(name, value, false);
  }
  // The chosen arm's body inherits the `match`'s own enclosing position — a
  // DIRECT effect there is disposed exactly as if it stood where the `match`
  // itself stands (a `match` is a pass-through, not a boundary).
  return evalExpr((expr.arms[chosen.index] as MatchExpr["arms"][number]).body, armEnv, deps, atTerminal);
}

/** Map a parsed {@link PatternNode} onto the runtime `Pattern` dispatch shape. */
function toRuntimePattern(pattern: PatternNode): Pattern {
  switch (pattern.kind) {
    case "wildcard":
      return { kind: "wildcard" };
    case "identifier":
      return { kind: "identifier", name: pattern.name };
    case "literal":
      return { kind: "literal", value: pattern.value };
    case "constructor":
      return { kind: "constructor", ctor: pattern.ctor, inner: toRuntimePattern(pattern.inner) };
    case "object":
      return {
        kind: "object",
        fields: pattern.fields.map((f) => ({ name: f.name, pattern: toRuntimePattern(f.pattern) })),
      };
    case "array":
      return { kind: "array", elements: pattern.elements.map(toRuntimePattern) };
  }
}

// ---------------------------------------------------------------------------
// RFC 0003 — `par for` parallel fan-out
// ---------------------------------------------------------------------------

/**
 * The `par for` in-flight width throttle (control-flow.md CTRL-2 /
 * hard-ceilings.md #par-for-width-throttle): at most 64 iterations in flight
 * per loop. It is a per-loop scheduling bound, NOT a routing-class ceiling
 * (NOCEIL-5): reaching it queues rather than breaches.
 */
const PAR_FOR_THROTTLE = 64;

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
  const scope = env.bindIterationVariable(expr.variable, element);
  const collectedDiagnostics: Diagnostic[] = [];
  const baseHost = deps.host;
  // Wrap the host so each effect result's optional `childDiagnostics` transport
  // is captured for this iteration (RFC 0003 obligation (A)).
  const iterationHost: StatementEvalHost = {
    evaluatePure: (e, en) => baseHost.evaluatePure(e, en),
    checkpointFor: (e) => baseHost.checkpointFor(e),
    runEffect: async (e, en, args) => {
      const result = await baseHost.runEffect(e, en, args);
      const childDiagnostics = (
        result as { readonly childDiagnostics?: readonly Diagnostic[] }
      ).childDiagnostics;
      if (childDiagnostics !== undefined) {
        collectedDiagnostics.push(...childDiagnostics);
      }
      return result;
    },
    ...(baseHost.classifyCall !== undefined
      ? { classifyCall: baseHost.classifyCall.bind(baseHost) }
      : {}),
  };
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
      if (deps.signal.aborted) {
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
async function evalParFor(
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
    iterandValue = deps.host.evaluatePure(expr.iterand, env);
  } else {
    const iterand = await evalExpr(expr.iterand, env, deps);
    if (iterand.flow !== "value") {
      return iterand;
    }
    iterandValue = iterand.value;
  }
  const snapshot: readonly ThetaValue[] = Array.isArray(iterandValue)
    ? iterandValue
    : [];

  // CTRL-2 — resolve the in-flight width: `max` (evaluated once at loop entry)
  // only lowers the width, and the 64 throttle is the hard upper bound; a `max`
  // above the throttle clamps to it, a `max` below it lowers to it.
  let width = PAR_FOR_THROTTLE;
  if (expr.max !== null) {
    const maxResult = await evalExpr(expr.max, env, deps);
    if (maxResult.flow !== "value") {
      return maxResult;
    }
    if (typeof maxResult.value === "number") {
      // NaN passes `typeof === "number"` and stays on this branch untouched —
      // bug 0325's territory, not this fix's.
      const requested = Math.floor(maxResult.value);
      width = Math.max(1, Math.min(requested, PAR_FOR_THROTTLE));
    } else {
      // CTRL-2: `max` only ever LOWERS the width. A non-number operand value
      // (reached through the deferred/`unknown` static path) is unintelligible
      // as a width, so the panic-free floor is the clamp-to-1 disposition —
      // never the clause-absent 64 throttle, which would invert the clause's
      // one granted power.
      width = 1;
      deps.emitDiagnostic?.({
        severity: "error",
        code: "theta/runtime/par-max-non-integer",
        file: deps.file,
        range: expr.max.range,
        message: "'par for' max operand is not a number; in-flight width clamped to 1",
      });
    }
  }

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
      const element = snapshot[index] as ThetaValue;
      const outcome = await runParForIteration(expr, element, env, deps);
      if (outcome.kind === "whole-theta-cancel") {
        wholeThetaCancelled = true;
        return;
      }
      results[index] = outcome.result;
      childDiagnostics[index] = outcome.diagnostics;
    }
  };

  const workerCount = Math.min(width, n);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers); // allow: CTRL-2 — control-flow.md#par-for

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
  const collected: ThetaValue[] = new Array(n);
  for (let index = 0; index < n; index += 1) {
    collected[index] = results[index] ?? makeOk(null);
  }
  return { flow: "value", value: collected };
}

// ---------------------------------------------------------------------------
// Statement / block execution
// ---------------------------------------------------------------------------

/**
 * Execute one statement against `env`. Declaration statements (`fn` / `schema` /
 * `enum` / `import` / `export` / doc-comments) are hoisted / registered by
 * `V19b`'s environment at build time, so they are inert at execution time.
 */
async function executeStatement(stmt: Stmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<Flow> {
  switch (stmt.kind) {
    case "expr": {
      // A bare expression statement's value is discarded (no `let` binds it, no
      // downstream `match`/`?` can observe it) — a terminal/discarding position.
      const r = await evalExpr(stmt.expr, env, deps, true);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "tool-call": {
      // A bare action statement discards its result — terminal/discarding.
      const r = await evalExpr(stmt.call, env, deps, true);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "query": {
      // A bare action statement discards its result — terminal/discarding.
      const r = await evalExpr(stmt.query, env, deps, true);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "invoke": {
      // A bare action statement discards its result — terminal/discarding.
      const r = await evalExpr(stmt.invoke, env, deps, true);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "let": {
      let value: ThetaValue = null;
      if (stmt.init !== null) {
        const r = await evalExpr(stmt.init, env, deps);
        if (r.flow !== "value") {
          return terminalFlow(r);
        }
        value = r.value;
      }
      env.defineLocal(stmt.name, value, stmt.mutable);
      return { kind: "normal", value: null };
    }
    case "reassign": {
      const r = await evalExpr(stmt.value, env, deps);
      if (r.flow !== "value") {
        return terminalFlow(r);
      }
      const next =
        stmt.op === "=" ? r.value : applyCompound(stmt.op, env.resolve(stmt.target).value ?? null, r.value);
      env.writeBinding(stmt.target, next);
      return { kind: "normal", value: null };
    }
    case "if":
      return executeIf(stmt, env, deps);
    case "while":
      return executeWhile(stmt, env, deps);
    case "for":
      return executeFor(stmt, env, deps);
    case "break":
      return { kind: "break" };
    case "continue":
      return { kind: "continue" };
    case "return": {
      if (stmt.operand === null) {
        return { kind: "return", value: null };
      }
      // A `return` operand's `Err` is returned — unhandled per error-model.md:10
      // — a terminal/returning position.
      const r = await evalExpr(stmt.operand, env, deps, true);
      if (r.flow !== "value") {
        return terminalFlow(r);
      }
      return { kind: "return", value: r.value };
    }
    case "fn":
    case "schema":
    case "enum":
    case "import":
    case "export":
    case "doc-comment":
      // Declarations are hoisted / registered by `V19b`'s environment; inert here.
      return { kind: "normal", value: null };
  }
}

/**
 * Execute a `{ … }` block: walk its statements top-to-bottom, strictly
 * sequentially (each statement's effect commits before the next is entered —
 * `cka-50`), short-circuiting on the first non-`normal` control-flow signal;
 * then, if none fired, produce the block's final value (its tail expression, or
 * the literal `null` for a statement-terminated / empty block — FN-5).
 */
async function executeBlock(block: Block, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<Flow> {
  // A trailing bare-expression statement contributes the block's FN-5 final
  // value (V20e). The parser promotes a trailing bare expression form to the
  // block `tail` and leaves only lone call/invoke/query actions (and non-
  // expression statements) as trailing statements, so a bare-`expr` last
  // statement is tail-equivalent: it carries the value the same trailing
  // expression would if the AST recorded it as the tail. This keeps the
  // executor's final value invariant to the tail-vs-`expr`-statement encoding of
  // a trailing expression, so a `match` (or any expression) routed through the
  // executor at the block tail-position yields its value regardless of encoding.
  // A trailing action statement, or any other statement, still terminates the
  // block with the literal `null` (FN-5 statement-terminated body).
  let trailingExprValue: { readonly value: ThetaValue } | undefined;
  for (const stmt of block.statements) {
    const flow = await executeStatement(stmt, env, deps);
    if (flow.kind !== "normal") {
      return flow;
    }
    trailingExprValue = stmt.kind === "expr" ? { value: flow.value } : undefined;
  }
  if (block.tail !== null) {
    // A block's tail value flows onward: for a `let r = { … }` block-expr it is
    // that block's own value (still terminal for THIS block); for the body's
    // outer block it is the body's returned/discarded final value — either way
    // a terminal/returning/discarding position.
    const r = await evalExpr(block.tail, env, deps, true);
    return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
  }
  return { kind: "normal", value: trailingExprValue !== undefined ? trailingExprValue.value : null };
}

/** Execute a statement-form `if` / `else if` / `else` (control-flow.md). */
async function executeIf(stmt: IfStmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<Flow> {
  const condition = await evalExpr(stmt.condition, env, deps);
  if (condition.flow !== "value") {
    return terminalFlow(condition);
  }
  if (isTruthy(condition.value)) {
    return executeBlock(stmt.then, env.child(), deps);
  }
  if (stmt.otherwise === null) {
    return { kind: "normal", value: null };
  }
  // The `else` arm is a chained `IfStmt` (an `else if`) or an `else` `Block`.
  if ("statements" in stmt.otherwise) {
    return executeBlock(stmt.otherwise, env.child(), deps);
  }
  return executeIf(stmt.otherwise, env, deps);
}

/**
 * Build the `loop-iter` `CheckpointSite` for a loop statement from the theta
 * source file (`deps.file`) and the loop's own source span (CTRL-1 loop
 * construct), so a fired checkpoint identifies the loop by file + line.
 */
function loopIterSite(stmt: WhileStmt | ForStmt, deps: ExecuteBodyDeps): CheckpointSite {
  return { file: deps.file, line: stmt.range.start.line, column: stmt.range.start.column };
}

/**
 * Await the `loop-iter` cancellation checkpoint and read the abort signal
 * immediately before a loop iteration (cancellation.md §Granularity). Returns
 * `true` when the iteration must NOT run because the signal has fired — the
 * caller unwinds the loop with the cancel terminal outcome; an aborted loop
 * routes through `V4c`'s `handlePartialTerminalOutcome` so no Pi-committed
 * surface is mutated and no compensating turn is injected (ERR-8 … ERR-12),
 * mirroring the checkpointed-effect cancel path.
 */
async function loopIterCheckpoint(site: CheckpointSite, deps: ExecuteBodyDeps): Promise<boolean> {
  await deps.checkpoint.before("loop-iter", site);
  if (deps.signal.aborted) {
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return true;
  }
  return false;
}

/**
 * Execute a statement-form `while` loop. `break` / `continue` steer the loop;
 * `return` / `fail` / `cancel` unwind out of it. Immediately before each
 * iteration the executor awaits the `loop-iter` cancellation checkpoint and
 * reads `signal.aborted` (cancellation.md §Granularity): production wiring
 * yields one macrotask turn there so a compute-bound body with no genuine
 * `await` still lets the Pi-dispatched abort (a macrotask) flip
 * `thetaAbort.signal.aborted` and land before the next iteration; an observed
 * abort unwinds the loop with the cancel terminal outcome.
 */
async function executeWhile(
  stmt: WhileStmt,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<Flow> {
  const site = loopIterSite(stmt, deps);
  for (;;) {
    const aborted = await loopIterCheckpoint(site, deps);
    if (aborted) {
      return { kind: "cancel" };
    }
    const condition = await evalExpr(stmt.condition, env, deps);
    if (condition.flow !== "value") {
      return terminalFlow(condition);
    }
    if (!isTruthy(condition.value)) {
      return { kind: "normal", value: null };
    }
    const flow = await executeBlock(stmt.body, env.child(), deps);
    if (flow.kind === "break") {
      return { kind: "normal", value: null };
    }
    if (flow.kind === "continue" || flow.kind === "normal") {
      continue;
    }
    return flow;
  }
}

/**
 * Execute a statement-form `for x in <iterand>` loop (CTRL-1). The iterand is
 * evaluated exactly once at loop entry; the resulting `array<T>` snapshot is
 * then iterated through `V3c`'s real `evaluateForLoop` — the snapshot is fixed
 * before iteration, so a body-side `let mut` reassignment cannot change the
 * iterated sequence. Each iteration runs in a per-iteration fresh scope binding
 * the loop variable (bindings.md); `break` / `continue` steer the loop and
 * `return` / `fail` / `cancel` unwind out of it.
 */
async function executeFor(stmt: ForStmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<Flow> {
  const iterand = await evalExpr(stmt.iterand, env, deps);
  if (iterand.flow !== "value") {
    return terminalFlow(iterand);
  }
  const snapshot: readonly ThetaValue[] = Array.isArray(iterand.value) ? iterand.value : [];

  // Drive `V3c`'s real `evaluateForLoop` to fix the iteration order over the
  // snapshot (iterand evaluated exactly once — CTRL-1). The body's effects are
  // async, so the synchronous loop host captures each element in order; the
  // async body walk below honours `break` / `continue`.
  const plan: { readonly element: ThetaValue }[] = [];
  const host: ForLoopHost = {
    evaluateIterand: () => snapshot,
    runIteration: (element) => {
      plan.push({ element });
    },
  };
  evaluateForLoop(host);

  const site = loopIterSite(stmt, deps);
  for (const { element } of plan) {
    const aborted = await loopIterCheckpoint(site, deps);
    if (aborted) {
      return { kind: "cancel" };
    }
    const iterationScope = env.bindIterationVariable(stmt.variable, element);
    const flow = await executeBlock(stmt.body, iterationScope, deps);
    if (flow.kind === "break") {
      break;
    }
    if (flow.kind === "continue" || flow.kind === "normal") {
      continue;
    }
    return flow;
  }
  return { kind: "normal", value: null };
}

/**
 * Drive a `ThetaBody` top-to-bottom, strictly sequentially, against `deps`:
 * each statement's effect commits before the next statement is entered (no
 * statement runs ahead of a prior one — `cka-50`); each checkpointed
 * sub-expression is segmented onto `V17a`'s `runCancellableSequence` so the
 * five fixed checkpoint sites gate real work (`cka-47`) and a signal flipped
 * mid-body preempts at the next checkpointed sub-expression while a
 * straight-line statement boundary is not a checkpoint; `for` loops drive
 * `V3c`'s real `evaluateForLoop` (CTRL-1); the body's tail expression / explicit
 * `return` / empty body yield the FN-5 final value; and a mid-stream terminal
 * event routes through `V4c`'s `handlePartialTerminalOutcome` so no Pi-committed
 * surface is mutated and no compensating turn is injected (ERR-8 … ERR-12).
 */
export async function executeBody(body: ThetaBody, deps: ExecuteBodyDeps): Promise<BodyExecution> {
  const flow = await executeBlock(body, deps.env, deps);
  switch (flow.kind) {
    case "return":
      return { outcome: "success", result: functionResult("success", flow.value) };
    case "normal":
      return { outcome: "success", result: functionResult("success", flow.value) };
    case "fail":
      // An unhandled non-cancel effect `Err` terminated the body. Surface the
      // effect's own terminating error as `BodyExecution.error` so the mode's
      // `surface` projects the real `Err` (ERR-19 payload preserved) instead of
      // fabricating a `cancelled` — exactly as the `propagate` arm below.
      return { outcome: "fail", result: functionResult("fail", null), error: flow.error };
    case "propagate":
      // A `?`-propagation (ERR-18): the body's terminal `Result` is `Err(err)`;
      // no FN-5 final value flows, but the propagated `Err` is carried so the
      // mode's `surface` returns it (not a fabricated cancel).
      return { outcome: "fail", result: functionResult("fail", null), error: flow.err };
    case "cancel":
      return { outcome: "cancel", result: functionResult("cancel", null) };
    case "break":
    case "continue":
      // A `break` / `continue` with no enclosing loop completes the body
      // normally with the literal `null` final value (FN-5).
      return { outcome: "success", result: functionResult("success", null) };
  }
}
