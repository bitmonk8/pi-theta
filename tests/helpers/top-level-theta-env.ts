import {
  SUBAGENT_CONTROL_PLANE_ENV_KEYS,
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../../src/runtime/subagent-launcher";

/**
 * A new test host is not a continuation of the worker that launched vitest.
 * Scrub its inherited invocation before authenticating this host's own pin.
 * Explicit overrides may opt a wire probe into its OWN child regime; ambient
 * root/params/depth/hash/entry state must never acquire a fresh authentication.
 * Credentials, agent-directory selection, and other unrelated env are preserved.
 */
export function topLevelThetaHostEnv(
  inherited: Readonly<Record<string, string | undefined>>,
  extensionEntry: string,
  parentPid: number,
  explicit: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  const clean = { ...inherited };
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) delete clean[key];
  return {
    ...clean,
    ...explicit,
    [SUBAGENT_EXTENSION_PIN_ENV]: extensionEntry,
    [SUBAGENT_PARENT_PID_ENV]: String(parentPid),
  };
}

/** In-process harnesses must clear absent keys, not just assign clean values. */
export function resetTopLevelThetaControlPlane(
  env: Record<string, string | undefined>,
  extensionEntry: string,
  parentPid: number,
): void {
  const clean = topLevelThetaHostEnv(env, extensionEntry, parentPid);
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) {
    if (clean[key] === undefined) delete env[key];
    else env[key] = clean[key];
  }
}
