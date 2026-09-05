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
//   - bug 0137 — `theta/parse/invoke-arg-type-mismatch`, via `checkInvokeCall`
//     over the SAME `invoke("./x.theta", …)` site, immediately after (and
//     replacing the direct call to) its arity check: arity runs exactly once
//     and, only when it raised no diagnostic, a per-slot check compares each
//     positional argument against the callee's corresponding `params:` field
//     (invocation.md §Argument binding). Shares this loop's resolved `arity`
//     and the same soundness mechanisms as the bug 0072 check below.
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
//   - INV-4 — `detectInvocationCycle` over the per-load-pass static-resolution
//     graph (`theta/load/invocation-cycle`); a self-cycle or an A→B→A cycle
//     un-registers the entry theta, which is what keeps a self-referential theta
//     from driving pure unbounded invoke recursion at runtime.
//   - INV-1 (invocation.md §Resolution) — `checkInvokePathAtLoad` (the shared realpath +
//     discovery-root containment check) so a callee resolving outside every active
//     discovery root is `theta/load/invoke-path-escape` and the parent does not register.
//   - bug 0138 — `checkImportedFnCallArgs`, wired once per importing theta from
//     `checkThetaImports` (../extension/import-static-checks.ts): an imported
//     `.thetalib` `fn` call's argument COUNT (`theta/parse/fn-arity-too-few` /
//     `-too-many`, bug 0131's arm (3), deferred to this bug by name) and
//     per-slot TYPE (`theta/parse/fn-arg-type-mismatch`, whose *Trigger*
//     already named the imported half). No new diagnostic code; the three
//     existing rows carry the route, judged HERE — at the load pass, where the
//     resolved library already exists as a parsed `ThetaDocument` — because
//     the same-file parse (`checkFnCallArgs`, ../parser/type-layer-checks.ts)
//     never crosses a file boundary. Reuses this file's own `collectCallSites`
//     (bug 0071's one-walker lesson), `collectProvableArgTypes` and
//     `dedupeArgType` below, plus the parser's unchanged `checkFnCallArity` /
//     `checkFnArgCompat` emitters.
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
  FnDecl,
  FnParam,
  InvokeExpr,
  MemberExpr,
  ObjectExpr,
  SchemaFieldSource,
  ThetaBody,
  Stmt,
} from "../parser/theta-document";
import { checkObjectLiteralFields } from "../parser/literal-sublanguage";
import { checkVariantAccess } from "../parser/schema-declarations";
import type { CallableSetSnapshot } from "../parser/callable-set";
import {
  checkFnCallArity,
  checkInvokeArity,
  checkInvokeCall,
  checkCalleeHasErrors,
  type InvokeArgSlot,
} from "../parser/invoke-diagnostics";
import {
  detectInvocationCycle,
  type InvokeGraph,
} from "../runtime/invoke-depth-cycle";
import { canonicalizePath, checkInvokePathAtLoad } from "../runtime/invocation";
import type { FileSystem } from "../seams/file-system";
import type { ThetaCompositionInput } from "./theta-composition-producer";
// Bug 0072: the two static tool-argument TYPE checks reuse the existing `V20b`
// static-type-inference substrate and `V2b` compatibility engine rather than
// re-deriving a parallel type model for this pass.
import { checkToolCallArguments } from "../runtime/tool-call";
import {
  BOOLEAN_BINARY_OPS,
  isStaticZeroIntegerDivisor,
  StaticTypeInferencePass,
} from "../parser/static-type-inference";
import {
  annotationSourceIsNotTypeExpression,
  annotationToCompatType,
  collectEnumNames,
  collectLocalBinderNames,
  collectTypeEnv,
  fnParamNamesAreIdentifiers,
} from "../parser/type-layer-checks";
import {
  checkCompatible,
  checkFnArgCompat,
  displayType,
  type CompatType,
  type TypeEnv,
} from "../parser/type-compat";

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
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [], objectExprs: [], memberExprs: [] };
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
      // Bug 0430: the member NODE itself joins `memberExprs` (mirroring the
      // 0429 `object` arm's own-node-plus-descend shape), in addition to the
      // pre-existing descent into the target.
      out.memberExprs.push(expr);
      walkExpr(expr.target, out);
      return;
    case "index":
      walkExpr(expr.target, out);
      walkExpr(expr.index, out);
      return;
    case "object":
      // Bug 0429: the constructor NODE itself joins `objectExprs` (a bare
      // `{ … }` included — filtered by `typeName` downstream), in addition to
      // the pre-existing descent into each field's value expression.
      out.objectExprs.push(expr);
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
      // `par for` bodies at once — INV-3 arity over both call surfaces, the `invoke(...)`
      // surface's INV-1 (invocation.md §Resolution) path-escape and `checkCalleeHasErrors`
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
    case "block":
      // A `let`-RHS / match-arm-body block (bug 0082 §Fix) is an ordinary
      // call-site region: an `invoke(...)` / `.theta`-callable call inside it
      // must still be collected for INV-3 / INV-4 / INV-1.
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
 * `A.theta` has a literal `invoke("./B.theta")` resolving to a discovered theta
 * `B`. Edges to non-discovered callees are dropped — a cycle routed only through
 * undiscovered files is not detected until they are discovered (the spec's
 * leaf-termination rule).
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

/** One `.theta`-callable / `invoke(...)` callee's `params:` field, as the
 * per-argument type-mismatch checks (`theta/parse/tool-arg-type-mismatch`, bug
 * 0072; `theta/parse/invoke-arg-type-mismatch`, bug 0137) consume it:
 * positional order, verbatim declared type source and field name. */
export interface CalleeArityField {
  /** The field's verbatim declared type source (`params: { x: <this> }`). */
  readonly typeSource: string;
  /**
   * The field's verbatim `params:` name (`params: { <this>: string }`). Bug
   * 0137's invoke-literal arm reports this as `<param>`; the
   * `.theta`-callable arm's own *Message* carries no `<param>` (bug 0072 never
   * needed this field), so that arm does not read it.
   */
  readonly name: string;
}

/** The callee shape the arity check consults, resolved once per site. */
export interface CalleeArity {
  /** Count of `params:` fields that are neither defaulted nor optional. */
  readonly requiredCount: number;
  /** Total `params:` field count. */
  readonly totalCount: number;
  /**
   * The callee's WHOLE `params:` list, in declaration order (bug 0072; bug
   * 0137): slot `i` of a `.theta`-callable call OR an `invoke(...)` call
   * binds to `fields[i]`, the same positional correspondence
   * `checkInvokeArity`'s counts already assume (invocation.md §"Argument
   * binding").
   */
  readonly fields: readonly CalleeArityField[];
}

