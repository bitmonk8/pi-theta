// Operand-category and receiver/member/stdlib call checks for the per-parse
// type-layer walk (./type-layer-walk.ts): the boolean/`+`/ordering/arithmetic
// binary and unary operand-type gates (A5 / A6 / A7), the indexed-access
// receiver and object-key checks (V3a / V3h), and the method-call /
// member-access stdlib-surface checks (A2, `array.join`, bug 0315). Split out
// of `TypeLayerWalk`; every helper reads the walk's shared `TypeWalkContext`.

import type { Expr } from "./theta-document";
import { displayType, unfoldAlias, type CompatType } from "./type-compat";
import { containsWithheldBinderType } from "./compat-type-traversal";
import { checkBooleanPosition, checkIndexReceiver } from "./expression-position-checks";
import { checkStdlibMethodCall } from "./stdlib-arg-diagnostics";
import { checkArrayJoin } from "../runtime/stdlib-array";
import { checkObjectIndex } from "../runtime/stdlib-object";
import {
  ARITHMETIC_OPS,
  ORDERING_OPS,
  builtinMembers,
  classifyOperand,
  classifyReceiver,
  stdlibSignatureFor,
} from "./type-layer-checks";
import { provableArgType, type TypeWalkContext } from "./type-layer-provable";

/** Check boolean, additive, ordering, and numeric binary operand contracts. */
export function checkBinaryOperands(
  walk: TypeWalkContext,
  e: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  if (e.op === "&&" || e.op === "||") {
    for (const operand of [e.left, e.right]) {
      walk.diagnostics.push(
        ...checkBooleanPosition({
          operandType: walk.typeOf(operand, bindings),
          site: { file: walk.file, range: operand.range },
        }),
      );
    }
  } else if (e.op === "!") {
    // `!` is a boolean position (expressions.md §Truthiness, six-position
    // list). `parseUnary` models `!` as a binary carrying a synthetic
    // `null` left operand (bug 0367's `unary` marker discipline) — judge
    // `e.right` only, the real operand; judging `e.left` would refuse a
    // phantom. `checkCompatible`'s existing `unknown` deferral keeps a
    // laundered `!c` (an unannotated fn param) flowing to the bug 0369
    // runtime belt.
    walk.diagnostics.push(
      ...checkBooleanPosition({
        operandType: walk.typeOf(e.right, bindings),
        site: { file: walk.file, range: e.right.range },
      }),
    );
  } else if (e.op === "+") {
    checkPlusOperands(walk, e, bindings);
  } else if (ORDERING_OPS.has(e.op)) {
    checkOrderingOperands(walk, e, bindings);
  } else if (ARITHMETIC_OPS.has(e.op) && e.unary !== true) {
    // `parseUnary` (theta-document.ts) models unary `-`/`!` as a binary
    // carrying a synthetic `null` left operand, and marks that one
    // minted node `unary: true`. The spec's numeric-operand rule for
    // `-`/`*`/`/`/`%` is a BINARY-arithmetic rule (bug 0332's Non-goals
    // excludes unary `-` in expression position explicitly), so the
    // marked unary node must not reach `checkArithmeticOperands` — it
    // would judge the placeholder `null` left operand, not a real
    // pairing. Gating on the marker (bug 0367) rather than on
    // `e.left.kind === "null"` keeps an authored `null - x` in scope:
    // that pairing is AST-identical to the synthetic node except for
    // the marker, and the spec names `null` in the refusal set.
    checkArithmeticOperands(walk, e, bindings);
  } else if (ARITHMETIC_OPS.has(e.op) && e.unary === true) {
    // The marked unary node's placeholder `null` left operand is not a
    // real pairing (see the comment above), but its single `right`
    // operand IS the real unary `-` operand — expressions.md §"Other
    // arithmetic" applies the same numeric-only rule to it (bug 0392;
    // bug 0332's Non-goals scope-excluded unary `-`, but the belt law
    // now brings it into the family as this arm's sibling).
    checkUnaryArithmeticOperand(walk, e, bindings);
  }
}

