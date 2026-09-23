// Interpolation / query-result and `?`-operand checks for the per-parse
// type-layer walk (./type-layer-walk.ts): the V4a `?` preconditions, the
// QRY-18 `Result` interpolation row (bug 0079 §Fix (a)), and the bug 0345
// operand descent over `${…}` interpolation expressions. Split out of
// `TypeLayerWalk`; every helper reads the walk's shared `TypeWalkContext`.

import type { Expr } from "./theta-document";
import { parseExpressionSource } from "./theta-document";
import {
  INTERPOLATED_RESULT_CODE,
  INTERPOLATED_RESULT_MESSAGE,
  lexQueryTemplate,
} from "../render/query-render";
import { displayType, resolveNamedRef, type CompatType } from "./type-compat";
import {
  checkQuestionOperand,
  checkQuestionScope,
  type QuestionOperandType,
} from "./match-result";
import { isResultAnnotation, isResultGenericTypeName } from "./annotation-compat";
import {
  ARITHMETIC_OPS,
  ORDERING_OPS,
  childExprs,
  type WalkCtx,
} from "./type-layer-checks";
import {
  checkArithmeticOperands,
  checkOrderingOperands,
  checkPlusOperands,
} from "./type-layer-operand-checks";
import type { TypeWalkContext } from "./type-layer-provable";

/** The `?` operand-type and enclosing-scope preconditions (owned V4a). */
export function checkQuestion(
  walk: TypeWalkContext,
  operand: Expr,
  range: Expr["range"],
  bindings: ReadonlyMap<string, CompatType>,
  flow: WalkCtx,
): void {
  const site = { file: walk.file, range };
  const operandKind = questionOperandKind(walk, operand, bindings);
  if (operandKind !== undefined) {
    const diag = checkQuestionOperand(operandKind, site);
    if (diag !== undefined) {
      walk.diagnostics.push(diag);
    }
  }
  const scopeDiag = checkQuestionScope(flow.returnScope, site);
  if (scopeDiag !== undefined) {
    walk.diagnostics.push(scopeDiag);
  }
}

/**
 * Classify a `?` operand for the operand-type check. A query / `Result`-
 * constructor operand is a `Result` (no diagnostic). A statically-concrete
 * non-`Result` type (a primitive, literal, array, union, or inline object
 * type) is a `non-result`. Only a statically-unresolvable operand (a
 * `named` reference — an unresolved call result, a member/index
 * placeholder, and every genuine-`Result` placeholder: `Ok` / `Err` /
 * `Result<…>` / a query result) is left unclassified (`undefined`) so no
 * false positive is raised; the runtime net (`evalTry`'s brand-based guard,
 * bug 0019) rejects a non-`Result` that reaches the unwrap through this
 * arm.
 */
function questionOperandKind(
  walk: TypeWalkContext,
  operand: Expr,
  bindings: ReadonlyMap<string, CompatType>,
): QuestionOperandType | undefined {
  if (operand.kind === "query" || operand.kind === "result-ctor") {
    return { kind: "result", errIsQueryError: true };
  }
  const type = walk.typeOf(operand, bindings);
  switch (type.kind) {
    case "prim":
      return { kind: "non-result", display: type.name };
    case "literal":
      return { kind: "non-result", display: type.typesAs };
    case "array":
      return { kind: "non-result", display: "array" };
    case "union":
    case "object":
      // Non-`Result` by construction — a `Result` types as a `named`
      // placeholder (`Ok` / `Err` / `Result<…>` / a query result), never as
      // a union or an inline object type — so classifying these can never
      // false-positive a genuine `Result` (bug 0019).
      return { kind: "non-result", display: displayType(type) };
    default:
      return undefined;
  }
}

/**
 * Bug 0079 §Fix (a) — the QRY-18 `Result<T, E>` interpolation row: a
 * `${…}` interpolation this walk can PROVE `Result`-valued (see
 * {@link interpolationIsResult}) draws `theta/parse/interpolated-result`,
 * located at the enclosing `@`-query's whole range. `QueryTemplatePart`
 * carries no per-interpolation offsets and `QueryExpr` carries only `template` plus
 * the whole `range`, so the enclosing query's range is the only locatable
 * site — the same choice `checkQueryTemplateInterpolations`
 * (theta-document.ts) makes, for the same reason: the verbatim template
 * carries no per-interpolation token span.
 */
