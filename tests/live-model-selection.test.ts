import { describe, expect, it } from "vitest";
import { selectLiveModel } from "./helpers/live-model-selection";

const old = { provider: "openai", id: "gpt-4" };
const sol = { provider: "openai", id: "gpt-6.1-sol" };
const configured = { provider: "openai", id: "gpt-6-sol" };
const otherProvider = { provider: "anthropic", id: "claude-sonnet-5" };

describe("shared live-model selection — OpenAI subscription policy", () => {
  it("prefers GPT Sol 6.1 for programming even if Claude or older GPT models appear first", () => {
    expect(selectLiveModel([otherProvider, old, configured, sol], { provider: "openai", model: configured.id })).toBe(sol);
  });
  it("falls back to the configured OpenAI model before arbitrary catalog order", () => {
    expect(selectLiveModel([old, configured], { provider: "openai", model: configured.id })).toBe(configured);
  });
  it("never invents a model or automatically selects a Claude fallback", () => {
    expect(selectLiveModel([old, configured], { provider: "other", model: configured.id })).toBe(old);
    expect(selectLiveModel([old], { provider: "openai", model: configured.id })).toBe(old);
    expect(selectLiveModel([otherProvider], { provider: "anthropic", model: otherProvider.id })).toBeUndefined();
    expect(selectLiveModel([], { provider: "openai", model: configured.id })).toBeUndefined();
  });
});
