// Load-time (compose-pass) wiring for the invoke static checks the shipped
// pipeline previously never ran (invocation.md §Argument arity / §Resolution /
// §Cycle detection). Each check reuses an existing, unit-tested checker rather
// than reimplementing it:
//
//   - INV-3 — `checkInvokeArity` over each `invoke("./x.theta", …)` site AND
//     each `.theta`-callable call site (`<name>(args)` for a `tools:` `.theta`
//     entry) against the statically-resolved callee's `params:` counts
//     (`theta/parse/invoke-arity-too-many` / `-too-few`; tool-calls.md
//     §"Argument shape" binds both call surfaces to these codes by name).
//   - INV-4 — `detectInvocationCycle` over the per-load-pass static-resolution
//     graph (`theta/load/invocation-cycle`); a self-cycle or an A→B→A cycle
//     un-registers the entry theta, which is what keeps a self-referential theta
//     from driving pure unbounded invoke recursion at runtime.
//   - INV-5 — `checkInvokePathAtLoad` (the shared realpath + discovery-root
//     containment check) so a callee resolving outside every active discovery
//     root is `theta/load/invoke-path-escape` and the parent does not register.
//
// The invoke-graph is keyed by discovered slash name (unique per registration),
// so the cycle message renders `invocation cycle: A → B → A` per the spec prose.
//
// Spec: invocation.md (§Argument arity, §Resolution, §Static resolution,
// §Cycle detection), diagnostics/code-registry-parse.md,
// diagnostics/code-registry-load.md.

import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  Block,
  CallExpr,
  Expr,
  InvokeExpr,
  ThetaBody,
  Stmt,
} from "../parser/theta-document";
import type { CallableSetSnapshot } from "../parser/callable-set";
import { checkInvokeArity, checkCalleeHasErrors } from "../parser/invoke-diagnostics";
import {
  detectInvocationCycle,
  type InvokeGraph,
} from "../runtime/invoke-depth-cycle";
import { checkInvokePathAtLoad } from "../runtime/invocation";
import type { FileSystem } from "../seams/file-system";
import type { ThetaCompositionInput } from "./theta-composition-producer";

/** Forward-slash-normalise a host path for byte-stable node identity. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * The two call-shaped node kinds the shared walk collects in ONE traversal:
 * every `invoke(...)` expression, and every `CallExpr` — a `.theta`-callable-
 * call CANDIDATE whose callee is resolved against the caller's frozen
 * callable set by `resolveThetaCallableCallSites`, not by this walk. One walk
 * keeps the two call surfaces in lockstep: a second, independently written
 * walker would drift out of sync as the `Expr` / `Stmt` node shapes evolve
 * (bug 0071). `checkInvokeStaticResolution` therefore traverses a body once and
 * feeds both of its check loops from that one result.
 */
interface CollectedCallSites {
  readonly invokeExprs: InvokeExpr[];
  readonly callExprs: CallExpr[];
}

/**
 * Collect every `invoke(...)` call expression reachable in a theta body, walking
 * the whole statement / expression tree: every nested block (`if` / `else` /
 * `while` / `for` / `fn` bodies and the `par for` expression body alike),
 * conditions, iterands, `par for` `max` operands, `match` arms, and call
 * arguments. Totality over the `Stmt` / `Expr` unions rests on the explicit
 * arms of `walkStmt` / `walkExpr`, never on their `default` cases: a union
 * member reaching a `default` is walked as a leaf and its sub-tree is not
 * collected.
 */
export function collectInvokeExprs(body: ThetaBody): InvokeExpr[] {
  return collectCallSites(body).invokeExprs;
}

/** Run the shared call-site walk once (`CollectedCallSites`) over a theta body. */
function collectCallSites(body: ThetaBody): CollectedCallSites {
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [] };
  walkBlock({ statements: body.statements, tail: body.tail }, out);
  return out;
}

function walkBlock(block: Block, out: CollectedCallSites): void {
  for (const stmt of block.statements) {
    walkStmt(stmt, out);
  }
  if (block.tail !== null) {
    walkExpr(block.tail, out);
  }
}

function walkStmt(stmt: Stmt, out: CollectedCallSites): void {
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
    // `query`, `break`, `continue`, `schema`, `enum`, `import`, `export`,
    // `doc-comment` carry no nested `invoke(...)` / call sub-expression.
    default:
      return;
  }
}

