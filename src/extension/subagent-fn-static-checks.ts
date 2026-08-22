// Load-time (compose-pass) wiring for the RFC 0001 `subagent fn` static checks.
// A `subagent fn` reuses the existing `invoke` load machinery verbatim — RFC
// 0001 coins NO new diagnostic code — so each check here routes through the same
// unit-tested checker the cross-file `invoke` path uses, differing only in that
// the "callee" is an INLINE function name in the same file rather than a
// separate `.theta` path:
//
//   - FN-6 self-reference ban — `detectInvocationCycle` over a per-file graph
//     whose nodes are the file's `subagent fn` names and whose edges are the
//     in-body calls between them. A `subagent fn` that references itself is a
//     length-1 `theta/load/invocation-cycle` (`step → step`); a mutual cycle
//     `a → b → a` fires the same way. An error-severity cycle un-registers the
//     enclosing theta (the load-time bound on unbounded subagent recursion,
//     mirroring INV-4's un-registration of a self-cyclic `.theta`).
//   - FN-6 broken inline body — `checkCalleeHasErrors` naming the FUNCTION (a
//     bare name, never a `.theta` path). A `subagent fn` whose body carries an
//     error-severity parse / type diagnostic is a callee-with-errors, just an
//     inline one; it un-registers the enclosing theta through the existing
//     `theta/load/callee-has-errors` code (`surface: "tools"` → error severity,
//     since an inline callable that cannot be created blocks registration the
//     same way a `tools:` `.theta` entry does).
//
// Spec: rfcs/0001-subagent-fn.md (§Diagnostics), functions.md §"`subagent fn`"
// (FN-6), invocation.md §"Cycle detection", diagnostics/code-registry-load.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  Block,
  CallExpr,
  Expr,
  FnDecl,
  Stmt,
  ThetaBody,
} from "../parser/theta-document";
import type { ModelReferenceMatcher } from "../parser/frontmatter";
import { checkCalleeHasErrors } from "../parser/invoke-diagnostics";
import {
  detectInvocationCycle,
  type InvokeGraph,
} from "../runtime/invoke-depth-cycle";

/** Every top-level `subagent fn` declaration in a parsed theta body (FN-6/FN-1). */
export function collectSubagentFns(body: ThetaBody): FnDecl[] {
  const out: FnDecl[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "fn" && stmt.subagent === true) {
      out.push(stmt);
    }
  }
  return out;
}

/**
 * Collect every `<name>(args)` call callee reachable in a block, walking the
 * whole statement / expression tree (nested blocks, conditions, arms, arguments
 * included). Used to find the in-body calls a `subagent fn` makes to sibling
 * `subagent fn`s for the self-reference / mutual-cycle graph.
 */
function collectCallCallees(block: Block): string[] {
  const out: string[] = [];
  walkBlock(block, out);
  return out;
}

function walkBlock(block: Block, out: string[]): void {
  for (const stmt of block.statements) {
    walkStmt(stmt, out);
  }
  if (block.tail !== null) {
    walkExpr(block.tail, out);
  }
}

function walkStmt(stmt: Stmt, out: string[]): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) walkExpr(stmt.init, out);
      return;
    case "reassign":
      walkExpr(stmt.value, out);
      return;
    case "if":
      walkExpr(stmt.condition, out);
      walkBlock(stmt.then, out);
      if (stmt.otherwise !== null) {
        if ("kind" in stmt.otherwise) walkStmt(stmt.otherwise, out);
        else walkBlock(stmt.otherwise, out);
      }
      return;
    case "while":
      walkExpr(stmt.condition, out);
      walkBlock(stmt.body, out);
      return;
    case "for":
      walkExpr(stmt.iterand, out);
      walkBlock(stmt.body, out);
      return;
    case "fn":
      walkBlock(stmt.body, out);
      return;
    case "return":
      if (stmt.operand !== null) walkExpr(stmt.operand, out);
      return;
    case "tool-call":
      walkExpr(stmt.call, out);
      return;
    case "invoke":
      walkExpr(stmt.invoke, out);
      return;
    case "expr":
      walkExpr(stmt.expr, out);
      return;
    default:
      return;
  }
}

