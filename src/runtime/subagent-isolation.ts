// V9i / V9i-T — subagent-mode session isolation and lifecycle seam.
//
// This module owns the subagent-mode spawn/drive/teardown seam
// (pi-integration-contract/subagent.md, host-interfaces-core.md,
// cancellation.md, return.md):
//
//   - PIC-40 pre-spawn model guard: refuse `createAgentSession` when the
//     resolved `model` is `undefined`, failing with
//     `loom/runtime/subagent-model-unresolved`.
//   - PIC-23 / PIC-41 spawn-options construction: the spawn passes a
//     loom-constructed `ResourceLoader` adapter (never the
//     `DefaultResourceLoader.systemPromptOverride` construction channel), a
//     fresh `SessionManager.inMemory(cwd)`, a `tools` allowlist derived from the
//     lowered `customTools`, and NO `signal` field.
//   - PIC-41 abort forwarding: cancellation reaches the spawned session solely
//     via a one-shot `loomAbort.signal` listener calling `AgentSession.abort()`
//     (with the synchronous already-aborted pre-registration path).
//   - PIC-42 completion await: session-local `session.subscribe`, unsubscribing
//     before resolving each query and attaching a fresh subscription per query,
//     never the global `pi.on("agent_end", …)` event.
//   - PIC-43 query-result extraction: read the terminal (`willRetry: false`)
//     `agent_end` event's `messages` array, applying the cancellation then the
//     transport (`stopReason: "error"`) short-circuit before the trailing
//     assistant-text concatenation.
//   - PIC-9 lifecycle: mandatory `dispose()` in `finally` on every exit path,
//     idempotent dispose, one-shot abort-listener detach, advisory
//     `loom/runtime/subagent-dispose-failure` on a `dispose()` throw that never
//     masks the original `Err`/`Ok`; disposal bounded by `SHUTDOWN_AWAIT_CAP_MS`.
//   - PIC-22 parallel spawn: for N≥2 parallel subagent tool calls, initiate
//     `createAgentSession` for all N and enter each `sendUserMessage` before any
//     one returns.
//   - FN-5 final-value: the callee's produced value propagates to the subagent
//     caller on success and is absent on fail/cancel (via the `V3d`
//     function-result seam).
//
// V9i-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions NON-COMPLIANTLY so the failing tests compile and red on their own
// primary assertions while `V9i` is absent:
//   - `preSpawnModelGuard` / `guardedSubagentSpawn` never guard (always spawn);
//   - `buildSpawnOptions` includes a `signal` field, routes `system:` through
//     the `DefaultResourceLoader.systemPromptOverride` channel, drifts the
//     `tools` allowlist, and uses a non-in-memory session manager;
//   - `attachSubagentAbortForwarding` never calls `AgentSession.abort()`;
//   - `awaitTerminalAgentEnd` resolves via the global `pi.on` event, on the
//     first `agent_end` (ignoring `willRetry`), and never unsubscribes;
//   - `extractSubagentQueryResult` returns a fixed `Ok` sentinel (no
//     short-circuits);
//   - `runWithSubagentTeardown` runs no `finally` (no dispose, no detach, no
//     advisory diagnostic);
//   - `makeIdempotentDispose` disposes on every call;
//   - `subagentCallerFinalValue` reports a present sentinel on every outcome;
//   - `SUBAGENT_DISPOSE_BUDGET_MS` is `0` rather than `SHUTDOWN_AWAIT_CAP_MS`.
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V9i implementation leaf fills these in.
//
// Spec: pi-integration-contract/subagent.md (PIC-9, PIC-22, PIC-23, PIC-40,
// PIC-41, PIC-42, PIC-43); pi-integration-contract/host-interfaces-core.md
// (`AgentSession` member surface); cancellation.md; return.md / functions.md
// (FN-5, via the `V3d` function-result seam).

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { SHUTDOWN_AWAIT_CAP_MS } from "../extension/capability-probe";
import { extractTrailingTurnText } from "./conversation-drive";
import { makeCancelledError } from "./cancellation-core";
import { functionResult, type FunctionResult } from "./function-result";
import type { LoomValue } from "./value";
import type { QueryError } from "./query-error";