export function checkQueryInterpolationResults(
  walk: TypeWalkContext,
  e: Expr & { kind: "query" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  for (const part of lexQueryTemplate(e.template).parts) {
    if (part.kind !== "interp") {
      continue;
    }
    const parsed = parseExpressionSource(part.exprSource);
    if (parsed === null || parsed.kind === "try") {
      // No parse ⇒ no static type to classify. `?` UNWRAPS, so `${…?}` is
      // never itself the `Result` it consumes — stated here rather than left
      // to the classifier because `static-type-inference.ts`'s `try` arm
      // propagates the operand's type verbatim, making the unwrap invisible
      // to any type read.
      continue;
    }
    if (interpolationIsResult(walk, parsed, bindings)) {
      walk.diagnostics.push({
        severity: "error",
        code: INTERPOLATED_RESULT_CODE,
        file: walk.file,
        range: e.range,
        message: INTERPOLATED_RESULT_MESSAGE,
      });
    }
  }
}

/**
 * Bug 0345 §Fix — QRY-18 evaluates a `${expr}` interpolation "per the
 * Expression Sublanguage", so the three operand checks the binary arm of
 * `walkExpr` dispatches (`checkPlusOperands`, `checkOrderingOperands`,
 * `checkArithmeticOperands`) must reach an interpolation expression too —
 * `checkQueryInterpolationResults` above classifies `Result`-ness only and
 * never fires them. This method parses each interpolation source the same
 * way that classifier does and descends {@link checkInterpolationOperands}
 * over the parsed expression, OPERAND-CHECKS ONLY: it does not run
 * `checkMethodCall` / `checkIndex` / `checkMemberAccess` / `checkQuestion`.
 * Residual 1's non-operand half (unknown-method, non-indexable-receiver,
 * question-on-non-result at interpolation position) is explicitly NOT owned
 * by bug 0345 — it keeps its pinned disposition from bug 0122 — so a full
 * `walkExpr` re-entry here would close cells this report never measured or
 * authorized.
 *
 * Every diagnostic the descent pushes is relocated to the enclosing query's
 * own site (`file`/`range`) before returning: `QueryTemplatePart` carries no
 * per-interpolation offsets, the same reason `checkQueryInterpolationResults`
 * locates `INTERPOLATED_RESULT_CODE` at `e.range` rather than at the
 * expression's own (nonexistent) source span.
 */
export function checkQueryInterpolationOperands(
  walk: TypeWalkContext,
  e: Expr & { kind: "query" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  for (const part of lexQueryTemplate(e.template).parts) {
    if (part.kind !== "interp") {
      continue;
    }
    const parsed = parseExpressionSource(part.exprSource);
    if (parsed === null) {
      // Only a genuine parse failure is skipped: a `null` yields no static
      // type to walk. A top-level `try` is DESCENDED, not skipped — an
      // operand violation inside the unwrapped expression (`${f("a" + 1)?}`)
      // must still be caught, and `childExprs`' `try` arm hands the descent
      // that operand. The `.kind === "try"` skip is
      // `checkQueryInterpolationResults`' Result-classification concern (a
      // `?`-unwrap is never itself the `Result` it consumes) and does not
      // apply to operand checks, which owe the descent.
      continue;
    }
    const before = walk.diagnostics.length;
    checkInterpolationOperands(walk, parsed, bindings);
    for (let i = before; i < walk.diagnostics.length; i++) {
      const diag = walk.diagnostics[i]!;
      walk.diagnostics[i] = { ...diag, file: walk.file, range: e.range };
    }
  }
}

/**
 * The operand-only recursive walk {@link checkQueryInterpolationOperands}
 * drives. Fires the three operand checks the same way the body-statement
 * `walkExpr` binary arm does — including the same unary-minus guard, since
 * `parseUnary` (theta-document.ts) can hand this walk the same synthetic-
 * `null`-left binary node the body path excludes — then recurs into every
 * child `childExprs` exposes (binary operands, ternary branches, array
 * elements, index target/index, method-call target/args, member target,
 * call args, `try` operand, …) so a nested binary reachable through any of
 * those shapes is reached too. It fires NO other check: no method-call /
 * index / member / question check runs here, by design (see the doc comment
 * on the caller).
 */
function checkInterpolationOperands(
  walk: TypeWalkContext,
  parsed: Expr,
  bindings: ReadonlyMap<string, CompatType>,
): void {
  if (parsed.kind === "match") {
    // `match` is unconditionally refused in interpolation position
    // (`firstForbiddenInterpolationForm` → theta/parse/unsupported-feature),
    // so no operand row is owed on its arm bodies. Descending would recurse
    // into them under this walk's scope, which carries none of the
    // scrutinee-binding a real `match` arm evaluates under, and stack a
    // spurious operand diagnostic on an already-refused document. Skip whole.
    return;
  }
  if (parsed.kind === "binary") {
    if (parsed.op === "+") {
      checkPlusOperands(walk, parsed, bindings);
    } else if (ORDERING_OPS.has(parsed.op)) {
      checkOrderingOperands(walk, parsed, bindings);
    } else if (
      ARITHMETIC_OPS.has(parsed.op) &&
      !(parsed.op === "-" && parsed.left.kind === "null")
    ) {
      checkArithmeticOperands(walk, parsed, bindings);
    }
  }
  for (const child of childExprs(parsed)) {
    checkInterpolationOperands(walk, child, bindings);
  }
}

/**
 * Whether the interpolated expression `parsed` is a `Result` the static layer
 * can PROVE, classified by where the `Result`-ness comes from rather than by a
 * type name. `CompatType` has no `Result` shape, so a `Result` arrives as a
 * `named` reference — but `static-type-inference.ts` mints `named` references
 * out of author-controlled identifiers too (a member access is `named
 * <field>`, an `Ok`/`Err` constructor is `named "Ok"`/`"Err"`, a call is
 * `named <callee>`), so matching those names reads `Result` meaning into an
 * unrelated namespace: `enum Status { Ok, Bad }` / `${Status.Ok}` is QRY-18's
 * ENUM row, and a `string` field sharing a name with a `Result`-returning `fn`
 * is its object row. Hence three provenances, each unambiguous:
 *
 *   1. the node is a `Result` by construction — an `Ok`/`Err` constructor, or
 *      a call to a `fn` whose written return annotation names one;
 *   2. an identifier whose recorded binding type carries (1)'s provenance
 *      (`resultBindings`, keyed by object identity);
 *   3. a type named in the generic `Result<…>` form — a written annotation, an
 *      annotated `fn` parameter, or a `par for` element (CTRL-3). `<` bars any
 *      identifier from colliding with it.
 *
 * Everything else is left to §Fix (b)'s runtime panic. The asymmetry is the
 * point: an unprovable interpolation degrades to the runtime fallback, whereas
 * a wrong emission refuses a valid theta at load, which is what this module's
 * header and the adjacent `questionOperandKind` (bug 0019) both forbid.
 */
function interpolationIsResult(
  walk: TypeWalkContext,
  parsed: Expr,
  bindings: ReadonlyMap<string, CompatType>,
): boolean {
  switch (parsed.kind) {
    case "result-ctor":
    case "call":
      return isCertainResultNode(walk, parsed);
    case "ident": {
      const type = walk.typeOf(parsed, bindings);
      return walk.resultBindings.has(type) || isResultGenericType(walk, type);
    }
    case "index":
      // CTRL-3 makes a `par for`'s value `array<Result<U, QueryError>>`, so an
      // element read is the one composite whose type names the generic form.
      return isResultGenericType(walk, walk.typeOf(parsed, bindings));
    default:
      // `binary` / `ternary` / `match` narrow through `#commonType`
      // (static-type-inference.ts), which lets an unresolvable operand type
      // stand in for the whole expression — so a type read on them proves
      // nothing about the expression's own type. Every remaining kind types as
      // a `named` reference built from an author-chosen identifier, which
      // cannot spell the generic form.
      return false;
  }
}

/**
 * Whether `e`'s node kind alone makes it a `Result`: an `Ok`/`Err`
 * constructor, or a call to a `fn` whose own WRITTEN return annotation names a
 * `Result`. `walk.fnReturns` is the only source for the latter — `TypeEnv`
 * carries schema declarations only, and a `call` types as its callee's bare
 * NAME, so an annotated `Result` return is invisible past the call site.
 *
 * The prefix match below is safe against text that names no type WITHOUT a
 * guard here, because the table it reads was seeded absent of such text
 * (`collectFnReturnAnnotations`, and the absence invariant at
 * `annotationSourceIsNotTypeExpression`) — which is what keeps `/^Result\b/`
 * from granting `Result`-ness to a `Result`-prefixed junk annotation.
 */
export function isCertainResultNode(walk: TypeWalkContext, e: Expr): boolean {
  if (e.kind === "result-ctor") {
    return true;
  }
  if (e.kind !== "call") {
    return false;
  }
  const declaredReturn = walk.fnReturns.get(e.callee);
  return declaredReturn !== undefined && isResultAnnotation(declaredReturn);
}

/**
 * Whether `type` is an unresolvable `named` reference spelling the generic
 * `Result<…>` form. A name `walk.env` resolves is a declared schema / enum /
 * alias and is rejected first, so an author's own `Result`-named declaration
 * keeps its own meaning.
 */
function isResultGenericType(walk: TypeWalkContext, type: CompatType): boolean {
  return (
    type.kind === "named" &&
    resolveNamedRef(walk.env, type) === undefined &&
    isResultGenericTypeName(type.name)
  );
}
