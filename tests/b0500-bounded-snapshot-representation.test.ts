// R3-C1: clone exactly the bounded JSON representation, not extra JS data or
// accessors that are absent from the proof/model context. Real SDK projection.
import { expect, it, vi } from "vitest";
import { SessionManager, buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { FinalizationEvidenceRetention, type FinalizationEvidence } from "../src/extension/finalization-evidence";

function assistant(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], stopReason: "stop",
    api: "openai-responses", provider: "openai", model: "synthetic", timestamp: 0 } as AssistantMessage;
}
function rig(details: unknown) {
  const session = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], "Use the read-only receipt.");
  const retention = new FinalizationEvidenceRetention();
  session.appendMessage({ role: "user", content: "Use the read-only receipt.", timestamp: 0 });
  session.appendMessage({ ...assistant(""), stopReason: "toolUse",
    content: [{ type: "toolCall", id: "receipt", name: "read", arguments: {} }] });
  session.appendMessage({ role: "toolResult", toolCallId: "receipt", toolName: "read",
    content: [{ type: "text", text: "score 777" }], isError: false, timestamp: 0,
    // Exercise JavaScript extras on otherwise JSON-shaped SDK receipt data.
    details: details as Exclude<ToolResultMessage["details"], undefined> });
  const own = () => attempt.read(buildSessionContext(session.getEntries(), session.getLeafId()).messages as Message[], session.getBranch(), true);
  return { session, retention, own, gate: () => retention.read(own(), session.getBranch()) };
}
function receiptDetails(evidence: FinalizationEvidence | undefined): unknown {
  expect(evidence).toBeDefined();
  const receipt = evidence!.retained.find(message => message.role === "toolResult");
  expect(receipt?.role).toBe("toolResult");
  return (receipt as Message & { readonly details: unknown }).details;
}

it("does not clone oversized enumerable array extras excluded from bounded JSON", () => {
  const details = Object.assign([], { oversized: "x".repeat(1024 * 1024) });
  const r = rig(details);
  r.session.appendMessage(assistant("777"));
  const evidence = r.gate();
  const copied = receiptDetails(evidence) as object;
  expect(Array.isArray(copied)).toBe(true);
  expect(Object.hasOwn(copied, "oversized")).toBe(false);
  // This property is not retained or sent as evidence, so its mutation must not
  // turn an unbounded original JS value into a hidden part of the same proof.
  details.oversized = "changed outside JSON";
  expect(r.gate()?.proof).toBe(evidence?.proof);
  expect(Object.hasOwn(receiptDetails(r.gate()) as object, "oversized")).toBe(false);
});

it("never executes ignored array accessors when snapshotting before real retain-none", () => {
  const getter = vi.fn(() => "x".repeat(1024 * 1024));
  const details: unknown[] = [];
  Object.defineProperty(details, "oversized", { get: getter, enumerable: true });
  const r = rig(details);
  r.retention.observe(r.own(), r.session.getBranch());
  expect(getter).not.toHaveBeenCalled();
  r.session.appendMessage(assistant("B0500_UNAVAILABLE_TERMINAL"));
  r.session.appendCompaction("no facts", null, 100);
  const evidence = r.gate();
  expect(evidence?.terminalRetained).toBe(false);
  expect(Object.hasOwn(receiptDetails(evidence) as object, "oversized")).toBe(false);
  expect(getter).not.toHaveBeenCalled();
});

it("does not clone JSON-omitted undefined property names outside the byte cap", () => {
  const r = rig({ ["k".repeat(1024 * 1024)]: undefined });
  r.session.appendMessage(assistant("777"));
  const copied = receiptDetails(r.gate()) as object;
  expect(Object.keys(copied)).toHaveLength(0);
});

it("still invalidates mutation of JSON-visible evidence content", () => {
  const details = ["initial"];
  const r = rig(details);
  r.retention.observe(r.own(), r.session.getBranch());
  details[0] = "changed";
  r.session.appendMessage(assistant("777"));
  r.session.appendCompaction("no facts", null, 100);
  expect(r.gate()).toBeUndefined();
});

it("still refuses oversized JSON-visible array data without truncating", () => {
  const r = rig(["x".repeat(1024 * 1024)]);
  r.session.appendMessage(assistant("777"));
  expect(() => r.gate()).not.toThrow();
  expect(r.gate()).toBeUndefined();
});
