// Offline coverage of the shared H9a precondition; no credentials or host spawn.

import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLiveHost } from "./live/acceptance/harness";

afterEach(() => vi.restoreAllMocks());

/** Supply only the registry fields the live-host resolver reads. */
function availableModels(models: readonly { readonly id?: string; readonly provider: string }[]): void {
  vi.spyOn(ModelRuntime, "create").mockResolvedValue({
    listCredentials: async () => [],
    getProvider: () => undefined,
  } as unknown as ModelRuntime);
  vi.spyOn(ModelRegistry.prototype, "refresh").mockResolvedValue({ aborted: false, errors: new Map() });
  vi.spyOn(ModelRegistry.prototype, "getAvailable").mockReturnValue(
    models as ReturnType<ModelRegistry["getAvailable"]>,
  );
}

describe("requireLiveHost", () => {
  it("returns the configured model id", async () => {
    availableModels([{ provider: "openai", id: "gpt-6.1-sol" }]);
    await expect(requireLiveHost()).resolves.toEqual({ modelId: "gpt-6.1-sol" });
  });

  it.each([
    { provider: "openai", id: "" },
    { provider: "openai" },
  ])("fails loudly when the available model has no usable id: %j", async (model) => {
    availableModels([model]);
    await expect(requireLiveHost()).rejects.toThrow(
      "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
    );
  });

  it("retains the missing-provider failure", async () => {
    availableModels([]);
    await expect(requireLiveHost()).rejects.toThrow(
      "live-host precondition unmet: no usable live provider/model (ModelRegistry.getAvailable() is empty).",
    );
  });
});
