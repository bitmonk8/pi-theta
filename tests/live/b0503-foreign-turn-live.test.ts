// Bug 0503, real-host (SDK H8a) twin of the deterministic production test.
// The shipped extension registers and runs the theta in a REAL AgentSession
// with real provider replies. A public agent_settled subscriber submits a
// foreign prompt while Pi is emitting agent_settled; Pi defers and starts it
// after the emit. No timers, message injection, provider mocks or host-method
// overrides create that interleaving. The next theta query renders the FIRST
// query's bound value: its persisted user text is the result observable.
// This proves the host/session/driver path, not CLI spawning or compaction D1.
import { describe, expect, it } from "vitest";
import { SettingsManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  bootShippedExtension, collectAssistantTexts, collectSystemNotes,
  failLoudly, plantThetaWorkspace, requireLiveProvider,
} from "./harness";

const OWN_QUERY = "What is 263 plus 514? Answer with the number only.";
const FOREIGN_QUERY = "What is 91 plus 131? Answer with the number only.";
const NEXT_PREFIX = "Here is the previous calculation: ";
const NEXT_SUFFIX = ". What is that number plus 1? Answer with the number only.";
const THETA = [
  "---", "mode: prompt", "---",
  `let answer = @\`${OWN_QUERY}\`?`,
  `@\`${NEXT_PREFIX}\${answer}${NEXT_SUFFIX}\``, "",
].join("\n");

function userText(entry: SessionEntry): string | undefined {
  if (entry.type !== "message" || entry.message.role !== "user") return undefined;
  const content = entry.message.content;
  return typeof content === "string" ? content : content.filter((p) => p.type === "text").map((p) => p.text).join("");
}

function expectOwnRenderedQuery(actual: string, ownReply: string): void {
  expect(actual, "B0503_LIVE_OWN_TURN_RESULT: rendered next query must carry own reply, not foreign reply")
    .toBe(`${NEXT_PREFIX}${ownReply}${NEXT_SUFFIX}`);
}

async function drive(interleave: boolean): Promise<void> {
  const provider = await requireLiveProvider(); // missing provider/model FAILS; never skip
  const stem = interleave ? "b0503interleave" : "b0503control";
  const workspace = plantThetaWorkspace([{ source: "project", stem, text: THETA }]);
  try {
    const handle = await bootShippedExtension({
      workspace, provider,
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false }, retry: { enabled: false },
      }),
    });
    let requestedForeign = 0;
    const promptErrors: unknown[] = [];
    const unsubscribe = handle.session.subscribe((event) => {
      if (interleave && event.type === "agent_settled" && requestedForeign === 0) {
        requestedForeign += 1;
        // prompt() resolving HERE is merely deferred acceptance, not evidence
        // that a foreign run succeeded. Check persisted replies below instead.
        void handle.session.prompt(FOREIGN_QUERY).catch((error: unknown) => promptErrors.push(error));
      }
    });
    try {
      handle.session.setThinkingLevel("off");
      if (handle.command(stem) === undefined) {
        failLoudly(`bug 0503 precondition: /${stem} did not register: ${JSON.stringify(handle.registeredNames())}`);
      }
      const before = handle.sessionManager.getEntries().length;
      await handle.session.prompt(`/${stem}`);
      await handle.session.waitForIdle();
      const entries = handle.sessionManager.getEntries().slice(before);
      const users = entries.flatMap((entry, index) => {
        const text = userText(entry);
        return text === undefined ? [] : [{ index, text }];
      });
      const notes = collectSystemNotes(entries);
      const assistants = entries.flatMap((entry) => entry.type === "message" && entry.message.role === "assistant"
        ? [{ stopReason: entry.message.stopReason, errorMessage: entry.message.errorMessage }]
        : []);
      console.log("B0503 live evidence", JSON.stringify({
        model: `${provider.model.provider}/${provider.modelId}`, interleave,
        requestedForeign, users, assistants, notes, idle: handle.session.isIdle,
      }));
      expect(promptErrors, "foreign prompt precondition: no rejected public prompt call").toEqual([]);
      expect(handle.session.isIdle, "read the settled transcript, not merely prompt resolution").toBe(true);
      expect(notes.filter((note) => /^theta \/.* (?:returned Err|cancelled|aborted)/.test(note)),
        "provider/transport/cancellation failures are not a bug 0503 witness").toEqual([]);
      expect(assistants.length, "all expected real turns produced persisted assistant entries").toBe(interleave ? 3 : 2);
      for (const assistant of assistants) {
        expect(assistant.errorMessage, "provider errors are not a bug witness").toBeUndefined();
        expect(["stop", "end_turn"], "every real reply ended normally").toContain(assistant.stopReason);
      }
      expect(users[0]?.text).toBe(OWN_QUERY);
      expect(users.length).toBe(interleave ? 3 : 2);
      const next = users.at(-1)!;
      expect(next.text.startsWith(NEXT_PREFIX), "theta resumed and rendered a second query").toBe(true);
      const ownEnd = users[1]!.index;
      const ownReply = collectAssistantTexts(entries.slice(users[0]!.index + 1, ownEnd)).join("\n");
      expect(ownReply, "the driven reply was committed before any foreign user entry").toMatch(/\b777\b/);
      if (interleave) {
        expect(requestedForeign, "one agent_settled-deferred public prompt").toBe(1);
        expect(users[1]!.text, "foreign turn precedes the next theta send").toBe(FOREIGN_QUERY);
        const foreignReply = collectAssistantTexts(entries.slice(users[1]!.index + 1, next.index)).join("\n");
        expect(foreignReply, "the real foreign turn committed a distinct normal arithmetic reply").toMatch(/\b222\b/);
        expect(foreignReply).not.toBe(ownReply);
      } else {
        expect(requestedForeign).toBe(0);
      }
      // Check a real outbound theta computation against the OWN committed
      // reply, not stochastic text accumulated across the two host runs.
      expectOwnRenderedQuery(next.text, ownReply);
    } finally {
      unsubscribe();
      if (!handle.session.isIdle) await handle.session.abort();
      await handle.dispose();
    }
  } finally {
    workspace.dispose();
  }
}

describe("bug 0503 real host: agent_settled-deferred foreign prompt", () => {
  it("healthy control: without interleaving, the next query carries the own reply", async () => {
    await drive(false);
  });
  it("assertion red-direction control: substituted foreign output cannot pass", () => {
    expect(() => expectOwnRenderedQuery(`${NEXT_PREFIX}222${NEXT_SUFFIX}`, "777"))
      .toThrow(/B0503_LIVE_OWN_TURN_RESULT/);
  });
  it("D0 regression: the next query must not carry the deferred foreign reply", async () => {
    await drive(true);
  });
});
