// RFC-0006 (PIC-61 rung 2) — production host-loop dispatch collaborators.
//
// This module wires the three injectable collaborators of the leaf-tested
// host-loop dispatch seam (`src/runtime/host-loop-dispatch.ts`
// `dispatchViaHostLoop`) against the REAL Pi extension surface, following the
// PASSED `.prototype-hld` blueprint (Pi v0.80.10). Inside the spawned subagent
// child a code-side `<name>(args)` call to an EXTENSION tool has no parent-side
// `execute`; the only no-upstream execution rung is host-loop dispatch:
//
//   1. `registerProvider(request)` — register a theta-controlled provider whose
//      two-state `streamSimple` AUTHORS the `tool_use` itself (code-supplied
//      arguments verbatim, zero model tokens). Returns the unregister handle
//      (`pi.unregisterProvider`, exposed by v0.80.10) plus a deactivation flag
//      the stream fn respects even before unregistration lands.
//   2. `runHostTurn()` — snapshot the active set (PIC-17), install `[toolName]`,
//      switch the session model to the bridge, ARM the `agent_settled` barrier
//      BEFORE `sendUserMessage` (the prototype's key deviation from Bug 0001:
//      `waitForIdle()` alone returns before the fabricated turn even starts),
//      send the encoded request, await settle, then read the appended toolResult
//      back from the session transcript.
//   3. `restoreModel()` — restore the session model and the active set, ALWAYS
//      (the seam's `finally`), so a thetaAbort mid-turn never leaves the bridge
//      model installed.
//
// Costs (a fabricated turn + a temporary model switch) are confined to the
// child's private, discarded `--no-session` session, per PIC-61.
//
// SURFACE NAMING (inventory-closure audit). The Pi surfaces are consumed through
// NARROW structural interfaces on a `host` carrier — never a `pi: ExtensionAPI`
// / `ctx: ExtensionContext` carrier — so this module contributes no category-(1)
// / category-(3) member-access rows to the inventory-closure audit; only the
// category-(2) pi-ai named imports below are inventoried.
//
// Spec: pi-integration-contract/subagent.md (PIC-61 #subagent-host-loop-dispatch),
// docs/rfcs/0006-child-process-theta-execution.md §"Code-side extension-tool
// dispatch (inside the child)", docs/bugs/0001-extension-tools-unreachable.md.

import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type ToolCall,
} from "@earendil-works/pi-ai";
import type { Clock } from "../seams/clock";
import {
  dispatchViaHostLoop,
  type EncodedToolRequest,
  type HostLoopDispatchDeps,
  type HostToolResult,
  type HostToolResultBlock,
} from "../runtime/host-loop-dispatch";

/** The bridge provider name stem; a per-dispatch nonce suffix keeps concurrent dispatches independent. */
const BRIDGE_PROVIDER_STEM = "theta-host-loop-bridge";

/** The single bridge model id registered under the per-dispatch provider. */
const BRIDGE_MODEL_ID = "host-loop-bridge";

/** The reserved marker prefixing the encoded request in the fabricated user turn. */
const REQUEST_MARKER = "THETA-HOST-LOOP-REQUEST:";

/** Poll cadence (ms) while confirming the settled turn is idle. */
const IDLE_POLL_INTERVAL_MS = 5;

/** Bound on post-settle idle-confirmation polls (the barrier is `agent_settled`; this is a belt-and-braces floor). */
const IDLE_POLL_BOUND = 200;

/** The minimal `AssistantMessageEventStream` handle (return of the factory). */
type EventStream = ReturnType<typeof createAssistantMessageEventStream>;

/** The `streamSimple` shape `ProviderConfig` expects (kept structural to avoid a `ProviderConfig` carrier). */
type BridgeStreamFn = (
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
) => EventStream;

/**
 * The narrow bridge model-config the theta-controlled provider registers.
 * Fields are mutable-typed (not `readonly`) so the config stays assignable to
 * Pi's `ProviderConfig` / `ProviderModelConfig` (mutable arrays), keeping
 * `ExtensionAPI` assignable to `HostLoopPi`.
 */
