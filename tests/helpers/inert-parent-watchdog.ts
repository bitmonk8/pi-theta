/**
 * Inert parent-liveness watchdog seams for compositions that run the
 * subagent-root regime in-process (subagent.md #subagent-orphan-prevention).
 *
 * A regime-active compose arms the watchdog against its control plane's
 * parent pid. Left on the production seams it schedules a real poll interval
 * the test never disposes, and a pid that is not this worker's live parent
 * reads "gone" and calls `process.exit(1)` on the worker. Inert seams keep the
 * arming path exercised while the probe always reports "alive" and the
 * scheduler never ticks.
 */
import type { SubagentParentWatchdogSeams } from "../../src/runtime/subagent-parent-watchdog";

export function inertWatchdogSeams(): SubagentParentWatchdogSeams {
  return {
    ownPid: process.pid,
    probe: (): "alive" => "alive",
    scheduler: {
      setInterval: () => ({ unref: (): void => {} }),
      clearInterval: (): void => {},
    },
    writeStderr: (): void => {},
    endProcess: (): void => {},
  };
}
