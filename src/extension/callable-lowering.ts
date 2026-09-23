// Callable-set lowering helpers for the production theta producer
// (production-theta-producer.ts). Hosts the module-level families that lower a
// theta's frozen `tools:` callable set into runtime shapes — presented-name
// enumeration, `.theta`-callable model results, tool-call param lowering,
// bound lexical environments, model-driven theta calls — plus the prompt-mode
// terminal-outcome surface. None of these touch `ProductionThetaProducer`
// instance state; they consume only their arguments.
//
// Split out of production-theta-producer.ts (PTQ-1285); that module re-exports
// the previously-public names so existing importers resolve unchanged. The
// RFC-0006 subagent drive binding lives in subagent-drive-binding.ts
// (PTQ-1436) and is re-exported below for the same reason.

export { buildSubagentDriveBinding } from "./subagent-drive-binding";

import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import type { Message } from "@earendil-works/pi-ai";
import type {
  BodyExecutingConversationBinding,
  ConversationBindInput,
} from "./theta-composition-producer";
import {
  buildEnvironment,
  enumDeclaringKey,
  type EnumRegistration,
  type LexicalEnvironment,
  type MaterializedImport,
} from "../runtime/lexical-environment";
import type { BodyExecution } from "../runtime/statement-executor";
import { extractTrailingTurnText } from "../runtime/conversation-drive";
import {
  enforceModelToolArgDepth,
  PiToolArgShapeDefectError,
  ShadowedCalleeDispatchDefectError,
} from "../runtime/tool-call";
import { makeCancelledError } from "../runtime/cancellation-core";
import {
  defineRecordField,
  isResultValue,
  makeErr,
  makeOk,
  type ResultValue,
  type ThetaValue,
} from "../runtime/value";
import type { CallExpr, SubagentSessionConfig, ThetaBody } from "../parser/theta-document";
import { isBareIdentifier, parseToolsEntry, thetaDefaultName, type ResolvedCallable } from "../parser/callable-set";
import { HostFatal } from "../runtime/runtime-panics";
import type { PiToolDispatch } from "./production-theta-producer";

/** Project a prompt invocation's terminal outcome onto its PIC-53 surface. */
export function promptModeSurface(readMessages: () => readonly Message[]): BodyExecutingConversationBinding["surface"] {
      // PIC-53: the prompt-mode return value is the trailing turn's accumulated
      // assistant text of the driven user session on the SUCCESS path. A failed
      // run surfaces its real terminal outcome (mirroring the subagent surface):
      // a `?`-propagated `Err` carries its `QueryError` payload so the
      // slash-dispatch boundary (SLSH-3) can emit the top-level err note, and
      // any other fail / cancel surfaces the terminal cancellation `Err` — never
      // a masking `Ok`. Without this a failed prompt theta was indistinguishable
      // from a successful one and the SLSH-3 note was never emitted.
      return (execution: BodyExecution): ResultValue => {
        if (execution.outcome === "success") {
          return makeOk(extractTrailingTurnText(readMessages()));
        }
        // A `fail` outcome carries the terminating `Err` — a `?`-propagation OR
        // an unhandled non-cancel effect-`Err` in tail position (ERR-19, e.g. a
        // `tool_loop_exhausted` breach). Project that real error so the caller
        // reads the true leaf kind; NEVER fabricate a `cancelled` for a fail
        // (STL-6). Only a genuine `cancel` outcome (an aborted checkpoint)
        // yields `CancelledError`.
        if (execution.outcome === "fail") {
          return makeErr(execution.error ?? (makeCancelledError() as unknown as ThetaValue));
        }
        return makeErr(makeCancelledError() as unknown as ThetaValue);
      };
}

