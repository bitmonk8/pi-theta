// RFC-0006 — code-side extension-tool dispatch ladder (PIC-61) seam.
//
// Within the child the callee runs under the subagent-root regime — a real host
// session with an agent loop — so code-side `<name>(args)` calls resolve per the
// callable set. For an EXTENSION tool the only no-upstream execution rung is
// HOST-LOOP DISPATCH: the runtime registers a theta-controlled provider whose
// stream function authors the `tool_use` itself, carrying the code-supplied
// arguments verbatim; the child's host agent loop (which holds every registered
// tool's `execute`) runs the call and appends the tool result; the runtime reads
// the result back and returns it to code. This module owns:
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
// Spec: pi-integration-contract/subagent.md (PIC-61, #subagent-host-loop-dispatch),
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

/** The probe of which rungs are currently establishable for a given host. */
export interface DispatchLadderProbe {
  /** Rung 1: the upstream `pi.getToolDefinition` registry read is exposed (requested upstream, so far refused). */
  readonly getToolDefinitionAvailable: boolean;
  /** Rung 2: host-loop dispatch can be established (a host agent loop exists). */
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
 * Resolve the code-side extension-tool dispatch ladder for `toolName` (PIC-61):
 * prefer the upstream `getToolDefinition` rung when available, else host-loop
 * dispatch; when NEITHER rung is available, refuse fail-closed with
 * `theta/load/extension-tool-unreachable` (the theta does not register; the
 * runtime never silently falls through to a model-only path).
 */
export function resolveDispatchLadder(
  toolName: string,
  probe: DispatchLadderProbe,
): LadderResolution {
  // PIC-61 ladder, preferred first: the upstream `getToolDefinition` clean
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
 * Dispatch one code-side extension-tool call through host-loop dispatch (PIC-61):
 * register the theta-controlled provider (authoring the `tool_use` with the
 * code-supplied arguments verbatim), run the host agent-loop turn, read the tool
 * result back, unregister the provider, and restore the session model. Zero
 * model tokens are spent and no executable definition is ever obtained by theta
 * code. Its transcript / model-switch costs are confined to the child's private,
 * discarded session.
 */
export async function dispatchViaHostLoop(
  request: EncodedToolRequest,
  deps: HostLoopDispatchDeps,
): Promise<HostToolResult> {
  // PIC-61 host-loop dispatch: register the theta-controlled provider authoring
  // the `tool_use` with the code-supplied arguments verbatim, run the host
  // agent-loop turn that executes the call and appends the tool result, read the
  // result back, unregister the provider, and restore the session model. The
  // model-switch / fabricated-turn costs are confined to the child's private,
  // discarded session.
  const unregister = deps.registerProvider(request);
  try {
    return await deps.runHostTurn();
  } finally {
    unregister();
    await deps.restoreModel();
  }
}
