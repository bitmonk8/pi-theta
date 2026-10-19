// Real SDK host + shipped extension + real provider. The observable is the
// persisted named interleaving Err and absence of the next theta computation,
// NOT prompt() resolving. Offline boundary tests separately count dispatches.
import { describe, expect, it } from "vitest";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE } from "../../src/runtime/prompt-transport-mapping";
import { bootShippedExtension, collectAssistantTexts, collectSystemNotes,
  plantThetaWorkspace, requireLiveProvider } from "./harness";

const QUERY = "What is 263 plus 514? Compute the sum. During this initial calculation use plain text rather than tools.";
const FOREIGN = "What is 91 plus 131? Answer with the number only.";
const AFTER = "The completed typed calculation is ";
const SOURCE = ["---", "mode: prompt", "---", "schema Calculation { score: number }",
  `let answer: Calculation = @\`${QUERY}\`?`,
  `@\`${AFTER}\${answer.score}. What is that number plus 1? Answer with the number only.\``, ""].join("\n");

function expectRefusal(notes: readonly string[], users: readonly string[]) {
  expect(notes.join("\n"), "B0503_TYPED_LIVE_REFUSAL: exact approved interleaving failure").toContain(PROMPT_MODE_TYPED_INTERLEAVING_MESSAGE);
  expect(notes.filter((note) => /^theta \/.* returned Err:/.test(note))).toHaveLength(1);
  expect(notes.some((note) => /cancelled|aborted/.test(note))).toBe(false);
  expect(users.some((text) => text.startsWith(AFTER)), "contaminated typed value never reaches the next computation").toBe(false);
}

describe("0503 typed foreign-user refusal, real host", () => {
  it("healthy typed control still binds and reaches the next real computation", async () => {
    const provider = await requireLiveProvider();
    const stem = "b0503typedcontrol";
    const workspace = plantThetaWorkspace([{ source: "project", stem, text: SOURCE }]);
    try {
      const handle = await bootShippedExtension({ workspace, provider,
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
      });
      try {
        handle.session.setThinkingLevel("off");
        expect(handle.command(stem)).toBeDefined();
        const before = handle.sessionManager.getEntries().length;
        await handle.session.prompt(`/${stem}`);
        await handle.session.waitForIdle();
        const entries = handle.sessionManager.getEntries().slice(before);
        const notes = collectSystemNotes(entries);
        const users = entries.flatMap((entry) => {
          if (entry.type !== "message" || entry.message.role !== "user") return [];
          const content = entry.message.content;
          return [typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("")];
        });
        console.log("B0503 typed healthy evidence", JSON.stringify({ model: `${provider.model.provider}/${provider.modelId}`, users, notes, idle: handle.session.isIdle }));
        expect(handle.session.isIdle).toBe(true);
        expect(notes.filter((note) => /^theta \/.* (?:returned Err|cancelled|aborted)/.test(note))).toEqual([]);
        expect(users).toEqual([QUERY, `${AFTER}777. What is that number plus 1? Answer with the number only.`]);
        for (const entry of entries) {
          if (entry.type === "message" && entry.message.role === "assistant") expect(entry.message.errorMessage).toBeUndefined();
        }
      } finally {
        if (!handle.session.isIdle) await handle.session.abort();
        await handle.dispose();
      }
    } finally { workspace.dispose(); }
  });
  it("assertion red direction: absence of the named failure cannot pass", () => {
    expect(() => expectRefusal([], [])).toThrow(/B0503_TYPED_LIVE_REFUSAL/);
  });
  it("rejects the contaminated replay window instead of accepting capture or replay", async () => {
    const provider = await requireLiveProvider();
    const stem = "b0503typed";
    const workspace = plantThetaWorkspace([{ source: "project", stem, text: SOURCE }]);
    try {
      const handle = await bootShippedExtension({ workspace, provider,
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
      });
      let requested = 0;
      const errors: unknown[] = [];
      const unsubscribe = handle.session.subscribe((event) => {
        if (event.type === "agent_settled" && requested === 0) {
          requested++;
          void handle.session.prompt(FOREIGN).catch((error: unknown) => errors.push(error));
        }
      });
      try {
        handle.session.setThinkingLevel("off");
        expect(handle.command(stem), "typed theta registered").toBeDefined();
        const before = handle.sessionManager.getEntries().length;
        await handle.session.prompt(`/${stem}`);
        await handle.session.waitForIdle();
        const entries = handle.sessionManager.getEntries().slice(before);
        const notes = collectSystemNotes(entries);
        const users = entries.flatMap((entry) => {
          if (entry.type !== "message" || entry.message.role !== "user") return [];
          const content = entry.message.content;
          return [typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("")];
        });
        const assistants = entries.flatMap((entry) => entry.type === "message" && entry.message.role === "assistant" ? [entry.message] : []);
        console.log("B0503 typed live evidence", JSON.stringify({ model: `${provider.model.provider}/${provider.modelId}`, api: provider.model.api,
          requested, users, notes, assistants: assistants.map((a) => ({ stopReason: a.stopReason, errorMessage: a.errorMessage })), idle: handle.session.isIdle }));
        expect(errors).toEqual([]);
        expect(handle.session.isIdle).toBe(true);
        expect(requested, "real public deferred foreign prompt was requested").toBe(1);
        expect(users).toEqual([QUERY, FOREIGN]);
        expect(assistants.length, "both real turns committed").toBeGreaterThanOrEqual(2);
        for (const reply of assistants) {
          expect(reply.errorMessage, "provider errors are not a 0503 witness").toBeUndefined();
          expect(["stop", "end_turn", "toolUse"]).toContain(reply.stopReason);
        }
        expect(collectAssistantTexts(entries).join("\n"), "real arithmetic replies, not a provider refusal").toMatch(/777|222/);
        expectRefusal(notes, users);
      } finally {
        unsubscribe();
        if (!handle.session.isIdle) await handle.session.abort();
        await handle.dispose();
      }
    } finally { workspace.dispose(); }
  });
});
