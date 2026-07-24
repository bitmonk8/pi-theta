// Subagent-mode drive lifecycle seam (RFC-0005).
//
// This module owns the process-boundary subagent-mode drive lifecycle
// (pi-integration-contract/subagent.md, cancellation.md, functions.md):
//
//   - PIC-40 pre-spawn model guard: refuse the child spawn when the resolved
//     `model` is `undefined`, surfacing `theta/runtime/subagent-model-unresolved`
//     (`preSpawnModelGuard`, wired into the production spawn choke point).
//   - PIC-40 child-side model pre-flight: confirm the marshalled
//     `--provider`/`--model` reference resolved to the intended model
//     (`preFlightModelCheck`), failing with
//     `theta/runtime/subagent-model-preflight-mismatch` on mismatch.
//   - PIC-41 abort forwarding: cancellation reaches the child solely via a
//     one-shot `thetaAbort.signal` listener sending the RPC `abort` command
//     (`attachSubagentAbortForwarding`, with the synchronous already-aborted
//     pre-registration path).
//   - PIC-43 query-result extraction: read the terminal (`willRetry: false`)
//     `agent_end` event's `messages` array (`extractSubagentQueryResult`),
//     applying the cancellation then the transport (`stopReason: "error"`)
//     short-circuit before the trailing assistant-text concatenation.
//   - PIC-9 child-process teardown (`runSubagentChildTeardown`): stdin close →
//     bounded await → process-tree kill, advisory
//     `theta/runtime/subagent-dispose-failure` on a teardown-step throw,
//     `theta/runtime/subagent-teardown-timeout` on the kill fallback; bounded by
//     `SHUTDOWN_AWAIT_CAP_MS`.
//   - PIC-22 parallel spawn conformance witness (`spawnSubagentsInParallel`).
//
// Spec: pi-integration-contract/subagent.md (PIC-9, PIC-22, PIC-40, PIC-41,
// PIC-43); cancellation.md.

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { SHUTDOWN_AWAIT_CAP_MS } from "../extension/capability-probe";
import { extractTrailingTurnText } from "./conversation-drive";
import { makeCancelledError } from "./cancellation-core";
import type { SubagentChildProcess } from "./subagent-launcher";
import type { QueryError } from "./query-error";
import type { Clock } from "../seams/clock";

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
export const SUBAGENT_MODEL_UNRESOLVED_CODE = "theta/runtime/subagent-model-unresolved";

/**
 * PIC-40 diagnostic message (diagnostics registry Message column, code
 * `theta/runtime/subagent-model-unresolved`).
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
 * PIC-40. Decide whether the spawn may proceed given the theta's resolved model.
 * A resolved `undefined` refuses the spawn with the
 * `theta/runtime/subagent-model-unresolved` diagnostic.
 */
