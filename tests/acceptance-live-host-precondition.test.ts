// Offline coverage of the shared H9a precondition; no credentials or host spawn.

import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLiveHost } from "./live/acceptance/harness";

afterEach(() => vi.restoreAllMocks());

/** Supply only the registry fields the live-host resolver reads. */
function availableModels(models: readonly { readonly id?: string; readonly provider: string }[]): void {
  vi.spyOn(ModelRuntime, "create").mockResolvedValue({} as ModelRuntime);
  vi.spyOn(ModelRegistry.prototype, "refresh").mockResolvedValue(undefined);
  vi.spyOn(ModelRegistry.prototype, "getAvailable").mockReturnValue(
    models as ReturnType<ModelRegistry["getAvailable"]>,
  );
}

describe("requireLiveHost", () => {
  it("returns the configured model id", async () => {
    availableModels([{ provider: "anthropic", id: "claude-sonnet-5" }]);
    await expect(requireLiveHost()).resolves.toEqual({ modelId: "claude-sonnet-5" });
  });

  it.each([
    { provider: "anthropic", id: "" },
    { provider: "anthropic" },
  ])("fails loudly when the available model has no usable id: %j", async (model) => {
    availableModels([model]);
    await expect(requireLiveHost()).rejects.toThrow(
      "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
    );
  });

  it("retains the missing-provider failure", async () => {
    availableModels([]);
    await expect(requireLiveHost()).rejects.toThrow(
      "live-host precondition unmet: no live provider/model configured (ModelRegistry.getAvailable() is empty).",
    );
  });
});