/**
 * Read a Pi tool's registered JSON-Schema `parameters.properties` map (bug
 * 0072), or `undefined` when `parameters` is absent or not a plausible
 * JSON-Schema object. A `Map` built from `Object.entries`, never a
 * plain-object property read on a field name: the caller keys into this map
 * by the theta author's own object-literal field name, which is arbitrary
 * source text (the 0031/0038 hazard class) — `parameters`/`properties`/`type`
 * themselves are fixed keys this module chooses, not author-controlled, so a
 * direct property read on them is unaffected.
 */
function toolParameterProperties(
  parameters: unknown,
): ReadonlyMap<string, unknown> | undefined {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    return undefined;
  }
  const properties = (parameters as { readonly properties?: unknown }).properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return undefined;
  }
  return new Map(Object.entries(properties as Record<string, unknown>));
}

/**
 * The JSON-Schema keywords that make one input-schema field's disjointness
 * unprovable: tool-calls.md §"Provable-disjointness check (parse time)" defers
 * anything the schema subset cannot represent to the runtime AJV check, and
 * any of these refines the accepted-value set past what a bare `type`
 * kind-set comparison can decide.
 */
const SCHEMA_REFINEMENT_KEYS: ReadonlySet<string> = new Set([
  "format",
  "pattern",
  "enum",
  "const",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
]);

/**
 * The rendered subset-kind-set source `computeToolArgSchemaConflict`
 * (../runtime/tool-call.ts) consumes for one Pi-tool input-schema field, or
 * `undefined` when the field carries no `type` or any `SCHEMA_REFINEMENT_KEYS`
 * keyword (unprovable: defer to the runtime AJV net). A JSON-Schema
 * `type` array (`["string", "null"]`) renders as `a | b` — `subsetKinds`
 * splits top-level unions the same way an author-written union annotation
 * does.
 */
function fieldSchemaType(fieldSchema: unknown): string | undefined {
  if (typeof fieldSchema !== "object" || fieldSchema === null || Array.isArray(fieldSchema)) {
    return undefined;
  }
  const record = fieldSchema as Record<string, unknown>;
  if (Object.keys(record).some((key) => SCHEMA_REFINEMENT_KEYS.has(key))) {
    return undefined;
  }
  const type = record["type"];
  if (typeof type === "string") {
    return type;
  }
  if (Array.isArray(type) && type.every((t) => typeof t === "string")) {
    return (type as string[]).join(" | ");
  }
  return undefined;
}

/**
 * The flat set of static types whose UNION covers every value `expr` can
 * evaluate to, or `undefined` when any value-contributing position is past the
 * parser's static view. Both type checks below reason over this SET rather than
 * over `StaticTypeInferencePass`'s single reduced type.
 *
 * `#commonType` (../parser/static-type-inference.ts) narrows a composite to ONE
 * candidate and drops its siblings on two paths: a candidate survives a sibling
 * that answers `unknown`, and a candidate set with no common member falls back
 * to `candidates[0]`. Either path renders `flag ? 1 : "a"` as `integer`, and a
 * check that trusts that rejects the runtime value `"a"` — which `read`'s
 * `path: { type: "string" }` accepts. tool-calls.md §"Provable-disjointness
 * check (parse time)" forbids exactly that ("a provable disjointness guarantees
 * the runtime AJV check would reject the same value … The check therefore never
 * rejects a program the runtime AJV check would accept"), and on the
 * `.theta`-callable arm it defeats bug 0072 §Fix's rule that only an explicit
 * incompatibility is a mismatch while `unknown` defers to the runtime net.
 * Keeping the whole value-type set in front of both consumers is what lets
 * `subsetKinds`' "an unrepresentable arm makes the whole union unprovable" rule
 * (../runtime/tool-call.ts) and the every-arm-incompatible test below decide
 * these expressions correctly. The RENDERING stays on `displayType`, the
 * canonical form diagnostics/placeholder-rendering-a.md category 1 mandates.
 *
 * The recursion visits exactly the VALUE-contributing positions — a ternary
 * condition and a `match` scrutinee choose WHICH arm supplies the value, never
 * what that value is — and mirrors `#typeExpr` / `#typeBinary` shape for shape,
 * so a collected member can never render differently from the type the pass
 * itself assigns. It is exhaustive over the `Expr` union with no `default` arm:
 * a kind added to the union without an arm here is a compile error rather than a
 * silent verdict. `undefined` at any nested position propagates, and every kind
 * not named as value-derivable yields `undefined`, so withholding is the
 * default — it can only suppress an emission, never produce one.
 */
