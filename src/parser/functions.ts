// V3d / V3d-T — the functions-and-return parse/type seam.
//
// This module owns the parse- and type-phase obligations of functions.md and
// return.md for top-level `fn` declarations and the `return` statement:
//
//   - FN-1 (Placement) — `fn` declarations are top-level only:
//       * `theta/parse/nested-fn`         — a `fn` nested inside another `fn`
//         body or a block (`parse` phase).
//       * `theta/parse/function-as-value` — a function name used outside call
//         position (bound to `let`, passed as an argument) (`parse` phase).
//       * hoisted mutual recursion between two top-level `fn`s is allowed: a
//         forward reference to a hoisted top-level `fn` resolves.
//   - FN-2 (Documentation) — a `fn`'s leading `///` doc comment is preserved on
//     the AST as human-facing documentation only; functions have no JSON Schema
//     so the description lowers nowhere (does not enter provider payloads).
//   - FN-3 / RET-1 (Theta return type / return type-check) — an annotation-less
//     body infers its return type as the LUB (under `⊑`) of the tail-expression
//     and every `return` operand, wrapped in `Result<T, QueryError>` when the
//     body can short-circuit with an `Err` (`?` present, or a `Result`-typed
//     contribution); an explicit return annotation type-checks the tail and
//     every `return` operand against the annotation instead of inferring;
//     contributions sharing no common upper bound and narrowed by no sink fire
//     `theta/parse/return-no-common-type`.
//   - FN-4 (Empty-tail body) — an empty-tail body infers `null` (the literal
//     type); a `?`-bearing empty-tail body infers `Result<null, QueryError>`.
//   - RET-2 / RET-3 — bare `return` is legal only in a `void`-annotated
//     function (`theta/parse/bare-return-in-non-void` elsewhere, including at the
//     top level); code after a `return` in the same block warns
//     `theta/parse/unreachable-code`.
//
// V3d-T (tests-task) declares these seam shapes and stubs the behaviour-bearing
// functions inertly (placement / unreachable checks return no diagnostic;
// `resolveFnCall` and `resolveReturnType` return the `"unchecked"` sentinel;
// `buildFnDeclaration` does not preserve the doc; `lowerFnDescription` wrongly
// carries it). Each obligation test reds on its own primary assertion (an
// absent expected diagnostic, the sentinel, a missing AST doc, or a wrongly
// lowered description), not on a compile error, a missing fixture, or a harness
// throw. The paired V3d implementation leaf fills every check in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import {
  checkCompatible,
  type Compatibility,
  type CompatType,
  type TypeEnv,
  widenLiteralTypes,
} from "./type-compat";

/** A located site at which a function/return form is checked. */
export interface FnSite {
  readonly file: string;
  readonly range: SourceRange;
}

// --- FN-1 — Placement -------------------------------------------------------

/**
 * A `fn` declaration occurrence. `nested` is whether the declaration sits
 * lexically inside another `fn` body or a block (theta 1.0 admits top-level
 * `fn` only).
 */
export interface FnPlacement {
  readonly nested: boolean;
}

/**
 * Check a `fn` declaration's placement (`parse` phase), returning
 * `theta/parse/nested-fn` when the declaration is nested inside another `fn`
 * body or a block. Returns `undefined` for a top-level `fn` (functions.md
 * FN-1).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkFnPlacement(
  placement: FnPlacement,
  site: FnSite,
): Diagnostic | undefined {
  if (!placement.nested) {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md.
  return {
    severity: "error",
    code: "theta/parse/nested-fn",
    file: site.file,
    range: site.range,
    message: "nested 'fn' declarations are not supported in theta 1.0",
  };
}

/**
 * A reference to a function name. `position` is `"call"` when the name appears
 * in call position (`f(...)`) and `"value"` when it is used as a value (bound
 * to `let`, passed as an argument) — theta 1.0 has no first-class functions.
 */
export interface FunctionReference {
  readonly name: string;
  readonly position: "call" | "value";
}