function walkExpr(expr: Expr, out: string[]): void {
  switch (expr.kind) {
    case "call":
      out.push((expr as CallExpr).callee);
      for (const arg of (expr as CallExpr).args) walkExpr(arg, out);
      return;
    case "array":
      for (const el of expr.elements) walkExpr(el, out);
      return;
    case "binary":
      walkExpr(expr.left, out);
      walkExpr(expr.right, out);
      return;
    case "ternary":
      walkExpr(expr.condition, out);
      walkExpr(expr.consequent, out);
      walkExpr(expr.alternate, out);
      return;
    case "try":
      walkExpr(expr.operand, out);
      return;
    case "invoke":
      for (const arg of expr.args) walkExpr(arg, out);
      return;
    case "member":
      walkExpr(expr.target, out);
      return;
    case "index":
      walkExpr(expr.target, out);
      walkExpr(expr.index, out);
      return;
    case "object":
      for (const field of expr.fields) walkExpr(field.value, out);
      return;
    case "match":
      walkExpr(expr.scrutinee, out);
      for (const arm of expr.arms) walkExpr(arm.body, out);
      return;
    case "result-ctor":
      walkExpr(expr.arg, out);
      return;
    case "method-call":
      walkExpr(expr.target, out);
      for (const arg of expr.args) walkExpr(arg, out);
      return;
    case "par-for":
      walkExpr(expr.iterand, out);
      if (expr.max !== null) walkExpr(expr.max, out);
      walkBlock(expr.body, out);
      return;
    case "block":
      // A spawn routed through a block expression is a spawn: without this arm
      // the FN-6 graph loses the edge and a cycle through a block escapes the
      // load-time refusal.
      walkBlock(expr.body, out);
      return;
    default:
      return;
  }
}

/**
 * Build the per-file `subagent fn` invocation graph (FN-6). Nodes are the file's
 * `subagent fn` names; an edge `a → b` exists when `a`'s body calls `b` and `b`
 * is itself a `subagent fn` declared in the same file. A `subagent fn` calling a
 * PLAIN `fn` (inline, runs in the caller's session — not a spawned boundary) is
 * not an edge; only spawned-boundary calls count toward the cycle, exactly as
 * only `.theta`/`.thetalib` boundary crossings count for the cross-file graph.
 */
export function buildSubagentFnGraph(fns: readonly FnDecl[]): InvokeGraph {
  const subagentNames = new Set(fns.map((fn) => fn.name));
  const edges = new Map<string, readonly string[]>();
  for (const fn of fns) {
    const targets = collectCallCallees(fn.body).filter((callee) =>
      subagentNames.has(callee),
    );
    edges.set(fn.name, targets);
  }
  return { edges, unresolvable: new Set<string>() };
}

/** Inputs to the `subagent fn` load-time static resolution check. */
export interface SubagentFnStaticCheckInput {
  /** The parsed theta body carrying the top-level `subagent fn` declarations. */
  readonly body: ThetaBody;
  /** The enclosing theta source file (for the located referencing sites). */
  readonly file: string;
  /**
   * Error-severity diagnostics from the enclosing file's own parse (aggregated
   * at the document level). A `subagent fn` whose declaration span contains any
   * of these has a broken inline body (FN-6 broken-body → callee-has-errors).
   */
  readonly parseDiagnostics: readonly Diagnostic[];
}

/**
 * Whether `range` (a diagnostic's located range) falls within the `fn`
 * declaration's source span — the test used to attribute an error-severity
 * parse diagnostic to a specific `subagent fn`'s inline body.
 */
function withinFn(fn: FnDecl, diagnostic: Diagnostic): boolean {
  if (diagnostic.range === undefined) {
    return false;
  }
  const s = fn.range.start;
  const e = fn.range.end;
  const p = diagnostic.range.start;
  const afterStart =
    p.line > s.line || (p.line === s.line && p.column >= s.column);
  const beforeEnd = p.line < e.line || (p.line === e.line && p.column <= e.column);
  return afterStart && beforeEnd;
}

