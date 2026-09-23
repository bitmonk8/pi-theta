// Load-time (compose-pass) orchestration for invoke static checks, with the
// invoke-expression surface and shared type collection/rendering delegated to
// invoke-expr-call-surface.ts, the arity/slot model to ../parser/invoke-callee-arity.ts,
// and with-clause classification/cwd checks to ../parser/with-clause-static-checks.ts
// (invocation.md §Argument arity / §Resolution / §Cycle detection). Each check
// reuses an existing, unit-tested checker rather than reimplementing it:
//
//   - INV-3 — `checkInvokeArity` over each `invoke("./x.theta", …)` site AND
//     each `.theta`-callable call site (`<name>(args)` for a `tools:` `.theta`
//     entry) against the statically-resolved callee's `params:` counts
//     (`theta/parse/invoke-arity-too-many` / `-too-few`; tool-calls.md
//     §"Argument shape" binds both call surfaces to these codes by name).
//   - bug 0137 — `theta/parse/invoke-arg-type-mismatch`, via `checkInvokeCall`
//     over the SAME `invoke("./x.theta", …)` site, immediately after (and
//     replacing the direct call to) its arity check: arity runs exactly once
//     and, only when it raised no diagnostic, a per-slot check compares each
//     positional argument against the callee's corresponding `params:` field
//     (invocation.md §Argument binding). Shares this loop's resolved `arity`
//     and the same soundness mechanisms as the bug 0072 check below.
//   - bug 0473 — `theta/parse/invoke-return-type-mismatch`, over the SAME
//     `invoke<Schema>("./x.theta", …)` site, independent of the arity/type
//     block above: when the callee is statically resolvable, its inferred
//     final-value type is compared against the annotated `Schema` via
//     `checkInvokeReturnType` — the cross-file mirror of the in-file
//     `subagent fn` return check (invocation.md §"Typed return", the
//     Empty-tail callee compatibility clause).
//   - bug 0072 — `theta/parse/tool-arg-type-mismatch`, folded into the SAME
//     `.theta`-callable call-site loop immediately after its arity check, and
//     only when arity raised no diagnostic (arity before type; invocation.md
//     §Argument arity): a positional argument whose static type does not
//     statically match its slot's `params:` field type.
//     Both type checks reason over `collectProvableArgTypes` — the SET of types
//     the argument can evaluate to — rather than over the single type
//     `StaticTypeInferencePass` narrows a composite to, so neither can front-run
//     a value the runtime AJV check accepts.
//   - bug 0072 — `theta/parse/tool-arg-schema-conflict`, a THIRD loop over the
//     SAME call-site collection: a Pi-tool call's sole bare-object-argument
//     field whose static type is provably disjoint (RFC 0002) from the tool's
//     registered input-schema type for that field.
//   - RFC 0011 §5.2 (tool-calls.md #session-control-runtime-tools) —
//     `checkRuntimeToolCallSurface`, a THIRD `checkInvokeArity` call surface
//     (a `tools:` entry of kind `"runtime-tool"`): the same arity codes as
//     the other two surfaces, then, only when arity raised no diagnostic,
//     `theta/parse/tool-arg-type-mismatch` via `checkToolCallArguments` with
//     `calleeKind: "runtime-tool"` — mirroring the `.theta`-callable call
//     surface's own two checks above. GOV-15 inert: unreachable while the
//     callable set holds no `"runtime-tool"` entry (every 1.0.0-clean file).
//   - INV-4 — `detectInvocationCycle` over the per-load-pass static-resolution
//     graph (`theta/load/invocation-cycle`); a self-cycle or an A→B→A cycle
//     un-registers the entry theta, which is what keeps a self-referential theta
//     from driving pure unbounded invoke recursion at runtime.
//   - INV-1 (invocation.md §Resolution) — `checkInvokePathAtLoad` (the shared realpath +
//     discovery-root containment check) so a callee resolving outside every active
//     discovery root is `theta/load/invoke-path-escape` and the parent does not register.
//   - bug 0138 / bugs 0429 / 0430 / 0448 — the imported-symbol usage checks
//     (`checkImportedFnCallArgs`, `checkImportedSchemaCtorFields`,
//     `checkImportedEnumVariantAccess`, `checkImportedNonCtorTypeNames`),
//     wired once per importing theta from `checkThetaImports`
//     (../extension/import-static-checks.ts): an imported `.thetalib` `fn`
//     call's argument COUNT / per-slot TYPE, an imported `schema`'s
//     constructor field set, an imported `enum`'s member access, and a
//     constructor whose imported head is not brace-constructible (an `enum`,
//     a `fn`, or an alias-form `schema`) — each reusing an existing
//     parse-time diagnostic row, no new diagnostic code. PTQ-0370: the four
//     live in the sibling `invoke-imported-checks.ts` (their only caller is
//     `checkThetaImports`, never this file's own `checkInvokeStaticResolution`
//     or `checkThetaCallableCallSurface`), which takes this file's shared
//     call-site walk result (`CollectedCallSites`, bug 0071's one-walker
//     lesson) as a parameter and imports back `collectProvableArgTypes` /
//     `dedupeArgType`, exported below for it.
//   - RFC 0009 (invocation.md INV-6 / INV-8) — the call-site `with` clause
//     checks inside `checkInvokeStaticResolution`: the shared
//     `checkWithClauseAtCallSurface` orchestration judges the clause's `cwd`
//     value as an ordinary `string` argument slot on both call surfaces (the
//     surface's own arg-type row, no new code) after its mode gate
//     refuses a clause on a statically-resolvable PROMPT-mode callee
//     (`theta/parse/with-clause-prompt-mode-callee`); and the Erratum A′ /
//     Erratum B default-reject loop convicts a clause on any bare-ident
//     callee the frozen callable set does not classify `theta` and that is
//     not one of the file's own `subagent fn`s (RFC 0012 §10)
//     (`theta/parse/with-clause-pi-tool` / `theta/parse/with-clause-in-process-callee`),
//     deferring an imported callee's verdict to `checkImportedWithClauseCallees`
//     after import materialisation.
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
  CallExpr,
  InvokeExpr,
  MemberExpr,
  ObjectExpr,
  ThetaBody,
} from "../parser/theta-document";
import { walkCallSiteNodes } from "../parser/theta-document";
import type { CallableSetSnapshot } from "../parser/callable-set";
import { checkInvokeArity } from "../parser/invoke-diagnostics";
import {
  detectInvocationCycle,
  type InvokeGraph,
} from "../runtime/invoke-depth-cycle";
import { canonicalizePath } from "../runtime/invocation";
import { normalizePath } from "../normalize-path";
import type { FileSystem } from "../seams/file-system";
import type { ThetaCompositionInput } from "./theta-composition-producer";
// Bug 0072: the two static tool-argument TYPE checks reuse the existing `V20b`
// static-type-inference substrate and `V2b` compatibility engine rather than
// re-deriving a parallel type model for this pass.
import { checkToolCallArguments } from "../parser/tool-call-static-checks";
import { StaticTypeInferencePass } from "../parser/static-type-inference";
import {
  collectEnumNames,
  collectTypeEnv,
} from "../parser/type-layer-checks";
import { RUNTIME_TOOL_SIGNATURES, type RuntimeToolName } from "../parser/runtime-tools";
import {
  checkCompatible,
  type CompatType,
  type TypeEnv,
} from "../parser/type-compat";
import {
  checkCallableArgumentTypes,
  checkInvokeExprCallSurface,
  collectProvableArgTypes,
  renderCollectedTypes,
} from "./invoke-expr-call-surface";
export { collectProvableArgTypes } from "./invoke-expr-call-surface";
import {
  buildComposePassSuccessTypes,
  buildInvokeArgSlot,
  fieldSchemaType,
  toolParameterProperties,
  type CalleeArity,
} from "../parser/invoke-callee-arity";
export {
  dedupeArgType,
  type CalleeArity,
  type CalleeArityField,
} from "../parser/invoke-callee-arity";
import { checkWithClauseAtCallSurface, checkWithClauseDefaultReject } from "../parser/with-clause-static-checks";
export { checkImportedWithClauseCallees } from "../parser/with-clause-static-checks";

