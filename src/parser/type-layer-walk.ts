// Per-parse type-layer diagnostics walk — the statement/expression/fn walking
// core; the provability, interpolation and operand/receiver check families it
// drives live in ./type-layer-provable.ts, ./type-layer-interpolation.ts and
// ./type-layer-operand-checks.ts, sharing this walk's per-parse state through
// `TypeWalkContext`. Unprovable reads defer to runtime; withholding can
// suppress a diagnostic, never manufacture one.

import type { Diagnostic } from "../diagnostics/diagnostic";
import { containsWithheldBinderType } from "./compat-type-traversal";
import type {
  ArrayExpr,
  Block,
  CallExpr,
  Expr,
  FnDecl,
  IfStmt,
  ObjectFieldNode,
  PatternNode,
  Stmt,
} from "./theta-document";
import { callWithClauseValues } from "./theta-document";
import {
  checkCompatible,
  displayType,
  resolveNamed,
  unfoldAlias,
  widenLiteralTypes,
  withheldBinderType,
  type CompatType,
  type TypeEnv,
} from "./type-compat";
import {
  checkCommonType,
  checkFnArgCompat,
  checkLetRhsCompat,
  checkObjectFieldCompat,
  checkReassignRhsCompat,
} from "./type-compat-sites";
import type { StaticTypeInferencePass } from "./static-type-inference";
import { checkBooleanPosition } from "./expression-position-checks";
import { checkIterand } from "./type-layer-iterand";
import { annotationSourceIsNotTypeExpression } from "./annotation-validation";
import {
  checkMatchArmTypes,
  collectPatternBinderNames,
  type EnclosingReturnScope,
} from "./match-result";
import { resolveReturnType, type ReturnContribution } from "./functions";
import { checkFnCallArity, checkInvokeReturnType } from "./invoke-diagnostics";
import {
  annotationToCompatType,
  fnCallJudgedArgSlots,
  letAnnotationToCompatType,
  isResultAnnotation,
  patternLiteralType,
} from "./annotation-compat";
import {
  NO_SUNK_ARRAYS,
  childExprs,
  fnParamNamesAreIdentifiers,
  placeholderSiteRange,
  stmtBlocks,
  stmtExprs,
  type WalkCtx,
} from "./type-layer-checks";
import { provableArgType, type TypeWalkContext } from "./type-layer-provable";
import {
  checkBinaryOperands,
  checkIndex,
  checkMemberAccess,
  checkMethodCall,
  pushMixedPlusIfNeeded,
} from "./type-layer-operand-checks";
import {
  checkQueryInterpolationOperands,
  checkQueryInterpolationResults,
  checkQuestion,
  isCertainResultNode,
  parseQueryInterpolations,
} from "./type-layer-interpolation";

/**
 * A per-parse walk feeding the wired `type`-phase checkers. Holds only per-parse
 * state (the injected pass, the type env, the file, the callee-resolution
 * tables, the accumulated diagnostics) — no module-level mutable state.
 */
class TypeLayerWalk implements TypeWalkContext {
  public readonly diagnostics: Diagnostic[] = [];

  /**
   * The type objects recorded for `let` bindings whose initialiser is a
   * `Result` by construction — the bug-0079 §Fix (a) ident provenance channel,
   * keyed by OBJECT IDENTITY (the WHY is at the `let` arm that populates it).
   * The `let` arm is the sole MINTER — only `isCertainResultNode` creates a
   * membership — but not the sole writer: `bindLoopElement` and the `let`
   * arm's own unproven branch (bug 0199 §Fix (a)) both INHERIT a membership
   * onto the private twin they record, by testing the borrowed object before
   * deciding whether to copy it, so a binding that only ever reads another
   * `Result`-marked binding keeps that membership across the copy. Per-parse
   * instance state, like `diagnostics`.
   */
  public readonly resultBindings = new Set<CompatType>();

  /**
   * The type objects recorded for a binding whose recorded type is an ERASED
   * read rather than a declared one — the bug-0050 §Fix laundered-binding
   * channel. FOUR writers, each marking an object it owns: `walkStmt`'s
   * unannotated `let` arm (the initialiser's own read); the two loop arms —
   * `walkStmt`'s `case "for"` and `walkExpr`'s `case "par-for"` — through the
   * shared `bindLoopElement` (the iterand's element read); and
   * `recordWithheldBinders`, for a binder class this layer cannot type at all
   * (it marks the sentinel it mints). Keyed by OBJECT IDENTITY for the same
   * reason `resultBindings` above is: `bindings.get(name)` returns the exact
   * object the recording arm stored, so identity is the channel back to an
   * erasure a name lookup alone cannot see.
   *
   * The object a `typeOf` read hands back can be BORROWED rather than minted:
   * a declared field's own `CompatType` (`collectSchemaFields`, one object per
   * declared field per parse) or a `TypeEnv` alias's right-hand side
   * (`unfoldAlias` hands it back BY REFERENCE) is shared by every binding that
   * records that same field or alias, so marking it directly would withhold
   * every later reader of it, not only the binding the mark was taken for
   * (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md). Each writer
   * therefore marks a fresh twin instead of the borrowed object wherever that
   * risk exists — `bindLoopElement` at the two loop arms (bug 0194 §Fix), the
   * `let` arm at its own unproven branch (bug 0199 §Fix (a)) — keeping the
   * marked object reachable from exactly one scope entry. `walkFn`'s parameter
   * scope feeds nothing here — an author-written annotation IS a declared
   * type, so it is a proof. `provableArgType`'s `ident` arm withholds on a
   * hit; a false identity hit only withholds, never fabricates an emission.
   * Per-parse instance state, like `diagnostics`.
   */
  public readonly unprovableBindings = new Set<CompatType>();

  /**
   * `fnDecls`, `importedSymbols` and `shadowedNames` are `checkFnCallArgs`'s
   * (bug 0050 §Fix) callee-resolution tables — computed once per parse by
   * `checkTypeLayer` and passed in here, the same explicit-injection shape as
   * the four dependencies above them.
   */
  public constructor(
    public readonly pass: StaticTypeInferencePass,
    public readonly env: TypeEnv,
    public readonly file: string,
    public readonly fnReturns: ReadonlyMap<string, string>,
    private readonly fnDecls: ReadonlyMap<string, FnDecl>,
    private readonly importedSymbols: ReadonlySet<string>,
    private readonly shadowedNames: ReadonlySet<string>,
  ) {}

  /** The static type the `V20b` pass assigns `expr` under the in-scope bindings. */
  public typeOf(expr: Expr, bindings: ReadonlyMap<string, CompatType>): CompatType {
    return this.pass.typeOf(expr, this.env, bindings);
  }

  /**
   * Walk a block's statements (accumulating `let` bindings into `bindings`) then
   * its tail expression. `bindings` is this block's own scope: nested blocks
   * receive a copy so inner `let`s do not leak outward.
   */
  public walkBlock(block: Block, bindings: Map<string, CompatType>, flow: WalkCtx): void {
    for (const stmt of block.statements) {
      this.walkStmt(stmt, bindings, flow);
    }
    if (block.tail !== null) {
      this.walkExpr(block.tail, bindings, flow);
    }
  }

