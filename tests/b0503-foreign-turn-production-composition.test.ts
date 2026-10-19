// Bug 0503: production parser → prompt binding → executor → real SDK context
// projection → query result. Only the host dispatch/lifecycle and clock are
// scripted. This is NOT proof of host timing; the live twin exercises that.
// D0 (no compaction) is sufficient: a foreign user/reply lands after our reply
// but before the end poll observes idle. D1/compaction is deliberately separate.
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { executeBody } from "../src/runtime/statement-executor";
import {
  appendAssistantEntry, appendUserEntry, rootDouble, sessionBranch, thetaInput,
  type SessionEntryDouble,
} from "./helpers/scripted-live-session-harness";

const OWN_REPLY = "driven calculation: 777";
const FOREIGN_REPLY = "foreign calculation: 222";
const SOURCE = "---\nmode: prompt\n---\nlet answer = @`What is 263 plus 514?`?\nanswer\n";

async function drive(interleave: boolean) {
  const entries: SessionEntryDouble[] = [];
  const sent: string[] = [];
  let idle = true;
  let polls = 0;
  const idleReads: boolean[] = [];
  const pi = {
    sendUserMessage(text: string): void {
      expect(idle, "fixture: the driven send must start from idle").toBe(true);
      sent.push(text);
      appendUserEntry(entries, text);
      idle = false;
    },
    getActiveTools: () => [],
    setActiveTools: () => {},
    registerTool: () => {},
    on: () => {},
    sendMessage: () => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    model: { id: "fixture", provider: "anthropic", api: "anthropic-messages" },
    signal: undefined,
    isIdle: () => { idleReads.push(idle); return idle; },
    waitForIdle: async () => { expect(idle).toBe(true); },
    sessionManager: {
      getEntries: () => [...entries],
      getLeafId: () => undefined,
      getBranch: () => sessionBranch(entries),
    },
  } as unknown as ExtensionCommandContext;
  const root = rootDouble({ clock: {
    now: () => polls * 10,
    wallNow: () => polls * 10,
    setTimeout: (fn: () => void, ms: number) => {
      // The waitForIdle race has its own 2s timer, not a lifecycle poll.
      if (ms === 10) {
        polls += 1;
        if (polls === 1) {
          appendAssistantEntry(entries, OWN_REPLY);
          if (interleave) {
            // Two successive runs, with their idle boundary inside this poll
            // interval. No poll-visible idle read between own and foreign.
            appendUserEntry(entries, "What is 91 plus 131?");
          } else {
            idle = true;
          }
        }
        if (polls === 2 && interleave) {
          appendAssistantEntry(entries, FOREIGN_REPLY);
          idle = true;
        }
        fn();
      }
      return polls;
    },
    clearTimeout: () => {},
  } });
  const theta = thetaInput(SOURCE, { slashName: "b0503", sourcePath: "/fixtures/b0503.theta" });
  const deps = createProductionProducerDeps({ pi, root, modelRegistry: {} as ModelRegistry });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx });
  expect(binding.drivenAgainst).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(sent).toEqual(["What is 263 plus 514?"]);
  expect(idle, "both runs have finished before the bound result is read").toBe(true);
  expect(execution.outcome, `not an infra/transport failure: ${JSON.stringify(execution.error)}`).toBe("success");
  // Guard the built read surface used by the actual producer, not just raw
  // entries. Both committed replies must exist, in their own distinct turns.
  const messages = buildSessionContext(entries as unknown as Parameters<typeof buildSessionContext>[0]).messages;
  expect(messages.map((m) => m.role)).toEqual(interleave
    ? ["user", "assistant", "user", "assistant"]
    : ["user", "assistant"]);
  expect(messages[1]).toMatchObject({ content: [{ type: "text", text: OWN_REPLY }], stopReason: "stop" });
  if (interleave) {
    expect(messages[3]).toMatchObject({ content: [{ type: "text", text: FOREIGN_REPLY }], stopReason: "stop" });
    expect(polls).toBe(2);
    // Ignore pre-send idle reads: from first active read through last active
    // read, the driver never saw idle (the scripted host premise).
    const firstActive = idleReads.indexOf(false);
    const lastActive = idleReads.lastIndexOf(false);
    expect(idleReads.slice(firstActive, lastActive + 1)).not.toContain(true);
  }
  return execution.result.value;
}

function expectOwnReply(value: unknown): void {
  expect(value, "B0503_OWN_TURN_RESULT: a query must not bind the later foreign turn").toBe(OWN_REPLY);
}

describe("bug 0503 production composition", () => {
  it("healthy control: without a foreign turn, binds the own committed reply", async () => {
    expectOwnReply(await drive(false));
  });
  it("assertion red-direction control: rejects a substituted foreign reply", () => {
    expect(() => expectOwnReply(FOREIGN_REPLY)).toThrow(/B0503_OWN_TURN_RESULT/);
  });
  it("D0 regression: a foreign run at the settle boundary must not replace our committed reply", async () => {
    expectOwnReply(await drive(true));
  });
});