/**
 * The four call-shaped node kinds the shared walk (`walkCallSiteNodes`,
 * `../parser/theta-document.ts`) visits in ONE traversal: every `invoke(...)`
 * expression, every `CallExpr` — a `.theta`-callable-call CANDIDATE whose
 * callee is resolved against the caller's frozen callable set by
 * `resolveThetaCallableCallSites`, not by this walk — every `ObjectExpr`
 * constructor site (bug 0429) and every `MemberExpr` (bug 0430). One walk
 * keeps all four call surfaces in lockstep across this module,
 * `extension-tool-reachability.ts`, `subagent-fn-static-checks.ts` and
 * `collectClauseBearingCalls`: a second, independently written walker would
 * drift out of sync as the `Expr` / `Stmt` node shapes evolve (bug 0071).
 * `checkInvokeStaticResolution` therefore traverses a body once and feeds
 * every one of its check loops from that one result.
 */
export interface CollectedCallSites {
  readonly invokeExprs: InvokeExpr[];
  readonly callExprs: CallExpr[];
  /**
   * Bug 0429: every `ObjectExpr` constructor site reachable in the body,
   * bare and named alike — filtered to named (`typeName !== null`) sites by
   * consumers, mirroring `callExprs`' own unresolved-collection-then-filter
   * shape rather than pre-filtering during the walk.
   */
  readonly objectExprs: ObjectExpr[];
  /**
   * Bug 0430: every `MemberExpr` (`target.field`) reachable in the body,
   * unfiltered — consumers test `target.kind === "ident"` themselves,
   * mirroring `objectExprs`' own unresolved-collection-then-filter shape.
   */
  readonly memberExprs: MemberExpr[];
}

