// Code-side extension-tool dispatch ladder (PIC-64) seam.
//
// Code-side `<name>(args)` calls resolve per the callable set against a host
// session that carries an agent loop — present in BOTH modes: the subagent-root
// child's own session, and the user's live host session in the parent (prompt
// mode). For an EXTENSION tool the only no-upstream execution rung is
// HOST-LOOP DISPATCH: the runtime registers a theta-controlled provider whose
// stream function authors the `tool_use` itself, carrying the code-supplied
// arguments verbatim; the backing session's host agent loop (which holds every
// registered tool's `execute`) runs the call and appends the tool result; the
// runtime reads the result back and returns it to code. This module owns:
//
//   - the probe-asserted, FAIL-CLOSED dispatch ladder (`resolveDispatchLadder`):
//     rung 1 = the upstream `pi.getToolDefinition` clean registry read (if ever
//     available); rung 2 = host-loop dispatch; no rung → the theta refuses to
//     register with `theta/load/extension-tool-unreachable` (the runtime never
//     silently falls through);
//   - the host-loop dispatch seam itself (`dispatchViaHostLoop`): provider
//     registration → encoded request turn → result read-back → model restore,
//     as injectable collaborators so the ordering is unit-testable via fakes
//     without a live host loop.
//
// Spec: pi-integration-contract/subagent.md (PIC-64, #subagent-host-loop-dispatch),
// diagnostics/code-registry-load.md (`theta/load/extension-tool-unreachable`),
// docs/bugs/0001-extension-tools-unreachable.md (origin / feasibility study).

import type { Diagnostic } from "../diagnostics/diagnostic";

// ---------------------------------------------------------------------------
// Fail-closed dispatch ladder.
// ---------------------------------------------------------------------------

/** `theta/load/extension-tool-unreachable` — no code-side dispatch rung is available (fail-closed). */
export const EXTENSION_TOOL_UNREACHABLE_CODE = "theta/load/extension-tool-unreachable";

/** The ladder rungs, preferred first: the upstream registry read, then host-loop dispatch. */
export type DispatchRung = "get-tool-definition" | "host-loop";

/**
 * The probe of which rungs are currently EXECUTABLE for a given host. The
 * contract is executability, not bare surface presence: the same probe gates
 * load-time registration (rung 3 refusal) and runtime rung routing, so a
 * recorded rung must have a dispatcher behind it — recording a rung that
 * cannot dispatch would let registration outrun dispatchability.
 */
export interface DispatchLadderProbe {
  /** Rung 1: the upstream `pi.getToolDefinition` registry read is exposed AND a rung-1 dispatcher is wired (the surface is requested upstream, so far refused; no dispatcher exists at the pin). */
  readonly getToolDefinitionAvailable: boolean;
  /** Rung 2: host-loop dispatch can be established (a host agent loop exists and the dispatch seam is wired). */
  readonly hostLoopAvailable: boolean;
}

/** The ladder resolution: a chosen rung, or the fail-closed refusal diagnostic. */
export type LadderResolution =
  | { readonly kind: "rung"; readonly rung: DispatchRung }
  | { readonly kind: "unreachable"; readonly diagnostic: Diagnostic };

/**
 * Registry Message-column renderer for the fail-closed refusal
 * (`theta/load/extension-tool-unreachable`).
 */
export function renderExtensionToolUnreachableMessage(toolName: string): string {
  return `extension tool '${toolName}' is unreachable from theta code: no code-side dispatch rung available`;
}

/**
 * Resolve the code-side extension-tool dispatch ladder for `toolName` (PIC-64):
 * prefer the upstream `getToolDefinition` rung when available, else host-loop
 * dispatch; when NEITHER rung is available, refuse fail-closed with
 * `theta/load/extension-tool-unreachable` (the theta does not register; the
 * runtime never silently falls through to a model-only path).
 */
