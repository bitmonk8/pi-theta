// Callable-set lowering & subagent drive-binding helpers for the production
// theta producer (production-theta-producer.ts). Hosts the module-level
// families that lower a theta's frozen `tools:` callable set into runtime
// shapes — presented-name enumeration, `.theta`-callable model results,
// tool-call param lowering, bound lexical environments, model-driven theta
// calls — plus the RFC-0006 subagent drive binding (`buildSubagentDriveBinding`)
// and the prompt-mode terminal-outcome surface. None of these touch
// `ProductionThetaProducer` instance state; they consume only their arguments.
//
// Split out of production-theta-producer.ts (PTQ-1285); that module re-exports
// the previously-public names so existing importers resolve unchanged.

import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import { runSubagentChildTeardown } from "../runtime/subagent-isolation";
import type { PlacementLease } from "../runtime/subagent-placement-selection";
import {
  attachSubagentCancellation,
  driveSubagentChild,
  type SubagentInvocationResult,
} from "../runtime/subagent-json-driver";
import type { EnumTagEntry, FnTail } from "../runtime/subagent-envelope";
import type { Message } from "@earendil-works/pi-ai";
import type { RuntimeRoot } from "../runtime-root";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import type {
  BodyExecutingConversationBinding,
  ConversationBinding,
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
import type { InvokeResultSource } from "../runtime/invoke-cancellation";
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
import { parseToolsEntry, thetaDefaultName, type ResolvedCallable } from "../parser/callable-set";
import { HostFatal } from "../runtime/runtime-panics";
import type { Diagnostic } from "../diagnostics/diagnostic";
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

/** Build the launched child's drive/provenance closures and idempotent teardown. */
export function buildSubagentDriveBinding({
  child, thetaAbort, theta, emitDiagnostic, detachChildTap, placementLease,
  paramsCleanup, cancellation, ticket, root, finishInvocation,
}: {
  child: Parameters<typeof driveSubagentChild>[0]["child"];
  thetaAbort: AbortController;
  theta: ConversationBindInput["theta"];
  emitDiagnostic: (diagnostic: Diagnostic) => void;
  detachChildTap: (() => void) | undefined;
  placementLease: PlacementLease;
  paramsCleanup: () => void;
  cancellation: ReturnType<typeof attachSubagentCancellation>;
  ticket: ActiveInvocationTicket;
  root: RuntimeRoot;
  finishInvocation: () => void;
}): ConversationBinding {
    /**
     * PIC-59. Await the child's `theta_result` envelope (stray-line tolerant) and
     * map `ok`/`err` to the invocation `Result`. A child that exits WITHOUT an
     * envelope maps fail-closed to Err(InvokeInfraError{cause:"internal_error"}).
     * The file-callee slash/invoke drive seam calls this INSTEAD of executing the
     * body in-process (the whole callee body ran in the child).
     */
    // Bug 0342 §Fix (D3 carriage): the subagent leg's per-position
    // declaring-enum tags, parsed off the envelope's OPTIONAL `enum_tags`
    // sidecar on the Ok path. Captured in this closure so the returned
    // binding's `forwardedEnumTags` can hand them to the invoke-return retag
    // once `drive()` has actually run; `undefined` until then, and whenever
    // the envelope carried no sidecar (an enum-free return, or an
    // envelope-version predating it).
    let forwardedEnumTagsHolder: readonly EnumTagEntry[] | undefined;
    // Bug 0294 provenance sidecar (mirrors `forwardedEnumTagsHolder`'s
    // holder/accessor pattern): an `Ok` settle is always the callee's own
    // return; an `err` settle carries the envelope-consumption seam's own
    // `source` tag (`SubagentInvocationResult`'s err arm), which `#driveCallee`
    // reads via `driveSource()` to source-tag the subagent leg's body outcome.
    let lastDriveSource: InvokeResultSource = "callee-returned";
    // RFC 0012 §10: the `fn_tail` marker of the last settled envelope (a
    // `subagent fn` child's `Result`-valued tail), same holder pattern.
    let lastFnTail: FnTail | undefined;
    const drive = async (): Promise<ResultValue> => {
      const result: SubagentInvocationResult = await driveSubagentChild({
        child,
        thetaAbort,
        calleePath: theta.sourcePath ?? theta.slashName,
        emitDiagnostic,
      });
      lastFnTail = result.fnTail;
      if (result.ok) {
        forwardedEnumTagsHolder = result.enumTags;
        lastDriveSource = "callee-returned";
        return makeOk(result.value as ThetaValue);
      }
      lastDriveSource = result.source;
      return makeErr(result.error as unknown as ThetaValue);
    };

    // PIC-65 / PIC-66 child-process teardown. Runs on EVERY exit of the drive
    // seam's `finally`. Bounded-awaits child exit (already settled on the normal
    // path — the child self-exits after its envelope) and kills on timeout
    // (process-tree kill on Windows); detaches the one-shot cancellation listener; deletes any
    // `PI_THETA_PARAMS_FILE` temp file (PIC-60 backstop). Idempotent; a no-op
    // when no child was launched (the `subagent fn` in-process path).
    let toreDown = false;
    const teardown = async (): Promise<void> => {
      if (toreDown) return;
      toreDown = true;
      // EXST-5: detach the activity tap before the child teardown runs
      // (idempotent — a Set delete after close is a no-op).
      detachChildTap?.();
      // RFC 0012 §6: free this launch's visible slot for the next launch.
      placementLease.release();
      // PIC-60 backstop: delete the params temp file regardless of launch outcome.
      try {
        paramsCleanup();
      } catch (cleanupError: unknown) { // allow-broad-catch: PIC-60 temp-file backstop — pi-integration-contract/subagent.md
        void cleanupError;
      }
      await runSubagentChildTeardown(child, {
        emitDiagnostic,
        detachAbortListener: cancellation.detach,
        settleDisposeBarrier: ticket.settleDisposeBarrier,
        clock: root.clock,
      });
    };

    return {
      drivenAgainst: "subagent-private-session",
      drive,
      // Bug 0342 §Fix: hands the subagent leg's per-position declaring-enum
      // tags (captured by `drive()`, above) to `#validateInvokeReturn`'s
      // invoke-return retag. Undefined until `drive()` has settled an `Ok`
      // whose envelope carried the sidecar.
      forwardedEnumTags: (): readonly EnumTagEntry[] | undefined => forwardedEnumTagsHolder,
      // Bug 0294: exposes `lastDriveSource` (set by `drive()`, above) so
      // `#driveCallee` can source-tag the subagent leg's body outcome for the
      // XMODE-1 wrap without re-deriving it from the settled `Result`'s `kind`.
      driveSource: (): InvokeResultSource => lastDriveSource,
      // RFC 0012 §10: the `fn_tail` marker for `#resolveSubagentFnChild`'s
      // FN-6 projection; `undefined` on every `.theta` callee envelope.
      driveFnTail: (): FnTail | undefined => lastFnTail,
      teardown,
      finishInvocation,
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
 * `frontmatter.tools` but no `callableSet`) falls back to matching
 * `frontmatter.tools` by the resolver's own `thetaDefaultName`, the shared
 * derivation `presentedCallableNames` uses, so the fallback agrees with the
 * snapshot arm on a hyphenated stem (bug 0253). This is the same
 * snapshot-absent fallback pattern `#resolvePiToolForTheta` uses. Production
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
  const tools = theta.frontmatter.tools ?? [];
  return tools.find(
    (entry) => entry.endsWith(".theta") && thetaDefaultName(entry) === calleeName,
  );
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
 * (an in-memory harness fixture) falls back to deriving per-entry names from
 * `frontmatter.tools` — the same snapshot-absent fallback pattern
 * `thetaCalleePath` / `#resolvePiToolForTheta` use, so production always takes
 * the snapshot arm. The fallback answers "which entries exist" from the SAME
 * closed grammar `resolveCallableSet` enforces (`parseToolsEntry`) rather than
 * re-tokenising the entry itself, so the two cannot disagree about a malformed
 * entry (bug 0069 §Fix constraint 5): a malformed entry has no presented name
 * and contributes nothing to the returned list, matching the resolver
 * un-registering the theta outright rather than truncating it to a name. A
 * `.theta` entry's default name is the resolver's shared `thetaDefaultName`
 * (`src/parser/callable-set.ts`), so a hyphenated stem presents the same
 * underscored name on both the snapshot and fallback arms (bug 0253).
 */
export function presentedCallableNames(theta: ConversationBindInput["theta"]): readonly string[] {
  const set = theta.callableSet;
  if (set !== undefined) {
    return [...set.entries.keys()];
  }
  const names: string[] = [];
  for (const entry of theta.frontmatter.tools ?? []) {
    const parsed = parseToolsEntry(entry.trim());
    if (parsed.kind !== "ok") {
      continue;
    }
    if (parsed.rename !== undefined) {
      names.push(parsed.rename);
      continue;
    }
    names.push(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.spec) ? parsed.spec : thetaDefaultName(parsed.spec),
    );
  }
  return names;
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
