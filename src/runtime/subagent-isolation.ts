// Subagent-mode drive lifecycle seam (RFC-0005 machinery reused under RFC 0006).
//
// This module owns the process-boundary subagent-mode drive lifecycle that
// survives the RFC-0006 driver switchover — the launcher/teardown/probe
// machinery RFC 0006 reuses unchanged (pi-integration-contract/subagent.md,
// cancellation.md):
//
//   - PIC-9 child-process teardown (`runSubagentChildTeardown`): stdin close →
//     bounded await → process-tree kill, advisory
//     `theta/runtime/subagent-dispose-failure` on a teardown-step throw,
//     `theta/runtime/subagent-teardown-timeout` on the kill fallback; bounded by
//     `SHUTDOWN_AWAIT_CAP_MS`.
//   - PIC-22 parallel spawn conformance witness (`spawnSubagentsInParallel`).
//
// RETIRED with the RFC-0005 RPC drive (moved elsewhere): the PIC-62 pre-spawn
// model guard (now the SINGLE-SOURCE-OF-TRUTH `guardResolvedModel` in
// `subagent-model-guard.ts`; the dead RFC-0005 `preSpawnModelGuard` duplicate is
// deleted), the child-side model pre-flight (now `confirmChildModel` in
// `subagent-model-guard.ts`, reported through the envelope), abort forwarding
// (now stdin-close in `subagent-json-driver.ts`, PIC-63), and terminal-`agent_end`
// extraction (now the child's own prompt-mode driver).
//
// Spec: pi-integration-contract/subagent.md (PIC-9, PIC-22, PIC-62);
// cancellation.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import { SHUTDOWN_AWAIT_CAP_MS } from "../extension/capability-probe";
import type { SubagentChildProcess } from "./subagent-launcher";
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
// PIC-62 — pre-spawn model-guard diagnostic codes / message / renderer.
// ---------------------------------------------------------------------------
//
// The pre-spawn model guard itself is the SINGLE-SOURCE-OF-TRUTH
// `guardResolvedModel` in the PIC-62 module (`subagent-model-guard.ts`); the
// dead RFC-0005 `preSpawnModelGuard` duplicate that used to live here is deleted.
// The diagnostic codes / message / renderer are re-exported from here so
// existing RFC-0005 importers (and the isolation suite) keep resolving them
// unchanged.
export {
  SUBAGENT_MODEL_UNRESOLVED_CODE,
  SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
  SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
  renderModelPreflightMismatchMessage,
} from "./subagent-model-guard";

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
// their per-child SPAWN-INITIATED point before any returns) whose production
// realisation is EMERGENT — each subagent tool call drives through its own
// independent `spawnSubagentConversation` under Pi's tool-call concurrency, with
// no cap / queue / scheduler interposed (theta 1.0 imposes no invocation cap, per
// subagent.md #no-invocation-cap). `spawnSubagentsInParallel` is the executable
// conformance witness that pins the launch-then-drive-initiated-before-any-returns
// discipline the production fan-out must exhibit; the PIC-22 conformance test
// drives it against a fake process launcher whose children block their drive
// point. The revised PIC-22 wording replaces the retired RFC-0005 RPC "enter
// each child's first `prompt` command" drive point with "spawn initiated": the
// `-p` child's stdin is close-only, so the per-child drive point is reaching the
// envelope await. It is deliberately retained (not deleted) as that witness.

/**
 * One subagent-mode spawn: launch the child `pi` process and reach its per-child
 * drive-initiated point (revised PIC-22 "spawn initiated").
 */
export interface ParallelSubagentSpawn {
  /** Launch this invocation's child `pi` process. */
  readonly launchChild: () => Promise<SubagentChildProcess>;
  /**
   * Reach the per-child drive-initiated point. Under RFC 0006 the `-p` child's
   * stdin is close-only (no RPC `prompt` write), so the drive point is reaching
   * the per-child envelope await — the revised PIC-22 "spawn initiated" wording,
   * replacing the retired RPC "enter first `prompt`" drive point.
   */
  readonly driveInitiated: (child: SubagentChildProcess) => Promise<void>;
}

/**
 * PIC-22. Given N subagent-mode spawns emitted as parallel tool calls, the
 * runtime MUST initiate the child-process spawn for all N and reach each child's
 * drive-initiated point before any one invocation returns.
 */
export async function spawnSubagentsInParallel(
  spawns: readonly ParallelSubagentSpawn[],
): Promise<void> {
  // PIC-22: dispatch every per-call spawn (launch-then-drive-initiated) before
  // any one returns, so all N children spawn and each drive point is reached even
  // when one blocks. A sequential loop, cap, or scheduler would leave a later
  // child unspawned behind a blocked drive point.
  await Promise.all( // allow: PIC-22 — pi-integration-contract/subagent.md
    spawns.map(async (spawn) => {
      const child = await spawn.launchChild();
      await spawn.driveInitiated(child);
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
 * (teardown owner).
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

