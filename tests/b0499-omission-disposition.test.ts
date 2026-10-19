// PIC-79 disposition: real driver, SDK SessionManager/projection, governor,
// typed query loop, AJV and respond-repair. Only host scheduling, clock and
// transport are scripted. Compactions/omissions below are explicitly appended
// fixtures, not claims about natural compaction timing or provider behaviour.
// Import FIRST: every off-session complete() dispatch is counted and offline.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { LivePromptQueryModel } from "../src/extension/live-prompt-query-driver";
import type { ActiveRespondCapture, RespondTurnContext } from "../src/extension/respond-capture";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { TURN_SETTLE_POLL_BOUND, WAIT_FOR_IDLE_BOUND_MS } from "../src/extension/turn-settlement";
import {
  PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE,
  PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE,
  PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE,
  PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE,
} from "../src/runtime/prompt-transport-mapping";
import { runTypedQueryLoop, runUntypedQueryLoop, type QueryToolLoopConfig } from "../src/runtime/query-tool-loop";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import { AjvSchemaValidator } from "../src/seams/ajv-schema-validator";
import type { LoweredSchema } from "../src/seams/schema-validator";

const MODEL = { id: "b0499-disposition", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
const QUERY = "What is 263 plus 514?";
const PARTIAL = "one file of fifteen reviewed";
const RAW_ERROR = "provider returned error: b0499 unfinished own recovery";
const TOOL = "__theta_respond_b0499_disposition";
const LOWERED: LoweredSchema = { type: "object", properties: { score: { type: "number" } }, required: ["score"], additionalProperties: false };
const CONFIG: QueryToolLoopConfig = { maxRounds: 3, querySite: { file: "b0499.theta", line: 1, column: 1 },
  thetaSlashName: "/b0499", invocationId: "b0499-disposition", occurredAt: 0 };
const CHECKPOINT = { before: async () => {} };
function user(text: string): Message { return { role: "user", content: text, timestamp: 0 }; }
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api, provider: MODEL.provider,
    model: MODEL.id, timestamp: 0, stopReason, ...(errorMessage === undefined ? {} : { errorMessage }) } as AssistantMessage;
}
function messages(sm: SessionManager): readonly Message[] {
  return buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
}
function omissionError(detail = RAW_ERROR) {
  return { kind: "transport", message: "on-session host recovery did not complete: " + detail,
    http_status: null, provider: MODEL.api, retryable: true };
}
function interleavingError(typed: boolean) {
  return { kind: "transport", message: typed ? PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE : PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE,
    http_status: null, provider: MODEL.api, retryable: true };
}
type Compaction = "kept-user" | "split-turn";
interface Options {
  typed?: boolean;
  fast?: boolean;
  maxRounds?: number;
  hostSignal?: "recorded" | "postsettle";
  idleWait?: "resume" | "timeout";
}
interface Rig {
  sm: SessionManager;
  model: LivePromptQueryModel;
  thetaAbort: AbortController;
  hostAbort: AbortController;
  reason: Error;
  sends: string[];
  notes: string[];
  diagnostics: unknown[];
  polls: number;
  idle: boolean;
  ownId: string | undefined;
  capture: ActiveRespondCapture | undefined;
  abortCalls: number;
  step: (r: Rig) => void;
  narration: () => void;
  capturePayload: (payload: unknown) => void;
  cleanup: () => void;
}
function rig(step: (r: Rig) => void, options: Options = {}): Rig {
  const sm = SessionManager.inMemory();
  // Make kept-user compaction really relocate the own anchor below its index.
  for (let i = 0; i < 3; i++) { sm.appendMessage(user(`old query ${i}`)); sm.appendMessage(assistant(`old answer ${i}`)); }
  const thetaAbort = new AbortController();
  const hostAbort = new AbortController();
  const hostAdded = vi.spyOn(hostAbort.signal, "addEventListener");
  const hostRemoved = vi.spyOn(hostAbort.signal, "removeEventListener");
  const governor = new PromptToolLoopGovernor();
  const hooks = new Map<string, (event: unknown) => unknown>();
  let activeTools = ["ambient"];
  const installs: string[][] = [];
  const timers = new Set<number>();
  let nextTimer = 0;
  let pending = false;
  const r: Rig = { sm, thetaAbort, hostAbort, reason: new Error("b0499 source cancellation"), sends: [], notes: [], diagnostics: [],
    idle: true, polls: 0, ownId: undefined, capture: undefined, abortCalls: 0, step,
    model: undefined as unknown as LivePromptQueryModel,
    capturePayload: (payload) => {
      expect(r.capture, "typed capture must actually be armed").toBeDefined();
      r.capture!.captured = true; r.capture!.payload = payload;
    },
    narration: () => {
      hooks.get("before_provider_request")!({});
      expect(hooks.get("tool_call")!({ toolName: "review", toolCallId: "review-1", input: {} })).toBeUndefined();
      sm.appendMessage({ ...assistant(PARTIAL, "toolUse"), content: [
        { type: "text", text: PARTIAL }, { type: "toolCall", id: "review-1", name: "review", arguments: {} },
      ] });
      sm.appendMessage({ role: "toolResult", toolCallId: "review-1", toolName: "review",
        content: [{ type: "text", text: "file reviewed" }], isError: false, timestamp: 0 });
    },
    cleanup: () => {
      expect(timers.size, "bounded wait timer cleared").toBe(0);
      expect(r.capture, "early capture detached").toBeUndefined();
      expect(governor.isActive, "governor disarmed").toBe(false);
      expect(activeTools, "ambient active set restored").toEqual(["ambient"]);
      expect(installs.at(-1)).toEqual(["ambient"]);
      for (const [event, listener] of hostAdded.mock.calls) {
        if (event === "abort") expect(hostRemoved.mock.calls.some(([name, fn]) => name === event && fn === listener),
          "deferred host signal listener detached").toBe(true);
      }
      expect(r.notes, "no omission-authorized ride/continuation or discard note").toEqual([]);
      expect(r.diagnostics).toEqual([]);
    },
  };
  const tick = () => { if (pending) { pending = false; r.step(r); } };
  const pi = {
    sendUserMessage: (text: string) => {
      r.sends.push(text); r.ownId = sm.appendMessage(user(text)); r.idle = false; pending = true;
      if (options.fast) tick();
    },
    on: (name: string, hook: (event: unknown) => unknown) => { hooks.set(name, hook); },
    getActiveTools: () => activeTools,
    setActiveTools: (tools: string[]) => { activeTools = [...tools]; installs.push([...tools]); },
    sendMessage: (note: { content: string }) => { r.notes.push(note.content); },
  } as unknown as ExtensionAPI;
  governor.ensureRegistered(pi);
  const respond: RespondTurnContext = {
    toolName: TOOL, lowered: LOWERED, template: "Return the computed score using the schema", model: MODEL,
    auth: async () => undefined, signal: thetaAbort.signal, validate: () => ({ ok: true }),
    captureHost: { setActiveCapture: (slot) => { r.capture = slot; }, clearActiveCapture: () => { r.capture = undefined; } },
  };
  r.model = new LivePromptQueryModel({
    pi, ctx: { model: MODEL,
      get signal() { return options.hostSignal === "recorded" || (options.hostSignal === "postsettle" && r.idle) ? hostAbort.signal : undefined; },
      isIdle: () => r.idle,
      waitForIdle: async () => {
        if (options.idleWait === "timeout") await new Promise<void>(() => {});
        if (options.idleWait === "resume") r.idle = false;
      },
      abort: () => { r.abortCalls++; r.idle = true; },
    },
    clock: { now: () => r.polls * 10, wallNow: () => 0, setTimeout: (fn, ms) => {
      const id = ++nextTimer;
      if (ms === 10) { r.polls++; tick(); fn(); }
      else if (options.idleWait === "timeout" && ms === WAIT_FOR_IDLE_BOUND_MS) fn();
      else timers.add(id);
      return id;
    }, clearTimeout: (id) => { timers.delete(id as number); } },
    queryText: QUERY, readMessages: () => messages(sm), readContextPath: () => sm.getBranch(),
    activeTools: ["review"], thetaAbort, governor, maxRounds: options.maxRounds ?? CONFIG.maxRounds,
    provider: MODEL.api, thetaName: "b0499", emitDiagnostic: (d) => { r.diagnostics.push(d); },
    ...(options.typed ? { respond } : {}),
  });
  return r;
}
function omit(r: Rig, options: { narration?: boolean; compaction?: Compaction; heal?: boolean; capture?: boolean } = {}) {
  if (options.narration) r.narration();
  if (options.capture) r.capturePayload({ score: 777 });
  const failed = r.sm.appendMessage(assistant("omitted error text is never answer text", "error", RAW_ERROR));
  r.sm.appendContextEdit(failed, null);
  if (options.compaction) r.sm.appendCompaction("scripted own summary", options.compaction === "kept-user" ? r.ownId! : failed, 200000);
  if (options.heal) r.sm.appendMessage(assistant("777"));
  r.idle = true;
}
async function turn(r: Rig) {
  const result = await r.model.nextFreePhaseTurn(0);
  r.cleanup();
  expect(r.sends).toEqual([QUERY]);
  expect(scripted.calls).toEqual([]);
  return result;
}
async function loop(r: Rig, typed = false) {
  const result = await (typed ? runTypedQueryLoop : runUntypedQueryLoop)(CHECKPOINT, r.thetaAbort.signal, r.model, CONFIG);
  r.cleanup();
  expect(r.sends).toEqual([QUERY]);
  expect(scripted.calls).toEqual([]);
  return result;
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });
afterEach(() => { vi.restoreAllMocks(); });

