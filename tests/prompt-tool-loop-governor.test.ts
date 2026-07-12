// STAGE B unit coverage — PromptToolLoopGovernor round-counting & block logic
// (ceiling #2 / CIO-4). Drives a fake `before_provider_request` / `tool_call`
// event sequence through the governor and asserts:
//   - N tool-use rounds under the cap => no block, not exhausted;
//   - a round beyond the cap => block(reason) + exhausted with rounds == cap and
//     last_tool_name = the last blocked tool;
//   - parallel calls in one round count as ONE round;
//   - the governor is inert between drives (never blocks unrelated turns).
//
// Spec: hard-ceilings.md (ceiling #2, CIO-4), frontmatter.md (FRNT-1),
// errors-and-results.md (ERR-19). Findings: QTL-4.

import { describe, it, expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
  ToolCallEvent as TCE,
} from "@earendil-works/pi-coding-agent";
import {
  PromptToolLoopGovernor,
  TOOL_LOOP_EXHAUSTED_REASON,
} from "../src/extension/prompt-tool-loop-governor";

/**
 * A minimal fake `pi` surface that records the `before_provider_request` and
 * `tool_call` handlers the governor registers, so a test can replay a scripted
 * event sequence. Only `on(...)` is exercised.
 */
class FakePi {
  #bpr: (() => void) | undefined;
  #toolCall: ((event: ToolCallEvent) => ToolCallEventResult | undefined) | undefined;
  registrations = 0;

  readonly api: ExtensionAPI;

  constructor() {
    // Only `on` is used; the rest is an unused stub cast to the interface.
    const on = (event: string, handler: ExtensionHandler<unknown, unknown>): void => {
      this.registrations += 1;
      if (event === "before_provider_request") {
        this.#bpr = () => {
          void handler(undefined as never, undefined as never);
        };
      } else if (event === "tool_call") {
        this.#toolCall = (e: ToolCallEvent) =>
          handler(e as never, undefined as never) as
            | ToolCallEventResult
            | undefined;
      }
    };
    this.api = { on } as unknown as ExtensionAPI;
  }

  /** Replay one provider request (a fresh model round boundary). */
  providerRequest(): void {
    this.#bpr?.();
  }

  /** Replay one `tool_call` and return the governor's block decision. */
  toolCall(toolName: string): ToolCallEventResult | undefined {
    const event = {
      type: "tool_call",
      toolCallId: `tc-${toolName}-${Math.random()}`,
      toolName,
      input: {},
    } as unknown as TCE;
    return this.#toolCall?.(event);
  }
}

/** Drive one bounded round: a provider request followed by its parallel batch. */
function round(
  pi: FakePi,
  toolNames: readonly string[],
): readonly (ToolCallEventResult | undefined)[] {
  pi.providerRequest();
  return toolNames.map((n) => pi.toolCall(n));
}

describe("PromptToolLoopGovernor — round-counting & block logic (ceiling #2)", () => {
  it("registers both hooks exactly once (idempotent ensureRegistered)", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.ensureRegistered(pi.api);
    gov.ensureRegistered(pi.api);
    expect(pi.registrations).toBe(2); // before_provider_request + tool_call, once each
  });

  it("N rounds under the cap => no block, not exhausted", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.begin(3);
    const r1 = round(pi, ["read"]);
    const r2 = round(pi, ["read"]);
    const r3 = round(pi, ["read"]);
    // All three rounds allowed (cap 3, three tool-use rounds).
    for (const r of [r1, r2, r3]) {
      for (const decision of r) expect(decision).toBeUndefined();
    }
    const ex = gov.end();
    expect(ex.exhausted).toBe(false);
    expect(ex.lastToolName).toBeNull();
  });

  it("a round beyond the cap => block(reason) + exhausted, rounds==cap, last_tool_name recorded", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.begin(1);
    // Round 1 (allowed): the model reads ch1.
    const r1 = round(pi, ["read"]);
    expect(r1[0]).toBeUndefined();
    // Round 2 (beyond cap of 1): blocked.
    const r2 = round(pi, ["grep"]);
    expect(r2[0]).toEqual({ block: true, reason: TOOL_LOOP_EXHAUSTED_REASON });
    const ex = gov.end();
    expect(ex.exhausted).toBe(true);
    expect(ex.rounds).toBe(1); // == max_rounds (ERR-19)
    expect(ex.lastToolName).toBe("grep");
  });

  it("parallel calls in ONE round count as one round (not one per call)", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.begin(2);
    // Round 1: three parallel calls — all allowed, counts as ONE round.
    const r1 = round(pi, ["read", "read", "grep"]);
    for (const d of r1) expect(d).toBeUndefined();
    // Round 2: two parallel calls — still within cap 2, allowed.
    const r2 = round(pi, ["read", "read"]);
    for (const d of r2) expect(d).toBeUndefined();
    // Round 3: beyond cap 2 — the whole round (both parallel calls) blocked.
    const r3 = round(pi, ["read", "bash"]);
    expect(r3[0]).toEqual({ block: true, reason: TOOL_LOOP_EXHAUSTED_REASON });
    expect(r3[1]).toEqual({ block: true, reason: TOOL_LOOP_EXHAUSTED_REASON });
    const ex = gov.end();
    expect(ex.exhausted).toBe(true);
    expect(ex.rounds).toBe(2);
    expect(ex.lastToolName).toBe("bash"); // last blocked tool in the blocked round
  });

  it("max_rounds:1 vs a >=3 round chain — exhausts after round 1 (STL-2/QTL-4 shape)", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.begin(1);
    expect(round(pi, ["read"])[0]).toBeUndefined(); // ch1
    expect(round(pi, ["read"])[0]).toEqual({
      block: true,
      reason: TOOL_LOOP_EXHAUSTED_REASON,
    }); // ch2 attempt blocked
    // Further retries stay blocked and do not increment the allowed count.
    expect(round(pi, ["read"])[0]).toEqual({
      block: true,
      reason: TOOL_LOOP_EXHAUSTED_REASON,
    });
    const ex = gov.end();
    expect(ex.exhausted).toBe(true);
    expect(ex.rounds).toBe(1);
    expect(ex.lastToolName).toBe("read");
  });

  it("is inert between drives — never blocks when no drive is armed", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    // No begin(): unrelated user turn's tool calls pass through untouched.
    expect(gov.isActive).toBe(false);
    expect(round(pi, ["bash"])[0]).toBeUndefined();
    expect(round(pi, ["read"])[0]).toBeUndefined();
    // A drive armed then ended leaves the governor inert again.
    gov.begin(1);
    round(pi, ["read"]);
    round(pi, ["read"]); // exhausts
    const ex = gov.end();
    expect(ex.exhausted).toBe(true);
    expect(gov.isActive).toBe(false);
    // Post-drive: unrelated calls pass through.
    expect(round(pi, ["bash"])[0]).toBeUndefined();
  });

  it("max_rounds:0 blocks the very first tool-use round (disables model tool calls)", () => {
    const pi = new FakePi();
    const gov = new PromptToolLoopGovernor();
    gov.ensureRegistered(pi.api);
    gov.begin(0);
    // The first tool-use round is already beyond the cap of 0.
    const r1 = round(pi, ["read"]);
    expect(r1[0]).toEqual({ block: true, reason: TOOL_LOOP_EXHAUSTED_REASON });
    const ex = gov.end();
    expect(ex.exhausted).toBe(true);
    expect(ex.rounds).toBe(0);
    expect(ex.lastToolName).toBe("read");
  });
});
