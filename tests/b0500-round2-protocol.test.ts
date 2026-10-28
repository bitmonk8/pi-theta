// Round-2 recovery protocol regression: synthetic provider responses only.
// No transcript/config/provider access; real AJV + outer repair orchestration.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Ajv from "ajv";
import type { Api, AssistantMessage, Context, Model, ToolCall } from "@earendil-works/pi-ai";
import { dispatchFinalization, FINALIZATION_ABSTAIN, FINALIZATION_BOUND_MS } from "../src/extension/off-session-finalization";
import type { RespondTurnContext } from "../src/extension/respond-capture";
import { AjvSchemaValidator } from "../src/seams/ajv-schema-validator";
import type { LoweredSchema } from "../src/seams/schema-validator";
import { runTypedQueryLoop } from "../src/runtime/query-tool-loop";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import { RecordingFakeClock, flush } from "./helpers/fake-clock";

const TOOL = "__theta_finalize";
const MODEL = { api: "openai-responses", provider: "openai", id: "b0500-round2", contextWindow: 200000 } as Model<Api>;
const BUSINESS: LoweredSchema = { type: "object", properties: { score: { type: "number" } }, required: ["score"], additionalProperties: false };
function reply(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return { role: "assistant", content, api: MODEL.api, provider: MODEL.provider, model: MODEL.id, timestamp: 0, stopReason } as AssistantMessage;
}
function submit(arguments_: unknown, name = TOOL): AssistantMessage {
  return reply([{ type: "toolCall", id: "submission", name, arguments: arguments_ } as ToolCall], "toolUse");
}
function answer(wire: unknown): AssistantMessage { return submit({ outcome: "answer", answer: wire }); }
function textAnswer(text: string): AssistantMessage { return reply([{ type: "text", text: JSON.stringify({ outcome: "answer", text }) }]); }
function rejected(message = "tool_choice is not supported"): AssistantMessage { return { ...reply([], "error"), errorMessage: message }; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function rig(lowered: LoweredSchema = BUSINESS, typed = true) {
  const controller = new AbortController();
  const clock = new RecordingFakeClock();
  const ajv = new Ajv({ strict: false });
  const compiled = ajv.compile(lowered);
  const validate = vi.fn((value: unknown): ReturnType<RespondTurnContext["validate"]> => compiled(value) ? { ok: true } : { ok: false, message: "schema mismatch" });
  const auth = vi.fn(async (): Promise<undefined> => undefined);
  const captureHost = { setActiveCapture: vi.fn(), clearActiveCapture: vi.fn() };
  const respond: RespondTurnContext = { toolName: "__theta_respond_business", lowered, template: "Call __theta_respond_business with score.", model: MODEL, auth, signal: controller.signal, validate, captureHost };
  const input = { context: { model: MODEL, auth: respond.auth }, ...(typed ? { respond } : {}),
    evidence: { retained: [reply([{ type: "text", text: "Observed receipt total: 777" }])], terminalRetained: true },
    query: "Report the observed receipt total.", signal: controller.signal, clock };
  return { input, controller, clock, validate, auth, captureHost, lowered };
}
function expectFailure(value: unknown) {
  expect(value).toMatchObject({ kind: "transport", error: { kind: "transport", retryable: false, message: expect.stringContaining("finalization failed") } });
}
// A dedicated pre-fix depth witness uses whichever wire protocol the request
// advertises. All acceptance tests below instead pin the new protocol exactly.
function advertisedAnswer(call: { context: unknown }, wire: unknown) {
  const name = (call.context as Context).tools![0]!.name;
  return name === TOOL ? answer(wire) : submit(wire, name);
}
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

describe("0500 round 2 disjoint recovery protocol", () => {
  it("forces only the private recovery tool; answer contains original wire payload", async () => {
    const r = rig(); scripted.queue.push(() => answer({ score: 777 }));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: { score: 777 } });
    const call = scripted.calls[0]!;
    const context = call.context as Context;
    expect(context.tools?.map(t => t.name)).toEqual([TOOL]);
    expect(call.options).toMatchObject({ toolChoice: { type: "function", name: TOOL }, maxRetries: 0 });
    expect(context.messages.map(m => m.role)).toEqual(["user"]);
    const prompt = JSON.stringify(context.messages);
    expect(prompt).toContain('abstain');
    expect(prompt).not.toContain(r.input.respond!.template);
    const schema = context.tools![0]!.parameters;
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate({ outcome: "answer", answer: { score: 777 } })).toBe(true);
    expect(validate({ outcome: "abstain" })).toBe(true);
    expect(validate({ outcome: "abstain", answer: { score: 777 } })).toBe(false);
    expect(r.validate).toHaveBeenCalledTimes(1);
    expect(r.validate).toHaveBeenCalledWith({ score: 777 });
    expect(r.captureHost.setActiveCapture).not.toHaveBeenCalled();
    expect(r.captureHost.clearActiveCapture).not.toHaveBeenCalled();
  });
  it("typed abstention is representable even under the forced tool and never AJV-validates a business value", async () => {
    const r = rig(); scripted.queue.push(() => submit({ outcome: "abstain" }));
    expectFailure(await dispatchFinalization(r.input));
    expect(r.validate).not.toHaveBeenCalled(); expect(scripted.calls).toHaveLength(1);
  });
  it.each([
    null, [], {}, { outcome: "unknown" }, { outcome: "answer" },
    { outcome: "answer", answer: { score: 777 }, extra: true },
    { outcome: "abstain", answer: { score: 777 } }, { outcome: "abstain", reason: "not in protocol" },
    { outcome: ["answer", "abstain"], answer: { score: 777 } },
  ])("malformed or ambiguous metadata fails before business AJV: %j", async metadata => {
    const r = rig(); scripted.queue.push(() => submit(metadata));
    expectFailure(await dispatchFinalization(r.input)); expect(r.validate).not.toHaveBeenCalled();
    expect(scripted.calls).toHaveLength(1);
  });
  it("does not mistake legitimate sentinel text in a typed answer or adjacent prose for abstention", async () => {
    const r = rig({ type: "string" });
    scripted.queue.push(() => ({ ...answer({ value: FINALIZATION_ABSTAIN }), content: [{ type: "text", text: `The term ${FINALIZATION_ABSTAIN} is data.` }, ...answer({ value: FINALIZATION_ABSTAIN }).content] }));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: FINALIZATION_ABSTAIN });
  });
  it.each([
    { lowered: { type: "string" }, wire: { value: "ok" }, payload: "ok" },
    { lowered: { type: "number" }, wire: { value: 777 }, payload: 777 },
    { lowered: { type: "boolean" }, wire: { value: false }, payload: false },
    { lowered: { type: "null" }, wire: { value: null }, payload: null },
    { lowered: { type: "array", items: { type: "integer" } }, wire: { value: "[263,514]" }, payload: [263, 514] },
    { lowered: { type: "object", properties: { nested: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] } }, required: ["nested"] }, wire: { nested: '{"n":777}' }, payload: { nested: { n: 777 } } },
  ])("preserves primitive/array/object wire unwrapping: $lowered.type", async ({ lowered, wire, payload }) => {
    const r = rig(lowered as LoweredSchema); scripted.queue.push(() => answer(wire));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload });
    expect(r.validate).toHaveBeenCalledTimes(1);
    expect(r.validate).toHaveBeenCalledWith(payload);
  });
  it.each([
    { type: "object", $defs: { Item: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] } }, properties: { item: { $ref: "#/$defs/Item" } }, required: ["item"] },
    { type: "array", $defs: { Item: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] } }, items: { $ref: "#/$defs/Item" } },
    { $ref: "#/$defs/Item", $defs: { Item: { type: "object", properties: { n: { type: "integer" } }, required: ["n"] } } },
    { type: "object", properties: { item: { type: "integer" }, copy: { $ref: "#/properties/item" } }, required: ["item", "copy"] },
  ])("preserves local refs in presented recovery schema and original coercion without mutating input: %j", async lowered => {
    const original = JSON.stringify(lowered);
    const r = rig(lowered);
    const array = lowered.type === "array";
    const refRoot = lowered.$ref !== undefined;
    const wire = array ? { value: '[{"n":777}]' } : refRoot ? { value: { n: 777 } } : lowered.$defs ? { item: '{"n":777}' } : { item: 777, copy: 777 };
    const decoded = array ? [{ n: 777 }] : refRoot ? { n: 777 } : lowered.$defs ? { item: { n: 777 } } : wire;
    scripted.queue.push(() => answer(wire));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: decoded });
    const recoverySchema = (scripted.calls[0]!.context as Context).tools![0]!.parameters;
    const validateWire = new Ajv({ strict: false }).compile(recoverySchema);
    const structuredWire = array ? { value: decoded } : refRoot ? { value: decoded } : decoded;
    expect(validateWire({ outcome: "answer", answer: structuredWire })).toBe(true);
    expect(validateWire({ outcome: "abstain" })).toBe(true);
    expect(JSON.stringify(lowered)).toBe(original);
  });
  it("schema relocation does not rewrite business const data named $ref", async () => {
    const r = rig({ type: "object", properties: { literal: { const: { $ref: "#/business-data" } } }, required: ["literal"] });
    const wire = { literal: { $ref: "#/business-data" } }; scripted.queue.push(() => answer(wire));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: wire });
    const schema = (scripted.calls[0]!.context as Context).tools![0]!.parameters;
    expect(new Ajv({ strict: false }).compile(schema)({ outcome: "answer", answer: wire })).toBe(true);
  });
  it.each(["none", "duplicate", "wrong-business-tool", "operational-tool"])("refuses %s submissions with no execution or business validation", async kind => {
    const r = rig(); scripted.queue.push(() => kind === "none" ? reply([]) : kind === "duplicate" ? reply([...answer({ score: 777 }).content, ...answer({ score: 777 }).content], "toolUse") : submit({ score: 777 }, kind === "operational-tool" ? "bash" : r.input.respond!.toolName));
    expectFailure(await dispatchFinalization(r.input)); expect(r.validate).not.toHaveBeenCalled(); expect(scripted.calls).toHaveLength(1);
  });
  it.each(["error", "aborted", "length", "pending", undefined] as const)("a valid submission cannot launder an invalid response ending: %s", async stopReason => {
    const r = rig(); scripted.queue.push(() => ({ ...answer({ score: 777 }), stopReason }));
    expectFailure(await dispatchFinalization(r.input)); expect(r.validate).not.toHaveBeenCalled(); expect(scripted.calls).toHaveLength(1);
  });
  it("untyped has zero tools, disjoint refusal, and sentinel strings remain legitimate text", async () => {
    const r = rig(BUSINESS, false); scripted.queue.push(() => textAnswer(FINALIZATION_ABSTAIN));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "text", text: FINALIZATION_ABSTAIN });
    expect((scripted.calls[0]!.context as Context).tools).toEqual([]);
    expect((scripted.calls[0]!.options as Record<string, unknown>).toolChoice).toBeUndefined();
  });
  it("untyped can answer with text that itself resembles the entire refusal protocol", async () => {
    const r = rig(BUSINESS, false); const text = '{"outcome":"abstain"}'; scripted.queue.push(() => textAnswer(text));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "text", text });
  });
  it.each(['{"outcome":"abstain"}', '{"outcome":"answer","text":""}', 'plain answer without protocol', '{"outcome":"answer","text":"ok","extra":true}', '{"outcome":"abstain","text":"ok"}'])("untyped rejects missing/ambiguous/abstaining text envelope: %s", async text => {
    const r = rig(BUSINESS, false); scripted.queue.push(() => reply([{ type: "text", text }]));
    expectFailure(await dispatchFinalization(r.input)); expect(scripted.calls).toHaveLength(1);
  });
});

