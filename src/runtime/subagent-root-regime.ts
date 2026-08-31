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
import type { InvokeInfraError } from "./query-error";

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
 * The env carrier for the marked root's winning source path (bug 0331), set
 * ONLY by the parent launcher beside the callable-hash map
 * (`SUBAGENT_CALLABLE_HASHES_ENV`) on the SAME authenticated control-plane
 * channel — it is control-plane data, not a marshalled artefact: it steers the
 * child's collision resolution rather than supplying a callee argument
 * (subagent.md #subagent-control-plane-authentication). Honoured only under
 * the regime marker above and the parent-pid authentication gate that
 * channel enforces.
 */
export const SUBAGENT_ROOT_WINNER_ENV = "PI_THETA_SUBAGENT_ROOT_WINNER";

/** The marked root's winning source path, as the parent resolved it. */
export interface MarkedRootWinner {
  readonly slug: string;
  readonly winnerPath: string;
}

/**
 * Detect the marked-root winner descriptor from the AUTHENTICATED env plus the
 * detected regime. `undefined` when the regime is inactive (nothing is marked)
 * or the carrier is absent/empty/whitespace-only — the trust-boundary guard: a
 * hostile or malformed carrier value falls back to today's collision
 * resolution rather than naming a winner the child cannot use.
 */
export function detectMarkedRootWinner(
  env: Readonly<Record<string, string | undefined>>,
  regime: RootRegime,
): MarkedRootWinner | undefined {
  if (!regime.active) {
    return undefined;
  }
  const raw = env[SUBAGENT_ROOT_WINNER_ENV];
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  return { slug: regime.slug, winnerPath: raw.trim() };
}

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

// ---------------------------------------------------------------------------
// Marked-root registration refusal → parent envelope (bug 0178 element (b)).
// ---------------------------------------------------------------------------

/**
 * One error-severity load diagnostic, narrowed to what a registration-refusal
 * message needs to name it: its registry code, its message, and the file it is
 * attributed to (absent for a location-less diagnostic).
 */
export interface LoadRefusalDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly file?: string;
}

/** Inputs to `markedRootRegistrationRefusal`. */
export interface MarkedRootRegistrationRefusalInput {
  /** The regime detected for this process (`detectSubagentRootRegime`). */
  readonly regime: RootRegime;
  /** Every slash name this pass's registration loop registered, after every drop this pass applies (incl. the callable-hash check). */
  readonly registeredSlugs: readonly string[];
  /**
   * The marked root theta's own discovered file path, when the active regime
   * names a theta the discovery walk actually found. `undefined` outside the
   * regime, or when the walk found no theta at that slug at all (nothing to
   * attribute a diagnostic to).
   */
  readonly calleePath: string | undefined;
  /** Every error-severity diagnostic this pass raised, in emission order. */
  readonly refusals: readonly LoadRefusalDiagnostic[];
}

/**
 * Whether THIS process's load pass refused to register the theta the parent
 * launched it to run — the marked root slug (PIC-58) — and, if so, the
 * `InvokeInfraError` the load pass owes the parent for it.
 *
 * A spawned child's argv IS its one instruction (`-p "/<slug>"`,
 * subagent.md#subagent-launch-contract): once the slug fails to register, that
 * argument is no longer a command, the host sends it to the model as ordinary
 * prompt text instead, and the theta runtime never runs — so nothing else in
 * the process ever gets to say what happened. The load pass is the only place
 * that still holds both facts at once (the regime's own slug, and every
 * diagnostic that un-registered a theta this pass), which is why it is the one
 * that must name the refusal before the process falls through to that silent
 * prompt path.
 *
 * Returns `undefined` outside the regime (there is no marked root to refuse)
 * and when the marked root DID register (nothing to report) — every other
 * exit from a registered root is `driveSubagentRootRegime`'s own PIC-59
 * envelope to write, not this pass's.
 */
export function markedRootRegistrationRefusal(
  input: MarkedRootRegistrationRefusalInput,
): InvokeInfraError | undefined {
  const { regime } = input;
  if (!regime.active || input.registeredSlugs.includes(regime.slug)) {
    return undefined;
  }
  // `calleePath` undefined means no diagnostic can be attributed to it — NOT a
  // match against a location-less diagnostic's own undefined `file` (the two
  // undefineds mean different things and must not be conflated).
  const refusal =
    input.calleePath === undefined
      ? undefined
      : input.refusals.find((candidate) => candidate.file === input.calleePath);
  const detail =
    refusal === undefined ? "no load diagnostic names it" : `${refusal.code}: ${refusal.message}`;
  return {
    kind: "invoke_infra",
    message: `subagent child refused to register its root theta '/${regime.slug}': ${detail}`,
    callee_path: input.calleePath ?? regime.slug,
    cause: "load_failure",
  };
}
