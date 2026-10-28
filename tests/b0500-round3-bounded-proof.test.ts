// R2-C1: proof work is attempt-local and bounded, including optional recovery.
// Real SDK projection/branch semantics; only on-session completion is scripted.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { FinalizationEvidenceRetention, FINALIZATION_EVIDENCE_MAX_BYTES } from "../src/extension/finalization-evidence";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";

const PROOF_BYTES = 262_144;
const QUERY = "Compute from the attributable receipt.";
const assistant = (text: string): AssistantMessage => ({
  role: "assistant", content: [{ type: "text", text }], stopReason: "stop",
  api: "openai-responses", provider: "openai", model: "offline", timestamp: 0,
} as AssistantMessage);
const projection = (sm: SessionManager) => buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
type Nested = { child?: Nested; value?: string };
function nested(depth: number): Nested {
  let result: Nested = { value: "original" };
  for (let i = 0; i < depth; i++) result = { child: result };
  return result;
}
function mutateLeaf(root: Nested) {
  let cursor = root;
  while (cursor.child !== undefined) cursor = cursor.child;
  cursor.value = "mutated";
}
function rig(query = QUERY) {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], query);
  const retention = new FinalizationEvidenceRetention();
  sm.appendMessage({ role: "user", content: query, timestamp: 0 });
  sm.appendMessage({ ...assistant("reading"), stopReason: "toolUse", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] });
  sm.appendMessage({ role: "toolResult", toolCallId: "r", toolName: "read", content: [{ type: "text", text: "263 plus 514" }], isError: false, timestamp: 0 });
  const own = () => attempt.read(projection(sm), sm.getBranch(), true);
  const observe = () => retention.observe(own(), sm.getBranch());
  const gate = () => retention.read(own(), sm.getBranch());
  const finish = (text = "UNAVAILABLE_RAW_ANSWER") => {
    sm.appendMessage(assistant(text));
    sm.appendCompaction("SUMMARY_NOT_EVIDENCE", null, 100);
  };
  return { sm, observe, gate, finish };
}
function expectRefusal(r: ReturnType<typeof rig>) {
  // Optional evidence must refuse, not throw out of an otherwise valid drive.
  let evidence: ReturnType<typeof r.gate>;
  expect(() => { evidence = r.gate(); }).not.toThrow();
  expect(evidence!).toBeUndefined();
}

beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