/**
 * Check a function-name reference (`parse` phase), returning
 * `theta/parse/function-as-value` when the name is used outside call position.
 * Returns `undefined` for a call-position reference (functions.md FN-1).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkFunctionReference(
  ref: FunctionReference,
  site: FnSite,
): Diagnostic | undefined {
  if (ref.position === "call") {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md (interpolates the name).
  return {
    severity: "error",
    code: "theta/parse/function-as-value",
    file: site.file,
    range: site.range,
    message: `function '${ref.name}' used outside call position; functions are not first-class in theta 1.0`,
  };
}

/**
 * The resolution outcome of a `fn` call against the hoisted top-level `fn` set:
 *
 *   - `"resolved"`   — the called name is a hoisted top-level `fn`.
 *   - `"unresolved"` — the called name is no known top-level `fn`.
 *   - `"unchecked"`  — the V3d-T stub sentinel. The paired V3d resolver never
 *     returns this; it exists only so the hoisted-mutual-recursion test reds on
 *     its own primary assertion (no expected outcome equals `"unchecked"`).
 */
export type FnResolution = "resolved" | "unresolved" | "unchecked";

/**
 * Resolve a `fn` call against the file's hoisted top-level `fn` names.
 * Declarations are hoisted within the file, so a forward reference to a
 * top-level `fn` (including the mutual-recursion case, where two top-level
 * `fn`s call each other) resolves regardless of declaration order
 * (functions.md FN-1). A name in no top-level `fn` set is `"unresolved"`.
 *
 * V3d-T stubs this as the inert `"unchecked"` sentinel; the paired V3d leaf
 * computes the resolution.
 */
export function resolveFnCall(
  name: string,
  hoistedTopLevelFns: readonly string[],
): FnResolution {
  return hoistedTopLevelFns.includes(name) ? "resolved" : "unresolved";
}

// --- FN-2 — Documentation ---------------------------------------------------

/**
 * A top-level `fn` declaration AST node, as far as the documentation seam is
 * concerned. `doc` is the joined `///` doc-comment text when one sits above the
 * declaration, preserved on the AST as human-facing documentation only.
 */
export interface FnDeclaration {
  readonly name: string;
  readonly params: readonly { readonly name: string; readonly type: CompatType }[];
  readonly doc?: string;
}

/**
 * Build a `fn` declaration AST node, preserving a leading `///` doc comment on
 * the node as documentation only (functions.md FN-2). A `fn` with no doc
 * comment leaves `doc` absent.
 *
 * V3d-T stubs this so it does NOT preserve the doc (the built node omits
 * `doc`), so the FN-2 AST-preservation test reds on its own primary assertion.
 * The paired V3d leaf preserves it.
 */
export function buildFnDeclaration(opts: {
  readonly name: string;
  readonly params: readonly { readonly name: string; readonly type: CompatType }[];
  readonly doc?: string;
}): FnDeclaration {
  // FN-2 — preserve the `///` doc comment on the AST node as documentation
  // only; a `fn` with no doc comment leaves `doc` absent.
  return opts.doc === undefined
    ? { name: opts.name, params: opts.params }
    : { name: opts.name, params: opts.params, doc: opts.doc };
}

/**
 * Lower a `fn`'s documentation into its provider-payload schema fragment.
 * Functions have no JSON Schema, so a `fn`'s `///` doc comment lowers nowhere:
 * the fragment carries no `description` regardless of whether the node has a
 * doc (functions.md FN-2 — the description does not lower into provider
 * payloads).
 *
 * V3d-T stubs this so it WRONGLY carries the doc into the fragment when one is
 * present, so the FN-2 no-lowering test reds on its own primary assertion. The
 * paired V3d leaf returns the empty fragment.
 */
export function lowerFnDescription(node: FnDeclaration): Record<string, unknown> {
  // FN-2 — functions have no JSON Schema, so a `fn`'s `///` doc comment lowers
  // nowhere: the fragment carries no `description` regardless of the node's doc.
  void node;
  return {};
}

// --- FN-3 / RET-1 — Return-type inference and type-check ---------------------

/**
 * A single contribution to a body's return type — the tail expression's type
 * or an early `return` operand's type:
 *
 *   - `"plain"`  — a non-`Result` operand of static type `type`. Its path
 *     yields an implicit `Ok(type)` when the body wraps.
 *   - `"result"` — a `Result<payload, QueryError>`-typed operand; it
 *     contributes its success `payload` and forces the `Result` wrap.
 */
export type ReturnContribution =
  | { readonly kind: "plain"; readonly type: CompatType }
  | { readonly kind: "result"; readonly payload: CompatType };

