// V15d / V15d-T — prompt→prompt parent-suspend and `setActiveTools`
// snapshot/restore.
//
// This module owns the highest-risk, host-state-mutating, asynchronous facet of
// the cross-mode matrix, peeled off `V15a` (invocation-core) and `V15l`
// (fresh-vs-attach): the prompt→prompt cell, where an `invoke`d prompt-mode
// callee attaches to the caller's existing user session. For that cell the
// runtime snapshots the user session's ambient active-tool set, installs the
// child's callable set, suspends the parent's body until the child returns, and
// restores the snapshot under the PIC-8/PIC-19 protocol once the child settles —
// including the fail / cancel / throw paths (invocation.md §Cross-mode semantics
// prompt→prompt paragraph; pi-integration-contract/tool-registration-lifetime.md
// PIC-17 step-4 restore, generalised from the per-query window to the child's
// whole body).
//
// Scope: the prompt→prompt cell only. Every other cross-mode cell (any
// subagent-mode participant) reaches the model through `customTools` on a
// spawned `AgentSession` and never touches the user session's active set, so no
// suspend/snapshot/restore window engages there (owned by `V15l`).
//
// The suspend-until-child-settles behaviour this module owns is distinct from
// PIC-2 cross-body non-overlap (owned by `V9c`): here the child body is what
// may fail, cancel, or throw, and this module's job is suspending the parent
// until it does and surfacing that inner failure unmasked. The restore-call /
// setup-side failure protocol itself (PIC-8/PIC-19) is NOT reimplemented here —
// bug 0372 §Fix retargeted this window onto the one shared implementation,
// `withActiveSetGate` (`./tool-registration.ts`), rather than a bare
// finally-restore.
//
// V15d: for the prompt→prompt cell the runtime snapshots the user session's
// active set (step 1), installs the child's callable set (step 2), suspends
// the parent by awaiting the child body, and restores the snapshot under the
// PIC-8/PIC-19 protocol once the child settles (step 4) — including the fail /
// cancel / throw paths, with the inner failure surfaced unmasked. For every
// other cell no window engages and the child body runs untouched.

import type { CrossModeCell } from "./invoke-cross-mode";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { SystemNote } from "../extension/system-note-channel";
import { withActiveSetGate, type ActiveSetPi } from "./tool-registration";

/**
 * The narrow `pi` subset the prompt→prompt suspend window touches: the
 * `pi.getActiveTools()` snapshot (step 1) and the `pi.setActiveTools(...)`
 * swap-install / step-4 restore. Name lists only, per PIC-17. Identical in
 * shape to `ActiveSetPi` (`tool-registration.ts`) — the gate this window
 * restores through (bug 0372 §Fix).
 */
export type PromptSuspendPi = ActiveSetPi;

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
  /**
   * Bug 0372 §Fix: the `ActiveSetGateDeps` this hop's restore window threads
   * into `withActiveSetGate` (PIC-8/PIC-19). Flat fields, not nested — named
   * exactly as `ActiveSetGateDeps` expects (the bare `/<name>` substituted
   * into the PIC-8(c) note template, the diagnostic sink, the system-note
   * sink, and the setup-throw router).
   */
  readonly thetaName: string;
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  readonly emitSystemNote: (note: SystemNote) => void;
  readonly routeInternalError: (error: Error) => void;
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

  // Bug 0372 §Fix: the snapshot/swap-install/restore steps run under
  // `withActiveSetGate` (tool-registration.ts) rather than a bare
  // finally-restore, so a step-4 restore throw gets the PIC-8 single
  // re-attempt + `active-set-restore-failed` diagnostic + display note
  // instead of masking the child's completed result, and a step-1/step-2
  // setup throw routes to `theta/runtime/internal-error` per PIC-19.
  const result = await withActiveSetGate<T>(
    {
      pi,
      thetaName: input.thetaName,
      installVector: childCallableSet,
      emitDiagnostic: input.emitDiagnostic,
      emitSystemNote: input.emitSystemNote,
      routeInternalError: input.routeInternalError,
    },
    childBody,
  );
  return { engaged: true, result };
}
