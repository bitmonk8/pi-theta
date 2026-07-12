// V13b integration — the post-parse whole-body pass that resolves each typed
// query's INDIRECT response schema from the surrounding type context (QRY-2)
// and emits the QRY-4 explicit-schema-mismatch warning.
//
// The recursive-descent body parser has no frame-stack at any single query
// parse site, so the four indirect sink positions (query-forms.md §"Schema
// inference algorithm") cannot be resolved inline. This pass is the required
// whole-body pass: it walks the parsed `LoomBody`, builds the innermost-first
// `SchemaSinkFrame` chain enclosing each query, calls `inferQuerySchema`, and —
// Option B (tree-rebuild) — returns a body whose `QueryExpr.schema` is filled
// from the serialized inferred schema. `QueryExpr.schema: string` therefore
// stays the single source of truth every downstream consumer already reads
// (the producer's `#buildTypedValidation`, the static-type substrate, …); no
// consumer changes.
//
// The direct `let x: T = @`…`` form is already propagated inline by `parseLet`
// (the "direct wins" fast path); this pass only infers when
// `query.schema === null`, so an explicit `@<Schema>` ascription and a
// direct-let annotation are both left intact.
//
// The pass folds two adapters between `QueryExpr.schema`'s verbatim annotation
// text and the module's `InferredSchema` object model:
//   (a) `annotationToInferred` — annotation source → `InferredSchema`, reusing
//       the vetted `annotationToCompatType` type parser and projecting its
//       `CompatType` down to the primitive/named/array<T> `InferredSchema`
//       model; and
//   (b) `serializeInferred` — `InferredSchema` → annotation text written back
//       onto the resolved `QueryExpr.schema`.
//
// Spec: query/query-forms.md (QRY-2 inference, QRY-3 override, QRY-4 explicit
// mismatch), schema-subset.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  ArrayExpr,
  BinaryExpr,
  Block,
  Expr,
  FnDecl,
  IfStmt,
  InvokeExpr,
  LoomBody,
  MatchExpr,
  MemberExpr,
  MethodCallExpr,
  ObjectExpr,
  QueryExpr,
  ResultCtorExpr,
  Stmt,
  TernaryExpr,
  TryExpr,
  IndexExpr,
  CallExpr,
} from "./loom-document";
import {
  checkExplicitSchemaMismatch,
  inferQuerySchema,
  type InferredSchema,
  type SchemaSinkFrame,
} from "./query-schema-inference";
import { annotationToCompatType, collectTypeEnv } from "./type-layer-checks";
import type { CompatType, TypeEnv } from "./type-compat";

/** The resolved body plus the QRY-4 explicit-schema-mismatch diagnostics. */
export interface ResolveQuerySchemasResult {
  readonly body: LoomBody;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Resolve every INDIRECT typed query's response schema in `body` (QRY-2) and
 * collect the QRY-4 explicit-schema-mismatch warnings. Returns a rebuilt body
 * whose null-schema queries at a resolvable sink carry the inferred annotation
 * text; queries that already carry a schema (an explicit `@<Schema>` ascription
 * or a direct-let propagation) are left untouched.
 */
export function resolveQuerySchemas(
  body: LoomBody,
  file: string,
): ResolveQuerySchemasResult {
  const env = collectTypeEnv(body.statements);
  const fns = collectFns(body.statements);
  const walk = new QuerySchemaResolveWalk(file, env, fns);
  const resolved = walk.rewriteBlock(body, []);
  return { body: resolved, diagnostics: walk.diagnostics };
}

/** Collect the top-level `fn` declarations, keyed by name, for call-arg sinks. */
function collectFns(statements: readonly Stmt[]): ReadonlyMap<string, FnDecl> {
  const fns = new Map<string, FnDecl>();
  for (const stmt of statements) {
    if (stmt.kind === "fn") {
      fns.set(stmt.name, stmt);
    }
  }
  return fns;
}

/**
 * A per-parse tree-rewrite walk. Holds only per-parse state (the file, the type
 * env, the fn table, and the accumulated mismatch diagnostics) — no
 * module-level mutable state. Each `rewriteExpr` receives the innermost-first
 * `SchemaSinkFrame` chain enclosing the expression, so a query it reaches has
 * exactly the frames `inferQuerySchema` walks.
 */
class QuerySchemaResolveWalk {
  public readonly diagnostics: Diagnostic[] = [];

  public constructor(
    private readonly file: string,
    private readonly env: TypeEnv,
    private readonly fns: ReadonlyMap<string, FnDecl>,
  ) {}

