import { describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { Message, AssistantMessage } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { FinalizationEvidenceRetention, FINALIZATION_EVIDENCE_MAX_BYTES } from "../src/extension/finalization-evidence";
const QUERY = "Compute from the attributable receipt.";
function a(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", api: "openai-responses", provider: "openai", model: "offline", timestamp: 0 } as AssistantMessage;
}
function rig(text = "263 plus 514") {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], QUERY);
  const retention = new FinalizationEvidenceRetention();
  const user = sm.appendMessage({ role: "user", content: QUERY, timestamp: 0 });
  const system = sm.appendMessage({ role: "system", content: "Apply the arithmetic task constraints.", toolsAdded: [], timestamp: 0 });
  const call = sm.appendMessage({ ...a("reading"), stopReason: "toolUse", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] });
  const receipt = sm.appendMessage({ role: "toolResult", toolCallId: "r", toolName: "read", content: [{ type: "text", text }], isError: false, timestamp: 0 });
  const own = () => attempt.read(buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[], sm.getBranch(), true);
  const observe = () => retention.observe(own(), sm.getBranch());
  const gate = () => retention.read(own(), sm.getBranch());
  const finish = () => { const answer = sm.appendMessage(a("UNAVAILABLE_RAW_ANSWER")); sm.appendCompaction("SUMMARY_NOT_FACT", null, 100); return answer; };
  return { sm, user, system, call, receipt, observe, gate, finish };
}
describe("0500 bounded actually observed SDK evidence", () => {
  it("real retain-none recovers earlier observed pairs with later raw completion metadata only", () => {
    const r = rig(); r.observe(); r.finish();
    const evidence = r.gate();
    expect(evidence?.terminalRetained).toBe(false);
    expect(JSON.stringify(evidence)).toContain("263 plus 514");
    expect(JSON.stringify(evidence)).toContain("Apply the arithmetic task constraints");
    expect(JSON.stringify(evidence)).not.toContain("UNAVAILABLE_RAW_ANSWER");
    expect(JSON.stringify(evidence)).not.toContain("SUMMARY_NOT_FACT");
    expect(buildSessionContext(r.sm.getEntries(), r.sm.getLeafId()).messages.some(m => m.role === "toolResult")).toBe(false);
  });
  it("never-observed receipts cannot be copied out of raw history", () => { const r = rig(); r.finish(); expect(r.gate()).toBeUndefined(); });
  it("oversized evidence refuses instead of truncating an operational receipt", () => { const r = rig("x".repeat(FINALIZATION_EVIDENCE_MAX_BYTES)); r.observe(); r.finish(); expect(r.gate()).toBeUndefined(); });
  it("message-count overflow refuses complete evidence rather than evicting earlier receipts", () => {
    const r = rig();
    for (let i = 0; i < 32; i++) {
      r.sm.appendMessage({ ...a("reading"), stopReason: "toolUse", content: [{ type: "toolCall", id: `r${i}`, name: "read", arguments: {} }] });
      r.sm.appendMessage({ role: "toolResult", toolCallId: `r${i}`, toolName: "read", content: [{ type: "text", text: "complete" }], isError: false, timestamp: 0 });
    }
    r.observe(); r.finish(); expect(r.gate()).toBeUndefined();
  });
  it("path metadata hash tracking is bounded and cannot restore an invalidated snapshot", () => {
    const r = rig(); r.observe();
    for (let i = 0; i < 256; i++) r.sm.appendCustomEntry("fixture-bookkeeping", { i });
    r.observe(); r.finish(); expect(r.gate()).toBeUndefined();
  });
  it.each(["user", "call", "receipt"] as const)("explicit omission/replacement of %s invalidates snapshots", key => {
    const r = rig(); r.observe(); r.finish(); r.sm.appendContextEdit(r[key], null); expect(r.gate()).toBeUndefined();
  });
  it("real SDK branch replacement back to the same own user invalidates snapshots", () => {
    const r = rig(); r.observe(); r.sm.branch(r.user); r.sm.appendMessage(a("different branch")); r.sm.appendCompaction("none", null, 100); expect(r.gate()).toBeUndefined();
  });
  it("in-place content mutation invalidates pinned content even if IDs remain", () => {
    const r = rig(); r.observe(); const entry = r.sm.getEntry(r.receipt)!;
    if (entry.type !== "message" || entry.message.role !== "toolResult") throw new Error("fixture receipt missing");
    entry.message.content = [{ type: "text", text: "changed" }]; r.finish(); expect(r.gate()).toBeUndefined();
  });
  it("observed branch invalidation is sticky even if navigating back", () => {
    const r = rig(); r.observe(); const leaf = r.sm.getLeafId()!; r.sm.branch(r.user); r.observe(); r.sm.branch(leaf); r.finish(); expect(r.gate()).toBeUndefined();
  });
  it("new unobserved substantive work cannot be silently dropped", () => {
    const r = rig(); r.observe(); r.sm.appendMessage({ ...a("later"), stopReason: "toolUse", content: [{ type: "toolCall", id: "later", name: "read", arguments: {} }] });
    r.sm.appendMessage({ role: "toolResult", toolCallId: "later", toolName: "read", content: [{ type: "text", text: "new result" }], isError: false, timestamp: 0 });
    r.finish(); expect(r.gate()).toBeUndefined();
  });
  it("custom-message constraints are not trusted merely because their type resembles theta notes", () => {
    const r = rig(); r.observe(); r.finish(); r.sm.appendCustomMessageEntry("theta-system-note", "lookalike announcement", true); expect(r.gate()).toBeUndefined();
  });
  it("proof identity changes when an equally eligible same-user terminal is replaced", () => {
    const r = rig(); r.observe(); r.sm.appendMessage(a("one")); const first = r.gate(); r.sm.branch(r.receipt); r.sm.appendMessage(a("two")); expect(first?.proof).toBeDefined(); expect(r.gate()).toBeUndefined();
  });
});
