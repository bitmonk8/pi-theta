import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface CredentialMetadataRuntime {
  listCredentials(): Promise<readonly { readonly providerId: string; readonly type: string }[]>;
  getProvider(providerId: string): { readonly auth: { readonly oauth?: unknown } } | undefined;
}

/** Inspect credential metadata/capabilities only; never read or render tokens. */
export async function liveModelPreconditionMessage(
  runtime: CredentialMetadataRuntime,
  agentDir = getAgentDir(),
): Promise<string> {
  const credentials = await runtime.listCredentials();
  const unsupported = credentials.filter(
    (credential) => credential.type === "oauth" && !runtime.getProvider(credential.providerId)?.auth.oauth,
  );
  const detail = unsupported.length > 0
    ? " Stored OAuth credentials exist, but this checkout's SDK does not support OAuth for provider(s): " +
      unsupported.map((credential) => credential.providerId).join(", ") + ". " +
      "This can be a pi version/provider-identity mismatch, not a missing login " +
      "(older pi uses openai-codex for ChatGPT; newer pi uses openai). " +
      "Use a compatible test host and SDK/login; do not rename or copy OAuth tokens between providers."
    : " Check the test process's agent directory, provider configuration, and credential-store access; " +
      "a working interactive session does not guarantee that a separate SDK process sees the same configuration.";
  return "live-host precondition unmet: no usable live provider/model " +
    "(ModelRegistry.getAvailable() is empty). Agent directory: " + agentDir + "." + detail +
    " This suite never silently skips.";
}
