// Real SDK host + shipped theta + provider, using only public extension hooks.
// pi 1.3 marks the whole _prepareRun active, closing the historical 0.87 idle
// gap. This is the minimum-supported-host compatibility control, NOT a live
// reproduction of that gap. The unsupported-topology modeled red drafts remain
// archived with the blocked 0502 run; no theta driver recovery fix is claimed.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { bootShippedExtension, collectSystemNotes, plantThetaWorkspace, requireLiveProvider } from "./harness";
import { B0502_QUERY, B0502_TIMING } from "./fixtures/b0502-compaction-timing-extension";

const PREFIX = "Here is the previous calculation: ";
const SUFFIX = ". What is that number plus 1? Answer with the number only.";
function expectBoundReply(actual: string, own: string) {
  expect(actual, "B0502_LIVE_BOUND_REPLY: completed own answer must reach the next rendered query").toBe(`${PREFIX}${own}${SUFFIX}`);
}
describe("0502 real-host compaction compatibility control", () => {
  it("automatic pre-prompt compaction and >10s active run preserve the own value on the installed host", async () => {
    const provider = await requireLiveProvider();
    const stem = "b0502compaction";
    const workspace = plantThetaWorkspace([{ source: "project", stem,
      text: `---\nmode: prompt\n---\nlet answer = @\`${B0502_QUERY}\`?\n@\`${PREFIX}\${answer}${SUFFIX}\`\n` }]);
    try {
      const handle = await bootShippedExtension({ workspace, provider,
        extraExtensionPaths: [fileURLToPath(new URL("./fixtures/b0502-compaction-timing-extension.ts", import.meta.url))],
        settingsManager: SettingsManager.inMemory({ compaction: {
          enabled: false, reserveTokens: provider.model.contextWindow - 1, keepRecentTokens: 1,
        }, retry: { enabled: false } }),
      });
      try {
        expect(handle.command(stem), "discovery must register the shipped theta").toBeDefined();
        handle.session.setThinkingLevel("off");
        await handle.session.prompt("What is 91 plus 131? Answer with the number only.");
        await handle.session.waitForIdle();
        const priorEntries = handle.sessionManager.getEntries();
        const prior = priorEntries.flatMap((e) => e.type === "message" && e.message.role === "assistant" ? [e.message] : []);
        expect(prior).toHaveLength(1);
        expect(prior[0]!.stopReason).toBe("stop");
        expect(prior[0]!.errorMessage).toBeUndefined();
        const compactionEvents: unknown[] = [];
        const unsubscribe = handle.session.subscribe((event) => {
          if (event.type === "compaction_end") {
            compactionEvents.push(event);
            // Only the next pre-prompt check should compact, not its final reply.
            handle.session.setAutoCompactionEnabled(false);
          }
        });
        try {
          handle.session.setAutoCompactionEnabled(true);
          await handle.session.prompt(`/${stem}`);
          await handle.session.waitForIdle();
          const entries = handle.sessionManager.getEntries();
          const notes = collectSystemNotes(entries);
          const users = entries.flatMap((e) => {
            if (e.type !== "message" || e.message.role !== "user") return [];
            const c = e.message.content;
            return [typeof c === "string" ? c : c.filter((p) => p.type === "text").map((p) => p.text).join("")];
          });
          const assistants = entries.flatMap((e) => e.type === "message" && e.message.role === "assistant" ? [e.message] : []);
          const timing = entries.flatMap((e) => e.type === "custom" && e.customType === B0502_TIMING ? [e.data as {
            phase: string; idle: boolean; signal: boolean; at: number;
          }] : []);
          // Assert synthetic observables below without logging full provider
          // messages, response identifiers, or transcript contents.
          expect(compactionEvents).toHaveLength(1);
          expect(compactionEvents[0]).toMatchObject({ reason: "threshold", aborted: false, willRetry: false, result: { summary: expect.any(String) } });
          const compactAt = entries.findIndex((e) => e.type === "compaction");
          const ownAt = entries.findIndex((e) => e.type === "message" && e.message.role === "user" &&
            JSON.stringify(e.message.content).includes(B0502_QUERY));
          expect(compactAt).toBeGreaterThan(-1);
          expect(ownAt, "compaction really precedes this attempt's user").toBeGreaterThan(compactAt);
          expect(timing.map((t) => t.phase)).toEqual(["compacting", "before-start-yield", "after-start-yield", "active-work-start", "active-work-end"]);
          // Current host's mitigation is measured, not inferred from prompt resolving.
          expect(timing.slice(0, 3).map((t) => ({ idle: t.idle, signal: t.signal }))).toEqual([
            { idle: false, signal: false }, { idle: false, signal: false }, { idle: false, signal: false },
          ]);
          expect(timing[3]).toMatchObject({ idle: false, signal: true });
          expect(timing[4]!.at - timing[3]!.at).toBeGreaterThanOrEqual(11000);
          expect(handle.session.isIdle).toBe(true);
          expect(notes.filter((n) => /^theta \/.* (?:returned Err|cancelled|aborted)/.test(n)), "no fail-closed drive").toEqual([]);
          expect(users).toHaveLength(3);
          expect(users[1]).toBe(B0502_QUERY);
          expect(assistants).toHaveLength(3);
          for (const reply of assistants) {
            expect(reply.stopReason).toBe("stop");
            expect(reply.errorMessage).toBeUndefined();
          }
          const own = assistants[1]!.content.filter((p) => p.type === "text").map((p) => p.text).join("");
          expect(own).toMatch(/\b777\b/);
          expectBoundReply(users[2]!, own);
        } finally { unsubscribe(); }
      } finally {
        if (!handle.session.isIdle) await handle.session.abort();
        await handle.dispose();
      }
    } finally { workspace.dispose(); }
  });
  it("assertion red direction rejects a missing/substituted value", () => {
    expect(() => expectBoundReply(`${PREFIX}222${SUFFIX}`, "777")).toThrow(/B0502_LIVE_BOUND_REPLY/);
  });
});