  /**
   * Rewrite a block's statements and tail. `tailFrames` are the frames the
   * block's tail expression sits in: a `fn` body threads its declared-return
   * sink here (the tail is the function's implicit return), every other block
   * tail is a fresh (sink-less) context.
   */
  public rewriteBlock(block: Block, tailFrames: readonly SchemaSinkFrame[]): Block {
    const statements = block.statements.map((stmt) => this.rewriteStmt(stmt));
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, tailFrames);
    return { statements, tail };
  }

  private rewriteStmt(stmt: Stmt): Stmt {
    switch (stmt.kind) {
      case "let": {
        // The binding annotation is the sink for a query directly on the RHS;
        // a nested query (array element, ternary branch) crosses the `let`
        // frame to reach it (innermost-first).
        const annotation =
          stmt.annotation === null || stmt.annotation.length === 0
            ? undefined
            : annotationToInferred(stmt.annotation);
        if (stmt.init === null) {
          return stmt;
        }
        // QRY-4 — an explicit `@<Schema>` ascription on the RHS query is
        // checked against the binding annotation (a direct-let propagation
        // makes the two identical, so it never fires there).
        this.checkLetMismatch(stmt.init, stmt.annotation);
        const frames: readonly SchemaSinkFrame[] =
          annotation === undefined ? [] : [{ kind: "let", annotation }];
        return { ...stmt, init: this.rewriteExpr(stmt.init, frames) };
      }
      case "reassign":
        // A reassignment carries no declared annotation to serve as a sink.
        return { ...stmt, value: this.rewriteExpr(stmt.value, []) };
      case "if":
        return this.rewriteIf(stmt);
      case "while":
        return {
          ...stmt,
          condition: this.rewriteExpr(stmt.condition, [{ kind: "stop", label: "while-condition" }]),
          body: this.rewriteBlock(stmt.body, []),
        };
      case "for":
        return {
          ...stmt,
          iterand: this.rewriteExpr(stmt.iterand, [{ kind: "stop", label: "for-iterand" }]),
          body: this.rewriteBlock(stmt.body, []),
        };
      case "fn": {
        // A declared return type is the sink for the fn's tail expression and
        // its `return` operands; a `.loom`/undeclared return supplies none.
        const returnType =
          stmt.returnType === null || stmt.returnType.length === 0
            ? undefined
            : annotationToInferred(stmt.returnType);
        // `exactOptionalPropertyTypes`: omit `returnType` when undefined so the
        // frame stays assignable to the optional-property `fn-return` shape.
        const fnFrames: readonly SchemaSinkFrame[] = [
          returnType === undefined
            ? { kind: "fn-return" }
            : { kind: "fn-return", returnType },
        ];
        return { ...stmt, body: this.rewriteFnBlock(stmt.body, fnFrames) };
      }
      case "return":
        return stmt;
      case "query":
        return { ...stmt, query: this.rewriteExpr(stmt.query, []) as QueryExpr };
      case "tool-call":
        return { ...stmt, call: this.rewriteExpr(stmt.call, []) as CallExpr };
      case "invoke":
        return { ...stmt, invoke: this.rewriteExpr(stmt.invoke, []) as InvokeExpr };
      case "expr":
        return { ...stmt, expr: this.rewriteExpr(stmt.expr, []) };
      default:
        // schema / enum / import / export / break / continue / doc-comment —
        // no expression to resolve.
        return stmt;
    }
  }