/**
 * Collect every `invoke(...)` call expression reachable in a theta body, walking
 * the whole statement / expression tree: every nested block (`if` / `else` /
 * `while` / `for` / `fn` bodies and the `par for` expression body alike),
 * conditions, iterands, `par for` `max` operands, `match` arms, and call
 * arguments. Totality over the `Stmt` / `Expr` unions rests on
 * `walkCallSiteNodes`'s explicit arms, never on its `default` cases: a union
 * member reaching a `default` is walked as a leaf and its sub-tree is not
 * collected.
 */
function collectInvokeExprs(body: ThetaBody): InvokeExpr[] {
  return collectCallSites(body).invokeExprs;
}

/**
 * Run the shared call-site walk once (`CollectedCallSites`) over a theta
 * body. A `par for` body is an ordinary call-site region (control-flow.md
 * CTRL-4 admits `invoke(...)`, `.theta` callable calls, `subagent fn` calls
 * and Pi-tool calls inside it) and so is a `let`-RHS / match-arm-body block
 * (bug 0082 §Fix) — both must surface every one of INV-3 (arity, both call
 * surfaces), INV-1 (`invoke(...)` path-escape, invocation.md §Resolution),
 * `checkCalleeHasErrors`, and INV-4 (`buildInvokeGraph`'s cycle edges)
 * exactly as a statement-level occurrence would; the shared walk reaches both
 * without a per-check special case.
 */
