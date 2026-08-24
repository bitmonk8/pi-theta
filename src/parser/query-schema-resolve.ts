// V13b integration — the post-parse whole-body pass that resolves each typed
// query's INDIRECT response schema from the surrounding type context (QRY-2)
// and emits the QRY-4 explicit-schema-mismatch warning.
//
// The recursive-descent body parser has no frame-stack at any single query
// parse site, so the four indirect sink positions (query-forms.md §"Schema
// inference algorithm") cannot be resolved inline. This pass is the required
// whole-body pass: it walks the parsed `ThetaBody`, builds the innermost-first
// `SchemaSinkFrame` chain enclosing each query, calls `resolveQuerySchemaSink`,
// and — Option B (tree-rebuild) — returns a body whose `QueryExpr.schema` is
// filled from the serialized inferred schema. It also reports which written
// annotation reached which query (`QueryPropagation`), so a consumer that owes
// one verdict per written annotation can attribute a query's schema back to its
// source capture instead of guessing at the frame set from the outside. `QueryExpr.schema: string` therefore
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
import type { SourceRange } from "../diagnostics/diagnostic";
import type {
  ArrayExpr,
  BinaryExpr,
  Block,
  Expr,
  FnDecl,
  IfStmt,
  InvokeExpr,
  ThetaBody,
  MatchExpr,
  MemberExpr,
  MethodCallExpr,
  ObjectExpr,
  ParForExpr,
  QueryExpr,
  ResultCtorExpr,
  Stmt,
  TernaryExpr,
  TryExpr,
  IndexExpr,
  CallExpr,
} from "./theta-document";
import {
  checkExplicitSchemaMismatch,
  resolveQuerySchemaSink,
  type InferredSchema,
  type SchemaSinkFrame,
} from "./query-schema-inference";
import {
  annotationSourceIsNotTypeExpression,
  annotationToCompatType,
  collectTypeEnv,
} from "./type-layer-checks";
import type { CompatType, TypeEnv } from "./type-compat";

/**
 * The source capture whose written annotation reached a schema-less query.
 * `range` is the CAPTURE's own declaration range, which is the identity a
 * consumer attributes the propagation back by: two distinct declarations cannot
 * share one range, and the range survives this pass's tree rebuild untouched.
 */
export type PropagationCapture =
  | { readonly kind: "let"; readonly range: SourceRange }
  | { readonly kind: "fn-return"; readonly range: SourceRange }
  | { readonly kind: "fn-param"; readonly range: SourceRange; readonly paramIndex: number };

/**
 * One annotation text this pass carried onto a query the author left
 * schema-less, attributed to the capture that supplied it.
 *
 * This report is the authoritative answer to "did the annotation written HERE
 * end up on a query?". A consumer deciding whether a capture must withhold
 * something for propagated text reads this list rather than re-deriving the
 * propagation set from the AST: the crossed constructs (a ternary branch, an
 * array-literal element, the postfix `?`, a block tail, a `return` operand at
 * any control-flow depth) are stated once, in this pass's own walk.
 */
export interface QueryPropagation {
  readonly capture: PropagationCapture;
  /** The capture's verbatim written annotation text. */
  readonly annotationSource: string;
  /** The range of the query the text reached. */
  readonly queryRange: SourceRange;
}

/** The resolved body, the QRY-4 diagnostics, and the propagation report. */
export interface ResolveQuerySchemasResult {
  readonly body: ThetaBody;
  readonly diagnostics: readonly Diagnostic[];
  readonly propagations: readonly QueryPropagation[];
}

/**
 * A sink frame carrying the capture it came from. The origin rides on the frame
 * so the supplying capture is read straight off `resolveQuerySchemaSink`'s
 * answer: the pass that decides which frame wins is the pass that reports the
 * propagation, and no second traversal can disagree with it.
 */
interface FrameOrigin {
  readonly capture: PropagationCapture;
  readonly annotationSource: string;
}

type OriginFrame = SchemaSinkFrame & { readonly origin?: FrameOrigin };

/**
 * Resolve every INDIRECT typed query's response schema in `body` (QRY-2) and
 * collect the QRY-4 explicit-schema-mismatch warnings. Returns a rebuilt body
 * whose null-schema queries at a resolvable sink carry the inferred annotation
 * text; queries that already carry a schema (an explicit `@<Schema>` ascription
 * or a direct-let propagation) are left untouched.
 */