function walkExpr(expr: Expr, out: CollectedCallSites): void {
  switch (expr.kind) {
    case "invoke":
      out.invokeExprs.push(expr);
      for (const arg of expr.args) walkExpr(arg, out);
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
    case "call":
      out.callExprs.push(expr);
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
      // `target.method(args)` is a method call, not a `.theta`-callable-call
      // candidate: `method` names a stdlib member, never a `tools:` name, so it
      // does not join `callExprs`. Walk the target and args only.
      walkExpr(expr.target, out);
      for (const arg of expr.args) walkExpr(arg, out);
      return;
    case "par-for":
      // A `par for` body is an ordinary call-site region: control-flow.md CTRL-4
      // admits `invoke(...)`, `.theta` callable calls, `subagent fn` calls and
      // Pi-tool calls inside it, so every rule this walk feeds must hold there
      // too. Because the walk is shared, this one arm carries the whole set into
      // `par for` bodies at once — INV-3 arity over both call surfaces, the
      // `invoke(...)` surface's INV-5 path-escape and `checkCalleeHasErrors`
      // checks, and `buildInvokeGraph`'s INV-4 cycle edges. That breadth is the
      // single-walker invariant paying out rather than a second rule bolted on:
      // one walker cannot drift against itself, so the reachable-node set is
      // identical for every consumer, and a `.theta`-callable-only branch here
      // would reintroduce exactly the per-surface divergence the shared walk
      // exists to prevent (bug 0071).
      walkExpr(expr.iterand, out);
      if (expr.max !== null) walkExpr(expr.max, out);
      walkBlock(expr.body, out);
      return;
    // The complete leaf set of the `Expr` union — `ident`, `number`, `string`,
    // `bool`, `null`, `query` — carries no nested `invoke(...)` / call. Every
    // other union member has an explicit arm above; one added without an arm
    // lands here and its sub-tree goes uncollected, which is a silent hole in
    // every check downstream of the walk.
    default:
      return;
  }
}

/** One `.theta`-callable call site resolved against the caller's frozen callable set. */
export interface ThetaCallableCallSite {
  /** The presented callable name as written at the call site (post-`as`, post-hyphen→underscore). */
  readonly name: string;
  /** The callee `.theta` path literal carried on the frozen snapshot entry. */
  readonly calleePath: string;
  /** The call expression — `args` are the positional slots, `range` the located site. */
  readonly call: CallExpr;
}

/**
 * Resolve `CallExpr`s the shared walk already collected against the caller's
 * frozen `tools:` callable set, keeping only the ones that resolved to a
 * `.theta` callee. A callable-set entry of kind `pi-tool`, or a callee name the
 * set does not bind at all (a local `fn`, an import, an unresolved
 * identifier), is not a `.theta`-callable call and is dropped — this function
 * is the one place that tells the two apart, which is why the shared walk
 * records `CallExpr` candidates rather than pre-filtering them. An absent
 * `callableSet` (no `tools:`, or a `tools:` rejection that already
 * un-registered the theta before this pass runs) yields `[]`.
 *
 * Resolution is split from traversal so a caller holding a `CollectedCallSites`
 * result resolves against it directly instead of walking the body a second
 * time.
 *
 * `calleePath` comes off the frozen snapshot entry
 * (`ResolvedThetaCallee.calleePath`), never re-derived from the presented
 * `name`: the presented name has already lost the `as` rename and the
 * hyphen→underscore rewrite (`./two-param-hyph.theta as renamed` presents as
 * `renamed`, which opens no file by that name), so only the snapshot's stored
 * path reaches the callee.
 *
 * The snapshot is read through `Map.get` plus an explicit `!== undefined`
 * test — never spread or copied into a plain object on this path — because a
 * callable name is author-controlled theta source text, and a plain-object
 * property read on an author-controlled key can resolve `__proto__` /
 * `constructor` against `Object.prototype` instead of failing closed (the
 * 0031 / 0038 hazard class).
 */
function resolveThetaCallableCallSites(
  callExprs: readonly CallExpr[],
  callableSet: CallableSetSnapshot | undefined,
): ThetaCallableCallSite[] {
  if (callableSet === undefined) {
    return [];
  }
  const out: ThetaCallableCallSite[] = [];
  for (const call of callExprs) {
    const entry = callableSet.entries.get(call.callee);
    if (entry === undefined || entry.kind !== "theta") {
      continue;
    }
    out.push({ name: call.callee, calleePath: entry.calleePath, call });
  }
  return out;
}

/**
 * Collect and resolve every `.theta`-callable call site in a theta body — the
 * body-in, sites-out entry point for callers that hold no prior walk result.
 * Semantics are `resolveThetaCallableCallSites` over the body's own shared walk.
 */
export function collectThetaCallableCallSites(
  body: ThetaBody,
  callableSet: CallableSetSnapshot | undefined,
): ThetaCallableCallSite[] {
  return resolveThetaCallableCallSites(collectCallSites(body).callExprs, callableSet);
}

