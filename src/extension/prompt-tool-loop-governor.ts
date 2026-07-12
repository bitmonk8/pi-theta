// Phase 4 STAGE B — bound pi's NATIVE prompt-mode agentic tool loop to the
// loom's `tool_loop.max_rounds` (ceiling #2 / CIO-4) WITHOUT reimplementing
// streaming.
//
// In prompt mode every `@`-query streams via pi's own agentic turn
// (`LivePromptQueryModel` → `pi.sendUserMessage` + `ctx.waitForIdle`, SLSH-2 /
// Phase 3a). pi runs its internal tool loop for that turn, which the loom's
// `max_rounds` did not bound (QTL-4: prompt-mode tools now install, but the loop
// was unbounded). This governor bounds that native loop through pi's extension
// hooks:
//
//   - `before_provider_request` — fires once per model round (provider request);
//     used to detect round boundaries.
//   - `tool_call` — fires before each tool executes; its `ToolCallEventResult`
//     can `block` a call with a `reason`.
//
// A ROUND = one model turn issuing >= 1 tool call (a single round can issue
// several parallel tool calls). The governor counts ROUNDS, not individual
// calls: the first `tool_call` after a provider request opens a new round;
// sibling calls in the same round share that round's allow/block decision.
//
// `pi.on(...)` returns `void` (no per-registration unregister), so the handlers
// are registered ONCE and guarded by an "active" state the query driver sets via
// `begin(maxRounds)` immediately before the driven turn and clears via `end()`
// right after the turn settles. Between drives the governor is inert (it never
// affects unrelated user turns or other queries). Prompt→prompt invokes and the
// body run strictly sequentially, so at most one drive is active at a time.
//
// Spec: hard-ceilings.md (ceiling #2, CIO-4), frontmatter.md (`tool_loop`
// FRNT-1), errors-and-results.md (ToolLoopExhaustedError ERR-19),
// discovery-cli.md (SNK-h). Findings: QTL-4, STL-2 (Stage A sibling).

import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

/** The reason string blocked tool calls carry once the round cap is reached. */
export const TOOL_LOOP_EXHAUSTED_REASON = "tool_loop_exhausted";

/**
 * The outcome of one bounded drive, read by the query driver after the turn
 * settles. On exhaustion the driver surfaces
 * `Err(QueryError { kind: "tool_loop_exhausted", rounds, last_tool_name })`.
 */
export interface PromptToolLoopExhaustion {
  /** True once the model attempted a tool-use round beyond `max_rounds`. */
  readonly exhausted: boolean;
  /** `== max_rounds` on exhaustion (ceiling #2 / ERR-19 `rounds`). */
  readonly rounds: number;
  /** The last tool the model tried in the blocked round (ERR-19 `last_tool_name`). */
  readonly lastToolName: string | null;
}

/** The per-drive mutable bound state (transient; null between drives). */
interface ActiveBound {
  readonly maxRounds: number;
  /** Number of tool-use rounds the governor has ALLOWED to open. */
  roundsAllowed: number;
  /** A fresh provider request occurred; the next `tool_call` opens a new round. */
  roundBoundary: boolean;
  /** The current round exceeded the cap and its calls are being blocked. */
  currentRoundBlocked: boolean;
  /** True once any round was blocked (the query is exhausted). */
  exhausted: boolean;
  /** The last tool name blocked (surfaced as ERR-19 `last_tool_name`). */
  lastToolName: string | null;
}

/**
 * Bounds pi's native prompt-mode agentic tool loop to `tool_loop.max_rounds`.
 * Registered once against the host `pi`; guarded by a per-drive `active` state.
 */
export class PromptToolLoopGovernor {
  #active: ActiveBound | null = null;
  #registered = false;

  /**
   * Register the `before_provider_request` / `tool_call` hooks on `pi` exactly
   * once. Idempotent — later drives reuse the same registration (there is no
   * per-registration unregister, so the handlers are guarded by `#active`).
   */
  ensureRegistered(pi: ExtensionAPI): void {
    if (this.#registered) {
      return;
    }
    this.#registered = true;
    pi.on("before_provider_request", () => {
      this.#onProviderRequest();
    });
    pi.on("tool_call", (event: ToolCallEvent) => this.#onToolCall(event));
  }

  /**
   * Arm the bound for one driven turn. Called immediately before
   * `sendUserMessage`. `roundBoundary` starts `true` so the round the model
   * opens on its first provider response is counted even if the initial
   * `before_provider_request` is observed out of order.
   */
  begin(maxRounds: number): void {
    this.#active = {
      maxRounds,
      roundsAllowed: 0,
      roundBoundary: true,
      currentRoundBlocked: false,
      exhausted: false,
      lastToolName: null,
    };
  }

  /**
   * Disarm the bound after the turn settles and return its exhaustion snapshot.
   * The governor is inert until the next `begin(...)`.
   */
  end(): PromptToolLoopExhaustion {
    const active = this.#active;
    this.#active = null;
    if (active === null) {
      return { exhausted: false, rounds: 0, lastToolName: null };
    }
    return {
      exhausted: active.exhausted,
      // ERR-19: `rounds == max_rounds` on exhaustion.
      rounds: active.maxRounds,
      lastToolName: active.lastToolName,
    };
  }

  /** True while a drive is armed (test/inspection aid). */
  get isActive(): boolean {
    return this.#active !== null;
  }

  #onProviderRequest(): void {
    if (this.#active === null) {
      return;
    }
    // A fresh model round is about to be requested: the next `tool_call` opens a
    // new tool-use round.
    this.#active.roundBoundary = true;
  }

  #onToolCall(event: ToolCallEvent): ToolCallEventResult | undefined {
    const active = this.#active;
    if (active === null) {
      // Not driving a bounded loom turn — never touch unrelated tool calls.
      return undefined;
    }
    if (active.roundBoundary) {
      // First tool call of a new round: decide allow vs block for the whole
      // round (parallel siblings inherit this decision).
      active.roundBoundary = false;
      if (active.roundsAllowed >= active.maxRounds) {
        // CIO-4 `max_rounds`-final branch: `max_rounds` rounds have already run;
        // the model is attempting a further tool-use round.
        active.exhausted = true;
        active.currentRoundBlocked = true;
      } else {
        active.roundsAllowed += 1;
        active.currentRoundBlocked = false;
      }
    }
    if (active.currentRoundBlocked) {
      active.lastToolName = event.toolName;
      return { block: true, reason: TOOL_LOOP_EXHAUSTED_REASON };
    }
    return undefined;
  }
}
