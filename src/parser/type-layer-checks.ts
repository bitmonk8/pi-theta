// V20c — type-layer diagnostics production wiring.
//
// This module wires the existing `type`-phase checkers (Bucket A: "checkers now
// feedable") to the `V20b` whole-program static-type substrate so they run in
// production. Before this leaf the checkers existed but were never fed a
// per-expression static type in the whole-file parse, so a well-formed-but-ill-
// typed body silently type-checked; this pass walks the parsed `V19a` body,
// asks the `V20b` `StaticTypeInferencePass` for each relevant expression's
// static type (threading a `let`-binding scope so identifier receivers /
// operands resolve), and feeds the checkers, aggregating their diagnostics.
//
// It closes no new spec REQ-ID: each diagnostic is an integration realisation of
// a code-keyed area owned on its original leaf —
//   * `theta/parse/non-boolean-condition` (cka-4, V3a),
//   * `theta/parse/non-array-iterand` (cka-5, V3c),
//   * `theta/parse/question-on-non-result` / `theta/parse/question-outside-result-fn` (V4a),
//   * `theta/parse/array-no-common-type` (V3a), `theta/parse/return-no-common-type` (V3d),
//   * `theta/parse/integer-narrowing` (V2b), `theta/parse/match-arm-type-mismatch` (V4a),
//   * `theta/parse/non-indexable-receiver` (V3a), `theta/parse/non-string-object-index` (V3h),
//   * `theta/parse/non-string-array-join` (V3g),
//   * `theta/parse/mixed-plus-operands` (A5) / `theta/parse/non-orderable-operands`
//     (A6) — the `+` / ordering operand-type checks (expressions.md §"`+`
//     operator", §"Ordering comparisons"),
//   * `theta/parse/unknown-method` (A2) — a member / method access on a built-in
//     receiver type outside the theta 1.0 stdlib surface (expressions.md
//     §"Built-in methods and properties").
//
// A5 / A6 / A2 fire ONLY when the operand / receiver static type is concretely
// resolvable. An operand past the parser's static view (an unresolved
// `NamedType`, a sentinel reference) is left unclassified and deferred to the
// runtime safety net — no `type`-phase diagnostic — mirroring the
// `let-rhs-type-mismatch` "statically resolvable" guard so no valid theta is
// wrongly rejected.
//
// The wiring is constructor-free and holds no module-level mutable state: it
// builds a fresh `V20b` pass, type environment, and binding scope per parse.
//
// Spec (narrative): expressions.md, control-flow.md, functions.md,
// type-system.md, runtime-value-model.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  ArrayExpr,
  Block,
  Expr,
  FnDecl,
  IfStmt,
  ObjectFieldNode,
  SchemaFieldSource,
  ThetaBody,
  Stmt,
} from "./theta-document";
import {
  checkCompatible,
  checkCommonType,
  checkLetRhsCompat,
  checkObjectFieldCompat,
  displayType,
  resolveNamed,
  type CompatType,
  type NamedDecl,
  type PrimitiveName,
  type TypeEnv,
} from "./type-compat";
import { StaticTypeInferencePass } from "./static-type-inference";
import {
  checkBooleanPosition,
  checkIndexReceiver,
} from "../runtime/expression-evaluator";
import { checkForIterand } from "./control-flow";
import { STRING_MEMBERS } from "../runtime/stdlib-string";
import { ARRAY_MEMBERS } from "../runtime/stdlib-array";
import { OBJECT_MEMBERS } from "../runtime/stdlib-object";
import {
  checkMatchArmTypes,
  checkQuestionOperand,
  checkQuestionScope,
  type EnclosingReturnScope,
  type QuestionOperandType,
} from "./match-result";
import { resolveReturnType, type ReturnContribution } from "./functions";
import { checkInvokeReturnType } from "./invoke-diagnostics";
import { checkArrayJoin } from "../runtime/stdlib-array";
import { checkObjectIndex } from "../runtime/stdlib-object";

/** The primitive type names an annotation string can name directly. */
const PRIMITIVE_NAMES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/** The four ordering operators (expressions.md §"Ordering comparisons"). */
const ORDERING_OPS: ReadonlySet<string> = new Set(["<", "<=", ">", ">="]);

/**
 * The additive-operand category of a static type, for the `+` (A5) and ordering
 * (A6) operand-type checks:
 *
 *   - `"numeric"` — a `number` / `integer` (prim or literal);
 *   - `"string"`  — a `string` (prim or literal);
 *   - `"other"`   — a concretely-resolvable but non-additive/non-orderable type
 *                   (`boolean`, `null`, an enum/object schema, a union, an
 *                   inline object, or `array<T>`);
 *   - `"unknown"` — statically unresolvable past the parser's view (an
 *                   unresolved `NamedType`): deferred to the runtime safety net.
 */
