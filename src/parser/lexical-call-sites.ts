// Lexical call-site rules for the V19a parser seam (theta-document.ts) — bug
// 0003 (Pi-tool argument shape) + bug 0016 (shadowed callable callee; the
// lexical bare-object carve-out), plus the RFC 0011 runtime-tool checks
// (theta/parse/tool-arg-not-object-literal, theta/parse/shadowed-callable-call,
// theta/parse/bare-object-literal, theta/parse/session-tool-in-isolated-body;
// grammar.md §"Pi-tool argument grammar"; expressions.md §"Identifier
// resolution" / §"Object construction"; code-registry-parse.md).

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { ParsedFrontmatter } from "./frontmatter";
import { collectPatternBinderNames as collectPatternBindings } from "./match-result";
import { letAnnotationToCompatType } from "./type-layer-checks";
// Bug 0072 (tool-calls.md §"Argument shape"): the lexical call-site walk emits
// the shared arity check's ARITY arm directly (no `argumentSource`, so only
// that arm can fire from this site) instead of re-deriving the
// message/severity locally — the same parser→runtime reuse pattern as
// `checkDiscardedQueryResult` in structural-checks.ts.
import { checkToolCallArguments } from "../runtime/tool-call-static-checks";
import { runtimeToolPresentedNames, RUNTIME_TOOL_SIGNATURES, type RuntimeToolName } from "./runtime-tools";
import type { CompatType } from "./type-compat";
import type { Block, CallExpr, Expr, Stmt } from "./theta-ast";
// Shared document-seam helpers (theta-document.ts's own export-block comment:
// sibling modules call them only during parsing, never during module
// initialisation — the same two-way seam structural-checks.ts already rides).
import {
  bareObjectLiteralDiagnostic,
  callWithClauseValues,
  piToolCallableName,
  toolArgShapeDiagnostic,
  toolCallableName,
} from "./theta-document";

/**
 * One arm-1 local binder tracked by the lexical call-site walk (bug 0016):
 * which construct bound the name, and the 1-indexed source line of that
 * construct where the AST carries one. `line` is absent only for `params:`
 * fields — frontmatter fields carry no body source range — so the rendered
 * binder phrase degrades from e.g. "let binding at line 6" to "params: field".
 * A `FnParam` and a `match` pattern carry no ranges of their own, so those
 * binders borrow the nearest enclosing node's start line: the `fn`
 * declaration (its parameter list sits on the declaration line) and the arm
 * BODY expression (an arm's body starts on the arm's own line, immediately
 * after `=>`).
 */
interface LocalBinder {
  readonly kind: "let" | "fn-param" | "for" | "par-for" | "match" | "params-field";
  readonly line?: number;
}

/** Render a `LocalBinder` for the shadowed-callable-call message's `<binder>` placeholder. */
function binderPhrase(binder: LocalBinder): string {
  const noun: Record<LocalBinder["kind"], string> = {
    "let": "let binding",
    "fn-param": "fn parameter",
    "for": "for variable",
    "par-for": "par for variable",
    "match": "match binding",
    "params-field": "params: field",
  };
  const kindText = noun[binder.kind];
  return binder.line === undefined ? kindText : `${kindText} at line ${binder.line}`;
}

/**
 * The exact registered diagnostic for one call of a locally shadowed
 * callable-set name (bug 0016; code-registry-parse.md
 * `theta/parse/shadowed-callable-call` row; DIAG-4 message emitted
 * character-for-character with `<name>` / `<binder>` substituted). The `range`
 * targets the CALL node: `CallExpr` carries no separate callee-identifier
 * span, and the call node's start IS the callee's first character, so the
 * author's editor lands on the offending callee. The hint renders the
 * registry row's Hint column verbatim, backticks included — the
 * `immutable-rebinding` / `redundant-wire-name` emitter convention (only the
 * Message column is DIAG-4-normative; keeping the Hint byte-identical too
 * means neither can drift).
 */
function shadowedCallableCallDiagnostic(
  callee: string,
  binder: LocalBinder,
  callRange: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/shadowed-callable-call",
    file,
    range: callRange,
    message: `call of '${callee}' resolves to the local ${binderPhrase(binder)} that shadows the callable-set entry '${callee}'; locals are not callable`,
    hint: "Rename the local binding, or give the `tools:` entry a distinct name with `as`.",
  };
}