function nested(depth: number): unknown { return depth === 1 ? 777 : { child: nested(depth - 1) }; }
describe("0500 round 2 depth-before-AJV and outer no-repair", () => {
  it("pre-fix witness: actual payload depth 6 never reaches AJV even under permissive business schema", async () => {
    const r = rig({ type: "object" }); scripted.queue.push(call => advertisedAnswer(call, nested(6)));
    expectFailure(await dispatchFinalization(r.input)); expect(r.validate).not.toHaveBeenCalled();
  });
  it("depth 5 business payload succeeds despite protocol wrapper adding depth", async () => {
    const r = rig({ type: "object" }); scripted.queue.push(() => answer(nested(5)));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: nested(5) });
  });
  it("depth is checked after schema-directed wire decoding and unwrapping", async () => {
    const lowered = { type: "array", items: { type: "object" } };
    const r = rig(lowered); scripted.queue.push(() => answer({ value: JSON.stringify([nested(5)]) }));
    expectFailure(await dispatchFinalization(r.input)); expect(r.validate).not.toHaveBeenCalled();
  });
  it.each([0, 3])("outer production validation refuses malformed/abstain/depth/missing/ambiguous with repair budget %i and zero repair entry", async attempts => {
    const fixtures = [() => answer({ score: "bad" }), () => submit({ outcome: "abstain" }), () => answer({ score: 777, extra: nested(6) }), () => reply([]), () => reply([...answer({ score: 777 }).content, ...answer({ score: 777 }).content], "toolUse")];
    for (const fixture of fixtures) {
      scripted.calls.length = 0; scripted.queue.length = 0;
      const r = rig(); scripted.queue.push(fixture);
      const driveFollowUp = vi.fn(async () => "{} faked repair");
      const validation = buildTypedQueryValidation({ lowered: BUSINESS, attempts, maxRounds: 1, respondToolName: r.input.respond!.toolName,
        schemaValidator: new AjvSchemaValidator({ emit: () => {}, slugOf: schema => ({ slug: "b0500-round2", canonicalBytes: JSON.stringify(schema) }) }), driveFollowUp });
      const repair = vi.spyOn(validation, "runRespondRepair");
      const free = vi.fn(async () => ({ kind: "text" as const, text: "operational phase already settled" }));
      const batch = vi.fn(async () => []);
      const result = await runTypedQueryLoop({ before: async () => {} }, r.input.signal, {
        nextFreePhaseTurn: free, runToolBatch: batch, forcedRespondTurn: async () => {
          const turn = await dispatchFinalization(r.input);
          if (turn.kind === "text") throw new Error("typed finalization returned text");
          return turn;
        },
      }, { maxRounds: 1, querySite: { file: "round2.theta", line: 1, column: 1 }, thetaSlashName: "/b0500-round2", invocationId: "round2", occurredAt: 0 }, validation);
      expectFailure(result); expect(repair).not.toHaveBeenCalled(); expect(driveFollowUp).not.toHaveBeenCalled();
      expect(free).toHaveBeenCalledTimes(1); expect(batch).not.toHaveBeenCalled(); expect(scripted.calls).toHaveLength(1);
      expect(r.captureHost.setActiveCapture).not.toHaveBeenCalled();
    }
  });
});