/** The indexed-access receiver / object-index checks (owned V3a / V3h). */
export function checkIndex(
  walk: TypeWalkContext,
  e: Expr & { kind: "index" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const receiverType = walk.typeOf(e.target, bindings);
  const site = { file: walk.file, range: e.range };
  const receiverDiag = checkIndexReceiver({ receiverType, env: walk.env, site });
  if (receiverDiag !== undefined) {
    walk.diagnostics.push(receiverDiag);
  }
  // The KEY read is judged by `checkObjectIndex`, which requires a `string`
  // and refuses everything else, an unresolvable `named` included
  // (../runtime/stdlib-object.ts) — the `checkForIterand` shape. A key read
  // out of a WITHHELD binder therefore withholds the verdict here: the
  // runtime key may well be the string the receiver wants.
  const indexType = walk.typeOf(e.index, bindings);
  const objectDiag = containsWithheldBinderType(indexType)
    ? undefined
    : checkObjectIndex({ receiverType, indexType, env: walk.env, site });
  if (objectDiag !== undefined) {
    walk.diagnostics.push(objectDiag);
  }
}

/**
 * The method-call type-layer checks: the `array.join` element-type
 * precondition (owned V3g), the A2 `unknown-method` stdlib allow-list,
 * and the known-member arity/type signature check (bug 0315).
 * The latter two fire only for a concretely-resolvable built-in receiver.
 */
export function checkMethodCall(
  walk: TypeWalkContext,
  e: Expr & { kind: "method-call" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const targetType = walk.typeOf(e.target, bindings);
  // TYPE-11: an alias of `array<T>` IS `array<T>`, so the `join` element
  // precondition (expressions.md §"array<T>" `join` row) must see it that
  // way. One construction point: `classifyReceiver` below unfolds
  // internally on whatever it is handed, so it is unaffected by receiving
  // this already-unfolded value.
  const unfoldedTarget = unfoldAlias(targetType, walk.env);
  checkJoinElement(walk, e, unfoldedTarget);
  // A2 — a method call on a concrete built-in receiver whose name the theta
  // 1.0 stdlib does not expose. A statically-unresolvable receiver defers to
  // the runtime safety net (no diagnostic).
  const kind = classifyReceiver(unfoldedTarget, walk.env);
  if (kind === "unknown") {
    return;
  }
  if (!builtinMembers(kind).has(e.method)) {
    // The RAW `targetType`, not the unfolded copy above: the message names
    // the receiver's declared type, and an alias the author wrote must
    // still read back as itself here, whatever it unfolds to for the
    // checks above.
    pushUnknownMethod(walk, e.method, targetType, e.range);
    return;
  }
  checkStdlibSignature(walk, e, bindings, targetType, unfoldedTarget, kind);
}

/** Check the array.join element precondition after unfolding the receiver. */
function checkJoinElement(
  walk: TypeWalkContext,
  e: Expr & { kind: "method-call" },
  unfoldedTarget: CompatType,
): void {
  if (e.method === "join" && unfoldedTarget.kind === "array") {
    // The ELEMENT is unfolded too, and for the same reason one level down:
    // TYPE-11 makes an alias element the type it names, so the registered
    // trigger — an element type that is not `string` — is a question about
    // the unfolded element, not about the name the author wrote for it.
    // `checkArrayJoin` is a pure element predicate and holds no `TypeEnv`,
    // so applying the transparency is the caller's job. TYPE-10 bounds it:
    // an object-schema `named` element comes back unchanged and stays
    // non-string, as does an unresolvable one.
    //
    // An element read out of a WITHHELD binder withholds this verdict, for
    // the same reason as the iterand and object-key rows: the predicate
    // refuses every non-`string` element including an unresolvable one, so it
    // cannot defer on a withheld read by itself, and the runtime element may
    // be the string the method requires (`[x].join(",")` inside
    // `for x in ["a"] { … }`).
    const joinElement = unfoldAlias(unfoldedTarget.element, walk.env);
    const diag = containsWithheldBinderType(joinElement)
      ? undefined
      : checkArrayJoin(joinElement, {
          file: walk.file,
          range: e.range,
        });
    if (diag !== undefined) {
      walk.diagnostics.push(diag);
    }
  }
}

/** Check a known stdlib member's arity and argument types after the allow-list passes. */
function checkStdlibSignature(
  walk: TypeWalkContext,
  e: Expr & { kind: "method-call" },
  bindings: ReadonlyMap<string, CompatType>,
  targetType: CompatType,
  unfoldedTarget: CompatType,
  kind: ReturnType<typeof classifyReceiver>,
): void {
  // Bug 0315 — the member NAME is known (the allow-list above passed), so
  // check its argument list against the shared arity/type signature table:
  // arity first (`theta/parse/stdlib-arity-mismatch`), then, only if arity is
  // in range, per-argument type (`theta/parse/stdlib-arg-type-mismatch`).
  // Only reached for a concretely-resolvable receiver `kind` (the `unknown`
  // early-return above already deferred a laundered receiver to the runtime
  // dispatcher belt).
  const signature = stdlibSignatureFor(kind, e.method);
  if (signature === undefined) {
    return;
  }
  // The array receiver's own element type, for the `"element"` param
  // descriptor (`includes(x)` / `indexOf(x)` on `array<T>`) — unfolded the
  // same way the `join` precondition's `joinElement` above is, so TYPE-11
  // transparency applies identically.
  const elementType =
    unfoldedTarget.kind === "array" ? unfoldAlias(unfoldedTarget.element, walk.env) : undefined;
  const diags = checkStdlibMethodCall({
    method: e.method,
    signature,
    displayReceiverType: displayType(targetType),
    argCount: e.args.length,
    // `provableArgType`, not `typeOf`: the same EXACTNESS gate
    // `checkFnCallArgs` reads for its own per-argument type check (bug
    // 0156/0072's soundness lesson) — a lossy reduction (an array literal
    // with no common element type, a bare identifier minted from an
    // author-chosen name that resolves to nothing declared, an erased
    // ternary/match branch) must not be treated as a proof of the
    // argument's runtime type here either, or this check would double up on
    // a node another row already refuses (or fabricate a mismatch `typeOf`'s
    // lossy fallback invents).
    argTypeAt: (i) => provableArgType(walk, e.args[i] as Expr, bindings),
    elementType,
    env: walk.env,
    site: { file: walk.file, range: e.range },
  });
  walk.diagnostics.push(...diags);
}

/**
 * The A2 `unknown-method` check on a bare member (property) access
 * `target.member`. Object *field* access (`obj.field`) is legitimate and is
 * not gated; a member-less primitive (`number` / `integer` / `boolean` /
 * `null`) or a `string` / `array` property outside the stdlib surface is
 * `theta/parse/unknown-method`. A statically-unresolvable receiver defers.
 */
export function checkMemberAccess(
  walk: TypeWalkContext,
  e: Expr & { kind: "member" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  // Bug 0191 §Fix route 1: `e` ITSELF (not `e.target`) is the node
  // `#memberType` (./static-type-inference.ts) types, so its own answer
  // already carries the `enumRef` provenance marker when `e.target` names a
  // declared enum. An object-schema shadow already bypasses this whole
  // check through the `"object"` kind below — field access on an object
  // value is not a stdlib-member question — but a shadow that unfolds to a
  // primitive or union (`schema Color = string`, e1–e3) does not, and
  // without this test `Red` would be judged as a `string` / stdlib member
  // of the SCHEMA's own unfolded type, which is exactly the fabrication
  // §Fix removes: an enum variant access is never a stdlib-member read, so
  // it defers here the same way an unresolved receiver does.
  const ownType = walk.typeOf(e, bindings);
  if (ownType.kind === "named" && ownType.enumRef === true) {
    return;
  }
  const receiverType = walk.typeOf(e.target, bindings);
  const kind = classifyReceiver(receiverType, walk.env);
  if (kind === "unknown" || kind === "object") {
    // Unresolved receiver (defer to runtime) or an object field access
    // (`obj.field` — not a stdlib member surface).
    return;
  }
  if (!builtinMembers(kind).has(e.field)) {
    pushUnknownMethod(walk, e.field, receiverType, e.range);
  }
}

/** Emit `theta/parse/unknown-method` (message from code-registry-parse.md). */
function pushUnknownMethod(
  walk: TypeWalkContext,
  name: string,
  receiverType: CompatType,
  range: Expr["range"],
): void {
  walk.diagnostics.push({
    severity: "error",
    code: "theta/parse/unknown-method",
    file: walk.file,
    range,
    message: `unknown method '${name}' on type ${displayType(receiverType)}`,
  });
}

/**
 * A5 — the `+` operand-type check. `+` accepts two numeric operands
 * (addition) or two `string` operands (concatenation); every other concrete
 * pairing is `theta/parse/mixed-plus-operands` (expressions.md §"`+`
 * operator"). Fires only when both operands are statically resolvable.
 */
export function checkPlusOperands(
  walk: TypeWalkContext,
  e: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const leftType = walk.typeOf(e.left, bindings);
  const rightType = walk.typeOf(e.right, bindings);
  pushMixedPlusIfNeeded(walk, leftType, rightType, e.range);
}

/**
 * The type-pair core of A5, factored out so the SPELLED `x + e` binary
 * (`checkPlusOperands` above) and the DESUGARED `x += e` compound
 * reassignment (bug 0314's `case "reassign"` arm, bindings.md's
 * `x <op>= e ≡ x = x <op> e`) share one classifier instead of drifting into
 * two copies of the same rule.
 */
export function pushMixedPlusIfNeeded(
  walk: TypeWalkContext,
  leftType: CompatType,
  rightType: CompatType,
  range: Expr["range"],
): void {
  const left = classifyOperand(leftType, walk.env);
  const right = classifyOperand(rightType, walk.env);
  if (left === "unknown" || right === "unknown") {
    return;
  }
  if (
    (left === "numeric" && right === "numeric") ||
    (left === "string" && right === "string")
  ) {
    return;
  }
  walk.diagnostics.push({
    severity: "error",
    code: "theta/parse/mixed-plus-operands",
    file: walk.file,
    range,
    message: `'+' has mixed operand types: ${displayType(leftType)} and ${displayType(
      rightType,
    )}`,
  });
}

/**
 * A6 — the ordering-operator (`<` / `<=` / `>` / `>=`) operand-type check.
 * Ordering accepts two numeric operands or two `string` operands; every other
 * concrete pairing is `theta/parse/non-orderable-operands` (expressions.md
 * §"Ordering comparisons"). Fires only when both operands are statically
 * resolvable.
 */
export function checkOrderingOperands(
  walk: TypeWalkContext,
  e: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const leftType = walk.typeOf(e.left, bindings);
  const rightType = walk.typeOf(e.right, bindings);
  const left = classifyOperand(leftType, walk.env);
  const right = classifyOperand(rightType, walk.env);
  if (left === "unknown" || right === "unknown") {
    return;
  }
  if (
    (left === "numeric" && right === "numeric") ||
    (left === "string" && right === "string")
  ) {
    return;
  }
  walk.diagnostics.push({
    severity: "error",
    code: "theta/parse/non-orderable-operands",
    file: walk.file,
    range: e.range,
    message: `'${e.op}' requires two numeric or two string operands; got ${displayType(
      leftType,
    )} and ${displayType(rightType)}`,
  });
}

/**
 * A7 — the spelled arithmetic (`-` / `*` / `/` / `%`) operand-type check.
 * expressions.md §"Other arithmetic": these accept only numeric operands;
 * every other concrete pairing is `theta/parse/non-numeric-arithmetic-operands`
 * (bug 0332). Mirrors `checkOrderingOperands`: fires only when both operands
 * are statically resolvable, deferring a statically-unresolvable operand to
 * runtime, where the executor's `applyBinaryScalar` numeric belt catches a
 * non-number on the body-statement evaluation path. Scoped to the spelled binary in
 * expression position — the compound `-=`/`*=`/`/=`/`%=` desugar is a §Non-goal
 * kept on bug 0314's runtime belt (see the `case "reassign"` arm).
 */
export function checkArithmeticOperands(
  walk: TypeWalkContext,
  e: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const leftType = walk.typeOf(e.left, bindings);
  const rightType = walk.typeOf(e.right, bindings);
  const left = classifyOperand(leftType, walk.env);
  const right = classifyOperand(rightType, walk.env);
  if (left === "unknown" || right === "unknown") {
    return;
  }
  if (left === "numeric" && right === "numeric") {
    return;
  }
  walk.diagnostics.push({
    severity: "error",
    code: "theta/parse/non-numeric-arithmetic-operands",
    file: walk.file,
    range: e.range,
    message: `'${e.op}' requires two numeric operands; got ${displayType(
      leftType,
    )} and ${displayType(rightType)}`,
  });
}

/**
 * Bug 0392 — unary `-`'s single-operand sibling of `checkArithmeticOperands`.
 * expressions.md §"Other arithmetic" gives unary `-` the same numeric-only
 * rule as the binary operators, judged against the marked node's real
 * operand (`e.right`; `e.left` is the synthetic placeholder — bug 0367).
 * Reuses the binary check's code rather than minting one (the 0326
 * anti-fork law; the 0314 `mixed-plus-operands` widening is the DIAG-2
 * precedent) — permitted-codes.json stays unchanged.
 */
function checkUnaryArithmeticOperand(
  walk: TypeWalkContext,
  e: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const rightType = walk.typeOf(e.right, bindings);
  const right = classifyOperand(rightType, walk.env);
  if (right === "unknown" || right === "numeric") {
    return;
  }
  walk.diagnostics.push({
    severity: "error",
    code: "theta/parse/non-numeric-arithmetic-operands",
    file: walk.file,
    range: e.range,
    message: `unary '-' requires a numeric operand; got ${displayType(rightType)}`,
  });
}
