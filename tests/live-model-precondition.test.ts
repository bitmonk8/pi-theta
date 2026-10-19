import { describe, expect, it, vi } from "vitest";
import { liveModelPreconditionMessage } from "./helpers/live-model-precondition";

describe("live model precondition diagnostics", () => {
  it("distinguishes stored OAuth unsupported by the SDK from a missing login", async () => {
    const getProvider = vi.fn(() => ({ auth: {} }));
    const message = await liveModelPreconditionMessage({
      listCredentials: async () => [{ providerId: "openai", type: "oauth" }],
      getProvider,
    }, "/test/agent");
    expect(message).toContain("SDK does not support OAuth for provider(s): openai");
    expect(message).toContain("older pi uses openai-codex");
    expect(message).toContain("not a missing login");
    expect(message).toContain("Agent directory: /test/agent");
    expect(message).toContain("never silently skips");
    expect(getProvider).toHaveBeenCalledWith("openai");
  });

  it.each([
    { credentials: [], provider: undefined },
    { credentials: [{ providerId: "openai", type: "api_key" }], provider: { auth: {} } },
    { credentials: [{ providerId: "openai", type: "oauth" }], provider: { auth: { oauth: {} } } },
  ])("does not blame provider-identity mismatch without evidence: %j", async ({ credentials, provider }) => {
    const message = await liveModelPreconditionMessage({
      listCredentials: async () => credentials,
      getProvider: () => provider,
    }, "/test/agent");
    expect(message).not.toContain("SDK does not support OAuth");
    expect(message).toContain("credential-store access");
    expect(message).toContain("never silently skips");
  });
});
