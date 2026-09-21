// V20b / V20b-T — the whole-program static-type-inference substrate.
//
// This module owns the seam the paired `V20b` implementation leaf fills in: a
// read-only whole-program pass over a parsed `V19a` `ThetaBody` that assigns a
// static type to every expression node (literal, identifier, binary, ternary,
// member, index, call, `match`, enum, `Ok`/`Err`) using the `V2b`
// type-compatibility engine (`⊑`). `infer` publishes a per-node inferred-type
// lookup over a whole body (the seam surface the pass's own witness tests
// read); the `V20c` type-layer checkers and the invoke static checks instead
// bind the pass and query the pure per-node `typeOf` / `declaredFieldType`
// seams, threading their own binding scopes.
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
  displayType,
  enumVariantType,
  resolveNamed,
  unfoldAlias,
  widenLiteralTypes,
  withheldBinderType,
  type CompatType,
  type Compatibility,
  type TypeEnv,
} from "./type-compat";
import { commonType } from "./type-compat-sites";
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
 * The per-node inferred-type lookup `infer` publishes over a whole body, keyed
 * by the expression node itself. Production consumers (`V20c`'s type-layer
 * walk, the invoke static checks) bind the pass and query `typeOf` /
 * `declaredFieldType` per node instead; this map is read by the pass's own
 * witness tests.
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
  /**
   * The whole file's declared `enum` names (bug 0191 §Fix route 1;
   * `collectEnumNames`, ./type-layer-checks.ts). `#memberType` consults this
   * BEFORE resolving the member-access receiver against the `TypeEnv`, so a
   * member access whose TARGET IDENT names a declared enum and binds no local
   * types as `enumVariantType(name)` (./type-compat.ts) whether or not a
   * same-file `schema` shares the spelling — the same shape, and the same
   * local-first precedence, `evalExpr`'s member arm applies before it resolves
   * the enum variant (../runtime/statement-executor.ts). Explicit dependency injection,
   * no default: every production construction site
   * (./type-layer-checks.ts's `checkTypeLayer`,
   * ../extension/invoke-static-checks.ts's `checkInvokeStaticResolution` and
   * ../extension/invoke-imported-checks.ts's `checkImportedFnCallArgs`)
   * has the walked body's `statements` in scope and must pass the real set, so a missing
   * value is a wiring bug caught at the call site, not a silent empty-set
   * fallback that would let a production path mis-resolve a shadowed enum
   * variant.
   */
  readonly enumNames: ReadonlySet<string>;
  /**
   * RFC 0011 (tool-calls.md #session-control-runtime-tools, seam sheet §0 C6):
   * SUCCESS-payload structural types for declared runtime tools, keyed by
   * PRESENTED (post-rename) name. When a `call` node's callee is mapped,
   * `case "call"` answers the `Result<success, QueryError>` nominal and
   * `case "try"` unwraps to the mapped structural type. GOV-15 inert: the
   * map is empty for every 1.0.0-clean file (none declares the three names).
   */
  readonly runtimeToolSuccessTypes?: ReadonlyMap<string, CompatType>;
}

/**
 * The read-only whole-program static-type-assignment pass. Constructor-injected
 * over the `V2b` engine, no module-level mutable state.
 */
export class StaticTypeInferencePass {
  readonly #checkCompatible: CheckCompatible;
  readonly #enumNames: ReadonlySet<string>;
  readonly #runtimeToolSuccessTypes: ReadonlyMap<string, CompatType>;

  constructor(deps: StaticTypeInferenceDeps) {
    this.#checkCompatible = deps.checkCompatible;
    this.#enumNames = deps.enumNames;
    this.#runtimeToolSuccessTypes = deps.runtimeToolSuccessTypes ?? new Map();
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
    this.#walkBlock(body, record);
    return {
      typeOf: (node: Expr): CompatType | undefined => types.get(node),
      nodes,
    };
  }