/** Resolve an `invoke` path literal to a forward-slash-normalised absolute path. */
function resolveCalleeAbsolute(callerPath: string, literalPath: string): string {
  const baseDir = dirname(callerPath);
  const absolute = isAbsolute(literalPath)
    ? literalPath
    : resolvePath(baseDir, literalPath);
  return normalizePath(absolute);
}

/**
 * Build the per-load-pass static-resolution invoke graph across the discovered,
 * successfully-parsed thetas (invocation.md §Static resolution / §Cycle
 * detection). Nodes are discovered slash names; an edge `A → B` exists when
 * `A.theta` has a literal `invoke("./B.theta")` resolving (byte-exact absolute
 * path) to a discovered theta `B`. Edges to non-discovered callees are dropped —
 * a cycle routed only through undiscovered files is not detected until they are
 * discovered (the spec's leaf-termination rule).
 */
export function buildInvokeGraph(inputs: readonly ThetaCompositionInput[]): InvokeGraph {
  const byPath = new Map<string, string>();
  for (const input of inputs) {
    if (input.sourcePath !== undefined) {
      byPath.set(normalizePath(input.sourcePath), input.slashName);
    }
  }
  const edges = new Map<string, string[]>();
  for (const input of inputs) {
    if (input.sourcePath === undefined) continue;
    const targets: string[] = [];
    for (const invoke of collectInvokeExprs(input.body)) {
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) continue;
      const abs = resolveCalleeAbsolute(input.sourcePath, invoke.path);
      const targetName = byPath.get(abs);
      if (targetName !== undefined) targets.push(targetName);
    }
    edges.set(input.slashName, targets);
  }
  return { edges, unresolvable: new Set<string>() };
}

/** The callee shape the arity check consults, resolved once per site. */
export interface CalleeArity {
  /** Count of `params:` fields that are neither defaulted nor optional. */
  readonly requiredCount: number;
  /** Total `params:` field count. */
  readonly totalCount: number;
}

/**
 * Run the load-time invoke static checks for one discovered theta, returning
 * every diagnostic (error-severity entries un-register the theta):
 *
 *   - INV-5 path-escape (`theta/load/invoke-path-escape`) via the shared
 *     realpath + discovery-root containment check — the `invoke(...)` surface
 *     ONLY. A `.theta`-callable call's containment is not checked on this load
 *     path at all: the `tools:` admission that produced `deps.callableSet`
 *     (`parseCalleeForTools`) reads the callee's bytes through a bare path
 *     resolve, with no `realpath` and no active-discovery-root test, so a
 *     `tools:` entry naming a callee outside every active root raises no
 *     containment diagnostic anywhere in this pass. Closing that is outside bug
 *     0071's scope (its §Non-goals scopes 0071 to the arity rule), so the load
 *     path is left as found; the containment enforcement that does exist for
 *     the surface is the runtime open-time re-check the dispatch path runs
 *     before it opens the callee (`#driveCallee` →
 *     `#recheckCalleeContainment` in
 *     `src/extension/production-theta-producer.ts`), which fails the call closed
 *     instead of un-registering the caller;
 *   - INV-3 arity (`theta/parse/invoke-arity-too-{many,few}`) against the
 *     statically-resolved callee's `params:` counts, over BOTH the
 *     `invoke(...)` call surface and the `.theta`-callable call surface
 *     (tool-calls.md §"Argument shape" binds the two by name);
 *   - INV-4 invocation cycle (`theta/load/invocation-cycle`) via the graph walk.
 *
 * The extension / path-separator (INV-1 / INV-2) and dynamic-path (INV-8) checks
 * already fired during the whole-file parse and are not repeated here.
 */