/** Check callee resolution and direct-argument legality before descending a call. */
function checkCallSiteCall(
  e: CallExpr,
  localBinder: LocalBinder | undefined,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  // (1) Bug 0016: a call of a locally shadowed callable-set name is
  // erroneous — arm 1 wins the resolution, and a local never holds a
  // callable.
  if (localBinder !== undefined && walkCtx.callables.has(e.callee)) {
    walkCtx.out.push(
      shadowedCallableCallDiagnostic(e.callee, localBinder, e.range, walkCtx.file),
    );
  }
  // RFC 0011 (seam sheet §5.1): the callee resolves to a runtime tool iff
  // the presented name is in the map AND no higher-precedence arm captures
  // it (local / fn / import wins; a shadowed name keeps `shadowed-callable-call`
  // ALONE — never the isolated-body code).
  const resolvesToRuntimeTool =
    walkCtx.runtimeTools.has(e.callee) &&
    localBinder === undefined &&
    !walkCtx.fnImportDecls.has(e.callee);
  // RFC 0011 §5.3 / §0 C4: a runtime tool called inside a `par for` body
  // addresses the enclosing conversation and is not available there.
  // Emitted AFTER the shadow check (a shadowed name keeps its own verdict)
  // and only when the callee resolves to a runtime tool.
  if (resolvesToRuntimeTool && insideParFor) {
    walkCtx.out.push({
      severity: "error",
      code: "theta/parse/session-tool-in-isolated-body",
      file: walkCtx.file,
      range: e.range,
      // DIAG-4: exact Message template from the registry row.
      message: `'${e.callee}' addresses the enclosing conversation and is not available inside a par for body`,
    });
  }
  // The callee is lexically the Pi tool iff no higher-precedence arm
  // (local / fn / import) captures the name AND it is NOT a runtime tool
  // (RFC 0011: runtime tools admit positional typed arguments, so the
  // Pi-tool object-literal shape rule does not apply to them).
  const resolvesToPiTool =
    walkCtx.piTools.has(e.callee) &&
    !resolvesToRuntimeTool &&
    localBinder === undefined &&
    !walkCtx.fnImportDecls.has(e.callee);
  if (resolvesToPiTool) {
    if (e.args.length > 1) {
      // (2) Bug 0072: a Pi tool takes a single object argument
      // (tool-calls.md §"Argument shape"); a multi-argument call is
      // `theta/parse/tool-arg-arity` regardless of the argument shapes.
      // No `argumentSource` is supplied, so only the shared check's ARITY
      // arm can fire from this site; ranged on the CALL node, not on one
      // argument — the mistake is the argument LIST, and the registry
      // row's repair ("merge the arguments") is at the call.
      walkCtx.out.push(
        ...checkToolCallArguments({
          toolName: e.callee,
          calleeKind: "pi-tool",
          positionalCount: e.args.length,
          file: walkCtx.file,
          range: e.range,
        }),
      );
    } else {
      // (3) Bug 0003: `ToolArg` is a BARE inline object literal — any
      // non-object node (identifier, string, call, member, …) and a
      // NAMED schema-constructor (`typeName !== null`) both fail the
      // shape. Disjoint from (2) by construction: arity owns `> 1`
      // (handled above), this owns `<= 1`, so the two codes never co-fire
      // at one call site — the reconciliation bug 0072 §Fix (parse half,
      // option 1) requires of this walk.
      const first = e.args[0];
      if (first !== undefined && !(first.kind === "object" && first.typeName === null)) {
        walkCtx.out.push(toolArgShapeDiagnostic(e.callee, first.range, walkCtx.file));
      }
    }
  } else if (!resolvesToRuntimeTool) {
    // (4) Bug 0016 part B; bug 0072: the §Object construction carve-out
    // admits a bare-object argument ONLY under a
    // (lexically) Pi-tool callee, at EVERY direct argument position — a
    // Pi-tool callee's own direct arguments are already owned by (2) /
    // (3) above, so this arm only ever reaches a non-Pi-tool callee,
    // where every direct bare-object argument is the ordinary rejection.
    // The structural walk suppresses exactly these positions
    // (callee-blind), so this is the single emission site for them.
    for (const arg of e.args) {
      if (arg.kind === "object" && arg.typeName === null) {
        walkCtx.out.push(bareObjectLiteralDiagnostic(arg.range, walkCtx.file));
      }
    }
  }
}

