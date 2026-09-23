// Pure-expression evaluation for synchronous theta expressions and call-site cwd values.

import { type LexicalEnvironment } from "./lexical-environment";
import { BinaryMixedOperandError, BinaryNonNumericError, BooleanPositionKindDefectError, IndexKindDefectError, ThetaFnArityError, UnaryNonNumericError } from "./statement-executor";
import { pushCountableFrame, thetalibFnFrameKind, type InvokeChain } from "./invoke-depth-cycle";
import { buildObjectSchemaValue, defineRecordField, isResultValue, makeErr, makeOk, valuesEqual, type ThetaValue } from "./value";
import { applyNumericArithmetic, applyStdlibMethod } from "./executor-operators";
import type { Block, CallExpr, Expr, FnDecl, InvokeExpr, Stmt } from "../parser/theta-document";
import { attachPanicRange, attachPanicSite, evaluateIndexAccess, evaluateMemberAccess, evaluateQuestion, InterpolatedResultPanic, isThetaPanic, pushPanicFrame, QuestionOperandDefectError } from "./runtime-panics";
import { INTERPOLATED_RESULT_MESSAGE } from "../render/query-render";

/**
 * The single runtime raise of `theta/parse/interpolated-result` in `src/` (bug
 * 0079 §Fix, preserved as a structural constraint). Factored so the `try` arm's
 * propagate branch and this render's `Result`-row branch reach ONE construction
 * site: two `throw` statements are two dispositions free to drift, which is the
 * drift the one-raise rule exists to prevent. `never`, so every caller's
 * control flow narrows past it.
 */
function raiseInterpolatedResult(message: string): never {
  throw new InterpolatedResultPanic(message);
}

/**
 * Evaluate a call site's `with { cwd: Expr }` clause value (RFC 0009 INV-6,
 * invocation.md `#options-surface`), or `undefined` when the call carries no
 * clause — or an empty one, whose semantics are exactly an absent clause's
 * (nothing is requested, so the default cwd applies).
 *
 * Evaluation order is normative: the call's argument expressions evaluate
 * left-to-right first (the caller's own `argValues` map, which runs before this
 * call), THEN the clause's `cwd` expression, THEN dispatch. The SAME pure
 * evaluator and environment the arguments use, so a panic or a `?`-on-`Err`
 * inside the clause value takes an argument position's exact abort route and
 * nothing is spawned (the `InvokeChild` is never built).
 *
 * Duplicate `cwd` keys all evaluate, in source order, and the LAST wins — the
 * object-literal duplicate-field disposition; a panic in an earlier one still
 * aborts pre-spawn.
 */
function evaluateCallSiteCwd(
  expr: CallExpr | InvokeExpr,
  env: LexicalEnvironment,
  chain: InvokeChain,
): ThetaValue | undefined {
  const clause = expr.withClause;
  if (clause === undefined) {
    return undefined;
  }
  let raw: ThetaValue | undefined;
  for (const field of clause.fields) {
    if (field.key !== "cwd") {
      continue;
    }
    raw = evaluatePureExpression(field.value, env, chain);
  }
  return raw;
}

/** Attach a pure-host panic's residence-backed site or pending source range (bug 0476). */
function attachPurePanicSite(
  thrown: unknown,
  env: LexicalEnvironment,
  range: Expr["range"],
): void {
  if (isThetaPanic(thrown)) {
    const file = env.currentResidence();
    if (file !== undefined) {
      attachPanicSite(thrown, { file, range });
    } else {
      attachPanicRange(thrown, range);
    }
  }
}

/**
 * Evaluate a pure (non-checkpointed) sub-expression against the environment.
 * The switch below covers the whole pure expression grammar (literals,
 * identifiers, arrays, objects, member/index reads, `fn` calls, `Result`
 * constructors, method calls, `try`, binary/ternary operators and block
 * expressions). An identifier that resolves to a local binding yields its
 * value; any other resolution arm (a bare `fn` / callable name, or an
 * unresolved name) has no first-class readable value and yields `null` — this
 * evaluator's own inert fallback (bug 0116: no such rule is stated in
 * expressions.md) — rather than throwing out of the executor.
 */
