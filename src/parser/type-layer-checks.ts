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
//   * `loom/parse/non-boolean-condition` (cka-4, V3a),
//   * `loom/parse/non-array-iterand` (cka-5, V3c),
//   * `loom/parse/question-on-non-result` / `loom/parse/question-outside-result-fn` (V4a),
//   * `loom/parse/array-no-common-type` (V3a), `loom/parse/return-no-common-type` (V3d),
//   * `loom/parse/integer-narrowing` (V2b), `loom/parse/match-arm-type-mismatch` (V4a),
//   * `loom/parse/non-indexable-receiver` (V3a), `loom/parse/non-string-object-index` (V3h),
//   * `loom/parse/non-string-array-join` (V3g).
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
  LoomBody,
  Stmt,
} from "./loom-document";
import {
  checkCompatible,
  checkCommonType,
  checkLetRhsCompat,
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
import {
  checkMatchArmTypes,
  checkQuestionOperand,
  checkQuestionScope,
  type EnclosingReturnScope,
  type QuestionOperandType,
} from "./match-result";
import { resolveReturnType, type ReturnContribution } from "./functions";
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

/**
 * The walk context threaded down each block: the enclosing scope a `?` early-
 * returns from, for the `loom/parse/question-outside-result-fn` scope check.
 */
interface WalkCtx {
  readonly returnScope: EnclosingReturnScope;
}

/**
 * Run the wired `type`-phase checkers over a parsed `V19a` body, returning the
 * aggregated (unsorted; the caller sorts through `assembleDiagnostics`) type-
 * layer diagnostics. Consumes the `V20b` per-expression static-type lookup.
 */
export function checkTypeLayer(body: LoomBody, file: string): Diagnostic[] {
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
 * Build the whole-file `TypeEnv` from top-level `schema` declarations: every
 * named schema resolves as a nominal `object-schema` (TYPE-10). The `= …` alias
 * and `by … = …` forms carry no field list the parser retains as a resolvable
 * RHS, so they too default to the nominal shape — a conservative classification
 * that never manufactures a spurious `type`-phase reject.
 */
export function collectTypeEnv(statements: readonly Stmt[]): TypeEnv {
  const env: Record<string, NamedDecl> = {};
  for (const stmt of statements) {
    if (stmt.kind === "schema") {
      env[stmt.name] = { kind: "object-schema" };
    }
  }
  return env;
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

/** Split a type source on top-level `|` (outside any `<…>` bracket depth). */
function splitTopLevelUnion(text: string): string[] {
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
              // `loom/parse/integer-narrowing` for a `number → integer` RHS).
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
    const returnScope: EnclosingReturnScope =
      fn.returnType === null
        ? { kind: "inferred" }
        : { kind: "annotated", resultCompatible: isResultAnnotation(fn.returnType) };

    // An annotation-less `fn` infers its return type as the LUB of its
    // contributions; contributions sharing no common upper bound surface
    // `loom/parse/return-no-common-type` (owned V3d).
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
    }

    this.walkBlock(fn.body, fnScope, { returnScope });
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
        this.walkExpr(e.target, bindings, flow);
        return;
      case "call":
      case "invoke":
        for (const arg of e.args) {
          this.walkExpr(arg, bindings, flow);
        }
        return;
      case "object":
        for (const field of e.fields) {
          this.walkExpr(field.value, bindings, flow);
        }
        return;
      case "result-ctor":
        this.walkExpr(e.arg, bindings, flow);
        return;
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
   * non-`Result` type (a primitive, literal, or array) is a `non-result`. A
   * statically-unresolvable operand (a `named` reference — an unresolved call
   * result, etc.) is left unclassified (`undefined`) so no false positive is
   * raised; it defers to the runtime safety net.
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

  /** The `array.join` element-type precondition (owned V3g). */
  private checkMethodCall(
    e: Expr & { kind: "method-call" },
    bindings: ReadonlyMap<string, CompatType>,
  ): void {
    if (e.method !== "join") {
      return;
    }
    const targetType = this.typeOf(e.target, bindings);
    if (targetType.kind !== "array") {
      return;
    }
    const diag = checkArrayJoin(targetType.element, {
      file: this.file,
      range: e.range,
    });
    if (diag !== undefined) {
      this.diagnostics.push(diag);
    }
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