type OperandCategory = "numeric" | "string" | "other" | "unknown";

function classifyOperand(type: CompatType, env: TypeEnv): OperandCategory {
  switch (type.kind) {
    case "prim":
      if (type.name === "number" || type.name === "integer") {
        return "numeric";
      }
      return type.name === "string" ? "string" : "other";
    case "literal":
      if (type.typesAs === "number" || type.typesAs === "integer") {
        return "numeric";
      }
      return type.typesAs === "string" ? "string" : "other";
    case "array":
    case "object":
    case "union":
      return "other";
    case "named": {
      const decl = resolveNamed(env, type.name);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "other";
      }
      // A transparent alias (TYPE-11): classify its resolved RHS.
      return classifyOperand(decl.rhs, env);
    }
  }
}

/**
 * The built-in receiver classification for the A2 `unknown-method` check. A
 * receiver whose static type resolves to a concrete built-in (`string`,
 * `array`, `object`, or a member-less primitive) is gated against the stdlib
 * surface; a `"unknown"` receiver (an unresolved `NamedType`, a union) is
 * deferred to the runtime safety net.
 */
type BuiltinReceiver =
  | "string"
  | "array"
  | "object"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "unknown";

function classifyReceiver(type: CompatType, env: TypeEnv): BuiltinReceiver {
  switch (type.kind) {
    case "prim":
      return type.name;
    case "literal":
      return type.typesAs;
    case "array":
      return "array";
    case "object":
      return "object";
    case "union":
      return "unknown";
    case "named": {
      const decl = resolveNamed(env, type.name);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      return classifyReceiver(decl.rhs, env);
    }
  }
}

/**
 * The theta 1.0 stdlib member allow-list for a concrete built-in receiver. A
 * member-less receiver (`number` / `integer` / `boolean` / `null`) exposes no
 * members, so any member / method access on it is `theta/parse/unknown-method`.
 */
function builtinMembers(kind: BuiltinReceiver): ReadonlySet<string> {
  switch (kind) {
    case "string":
      return STRING_MEMBERS;
    case "array":
      return ARRAY_MEMBERS;
    case "object":
      return OBJECT_MEMBERS;
    default:
      return EMPTY_MEMBERS;
  }
}

const EMPTY_MEMBERS: ReadonlySet<string> = new Set();

/**
 * The walk context threaded down each block: the enclosing scope a `?` early-
 * returns from, for the `theta/parse/question-outside-result-fn` scope check.
 */
interface WalkCtx {
  readonly returnScope: EnclosingReturnScope;
}

/**
 * Run the wired `type`-phase checkers over a parsed `V19a` body, returning the
 * aggregated (unsorted; the caller sorts through `assembleDiagnostics`) type-
 * layer diagnostics. Consumes the `V20b` per-expression static-type lookup.
 */
export function checkTypeLayer(body: ThetaBody, file: string): Diagnostic[] {
  const pass = new StaticTypeInferencePass({ checkCompatible });
  const env = collectTypeEnv(body.statements);
  // Run the `V20b` read-only whole-program pass in production: it types every
  // statement-level node and validates the substrate composes with the parse.
  pass.infer(body, env);
  const checker = new TypeLayerWalk(pass, env, file);
  checker.walkBlock(body, new Map(), { returnScope: { kind: "inferred" } });
  return checker.diagnostics;
}