describe("0500 round 2 one deadline and narrow fallback", () => {
  it.each([false, true])("one forcing-rejection fallback (%s thrown), identical tool/context, one auth", async thrown => {
    const r = rig(); scripted.queue.push(() => { if (thrown) throw new Error("tool_choice is not supported"); return rejected(); }, () => answer({ score: 777 }));
    expect(await dispatchFinalization(r.input)).toEqual({ kind: "respond", payload: { score: 777 } });
    expect(scripted.calls).toHaveLength(2); expect(scripted.calls[0]!.context).toEqual(scripted.calls[1]!.context);
    expect((scripted.calls[1]!.options as Record<string, unknown>).toolChoice).toBeUndefined();
    expect(r.auth).toHaveBeenCalledTimes(1); expect(r.clock.armedWindows).toEqual([FINALIZATION_BOUND_MS]);
  });
  it.each(["429 rate limited", "unsupported schema", "invalid request", "context overflow"])("does not fall back on unrelated rejection: %s", async message => {
    const r = rig(); scripted.queue.push(() => { throw new Error(message); });
    expectFailure(await dispatchFinalization(r.input)); expect(scripted.calls).toHaveLength(1);
  });
  it("a repeated forcing rejection is terminal at two calls", async () => {
    const r = rig(); scripted.queue.push(() => rejected()); expectFailure(await dispatchFinalization(r.input)); expect(scripted.calls).toHaveLength(2);
  });
  it("already-cancelled invocation makes zero auth/provider calls and arms no timer", async () => {
    const r = rig(); r.controller.abort("before entry"); expectFailure(await dispatchFinalization(r.input));
    expect(r.auth).not.toHaveBeenCalled(); expect(scripted.calls).toHaveLength(0); expect(r.clock.armedWindows).toEqual([]);
  });
  it("synchronous auth abort plus throw still gives cancellation precedence", async () => {
    const r = rig(); r.input.context.auth = () => { r.controller.abort("during auth"); throw new Error("auth rejected"); };
    expect(await dispatchFinalization(r.input)).toMatchObject({ kind: "transport", error: { message: "query output finalization failed: cancelled", retryable: false } });
    expect(scripted.calls).toHaveLength(0);
  });
  it("proof invalidation at the final Promise.race acceptance boundary refuses a valid payload", async () => {
    const r = rig(); let checks = 0; scripted.queue.push(() => answer({ score: 777 }));
    expectFailure(await dispatchFinalization({ ...r.input, eligible: () => ++checks < 3 }));
    expect(checks).toBe(3); expect(scripted.calls).toHaveLength(1);
  });
  it("hanging auth expires at 60s and cannot dispatch when it eventually resolves", async () => {
    const r = rig(); const auth = deferred<undefined>(); r.input.context.auth = () => auth.promise;
    const clear = vi.spyOn(r.clock, "clearTimeout");
    const pending = dispatchFinalization(r.input); r.clock.advance(60_000); expectFailure(await pending);
    auth.resolve(undefined); await flush(); expect(scripted.calls).toHaveLength(0); expect(clear).toHaveBeenCalledTimes(1);
  });
  it("auth, initial request and fallback share the full 60s, with no late acceptance", async () => {
    const r = rig(); const auth = deferred<undefined>(); const first = deferred<AssistantMessage>(); const fallback = deferred<AssistantMessage>();
    r.input.context.auth = () => auth.promise; scripted.queue.push(() => first.promise, () => fallback.promise);
    const pending = dispatchFinalization(r.input);
    r.clock.advance(20_000); auth.resolve(undefined); await flush(); expect(scripted.calls).toHaveLength(1);
    r.clock.advance(20_000); first.resolve(rejected()); await flush(); expect(scripted.calls).toHaveLength(2);
    r.clock.advance(19_999); await flush();
    let done = false; void pending.then(() => { done = true; }); await flush(); expect(done).toBe(false);
    r.clock.advance(1); expectFailure(await pending);
    expect((scripted.calls[1]!.options as { signal: AbortSignal }).signal.aborted).toBe(true);
    fallback.resolve(answer({ score: 777 })); await flush(); expect(r.validate).not.toHaveBeenCalled(); expect(scripted.calls).toHaveLength(2);
    expect(r.clock.armedWindows).toEqual([60_000]);
  });
  it.each(["auth", "initial", "fallback"])("cancellation during %s awaits returns promptly and blocks late work", async phase => {
    const r = rig(); const gate = deferred<AssistantMessage>(); const auth = deferred<undefined>();
    if (phase === "auth") r.input.context.auth = () => auth.promise;
    scripted.queue.push(() => phase === "fallback" ? rejected() : gate.promise, () => gate.promise);
    const pending = dispatchFinalization(r.input); await flush();
    r.controller.abort("cancel test"); expectFailure(await pending);
    const count = phase === "auth" ? 0 : phase === "initial" ? 1 : 2;
    expect(scripted.calls).toHaveLength(count);
    auth.resolve(undefined); gate.resolve(answer({ score: 777 })); await flush();
    expect(scripted.calls).toHaveLength(count); expect(r.validate).not.toHaveBeenCalled();
  });
  it("proof invalidation after forcing rejection prevents the fallback dispatch", async () => {
    const r = rig(); let eligible = true;
    scripted.queue.push(() => { eligible = false; return rejected(); });
    expectFailure(await dispatchFinalization({ ...r.input, eligible: () => eligible })); expect(scripted.calls).toHaveLength(1);
  });
});
