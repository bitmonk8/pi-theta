// V3d / V3d-T — the functions-and-return parse/type seam.
//
// This module owns the parse- and type-phase obligations of functions.md and
// return.md for top-level `fn` declarations and the `return` statement:
//
//   - FN-1 (Placement) — `fn` declarations are top-level only:
//       * `loom/parse/nested-fn`         — a `fn` nested inside another `fn`
//         body or a block (`parse` phase).
//       * `loom/parse/function-as-value` — a function name used outside call
//         position (bound to `let`, passed as an argument) (`parse` phase).
//       * hoisted mutual recursion between two top-level `fn`s is allowed: a
//         forward reference to a hoisted top-level `fn` resolves.
//   - FN-2 (Documentation) — a `fn`'s leading `///` doc comment is preserved on
//     the AST as human-facing documentation only; functions have no JSON Schema
//     so the description lowers nowhere (does not enter provider payloads).
//   - FN-3 / RET-1 (Loom return type / return type-check) — an annotation-less
//     body infers its return type as the LUB (under `⊑`) of the tail-expression
//     and every `return` operand, wrapped in `Result<T, QueryError>` when the
//     body can short-circuit with an `Err` (`?` present, or a `Result`-typed
//     contribution); an explicit return annotation type-checks the tail and
//     every `return` operand against the annotation instead of inferring;
//     contributions sharing no common upper bound and narrowed by no sink fire
//     `loom/parse/return-no-common-type`.
//   - FN-4 (Empty-tail body) — an empty-tail body infers `null` (the literal
//     type); a `?`-bearing empty-tail body infers `Result<null, QueryError>`.
//   - RET-2 / RET-3 — bare `return` is legal only in a `void`-annotated
//     function (`loom/parse/bare-return-in-non-void` elsewhere, including at the
//     top level); code after a `return` in the same block warns
//     `loom/parse/unreachable-code`.
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
import { type Compatibility, type CompatType, type TypeEnv } from "./type-compat";

/** A located site at which a function/return form is checked. */
export interface FnSite {
  readonly file: string;
  readonly range: SourceRange;
}

// --- FN-1 — Placement -------------------------------------------------------

/**
 * A `fn` declaration occurrence. `nested` is whether the declaration sits
 * lexically inside another `fn` body or a block (loom 1.0 admits top-level
 * `fn` only).
 */
export interface FnPlacement {
  readonly nested: boolean;
}

/**
 * Check a `fn` declaration's placement (`parse` phase), returning
 * `loom/parse/nested-fn` when the declaration is nested inside another `fn`
 * body or a block. Returns `undefined` for a top-level `fn` (functions.md
 * FN-1).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkFnPlacement(
  placement: FnPlacement,
  _site: FnSite,
): Diagnostic | undefined {
  void placement;
  return undefined;
}

/**
 * A reference to a function name. `position` is `"call"` when the name appears
 * in call position (`f(...)`) and `"value"` when it is used as a value (bound
 * to `let`, passed as an argument) — loom 1.0 has no first-class functions.
 */
export interface FunctionReference {
  readonly name: string;
  readonly position: "call" | "value";
}

/**
 * Check a function-name reference (`parse` phase), returning
 * `loom/parse/function-as-value` when the name is used outside call position.
 * Returns `undefined` for a call-position reference (functions.md FN-1).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkFunctionReference(
  ref: FunctionReference,
  _site: FnSite,
): Diagnostic | undefined {
  void ref;
  return undefined;
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
  void name;
  void hoistedTopLevelFns;
  return "unchecked";
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
  // V3d-T stub: drops the doc (does not preserve it on the AST node).
  return { name: opts.name, params: opts.params };
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
  // V3d-T stub: wrongly lowers the doc; V3d returns {} (functions have no JSON
  // Schema, so the description never enters a provider payload).
  return node.doc === undefined ? {} : { description: node.doc };
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
 *     carries the `loom/parse/return-no-common-type` diagnostic.
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
 *     `loom/parse/return-no-common-type`.
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
  void opts;
  return { kind: "unchecked" };
}

// --- RET-2 / RET-3 — bare `return` and unreachable code ---------------------

/**
 * A bare `return` (no operand) occurrence. `returnTypeIsVoid` is whether the
 * enclosing scope is a `void`-annotated function; a top-level loom and any
 * non-`void` function are `false` (RET-2).
 */
export interface BareReturn {
  readonly returnTypeIsVoid: boolean;
}

/**
 * Check a bare `return` (`type` phase), returning
 * `loom/parse/bare-return-in-non-void` when the enclosing scope is not a
 * `void`-annotated function (including a top-level loom). Returns `undefined`
 * inside a `void` function (return.md RET-2).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkBareReturn(
  bare: BareReturn,
  _site: FnSite,
): Diagnostic | undefined {
  void bare;
  return undefined;
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
 * the `loom/parse/unreachable-code` warning when a statement follows a `return`
 * in the same block. Returns `undefined` otherwise (return.md RET-3).
 *
 * V3d-T stubs this inert (always `undefined`); the paired V3d leaf fills it in.
 */
export function checkUnreachableCode(
  ctx: UnreachableCode,
  _site: FnSite,
): Diagnostic | undefined {
  void ctx;
  return undefined;
}