/**
 * Build the whole-file `TypeEnv` from top-level `schema` declarations
 * (bug 0033 §Fix widened this from a two-way to a three-way classification,
 * mirroring `SchemaDecl`'s own AST shape):
 *
 *   - the object form (`SchemaDecl.fields` present) resolves as a nominal
 *     `object-schema` (TYPE-10), carrying its declared field types;
 *   - the alias/union form (`SchemaDecl.arms` present) resolves as a
 *     transparent `alias` (TYPE-11), whose `rhs` is the arms rejoined with
 *     `" | "` and converted through the same `annotationToCompatType` a
 *     `let` annotation gets — a multi-arm union RHS becomes a `union`
 *     `CompatType` whose arms are `named` references to the variants, which
 *     is what makes TYPE-4 (variant-to-union: every `A` of `schema U = A | B`
 *     satisfies `A ⊑ U`) fall out of the EXISTING TYPE-5 union-widening
 *     decision procedure (`decide` in type-compat.ts) composed with this
 *     unfolding, with no new decision-procedure branch;
 *   - the head-only form (neither) keeps the old fallback — a nominal
 *     `object-schema` with no field list, a conservative classification that
 *     never manufactures a spurious `type`-phase reject.
 *
 * An alias that PARTICIPATES IN A CYCLE (`schema X = Y` / `schema Y = X`, the
 * self-reference `schema X = X`, and the legal guarded recursion
 * `schema X = integer | array<X>`) is OMITTED from the env entirely — no entry
 * of any kind. The `⊑` engine's TYPE-11 unfolding (`unfoldAlias` and the four
 * `decide` sites that call it, type-compat.ts) is a total function only over
 * an ACYCLIC alias graph — a cyclic entry makes it loop or recurse forever —
 * and that precondition is made true HERE, at the single construction point
 * every consumer reads, rather than assumed at five consumption points.
 * Termination: `aliasCycleParticipants` removes at least the endpoints of
 * every cycle's back edge, so the alias subgraph the env still carries is
 * acyclic and every walk over it is bounded by its longest chain.
 *
 * OMISSION, not a nominal fallback, is what keeps the guard conservative: an
 * absent name answers `"unknown"` at every `decide` site (type-compat.ts's
 * `resolveNamed`-guarded arms), and `classifyReceiver` / `classifyOperand`
 * defer on it, so a cycle member takes the same silent-and-deferred
 * disposition as any type past the parser's static view and the runtime AJV
 * net remains the only judge. A nominal entry would instead relate by
 * identity alone and REFUSE the load of programs the specification admits:
 * `schema X = integer | array<X>` with `let v: X = 3` is legal under TYPE-11
 * plus TYPE-5 union widening, and a nominal `X` makes that `let` a
 * `theta/parse/let-rhs-type-mismatch`. The cycle's own rejection is
 * unaffected either way — `theta/parse/type-alias-cycle` is emitted by the
 * structural pass (`checkSchemaDeclarationGraph`, theta-document.ts) over the
 * same declarations, whether or not the type layer looks at them, and that
 * pass reports only the pure-alias cycles the language forbids, not the
 * guarded recursion it allows.
 *
 * The constructor-field check (`walkExpr`'s `object` arm, via
 * `TypeLayerWalk.declaredFieldsOf`) skips any declaration whose `TypeEnv`
 * entry is not `object-schema` WITH a field list — an alias/union entry
 * included, since a constructor naming one is rejected upstream
 * (`checkObjectExpr`, bug 0025 §Fix) before this check would matter.
 *
 * Null-prototype (`Object.create(null)`) because a `NamedType` reference
 * carries no case constraint — unlike a declaration position, which
 * `theta/parse/schema-case-mismatch` shields — so a reference may spell an
 * `Object.prototype` own property (`constructor`, `toString`, `valueOf`,
 * `__proto__`, …) verbatim. On an ordinary `{}` a lookup for such a name
 * resolves through the prototype chain to a value that is not a `NamedDecl`,
 * manufacturing a declared type for a name no `schema` statement wrote — a
 * hazard the exported `resolveNamed` (type-compat.ts) also own-key-guards
 * independently at every consumption site, so either defence alone suffices.
 * With no prototype, a declaration literally named `__proto__` becomes an
 * ordinary own property too, instead of replacing the record's prototype.
 */
export function collectTypeEnv(statements: readonly Stmt[]): TypeEnv {
  const env: Record<string, NamedDecl> = Object.create(null) as Record<string, NamedDecl>;
  const aliasRhs = new Map<string, CompatType>();
  for (const stmt of statements) {
    if (stmt.kind === "schema" && stmt.arms !== undefined) {
      const rhs = annotationToCompatType(stmt.arms.join(" | "));
      if (rhs !== undefined) {
        aliasRhs.set(stmt.name, rhs);
      }
    }
  }
  const cyclic = aliasCycleParticipants(aliasRhs);
  for (const stmt of statements) {
    if (stmt.kind === "schema") {
      if (stmt.arms !== undefined) {
        const rhs = aliasRhs.get(stmt.name);
        if (rhs !== undefined && !cyclic.has(stmt.name)) {
          env[stmt.name] = { kind: "alias", rhs };
        }
        continue;
      }
      const fields = collectSchemaFields(stmt.fields);
      env[stmt.name] = {
        kind: "object-schema",
        ...(fields !== undefined ? { fields } : {}),
      };
    }
  }
  return env;
}

/**
 * Alias names whose REMOVAL breaks every cycle of the alias-to-alias reference
 * graph — the acyclicity precondition `unfoldAlias` (type-compat.ts) is
 * bounded by. The guarantee is exactly that: the set contains at least the two
 * endpoints of every back edge the DFS below closes, and every cycle in a
 * directed graph carries at least one back edge under any DFS, so no cycle
 * survives the removal. It is NOT the set of every node on every elementary
 * cycle: for `schema A = C | B` / `schema C = A` / `schema B = C` the walk
 * from `A` closes the back edge `C → A` and marks `{A, C}`, leaving `B`
 * unmarked even though `B → C → A → B` is an elementary cycle — that cycle is
 * broken anyway, because `A` and `C` are gone from the env.
 *
 * Edges are the `named` references reachable in an alias's own converted
 * right-hand side (`annotationToCompatType`: union arms, `array<T>` elements,
 * inline-object field types), restricted to names that are themselves aliases:
 * unfolding stops at every other declaration kind, so only alias-to-alias
 * edges can diverge. A chain that merely REACHES a cycle (`schema A = B`,
 * `schema B = C`, `schema C = B`) keeps its transparent entry and unfolds into
 * an omitted member, where the walk stops.
 */
