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

import type { Block, Expr, IfStmt, LoomBody, Stmt } from "./loom-document";
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
   * Walk `body` top-to-bottom and assign a static type to every statement-level
   * expression node, returning the per-node inferred-type lookup. The walk is
   * read-only: it reads the parsed AST and builds a fresh per-invocation lookup,
   * mutating neither the AST nor any runtime state.
   */
  infer(body: LoomBody, env: TypeEnv): InferredTypeMap {
    const types = new Map<Expr, CompatType>();
    const nodes: Expr[] = [];
    const record = (expr: Expr): void => {
      if (types.has(expr)) {
        return;
      }
      types.set(expr, this.#typeExpr(expr, env));
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
   * Compute the static type of an expression node over the resolved
   * `CompatType` model. Recurses into operands to compute composite types; the
   * recursion is pure (it records nothing), so only the statement-level nodes
   * the walk visits enter the published lookup.
   */
  #typeExpr(node: Expr, env: TypeEnv): CompatType {
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
        // A free identifier: a nominal reference past the parser's static view.
        return { kind: "named", name: node.name };
      case "array": {
        const element = this.#commonType(
          node.elements.map((e) => this.#typeExpr(e, env)),
          env,
        );
        return { kind: "array", element };
      }
      case "binary":
        return this.#typeBinary(node.op, node.left, node.right, env);
      case "ternary":
        return this.#commonType(
          [this.#typeExpr(node.consequent, env), this.#typeExpr(node.alternate, env)],
          env,
        );
      case "try":
        // `operand?` propagates the operand's success type statically.
        return this.#typeExpr(node.operand, env);
      case "match":
        return this.#commonType(
          node.arms.map((arm) => this.#typeExpr(arm.body, env)),
          env,
        );
      case "member":
        // A field / enum-variant access: nominal reference to the field name.
        return { kind: "named", name: node.field };
      case "index": {
        // An element read narrows to the target's element type when the target
        // is statically an array; otherwise it is an unresolved reference.
        const target = this.#typeExpr(node.target, env);
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
    }
  }

  /** The static type of a binary-operator expression. */
  #typeBinary(op: string, left: Expr, right: Expr, env: TypeEnv): CompatType {
    // Comparison and logical operators statically produce a boolean.
    if (BOOLEAN_BINARY_OPS.has(op)) {
      return { kind: "prim", name: "boolean" };
    }
    // Arithmetic narrows the operands to their common type through the `⊑`
    // engine (e.g. `integer + number` narrows to `number`).
    return this.#commonType(
      [this.#typeExpr(left, env), this.#typeExpr(right, env)],
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

/** Binary operators whose result is statically a boolean. */
const BOOLEAN_BINARY_OPS: ReadonlySet<string> = new Set([
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "&&",
  "||",
]);