export function preSpawnModelGuard(model: string | undefined): ModelGuardOutcome {
  // PIC-40: `model === undefined` MUST NOT proceed to the child spawn.
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

// ---------------------------------------------------------------------------
// PIC-40 — child-side model pre-flight (marshalled-reference confirmation).
// ---------------------------------------------------------------------------

/** PIC-40 diagnostic code emitted when the child resolves a different model than intended. */
export const SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE =
  "theta/runtime/subagent-model-preflight-mismatch";

/**
 * PIC-40 pre-flight-mismatch Message-column renderer (diagnostics registry code
 * `theta/runtime/subagent-model-preflight-mismatch`).
 */
export function renderModelPreflightMismatchMessage(expected: string, resolved: string): string {
  return `subagent model pre-flight mismatch: expected '${expected}', child resolved '${resolved}'`;
}

/** The PIC-40 pre-flight outcome. */
export interface ModelPreflightOutcome {
  /** `false` when the child resolved a model other than the intended one. */
  readonly proceed: boolean;
  /** The `subagent-model-preflight-mismatch` diagnostic when `proceed` is `false`. */
  readonly diagnostic?: Diagnostic;
}

/**
 * PIC-40. After spawn and before the first query, confirm the marshalled
 * `--provider`/`--model` reference resolved child-side to the intended model.
 * On mismatch, fail the invocation with `theta/runtime/subagent-model-preflight-mismatch`
 * naming expected vs. resolved.
 */
export function preFlightModelCheck(expected: string, resolved: string): ModelPreflightOutcome {
  if (expected === resolved) {
    return { proceed: true };
  }
  // The marshalled reference resolved child-side to a different model — terminal
  // for the invocation (the runtime does not retry).
  return {
    proceed: false,
    diagnostic: {
      severity: "error",
      code: SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
      message: renderModelPreflightMismatchMessage(expected, resolved),
    },
  };
}

// ---------------------------------------------------------------------------
// PIC-41 — abort forwarding into the spawned session.
// ---------------------------------------------------------------------------

/** The RPC-abort send the cancellation listener drives on the child process. */
export interface AbortableSubagentSession {
  abort(): Promise<void>;
}

/** The one-shot abort-forwarding registration, detached in the teardown `finally`. */
export interface AbortForwardingRegistration {
  /** Detach the one-shot `thetaAbort.signal` listener (PIC-9 teardown). */
  readonly detach: () => void;
}

/**
 * PIC-41. Forward cancellation into the spawned session: register a one-shot
 * `thetaAbort.signal` listener calling `session.abort()`; if `thetaAbort` is
 * already aborted at attach time, call `session.abort()` synchronously before
 * registering the listener (the spawn-then-immediate-cancel path). The returned
 * promise is deliberately not awaited from the listener.
 */
export function attachSubagentAbortForwarding(
  thetaAbort: AbortController,
  session: AbortableSubagentSession,
): AbortForwardingRegistration {
  // PIC-41: the returned `abort()` Promise is deliberately not awaited from the
  // listener; a swallowing handler absorbs any late rejection per Cancellation's
  // swallowing-handler rule rather than surfacing it as an unhandled rejection.
  const fireAbort = (): void => {
    void session.abort().catch(() => {});
  };

  // PIC-41: the spawn-then-immediate-cancel path — if `thetaAbort` is already
  // aborted at attach time, `abort()` fires synchronously before the listener is
  // registered, so correctness does not depend on microtask ordering.
  if (thetaAbort.signal.aborted) {
    fireAbort();
    return { detach: (): void => {} };
  }

  // PIC-41: a one-shot `thetaAbort.signal` listener is the sole cancellation-
  // forwarding mechanism; it is detached in the per-invocation teardown `finally`.
  const listener = (): void => {
    fireAbort();
  };
  thetaAbort.signal.addEventListener("abort", listener, { once: true });
  return {
    detach: (): void => {
      thetaAbort.signal.removeEventListener("abort", listener);
    },
  };
}

// ---------------------------------------------------------------------------
// PIC-42 — terminal `agent_end` event shape (RPC stream selection lives in
// `subagent-rpc-driver.ts`; this is the shared event type it resolves from).
// ---------------------------------------------------------------------------

/** The terminal `agent_end` event variant the runtime resolves each query from. */
export interface AgentEndEvent {
  readonly type: "agent_end";
  readonly messages: readonly Message[];
  readonly willRetry: boolean;
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
  /** `thetaAbort.signal.aborted` — the cancellation short-circuit. */
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
  extractionCtx: SubagentExtractionCtx,
): SubagentQueryResult {
  // PIC-43: cancellation short-circuit runs first — before any text extraction.
  if (extractionCtx.aborted) {
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
        provider: extractionCtx.provider,
        retryable: false,
      },
    };
  }

  // PIC-43: with both short-circuits passed, the trailing turn's assistant text
  // is concatenated into `Ok(string)` by the shared prompt-mode rule.
  return { ok: true, value: extractTrailingTurnText(terminalEvent.messages) };
}

// ---------------------------------------------------------------------------
// PIC-9 — teardown-step advisory diagnostic.
// ---------------------------------------------------------------------------

/** PIC-9 advisory diagnostic code emitted when a teardown step throws. */
export const SUBAGENT_DISPOSE_FAILURE_CODE = "theta/runtime/subagent-dispose-failure";

