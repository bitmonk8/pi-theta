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

import type { Block, Expr, IfStmt, MemberExpr, PatternNode, ThetaBody, Stmt } from "./theta-document";
import {
  commonType,
  displayType,
  resolveNamed,
  unfoldAlias,
  WITHHELD_BINDER_TYPE_NAME,
  type CompatType,
  type Compatibility,
  type TypeEnv,
} from "./type-compat";
import { collectPatternBinderNames } from "./match-result";

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
   * The DECLARED field type a member-access node resolves to, or `undefined`
   * when `#memberType` fell back to an unresolvable receiver's own name or a
   * field-name mint. This is the provenance question `typeOf` cannot answer:
   * `typeOf`'s returned `CompatType` cannot distinguish a resolved declared
   * field type from either fallback, because two of `#memberType`'s three
   * outcomes are `named` and a bare `CompatType` carries no marker for which.
   *
   * Lives beside `typeOf` so the resolution stays in ONE place: both answers
   * come from the same `#memberType` the walk itself uses to type every
   * `member` node, so no consumer re-derives the receiver unfold, the
   * `resolveNamed` lookup, or the own-key `fields` guard, and no third reader
   * of the `fields` record is created (bug 0136's recorded posture; bug
   * 0031/0038's guard-reuse rule). Pure like `typeOf` — it records nothing.
   */
  declaredFieldType(
    node: MemberExpr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType> = new Map(),
  ): CompatType | undefined {
    const { type, declared } = this.#memberType(node, env, bindings);
    return declared ? type : undefined;
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
        // bug 0145 §Fix (a) route 1: an arm body executes under its OWN
        // pattern's binders (`evalMatch` installs them into a child
        // environment before the body runs, ../runtime/statement-executor.ts),
        // never under a same-named ENCLOSING binding — so each arm is typed in
        // `#matchArmScope`'s copy rather than in the caller's `bindings`.
        //
        // The arm types reduce through `#matchArmType`, the dominating-member
        // discipline the checker's `checkMatchArmTypes` enforces on the same
        // node (`./match-result.ts`) — not `#commonType`, whose union clause the
        // checker refuses here (docs/reference/type-system.md §"Common-type
        // rules"): this pass owes the walk a type where the checker owes it a
        // diagnostic, and the two must agree on which candidate sets have one.
        return this.#matchArmType(
          node.arms.map((arm) => this.#typeExpr(arm.body, env, this.#matchArmScope(arm.pattern, bindings))),
          env,
        );
      case "member":
        return this.#memberType(node, env, bindings).type;
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

  /**
   * The scope a `match` arm's body is typed in: `bindings` plus that arm's own
   * pattern binders, each recorded as the withheld sentinel
   * (`WITHHELD_BINDER_TYPE_NAME`, ./type-compat.ts) — the same answer the type
   * layer's own `matchArmScope` (./type-layer-checks.ts) already gives the
   * arm-body walk and `provableArgType`'s reduction, so all three readers of
   * an arm body now resolve the same scope for the same node (bug 0145 §Fix).
   *
   * VALUE CHANNEL ONLY. The type layer's `recordWithheldBinders` also adds
   * each minted sentinel to an identity set (`unprovableBindings`) a marking
   * guard reads; this pass carries no such set (bug 0145 §Bounds) and must
   * not acquire one — the withheld name alone is what makes a sibling read
   * unresolvable (`type-system.md:48`, *Unresolvable operands*), and identity-
   * keyed suppression is bug 0199's landed, narrower surface.
   *
   * A pattern binding nothing (a literal or a wildcard) yields `bindings`
   * unchanged and copies no map — the same shape `matchArmScope` uses, and the
   * one `case "par-for"` above does not need because a `for` loop always binds
   * its variable.
   */
  #matchArmScope(
    pattern: PatternNode,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlyMap<string, CompatType> {
    const names = new Set<string>();
    collectPatternBinderNames(pattern, names);
    if (names.size === 0) {
      return bindings;
    }
    const scope = new Map(bindings);
    for (const name of names) {
      scope.set(name, { kind: "named", name: WITHHELD_BINDER_TYPE_NAME });
    }
    return scope;
  }

  /**
   * The static type of a member-access node, together with whether that type
   * is a DECLARED field type (`declared: true`) or one of the arm's two
   * fallbacks (`declared: false`). The declared field type is one
   * own-key-guarded lookup away, and the Unresolvable operands paragraph's
   * deferral licence is for an operand past the parser's static view — a
   * declared field on a resolved object schema is not one. The lookup reuses
   * bug 0031's `Object.hasOwn` guard and bug 0038's `resolveNamed`, both
   * already established at this exact record, rather than re-deriving a
   * third reader of it.
   *
   * Type and provenance travel together in one return because a bare
   * `CompatType` cannot carry the distinction on its own: two of the three
   * outcomes below are `named`, so nothing in the returned shape tells a
   * TYPE-10 nominal that IS the value's type (a resolved field whose own
   * declared type is an object schema) apart from a mint that resolves
   * against an unrelated declaration by spelling. A caller that must judge
   * only the resolved outcome reads `declared` (`declaredFieldType` above);
   * a caller that wants the pass's best-effort answer regardless of
   * provenance reads only `type` (`typeOf`, `#typeExpr`'s `case "member"`).
   *
   * When the receiver resolves to no declaration, `declared` is `false` and
   * `type` is the receiver's OWN `named` rather than `node.field`. For
   * `Enum.Variant` this is schemas.md's Enum declarations section's
   * "statically typed as `Enum`" for free — the receiver is `named <Enum>`,
   * no `enum` entry ever enters the `TypeEnv`, so it stays unresolved and the
   * expression defers exactly as the Unresolvable operands paragraph
   * prescribes. The same branch is also the provably-inert answer for every
   * other unresolvable receiver: `node.field` might resolve by accident
   * against an unrelated declaration that happens to share its spelling,
   * where the receiver has just been proven to resolve to nothing.
   *
   * An absent field, a `fields` record the schema declaration carries none
   * of, and a field whose `typeSource` failed to convert all fall through to
   * the closing nominal fallback (`declared: false`) rather than reporting:
   * expressions.md's Member access bullet assigns an absent theta-side name a
   * RUNTIME `theta/runtime/missing-object-key` panic, not a parse
   * diagnostic, so answering here would pre-empt it.
   */
  #memberType(
    node: MemberExpr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): { readonly type: CompatType; readonly declared: boolean } {
    const receiver = unfoldAlias(this.#typeExpr(node.target, env, bindings), env);
    if (receiver.kind === "named") {
      const decl = resolveNamed(env, receiver.name);
      if (decl === undefined) {
        return { type: receiver, declared: false };
      }
      const fields = decl.kind === "object-schema" ? decl.fields : undefined;
      if (fields !== undefined && Object.hasOwn(fields, node.field)) {
        return { type: unfoldAlias(fields[node.field] as CompatType, env), declared: true };
      }
    }
    return { type: { kind: "named", name: node.field }, declared: false };
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
    // expressions.md §"Other arithmetic": `/` always produces `number`,
    // whatever the operands — there is no integer-division operator in
    // theta 1.0, and an exactly-divisible pair is not an exception.
    if (op === "/") {
      return { kind: "prim", name: "number" };
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
   * The common type of a set of candidate types — the least upper bound under
   * `⊑`, delegated to the ONE `commonType` (./type-compat.ts) that
   * `checkCommonType` also calls, so the checker and this inference pass
   * cannot disagree about a candidate set: both decide it the same way, over
   * this pass's injected `V2b` engine. `undefined` means rule 3 — an
   * object-branch set with no dominating member. At an array-literal call
   * site the type-layer checker's own array-literal check
   * (./type-layer-checks.ts) turns that absence into `array-no-common-type`
   * at the literal, so this pass's first-candidate answer there only has to
   * keep the walk going past a node already reported. At a ternary call
   * site rule 3 is out of scope — `array-no-common-type`'s registered
   * *Trigger* (docs/spec_topics/diagnostics/code-registry-parse.md) names
   * an array literal, not a ternary (bug 0155 route (b)) — so there is no
   * refusal to defer to: the first-candidate answer IS the ternary's type
   * by rule, and the resulting branch-order dependence between the two
   * branches is the adjudicated disposition, not a stopgap awaiting one.
   * An empty set has no candidate to fall back to, so it is answered
   * directly, ahead of the delegation, with a nominal `unknown`
   * reference.
   */
  #commonType(candidates: readonly CompatType[], env: TypeEnv): CompatType {
    if (candidates.length === 0) {
      return { kind: "named", name: "unknown" };
    }
    return commonType(candidates, env, this.#checkCompatible) ?? (candidates[0] as CompatType);
  }

  /**
   * The `match`-arm common type: a candidate arm type that every arm is `⊑`,
   * and that is itself `⊑` every other such candidate (the least) — the same
   * dominating-member discipline the checker's `leastUpperBound`
   * (./match-result.ts) enforces on the identical arm-type array via
   * `checkMatchArmTypes`, so this pass never answers a type the checker
   * refuses on the same node. `leastUpperBound` is not exported: it calls the
   * production `checkCompatible` import directly rather than accepting an
   * injectable relation the way `commonType` does (`relate: CompatRelation`,
   * ./type-compat.ts). The pass therefore keeps its own copy, decided over its
   * own injected `#checkCompatible`, rather than reach for a copy that would
   * silently bypass it. Unlike `#commonType`, there is no union clause: a set
   * with no dominating member falls back to the first arm's type, because the
   * checker's own row already refuses the node and this pass only owes the
   * walk a type to keep going past it.
   */
  #matchArmType(armTypes: readonly CompatType[], env: TypeEnv): CompatType {
    if (armTypes.length === 0) {
      return { kind: "named", name: "unknown" };
    }
    const covers = (candidate: CompatType): boolean =>
      armTypes.every((arm) => {
        const r = this.#checkCompatible(arm, candidate, env);
        return r === "compatible" || r === "unknown";
      });
    const candidates = armTypes.filter(covers);
    if (candidates.length === 0) {
      return armTypes[0] as CompatType;
    }
    for (const candidate of candidates) {
      const isLeast = candidates.every((other) => {
        const r = this.#checkCompatible(candidate, other, env);
        return r === "compatible" || r === "unknown";
      });
      if (isLeast) {
        return candidate;
      }
    }
    return candidates[0] as CompatType;
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
