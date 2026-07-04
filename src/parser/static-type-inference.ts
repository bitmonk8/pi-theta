// V20b / V20b-T — the whole-program static-type-inference substrate.
//
// This module owns the seam the paired `V20b` implementation leaf fills in: a
// read-only whole-program pass over a parsed `V19a` `LoomBody` that assigns a
// static type to every expression node (literal, identifier, binary, ternary,
// member, index, call, `match`, enum, `Ok`/`Err`) using the `V2b`
// type-compatibility engine (`⊑`), and publishes a per-node inferred-type
// lookup the `V20c` type-layer checkers consume.
//
// The pass is the missing "Bucket B" substrate between `V2b`'s compatibility
// engine and the type-phase checkers: there is a `checkCompatible` relation but
// no whole-program walk that assigns a static type to every expression node, so
// the type-phase checkers have nothing to run against in production. The pass
// is constructor-injected over the `V2b` engine and holds no module-level
// mutable state; it is the seam `V20c` binds against.
//
// V20b-T stubs `infer` as an inert pass that assigns no type (the inferred-type
// lookup is empty); the paired `V20b` leaf implements the walk. The stub exists
// only so the tests compile and red on their own primary assertion — an absent
// per-node inferred type — rather than on a compile error.
//
// Spec (narrative): type-system.md, expressions.md, control-flow.md,
// functions.md. Closes no new spec REQ-ID.

import type { Expr, LoomBody } from "./loom-document";
import type { CompatType, Compatibility, TypeEnv } from "./type-compat";

/**
 * The `V2b` type-compatibility engine (`⊑`) as an injectable seam: the directed
 * relation `sub ⊑ sup` over the resolved `CompatType` model. The pass consumes
 * this to compute the static type of composite expression nodes (the ternary /
 * array common-type narrowing, union widening, etc.).
 */
export type CheckCompatible = (
  sub: CompatType,
  sup: CompatType,
  env: TypeEnv,
) => Compatibility;

/**
 * The per-node inferred-type lookup the pass publishes and the `V20c`
 * type-layer checkers consume: keyed by the expression node itself.
 */
export interface InferredTypeMap {
  /**
   * The static type inferred for `node`, or `undefined` when the pass assigned
   * none (an unresolvable operand past the parser's static view).
   */
  typeOf(node: Expr): CompatType | undefined;
  /** Every expression node the pass visited, in first-visit order. */
  readonly nodes: readonly Expr[];
}

/** The collaborators the pass is constructed over. */
export interface StaticTypeInferenceDeps {
  /** The `V2b` type-compatibility engine (`⊑`). */
  readonly checkCompatible: CheckCompatible;
}

/**
 * The read-only whole-program static-type-assignment pass. Constructor-injected
 * over the `V2b` engine, no module-level mutable state.
 */
export class StaticTypeInferencePass {
  readonly #checkCompatible: CheckCompatible;

  constructor(deps: StaticTypeInferenceDeps) {
    this.#checkCompatible = deps.checkCompatible;
  }

  /**
   * Walk `body` top-to-bottom and assign a static type to every expression
   * node, returning the per-node inferred-type lookup.
   *
   * V20b-T stub: the whole-program pass does not exist yet — this returns an
   * empty lookup (no node has an inferred type), so each test reds on its own
   * primary assertion. The paired `V20b` leaf implements the walk over the
   * injected `#checkCompatible` engine.
   */
  infer(_body: LoomBody, _env: TypeEnv): InferredTypeMap {
    // Reference the injected engine so the seam wiring type-checks; the stub
    // performs no inference.
    void this.#checkCompatible;
    return {
      typeOf: (): CompatType | undefined => undefined,
      nodes: [],
    };
  }
}