// ---------------------------------------------------------------------------
// PIC-9 — disposal budget.
// ---------------------------------------------------------------------------

/**
 * PIC-9. The bounded budget (milliseconds) the subagent disposal phase runs
 * under. The compliant `V9i` sources this from the single `SHUTDOWN_AWAIT_CAP_MS`
 * declaration site (`V9a`), so `SUBAGENT_DISPOSE_BUDGET_MS === SHUTDOWN_AWAIT_CAP_MS`.
 * There is no separate budget for disposal; it is covered by the single
 * `SHUTDOWN_AWAIT_CAP_MS` declaration site.
 */
export const SUBAGENT_DISPOSE_BUDGET_MS = SHUTDOWN_AWAIT_CAP_MS;

// ---------------------------------------------------------------------------
// PIC-40 — pre-spawn model guard.
// ---------------------------------------------------------------------------

/** PIC-40 diagnostic code emitted when the resolved subagent `model` is `undefined`. */
export const SUBAGENT_MODEL_UNRESOLVED_CODE = "loom/runtime/subagent-model-unresolved";

/**
 * PIC-40 diagnostic message (diagnostics registry Message column, code
 * `loom/runtime/subagent-model-unresolved`).
 */
export const SUBAGENT_MODEL_UNRESOLVED_MESSAGE =
  "subagent invocation has no resolved model: frontmatter 'model:' is absent and the inherited session model is undefined";

/** Outcome of the PIC-40 pre-spawn model guard. */
export interface ModelGuardOutcome {
  /** `false` when the resolved `model` is `undefined` — the spawn is refused. */
  readonly proceed: boolean;
  /** The `subagent-model-unresolved` diagnostic when `proceed` is `false`. */
  readonly diagnostic?: Diagnostic;
}

/**
 * PIC-40. Decide whether the spawn may proceed given the loom's resolved model.
 * A resolved `undefined` refuses the spawn with the
 * `loom/runtime/subagent-model-unresolved` diagnostic.
 */
export function preSpawnModelGuard(model: string | undefined): ModelGuardOutcome {
  // PIC-40: `model === undefined` MUST NOT proceed to `createAgentSession`.
  if (model === undefined) {
    return {
      proceed: false,
      diagnostic: {
        severity: "error",
        code: SUBAGENT_MODEL_UNRESOLVED_CODE,
        message: SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
      },
    };
  }
  return { proceed: true };
}