  /**
   * Rewrite a `fn` body: its `return` operands and its tail expression are
   * return positions carrying the declared-return sink; every other statement
   * is a fresh context. The return sink is threaded down through nested control
   * blocks so a `return @`…`` deep in the body still sees the declared type.
   */
  private rewriteFnBlock(block: Block, returnFrames: readonly SchemaSinkFrame[]): Block {
    const statements = block.statements.map((stmt) =>
      this.rewriteReturnAware(stmt, returnFrames),
    );
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, returnFrames);
    return { statements, tail };
  }

  /** Rewrite a statement inside a `fn`, applying the return sink to `return`. */
  private rewriteReturnAware(stmt: Stmt, returnFrames: readonly SchemaSinkFrame[]): Stmt {
    switch (stmt.kind) {
      case "return":
        return stmt.operand === null
          ? stmt
          : { ...stmt, operand: this.rewriteExpr(stmt.operand, returnFrames) };
      case "if": {
        const rewriteBranch = (b: Block): Block =>
          ({
            statements: b.statements.map((s) => this.rewriteReturnAware(s, returnFrames)),
            tail: b.tail === null ? null : this.rewriteExpr(b.tail, returnFrames),
          });
        const otherwise =
          stmt.otherwise === null
            ? null
            : "statements" in stmt.otherwise
              ? rewriteBranch(stmt.otherwise)
              : (this.rewriteReturnAware(stmt.otherwise, returnFrames) as IfStmt);
        return {
          ...stmt,
          condition: this.rewriteExpr(stmt.condition, [
            { kind: "stop", label: "if-condition" },
          ]),
          then: rewriteBranch(stmt.then),
          otherwise,
        };
      }
      case "while":
        // A `return` deep in a loop body still targets the fn's implicit return,
        // so the body's STATEMENTS keep the return sink (`rewriteReturnAware`);
        // the loop-body TAIL is not the fn's implicit return, so it rewrites
        // with fresh (sink-less) frames. The condition is an opaque `stop` — the
        // sink never crosses it.
        return {
          ...stmt,
          condition: this.rewriteExpr(stmt.condition, [
            { kind: "stop", label: "while-condition" },
          ]),
          body: this.rewriteLoopBody(stmt.body, returnFrames),
        };
      case "for":
        // Same as `while`: return-aware body statements, sink-less loop tail, an
        // opaque iterand.
        return {
          ...stmt,
          iterand: this.rewriteExpr(stmt.iterand, [
            { kind: "stop", label: "for-iterand" },
          ]),
          body: this.rewriteLoopBody(stmt.body, returnFrames),
        };
      default:
        return this.rewriteStmt(stmt);
    }
  }

  /**
   * Rewrite a loop body inside a `fn`: a `return` deep in the body still targets
   * the fn's implicit return, so each body STATEMENT keeps the return sink; the
   * loop-body TAIL is NOT the fn's implicit return, so it rewrites with fresh
   * (sink-less) frames.
   */
  private rewriteLoopBody(block: Block, returnFrames: readonly SchemaSinkFrame[]): Block {
    const statements = block.statements.map((stmt) =>
      this.rewriteReturnAware(stmt, returnFrames),
    );
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, []);
    return { statements, tail };
  }

  private rewriteIf(stmt: IfStmt): IfStmt {
    const otherwise =
      stmt.otherwise === null
        ? null
        : "statements" in stmt.otherwise
          ? this.rewriteBlock(stmt.otherwise, [])
          : this.rewriteIf(stmt.otherwise);
    return {
      ...stmt,
      condition: this.rewriteExpr(stmt.condition, [{ kind: "stop", label: "if-condition" }]),
      then: this.rewriteBlock(stmt.then, []),
      otherwise,
    };
  }

  /**
   * Rewrite an expression, filling a null-schema query's inferred schema. The
   * `frames` are the innermost-first sink chain enclosing this expression; the
   * per-kind recursion prepends the frame each child sits in (crossed
   * constructs stay transparent, opaque constructs prepend a `stop`).
   */
  private rewriteExpr(expr: Expr, frames: readonly SchemaSinkFrame[]): Expr {
    switch (expr.kind) {
      case "query":
        return this.resolveQuery(expr, frames);
      case "try": {
        // The postfix `?` is transparent (ERR-18): the operand keeps the outer
        // context.
        const operand = this.rewriteExpr(expr.operand, [{ kind: "propagate" }, ...frames]);
        return { ...expr, operand } satisfies TryExpr;
      }
      case "ternary": {
        // Branches cross the ternary (transparent iff the ternary has a sink,
        // which the outer `frames` supply); the condition is opaque.
        return {
          ...expr,
          condition: this.rewriteExpr(expr.condition, [
            { kind: "stop", label: "ternary-condition" },
          ]),
          consequent: this.rewriteExpr(expr.consequent, [{ kind: "ternary" }, ...frames]),
          alternate: this.rewriteExpr(expr.alternate, [{ kind: "ternary" }, ...frames]),
        } satisfies TernaryExpr;
      }
      case "array": {
        // Each element crosses one array-literal level (transparent iff the
        // literal has a sink, supplied by the outer `frames`).
        const elements = expr.elements.map((el) =>
          this.rewriteExpr(el, [{ kind: "array-literal" }, ...frames]),
        );
        return { ...expr, elements } satisfies ArrayExpr;
      }
      case "binary":
        // Binary operators are opaque.
        return {
          ...expr,
          left: this.rewriteExpr(expr.left, [{ kind: "stop", label: expr.op }]),
          right: this.rewriteExpr(expr.right, [{ kind: "stop", label: expr.op }]),
        } satisfies BinaryExpr;
      case "member":
        // Member access is opaque.
        return {
          ...expr,
          target: this.rewriteExpr(expr.target, [{ kind: "stop", label: "member" }]),
        } satisfies MemberExpr;
      case "index":
        // Indexed access is opaque (both receiver and index).
        return {
          ...expr,
          target: this.rewriteExpr(expr.target, [{ kind: "stop", label: "index" }]),
          index: this.rewriteExpr(expr.index, [{ kind: "stop", label: "index" }]),
        } satisfies IndexExpr;
      case "match":
        // The scrutinee is opaque; a `match` arm is neither transparent nor in
        // scope (query-forms.md), so an arm body stops with no sink.
        return {
          ...expr,
          scrutinee: this.rewriteExpr(expr.scrutinee, [
            { kind: "stop", label: "match-scrutinee" },
          ]),
          arms: expr.arms.map((arm) => ({
            ...arm,
            body: this.rewriteExpr(arm.body, [{ kind: "stop", label: "match-arm" }]),
          })),
        } satisfies MatchExpr;
      case "call":
        // A function/tool call argument is matched to a typed parameter; an
        // untyped (or unresolved) parameter yields no sink and the walk stops
        // at the call boundary.
        return {
          ...expr,
          args: expr.args.map((arg, i) =>
            this.rewriteExpr(arg, [this.callArgFrame(expr.callee, i), ...frames]),
          ),
        } satisfies CallExpr;
      case "invoke":
        // DOCUMENTED PARSE-TIME LIMITATION (query-forms.md:41 lists invoke args
        // as a sink): an `invoke(...)` targets an external `.loom` resolved at
        // load/runtime, so its parameter types are NOT present in this
        // single-file parse. Each argument therefore stays an untyped call-arg
        // and the walk stops at the call boundary — only local `fn` call-args
        // are statically resolvable (see `callArgFrame`).
        return {
          ...expr,
          args: expr.args.map((arg) =>
            this.rewriteExpr(arg, [{ kind: "call-arg" }, ...frames]),
          ),
        } satisfies InvokeExpr;
      case "object":
        // Object construction is not a transparent sink position; each field
        // value stops with no sink.
        return {
          ...expr,
          fields: expr.fields.map((field) => ({
            ...field,
            value: this.rewriteExpr(field.value, [{ kind: "stop", label: "object-field" }]),
          })),
        } satisfies ObjectExpr;
      case "result-ctor":
        // `Ok(…)` / `Err(…)` is not a transparent sink position.
        return {
          ...expr,
          arg: this.rewriteExpr(expr.arg, [{ kind: "stop", label: expr.ctor }]),
        } satisfies ResultCtorExpr;
      case "method-call":
        // A stdlib method receiver is opaque; its arguments are untyped
        // call-args (the builtin parameter types are not carried in the AST).
        return {
          ...expr,
          target: this.rewriteExpr(expr.target, [{ kind: "stop", label: "member" }]),
          args: expr.args.map((arg) => this.rewriteExpr(arg, [{ kind: "call-arg" }])),
        } satisfies MethodCallExpr;
      default:
        // ident / number / string / bool / null — no nested query.
        return expr;
    }
  }

  /**
   * The `call-arg` frame for argument `index` of a call to `callee`.
   *
   * DOCUMENTED PARSE-TIME LIMITATION (query-forms.md:41): only a call to a local
   * `fn` in this file is statically resolvable to a typed parameter. A tool call
   * is also a `CallExpr`, but tool signatures live in the host tool registry,
   * not in this single-file parse; likewise `invoke` targets external `.loom`
   * files resolved at load/runtime. Those args therefore have no resolvable
   * parameter type here and stay untyped (the walk stops at the call boundary).
   */
  private callArgFrame(callee: string, index: number): SchemaSinkFrame {
    const fn = this.fns.get(callee);
    if (fn === undefined) {
      // Not a local `fn` — a tool call (registry-resolved) or unknown callee;
      // its parameter types are not in this parse, so the arg stays untyped.
      return { kind: "call-arg" };
    }
    const param = fn.params[index];
    if (param === undefined || param.type.length === 0) {
      return { kind: "call-arg" };
    }
    // `exactOptionalPropertyTypes`: an object/union param is not representable
    // in `InferredSchema` (undefined) — omit `paramType` so the walk stops at
    // the untyped call boundary.
    const paramType = annotationToInferred(param.type);
    return paramType === undefined
      ? { kind: "call-arg" }
      : { kind: "call-arg", paramType };
  }

  /** Fill a null-schema query from its enclosing sink; leave a typed one intact. */
  private resolveQuery(expr: QueryExpr, frames: readonly SchemaSinkFrame[]): QueryExpr {
    if (expr.schema !== null) {
      // QRY-3 — an explicit ascription (or a direct-let propagation) always
      // wins; do not overwrite.
      return expr;
    }
    const inferred = inferQuerySchema({ frames });
    if (inferred === undefined) {
      return expr;
    }
    return { ...expr, schema: serializeInferred(inferred) };
  }

  /**
   * QRY-4 §"Explicit form" — when a `let x: T = @<S>`…`` binding carries both a
   * declared annotation `T` and an explicit ascription `S` on the RHS query,
   * emit `loom/parse/explicit-schema-mismatch` iff `S ⋢ T` (a wider binding
   * annotation is silently allowed; either side past the static view is
   * skipped). A direct-let propagation makes `S === T`, so it never fires.
   */
  private checkLetMismatch(init: Expr, annotationSource: string | null): void {
    if (annotationSource === null || annotationSource.length === 0) {
      return;
    }
    const query = unwrapToQuery(init);
    if (query === null || query.schema === null) {
      return;
    }
    const ascription = annotationToCompatType(query.schema);
    const annotation = annotationToCompatType(annotationSource);
    if (ascription === undefined || annotation === undefined) {
      return;
    }
    this.diagnostics.push(
      ...checkExplicitSchemaMismatch({
        ascription,
        annotation,
        env: this.env,
        site: { file: this.file, range: query.range },
      }),
    );
  }
}