/**
 * FN-5 (invocation.md §Final-value propagation across callees): project an
 * `invoke` callee body's terminal execution onto the `Result` value that crosses
 * the invoke boundary. Shared by the subagent spawn path and the prompt→prompt
 * attach path — a callee's final value crosses the boundary identically in
 * either mode (the prompt callee's user-visible turns stream into the shared
 * session, but the value that flows BACK is still the body's final value, not
 * the PIC-53 trailing-turn text of a top-level prompt dispatch).
 *
 * On success the produced value flows as `Ok`, with the CONV-6 / FN-3 implicit
 * wrap applied ONLY to a non-`Result` operand (a `Result`-typed tail passes
 * through unchanged so `invoke<T>` return validation sees `T`, not `Ok(T)`, and
 * a tail `Err(e)` is not masked as success). A `fail` outcome carries the
 * terminating `Err` (a `?`-propagation or an unhandled non-cancel effect-`Err`
 * in tail position, ERR-19) so the parent's XMODE-1 wrap reads the true leaf
 * kind rather than a fabricated `cancelled` (STL-6); only a genuine `cancel`
 * yields `CancelledError`.
 */
export function surfaceCalleeFinalValue(execution: BodyExecution): ResultValue {
  if (execution.outcome === "success") {
    const value = execution.result.value ?? null;
    return isResultValue(value) ? value : makeOk(value);
  }
  if (execution.outcome === "fail") {
    return makeErr(execution.error ?? (makeCancelledError() as unknown as ThetaValue));
  }
  return makeErr(makeCancelledError() as unknown as ThetaValue);
}

/**
 * RFC 0001 FN-7/FN-9: resolve a `subagent fn`'s spawned-session callable set.
 * With no `with { tools }` override the spawned session INHERITS the calling
 * theta's full frozen callable set. A `with { tools: […] }` override resolves
 * against the CALLING theta's callable set (FN-9): the spawned set is the named
 * SUBSET of the calling theta's entries (matched by presented name or, for a Pi
 * tool, its underlying tool name) — a name absent from the calling set simply
 * does not appear, and the code-driven `<name>(args)` path re-resolves
 * independently, so no name is widened here.
 */
export function subagentFnCallableSet(
  callingSet: ConversationBindInput["theta"]["callableSet"],
  config: SubagentSessionConfig,
): ConversationBindInput["theta"]["callableSet"] {
  if (callingSet === undefined || config.toolsOverridden !== true) {
    return callingSet;
  }
  const wanted = new Set(config.tools ?? []);
  const entries = new Map<string, ResolvedCallable>();
  for (const [name, entry] of callingSet.entries) {
    const underlying =
      entry.kind === "pi-tool"
        ? (entry.toolDefinition as PiToolDispatch).toolName
        : undefined;
    if (wanted.has(name) || (underlying !== undefined && wanted.has(underlying))) {
      entries.set(name, entry);
    }
  }
  return Object.freeze({ entries });
}

/**
 * QTL-4. The underlying Pi-tool names in the theta's frozen `tools:` callable set
 * — the host tool each `pi-tool` entry dispatches to (an `as`-rename entry
 * carries the underlying tool's own registered name, which is what the model's
 * active-tool set must reference). A theta with no snapshot (an in-memory
 * fixture) or no Pi tools yields `[]`, so the prompt-mode active set stays empty
 * and no ambient tool is installed.
 */
export function callableSetPiToolNames(
  theta: ConversationBindInput["theta"],
): readonly string[] {
  const set = theta.callableSet;
  if (set === undefined) {
    return [];
  }
  const names: string[] = [];
  for (const entry of set.entries.values()) {
    if (entry.kind === "pi-tool") {
      names.push((entry.toolDefinition as PiToolDispatch).toolName);
    }
  }
  return names;
}

/** SUBAG-2: the model-facing text/`isError` pair a `.theta` model call lowers to. */
export interface LoweredThetaCallableResult {
  readonly text: string;
  readonly isError: boolean;
}

