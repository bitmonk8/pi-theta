// Test support: actual SDK/provider on-session tool execution, then a controlled
// post-answer retain-none SessionManager compaction. NOT natural threshold timing.
import { expect } from "vitest";
import { Type } from "typebox";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, buildSessionContext, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Message } from "@earendil-works/pi-ai";
import { LivePromptQueryModel } from "../../src/extension/live-prompt-query-driver";
import { PromptToolLoopGovernor } from "../../src/extension/prompt-tool-loop-governor";
import { resolveRegistryAuth } from "../../src/extension/off-session-respond-dispatch";
import { WallClock } from "../../src/seams/wall-clock";
import type { LiveProvider } from "./harness";

export const B0500_RECEIPT_QUERY = "Read the b0500_evidence receipt, then add the two operands in that receipt. Answer with the total as a number.";
export const B0500_RECEIPT = "B0500_READ_ONLY_RECEIPT: left operand = 146; right operand = 297.";

export async function driveB0500SdkRetainNone(provider: LiveProvider) {
  const manager = SessionManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(), agentDir: getAgentDir(), noExtensions: true, noSkills: true,
    noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await resourceLoader.reload();
  let executions = 0;
  const { session } = await createAgentSession({
    cwd: process.cwd(), modelRuntime: provider.modelRuntime, model: provider.model,
    resourceLoader, sessionManager: manager,
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
    tools: ["b0500_evidence"],
    customTools: [{
      name: "b0500_evidence", label: "Read fixture receipt",
      description: "Read the immutable arithmetic evidence receipt. It supplies the operands; no input is needed.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      parameters: Type.Object({}),
      execute: async () => { executions++; return { content: [{ type: "text", text: B0500_RECEIPT }], details: undefined }; },
    }],
  });
  const abort = new AbortController();
  const watchdog = setTimeout(() => { abort.abort("B0500 bounded SDK witness expired"); void session.abort(); }, 80_000);
  let pending: Promise<void> | undefined;
  let busy = false, sends = 0, compacted = false, receiptObserved = false, terminalCommitted = false;
  let hostError = false;
  const pi = {
    getActiveTools: () => session.getActiveToolNames(),
    setActiveTools: (names: string[]) => session.setActiveToolsByName(names),
    sendMessage: (message: Parameters<ExtensionAPI["sendMessage"]>[0]) => session.sendCustomMessage(message),
    sendUserMessage: (text: string) => {
      sends++; busy = true;
      pending = session.prompt(text).then(() => {
        terminalCommitted = manager.getBranch().some(entry => entry.type === "message" && entry.message.role === "assistant" && entry.message.stopReason === "stop");
        // The real SDK stores a self-id cut for null: no earlier call, receipt,
        // user or terminal survives the finalizer's model-context projection.
        manager.appendCompaction("B0500 controlled summary: prior work is unavailable; no operands or answer recorded here.", null, 500);
        compacted = true;
      }, () => { hostError = true; }).finally(() => { busy = false; });
    },
  } as unknown as ExtensionAPI;
  const model = new LivePromptQueryModel({
    pi, ctx: {
      model: provider.model, signal: undefined,
      isIdle: () => !busy && session.isIdle,
      waitForIdle: async () => { await pending; await session.waitForIdle(); },
      abort: () => { void session.abort(); },
    },
    clock: new WallClock(), queryText: B0500_RECEIPT_QUERY,
    readMessages: () => {
      const messages = buildSessionContext(manager.getEntries(), manager.getLeafId()).messages;
      if (!compacted && messages.some(message => message.role === "toolResult" && message.toolName === "b0500_evidence")) receiptObserved = true;
      return messages as Message[];
    },
    readContextPath: () => manager.getBranch(), activeTools: ["b0500_evidence"],
    thetaAbort: abort, governor: new PromptToolLoopGovernor(), maxRounds: 3,
    provider: provider.model.api, thetaName: "b0500sdk", emitDiagnostic: () => {},
    finalizationContext: {
      model: provider.model,
      auth: () => resolveRegistryAuth(provider.modelRegistry, provider.model),
    },
  });
  try {
    const turn = await model.nextFreePhaseTurn(0);
    await pending;
    expect(hostError, "real SDK on-session prompt must complete").toBe(false);
    expect(executions, "one actual read-only tool execution, never operational replay").toBe(1);
    expect(sends).toBe(1);
    expect(receiptObserved, "production polling really observed a receipt before compaction").toBe(true);
    expect(terminalCommitted, "real SDK committed the completed terminal before controlled compaction").toBe(true);
    expect(compacted).toBe(true);
    const projected = buildSessionContext(manager.getEntries(), manager.getLeafId()).messages;
    expect(projected.some(message => message.role === "assistant" || message.role === "toolResult" || message.role === "user")).toBe(false);
    expect(turn.kind, "B0500_UNAVAILABLE_OUTPUT: retain-none recovery must deliver justified text from observed receipt, not fail closed").toBe("text");
    if (turn.kind !== "text") throw new Error("B0500_UNAVAILABLE_OUTPUT finalization did not produce text");
    expect(manager.getBranch().some(entry => entry.type === "custom_message" && entry.customType === "theta-system-note" && typeof entry.content === "string" && entry.content.includes("finalizing unavailable query output"))).toBe(true);
    expect(turn.text.trim(), "receipt-only computation survives unavailable output without rerunning the task").toBe(String(146 + 297));
    return { query: B0500_RECEIPT_QUERY, receipt: B0500_RECEIPT };
  } finally {
    clearTimeout(watchdog);
    abort.abort("B0500 SDK witness disposed");
    await session.abort();
    await pending;
    session.dispose();
  }
}