/** Deps the guarded spawn drives: the SDK spawn call and the diagnostic sink. */
export interface GuardedSpawnDeps {
  /** `createAgentSession` — MUST NOT be called when `model` is `undefined`. */
  readonly createAgentSession: () => Promise<void>;
  /** Persistent-diagnostic sink for the `subagent-model-unresolved` failure. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * PIC-40. Gate the spawn behind the pre-spawn model guard: when the resolved
 * `model` is `undefined` the runtime MUST NOT call `createAgentSession` and
 * instead emits the `subagent-model-unresolved` diagnostic.
 */
export async function guardedSubagentSpawn(
  model: string | undefined,
  deps: GuardedSpawnDeps,
): Promise<{ readonly spawned: boolean }> {
  const outcome = preSpawnModelGuard(model);
  if (!outcome.proceed) {
    // PIC-40: refuse the spawn before calling `createAgentSession` and emit the
    // terminal `subagent-model-unresolved` diagnostic.
    if (outcome.diagnostic !== undefined) {
      deps.emitDiagnostic(outcome.diagnostic);
    }
    return { spawned: false };
  }
  await deps.createAgentSession();
  return { spawned: true };
}

// ---------------------------------------------------------------------------
// PIC-23 / PIC-41 / isolation — spawn-options construction.
// ---------------------------------------------------------------------------

/** The loom-load-bearing subset of a lowered `ToolDefinition` the spawn reads. */
export interface LoweredTool {
  readonly name: string;
}

/**
 * The loom-owned `ResourceLoader` adapter surface the spawn constructs (PIC-23
 * rule 4). `getSystemPrompt()` is the sole `system:` delivery channel; the rest
 * return empty/defaults.
 */
export interface SubagentResourceLoader {
  getSystemPrompt(): string;
  getAppendSystemPrompt(): string[];
}

/** Inputs the spawn-options builder reads. */
export interface SpawnInputs {
  readonly customTools: readonly LoweredTool[];
  readonly loomSystemPrompt: string;
  readonly model: string;
  readonly cwd: string;
  readonly loomAbort: AbortController;
}

/** Injected host factories the spawn consumes by name (satellite type pins). */
export interface SpawnDeps {
  /** `SessionManager.inMemory(cwd)` — the loom-spawned in-memory manager. */
  readonly makeInMemorySessionManager: (cwd: string) => object;
  /**
   * `DefaultResourceLoader` construction channel — the compliant path MUST NOT
   * call this (PIC-23: the `systemPromptOverride` channel SHOULD NOT be used).
   */
  readonly makeDefaultResourceLoader: (options: {
    systemPromptOverride: (base: string) => string;
  }) => SubagentResourceLoader;
}

/**
 * The `CreateAgentSessionOptions` subset the spawn populates. Per PIC-41 there is
 * no `signal` field: cancellation is forwarded solely via the one-shot
 * `loomAbort.signal` listener, never through a spawn option.
 */
export interface SubagentSpawnOptions {
  readonly customTools: readonly LoweredTool[];
  readonly tools: readonly string[];
  readonly model: string;
  readonly sessionManager: object;
  readonly resourceLoader: SubagentResourceLoader;
}

/**
 * PIC-23 / PIC-41 / isolation. Build the `createAgentSession` options: a
 * loom-constructed `ResourceLoader` adapter (never the
 * `DefaultResourceLoader.systemPromptOverride` channel), the `tools` allowlist
 * derived from the lowered `customTools`, a fresh `SessionManager.inMemory(cwd)`,
 * and NO `signal` field.
 */
export function buildSpawnOptions(inputs: SpawnInputs, deps: SpawnDeps): SubagentSpawnOptions {
  // PIC-23: the loom-constructed adapter delivers the resolved `system:` verbatim
  // via `getSystemPrompt()` and appends nothing; the
  // `DefaultResourceLoader.systemPromptOverride` construction channel is NOT used.
  const resourceLoader: SubagentResourceLoader = {
    getSystemPrompt: (): string => inputs.loomSystemPrompt,
    getAppendSystemPrompt: (): string[] => [],
  };
  // Isolation: a fresh in-memory session manager for this cwd (no shared
  // transcript) and a `tools` allowlist derived from the same lowered
  // `customTools` set (no shared tool table, no drift).
  return {
    customTools: inputs.customTools,
    tools: inputs.customTools.map((tool) => tool.name),
    model: inputs.model,
    sessionManager: deps.makeInMemorySessionManager(inputs.cwd),
    resourceLoader,
    // PIC-41: NO `signal` field — the key is omitted entirely; cancellation is
    // forwarded solely via the one-shot `loomAbort.signal` listener below.
  };
}

// ---------------------------------------------------------------------------
// PIC-41 — abort forwarding into the spawned session.
// ---------------------------------------------------------------------------

/** The `AgentSession.abort()` member the cancellation listener drives. */
export interface AbortableSubagentSession {
  abort(): Promise<void>;
}

/** The one-shot abort-forwarding registration, detached in the teardown `finally`. */
export interface AbortForwardingRegistration {
  /** Detach the one-shot `loomAbort.signal` listener (PIC-9 teardown). */
  readonly detach: () => void;
}

/**
 * PIC-41. Forward cancellation into the spawned session: register a one-shot
 * `loomAbort.signal` listener calling `session.abort()`; if `loomAbort` is
 * already aborted at attach time, call `session.abort()` synchronously before
 * registering the listener (the spawn-then-immediate-cancel path). The returned
 * promise is deliberately not awaited from the listener.
 */
export function attachSubagentAbortForwarding(
  loomAbort: AbortController,
  session: AbortableSubagentSession,
): AbortForwardingRegistration {
  // PIC-41: the returned `abort()` Promise is deliberately not awaited from the
  // listener; a swallowing handler absorbs any late rejection per Cancellation's
  // swallowing-handler rule rather than surfacing it as an unhandled rejection.
  const fireAbort = (): void => {
    void session.abort().catch(() => {});
  };

  // PIC-41: the spawn-then-immediate-cancel path — if `loomAbort` is already
  // aborted at attach time, `abort()` fires synchronously before the listener is
  // registered, so correctness does not depend on microtask ordering.
  if (loomAbort.signal.aborted) {
    fireAbort();
    return { detach: (): void => {} };
  }

  // PIC-41: a one-shot `loomAbort.signal` listener is the sole cancellation-
  // forwarding mechanism; it is detached in the per-invocation teardown `finally`.
  const listener = (): void => {
    fireAbort();
  };
  loomAbort.signal.addEventListener("abort", listener, { once: true });
  return {
    detach: (): void => {
      loomAbort.signal.removeEventListener("abort", listener);
    },
  };
}

// ---------------------------------------------------------------------------
// PIC-42 — session-local completion await.
// ---------------------------------------------------------------------------

/** The terminal `agent_end` event variant the runtime resolves each query from. */
export interface AgentEndEvent {
  readonly type: "agent_end";
  readonly messages: readonly Message[];
  readonly willRetry: boolean;
}

/** Any `AgentSessionEvent` the session-local subscription delivers. */
export type SubagentSessionEvent = AgentEndEvent | { readonly type: string };

/** The session-local `AgentSession.subscribe` surface (PIC-42). */
export interface SubagentEventSource {
  subscribe(listener: (event: SubagentSessionEvent) => void): () => void;
}

/** The forbidden process-global `pi.on` surface (PIC-42 MUST NOT). */
export interface GlobalEventBus {
  on(event: string, handler: (event: SubagentSessionEvent) => void): void;
}

/**
 * PIC-42. Await a query's completion via the session-local `subscribe` API:
 * ignore `willRetry: true` events, resolve from the terminal (`willRetry: false`)
 * `agent_end` event, and unsubscribe before resolving. A fresh subscription is
 * attached per call — never the global `pi.on("agent_end", …)` event.
 */
export async function awaitTerminalAgentEnd(
  source: SubagentEventSource,
  globalBus: GlobalEventBus,
): Promise<AgentEndEvent> {
  // PIC-42: the global `pi.on("agent_end", …)` event MUST NOT be used; the
  // session-local `subscribe` API is the sole completion channel.
  void globalBus;
  return await new Promise<AgentEndEvent>((resolve) => {
    let unsubscribe: (() => void) | undefined;
    unsubscribe = source.subscribe((event) => {
      if (event.type !== "agent_end") {
        return;
      }
      const agentEndEvent = event as AgentEndEvent;
      // PIC-43: an `agent_end` with `willRetry: true` precedes an SDK retry and
      // does not resolve the query — keep the subscription live.
      if (agentEndEvent.willRetry) {
        return;
      }
      // PIC-42: unsubscribe before resolving so the next query on this long-lived
      // session does not observe this listener.
      unsubscribe?.();
      resolve(agentEndEvent);
    });
  });
}

// ---------------------------------------------------------------------------
// PIC-43 — terminal `agent_end` query-result extraction.
// ---------------------------------------------------------------------------

/** A subagent untyped query's result. */
export type SubagentQueryResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: QueryError };