/**
 * SUBAG-2: the `.theta`-callable entries in the theta's frozen `tools:` callable
 * set — each carrying its presented (post-`as` / post-hyphen→underscore)
 * callable name and the resolved callee `.theta` path (relative to the caller's
 * directory) read from the frozen entry's `calleePath` (Gap-2: the load-time
 * resolver recorded it from the `tools:` `spec`, so renamed / hyphenated callees
 * carry their real path). Mirrors `callableSetPiToolNames`; the callee schema /
 * param order / description are resolved asynchronously at spawn time via
 * `parseCallee` (the frozen entry carries the callee's `mode` and `calleePath`
 * only; the parsed callee itself is not held on the snapshot). A theta with no
 * snapshot yields `[]`.
 */
export function callableSetThetaEntries(
  theta: ConversationBindInput["theta"],
): readonly {
  readonly presentedName: string;
  readonly calleePath: string;
  readonly closureHash?: string;
}[] {
  const set = theta.callableSet;
  if (set === undefined) {
    return [];
  }
  const entries: {
    readonly presentedName: string;
    readonly calleePath: string;
    readonly closureHash?: string;
  }[] = [];
  for (const [presentedName, entry] of set.entries) {
    if (entry.kind !== "theta") {
      continue;
    }
    // Gap-2: read the authoritative callee path the load-time resolver recorded
    // on the frozen entry (from the `tools:` `spec`), NOT a basename
    // re-derivation — so renamed / hyphenated callees are presented + dispatchable.
    // #subagent-theta-callable-hash: carry the LOAD-TIME closure hash the
    // resolution snapshot captured, so the launch marshals the stored value.
    entries.push({
      presentedName,
      calleePath: entry.calleePath,
      ...(entry.closureHash !== undefined ? { closureHash: entry.closureHash } : {}),
    });
  }
  return entries;
}

/**
 * SUBAG-2: lower a `.theta`-callable's returned `Result` (FN-5) to the
 * model-facing tool-result text / `isError` pair. `Ok(string)` surfaces the
 * string verbatim; `Ok(<other>)` its JSON form; an `Err` surfaces
 * `isError: true` carrying the error's `message` (or its JSON form) so the model
 * observes the failure and the loop continues — the same disposition a failing
 * Pi-tool sibling receives (tool-calls.md §Concurrency).
 */
function lowerThetaCallableModelResult(result: ResultValue): LoweredThetaCallableResult {
  if (result.ok) {
    const value = result.value ?? null;
    return {
      text: typeof value === "string" ? value : JSON.stringify(value),
      isError: false,
    };
  }
  const error = result.error as unknown;
  const message = (error as { readonly message?: unknown }).message;
  return {
    text: typeof message === "string" ? message : JSON.stringify(error),
    isError: true,
  };
}

/**
 * The snapshot-absent fallback's presented-name ↔ entry mapping: each
 * well-formed `frontmatter.tools` entry paired with its presented
 * (post-`as` / post-hyphen→underscore) name and its spec as written. Names are
 * derived through the SAME closed grammar (`parseToolsEntry`) and default-name
 * rule (`isBareIdentifier` / `thetaDefaultName`) `resolveCallableSet` enforces
 * (bug 0069 §Fix constraint 5; bug 0253): a malformed entry has no presented
 * name and contributes nothing, matching the resolver un-registering the theta
 * outright rather than truncating it to a name. The SINGLE source of truth both
 * snapshot-absent readers (`thetaCalleePath`, `presentedCallableNames`) consume,
 * so the bug-0016 dispatch guard's callable registry and the code-driven
 * `<name>(args)` callee resolution cannot disagree about which names exist.
 */
function fallbackPresentedEntries(
  tools: readonly string[],
): readonly { readonly name: string; readonly spec: string }[] {
  const entries: { readonly name: string; readonly spec: string }[] = [];
  for (const entry of tools) {
    const parsed = parseToolsEntry(entry.trim());
    if (parsed.kind !== "ok") {
      continue;
    }
    const name =
      parsed.rename ??
      (isBareIdentifier(parsed.spec) ? parsed.spec : thetaDefaultName(parsed.spec));
    entries.push({ name, spec: parsed.spec });
  }
  return entries;
}