describe("0499 omission disposition across start and compaction", () => {
  it.each([false, true])("round-zero omission proves own start even between polls (fast=%s)", async (fast) => {
    const r = rig((r) => omit(r), { fast });
    expect(await turn(r)).toEqual({ kind: "transport", error: omissionError() });
    expect(r.polls, "raw start evidence does not shorten the final unanswered-slice bound").toBe((fast ? 0 : 1) + TURN_SETTLE_POLL_BOUND);
    expect(r.thetaAbort.signal.aborted, "unobserved backoff cancellation is not invented").toBe(false);
    expect(messages(r.sm).filter((m) => m.role === "assistant")).toHaveLength(3); // only old history remains
  });
  it("fixes the message stem byte-for-byte, including its final space", () => {
    expect(PROMPT_MODE_HOST_OMITTED_RECOVERY_MESSAGE).toBe("on-session host recovery did not complete: ");
  });
  it("does not bind earlier narration even when the projection already appears settled", async () => {
    const r = rig((r) => omit(r, { narration: true }));
    expect(await loop(r)).toMatchObject({ kind: "transport", error: omissionError() });
    expect(r.polls).toBe(1);
    expect(r.thetaAbort.signal.aborted).toBe(false);
  });
  it.each(["kept-user", "split-turn"] as const)("unhealed %s compaction spends the full settle bound, then names the omission", async (compaction) => {
    const r = rig((r) => omit(r, { narration: true, compaction }));
    expect(await turn(r)).toEqual({ kind: "transport", error: omissionError() });
    expect(r.polls).toBe(1 + TURN_SETTLE_POLL_BOUND);
    expect(r.thetaAbort.signal.aborted).toBe(false);
  });
  it.each(["kept-user", "split-turn"] as const)("healed %s compaction extracts the unchanged host projection", async (compaction) => {
    const r = rig((r) => omit(r, { narration: true, compaction, heal: true }));
    expect(await turn(r)).toEqual({ kind: "text", text: compaction === "kept-user" ? `${PARTIAL}\n777` : "777" });
    expect(r.polls).toBe(1);
    const own = messages(r.sm).findIndex((m) => m.role === "user" && m.content === QUERY);
    expect(own).toBe(compaction === "kept-user" ? 1 : -1);
  });
  it("the new OwnedTurnRead evidence remains raw error metadata, never answer text", async () => {
    const r = rig((r) => omit(r, { narration: true, compaction: "kept-user" }));
    const attempt = new OwnedTurnAttempt(messages(r.sm), r.sm.getBranch(), QUERY);
    await turn(r);
    expect(attempt.read(messages(r.sm), r.sm.getBranch(), true).omission).toEqual({ errorMessage: RAW_ERROR, stopReason: "error" });
    r.sm.appendMessage(assistant("777"));
    expect(attempt.read(messages(r.sm), r.sm.getBranch(), true).omission).toBeUndefined();
  });
  it("a later visible failure heals the omission but keeps its ordinary PIC-51 failure", async () => {
    const r = rig((r) => { omit(r, { narration: true }); r.sm.appendMessage(assistant("new failed reply", "error", "new visible error")); });
    expect(await turn(r)).toEqual({ kind: "transport", error: { kind: "transport", message: "new visible error", http_status: null, provider: MODEL.api, retryable: false } });
  });
});

