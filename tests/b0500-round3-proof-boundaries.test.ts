// Recovery proof is revalidated by content, not mutable-object identity, around
// actual asynchronous auth/dispatch boundaries. No providers or private data.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager, buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model, ToolCall } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { FinalizationEvidenceRetention, finalizationEvidence } from "../src/extension/finalization-evidence";
import { dispatchFinalization } from "../src/extension/off-session-finalization";
import type { RespondTurnContext } from "../src/extension/respond-capture";
import { RecordingFakeClock } from "./helpers/fake-clock";

const MODEL = { api: "openai-responses", provider: "openai", id: "offline", contextWindow: 200000 } as Model<Api>;
const QUERY = "Compute the score from the receipt.";
function assistant(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", api: MODEL.api, provider: MODEL.provider, model: MODEL.id, timestamp: 0 } as AssistantMessage;
}
function rig() {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], QUERY);
  const retention = new FinalizationEvidenceRetention();
  sm.appendMessage({ role: "user", content: QUERY, timestamp: 0 });
  sm.appendMessage({ ...assistant(""), stopReason: "toolUse", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] });
  const receipt = sm.appendMessage({ role: "toolResult", toolCallId: "r", toolName: "read", content: [{ type: "text", text: "score 777" }], isError: false, timestamp: 0 });
  const metadata = { nested: { constraint: "original" } };
  sm.appendCustomEntry("bookkeeping", metadata);
  const own = () => attempt.read(buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as Message[], sm.getBranch(), true);
  retention.observe(own(), sm.getBranch());
  const terminal = sm.appendMessage(assistant("score 777"));
  const gate = () => retention.read(own(), sm.getBranch());
  return { sm, own, retention, gate, receipt, metadata, terminal };
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

describe("0500 round 3 bounded full proof at asynchronous boundaries", () => {
  it.each((["auth", "reply", "fallback"] as const).flatMap(boundary =>
    (["metadata", "user", "terminal", "receipt"] as const).map(target => ({ boundary, target }))))("unchanged entry identity with $target mutation during $boundary refuses pinned proof", async ({ boundary, target }) => {
    const r = rig();
    const evidence = r.gate(); expect(evidence?.proof).toBeDefined();
    const abort = new AbortController();
    const validate = vi.fn(() => ({ ok: true as const }));
    const mutate = () => {
      if (target === "metadata") { r.metadata.nested.constraint = "different"; return; }
      if (target === "user") { r.own().user!.timestamp++; return; }
      const entry = r.sm.getEntry(target === "terminal" ? r.terminal : r.receipt)!;
      if (entry.type !== "message" || (entry.message.role !== "assistant" && entry.message.role !== "toolResult")) throw new Error("missing owned content");
      entry.message.content[0] = { type: "text", text: "score 888" };
    };
    const auth = async () => { if (boundary === "auth") mutate(); return undefined; };
    const respond: RespondTurnContext = { toolName: "__theta_respond_offline", lowered: { type: "object" }, template: "Submit score", model: MODEL, auth, signal: abort.signal, validate, captureHost: { setActiveCapture: vi.fn(), clearActiveCapture: vi.fn() } };
    scripted.queue.push(() => {
      mutate();
      if (boundary === "fallback") return { ...assistant(""), stopReason: "error", errorMessage: "tool_choice is not supported" };
      return { ...assistant(""), stopReason: "toolUse", content: [{ type: "toolCall", id: "result", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: 777 } } } as ToolCall] };
    });
    const result = await dispatchFinalization({ context: { model: MODEL, auth }, respond, query: QUERY, evidence: evidence!, signal: abort.signal, clock: new RecordingFakeClock(), eligible: () => r.gate()?.proof === evidence!.proof });
    expect(result).toMatchObject({ kind: "transport", error: { retryable: false } });
    expect(scripted.calls).toHaveLength(boundary === "auth" ? 0 : 1);
    expect(validate).not.toHaveBeenCalled();
  });
  it("a same-length unchanged poll does not make a receipt mutation trusted at the next gate", () => {
    const r = rig(); const pinned = r.gate(); expect(pinned?.proof).toBeDefined();
    const entry = r.sm.getEntry(r.receipt)!;
    if (entry.type !== "message" || entry.message.role !== "toolResult") throw new Error("missing receipt");
    entry.message.content[0] = { type: "text", text: "score 888" };
    for (let i = 0; i < 10; i++) r.retention.observe(r.own(), r.sm.getBranch());
    expect(r.gate()).toBeUndefined();
  });
  it("oversized own metadata refuses before invoking serialization hooks", () => {
    const r = rig(); const hook = vi.fn(() => { throw new Error("must not execute hook"); });
    r.sm.appendCustomEntry("large", { text: "x".repeat(300_000), toJSON: hook });
    expect(() => r.gate()).not.toThrow(); expect(r.gate()).toBeUndefined(); expect(hook).not.toHaveBeenCalled();
  });
  it("direct evidence construction enforces the own entry cap too", () => {
    const r = rig(); for (let n = 0; n < 256; n++) r.sm.appendCustomEntry("small", { n });
    expect(finalizationEvidence(r.own(), r.sm.getBranch())).toBeUndefined();
  });
  it.each(["depth", "nodes"] as const)("%s overflow in own metadata disables recovery", shape => {
    const r = rig();
    let metadata: unknown = Array.from({ length: 17_000 }, () => 0);
    if (shape === "depth") { metadata = 0; for (let n = 0; n < 70; n++) metadata = { next: metadata }; }
    r.sm.appendCustomEntry("unsupported-proof-size", metadata);
    expect(() => r.gate()).not.toThrow(); expect(r.gate()).toBeUndefined();
  });
});