function evaluatePureExpression(
  expr: Expr,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): ThetaValue {
  switch (expr.kind) {
    case "number":
      return Number(expr.text);
    case "string":
    case "bool":
      return expr.value;
    case "null":
      return null;
    case "ident": {
      const resolution = env.resolve(expr.name);
      return resolution.arm === "local" ? resolution.value ?? null : null;
    }
    case "array":
      return expr.elements.map((element) => evaluatePureExpression(element, env, chain));
    case "object": {
      // An object-literal / schema-constructor value (expressions.md §"Object
      // construction"): the runtime value is the plain field object keyed by
      // theta-side names, reordered into the declaring schema's DECLARATION
      // order (bug 0080 §Fix) and branded (non-enumerably, so no
      // theta-visible surface changes) with that schema name, so the QRY-18
      // interpolation render path can recover the schema and apply outbound
      // wire-name translation recursively — identical to the executor's
      // `case "object"` arm (statement-executor.ts), the lockstep obligation
      // bug 0027 records for its four read entry points.
      const obj: Record<string, ThetaValue> = {};
      for (const field of expr.fields) {
        defineRecordField(obj, field.name, evaluatePureExpression(field.value, env, chain));
      }
      return buildObjectSchemaValue(obj, expr.typeName, (name) => env.resolveSchema(name));
    }
    case "member": {
      // `Enum.Variant` access: a member on an identifier that names a registered
      // enum (not a local binding) is a pure enum-value read, NOT a generic
      // member access on a null target (runtime-value-model.md, enum row).
      if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
        const variant = env.resolveEnumVariant(expr.target.name, expr.field);
        if (variant !== undefined) {
          return variant;
        }
      }
      // `.field` access — a `null` target raises `NullMemberAccessPanic` (V4b).
      // Bug 0476 §Fix (BLOCKER A): the pure host raises on the shipped `@`
      // interpolation route (`renderQueryText` → `stringifyInterpolation`),
      // which is NOT absorbed, so this arm attaches the panic's SITE exactly
      // as the executor's member arm does — except this host knows only the
      // node's range, not the top-level body's on-disk file, so it attaches a
      // full site when the current residence is known (a `.thetalib` leaf) and
      // a PENDING range otherwise (`surfaceDispatchDefect`'s
      // `completePanicSite` supplies the top-level file later).
      {
        const target = evaluatePureExpression(expr.target, env, chain);
        try {
          return evaluateMemberAccess(target, expr.field);
        } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
          attachPurePanicSite(thrown, env, expr.range);
          throw thrown;
        }
      }
    }
    case "index": {
      // `[i]` access — a `null` target / out-of-bounds / missing key panics (V4b).
      // The `String()` coercion is removed (bug 0365 §Fix): a non-number,
      // non-string index the static layer deferred on throws the
      // `IndexKindDefectError` belt instead of manufacturing a key. Both hosts
      // move in lockstep (statement-executor.ts's index arm, same belt). The
      // `chain` threads through both operand evaluations (bug 0354) so a
      // cross-file `fn` call reached from an index operand still counts.
      const target = evaluatePureExpression(expr.target, env, chain);
      const index = evaluatePureExpression(expr.index, env, chain);
      if (typeof index !== "number" && typeof index !== "string") {
        throw new IndexKindDefectError(index);
      }
      // Bug 0476 §Fix (BLOCKER A): same two-phase site attachment as the
      // member arm above — this is the shipped `@` interpolation route.
      try {
        return evaluateIndexAccess(target, index);
      } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
        attachPurePanicSite(thrown, env, expr.range);
        throw thrown;
      }
    }
    case "call": {
      // A `<name>(args)` call whose callee resolves to a user `fn` executes the
      // function body (functions.md FN-1…FN-5). In a pure sub-expression
      // position (a binary/ternary operand, an argument, a template
      // interpoland) the value is produced synchronously against a pure body;
      // an effectful `fn` body cannot run on the pure path and yields the inert
      // `null` safety net (its effects are driven only by the executor). A
      // non-`fn` callee (a Pi tool / `.theta`-callable) is an effect with no
      // synchronous value — also the `null` safety net.
      const resolution = env.resolve(expr.callee);
      const fn =
        (resolution.arm === "fn" || resolution.arm === "import") && resolution.fn !== undefined
          ? resolution.fn
          : undefined;
      // Bug 0303 / bug 0027 lockstep: an imported `fn`'s body opens against its
      // DECLARING module's environment (`resolution.moduleEnv`), exactly as the
      // async executor's `evalUserFnCall` does — this pure host and the
      // executor must not drift on which scope a lib body's free names resolve
      // in.
      return fn !== undefined
        ? evaluatePureFnCall(
            fn,
            expr,
            env,
            resolution.arm === "import" ? resolution.moduleEnv : undefined,
            chain,
          )
        : null;
    }
    case "result-ctor":
      // `Ok(arg)` / `Err(arg)` — a pure Result construction (never a tool-call).
      return expr.ctor === "Ok"
        ? makeOk(evaluatePureExpression(expr.arg, env, chain))
        : makeErr(evaluatePureExpression(expr.arg, env, chain));
    case "method-call": {
      // `target.method(args)` — evaluate the receiver and arguments, then
      // dispatch to the stdlib member surface by the receiver's runtime type
      // (expressions.md §"Built-in methods and properties").
      const receiver = evaluatePureExpression(expr.target, env, chain);
      const args = expr.args.map((arg) => evaluatePureExpression(arg, env, chain));
      // `applyStdlibMethod` (executor-operators.ts) is the ONE receiver-type
      // dispatch gate shared with the effectful executor, so the two hosts
      // cannot drift apart on receiver classification — including on the
      // QRY-18 interpolation render path (`stringifyInterpolation`), where a
      // receiver that would otherwise leak into a rendered query template is
      // rejected before any text reaches the model.
      return applyStdlibMethod(receiver, expr.method, args);
    }
    case "try": {
      // §Fix (a) (bug 0116) — the `Ok`/`Err` discrimination is NOT
      // reimplemented here: `evaluateQuestion` is the shared synchronous V4b
      // primitive `evalTry` (statement-executor.ts) also calls, so this host
      // and the executor cannot drift apart on `?` (bug 0027's lockstep rule
      // for this exact pair).
      const operand = evaluatePureExpression(expr.operand, env, chain);
      // §Fix (b) — the ERR-18 brand guard travels with the primitive, exactly
      // as `evalTry` guards before unwrapping; reusing bug 0019's defect class
      // rather than minting a new one.
      if (!isResultValue(operand)) {
        throw new QuestionOperandDefectError(operand);
      }
      const q = evaluateQuestion(() => operand);
      if (q.kind === "value") {
        return q.value;
      }
      // §Fix (c) — `evaluatePureExpression` returns `ThetaValue`, which has no
      // channel for `evalTry`'s `propagate` flow (the render is synchronous, so
      // `evalExpr`'s re-route strategy is unavailable). Yielding the `Err`
      // carrier as a VALUE would be unsound rather than merely lossy: a pure
      // operator arm — a binary / comparison / logical operand, or a ternary
      // CONDITION — consumes it with JS coercion before any classification
      // runs, sending the interpreter-private carrier to the model as
      // `[object Object]`. So the propagate arm RAISES, through the one factored
      // raise, which is positional-invariant: nothing is sent, the theta does
      // not report success, and the disposition is a `ThetaPanic` so QRY-21
      // holds and `let _ =` cannot contain it.
      raiseInterpolatedResult(INTERPOLATED_RESULT_MESSAGE);
    }
    case "binary":
      return evaluateBinaryExpression(expr.op, expr.left, expr.right, env, chain, expr.unary === true);
    case "ternary": {
      // `cond ? a : b` — only the taken branch is evaluated (short-circuit).
      // Bug 0369 belt: mirrors the executor's ternary belt into this pure
      // host, so a statically-deferred non-boolean condition throws loudly
      // instead of steering to the alternate branch as a fabricated `false`.
      const condition = evaluatePureExpression(expr.condition, env, chain);
      if (typeof condition !== "boolean") {
        throw new BooleanPositionKindDefectError(condition);
      }
      return condition
        ? evaluatePureExpression(expr.consequent, env, chain)
        : evaluatePureExpression(expr.alternate, env, chain);
    }
    case "block": {
      // A block expression's value is its tail (grammar.md §"Block expressions"),
      // over the same statements-then-tail evaluation `evaluatePureFnCall`
      // already performs, in a CHILD scope so the block's own `let`s do not
      // leak into the enclosing one. An explicit `return` inside the block is
      // control flow this evaluator has no channel to propagate out of an
      // expression position, so it falls to the inert `null` the surrounding
      // pure-host convention uses for the forms it does not model.
      const outcome = evaluatePureBlock(expr.body, env.child(), chain);
      return outcome.kind === "value" ? outcome.value : null;
    }
    default:
      // `match` / effect forms are driven by the executor (not the pure host);
      // a query / tool-call / invoke expression reaching here has no pure
      // value and yields the inert `null` — this evaluator's own fallback, not
      // a rule stated anywhere in expressions.md (bug 0116).
      return null;
  }
}