interface BridgeModelConfig {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

/** The narrow `pi.registerProvider` config the theta-controlled provider passes. */
interface BridgeProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  api: Api;
  streamSimple: BridgeStreamFn;
  models: BridgeModelConfig[];
}

/**
 * The narrow Pi extension-API surface host-loop dispatch consumes — a
 * structural subset of `ExtensionAPI`, so the audit sees no `pi.<member>`
 * carrier here (SURFACE NAMING above). `unregisterProvider` is v0.80.10's
 * documented provider teardown (verified present in `dist`).
 */
export interface HostLoopPi {
  registerProvider(name: string, config: BridgeProviderConfig): void;
  unregisterProvider(name: string): void;
  setActiveTools(names: string[]): void;
  getActiveTools(): string[];
  setModel(model: Model<Api>): Promise<boolean>;
  sendUserMessage(content: string): void;
  on(event: "agent_settled", handler: () => void): void;
}

/** A minimal read-back view of one session transcript entry. */
interface HostLoopSessionEntry {
  readonly type: string;
  readonly message?: {
    readonly role?: string;
    readonly toolName?: string;
    readonly content?: unknown;
    readonly isError?: boolean;
  };
}

/**
 * The narrow canonical-context surface host-loop dispatch reads — a structural
 * subset of `ExtensionContext` (SURFACE NAMING above). `model` is the session's
 * current model (the snapshot/restore target); `modelRegistry.find` resolves the
 * bridge; `sessionManager.getEntries` backs the tool-result read-back; `isIdle`
 * confirms the settled turn.
 */
export interface HostLoopCtx {
  readonly model: Model<Api> | undefined;
  readonly modelRegistry: {
    find(provider: string, modelId: string): Model<Api> | undefined;
  };
  readonly sessionManager: {
    getEntries(): readonly HostLoopSessionEntry[];
  };
  isIdle(): boolean;
}

/** The host carrier host-loop dispatch is wired against at the child composition root. */
export interface HostLoopDispatchHost {
  readonly pi: HostLoopPi;
  readonly ctx: HostLoopCtx;
  /** The injected `Clock` seam the post-settle idle-confirmation poll runs on. */
  readonly clock: Clock;
}

/**
 * Probe (per the repo's `typeof` capability-probe convention) whether every Pi
 * surface host-loop dispatch needs is present on `host`. The child composition
 * root gates `hostLoopAvailable` on this AND the subagent-root regime — a parent
 * / prompt context keeps the rung unavailable. Returns `false` on the first
 * missing surface (fail-closed).
 */
export function probeHostLoopSurfaces(host: {
  readonly pi: unknown;
  readonly ctx: unknown;
}): boolean {
  const pi = host.pi as Record<string, unknown> | null | undefined;
  const ctx = host.ctx as Record<string, unknown> | null | undefined;
  if (pi === null || pi === undefined || ctx === null || ctx === undefined) {
    return false;
  }
  const piFns = [
    "registerProvider",
    "unregisterProvider",
    "setActiveTools",
    "getActiveTools",
    "setModel",
    "sendUserMessage",
    "on",
  ];
  for (const name of piFns) {
    if (typeof pi[name] !== "function") {
      return false;
    }
  }
  if (typeof ctx["isIdle"] !== "function") {
    return false;
  }
  const modelRegistry = ctx["modelRegistry"] as Record<string, unknown> | null | undefined;
  if (
    modelRegistry === null ||
    modelRegistry === undefined ||
    typeof modelRegistry["find"] !== "function"
  ) {
    return false;
  }
  const sessionManager = ctx["sessionManager"] as Record<string, unknown> | null | undefined;
  if (
    sessionManager === null ||
    sessionManager === undefined ||
    typeof sessionManager["getEntries"] !== "function"
  ) {
    return false;
  }
  return true;
}