describe("0500 R2-C1 bounded attempt-local finalization proof", () => {
  it("ordinary retained driver answer ignores compacted historical toJSON/getters with zero extra completions", async () => {
    const sm = SessionManager.inMemory();
    const oldJSON = assistant("OLD_HISTORY_TO_JSON");
    const oldGetter = assistant("OLD_HISTORY_GETTER");
    sm.appendMessage(oldJSON);
    sm.appendMessage(oldGetter);
    sm.appendCompaction("unrelated history compacted", null, 100);
    const toJSON = vi.fn(() => ({ poison: "OLD_HISTORY_TO_JSON" }));
    const getText = vi.fn(() => { throw new Error("historical content must not be inspected"); });
    Object.defineProperty(oldJSON, "toJSON", { value: toJSON, enumerable: true });
    Object.defineProperty(oldGetter.content[0], "text", { get: getText, enumerable: true });
    const send = vi.fn((query: string) => {
      sm.appendMessage({ role: "user", content: query, timestamp: 0 });
      sm.appendMessage(assistant("777"));
    });
    const driver = new LivePromptQueryModel({
      pi: { getActiveTools: () => [], setActiveTools: () => {}, sendUserMessage: send, sendMessage: () => {} } as unknown as ExtensionAPI,
      ctx: { model: undefined, signal: undefined, isIdle: () => true, waitForIdle: async () => {}, abort: () => {} },
      queryText: QUERY, readMessages: () => projection(sm), readContextPath: () => sm.getBranch(),
      thetaAbort: new AbortController(), governor: new PromptToolLoopGovernor(), maxRounds: 3,
      provider: "openai-responses", thetaName: "round3-bounded-proof", activeTools: [], emitDiagnostic: () => {},
      clock: { now: () => 0, wallNow: () => 0, setTimeout: fn => { fn(); return 0; }, clearTimeout: () => {} },
    });
    const proofRead = vi.spyOn(FinalizationEvidenceRetention.prototype, "read");
    try {
      await expect(driver.nextFreePhaseTurn(0)).resolves.toEqual({ kind: "text", text: "777" });
      expect(proofRead, "ordinary retained output never constructs a recovery proof").not.toHaveBeenCalled();
    } finally { proofRead.mockRestore(); }
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(QUERY);
    expect(toJSON).not.toHaveBeenCalled();
    expect(getText).not.toHaveBeenCalled();
    expect(scripted.calls, "ordinary output never dispatches optional recovery").toHaveLength(0);
  });

  it("serializes no compacted historical content even for a small retained answer", () => {
    const sm = SessionManager.inMemory();
    const marker = "OLD_HISTORY_MUST_NOT_ENTER_PROOF";
    sm.appendMessage(assistant(marker.repeat(32)));
    sm.appendCompaction("unrelated history", null, 100);
    const attempt = new OwnedTurnAttempt(projection(sm), sm.getBranch(), QUERY);
    sm.appendMessage({ role: "user", content: QUERY, timestamp: 0 });
    sm.appendMessage(assistant("777"));
    const own = attempt.read(projection(sm), sm.getBranch(), true);
    const stringify = JSON.stringify;
    let historicalSerializations = 0;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      const result = stringify(...args);
      if (result?.includes(marker)) historicalSerializations++;
      return result;
    }) as typeof JSON.stringify;
    let evidence;
    try { evidence = new FinalizationEvidenceRetention().read(own, sm.getBranch()); }
    finally { JSON.stringify = stringify; }
    expect(evidence?.terminalRetained).toBe(true);
    expect(historicalSerializations).toBe(0);
  });

  it("256 observations of a 1 MiB own query have bounded serialization bytes and refuse optional proof", () => {
    const r = rig("q".repeat(1024 * 1024));
    const stringify = JSON.stringify;
    let serializedBytes = 0;
    // A direct wrapper deliberately avoids a spy retaining hundreds of MiB of
    // stringify return values on the old implementation; only the count stays.
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      const result = stringify(...args);
      serializedBytes += result === undefined ? 0 : Buffer.byteLength(result, "utf8");
      return result;
    }) as typeof JSON.stringify;
    let evidence;
    try {
      for (let i = 0; i < 256; i++) r.observe();
      r.finish("777");
      evidence = r.gate();
    } finally { JSON.stringify = stringify; }
    // Work-volume assertion, not a machine-dependent elapsed-time threshold.
    expect(serializedBytes).toBeLessThanOrEqual(PROOF_BYTES);
    expect(evidence).toBeUndefined();
  });

  it("unchanged admissible own input is not byte-hashed on every 10-ms observation", () => {
    const r = rig("q".repeat(96 * 1024));
    const stringify = JSON.stringify;
    let serializedBytes = 0;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      const result = stringify(...args);
      serializedBytes += result === undefined ? 0 : Buffer.byteLength(result, "utf8");
      return result;
    }) as typeof JSON.stringify;
    let evidence;
    try {
      for (let i = 0; i < 256; i++) r.observe();
      r.finish("777"); evidence = r.gate();
    } finally { JSON.stringify = stringify; }
    expect(evidence?.proof, "within-cap evidence is still admitted").toEqual(expect.any(String));
    // Three bounded prefix encodings: initial observation, changed prefix,
    // full gate. The count cannot scale with the 256 unchanged observations.
    expect(serializedBytes).toBeLessThan(4 * PROOF_BYTES);
  });

  it.each(["query", "terminal", "metadata", "cycle", "bigint", "getter"] as const)("ordinary valid retained output survives optional %s proof refusal", async shape => {
    const sm = SessionManager.inMemory();
    const query = shape === "query" ? "q".repeat(1024 * 1024) : QUERY;
    const text = shape === "terminal" ? "a".repeat(300_000) : "777";
    const getData = vi.fn(() => { throw new Error("no metadata accessor execution"); });
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    const metadata = shape === "cycle" ? cycle : shape === "bigint" ? { value: BigInt(1) }
      : shape === "getter" ? Object.defineProperty({}, "value", { get: getData, enumerable: true })
      : { value: "x".repeat(300_000) };
    const send = vi.fn((rendered: string) => {
      sm.appendMessage({ role: "user", content: rendered, timestamp: 0 });
      if (!["query", "terminal"].includes(shape)) sm.appendCustomEntry("own-bookkeeping", metadata);
      sm.appendMessage(assistant(text));
    });
    const driver = new LivePromptQueryModel({
      pi: { getActiveTools: () => [], setActiveTools: () => {}, sendUserMessage: send, sendMessage: () => {} } as unknown as ExtensionAPI,
      ctx: { model: undefined, signal: undefined, isIdle: () => true, waitForIdle: async () => {}, abort: () => {} },
      queryText: query, readMessages: () => projection(sm), readContextPath: () => sm.getBranch(),
      thetaAbort: new AbortController(), governor: new PromptToolLoopGovernor(), maxRounds: 3,
      provider: "openai-responses", thetaName: "round3-own-proof", activeTools: [], emitDiagnostic: () => {},
      clock: { now: () => 0, wallNow: () => 0, setTimeout: fn => { fn(); return 0; }, clearTimeout: () => {} },
    });
    await expect(driver.nextFreePhaseTurn(0)).resolves.toEqual({ kind: "text", text });
    expect(send).toHaveBeenCalledTimes(1); expect(scripted.calls).toHaveLength(0);
    expect(getData).not.toHaveBeenCalled();
  });

  it("query proof uses the larger proof cap, not the 64 KiB evidence cap", () => {
    const r = rig("é".repeat(FINALIZATION_EVIDENCE_MAX_BYTES / 2 + 1));
    r.observe(); r.finish();
    expect(r.gate()).toMatchObject({ terminalRetained: false, proof: expect.any(String) });
  });

  it("oversized own metadata refuses recovery rather than ignoring constraints", () => {
    const r = rig();
    // UTF-8, not JS string length: 150k code units exceed the 256 KiB cap.
    r.sm.appendCustomEntry("own-bookkeeping", { constraint: "é".repeat(150_000) });
    r.observe(); r.finish();
    expectRefusal(r);
  });

  it("an oversized omitted own terminal refuses recovery without copying raw output", () => {
    const r = rig();
    r.observe(); r.finish("é".repeat(150_000));
    expectRefusal(r);
  });

  it("JSON escape expansion is bounded before allocating the oversized string token", () => {
    const r = rig(); r.observe();
    const text = "\u0000".repeat(50_000); // 300002 JSON bytes, only 50000 UTF-16 units.
    r.finish(text);
    const stringify = JSON.stringify;
    let oversizedTokenCalls = 0;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
      if (args[0] === text) oversizedTokenCalls++;
      return stringify(...args);
    }) as typeof JSON.stringify;
    try { expectRefusal(r); }
    finally { JSON.stringify = stringify; }
    expect(oversizedTokenCalls).toBe(0);
  });

  it("cyclic optional own metadata fails closed instead of throwing", () => {
    const r = rig();
    const metadata: { self?: unknown } = {};
    metadata.self = metadata;
    r.sm.appendCustomEntry("own-bookkeeping", metadata);
    // No observation outside the assertion: the whole optional path must be safe.
    r.finish();
    expectRefusal(r);
  });

  it("unserializable optional own metadata fails closed instead of throwing", () => {
    const r = rig();
    r.sm.appendCustomEntry("own-bookkeeping", { unsupported: BigInt(1) });
    r.finish();
    expectRefusal(r);
  });

  it("own metadata beyond depth 64 refuses the optional proof", () => {
    const r = rig();
    r.sm.appendCustomEntry("own-bookkeeping", nested(70));
    r.observe(); r.finish();
    expectRefusal(r);
  });

  it("own metadata beyond 16384 nodes refuses even below the byte/entry caps", () => {
    const r = rig();
    const metadata = Array.from({ length: 16_385 }, () => ({}));
    expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeLessThan(FINALIZATION_EVIDENCE_MAX_BYTES);
    r.sm.appendCustomEntry("own-bookkeeping", metadata);
    r.observe(); r.finish();
    expectRefusal(r);
  });

  it("bounded deep own tool arguments remain mutation-sensitive", () => {
    const r = rig();
    const call = r.sm.getBranch().find(entry => entry.type === "message" && entry.message.role === "assistant");
    if (call?.type !== "message" || call.message.role !== "assistant") throw new Error("fixture call missing");
    const part = call.message.content[0];
    if (part?.type !== "toolCall") throw new Error("fixture tool call missing");
    const args = nested(32);
    part.arguments = args;
    r.observe();
    // Confirm this is an admissible depth/size, not an unconditional refusal.
    r.sm.appendMessage(assistant("777"));
    expect(r.gate()?.terminalRetained).toBe(true);
    mutateLeaf(args);
    r.sm.appendCompaction("none", null, 100);
    expectRefusal(r);
  });

  it("bounded deep own metadata remains mutation-sensitive", () => {
    const r = rig();
    const metadata = nested(32);
    r.sm.appendCustomEntry("own-bookkeeping", metadata);
    r.observe();
    r.sm.appendMessage(assistant("777"));
    expect(r.gate()?.terminalRetained).toBe(true);
    mutateLeaf(metadata);
    r.sm.appendCompaction("none", null, 100);
    expectRefusal(r);
  });
});
