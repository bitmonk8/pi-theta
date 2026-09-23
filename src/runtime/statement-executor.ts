// V19c / V19c-T — the theta tree-walking statement executor.
//
// This module drives statements and expressions, delegating par-for, defects,
// and subagent calls to sibling modules. `executeBody(body, deps)` walks
// `V19a`'s parsed `ThetaBody` statement AST
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

import {
  CompoundNonNumericError,
  BinaryNonNumericError,
  UnaryNonNumericError,
  BinaryMixedOperandError,
  ForIterandKindDefectError,
  BooleanPositionKindDefectError,
  IndexKindDefectError,
  RejectedWriteDefectError,
  UnknownVariantDefectError,
} from "./executor-defects";
export * from "./executor-defects";
import { evalParFor } from "./par-for-executor";
export { evalParFor } from "./par-for-executor";
import { evalSubagentFnCall } from "./subagent-fn-call";
export { evalSubagentFnCall } from "./subagent-fn-call";

import type {
  BinaryExpr,
  Block,
  CallExpr,
  Expr,
  FnDecl,
  ForStmt,
  IfStmt,
  ThetaBody,
  MatchExpr,
  PatternNode,
  Stmt,
  SubagentSessionConfig,
  TryExpr,
  WhileStmt,
} from "../parser/theta-document";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../seams/checkpoint";
import type { Trace, TraceSettle } from "../seams/trace";
import type { ParForLaneHooks } from "../extension/execution-status/types";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { CancellableStatement, OperationResult } from "./cancellation-core";
import { runCancellableSequence, type CancellableSequenceOutcome } from "./cancellation-core";
import { isThetaPanic, attachPanicSite, pushPanicFrame } from "./runtime-panics";
import type { InvokeChain } from "./invoke-depth-cycle";
import { pushCountableFrame, thetalibFnFrameKind } from "./invoke-depth-cycle";
import type { InvokeResultSource } from "./invoke-cancellation";
import type { FnTail } from "./subagent-envelope";
import type { RuntimeEvent } from "./runtime-event-channel";
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
import { selectMatchArm, type MatchSelection, type Pattern } from "./match-result";
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
 * The file a panic site or frame names (bug 0476): the current module
 * residence for an imported `.thetalib` fn body (the leaf-location rule of
 * error-model.md §Runtime panics), else the theta's on-disk path, else the
 * slash-name stamp for in-memory fixtures.
 */
export function panicSiteFile(env: LexicalEnvironment, deps: ExecuteBodyDeps): string {
  return env.currentResidence() ?? deps.sourcePath ?? deps.file;
}

/**
 * RFC 0015 — publish an effect's trace at its dispatch, beside (never inside)
 * the effect's `Checkpoint.before`. The published site keeps the checkpoint
 * site's line/column but swaps its `file` for the panic-site residence rule:
 * checkpoint sites are built from `baseDeps.file` (the slash name), which is
 * NOT the run card's heat key — a bus-side join is unsound (interleaved
 * `par for` lanes, cross-file same-line collisions), so the executor hands
 * D2 a self-sufficient residence-keyed `(file, line, kind)` stream instead
 * (src/seams/trace.ts §"D1→D2 contract"). Fires before the pre-dispatch
 * signal read, so a cancelled-before-commit effect still marks its line as
 * reached.
 *
 * RFC 0015 D7: returns the seam's span-settle callback (src/seams/trace.ts
 * §"D7 span semantics"). The two awaited-effect callers hold it across their
 * `runCancellableSequence` await and call it in a `finally` — the settle
 * design (a closure returned at dispatch, not a second seam function keyed by
 * site) makes the pairing structural: each publication settles exactly
 * itself, so concurrent `par for` lanes on the same source line cannot
 * cross-settle and no lane identity is needed. The per-iteration `loop-iter`
 * callers DISCARD the return value: a loop boundary is an instant, not a
 * bracketed wait (the seam contract returns `undefined` there).
 */