/**
 * Evaluate a pure user `fn` call synchronously (functions.md FN-1…FN-5) for a
 * pure sub-expression position: validate arity (a mismatch is a defect surfaced
 * as `ThetaFnArityError`, shared with the executor's async path), evaluate each
 * argument in the caller scope, bind it as an immutable local in a fresh child
 * scope, then evaluate the `fn` body's pure statements + tail. The evaluator
 * covers the pure body forms (`let`, `if`/`else`, `return`, expression
 * statements, and the tail expression); an effect statement or a `while`/`for`
 * loop has no synchronous pure value and short-circuits to the `null` safety
 * net, matching the surrounding pure-evaluator convention.
 */
function evaluatePureFnCall(
  fn: FnDecl,
  expr: CallExpr,
  env: LexicalEnvironment,
  bodyRoot: LexicalEnvironment = env,
  chain?: InvokeChain,
): ThetaValue {
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  // Arguments evaluate in the CALLER's `env`; the body scope opens against
  // `bodyRoot` — the DECLARING module's environment for an imported `fn` (bug
  // 0303), or `env` itself (the default) for a same-file `fn`.
  const scope = bodyRoot.child();
  fn.params.forEach((param, index) => {
    scope.defineLocal(
      param.name,
      evaluatePureExpression(expr.args[index] as Expr, env, chain),
      false,
    );
  });
  // INV-4 / ceiling #1 (bug 0354, adjudication C): the pure-host twin of
  // `evalUserFnCall`'s cross-file accounting — same classifier, same push,
  // reached from a query-template interpolation or an invoke-arg position
  // instead of a statement. `bodyRoot !== env` mirrors `moduleEnv !== undefined`
  // there (a same-file `fn` defaults `bodyRoot` to `env`, so the identity check
  // alone already excludes it before the residence comparison runs).
  let bodyChain = chain;
  if (chain !== undefined && bodyRoot !== env) {
    const kind = thetalibFnFrameKind({
      callerFile: env.currentResidence() ?? "",
      calleeResidence: bodyRoot.currentResidence() ?? "",
    });
    if (kind !== undefined) {
      // Bug 0476 §Fix (BLOCKER A): the depth seam's caller — the pure-host
      // twin of `evalUserFnCall`'s catch around `pushCountableFrame`
      // (statement-executor.ts). The depth cap is breached BEFORE the frame
      // opens (invocation.md §INV-4), so THIS call expression — the one that
      // would have opened it — is the panic's SITE, not a frame: no body ever
      // ran. Two-phase, like the member/index arms above: a full site when the
      // residence is known, else a pending range for `completePanicSite`.
      try {
        bodyChain = pushCountableFrame(chain, kind);
      } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
        attachPurePanicSite(thrown, env, expr.range);
        throw thrown;
      }
    }
  }
  // Bug 0476 §Fix (BLOCKER A): the pure fn-call boundary — the pure-host twin
  // of `evalUserFnCall`'s catch around `executeBlock` (statement-executor.ts).
  // As the panic unwinds through this call, push the CALL SITE frame — this
  // caller's file (when known; else left pending for `completePanicSite` to
  // back-fill alongside the site) and the call expression's own range — not
  // the callee's declaration.
  let outcome: PureBlockOutcome;
  try {
    outcome = evaluatePureBlock(fn.body, scope, bodyChain);
  } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
    if (isThetaPanic(thrown)) {
      pushPanicFrame(thrown, {
        kind: "fn",
        name: fn.name,
        file: env.currentResidence(),
        range: expr.range,
      });
    }
    throw thrown;
  }
  return outcome.value;
}