/**
 * An inferred return type: the reconciled success `payload` (the LUB under
 * `⊑`), `wrapped` in `Result<payload, QueryError>` when the body can
 * short-circuit with an `Err` (the error arm is `QueryError` throughout).
 */
export interface InferredReturnType {
  readonly payload: CompatType;
  readonly wrapped: boolean;
}

/**
 * The outcome of resolving a body's return type:
 *
 *   - `"inferred"`               — an annotation-less body; `inferred` is the
 *     LUB-reconciled (and possibly `Result`-wrapped) return type.
 *   - `"inference-no-common-type"` — an annotation-less body whose
 *     contributions share no common upper bound and no sink narrows them;
 *     carries the `theta/parse/return-no-common-type` diagnostic.
 *   - `"checked"`                — an explicitly annotated body; `operandResults`
 *     is the per-contribution compatibility against the annotation, in
 *     contribution order (inference is bypassed).
 *   - `"unchecked"`              — the V3d-T stub sentinel. The paired V3d
 *     resolver never returns this; it exists only so every inference/check test
 *     reds on its own primary assertion.
 */
export type ResolvedReturn =
  | { readonly kind: "inferred"; readonly inferred: InferredReturnType }
  | { readonly kind: "inference-no-common-type"; readonly diagnostic: Diagnostic }
  | { readonly kind: "checked"; readonly operandResults: readonly Compatibility[] }
  | { readonly kind: "unchecked" };

/**
 * Resolve a body's return type (functions.md FN-3 / FN-4, return.md RET-1).
 *
 *   - With no `annotation`: infer the return type as the LUB (under `⊑`) of the
 *     contributions, wrapped in `Result<T, QueryError>` when `hasQuestion` or
 *     any `"result"` contribution forces the wrap. An empty `contributions`
 *     list (an empty-tail body) infers the `null` literal type (FN-4), wrapped
 *     to `Result<null, QueryError>` when `hasQuestion`. Contributions sharing
 *     no common upper bound under `⊑` (and narrowed by no sink) yield
 *     `theta/parse/return-no-common-type`.
 *   - With an `annotation`: type-check the tail and every `return` operand
 *     against the annotation instead of inferring; `operandResults` is the
 *     per-contribution `⊑` outcome.
 *
 * V3d-T stubs this as the inert `"unchecked"` sentinel; the paired V3d leaf
 * computes the inference / type-check.
 */
export function resolveReturnType(opts: {
  readonly annotation?: CompatType;
  readonly contributions: readonly ReturnContribution[];
  readonly hasQuestion: boolean;
  readonly env: TypeEnv;
  readonly site: FnSite;
}): ResolvedReturn {
  const { annotation, contributions, hasQuestion, env, site } = opts;

  // RET-1 — an explicit return annotation bypasses inference: type-check the
  // tail and every `return` operand against the annotation, in contribution
  // order. A `"plain"` operand contributes its type; a `"result"` operand its
  // success payload (the only success-path type the CompatType model expresses).
  if (annotation !== undefined) {
    const operandResults: Compatibility[] = contributions.map((c) =>
      checkCompatible(operandType(c), annotation, env),
    );
    return { kind: "checked", operandResults };
  }

  // FN-3 — wrap in `Result<T, QueryError>` when the body can short-circuit with
  // an `Err`: any `?` in the body, or any `Result`-typed contribution.
  const wrapped =
    hasQuestion || contributions.some((c) => c.kind === "result");

  // FN-4 — an empty-tail body infers the `null` literal type (wrapped to
  // `Result<null, QueryError>` when the body bears `?`).
  if (contributions.length === 0) {
    // FN-4 — the `null` literal type an empty-tail body infers.
    return {
      kind: "inferred",
      inferred: { payload: { kind: "literal", typesAs: "null" }, wrapped },
    };
  }

  // Reconcile the contributing success payloads by their LUB under `⊑`. When
  // wrapping applies, a `Result<U, QueryError>` operand contributes `U` and a
  // plain operand `X` contributes `X`; when it does not, the tail/`return`
  // types are reconciled directly. `operandType` already projects each
  // contribution to its representable success-payload type, so one path serves
  // both cases.
  const payloadTypes = contributions.map(operandType);
  const payload = computeLub(payloadTypes, env);

  if (payload === undefined) {
    // FN-3 — contributions sharing no common upper bound (and narrowed by no
    // sink) have no inferred type. Message from
    // diagnostics/code-registry-parse.md.
    return {
      kind: "inference-no-common-type",
      diagnostic: {
        severity: "error",
        code: "theta/parse/return-no-common-type",
        file: site.file,
        range: site.range,
        message:
          "return operands have no common type; annotate the function return type or reconcile the operands",
      },
    };
  }

  return { kind: "inferred", inferred: { payload, wrapped } };
}