function traceEffectDispatch(
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  kind: CheckpointKind,
  site: CheckpointSite,
): TraceSettle | undefined {
  return deps.trace?.(
    { file: panicSiteFile(env, deps), line: site.line, column: site.column },
    kind,
  );
}

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
  evaluatePure(expr: Expr, env: LexicalEnvironment, chain?: InvokeChain): ThetaValue;
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
    chain?: InvokeChain,
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
  classifyCall?(expr: CallExpr, env: LexicalEnvironment): "pi-tool" | "theta-callable" | "runtime-tool";
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
   * RFC 0012 §10 — the PRODUCTION `subagent fn` call: the body runs in a
   * spawned child `pi` process (the calling theta's slug re-discovered and
   * re-parsed there; the fn resolved by name; the arguments marshalled on the
   * PIC-60 params channel), and the call evaluates to the outcome the child's
   * envelope carried — the same `runInvokeChild` trampoline a `.theta` callable
   * call drives through. When present the in-memory session-switch hooks below
   * are NEVER consulted for a `subagent fn` call; the body does not run in this
   * process at all (D4: no in-process fallback in production).
   */
  runSubagentFnChild?(request: SubagentFnChildRequest, chain?: InvokeChain): Promise<SubagentFnChildOutcome>;
  /**
   * RFC 0001 (`subagent fn`) in-memory session-switch hooks — the test-double
   * posture for hosts with no child-process substrate. Around a `subagent fn`
   * CALL the executor enters a fresh isolated subagent session for the body
   * (`spawnSubagentSession`) and discards it on return (`exitSubagentSession`,
   * positional — sessions nest LIFO), so the body's `@` queries / calls target
   * the spawned session and the caller's conversation stays unpolluted (FN-6). The
   * spawned session's configuration (`system` / `model` / `tools`, FN-7) is
   * inherit-then-`with`-override resolved on the `subagent fn` node. Optional:
   * a host with no isolation substrate omits both, and a `subagent fn` body then
   * runs against the same host with no session switch. Production supplies
   * `runSubagentFnChild` instead and never these.
   */
  spawnSubagentSession?(config: SubagentSessionConfig, chain?: InvokeChain): void | Promise<void>;
  exitSubagentSession?(): void | Promise<void>;
}

/**
 * RFC 0012 §10 — what the executor hands the production host for one
 * `subagent fn` call: the resolved declaration, the caller-evaluated positional
 * arguments (by value, FN-6), the call expression (its `with { cwd }` clause,
 * RFC 0009 Erratum B, is the host's to evaluate against `env`), and the
 * checkpoint site the invoke trampoline gates on.
 */
export interface SubagentFnChildRequest {
  readonly fn: FnDecl;
  readonly args: readonly ThetaValue[];
  readonly call: CallExpr;
  readonly env: LexicalEnvironment;
  readonly site: CheckpointSite;
}

/**
 * RFC 0012 §10 — the child's outcome as the trampoline surfaces it: the
 * envelope's `Result` with its provenance (`InvokeResultSource`, bug 0294) and
 * the `fn_tail` marker (`subagent-envelope.ts`) naming a `Result`-valued body
 * tail; or a pre-spawn cancellation observed at the invoke checkpoint.
 */
export type SubagentFnChildOutcome =
  | {
      readonly kind: "value";
      readonly result: ResultValue;
      readonly source: InvokeResultSource;
      readonly fnTail?: FnTail;
    }
  | { readonly kind: "cancelled" };

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
   * The theta's on-disk source path, when it has one (bug 0476). A panic
   * site or frame raised in the TOP-LEVEL body names this file — `file` above
   * is the slash name the checkpoint and runtime-diagnostic stamps use, which
   * is not a path a human can open. An imported `.thetalib` fn body names its
   * own declaring file through `LexicalEnvironment.currentResidence()` (the
   * leaf-location rule), so this is only the root body's residence. Absent for
   * in-memory fixtures, which fall back to `file`.
   */
  readonly sourcePath?: string;
  /**
   * The runtime-diagnostic channel (bug 0324): `evalParFor`'s width resolve
   * calls this on a non-number `max` value (the clamp-to-1 disposition) so the
   * clamp is not silent. OPTIONAL because existing constructors of this
   * interface omit it; a required field would flip every one of them outside
   * this fix's enumerated scope.
   */
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  /**
   * The per-chain INV-4 depth counter (bug 0354), passed down so
   * `evalUserFnCall` can push a countable frame for a CROSS-FILE `.thetalib`
   * `fn` call before its body runs. OPTIONAL because existing constructors of
   * this interface omit it (the `emitDiagnostic?` precedent) — a required
   * field would flip every one of them outside this fix's enumerated scope.
   * Immutable value passed down (never a mutable global), so sibling invokes
   * never share budget.
   */
  readonly invokeChain?: InvokeChain;
  /**
   * RFC 0010 (execution-status.md EXST-3(c)): the `par for` lane-set producer
   * hooks, threaded from the bound invocation's executeDeps. OPTIONAL because
   * existing constructors of this interface omit it (the `emitDiagnostic?` /
   * `invokeChain?` precedent) — a required field would flip every one of them
   * outside this seam's enumerated scope. `evalParFor` opens a lane set and
   * drives `claim`/`settle`/`close` around each lane body (see
   * docs/spec_topics/execution-status.md EXST-3 lane lifecycle).
   */
  readonly statusLanes?: ParForLaneHooks;
  /**
   * RFC 0015 (D1) — the optional statement-trace observability seam. Called
   * with kind `"stmt"` at every statement dispatch (the statement's own
   * source site) and with the effect's `CheckpointKind` at every effect
   * dispatch, beside — never inside — that effect's `checkpoint.before`
   * (`traceEffectDispatch`). OPTIONAL because the print/json/child
   * compositions never wire it (the `statusLanes?` precedent): absent, the
   * cost is one undefined-check per publication site. It gates nothing —
   * cancellation stays exclusively on the `checkpoint` seam above. The
   * executor calls it bare: a throwing trace is a defective seam
   * implementation whose throw propagates to the nearest boundary exactly
   * like any other executor throw (a `par for` lane downgrades it to that
   * element's ERR-20 `Err`; only outside any boundary does it abort the
   * drive — contract in `src/seams/trace.ts`; containment, where wanted,
   * belongs in the composition-side wrapper).
   */
  readonly trace?: Trace;
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
  /**
   * The origin `RuntimeEvent` that produced `error` on the fail path (bug
   * 0399), when the failing effect already constructed one (currently: a
   * typed-query `validation` outcome, threaded from `OperationResult.event`
   * through the `fail` flow cascade). Absent otherwise. A composition-root
   * boundary passes this verbatim to its re-emission per PIC-1 (f) — never
   * re-derived.
   */
  readonly originEvent?: RuntimeEvent;
}