function aliasCycleParticipants(
  aliasRhs: ReadonlyMap<string, CompatType>,
): ReadonlySet<string> {
  const cyclic = new Set<string>();
  const settled = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (name: string): void => {
    stack.push(name);
    onStack.add(name);
    for (const ref of aliasReferences(aliasRhs.get(name))) {
      if (!aliasRhs.has(ref)) {
        continue;
      }
      if (onStack.has(ref)) {
        // Back-edge: every node from the target up to the current top of the
        // stack lies on the cycle it closes.
        for (const member of stack.slice(stack.indexOf(ref))) {
          cyclic.add(member);
        }
      } else if (!settled.has(ref)) {
        visit(ref);
      }
    }
    onStack.delete(name);
    stack.pop();
    settled.add(name);
  };
  for (const name of aliasRhs.keys()) {
    if (!settled.has(name)) {
      visit(name);
    }
  }
  return cyclic;
}

/** Every `named` reference inside a converted right-hand side, deduped. */
function aliasReferences(rhs: CompatType | undefined): ReadonlySet<string> {
  const names = new Set<string>();
  const walk = (type: CompatType): void => {
    switch (type.kind) {
      case "named":
        names.add(type.name);
        return;
      case "union":
        for (const arm of type.arms) {
          walk(arm);
        }
        return;
      case "array":
        walk(type.element);
        return;
      case "object":
        for (const field of type.fields) {
          walk(field.type);
        }
        return;
      default:
        // prim / literal — no reference to follow.
        return;
    }
  };
  if (rhs !== undefined) {
    walk(rhs);
  }
  return names;
}

/**
 * The declared field-type record for an object-form `schema`'s field list,
 * mapping each `SchemaFieldSource.typeSource` through `annotationToCompatType`
 * — the same conversion a `let` annotation gets, so a schema field and a `let`
 * annotation resolve identically (e.g. both leave an `enum`-typed or
 * literal-union-typed field as an unresolvable `named` reference).
 * `undefined` for the alias / `by … = …` forms, whose declaration carries no
 * object field list (`SchemaDecl.fields` is optional).
 *
 * Null-prototype because a theta field name is unconstrained and may collide
 * with an `Object.prototype` member: on an ordinary `{}` the record would
 * answer a `toString` / `constructor` / `valueOf` lookup through the prototype
 * chain (manufacturing a declared type for an undeclared field), and assigning
 * a field literally named `__proto__` would set the record's prototype instead
 * of creating an own property (losing the declared type). With no prototype,
 * both reads and writes are ordinary own properties.
 */
function collectSchemaFields(
  fields: readonly SchemaFieldSource[] | undefined,
): Readonly<Record<string, CompatType>> | undefined {
  if (fields === undefined) {
    return undefined;
  }
  const out: Record<string, CompatType> = Object.create(null) as Record<string, CompatType>;
  for (const f of fields) {
    const type = annotationToCompatType(f.typeSource);
    if (type !== undefined) {
      out[f.name] = type;
    }
  }
  return out;
}

/**
 * Parse a declared type-annotation source into a `CompatType` for the
 * compatibility checks (the `let`-binding RHS narrowing check and `fn`
 * parameter binding types). Handles the primitive names, top-level unions
 * (`A | B`), and `array<T>`; every other shape (a `NamedType`, an inline object
 * type) resolves to a nominal `named` reference — the same shape the `⊑` engine
 * treats as deferred.
 */
export function annotationToCompatType(src: string): CompatType | undefined {
  const text = src.trim();
  if (text.length === 0) {
    return undefined;
  }
  // Top-level union: split on `|` that is not inside `<…>` brackets.
  const unionArms = splitTopLevelUnion(text);
  if (unionArms.length > 1) {
    const arms = unionArms
      .map((arm) => annotationToCompatType(arm))
      .filter((t): t is CompatType => t !== undefined);
    return arms.length > 0 ? { kind: "union", arms } : undefined;
  }
  const arrayMatch = /^array<(.+)>$/.exec(text);
  if (arrayMatch !== null) {
    const element = annotationToCompatType(arrayMatch[1] ?? "");
    return { kind: "array", element: element ?? { kind: "named", name: "unknown" } };
  }
  if (PRIMITIVE_NAMES.has(text)) {
    return { kind: "prim", name: text as PrimitiveName };
  }
  return { kind: "named", name: text };
}