/**
 * PIC-9 advisory diagnostic message (diagnostics registry Message column, code
 * `theta/runtime/subagent-dispose-failure`): `subagent dispose failed: <dispose
 * error first line>`.
 */
export function renderSubagentDisposeFailureMessage(disposeError: unknown): string {
  const raw = disposeError instanceof Error ? disposeError.message : String(disposeError);
  const firstLine = raw.split("\n", 1)[0] ?? "";
  // Registry-pinned Message column (code-registry-runtime.md): only the first
  // line of a multi-line teardown-step error rides in.
  return `subagent teardown failed: ${firstLine}`;
}

// ---------------------------------------------------------------------------
// PIC-22 — parallel subagent spawn initiation (conformance witness).
// ---------------------------------------------------------------------------
//
// WHY this seam exists without a direct production call site: PIC-22 is a
// runtime-observable obligation (N parallel subagent tool calls must all reach
// their first `prompt` before any returns) whose production realisation is
// EMERGENT — each subagent tool call drives through its own independent
// `spawnSubagentConversation` under Pi's tool-call concurrency, with no cap /
// queue / scheduler interposed (theta 1.0 imposes no invocation cap, per
// subagent.md #no-invocation-cap). `spawnSubagentsInParallel` is the executable
// conformance witness that pins the launch-then-first-prompt-before-any-returns
// discipline the production fan-out must exhibit; the PIC-22 conformance test
// drives it against a fake process launcher whose children block their first
// `prompt` ack. It is deliberately retained (not deleted) as that witness.

/**
 * One subagent-mode spawn: launch the child `pi` process, then enter its first
 * RPC `prompt` command.
 */
export interface ParallelSubagentSpawn {
  /** Launch this invocation's child `pi` process. */
  readonly launchChild: () => Promise<SubagentChildProcess>;
  /** Enter the child's first RPC `prompt` command (the per-child drive point). */
  readonly enterFirstPrompt: (child: SubagentChildProcess) => Promise<void>;
}

/**
 * PIC-22. Given N subagent-mode spawns emitted as parallel tool calls, the
 * runtime MUST initiate the child-process spawn for all N and enter each child's
 * first `prompt` command before any one invocation returns.
 */
export async function spawnSubagentsInParallel(
  spawns: readonly ParallelSubagentSpawn[],
): Promise<void> {
  // PIC-22: dispatch every per-call spawn (launch-then-first-prompt) before any
  // one returns, so all N children spawn and each first `prompt` is entered even
  // when one blocks. A sequential loop, cap, or scheduler would leave a later
  // child unspawned behind a blocked drive point.
  await Promise.all( // allow: PIC-22 — pi-integration-contract/subagent.md
    spawns.map(async (spawn) => {
      const child = await spawn.launchChild();
      await spawn.enterFirstPrompt(child);
    }),
  );
}

// ---------------------------------------------------------------------------
// PIC-9 — subagent child-process teardown (stdin close → bounded await → kill).
// ---------------------------------------------------------------------------

/**
 * `theta/runtime/subagent-teardown-timeout` — the per-child kill-fallback event:
 * the child did not exit within the `SHUTDOWN_AWAIT_CAP_MS` budget after stdin
 * close, so the runtime killed it (process-tree kill on Windows). Owned here
 * (teardown owner); `subagent-rpc-driver.ts` re-exports it for wire consumers.
 */
export const SUBAGENT_TEARDOWN_TIMEOUT_CODE = "theta/runtime/subagent-teardown-timeout";

/** The collaborators the child-process teardown drives (PIC-9). */
export interface SubagentChildTeardownDeps {
  /** Diagnostic sink for the teardown-timeout and dispose-failure events. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** Detach the one-shot `thetaAbort.signal` abort-forwarding listener (PIC-41). */
  readonly detachAbortListener: () => void;
  /** Settle the `ActiveInvocationRegistry` `disposeBarrier` on observed child exit. */
  readonly settleDisposeBarrier: () => void;
  /** Injected PIC-12 timer seam (no ambient `setTimeout` in `src/**`). */
  readonly clock: Clock;
  /** Bounded budget (ms); defaults to `SUBAGENT_DISPOSE_BUDGET_MS`. */
  readonly budgetMs?: number;
}