/**
 * Peel the transparent wrappers a typed `let` RHS query may sit behind to reach
 * the query itself: the postfix `?` (`let x: T = @`…`?` parses to `try(query)`).
 * Returns the query, or `null` when the RHS is not a (wrapped) query.
 */
function unwrapToQuery(expr: Expr): QueryExpr | null {
  if (expr.kind === "query") {
    return expr;
  }
  if (expr.kind === "try") {
    return unwrapToQuery(expr.operand);
  }
  return null;
}

/**
 * Adapter (a) — project a verbatim annotation source to the `InferredSchema`
 * model, reusing the vetted `annotationToCompatType` type parser. `InferredSchema`
 * models only primitive / named / `array<T>` shapes: an object (`{…}`) or union
 * (`A | B`) sink cannot be named as an `InferredSchema`, so a query at an
 * INDIRECT position under such a sink stays untyped (its `schema` remains null →
 * `string`). This is the accepted advanced-position limit (query-forms.md); the
 * direct `let x: T = @` path keeps full string support via `parseLet`.
 */
function annotationToInferred(source: string): InferredSchema | undefined {
  // An inline object type (`{ a: string }`) is not representable in
  // `InferredSchema`; `annotationToCompatType` would mis-read it as a `named`
  // reference, so guard it here (the query stays untyped at an indirect object
  // sink — the documented advanced-position limit).
  if (source.trim().startsWith("{")) {
    return undefined;
  }
  return compatToInferred(annotationToCompatType(source));
}

