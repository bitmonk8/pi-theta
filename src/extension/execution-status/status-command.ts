// RFC 0010 (execution-status.md EXST-11) — the `/theta-status` command.
//
// The handler adjusts the LIVE instance's view shape only: session-scoped
// state a `/reload` or a fresh session resets to the default `tree`. It writes
// no settings file and no other durable store (EXST-11), and it never widens
// what `theta.progress` withholds — the verbosity ceiling gates first, inside
// the bus (EXST-10).
//
// Spec: docs/spec_topics/execution-status.md EXST-11.

import type { ExecutionStatusBus, ViewShape } from "./types";

/** The one non-theta-derived command name this extension registers (EXST-11). */
export const THETA_STATUS_COMMAND_NAME = "theta-status";

/** EXST-11 reserved command-name stem union. */
export const RESERVED_COMMAND_NAMES = Object.freeze([THETA_STATUS_COMMAND_NAME] as const);

/**
 * Exact-match (case-sensitive) `/theta-status` argument parse — `off | min |
 * tree` after trimming, else `undefined`. Real implementation (trivial,
 * dependency-free; not a stub).
 */
export function parseThetaStatusArg(args: string): ViewShape | undefined {
  const trimmed = args.trim();
  if (trimmed === "off" || trimmed === "min" || trimmed === "tree") {
    return trimmed;
  }
  return undefined;
}

/** The narrow `pi.registerCommand` surface the command touches. NOTE: this
 *  interface's own member/param NAMES deliberately avoid the bare `pi`/`ctx`
 *  identifiers (inventory-closure-audit.ts family-4 flags a parameter
 *  literally named `pi`/`ctx` whose type is not the canonical `ExtensionAPI`/
 *  `ExtensionContext`/`ExtensionCommandContext` carrier, non-exemptibly) even
 *  though the TYPE itself is a deliberately narrow test-double surface, not a
 *  carrier binding. */
export interface StatusCommandPi {
  registerCommand(
    name: string,
    options: {
      readonly description?: string;
      readonly handler: (args: string, commandCtx: StatusCommandCtx) => Promise<void>;
    },
  ): void;
}

/** The narrow `ExtensionCommandContext` surface the handler touches. */
export interface StatusCommandCtx {
  readonly ui?: {
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
}

export interface RegisterThetaStatusCommandDeps {
  /** The factory's `liveStatusBus` latch (EXST-2). */
  readonly current: () => ExecutionStatusBus | undefined;
}

/**
 * Register `/theta-status` (EXST-11). The handler never throws:
 * an invalid argument and an absent live instance each realize as one
 * best-effort `ctx.ui.notify(…, "warning")` with no state change and no
 * note-channel involvement (the pinned informational-note set on
 * runtime-event-channel.md is deliberately not widened).
 */
export function registerThetaStatusCommand(
  hostApi: StatusCommandPi,
  deps: RegisterThetaStatusCommandDeps,
): void {
  const warn = (commandCtx: StatusCommandCtx, message: string): void => {
    try {
      commandCtx.ui?.notify(message, "warning");
    } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      // Best-effort toast: a host without an attached UI (print mode) throws
      // here, and the command still completes normally.
    }
  };
  hostApi.registerCommand(THETA_STATUS_COMMAND_NAME, {
    description: "Adjust the live theta execution-status view (off|min|tree).",
    handler: async (args: string, commandCtx: StatusCommandCtx): Promise<void> => {
      const view = parseThetaStatusArg(args);
      if (view === undefined) {
        warn(commandCtx, "theta-status: expected one of off|min|tree");
        return;
      }
      const bus = deps.current();
      if (bus === undefined) {
        warn(commandCtx, "theta-status: no live theta instance");
        return;
      }
      bus.setViewShape(view);
    },
  });
}