// ---------------------------------------------------------------------------
// Internal control-flow signal
// ---------------------------------------------------------------------------

/**
 * The control-flow signal one evaluated sub-expression, statement, or block
 * produces as the walk unwinds — the ONE union both the expression layer
 * (`evalExpr`) and the statement layer (`executeStatement` / `executeBlock`)
 * carry, so a non-`value` signal propagates through every boundary unchanged
 * (every `evalExpr` call site forwards a non-`"value"` result verbatim).
 *
 *   - `value`    — the evaluated value: a sub-expression's result, or the
 *     statement/block fall-through carrying the last evaluated value (a
 *     block's tail value, or `null`).
 *   - `return`   — an explicit `return expr` short-circuits the body to `value`.
 *   - `break` / `continue` — steer the nearest enclosing loop. From an
 *     expression, these and `return` are reachable only through a `BlockExpr`
 *     (bug 0082 §Fix) — the block's own statement list can carry any `Stmt`,
 *     including these three control-flow forms.
 *   - `fail`     — an unhandled non-cancel effect `Err` in tail/statement
 *     position (an unhandled `@`-query exhaustion / validation breach not
 *     consumed by a caller `match` and not `?`-propagated) — the
 *     `error-model.md` fail terminal outcome. It carries the effect's own
 *     terminating `QueryError` as `error` so the body's terminal `Result` is
 *     `Err(error)`, exactly as `propagate` carries a `?`-propagated `Err`; no
 *     FN-5 final value flows. (A runtime panic is a thrown `ThetaPanic`, not a
 *     `fail` flow, so it never reaches this variant.)
 *   - `propagate` — a `?`-propagation carrying its `Err` payload so the body's
 *     terminal `Result` is `Err(err)` (ERR-18 / FN-5 fail path).
 *   - `cancel`   — a mid-body cancellation surfaced at a checkpoint — the cancel
 *     terminal outcome; no final value flows (FN-5).
 */
