// V15d / V15d-T — prompt→prompt parent-suspend and `setActiveTools`
// snapshot/restore.
//
// This module owns the highest-risk, host-state-mutating, asynchronous facet of
// the cross-mode matrix, peeled off `V15a` (invocation-core) and `V15l`
// (fresh-vs-attach): the prompt→prompt cell, where an `invoke`d prompt-mode
// callee attaches to the caller's existing user session. For that cell the
// runtime snapshots the user session's ambient active-tool set, installs the
// child's callable set, suspends the parent's body until the child returns, and
// restores the snapshot in a `finally` once the child settles — including the
// fail / cancel / throw paths (invocation.md §Cross-mode semantics prompt→prompt
// paragraph; pi-integration-contract/tool-registration-lifetime.md PIC-17
// step-4 `finally` restore, generalised from the per-query window to the
// child's whole body).
//
// Scope: the prompt→prompt cell only. Every other cross-mode cell (any
// subagent-mode participant) reaches the model through `customTools` on a
// spawned `AgentSession` and never touches the user session's active set, so no
// suspend/snapshot/restore window engages there (owned by `V15l`).
//
// The restore-on-inner-failure this module owns is distinct from PIC-8/PIC-19
// (restore-call / setup-side failure, owned by `V9f`) and PIC-2 cross-body
// non-overlap (owned by `V9c`): here the restore call itself SUCCEEDS and the
// child body is what fails, cancels, or throws; the window must still restore
// the pre-invoke snapshot and surface the inner failure unmasked.
//
// V15d fills this in: for the prompt→prompt cell the runtime snapshots the
// user session's active set (step 1), installs the child's callable set (step
// 2), suspends the parent by awaiting the child body, and restores the snapshot
// in a `finally` once the child settles (step 4) — including the fail / cancel /
// throw paths, with the inner failure surfaced unmasked. For every other cell
// no window engages and the child body runs untouched.

import type { CrossModeCell } from "./invoke-cross-mode";

/**
 * The narrow `pi` subset the prompt→prompt suspend window touches: the
 * `pi.getActiveTools()` snapshot (step 1) and the `pi.setActiveTools(...)`
 * swap-install / step-4 restore. Name lists only, per PIC-17.
 */
export interface PromptSuspendPi {
  /** Step-1 snapshot of the user session's active tool-name list. */
  getActiveTools(): string[];
  /** Step-2 swap-install / step-4 restore — name lists only. */
  setActiveTools(names: string[]): void;
}

/** Inputs to one prompt→prompt `invoke` hop's suspend/snapshot/restore window. */
export interface PromptSuspendInput<T> {
  /**
   * The cross-mode cell for this hop. The suspend + snapshot/restore window
   * engages ONLY for the prompt→prompt cell (invocation.md §Cross-mode
   * semantics); every other cell leaves the user session's active set untouched.
   */
  readonly cell: CrossModeCell;
  /**
   * The child's declared callable set — the exact step-2 install vector the
   * window installs while the child runs. The step-1 snapshot is held only for
   * the step-4 restore and is deliberately NOT unioned in ("ambient tools are
   * deliberately not inherited").
   */
  readonly childCallableSet: readonly string[];
  /** The active-set snapshot/restore surface. */
  readonly pi: PromptSuspendPi;
  /**
   * The child invocation body. The parent is suspended at the call site until
   * this settles (invocation.md §Cross-mode semantics: `invoke(...)` to a
   * prompt-mode callee suspends the parent's body until the child returns).
   */
  readonly childBody: () => Promise<T>;
}

/** The outcome of a prompt→prompt `invoke` hop's suspend window. */
export interface PromptSuspendOutcome<T> {
  /**
   * Whether the prompt→prompt parent-suspend + snapshot/restore window engaged
   * for this hop. `true` only for the prompt→prompt cell.
   */
  readonly engaged: boolean;
  /** The child body's success value (fire-and-forget / typed-return payload). */
  readonly result: T;
}

/**
 * Run one prompt→prompt `invoke` hop under the parent-suspend + active-set
 * snapshot/restore window (invocation.md §Cross-mode semantics; PIC-17).
 *
 * For the prompt→prompt cell: snapshot the user session's active set, install
 * the child's callable set, suspend the parent by awaiting the child body, and
 * restore the snapshot in a `finally` once the child settles — including the
 * fail / cancel / throw paths, with the inner failure surfaced unmasked. For any
 * other cell no window engages and the child body runs untouched.
 *
 * The step-1 snapshot is held only for the step-4 restore and is deliberately
 * NOT unioned into the install vector — ambient tools are not inherited by the
 * child. The step-4 restore overwrites any intervening active-set mutation with
 * no diagnostic (invocation.md §Cross-mode semantics).
 */
export async function runPromptSuspendInvoke<T>(
  input: PromptSuspendInput<T>,
): Promise<PromptSuspendOutcome<T>> {
  const { cell, childCallableSet, pi, childBody } = input;

  // Only the prompt→prompt cell engages the suspend + snapshot/restore window;
  // every other cell leaves the user session's active set untouched.
  if (cell.callerMode !== "prompt" || cell.calleeMode !== "prompt") {
    const result = await childBody();
    return { engaged: false, result };
  }

  // Step 1: snapshot the user session's ambient active-tool set.
  const snapshot = pi.getActiveTools();
  // Step 2: install the child's callable set (ambient snapshot NOT unioned in).
  pi.setActiveTools([...childCallableSet]);
  try {
    // Suspend the parent's body until the child settles.
    const result = await childBody();
    return { engaged: true, result };
  } finally {
    // Step 4: restore the pre-invoke snapshot on every settle path — success,
    // returned Err, cancel, or throw — overwriting any mid-window mutation. The
    // inner failure (if any) propagates unmasked past this `finally`.
    pi.setActiveTools([...snapshot]);
  }
}
