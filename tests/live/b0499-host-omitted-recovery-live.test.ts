// Real AgentSession + shipped extension + live OpenAI provider. A test-only
// message_end rewrite creates a retryable failure after a successful real
// completion. The host, NOT the fixture, writes the context_edit omission.
// Public abortRetry() cancels the backoff without aborting an active run.
// This pins round-zero misattribution; the offline twin pins silent partial Ok.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { bootShippedExtension, collectSystemNotes, plantThetaWorkspace, requireLiveProvider } from "./harness";
import { B0499_ERROR } from "./fixtures/b0499-retryable-stop-extension";

const FIXTURE = fileURLToPath(new URL("./fixtures/b0499-retryable-stop-extension.ts", import.meta.url));
const QUESTION = "What is 263 plus 514? Answer with the number only.";
const THETA = `---\nmode: prompt\n---\nlet sum = @\`${QUESTION}\`?\n@\`Here is the computed sum: \${sum}. What is that number plus 1? Answer with the number only.\`\n`;

function expectOmittedErrorNote(notes: readonly string[]): void {
  expect(notes.some((note) => note.startsWith("theta /b0499omitted returned Err") && note.includes(B0499_ERROR)),
    "B0499_LIVE_OMITTED_ERROR_REQUIRED: settled Err must carry the omitted attempt error, not generic settle expiry").toBe(true);
}

async function drive(omit: boolean): Promise<void> {
  const provider = await requireLiveProvider(); // missing credentials/model fails, never skips
  const stem = omit ? "b0499omitted" : "b0499healthy";
  const workspace = plantThetaWorkspace([{ source: "project", stem, text: THETA }]);
  try {
    const handle = await bootShippedExtension({ workspace, provider,
      extraExtensionPaths: omit ? [FIXTURE] : [],
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false },
        retry: { enabled: omit, maxRetries: 1, baseDelayMs: 30000, provider: { maxRetryDelayMs: 30000 } } }),
    });
    let retryStarts = 0;
    let cancelledBackoffs = 0;
    const unsubscribe = handle.session.subscribe((event) => {
      if (event.type !== "auto_retry_start") return;
      retryStarts++;
      // _prepareRetry emits synchronously before appending the omission and
      // installing its sleep controller. A microtask sees both installed.
      queueMicrotask(() => {
        if (handle.session.isRetrying) {
          cancelledBackoffs++;
          handle.session.abortRetry();
        }
      });
    });
    try {
      handle.session.setThinkingLevel("off");
      expect(handle.command(stem), "shipped discovery registered the real slash command").toBeDefined();
      await handle.session.prompt(`/${stem}`);
      await handle.session.waitForIdle();
      const entries = handle.sessionManager.getEntries();
      const notes = collectSystemNotes(entries);
      const assistants = entries.flatMap((e) => e.type === "message" && e.message.role === "assistant"
        ? [{ id: e.id, message: e.message }] : []);
      const users = entries.flatMap((e) => e.type === "message" && e.message.role === "user" ? [e.message] : []);
      const edits = entries.filter((e) => e.type === "context_edit");
      console.log("B0499 live evidence", JSON.stringify({ model: `${provider.model.provider}/${provider.modelId}`,
        api: provider.model.api, omit, retryStarts, cancelledBackoffs, idle: handle.session.isIdle,
        assistants, users, edits, notes, projected: handle.sessionManager.buildSessionContext().messages }));
      expect(handle.session.isIdle, "read the settled transcript, not merely prompt resolution").toBe(true);
      if (omit) {
        expect(retryStarts, "real host accepted exactly one injected retryable completion").toBe(1);
        expect(cancelledBackoffs, "public abortRetry actually interrupted the real backoff").toBe(1);
        expect(assistants).toHaveLength(1);
        const failed = assistants[0]!;
        expect(failed.message.errorMessage, "unexpected provider errors are NOT a witness").toBe(B0499_ERROR);
        expect(failed.message.content.some((p) => p.type === "text" && /\b777\b/.test(p.text)),
          "a real successful arithmetic completion preceded the synthetic rewrite").toBe(true);
        expect(edits).toHaveLength(1);
        expect(edits[0]).toMatchObject({ targetId: failed.id, replacement: null });
        expect(handle.sessionManager.buildSessionContext().messages.some((m) => m.role === "assistant")).toBe(false);
        expect(users).toHaveLength(1); // Err must prevent theta's second query
        expectOmittedErrorNote(notes);
      } else {
        expect(retryStarts).toBe(0);
        expect(edits).toHaveLength(0);
        expect(users).toHaveLength(2);
        expect(assistants).toHaveLength(2);
        for (const entry of assistants) {
          expect(entry.message.errorMessage, "provider errors cannot count as a healthy control").toBeUndefined();
          expect(entry.message.stopReason).toBe("stop");
        }
        expect(notes.filter((note) => /^theta \/.* (?:returned Err|cancelled|aborted)/.test(note))).toEqual([]);
        const second = users[1]!.content;
        expect(typeof second === "string" ? second : second.filter((p) => p.type === "text").map((p) => p.text).join(""))
          .toMatch(/Here is the computed sum: .*777/);
      }
    } finally {
      unsubscribe();
      if (!handle.session.isIdle) await handle.session.abort();
      await handle.dispose();
    }
  } finally { workspace.dispose(); }
}

describe("bug 0499 real host recovery omission", () => {
  it("healthy control: two real turns bind the computed value without omission", async () => { await drive(false); });
  it("assertion red direction: generic settle expiry cannot pass as omitted error", () => {
    expect(() => expectOmittedErrorNote(["theta /b0499omitted returned Err: on-session turn did not settle"]))
      .toThrow(/B0499_LIVE_OMITTED_ERROR_REQUIRED/);
  });
  it("unhealed real host omission must surface its omitted error", async () => { await drive(true); });
});
