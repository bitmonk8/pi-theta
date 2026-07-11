// V19c / V19c-T — the loom tree-walking statement executor.
//
// This module owns the runtime seam the paired `V19c` implementation leaf fills
// in: `executeBody(body, deps)` walks `V19a`'s parsed `LoomBody` statement AST
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
// single invocation the interpreter is strictly sequential … the next loom
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
  Block,
  CallExpr,
  Expr,
  FnDecl,
  ForStmt,
  IfStmt,
  LoomBody,
  MatchExpr,
  PatternNode,
  Stmt,
  TryExpr,
  WhileStmt,
} from "../parser/loom-document";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../seams/checkpoint";
import type { CancellableStatement, OperationResult } from "./cancellation-core";
import { runCancellableSequence } from "./cancellation-core";
import { evaluateForLoop, type ForLoopHost } from "./control-flow";
import { functionResult, type FunctionResult, type TerminalOutcome } from "./function-result";
import type { LexicalEnvironment } from "./lexical-environment";
import { evaluateQuestion } from "./runtime-panics";
import { evaluateMatch, type Bindings, type MatchArm, type Pattern } from "./match-result";
import {
  handlePartialTerminalOutcome,
  type CommittedConversationMutator,
  type DrivenConversationMode,
} from "./terminal-outcomes";
import { isResultValue, makeErr, makeOk, type LoomValue, type ResultValue } from "./value";

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
  evaluatePure(expr: Expr, env: LexicalEnvironment): LoomValue;
  checkpointFor(expr: Expr): CheckpointDescriptor | null;
  runEffect(expr: Expr, env: LexicalEnvironment): Promise<OperationResult>;
}

/**
 * The collaborators the executor walks the body against. `env` is `V19b`'s
 * real lexical environment; `host` is the `V19d` effect boundary; `checkpoint`
 * and `signal` are `V17a`'s `Checkpoint` seam substrate and the `loomAbort`
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
   * The loom source file stamped onto the `loop-iter` `CheckpointSite` (the
   * per-iteration cancellation checkpoint of `executeWhile` / `executeFor`);
   * the other four checkpoint sites are stamped by the effect host from the
   * same source file. Matches `EffectfulStatementHostDeps.file`.
   */
  readonly file: string;
}

/**
 * The outcome of driving a `LoomBody` to completion: the `error-model.md`
 * terminal outcome (`success` / `fail` / `cancel`) and the FN-5 top-level-block
 * final value (present only on the success path).
 */
