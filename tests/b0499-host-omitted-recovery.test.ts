// Bug 0499: real production producer/binding/executor and real host projection.
// Only scheduling/transport are scripted; this is NOT a real AgentSession run.
// The live twin exercises host-created omission + public abortRetry().
import { describe, expect, it } from "vitest";
import { SessionManager, type ExtensionAPI, type ExtensionCommandContext, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { ANTHROPIC_MODEL, assistantReply, rootDouble, thetaInput } from "./helpers/scripted-live-session-harness";

const PARTIAL = "reviewing shard-02: file 1 of 15 looks clean so far";
const OMITTED_ERROR = "provider returned error: b0499 injected recovery attempt";
const FULL = "the retried full answer";
const SOURCE = "---\nmode: prompt\n---\nlet answer = @`Review shard-02`?\nanswer\n";
type Shape = "narration" | "pure-tool" | "round-zero" | "healed" | "visible-error";

async function drive(shape: Shape): Promise<BodyExecution> {
  const manager = SessionManager.inMemory();
  let idle = true;
  let pending = false;
  let sends = 0;
  const append = (message: unknown) => manager.appendMessage(message as Message);
  const pi = {
    sendUserMessage: (text: string) => {
      sends++;
      append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
      idle = false;
      pending = true;
    },
    getActiveTools: () => [], setActiveTools: () => {}, registerTool: () => {},
    on: () => {}, sendMessage: () => {},
  } as unknown as ExtensionAPI;
  const tick = () => {
    if (!pending) return;
    pending = false;
    if (shape !== "round-zero") {
      append({ ...assistantReply({ stopReason: "toolUse" }),
        content: [
          ...(shape === "pure-tool" ? [] : [{ type: "text", text: PARTIAL }]),
          { type: "toolCall", id: "probe-call", name: "probe", arguments: {} },
        ] });
      append({ role: "toolResult", toolCallId: "probe-call", toolName: "probe",
        content: [{ type: "text", text: "file 1 reviewed" }], isError: false, timestamp: 0 });
    }
    const errorId = manager.appendMessage(assistantReply({ stopReason: "error", errorMessage: OMITTED_ERROR }) as unknown as AssistantMessage);
    if (shape !== "visible-error") manager.appendContextEdit(errorId, null);
    if (shape === "healed") append(assistantReply({ stopReason: "stop", text: FULL }));
    idle = true;
  };
  const root = rootDouble({ clock: { now: () => 0, wallNow: () => 0,
    clearTimeout: () => {}, setTimeout: (fn: () => void) => { tick(); fn(); return 0; } } });
  const ctx = { model: ANTHROPIC_MODEL, signal: undefined, isIdle: () => idle,
    waitForIdle: () => Promise.resolve(), sessionManager: manager } as unknown as ExtensionCommandContext;
  const deps = createProductionProducerDeps({ pi, root, modelRegistry: {} as ModelRegistry });
  const binding = deps.bindPromptConversation({
    theta: thetaInput(SOURCE, { slashName: "b0499", sourcePath: "/fixtures/b0499.theta" }), args: "", ctx,
  });
  expect(binding.drivenAgainst).toBe("prompt-user-session");
  const execution = await executeBody(thetaInput(SOURCE, { slashName: "b0499", sourcePath: "/fixtures/b0499.theta" }).body, binding.executeDeps);
  expect(sends, "one own send, no recovery continuation without an observed abort").toBe(1);
  expect(manager.getBranch().some((e) => e.type === "context_edit")).toBe(shape !== "visible-error");
  const projected = manager.buildSessionContext().messages;
  expect(projected.some((m) => m.role === "assistant" && m.stopReason === "error"),
    "real host projection drops exactly the omitted failed attempt").toBe(shape === "visible-error");
  console.log("B0499 composition evidence", JSON.stringify({ shape, outcome: execution.outcome,
    value: execution.result.value, error: execution.error, rawTypes: manager.getBranch().map((e) => e.type),
    projectedRoles: projected.map((m) => m.role) }));
  return execution;
}

function expectOmissionFailure(execution: BodyExecution): void {
  expect(execution.outcome, "B0499_OMISSION_MUST_FAIL: unhealed omission must not bind pre-error narration").toBe("fail");
  expect(execution.error).toMatchObject({ kind: "transport", retryable: true });
  expect((execution.error as { message: string }).message,
    "B0499_OMITTED_ERROR_REQUIRED: preserve the omitted attempt's error, not a generic settle expiry").toContain(OMITTED_ERROR);
}

describe("bug 0499 production composition with real context-edit projection", () => {
  it("healthy control: healed omission binds the completed retry", async () => {
    const execution = await drive("healed");
    expect(execution.outcome).toBe("success");
    expect(execution.result.value).toBe(`${PARTIAL}\n${FULL}`);
  });
  it("healthy control: visible error remains a loud PIC-51 transport failure", async () => {
    const execution = await drive("visible-error");
    expect(execution.outcome).toBe("fail");
    expect(execution.error).toMatchObject({ kind: "transport", message: OMITTED_ERROR, retryable: false });
  });
  it("assertion red direction rejects a successful partial bind", () => {
    expect(() => expectOmissionFailure({ outcome: "success", result: { value: PARTIAL } } as BodyExecution))
      .toThrow(/B0499_OMISSION_MUST_FAIL/);
  });
  it.each(["narration", "pure-tool"] as const)("unhealed %s must fail rather than bind a partial answer", async (shape) => {
    expectOmissionFailure(await drive(shape));
  });
  it("round-zero omission must carry the omitted error as retryable, not generic expiry", async () => {
    expectOmissionFailure(await drive("round-zero"));
  });
});