/** The outcome of evaluating a pure block: a fallen-through value or an explicit `return`. */
type PureBlockOutcome =
  | { readonly kind: "value"; readonly value: ThetaValue }
  | { readonly kind: "return"; readonly value: ThetaValue };

/**
 * Evaluate a pure `fn` body `Block` synchronously: walk its statements, then
 * yield the tail expression's value (or `null` for a statement-terminated body).
 * An explicit `return` short-circuits the block to its operand (FN-3…FN-5).
 */
function evaluatePureBlock(
  block: Block,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): PureBlockOutcome {
  for (const stmt of block.statements) {
    const outcome = evaluatePureStatement(stmt, env, chain);
    if (outcome.kind === "return") {
      return outcome;
    }
  }
  return {
    kind: "value",
    value: block.tail !== null ? evaluatePureExpression(block.tail, env, chain) : null,
  };
}

/**
 * Evaluate one pure statement of a `fn` body. `let` binds a local; `if`/`else`
 * takes the matching arm's block; `return` short-circuits; an expression
 * statement is evaluated for its (discarded) value. A form with no synchronous
 * pure value (an effect statement, a `while`/`for` loop, a reassignment against
 * a captured slot) falls through as a plain value — the pure evaluator does not
 * model the effect/loop control flow the async executor owns.
 */