export interface BodyExecution {
  readonly outcome: TerminalOutcome;
  readonly result: FunctionResult;
  /**
   * The `Err` payload that unwound the body — the loom's terminal `Result` on
   * the fail path is `Err(error)`. Present on the fail outcome for BOTH a
   * `?`-propagation (ERR-18) and an unhandled non-cancel effect `Err` in
   * tail/statement position (ERR-19 — e.g. a `tool_loop_exhausted` breach): the
   * effect's own terminating `QueryError` is carried through so the caller sees
   * the real leaf kind, not a fabricated `cancelled`. Absent for the cancel
   * outcome (whose surface is `CancelledError`) and for a thrown `LoomPanic`
   * (which never reaches a `fail` outcome). A mode's `surface` projects this
   * onto the caller-visible `Err` (FN-5 fail path).
   */
  readonly error?: LoomValue;
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
 *     FN-5 final value flows. (A runtime panic is a thrown `LoomPanic`, not a
 *     `fail` flow, so it never reaches this variant.)
 *   - `cancel`   — a mid-body cancellation surfaced at a checkpoint — the cancel
 *     terminal outcome; no final value flows (FN-5).
 */
type Flow =
  | { readonly kind: "normal"; readonly value: LoomValue }
  | { readonly kind: "return"; readonly value: LoomValue }
  | { readonly kind: "break" }
  | { readonly kind: "continue" }
  | { readonly kind: "fail"; readonly error: LoomValue }
  | { readonly kind: "propagate"; readonly err: LoomValue }
  | { readonly kind: "cancel" };

/** The outcome of evaluating a single sub-expression (pure or checkpointed). */
type EvalResult =
  | { readonly flow: "value"; readonly value: LoomValue }
  | { readonly flow: "fail"; readonly error: LoomValue }
  | { readonly flow: "propagate"; readonly err: LoomValue }
  | { readonly flow: "cancel" };

/**
 * Lift a terminal `EvalResult` (`fail` / `propagate` / `cancel`) onto the
 * matching `Flow`. A `?`-propagation carries its `Err` payload through so the
 * body's terminal `Result` is `Err(err)` (ERR-18 / FN-5 fail path).
 */
function terminalFlow(result: Exclude<EvalResult, { flow: "value" }>): Flow {
  if (result.flow === "fail") {
    return { kind: "fail", error: result.error };
  }
  if (result.flow === "propagate") {
    return { kind: "propagate", err: result.err };
  }
  return { kind: "cancel" };
}

/**
 * A `<name>(args)` call whose arg count does not match the resolved `fn`'s
 * declared parameter count. Arity is a type-phase concern the loom grammar
 * expects to be well-formed by execution time, so a mismatch reaching the
 * runtime is a defect: it surfaces as a thrown error (routed to the extension's
 * command-execution error surface, `loom/runtime/internal-error`) rather than
 * silently binding `null` for a missing arg or crashing the host.
 */
export class LoomFnArityError extends Error {
  public constructor(name: string, expected: number, actual: number) {
    super(`function '${name}' expects ${expected} argument(s) but received ${actual}`);
  }
}

/**
 * Whether a resolved identifier names an executable user `fn` — a hoisted
 * top-level `fn` (`arm: "fn"`) or an imported `.warp fn` (`arm: "import"`),
 * both carrying the `FnDecl` body. A `.loom`-callable / Pi-tool call (the
 * `callable` arm) is NOT a user `fn`; it stays on the effect (tool-call /
 * invoke) path.
 */
function resolveUserFn(callee: string, env: LexicalEnvironment): FnDecl | undefined {
  const r = env.resolve(callee);
  return (r.arm === "fn" || r.arm === "import") && r.fn !== undefined ? r.fn : undefined;
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
): Promise<EvalResult> {
  if (expr.args.length !== fn.params.length) {
    throw new LoomFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  const scope = env.child();
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

/** A loom condition is a boolean; only the literal `true` steers control flow. */
function isTruthy(value: LoomValue): boolean {
  return value === true;
}

/** Apply a compound-assignment operator to two numeric operands. */
function applyCompound(
  op: "+=" | "-=" | "*=" | "/=" | "%=",
  current: LoomValue,
  delta: LoomValue,
): LoomValue {
  const a = typeof current === "number" ? current : 0;
  const b = typeof delta === "number" ? delta : 0;
  switch (op) {
    case "+=":
      return a + b;
    case "-=":
      return a - b;
    case "*=":
      return a * b;
    case "/=":
      return a / b;
    case "%=":
      return a % b;
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
 * `handlePartialTerminalOutcome` (ERR-8 … ERR-12); any other `Err` surfaces the
 * fail outcome.
 */
async function evalExpr(expr: Expr, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  // `?` (try) and `match` are control-flow forms whose operand / scrutinee may
  // itself be a checkpointed effect. They are evaluated by the executor (not the
  // pure host) so a `?`-propagation early-returns from the body and a `match`
  // dispatches the real effect before applying the sync V4a/V4b semantics.
  if (expr.kind === "try") {
    return evalTry(expr, env, deps);
  }
  if (expr.kind === "match") {
    return evalMatch(expr, env, deps);
  }
  // A `<name>(args)` call whose callee resolves to a user `fn` executes the
  // function body in-process (FN-1…FN-5); it is not a host tool-call / invoke
  // effect, so it never reaches `checkpointFor`.
  if (expr.kind === "call") {
    const fn = resolveUserFn(expr.callee, env);
    if (fn !== undefined) {
      return evalUserFnCall(fn, expr, env, deps);
    }
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
  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(expr, env),
  };
  const outcome = await runCancellableSequence(
    { checkpoint: deps.checkpoint, signal: deps.signal },
    [statement],
  );
  const result = outcome.result;
  if (result.ok) {
    return { flow: "value", value: result.value as LoomValue };
  }
  if (result.error.kind === "cancelled") {
    // A mid-stream cancellation: turns Pi has committed remain final — the
    // runtime mutates no committed surface and injects no compensating turn
    // (ERR-8 / ERR-9 / ERR-10 / ERR-12). `handlePartialTerminalOutcome` calls
    // nothing on the mutator; routing through it makes the contract explicit.
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return { flow: "cancel" };
  }
  // An unhandled non-cancel effect `Err` (e.g. a ceiling-#2 `tool_loop_exhausted`
  // breach in tail/statement position, no `?`, not caught by a `match`). Carry
  // the effect's own terminating `QueryError` through the `fail` flow so the
  // body's terminal `Result` is `Err(error)` (ERR-19), exactly as a
  // `?`-propagation carries its `Err` — not a fabricated `cancelled`.
  return { flow: "fail", error: result.error as unknown as LoomValue };
}

/**
 * Evaluate an expression *as a loom `Result` value* — the operand of `?` and the
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
 *     surfaced as the loom `Err(error)` so `?` propagates it and `match` can
 *     catch it;
 *   - a cancellation surfaces the cancel flow (never a `Result`).
 *
 * A pure operand is evaluated through the host and returned verbatim — ERR-18
 * guarantees a `?` operand is `Result`-typed, and a `match` scrutinee is
 * whatever value the pure expression produced.
 */
async function evalAsResult(
  operand: Expr,
  env: LexicalEnvironment,
  deps: ExecuteBodyDeps,
): Promise<EvalResult> {
  // A nested `try` / `match` operand is itself a control-flow form; a user `fn`
  // call operand executes in-process and its returned value is normalised to a
  // `Result` so `?` can propagate and `match` can dispatch on it.
  if (
    operand.kind === "try" ||
    operand.kind === "match" ||
    (operand.kind === "call" && resolveUserFn(operand.callee, env) !== undefined)
  ) {
    const inner = await evalExpr(operand, env, deps);
    if (inner.flow !== "value") {
      return inner;
    }
    return { flow: "value", value: asResultValue(inner.value) };
  }

  const checkpoint = deps.host.checkpointFor(operand);
  if (checkpoint === null) {
    return { flow: "value", value: deps.host.evaluatePure(operand, env) };
  }

  const statement: CancellableStatement = {
    binding: "_effect",
    kind: checkpoint.kind,
    site: checkpoint.site,
    run: () => deps.host.runEffect(operand, env),
  };
  const outcome = await runCancellableSequence(
    { checkpoint: deps.checkpoint, signal: deps.signal },
    [statement],
  );
  const result = outcome.result;
  if (result.ok) {
    return { flow: "value", value: asResultValue(result.value as LoomValue) };
  }
  if (result.error.kind === "cancelled") {
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return { flow: "cancel" };
  }
  // A non-cancel effect failure is the loom `Err(error)` — the `Result` value
  // `?` propagates and `match` dispatches on.
  return { flow: "value", value: makeErr(result.error as unknown as LoomValue) };
}

/** Normalise an effect's clean value to a `Result`: a `Result` passes through, else `Ok(value)`. */
function asResultValue(value: LoomValue): ResultValue {
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
  const rv = operand.value as ResultValue;
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
async function evalMatch(expr: MatchExpr, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
  const scrutinee = await evalAsResult(expr.scrutinee, env, deps);
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
  return evalExpr((expr.arms[chosen.index] as MatchExpr["arms"][number]).body, armEnv, deps);
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
async function executeStatement(stmt: Stmt, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<Flow> {
  switch (stmt.kind) {
    case "expr": {
      const r = await evalExpr(stmt.expr, env, deps);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "tool-call": {
      const r = await evalExpr(stmt.call, env, deps);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "query": {
      const r = await evalExpr(stmt.query, env, deps);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "invoke": {
      const r = await evalExpr(stmt.invoke, env, deps);
      return r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r);
    }
    case "let": {
      let value: LoomValue = null;
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
      const r = await evalExpr(stmt.operand, env, deps);
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
  let trailingExprValue: { readonly value: LoomValue } | undefined;
  for (const stmt of block.statements) {
    const flow = await executeStatement(stmt, env, deps);
    if (flow.kind !== "normal") {
      return flow;
    }
    trailingExprValue = stmt.kind === "expr" ? { value: flow.value } : undefined;
  }
  if (block.tail !== null) {
    const r = await evalExpr(block.tail, env, deps);
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
 * Build the `loop-iter` `CheckpointSite` for a loop statement from the loom
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
 * `loomAbort.signal.aborted` and land before the next iteration; an observed
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
  const snapshot: readonly LoomValue[] = Array.isArray(iterand.value) ? iterand.value : [];

  // Drive `V3c`'s real `evaluateForLoop` to fix the iteration order over the
  // snapshot (iterand evaluated exactly once — CTRL-1). The body's effects are
  // async, so the synchronous loop host captures each element in order; the
  // async body walk below honours `break` / `continue`.
  const plan: { readonly element: LoomValue }[] = [];
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
 * Drive a `LoomBody` top-to-bottom, strictly sequentially, against `deps`:
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
export async function executeBody(body: LoomBody, deps: ExecuteBodyDeps): Promise<BodyExecution> {
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