  /** Record every statement-level expression of `block`, then its tail. */
  #walkBlock(block: Block, record: (expr: Expr) => void): void {
    for (const stmt of block.statements) {
      this.#walkStmt(stmt, record);
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
  #walkStmt(stmt: Stmt, record: (expr: Expr) => void): void {
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
        this.#walkBlock(stmt.then, record);
        if (stmt.otherwise !== null) {
          if ("statements" in stmt.otherwise) {
            this.#walkBlock(stmt.otherwise, record);
          } else {
            this.#walkStmt(stmt.otherwise as IfStmt, record);
          }
        }
        return;
      case "while":
        record(stmt.condition);
        this.#walkBlock(stmt.body, record);
        return;
      case "for":
        record(stmt.iterand);
        this.#walkBlock(stmt.body, record);
        return;
      case "return":
        if (stmt.operand !== null) {
          record(stmt.operand);
        }
        return;
      case "fn":
        this.#walkBlock(stmt.body, record);
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
   * The flat set of static types whose UNION covers every value `expr` can
   * evaluate to, or `undefined` when any value-contributing position is past
   * the parser's static view. The provable argument-type checks
   * (../extension/invoke-expr-call-surface.ts and its consumers) reason over
   * this SET rather than over the single reduced type `typeOf` answers.
   *
   * `#commonType` narrows a composite to ONE candidate and drops its siblings
   * on two paths: a candidate survives a sibling that answers `unknown`, and a
   * candidate set with no common member falls back to `candidates[0]`. Either
   * path renders `flag ? 1 : "a"` as `integer`, and a check that trusts that
   * rejects the runtime value `"a"` — which `read`'s `path: { type: "string" }`
   * accepts. tool-calls.md §"Provable-disjointness check (parse time)" forbids
   * exactly that ("a provable disjointness guarantees the runtime AJV check
   * would reject the same value … The check therefore never rejects a program
   * the runtime AJV check would accept"), and on the `.theta`-callable arm it
   * defeats bug 0072 §Fix's rule that only an explicit incompatibility is a
   * mismatch while `unknown` defers to the runtime net. Keeping the whole
   * value-type set in front of all consumers is what lets `subsetKinds`' "an
   * unrepresentable arm makes the whole union unprovable" rule
   * (../runtime/tool-call.ts) and the every-arm-incompatible discipline decide
   * these expressions correctly. The RENDERING stays on `displayType`, the
   * canonical form diagnostics/placeholder-rendering-a.md category 1 mandates.
   *
   * The set is computed by `#typeValue`, the SAME switch that assigns the
   * reduced type — each arm computes both answers, so a collected member can
   * never render differently from the type the pass itself assigns, and a kind
   * added to the `Expr` union without an arm is a compile error for BOTH
   * answers at once (the former extension-side mirror only had that guarantee
   * on the type side). The walk visits exactly the VALUE-contributing
   * positions — a ternary condition and a `match` scrutinee choose WHICH arm
   * supplies the value, never what that value is. `undefined` at any nested
   * position propagates, and every kind not named as value-derivable yields
   * `undefined`, so withholding is the default — it can only suppress an
   * emission, never produce one. Read under an EMPTY bindings map: no consumer
   * of the set resolves `let` bindings, so even a bound identifier is nominal
   * (withheld) here.
   */
  collectProvableArgTypes(expr: Expr, env: TypeEnv): CompatType[] | undefined {
    return this.#typeValue(expr, env, new Map()).members;
  }

  /**
   * Compute the static type of an expression node over the resolved
   * `CompatType` model — `#typeValue`'s reduced-type half, kept as the
   * type-only seam every internal reader (`infer`, `typeOf`, `#memberType`)
   * consumes. The recursion is pure (it records nothing), so only the
   * statement-level nodes the walk visits enter the published lookup.
   * `bindings` resolves an in-scope `let`-binding identifier to its
   * declared-or-inferred recorded type.
   */
  #typeExpr(
    node: Expr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): CompatType {
    return this.#typeValue(node, env, bindings).type;
  }

  /**
   * The ONE `Expr` switch behind both `typeOf` (the reduced static type) and
   * `collectProvableArgTypes` (the provable value-type set): each arm computes
   * the two answers together, which is what keeps a collected member from ever
   * rendering differently from the type the pass assigns — the shared source
   * of truth that replaced the extension-side mirror of this switch.
   */
  #typeValue(
    node: Expr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): ExprValueTypes {
    switch (node.kind) {
      // A literal's whole value-type set is its own type.
      case "number":
        return exactValue({ kind: "literal", typesAs: node.numericType });
      case "string":
        return exactValue({ kind: "literal", typesAs: "string" });
      case "bool":
        return exactValue({ kind: "literal", typesAs: "boolean" });
      case "null":
        return exactValue({ kind: "literal", typesAs: "null" });
      case "ident":
        // A `let`-bound identifier resolves to its inferred type; a free
        // identifier is a nominal reference past the parser's static view.
        // MEMBERS withheld even for a bound name: every consumer of the
        // provable set reads it with an EMPTY bindings map, so an `ident` is
        // nominal there — the shape `checkCompatible` answers `unknown` for
        // and the runtime AJV net owns.
        return {
          type: bindings.get(node.name) ?? { kind: "named", name: node.name },
          members: undefined,
        };
      case "array": {
        const elements = node.elements.map((e) => this.#typeValue(e, env, bindings));
        const element = this.#commonType(
          elements.map((v) => v.type),
          env,
        );
        const type: CompatType = { kind: "array", element };
        // MEMBERS — an EXACTNESS-TESTED arm, not a trust of the reduction:
        // `element` runs through `#commonType`, which can bless an
        // unresolvable sibling or fall back to `candidates[0]`, either of
        // which erases a member the runtime can still produce (bug 0072's
        // false-`E` species). The elements' collected sets are unioned — a
        // withheld element (e.g. an `ident`) withholds the whole literal, and
        // `unionMembers` maps an empty element list to `undefined` too, the
        // same silence the `fn` surface shows on `he([])` — and the arm only
        // vouches for the literal when their rendering equals the reduction's
        // element rendering, the set-wise analogue of `provableArgType`'s
        // `array`-arm exactness test (`isProvenReduction`,
        // ./type-layer-checks.ts). The Pi-tool consumer stands down either
        // way (`subsetKinds`, ../runtime/tool-call.ts, admits no `array<…>`
        // kind); the invoke / `.theta`-callable / imported-`fn` consumers
        // compare through `checkCompatible`, which decides
        // `array<string> ⋢ string`.
        const collected = unionMembers(elements.map((v) => v.members));
        return {
          type,
          members:
            collected !== undefined &&
            renderCollectedTypes(collected) === displayType(element)
              ? [type]
              : undefined,
        };
      }
      case "binary":
        return this.#typeBinary(node.op, node.left, node.right, env, bindings);
      case "ternary": {
        // The condition chooses WHICH arm supplies the value, never what that
        // value is, so only the arms contribute members.
        const consequent = this.#typeValue(node.consequent, env, bindings);
        const alternate = this.#typeValue(node.alternate, env, bindings);
        return {
          type: this.#commonType([consequent.type, alternate.type], env),
          members: unionMembers([consequent.members, alternate.members]),
        };
      }
      case "try": {
        // `operand?` propagates the operand's success type statically.
        // RFC 0011 (seam sheet §0 C6): when the operand is a `call` whose
        // callee maps to a runtime-tool success type, the `?` unwrap
        // resolves to that structural type — so `let u = context_usage()?`
        // types `u` structurally, enabling member-type checks downstream.
        // GOV-15 inert: the map is empty for every 1.0.0-clean file.
        const operand = node.operand;
        if (operand.kind === "call") {
          const successType = this.#runtimeToolSuccessTypes.get(operand.callee);
          if (successType !== undefined) {
            // MEMBERS withheld: a `call` operand is past the parser's static
            // view for the provable set (the `call` arm below), and the
            // unwrap withholds with it.
            return { type: successType, members: undefined };
          }
        }
        // `operand?` evaluates to the operand's success value, so the members
        // pass through with the type.
        return this.#typeValue(node.operand, env, bindings);
      }
      case "match": {
        // bug 0145 §Fix (a) route 1: an arm body executes under its OWN
        // pattern's binders (`evalMatch` installs them into a child
        // environment before the body runs, ../runtime/statement-executor.ts),
        // never under a same-named ENCLOSING binding — so each arm is typed in
        // `#matchArmScope`'s copy rather than in the caller's `bindings`.
        // (Members are scope-blind — the `ident` arm withholds bound and free
        // names alike — so the arm scope decides only the type half.)
        //
        // The arm types reduce through `#matchArmType`, the dominating-member
        // discipline the checker's `checkMatchArmTypes` enforces on the same
        // node (`./match-result.ts`) — not `#commonType`, whose union clause the
        // checker refuses here (docs/reference/type-system.md §"Common-type
        // rules"): this pass owes the walk a type where the checker owes it a
        // diagnostic, and the two must agree on which candidate sets have one.
        // The MEMBERS are the union of the arm-body sets: the scrutinee only
        // chooses which arm supplies the value.
        const arms = node.arms.map((arm) =>
          this.#typeValue(arm.body, env, this.#matchArmScope(arm.pattern, bindings)),
        );
        return {
          type: this.#matchArmType(
            arms.map((v) => v.type),
            env,
          ),
          members: unionMembers(arms.map((v) => v.members)),
        };
      }
      case "member":
        return { type: this.#memberType(node, env, bindings).type, members: undefined };
      case "index": {
        // TYPE-11: unfolding first makes an alias of `array<T>` narrow to `T`;
        // TYPE-10 object-schema and unresolvable names unfold to themselves.
        // MEMBERS withheld although the type CAN reduce past a nominal
        // reference: withholding suppresses an emission and can never produce
        // one, and an index read is no callable-argument idiom worth the
        // extra provable-reduction surface (same deliberate stance as
        // `par-for` below).
        const target = unfoldAlias(this.#typeExpr(node.target, env, bindings), env);
        return {
          type: target.kind === "array" ? target.element : { kind: "named", name: "index" },
          members: undefined,
        };
      }
      case "call": {
        // RFC 0011 (seam sheet §0 C6): a call whose callee maps to a runtime
        // tool answers a `Result<success, QueryError>` nominal — display-
        // faithful, unresolvable on direct member access (no false structural
        // claim on the un-`?`'d Result), mirroring the `par-for` arm's
        // `Result<…>` nominal rendering above. GOV-15 inert.
        const successType = this.#runtimeToolSuccessTypes.get(node.callee);
        if (successType !== undefined) {
          return {
            type: { kind: "named", name: `Result<${displayType(successType)}, QueryError>` },
            members: undefined,
          };
        }
        return { type: { kind: "named", name: node.callee }, members: undefined };
      }
      // Each of the arms through "method-call" types as a `named` nominal
      // reference past the parser's static view, so each withholds its
      // members — the runtime AJV net owns those values.
      case "invoke":
        return { type: { kind: "named", name: node.path }, members: undefined };
      case "query":
        return { type: { kind: "named", name: node.schema ?? "query" }, members: undefined };
      case "object":
        return { type: { kind: "named", name: node.typeName ?? "object" }, members: undefined };
      case "result-ctor":
        return { type: { kind: "named", name: node.ctor }, members: undefined };
      case "method-call":
        return { type: { kind: "named", name: node.method }, members: undefined };
      case "par-for": {
        // CTRL-3: the value of a `par for` is `array<Result<U, QueryError>>`,
        // `U` the body tail type (absent tail → `null`). `CompatType` has no
        // dedicated `Result` shape, so the element is rendered as a nominal
        // reference naming `Result<U, QueryError>`; the outer `array` is the
        // stable, representation-independent surface the checkers consume.
        // MEMBERS withheld deliberately — same stance as `index` above.
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
          type: {
            kind: "array",
            element: {
              kind: "named",
              name: `Result<${displayType(tailType)}, QueryError>`,
            },
          },
          members: undefined,
        };
      }
      case "block":
        // bug 0082 §Fix constraint 3: a block's static type is its tail expression's
        // type, and its VALUE (so its members too) IS the tail's value. Mirrors
        // the `try` arm's pass-through above rather than
        // threading the block's own `let`s into `bindings` — this pass never
        // threads a plain (unannotated) `let`'s type to a LATER statement
        // anywhere else either (a `fn` body's sequential `let`s are not
        // threaded, `#walkStmt` records each statement's own expression against
        // `noBindings`), so a block-local name the tail reads resolves exactly
        // as unthreaded elsewhere: a nominal self-reference the `⊑` engine
        // defers on, never a false type. A tail-less block (already a parse
        // error, `theta/parse/block-expr-missing-tail`) yields no value-type
        // set to collect.
        return node.body.tail === null
          ? { type: { kind: "named", name: "unknown" }, members: undefined }
          : this.#typeValue(node.body.tail, env, bindings);
    }
  }

