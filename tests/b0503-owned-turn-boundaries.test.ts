// Focused 0503 policy/provenance tests: real driver, governor and SDK session
// projection; scripted dispatch/clock, no provider. The separate immutable
// production/live witnesses prove parser/binder composition and host timing.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionManager, buildSessionContext, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Message, AssistantMessage, Model, Api } from "@earendil-works/pi-ai";
import { LivePromptQueryModel, type ActiveRespondCapture, type RespondTurnContext } from "../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";
import { OwnedTurnAttempt } from "../src/extension/owned-turn";
import { extractTrailingTurnText } from "../src/runtime/conversation-drive";
import { PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE, PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE } from "../src/runtime/prompt-transport-mapping";

const MODEL = { id: "fixture", provider: "anthropic", api: "anthropic-messages", contextWindow: 200000 } as Model<Api>;
const OWN = "Calculate 263 plus 514";
function assistant(text = "777", stopReason = "stop", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], timestamp: 0,
    api: MODEL.api, provider: MODEL.provider, model: MODEL.id, stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
  } as AssistantMessage;
}
function user(text: string): Message { return { role: "user", content: text, timestamp: 0 }; }
function messages(sm: SessionManager): readonly Message[] {
  // Same widened SDK projection as production's readMessages seam (summaries
  // and custom messages can be present outside pi-ai's Message union).
  return buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[];
}
function transport(typed = false) {
  return { kind: "transport", message: typed ? PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE : PROMPT_MODE_OWNERSHIP_UNRESOLVED_MESSAGE,
    http_status: null, provider: MODEL.api, retryable: true };
}