function collectProvableArgTypes(
  expr: Expr,
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "bool":
    case "null":
      // A literal's whole value-type set is its own type. Read off the pass so
      // the literal→`CompatType` mapping keeps one owner. `typeOf`'s default
      // empty bindings map applies: no consumer here resolves `let` bindings.
      return [pass.typeOf(expr, env)];
    case "ternary":
      return collectArmUnion([expr.consequent, expr.alternate], env, pass);
    case "match":
      return collectArmUnion(
        expr.arms.map((arm) => arm.body),
        env,
        pass,
      );
    case "try":
      // `operand?` evaluates to the operand's success value.
      return collectProvableArgTypes(expr.operand, env, pass);
    case "block":
      // A block's value IS its tail expression's value (bug 0082 §Fix
      // constraint 3) — mirrors the `try` arm immediately above. A tail-less block
      // (already a parse error, `theta/parse/block-expr-missing-tail`) yields
      // no value-type set to collect.
      return expr.body.tail === null
        ? undefined
        : collectProvableArgTypes(expr.body.tail, env, pass);
    case "binary": {
      // `parseUnary` (../parser/theta-document.ts) models unary `!` / `-` as a
      // binary carrying a SYNTHETIC `null` left operand; the arms below dispatch
      // on that shape in `#typeBinary`'s own order, so the two agree per shape.
      if (expr.left.kind === "null" && expr.op === "-") {
        // Negation carries the operand's own value type.
        return collectProvableArgTypes(expr.right, env, pass);
      }
      if (
        (expr.left.kind === "null" && expr.op === "!") ||
        BOOLEAN_BINARY_OPS.has(expr.op)
      ) {
        // The value is a boolean whatever the operands evaluate to (`evalBinary`
        // in ../runtime/statement-executor.ts yields `true` / `false` for `!`,
        // `&&`, `||` and every comparison), so the set is exact even where an
        // operand is statically unresolvable — an unresolvable operand under one
        // of these operators is not a reason to withhold the expression.
        // `BOOLEAN_BINARY_OPS` is `#typeBinary`'s own set, imported rather than
        // restated so the two cannot drift.
        return [pass.typeOf(expr, env)];
      }
      if (expr.op === "/") {
        // `/`'s result type is fixed by the operator (expressions.md
        // §"Other arithmetic": always `number`, whatever the operands) — the
        // same result-fixed reasoning the arm above states, so the set is
        // exact and the operand sets are not consulted. Reading
        // `pass.typeOf(expr, env)` rather than unioning `expr.left` /
        // `expr.right`, as the arithmetic arm below does for `+` / `-` / `*` /
        // `%`, is what keeps this function's own invariant true — it "mirrors
        // `#typeExpr` / `#typeBinary` shape for shape, so a collected member
        // can never render differently from the type the pass itself assigns"
        // — rather than adding `/` as an exception to it.
        return [pass.typeOf(expr, env)];
      }
      if (expr.op === "%" && isStaticZeroIntegerDivisor(expr.right)) {
        // Bug 0152 §Fix (c): mirrors `#typeBinary`'s zero-divisor `%` arm
        // (../parser/static-type-inference.ts), the same MIRROR precedent bug
        // 0142 set for `/` immediately above — one owner of the rule, read off
        // the pass rather than restated here.
        return [pass.typeOf(expr, env)];
      }
      // Arithmetic (`+`, `-`, `*`, and `%` for a non-zero-or-non-integer
      // divisor): the value takes one operand's kind or the two widened
      // together (`integer + number` is a number), all of which the union of
      // the operand sets covers. Over-approximating is safe in the one
      // direction that matters — a wider set only makes disjointness harder to
      // prove, and `kindsDisjoint` (../runtime/tool-call.ts) already
      // reconciles `integer`/`number`, so a `%` divisor this arm still reaches
      // (any divisor that is not a statically-zero integer literal) cannot turn
      // a withheld verdict into a fired one. The zero-integer-divisor `NaN`
      // widening is no longer this arm's concern: the guard above collects it
      // exactly, ahead of this fallback.
      return collectArmUnion([expr.left, expr.right], env, pass);
    }
    case "array": {
      // The Pi-tool arm's own bail is untouched by this arm: `subsetKinds`
      // (../runtime/tool-call.ts) admits no `array<…>` kind, so that consumer
      // still proves nothing from an array member and stands down on its own
      // "an unrepresentable arm makes the whole union unprovable" rule whatever
      // this arm answers. The invoke and `.theta`-callable arms compare
      // `CompatType`s through `checkCompatible` instead, which decides
      // `array<string> ⋢ string` — so for those two consumers an unconditional
      // bail withheld a decidable case, not an undecidable one.
      //
      // An EXACTNESS-TESTED mirror of `#typeExpr`'s own array arm
      // (../parser/static-type-inference.ts): trusting `pass.typeOf`'s reduced
      // element type outright would repeat bug 0072's false-`E` species — that
      // reduction runs through `#commonType`, which can bless an unresolvable
      // sibling or fall back to `candidates[0]`, either of which erases a
      // member the runtime can still produce. Collecting the elements through
      // `collectArmUnion` and requiring their rendering to equal the reduction's
      // element rendering is the set-wise analogue of the parser-layer sibling's
      // own exactness test (`isProvenReduction`, `provableArgType`'s `array` arm
      // in ../parser/type-layer-checks.ts), and is what keeps this function's
      // own header invariant true: a collected member can never render
      // differently from the type the pass itself assigns.
      const reduced = pass.typeOf(expr, env);
      if (reduced.kind !== "array") {
        // An empty element list reduces to a nominal `unknown`, not an
        // `array` — `#commonType`'s empty-candidate-set fallback — so this
        // narrowing is also what keeps `[]` withheld, the same silence the
        // same-file `fn` surface already shows on `he([])`.
        return undefined;
      }
      const elements = collectArmUnion(expr.elements, env, pass);
      if (elements === undefined) {
        // An element past the parser's static view (e.g. an `ident`) withholds
        // the whole literal rather than reducing around it.
        return undefined;
      }
      return renderCollectedTypes(elements) === displayType(reduced.element)
        ? [reduced]
        : undefined;
    }
    case "ident":
    case "member":
    case "call":
    case "invoke":
    case "query":
    case "object":
    case "result-ctor":
    case "method-call":
      // Each types as a `named` nominal reference past the parser's static view
      // — the shape `checkCompatible` answers `unknown` for and the runtime AJV
      // net owns. `ident` included: both consumers below read types with an
      // EMPTY bindings map, so even a `let`-bound name is nominal here.
      return undefined;
    case "index":
    case "par-for":
      // Both CAN reduce past a nominal reference — an index read on a
      // statically-array target narrows to its element type, and a `par for` is
      // an `array` over a nominal `Result<…>` — so bailing is stricter than
      // `#typeExpr` needs. Deliberate: withholding suppresses an emission and
      // can never produce one, and neither shape is a Pi-tool argument field or
      // callable-argument idiom worth the extra reduction surface.
      return undefined;
  }
}

/**
 * Concatenate the collected value-type sets of a composite's value-contributing
 * operands, propagating `undefined` from any one of them: a composite one of
 * whose arms is unresolvable can take a value of unknown type, so nothing about
 * it is provable. An EMPTY concatenation is `undefined` too — `#commonType`
 * maps an empty candidate set to a nominal `unknown`, and a vacuously-true
 * "every arm is incompatible" must never read as a proof.
 */
function collectArmUnion(
  arms: readonly Expr[],
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  const collected: CompatType[] = [];
  for (const arm of arms) {
    const armTypes = collectProvableArgTypes(arm, env, pass);
    if (armTypes === undefined) {
      return undefined;
    }
    collected.push(...armTypes);
  }
  return collected.length > 0 ? collected : undefined;
}

/**
 * Render a collected value-type set for the `<actual>` placeholder: each member
 * through `displayType`, deduplicated, joined with `" | "` — the top-level-union
 * spelling `subsetKinds` (../runtime/tool-call.ts) splits back into kinds and
 * the same spelling an author-written union annotation carries. Deduplication
 * keeps a composite whose arms all render alike reading exactly as one arm does,
 * so `flag ? 1 : 2` renders `integer` rather than `integer | integer`. `Set`
 * iteration is insertion-ordered, so the arms render in source order.
 */
function renderCollectedTypes(types: readonly CompatType[]): string {
  return [...new Set(types.map((type) => displayType(type)))].join(" | ");
}