  /**
   * The scope a `match` arm's body is typed in: `bindings` plus that arm's own
   * pattern binders, each recorded via `withheldBinderType()`
   * (./type-compat.ts) — the same answer the type layer's own `matchArmScope`
   * (./type-layer-checks.ts) already gives the arm-body walk and
   * `provableArgType`'s reduction, so all three readers of an arm body now
   * resolve the same scope for the same node (bug 0145 §Fix). LOAD-BEARING:
   * this is the inference pass's own mint site (bug 0143 §Fix (b) route 1) —
   * if it minted the bare `{ kind: "named", name: WITHHELD_BINDER_TYPE_NAME }`
   * literal instead of routing through the shared factory, the withhold
   * predicate (`containsWithheldBinderType`, ./type-layer-checks.ts) would
   * silently stop deferring for every match-arm binder, since that predicate
   * now tests the `withheld` provenance marker and no longer the name.
   *
   * VALUE CHANNEL ONLY. The type layer's `recordWithheldBinders` also adds
   * each minted sentinel to an identity set (`unprovableBindings`) a marking
   * guard reads; this pass carries no such set (bug 0145 §Bounds) and must
   * not acquire one. Two things are true about the withheld name now,
   * precisely: the name alone (with no marker) still makes a sibling
   * `resolveNamed` lookup unresolvable and therefore defer
   * (type-system.md §*Unresolvable operands*) — that holds for any
   * `named` spelled `<withheld>`, marked or not; but the WITHHOLD decision
   * itself (`containsWithheldBinderType`) now keys on the `withheld` marker,
   * not on the name, which is why this site must mint through
   * `withheldBinderType()` rather than the bare literal. Identity-keyed
   * suppression is bug 0199's landed, narrower surface.
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
      scope.set(name, withheldBinderType());
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
   * `type` is the receiver's OWN `named` rather than `node.field`. For an
   * `Enum.Variant` receiver naming NO same-file `schema` this is schemas.md's
   * Enum declarations section's "statically typed as `Enum`" for free — the
   * receiver is `named <Enum>`, no `enum` entry ever enters the `TypeEnv`, so
   * it stays unresolved and the expression defers exactly as the
   * Unresolvable operands paragraph prescribes. The same branch is also the
   * provably-inert answer for every other unresolvable receiver: `node.field`
   * might resolve by accident against an unrelated declaration that happens
   * to share its spelling, where the receiver has just been proven to
   * resolve to nothing.
   *
   * A same-file `schema` spelled like the enum removes that branch —
   * `resolveNamed` would answer the schema, not `undefined` — which is why
   * the enum test below runs BEFORE the receiver is resolved at all (bug 0191
   * §Fix route 1). A conformant `schema` can never own a field spelled like a
   * variant (variant names are PascalCase, field names lowercase-first,
   * lexical.md §Identifiers; the ill-cased spelling draws `binding-case-mismatch`), so
   * without the enum test the arm would fall through every time to the
   * closing fabrication below and adopt an unrelated declaration's type
   * (docs/bugs/0191-enum-name-shadowed-by-schema-fabricates-member-type.md).
   *
   * That test keys on the variant-access SHAPE, never on the receiver's
   * inferred TYPE, because the two passes it mirrors both key on the shape and
   * a type-keyed test captures a strictly wider set of nodes than either:
   * `evalExpr`'s `case "member"` fires only for `expr.target.kind === "ident"`
   * whose name does not resolve to a `"local"` arm before it calls
   * `env.resolveEnumVariant` (../runtime/statement-executor.ts), and the
   * structural checker reads `refs.enums.get(e.target.name)` over the target
   * ident (./theta-document.ts). A type-keyed test additionally swallows every
   * member read off a VALUE whose declared type is the shadowing schema — the
   * `ident` arm above answers `named "Color"` for a `c: Color` parameter and
   * for the enum name itself alike — which silently drops a declared
   * field read on a resolvable object schema (bug 0136's field route, a §Non-
   * goal here) and admits a field-typed `array<T>` iterand the enum answer
   * then refuses. `bindings` is the local view the shape test needs:
   * `walkFn`'s parameter loop and the `let` / loop-variable scopes
   * (./type-layer-checks.ts) record exactly the names the runtime resolves to
   * a `"local"` arm, so an ident carrying a `bindings` entry is a value, not a
   * declaration reference, whatever its type spells.
   *
   * An absent field, a `fields` record the schema declaration carries none
   * of, and a field whose `typeSource` failed to convert all fall through to
   * the closing nominal fallback (`declared: false`) rather than reporting:
   * expressions.md's Member access bullet assigns an absent theta-side name a
   * RUNTIME `theta/runtime/missing-object-key` panic, not a parse
   * diagnostic, so answering here would pre-empt it. That fallback is
   * unguarded by the enum test and stays reachable for a genuinely absent
   * field colliding with an unrelated declaration with no enum in sight
   * (bug 0191's recorded residual, its §Reproduction row f4) — §Fix route 1
   * closes the enum half only.
   */
  #memberType(
    node: MemberExpr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): { readonly type: CompatType; readonly declared: boolean } {
    if (
      node.target.kind === "ident" &&
      !bindings.has(node.target.name) &&
      this.#enumNames.has(node.target.name)
    ) {
      return { type: enumVariantType(node.target.name), declared: false };
    }
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
    // RFC 0011 (seam sheet §0 C6): a structural `object` receiver (from
    // `letAnnotationToCompatType` via `runtimeToolSuccessTypes`) resolves its
    // fields directly — `usage.percent` on a try-unwrapped `context_usage()?`
    // must type `percent` as `number`, not defer as an unresolvable nominal.
    // GOV-15: gated on `#runtimeToolSuccessTypes` being NON-EMPTY — the arm
    // is unreachable for every file declaring none of the three runtime-tool
    // names (the map is empty). An identity gate against the map's value
    // objects would be the narrower discipline, but the type-layer walk's
    // `let`-arm copies the type (`{ ...inferred }`) for its own
    // `unprovableBindings` tracking, so a `bindings.get(name)` read in
    // `#typeExpr`'s `ident` arm returns the COPY, which would fail any
    // reference-equality test against the original map values. The map-size
    // gate is correct: a file that declares runtime tools and also has a
    // `let x: { a: integer }` annotation gets truthful structural member
    // resolution on `x.a` (the annotation IS the author's claim about the
    // field type), so no false diagnostic is produced.
    if (receiver.kind === "object" && this.#runtimeToolSuccessTypes.size > 0) {
      const field = receiver.fields.find((f) => f.name === node.field);
      if (field !== undefined) {
        return { type: unfoldAlias(field.type, env), declared: true };
      }
    }
    return { type: { kind: "named", name: node.field }, declared: false };
  }

  /**
   * The static type of a binary-operator expression, together with its
   * provable value-type set (`#typeValue`'s binary arm). A result-fixed
   * operator's set is exact — `[type]` — even where an operand is statically
   * unresolvable, so an unresolvable operand under such an operator is not a
   * reason to withhold the expression.
   */
  #typeBinary(
    op: string,
    left: Expr,
    right: Expr,
    env: TypeEnv,
    bindings: ReadonlyMap<string, CompatType>,
  ): ExprValueTypes {
    // Unary `!` / `-` are modeled by `theta-document` `parseUnary` as a binary
    // with a synthetic `null` left operand. Mirror the runtime's unary handling
    // (`evaluateBinaryExpression`: `op === "-" && unary === true`, and the `!`
    // case) so the operator types as its result, not as the null-mixed common
    // type of `{null, operand}` (which otherwise collapses to `null` and trips
    // the A5 mixed-operand / A6 ordering operand-type checks). This static
    // site can stay wider than the runtime's marker check: a genuine unary
    // node always carries a `null` left operand, and an authored `null - x`
    // is parse-refused on the statement path and runtime-belted on the
    // re-lexed (interpolation/invoke-arg) paths, so typing the authored
    // pairing as unary here is moot — no marker is needed at this layer.
    if (left.kind === "null") {
      if (op === "!") {
        return exactValue({ kind: "prim", name: "boolean" });
      }
      if (op === "-") {
        // Negation carries the operand's own type and value-type set.
        return this.#typeValue(right, env, bindings);
      }
    }
    // Comparison and logical operators statically produce a boolean, whatever
    // the operands evaluate to (`evalBinary` in
    // ../runtime/statement-executor.ts yields `true` / `false` for `!`, `&&`,
    // `||` and every comparison).
    if (BOOLEAN_BINARY_OPS.has(op)) {
      return exactValue({ kind: "prim", name: "boolean" });
    }
    // expressions.md §"Other arithmetic": `/` always produces `number`,
    // whatever the operands — there is no integer-division operator in
    // theta 1.0, and an exactly-divisible pair is not an exception (bug 0142
    // §Fix: the value-type set is exact for the same result-fixed reason as
    // the boolean arm above, so the operand sets are not consulted).
    if (op === "/") {
      return exactValue({ kind: "prim", name: "number" });
    }
    // expressions.md §"Other arithmetic" (:234): `n % 0` is `NaN`, and
    // because `NaN` is a `number` an `integer % 0` result widens to
    // `number`. Unlike `/` this rule is keyed on the DIVISOR'S VALUE, not
    // the operator alone, so the arm also has to read `right` — the only
    // reason it is not a one-line sibling of the `/` arm above. It does not
    // consult `left`: `"a" % 0` is still `NaN` (a `number`), so the arm
    // fires ahead of either operand being typed, same as `/` (bug 0152 §Fix
    // (c): the value-type set is exact here too).
    if (op === "%" && isStaticZeroIntegerDivisor(right)) {
      return exactValue({ kind: "prim", name: "number" });
    }
    // Arithmetic narrows the operands to their common type through the `⊑`
    // engine (e.g. `integer + number` narrows to `number`). The value-type
    // set is the UNION of the operand sets: the value takes one operand's
    // kind or the two widened together, all of which the union covers.
    // Over-approximating is safe in the one direction that matters — a wider
    // set only makes disjointness harder to prove, and `kindsDisjoint`
    // (../runtime/tool-call.ts) already reconciles `integer`/`number`, so a
    // `%` divisor this arm still reaches (any divisor that is not a
    // statically-zero integer literal) cannot turn a withheld verdict into a
    // fired one.
    const leftValue = this.#typeValue(left, env, bindings);
    const rightValue = this.#typeValue(right, env, bindings);
    return {
      type: this.#commonType([leftValue.type, rightValue.type], env),
      members: unionMembers([leftValue.members, rightValue.members]),
    };
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
    // `covers` widens ITS CANDIDATE to the primitive it types as (TYPE-3) before
    // relating the raw arms to it: an unwidened `literal` candidate carries less
    // absorbing power than the `prim` it types as, so a `literal number`
    // candidate could not cover a `prim integer` arm even though `integer ⊑
    // number` holds (TYPE-2) — bug 0344's `commonType` asymmetry, mirrored here
    // per bug 0346's ratified third site (the checker's `leastUpperBound`,
    // ./match-result.ts, carries the identical comment). The arms tested
    // against it stay raw; only the candidate side widens. `candidates` is then
    // mapped through the same widening so the resolved type is the primitive.
    const covers = (candidate: CompatType): boolean => {
      const widened = widenLiteralTypes(candidate);
      return armTypes.every((arm) => {
        const r = this.#checkCompatible(arm, widened, env);
        return r === "compatible" || r === "unknown";
      });
    };
    const candidates = armTypes.filter(covers).map((candidate) => widenLiteralTypes(candidate));
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
 * The reduced static type of an expression node together with the provable
 * value-type set the same `#typeValue` arm computed for it — `type` is what
 * `typeOf` publishes, `members` is what `collectProvableArgTypes` answers
 * (`undefined` withholds). Computing the two in one switch is what keeps a
 * collected member from ever rendering differently from the assigned type.
 */
interface ExprValueTypes {
  readonly type: CompatType;
  readonly members: CompatType[] | undefined;
}

/**
 * A node whose provable value-type set is EXACTLY its own reduced type: a
 * literal, or a result-fixed binary operator.
 */
function exactValue(type: CompatType): ExprValueTypes {
  return { type, members: [type] };
}

/**
 * Concatenate the collected value-type sets of a composite's value-contributing
 * operands, propagating `undefined` from any one of them: a composite one of
 * whose arms is unresolvable can take a value of unknown type, so nothing about
 * it is provable. An EMPTY concatenation is `undefined` too — `#commonType`
 * maps an empty candidate set to a nominal `unknown`, and a vacuously-true
 * "every arm is incompatible" must never read as a proof.
 */
function unionMembers(
  parts: readonly (readonly CompatType[] | undefined)[],
): CompatType[] | undefined {
  const collected: CompatType[] = [];
  for (const part of parts) {
    if (part === undefined) {
      return undefined;
    }
    collected.push(...part);
  }
  return collected.length > 0 ? collected : undefined;
}

/**
 * Render a collected value-type set for the `<actual>` placeholder: each member
 * through `displayType`, deduplicated, joined with `" | "` — the top-level-union
 * spelling `subsetKinds` (../runtime/tool-call.ts) splits back into kinds and
 * the same spelling an author-written union annotation carries. Deduplication
 * keeps a composite whose arms all render alike reading exactly as one arm does,
 * so `flag ? 1 : 2` renders `integer` rather than `integer | integer`. `Set`
 * iteration is insertion-ordered, so the arms render in source order.
 */
export function renderCollectedTypes(types: readonly CompatType[]): string {
  return [...new Set(types.map((type) => displayType(type)))].join(" | ");
}

/**
 * Binary operators whose result is statically a boolean, whatever the operands
 * evaluate to. `#typeBinary` and the provable value-type collection share the
 * one set by construction (one merged switch); still exported because the
 * boolean-context checks (./type-layer-walk.ts) key on exactly the same
 * result-fixed operator set.
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

/**
 * True for a `%` divisor node that is STATICALLY provable zero: an
 * `integer`-typed numeric literal denoting `0` (bug 0152, Route A). The
 * provable value-type collection shares the one test by construction —
 * `#typeBinary`'s merged switch is now its only consumer.
 *
 * `numericType === "integer"` excludes `0.0` / `0e0` (`numericType: "number"`):
 * those already widen to `number` through the operand-common reduction, so
 * admitting them here would be redundant, not wrong, but the guard keeps the
 * arm's reach exactly the literal-zero-`integer` class Route A commits to.
 * `Number(text) === 0` rather than `text === "0"` because `00` also lexes as
 * an integer-typed zero (`text: "00"`) and denotes the same value; `text`
 * equality would silently decline it. A unary-negated `-0` is a `binary`
 * negation node here, not a `NumberExpr` (parentheses are transparent per the
 * parser, so `(0)` reaches this test as the same node as `0`; negation is not,
 * per `theta-document.ts`'s `parseUnary`) — Route A's stated residual, not a
 * gap in this predicate.
 */
function isStaticZeroIntegerDivisor(node: Expr): boolean {
  return (
    node.kind === "number" &&
    node.numericType === "integer" &&
    Number(node.text) === 0
  );
}