export type EvalResult =
  | { readonly flow: "value"; readonly value: ThetaValue }
  | { readonly flow: "fail"; readonly error: ThetaValue; readonly event?: RuntimeEvent }
  | { readonly flow: "propagate"; readonly err: ThetaValue }
  | { readonly flow: "return"; readonly value: ThetaValue }
  | { readonly flow: "break" }
  | { readonly flow: "continue" }
  | { readonly flow: "cancel" };

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
  // dispatch effectful field values twice. A runtime-tool call
  // (tool-calls.md#session-control-runtime-tools) uses the `.theta`-callable
  // POSITIONAL convention — `compact("text")`, not `compact({ instructions:
  // "text" })` — and its dispatch arm (`resolveRuntimeToolCall`) evaluates
  // positional arguments itself; pre-evaluating here would either throw the
  // Pi-tool shape defect (non-object first arg) or double-evaluate through the
  // object-literal field path. Skip both (args left to their own dispatch).
  // An absent classifier treats the call as a Pi tool, preserving the
  // executor-double behaviour.
  const callKind = deps.host.classifyCall?.(expr, env);
  if (callKind === "theta-callable" || callKind === "runtime-tool") {
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
 * NOT as a host tool-call or an invoke. An INTRA-file `fn` call is unbounded
 * (hard-ceilings NOCEIL-3/-4); a CROSS-FILE `.thetalib` `fn` call IS a
 * countable INV-4 frame (bug 0354) — counted below via `thetalibFnFrameKind` /
 * `pushCountableFrame`, the same cap direct `invoke(...)` and `subagent fn`
 * calls push against. Each argument
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
  // INV-4 / ceiling #1 (invocation.md §INV-4): a CROSS-FILE `.thetalib` fn
  // frame is countable. The classifier is the spec's residence test — caller
  // file vs the callee's declaration residence (moduleEnv = the 0303
  // declaring-module carrier, so re-exports/as-aliases keep the DECLARING
  // file's residence). Push BEFORE the body runs so a breach panics at the
  // 33rd frame; the incremented chain flows into the body so nested cross-file
  // calls stack. An intra-file fn (moduleEnv undefined, or residence equal) is
  // NOT countable and inherits the parent chain unchanged.
  let bodyDeps = deps;
  if (moduleEnv !== undefined && deps.invokeChain !== undefined) {
    const kind = thetalibFnFrameKind({
      callerFile: env.currentResidence() ?? deps.file,
      calleeResidence: moduleEnv.currentResidence() ?? deps.file,
    });
    if (kind !== undefined) {
      try {
        bodyDeps = { ...deps, invokeChain: pushCountableFrame(deps.invokeChain, kind) };
      } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
        // The depth cap is breached BEFORE the frame opens (invocation.md
        // §INV-4), so this call expression — the one that WOULD have opened
        // it — is the panic's SITE, not a frame: no body ever ran.
        if (isThetaPanic(thrown)) {
          attachPanicSite(thrown, { file: panicSiteFile(env, deps), range: expr.range });
        }
        throw thrown;
      }
    }
  }
  let flow: EvalResult;
  try {
    flow = await executeBlock(fn.body, scope, bodyDeps);
  } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
    // The fn-call boundary: as the panic unwinds through this call, push the
    // CALL SITE (this caller's file, the call expression's own range) as a
    // frame — not the callee's declaration.
    if (isThetaPanic(thrown)) {
      pushPanicFrame(thrown, {
        kind: "fn",
        name: fn.name,
        file: panicSiteFile(env, deps),
        range: expr.range,
      });
    }
    throw thrown;
  }
  switch (flow.flow) {
    case "return":
    case "value":
      return { flow: "value", value: flow.value };
    case "break":
    case "continue":
      return { flow: "value", value: null };
    case "propagate":
      // A `?` inside the body returns from THIS `fn` with `Err(e)`; the call
      // evaluates to that `Err` value so an enclosing `?`/`match` sees it.
      return { flow: "value", value: makeErr(flow.err) };
    case "fail":
      return { flow: "fail", error: flow.error, ...(flow.event !== undefined ? { event: flow.event } : {}) };
    case "cancel":
      return { flow: "cancel" };
  }
}

/**
 * A boolean-position value (an `if`/`while`/ternary condition, or an operand
 * of `&&`/`||`/`!`) must be a boolean (expressions.md §Truthiness); the static
 * layer defers judgment on a statically-unresolvable value, so this is the
 * runtime's only re-judgment point for every consumer. A genuine boolean
 * passes through unchanged; a value the parse gate deferred on and that turns
 * out non-boolean is a bug 0369 loud defect, not a fabricated `false` (or, for
 * `!`, a JS-coerced negation).
 */
function requireBoolean(value: ThetaValue): boolean {
  if (typeof value !== "boolean") {
    throw new BooleanPositionKindDefectError(value);
  }
  return value;
}

/**
 * Apply a compound-assignment operator. `+=` mirrors `applyBinaryScalar`'s
 * `+` arm exactly (string+string concatenates, two-number addition, else the
 * bug 0368 belt) — the shared runtime semantics for `+`, since bindings.md
 * defines `x += e` as `x = x + e` and the parse-time `+`-operand gate has
 * already refused every statically-resolvable mixed pair; an unresolvable
 * pair defers and takes the same shared `+` arm as the spelled binary, so a
 * mixed pair laundered past the reassign gate must abort loudly rather than
 * silently coerce (bug 0368). `-=`/`*=`/`/=`/`%=` are numeric-only: a
 * non-number operand throws `CompoundNonNumericError` rather than silently
 * computing over a fabricated `0` (bug 0314).
 */