describe("0499 typed capture, forced dispatch and real repair composition", () => {
  it.each([false, true])("unhealed free-phase omission blocks forced provider dispatch (captured=%s)", async (capture) => {
    const r = rig((r) => omit(r, { narration: true, capture }), { typed: true });
    const free = await turn(r);
    const forced = await r.model.forcedRespondTurn();
    r.cleanup();
    expect(scripted.calls, "direct forced entry must be guarded even without an early capture").toEqual([]);
    expect(r.sends).toEqual([QUERY]);
    expect(free).toEqual({ kind: "transport", error: omissionError() });
    expect(forced, "even a directly requested forced turn cannot consume the capture or dispatch").toEqual({ kind: "transport", error: omissionError() });
  });
  it("the typed query loop stops in the free phase, before forced respond or validation", async () => {
    const r = rig((r) => omit(r, { narration: true, capture: true }), { typed: true });
    const validation = buildTypedQueryValidation({ lowered: LOWERED,
      schemaValidator: new AjvSchemaValidator({ emit: () => {}, slugOf: (schema) => ({ slug: "b0499", canonicalBytes: JSON.stringify(schema) }) }),
      attempts: 3, maxRounds: CONFIG.maxRounds, respondToolName: TOOL,
      driveFollowUp: (prompt) => r.model.driveRepairAttempt(prompt),
    });
    const validate = vi.spyOn(validation, "validate");
    const repair = vi.spyOn(validation, "runRespondRepair");
    const result = await runTypedQueryLoop(CHECKPOINT, r.thetaAbort.signal, r.model, CONFIG, validation);
    r.cleanup();
    expect(r.sends).toEqual([QUERY]);
    expect(scripted.calls).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
    expect(repair).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "transport", error: omissionError(), forcedRespond: { dispatched: false } });
  });
  it("degraded fused typed path also refuses omitted partial JSON/text", async () => {
    const r = rig((r) => omit(r, { narration: true }));
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "transport", error: omissionError() });
    expect(r.sends).toEqual([QUERY]);
    expect(scripted.calls).toEqual([]);
    r.cleanup();
  });
  it.each([undefined, "kept-user", "split-turn"] as const)("legitimate early capture on a healed reply still wins (%s)", async (compaction) => {
    const r = rig((r) => omit(r, { narration: true, ...(compaction === undefined ? {} : { compaction }), heal: true, capture: true }), { typed: true });
    expect(await turn(r)).toEqual({ kind: "text", text: compaction === "split-turn" ? "777" : `${PARTIAL}\n777` });
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(scripted.calls).toEqual([]);
    r.cleanup();
  });
  it("real typed/AJV/repair loop propagates a repair omission with zero validation-attempt debit and no repair dispatch", async () => {
    // The ordinary opening forced turn supplies an invalid provider payload;
    // do not fabricate a schema-invalid VALID early capture to reach repair.
    scripted.queue.push(() => ({ ...assistant("", "toolUse"), content: [
      { type: "toolCall", id: "invalid-opening", name: TOOL, arguments: { score: "not a number" } },
    ] }));
    const r = rig((r) => {
      if (r.sends.length === 1) { r.sm.appendMessage(assistant("777")); r.idle = true; }
      else omit(r, { narration: true, capture: true });
    }, { typed: true });
    const followUps: unknown[] = [];
    const validation = buildTypedQueryValidation({ lowered: LOWERED,
      schemaValidator: new AjvSchemaValidator({ emit: () => {}, slugOf: (schema) => ({ slug: "b0499", canonicalBytes: JSON.stringify(schema) }) }),
      attempts: 3, maxRounds: CONFIG.maxRounds, respondToolName: TOOL,
      driveFollowUp: async (prompt) => { const result = await r.model.driveRepairAttempt(prompt); followUps.push(result); return result; },
    });
    const validate = vi.spyOn(validation, "validate");
    const repair = vi.spyOn(validation, "runRespondRepair");
    const result = await runTypedQueryLoop(CHECKPOINT, r.thetaAbort.signal, r.model, CONFIG, validation);
    r.cleanup();
    expect(validate).toHaveBeenCalledTimes(1); // only the invalid opening capture, no repair payload
    expect(followUps).toEqual([{ kind: "provider_failure", error: omissionError() }]);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(await repair.mock.results[0]!.value).toEqual({ kind: "propagated", error: omissionError(), attemptsUsed: 0 });
    expect(result).toMatchObject({ kind: "propagated", error: omissionError() });
    expect(result).not.toHaveProperty("event");
    expect(result).not.toHaveProperty("error.attempts");
    expect(r.sends).toHaveLength(2);
    expect(r.sends[0]).toBe(QUERY);
    expect(r.sends[1]).toContain(TOOL); // real rendered repair prompt, not the original query
    expect(r.sends[1]).not.toBe(QUERY);
    expect(scripted.calls, "only the opening forced turn dispatches; failed repair adds none").toHaveLength(1);
    expect(r.thetaAbort.signal.aborted).toBe(false);
  });
  it("template-only max_rounds=0 has no own attempt and stays dispatchable despite old omitted history", async () => {
    const r = rig(() => { throw new Error("template-only query must not send"); }, { typed: true, maxRounds: 0 });
    const failed = r.sm.appendMessage(assistant("old error", "error", RAW_ERROR));
    r.sm.appendContextEdit(failed, null);
    scripted.queue.push(() => ({ ...assistant("", "toolUse"), content: [{ type: "toolCall", id: "respond-1", name: TOOL, arguments: { score: 777 } }] }));
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(r.sends).toEqual([]);
    expect(scripted.calls).toHaveLength(1);
  });
});

