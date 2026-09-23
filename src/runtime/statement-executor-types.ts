// V19c / V19c-T — the statement executor's host-contract type substrate.
//
// This module carries the types the tree-walking statement executor
// (`statement-executor.ts`) is driven through and produces: the `V19d` effect
// boundary (`StatementEvalHost` and its checkpoint / subagent-fn-call request
// and outcome shapes), the collaborator bundle a drive threads
// (`ExecuteBodyDeps`), the drive's terminal shape (`BodyExecution`), and the
// internal control-flow signal (`EvalResult`) both the expression and the
// statement layers carry. Types only — no runtime values live here.
//
// Spec: implementation-notes.md (§Runtime), cancellation.md (§Granularity),
// functions.md (FN-4/FN-5), errors-and-results/error-model.md (§Terminal
// outcomes, ERR-8 … ERR-12).

import type {
  CallExpr,
  Expr,
  FnDecl,
  SubagentSessionConfig,
} from "../parser/theta-document";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../seams/checkpoint";
import type { Trace } from "../seams/trace";
import type { ParForLaneHooks } from "../extension/execution-status/types";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { OperationResult } from "./cancellation-core";
import type { InvokeChain } from "./invoke-depth-cycle";
import type { InvokeResultSource } from "./invoke-cancellation";
import type { FnTail } from "./subagent-envelope";
import type { RuntimeEvent } from "./runtime-event-channel";
import type { FunctionResult, TerminalOutcome } from "./function-result";
import type { LexicalEnvironment } from "./lexical-environment";
import type {
  CommittedConversationMutator,
  DrivenConversationMode,
} from "./terminal-outcomes";
import type { ThetaValue, ResultValue } from "./value";

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