function applyCompound(
  op: "+=" | "-=" | "*=" | "/=" | "%=",
  current: ThetaValue,
  delta: ThetaValue,
): ThetaValue {
  if (op === "+=") {
    if (typeof current === "string" && typeof delta === "string") {
      return current + delta;
    }
    if (typeof current === "number" && typeof delta === "number") {
      return current + delta;
    }
    throw new BinaryMixedOperandError("+", current, delta);
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
export async function evalExpr(
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
  // the block's value is its tail expression's value; `executeBlock`'s own
  // `EvalResult` carries the block's flow (bug 0082 §Fix: `return` / `break` /
  // `continue` from a `BlockExpr` propagate through the expression chain).
  if (expr.kind === "block") {
    // The enclosing position threads down: a value-position block's tail is a
    // consumed value, not a returned/discarded one, so `executeBlock` must
    // dispose its tail query the same way this `block` expression itself is
    // disposed.
    return executeBlock(expr.body, env.child(), deps, atTerminal);
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
    const key = index.value;
    if (typeof key !== "number" && typeof key !== "string") {
      throw new IndexKindDefectError(key);
    }
    try {
      return { flow: "value", value: evaluateIndexAccess(target.value, key) };
    } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
      if (isThetaPanic(thrown)) {
        attachPanicSite(thrown, { file: panicSiteFile(env, deps), range: expr.range });
      }
      throw thrown;
    }
  }
  if (expr.kind === "member") {
    return resolveEnumMemberRead(expr, env, deps);
  }
  if (expr.kind === "ternary") {
    const condition = await evalExpr(expr.condition, env, deps);
    if (condition.flow !== "value") {
      return condition;
    }
    // Only the taken branch is evaluated — a not-taken effect never dispatches.
    // The enclosing position carries through: a ternary is a pass-through, not
    // a boundary, so a DIRECT effect in the taken branch inherits it.
    return evalExpr(
      requireBoolean(condition.value) ? expr.consequent : expr.alternate,
      env,
      deps,
      atTerminal,
    );
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

  return evalCheckpointedEffect(expr, env, deps, atTerminal);
}

/** Resolve an enum member or evaluate the member target through the executor. */
async function resolveEnumMemberRead(
  expr: Extract<Expr, { kind: "member" }>,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<EvalResult> {
  // `Enum.Variant`: a member on a non-local ident naming a registered enum is a
  // pure enum-value read (runtime-value-model.md), NOT a member access on a
  // target value — no effect can nest, so short-circuit to the variant
  // (mirrors the pure host's `case "member"`).
  if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
    const variant = env.resolveEnumVariant(expr.target.name, expr.field);
    if (variant !== undefined) {
      return { flow: "value", value: variant };
    }
    // Bug 0449: `undefined` is ambiguous ("not an enum" vs "registered enum,
    // unknown variant") by `resolveEnumVariant`'s own collapsed contract
    // (0185). A re-export chain's static walk withholds a variant verdict on
    // a chain-reached specifier, so the registered-enum half of that
    // ambiguity can reach this arm laundered past every static gate; only
    // THAT half fails loudly here — a genuinely non-enum ident (the
    // ambiguity's other half) still falls through to the value read below,
    // which is correct for a genuinely-null target (§Non-goal).
    if (env.isRegisteredEnum(expr.target.name)) {
      throw new UnknownVariantDefectError(expr.target.name, expr.field);
    }
  }
  const target = await evalExpr(expr.target, env, deps);
  if (target.flow !== "value") {
    return target;
  }
  try {
    return { flow: "value", value: evaluateMemberAccess(target.value, expr.field) };
  } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
    if (isThetaPanic(thrown)) {
      attachPanicSite(thrown, { file: panicSiteFile(env, deps), range: expr.range });
    }
    throw thrown;
  }
}

/** Dispatch the pure/checkpointed tail and dispose its outcome at consumption. */
async function evalCheckpointedEffect(
  expr: Expr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  atTerminal: boolean,
): Promise<EvalResult> {
  const checkpoint = deps.host.checkpointFor(expr);
  if (checkpoint === null) {
    // Pure, synchronous, non-checkpointed work — runs to completion regardless
    // of the abort signal (a straight-line statement boundary is not a
    // checkpoint).
    return { flow: "value", value: deps.host.evaluatePure(expr, env, deps.invokeChain) };
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
    run: () => deps.host.runEffect(expr, env, preArgs.args, deps.invokeChain),
  };
  const settleTrace = traceEffectDispatch(env, deps, checkpoint.kind, checkpoint.site);
  let outcome: CancellableSequenceOutcome;
  try {
    outcome = await runCancellableSequence(
      { checkpoint: deps.checkpoint, signal: deps.signal },
      [statement],
    );
  } finally {
    // RFC 0015 D7: the effect span settles when the awaited effect completes,
    // on EVERY path — value, `Err`-shaped outcome, cancellation, and a throw
    // unwinding this await (settle-then-propagate) — so the run card's
    // in-flight clamp on this line always releases with the effect.
    settleTrace?.();
  }
  const result = outcome.result;
  if (result.ok) {
    // Handledness/consumption symmetry with the failure branch below (QRY-8 /
    // query-forms.md QRY-1/QRY-2: both query forms return a `Result`): a value
    // position (let-init, reassignment RHS, array element, object field, ctor /
    // fn-call argument) binds the clean outcome as a `Result` VALUE so the
    // author's documented `match r { Ok(v) … }` / `let v = r?` consumption sees
    // an `Ok(payload)`, not the raw payload (which matches no ctor pattern and
    // fails the ERR-18 `?` brand guard). `asResultValue` mirrors the direct
    // `?`/`match` scrutinee route (`evalAsResult`) exactly, and is idempotent
    // for effects whose value is already a `Result` (tool-call / invoke /
    // `.theta`-callable), so only a query's raw payload/string is wrapped.
    // A terminal / returning / par-for position stays RAW: the body boundary
    // (`makeOk(flow.value)`) and the par-for element normaliser re-wrap the
    // clean value, so a bare tail `@`q`` / `return @`q`` yields `Ok(payload)`
    // without the double-wrap an unconditional wrap here would produce.
    if (!atTerminal) {
      return { flow: "value", value: asResultValue(result.value as ThetaValue) };
    }
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
  return {
    flow: "fail",
    error: result.error as unknown as ThetaValue,
    ...(result.event !== undefined ? { event: result.event } : {}),
  };
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
    return { flow: "value", value: !requireBoolean(right.value) };
  }
  if (expr.op === "-" && expr.unary === true) {
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    if (typeof right.value !== "number") {
      throw new UnaryNonNumericError(right.value);
    }
    return { flow: "value", value: -right.value };
  }
  const left = await evalExpr(expr.left, env, deps);
  if (left.flow !== "value") {
    return left;
  }
  if (expr.op === "&&") {
    if (!requireBoolean(left.value)) {
      return { flow: "value", value: false };
    }
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    return { flow: "value", value: requireBoolean(right.value) };
  }
  if (expr.op === "||") {
    if (requireBoolean(left.value)) {
      return { flow: "value", value: true };
    }
    const right = await evalExpr(expr.right, env, deps);
    if (right.flow !== "value") {
      return right;
    }
    return { flow: "value", value: requireBoolean(right.value) };
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
    case "+": {
      // Bug 0368 belt: the parse-time gate (`type-layer-checks.ts`'s
      // `checkPlusOperands`) refuses a statically-resolvable mixed pair
      // before this runs; a pair it DEFERRED on (an unannotated fn param,
      // WITHHELD) can still reach here, so anything other than two strings
      // or two numbers throws loudly rather than JS-coercing (the original
      // defect: `"x" + 1` → `"x1"`, `null + 5` → `5`). `NaN`/`Infinity` are
      // `typeof "number"` and stay admitted — `1 % 0` → `NaN` and `3 / 0` →
      // `Infinity` flow through `+` unbelted, per the spec's non-panicking
      // div/mod behaviour.
      if (typeof left === "string" && typeof right === "string") {
        return left + right;
      }
      if (typeof left === "number" && typeof right === "number") {
        return left + right;
      }
      throw new BinaryMixedOperandError("+", left, right);
    }
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
    case "<=":
    case ">":
    case ">=": {
      // Bug 0368 belt: the parse-time gate (`type-layer-checks.ts`'s
      // `checkOrderingOperands`) refuses a statically-resolvable
      // non-orderable pair before this runs; a pair it DEFERRED on (an
      // unannotated fn param, WITHHELD) can still reach here, so anything
      // other than two numbers or two strings throws loudly rather than
      // applying raw JS relational coercion (the original defect: `true < 2`
      // → `true`, `"5" < 3` → `false`). `NaN`/`Infinity` are `typeof
      // "number"` and stay admitted — ordering over a div/mod-by-zero product
      // is the spec's non-panicking behaviour.
      const bothNumbers = typeof left === "number" && typeof right === "number";
      const bothStrings = typeof left === "string" && typeof right === "string";
      if (!bothNumbers && !bothStrings) {
        throw new BinaryMixedOperandError(op, left, right);
      }
      switch (op) {
        case "<":
          return (left as number | string) < (right as number | string);
        case "<=":
          return (left as number | string) <= (right as number | string);
        case ">":
          return (left as number | string) > (right as number | string);
        case ">=":
          return (left as number | string) >= (right as number | string);
      }
    }
    default:
      return null;
  }
}

/**
 * Dispatch a stdlib method on resolved operands by the receiver's runtime type —
 * mirrors the pure host's `evaluateStdlibMethod`, reusing the same exported
 * member surfaces (`stdlib-string` / `stdlib-array` / `stdlib-object`); a
 * receiver kind with no built-in method surface — a `number`, a `boolean`, or
 * `null` — is rejected loudly with `theta/runtime/non-object-receiver` (bug
 * 0393 §Fix), the disposition the index arm (`evaluateIndexAccess`) already
 * gives a laundered primitive; a `null` receiver at the index or member read
 * instead raises its dedicated null-access panic ahead of that gate, so `null`
 * carries this code only at the method-call read. An enum value or a `Result`
 * value satisfies the object arm's `typeof` test but is gated ahead of
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
  throw nonObjectReceiverRejection(`.${method}()`, receiver);
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
    return { flow: "value", value: deps.host.evaluatePure(operand, env, deps.invokeChain) };
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
    run: () => deps.host.runEffect(operand, env, preArgs.args, deps.invokeChain),
  };
  const settleTrace = traceEffectDispatch(env, deps, checkpoint.kind, checkpoint.site);
  let outcome: CancellableSequenceOutcome;
  try {
    outcome = await runCancellableSequence(
      { checkpoint: deps.checkpoint, signal: deps.signal },
      [statement],
    );
  } finally {
    // RFC 0015 D7: settle on every completion path (see evalCheckpointedEffect).
    settleTrace?.();
  }
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
 * V4a arm selection (`selectMatchArm`) — first matching arm wins, the selected arm's body is
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
  // pattern bindings through the sync `V4a` pattern dispatch (`selectMatchArm`,
  // which raises `MatchError` on a non-exhaustive scrutinee), but do NOT
  // evaluate the arm body there. The selected arm body is
  // then evaluated through the REAL executor (`evalExpr`) rather than the
  // producer's partial `evaluatePureExpression` — so a nested `match` in the arm
  // body, or an effectful expression (a user-`fn` call whose body dispatches an
  // effect, an `@`-query, a tool-call) in that pure sub-expression position,
  // resolves through the single `V19c` evaluation path instead of the partial
  // pure evaluator's `default: return null` safety net.
  const patterns = expr.arms.map((arm) => toRuntimePattern(arm.pattern));
  // Drives the `V4a` pattern dispatch + `MatchError` raise; the selection names
  // the first matching arm and the bindings its pattern introduces.
  let chosen: MatchSelection;
  try {
    chosen = selectMatchArm(scrutinee.value, patterns);
  } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
    if (isThetaPanic(thrown)) {
      attachPanicSite(thrown, { file: panicSiteFile(env, deps), range: expr.range });
    }
    throw thrown;
  }
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
// Statement / block execution
// ---------------------------------------------------------------------------

/**
 * Execute one statement against `env`. Declaration statements (`fn` / `schema` /
 * `enum` / `import` / `export` / doc-comments) are hoisted / registered by
 * `V19b`'s environment at build time, so they are inert at execution time.
 */
async function executeStatement(stmt: Stmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  if (deps.trace !== undefined) {
    // RFC 0015: the site names the file a human can open — the same residence
    // rule panic sites use (a `.thetalib` fn body names its declaring file) —
    // so the run card's per-(file, line) heat keys land on the source it lexed.
    deps.trace(
      { file: panicSiteFile(env, deps), line: stmt.range.start.line, column: stmt.range.start.column },
      "stmt",
    );
  }
  switch (stmt.kind) {
    case "expr":
      // A bare expression statement's value is discarded (no `let` binds it, no
      // downstream `match`/`?` can observe it) — a terminal/discarding position.
      return evalExpr(stmt.expr, env, deps, true);
    case "tool-call":
      // A bare action statement discards its result — terminal/discarding.
      return evalExpr(stmt.call, env, deps, true);
    case "query":
      // A bare action statement discards its result — terminal/discarding.
      return evalExpr(stmt.query, env, deps, true);
    case "invoke":
      // A bare action statement discards its result — terminal/discarding.
      return evalExpr(stmt.invoke, env, deps, true);
    case "let": {
      let value: ThetaValue = null;
      if (stmt.init !== null) {
        const r = await evalExpr(stmt.init, env, deps);
        if (r.flow !== "value") {
          return r;
        }
        value = r.value;
      }
      env.defineLocal(stmt.name, value, stmt.mutable);
      return { flow: "value", value: null };
    }
    case "reassign": {
      let next: ThetaValue;
      if (stmt.op === "=") {
        const r = await evalExpr(stmt.value, env, deps);
        if (r.flow !== "value") {
          return r;
        }
        next = r.value;
      } else {
        // bindings.md #compound-assignment-desugar: `x <op>= e` computes as
        // `x = x <op> e` — read the target BEFORE evaluating the RHS,
        // matching `evalBinary`'s left-then-right operand order (bug 0370
        // §Fix layer 3), so a target-mutating RHS cannot make the two
        // spellings diverge.
        const current = env.resolve(stmt.target).value ?? null;
        const r = await evalExpr(stmt.value, env, deps);
        if (r.flow !== "value") {
          return r;
        }
        next = applyCompound(stmt.op, current, r.value);
      }
      const write = env.writeBinding(stmt.target, next);
      if (!write.accepted) {
        // The parse-time target-scope walk (bug 0370 §Fix layer 1) refuses
        // every statically-resolvable rejection before this arm runs; a
        // rejected write reaching here anyway is a broken invariant, and
        // silently discarding it (the pre-fix behaviour) drops the author's
        // mutation with no diagnostic.
        throw new RejectedWriteDefectError(stmt.target);
      }
      return { flow: "value", value: null };
    }
    case "if":
      return executeIf(stmt, env, deps);
    case "while":
      return executeWhile(stmt, env, deps);
    case "for":
      return executeFor(stmt, env, deps);
    case "break":
      return { flow: "break" };
    case "continue":
      return { flow: "continue" };
    case "return": {
      if (stmt.operand === null) {
        return { flow: "return", value: null };
      }
      // A `return` operand's `Err` is returned — unhandled per error-model.md:10
      // — a terminal/returning position.
      const r = await evalExpr(stmt.operand, env, deps, true);
      if (r.flow !== "value") {
        return r;
      }
      return { flow: "return", value: r.value };
    }
    case "fn":
    case "schema":
    case "enum":
    case "import":
    case "export":
    case "doc-comment":
      // Declarations are hoisted / registered by `V19b`'s environment; inert here.
      return { flow: "value", value: null };
  }
}

/**
 * Execute a `{ … }` block: walk its statements top-to-bottom, strictly
 * sequentially (each statement's effect commits before the next is entered —
 * `cka-50`), short-circuiting on the first non-`normal` control-flow signal;
 * then, if none fired, produce the block's final value (its tail expression, or
 * the literal `null` for a statement-terminated / empty block — FN-5).
 */
export async function executeBlock(
  block: Block,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
  atTerminal: boolean = true,
): Promise<EvalResult> {
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
    if (flow.flow !== "value") {
      return flow;
    }
    trailingExprValue = stmt.kind === "expr" ? { value: flow.value } : undefined;
  }
  if (block.tail !== null) {
    // A block's tail is a consumed VALUE at a value-position block-expr (the
    // caller binds/matches it, so no re-wrap runs downstream) but a
    // returned/discarded value at a body/statement block (the caller's own
    // terminal boundary re-wraps once) — the two positions need opposite
    // `atTerminal` dispositions, so the caller-supplied flag (not a hard-coded
    // terminal default) decides how THIS tail's query outcome disposes.
    return evalExpr(block.tail, env, deps, atTerminal);
  }
  return { flow: "value", value: trailingExprValue !== undefined ? trailingExprValue.value : null };
}