/** Live context the extraction reads its two short-circuits from. */
export interface SubagentExtractionCtx {
  /** `loomAbort.signal.aborted` — the cancellation short-circuit. */
  readonly aborted: boolean;
  /** The resolved-model provider for the transport-failure `Err`. */
  readonly provider: string;
}

/**
 * PIC-43. Extract the untyped query's result from the terminal `agent_end`
 * event's `messages` array, applying — in this fixed order — the cancellation
 * short-circuit (`ctx.aborted` → `Err(cancelled)`), then the transport-failure
 * short-circuit (trailing `assistant` `stopReason: "error"` → `Err(transport)`),
 * then the trailing-assistant-text concatenation (`Ok(string)`). The text rule
 * is the same final-turn assistant-text concatenation the prompt-mode driver
 * pins (`extractTrailingTurnText`), so the "same rule on both sides" invariant
 * holds.
 */
export function extractSubagentQueryResult(
  terminalEvent: AgentEndEvent,
  ctx: SubagentExtractionCtx,
): SubagentQueryResult {
  // PIC-43: cancellation short-circuit runs first — before any text extraction.
  if (ctx.aborted) {
    return { ok: false, error: makeCancelledError() };
  }

  // PIC-43: transport-failure short-circuit next — the trailing `assistant`
  // message's `stopReason: "error"` maps to `Err(QueryError { kind: "transport" })`.
  const assistantMessages = terminalEvent.messages.filter(
    (message): message is AssistantMessage => message.role === "assistant",
  );
  const trailingAssistant = assistantMessages[assistantMessages.length - 1];
  if (trailingAssistant !== undefined && trailingAssistant.stopReason === "error") {
    return {
      ok: false,
      error: {
        kind: "transport",
        // `errorMessage` is optional on `AssistantMessage`; the fixed fallback
        // matches the prompt-mode transport mapping.
        message: trailingAssistant.errorMessage ?? "provider transport failure",
        http_status: null,
        provider: ctx.provider,
        retryable: false,
      },
    };
  }

  // PIC-43: with both short-circuits passed, the trailing turn's assistant text
  // is concatenated into `Ok(string)` by the shared prompt-mode rule.
  return { ok: true, value: extractTrailingTurnText(terminalEvent.messages) };
}