interface RigOptions {
  typed?: boolean; maxRounds?: number; suppressSend?: boolean; fast?: boolean;
  throwSendAt?: number; hostSignalOnlyIdle?: boolean; restore?: (rig: Rig) => void;
}
interface Rig {
  sm: SessionManager; model: LivePromptQueryModel; thetaAbort: AbortController; hostAbort: AbortController;
  sends: string[]; notes: string[]; idle: boolean; capture: ActiveRespondCapture | undefined; ownId: string | undefined;
  toolRound: () => void; step: (rig: Rig) => void; timers: Set<number>; polls: number;
}
function rig(step: (rig: Rig) => void, options: RigOptions = {}): Rig {
  const sm = SessionManager.inMemory();
  const thetaAbort = new AbortController();
  const hostAbort = new AbortController();
  const hooks = new Map<string, (event: unknown) => unknown>();
  const governor = new PromptToolLoopGovernor();
  let installs = 0;
  let nextTimer = 0;
  const r: Rig = { sm, thetaAbort, hostAbort, sends: [], notes: [], idle: true, capture: undefined,
    ownId: undefined, step, timers: new Set(), polls: 0,
    toolRound: () => {
      hooks.get("before_provider_request")?.({});
      hooks.get("tool_call")?.({ toolName: "fixture", toolCallId: "t1", input: {} });
    }, model: undefined as unknown as LivePromptQueryModel };
  const pi = {
    sendUserMessage(text: string): void {
      r.sends.push(text);
      if (options.throwSendAt === r.sends.length) throw new Error("send refused");
      if (!options.suppressSend) r.ownId = sm.appendMessage(user(text));
      r.idle = false;
      if (options.fast) r.step(r);
    },
    on: (name: string, hook: (event: unknown) => unknown) => hooks.set(name, hook),
    getActiveTools: () => [], setActiveTools: () => { if (++installs % 2 === 0) options.restore?.(r); },
    sendMessage: (note: { content: string }) => r.notes.push(note.content),
  } as unknown as ExtensionAPI;
  governor.ensureRegistered(pi);
  const respond: RespondTurnContext = {
    toolName: "__theta_respond_fixture", lowered: { type: "object" }, template: "Respond using the schema",
    model: MODEL, auth: async () => undefined, signal: thetaAbort.signal, validate: () => ({ ok: true }),
    captureHost: { setActiveCapture: (capture) => { r.capture = capture; }, clearActiveCapture: () => { r.capture = undefined; } },
  };
  r.model = new LivePromptQueryModel({
    pi, ctx: { model: MODEL, get signal() { return options.hostSignalOnlyIdle && !r.idle ? undefined : hostAbort.signal; }, isIdle: () => r.idle,
      waitForIdle: async () => {}, abort: () => { r.idle = true; } },
    clock: { now: () => r.polls * 10, wallNow: () => 0,
      setTimeout: (fn, ms) => {
        const id = ++nextTimer;
        if (ms === 10) { r.polls++; r.step(r); fn(); } else r.timers.add(id);
        return id;
      }, clearTimeout: (id) => { r.timers.delete(id as number); } },
    queryText: OWN, readMessages: () => messages(sm), readContextPath: () => sm.getBranch(),
    activeTools: [], thetaAbort, governor, maxRounds: options.maxRounds ?? 3, provider: MODEL.api,
    thetaName: "b0503", emitDiagnostic: () => {}, ...(options.typed ? { respond } : {}),
  });
  return r;
}
function finish(r: Rig, own?: AssistantMessage, foreign?: AssistantMessage, foreignText = "Foreign calculation") {
  if (own !== undefined) r.sm.appendMessage(own);
  r.sm.appendMessage(user(foreignText));
  if (foreign !== undefined) r.sm.appendMessage(foreign);
  r.idle = true;
}
async function turn(r: Rig) {
  const result = await r.model.nextFreePhaseTurn(0);
  expect(r.sends).toHaveLength(1);
  expect(r.timers.size, "idle-race timer always cleared").toBe(0);
  return result;
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

describe("0503 bounded driver consumers", () => {
  it("keeps own ending when the foreign user has no reply", async () => {
    const r = rig((r) => finish(r, assistant()));
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
  });
  it("refuses missing own ending rather than borrowing a foreign ending", async () => {
    const r = rig((r) => finish(r, undefined, assistant("222")));
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
    expect(r.notes).toEqual([]);
  });
  it.each(["error", "length"])("classifies own %s, not foreign success", async (reason) => {
    const r = rig((r) => finish(r, assistant("partial", reason, reason === "error" ? "own failure" : undefined), assistant("222")));
    expect(await turn(r)).toMatchObject({ kind: "transport", error: reason === "length"
      ? { kind: "context_overflow" } : { kind: "transport", message: "own failure", retryable: false } });
  });
  it.each(["error", "length"])("does not attribute foreign %s to own success", async (reason) => {
    const r = rig((r) => finish(r, assistant(), assistant("foreign error", reason, "foreign failure")));
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
  });
  it("preserves empty text and multiple own assistant rounds, excluding error residue", async () => {
    const r = rig((r) => {
      r.sm.appendMessage(assistant("retry residue", "error", "retryable"));
      r.sm.appendMessage(assistant("first"));
      r.sm.appendMessage(assistant(""));
      finish(r, assistant("last"), assistant("222"));
    });
    expect(await turn(r)).toEqual({ kind: "text", text: "first\n\nlast" });
  });
  it("settles fast own+foreign without using the foreign turn as started evidence", async () => {
    const r = rig((r) => finish(r, assistant(), assistant("222")), { fast: true });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
    expect(r.polls).toBe(0);
  });
  it("names unresolved attribution if a swallowed send leaves only a distinct foreign turn", async () => {
    const r = rig((r) => finish(r, undefined, assistant("222")), { suppressSend: true, fast: true });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
  });
  it("does not guess between multiple same-text user candidates", async () => {
    const r = rig((r) => finish(r, assistant(), assistant("222"), OWN));
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
  });
  it("does not select an identifiable own send after an earlier unmatched fresh user", async () => {
    const r = rig((r) => { r.sm.appendMessage(user("raced first")); r.sm.appendMessage(user(OWN)); r.sm.appendMessage(assistant()); r.idle = true; }, { suppressSend: true });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
  });
  it("retains the accepted snapshot when a foreign turn arrives during window restoration", async () => {
    const r = rig((r) => { r.sm.appendMessage(assistant()); r.idle = true; }, {
      restore: (r) => { r.sm.appendMessage(user("late foreign")); r.sm.appendMessage(assistant("222")); },
    });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
  });
  it("ordinary custom messages stay inside the own turn rather than creating a boundary", async () => {
    const r = rig((r) => {
      r.sm.appendCustomMessageEntry("fixture-note", "own custom message", true);
      finish(r, assistant(), assistant("222"));
    });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
  });
  it("foreign compaction cannot unsettle own committed answer", async () => {
    const r = rig((r) => { finish(r, assistant(), assistant("222")); r.sm.appendCompaction("foreign summary", r.ownId!, 10); });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
  });
  it("foreign reply cannot heal own unanswered compaction", async () => {
    const r = rig((r) => { r.sm.appendMessage(assistant("partial")); r.sm.appendCompaction("own summary", r.ownId!, 10); finish(r, undefined, assistant("222")); });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
  });
  it.each(["user", "assistant", "foreign-user"])("fails conservatively after projection omission of %s", async (target) => {
    const r = rig((r) => {
      const ownAssistant = r.sm.appendMessage(assistant());
      const foreignUser = r.sm.appendMessage(user("foreign"));
      r.sm.appendMessage(assistant("222"));
      r.sm.appendContextEdit(target === "user" ? r.ownId! : target === "assistant" ? ownAssistant : foreignUser, null);
      r.idle = true;
    });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
  });
  it("refuses unscoped governor accounting instead of fabricating own exhaustion", async () => {
    const r = rig((r) => { r.toolRound(); finish(r, assistant(), assistant("222")); }, { maxRounds: 1 });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport() });
    expect(r.notes).toEqual([]);
  });
  it("recorded abort+foreign turn cancels with latest reason; never rides a retryable foreign error", async () => {
    const reason = new Error("latest source reason");
    const r = rig((r) => { r.hostAbort.abort(reason); finish(r, assistant(), assistant("residue", "error", "provider returned error")); });
    await turn(r);
    expect(r.thetaAbort.signal.reason).toBe(reason);
    expect(r.notes).toEqual([]);
  });
  it("post-settle abort+foreign window cancels using CNCL-4 synthesis", async () => {
    const r = rig((r) => { r.hostAbort.abort(new Error("unrecorded")); finish(r, assistant(), assistant("222")); }, { hostSignalOnlyIdle: true });
    await turn(r);
    expect(r.thetaAbort.signal.aborted).toBe(true);
    expect(String(r.thetaAbort.signal.reason)).toContain("theta cancelled by agent_end");
    expect(r.notes).toEqual([]);
  });
  it("multiple distinct foreign users cannot move the retained own anchor", async () => {
    const r = rig((r) => { finish(r, assistant(), assistant("222")); r.sm.appendMessage(user("another foreign")); r.sm.appendMessage(assistant("333")); });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
  });
  it("a normal empty own answer remains a success, not a missing ending", async () => {
    const r = rig((r) => finish(r, assistant(""), assistant("222")));
    expect(await turn(r)).toEqual({ kind: "text", text: "" });
  });
  it("degraded fused payload consumes bounded own text too", async () => {
    const r = rig((r) => finish(r, assistant("777"), assistant("222")));
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: 777 });
    expect(r.sends).toHaveLength(1);
  });
  it("a failed later send cannot reuse the preceding accepted snapshot", async () => {
    const r = rig((r) => { r.sm.appendMessage(assistant()); r.idle = true; }, { throwSendAt: 2 });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
    expect(await r.model.nextFreePhaseTurn(0)).toMatchObject({ kind: "transport", error: { message: "send refused", retryable: false } });
    expect(r.sends).toHaveLength(2);
  });
  it("thetaAbort outranks a committed own reply and interleaving", async () => {
    const reason = new Error("parent cancel");
    const r = rig((r) => { finish(r, assistant(), assistant("222")); r.thetaAbort.abort(reason); });
    await turn(r);
    expect(r.thetaAbort.signal.reason).toBe(reason);
    expect(r.notes).toEqual([]);
  });
});

