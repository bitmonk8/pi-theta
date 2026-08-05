// V20b / V20b-T — the whole-program static-type-inference substrate.
//
// This module owns the seam the paired `V20b` implementation leaf fills in: a
// read-only whole-program pass over a parsed `V19a` `ThetaBody` that assigns a
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
// V20b implements the walk: `infer` performs a read-only recursive pass over
// the parsed body, assigns a static type to every statement-level expression
// node, and publishes the per-node inferred-type lookup keyed by node identity.
// Composite nodes (binary / ternary / `match` / array) narrow to a common type
// through the injected `V2b` `⊑` engine; nodes whose static type is not
// resolvable past the parser's static view (identifiers, member / index / call
// results, `Ok`/`Err`) are assigned a `named` reference type — the same shape
// the `⊑` engine treats as `"unknown"` and defers to the runtime AJV safety net.
//
// Spec (narrative): type-system.md, expressions.md, control-flow.md,
// functions.md. Closes no new spec REQ-ID.

import type { Block, Expr, IfStmt, ThetaBody, Stmt } from "./theta-document";
import { displayType, unfoldAlias, type CompatType, type Compatibility, type TypeEnv } from "./type-compat";

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
   * Walk `body` top-to-bottom and assign a static type to every statement-level
   * expression node, returning the per-node inferred-type lookup. The walk is
   * read-only: it reads the parsed AST and builds a fresh per-invocation lookup,
   * mutating neither the AST nor any runtime state.
   */
  infer(body: ThetaBody, env: TypeEnv): InferredTypeMap {
    const types = new Map<Expr, CompatType>();
    const nodes: Expr[] = [];
    // The whole-program `infer` pass carries no binding-type scope: it types a
    // free identifier as a nominal self-reference (deferred to the runtime AJV
    // safety net), preserving the substrate's read-only, binding-blind view.
    // The `V20c` type-layer wiring, which must classify identifier receivers /
    // operands, threads a binding scope through the public `typeOf` seam below.
    const noBindings: ReadonlyMap<string, CompatType> = new Map();
    const record = (expr: Expr): void => {
      if (types.has(expr)) {
        return;
      }
      types.set(expr, this.#typeExpr(expr, env, noBindings));
      nodes.push(expr);
    };
    this.#walkBlock(body, record, env);
    return {
      typeOf: (node: Expr): CompatType | undefined => types.get(node),
      nodes,
    };
  }

  /** Record every statement-level expression of `block`, then its tail. */
  #walkBlock(block: Block, record: (expr: Expr) => void, env: TypeEnv): void {
    for (const stmt of block.statements) {
      this.#walkStmt(stmt, record, env);
    }
    if (block.tail !== null) {
      record(block.tail);
    }
  }

  /**
   * Record the direct expression(s) a statement exposes and descend into any
   * nested block. Declaration-only forms (`schema` / `enum` / `import` /
   * `export` / `break` / `continue` / `doc-comment`) expose no expression.
   */
  #walkStmt(stmt: Stmt, record: (expr: Expr) => void, env: TypeEnv): void {
    switch (stmt.kind) {
      case "expr":
        record(stmt.expr);
        return;
      case "let":
        if (stmt.init !== null) {
          record(stmt.init);
        }
        return;
      case "reassign":
        record(stmt.value);
        return;
      case "if":
        record(stmt.condition);
        this.#walkBlock(stmt.then, record, env);
        if (stmt.otherwise !== null) {
          if ("statements" in stmt.otherwise) {
            this.#walkBlock(stmt.otherwise, record, env);
          } else {
            this.#walkStmt(stmt.otherwise as IfStmt, record, env);
          }
        }
        return;
      case "while":
        record(stmt.condition);
        this.#walkBlock(stmt.body, record, env);
        return;
      case "for":
        record(stmt.iterand);
        this.#walkBlock(stmt.body, record, env);
        return;
      case "return":
        if (stmt.operand !== null) {
          record(stmt.operand);
        }
        return;
      case "fn":
        this.#walkBlock(stmt.body, record, env);
        return;
      case "tool-call":
        record(stmt.call);
        return;
      case "invoke":
        record(stmt.invoke);
        return;
      case "query":
        record(stmt.query);
        return;
      default:
        return;
    }
  }

  /**
   * The static type this pass assigns to an arbitrary expression node — the
   * per-expression static-type lookup the `V20c` type-layer checkers consume.
   * `bindings` resolves an in-scope `let`-binding identifier to its recorded
   * type — the declared annotation where it carries one, else the initialiser's
   * inferred type; an unbound identifier remains a nominal self-reference
   * (deferred to the runtime AJV safety net). The computation is pure — it
   * records nothing — so a consumer may query any node without mutating the pass.
   */
  typeOf(
    node: Expr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType> = new Map(),
  ): CompatType {
    return this.#typeExpr(node, env, bindings);
  }

  /**
   * Compute the static type of an expression node over the resolved
   * `CompatType` model. Recurses into operands to compute composite types; the
   * recursion is pure (it records nothing), so only the statement-level nodes
   * the walk visits enter the published lookup. `bindings` resolves an in-scope
   * `let`-binding identifier to its declared-or-inferred recorded type.
   */
  #typeExpr(
    node: Expr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): CompatType {
    switch (node.kind) {
      case "number":
        return { kind: "literal", typesAs: node.numericType };
      case "string":
        return { kind: "literal", typesAs: "string" };
      case "bool":
        return { kind: "literal", typesAs: "boolean" };
      case "null":
        return { kind: "literal", typesAs: "null" };
      case "ident":
        // A `let`-bound identifier resolves to its inferred type; a free
        // identifier is a nominal reference past the parser's static view.
        return (
          bindings.get(node.name) ?? { kind: "named", name: node.name }
        );
      case "array": {
        const element = this.#commonType(
          node.elements.map((e) => this.#typeExpr(e, env, bindings)),
          env,
        );
        return { kind: "array", element };
      }
      case "binary":
        return this.#typeBinary(node.op, node.left, node.right, env, bindings);
      case "ternary":
        return this.#commonType(
          [
            this.#typeExpr(node.consequent, env, bindings),
            this.#typeExpr(node.alternate, env, bindings),
          ],
          env,
        );
      case "try":
        // `operand?` propagates the operand's success type statically.
        return this.#typeExpr(node.operand, env, bindings);
      case "match":
        return this.#commonType(
          node.arms.map((arm) => this.#typeExpr(arm.body, env, bindings)),
          env,
        );
      case "member":
        // A field / enum-variant access: nominal reference to the field name.
        return { kind: "named", name: node.field };
      case "index": {
        // TYPE-11: unfolding first makes an alias of `array<T>` narrow to `T`;
        // TYPE-10 object-schema and unresolvable names unfold to themselves.
        const target = unfoldAlias(this.#typeExpr(node.target, env, bindings), env);
        return target.kind === "array" ? target.element : { kind: "named", name: "index" };
      }
      case "call":
        return { kind: "named", name: node.callee };
      case "invoke":
        return { kind: "named", name: node.path };
      case "query":
        return { kind: "named", name: node.schema ?? "query" };
      case "object":
        return { kind: "named", name: node.typeName ?? "object" };
      case "result-ctor":
        return { kind: "named", name: node.ctor };
      case "method-call":
        return { kind: "named", name: node.method };
      case "par-for": {
        // CTRL-3: the value of a `par for` is `array<Result<U, QueryError>>`,
        // `U` the body tail type (absent tail → `null`). `CompatType` has no
        // dedicated `Result` shape, so the element is rendered as a nominal
        // reference naming `Result<U, QueryError>`; the outer `array` is the
        // stable, representation-independent surface the checkers consume.
        //
        // TYPE-11: the iterand is unfolded before this `kind` test, so a
        // type-alias-schema iterand supplies `U` exactly as the concrete
        // array type it is transparent with — this pass's own test, distinct
        // from the type-layer walk's body-scope element derivation and from
        // the iterand-admissibility gate (`checkForIterand`).
        const iterandType = unfoldAlias(this.#typeExpr(node.iterand, env, bindings), env);
        const elementType: CompatType =
          iterandType.kind === "array"
            ? iterandType.element
            : { kind: "named", name: "unknown" };
        const inner = new Map(bindings);
        inner.set(node.variable, elementType);
        const tailType: CompatType =
          node.body.tail !== null
            ? this.#typeExpr(node.body.tail, env, inner)
            : { kind: "literal", typesAs: "null" };
        return {
          kind: "array",
          element: {
            kind: "named",
            name: `Result<${displayType(tailType)}, QueryError>`,
          },
        };
      }
    }
  }

  /** The static type of a binary-operator expression. */
  #typeBinary(
    op: string,
    left: Expr,
    right: Expr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): CompatType {
    // Unary `!` / `-` are modeled by `theta-document` `parseUnary` as a binary
    // with a synthetic `null` left operand. Mirror the runtime's unary handling
    // (`evaluateBinaryExpression`: `op === "-" && left.kind === "null"`, and
    // the `!` case) so the operator types as its result, not as the null-mixed
    // common type of `{null, operand}` (which otherwise collapses to `null` and
    // trips the A5 mixed-operand / A6 ordering operand-type checks).
    if (left.kind === "null") {
      if (op === "!") {
        return { kind: "prim", name: "boolean" };
      }
      if (op === "-") {
        return this.#typeExpr(right, env, bindings);
      }
    }
    // Comparison and logical operators statically produce a boolean.
    if (BOOLEAN_BINARY_OPS.has(op)) {
      return { kind: "prim", name: "boolean" };
    }
    // Arithmetic narrows the operands to their common type through the `⊑`
    // engine (e.g. `integer + number` narrows to `number`).
    return this.#commonType(
      [
        this.#typeExpr(left, env, bindings),
        this.#typeExpr(right, env, bindings),
      ],
      env,
    );
  }

  /**
   * The common type of a set of candidate types: a candidate `C` such that every
   * other type is `⊑ C` under the injected `V2b` engine (a statically
   * unresolvable operand does not block a candidate, mirroring `V2b`'s
   * `"unknown"` handling). Falls back to the first candidate when none narrows
   * them all, and to a nominal `unknown` reference for an empty set.
   */
  #commonType(candidates: readonly CompatType[], env: TypeEnv): CompatType {
    if (candidates.length === 0) {
      return { kind: "named", name: "unknown" };
    }
    const common = candidates.find((candidate) =>
      candidates.every((other) => {
        const r = this.#checkCompatible(other, candidate, env);
        return r === "compatible" || r === "unknown";
      }),
    );
    return common ?? (candidates[0] as CompatType);
  }
}

/**
 * Binary operators whose result is statically a boolean, whatever the operands
 * evaluate to. Exported because a consumer that reasons over the SET of types a
 * binary expression can take (`collectProvableArgTypes`,
 * ../extension/invoke-static-checks.ts) has to agree with `#typeBinary` on
 * exactly which operators are result-fixed; sharing the one set is what keeps
 * the two from drifting apart.
 */
export const BOOLEAN_BINARY_OPS: ReadonlySet<string> = new Set([
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "&&",
  "||",
]);