  private walkStmt(stmt: Stmt, bindings: Map<string, CompatType>, flow: WalkCtx): void {
    switch (stmt.kind) {
      case "let":
        this.walkLetStmt(stmt, bindings, flow);
        return;
      case "reassign":
        this.walkReassignStmt(stmt, bindings, flow);
        return;
      case "if":
        this.checkBoolean(stmt.condition, bindings);
        this.walkExpr(stmt.condition, bindings, flow);
        this.walkBlock(stmt.then, new Map(bindings), flow);
        this.walkOtherwise(stmt.otherwise, bindings, flow);
        return;
      case "while":
        this.checkBoolean(stmt.condition, bindings);
        this.walkExpr(stmt.condition, bindings, flow);
        this.walkBlock(stmt.body, new Map(bindings), flow);
        return;
      case "for": {
        const iterandType = this.typeOf(stmt.iterand, bindings);
        checkIterand(
          iterandType,
          { file: this.file, range: stmt.iterand.range },
          this.env,
          this.diagnostics,
        );
        this.walkExpr(stmt.iterand, bindings, flow);
        const inner = new Map(bindings);
        // control-flow.md §`for` … `in` binds the iteration variable "as a
        // fresh immutable local per iteration", and `executeFor` binds it
        // whatever the element holds (`env.bindIterationVariable`,
        // ../runtime/statement-executor.ts), so the name is recorded in the
        // BODY scope here: leaving it unrecorded lets a body read resolve to a
        // same-named enclosing binding the runtime does not read at that
        // position. The same paragraph gives the iterand the type `array<T>`
        // and the loop variable that same `T` (bug 0126 §Fix), so the record
        // below is the (TYPE-11-unfolded) iterand's element — an alias of
        // `array<T>` supplies the same `T` the concrete array type does,
        // exactly as the admissibility gate above already requires. A
        // non-`array` iterand withholds instead of adopting a nominal: the
        // gate above has already refused it at its own span (or deferred, when
        // the iterand is itself withheld), and a minted unresolvable name
        // would be judged structurally at the sinks that refuse unresolvables
        // — measured, it draws a false `theta/parse/non-array-iterand … got
        // unknown` on `fn h(p) { for x in p { for y in x { } } }`, which loads
        // cleanly. The `unprovableBindings` marking, and the reason an
        // unprovable iterand's element is no proof at a judgement sink, are
        // `bindLoopElement`'s — the one step both loop arms share.
        const unfolded = unfoldAlias(iterandType, this.env);
        if (unfolded.kind === "array") {
          this.bindLoopElement(inner, stmt.variable, unfolded.element, stmt.iterand, bindings);
        } else {
          this.recordWithheldBinders(inner, [stmt.variable]);
        }
        this.walkBlock(stmt.body, inner, flow);
        return;
      }
      case "fn":
        this.walkFn(stmt, bindings);
        return;
      case "return":
        if (stmt.operand !== null) {
          this.walkExpr(stmt.operand, bindings, flow);
        }
        return;
      case "query":
        this.walkExpr(stmt.query, bindings, flow);
        return;
      case "tool-call":
        this.walkExpr(stmt.call, bindings, flow);
        return;
      case "invoke":
        this.walkExpr(stmt.invoke, bindings, flow);
        return;
      case "expr":
        this.walkExpr(stmt.expr, bindings, flow);
        return;
      case "break":
      case "continue":
      case "schema":
      case "enum":
      case "import":
      case "export":
      case "doc-comment":
        // No expression to type-check.
        return;
      default: {
        // Compile-time exhaustiveness backstop: a future `Stmt` union member
        // trips a `tsc` error here rather than being silently skipped by this
        // pass while the binder collector's `walkStmtForLocalBinders`
        // (local-binders.ts) handles it — the two walks must classify the same
        // statement kinds in lockstep.
        const _exhaustive: never = stmt;
        return void _exhaustive;
      }
    }
  }

  /** Check a let initialiser, then record its type and provenance in the binding scope. */
  private walkLetStmt(
    stmt: Stmt & { kind: "let" },
    bindings: Map<string, CompatType>,
    flow: WalkCtx,
  ): void {
    if (stmt.init !== null) {
      const rhsType = this.typeOf(stmt.init, bindings);
      // A source that derives from none of `Type`'s six alternatives
      // (bug 0124 §Fix) supports no verdict at this position: the RHS
      // narrowing check below and the array-element sink are bypassed
      // for it exactly as for an unannotated `let`, but the binding is
      // recorded WITHHELD rather than adopting the initialiser's
      // inferred type — the withhold is what keeps a LATER read of this
      // binding (a method call, a condition, a further annotated `let`)
      // from being judged against text that names no type, rather than
      // merely an unresolvable one. Driven by the recogniser alone, not
      // by whether the annotation's own `parseTypeExpression` walk
      // already drew a diagnostic — that guard decides only whether
      // theta-document.ts EMITS the refusal, and "this text supports no
      // type verdict" is a property of the text either way.
      if (
        stmt.annotation !== null &&
        stmt.annotation.length > 0 &&
        annotationSourceIsNotTypeExpression(stmt.annotation)
      ) {
        this.walkExpr(stmt.init, bindings, flow, NO_SUNK_ARRAYS);
        this.recordWithheldBinders(bindings, [stmt.name]);
        return;
      }
      // Resolved once, ahead of both uses below: the initialiser
      // compatibility check and the recorded binding type. An
      // unresolvable source (`annotationToCompatType` → `undefined`)
      // falls back to `rhsType` in both places, so a name the type
      // environment cannot resolve never turns into a hole (bug 0083).
      // Bug 0130 §Fix (a): the `let`-annotation conversion, one of the
      // sanctioned call sites authorised to mint TYPE-8's `object` arm for
      // a well-formed inline object type (the others are the RFC 0011
      // runtime-tool success-type mints — see `letAnnotationToCompatType`'s
      // own comment for the roster). Every other reader of an annotation
      // source keeps calling `annotationToCompatType` (see that function's
      // own comment for why the others are held).
      const annotation =
        stmt.annotation !== null && stmt.annotation.length > 0
          ? letAnnotationToCompatType(stmt.annotation)
          : undefined;
      // A read carrying a WITHHELD binder anywhere inside it supports no
      // verdict here: an annotation of `array<T>` or of an inline object
      // type is decided STRUCTURALLY by `decide` (TYPE-7 / TYPE-8, before
      // its `resolveNamed` arms), so the deferral an unresolvable name earns
      // against a primitive annotation is unavailable against a structural
      // one, and the withheld part can be the whole basis of the answer.
      // The declared type is still RECORDED below — an annotation is the
      // author's own claim about the position, and the runtime AJV net is
      // what judges the value that arrives.
      // `sinkedArrayOf` is the one place that decides whether an array
      // sink is in scope; the skip below must not re-derive it separately.
      const sunkArray = this.sinkedArrayOf(stmt, annotation);
      // Skipped even where the check below never runs (annotation withheld
      // by a withheld binder, or no annotation at all): `sunkArray` alone
      // decides the OUTER node's skip, and widening that decision from one
      // node to a set of them leaves the decision itself unchanged.
      let sunkArrays: ReadonlySet<Expr> =
        sunkArray === null ? NO_SUNK_ARRAYS : new Set([sunkArray.node]);
      if (annotation !== undefined && !containsWithheldBinderType(rhsType)) {
        // The typed-binding RHS narrowing / mismatch check (surfaces
        // `theta/parse/integer-narrowing` for a `number → integer` RHS).
        // Reads the RAW `annotation` (TYPE-11 makes it and `sunkArray`'s
        // unfolded element the same type), so this renders `expected U`.
        this.diagnostics.push(
          ...checkLetRhsCompat({
            name: stmt.name,
            annotation,
            rhs: rhsType,
            env: this.env,
            site: { file: this.file, range: stmt.range },
          }),
        );
        // A typed array literal is checked against the annotation's
        // (alias-unfolded) element sink here, so the generic (sink-less)
        // array check does not re-flag a validly-annotated union array.
        if (sunkArray !== null) {
          sunkArrays = this.checkArrayLiteral(sunkArray.node, sunkArray.element, bindings);
        }
      }
      // Walk the initialiser for nested checks. A typed array already
      // checked against its element sink above is skipped by the walk, and
      // so is every nested literal that check descended into.
      this.walkExpr(stmt.init, bindings, flow, sunkArrays);
      // Record the declared type, not merely the initialiser's inferred
      // one: `checkLetRhsCompat` above has already verified the
      // initialiser against it, so later identifier references seeing the
      // annotation instead admit nothing unchecked (bug 0083).
      //
      // Recorded in its TYPE-11-transparent form, because that IS the
      // declared type: `schema L = array<string>` makes `L` and
      // `array<string>` the same type, and the structural gates reading
      // this map off an identifier (the `for` / `par for` iterand
      // contract, the `array.join` element precondition) test `kind`
      // directly rather than through the alias-unfolding `⊑` engine.
      // `unfoldAlias` leaves an object-schema `named` nominal (TYPE-10)
      // and an unresolvable `named` intact.
      //
      // Whether the initialiser is a PROVEN read of the value type it
      // produces is decided FIRST, while `bindings` still holds the OUTER
      // binding for `stmt.name`: that is the scope the initialiser is
      // evaluated in. The runtime evaluates it and only then defines the
      // binding (`evalExpr(stmt.init, env)` then `env.defineLocal`,
      // ../runtime/statement-executor.ts), so a self-reference inside a
      // shadowing `let`'s initialiser reads the OUTER value — marked in
      // `unprovableBindings` when that outer binding was itself laundered,
      // and a proof when it was not. Deciding it after the `bindings.set`
      // instead would resolve that self-reference to the type object this
      // arm is in the middle of recording, which no marking has reached, and an
      // erased outer binding would launder into a proven record (`let x =
      // 1 + x` over an erased `x`).
      //
      // Only an unannotated `let` is ever marked — the reason is at the
      // marking site below — and `&&` short-circuits, so an annotated one
      // reaches no proof obligation at all.
      const initUnprovable =
        annotation === undefined && provableArgType(this, stmt.init, bindings) === undefined;
      //
      // An unannotated binding records what the initialiser EXPRESSION
      // types as, so every literal type inside the inferred type is
      // widened to the primitive it types as (TYPE-3, `widenLiteralTypes`
      // in type-compat.ts). Recording the unwidened literal makes the
      // binding a target that only another literal satisfies — `decide`'s
      // literal-target arm relates a literal target to a literal source
      // alone — so `let mut a = ""` refused a `string`-typed reassignment
      // RHS and rendered both sides `string` (bug 0341). An ANNOTATED
      // binding is unaffected: an annotation never lowers to a literal
      // type.
      const inferred = annotation === undefined ? widenLiteralTypes(rhsType) : rhsType;
      const recorded: CompatType =
        annotation === undefined
          ? initUnprovable
            ? { ...inferred }
            : inferred
          : unfoldAlias(annotation, this.env);
      bindings.set(stmt.name, recorded);
      if (annotation === undefined && isCertainResultNode(this, stmt.init)) {
        // Bug 0079 §Fix (a) — remember this binding's `Result`-ness by the
        // IDENTITY of the type object recorded above, never by its name.
        // `CompatType` has no `Result` shape, so a `Result` binding records
        // a `named` reference whose name (`Ok` / `Err` / a callee) an enum
        // variant, a field, or a plain `fn` can spell equally well; the
        // object `#typeExpr` minted for THIS initialiser is unique to it.
        //
        // The membership is added to `recorded`, not `rhsType`: for a
        // `call` to a `Result`-returning `fn` this same initialiser can
        // also be unprovable (`provableArgType`'s `call` arm withholds
        // unconditionally), in which case `recorded` is the private twin
        // `unprovableBindings` marks below rather than `rhsType` itself,
        // and `bindings.get(stmt.name)` will hand back only `recorded` —
        // so the two channels must agree on which object that is, or a
        // later read sees the withhold and misses the membership (bug
        // 0199 §Fix (a)).
        //
        // `#typeExpr`'s `ident` arm returns the very object `bindings`
        // holds, and each nested scope's `new Map(bindings)` copies the
        // same references, so shadowing and scope exit come out right with
        // no name-keyed side table — which would misread the `r` of
        // `let r = 5` / `if c { let r = Ok(1) }` / `${r}` as a `Result`.
        // An annotated binding is excluded because the annotation IS its
        // recorded type: a written `Result<…>` is caught by the generic-name
        // acceptance instead, and any other annotation is the author
        // declaring a non-`Result`.
        this.resultBindings.add(recorded);
      } else if (annotation === undefined && this.resultBindings.has(rhsType)) {
        // The same channel's INHERITED half: `stmt.init` is not itself
        // `Result`-certain — typically an `ident` re-reading an
        // already-`Result` binding — so the membership is not minted
        // here, it is CARRIED from the object `typeOf` returned for it.
        // Testing `rhsType`, the object exactly as `typeOf` returned it
        // before this arm decides whether to copy it, is what lets the
        // carry see a membership the private twin below would otherwise
        // start without; adding `recorded` keeps the mint's own
        // object-agreement above, so a further `let d = c` inherits from
        // `c`'s own recorded object rather than from `r`'s (bug 0199
        // §Fix (a)).
        this.resultBindings.add(recorded);
      }
      if (initUnprovable) {
        // The laundered-binding hole (bug 0050 §Fix): `recorded`, already
        // bound to `stmt.name` above, is the initialiser's own ERASED
        // read when the initialiser itself is unprovable (an unannotated
        // `let x = flag ? 1 : "a"` records `integer` after discarding the
        // `string` arm). A later `g(x)` must not read that recorded type
        // as a proof it never was. `recorded` rather than `rhsType`,
        // because `typeOf` can hand back an object this binding does not
        // own — a declared field's own `CompatType` or a `TypeEnv`
        // alias's right-hand side, shared with every other binding that
        // records that same field or alias — and marking that object
        // directly would withhold every later reader of it, not only this
        // one (bug 0199 §Fix (a)); `recorded` is that object's own private
        // twin wherever the sharing risk exists, and the borrowed object
        // itself otherwise. An ANNOTATED `let` is excluded because the
        // annotation IS the recorded type and `checkLetRhsCompat` above
        // already judges its initialiser, so it stays a proof.
        this.unprovableBindings.add(recorded);
      }
    }
    return;
  }

