// V3b / V3b-T — the bindings & mutability checker seam.
//
// This module owns the parse-time well-formedness checks for the binding and
// mutability rules of bindings.md:
//
//   - `let` form        — `let x = ...` (immutable) / `let mut x = ...` (mutable):
//       * `theta/parse/let-without-initialiser` — `let x: T` (annotation, no
//         initialiser). Theta has no `undefined` value and no
//         definite-assignment analysis, so a binding with no value cannot be
//         admitted (bindings.md §`let` requires an initialiser).
//   - Reassignment      — `x = ...` / `x += ...` (statement-only):
//       * `theta/parse/immutable-rebinding` — reassignment of a `let`
//         (non-`mut`) binding (bindings.md §`let` vs `let mut`).
//       * `theta/parse/assignment-to-member-or-index` — `obj.field = ...` or
//         `arr[i] = ...`; theta 1.0 mutability is binding-level only
//         (bindings.md §Mutability is binding-level only).
//   - Immutable contexts — function parameters, `for` iteration variables, and
//     `match` pattern bindings are always immutable:
//       * `theta/parse/mut-on-immutable-context` — a `mut` modifier on any of
//         those positions (bindings.md §Immutable contexts).
//   - Increment / decrement:
//       * `theta/parse/increment-decrement` — `++` / `--` are rejected; use
//         `count += 1` / `count -= 1` (bindings.md §Increment / decrement).
//
// V3b-T (tests-task) declared these seam shapes and stubbed the five
// behaviour-bearing functions; V3b (this leaf) implements every check.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/** A located site at which a binding / reassignment form is checked. */
export interface BindingSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * A `let` (or `let mut`) binding declaration. `hasInitialiser` is `false` for
 * the annotation-only `let x: T` form (no `= <expr>`), which is rejected.
 */
export interface LetBindingDecl {
  readonly name: string;
  readonly mutable: boolean;
  readonly hasInitialiser: boolean;
}

/**
 * Check a `let` binding, returning `theta/parse/let-without-initialiser` when
 * the binding carries no initialiser. Returns `undefined` for a binding with
 * an initialiser (bindings.md §`let` requires an initialiser).
 */
export function checkLetBinding(
  decl: LetBindingDecl,
  site: BindingSite,
): Diagnostic | undefined {
  if (decl.hasInitialiser) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/let-without-initialiser",
    file: site.file,
    range: site.range,
    message: `let binding '${decl.name}' has no initialiser`,
    hint:
      "Initialise the binding at declaration, or restructure to bind once at the point a value is available.",
  };
}

/**
 * A reassignment of a plain identifier binding (`x = ...` / `x += ...`).
 * `mutable` is whether the target binding was declared `let mut`.
 */
export interface BindingReassignment {
  readonly name: string;
  readonly mutable: boolean;
}

/**
 * Check a plain-identifier reassignment, returning
 * `theta/parse/immutable-rebinding` when the target binding is immutable (not
 * `let mut`). Returns `undefined` for a `let mut` target (bindings.md
 * §`let` vs `let mut`; the compound forms `+=` etc. are equally legal on a
 * `let mut` binding).
 */
export function checkReassignment(
  reassign: BindingReassignment,
  site: BindingSite,
): Diagnostic | undefined {
  if (reassign.mutable) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/immutable-rebinding",
    file: site.file,
    range: site.range,
    message: `cannot reassign immutable binding '${reassign.name}'`,
    hint: "Use `let mut` if mutation is intentional.",
  };
}

/** The shape of an assignment target. */
export type AssignTargetKind = "identifier" | "member" | "index";

/** An assignment target (`x` / `obj.field` / `arr[i]`). */
export interface AssignmentTarget {
  readonly kind: AssignTargetKind;
}

/**
 * Check an assignment target, returning
 * `theta/parse/assignment-to-member-or-index` for a member (`obj.field = ...`)
 * or index (`arr[i] = ...`) target. Returns `undefined` for a plain identifier
 * target (bindings.md §Mutability is binding-level only).
 */
export function checkAssignmentTarget(
  target: AssignmentTarget,
  site: BindingSite,
): Diagnostic | undefined {
  if (target.kind === "identifier") {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/assignment-to-member-or-index",
    file: site.file,
    range: site.range,
    message:
      "cannot assign to member or index; mutability is binding-level only",
    hint: "Rebind the whole value with `let mut`.",
  };
}

/**
 * A binding position at which a `mut` modifier may appear. `let` is the only
 * position where `mut` is legal; the other three are always-immutable contexts
 * (bindings.md §Immutable contexts).
 */
export type BindingPosition = "let" | "fn-param" | "for-var" | "match-bind";

/** A `mut` modifier observed at a binding position. */
export interface MutModifier {
  readonly position: BindingPosition;
}

/**
 * Check a `mut` modifier, returning `theta/parse/mut-on-immutable-context` when
 * the modifier sits on a function parameter, a `for` iteration variable, or a
 * `match` pattern binding. Returns `undefined` for a `let` binding (bindings.md
 * §Immutable contexts).
 */
export function checkMutModifier(
  mod: MutModifier,
  site: BindingSite,
): Diagnostic | undefined {
  if (mod.position === "let") {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/mut-on-immutable-context",
    file: site.file,
    range: site.range,
    message: "'mut' is not permitted in this binding position",
  };
}

/** An increment / decrement operator occurrence (`x++`, `--y`, …). */
export interface IncrementDecrementOp {
  readonly op: "++" | "--";
}

/**
 * Check an increment / decrement operator, always returning
 * `theta/parse/increment-decrement` — `++` and `--` are unsupported; use
 * `count += 1` / `count -= 1` (bindings.md §Increment / decrement). The `<op>`
 * placeholder in the message is the source token verbatim.
 */
export function checkIncrementDecrement(
  op: IncrementDecrementOp,
  site: BindingSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/increment-decrement",
    file: site.file,
    range: site.range,
    message: `'${op.op}' operator is not supported`,
    hint: "Use `count += 1` / `count -= 1`.",
  };
}