/**
 * RFC 0011 (seam sheet §0 C6): build the runtime-tool success-type map
 * (`presented name → CompatType`) from the frontmatter `tools:` list.
 * Each declared runtime tool's `successTypeSource` (from `RUNTIME_TOOL_SIGNATURES`)
 * is converted once through `letAnnotationToCompatType` — the second sanctioned
 * TYPE-8 object-arm mint site (bug 0130 flag F-3). GOV-15 inert: the returned
 * map is empty when the `tools:` list declares no runtime tool.
 */
export function buildRuntimeToolSuccessTypes(
  tools: readonly string[] | undefined,
): ReadonlyMap<string, CompatType> {
  const presented = runtimeToolPresentedNames(tools);
  if (presented.size === 0) {
    return presented as unknown as ReadonlyMap<string, CompatType>;
  }
  const out = new Map<string, CompatType>();
  for (const [name, canonical] of presented) {
    const sig = RUNTIME_TOOL_SIGNATURES.get(canonical);
    if (sig === undefined) {
      continue;
    }
    const type = letAnnotationToCompatType(sig.successTypeSource);
    if (type !== undefined) {
      out.set(name, type);
    }
  }
  return out;
}

/**
 * The per-file invariants of the lexical call-site walk, threaded explicitly
 * through the walkers (no module state) alongside the per-scope `locals` map.
 */
interface CallSiteWalkContext {
  /**
   * The arm-1 binders visible everywhere in the body regardless of source
   * order: `params:` fields, which materialise as root-environment locals at
   * runtime (`buildBoundEnvironment` defines them via `defineLocal`), so a
   * call of a params-shadowed name resolves to the local. Each `fn` body's
   * scope restarts from this map — theta 1.0 has no closures.
   */
  readonly rootLocals: ReadonlyMap<string, LocalBinder>;
  /**
   * Whole-file names on resolution arms (2)–(3): top-level `fn` declarations
   * and imported symbols. A call of such a name is a legal user-fn /
   * import call, NOT a shadowed-callable-call site (a `tools:` collision with
   * these names is separately load-rejected via
   * `theta/load/tool-name-collision`), and its callee is not lexically a Pi
   * tool, so the carve-out and the shape rule both stand down. `schema` /
   * `enum` names are deliberately NOT here: they are not call-position
   * resolution arms (expressions.md §"Identifier resolution" ranks
   * local > fn > import > callable only), so a callee colliding with one
   * still resolves to the callable-set entry and keeps the tool's rules.
   */
  readonly fnImportDecls: ReadonlySet<string>;
  /** The Pi-tool subset of the callable set (bare-identifier `tools:` entries, post-`as`). */
  readonly piTools: ReadonlySet<string>;
  /** EVERY callable-set name — Pi tools AND `.theta` callables — post-rename. */
  readonly callables: ReadonlySet<string>;
  /**
   * RFC 0011 (seam sheet §5.1 / §0 C4): declared runtime tools, keyed by
   * PRESENTED (post-rename) name, valued by canonical name. Drives (a) the
   * lexical exemption from the Pi-tool object-literal shape rule (positional
   * typed arguments are the admitted spelling for runtime tools), and (b) the
   * `insideParFor`-gated `theta/parse/session-tool-in-isolated-body` check.
   * GOV-15 inert: empty for every 1.0.0-clean file.
   */
  readonly runtimeTools: ReadonlyMap<string, RuntimeToolName>;
  readonly file: string;
  readonly out: Diagnostic[];
}