/**
 * The callable-set entry (a `./x.theta` path) that a call name resolves to, or
 * `undefined` when the name binds to no `.theta`-callable (so it is a Pi tool).
 *
 * Gap-2: resolve the callee path from the FROZEN callable-set snapshot keyed by
 * the presented (post-`as` / post-hyphen→underscore) name, using the
 * `calleePath` the load-time resolver (`resolveCallableSet`) recorded from the
 * entry's `spec`. This replaces the previous basename string-match against
 * `frontmatter.tools`, which dropped renamed (`./c.theta as foo`) and hyphenated
 * (`./my-tool.theta` → `my_tool`) callees — silently omitting them from BOTH the
 * code-driven `<name>(args)` path and the model-driven adapter.
 *
 * A theta carrying NO snapshot (an in-memory harness fixture built with
 * `frontmatter.tools` but no `callableSet`) falls back to matching the
 * presented name through the shared `fallbackPresentedEntries` mapping — the
 * SAME mapping `presentedCallableNames` reads — so the fallback agrees with the
 * snapshot arm on a hyphenated stem (bug 0253) and the two readers cannot
 * disagree about which names exist (bug 0069 §Fix constraint 5). Production
 * discovered thetas always carry a (possibly empty) snapshot, so the fallback
 * never serves a real theta and thus cannot re-open the Gap-2 hole for
 * production (renamed / hyphenated resolve from the snapshot).
 */
export function thetaCalleePath(
  theta: ConversationBindInput["theta"],
  calleeName: string,
): string | undefined {
  const set = theta.callableSet;
  if (set !== undefined) {
    const entry = set.entries.get(calleeName);
    return entry !== undefined && entry.kind === "theta" ? entry.calleePath : undefined;
  }
  return fallbackPresentedEntries(theta.frontmatter.tools ?? []).find(
    (entry) => entry.spec.endsWith(".theta") && entry.name === calleeName,
  )?.spec;
}

/**
 * Lower a code-side `<name>(args)` call's arguments to the JSON params object the
 * host tool's `execute(...)` receives (V14g). The call convention is a single
 * object-literal argument (`grep({ pattern, path })`): its fields are evaluated
 * against the environment and become the JSON params object. A callee that a
 * local binding shadows is an internal defect (bug 0016,
 * docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md): the parse gate
 * (`theta/parse/shadowed-callable-call`) rejects that call site, so lowering
 * (and then dispatching) would execute a callable the site does not lexically
 * denote — the guard mirrors the executor's `preEvaluateToolArgs` seam so the
 * 0016 belt, like the 0003 belt, exists in BOTH lowerings. A ZERO-argument
 * call lowers to an empty params object; a NON-object first argument is an
 * internal defect (bug 0003,
 * docs/bugs/0003-tool-arg-shape-rule-not-enforced.md): the parse-time shape
 * gate (`theta/parse/tool-arg-not-object-literal`) rejects that form, so
 * lowering it to `{}` here — the pre-0.16.0 behaviour — would silently drop
 * the author's argument object. Throwing keeps any future parse-gate gap loud.
 */
export function lowerToolCallParams(expr: CallExpr, env: LexicalEnvironment): Record<string, unknown> {
  if (env.localShadowsCallable(expr.callee)) {
    throw new ShadowedCalleeDispatchDefectError(expr.callee);
  }
  const first = expr.args[0];
  if (first === undefined) {
    return {};
  }
  if (first.kind !== "object") {
    throw new PiToolArgShapeDefectError(expr.callee);
  }
  const params: Record<string, unknown> = {};
  for (const field of first.fields) {
    defineRecordField(params, field.name, evaluatePureExpression(field.value, env) as unknown);
  }
  return params;
}

