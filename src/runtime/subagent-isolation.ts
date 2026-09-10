// Subagent-mode drive lifecycle seam (RFC-0005 machinery reused under RFC 0006).
//
// This module owns the process-boundary subagent-mode drive lifecycle that
// survives the RFC-0006 driver switchover — the launcher/teardown/probe
// machinery RFC 0006 reuses unchanged (pi-integration-contract/subagent.md,
// cancellation.md):
//
//   - PIC-65 child-process teardown (`runSubagentChildTeardown`): bounded await
//     of child exit → kill on timeout (process-tree kill on Windows, direct
//     SIGKILL elsewhere; the stdin release it also issues is an advisory no-op
//     — the child's stdin is spawned closed per bug 0002), advisory
//     `theta/runtime/subagent-dispose-failure` on a teardown-step throw, `theta/runtime/subagent-teardown-timeout` on the
//     kill fallback; bounded by `SUBAGENT_DISPOSE_BUDGET_MS`.
//   - PIC-22 parallel spawn conformance witness (`spawnSubagentsInParallel`).
//
// RETIRED with the RFC-0005 RPC drive (moved elsewhere): the PIC-62 pre-spawn
// model guard (now the SINGLE-SOURCE-OF-TRUTH `guardResolvedModel` in
// `subagent-model-guard.ts`; the dead RFC-0005 `preSpawnModelGuard` duplicate is
// deleted), the child-side model pre-flight (now `confirmChildModel` in
// `subagent-model-guard.ts`, reported through the envelope), abort forwarding
// (now the kill in `subagent-json-driver.ts`, PIC-66), and
// terminal-`agent_end` extraction (now the child's own prompt-mode driver).
//
// Spec: pi-integration-contract/subagent.md (PIC-65, PIC-22, PIC-62);
// cancellation.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { SubagentChildProcess } from "./subagent-launcher";
import type { Clock } from "../seams/clock";

// ---------------------------------------------------------------------------
// PIC-65 — disposal budget.
// ---------------------------------------------------------------------------

/**
 * PIC-65. The bounded budget (milliseconds) the per-invocation subagent
 * child-process EXIT wait runs under, decoupled from the `session_shutdown`
 * drain cap (`SHUTDOWN_AWAIT_CAP_MS`). This wait runs in the drive `finally`
 * AFTER the child's envelope is already consumed, so it never bounds
 * execution (execution is bounded upstream — `tool_loop.max_rounds`, the
 * turn-settle bound) — its magnitude only chooses graceful exit vs. a
 * process-tree kill. 30000ms matches the Kubernetes
 * `terminationGracePeriodSeconds` default — 15× the 2000 ms bound that every
 * observed real child overran (bug 0468 §Provenance did not measure the
 * natural wind-down time), so a child that did real provider work is observed
 * to exit instead of routinely killed.
 */
export const SUBAGENT_DISPOSE_BUDGET_MS = 30000;

// ---------------------------------------------------------------------------
// PIC-65 — teardown-step advisory diagnostic.
// ---------------------------------------------------------------------------

/** PIC-65 advisory diagnostic code emitted when a teardown step throws. */
export const SUBAGENT_DISPOSE_FAILURE_CODE = "theta/runtime/subagent-dispose-failure";

/**
 * PIC-65 advisory diagnostic message (diagnostics registry Message column, code
 * `theta/runtime/subagent-dispose-failure`): `subagent teardown failed: <teardown
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
// `-p` child's stdin is spawned closed (no data channel), so the per-child drive
// point is reaching the envelope await. It is deliberately retained (not
// deleted) as that witness.

/**
 * One subagent-mode spawn: launch the child `pi` process and reach its per-child
 * drive-initiated point (revised PIC-22 "spawn initiated").
 */