/** The decoded encoded-request payload the bridge stream authors as a `tool_use`. */
interface DecodedRequest {
  readonly tool: string;
  readonly args: unknown;
}

/** Extract the plain text of a message-content value (string or block array). */
function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block !== null &&
        typeof block === "object" &&
        (block as { type?: string }).type === "text"
          ? String((block as { text?: string }).text ?? "")
          : "",
      )
      .join("");
  }
  return "";
}

/** Find the newest user message carrying `marker` and decode its payload. */
function findEncodedRequest(context: Context, marker: string): DecodedRequest | undefined {
  for (let i = context.messages.length - 1; i >= 0; i--) {
    const message = context.messages[i];
    if (message === undefined || message.role !== "user") {
      continue;
    }
    const text = messageText(message.content);
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      // A malformed payload is treated as "no request" (the turn ends `stop`);
      // the caller then reads back no tool result and surfaces an isError.
      try {
        return JSON.parse(text.slice(idx + marker.length)) as DecodedRequest;
      } catch (parseError: unknown) { // allow-broad-catch: PIC#pic-61 — malformed encoded-request payload ends the fabricated turn cleanly
        void parseError;
        return undefined;
      }
    }
  }
  return undefined;
}

/** Build a fresh zero-usage assistant output message for the bridge stream. */
function newAssistantOutput(model: Model<Api>, timestamp: number): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp,
  };
}

/** Map a session toolResult message's content blocks to the seam's `HostToolResultBlock[]`. */
function mapResultBlocks(content: unknown): HostToolResultBlock[] {
  if (!Array.isArray(content)) {
    const text = messageText(content);
    return [{ type: "text", text }];
  }
  return content.map((block): HostToolResultBlock => {
    if (
      block !== null &&
      typeof block === "object" &&
      (block as { type?: string }).type === "text"
    ) {
      return { type: "text", text: String((block as { text?: string }).text ?? "") };
    }
    const type =
      block !== null && typeof block === "object"
        ? String((block as { type?: string }).type ?? "unknown")
        : "unknown";
    return { type };
  });
}

/**
 * The failure `HostToolResult` returned when the fabricated turn appended no
 * matching toolResult (the tool never executed — a killed/aborted turn, or the
 * host loop declined the authored call). Fail-closed: an isError result, never a
 * fabricated success value.
 */
function noResult(toolName: string): HostToolResult {
  return {
    content: [
      {
        type: "text",
        text: `host-loop dispatch produced no tool result for '${toolName}'`,
      },
    ],
    isError: true,
  };
}

/**
 * Create the production host-loop dispatch function wired against the live child
 * host. The returned function is the producer's `hostLoopDispatch` seam:
 * `(request, signal) => Promise<HostToolResult>`. It:
 *
 *   - registers the `agent_settled` handler ONCE (Pi's `pi.on` exposes no
 *     unsubscribe, so a per-dispatch listener would leak; a single handler plus
 *     a `pendingSettle` resolver is the leak-free pattern the prototype proved);
 *   - SERIALISES dispatches on a promise chain — the session model switch is a
 *     shared session resource, so two concurrent code-side extension-tool calls
 *     (e.g. under `par for`) must not race the switch/restore or the single
 *     `pendingSettle` slot;
 *   - builds fresh `registerProvider` / `runHostTurn` / `restoreModel`
 *     collaborators per call and drives them through `dispatchViaHostLoop`.
 *
 * No module-level mutable state: the `pendingSettle` slot, the serialisation
 * tail, and the nonce counter live in this per-composition closure.
 */
