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
// V15d-T (tests-task) declares the seam shape and stubs the behaviour-bearing
// function inertly: `runPromptSuspendInvoke` runs the child body directly with
// NO snapshot / install / restore and reports the window as NOT engaged, so the
// paired tests red on their own primary assertions — an absent snapshot/install
// before the child runs, and an active set left un-restored after the child
// fails / cancels / throws. No test reds on a compile error, a missing fixture,
// or a harness throw. The paired `V15d` implementation leaf fills this in.

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
 * V15d-T stub: runs the child body directly with NO snapshot / install /
 * restore and reports the window as NOT engaged, so the paired tests red on
 * their own primary assertions. The V15d implementation fills this in.
 */
export async function runPromptSuspendInvoke<T>(
  input: PromptSuspendInput<T>,
): Promise<PromptSuspendOutcome<T>> {
  const result = await input.childBody();
  return { engaged: false, result };
}