export function resolveDispatchLadder(
  toolName: string,
  probe: DispatchLadderProbe,
): LadderResolution {
  // PIC-64 ladder, preferred first: the upstream `getToolDefinition` clean
  // registry read slots in as the top rung whenever it lands upstream, replacing
  // host-loop dispatch.
  if (probe.getToolDefinitionAvailable) {
    return { kind: "rung", rung: "get-tool-definition" };
  }
  if (probe.hostLoopAvailable) {
    return { kind: "rung", rung: "host-loop" };
  }
  // Fail-closed: neither rung is available, so a theta whose code calls this
  // extension tool refuses to register (the runtime never silently falls
  // through to a model-only path).
  return {
    kind: "unreachable",
    diagnostic: {
      severity: "error",
      code: EXTENSION_TOOL_UNREACHABLE_CODE,
      message: renderExtensionToolUnreachableMessage(toolName),
    },
  };
}

// ---------------------------------------------------------------------------
// Host-loop dispatch seam.
// ---------------------------------------------------------------------------

/** One content block of a host tool result (mirrors the theta-load-bearing envelope shape). */
export interface HostToolResultBlock {
  readonly type: string;
  readonly text?: string;
}

/** The result the host agent loop appends after running the authored `tool_use`. */
export interface HostToolResult {
  readonly content: readonly HostToolResultBlock[];
  readonly isError: boolean;
}

/** The encoded request the theta-controlled provider authors as a `tool_use` (verbatim, deterministic args). */
export interface EncodedToolRequest {
  readonly toolName: string;
  readonly args: unknown;
}

/** The injected collaborators of the host-loop dispatch (fake in tests; the live host `pi` at the composition root). */
export interface HostLoopDispatchDeps {
  /**
   * Register the theta-controlled provider whose stream function authors the
   * `tool_use` for `request`. Returns an unregister handle the dispatch calls
   * once the result is read back.
   */
  readonly registerProvider: (request: EncodedToolRequest) => () => void;
  /** Run the host agent-loop turn that executes the authored call and appends the tool result. */
  readonly runHostTurn: () => Promise<HostToolResult>;
  /**
   * Restore the session model (and any active-set snapshot) after the temporary
   * host-loop-dispatch model switch. Awaited in the dispatch `finally` because
   * the real restore is `await pi.setModel(original)` — a synchronous `() =>
   * void` fake still satisfies `void | Promise<void>`, so the leaf tests are
   * unchanged. Awaiting guarantees the bridge model is never left installed when
   * the dispatch resolves (incl. the throw / abort paths).
   */
  readonly restoreModel: () => void | Promise<void>;
}

/**
 * Dispatch one code-side extension-tool call through host-loop dispatch (PIC-64):
 * register the theta-controlled provider (authoring the `tool_use` with the
 * code-supplied arguments verbatim), run the host agent-loop turn, read the tool
 * result back, unregister the provider, and restore the session model. Zero
 * model tokens are spent and no executable definition is ever obtained by theta
 * code. Its transcript / model-switch costs land in whichever session backs the
 * dispatch — the child's private, discarded session (subagent mode) or the
 * user's live session (prompt mode, the stated accepted cost).
 */
export async function dispatchViaHostLoop(
  request: EncodedToolRequest,
  deps: HostLoopDispatchDeps,
): Promise<HostToolResult> {
  // PIC-64 host-loop dispatch: register the theta-controlled provider authoring
  // the `tool_use` with the code-supplied arguments verbatim, run the host
  // agent-loop turn that executes the call and appends the tool result, read the
  // result back, unregister the provider, and restore the session model. The
  // model-switch / fabricated-turn costs land in whichever session backs the
  // dispatch (per-mode, see the module header).
  const unregister = deps.registerProvider(request);
  try {
    return await deps.runHostTurn();
  } finally {
    // PIC-64 (e): the model / active-set restore runs on EVERY path — including
    // a throwing `unregister` (`pi.unregisterProvider` is a host call that can
    // fail) — because on the parent leg the backing session is the USER's live
    // session and the bridge model must never be left installed. Nested
    // `finally` with no `catch`: the unregister throw still propagates after
    // the restore; the production collaborators' deactivation flag already
    // defends the stream fn against a late invocation on this path.
    try {
      unregister();
    } finally {
      await deps.restoreModel();
    }
  }
}