  /** Check reassignment compatibility and the desugared plus gate before walking the RHS. */
  private walkReassignStmt(
    stmt: Stmt & { kind: "reassign" },
    bindings: Map<string, CompatType>,
    flow: WalkCtx,
  ): void {
    // bindings.md:12 §Reassignment — the RHS must be compatible with the
    // TARGET's declared or inferred type (TYPE-9, bug 0115). The target's
    // recorded type is read, never re-derived: bug 0090's landed
    // `#reassignment-binding-type` rule is that a reassignment does not
    // change what the binding's later references resolve to, so this arm
    // must not write `bindings` — doing so would re-record the target's
    // type and red 0090's witness. `undefined` is an UNDECLARED target,
    // which draws no diagnostic anywhere today (`buildReassign`'s check
    // fires only for a known-immutable target), and this arm defers on it
    // rather than manufacture a verdict over a name it cannot type.
    const declared = bindings.get(stmt.target);
    if (declared !== undefined) {
      const rhsType = this.typeOf(stmt.value, bindings);
      // A WITHHELD binder on either side is a spelling, not a proven
      // type (see the `let` arm above), so judging against it would
      // manufacture a verdict the position never supported.
      if (!containsWithheldBinderType(declared) && !containsWithheldBinderType(rhsType)) {
        this.diagnostics.push(
          ...checkReassignRhsCompat({
            name: stmt.target,
            declared,
            value: rhsType,
            env: this.env,
            site: { file: this.file, range: stmt.range },
          }),
        );
        // Bug 0314 — bindings.md's desugar defines `x += e` as `x = x + e`,
        // so the implied `+` pair must clear the SAME operand-type gate the
        // spelled binary clears (`theta/parse/mixed-plus-operands`); TYPE-9
        // above judges RHS `⊑` target only, which a same-type array/array or
        // boolean/boolean pair always satisfies, so without this call
        // `xs += [2]` / `b += false` parse clean. Only `+=` routes here:
        // `-=`/`*=`/`/=`/`%=` keep bug 0314's runtime `CompoundNonNumericError`
        // belt, because bug 0332's spelled-arithmetic numeric-operand gate is
        // an EXPRESSION-position rule — its §Non-goals leaves the compound
        // forms on 0314's runtime disposition — so the desugared compound
        // pair is deliberately not routed through the parse gate here.
        // `declared` (the TARGET's type) stands in for the desugar's left
        // operand since the desugar reads `x` before writing it.
        if (stmt.op === "+=") {
          pushMixedPlusIfNeeded(this, declared, rhsType, stmt.range);
        }
      }
    }
    this.walkExpr(stmt.value, bindings, flow);
    return;
  }

  private walkOtherwise(
    otherwise: IfStmt | Block | null,
    bindings: Map<string, CompatType>,
    flow: WalkCtx,
  ): void {
    if (otherwise === null) {
      return;
    }
    if ("statements" in otherwise) {
      this.walkBlock(otherwise, new Map(bindings), flow);
    } else {
      this.walkStmt(otherwise, new Map(bindings), flow);
    }
  }