// ---------------------------------------------------------------------------
// PIC-9 — session lifecycle (idempotent dispose, teardown `finally`).
// ---------------------------------------------------------------------------

/** The `AgentSession.dispose()` member the teardown drives. */
export interface DisposableSubagentSession {
  dispose(): void;
}

/**
 * PIC-9. Wrap `session.dispose()` so it is invoked at most once per session —
 * a second call is a no-op (idempotent at the call site).
 */
export function makeIdempotentDispose(session: DisposableSubagentSession): () => void {
  // PIC-9: at-most-once latch scoped to this one session (not cross-invocation
  // state). The flag flips before the call so a throwing `dispose()` still
  // counts as consumed and a defensive second call stays a no-op.
  let disposed = false;
  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    session.dispose();
  };
}

/** PIC-9 advisory diagnostic code emitted when `AgentSession.dispose()` throws. */
export const SUBAGENT_DISPOSE_FAILURE_CODE = "loom/runtime/subagent-dispose-failure";

/**
 * PIC-9 advisory diagnostic message (diagnostics registry Message column, code
 * `loom/runtime/subagent-dispose-failure`): `subagent dispose failed: <dispose
 * error first line>`.
 */
export function renderSubagentDisposeFailureMessage(disposeError: unknown): string {
  const raw = disposeError instanceof Error ? disposeError.message : String(disposeError);
  const firstLine = raw.split("\n", 1)[0] ?? "";
  return `subagent dispose failed: ${firstLine}`;
}

/** The teardown callbacks the per-invocation `finally` runs (PIC-9). */
export interface SubagentTeardown {
  /** The idempotent `dispose()` (from `makeIdempotentDispose`). */
  dispose(): void;
  /** Detach the one-shot `loomAbort.signal` abort-forwarding listener. */
  detachAbortListener(): void;
}

