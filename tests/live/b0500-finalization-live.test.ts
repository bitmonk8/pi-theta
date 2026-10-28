// B0500 bounded OpenAI witness. Scripted host settlement + REAL SDK context
// edit/projection and production binding/finalization dispatcher. complete() is
// observed but forwarded unchanged to pi-ai (not replaced by a scripted reply).
// This does not claim natural overflow compaction or real-host event timing.
import { describe, expect, it, vi } from "vitest";
import type { Context } from "@earendil-works/pi-ai";

const observed = vi.hoisted(() => ({ contexts: [] as Context[] }));
vi.mock("@earendil-works/pi-ai/compat", async importOriginal => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai/compat")>();
  return { ...actual, complete: (...args: Parameters<typeof actual.complete>) => {
    // Deliberately do not retain auth/options/headers or provider replies.
    observed.contexts.push(args[1]);
    return actual.complete(...args);
  } };
});

import { driveB0500Composition, expectB0500FinalizationContext, expectB0500Score } from "../helpers/b0500-finalization-composition";
import { failLoudly, requireLiveProvider } from "./harness";
import { driveB0500SdkRetainNone } from "./b0500-sdk-retain-none";

// Runtime bounds the entire finalization (auth + forcing fallback) at 60s.
// One tiny arithmetic query/evidence payload, at most two physical requests.
const CELL_BOUND_MS = 90_000;

describe("0500 live production finalization with real SDK projection", () => {
  it("actual SDK read-only receipt survives controlled retain-none as untyped output with zero finalizer tools", async () => {
    observed.contexts.length = 0;
    const provider = await requireLiveProvider();
    if (provider.model.provider !== "openai") failLoudly("B0500 SDK witness requires configured OpenAI; no provider fallback.");
    const result = await driveB0500SdkRetainNone(provider);
    expect(observed.contexts, "untyped unavailable output requires exactly one real fresh synthesis request").toHaveLength(1);
    const context = observed.contexts[0]!;
    expect(context.tools, "untyped recovery never exposes operational OR synthetic tools").toEqual([]);
    expect(context.messages.map(message => message.role)).toEqual(["user"]);
    const serialized = JSON.stringify(context.messages);
    expect(serialized).toContain("one-shot output finalization");
    expect(serialized).toContain(result.query);
    expect(serialized).toContain(result.receipt);
    expect(result.query).not.toMatch(/146|297|443/);
    expect(serialized, "unavailable answer text is not resurrected from raw terminal history").not.toMatch(/\b443\b/);
    expect(serialized).not.toContain("B0500 controlled summary");
  }, CELL_BOUND_MS);
  it("OpenAI finalizes a relocated completed typed answer using only fresh attributable evidence", async () => {
    observed.contexts.length = 0;
    const provider = await requireLiveProvider();
    if (provider.model.provider !== "openai") {
      failLoudly("B0500 live precondition unmet: a configured OpenAI chat model is required (no provider fallback).");
    }
    // Official registry API only; no credential files, headers or response
    // transcripts are inspected/logged. Absence must red, never skip.
    const auth = await provider.modelRegistry.getApiKeyAndHeaders(provider.model);
    if (!auth.ok) failLoudly("B0500 live precondition unmet: OpenAI model authentication is unavailable.");
    const result = await driveB0500Composition({ model: provider.model, registry: provider.modelRegistry, relocate: true });
    expectB0500Score(result.value);
    expect(observed.contexts.length, "one logical finalization allows only the named-tool rejection fallback").toBeGreaterThanOrEqual(1);
    expect(observed.contexts.length).toBeLessThanOrEqual(2);
    for (const context of observed.contexts) expectB0500FinalizationContext(context);
  }, CELL_BOUND_MS);
});