  /**
   * Bind `variable`'s loop-element type into `scope`, and mark it in
   * `unprovableBindings` when `iterand` is not a proof — the one step
   * `walkStmt`'s `case "for"` (`unfolded.kind === "array"` branch) and
   * `walkExpr`'s `case "par-for"` both need, called from both so the marking
   * step cannot drift between the two arms. Bug 0194 §Fix (d) constraint 1:
   * the arms mark through the same `unprovableBindings` set and measurably
   * poison each other in both directions, so this step has no discriminating
   * parameter and must move in lock-step across both call sites in one
   * commit — a shared private helper, not two edits.
   *
   * WHY MARK AT ALL: the loop variable inherits the iterand's erasure. An
   * unprovable iterand (`[flag ? 1 : "a"]` reads `array<integer>` after
   * `commonType` discards the `string` arm) hands `element` a reading no
   * runtime iteration need produce, so a body `g(x)` must not treat that
   * reading as a proof at a judgement sink.
   *
   * IDENTITY IS THE RIGHT CHANNEL FOR A MINTED OBJECT, WRONG FOR A BORROWED
   * ONE. `unprovableBindings`'s only read (`provableArgType`'s `ident` arm)
   * tests `bindings.get(name)` against this set BY OBJECT IDENTITY, which is
   * sound exactly when the tested object belongs to the one scope entry the
   * mark was taken for — `recordWithheldBinders` mints that object fresh, so
   * identity is exact there. `element` here is not minted for this call:
   * `unfoldAlias` (./type-compat.ts) hands back a `TypeEnv` alias's
   * right-hand side BY REFERENCE, and `collectTypeEnv`, `collectSchemaFields`
   * and `paramsFieldBindings` each build exactly ONE `CompatType` — per alias
   * declaration, per declared schema field, per `params:` field — for the
   * WHOLE parse, so a borrowed `element` is the very object every LATER
   * reader of that same alias, field or `params:` binding gets back too.
   * Recording and marking a fresh `{ ...element }` instead, scoped to the one
   * loop this call is for, is what makes true what `unprovableBindings`'s own
   * doc comment asserts — "`bindings.get(name)` returns the exact object the
   * recording arm stored" — because the marked object is now reachable from
   * exactly one scope entry, not from every reader of the declaration it was
   * borrowed from.
   *
   * A SHALLOW copy suffices, and the twin must inherit EVERY channel keyed on
   * the identity of the object it copies — a stand-in that stands in on one
   * such channel and not on another is not a stand-in. This file holds exactly
   * two, both `Set<CompatType>` tested against the top-level object
   * `bindings.get(name)` returns; nested identity is consulted on neither,
   * which is what makes a shallow spread enough:
   *
   *   - `unprovableBindings`, read by `provableArgType`'s `ident` arm. The twin
   *     joins it EXPLICITLY below — this method's whole subject.
   *   - `resultBindings`, read by `interpolationIsResult`'s `ident` arm (bug
   *     0079's `Result`-provenance channel). The unannotated `let` arm is its
   *     only FEED, but the READ tests whatever object `bindings` holds for the
   *     interpolated name, and that object can be the one this method copies:
   *     `commonType`'s dominating-candidate clause (./type-compat.ts, reached
   *     through `StaticTypeInferencePass`'s array-literal element derivation)
   *     returns its candidate BY REFERENCE, so `let r = Ok(1)` / `let xs = [r]`
   *     makes `xs`'s element the very object `resultBindings` recorded for
   *     `r`. A twin that did not inherit that membership would flip the read
   *     false and withhold `theta/parse/interpolated-result` for a `${…}` over
   *     the loop variable. Hence the CARRY below: it inherits the membership
   *     rather than severing it, and because it fires only where the copied
   *     object already carried the provenance it can restore no verdict beyond
   *     that object's own and can add no emission.
   *
   * Every VALUE-channel reader (`containsWithheldBinderType`,
   * `checkCompatible`, `displayType`) reads STRUCTURE, and `{ ...element }`
   * is value-equal to `element` by construction — same `kind`, same nested
   * fields — so no value-channel verdict can move either: the typed-`let` sink
   * (`theta/parse/let-rhs-type-mismatch`) judges a copied element exactly as
   * it judges the original.
   *
   * The copy is CONDITIONAL because marking is. Only an unproven iterand
   * reaches `this.unprovableBindings.add`, so a provable loop still records the
   * very object `unfoldAlias` handed it — no copy, no extra allocation, no
   * channel to inherit, no observable change on a provable path.
   *
   * The direction stays ONE-WAY. `unprovableBindings`'s only read feeds a
   * withholding decision (`checkFnCallArgs` skips its row on a hit), never an
   * emission, so changing WHICH object a mark lands on can only RESTORE a
   * true positive some unrelated binding's mark was suppressing — it cannot
   * fabricate an `E` no reader is owed.
   */
  private bindLoopElement(
    scope: Map<string, CompatType>,
    variable: string,
    element: CompatType,
    iterand: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const unproven = provableArgType(this, iterand, bindings) === undefined;
    const recorded: CompatType = unproven ? { ...element } : element;
    scope.set(variable, recorded);
    if (unproven) {
      this.unprovableBindings.add(recorded);
      if (this.resultBindings.has(element)) {
        this.resultBindings.add(recorded);
      }
    }
  }

  /**
   * Bind `names` in `scope` as WITHHELD locals — the binder classes this layer
   * cannot type, recorded so a body read STOPS at the scope the runtime binds
   * them in.
   *
   * The runtime installs a `for` variable, a `match` pattern binding and a `fn`
   * parameter in an inner scope unconditionally (`bindIterationVariable`,
   * `evalMatch`'s `armEnv.defineLocal`, `evalUserFnCall`'s `childFnActivation`
   * + per-parameter `defineLocal`, ../runtime/statement-executor.ts), and
   * expressions.md §"Identifier resolution" makes a local shadow everything
   * else lexically. A same-named OUTER record must therefore not stay visible
   * inside the body: judging a read against it judges a binding the position
   * never holds. The name is recorded even though its TYPE is past this layer's
   * static view — a `match` arm's per-arm narrowing and a parameter's
   * cross-call argument are not decidable from this file's text.
   *
   * TWO channels carry the withhold, because two kinds of consumer read this
   * map. The IDENTITY channel is `unprovableBindings`: `provableArgType`'s
   * `ident` arm withholds on the hit instead of proving the record the binder
   * hides, which is the fn-arg row's own discipline. The VALUE channel is the
   * name minted here — `WITHHELD_BINDER_TYPE_NAME`, which no declaration can
   * spell, so every sibling row that reads a type out of this map by VALUE
   * reaches its unresolvable-name arm rather than judging the read against a
   * schema that happens to share the binder's spelling.
   *
   * The sibling rows DO move, in the deferral direction: an in-scope read of
   * one of these binders no longer resolves to a same-named outer record, and
   * where the map previously missed, the minted spelling was judged nominally.
   * Both dispositions become deferrals. The rows whose verdict a withheld read
   * can flip without reaching an unresolvable-name arm withhold it explicitly
   * (`containsWithheldBinderType`); the emission direction is closed — no
   * sibling row reports on a withheld read.
   */
  private recordWithheldBinders(scope: Map<string, CompatType>, names: Iterable<string>): void {
    for (const name of names) {
      // Both channels are forgery-proof as of bug 0143 §Fix (b) route 1: the
      // IDENTITY channel (`unprovableBindings`, below) always was — an author
      // cannot forge object identity — and the VALUE channel now is too, since
      // `withheldBinderType()` is the only admitted mint of the `withheld`
      // marker `containsWithheldBinderType` tests. The single-object-per-
      // binder shape (one `withheld` object added to both the scope map and
      // the identity set) is unchanged.
      const withheld: CompatType = withheldBinderType();
      scope.set(name, withheld);
      this.unprovableBindings.add(withheld);
    }
  }