export async function checkInvokeStaticResolution(
  input: ThetaCompositionInput,
  deps: {
    readonly fs: Pick<FileSystem, "realpath">;
    readonly activeRoots: readonly string[];
    readonly graph: InvokeGraph;
    readonly resolveCalleeArity: (calleeAbsolutePath: string) => Promise<CalleeArity | undefined>;
    /**
     * The caller's frozen `tools:` resolution snapshot. Drives the
     * `.theta`-callable-call arity loop below; `undefined` (no `tools:`
     * resolved yet, or a caller that never threads one) yields no
     * `.theta`-callable-call sites to check, not a crash.
     */
    readonly callableSet?: CallableSetSnapshot;
  },
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const callerPath = input.sourcePath;

  if (callerPath !== undefined) {
    // One traversal feeds both check loops below (`CollectedCallSites`): the two
    // call surfaces are checked against the same reachable-node set by
    // construction, so neither can be reached by a walk the other misses.
    const callSites = collectCallSites(input.body);

    for (const invoke of callSites.invokeExprs) {
      // A dynamic path (empty literal) or a non-`.theta` extension already
      // produced its own parse error; skip to avoid a confusing second report.
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) {
        continue;
      }
      const site = { file: callerPath, range: invoke.range };
      const resolvedPath = resolveCalleeAbsolute(callerPath, invoke.path);

      // INV-5 (invocation.md §Resolution): a resolved callee outside every
      // active discovery root un-registers the parent. The containment check
      // consults `realpath`, which THROWS for a callee that does not exist on
      // disk. Per discovery-cli.md §Static resolution, an unreadable callee
      // reached by a *literal* `invoke(...)` is `theta/load/callee-has-errors`
      // severity WARNING — the parent still registers, static checks against
      // that callee are skipped, and the runtime AJV load is the safety net. So
      // a missing callee must NOT propagate as a throw: an unguarded throw here
      // aborts the whole discovery/compose walk, silently un-registering every
      // unrelated sibling theta from the same source (INVCEIL-1). Convert it into
      // a per-theta, non-fatal warning and skip the remaining static checks for
      // this site.
      // A `realpath` rejection (an unreadable / non-existent callee) is handled
      // as `undefined` via the same rejection-to-`undefined` idiom the callee
      // read paths in this pipeline use, rather than a broad `try`/`catch`.
      const containment = await checkInvokePathAtLoad({
        deps: { fs: deps.fs },
        resolvedPath,
        literalPath: invoke.path,
        activeRoots: deps.activeRoots,
      }).then(
        (value) => value,
        () => undefined,
      );
      if (containment === undefined) {
        diagnostics.push(
          ...checkCalleeHasErrors({
            calleePath: invoke.path,
            surface: "invoke",
            hasErrors: true,
            relatedSites: [],
            site,
          }),
        );
        continue;
      }
      if (containment.kind === "escape") {
        diagnostics.push({ ...containment.diagnostic, file: site.file, range: site.range });
        // An escaping callee cannot be opened for the arity check; move on.
        continue;
      }

      // INV-3 (invocation.md §Argument arity): arity is checked against the
      // statically-resolved callee's `params:` counts. The provided count
      // excludes the leading path-literal argument.
      const providedCount = Math.max(0, invoke.args.length - 1);
      const arity = await deps.resolveCalleeArity(resolvedPath);
      if (arity !== undefined) {
        diagnostics.push(
          ...checkInvokeArity({
            callee: invoke.path,
            staticallyResolvable: true,
            requiredCount: arity.requiredCount,
            totalCount: arity.totalCount,
            providedCount,
            site,
          }),
        );
      }
    }

    // INV-3 over the `.theta`-callable call surface (tool-calls.md §"Argument
    // shape"; bug 0071): reached only for a `tools:` entry that already
    // resolved cleanly — an unresolvable path or an erroring callee un-registers
    // the parent in `resolveThetaToolsAtLoad` before the compose loop reaches
    // this pass at all, so `deps.callableSet` never carries a rejected entry
    // here, and no `.theta`-callable call attracts a second, derived diagnostic
    // on top of that entry's own rejection.
    for (const site of resolveThetaCallableCallSites(
      callSites.callExprs,
      deps.callableSet,
    )) {
      const resolvedPath = resolveCalleeAbsolute(callerPath, site.calleePath);
      // Unlike `invoke(...)`, a `.theta`-callable call carries no leading
      // path-literal argument (the callee is named by the `tools:` entry, not
      // by the call's own first argument), so every positional argument is a
      // real argument slot.
      const providedCount = site.call.args.length;
      const arity = await deps.resolveCalleeArity(resolvedPath);
      if (arity === undefined) {
        continue;
      }
      diagnostics.push(
        ...checkInvokeArity({
          // The `invoke(...)` arm above renders `<callee>` as the verbatim path
          // literal because that IS the text at its diagnostic range. Here the
          // range is the call site instead, and the callee path appears
          // nowhere on that line — only the presented callable name does — so
          // `<callee>` renders the presented name (placeholder-rendering-b.md
          // §7).
          callee: site.name,
          // invocation.md §Static resolution defines a statically-resolvable
          // callee as one "referenced by a literal `invoke(...)` or by a
          // `.theta` entry in `tools:`" (quoted in tool-calls.md §"Argument
          // shape") — a `.theta`-callable call site is statically resolvable BY
          // DEFINITION, not by inference from reaching this loop.
          staticallyResolvable: true,
          requiredCount: arity.requiredCount,
          totalCount: arity.totalCount,
          providedCount,
          site: { file: callerPath, range: site.call.range },
        }),
      );
    }
  }

  // INV-4 (invocation.md §Cycle detection): walk the static-resolution graph
  // from this theta; a back-edge un-registers it.
  const cycle = detectInvocationCycle(input.slashName, deps.graph);
  if (cycle !== undefined) {
    diagnostics.push(cycle);
  }

  return diagnostics;
}
