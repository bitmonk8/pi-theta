// V19c / V19c-T — the statement executor's result/match disposition family.
//
// This module carries the `Result`-consumption forms the executor evaluates
// itself (never the pure host): the `?`-operand / `match`-scrutinee
// normalisation (`evalAsResult` / `asResultValue`), the `?` propagation
// (`evalTry`, ERR-18), and the `match` arm selection and arm-body drive
// (`evalMatch` / `toRuntimePattern`). Mutually recursive with the expression
// layer: these helpers dispatch operands back through
// `statement-executor.ts`'s `evalExpr`, and `evalExpr`'s `try` / `match` arms
// call back in here.
//
// Spec: expressions.md (§`?` operator, §`match` expression),
// errors-and-results/error-model.md (ERR-18/ERR-19), query-forms.md
// (QRY-1/QRY-2/QRY-8).

import type { Expr, MatchExpr, PatternNode, TryExpr } from "../parser/theta-document";
import type { CancellableStatement } from "./cancellation-core";
import { runCancellableSequence, type CancellableSequenceOutcome } from "./cancellation-core";
import {
  attachPanicSite,
  evaluateQuestion,
  isThetaPanic,
  QuestionOperandDefectError,
} from "./runtime-panics";
import type { LexicalEnvironment } from "./lexical-environment";
import { selectMatchArm, type MatchSelection, type Pattern } from "./match-result";
import { handlePartialTerminalOutcome } from "./terminal-outcomes";
import {
  isResultValue,
  makeErr,
  makeOk,
  type ResultValue,
  type ThetaValue,
} from "./value";
import type { EvalResult, ExecuteBodyDeps } from "./statement-executor-types";
import {
  evalExpr,
  panicSiteFile,
  preEvaluateToolArgs,
  resolveUserFn,
  traceEffectDispatch,
} from "./statement-executor";

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
export async function evalAsResult(
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

  // A checkpointed effect (or a remaining pure form): the ONE shared
  // checkpointed-effect dispatch with statement/effect position
  // (`evalCheckpointedEffect`), at the non-terminal disposition — a clean
  // value normalises to a `Result` and a non-cancel effect failure binds as
  // the theta `Err(error)` that `?` propagates and `match` dispatches on.
  return evalCheckpointedEffect(operand, env, deps, false);
}

/** Normalise an effect's clean value to a `Result`: a `Result` passes through, else `Ok(value)`. */
export function asResultValue(value: ThetaValue): ResultValue {
  return isResultValue(value) ? value : makeOk(value);
}

/** Dispatch the pure/checkpointed tail and dispose its outcome at consumption. */
export async function evalCheckpointedEffect(
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
 * Evaluate `operand?` (ERR-18 / expressions.md §`?` operator): dispatch the
 * operand to its `Result`, then apply the sync V4b `?` propagation —
 * `Ok(v)` yields `v`, `Err(e)` early-returns the body with `Err(e)` (the
 * `propagate` flow). A panic thrown while producing the operand bypasses `?`
 * unchanged.
 */
export async function evalTry(expr: TryExpr, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
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
export async function evalMatch(
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