export interface ParallelSubagentSpawn {
  /** Launch this invocation's child `pi` process. */
  readonly launchChild: () => Promise<SubagentChildProcess>;
  /**
   * Reach the per-child drive-initiated point. Under RFC 0006 the `-p` child's
   * stdin is spawned closed (no RPC `prompt` write), so the drive point is
   * reaching the per-child envelope await — the revised PIC-22 "spawn initiated"
   * wording, replacing the retired RPC "enter first `prompt`" drive point.
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
// PIC-65 — subagent child-process teardown (bounded await → kill).
// ---------------------------------------------------------------------------

/**
 * `theta/runtime/subagent-teardown-timeout` — the per-child kill-fallback event:
 * the child did not exit within the `SUBAGENT_DISPOSE_BUDGET_MS` budget, so the
 * runtime killed it (process-tree kill on Windows). Owned here (teardown owner).
 */
export const SUBAGENT_TEARDOWN_TIMEOUT_CODE = "theta/runtime/subagent-teardown-timeout";

/** The collaborators the child-process teardown drives (PIC-65). */
export interface SubagentChildTeardownDeps {
  /** Diagnostic sink for the teardown-timeout and dispose-failure events. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** Detach the one-shot `thetaAbort.signal` abort-forwarding listener (PIC-66). */
  readonly detachAbortListener: () => void;
  /** Settle the `ActiveInvocationRegistry` `disposeBarrier` on observed child exit. */
  readonly settleDisposeBarrier: () => void;
  /** Injected PIC-12 timer seam (no ambient `setTimeout` in `src/**`). */
  readonly clock: Clock;
  /** Bounded budget (ms); defaults to `SUBAGENT_DISPOSE_BUDGET_MS`. */
  readonly budgetMs?: number;
}

/**
 * PIC-65. Tear the subagent child down: detach the one-shot abort listener,
 * release any residual parent-held stdin handle, await child exit within the
 * `SUBAGENT_DISPOSE_BUDGET_MS` budget, and — if the child does not exit in time —
 * kill it (process-tree kill on Windows) and emit
 * `theta/runtime/subagent-teardown-timeout`. On the normal path the child has
 * ALREADY exited when teardown runs (one invocation per process: envelope →
 * self-exit), so the bounded await short-circuits on the adapter's replayed
 * exit. `disposeBarrier` settles on observed child exit. Idempotent at the
 * call site. A teardown-step throw (stdin release or kill) is trapped and
 * logged via `theta/runtime/subagent-dispose-failure`; it never alters the
 * invocation result, and a stdin-release throw does not change the teardown
 * shape — the release is advisory, so teardown proceeds to the bounded await
 * regardless (PIC-65 pins the await as THE teardown mechanism).
 */
export async function runSubagentChildTeardown(
  child: SubagentChildProcess,
  deps: SubagentChildTeardownDeps,
): Promise<void> {
  const budgetMs = deps.budgetMs ?? SUBAGENT_DISPOSE_BUDGET_MS;

  // PIC-65 / PIC-66: detach the one-shot abort-forwarding listener first.
  deps.detachAbortListener();

  // Observe child exit: settle the dispose barrier once, and resolve the local
  // await. Registered FIRST so an already-exited child (the normal path — the
  // adapter replays its recorded exit) or a synchronous exit is seen.
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

  // Release any residual parent-held stdin handle. Under the production spawn
  // config this is a structural no-op — the child's stdin is spawned closed
  // ("ignore", bug 0002), and stdin close was never a stop signal to a `-p`
  // child anyway (EOF is its START gate). Kept for the `SubagentChildProcess`
  // surface: a non-production child with a live stdin still gets it released.
  // The release is advisory only: a throw here is logged and teardown falls
  // through to the bounded await → kill below unchanged — an incidental step
  // must not alter the teardown shape PIC-65 pins.
  try {
    child.closeStdin();
  } catch (closeError: unknown) { // allow-broad-catch: theta/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
    emitTeardownStepFailure(deps, closeError);
  }

  if (exited) {
    // A `SubagentChildProcess` whose `onExit` fired synchronously during the
    // subscribe / stdin-release above (the test doubles' already-exited or
    // exit-on-stdin-EOF shapes) — no kill, no timeout. The production adapter
    // replays an already-recorded exit on a microtask, so the production normal
    // path (envelope → self-exit) is served by the bounded await below
    // short-circuiting on that replay, not by this branch.
    return;
  }

  // Bounded await of observed child exit within `SUBAGENT_DISPOSE_BUDGET_MS`,
  // timed by the injected `Clock` seam (PIC-12) — never the ambient global
  // timer. `waitStart` lets the kill-fallback report the MEASURED elapsed wait
  // (registry-promised in `hint`) rather than the configured budget.
  const waitStart = deps.clock.now();
  let timer: import("../seams/clock").TimerHandle | undefined;
  const timedOut = await Promise.race<boolean>([ // allow: PIC-65 — pi-integration-contract/subagent.md
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
  // Budget elapsed: kill fallback (process-tree on Windows) + the per-child
  // timeout event. `hint` carries the MEASURED elapsed wall time at kill
  // (registry-promised), so a flood of these events records how long each
  // child actually overran rather than the identical configured budget.
  killChild(child, deps);
  const elapsedMs = deps.clock.now() - waitStart;
  deps.emitDiagnostic({
    severity: "error",
    code: SUBAGENT_TEARDOWN_TIMEOUT_CODE,
    message: `subagent child did not exit within ${budgetMs}ms; killed`,
    hint: `${elapsedMs}ms`,
  });
}

/** Kill the child (process-tree on Windows); a kill throw is an advisory teardown-step failure. */
function killChild(child: SubagentChildProcess, deps: SubagentChildTeardownDeps): void {
  try {
    child.kill();
  } catch (killError: unknown) { // allow-broad-catch: theta/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
    emitTeardownStepFailure(deps, killError);
  }
}

/** PIC-65 advisory: a teardown-step throw (stdin release or bounded kill) is logged, never propagated. */
function emitTeardownStepFailure(deps: SubagentChildTeardownDeps, error: unknown): void {
  deps.emitDiagnostic({
    severity: "error",
    code: SUBAGENT_DISPOSE_FAILURE_CODE,
    message: renderSubagentDisposeFailureMessage(error),
    hint: error instanceof Error ? error.message : String(error),
  });
}

