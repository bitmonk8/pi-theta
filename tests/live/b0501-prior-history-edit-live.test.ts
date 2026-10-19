// Real AgentSession, shipped extension and provider. A public SessionManager
// context edits omit ONLY a prior completed turn at the own settled boundary.
// Both prior user+assistant are omitted: the live host also appends a system
// entry per prompt, so deleting only one entry would not move the own anchor
// below its recorded index and would be an ineffective regression fixture.
// This proves the history-edit/driver path, NOT natural overflow compaction.
import { describe, expect, it } from "vitest";
import { SettingsManager, buildSessionContext } from "@earendil-works/pi-coding-agent";
import { bootShippedExtension, collectSystemNotes, plantThetaWorkspace, requireLiveProvider } from "./harness";

const PRIOR = "What is 91 plus 131? Answer with the number only.";
const OWN = "What is 263 plus 514? Answer with the number only.";
const NEXT = "Here is the previous calculation: ";
const SUFFIX = ". What is that number plus 1? Answer with the number only.";
const THETA = `---\nmode: prompt\n---\nlet answer = @\`${OWN}\`?\n@\`${NEXT}\${answer}${SUFFIX}\`\n`;

function expectOwnRendered(actual: string, own: string) {
  expect(actual, "B0501_LIVE_OWN_REPLY: prior-history edit must not lose the completed own reply").toBe(`${NEXT}${own}${SUFFIX}`);
}
async function drive(edit: boolean) {
  const provider = await requireLiveProvider();
  const stem = edit ? "b0501edit" : "b0501healthy";
  const workspace = plantThetaWorkspace([{ source: "project", stem, text: THETA }]);
  try {
    const handle = await bootShippedExtension({ workspace, provider,
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
    });
    try {
      handle.session.setThinkingLevel("off");
      await handle.session.prompt(PRIOR);
      await handle.session.waitForIdle();
      const prior = handle.sessionManager.getEntries().find((entry) => entry.type === "message" && entry.message.role === "assistant");
      expect(prior, "a real prior completed assistant is the edit target").toBeDefined();
      if (prior?.type !== "message" || prior.message.role !== "assistant") throw new Error("missing prior assistant");
      expect(prior.message.stopReason).toBe("stop");
      expect(prior.message.errorMessage).toBeUndefined();
      const priorUser = handle.sessionManager.getEntries().find((entry) => entry.type === "message" && entry.message.role === "user");
      if (priorUser === undefined) throw new Error("missing prior user");
      let edits = 0;
      const beforeRoles = buildSessionContext(handle.sessionManager.getEntries(), handle.sessionManager.getLeafId()).messages.map((message) => message.role);
      let editedRoles: string[] = [];
      const unsubscribe = handle.session.subscribe((event) => {
        if (edit && edits === 0 && event.type === "agent_settled") {
          edits += 2;
          handle.sessionManager.appendContextEdit(priorUser.id, null);
          handle.sessionManager.appendContextEdit(prior.id, null);
          editedRoles = buildSessionContext(handle.sessionManager.getEntries(), handle.sessionManager.getLeafId()).messages.map((message) => message.role);
        }
      });
      try {
        expect(handle.command(stem), "shipped discovery registered theta").toBeDefined();
        await handle.session.prompt(`/${stem}`);
        await handle.session.waitForIdle();
        const entries = handle.sessionManager.getEntries();
        const notes = collectSystemNotes(entries);
        const users = entries.flatMap((entry) => {
          if (entry.type !== "message" || entry.message.role !== "user") return [];
          const content = entry.message.content;
          return [typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("")];
        });
        const assistants = entries.flatMap((entry) => entry.type === "message" && entry.message.role === "assistant" ? [entry.message] : []);
        const rawEdits = entries.filter((entry) => entry.type === "context_edit");
        console.log("B0501 live evidence", JSON.stringify({ model: `${provider.model.provider}/${provider.modelId}`, edit, edits,
          users, assistants, rawEdits, notes, beforeRoles, editedRoles, projectedRoles: buildSessionContext(entries, handle.sessionManager.getLeafId()).messages.map((message) => message.role), idle: handle.session.isIdle }));
        expect(handle.session.isIdle).toBe(true);
        expect(edits).toBe(edit ? 2 : 0);
        expect(rawEdits).toHaveLength(edit ? 2 : 0);
        if (edit) {
          expect(rawEdits).toMatchObject([{ targetId: priorUser.id, replacement: null }, { targetId: prior.id, replacement: null }]);
          expect(editedRoles.lastIndexOf("user"), "fixture really moves own user below pre-send index").toBeLessThan(beforeRoles.length);
        }
        expect(notes.filter((note) => /^theta \/.* (?:returned Err|cancelled|aborted)/.test(note))).toEqual([]);
        expect(users).toHaveLength(3);
        expect(users.slice(0, 2)).toEqual([PRIOR, OWN]);
        expect(assistants).toHaveLength(3);
        for (const reply of assistants) {
          expect(reply.stopReason).toBe("stop");
          expect(reply.errorMessage).toBeUndefined();
        }
        const own = assistants[1]!.content.filter((part) => part.type === "text").map((part) => part.text).join("");
        expect(own).toMatch(/\b777\b/);
        expectOwnRendered(users[2]!, own);
      } finally { unsubscribe(); }
    } finally {
      if (!handle.session.isIdle) await handle.session.abort();
      await handle.dispose();
    }
  } finally { workspace.dispose(); }
}
describe("0501 real-host prior-history projection drift", () => {
  it("healthy: no edit preserves the bound calculation", async () => { await drive(false); });
  it("edit of a prior answer must preserve the own completed calculation", async () => { await drive(true); });
  it("assertion rejects missing or substituted answer", () => {
    expect(() => expectOwnRendered(`${NEXT}222${SUFFIX}`, "777")).toThrow(/B0501_LIVE_OWN_REPLY/);
  });
});