  /**
   * The scope a `match` arm's body is evaluated in: `bindings` plus that arm's
   * own pattern bindings, withheld. `evalMatch` evaluates the selected body in
   * `env.child()` with every pattern binding defined
   * (../runtime/statement-executor.ts; an identifier pattern binds the
   * scrutinee whatever its value, ../runtime/match-result.ts), so the walk of
   * an arm body, `provableArgType`'s reduction over arm bodies, AND
   * `checkMatchArmTypes`'s `armTypes` mapping (`walkExpr`'s `case "match"`,
   * bug 0145 §Fix) all resolve it through here — three readers disagreeing
   * about which binding an arm body reads was the scope mismatch this exists
   * to close, and now all three agree.
   *
   * A pattern binding nothing (a literal or a wildcard) yields `bindings`
   * unchanged, so the common arm copies no map.
   */
  public matchArmScope(
    pattern: PatternNode,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlyMap<string, CompatType> {
    const names = new Set<string>();
    collectPatternBinderNames(pattern, names);
    if (names.size === 0) {
      return bindings;
    }
    const scope = new Map(bindings);
    this.recordWithheldBinders(scope, names);
    return scope;
  }

  private walkFn(fn: FnDecl, bindings: Map<string, CompatType>): void {
    const fnScope = new Map(bindings);
    for (const p of fn.params) {
      if (p.type.length > 0 && !annotationSourceIsNotTypeExpression(p.type)) {
        fnScope.set(p.name, annotationToCompatType(p.type) ?? { kind: "named", name: p.type });
      } else {
        // An unannotated parameter carries no declared type, and a parameter
        // whose annotation derives from none of `Type`'s six alternatives
        // (bug 0124 §Fix) carries no verdict-supporting one — both still BIND
        // the name in the activation scope the body executes in
        // (`evalUserFnCall`). theta 1.0 has no closures, so a same-named
        // enclosing binding is not readable inside the body at all — recording
        // the parameter withheld keeps a body read from resolving to it OR
        // from a judgement the refused text does not support.
        this.recordWithheldBinders(fnScope, [p.name]);
      }
    }
    // FN-6 (bug 0005 (c)) — a `subagent fn` body is a subagent session whose
    // failure channel is the boundary `Err`: a body `?` sits in the same
    // position as a subagent-mode `.theta` body's top-level `?`, where it is
    // legal. `): T` on a `subagent fn` declares the Ok PAYLOAD `T` (the
    // `invoke<T>` analogue, matching the annotation-less inference), not a
    // plain return type — so the body is a Result scope for the `?` check
    // regardless of annotation, and only a plain `fn`'s annotation gates `?`
    // on Result-compatibility.
    //
    // A return annotation deriving from none of `Type`'s six alternatives
    // (bug 0124 §Fix) is ABSENT to this computation — the same neutral
    // `{ kind: "inferred" }` an annotation-less `fn` gets, and the same
    // absent-treatment the parameter loop above gives a refused parameter
    // type. Reading it either way is a verdict derived from text that names
    // no type: `isResultAnnotation`'s `/^Result\b/` GRANTS Result
    // compatibility to `Result--`, and treating the refused text as a
    // declared non-`Result` return type makes `?` in the body draw
    // `question-outside-result-fn` BESIDE the refusal — the refusal plus a
    // sibling verdict derived from the junk that §Fix (f)(1) forbids, whose
    // own paradigm case (`let a: integer-- = 3` with `for x in a` drawing
    // both the refusal and the false `non-array-iterand`) is this same shape.
    // The withhold's direction stays closed: a withheld read defers, it never
    // reports.
    const returnScope: EnclosingReturnScope =
      fn.returnType === null ||
      fn.subagent ||
      annotationSourceIsNotTypeExpression(fn.returnType)
        ? { kind: "inferred" }
        : { kind: "annotated", resultCompatible: isResultAnnotation(fn.returnType) };

    // An annotation-less `fn` infers its return type as the LUB of its
    // contributions; contributions sharing no common upper bound surface
    // `theta/parse/return-no-common-type` (owned V3d).
    if (fn.returnType === null) {
      const contributions = this.collectReturnContributions(fn.body, fnScope);
      const resolved = resolveReturnType({
        contributions,
        hasQuestion: this.bodyHasQuestion(fn.body),
        env: this.env,
        site: { file: this.file, range: fn.range },
      });
      if (resolved.kind === "inference-no-common-type") {
        this.diagnostics.push(resolved.diagnostic);
      }
    } else if (fn.subagent) {
      this.checkSubagentReturnAnnotation(fn, fn.returnType, fnScope);
    }

    this.walkBlock(fn.body, fnScope, { returnScope });
  }

  /**
   * Validate an annotated `subagent fn`'s return annotation against the
   * INFERRED Ok payload (bug 0005 (c)). The same FN-3 payload-level inference
   * an annotation-less body gets runs first; the resolved payload is then
   * checked `⊑ annotation` through the existing `invoke<Schema>` typed-return
   * machinery (`checkInvokeReturnType`), reusing
   * `theta/parse/invoke-return-type-mismatch` — FN-6 explicitly equates the
   * subagent-fn boundary with `invoke`, and `): T` is the `invoke<T>`
   * analogue, so the invoke row covers this slot rather than coining a
   * parallel code. Conservative by construction, never a crash and no false
   * positive: a statically-unresolvable payload (a query / unresolved-call
   * tail — a `named` reference past the parser's static view) makes the `⊑`
   * relation answer `"unknown"` and no diagnostic fires (the runtime AJV
   * boundary check is the net); a contribution set with no common upper bound
   * is left to the annotation (FN-3: an explicit annotation bypasses
   * inference) rather than re-flagged as `return-no-common-type`.
   */
  private checkSubagentReturnAnnotation(
    fn: FnDecl,
    returnType: string,
    fnScope: ReadonlyMap<string, CompatType>,
  ): void {
    if (annotationSourceIsNotTypeExpression(returnType)) {
      // Text deriving from none of `Type`'s six alternatives supports no
      // boundary verdict. This slot reads an annotation DIRECTLY, with no
      // derived carrier between it and the text, so the absence invariant
      // (`annotationSourceIsNotTypeExpression`) has to be established here
      // rather than inherited — and before the conversion rather than after
      // it, since the return slot has no unannotated form whose branch the
      // refused text could take instead.
      return;
    }
    const annotation = annotationToCompatType(returnType);
    if (annotation === undefined) {
      return;
    }
    const resolved = resolveReturnType({
      contributions: this.collectReturnContributions(fn.body, fnScope),
      hasQuestion: this.bodyHasQuestion(fn.body),
      env: this.env,
      site: { file: this.file, range: fn.range },
    });
    if (resolved.kind !== "inferred") {
      return;
    }
    // A payload inferred from a WITHHELD read is not a payload this layer knows:
    // the boundary check is the same structural relation as the typed-`let`
    // sink's, so the same withhold applies (an unannotated parameter returned
    // from the body is the reachable shape).
    if (containsWithheldBinderType(resolved.inferred.payload)) {
      return;
    }
    this.diagnostics.push(
      ...checkInvokeReturnType({
        callee: fn.name,
        calleeResolvable: true,
        schema: annotation,
        calleeReturn: resolved.inferred.payload,
        env: this.env,
        site: { file: this.file, range: fn.range },
      }),
    );
  }

  /**
   * Collect the return contributions of a `fn` body: every `return` operand and
   * the body's tail expression, each projected to a `plain` or `result`
   * contribution. `?`-bearing and `Result`-constructor operands contribute a
   * `result` (their success payload), everything else a `plain` type.
   */
  private collectReturnContributions(
    block: Block,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReturnContribution[] {
    const out: ReturnContribution[] = [];
    const visitBlock = (b: Block): void => {
      for (const s of b.statements) {
        visitStmt(s);
      }
      if (b.tail !== null) {
        out.push(this.contributionOf(b.tail, bindings));
      }
    };
    const visitStmt = (s: Stmt): void => {
      switch (s.kind) {
        case "return":
          if (s.operand !== null) {
            out.push(this.contributionOf(s.operand, bindings));
          }
          return;
        case "if":
          visitBlock(s.then);
          if (s.otherwise !== null) {
            if ("statements" in s.otherwise) {
              visitBlock(s.otherwise);
            } else {
              visitStmt(s.otherwise);
            }
          }
          return;
        case "while":
          visitBlock(s.body);
          return;
        case "for":
          visitBlock(s.body);
          return;
        default:
          // A nested `fn` owns its own return inference; do not descend into it.
          return;
      }
    };
    visitBlock(block);
    return out;
  }

  private contributionOf(
    expr: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReturnContribution {
    if (expr.kind === "query" || expr.kind === "try" || expr.kind === "result-ctor") {
      return { kind: "result", payload: this.typeOf(expr, bindings) };
    }
    return { kind: "plain", type: this.typeOf(expr, bindings) };
  }

  /** Whether a `fn` body bears a `?` anywhere (forcing a `Result` return wrap). */
  private bodyHasQuestion(block: Block): boolean {
    let found = false;
    const visitExpr = (e: Expr): void => {
      if (found) {
        return;
      }
      if (e.kind === "try") {
        found = true;
        return;
      }
      if (e.kind === "block") {
        // `childExprs` has no `"block"` arm (its own leaf default), so a `?`
        // nested in a `let`-RHS / match-arm-body block's own statements would
        // otherwise go unseen; descend through the SAME `visitBlock` this
        // scan already drives its top-level walk through.
        visitBlock(e.body);
        return;
      }
      for (const child of childExprs(e)) {
        visitExpr(child);
      }
    };
    const visitBlock = (b: Block): void => {
      for (const s of b.statements) {
        for (const e of stmtExprs(s)) {
          visitExpr(e);
        }
        for (const nested of stmtBlocks(s)) {
          visitBlock(nested);
        }
      }
      if (b.tail !== null) {
        visitExpr(b.tail);
      }
    };
    visitBlock(block);
    return found;
  }

  /**
   * Infer a body's final-value payload — the tail/`return` LUB `resolveReturnType`
   * computes — without checking it against any annotation. `inferCalleeReturnPayload`
   * (module-level, below) is the sole caller: it runs this SAME resolution
   * `checkSubagentReturnAnnotation` uses for an in-file `subagent fn`, over a
   * whole parsed `.theta` body instead of one `fn`'s. The `site` passed to
   * `resolveReturnType` is a placeholder — its only consumer is a discarded
   * no-common-type diagnostic this call site never reads.
   */
  public inferFinalValuePayload(
    body: Block,
    bindings: ReadonlyMap<string, CompatType>,
  ): CompatType | undefined {
    const resolved = resolveReturnType({
      contributions: this.collectReturnContributions(body, bindings),
      hasQuestion: this.bodyHasQuestion(body),
      env: this.env,
      site: { file: this.file, range: placeholderSiteRange() },
    });
    if (resolved.kind !== "inferred") {
      return undefined;
    }
    if (containsWithheldBinderType(resolved.inferred.payload)) {
      return undefined;
    }
    return resolved.inferred.payload;
  }

  /** The boolean-position check for an `if` / `while` condition. */
  private checkBoolean(
    condition: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    this.diagnostics.push(
      ...checkBooleanPosition({
        operandType: this.typeOf(condition, bindings),
        site: { file: this.file, range: condition.range },
      }),
    );
  }

  /**
   * The array-literal check every sink dispatch shares (`sinkedArrayOf`'s
   * caller, `checkFnCallArgs`, `checkObjectField`), and the one place
   * `grammar.md:230`'s fourth sink bullet is wired: an array-typed sink's
   * element type is itself a sink for a nested array literal. Returns every
   * node this call judged — `array` itself when a sink is in scope (including
   * on the withheld-binder early return below, since a caller marks that node
   * skipped whether or not the check actually ran), plus, recursively, the
   * nested literals the descent reached — so `walkExpr`'s `case "array"` does
   * not judge any of them sink-less (bug 0156 §Fix constraint 2). Where this
   * level's own check reported, the nested literals are still returned but
   * carry no verdict: an in-scope sink covers them either way, and only the
   * derived verdict is withheld (see the refusal arm below).
   */
  private checkArrayLiteral(
    array: ArrayExpr,
    sink: CompatType | undefined,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlySet<Expr> {
    const judged = new Set<Expr>();
    if (sink !== undefined) {
      judged.add(array);
    }
    const branches = array.elements.map((e) => this.typeOf(e, bindings));
    // One branch read out of a WITHHELD binder withholds the whole check: the
    // element sink decides each branch through the same structural TYPE-7 arm
    // that cannot defer on an unresolvable name, and the row reports the FIRST
    // failing branch by index, so there is no per-branch skip to hand the
    // byte-frozen checker instead.
    if (branches.some((branch) => containsWithheldBinderType(branch))) {
      return judged;
    }
    const own = checkCommonType({
      branches,
      sink,
      env: this.env,
      site: { file: this.file, range: array.range },
    });
    this.diagnostics.push(...own);
    if (sink === undefined || own.length > 0) {
      // One verdict per literal (bug 0129's law): where this call already
      // refused the literal, an element verdict derived from re-reading the
      // same text as conformant would stand beside it, which is exactly the
      // second diagnostic that law withholds. No sink also stops here — an
      // unsunk literal has nothing to unfold and descend through.
      if (sink !== undefined) {
        // Withholding a verdict is NO verdict, not a sink-LESS one: this sink
        // stays in scope at every nested position down the element chain
        // (`grammar.md:230`), so `theta/parse/array-no-common-type`'s
        // registered *Trigger* — "and no sink to narrow against" — is false
        // there and the sink-less route must not run on those nodes either.
        this.markNestedArrayLiterals(array, judged);
      }
      return judged;
    }
    // Unfold before classifying and keep the RAW `sink` for the message above,
    // the shape bug 0157 landed for the three dispatches (§Fix constraint 1):
    // an alias-spelled element sink admits on the same footing as an inline one.
    const unfolded = unfoldAlias(sink, this.env);
    if (unfolded.kind !== "array") {
      return judged;
    }
    for (const element of array.elements) {
      if (element.kind === "array") {
        for (const node of this.checkArrayLiteral(element, unfolded.element, bindings)) {
          judged.add(node);
        }
      }
    }
    return judged;
  }

  /**
   * The judging descent's traversal with the verdict removed: adds every array
   * literal reachable from `array` down the array-ELEMENT chain to `into`
   * without checking any of them, so `walkExpr`'s `case "array"` stays silent
   * on nodes an enclosing sink covers but no call judged.
   *
   * Array elements ONLY, matching the descent above step for step: a literal
   * sitting inside an object-literal field value or a call argument reaches its
   * own sink route (`checkObjectField`, `checkFnCallArgs`) or none at all, and
   * marking it here would silence a refusal that route owes.
   */
  private markNestedArrayLiterals(array: ArrayExpr, into: Set<Expr>): void {
    for (const element of array.elements) {
      if (element.kind === "array") {
        into.add(element);
        this.markNestedArrayLiterals(element, into);
      }
    }
  }

  /**
   * The array node already checked against a binding-annotation element sink,
   * and that sink's (alias-unfolded) element type; `null` when `stmt` is not
   * a typed-array `let`. Unfolds `annotation` rather than trusting its raw
   * `kind`: an alias-spelled sink has raw kind `named`, and TYPE-11 makes it
   * the same type as its right-hand side wherever a `⊑` question is asked.
   */
  private sinkedArrayOf(
    stmt: Stmt,
    annotation: CompatType | undefined,
  ): { readonly node: ArrayExpr; readonly element: CompatType } | null {
    if (stmt.kind !== "let" || stmt.init === null || stmt.init.kind !== "array") {
      return null;
    }
    const unfolded = annotation === undefined ? undefined : unfoldAlias(annotation, this.env);
    if (unfolded === undefined || unfolded.kind !== "array") {
      return null;
    }
    return { node: stmt.init, element: unfolded.element };
  }

  /**
   * The type-phase field-value check for a schema-constructor field
   * (`Schema { field: expr, … }`, `walkExpr`'s `object` arm). Runs only when
   * `e.typeName` resolves in `this.env` to an object-schema declaration
   * carrying a declared field list — an unresolved or non-constructible name
   * (bug 0025's territory) and an alias-form schema (fieldless by
   * construction) both keep the check silent, and a bare `{ … }` literal
   * (`typeName === null`) has no declaration to resolve at all. Checks run
   * over the intersection of the literal's fields and the declaration's
   * fields: an undeclared field and an omitted declared field keep reporting
   * through `checkObjectExpr`'s presence gates alone
   * (`theta/parse/extra-object-field` / `theta/parse/missing-object-field`),
   * so a mistyped extra field is not double-reported. The walk still recurses
   * into every field value afterwards, exactly as before this check existed.
   */
  private checkObjectFields(
    e: Expr & { kind: "object" },
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
  ): void {
    const typeName = e.typeName;
    const declaredFields = typeName === null ? undefined : this.declaredFieldsOf(typeName);
    for (const field of e.fields) {
      let skipArrays: ReadonlySet<Expr> = NO_SUNK_ARRAYS;
      // Own-key lookup: a theta field name may collide with an
      // `Object.prototype` member (`toString`, `constructor`, …), and the
      // record must never answer through the prototype chain and manufacture a
      // declared type for a field the schema does not declare.
      const declared =
        declaredFields !== undefined && Object.hasOwn(declaredFields, field.name)
          ? declaredFields[field.name]
          : undefined;
      if (typeName !== null && declared !== undefined) {
        skipArrays = this.checkObjectField(typeName, field, declared, bindings);
      }
      this.walkExpr(field.value, bindings, flow, skipArrays);
    }
  }

  /**
   * `typeName`'s declared field-type record, or `undefined` when it does not
   * resolve in `this.env` to an object-schema declaration carrying one.
   */
  private declaredFieldsOf(
    typeName: string,
  ): Readonly<Record<string, CompatType>> | undefined {
    const decl = resolveNamed(this.env, typeName);
    if (decl === undefined || decl.kind !== "object-schema") {
      return undefined;
    }
    return decl.fields;
  }

  /**
   * The field-TYPE half of bug 0226 §Fix: a `match` object-pattern head's
   * LISTED literal sub-patterns are judged against the head's declared field
   * types, through the SAME `checkObjectFieldCompat` relation
   * `checkObjectField` above routes at the constructor position. Recurses
   * into object field sub-patterns, array elements and constructor inners
   * (mirroring the field-NAME half's recursion, `checkPatternObjectFields`,
   * theta-document.ts), so a nested head is reached too.
   *
   * Only `sub.kind === "literal"` fields are judged: a shorthand or
   * identifier binder carries no literal to compare, and a nested object /
   * array / constructor sub-pattern is reached by the recursion, not by this
   * check. `checkObjectFieldCompat`'s WHOLE result is kept: it answers at
   * most one code per field (`theta/parse/object-field-type-mismatch` for a
   * two-way incompatibility, `theta/parse/integer-narrowing` for TYPE-2's
   * one-way `number`-under-`integer` case), so keeping both admits whichever
   * one the relation computes without ever emitting two for the same field
   * (code-registry-parse.md §"integer-narrowing", §"object-field-type-mismatch";
   * expressions.md §"Object/schema patterns").
   */
  private checkPatternFieldTypes(pattern: PatternNode): void {
    switch (pattern.kind) {
      case "wildcard":
      case "identifier":
      case "literal":
        return;
      case "constructor":
        this.checkPatternFieldTypes(pattern.inner);
        return;
      case "array":
        for (const element of pattern.elements) {
          this.checkPatternFieldTypes(element);
        }
        return;
      case "object": {
        const typeName = pattern.typeName;
        const declaredFields = typeName === null ? undefined : this.declaredFieldsOf(typeName);
        if (typeName !== null && declaredFields !== undefined) {
          for (const field of pattern.fields) {
            const sub = field.pattern;
            if (sub.kind !== "literal") {
              continue;
            }
            // Own-key lookup (same reason `checkObjectFields` above states): a
            // theta field name may collide with an `Object.prototype` member,
            // and the record must never answer through the prototype chain.
            const declared =
              Object.hasOwn(declaredFields, field.name) ? declaredFields[field.name] : undefined;
            if (declared === undefined) {
              continue;
            }
            this.diagnostics.push(
              ...checkObjectFieldCompat({
                schema: typeName,
                field: field.name,
                declared,
                value: patternLiteralType(sub.value, sub.numericType),
                env: this.env,
                site: { file: this.file, range: pattern.range },
              }),
            );
          }
        }
        for (const field of pattern.fields) {
          this.checkPatternFieldTypes(field.pattern);
        }
        return;
      }
    }
  }

  /**
   * One constructor field's value against its declared type. A `result-ctor`
   * value (`Ok(...)` / `Err(...)`) is rejected outright — every declared
   * field type is lowerable (`theta/parse/result-in-schema-position` makes a
   * `Result`-typed field undeclarable), so a `Result` value is incompatible
   * with whatever the field declares even though `checkCompatible` alone
   * answers `"unknown"` for it. Otherwise routes the compatibility outcome
   * the way `checkLetRhsCompat` does. When the value is an array literal and
   * the declared type UNFOLDS (TYPE-11) to `array<T>`, also checks it against
   * the unfolded element type as a sink and returns every node that check
   * judged (the value itself and any nested literal the descent reached), so
   * the caller skips the generic sink-less array check on each; otherwise
   * returns the empty set.
   */
  private checkObjectField(
    schema: string,
    field: ObjectFieldNode,
    declared: CompatType,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlySet<Expr> {
    const value = field.value;
    const valueType = this.typeOf(value, bindings);
    // Same withhold discipline as the typed-`let` sink: a field value read out
    // of a WITHHELD binder supports no verdict, and a declared `array<T>` or
    // inline-object field type would be decided structurally.
    if (!containsWithheldBinderType(valueType)) {
      this.diagnostics.push(
        ...checkObjectFieldCompat({
          schema,
          field: field.name,
          declared,
          value: valueType,
          env: this.env,
          site: { file: this.file, range: value.range },
          forceIncompatible: value.kind === "result-ctor",
        }),
      );
    }
    // Unfolds `declared` (TYPE-11) before classifying it: `checkObjectFieldCompat`
    // above keeps reading the RAW `declared`, so its `<expected>` still names `U`.
    const unfoldedDeclared = unfoldAlias(declared, this.env);
    if (value.kind === "array" && unfoldedDeclared.kind === "array") {
      return this.checkArrayLiteral(value, unfoldedDeclared.element, bindings);
    }
    return NO_SUNK_ARRAYS;
  }

  /**
   * The parse-time counterpart of the runtime's `resolveUserFn`
   * (`../runtime/statement-executor.ts`): decide whether `e`'s callee is a
   * user `fn` this file can judge, and when it is, check each argument the
   * callee declares a parameter type for (TYPE-9,
   * `theta/parse/fn-arg-type-mismatch`). Every arm below either resolves the
   * question and returns, or falls through to the next — never both, so the
   * resolution is total over `e.callee` with no silent fall-through.
   *
   * Bug 0156's fix (§Fix Route A): a function parameter's declared type is
   * the array literal's SECOND element sink in `grammar.md`'s exhaustive
   * three-bullet list — the same footing as the binding-annotation sink
   * (`walkExpr`'s typed-`let` arm, via `sinkedArrayOf`) and the
   * constructor-field sink (`checkObjectField`). The return value names which
   * of `e.args` this call already ran through `checkArrayLiteral` against
   * that sink, so the caller (`walkExpr`'s `case "call"`) does not re-check a
   * sunk literal sink-less — resolved ONCE here rather than re-derived in the
   * walk. The fourth bullet, recursive descent into an array-typed sink's
   * OWN element, is not wired at this or any other route and is not this
   * change's claim.
   */
  private checkFnCallArgs(
    e: CallExpr,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlySet<Expr> {
    // A per-call, per-argument answer: two calls of the same `fn` in one
    // document must each narrow their own literal, never a slot shared
    // across invocations.
    const sunkArgs = new Set<Expr>();
    if (this.shadowedNames.has(e.callee)) {
      // expressions.md §"Identifier resolution": a local binding (arm 1)
      // outranks a top-level `fn` (arm 2), so a call of a locally-bound name
      // is never a user-`fn` call at this site.
      return sunkArgs;
    }
    if (this.importedSymbols.has(e.callee)) {
      // A permanent, by-design silence at THIS seam, not a dropped route: a
      // single-file parse carries no imported `fn`'s parameter types, and
      // never will under bug 0138's settled disposition (Route 2) — the
      // registry Trigger names a same-file OR imported `.thetalib` function
      // call, and the imported half is judged at the LOAD pass instead, where
      // the resolved library already exists as a parsed document
      // (`checkImportedFnCallArgs`, ../extension/invoke-static-checks.ts,
      // wired once per importing theta from `checkThetaImports`,
      // ../extension/import-static-checks.ts). This arm keeps returning
      // because the operand stays past THIS pass's static view even though
      // the pipeline resolves it a few hundred lines later in the same run.
      return sunkArgs;
    }
    const fn = this.fnDecls.get(e.callee);
    if (fn === undefined) {
      // A `.theta`-callable call, a Pi-tool call, or an unresolved name —
      // none is a user `fn`, and each has its own owning diagnostic
      // (`tool-arg-type-mismatch`, `invoke-arg-type-mismatch`, or
      // `unknown-identifier`).
      return sunkArgs;
    }
    if (!this.checkFnCallArity(fn, e)) {
      return sunkArgs;
    }
    this.checkFnCallArgLoop(fn, e, bindings, sunkArgs);
    return sunkArgs;
  }

  /** Check arity before argument types; return false only when arity diagnostics fire. */
  private checkFnCallArity(fn: FnDecl, e: CallExpr): boolean {
    // Bug 0131 §(c): a parameter list holding a name no `Ident` derives (a
    // capture artefact left by the `fn-param-not-identifier` recovery, bug
    // 0225) carries a count the author never wrote, so the arity verdict is
    // withheld entirely — the same discipline the registry states for a
    // refused parameter ANNOTATION being absent from the callee's parameter
    // table. Falls through to the per-argument loop unchanged so 0225's own
    // row stays the only diagnostic this callee draws.
    const paramsAreIdents = fnParamNamesAreIdentifiers(fn.params);
    if (paramsAreIdents) {
      // Bug 0131 §(c): arity is decided BEFORE per-argument type
      // (invocation.md §Argument arity) — the same
      // `if (arityDiags.length > 0) return arityDiags;` order `checkInvokeCall`
      // uses (invoke-diagnostics.ts) — so a mis-arity call draws the arity row
      // alone and never reaches the per-argument loop below.
      const arityDiags = checkFnCallArity({
        name: fn.name,
        requiredCount: fn.params.length,
        providedCount: e.args.length,
        site: { file: this.file, range: e.range },
      });
      if (arityDiags.length > 0) {
        this.diagnostics.push(...arityDiags);
        return false;
      }
    }
    return true;
  }

  /** Check matched arguments and record array literals checked against parameter sinks. */
  private checkFnCallArgLoop(
    fn: FnDecl,
    e: CallExpr,
    bindings: ReadonlyMap<string, CompatType>,
    sunkArgs: Set<Expr>,
  ): void {
    // The shared annotation-guard preamble (`fnCallJudgedArgSlots`,
    // annotation-compat.ts) reads the callee's `FnParam` list out of
    // `fnDecls`, which carries the declaration verbatim rather than a
    // projected type, so the absence invariant
    // (`annotationSourceIsNotTypeExpression`) is established there; a reader
    // of `fnScope` inherits it instead.
    for (const { index: i, param: p, paramType, arg } of fnCallJudgedArgSlots(fn.params, e.args)) {
      const argType = provableArgType(this, arg, bindings);
      if (argType !== undefined) {
        // Withheld only when the whole-argument reduction is unprovable
        // (`provableArgType`) — the element sink below must still run in
        // that case, so this guards the push alone rather than skipping the
        // rest of the index (bug 0156's pinned row a1: the reduction is
        // unprovable and the whole-argument judgement withholds, but the
        // union sink is still in scope for rule 3).
        this.diagnostics.push(
          ...checkFnArgCompat({
            fnName: fn.name,
            index: i,
            paramName: p.name,
            paramType,
            argType,
            env: this.env,
            site: { file: this.file, range: arg.range },
          }),
        );
      }
      // Unfolds (TYPE-11) before classifying, the law bug 0157 landed for the
      // two wired dispatches: an alias-spelled union parameter must admit on
      // the same footing as one spelled inline. Diagnostic order is
      // outer-code-then-element-code, mirroring the typed-`let` arm's
      // `checkLetRhsCompat` → `checkArrayLiteral` sequencing, because the push
      // above already ran for this index.
      const unfolded = unfoldAlias(paramType, this.env);
      if (arg.kind === "array" && unfolded.kind === "array") {
        for (const node of this.checkArrayLiteral(arg, unfolded.element, bindings)) {
          sunkArgs.add(node);
        }
      }
    }
  }

  private walkExpr(
    e: Expr,
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
    sunkArrays: ReadonlySet<Expr> = NO_SUNK_ARRAYS,
  ): void {
    switch (e.kind) {
      case "ternary":
        this.diagnostics.push(
          ...checkBooleanPosition({
            operandType: this.typeOf(e.condition, bindings),
            site: { file: this.file, range: e.condition.range },
          }),
        );
        this.walkExpr(e.condition, bindings, flow);
        this.walkExpr(e.consequent, bindings, flow);
        this.walkExpr(e.alternate, bindings, flow);
        return;
      case "binary":
        checkBinaryOperands(this, e, bindings);
        this.walkExpr(e.left, bindings, flow);
        this.walkExpr(e.right, bindings, flow);
        return;
      case "try":
        checkQuestion(this, e.operand, e.range, bindings, flow);
        this.walkExpr(e.operand, bindings, flow);
        return;
      case "array":
        if (!sunkArrays.has(e)) {
          this.checkArrayLiteral(e, undefined, bindings);
        }
        // The set rides the element recursion: a nested literal the enclosing
        // sink descended into is reached from HERE, and dropping the set on
        // this call is the sink-less re-judgement the descent exists to avoid.
        for (const el of e.elements) {
          this.walkExpr(el, bindings, flow, sunkArrays);
        }
        return;
      case "index":
        checkIndex(this, e, bindings);
        this.walkExpr(e.target, bindings, flow);
        this.walkExpr(e.index, bindings, flow);
        return;
      case "match":
        // bug 0145 §Fix (a) route 1: the LUB reader must resolve the SAME scope
        // for an arm body as the arm-body walk six lines below — both were
        // reading `arm.body` under the ENCLOSING `bindings` and only the walk
        // was arm-scoped, so `checkMatchArmTypes` judged a body against a
        // same-named outer binding's type instead of the arm's own binder.
        this.diagnostics.push(
          ...checkMatchArmTypes({
            armTypes: e.arms.map((arm) =>
              this.typeOf(arm.body, this.matchArmScope(arm.pattern, bindings)),
            ),
            sink: undefined,
            env: this.env,
            site: { file: this.file, range: e.range },
          }).diagnostics,
        );
        this.walkExpr(e.scrutinee, bindings, flow);
        for (const arm of e.arms) {
          // The field-TYPE half (bug 0226 §Fix) judges the head's LISTED
          // literal fields before the body walk, the same ordering the
          // parse-phase field-NAME half uses (theta-document.ts's `case
          // "match"`) — neither reads the body's scope, so ordering has no
          // observable effect beyond keeping the two halves' call sites
          // parallel to read.
          this.checkPatternFieldTypes(arm.pattern);
          // Each body is walked in ITS OWN arm scope: the runtime installs that
          // arm's pattern bindings before the body runs, so a same-named
          // enclosing record is not what the body reads.
          this.walkExpr(arm.body, this.matchArmScope(arm.pattern, bindings), flow);
        }
        return;
      case "method-call":
        checkMethodCall(this, e, bindings);
        this.walkExpr(e.target, bindings, flow);
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "member":
        checkMemberAccess(this, e, bindings);
        this.walkExpr(e.target, bindings, flow);
        return;
      case "call": {
        // Consumed once: `checkFnCallArgs` already decided, per argument,
        // whether a parameter-supplied element sink narrowed it (bug 0156's
        // fix). Re-deriving that decision here instead of reading it back
        // would risk drifting from the check that actually ran.
        const sunkArgs = this.checkFnCallArgs(e, bindings);
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow, sunkArgs);
        }
        // RFC 0009: the clause values walk with the ordinary posture — they are
        // no `fn` parameter slot, so `checkFnCallArgs`' per-argument element
        // sink does not extend to them (the clause carries no clause arm in
        // that check by design; invocation.md INV-8's rejection is the load
        // pass's, never an fn-kind resolution's).
        for (const value of callWithClauseValues(e)) {
          this.walkExpr(value, bindings, flow);
        }
        return;
      }
      case "invoke":
        // `invoke` shares this arm's label with `call` in the grammar but not
        // in the registry: it carries its own row
        // (`theta/parse/invoke-arg-type-mismatch`) and its own, separately
        // unwired emitter — a different open defect this walk does not fix.
        for (const arg of [...e.args, ...callWithClauseValues(e)]) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "object":
        this.checkObjectFields(e, bindings, flow);
        return;
      case "result-ctor":
        this.walkExpr(e.arg, bindings, flow);
        return;
      case "par-for":
        this.checkParFor(e, bindings, flow);
        return;
      case "query": {
        // Derive the interpolation expressions once (PTQ-1282); both passes
        // below consume the same lex-then-parse result.
        const interpolations = parseQueryInterpolations(e);
        checkQueryInterpolationResults(this, e, interpolations, bindings);
        // Bug 0345 §Fix: appended AFTER the Result-classification call above, not
        // in place of it, so an interpolation that is both a `Result` and an
        // operand violation draws `theta/parse/interpolated-result` (pushed
        // above) BEFORE the operand code (pushed below) — the deliberate
        // ordering the bug doc records.
        checkQueryInterpolationOperands(this, e, interpolations, bindings);
        return;
      }
      case "block":
        // Descend into the block's own body so a nested `type`-phase
        // diagnostic still surfaces (bug 0082 §Fix), over a COPY of
        // `bindings` so a name the block's own `let`s bind does not leak into
        // the enclosing scope's later reads — mirrors the `par-for` arm's
        // `inner` copy above.
        this.walkBlock(e.body, new Map(bindings), flow);
        return;
      case "ident":
      case "number":
      case "string":
      case "bool":
      case "null":
        // Leaves: no nested checks.
        return;
      default: {
        // Compile-time exhaustiveness backstop: a future `Expr` union member
        // trips a `tsc` error here rather than being silently skipped by this
        // pass while the binder collector's `walkExprForLocalBinders`
        // (local-binders.ts) handles it — the two walks must classify the same
        // expression kinds in lockstep.
        const _exhaustive: never = e;
        return void _exhaustive;
      }
    }
  }

  /** Check the par-for iterand and max, then walk its body with the loop binding. */
  private checkParFor(
    e: Expr & { kind: "par-for" },
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
  ): void {
    const rawIterandType = this.typeOf(e.iterand, bindings);
    checkIterand(
      rawIterandType,
      { file: this.file, range: e.iterand.range },
      this.env,
      this.diagnostics,
    );
    this.walkExpr(e.iterand, bindings, flow);
    // The `max` operand is an integer sink: a fractional / `number` operand
    // narrows to the existing `theta/parse/integer-narrowing` diagnostic.
    if (e.max !== null) {
      const maxType = this.typeOf(e.max, bindings);
      const r = checkCompatible(maxType, { kind: "prim", name: "integer" }, this.env);
      if (r === "integer-narrowing") {
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/integer-narrowing",
          file: this.file,
          range: e.max.range,
          message: "cannot narrow number to integer",
        });
      } else if (r === "incompatible") {
        // CTRL-2: the `max` operand contract is "any `integer`-typed
        // expression" — a statically-resolvable-incompatible type (string,
        // boolean, null, non-integer-compatible union, …) is a load
        // refusal beside the narrowing arm. `unknown` keeps deferring (no
        // push here), matching the type layer's documented posture.
        this.diagnostics.push({
          severity: "error",
          code: "theta/parse/non-integer-max",
          file: this.file,
          range: e.max.range,
          message: `'par for' max operand must be integer-typed; got ${displayType(maxType)}`,
        });
      }
      this.walkExpr(e.max, bindings, flow);
    }
    // Bind the fresh immutable loop variable to the iterand element type so
    // body checks resolve it, then walk the body. TYPE-11: an alias of
    // `array<T>` supplies the same element as `array<T>` itself, so the
    // iterand is unfolded again here, independently of the admissibility
    // gate above — this is its own `kind === "array"` test, over the
    // element rather than the whole iterand.
    const iterandType = unfoldAlias(this.typeOf(e.iterand, bindings), this.env);
    const inner = new Map(bindings);
    const elementType: CompatType =
      iterandType.kind === "array" ? iterandType.element : { kind: "named", name: "unknown" };
    this.bindLoopElement(inner, e.variable, elementType, e.iterand, bindings);
    this.walkBlock(e.body, inner, flow);
    return;
  }
}

export { TypeLayerWalk };