/**
 * The whole-body lexical call-site walk. It resolves every `<name>(args)`
 * callee against the expressions.md §"Identifier resolution" first-match order
 * — tracking scopes exactly as `checkUnknownIdentifiers` does (whole-file
 * declarations visible everywhere; `let` bindings shadow from their binding
 * statement onward; `for` / `par for` variables, `match`-arm pattern bindings,
 * and `fn` parameters shadow inside their scopes; an `fn` body sees only the
 * whole-file declarations plus its own parameters — theta 1.0 has no
 * closures) — and emits four registered codes from that single resolution
 * judgement:
 *
 *   1. `theta/parse/shadowed-callable-call` (bug 0016,
 *      docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md) for a call whose
 *      callee resolves to an arm-1 LOCAL while colliding with a callable-set
 *      name (Pi tool or `.theta` callable alike): locals are never callable
 *      (functions are not first-class), so the call site is erroneous — and
 *      before this gate existed the runtime executed the callable at a site
 *      that does not denote it (silently, for the object-literal and zero-arg
 *      forms). Binding the name without calling it stays legal: only CALL
 *      position emits.
 *   2. `theta/parse/tool-arg-arity` (bug 0072,
 *      docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md) for a call
 *      whose callee resolves to a Pi tool and carries MORE THAN ONE positional
 *      argument — tool-calls.md §"Argument shape": "A multi-argument form
 *      (`read({...}, {...})`) is `theta/parse/tool-arg-arity` regardless of
 *      the argument shapes." Emitted through `checkToolCallArguments`
 *      (../runtime/tool-call.ts) with no `argumentSource` supplied, so only
 *      its ARITY arm can fire from this call site; ranged on the CALL node,
 *      not on one argument — the mistake is the argument LIST, and the repair
 *      ("merge the arguments") is at the call.
 *   3. `theta/parse/tool-arg-not-object-literal` (bug 0003,
 *      docs/bugs/0003-tool-arg-shape-rule-not-enforced.md) for a call whose
 *      callee resolves to a Pi tool and carries EXACTLY ONE positional
 *      argument that is not an inline bare object literal — the surviving RFC
 *      0002 shape rule (grammar.md §"Pi-tool argument grammar": field VALUES
 *      are full expressions, the argument SHAPE is one inline `{ ... }`).
 *      Disjoint from (2) by construction — arity owns `> 1` arguments, this
 *      owns `=== 1` — so the two codes can never co-fire at one call site.
 *      Unchanged for unshadowed callees; a locally shadowed callee is not the
 *      tool, so the shape rule stands down there (the callee rejection above
 *      owns the site), and an fn/import-shadowed callee is a user-fn call.
 *      Emission mirrors the SHAPE arm of `checkToolCallArguments`
 *      (../runtime/tool-call.ts) rather than calling it for this arm too:
 *      that arm is gated on an `argumentSource` this walk never supplies (it
 *      owns AST nodes, not source text), so it is structurally unreachable
 *      from here — this walk keeps its own AST-based shape test instead,
 *      holding the message / severity / hint byte-identical to it (DIAG-4).
 *      Zero-argument calls are legal (`read()` lowers to `{}`).
 *   4. `theta/parse/bare-object-literal` (bug 0016 part B; bug 0072) for EVERY
 *      DIRECT bare-object argument of a call whose callee is NOT (lexically)
 *      an unshadowed Pi tool: expressions.md
 *      §"Object construction" scopes the carve-out to Pi-tool callees only —
 *      `f({ ... })` for a user `fn`, a `let`-bound name, a `.theta` callable,
 *      or a shadowed tool name is outside it, at every direct argument
 *      position, not only a sole one. The structural walk (`walkExpr`
 *      `case "call"`) suppresses the check for every direct-call-argument
 *      position UNCONDITIONALLY (position-based, callee-blind), so the two
 *      sites partition the emission (never double-emitting for one node):
 *      this lexical walk owns the callee-sensitive judgement for all of
 *      them, and both build the diagnostic through `bareObjectLiteralDiagnostic`
 *      so the message cannot drift. A Pi-tool callee's own direct arguments
 *      are already owned by (2) or (3) above, so this arm only ever fires
 *      under a non-Pi-tool callee.
 *
 * The walk REPORTS on shadowed names (bug 0016 superseded the earlier
 * under-reporting contract, whose runtime back-stop was loud only for
 * non-object argument nodes); the runtime lowerings still back-stop a gate
 * gap with `ShadowedCalleeDispatchDefectError` / `PiToolArgShapeDefectError`
 * (../runtime/tool-call.ts) — belts behind this gate, not substitutes for it.
 * The walk runs even with an empty callable set: emission (4) is
 * callee-sensitive, not tool-dependent, so `f({ ... })` in a tools-less theta
 * or a `.thetalib` is still rejected.
 */