/**
 * Split a type source on top-level `|` (outside any `<…>` bracket depth).
 * Exported so the runtime schema-subset disjointness computation
 * (`../runtime/tool-call.ts` — RFC 0002) reuses this single copy rather than
 * carrying a duplicate; the two must agree on where a top-level union arm begins.
 */
export function splitTopLevelUnion(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "<") {
      depth += 1;
    } else if (c === ">") {
      depth -= 1;
    } else if (c === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Whether a declared return-type source names a `Result<…>` type. */
function isResultAnnotation(src: string): boolean {
  return /^Result\b/.test(src.trim());
}

/**
 * A per-parse walk feeding the wired `type`-phase checkers. Holds only per-parse
 * state (the injected pass, the type env, the file, the accumulated diagnostics)
 * — no module-level mutable state.
 */
class TypeLayerWalk {
  public readonly diagnostics: Diagnostic[] = [];

  public constructor(
    private readonly pass: StaticTypeInferencePass,
    private readonly env: TypeEnv,
    private readonly file: string,
  ) {}

  /** The static type the `V20b` pass assigns `expr` under the in-scope bindings. */
  private typeOf(expr: Expr, bindings: ReadonlyMap<string, CompatType>): CompatType {
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
      case "let": {
        if (stmt.init !== null) {
          const rhsType = this.typeOf(stmt.init, bindings);
          if (stmt.annotation !== null && stmt.annotation.length > 0) {
            const annotation = annotationToCompatType(stmt.annotation);
            if (annotation !== undefined) {
              // The typed-binding RHS narrowing / mismatch check (surfaces
              // `theta/parse/integer-narrowing` for a `number → integer` RHS).
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
              // element sink here, so the generic (sink-less) array check does
              // not re-flag a validly-annotated union array.
              if (stmt.init.kind === "array" && annotation.kind === "array") {
                this.checkArrayLiteral(stmt.init, annotation.element, bindings);
              }
            }
          }
          // Walk the initialiser for nested checks. A typed array already
          // checked against its element sink above is skipped by the walk.
          this.walkExpr(stmt.init, bindings, flow, this.sinkedArrayOf(stmt));
          // Record the binding type so later identifier references resolve.
          bindings.set(stmt.name, rhsType);
        }
        return;
      }
      case "reassign":
        this.walkExpr(stmt.value, bindings, flow);
        return;
      case "if":
        this.checkBoolean(stmt.condition, "if", bindings);
        this.walkExpr(stmt.condition, bindings, flow);
        this.walkBlock(stmt.then, new Map(bindings), flow);
        this.walkOtherwise(stmt.otherwise, bindings, flow);
        return;
      case "while":
        this.checkBoolean(stmt.condition, "while", bindings);
        this.walkExpr(stmt.condition, bindings, flow);
        this.walkBlock(stmt.body, new Map(bindings), flow);
        return;
      case "for": {
        const diag = checkForIterand(
          { type: this.typeOf(stmt.iterand, bindings) },
          { file: this.file, range: stmt.iterand.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
        this.walkExpr(stmt.iterand, bindings, flow);
        const inner = new Map(bindings);
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
      default:
        // schema / enum / import / export / break / continue / doc-comment —
        // no expression to type-check.
        return;
    }
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

  private walkFn(fn: FnDecl, bindings: Map<string, CompatType>): void {
    const fnScope = new Map(bindings);
    for (const p of fn.params) {
      if (p.type.length > 0) {
        fnScope.set(p.name, annotationToCompatType(p.type) ?? { kind: "named", name: p.type });
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
    const returnScope: EnclosingReturnScope =
      fn.returnType === null || fn.subagent
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

  /** The boolean-position check for an `if` / `while` condition. */
  private checkBoolean(
    condition: Expr,
    position: "if" | "while",
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    this.diagnostics.push(
      ...checkBooleanPosition({
        position,
        operandType: this.typeOf(condition, bindings),
        site: { file: this.file, range: condition.range },
      }),
    );
  }

  private checkArrayLiteral(
    array: ArrayExpr,
    sink: CompatType | undefined,
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    this.diagnostics.push(
      ...checkCommonType({
        branches: array.elements.map((e) => this.typeOf(e, bindings)),
        sink,
        env: this.env,
        site: { file: this.file, range: array.range },
      }),
    );
  }

  /** The array node already checked against a binding-annotation element sink. */
  private sinkedArrayOf(stmt: Stmt): Expr | null {
    if (
      stmt.kind === "let" &&
      stmt.init !== null &&
      stmt.init.kind === "array" &&
      stmt.annotation !== null &&
      stmt.annotation.length > 0
    ) {
      const annotation = annotationToCompatType(stmt.annotation);
      if (annotation !== undefined && annotation.kind === "array") {
        return stmt.init;
      }
    }
    return null;
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
      let skipArray: Expr | null = null;
      // Own-key lookup: a theta field name may collide with an
      // `Object.prototype` member (`toString`, `constructor`, …), and the
      // record must never answer through the prototype chain and manufacture a
      // declared type for a field the schema does not declare.
      const declared =
        declaredFields !== undefined && Object.hasOwn(declaredFields, field.name)
          ? declaredFields[field.name]
          : undefined;
      if (typeName !== null && declared !== undefined) {
        skipArray = this.checkObjectField(typeName, field, declared, bindings);
      }
      this.walkExpr(field.value, bindings, flow, skipArray);
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
   * One constructor field's value against its declared type. A `result-ctor`
   * value (`Ok(...)` / `Err(...)`) is rejected outright — every declared
   * field type is lowerable (`theta/parse/result-in-schema-position` makes a
   * `Result`-typed field undeclarable), so a `Result` value is incompatible
   * with whatever the field declares even though `checkCompatible` alone
   * answers `"unknown"` for it. Otherwise routes the compatibility outcome
   * the way `checkLetRhsCompat` does. When the value is an array literal and
   * the declared type is `array<T>`, also checks it against the declared
   * element type as a sink (mirroring the typed-`let` arm's `sinkedArrayOf`)
   * and returns the value node so the caller skips the generic sink-less
   * array check on the same node; otherwise returns `null`.
   */
  private checkObjectField(
    schema: string,
    field: ObjectFieldNode,
    declared: CompatType,
    bindings: ReadonlyMap<string, CompatType>,
  ): Expr | null {
    const value = field.value;
    const valueType = this.typeOf(value, bindings);
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
    if (value.kind === "array" && declared.kind === "array") {
      this.checkArrayLiteral(value, declared.element, bindings);
      return value;
    }
    return null;
  }

  private walkExpr(
    e: Expr,
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
    skipArray: Expr | null = null,
  ): void {
    switch (e.kind) {
      case "ternary":
        this.diagnostics.push(
          ...checkBooleanPosition({
            position: "ternary-condition",
            operandType: this.typeOf(e.condition, bindings),
            site: { file: this.file, range: e.condition.range },
          }),
        );
        this.walkExpr(e.condition, bindings, flow);
        this.walkExpr(e.consequent, bindings, flow);
        this.walkExpr(e.alternate, bindings, flow);
        return;
      case "binary":
        if (e.op === "&&" || e.op === "||") {
          for (const operand of [e.left, e.right]) {
            this.diagnostics.push(
              ...checkBooleanPosition({
                position: e.op,
                operandType: this.typeOf(operand, bindings),
                site: { file: this.file, range: operand.range },
              }),
            );
          }
        } else if (e.op === "+") {
          this.checkPlusOperands(e, bindings);
        } else if (ORDERING_OPS.has(e.op)) {
          this.checkOrderingOperands(e, bindings);
        }
        this.walkExpr(e.left, bindings, flow);
        this.walkExpr(e.right, bindings, flow);
        return;
      case "try":
        this.checkQuestion(e.operand, e.range, bindings, flow);
        this.walkExpr(e.operand, bindings, flow);
        return;
      case "array":
        if (e !== skipArray) {
          this.checkArrayLiteral(e, undefined, bindings);
        }
        for (const el of e.elements) {
          this.walkExpr(el, bindings, flow);
        }
        return;
      case "index":
        this.checkIndex(e, bindings);
        this.walkExpr(e.target, bindings, flow);
        this.walkExpr(e.index, bindings, flow);
        return;
      case "match":
        this.diagnostics.push(
          ...checkMatchArmTypes({
            armTypes: e.arms.map((arm) => this.typeOf(arm.body, bindings)),
            sink: undefined,
            env: this.env,
            site: { file: this.file, range: e.range },
          }).diagnostics,
        );
        this.walkExpr(e.scrutinee, bindings, flow);
        for (const arm of e.arms) {
          this.walkExpr(arm.body, bindings, flow);
        }
        return;
      case "method-call":
        this.checkMethodCall(e, bindings);
        this.walkExpr(e.target, bindings, flow);
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "member":
        this.checkMemberAccess(e, bindings);
        this.walkExpr(e.target, bindings, flow);
        return;
      case "call":
      case "invoke":
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "object":
        this.checkObjectFields(e, bindings, flow);
        return;
      case "result-ctor":
        this.walkExpr(e.arg, bindings, flow);
        return;
      case "par-for": {
        // CTRL-2 / grammar.md: the iterand reuses the `for` contract — a
        // non-`array<T>` iterand is `theta/parse/non-array-iterand`.
        const iterDiag = checkForIterand(
          { type: this.typeOf(e.iterand, bindings) },
          { file: this.file, range: e.iterand.range },
        );
        if (iterDiag !== undefined) {
          this.diagnostics.push(iterDiag);
        }
        this.walkExpr(e.iterand, bindings, flow);
        // The `max` operand is an integer sink: a fractional / `number` operand
        // narrows to the existing `theta/parse/integer-narrowing` diagnostic.
        if (e.max !== null) {
          const r = checkCompatible(
            this.typeOf(e.max, bindings),
            { kind: "prim", name: "integer" },
            this.env,
          );
          if (r === "integer-narrowing") {
            this.diagnostics.push({
              severity: "error",
              code: "theta/parse/integer-narrowing",
              file: this.file,
              range: e.max.range,
              message: "cannot narrow number to integer",
            });
          }
          this.walkExpr(e.max, bindings, flow);
        }
        // Bind the fresh immutable loop variable to the iterand element type so
        // body checks resolve it, then walk the body.
        const iterandType = this.typeOf(e.iterand, bindings);
        const inner = new Map(bindings);
        inner.set(
          e.variable,
          iterandType.kind === "array"
            ? iterandType.element
            : { kind: "named", name: "unknown" },
        );
        this.walkBlock(e.body, inner, flow);
        return;
      }
      default:
        // ident / number / string / bool / null / query — no nested checks.
        return;
    }
  }

  /** The `?` operand-type and enclosing-scope preconditions (owned V4a). */
  private checkQuestion(
    operand: Expr,
    range: Expr["range"],
    bindings: ReadonlyMap<string, CompatType>,
    flow: WalkCtx,
  ): void {
    const site = { file: this.file, range };
    const operandKind = this.questionOperandKind(operand, bindings);
    if (operandKind !== undefined) {
      const diag = checkQuestionOperand(operandKind, site);
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    const scopeDiag = checkQuestionScope(flow.returnScope, site);
    if (scopeDiag !== undefined) {
      this.diagnostics.push(scopeDiag);
    }
  }

  /**
   * Classify a `?` operand for the operand-type check. A query / `Result`-
   * constructor operand is a `Result` (no diagnostic). A statically-concrete
   * non-`Result` type (a primitive, literal, array, union, or inline object
   * type) is a `non-result`. Only a statically-unresolvable operand (a
   * `named` reference — an unresolved call result, a member/index
   * placeholder, and every genuine-`Result` placeholder: `Ok` / `Err` /
   * `Result<…>` / a query result) is left unclassified (`undefined`) so no
   * false positive is raised; the runtime net (`evalTry`'s brand-based guard,
   * bug 0019) rejects a non-`Result` that reaches the unwrap through this
   * arm.
   */
  private questionOperandKind(
    operand: Expr,
    bindings: ReadonlyMap<string, CompatType>,
  ): QuestionOperandType | undefined {
    if (operand.kind === "query" || operand.kind === "result-ctor") {
      return { kind: "result", errIsQueryError: true };
    }
    const type = this.typeOf(operand, bindings);
    switch (type.kind) {
      case "prim":
        return { kind: "non-result", display: type.name };
      case "literal":
        return { kind: "non-result", display: type.typesAs };
      case "array":
        return { kind: "non-result", display: "array" };
      case "union":
      case "object":
        // Non-`Result` by construction — a `Result` types as a `named`
        // placeholder (`Ok` / `Err` / `Result<…>` / a query result), never as
        // a union or an inline object type — so classifying these can never
        // false-positive a genuine `Result` (bug 0019).
        return { kind: "non-result", display: displayType(type) };
      default:
        return undefined;
    }
  }

  /** The indexed-access receiver / object-index checks (owned V3a / V3h). */
  private checkIndex(
    e: Expr & { kind: "index" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const receiverType = this.typeOf(e.target, bindings);
    const site = { file: this.file, range: e.range };
    const receiverDiag = checkIndexReceiver({ receiverType, env: this.env, site });
    if (receiverDiag !== undefined) {
      this.diagnostics.push(receiverDiag);
    }
    const objectDiag = checkObjectIndex({
      receiverType,
      indexType: this.typeOf(e.index, bindings),
      env: this.env,
      site,
    });
    if (objectDiag !== undefined) {
      this.diagnostics.push(objectDiag);
    }
  }

  /**
   * The method-call type-layer checks: the `array.join` element-type
   * precondition (owned V3g) and the A2 `unknown-method` stdlib allow-list
   * (fired only when the receiver's static type is a concrete built-in).
   */
  private checkMethodCall(
    e: Expr & { kind: "method-call" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const targetType = this.typeOf(e.target, bindings);
    if (e.method === "join" && targetType.kind === "array") {
      const diag = checkArrayJoin(targetType.element, {
        file: this.file,
        range: e.range,
      });
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
    }
    // A2 — a method call on a concrete built-in receiver whose name the theta
    // 1.0 stdlib does not expose. A statically-unresolvable receiver defers to
    // the runtime safety net (no diagnostic).
    const kind = classifyReceiver(targetType, this.env);
    if (kind === "unknown") {
      return;
    }
    if (!builtinMembers(kind).has(e.method)) {
      this.pushUnknownMethod(e.method, targetType, e.range);
    }
  }

  /**
   * The A2 `unknown-method` check on a bare member (property) access
   * `target.member`. Object *field* access (`obj.field`) is legitimate and is
   * not gated; a member-less primitive (`number` / `integer` / `boolean` /
   * `null`) or a `string` / `array` property outside the stdlib surface is
   * `theta/parse/unknown-method`. A statically-unresolvable receiver defers.
   */
  private checkMemberAccess(
    e: Expr & { kind: "member" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const receiverType = this.typeOf(e.target, bindings);
    const kind = classifyReceiver(receiverType, this.env);
    if (kind === "unknown" || kind === "object") {
      // Unresolved receiver (defer to runtime) or an object field access
      // (`obj.field` — not a stdlib member surface).
      return;
    }
    if (!builtinMembers(kind).has(e.field)) {
      this.pushUnknownMethod(e.field, receiverType, e.range);
    }
  }

  /** Emit `theta/parse/unknown-method` (message from code-registry-parse.md). */
  private pushUnknownMethod(
    name: string,
    receiverType: CompatType,
    range: Expr["range"],
  ): void {
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/unknown-method",
      file: this.file,
      range,
      message: `unknown method '${name}' on type ${displayType(receiverType)}`,
    });
  }

  /**
   * A5 — the `+` operand-type check. `+` accepts two numeric operands
   * (addition) or two `string` operands (concatenation); every other concrete
   * pairing is `theta/parse/mixed-plus-operands` (expressions.md §"`+`
   * operator"). Fires only when both operands are statically resolvable.
   */
  private checkPlusOperands(
    e: Expr & { kind: "binary" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const leftType = this.typeOf(e.left, bindings);
    const rightType = this.typeOf(e.right, bindings);
    const left = classifyOperand(leftType, this.env);
    const right = classifyOperand(rightType, this.env);
    if (left === "unknown" || right === "unknown") {
      return;
    }
    if (
      (left === "numeric" && right === "numeric") ||
      (left === "string" && right === "string")
    ) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/mixed-plus-operands",
      file: this.file,
      range: e.range,
      message: `'+' has mixed operand types: ${displayType(leftType)} and ${displayType(
        rightType,
      )}`,
    });
  }

  /**
   * A6 — the ordering-operator (`<` / `<=` / `>` / `>=`) operand-type check.
   * Ordering accepts two numeric operands or two `string` operands; every other
   * concrete pairing is `theta/parse/non-orderable-operands` (expressions.md
   * §"Ordering comparisons"). Fires only when both operands are statically
   * resolvable.
   */
  private checkOrderingOperands(
    e: Expr & { kind: "binary" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    const leftType = this.typeOf(e.left, bindings);
    const rightType = this.typeOf(e.right, bindings);
    const left = classifyOperand(leftType, this.env);
    const right = classifyOperand(rightType, this.env);
    if (left === "unknown" || right === "unknown") {
      return;
    }
    if (
      (left === "numeric" && right === "numeric") ||
      (left === "string" && right === "string")
    ) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/non-orderable-operands",
      file: this.file,
      range: e.range,
      message: `'${e.op}' requires two numeric or two string operands; got ${displayType(
        leftType,
      )} and ${displayType(rightType)}`,
    });
  }
}

/** The direct child expressions of an expression node (for the `?` scan). */
function childExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "index":
      return [e.target, e.index];
    case "member":
      return [e.target];
    case "array":
      return e.elements;
    case "call":
    case "invoke":
      return e.args;
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    default:
      return [];
  }
}

/** The direct expressions a statement exposes (for the `?` scan). */
function stmtExprs(s: Stmt): readonly Expr[] {
  switch (s.kind) {
    case "let":
      return s.init !== null ? [s.init] : [];
    case "reassign":
      return [s.value];
    case "if":
    case "while":
      return [s.condition];
    case "for":
      return [s.iterand];
    case "return":
      return s.operand !== null ? [s.operand] : [];
    case "query":
      return [s.query];
    case "tool-call":
      return [s.call];
    case "invoke":
      return [s.invoke];
    case "expr":
      return [s.expr];
    default:
      return [];
  }
}

/** The nested blocks a statement contains (for the `?` scan). */
function stmtBlocks(s: Stmt): readonly Block[] {
  switch (s.kind) {
    case "if": {
      const blocks: Block[] = [s.then];
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          blocks.push(s.otherwise);
        } else {
          blocks.push(...stmtBlocks(s.otherwise));
        }
      }
      return blocks;
    }
    case "while":
    case "for":
      return [s.body];
    default:
      // A nested `fn` owns its own `?`-scope; do not descend into it here.
      return [];
  }
}
