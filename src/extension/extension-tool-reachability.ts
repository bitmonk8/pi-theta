// RFC-0006 (PIC-61 rung 3) — LOAD-time code-side extension-tool reachability.
//
// PIC-61 pins a fail-closed code-side extension-tool dispatch ladder: rung 1 the
// upstream `pi.getToolDefinition` registry read, rung 2 host-loop dispatch, and —
// when NEITHER rung is available — rung 3: "a theta whose code calls an extension
// tool refuses to register with `theta/load/extension-tool-unreachable` (the
// runtime never silently falls through)". This module owns the LOAD-time
// realisation of rung 3 (spec option (a)): at theta registration, when the
// dispatch-ladder probe yields `unreachable` AND the theta body statically
// contains a code-side call (`<name>(args)`) to a callable-set EXTENSION tool,
// the theta does not register and the pinned diagnostic is emitted.
//
// SCOPE OF THE WALK (root body only, and why that is complete). The walk covers
// the theta's ROOT body — its top-level statements/tail and every nested block,
// including LOCAL `fn` bodies. It does NOT descend into imported `.thetalib` `fn`
// bodies, and it does not need to: an imported `fn` cannot statically name a
// caller-scoped extension tool. A `.thetalib` is parsed standalone with no
// frontmatter `tools:` of its own, so a bare `<extension-tool>(args)` call in an
// imported `fn` body resolves against nothing in scope and fails the `.thetalib`
// parse with `theta/parse/unknown-identifier` — which un-registers the IMPORTING
// theta at import resolution, strictly before this check runs. The transitive-
// import code-side extension-tool call therefore cannot arise; the asymmetry with
// the `.theta` content-hash closure (which hashes file CONTENT for tamper
// detection, a distinct purpose) is not a reachability gap. The runtime
// `#dispatchExtensionToolChildSide` refusal remains the fail-closed floor for any
// path that bypasses this load check.
//
// SCOPE. The load-registry row and PIC-61 rung 3 state the rule context-generally
// ("A theta whose **code** calls an extension-registered Pi tool … the theta does
// **not** register"), with no restriction to the child. This check therefore runs
// at EVERY registration (parent and spawned-child processes alike), and is
// naturally scoped to subagent-mode thetas because only subagent-mode admission
// widens the callable set to `pi.getAllTools()` extension tools — a prompt-mode
// extension-tool `tools:` entry already fails load with `theta/load/unknown-tool`
// before this check, so it holds no extension-tool callable to detect.
//
// The runtime-dispatch refusal in the producer's `#dispatchExtensionToolChildSide`
// remains as a defence-in-depth backstop; once this load-time refusal exists the
// runtime path is unreachable for a registered theta.
//
// Spec: pi-integration-contract/subagent.md (PIC-61 #pic-61,
// #subagent-host-loop-dispatch), diagnostics/code-registry-load.md
// (`theta/load/extension-tool-unreachable`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  Block,
  CallExpr,
  Expr,
  Stmt,
  ThetaBody,
} from "../parser/theta-document";
import {
  resolveDispatchLadder,
  type DispatchLadderProbe,
} from "../runtime/host-loop-dispatch";

/**
 * Collect every code-side `<name>(args)` call callee name reachable in a theta
 * body — the whole statement / expression tree (top-level statements + tail,
 * nested blocks, conditions, arms, arguments, `fn` bodies, `par for` bodies).
 * Mirrors the `subagent fn` self-reference-cycle walker's traversal; a `call`
 * node is the code-side tool-call surface (`<name>(args)`), distinct from
 * `invoke` / `method-call` / `query`.
 */
export function collectCodeSideCallNames(body: ThetaBody): Set<string> {
  const out = new Set<string>();
  walkBlock(body, out);
  return out;
}

function walkBlock(block: Block, out: Set<string>): void {
  for (const stmt of block.statements) {
    walkStmt(stmt, out);
  }
  if (block.tail !== null) {
    walkExpr(block.tail, out);
  }
}

function walkStmt(stmt: Stmt, out: Set<string>): void {
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

function walkExpr(expr: Expr, out: Set<string>): void {
  switch (expr.kind) {
    case "call":
      out.add((expr as CallExpr).callee);
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
    default:
      return;
  }
}

/** Inputs to the load-time code-side extension-tool reachability check. */
export interface ExtensionToolReachabilityInput {
  /** The parsed theta body walked for code-side `<name>(args)` call sites. */
  readonly body: ThetaBody;
  /**
   * The presented callable names (post-`as` rename) in the theta's callable set
   * that resolved to EXTENSION tools (admitted via `pi.getAllTools()`, not host
   * built-ins, not `.theta` callees).
   */
  readonly extensionToolNames: ReadonlySet<string>;
  /** The code-side dispatch-ladder probe (rung availability). */
  readonly probe: DispatchLadderProbe;
  /** The enclosing theta source file, for the located diagnostic. */
  readonly file: string;
}

/**
 * PIC-61 rung 3 (load-time). For each callable-set extension tool the body calls
 * from CODE (`<name>(args)`), resolve the dispatch ladder; when no rung is
 * available emit `theta/load/extension-tool-unreachable` (error-severity, so the
 * caller un-registers the theta). A theta that only reaches its extension tools
 * MODEL-facing (via an `@`-query) holds no code-side call site here and is
 * unaffected. Returns `[]` when the theta declares no extension-tool callable or
 * never calls one from code. Scope is the root body (see the module header): an
 * imported `.thetalib` `fn` cannot statically name a caller-scoped extension tool.
 */
export function checkExtensionToolReachability(
  input: ExtensionToolReachabilityInput,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (input.extensionToolNames.size === 0) {
    return diagnostics;
  }
  const called = collectCodeSideCallNames(input.body);
  for (const name of input.extensionToolNames) {
    if (!called.has(name)) {
      continue;
    }
    const resolution = resolveDispatchLadder(name, input.probe);
    if (resolution.kind === "unreachable") {
      // Locate the pinned refusal at the enclosing theta file.
      diagnostics.push({ ...resolution.diagnostic, file: input.file });
    }
  }
  return diagnostics;
}