export function createProductionHostLoopDispatch(
  host: HostLoopDispatchHost,
): (request: EncodedToolRequest, signal: AbortSignal) => Promise<HostToolResult> {
  // The single `agent_settled` barrier resolver. Armed before each
  // `sendUserMessage`; resolved by the once-registered handler below. Dispatches
  // are serialised, so at most one is pending at a time.
  let pendingSettle: (() => void) | undefined;
  // Registered ONCE and never removed: Pi's `pi.on` exposes no unsubscribe, so
  // single-registration safety relies on the child being a one-shot `--no-session`
  // process (this composition runs exactly once per process).
  host.pi.on("agent_settled", () => {
    const resolve = pendingSettle;
    pendingSettle = undefined;
    resolve?.();
  });

  // Serialisation tail (the session model switch is a shared resource) and the
  // per-composition nonce counter (avoids `Date.now` / `Math.random`; the clock
  // supplies wall time, the counter supplies within-tick uniqueness).
  let tail: Promise<unknown> = Promise.resolve();
  let nonceCounter = 0;

  const runOne = async (
    request: EncodedToolRequest,
    signal: AbortSignal,
  ): Promise<HostToolResult> => {
    nonceCounter += 1;
    const nonce = `${host.clock.wallNow()}-${nonceCounter}`;
    const providerName = `${BRIDGE_PROVIDER_STEM}-${nonce}`;
    const marker = `${REQUEST_MARKER}${nonce}:`;
    // Snapshot the model + active set BEFORE any switch, so `restoreModel`
    // returns the session to its exact pre-dispatch state on every path.
    const originalModel = host.ctx.model;
    let ambientTools: string[] | undefined;
    let active = true;

    const deps: HostLoopDispatchDeps = {
      registerProvider: (): (() => void) => {
        const streamSimple: BridgeStreamFn = (streamModel, context) => {
          const stream = createAssistantMessageEventStream();
          void (async (): Promise<void> => {
            const output = newAssistantOutput(streamModel, host.clock.wallNow());
            stream.push({ type: "start", partial: output });
            const last = context.messages[context.messages.length - 1];
            const lastIsToolResult = last !== undefined && last.role === "toolResult";
            // State A: our encoded request is the freshest user turn AND we are
            // still active → AUTHOR the `tool_use` verbatim. Keying on OUR nonce
            // marker (and the deactivation flag) tolerates unrelated turns and a
            // late invocation after unregistration.
            if (active && !lastIsToolResult) {
              const decoded = findEncodedRequest(context, marker);
              if (decoded !== undefined) {
                const toolCall: ToolCall = {
                  type: "toolCall",
                  id: `host-loop-${nonce}`,
                  name: decoded.tool,
                  arguments: decoded.args as ToolCall["arguments"],
                };
                output.content.push(toolCall);
                stream.push({ type: "toolcall_start", contentIndex: 0, partial: output });
                stream.push({
                  type: "toolcall_end",
                  contentIndex: 0,
                  toolCall,
                  partial: output,
                });
                output.stopReason = "toolUse";
                stream.push({ type: "done", reason: "toolUse", message: output });
                stream.end();
                return;
              }
            }
            // State B (tool result seen), or an unrelated / deactivated turn →
            // end the turn cleanly with an empty `stop`.
            output.stopReason = "stop";
            stream.push({ type: "done", reason: "stop", message: output });
            stream.end();
          })();
          return stream;
        };

        host.pi.registerProvider(providerName, {
          name: "Theta Host-Loop Bridge",
          // `baseUrl` is required by `ProviderConfig` when `models[]` is supplied
          // even though `streamSimple` overrides all network I/O — a dummy.
          baseUrl: "http://127.0.0.1:9/theta-host-loop-never-used",
          // A dummy literal apiKey ⇒ `hasConfiguredAuth() === true`, so the
          // bridge model is selectable with no network call (prototype-verified).
          apiKey: "x",
          api: "openai-completions",
          streamSimple,
          models: [
            {
              id: BRIDGE_MODEL_ID,
              name: "Theta Host-Loop Bridge",
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 200000,
              maxTokens: 4096,
            },
          ],
        });
        return (): void => {
          // Deactivate first (defence-in-depth: a late `streamSimple` invocation
          // after this point ends the turn cleanly) THEN unregister the provider.
          active = false;
          host.pi.unregisterProvider(providerName);
        };
      },

      runHostTurn: async (): Promise<HostToolResult> => {
        const bridge = host.ctx.modelRegistry.find(providerName, BRIDGE_MODEL_ID);
        if (bridge === undefined) {
          return noResult(request.toolName);
        }
        // PIC-17 active-set protocol (QTL-4): the authored `tool_use` executes in
        // the host loop only if `toolName` is in the active set. Snapshot the
        // ambient set, install exactly `[toolName]`, and switch to the bridge.
        ambientTools = host.pi.getActiveTools();
        host.pi.setActiveTools([request.toolName]);
        await host.pi.setModel(bridge);

        // Record where the transcript stands so read-back only scans entries the
        // fabricated turn appends (never a stale prior toolResult).
        const entriesBefore = host.ctx.sessionManager.getEntries().length;

        // ARM `agent_settled` BEFORE `sendUserMessage` (prototype CONSTRAINT 1):
        // in `-p`/print mode the turn does not start synchronously, so
        // `waitForIdle()` alone would return before the tool ever runs. Also
        // resolve early on abort so `restoreModel` runs promptly and the bridge
        // model is never left installed.
        await awaitSettledTurn(host, signal, (): void => {
          host.pi.sendUserMessage(
            marker + JSON.stringify({ tool: request.toolName, args: request.args }),
          );
        });

        // Read the appended toolResult back from the (discarded) transcript.
        const entries = host.ctx.sessionManager.getEntries();
        for (let i = entries.length - 1; i >= entriesBefore; i--) {
          const entry = entries[i];
          if (entry === undefined || entry.type !== "message") {
            continue;
          }
          const message = entry.message;
          if (
            message !== undefined &&
            message.role === "toolResult" &&
            message.toolName === request.toolName
          ) {
            return {
              content: mapResultBlocks(message.content),
              isError: message.isError ?? false,
            };
          }
        }
        return noResult(request.toolName);
      },

      restoreModel: async (): Promise<void> => {
        // ALWAYS restore (the seam's `finally`), so a thetaAbort mid-turn never
        // leaves the bridge model or the fabricated active set installed.
        if (ambientTools !== undefined) {
          host.pi.setActiveTools(ambientTools);
        }
        if (originalModel !== undefined) {
          await host.pi.setModel(originalModel);
        }
      },
    };

    return dispatchViaHostLoop(request, deps);
  };

  // The `agent_settled` arming barrier, closing over the shared `pendingSettle`
  // slot. Declared as a bound helper (not a closure per call) so the serialised
  // dispatches share one slot. `send` is invoked AFTER the barrier is armed.
  function awaitSettledTurn(
    dispatchHost: HostLoopDispatchHost,
    signal: AbortSignal,
    send: () => void,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) {
          return;
        }
        done = true;
        if (pendingSettle === settle) {
          pendingSettle = undefined;
        }
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const settle = (): void => finish();
      const onAbort = (): void => finish();
      if (signal.aborted) {
        // Already aborted before we start — do not fabricate a turn.
        resolve();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      pendingSettle = settle;
      send();
    }).then(() => confirmIdle(dispatchHost, signal));
  }

  return (request: EncodedToolRequest, signal: AbortSignal): Promise<HostToolResult> => {
    // Chain onto the tail so dispatches serialise (shared session model switch +
    // single settle slot). A prior failure does not poison the chain.
    const run = tail.then(
      () => runOne(request, signal),
      () => runOne(request, signal),
    );
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/**
 * Belt-and-braces post-settle idle confirmation: `agent_settled` already means
 * the run fully settled, so this normally returns on the first check. Bounded on
 * the injected `Clock` (never a bare timer), and short-circuits on abort.
 */
async function confirmIdle(host: HostLoopDispatchHost, signal: AbortSignal): Promise<void> {
  for (let i = 0; i < IDLE_POLL_BOUND && !host.ctx.isIdle() && !signal.aborted; i += 1) {
    await new Promise<void>((resolve) => {
      host.clock.setTimeout(() => resolve(), IDLE_POLL_INTERVAL_MS);
    });
  }
}