/** Execute a statement-form `if` / `else if` / `else` (control-flow.md). */
async function executeIf(stmt: IfStmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  const condition = await evalExpr(stmt.condition, env, deps);
  if (condition.flow !== "value") {
    return condition;
  }
  if (requireBoolean(condition.value)) {
    return executeBlock(stmt.then, env.child(), deps);
  }
  if (stmt.otherwise === null) {
    return { flow: "value", value: null };
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
): Promise<EvalResult> {
  const site = loopIterSite(stmt, deps);
  for (;;) {
    traceEffectDispatch(env, deps, "loop-iter", site);
    const aborted = await loopIterCheckpoint(site, deps);
    if (aborted) {
      return { flow: "cancel" };
    }
    const condition = await evalExpr(stmt.condition, env, deps);
    if (condition.flow !== "value") {
      return condition;
    }
    if (!requireBoolean(condition.value)) {
      return { flow: "value", value: null };
    }
    const flow = await executeBlock(stmt.body, env.child(), deps);
    if (flow.flow === "break") {
      return { flow: "value", value: null };
    }
    if (flow.flow === "continue" || flow.flow === "value") {
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
async function executeFor(stmt: ForStmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  const iterand = await evalExpr(stmt.iterand, env, deps);
  if (iterand.flow !== "value") {
    return iterand;
  }
  // Bug 0369 belt: a non-array iterand that evaded the parse refusal by static
  // unresolvability must abort loudly, not silently satisfy the loop with a
  // fabricated empty snapshot.
  if (!Array.isArray(iterand.value)) {
    throw new ForIterandKindDefectError(iterand.value);
  }
  const snapshot: readonly ThetaValue[] = iterand.value;

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
    traceEffectDispatch(env, deps, "loop-iter", site);
    const aborted = await loopIterCheckpoint(site, deps);
    if (aborted) {
      return { flow: "cancel" };
    }
    const iterationScope = env.bindIterationVariable(stmt.variable, element);
    const flow = await executeBlock(stmt.body, iterationScope, deps);
    if (flow.flow === "break") {
      break;
    }
    if (flow.flow === "continue" || flow.flow === "value") {
      continue;
    }
    return flow;
  }
  return { flow: "value", value: null };
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
  switch (flow.flow) {
    case "return":
      return { outcome: "success", result: functionResult("success", flow.value) };
    case "value":
      return { outcome: "success", result: functionResult("success", flow.value) };
    case "fail":
      // An unhandled non-cancel effect `Err` terminated the body. Surface the
      // effect's own terminating error as `BodyExecution.error` so the mode's
      // `surface` projects the real `Err` (ERR-19 payload preserved) instead of
      // fabricating a `cancelled` — exactly as the `propagate` arm below.
      return {
        outcome: "fail",
        result: functionResult("fail", null),
        error: flow.error,
        ...(flow.event !== undefined ? { originEvent: flow.event } : {}),
      };
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