/**
 * Build one `invoke(...)` positional argument slot (bug 0137), reusing the
 * `.theta`-callable arm's per-slot mechanisms unchanged: the expected side
 * from the callee's verbatim `params:` field type (`annotationToCompatType`),
 * the actual side from the SET of types the argument can evaluate to
 * (`collectProvableArgTypes`), both judged under `emptyCalleeAnnotationEnv` so
 * a caller-local homonym cannot decide a verdict about the callee's contract.
 *
 * Returns a WITHHELD slot (`paramType` / `argType` both `undefined`) whenever
 * any input is absent or the every-member-incompatible test does not hold:
 * `field` absent is the too-many case (arity already fails on this site, so
 * `checkInvokeCall` never reaches the per-argument check, and no field name is
 * available to report); `argExpr` absent cannot arise given how the caller
 * derives its loop bound from the same `invoke.args`, kept as a defensive
 * withhold rather than an unchecked index read; `annotationToCompatType`
 * returning `undefined` and `collectProvableArgTypes` returning `undefined`
 * both mean the same thing `type-system.md` §"Unresolvable operands" already
 * names — a side past the parser's static view defers to the callee's runtime
 * AJV load. `checkInvokeArgTypes` skips a withheld slot before it calls
 * `checkCompatible`.
 *
 * Never fabricates a `CompatType` for a withheld slot: `decide`
 * (`../parser/type-compat.ts`) tests `sup.kind === "array"` / `"object"`
 * before its `sub.kind === "named"` branch, so a sentinel unresolvable
 * `named` argument type would answer `"incompatible"` at an `array<…>` or
 * inline-object param — a false `E` against a well-typed program.
 */
function buildInvokeArgSlot(
  argExpr: Expr | undefined,
  field: CalleeArityField | undefined,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
  emptyCalleeAnnotationEnv: TypeEnv,
): InvokeArgSlot {
  const withheld = (paramName: string): InvokeArgSlot => ({
    paramName,
    paramType: undefined,
    argType: undefined,
  });
  if (field === undefined) {
    return withheld("");
  }
  if (argExpr === undefined) {
    return withheld(field.name);
  }
  const expectedType = annotationToCompatType(field.typeSource);
  if (expectedType === undefined) {
    return withheld(field.name);
  }
  const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
  if (argTypes === undefined) {
    return withheld(field.name);
  }
  const everyMemberIncompatible = argTypes.every(
    (argType) =>
      checkCompatible(argType, expectedType, emptyCalleeAnnotationEnv) === "incompatible",
  );
  if (!everyMemberIncompatible) {
    // One arm the `params:` field accepts — or answers `"unknown"` /
    // `"integer-narrowing"` for — means a runtime value may well type-check,
    // so the slot defers to the runtime AJV net.
    return withheld(field.name);
  }
  return {
    paramName: field.name,
    paramType: expectedType,
    argType: dedupeArgType(argTypes),
  };
}

/**
 * Reduce a collected value-type set (`collectProvableArgTypes`) to the single
 * `CompatType` `checkInvokeArgTypes` re-decides against (`buildInvokeArgSlot`):
 * one member per distinct `displayType` rendering — the same de-duplication
 * `renderCollectedTypes` applies for the message string — collapsed to that
 * member alone when only one rendering survives, else a `union` over the
 * survivors so `displayType` reproduces the identical `" | "`-joined spelling.
 * Every returned member is drawn from `types` itself, never invented: the
 * every-member-incompatible verdict is decided by `buildInvokeArgSlot` BEFORE
 * this function runs, so `checkCompatible`'s union-sub rule (`decide`,
 * type-compat.ts, TYPE-6 — which returns `"incompatible"` on the FIRST
 * mismatching arm) only RE-DERIVES that verdict when `checkInvokeArgTypes`
 * re-runs it, rather than deciding it here. That rule is unsound as a
 * discriminator over a mixed set, and sound only because every arm already
 * agrees by construction.
 */
