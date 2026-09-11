/**
 * Ambient subagent control-plane scrub for CHILD-SIDE SIMULATION tests.
 *
 * Bug 0474 §Residual: three default-suite test files simulate a subagent child
 * IN-PROCESS — they plant a partial `PI_THETA_*` control plane on
 * `process.env` (with `PI_THETA_SUBAGENT_PARENT_PID = process.ppid`, so the
 * planted values authenticate per subagent.md
 * `#subagent-control-plane-authentication`) and drive the extension directly,
 * never crossing `buildSubagentChildEnv`. The launcher-side scrub that fix
 * 0474 installed therefore cannot protect them: an ambient control plane
 * carried by the RUNNING process (exactly what a quality-loop fixer's own
 * `npm test` sees, because the fixer itself runs inside a subagent child)
 * reaches the simulated child verbatim and legitimately authenticates, so a
 * foreign callable-hash map / params file / marked root preempts the test's
 * own plane and the file goes red for a reason that has nothing to do with the
 * code under test.
 *
 * The hygiene is composition, mirroring the launcher's own fix: the simulated
 * child's control plane must be built from the TEST alone. Callers scrub
 * before planting and restore afterwards.
 *
 * The extension pin (`PI_THETA_SUBAGENT_EXTENSION_PIN`) is deliberately NOT in
 * the scrub set — it is heritable by design (AGENTS.md `#subagent-child-pins`,
 * subagent.md `#subagent-extension-pin`), and a harness that pinned the top of
 * the chain must keep every nesting level loading that build.
 */
import { SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS } from "../../src/runtime/subagent-launcher";

/** Opaque snapshot handed back to `restoreAmbientControlPlane`. */
export type AmbientControlPlaneSnapshot = ReadonlyMap<string, string | undefined>;

/**
 * Remove every per-launch control-plane carrier from `process.env`, returning
 * the prior values so the process environment can be put back exactly as it
 * was found (including keys that were absent).
 */
export function scrubAmbientControlPlane(): AmbientControlPlaneSnapshot {
  const snapshot = new Map<string, string | undefined>();
  for (const key of SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS) {
    snapshot.set(key, process.env[key]);
    delete process.env[key];
  }
  return snapshot;
}

/** Restore the environment captured by `scrubAmbientControlPlane`. */
export function restoreAmbientControlPlane(snapshot: AmbientControlPlaneSnapshot): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