/** The teardown's diagnostic sink for the advisory `dispose()`-throw diagnostic. */
export interface SubagentTeardownDeps {
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * PIC-9. Run the interpreter body against a spawned session and guarantee
 * teardown in a `finally` on every exit path (normal return, `Err`, panic, any
 * unexpected throw): detach the one-shot abort-forwarding listener, then call
 * the idempotent `dispose()`. A `dispose()` throw is trapped and logged via the
 * advisory `loom/runtime/subagent-dispose-failure` diagnostic; it never masks
 * the original `Err`/`Ok` and never promotes an `Ok` to an `Err`.
 */
export async function runWithSubagentTeardown<T>(
  teardown: SubagentTeardown,
  deps: SubagentTeardownDeps,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } finally {
    // PIC-9: teardown fires on every exit path (normal return, `Err`, panic, any
    // unexpected throw). Detach the one-shot abort-forwarding listener, then run
    // the idempotent `dispose()`.
    teardown.detachAbortListener();
    try {
      teardown.dispose();
    } catch (disposeError: unknown) { // allow-broad-catch: loom/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
      // PIC-9: a `dispose()` throw is trapped and logged as advisory only; it
      // never masks the original `Err`/`Ok` and never promotes an `Ok` to an
      // `Err`. `hint` carries the underlying dispose error's message.
      deps.emitDiagnostic({
        severity: "error",
        code: SUBAGENT_DISPOSE_FAILURE_CODE,
        message: renderSubagentDisposeFailureMessage(disposeError),
        hint: disposeError instanceof Error ? disposeError.message : String(disposeError),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// PIC-22 — parallel subagent spawn initiation.
// ---------------------------------------------------------------------------

/** The `AgentSession.sendUserMessage` drive point one spawn reaches. */
export interface SubagentDriveHandle {
  readonly sendUserMessage: (text: string) => Promise<void>;
}

/** One subagent-mode spawn: create the session, then enter its drive point. */
export interface ParallelSubagentSpawn {
  /** `createAgentSession(...)` for this invocation. */
  readonly createSession: () => Promise<SubagentDriveHandle>;
}

/**
 * PIC-22. Given N subagent-mode spawns emitted as parallel tool calls, the
 * runtime MUST initiate `createAgentSession` for all N and enter each spawned
 * session's `sendUserMessage` before any one invocation returns.
 */
export async function spawnSubagentsInParallel(
  spawns: readonly ParallelSubagentSpawn[],
): Promise<void> {
  // PIC-22: dispatch every per-call spawn (create-then-drive) before any one
  // returns, so all N `createAgentSession` calls complete and each
  // `sendUserMessage` is entered even when one blocks. A sequential loop would
  // leave later sessions uncreated behind a blocked drive point.
  await Promise.all( // allow: PIC-22 — pi-integration-contract/subagent.md
    spawns.map(async (spawn) => {
      const handle = await spawn.createSession();
      await handle.sendUserMessage("");
    }),
  );
}

// ---------------------------------------------------------------------------
// FN-5 — subagent caller final-value projection (via the V3d function-result seam).
// ---------------------------------------------------------------------------

/** The terminal outcome of a subagent-mode invocation, as seen by the caller. */
export type SubagentInvocationOutcome =
  | { readonly kind: "success"; readonly value: LoomValue }
  | { readonly kind: "fail"; readonly error: QueryError }
  | { readonly kind: "cancel" };

/**
 * FN-5 (re-cited against the `V3d` function-result seam). Project a subagent
 * invocation's outcome onto the final value the subagent caller observes: on
 * success the callee's produced value is present; on fail/cancel no final value
 * flows (the caller observes only the corresponding `Err`). Delegates to `V3d`'s
 * `functionResult`.
 */
export function subagentCallerFinalValue(outcome: SubagentInvocationOutcome): FunctionResult {
  // FN-5: only the success path carries a produced final value; fail/cancel
  // project to an absent value via the shared `V3d` seam.
  if (outcome.kind === "success") {
    return functionResult("success", outcome.value);
  }
  return functionResult(outcome.kind, null);
}