function dedupeArgType(types: readonly CompatType[]): CompatType {
  const byDisplay = new Map<string, CompatType>();
  for (const type of types) {
    const key = displayType(type);
    if (!byDisplay.has(key)) {
      byDisplay.set(key, type);
    }
  }
  const arms = [...byDisplay.values()];
  return arms.length === 1 ? (arms[0] as CompatType) : { kind: "union", arms };
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
 *   - INV-3 arity (`theta/parse/invoke-arity-too-{many,few}`) against the
 *     statically-resolved callee's `params:` counts, over BOTH the
 *     `invoke(...)` call surface and the `.theta`-callable call surface
 *     (tool-calls.md §"Argument shape" binds the two by name);
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
 *     Both type checks judge an expression by the SET of types it can evaluate
 *     to (`collectProvableArgTypes`), never by the single type a composite
 *     narrows to, which is what keeps them off values the runtime AJV check
 *     accepts — see that function's own comment.
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

    // Bug 0072 / bug 0137: all three static tool/invoke-argument TYPE checks —
    // this loop's own per-argument check below, the `.theta`-callable
    // per-argument check, and the Pi-tool schema-conflict check — share ONE
    // `StaticTypeInferencePass` instance and whole-file `TypeEnv`, derived once
    // per theta from `input.body` — never per call site.
    const typeEnv = collectTypeEnv(input.body.statements);
    const typePass = new StaticTypeInferencePass({
      checkCompatible,
      enumNames: collectEnumNames(input.body.statements),
    });

    for (const invoke of callSites.invokeExprs) {
      // A dynamic path (empty literal) or a non-`.theta` extension already
      // produced its own parse error; skip to avoid a confusing second report.
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) {
        continue;
      }
      const site = { file: callerPath, range: invoke.range };
      const resolvedPath = resolveCalleeAbsolute(callerPath, invoke.path);

      // INV-1 (invocation.md §Resolution): a resolved callee outside every
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
        // Bug 0137 — `checkInvokeCall`, not a direct `checkInvokeArity` call:
        // it runs arity FIRST and returns its diagnostics ALONE when arity
        // fails, so this one call keeps arity running EXACTLY ONCE per site —
        // the `arityDiags.length > 0` gate inside it IS invocation.md
        // §"Argument arity"'s ordering (a double-defect site reports arity
        // alone), not a convention re-implemented here. `checkInvokeCall`
        // derives `providedCount` from `args.length`, so `argSlots` below
        // always has exactly `providedCount` entries — the same wired arity
        // behaviour as before.
        //
        // This arm's OWN empty callee-annotation env, judged separately from
        // the `.theta`-callable arm's `emptyCalleeAnnotationEnv` below (same
        // rationale — see that arm's own comment for why the EXPECTED side
        // must be judged in the callee's namespace, not the caller's).
        const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
        const argSlots: InvokeArgSlot[] = [];
        for (let i = 0; i < providedCount; i++) {
          // Slot `i` binds `invoke.args[i + 1]` — the path literal occupies
          // `args[0]` — so the reported index counts PARAM slots, not raw
          // call arguments (invocation.md §"Argument binding"; the reading is
          // author-visible in every emitted message).
          argSlots.push(
            buildInvokeArgSlot(
              invoke.args[i + 1],
              arity.fields[i],
              typeEnv,
              typePass,
              emptyCalleeAnnotationEnv,
            ),
          );
        }
        // `checkInvokeArgTypes` (run by `checkInvokeCall` once arity passes)
        // emits one diagnostic per mismatched slot, with no `break`: this
        // row's *Message* names the slot (`<i>`/`<param>`), so per-slot
        // emission is the adjudicated rule for it (diagnostic-shape.md
        // #argument-mismatch-multiplicity). The `.theta`-callable arm below
        // caps at one emission per call site instead — not because it shares
        // this loop's shape, but because its own emitter is called once per
        // slot from inside a loop that `break`s after the first mismatch; see
        // that loop's own comment for why. `checkFnCallArgs`
        // (../parser/type-layer-checks.ts) and `checkImportedFnCallArgs`
        // below side with this per-slot row, not with the capped arm — the
        // split is 3-per-slot to 1-per-site, not a 1:1 divide between two
        // surfaces.
        diagnostics.push(
          ...checkInvokeCall({
            callee: invoke.path,
            staticallyResolvable: true,
            requiredCount: arity.requiredCount,
            totalCount: arity.totalCount,
            args: argSlots,
            env: emptyCalleeAnnotationEnv,
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
      const arityDiags = checkInvokeArity({
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
      //
      // The EXPECTED side is the callee's own annotation text, so it must not
      // resolve through the caller's declarations: `annotationToCompatType`
      // maps every non-primitive annotation to a `named` reference, and
      // resolving that name in the caller's `typeEnv` lets a caller-local
      // homonym decide a verdict about the callee's contract. tool-calls.md
      // §"Argument shape" puts the judgement in the callee's namespace — the
      // mismatch is "against the callee's `params:`", and the runtime check it
      // front-runs validates the argument against the callee's own lowered
      // `params:` schema. Under an EMPTY environment a `named` expected type is
      // unresolvable, so `checkCompatible` answers `"unknown"` and the site
      // defers to that validation. Primitive and literal decisions consult no
      // environment at all, so a `params: x: string` slot still rejects an
      // integer argument, and a structurally-decidable slot such as
      // `array<Named>` still rejects a non-array argument without this pass
      // needing to know what `Named` denotes — which is why the expected side
      // is emptied rather than withheld whenever it mentions a name.
      // Null-prototype for the same reason `collectTypeEnv`
      // (../parser/type-layer-checks.ts) builds one: an annotation may spell an
      // `Object.prototype` own property verbatim, and that name must be
      // unresolvable here too.
      const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
      for (const [i, argExpr] of site.call.args.entries()) {
        const field = arity.fields[i];
        if (field === undefined) {
          continue;
        }
        const expectedType = annotationToCompatType(field.typeSource);
        if (expectedType === undefined) {
          continue;
        }
        const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
        if (argTypes === undefined) {
          // A value-contributing position past the parser's static view: the
          // argument can take a value of unknown type, which defers to the
          // callee's own runtime AJV load — see `collectProvableArgTypes`.
          continue;
        }
        if (
          !argTypes.every(
            (argType) =>
              checkCompatible(argType, expectedType, emptyCalleeAnnotationEnv) ===
              "incompatible",
          )
        ) {
          // Only an explicit incompatibility on EVERY value the argument can
          // take is provable. One arm the `params:` field accepts — or answers
          // `"unknown"` / `"integer-narrowing"` for — means a runtime value may
          // well type-check, so the site defers to the runtime AJV net.
          continue;
        }
        diagnostics.push(
          ...checkToolCallArguments({
            toolName: site.name,
            calleeKind: "theta-callable",
            // Neutralises `checkToolCallArguments`'s shared arity arm
            // (`positionalCount > 1`, which fires for ANY `calleeKind` —
            // pinned by the "arity is checked before type" unit test in
            // tests/tool-calls.test.ts): this call site's real arity was
            // already checked and passed above, via `checkInvokeArity`, the
            // dedicated emitter for this surface.
            positionalCount: 1,
            file: callerPath,
            range: site.call.range,
            staticResolution: {
              resolvable: true,
              matches: false,
              expected: displayType(expectedType),
              actual: renderCollectedTypes(argTypes),
            },
          }),
        );
        // First mismatch only: this row's *Message* names neither the slot
        // index nor the parameter, and its range is the whole call
        // expression, so a second emission at this site would render
        // byte-identical to the first — the per-site cap the adjudicated rule
        // assigns this row (diagnostic-shape.md
        // #argument-mismatch-multiplicity), distinct from the per-slot rule
        // the invoke and `fn` rows draw.
        break;
      }
    }

    // Bug 0072 — the Pi-tool provable-disjointness check (tool-calls.md
    // §"Provable-disjointness check (parse time)"), a THIRD loop over the SAME
    // `callSites.callExprs` (no new walk; bug 0071 §Fix constraint 3: reuse the
    // shared collection, never fork the walk).
    if (deps.callableSet !== undefined) {
      for (const call of callSites.callExprs) {
        // Bug 0071 §Fix constraint 2: the snapshot is read through `Map.get`
        // plus an explicit `!== undefined` test — a callable name is
        // author-controlled source text (the 0031/0038 hazard class).
        const entry = deps.callableSet.entries.get(call.callee);
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
  }

  // INV-4 (invocation.md §Cycle detection): walk the static-resolution graph
  // from this theta; a back-edge un-registers it.
  const cycle = detectInvocationCycle(input.slashName, deps.graph);
  if (cycle !== undefined) {
    diagnostics.push(cycle);
  }

  return diagnostics;
}

/**
 * One imported `.thetalib` callee `checkImportedFnCallArgs` may judge: the
 * library's own `FnDecl` (ordinary or `subagent fn`) resolved by SOURCE name
 * in the DIRECTLY-resolved library's own top-level body, plus that body's
 * whole statement list (for `collectTypeEnv` — bug 0072's namespace rule: the
 * EXPECTED side must resolve through the DECLARING library's `TypeEnv`, never
 * the importing file's). Resolution does not follow a re-export chain: a
 * specifier whose source name names no direct top-level declaration in the
 * resolved library (it is provided only through that library's own
 * `export … from`) is absent from this map, which withholds the route for
 * that callee rather than widening resolution to chase the chain — a
 * deferral recorded in the three rows' own *Trigger*s (a call through a
 * re-exported `fn` stays silent, never a false emission), not an attempt to
 * duplicate `materializeChain`'s own
 * chain-following (../extension/import-static-checks.ts) at a second call
 * site.
 */
export interface ImportedFnCallee {
  readonly fn: FnDecl;
  readonly libraryStatements: readonly Stmt[];
}

/**
 * Bug 0138 route 2 — judge an imported-`.thetalib` `fn` call's ARGUMENTS
 * (count and per-slot type) at the COMPOSE layer, where the resolved library
 * already exists as a parsed `ThetaDocument`. No new diagnostic code: the
 * three existing rows carry the route — `theta/parse/fn-arity-too-few` /
 * `-too-many` (bug 0131 arm (3), deferred to this bug by name) and
 * `theta/parse/fn-arg-type-mismatch` (whose *Trigger* already names the
 * imported half). `checkFnCallArgs`'s parse-tier arm 2
 * (../parser/type-layer-checks.ts) still returns on an imported callee — this
 * function is where that route is served, not where it moves.
 *
 * `importedFns` keys by the call-site LOCAL binding name (the `as`-alias
 * where written, else the source name) — the same key `collectImportedSymbols`
 * (../parser/type-layer-checks.ts) uses for the parse-tier `Set`. A call whose
 * callee is not a key withholds, whether because it names a same-file `fn`, a
 * non-`fn` imported symbol (`schema` / `enum`), an unresolved name, or a
 * symbol reached only through a re-export chain (`ImportedFnCallee`'s own
 * deferral, above).
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a callee name bound anywhere in the
 * importing body as a `let`, loop variable, match-arm pattern, `fn` parameter
 * or frontmatter `params:` field is never judged here, mirroring
 * `checkFnCallArgs`'s own `shadowedNames` test via the shared
 * `collectLocalBinderNames`.
 *
 * ARITY BEFORE TYPE (invocation.md §Argument arity, the same ordering
 * `checkFnCallArgs` / `checkInvokeCall` apply): a mis-arity call draws the
 * arity row alone via the parser's own, UNCHANGED `checkFnCallArity`. A
 * library `fn` whose parameter list fails `fnParamNamesAreIdentifiers` (bug
 * 0131 §(c) / bug 0225) withholds the ARITY verdict alone for that callee and
 * falls through to the per-argument loop, exactly as `checkFnCallArgs` does on
 * the same-file route: the recorded parameter COUNT is a recovery artefact the
 * author never wrote, while each surviving annotation is still the author's own
 * text and is judged per slot behind that loop's own
 * `annotationSourceIsNotTypeExpression` / `annotationToCompatType` guards.
 *
 * The per-argument TYPE loop's EXPECTED side resolves through a `TypeEnv`
 * built from the callee's OWN library statements (bug 0072's namespace rule)
 * — never the importing file's — so an importer's unrelated same-named
 * `schema` cannot decide a verdict about the library's contract, and a
 * library parameter type the library itself never declares withholds rather
 * than resolving against the wrong file. The ARGUMENT side reuses
 * `collectProvableArgTypes`'s every-member-incompatible SET discipline over
 * the IMPORTING file's own `TypeEnv` / `StaticTypeInferencePass`, unchanged
 * from the invoke / `.theta`-callable routes above, and the parser's own
 * `checkFnArgCompat` emits, also unchanged.
 *
 * `<name>` on every diagnostic this function may push renders `call.callee` —
 * the CALL-SITE spelling, alias included (placeholder-rendering-b.md §"5.
 * Source-derived placeholders": `<name>` is identifier-shaped and taken from
 * the offending source text).
 *
 * DEFERRED, by construction: a call site INSIDE a `.thetalib` body is never
 * reached, because this function walks the IMPORTING THETA's own body only,
 * never a library body — a call inside a library against a symbol THAT
 * library itself imported is therefore out of this route's reach (bug 0138
 * row d3), a fence stated in the registry *Trigger*s this fix amends, not a
 * dropped route.
 */
export function checkImportedFnCallArgs(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedFns: ReadonlyMap<string, ImportedFnCallee>,
): Diagnostic[] {
  if (importedFns.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
  const { callExprs } = collectCallSites(importingBody);
  const importerEnv = collectTypeEnv(importingBody.statements);
  const importerPass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(importingBody.statements),
  });
  // One `TypeEnv` per resolved library body, cached by statement-list
  // identity so two calls of the same imported `fn` do not rebuild the
  // DECLARING library's env twice; the cache key is the library body
  // reference `ImportedFnCallee.libraryStatements` carries, which is stable
  // across every call this route judges against the same callee.
  const libraryEnvCache = new Map<readonly Stmt[], TypeEnv>();
  const libraryEnvFor = (statements: readonly Stmt[]): TypeEnv => {
    const cached = libraryEnvCache.get(statements);
    if (cached !== undefined) {
      return cached;
    }
    const env = collectTypeEnv(statements);
    libraryEnvCache.set(statements, env);
    return env;
  };

  for (const call of callExprs) {
    if (shadowedNames.has(call.callee)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a call of a locally-bound name is never an imported-`fn` call at this
      // site — the same test `checkFnCallArgs`'s `shadowedNames` arm applies.
      continue;
    }
    const callee = importedFns.get(call.callee);
    if (callee === undefined) {
      // Not an imported `fn` this route reaches: a same-file `fn`, a
      // non-`fn` imported symbol, an unresolved name, or a re-export-chain
      // callee `ImportedFnCallee`'s own doc comment defers on.
      continue;
    }
    const site = { file: importingFile, range: call.range };
    // Bug 0131 §(c) / bug 0225: a junk parameter table's recorded COUNT is a
    // recovery artefact the author never wrote, so the ARITY verdict alone is
    // withheld — the annotation half is the author's own text and stays judged
    // per slot below, which is the same partition `checkFnCallArgs` applies on
    // the same-file route (../parser/type-layer-checks.ts).
    if (fnParamNamesAreIdentifiers(callee.fn.params)) {
      const arityDiags = checkFnCallArity({
        name: call.callee,
        requiredCount: callee.fn.params.length,
        providedCount: call.args.length,
        site,
      });
      if (arityDiags.length > 0) {
        // Arity BEFORE type (invocation.md §Argument arity): a mis-arity call
        // draws the arity row alone and never reaches the per-argument loop.
        diagnostics.push(...arityDiags);
        continue;
      }
    }
    const libraryEnv = libraryEnvFor(callee.libraryStatements);
    const matchedCount = Math.min(call.args.length, callee.fn.params.length);
    for (let i = 0; i < matchedCount; i += 1) {
      const param = callee.fn.params[i] as FnParam;
      if (param.type.length > 0 && annotationSourceIsNotTypeExpression(param.type)) {
        // The library's own parameter annotation derives from none of
        // `Type`'s six alternatives — treated as absent rather than as an
        // opaque nominal reading of the junk text, mirroring
        // `checkFnCallArgs`'s identical guard on the same-file route.
        continue;
      }
      const paramType = annotationToCompatType(param.type);
      if (paramType === undefined) {
        // An unannotated library parameter has no declared type to judge
        // against (type-system.md §"Absent operands").
        continue;
      }
      const argExpr = call.args[i] as Expr;
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
      if (argTypes === undefined) {
        // A value-contributing position past the parser's static view defers
        // to no runtime AJV net (this position registers none) — see this
        // file's `collectProvableArgTypes` doc comment.
        continue;
      }
      const everyMemberRefused = argTypes.every((argType) => {
        const verdict = checkCompatible(argType, paramType, libraryEnv);
        return verdict !== "compatible" && verdict !== "unknown";
      });
      if (!everyMemberRefused) {
        // One arm the library's parameter type accepts — or answers
        // `"unknown"` for — means the argument may well type-check, so the
        // slot withholds. Every OTHER verdict is a refusal at parity with the
        // row's own emitter: `checkFnArgCompat` (../parser/type-compat.ts)
        // routes a `number ⊑ integer` narrowing through
        // `fn-arg-type-mismatch` too, so a set of narrowings must reach it
        // here rather than be filtered out as "not incompatible" — the invoke
        // and `.theta`-callable routes can defer such a set to a runtime AJV
        // load of the callee's `params:` schema, and this position registers
        // no such net.
        continue;
      }
      diagnostics.push(
        ...checkFnArgCompat({
          fnName: call.callee,
          index: i,
          paramName: param.name,
          paramType,
          argType: dedupeArgType(argTypes),
          env: libraryEnv,
          site: { file: importingFile, range: argExpr.range },
        }),
      );
    }
  }
  return diagnostics;
}

/**
 * Bug 0429 §Fix Option 1 — judge an imported-`.thetalib` `schema`'s
 * CONSTRUCTOR field set at the COMPOSE layer, mirroring
 * `checkImportedFnCallArgs` above exactly. Parse defers on an imported
 * constructor name (the `imports.has(e.typeName)` arm,
 * ../parser/theta-document.ts `checkObjectExpr` — the FS-free parser holds no
 * library body), so this is where that route is SERVED, not where it moves.
 * No new diagnostic code: the two rows `checkObjectExpr` already emits for a
 * same-file constructor carry the route — `theta/parse/extra-object-field`
 * (pushed inline, mirroring `checkObjectExpr`'s own inline push) and
 * `theta/parse/missing-object-field` (reusing `checkObjectLiteralFields`,
 * ../parser/literal-sublanguage.ts, exactly as `checkObjectExpr` does).
 *
 * `importedSchemas` keys by the CONSTRUCTOR-SITE local binding name (the
 * `as`-alias where written, else the source name) — the same key
 * `importedFns` above uses — and its value is the directly-resolved
 * library's own `SchemaDecl.fields`. A DIRECT top-level declaration only
 * (bug 0138's `ImportedFnCallee` restriction, mirrored): a schema reached
 * only through a re-export chain is absent from the map, so this route
 * withholds a verdict for it rather than duplicating `materializeChain`'s own
 * chain-follow at a second call site.
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a constructor name bound anywhere in the
 * importing body as a `let`, loop variable, match-arm pattern, `fn`
 * parameter, or frontmatter `params:` field is never judged here, the same
 * `shadowedNames` test (`collectLocalBinderNames`) `checkImportedFnCallArgs`
 * applies to call sites.
 *
 * `<schema>` on every diagnostic renders the CONSTRUCTOR-SITE spelling (the
 * local/alias name written at the `Ident { … }` site), matching
 * `checkObjectExpr`'s same-file rendering and `checkImportedFnCallArgs`'s
 * `<name>` convention (placeholder-rendering-b.md §"5. Source-derived
 * placeholders").
 *
 * DEFERRED, by construction: an `ObjectExpr` INSIDE a `.thetalib` body is
 * never reached, because this function walks the IMPORTING THETA's own body
 * only, never a library body — the same fence `checkImportedFnCallArgs`
 * states for call sites.
 */
export function checkImportedSchemaCtorFields(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedSchemas: ReadonlyMap<string, readonly SchemaFieldSource[]>,
): Diagnostic[] {
  if (importedSchemas.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
  const { objectExprs } = collectCallSites(importingBody);
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (shadowedNames.has(typeName)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a constructor of a locally-bound name never denotes the imported
      // schema at this site — the same test `checkImportedFnCallArgs`
      // applies to its call sites.
      continue;
    }
    const declaredFields = importedSchemas.get(typeName);
    if (declaredFields === undefined) {
      // Not an imported schema this route reaches: a same-file schema, a
      // non-`schema` imported symbol, an unresolved name, or a re-export-
      // chain schema `importedSchemas`' own doc comment (above) defers on.
      continue;
    }
    const declaredNames = declaredFields.map((field) => field.name);
    const declaredSet = new Set(declaredNames);
    const present = ctor.fields.map((field) => field.name);
    for (const field of present) {
      if (!declaredSet.has(field)) {
        diagnostics.push({
          severity: "error",
          code: "theta/parse/extra-object-field",
          file: importingFile,
          range: ctor.range,
          message: `extra field '${field}' on schema '${typeName}'`,
        });
      }
    }
    diagnostics.push(
      ...checkObjectLiteralFields(
        { name: typeName, fields: declaredNames },
        present,
        { file: importingFile, range: ctor.range },
      ),
    );
  }
  return diagnostics;
}

/**
 * Bug 0430 §Fix Option 1 — judge an imported-`.thetalib` `enum`'s VARIANT
 * ACCESS at the COMPOSE layer, mirroring `checkImportedSchemaCtorFields`
 * above exactly. Parse defers on an imported member access (the body walk's
 * `member` arm, ../parser/theta-document.ts, whose `refs.enums.get` answers
 * from `hoistEnumVariants` over same-file `enum` statements only — the
 * FS-free parser holds no library variant set), so this is where that route
 * is SERVED, not where it moves. No new diagnostic code: reuses the EXISTING
 * `theta/parse/unknown-variant` row via the parser's own, UNCHANGED
 * `checkVariantAccess` (../parser/schema-declarations.ts) — the same
 * code+message the same-file `member` arm emits (bug 0185's binding
 * code-identity adjudication: declared-enum head + undeclared tail is
 * `theta/parse/unknown-variant`, no new code, no registry row edited).
 *
 * `importedEnums` keys by the MEMBER-TARGET local binding name (the `as`-alias
 * where written, else the source name) — the same key `importedSchemas` above
 * uses — and its value is the directly-resolved library's own `EnumDecl`
 * variant list. A DIRECT top-level declaration only (bug 0138's
 * `ImportedFnCallee` restriction, mirrored): an enum reached only through a
 * re-export chain is absent from the map, so this route withholds a verdict
 * for it rather than duplicating `materializeChain`'s own chain-follow at a
 * second call site.
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a member-target name bound anywhere in
 * the importing body as a `let`, loop variable, match-arm pattern, `fn`
 * parameter, or frontmatter `params:` field is never judged here, the same
 * `shadowedNames` test (`collectLocalBinderNames`) `checkImportedSchemaCtorFields`
 * applies to constructor sites.
 *
 * `<enum>` on every diagnostic renders the MEMBER-TARGET spelling (the
 * local/alias name written at the `Ident.Variant` site), matching the
 * same-file `member` arm's rendering and `checkImportedSchemaCtorFields`'s
 * `<schema>` convention (placeholder-rendering-b.md §"5. Source-derived
 * placeholders").
 *
 * DEFERRED, by construction: a `MemberExpr` INSIDE a `.thetalib` body is
 * never reached, because this function walks the IMPORTING THETA's own body
 * only, never a library body — the same fence `checkImportedSchemaCtorFields`
 * states for constructor sites.
 */
export function checkImportedEnumVariantAccess(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedEnums: ReadonlyMap<string, readonly string[]>,
): Diagnostic[] {
  if (importedEnums.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
  const { memberExprs } = collectCallSites(importingBody);
  for (const access of memberExprs) {
    if (access.target.kind !== "ident") {
      // Only a bare `Ident.field` denotes a possible imported-enum variant
      // access; a member off any other expression shape names no import
      // binding at all.
      continue;
    }
    const enumName = access.target.name;
    if (shadowedNames.has(enumName)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a member access of a locally-bound name never denotes the imported
      // enum at this site — the same test `checkImportedSchemaCtorFields`
      // applies to its constructor sites.
      continue;
    }
    const knownVariants = importedEnums.get(enumName);
    if (knownVariants === undefined) {
      // Not an imported enum this route reaches: a same-file enum, a
      // non-`enum` imported symbol, an unresolved name, or a re-export-chain
      // enum `importedEnums`' own doc comment (above) defers on.
      continue;
    }
    const diagnostic = checkVariantAccess(
      { enumName, variant: access.field, knownVariants },
      { file: importingFile, range: access.range },
    );
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

/**
 * The KIND of one imported binding's DIRECT declaration, for exactly the
 * three shapes bug 0448 §Fix judges: `"enum"`, `"fn"`, and `"schema-alias"`
 * (a `schema` declared without an object body — the alias/head-only form).
 * None of the three is brace-constructible (expressions.md §"Object
 * construction"; `code-registry-parse.md`'s `theta/parse/unresolved-named-
 * type` row, the object-constructor clause) — a fields-BEARING object-form
 * `schema` is the disjoint, already-judged class `importedSchemas` /
 * `checkImportedSchemaCtorFields` own.
 */
export interface ImportedNonCtorKind {
  readonly kind: "enum" | "fn" | "schema-alias";
}

/**
 * Bug 0448 §Fix Option 1 — judge an imported-`.thetalib` constructor site
 * whose head resolves to a NON-brace-constructible declaration at the COMPOSE
 * layer, mirroring `checkImportedSchemaCtorFields` above exactly. Parse
 * defers on an imported constructor name (the `imports.has(e.typeName)` arm,
 * ../parser/theta-document.ts `checkObjectExpr` — the FS-free parser holds no
 * library body, so whether the name is even brace-constructible is
 * undecidable there), so this is where that route is SERVED, not where it
 * moves. No new diagnostic code: reuses the EXISTING
 * `theta/parse/unresolved-named-type` row the same-file spelling of an `enum`
 * / fn / alias-form-`schema` constructor already draws
 * (../parser/theta-document.ts `checkObjectExpr`: an `enum` head via its
 * `enums.has` arm, an alias/head-only `schema` head via its `bodySchemas.has`
 * arm, and a `fn` head via the NO-DECLARATION fall-through arm — "resolves to
 * no declaration at all", since a `fn` name is in none of `refs.schemas`,
 * `imports`, `enums`, or `bodySchemas`), with the byte-identical message
 * template (`unresolved named type '<name>'`).
 *
 * `importedNonCtorKinds` keys by the CONSTRUCTOR-SITE local binding name (the
 * `as`-alias where written, else the source name) — the same key
 * `importedSchemas` / `importedEnums` above use — and its value is the
 * directly-resolved library's own declaration KIND. A DIRECT top-level
 * declaration only (bug 0138's `ImportedFnCallee` restriction, mirrored): a
 * declaration reached only through a re-export chain is absent from the map,
 * so this route withholds a verdict for it rather than duplicating
 * `materializeChain`'s own chain-follow at a second call site.
 *
 * Shadowing outranks import resolution (expressions.md §"Identifier
 * resolution" arm (1) over arm (3)): a constructor name bound anywhere in the
 * importing body as a `let`, loop variable, match-arm pattern, `fn`
 * parameter, or frontmatter `params:` field is never judged here, the same
 * `shadowedNames` test (`collectLocalBinderNames`) `checkImportedSchemaCtorFields`
 * applies to constructor sites.
 *
 * `<name>` on every diagnostic renders the CONSTRUCTOR-SITE spelling (the
 * local/alias name written at the `Ident { … }` site), matching
 * `checkObjectExpr`'s same-file rendering and `checkImportedSchemaCtorFields`'s
 * `<schema>` convention (placeholder-rendering-b.md §"5. Source-derived
 * placeholders").
 *
 * DEFERRED, by construction: an `ObjectExpr` INSIDE a `.thetalib` body is
 * never reached, because this function walks the IMPORTING THETA's own body
 * only, never a library body — the same fence `checkImportedSchemaCtorFields`
 * states for its own constructor sites. A fields-BEARING object-form
 * `schema` constructor stays silent here too — it is not in
 * `importedNonCtorKinds` at all (bug 0429's already-judged class, disjoint
 * from this one).
 */
export function checkImportedNonCtorTypeNames(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedNonCtorKinds: ReadonlyMap<string, ImportedNonCtorKind>,
): Diagnostic[] {
  if (importedNonCtorKinds.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
  const { objectExprs } = collectCallSites(importingBody);
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (shadowedNames.has(typeName)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a constructor of a locally-bound name never denotes the imported
      // binding at this site — the same test `checkImportedSchemaCtorFields`
      // applies to its own constructor sites.
      continue;
    }
    if (!importedNonCtorKinds.has(typeName)) {
      // Not a non-brace-constructible imported binding this route reaches: a
      // same-file declaration, an imported OBJECT-form schema (0429's class),
      // an unresolved name, or a re-export-chain declaration this map's own
      // doc comment (above) defers on.
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "theta/parse/unresolved-named-type",
      file: importingFile,
      range: ctor.range,
      message: `unresolved named type '${typeName}'`,
    });
  }
  return diagnostics;
}
