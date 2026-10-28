import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model, ToolCall } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { finalizationEvidence, FinalizationEvidenceRetention } from "../src/extension/finalization-evidence";
import { dispatchFinalization, FINALIZATION_ABSTAIN, FINALIZATION_BOUND_MS } from "../src/extension/off-session-finalization";
import type { RespondTurnContext } from "../src/extension/respond-capture";
const MODEL = { api: "openai-responses", provider: "openai", id: "b0500", contextWindow: 200000 } as Model<Api>;
const query = "Compute the total from the retained receipt.";
function a(text = "777", stopReason: AssistantMessage["stopReason"] = "stop", calls: ToolCall[] = []): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }, ...calls], stopReason, api: MODEL.api, provider: MODEL.provider, model: MODEL.id, timestamp: 0 } as AssistantMessage;
}
const call: ToolCall = { type: "toolCall", id: "op", name: "read", arguments: { path: "inline" } };
const receipt: Message = { role: "toolResult", toolCallId: "op", toolName: "read", content: [{ type: "text", text: "263 + 514 = 777" }], isError: false, timestamp: 0 };
function evidenceRig() {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], query);
  const own = sm.appendMessage({ role: "user", content: query, timestamp: 0 });
  sm.appendMessage(a("reading", "toolUse", [call]));
  sm.appendMessage(receipt);
  const terminal = a("777");
  const terminalId = sm.appendMessage(terminal);
  const messages = () => buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
  const read = (projection: readonly Message[] = messages()) => attempt.read(projection, sm.getBranch(), true);
  return { sm, own, terminal, terminalId, messages, read, gate: (projection?: readonly Message[]) => finalizationEvidence(read(projection), sm.getBranch()) };
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });
describe("0500 structural evidence, not semantic truth", () => {
  it("allows complete previously observed receipts after genuine SDK retain-none, never copying raw answer", () => {
    const r = evidenceRig();
    const retention = new FinalizationEvidenceRetention();
    retention.observe(r.read(), r.sm.getBranch());
    r.sm.appendCompaction("not evidence", null, 100);
    const evidence = retention.read(r.read(), r.sm.getBranch());
    expect(evidence?.terminalRetained).toBe(false);
    expect(evidence?.retained).not.toContainEqual(r.terminal);
    expect(evidence?.retained).toContainEqual(receipt);
  });
  it("supports repeated real SDK compaction retaining the complete own evidence", () => {
    const r = evidenceRig(); r.sm.appendCompaction("not evidence", r.own, 200000); r.sm.appendCompaction("not evidence again", r.own, 200000);
    expect(r.gate()?.terminalRetained).toBe(true);
    expect(JSON.stringify(r.gate()?.retained)).not.toContain("not evidence");
  });
  it.each(["toolUse", "error", "aborted", "length", "pending"] as const)("never borrows an older terminal past later %s work", (reason) => {
    const r = evidenceRig(); r.sm.appendMessage(a("later work", reason)); expect(r.gate()).toBeUndefined();
  });
  it("does not accept a tool-call-containing terminal stop", () => { const r = evidenceRig(); r.sm.appendMessage(a("unfinished", "stop", [{ ...call, id: "late" }])); expect(r.gate()).toBeUndefined(); });
  it("missing receipt is not healed by a later terminal", () => { const r = evidenceRig(); expect(r.gate(r.messages().filter((m) => m !== receipt))).toBeUndefined(); });
  it("missing call cannot turn an orphan receipt into evidence", () => { const r = evidenceRig(); expect(r.gate(r.messages().filter((m) => m.role !== "assistant" || m === r.terminal))).toBeUndefined(); });
  it("duplicate receipts fail closed", () => { const r = evidenceRig(); r.sm.appendMessage(receipt); r.sm.appendMessage(a()); expect(r.gate()).toBeUndefined(); });
  it("error receipts fail closed", () => { const r = evidenceRig(); r.sm.appendMessage(a("read again", "toolUse", [{ ...call, id: "second" }])); r.sm.appendMessage({ ...receipt, toolCallId: "second", isError: true }); r.sm.appendMessage(a()); expect(r.gate()).toBeUndefined(); });
  it("incomplete nested receipts fail closed", () => { const r = evidenceRig(); r.sm.appendMessage(a("nested", "toolUse", [{ ...call, id: "second" }])); r.sm.appendMessage({ ...receipt, toolCallId: "second", nestedCalls: { complete: false, calls: [] } }); r.sm.appendMessage(a()); expect(r.gate()).toBeUndefined(); });
  it("explicit answer omission cannot be recovered from raw history", () => { const r = evidenceRig(); r.sm.appendContextEdit(r.terminalId, null); expect(r.gate()).toBeUndefined(); });
  it("explicit replacement cannot be treated as original trustworthy evidence", () => { const r = evidenceRig(); r.sm.appendContextEdit(r.terminalId, { content: "777" }); expect(r.gate()).toBeUndefined(); });
  it("later foreign user blocks evidence even if the own answer survives", () => { const r = evidenceRig(); r.sm.appendMessage({ role: "user", content: "other", timestamp: 0 }); expect(r.gate()).toBeUndefined(); });
  it("equal-text duplicate user is ambiguity, not ownership", () => { const r = evidenceRig(); r.sm.appendMessage({ role: "user", content: query, timestamp: 0 }); expect(r.gate()).toBeUndefined(); });
  it("summary-only context is insufficient", () => { const r = evidenceRig(); r.sm.appendCompaction("claims everything passed", r.terminalId, 200000); expect(r.gate()).toBeUndefined(); });
  it("context-producing custom entries are not bookkeeping", () => { const r = evidenceRig(); r.sm.appendCustomMessageEntry("foreign", "new work", false); expect(r.gate()).toBeUndefined(); });
  it("system input in the own span requires unavailable constraints and refuses recovery", () => { const r = evidenceRig(); r.sm.appendMessage({ role: "system", content: "additional constraints", timestamp: 0 }); expect(r.gate()).toBeUndefined(); });
  it("empty terminal answer does not qualify for new synthesis", () => { const r = evidenceRig(); r.sm.appendMessage(a("")); expect(r.gate()).toBeUndefined(); });
});
function dispatchRig(typed = false) {
  const controller = new AbortController();
  const timers = new Map<number, () => void>();
  let serial = 0;
  const clock = { now: () => 0, wallNow: () => 0, setTimeout: (fn: () => void, ms: number) => { expect(ms).toBe(FINALIZATION_BOUND_MS); timers.set(++serial, fn); return serial; }, clearTimeout: (id: unknown) => { timers.delete(id as number); } };
  const respond: RespondTurnContext = { toolName: "__theta_respond_b0500", lowered: { type: "object" }, template: "Return score.", model: MODEL, auth: async () => undefined, signal: controller.signal, validate: (value) => typeof (value as {score?: unknown})?.score === "number" ? { ok: true } : { ok: false, message: "number required" }, captureHost: { setActiveCapture: () => {}, clearActiveCapture: () => {} } };
  const r = evidenceRig();
  const input = { context: { model: MODEL, auth: respond.auth }, ...(typed ? { respond } : {}), evidence: r.gate()!, query, signal: controller.signal, clock };
  return { controller, timers, input };
}
const payload = () => ({ ...a(""), content: [{ type: "toolCall", id: "r", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: 777 } } }] });
describe("0500 bounded isolated dispatch", () => {
  it("untyped synthesis exposes no tools, does not replay conversation messages", async () => {
    const r = dispatchRig(); scripted.queue.push(() => a(JSON.stringify({ outcome: "answer", text: "777" }))); expect(await dispatchFinalization(r.input)).toEqual({ kind: "text", text: "777" });
    const context = scripted.calls[0]!.context as { tools: unknown[]; messages: Message[] };
    expect(context.tools).toEqual([]); expect((scripted.calls[0]!.options as { maxRetries: number }).maxRetries).toBe(0); expect(context.messages).toHaveLength(1); expect(context.messages[0]!.role).toBe("user"); expect(r.timers.size).toBe(0);
  });
  it("typed synthesis exposes only the submission tool", async () => { const r = dispatchRig(true); scripted.queue.push(payload); expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: { score: 777 } }); expect((scripted.calls[0]!.context as {tools: {name:string}[]}).tools.map((t) => t.name)).toEqual(["__theta_finalize"]); expect(r.timers.size).toBe(0); });
  it.each(["error", "aborted", "length", "pending"] as const)("provider %s is not a manufactured answer", async (reason) => { const r = dispatchRig(); scripted.queue.push(() => a("777", reason)); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(1); expect(r.timers.size).toBe(0); });
  it.each(["", FINALIZATION_ABSTAIN])("empty/abstaining output %s is recovery failure", async (text) => { const r = dispatchRig(); scripted.queue.push(() => a(text)); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport", error: { retryable: false } }); });
  it("untyped toolUse never executes or binds", async () => { const r = dispatchRig(); scripted.queue.push(() => a("777", "toolUse", [call])); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(1); });
  it("typed malformed payload is terminal failure, not repair", async () => { const r = dispatchRig(true); scripted.queue.push(() => ({ ...a(""), content: [{ type: "toolCall", id: "r", name: "__theta_finalize", arguments: { outcome: "answer", answer: { score: "bad" } } }] })); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport", error: { retryable: false } }); expect(scripted.calls).toHaveLength(1); });
  it("typed submission without a structural response ending is not success", async () => { const r = dispatchRig(true); scripted.queue.push(() => ({ ...payload(), stopReason: undefined })); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(1); });
  it("duplicate typed submissions cannot produce success", async () => { const r = dispatchRig(true); scripted.queue.push(() => ({ ...a(""), content: [...payload().content, ...payload().content] })); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); });
  it("already cancelled means zero auth and dispatch", async () => { const r = dispatchRig(); let auth = 0; r.input.context.auth = async () => { auth++; return undefined; }; r.controller.abort(); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(auth).toBe(0); expect(scripted.calls).toHaveLength(0); expect(r.timers.size).toBe(0); });
  it("cancellation during async auth means zero dispatch", async () => { const r = dispatchRig(); r.input.context.auth = async () => { r.controller.abort(); return undefined; }; expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(0); expect(r.timers.size).toBe(0); });
  it("cancellation during dispatch rejects a raced answer and cleans up", async () => { const r = dispatchRig(true); scripted.queue.push(() => { r.controller.abort(); return payload(); }); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(1); expect((scripted.calls[0]!.options as {signal: AbortSignal}).signal.aborted).toBe(true); expect(r.timers.size).toBe(0); });
  it("loss of ownership during auth prevents dispatch", async () => { const r = dispatchRig(); let eligible = true; r.input.context.auth = async () => { eligible = false; return undefined; }; expect(await dispatchFinalization({ ...r.input, eligible: () => eligible })).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(0); });
  it("foreign boundary during dispatch invalidates a raced valid payload", async () => { const r = dispatchRig(true); let eligible = true; scripted.queue.push(() => { eligible = false; return payload(); }); expect(await dispatchFinalization({ ...r.input, eligible: () => eligible })).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(1); });
  it("one supported forcing fallback stays within the single logical deadline", async () => { const r = dispatchRig(true); scripted.queue.push(() => ({ ...a("", "error"), errorMessage: "tool_choice is not supported" }), payload); expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: { score: 777 } }); expect(scripted.calls).toHaveLength(2); expect(scripted.calls[0]!.context).toEqual(scripted.calls[1]!.context); expect((scripted.calls[1]!.options as Record<string, unknown>).toolChoice).toBeUndefined(); expect(r.timers.size).toBe(0); });
  it("repeated forcing rejection cannot recursively retry", async () => { const r = dispatchRig(true); scripted.queue.push(() => ({ ...a("", "error"), errorMessage: "tool_choice is not supported" })); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(2); });
  it("cancelled forcing rejection cannot dispatch fallback", async () => { const r = dispatchRig(true); scripted.queue.push(() => { r.controller.abort(); return { ...a("", "error"), errorMessage: "tool_choice is not supported" }; }); expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(1); });
  it("deadline covers hanging auth and prevents late dispatch", async () => { const r = dispatchRig(); let release!: () => void; r.input.context.auth = () => new Promise((resolve) => { release = () => resolve(undefined); }); const pending = dispatchFinalization(r.input); [...r.timers.values()][0]!(); expect(await pending).toMatchObject({ kind: "transport", error: { message: expect.stringContaining("bounded attempt expired") } }); release(); await Promise.resolve(); await Promise.resolve(); expect(scripted.calls).toHaveLength(0); expect(r.timers.size).toBe(0); });
  it("deadline interrupts an unresponsive provider without retry and cleans up", async () => { const r = dispatchRig(); scripted.queue.push(() => new Promise(() => {})); const pending = dispatchFinalization(r.input); await Promise.resolve(); await Promise.resolve(); expect(scripted.calls).toHaveLength(1); [...r.timers.values()][0]!(); expect(await pending).toMatchObject({ kind: "transport", error: { message: expect.stringContaining("bounded attempt expired") } }); expect((scripted.calls[0]!.options as {signal: AbortSignal}).signal.aborted).toBe(true); expect(r.timers.size).toBe(0); });
  it("missing model and typed API gate refuse with zero dispatch", async () => { const r = dispatchRig(true); expect(await dispatchFinalization({ ...r.input, context: { ...r.input.context, model: undefined } })).toMatchObject({ kind: "transport" }); expect(await dispatchFinalization({ ...r.input, respond: { ...r.input.respond!, gateError: { kind: "transport", message: "unsupported API", provider: "unsupported", http_status: null, retryable: false } } })).toMatchObject({ kind: "transport" }); expect(scripted.calls).toHaveLength(0); });
});