/**
 * Project a return contribution to the type it contributes to inference /
 * checking: a `"plain"` operand its own type, a `"result"` operand its success
 * payload (its path yields an implicit `Ok(payload)`).
 */
function operandType(c: ReturnContribution): CompatType {
  return c.kind === "plain" ? c.type : c.payload;
}

/**
 * The least upper bound of `types` under `⊑`: a member `C` of `types` such
 * that every type is `⊑ C`. Returns `undefined` when no member dominates the
 * rest — unlike `commonType` (`./type-compat.ts`), this LUB has no union
 * clause, so a non-dominated set here has no candidate rather than a computed
 * union. A statically-unresolvable operand (`"unknown"`) does not block a
 * candidate — the runtime AJV check is the safety net.
 *
 * Each candidate is widened to the primitive it types as (TYPE-3) before the
 * domination test: an unwidened `literal` candidate carries less absorbing
 * power than the `prim` it types as, so a `literal number` candidate could
 * not dominate a `prim integer` contribution even though `integer ⊑ number`
 * holds (TYPE-2) — bug 0344's `commonType` asymmetry, mirrored here per bug
 * 0346. The inner `every` test still relates the RAW contributions against
 * the widened candidate, and the member returned is the WIDENED one, so the
 * resolved type is a primitive rather than a literal.
 */
function computeLub(
  types: readonly CompatType[],
  env: TypeEnv,
): CompatType | undefined {
  return types
    .map((candidate) => widenLiteralTypes(candidate))
    .find((candidate) =>
      types.every((t) => {
        const r = checkCompatible(t, candidate, env);
        return r === "compatible" || r === "unknown";
      }),
    );
}

// --- RET-2 / RET-3 — bare `return` and unreachable code ---------------------

/**
 * A bare `return` (no operand) occurrence. `returnTypeIsVoid` is whether the
 * enclosing scope is a `void`-annotated function; a top-level theta and any
 * non-`void` function are `false` (RET-2).
 */
export interface BareReturn {
  readonly returnTypeIsVoid: boolean;
}

/**
 * Check a bare `return` (`type` phase), returning
 * `theta/parse/bare-return-in-non-void` when the enclosing scope is not a
 * `void`-annotated function (including a top-level theta). Returns `undefined`
 * inside a `void` function (return.md RET-2).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkBareReturn(
  bare: BareReturn,
  site: FnSite,
): Diagnostic | undefined {
  if (bare.returnTypeIsVoid) {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md.
  return {
    severity: "error",
    code: "theta/parse/bare-return-in-non-void",
    file: site.file,
    range: site.range,
    message: "missing return value",
  };
}

/**
 * A block position after a `return`. `hasCodeAfterReturn` is whether a further
 * statement appears after a `return` in the same block (RET-3).
 */
export interface UnreachableCode {
  readonly hasCodeAfterReturn: boolean;
}

/**
 * Check for code after a `return` in the same block (`parse` phase), returning
 * the `theta/parse/unreachable-code` warning when a statement follows a `return`
 * in the same block. Returns `undefined` otherwise (return.md RET-3).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkUnreachableCode(
  unreachable: UnreachableCode,
  site: FnSite,
): Diagnostic | undefined {
  if (!unreachable.hasCodeAfterReturn) {
    return undefined;
  }
  // RET-3 — unreachable code is a warning, not an error. Message from
  // diagnostics/code-registry-parse.md.
  return {
    severity: "warning",
    code: "theta/parse/unreachable-code",
    file: site.file,
    range: site.range,
    message: "unreachable code after return",
  };
}

// --- FN-3 — a `.theta` callee's inferred return type at a runtime call site --

/**
 * The `.theta` body shapes this derivation reads. Declared structurally — a
 * type-only shape, not an import of the `Block` / `Stmt` AST union from
 * `./theta-document` — so this module adds no runtime edge onto that parser
 * module; `ThetaBody` is structurally assignable here (every `Stmt` variant
 * carries a `kind` string). Exported so an exported function's parameter type
 * names no private type under this project's `declaration: true` build.
 */