export function collectCallSites(body: ThetaBody): CollectedCallSites {
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [], objectExprs: [], memberExprs: [] };
  // `target.method(args)` (a `MethodCallExpr`) is a method call, not a
  // `.theta`-callable-call candidate — `method` names a stdlib member, never a
  // `tools:` name — so it has no case below and joins none of the four arrays;
  // `walkCallSiteNodes` still reaches its target and args, just uncollected.
  walkCallSiteNodes(body, (node) => {
    switch (node.kind) {
      case "invoke":
        out.invokeExprs.push(node);
        return;
      case "call":
        out.callExprs.push(node);
        return;
      case "object":
        // Bug 0429: the constructor NODE itself joins `objectExprs` (a bare
        // `{ … }` included — filtered by `typeName` downstream).
        out.objectExprs.push(node);
        return;
      case "member":
        // Bug 0430: the member NODE itself joins `memberExprs` (mirroring the
        // 0429 `object` arm's own-node-plus-descend shape).
        out.memberExprs.push(node);
        return;
    }
  });
  return out;
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
 * `A.theta` has a literal `invoke("./B.theta")` resolving to a discovered theta
 * `B`. Edges to non-discovered callees are dropped — a cycle routed only through
 * undiscovered files is not detected until they are discovered (the spec's
 * leaf-termination rule).
 *
 * The returned graph's `unresolvable` set is always empty here. `InvokeGraph`'s
 * own doc (`../runtime/invoke-depth-cycle.ts`) treats a member as a LEAF
 * because it produced `theta/load/callee-has-errors`, but that diagnostic
 * (this file's `checkCalleeHasErrors` push on the `invoke` surface, in
 * `checkInvokeStaticResolution` below) fires only for a callee whose
 * realpath-based containment check rejected it — one this pass never
 * discovered, so never a member of `inputs` and never one of the nodes `edges`
 * covers above. This builder's own leaf-termination is the edge-drop just
 * described, not this field.
 *
 * Both the node keys and the resolved edge callees are minted through
 * `canonicalizePath` (`realpath`), so an `invoke(...)` literal whose directory
 * spelling differs only in case from the discovered path matches its node on a
 * case-insensitive host — the same `realpath` identity every sibling consumer
 * of this pass (INV-1 containment, the realpath-keyed parse cache) compares
 * under (invocation.md §Static resolution; `src/runtime/invocation.ts`). A
 * byte-exact string match would silently drop that edge and withhold the
 * mandated `theta/load/invocation-cycle` refusal (bug 0362). A `realpath`
 * rejection (a callee removed between discovery and here, or an in-memory FS
 * double whose realpath rejects) falls back to the separator-normalised
 * spelling — the pre-canonicalisation identity — so a non-existent callee
 * matches no discovered node and its edge drops, preserving leaf-termination.
 * The `.then(ok, err)` arm is the sanctioned I/O-boundary pattern, not a broad
 * catch (mirrors bug 0361's import-resolver canonicalisation).
 */
export async function buildInvokeGraph(
  inputs: readonly ThetaCompositionInput[],
  fs: Pick<FileSystem, "realpath">,
): Promise<InvokeGraph> {
  const canonical = (path: string): Promise<string> =>
    canonicalizePath(fs, path).then(
      (real) => real,
      () => normalizePath(path),
    );
  const byPath = new Map<string, string>();
  for (const input of inputs) {
    if (input.sourcePath !== undefined) {
      byPath.set(await canonical(input.sourcePath), input.slashName);
    }
  }
  const edges = new Map<string, string[]>();
  for (const input of inputs) {
    if (input.sourcePath === undefined) continue;
    const targets: string[] = [];
    for (const invoke of collectInvokeExprs(input.body)) {
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) continue;
      const abs = await canonical(resolveCalleeAbsolute(input.sourcePath, invoke.path));
      const targetName = byPath.get(abs);
      if (targetName !== undefined) targets.push(targetName);
    }
    edges.set(input.slashName, targets);
  }
  return { edges, unresolvable: new Set<string>() };
}

/**
 * INV-3 over the `.theta`-callable call surface (tool-calls.md §"Argument
 * shape"; bug 0071): reached only for a `tools:` entry that already
 * resolved cleanly — an unresolvable path or an erroring callee un-registers
 * the parent in `resolveThetaToolsAtLoad` before the compose loop reaches
 * this pass at all, so `deps.callableSet` never carries a rejected entry
 * here, and no `.theta`-callable call attracts a second, derived diagnostic
 * on top of that entry's own rejection.
 */
