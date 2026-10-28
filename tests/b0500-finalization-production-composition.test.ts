// Offline production parser → binding → executor → real SDK projection →
// finalization dispatcher. Only host lifecycle and complete() are scripted.
import { scripted } from "./helpers/scripted-complete-queue-mock";
import { beforeEach, describe, expect, it } from "vitest";
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { b0500Assistant, driveB0500Composition, expectB0500FinalizationContext, expectB0500Score } from "./helpers/b0500-finalization-composition";

const MODEL = { id: "b0500-offline", provider: "openai", api: "openai-responses", contextWindow: 200000 } as Model<Api>;
const REGISTRY = { getAvailable: () => [MODEL], getApiKeyAndHeaders: async () => ({ ok: true }) } as unknown as ModelRegistry;
beforeEach(() => { scripted.calls.length = 0; scripted.queue.length = 0; });

async function drive(relocate: boolean) {
  scripted.queue.push(call => {
    const context = call.context as Context;
    const name = context.tools?.[0]?.name;
    if (name === undefined) throw new Error("B0500 synthetic response tool missing");
    return { ...b0500Assistant(MODEL, ""), stopReason: "toolUse",
      content: [{ type: "toolCall", id: "b0500-submission", name, arguments: relocate ? { outcome: "answer", answer: { score: 777 } } : { score: 777 } }] };
  });
  const result = await driveB0500Composition({ model: MODEL, registry: REGISTRY, relocate });
  expectB0500Score(result.value);
  expect(scripted.calls, "one query, one off-session submission, no restart/repair").toHaveLength(1);
  return { ...result, context: scripted.calls[0]!.context as Context };
}

describe("0500 production composition finalization", () => {
  it("healthy control uses ordinary typed submission without finalization", async () => {
    const result = await drive(false);
    expect(result.context.messages).toHaveLength(3);
    expect(JSON.stringify(result.context.messages)).not.toContain("one-shot output finalization");
  });
  it("prior-history edit relocates completed own typed output into a fresh evidence-only finalizer", async () => {
    const result = await drive(true);
    expectB0500FinalizationContext(result.context);
  });
});