export interface CalleeBody {
  readonly statements: readonly { readonly kind: string }[];
  readonly tail: CalleeTail | null;
}

/**
 * The tail-expression shape this derivation classifies; every `Expr` variant
 * is structurally assignable here (an absent `typeName` / `target` satisfies
 * the optional fields; a present one matches the type given).
 */
export interface CalleeTail {
  readonly kind: string;
  readonly typeName?: string | null;
  readonly target?: { readonly kind: string; readonly name?: string };
}

/**
 * The annotation source naming a `.theta` callee's inferred return type, or
 * `null` when this derivation cannot name it.
 *
 * `tool-calls.md` §"Return type" types a registered-theta tool call
 * `Result<T, QueryError>` where `T` is the callee's inferred return type,
 * flowed into the call site when the callee is statically resolvable per
 * `invocation.md` §"Static resolution" — which a parsed callee is. The call
 * site carries no `invoke<Schema>` annotation of its own, so this is the only
 * source of a schema for that boundary.
 *
 * FN-3 (`functions.md` §"Theta return type") reconciles the tail expression
 * with every early `return` operand — syntactically present, regardless of
 * static reachability — by their least upper bound under `⊑`. Computing that
 * LUB needs the type layer's environment, which a runtime call site does not
 * hold, so this derivation is restricted to the case where the reconciliation
 * is vacuous and the tail's type is legible from its syntax alone:
 *
 *   - any `return` statement anywhere in the body (excluding a nested `fn`'s
 *     own — its returns belong to that function's own FN-3 reconciliation) →
 *     `null` (two or more contributions to reconcile);
 *   - an empty tail → `null` (FN-4 infers the `null` literal type, which
 *     carries no declaration to translate against);
 *   - a schema-constructor tail `S { … }` naming a declared `schema` → `S`;
 *   - an enum-variant tail `E.Variant` naming a declared `enum` → `E`;
 *   - anything else → `null`.
 *
 * `null` means the site keeps the pre-existing disposition — no runtime
 * schema, so neither AJV nor the inbound translation pass runs on that return
 * — which is what `tool-calls.md`'s "otherwise the runtime AJV check enforces
 * it" leaves to a boundary that has no type. It is a conservative floor by
 * design: naming a WIDER type than the callee actually returns would refuse a
 * conforming return, so this derivation names a type only where the body
 * cannot contribute another.
 *
 * `?` in the body does not disqualify: FN-3 wraps the inferred type in
 * `Result<T, QueryError>` and `T` — the success payload — is what a return
 * boundary validates.
 */
export function inferCalleeReturnAnnotation(
  body: CalleeBody,
  schemaNames: ReadonlySet<string>,
  enumNames: ReadonlySet<string>,
): string | null {
  if (body.tail === null || bodyHasReturn(body.statements)) {
    return null;
  }
  const tail = body.tail;
  if (
    tail.kind === "object" &&
    typeof tail.typeName === "string" &&
    schemaNames.has(tail.typeName)
  ) {
    return tail.typeName;
  }
  if (
    tail.kind === "member" &&
    tail.target?.kind === "ident" &&
    typeof tail.target.name === "string" &&
    enumNames.has(tail.target.name)
  ) {
    return tail.target.name;
  }
  return null;
}

/**
 * Whether any `return` statement appears anywhere beneath `statements`,
 * regardless of static reachability — FN-3 counts every `return` syntactically
 * present. The walk is structural over the node graph rather than over the
 * statement union, so a nested block form this module does not name still
 * reports its `return`s: a missed one would silently narrow the inferred type
 * from `null` to a named schema/enum the FN-3 reconciliation would actually
 * have refused.
 */
function bodyHasReturn(statements: readonly { readonly kind: string }[]): boolean {
  const seen = new Set<unknown>();
  const visit = (node: unknown): boolean => {
    if (node === null || typeof node !== "object" || seen.has(node)) {
      return false;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      return node.some(visit);
    }
    const record = node as { readonly [k: string]: unknown };
    if (record["kind"] === "return") {
      return true;
    }
    // A nested `fn` declaration's own `return`s belong to that function, not
    // to the enclosing theta body, so its subtree is not descended into.
    if (record["kind"] === "fn") {
      return false;
    }
    return Object.values(record).some(visit);
  };
  return statements.some(visit);
}