describe("0503 typed replay/capture/repair refusal", () => {
  it("template-only max_rounds=0 has no replay window and remains dispatchable", async () => {
    const r = rig(() => { throw new Error("max_rounds=0 must not send"); }, { typed: true, maxRounds: 0 });
    r.sm.appendMessage(user("earlier unrelated turn"));
    r.sm.appendMessage(assistant("222"));
    scripted.queue.push(() => ({ ...assistant("", "toolUse"), content: [{ type: "toolCall", id: "respond-1", name: "__theta_respond_fixture", arguments: { score: 777 } }] }));
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(r.sends).toEqual([]);
    expect(scripted.calls).toHaveLength(1);
  });
  it.each([false, true])("rejects contaminated window before forced dispatch (captured=%s)", async (captured) => {
    const r = rig((r) => {
      if (captured) { r.capture!.captured = true; r.capture!.payload = { score: 777 }; }
      finish(r, assistant(), assistant("222"));
    }, { typed: true });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport(true) });
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "transport", error: transport(true) });
    expect(scripted.calls).toEqual([]);
  });
  it("checks again after snapshot/at restoration, before consuming even an own capture", async () => {
    const r = rig((r) => { r.capture!.captured = true; r.capture!.payload = { score: 777 }; r.sm.appendMessage(assistant()); r.idle = true; }, {
      typed: true, restore: (r) => { r.sm.appendMessage(user("late foreign")); r.sm.appendMessage(assistant("222")); },
    });
    expect(await turn(r)).toEqual({ kind: "transport", error: transport(true) });
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "transport", error: transport(true) });
    expect(scripted.calls).toEqual([]);
  });
  it("sticky guard prevents a repair send and maps to provider_failure with no validation outcome", async () => {
    const r = rig((r) => finish(r, assistant(), assistant("222")), { typed: true });
    await turn(r);
    expect(await r.model.driveRepairAttempt("repair")).toEqual({ kind: "provider_failure", error: transport(true) });
    expect(r.sends).toHaveLength(1);
    expect(scripted.calls).toEqual([]);
  });
  it("interleaving first observed in restarted repair is its non-validation provider failure", async () => {
    const r = rig((r) => { r.sm.appendMessage(assistant()); r.idle = true; }, { typed: true });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
    r.step = (r) => finish(r, assistant(), assistant("222"));
    expect(await r.model.driveRepairAttempt("repair")).toEqual({ kind: "provider_failure", error: transport(true) });
    expect(r.sends).toEqual([OWN, "repair"]);
    expect(scripted.calls).toEqual([]);
  });
  it("healthy no-interleaving early capture still wins without dispatch", async () => {
    const r = rig((r) => { r.capture!.captured = true; r.capture!.payload = { score: 777 }; r.sm.appendMessage(assistant()); r.idle = true; }, { typed: true });
    expect(await turn(r)).toEqual({ kind: "text", text: "777" });
    expect(await r.model.forcedRespondTurn()).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(scripted.calls).toEqual([]);
  });
});