function evaluatePureStatement(
  stmt: Stmt,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): PureBlockOutcome {
  switch (stmt.kind) {
    case "let": {
      const value = stmt.init !== null ? evaluatePureExpression(stmt.init, env, chain) : null;
      env.defineLocal(stmt.name, value, stmt.mutable);
      return { kind: "value", value: null };
    }
    case "return":
      return {
        kind: "return",
        value: stmt.operand !== null ? evaluatePureExpression(stmt.operand, env, chain) : null,
      };
    case "if":
      return evaluatePureIf(stmt, env, chain);
    case "expr":
      return { kind: "value", value: evaluatePureExpression(stmt.expr, env, chain) };
    default:
      return { kind: "value", value: null };
  }
}

/** Evaluate a pure statement-form `if` / `else if` / `else` chain. */
function evaluatePureIf(
  stmt: Extract<Stmt, { kind: "if" }>,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): PureBlockOutcome {
  // Bug 0369 belt: the pure-host statement `if` is a boolean-position
  // consumer, kept uniform with the effectful `executeIf` and the pure
  // ternary. A statically-deferred non-boolean condition here is bug 0369's
  // loud defect; a `=== true` comparison would instead silently steer a
  // laundered non-boolean to the alternate arm as a fabricated `false`.
  const condition = evaluatePureExpression(stmt.condition, env, chain);
  if (typeof condition !== "boolean") {
    throw new BooleanPositionKindDefectError(condition);
  }
  if (condition) {
    return evaluatePureBlock(stmt.then, env.child(), chain);
  }
  if (stmt.otherwise === null) {
    return { kind: "value", value: null };
  }
  return "statements" in stmt.otherwise
    ? evaluatePureBlock(stmt.otherwise, env.child(), chain)
    : evaluatePureIf(stmt.otherwise, env, chain);
}

/**
 * Evaluate a pure binary / unary-modelled expression against the environment,
 * reusing the V2c structural-equality relation for `==` / `!=`. `&&` / `||`
 * short-circuit; arithmetic and ordering use native IEEE-754 semantics (no
 * div/mod-by-zero panic — expressions.md §"Other arithmetic"). Unary `!` / `-`
 * are modelled by the parser as a binary with a synthetic `null` left operand.
 */
