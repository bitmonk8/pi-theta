// RFC-0006 — subagent-root regime (PIC-58) seam.
//
// The subagent-root regime is the invocation regime of a `mode: subagent` theta
// that is itself the ROOT theta of its own child `pi` process. A naive child
// launch of a `mode: subagent` callee is circular — the theta runtime inside the
// child would see `mode: subagent` and spawn ANOTHER child — so the child drives
// the root theta against the process's own host session (prompt-mode driver
// mechanics) while applying the subagent-mode frontmatter contract. This module
// owns:
//
//   - regime detection from the `PI_THETA_SUBAGENT_ROOT` env marker
//     (`detectSubagentRootRegime`), set ONLY by the parent launcher and never
//     authorable from a `.theta` file;
//   - the mode-regress guard / driver selection (`selectSubagentDriver`): under
//     the regime, a `mode: subagent` PROCESS-ROOT theta is driven in-process
//     (no child spawn for the root), while a NESTED `mode: subagent` callee
//     still spawns its own child in the normal way (the no-recursion guarantee).
//
// The marker subsumes RFC-0005's `PI_THETA_SUBAGENT_CHILD` marker and carries
// its duties (watcher suppression, no-recursion guard, parent-PID carriage)
// alongside regime selection; those RFC-0005 carriages are owned by
// `subagent-launcher.ts` and are unchanged here.
//
// Spec: pi-integration-contract/subagent.md (PIC-58, #subagent-root-regime,
// #subagent-launch-contract), conversation-drive.md (prompt-mode driver, PIC-2),
// tool-registration-lifetime.md (active-set snapshot/restore, degenerate here).

import type { ThetaMode } from "../parser/frontmatter";

// ---------------------------------------------------------------------------
// Regime marker + detection.
// ---------------------------------------------------------------------------

/**
 * The env marker selecting the subagent-root regime, set ONLY by the parent
 * launcher (`PI_THETA_SUBAGENT_ROOT=<slug>`) and NEVER authorable from a
 * `.theta` file. It subsumes RFC-0005's `PI_THETA_SUBAGENT_CHILD` marker
 * (PIC-58). A theta author cannot request the regime; it is invisible to the
 * language surface.
 */
export const SUBAGENT_ROOT_ENV_MARKER = "PI_THETA_SUBAGENT_ROOT";

/** The detected regime: inactive (this is not a subagent child), or active carrying the root slug. */
export type RootRegime =
  | { readonly active: false }
  | { readonly active: true; readonly slug: string };

/**
 * Detect the subagent-root regime from the env marker (PIC-58). Returns the
 * active regime carrying the marked root slug when `PI_THETA_SUBAGENT_ROOT` is
 * set, else the inactive verdict.
 */
export function detectSubagentRootRegime(
  env: Readonly<Record<string, string | undefined>>,
): RootRegime {
  // The regime is selected ONLY by the parent-launcher-set env marker, never by
  // anything in the `.theta` file (PIC-58).
  const slug = env[SUBAGENT_ROOT_ENV_MARKER];
  if (slug === undefined) {
    return { active: false };
  }
  return { active: true, slug };
}

// ---------------------------------------------------------------------------
// Driver selection (the mode-regress guard).
// ---------------------------------------------------------------------------

/**
 * The selected driver: drive the theta in-process against the process's own host
 * session (the regime's prompt-mode mechanics, no child spawn), or spawn a child
 * `pi` process for it (the normal subagent-mode path).
 */
export type SubagentDriverSelection =
  | { readonly kind: "in-process-root" }
  | { readonly kind: "spawn-child" };

/** The inputs the driver selection reads. */
export interface DriverSelectionInput {
  /** The theta's frontmatter `mode:` (`"prompt"` | `"subagent"`). */
  readonly mode: ThetaMode;
  /** Whether this theta is the ROOT theta of its own process. */
  readonly isProcessRoot: boolean;
  /** The detected regime (from `detectSubagentRootRegime`). */
  readonly regime: RootRegime;
}

/**
 * Select the driver for a `mode: subagent` invocation, applying the mode-regress
 * guard (PIC-58): under the active regime, a `mode: subagent` PROCESS-ROOT theta
 * is driven `in-process-root` (against the child process's own host session, no
 * further child spawn — the regime, not the mode, selects the driver); a NESTED
 * `mode: subagent` callee invoked by that theta selects `spawn-child` (the
 * no-recursion guarantee — the regime governs only the process root). Outside
 * the regime, a `mode: subagent` theta selects `spawn-child`.
 */
export function selectSubagentDriver(input: DriverSelectionInput): SubagentDriverSelection {
  // PIC-58 mode-regress guard: under the active regime, the `mode: subagent`
  // PROCESS-ROOT theta is driven in-process against the child process's own host
  // session (the regime, not the mode, selects the driver — a naive spawn would
  // be circular). A NESTED `mode: subagent` callee still spawns its own child:
  // the regime governs ONLY the process root (the no-recursion guarantee).
  if (input.regime.active && input.isProcessRoot) {
    return { kind: "in-process-root" };
  }
  return { kind: "spawn-child" };
}