/**
 * The presented (post-`as` / post-hyphen→underscore) callable names of a
 * theta's `tools:` set, for the environment's resolution arm 4 (bug 0016): the
 * frozen snapshot's keys ARE the presented names; a theta carrying NO snapshot
 * (an in-memory harness fixture) falls back to the shared
 * `fallbackPresentedEntries` mapping — the same snapshot-absent fallback
 * `thetaCalleePath` reads — so production always takes the snapshot arm and the
 * two readers cannot disagree about which names exist (bug 0069 §Fix
 * constraint 5, bug 0253; see `fallbackPresentedEntries` for the derivation).
 */
export function presentedCallableNames(theta: ConversationBindInput["theta"]): readonly string[] {
  const set = theta.callableSet;
  if (set !== undefined) {
    return [...set.entries.keys()];
  }
  return fallbackPresentedEntries(theta.frontmatter.tools ?? []).map((entry) => entry.name);
}

/**
 * Build the executor's root environment for a body, binding any invoke-supplied
 * positional args onto the callee's declared params as `params:`-field local
 * slots (V15k final value / arg binding) so the body can read them and the
 * bug-0016 dispatch belt sees them across `fn` activation boundaries exactly
 * as the parse gate does (rootLocals are visible in every plain-`fn` body).
 * The theta's presented
 * callable names populate the environment's arm-4 callable registry (bug
 * 0016): the `localShadowsCallable` dispatch guard needs callable-set
 * membership to fire only where the parse gate
 * (`theta/parse/shadowed-callable-call`) fires — with the registry empty the
 * belt would be inert in production. `resolve()`'s behaviour is otherwise
 * unchanged: every consumer branches only on the "local"/"fn"/"import" arms,
 * treating "callable" and "unresolved" identically.
 */
export function buildBoundEnvironment(
  body: ThetaBody,
  paramBindings: ReadonlyMap<string, ThetaValue> | undefined,
  imports: readonly MaterializedImport[] | undefined,
  callableNames: readonly string[],
  resolvedPath: string | undefined,
): LexicalEnvironment {
  // Register top-level `enum` declarations (with their captured variant names
  // and any explicit `= "..."` wire values) so `Enum.Variant` access resolves
  // to a first-class enum value — carrying the correct wire form — rather than
  // panicking on a member access against an unresolved name.
  const enums: EnumRegistration[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "enum" && stmt.variants !== undefined) {
      enums.push({
        name: stmt.name,
        variants: stmt.variants,
        ...(stmt.variantValues !== undefined ? { values: stmt.variantValues } : {}),
        ...(resolvedPath !== undefined
          ? { declaringKey: enumDeclaringKey(resolvedPath, stmt.name) }
          : {}),
      });
    }
  }
  const env = buildEnvironment({
    body,
    enums,
    callables: callableNames,
    ...(imports !== undefined ? { imports } : {}),
  });
  if (paramBindings !== undefined) {
    for (const [name, value] of paramBindings) {
      // `params:` fields go through the marking entry point (bug 0016): the
      // parse gate treats them as in scope inside every plain-`fn` body, so
      // `localShadowsCallable` must see them across an activation boundary —
      // a plain `defineLocal` here would leave the dispatch belt blind to a
      // params-shadowed callee inside an `fn` body.
      env.defineParamsFieldLocal(name, value);
    }
  }
  return env;
}

/**
 * SUBAG-2 model-callable `.theta`: the injected drive + setup-throw + param-order
 * collaborators the model-driven `.theta` adapter core dispatches through.
 * Extracted so the model-driven `.theta` seam (arg-mapping declaration order,
 * ceiling-#4 depth block, `Result` lowering, setup-throw translation,
 * re-entrancy) is deterministically testable against scripted collaborators.
 */