function evaluateBinaryExpression(
  op: string,
  leftExpr: Expr,
  rightExpr: Expr,
  env: LexicalEnvironment,
  chain?: InvokeChain,
  unary?: boolean,
): ThetaValue {
  if (op === "!") {
    // Bug 0369 belt: mirrors the executor's `!` belt into this pure host, so a
    // non-boolean operand that reached here without a parse refusal — either
    // because the parse layer deferred on it (statically unresolvable), or,
    // for `!` in interpolation position, because `checkInterpolationOperands`
    // never judges boolean position (bug 0395) — throws loudly instead of
    // being cast to `boolean` and JS-negated (`!0` → `true`).
    const right = evaluatePureExpression(rightExpr, env, chain);
    if (typeof right !== "boolean") {
      throw new BooleanPositionKindDefectError(right);
    }
    return !right;
  }
  if (op === "-" && unary === true) {
    // Bug 0392 belt: mirrors the executor's unary `-` belt into this pure
    // host, so a laundered non-numeric operand reaching an interpolation or
    // invoke argument throws loudly instead of JS-coercing (`NaN`/`Infinity`
    // stay admitted — both are `typeof "number"`).
    const right = evaluatePureExpression(rightExpr, env, chain);
    if (typeof right !== "number") {
      throw new UnaryNonNumericError(right);
    }
    return -right;
  }
  const left = evaluatePureExpression(leftExpr, env, chain);
  if (op === "&&") {
    // Bug 0369 belt: mirrors the executor's `&&` belt into this pure host, so
    // a statically-deferred non-boolean operand throws loudly instead of
    // being compared against `true` and fabricating `false`.
    if (typeof left !== "boolean") {
      throw new BooleanPositionKindDefectError(left);
    }
    if (!left) {
      return false;
    }
    const right = evaluatePureExpression(rightExpr, env, chain);
    if (typeof right !== "boolean") {
      throw new BooleanPositionKindDefectError(right);
    }
    return right;
  }
  if (op === "||") {
    // Bug 0369 belt: mirrors the executor's `||` belt into this pure host.
    if (typeof left !== "boolean") {
      throw new BooleanPositionKindDefectError(left);
    }
    if (left) {
      return true;
    }
    const right = evaluatePureExpression(rightExpr, env, chain);
    if (typeof right !== "boolean") {
      throw new BooleanPositionKindDefectError(right);
    }
    return right;
  }
  const right = evaluatePureExpression(rightExpr, env, chain);
  switch (op) {
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    case "+": {
      // Bug 0368 belt: mirrors the executor's `applyBinaryScalar` bug 0368
      // belt into this pure host, so a statically-deferred mixed operand (a
      // WITHHELD fn param reaching an interpolation or an invoke argument)
      // throws loudly instead of being cast to `number` and JS-coerced.
      // `NaN`/`Infinity` are `typeof "number"`, so the guard does not fire on
      // them — `+` over a div/mod-by-zero product stays admitted.
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
      // Bug 0338 belt: mirrors the executor's `applyBinaryScalar` bug 0332 belt
      // (statement-executor.ts) into this pure host, so a statically-deferred
      // non-numeric operand (a WITHHELD fn param reaching an interpolation or an
      // invoke argument) throws loudly instead of being cast to `number` and
      // JS-coerced. `NaN`/`Infinity` are `typeof "number"`, so the guard does not
      // fire on them — `n % 0` → `NaN` and `n / 0` → `Infinity` over numeric
      // operands keep the spec's non-panicking div/mod behaviour.
      if (typeof left !== "number" || typeof right !== "number") {
        throw new BinaryNonNumericError(op, left, right);
      }
      return applyNumericArithmetic(op, left, right);
    }
    case "<":
    case "<=":
    case ">":
    case ">=": {
      // Bug 0368 belt: mirrors the executor's `applyBinaryScalar` bug 0368
      // belt into this pure host, so a statically-deferred non-orderable
      // pair (a WITHHELD fn param reaching an interpolation or an invoke
      // argument) throws loudly instead of applying raw JS relational
      // coercion. `NaN`/`Infinity` are `typeof "number"` and stay admitted.
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

export { evaluateCallSiteCwd, evaluatePureExpression, raiseInterpolatedResult };