/** Project a `CompatType` to the `InferredSchema` model (see `annotationToInferred`). */
function compatToInferred(type: CompatType | undefined): InferredSchema | undefined {
  if (type === undefined) {
    return undefined;
  }
  switch (type.kind) {
    case "prim":
      return { kind: "primitive", name: type.name };
    case "named":
      // `annotationToCompatType` maps any unrecognised text to `named`, so a
      // non-identifier "name" is really an inline object (`{a: string}`), a
      // union (`A|B`), or another shape `InferredSchema` cannot represent (e.g.
      // as an `array<T>` element). Reject anything that is not a plain schema
      // identifier so such sinks stay UNTYPED (schema null → `string`), matching
      // the top-level object/union limit.
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(type.name)
        ? { kind: "named", name: type.name }
        : undefined;
    case "array": {
      const element = compatToInferred(type.element);
      return element === undefined ? undefined : { kind: "array", element };
    }
    case "union":
    case "object":
    case "literal":
      // Not representable in `InferredSchema`; the query stays untyped.
      return undefined;
  }
}

/** Adapter (b) — serialize an `InferredSchema` back to `QueryExpr.schema` text. */
function serializeInferred(schema: InferredSchema): string {
  switch (schema.kind) {
    case "primitive":
    case "named":
      return schema.name;
    case "array":
      return `array<${serializeInferred(schema.element)}>`;
  }
}