describe("0499 foreign boundary, cancellation and lifecycle precedence", () => {
  it.each([false, true])("foreign assistant cannot heal omitted own error (typed=%s)", async (typed) => {
    const r = rig((r) => {
      omit(r, { narration: true, capture: typed });
      r.sm.appendMessage(user("foreign calculation")); r.sm.appendMessage(assistant("222"));
    }, { typed });
    const attempt = new OwnedTurnAttempt(messages(r.sm), r.sm.getBranch(), QUERY);
    expect(await turn(r)).toEqual({ kind: "transport", error: interleavingError(typed) });
    expect(attempt.read(messages(r.sm), r.sm.getBranch(), true)).toMatchObject({ foreign: true, omission: { errorMessage: RAW_ERROR, stopReason: "error" } });
    if (typed) expect(await r.model.forcedRespondTurn()).toEqual({ kind: "transport", error: interleavingError(true) });
    expect(scripted.calls).toEqual([]);
    expect(r.thetaAbort.signal.aborted).toBe(false);
  });
  it.each([false, true])("recorded host abort ignores omitted retry residue and retains source reason (captured=%s)", async (capture) => {
    const r = rig((r) => { omit(r, { narration: true, capture }); r.hostAbort.abort(r.reason); }, { typed: capture, hostSignal: "recorded" });
    expect(await loop(r, capture)).toMatchObject({ kind: "cancelled" });
    expect(r.thetaAbort.signal.reason).toBe(r.reason);
    expect(r.abortCalls).toBe(1);
  });
  it("recorded abort over omitted-only round zero keeps the existing short grace, not PIC-79's full no-abort wait", async () => {
    const r = rig((r) => { omit(r); r.hostAbort.abort(r.reason); }, { hostSignal: "recorded" });
    expect(await loop(r)).toMatchObject({ kind: "cancelled" });
    expect(r.thetaAbort.signal.reason).toBe(r.reason);
    expect(r.polls).toBeGreaterThan(1);
    expect(r.polls).toBeLessThan(1 + TURN_SETTLE_POLL_BOUND);
  });
  it("post-settle host abort uses the agent_end synthesized source, not omitted raw retry evidence", async () => {
    const r = rig((r) => { omit(r, { narration: true, capture: true }); r.hostAbort.abort(r.reason); }, { typed: true, hostSignal: "postsettle" });
    expect(await loop(r, true)).toMatchObject({ kind: "cancelled" });
    expect(r.thetaAbort.signal.reason).not.toBe(r.reason);
    expect(String(r.thetaAbort.signal.reason)).toContain("theta cancelled by agent_end");
    expect(r.abortCalls).toBe(1);
  });
  it.each(["recorded", "postsettle", "theta"] as const)("%s cancellation outranks typed interleaving, omission and captured payload", async (source) => {
    const r = rig((r) => {
      omit(r, { narration: true, capture: true });
      r.sm.appendMessage(user("foreign calculation")); r.sm.appendMessage(assistant("222"));
      if (source === "theta") r.thetaAbort.abort(r.reason); else r.hostAbort.abort(r.reason);
    }, { typed: true, ...(source === "theta" ? {} : { hostSignal: source }) });
    expect(await loop(r, true)).toMatchObject({ kind: "cancelled" });
    if (source === "postsettle") expect(String(r.thetaAbort.signal.reason)).toContain("theta cancelled by agent_end");
    else expect(r.thetaAbort.signal.reason).toBe(r.reason);
    expect(r.abortCalls).toBe(1);
    expect(await r.model.forcedRespondTurn()).toMatchObject({ kind: "transport" });
    expect(scripted.calls).toEqual([]);
  });
  it("an omission cannot bypass the waitForIdle completion bound", async () => {
    const r = rig((r) => omit(r, { narration: true, capture: true }), { typed: true, idleWait: "timeout" });
    expect(await turn(r)).toEqual({ kind: "transport", error: { kind: "transport", message: `${PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE} (waited ${WAIT_FOR_IDLE_BOUND_MS}ms)`, http_status: null, provider: MODEL.api, retryable: false } });
    expect(r.polls).toBe(1);
  });
  it("an omission cannot be disposed while the session is active again after waitForIdle", async () => {
    const r = rig((r) => omit(r, { narration: true }), { idleWait: "resume" });
    expect(await turn(r)).toMatchObject({ kind: "transport", error: { message: expect.stringContaining(PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE), retryable: false } });
    expect(r.idle).toBe(false);
    expect(r.polls).toBe(1 + TURN_SETTLE_POLL_BOUND);
  });
});