it.each([null, { content: [{ type: "text" as const, text: "edited own prompt" }] }])("0503 own user projection edit is not a new anchor (%s)", (replacement) => {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), OWN);
  const own = sm.appendMessage(user(OWN));
  sm.appendMessage(assistant());
  sm.appendMessage(user("foreign")); sm.appendMessage(assistant("222"));
  sm.appendContextEdit(own, replacement);
  expect(attempt.read(messages(sm), sm.getBranch(), false)).toMatchObject({ settled: false, foreign: true, messages: undefined });
});

it("0503 pinned identity loss cannot retarget to a different branch's foreign user", () => {
  const sm = SessionManager.inMemory();
  const earlier = sm.appendMessage(user("history"));
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), OWN);
  sm.appendMessage(user(OWN)); sm.appendMessage(assistant());
  expect(attempt.read(messages(sm), sm.getBranch(), false).settled).toBe(true);
  sm.branch(earlier);
  sm.appendMessage(user("foreign branch")); sm.appendMessage(assistant("222"));
  expect(attempt.read(messages(sm), sm.getBranch(), false)).toMatchObject({ settled: false, foreign: true, messages: undefined });
});

it("0503 relocation remains gated: the resolver does not ungate no-abort anchor drift (0501)", () => {
  const sm = SessionManager.inMemory();
  for (let i = 0; i < 3; i++) { sm.appendMessage(user("old")); sm.appendMessage(assistant("old")); }
  const attempt = new OwnedTurnAttempt(messages(sm), sm.getBranch(), OWN);
  const own = sm.appendMessage(user(OWN));
  sm.appendCompaction("summary", own, 100);
  sm.appendMessage(assistant());
  expect(attempt.read(messages(sm), sm.getBranch(), false).settled).toBe(false);
  const relocated = attempt.read(messages(sm), sm.getBranch(), true);
  expect(relocated).toMatchObject({ settled: true, relocated: true, foreign: false });
  expect(extractTrailingTurnText(relocated.messages!)).toBe("777");
  sm.appendMessage(user("foreign")); sm.appendMessage(assistant("222"));
  const bounded = attempt.read(messages(sm), sm.getBranch(), true);
  expect(bounded).toMatchObject({ settled: true, relocated: true, foreign: true });
  expect(extractTrailingTurnText(bounded.messages!)).toBe("777");
});