async function checkThetaCallableCallSurface(
  callExprs: readonly CallExpr[],
  callerPath: string,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
  deps: {
    readonly callableSet: CallableSetSnapshot | undefined;
    readonly resolveCalleeArity: (calleeAbsolutePath: string) => Promise<CalleeArity | undefined>;
  },
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  for (const site of resolveThetaCallableCallSites(
    callExprs,
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
    // RFC 0009 (invocation.md INV-8 static mode gate, then INV-6 cwd type)
    // via the shared `checkWithClauseAtCallSurface` orchestration — the
    // `.theta`-callable half of the invoke surface's own call to it.
    // PRODUCTION-UNREACHABLE (the INV-8 arm): a prompt-mode `.theta` in
    // `tools:` already un-registers the theta at load
    // (`theta/load/prompt-mode-callable`, tool-calls.md), so no registered
    // caller can hold this site — the arm exists so the gate is uniform
    // across both clause-bearing surfaces (and for harness inputs).
    // `<callee>` is the PRESENTED callable name here, not the callee path
    // (placeholder-rendering-b.md §7), as this surface's other rows render it.
    diagnostics.push(
      ...checkWithClauseAtCallSurface({
        ...(site.call.withClause !== undefined ? { clause: site.call.withClause } : {}),
        mode: arity.mode,
        presented: site.name,
        surface: { kind: "theta-callable", name: site.name },
        file: callerPath,
        range: site.call.range,
        typeEnv,
        typePass,
      }),
    );
    const arityDiags = checkInvokeArity({
      // The `invoke(...)` arm below renders `<callee>` as the verbatim path
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
    });
    diagnostics.push(...arityDiags);
    if (arityDiags.length > 0) {
      // invocation.md §"Argument arity": arity is checked before type — a
      // site the arity check already rejected draws no additional
      // type-mismatch diagnostic (bug 0071 §Fix constraint 5).
      continue;
    }
    // Bug 0072 — per-argument type mismatch (tool-calls.md §"Argument
    // shape": "an argument that does not type-check against the callee's
    // `params:` surfaces as `theta/parse/tool-arg-type-mismatch` when the
    // callee is statically resolvable"), positional slot `i` against the
    // callee's `i`-th `params:` field. `arity.fields` is the
    // callee's WHOLE `params:` list in declaration order, and the arity
    // check above already bounds `providedCount` within
    // `[requiredCount, totalCount]`, so every provided slot has a
    // corresponding field.
    diagnostics.push(
      ...checkCallableArgumentTypes({
        call: site.call,
        fields: arity.fields,
        calleeKind: "theta-callable",
        toolName: site.name,
        file: callerPath,
        typeEnv,
        typePass,
      }),
    );
  }
  return diagnostics;
}

/**
 * RFC 0011 §5.2 (tool-calls.md #session-control-runtime-tools): fixed-signature
 * arity/type checks for call sites whose frozen callable-set entry is
 * `kind: "runtime-tool"`. Mirrors `checkThetaCallableCallSurface`'s structure:
 * per call site, arity via `checkInvokeArity`, type via `checkToolCallArguments`
 * with `calleeKind: "runtime-tool"` and `positionalCount: 1`, first-mismatch-only.
 * GOV-15 inert: the loop body is unreachable when the callable set holds no
 * runtime-tool entry (every 1.0.0-clean file).
 */
function checkRuntimeToolCallSurface(
  callExprs: readonly CallExpr[],
  callerPath: string,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
  callableSet: CallableSetSnapshot | undefined,
): Diagnostic[] {
  if (callableSet === undefined) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  for (const call of callExprs) {
    const entry = callableSet.entries.get(call.callee);
    if (entry === undefined || entry.kind !== "runtime-tool") {
      continue;
    }
    const canonical: RuntimeToolName = (entry as { name: RuntimeToolName }).name;
    const sig = RUNTIME_TOOL_SIGNATURES.get(canonical);
    if (sig === undefined) {
      continue;
    }
    const presentedName = call.callee;
    const providedCount = call.args.length;
    const arityDiags = checkInvokeArity({
      callee: presentedName,
      staticallyResolvable: true,
      requiredCount: sig.requiredCount,
      totalCount: sig.totalCount,
      providedCount,
      site: { file: callerPath, range: call.range },
    });
    diagnostics.push(...arityDiags);
    if (arityDiags.length > 0) {
      // Arity before type (invocation.md §"Argument arity").
      continue;
    }
    // Per-argument type mismatch, first-mismatch-only, reusing the
    // `.theta`-callable arm's `checkToolCallArguments` emitter with
    // `calleeKind: "runtime-tool"`. Expected side from the signature's
    // `typeSource`; provable-only (`collectProvableArgTypes`).
    diagnostics.push(
      ...checkCallableArgumentTypes({
        call,
        fields: sig.params,
        calleeKind: "runtime-tool",
        toolName: presentedName,
        file: callerPath,
        typeEnv,
        typePass,
      }),
    );
  }
  return diagnostics;
}

/**
 * Bug 0072 — the Pi-tool provable-disjointness check (tool-calls.md
 * §"Provable-disjointness check (parse time)"), a THIRD loop over the SAME
 * `callSites.callExprs` (no new walk; bug 0071 §Fix constraint 3: reuse the
 * shared collection, never fork the walk).
 */
function checkPiToolArgDisjointness(
  callerPath: string,
  callExprs: readonly CallExpr[],
  callableSet: CallableSetSnapshot | undefined,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (callableSet !== undefined) {
    for (const call of callExprs) {
      // Bug 0071 §Fix constraint 2: the snapshot is read through `Map.get`
      // plus an explicit `!== undefined` test — a callable name is
      // author-controlled source text (the 0031/0038 hazard class).
      const entry = callableSet.entries.get(call.callee);
      if (entry === undefined || entry.kind !== "pi-tool") {
        continue;
      }
      // The arity/shape rules own every site whose sole argument is not a
      // bare object literal, and every multi-argument site: both are
      // error-severity PARSE diagnostics, which drop the theta before this
      // compose pass ever runs (bug 0072 §Fix, parse half). This arm only
      // ever sees the accepted single-bare-object-argument shape.
      const sole = call.args.length === 1 ? call.args[0] : undefined;
      if (sole === undefined || sole.kind !== "object" || sole.typeName !== null) {
        continue;
      }
      const parameters = (
        entry.toolDefinition as { readonly parameters?: unknown } | undefined
      )?.parameters;
      const properties = toolParameterProperties(parameters);
      if (properties === undefined) {
        continue;
      }
      const schemaFieldStaticTypes: {
        readonly field: string;
        readonly exprType: string;
        readonly schemaType: string;
      }[] = [];
      for (const objField of sole.fields) {
        const schemaType = fieldSchemaType(properties.get(objField.name));
        if (schemaType === undefined) {
          // No schema type to be disjoint from: an unknown field name (the
          // runtime half's case — bug 0072 §Fix) or a refined / typeless
          // field schema (unprovable). Either way, out of this arm's reach.
          continue;
        }
        const fieldTypes = collectProvableArgTypes(objField.value, typeEnv, typePass);
        if (fieldTypes === undefined) {
          // Unprovable by construction: a value-contributing position past the
          // parser's static view — see `collectProvableArgTypes`. The value
          // falls through to the runtime AJV net, which is where
          // tool-calls.md §"Provable-disjointness check (parse time)" puts
          // everything the subset cannot decide.
          continue;
        }
        schemaFieldStaticTypes.push({
          field: objField.name,
          // The whole union of what the field can evaluate to, which is what
          // `subsetKinds` needs to apply its "an unrepresentable arm makes the
          // whole union unprovable" rule: `integer | string` against a
          // `string` schema field intersects and stands down, while a
          // single-kind `integer` still fires.
          exprType: renderCollectedTypes(fieldTypes),
          schemaType,
        });
      }
      if (schemaFieldStaticTypes.length === 0) {
        continue;
      }
      diagnostics.push(
        ...checkToolCallArguments({
          toolName: call.callee,
          calleeKind: "pi-tool",
          positionalCount: 1,
          file: callerPath,
          range: call.range,
          schemaFieldStaticTypes,
        }),
      );
    }
  }
  return diagnostics;
}

/**
 * Run the load-time invoke static checks for one discovered theta, returning
 * every diagnostic (error-severity entries un-register the theta):
 *
 *   - INV-1 (invocation.md §Resolution) path-escape (`theta/load/invoke-path-escape`) via
 *     the realpath + discovery-root containment check — the `invoke(...)` surface ONLY.
 *     The `tools:` `.theta`-entry surface's containment is judged at `tools:` resolution
 *     time (`parseCalleeForTools`), for the entry itself and for a `tools:`-reached callee's
 *     own `tools:` `.theta` entries alike: an error-severity rejection there un-registers
 *     the caller before this pass runs, so an escaping entry at either depth never reaches
 *     this pass's arity or type loops. For a callee this pass cannot statically resolve —
 *     or one reached by an `invoke(...)` literal, whose own nested entries that judgement
 *     does not reach — the defence is the runtime open-time re-check (`#driveCallee` →
 *     `#recheckCalleeContainment`), which fails the call closed instead;
 *   - `theta/load/callee-has-errors` (WARNING, via `checkCalleeHasErrors` with
 *     `surface: "invoke"`) for a literal `invoke(...)` callee that is unreadable
 *     or absent on disk (discovery-cli.md §Static resolution): the parent still
 *     registers and the remaining static checks for that site are skipped;
 *   - INV-3 arity (`theta/parse/invoke-arity-too-{many,few}`) against the
 *     statically-resolved callee's `params:` counts, over BOTH the
 *     `invoke(...)` call surface and the `.theta`-callable call surface
 *     (tool-calls.md §"Argument shape" binds the two by name);
 *   - bug 0137 `theta/parse/invoke-arg-type-mismatch` over the `invoke(...)`
 *     call surface (via `checkInvokeCall`), immediately AFTER its arity check
 *     and only when arity raised no diagnostic: a positional argument whose
 *     static type does not match the callee's corresponding `params:` field;
 *   - bug 0072 `theta/parse/tool-arg-type-mismatch` over the `.theta`-callable
 *     call surface, immediately AFTER its arity check and only when arity
 *     raised no diagnostic (arity before type, invocation.md §Argument
 *     arity): a positional argument whose static type does not match the
 *     callee's corresponding `params:` field type;
 *   - bug 0072 `theta/parse/tool-arg-schema-conflict` over the Pi-tool call
 *     surface: a sole bare-object argument field whose static type is
 *     provably disjoint from the tool's registered input-schema type for
 *     that field (RFC 0002's provable-disjointness front-run of the runtime
 *     AJV check);
 *
 *     All three type checks judge an expression by the SET of types it can
 *     evaluate to (`collectProvableArgTypes`), never by the single type a
 *     composite narrows to, which is what keeps them off values the runtime
 *     AJV check accepts — see that function's own comment.
 *   - RFC 0011 §5.2 (tool-calls.md #session-control-runtime-tools)
 *     `theta/parse/tool-arg-type-mismatch` over the runtime-tool call
 *     surface (`checkRuntimeToolCallSurface`): arity via `checkInvokeArity`
 *     against the tool's fixed signature, then, only when arity raised no
 *     diagnostic, per-slot type via `checkToolCallArguments` with
 *     `calleeKind: "runtime-tool"` — mirroring the `.theta`-callable
 *     surface's own two checks above. GOV-15 inert: unreachable while the
 *     callable set holds no `"runtime-tool"` entry (every 1.0.0-clean file);
 *   - RFC 0009 INV-8 `theta/parse/with-clause-prompt-mode-callee` on both call
 *     surfaces: a call-site `with` clause on a statically-resolvable
 *     PROMPT-mode callee, refused before that site's arity/type block;
 *   - RFC 0009 INV-6 (`checkClauseCwdType`, both surfaces): the clause's `cwd`
 *     value judged as an ordinary `string` argument slot, drawing the surface's
 *     own arg-type row above (no dedicated code);
 *   - RFC 0009 Erratum A′ / Erratum B `theta/parse/with-clause-pi-tool` /
 *     `theta/parse/with-clause-in-process-callee`: the default-reject loop over
 *     the bare-ident call surface for a clause on any callee the frozen
 *     callable set does not classify `theta` and that is not one of the
 *     file's own `subagent fn`s (RFC 0012 §10); an imported callee's verdict
 *     is deferred to `checkImportedWithClauseCallees` after import
 *     materialisation;
 *   - INV-4 invocation cycle (`theta/load/invocation-cycle`) via the graph walk.
 *
 * The extension-matching and forward-slash path-literal checks (lexical.md
 * §"Extension matching" / §"Path literals", reached via invocation.md §Resolution)
 * and the dynamic-path rejection (invocation.md §Resolution's string-literal
 * requirement) already fired during the whole-file parse and are not repeated here.
 */
export async function checkInvokeStaticResolution(
  input: ThetaCompositionInput,
  deps: {
    readonly fs: Pick<FileSystem, "realpath">;
    readonly activeRoots: readonly string[];
    readonly graph: InvokeGraph;
    readonly resolveCalleeArity: (calleeAbsolutePath: string) => Promise<CalleeArity | undefined>;
    /**
     * Bug 0473: the cross-file `invoke<Schema>` return-type leg's callee-side
     * input — the callee's inferred final-value payload, or `undefined` when
     * it is unresolvable / not decidable without callee-namespace resolution
     * (the runtime AJV net is the fallback for either case). Optional (unlike
     * `resolveCalleeArity`): a caller that omits it gets no return-type leg,
     * not a crash — the same shape `callableSet` below already uses, and the
     * one this pass's OWN production wiring (production-composition.ts)
     * always supplies.
     */
    readonly resolveCalleeReturnType?: (
      calleeAbsolutePath: string,
    ) => Promise<CompatType | undefined>;
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
    // One traversal feeds every check loop below (`CollectedCallSites`): the two
    // call surfaces are checked against the same reachable-node set by
    // construction, so neither can be reached by a walk the other misses.
    const callSites = collectCallSites(input.body);

    // Bug 0072 / bug 0137: all three static tool/invoke-argument TYPE checks —
    // this loop's own per-argument check below, the `.theta`-callable
    // per-argument check, and the Pi-tool schema-conflict check — share ONE
    // `StaticTypeInferencePass` instance and whole-file `TypeEnv`, derived once
    // per theta from `input.body` — never per call site.
    const typeEnv = collectTypeEnv(input.body.statements);
    // RFC 0011 §0 C6: thread the runtime-tool success-type map so the
    // compose-pass type inference can resolve member accesses on
    // try-unwrapped runtime-tool results. GOV-15 inert: empty when the
    // callable set holds no runtime-tool entry.
    const runtimeToolSuccessTypes = buildComposePassSuccessTypes(deps.callableSet);
    const typePass = new StaticTypeInferencePass({
      checkCompatible,
      enumNames: collectEnumNames(input.body.statements),
      ...(runtimeToolSuccessTypes !== undefined ? { runtimeToolSuccessTypes } : {}),
    });

    diagnostics.push(
      ...(await checkInvokeExprCallSurface(
        callSites.invokeExprs,
        callerPath,
        typeEnv,
        typePass,
        {
          fs: deps.fs,
          activeRoots: deps.activeRoots,
          resolveCalleeArity: deps.resolveCalleeArity,
          resolveCalleeAbsolute,
          checkWithClause: checkWithClauseAtCallSurface,
          buildInvokeArgSlot,
          // Defaulted here, not left optional on `checkInvokeExprCallSurface`'s
          // own deps: that keeps the return-type leg's `if` block below
          // unconditional on presence, reading only as “did the callee resolve”.
          resolveCalleeReturnType:
            deps.resolveCalleeReturnType ?? ((): Promise<CompatType | undefined> => Promise.resolve(undefined)),
        },
      )),
    );

    diagnostics.push(
      ...(await checkThetaCallableCallSurface(
        callSites.callExprs,
        callerPath,
        typeEnv,
        typePass,
        { callableSet: deps.callableSet, resolveCalleeArity: deps.resolveCalleeArity },
      )),
    );

    // RFC 0011 §5.2: fixed-signature arity/type checks for runtime-tool call
    // sites. GOV-15 inert: the loop body is unreachable when no `tools:` entry
    // resolves to a `"runtime-tool"` kind (every 1.0.0-clean file).
    diagnostics.push(
      ...checkRuntimeToolCallSurface(
        callSites.callExprs,
        callerPath,
        typeEnv,
        typePass,
        deps.callableSet,
      ),
    );

    diagnostics.push(
      ...checkWithClauseDefaultReject(
        callerPath,
        callSites.callExprs,
        deps.callableSet,
        input.body.statements,
      ),
    );

    diagnostics.push(
      ...checkPiToolArgDisjointness(
        callerPath,
        callSites.callExprs,
        deps.callableSet,
        typeEnv,
        typePass,
      ),
    );
  }

  // INV-4 (invocation.md §Cycle detection): walk the static-resolution graph
  // from this theta; a back-edge un-registers it.
  const cycle = detectInvocationCycle(input.slashName, deps.graph);
  if (cycle !== undefined) {
    diagnostics.push(cycle);
  }

  return diagnostics;
}
