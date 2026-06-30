// V2b / V2b-T — the type-compatibility engine (`⊑`) seam.
//
// This module owns the single normative compatibility relation `T₁ ⊑ T₂` of
// type-system.md §"Type compatibility" (TYPE-1…TYPE-11) and the per-site
// parse-time diagnostics that report a static mismatch (TYPE-9). The relation
// is the structural-cases engine the parser must decide without falling back
// to AJV; the cases it recognises are closed for loom 1.0 (type-system.md
// §"Structural cases the parser must recognise").
//
// The engine operates over a small `CompatType` model — the resolved shape of
// a type expression for compatibility purposes — and a `TypeEnv` that resolves
// `NamedType`s to their declarations. The declaration kind drives the nominal
// vs transparent split:
//
//   - an object schema (`schema X { ... }`) is **nominal** (TYPE-10): it is
//     `⊑`-related only by name identity (reflexivity), variant-to-union
//     membership, and union widening/distribution — never structurally across
//     the inline/named boundary or across two distinct named schemas;
//   - a type-alias schema (`schema X = R`) is **transparent** (TYPE-11): it is
//     replaced by its right-hand side `R` and the check re-evaluated, recursing
//     through nested aliases until a non-alias form is reached. Aliasing an
//     object schema unfolds to that object schema, which re-enters TYPE-10.
//
// V2b-T (tests-task) declares the seam shape and stubs the behaviour-bearing
// functions so the failing tests compile and red on their own primary
// assertions: `checkCompatible` returns the inert `"unknown"` sentinel (a
// value the paired V2b implementation never returns) and the per-site
// diagnostic checkers return no diagnostics. The paired V2b implementation
// leaf fills these in.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/** The JSON-native primitive type names (type-system.md §"Type System"). */
export type PrimitiveName = "string" | "number" | "integer" | "boolean" | "null";

/**
 * The resolved type shape the compatibility engine operates over. This is a
 * compatibility-purpose projection of a parsed type expression, not the full
 * type AST:
 *
 *   - `prim`    — a primitive type (`string`, `number`, `integer`, `boolean`,
 *                 `null`).
 *   - `literal` — a literal type (`"foo"`, `42`, `true`, `null`); `typesAs`
 *                 records the primitive the literal value statically types as
 *                 in expression position, which drives TYPE-3.
 *   - `named`   — a `NamedType` reference, resolved through `TypeEnv`; an
 *                 object-schema declaration is nominal (TYPE-10), an alias
 *                 declaration is transparent (TYPE-11).
 *   - `array`   — `array<T>`, covariant in its `element` (TYPE-7).
 *   - `union`   — `T₁ | T₂ | …`, widening (TYPE-5) and distributive (TYPE-6).
 *   - `object`  — an inline anonymous object type `{ f: T, … }`, field-wise
 *                 with an exact field set (TYPE-8).
 */
export type CompatType =
  | { readonly kind: "prim"; readonly name: PrimitiveName }
  | { readonly kind: "literal"; readonly typesAs: PrimitiveName }
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "array"; readonly element: CompatType }
  | { readonly kind: "union"; readonly arms: readonly CompatType[] }
  | {
      readonly kind: "object";
      readonly fields: readonly { readonly name: string; readonly type: CompatType }[];
    };

/**
 * A `NamedType` declaration, as seen by the compatibility engine:
 *
 *   - `object-schema` — `schema X { ... }`. Nominal (TYPE-10): related only by
 *     name identity, variant-to-union, and union widening/distribution.
 *   - `alias`         — `schema X = R`. Transparent (TYPE-11): replaced by `rhs`
 *     and the check re-evaluated, recursing through nested aliases. The alias
 *     is identified solely by the `=` form, not by what `rhs` resolves to.
 */
export type NamedDecl =
  | { readonly kind: "object-schema" }
  | { readonly kind: "alias"; readonly rhs: CompatType };

/** Resolves a `NamedType` name to its declaration; `undefined` if unresolvable. */
export type TypeEnv = Readonly<Record<string, NamedDecl>>;

