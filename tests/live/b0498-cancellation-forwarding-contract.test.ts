// Bug 0498 is a spec-integrity defect, NOT a request to wire up the dead
// five-handler helper. Load the shipped extension in a real SDK AgentSession,
// drive a real provider turn, and compare the installed handler surface with
// the five normative files that currently claim event-based forwarding.
// No mocked factory/driver/governor, injected production deps, or extra extension.
// Boundary: H8a in-process real host, not a TUI/child-process Esc timing test.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";
import { assertNoFailClosedEnding } from "../helpers/live-transcript";
import { assertThetaStderrCleanForEach } from "../helpers/theta-stderr-gate";

const CLAIMS = [
  {
    path: "docs/spec_topics/cancellation.md",
    claim: "`ctx.signal` is observed inside one of the runtime's own event handlers",
  },
  {
    path: "docs/spec_topics/pi-integration-contract/conversation-drive.md",
    claim: "cancellation-forwarding handlers consume exactly the five members above",
  },
  {
    path: "docs/spec_topics/pi-integration-contract/host-interfaces-core.md",
    claim: "when defined and observed inside one of the runtime's `tool_call` / `tool_result` / `message_update` / `turn_end` / `agent_end` handlers",
  },
  {
    path: "docs/spec_topics/pi-integration-contract/host-prerequisites.md",
    claim: "Pi delivers each of the five turn-lifecycle events the runtime's cancellation-forwarding handlers subscribe to",
  },
  {
    path: "docs/spec_topics/pi-integration-contract/version-bump-step2.md",
    claim: "Pi still delivers each of the five turn-lifecycle events the runtime's cancellation-forwarding handlers subscribe to",
  },
] as const;

const MISMATCH = "B0498_SPEC_RUNTIME_MISMATCH: spec must not claim unregistered five-handler cancellation forwarding";
const normalize = (text: string): string => text.replace(/\s+/g, " ");

function staleClaims(texts: readonly string[]): string[] {
  expect(texts, "oracle requires one document for each named clause").toHaveLength(CLAIMS.length);
  return CLAIMS.filter(({ claim }, index) => normalize(texts[index]!).includes(claim))
    .map(({ path }) => path);
}

function expectNoPhantomForwarding(texts: readonly string[]): void {
  expect(staleClaims(texts), MISMATCH).toEqual([]);
}

assertThetaStderrCleanForEach();

describe("bug 0498 cancellation forwarding contract", () => {
  it("healthy oracle control: driver-local forwarding prose does not claim five handlers", () => {
    expectNoPhantomForwarding(CLAIMS.map(() =>
      "Prompt-mode cancellation is driver-local: a per-run ctx.signal recorder and post-settle classification; pi.on does not complete queries."));
  });

  it("assertion red-direction control: every original phantom-handler clause is rejected", () => {
    // Exercise each clause independently: none may be masked by another hit.
    for (let index = 0; index < CLAIMS.length; index += 1) {
      const texts = CLAIMS.map((entry, i) => i === index ? entry.claim : "driver-local cancellation");
      expect(staleClaims(texts)).toEqual([CLAIMS[index]!.path]);
      expect(() => expectNoPhantomForwarding(texts)).toThrow(/B0498_SPEC_RUNTIME_MISMATCH/);
    }
  });

  it("live shipped-path regression: normative forwarding claims agree with actual registrations", async () => {
    const provider = await requireLiveProvider(); // Missing model/credentials fails, never skips.
    const stem = "b0498forwarding";
    const query = "What is 263 plus 514? Answer with the number only.";
    const workspace = plantThetaWorkspace([{
      source: "project", stem,
      text: `---\nmode: prompt\n---\n@\`${query}\`?\n`,
    }]);
    let handle: Awaited<ReturnType<typeof bootShippedExtension>> | undefined;
    try {
      handle = await bootShippedExtension({ workspace, provider });
      expect(handle.command(stem), "real discovery must register the fixture before driving").toBeDefined();
      const turn = await driveSlashCaptureTurn(handle, `/${stem}`);
      assertNoFailClosedEnding(turn, stem);
      expect(turn.userTexts).toContain(query);
      expect(turn.text.trim(), "healthy control: the provider must produce a real answer").not.toBe("");
      expect(handle.session.isIdle, "the driven turn must be settled before inspecting subscriptions").toBe(true);

      // No extra extension is loaded, so these are the shipped registrations,
      // including lazy registrations reached during the real query drive.
      const inspectedEvents = [
        "before_provider_request", "tool_call", "tool_result", "message_update", "turn_end", "agent_end",
      ] as const;
      const installed = inspectedEvents.filter((event) => handle!.runner.hasHandlers(event));
      expect(installed, "healthy shipped-surface control: only the two governor events are registered")
        .toEqual(["before_provider_request", "tool_call"]);
      console.info("B0498_LIVE_EVIDENCE", JSON.stringify({
        model: provider.modelId, installed, userTexts: turn.userTexts, systemNotes: turn.systemNotes,
      }));

      const texts = CLAIMS.map(({ path }) => {
        // A missing/unreadable/empty spec is a fixture failure, not a bug witness.
        const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
        expect(text.trim().startsWith("#"), `required normative document: ${path}`).toBe(true);
        return text;
      });
      expectNoPhantomForwarding(texts);
    } finally {
      await handle?.dispose();
      workspace.dispose();
    }
  });
});