export function checkLexicalCallSites(
  body: Block,
  frontmatter: ParsedFrontmatter | null,
  file: string,
): Diagnostic[] {
  const piTools = new Set<string>();
  const callables = new Set<string>();
  for (const entry of frontmatter?.tools ?? []) {
    const piName = piToolCallableName(entry);
    if (piName !== undefined && piName.length > 0) {
      piTools.add(piName);
    }
    const presented = toolCallableName(entry);
    if (presented.length > 0) {
      callables.add(presented);
    }
  }

  const fnImportDecls = new Set<string>();
  for (const s of body.statements) {
    switch (s.kind) {
      case "fn":
        fnImportDecls.add(s.name);
        break;
      case "import":
        // expressions.md §"Identifier resolution" arm (3) is the import arm
        // only — an `export` specifier binds nothing (imports.md
        // §"Re-exports"), so it must not make a call site read as a known
        // fn/import callee.
        for (const sym of s.symbols) {
          fnImportDecls.add(sym);
        }
        break;
      default:
        break;
    }
  }

  const rootLocals = new Map<string, LocalBinder>();
  for (const f of frontmatter?.params?.fields ?? []) {
    rootLocals.set(f.wireName, { kind: "params-field" });
  }

  // RFC 0011 (seam sheet §5.1): derive the presented-name → canonical-name
  // map for runtime tools, so the walk can (a) exempt them from the Pi-tool
  // object-literal shape check and (b) emit the isolated-body diagnostic.
  const runtimeTools = runtimeToolPresentedNames(frontmatter?.tools);

  const walkCtx: CallSiteWalkContext = {
    rootLocals,
    fnImportDecls,
    piTools,
    callables,
    runtimeTools,
    file,
    out: [],
  };
  walkCallSiteBlock(body, new Map(rootLocals), false, walkCtx);
  return walkCtx.out;
}

function walkCallSiteBlock(
  block: Block,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  for (const s of block.statements) {
    walkCallSiteStmt(s, locals, insideParFor, walkCtx);
  }
  if (block.tail !== null) {
    walkCallSiteExpr(block.tail, locals, insideParFor, walkCtx);
  }
}

function walkCallSiteStmt(
  s: Stmt,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  switch (s.kind) {
    case "let":
      // The initialiser is evaluated BEFORE the name binds, so a tool call in
      // it still resolves to the tool; the binding shadows from here onward.
      if (s.init !== null) {
        walkCallSiteExpr(s.init, locals, insideParFor, walkCtx);
      }
      if (s.name !== "_") {
        locals.set(s.name, { kind: "let", line: s.range.start.line });
      }
      return;
    case "reassign":
      walkCallSiteExpr(s.value, locals, insideParFor, walkCtx);
      return;
    case "if": {
      walkCallSiteExpr(s.condition, locals, insideParFor, walkCtx);
      walkCallSiteBlock(s.then, new Map(locals), insideParFor, walkCtx);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkCallSiteBlock(s.otherwise, new Map(locals), insideParFor, walkCtx);
        } else {
          walkCallSiteStmt(s.otherwise, new Map(locals), insideParFor, walkCtx);
        }
      }
      return;
    }
    case "while":
      walkCallSiteExpr(s.condition, locals, insideParFor, walkCtx);
      walkCallSiteBlock(s.body, new Map(locals), insideParFor, walkCtx);
      return;
    case "for": {
      walkCallSiteExpr(s.iterand, locals, insideParFor, walkCtx);
      const inner = new Map(locals);
      inner.set(s.variable, { kind: "for", line: s.range.start.line });
      walkCallSiteBlock(s.body, inner, insideParFor, walkCtx);
      return;
    }
    case "fn": {
      // Closure-free (`walkIdentStmt` precedent): an `fn` body sees only the
      // whole-file declarations plus its own parameters, so a tool call inside
      // a helper body is still a tool call — `fn helper() { read(args) }`
      // fires — while `fn f(read) { read(x) }` is parameter-shadowed. A
      // `FnParam` carries no range of its own; the declaration's start line
      // locates the parameter list.
      // RFC 0011 (seam sheet §0 C4): an `fn` body resets `insideParFor` to
      // false — a plain `fn` called from outside the body is admitted, and
      // `fn` nested inside a `par for` body is `theta/parse/nested-fn` (FN-1)
      // so the reset is parse-error tolerance only.
      const fnLocals = new Map(walkCtx.rootLocals);
      for (const p of s.params) {
        fnLocals.set(p.name, { kind: "fn-param", line: s.range.start.line });
      }
      walkCallSiteBlock(s.body, fnLocals, false, walkCtx);
      return;
    }
    case "return":
      if (s.operand !== null) {
        walkCallSiteExpr(s.operand, locals, insideParFor, walkCtx);
      }
      return;
    case "query":
      walkCallSiteExpr(s.query, locals, insideParFor, walkCtx);
      return;
    case "tool-call":
      walkCallSiteExpr(s.call, locals, insideParFor, walkCtx);
      return;
    case "invoke":
      walkCallSiteExpr(s.invoke, locals, insideParFor, walkCtx);
      return;
    case "expr":
      walkCallSiteExpr(s.expr, locals, insideParFor, walkCtx);
      return;
    default:
      // schema / enum / import / export / break / continue / doc-comment carry
      // no call sites (fn / import names were pre-collected as whole-file
      // declarations; schema / enum names are not resolution arms).
      return;
  }
}