/**
 * The outcome of a directed compatibility check `sub ⊑ sup`:
 *
 *   - `"compatible"`        — the relation holds.
 *   - `"incompatible"`      — a static mismatch (`sub ⋢ sup`), both operands
 *                             statically resolvable.
 *   - `"integer-narrowing"` — a static mismatch specifically because a `number`
 *                             appears where an `integer` is expected; the
 *                             `integer → number` widening is one-way (TYPE-2),
 *                             and the reverse is the `loom/parse/integer-narrowing`
 *                             case.
 *   - `"unknown"`           — the V2b-T stub sentinel. The paired V2b engine
 *                             never returns this; it exists only so every
 *                             relation test reds on its own primary assertion
 *                             (no expected outcome equals `"unknown"`).
 */
export type Compatibility =
  | "compatible"
  | "incompatible"
  | "integer-narrowing"
  | "unknown";

/**
 * Decide the directed compatibility relation `sub ⊑ sup` over the resolved
 * `CompatType` model, per type-system.md §"Type compatibility" TYPE-1…TYPE-11.
 * `env` resolves `NamedType`s to their declarations (nominal object schema vs
 * transparent alias).
 *
 * V2b-T stubs this as an inert sentinel returning `"unknown"`; the paired V2b
 * implementation leaf computes the relation.
 */
export function checkCompatible(
  _sub: CompatType,
  _sup: CompatType,
  _env: TypeEnv,
): Compatibility {
  // Inert V2b-T stub: returns the `"unknown"` sentinel so every relation test
  // reds on its own primary assertion (the engine is absent). The paired V2b
  // leaf replaces this with the TYPE-1…TYPE-11 decision procedure.
  return "unknown";
}

/** A located site at which a compatibility check reports a parse-time diagnostic. */
export interface CompatSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * TYPE-9 — the RHS of a typed binding `let x: T = expr`. Reports
 * `loom/parse/let-rhs-type-mismatch` when the RHS static type is not `⊑` the
 * annotation `T` (both statically resolvable), or `loom/parse/integer-narrowing`
 * when the failure is specifically a `number` RHS under an `integer` annotation
 * (TYPE-2's one-way widening). Returns no diagnostic when the relation holds.
 *
 * V2b-T stubs this inert (no diagnostics); the paired V2b leaf fills it in.
 */
export function checkLetRhsCompat(_opts: {
  readonly name: string;
  readonly annotation: CompatType;
  readonly rhs: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  return [];
}

/**
 * TYPE-9 — a plain top-level `fn` argument slot. Reports
 * `loom/parse/fn-arg-type-mismatch` when the argument's static type is not `⊑`
 * the matched parameter's declared type (both statically resolvable). Returns
 * no diagnostic when the relation holds.
 *
 * V2b-T stubs this inert (no diagnostics); the paired V2b leaf fills it in.
 */
export function checkFnArgCompat(_opts: {
  readonly fnName: string;
  readonly index: number;
  readonly paramName: string;
  readonly paramType: CompatType;
  readonly argType: CompatType;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  return [];
}

/**
 * TYPE-9 — the array-and-ternary common-type machinery. Given the branch
 * element types (ternary branches or array-literal elements) and an optional
 * in-scope element `sink`:
 *
 *   - with a `sink`: reports `loom/parse/array-element-type-mismatch` at the
 *     first branch whose type is not `⊑` the sink's element type;
 *   - without a `sink`: reports `loom/parse/array-no-common-type` when the
 *     branches share no common type that narrows them.
 *
 * Returns no diagnostic when the branches resolve against the sink (or share a
 * common type). V2b-T stubs this inert (no diagnostics); the paired V2b leaf
 * fills it in.
 */
export function checkCommonType(_opts: {
  readonly branches: readonly CompatType[];
  readonly sink: CompatType | undefined;
  readonly env: TypeEnv;
  readonly site: CompatSite;
}): Diagnostic[] {
  return [];
}
