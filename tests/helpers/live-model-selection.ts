import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";

interface ModelReference {
  readonly id?: string;
  readonly provider?: string;
}

/** Keep every live harness on one policy, without treating catalog order as subscription access. */
export function selectLiveModel<T extends ModelReference>(
  available: readonly T[],
  configured?: { readonly provider?: string; readonly model?: string },
): T | undefined {
  const settings = configured ?? (() => {
    const manager = SettingsManager.create(process.cwd(), getAgentDir());
    return { provider: manager.getDefaultProvider(), model: manager.getDefaultModel() };
  })();
  return available.find((model) => model.provider === "openai" && model.id === "gpt-6.1-sol") ??
    available.find((model) => model.provider === "openai" && settings.model !== undefined && model.id === settings.model &&
      (settings.provider === undefined || model.provider === settings.provider)) ??
    available.find((model) => model.provider === "openai");
}