export function resolveQuerySchemas(
  body: ThetaBody,
  file: string,
): ResolveQuerySchemasResult {
  const env = collectTypeEnv(body.statements);
  const fns = collectFns(body.statements);
  const walk = new QuerySchemaResolveWalk(file, env, fns);
  const resolved = walk.rewriteBlock(body, []);
  return {
    body: resolved,
    diagnostics: walk.diagnostics,
    propagations: walk.propagations,
  };
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
  public readonly propagations: QueryPropagation[] = [];

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
  public rewriteBlock(block: Block, tailFrames: readonly OriginFrame[]): Block {
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
        // `parseLet`'s DIRECT `let x: T = @`…`` fast path has already written
        // the annotation onto the query by the time this pass runs, so the
        // rewrite below leaves that query untouched (QRY-3, "direct wins") and
        // would report nothing for it. It is reported here instead, so the
        // propagation report answers for every route a written `let`
        // annotation reaches a query by — the one authoritative set.
        this.recordDirectLetPropagation(stmt);
        const origin: FrameOrigin | undefined =
          stmt.annotation === null
            ? undefined
            : {
                capture: { kind: "let", range: stmt.range },
                annotationSource: stmt.annotation,
              };
        const frames: readonly OriginFrame[] =
          annotation === undefined || origin === undefined
            ? []
            : [{ kind: "let", annotation, origin }];
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
        // its `return` operands; a `.theta`/undeclared return supplies none.
        // A ROOT `void` return type supplies none either: `grammar.md:89` admits
        // `void` at the return position only (nowhere else), and FN-4
        // (`functions.md`) says a `void` return DISCARDS the tail value rather
        // than typing it — a discarded value is not a value type, so `void`
        // here is not a QRY-2 sink and the query falls to `query-forms.md:35`'s
        // untyped fallback (`schema` stays null → `string`), exactly as the
        // undeclared-return case just above. This check is ROOT-only and reads
        // the written source text directly (not through `annotationToInferred`)
        // on purpose: a nested `void` (`array<void>`) or a `void` parameter type
        // is illegal at its own written site, and that site's own diagnostic is
        // the one true verdict for it (bug 0220 §Non-goals / §Reproduction (c)
        // v12, v17) — narrowing `annotationToInferred`, `compatToInferred` or
        // `PRIMITIVE_NAMES` would also blind the `let` and call-argument sinks
        // those adapters share, which is not this bug's fix.
        const returnType =
          stmt.returnType === null ||
          stmt.returnType.length === 0 ||
          stmt.returnType.trim() === "void"
            ? undefined
            : annotationToInferred(stmt.returnType);
        // `exactOptionalPropertyTypes`: omit `returnType` when undefined so the
        // frame stays assignable to the optional-property `fn-return` shape.
        const fnFrames: readonly OriginFrame[] = [
          returnType === undefined || stmt.returnType === null
            ? { kind: "fn-return" }
            : {
                kind: "fn-return",
                returnType,
                origin: {
                  capture: { kind: "fn-return", range: stmt.range },
                  annotationSource: stmt.returnType,
                },
              },
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
  private rewriteFnBlock(block: Block, returnFrames: readonly OriginFrame[]): Block {
    const statements = block.statements.map((stmt) =>
      this.rewriteReturnAware(stmt, returnFrames),
    );
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, returnFrames);
    return { statements, tail };
  }

  /** Rewrite a statement inside a `fn`, applying the return sink to `return`. */
  private rewriteReturnAware(stmt: Stmt, returnFrames: readonly OriginFrame[]): Stmt {
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
  private rewriteLoopBody(block: Block, returnFrames: readonly OriginFrame[]): Block {
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
  private rewriteExpr(expr: Expr, frames: readonly OriginFrame[]): Expr {
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
        // as a sink): an `invoke(...)` targets an external `.theta` resolved at
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
      case "block":
        // A block expression's value IS its tail, so the tail sits in the
        // frames enclosing the block itself — a query written as the tail of a
        // `let x: T = { … }` resolves against `T` exactly as it would one brace
        // level up. The block's own statements are fresh contexts, like any
        // other block's.
        return { ...expr, body: this.rewriteBlock(expr.body, frames) };
      case "par-for":
        // Mirrors `rewriteStmt`'s `case "for"`: the iterand (and, unique to the
        // expression form, `max`) evaluate in the ENCLOSING scope, so each gets
        // its own opaque `stop` frame rather than sharing one — a sibling binary
        // operand or call argument does not leak into the other. The body's
        // tail-frame list is EMPTY, not `frames`: CTRL-3 (control-flow.md:74)
        // types the whole construct as `array<Result<T, QueryError>>`, `T` the
        // body tail type, so an enclosing annotation is never the tail's sink —
        // unlike `case "block"` above, where the block's value IS its tail.
        return {
          ...expr,
          iterand: this.rewriteExpr(expr.iterand, [{ kind: "stop", label: "for-iterand" }]),
          max:
            expr.max === null
              ? null
              : this.rewriteExpr(expr.max, [{ kind: "stop", label: "par-for-max" }]),
          body: this.rewriteBlock(expr.body, []),
        } satisfies ParForExpr;
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
   * not in this single-file parse; likewise `invoke` targets external `.theta`
   * files resolved at load/runtime. Those args therefore have no resolvable
   * parameter type here and stay untyped (the walk stops at the call boundary).
   */
  private callArgFrame(callee: string, index: number): OriginFrame {
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
      : {
          kind: "call-arg",
          paramType,
          // The propagated text is the CALLEE's parameter annotation, written
          // at the `fn` declaration — so the origin names that declaration and
          // the parameter's position in its list, not the call site.
          origin: {
            capture: { kind: "fn-param", range: fn.range, paramIndex: index },
            annotationSource: param.type,
          },
        };
  }

  /**
   * Report `parseLet`'s direct `let x: T = @`…`` propagation (the postfix-`?`
   * spelling included, which parses to `try(query)`), which happens at parse
   * time and so is invisible to the rewrite below.
   */
  private recordDirectLetPropagation(stmt: Extract<Stmt, { kind: "let" }>): void {
    if (stmt.annotation === null || stmt.init === null) {
      return;
    }
    const query = unwrapToQuery(stmt.init);
    if (query === null || query.schemaFromLetAnnotation !== true) {
      return;
    }
    this.propagations.push({
      capture: { kind: "let", range: stmt.range },
      annotationSource: stmt.annotation,
      queryRange: query.range,
    });
  }

  /** Fill a null-schema query from its enclosing sink; leave a typed one intact. */
  private resolveQuery(expr: QueryExpr, frames: readonly OriginFrame[]): QueryExpr {
    if (expr.schema !== null) {
      // QRY-3 — an explicit ascription (or a direct-let propagation) always
      // wins; do not overwrite.
      return expr;
    }
    const sink = resolveQuerySchemaSink({ frames });
    if (sink === undefined) {
      return expr;
    }
    const origin = (sink.frame as OriginFrame | undefined)?.origin;
    if (origin !== undefined) {
      this.propagations.push({
        capture: origin.capture,
        annotationSource: origin.annotationSource,
        queryRange: expr.range,
      });
    }
    return { ...expr, schema: serializeInferred(sink.schema) };
  }

  /**
   * QRY-4 §"Explicit form" — when a `let x: T = @<S>`…`` binding carries both a
   * declared annotation `T` and an explicit ascription `S` on the RHS query,
   * emit `theta/parse/explicit-schema-mismatch` iff `S ⋢ T` (a wider binding
   * annotation is silently allowed; either side past the static view is
   * skipped). A direct-let propagation makes `S === T`, so it never fires.
   *
   * `annotationSource` is read verbatim off the AST with no derived carrier
   * between it and the text, so — like the six sites
   * `annotationSourceIsNotTypeExpression` already gates in `type-layer-checks.ts`
   * (`checkSubagentReturnAnnotation`, `checkFnCallArgs`, and the rest) — this
   * method must establish the absence itself rather than inherit it: a
   * refused annotation is ABSENT to every downstream consumer the recogniser
   * reaches, and a verdict computed from it is a verdict computed from text
   * that does not exist. The guard below sits ahead of the `unwrapToQuery`
   * peel so the postfix-`?` spelling is refused the same as the direct one.
   */
  private checkLetMismatch(init: Expr, annotationSource: string | null): void {
    if (annotationSource === null || annotationSource.length === 0) {
      return;
    }
    if (annotationSourceIsNotTypeExpression(annotationSource)) {
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