/**
 * Run the RFC 0001 `subagent fn` load-time static checks for one parsed theta,
 * returning every diagnostic (an error-severity entry un-registers the theta):
 *
 *   - FN-6 self-reference / mutual cycle (`theta/load/invocation-cycle`) via the
 *     per-file `subagent fn` graph walk — a self-edge `step → step` is a
 *     length-1 cycle;
 *   - FN-6 broken inline body (`theta/load/callee-has-errors`, naming the
 *     function) for a `subagent fn` whose declaration span contains an
 *     error-severity parse / type diagnostic.
 */
export function checkSubagentFnStaticResolution(
  input: SubagentFnStaticCheckInput,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const fns = collectSubagentFns(input.body);
  if (fns.length === 0) {
    return diagnostics;
  }
  const graph = buildSubagentFnGraph(fns);
  for (const fn of fns) {
    // FN-6 broken inline body: a `subagent fn` whose span holds an error is a
    // callee-with-errors — surfaced through the existing code, naming the
    // FUNCTION (a bare name, never a `.theta` path). `surface: "tools"` selects
    // the error severity: an inline callable that cannot be created blocks the
    // enclosing theta's registration exactly as a broken `tools:` `.theta` entry.
    const bodyErrors = input.parseDiagnostics.filter(
      (d) => d.severity === "error" && withinFn(fn, d),
    );
    if (bodyErrors.length > 0) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: fn.name,
          surface: "tools",
          hasErrors: true,
          relatedSites: bodyErrors.map((d) => ({
            file: d.file ?? input.file,
            range: d.range ?? fn.range,
            message: d.message,
          })),
          site: { file: input.file, range: fn.range },
        }),
      );
      // A broken body is not walked for cycles (a leaf, like an unresolvable
      // `.theta` callee); move on.
      continue;
    }

    // FN-6 self-reference / mutual cycle: a self-edge `step → step` is a
    // length-1 `theta/load/invocation-cycle`, coining no new code.
    const cycle = detectInvocationCycle(fn.name, graph);
    if (cycle !== undefined) {
      diagnostics.push(cycle);
    }
  }
  return diagnostics;
}

/**
 * RFC 0001 FN-7 `with { model }` load-time validation. Frontmatter `model:` is
 * resolved against the available model set at LOAD (frontmatter.ts →
 * `theta/load/model-unresolved`); a `subagent fn`'s `with { model }` OVERRIDE
 * must be held to the same bar rather than silently falling back to the
 * inherited session model at runtime (which masked an unresolvable reference).
 * For each `subagent fn` whose `with { … }` clause EXPLICITLY names `model`,
 * resolve that override through the SAME injected `ModelReferenceMatcher` the
 * frontmatter path uses and emit the identical `theta/load/model-unresolved`
 * diagnostic on no-match / ambiguity — un-registering the enclosing theta. A
 * `subagent fn` with no `model` override (inherits the already-validated
 * frontmatter model) is skipped.
 */
export function checkSubagentFnModelOverrides(
  fns: readonly FnDecl[],
  file: string,
  matcher: ModelReferenceMatcher,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const fn of fns) {
    const modelField = (fn.withClause ?? []).find((field) => field.key === "model");
    if (modelField === undefined) {
      continue;
    }
    // The override string as resolved by the parser (parse already flagged a
    // non-string model value); absent ⇒ nothing further to validate here.
    const reference = fn.sessionConfig?.model;
    if (reference === undefined) {
      continue;
    }
    if (matcher.resolve(reference) !== "resolved") {
      diagnostics.push({
        severity: "error",
        code: "theta/load/model-unresolved",
        file,
        range: modelField.value.range,
        message: `subagent fn 'with { model }' value '${reference}' resolves to no available model, or is ambiguous across providers`,
      });
    }
  }
  return diagnostics;
}