function walkCallSiteExpr(
  e: Expr,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  switch (e.kind) {
    case "call": {
      const localBinder = locals.get(e.callee);
      checkCallSiteCall(e, localBinder, insideParFor, walkCtx);
      // RFC 0009: the clause values are recursed as arguments are (the direct
      // bare-object carve-out above is about the ARGUMENT list only — a clause
      // value holds no `ToolArg` position).
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkCallSiteExpr(arg, locals, insideParFor, walkCtx);
      }
      return;
    }
    case "binary":
      walkCallSiteExpr(e.left, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.right, locals, insideParFor, walkCtx);
      return;
    case "ternary":
      walkCallSiteExpr(e.condition, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.consequent, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.alternate, locals, insideParFor, walkCtx);
      return;
    case "try":
      walkCallSiteExpr(e.operand, locals, insideParFor, walkCtx);
      return;
    case "invoke":
      for (const arg of [...e.args, ...callWithClauseValues(e)]) {
        walkCallSiteExpr(arg, locals, insideParFor, walkCtx);
      }
      return;
    case "member":
      walkCallSiteExpr(e.target, locals, insideParFor, walkCtx);
      return;
    case "index":
      walkCallSiteExpr(e.target, locals, insideParFor, walkCtx);
      walkCallSiteExpr(e.index, locals, insideParFor, walkCtx);
      return;
    case "method-call":
      walkCallSiteExpr(e.target, locals, insideParFor, walkCtx);
      for (const arg of e.args) {
        walkCallSiteExpr(arg, locals, insideParFor, walkCtx);
      }
      return;
    case "object":
      // RFC 0002: field VALUES are full expressions — a nested call inside a
      // legal `{ ... }` argument is itself checked. Bare-object legality in
      // non-call-argument positions stays the structural walk's concern.
      for (const field of e.fields) {
        walkCallSiteExpr(field.value, locals, insideParFor, walkCtx);
      }
      return;
    case "array":
      for (const el of e.elements) {
        walkCallSiteExpr(el, locals, insideParFor, walkCtx);
      }
      return;
    case "result-ctor":
      walkCallSiteExpr(e.arg, locals, insideParFor, walkCtx);
      return;
    case "match":
      walkCallSiteExpr(e.scrutinee, locals, insideParFor, walkCtx);
      for (const arm of e.arms) {
        // A pattern node carries no range; the arm's BODY starts on the arm's
        // own line, so its start line locates the binding for the message.
        const bound = new Set<string>();
        collectPatternBindings(arm.pattern, bound);
        const armLocals = new Map(locals);
        for (const name of bound) {
          armLocals.set(name, { kind: "match", line: arm.body.range.start.line });
        }
        walkCallSiteExpr(arm.body, armLocals, insideParFor, walkCtx);
      }
      return;
    case "par-for": {
      // Reached explicitly (unlike the ident walk, which predates RFC 0003):
      // a `par for` body is a call-site-bearing block and its per-iteration
      // variable shadows.
      // RFC 0011 (seam sheet §0 C4): the body descends with `insideParFor`
      // true; the iterand and max stay under the caller's flag.
      walkCallSiteExpr(e.iterand, locals, insideParFor, walkCtx);
      if (e.max !== null) {
        walkCallSiteExpr(e.max, locals, insideParFor, walkCtx);
      }
      const inner = new Map(locals);
      inner.set(e.variable, { kind: "par-for", line: e.range.start.line });
      walkCallSiteBlock(e.body, inner, true, walkCtx);
      return;
    }
    case "block":
      // A CHILD scope, mirroring `walkIdentExpr`'s `case "block"` (ident-resolution.ts): a
      // call site inside the block still resolves against the enclosing
      // locals, but a name the block's own `let`s bind must not survive past
      // it.
      walkCallSiteBlock(e.body, new Map(locals), insideParFor, walkCtx);
      return;
    default:
      // number / string / bool / null / ident / query — no call sites (a
      // query's `${…}` interpolations live in its raw template text, not as
      // AST children).
      return;
  }
}