/**
 * PIC-9. Tear the subagent child down: detach the one-shot abort listener, close
 * the child's stdin, await child exit within the `SHUTDOWN_AWAIT_CAP_MS` budget,
 * and — if the child does not exit in time — process-tree-kill it and emit
 * `theta/runtime/subagent-teardown-timeout`. `disposeBarrier` settles on observed
 * child exit. Idempotent at the call site. A teardown-step throw (stdin close or
 * kill) is trapped and logged via `theta/runtime/subagent-dispose-failure`; it
 * never alters the invocation result.
 */
export async function runSubagentChildTeardown(
  child: SubagentChildProcess,
  deps: SubagentChildTeardownDeps,
): Promise<void> {
  const budgetMs = deps.budgetMs ?? SUBAGENT_DISPOSE_BUDGET_MS;

  // PIC-9 / PIC-41: detach the one-shot abort-forwarding listener first.
  deps.detachAbortListener();

  // Observe child exit: settle the dispose barrier once, and resolve the local
  // await. Registered BEFORE stdin close so a synchronous stdin-EOF exit is seen.
  let exited = false;
  let resolveExit!: () => void;
  const exitObserved = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  child.onExit(() => {
    if (exited) {
      return;
    }
    exited = true;
    deps.settleDisposeBarrier();
    resolveExit();
  });

  // Graceful shutdown trigger: close the child's stdin (stdin-EOF exit). A throw
  // here means the graceful path is unavailable, so fall straight to the kill.
  let stdinClosed = true;
  try {
    child.closeStdin();
  } catch (closeError: unknown) { // allow-broad-catch: theta/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
    stdinClosed = false;
    emitTeardownStepFailure(deps, closeError);
  }

  if (exited) {
    // Child exited synchronously on stdin-EOF — no kill, no timeout.
    return;
  }

  if (stdinClosed) {
    // Bounded await of observed child exit within `SHUTDOWN_AWAIT_CAP_MS`, timed
    // by the injected `Clock` seam (PIC-12) — never the ambient global timer.
    let timer: import("../seams/clock").TimerHandle | undefined;
    const timedOut = await Promise.race<boolean>([ // allow: PIC-9 — pi-integration-contract/subagent.md
      exitObserved.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = deps.clock.setTimeout(() => resolve(true), budgetMs);
      }),
    ]);
    if (timer !== undefined) {
      deps.clock.clearTimeout(timer);
    }
    if (exited || !timedOut) {
      return;
    }
    // Budget elapsed: process-tree kill fallback + the per-child timeout event.
    killChild(child, deps);
    deps.emitDiagnostic({
      severity: "error",
      code: SUBAGENT_TEARDOWN_TIMEOUT_CODE,
      message: `subagent child did not exit within ${budgetMs}ms; killed`,
      hint: `${budgetMs}ms`,
    });
    return;
  }

  // stdin close failed — the graceful EOF exit will not arrive, so kill now.
  killChild(child, deps);
}

/** Process-tree kill the child; a kill throw is an advisory teardown-step failure. */
function killChild(child: SubagentChildProcess, deps: SubagentChildTeardownDeps): void {
  try {
    child.kill();
  } catch (killError: unknown) { // allow-broad-catch: theta/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
    emitTeardownStepFailure(deps, killError);
  }
}

/** PIC-9 advisory: a teardown-step throw (stdin close or bounded kill) is logged, never propagated. */
function emitTeardownStepFailure(deps: SubagentChildTeardownDeps, error: unknown): void {
  deps.emitDiagnostic({
    severity: "error",
    code: SUBAGENT_DISPOSE_FAILURE_CODE,
    message: renderSubagentDisposeFailureMessage(error),
    hint: error instanceof Error ? error.message : String(error),
  });
}