export interface ModelDrivenThetaCall {
  /** The callee's declared `params:` wire names, in DECLARATION ORDER. */
  readonly paramOrder: readonly string[];
  /**
   * Drive the callee (equivalent to `#driveCallee` bound to the caller theta /
   * ctx / chain) over the positional `argValues` mapped from the model's object
   * arguments, returning the callee's top-level `Result` (FN-5).
   */
  readonly driveCallee: (
    argValues: readonly (ThetaValue | undefined)[],
    toolSignal: AbortSignal,
  ) => Promise<ResultValue>;
  /**
   * Translate a non-`HostFatal` pre-eval setup / body throw into the model-facing
   * `{ text, isError: true }` pair, emitting the paired
   * `theta/runtime/internal-error` diagnostic + `theta-system-note` as a side
   * effect (tool-calls.md:30). A `HostFatal` is NEVER passed here — the core
   * re-raises it (NOCEIL-3) before calling.
   */
  readonly onSetupThrow: (thrown: unknown) => LoweredThetaCallableResult;
}

/**
 * SUBAG-2 model-callable `.theta` (tool-calls.md §"Argument shape" / §Concurrency;
 * ceiling #4 model-driven row). Lower ONE model-driven `.theta`-callable
 * `tool_use` call to the model-facing text / `isError` pair, in order:
 *
 *   - CEILING #4 (ceilings-3-and-4.md#ceiling-4-table, model-driven row; CIO-3):
 *     the theta-owned depth walk runs over the MODEL-produced `args` document
 *     BEFORE the callee spawns — a depth-6+ argument is fed back as an `isError`
 *     result and the callee never spawns (identical to `lowerModelDrivenToolCall`
 *     for the Pi-tool arm; `#driveCallee`'s own per-arg `enforceInvokeParamsDepth`
 *     is the separate code-path net);
 *   - the model's object arguments are bound to positional `argValues` in the
 *     callee's `params:` DECLARATION ORDER (the SAME binding a code-side
 *     `<name>(args)` / `invoke(...)` uses) and the callee is driven;
 *   - a clean `Result` lowers via `lowerThetaCallableModelResult` (Ok → text;
 *     Err → `isError`);
 *   - a non-`HostFatal` setup / body throw routes through `onSetupThrow`
 *     (tool-calls.md:30); a `HostFatal` re-raises (NOCEIL-3).
 *
 * Re-entrant: it holds no state; two concurrent calls dispatch through their own
 * `spec.driveCallee`, which spawns an independent `AgentSession` each
 * (tool-calls.md §Concurrency).
 */
export async function lowerModelDrivenThetaCall(
  args: Record<string, unknown>,
  spec: ModelDrivenThetaCall,
  toolSignal: AbortSignal,
): Promise<LoweredThetaCallableResult> {
  const argDepthBreach = enforceModelToolArgDepth(args);
  if (argDepthBreach !== undefined) {
    return { text: argDepthBreach.message, isError: true };
  }
  // Own-key guard distinguishes an explicit JSON `null` from the model (an own
  // key → stays `null`, preserved end-to-end, symmetric with the invoke path)
  // from an omitted key (→ `undefined` → default recovery downstream at
  // `#driveCallee`); `??` conflates the two, which is bug 0409. `Object.hasOwn`
  // (not `in`) so an inherited `Object.prototype` member cannot be read as a
  // present param.
  const argValues: readonly (ThetaValue | undefined)[] = spec.paramOrder.map((name) =>
    Object.hasOwn(args, name) ? (args[name] as ThetaValue) : undefined,
  );
  try {
    return lowerThetaCallableModelResult(await spec.driveCallee(argValues, toolSignal));
  } catch (thrown: unknown) { // allow-broad-catch: theta/runtime/internal-error — `.theta`-adapter pre-eval setup throw (tool-calls.md §"Outcome enumeration")
    // NOCEIL-3 (hard-ceilings): a host fatal is the ONLY thing that propagates
    // (fail-fast); every other throw routes to the internal-error framing.
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    return spec.onSetupThrow(thrown);
  }
}
