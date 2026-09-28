// Bug 0493 D1 (b) — the PIC-65 layer-2 parent-liveness watchdog: the reader
// of the logical parent's pid the parent-launcher env marker carries
// (`PI_THETA_SUBAGENT_PARENT_PID`, PIC-58). This module polls the parent's
// existence and, once it is gone, writes one forensic stderr line and ends the
// process — bounding a visible child's Err linger to one poll interval past
// uncontrolled parent death (subagent.md #subagent-orphan-prevention layer
// 2/3).
//
// Pure logic over injected seams (liveness probe, interval scheduler, stderr
// writer, `endProcess`) — no globals/statics, CLAUDE.md — so the composition
// root supplies the production seams and tests supply fakes.
//
// Spec: docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md
// §Fix "D1 (b)"; subagent.md #subagent-orphan-prevention.

/** The heartbeat cadence: ends an orphan within ~10 s against the observed ~50 min lingers. */
export const SUBAGENT_PARENT_LIVENESS_POLL_MS = 10_000;

/** The parent's classified existence state, per poll. */
export type ParentLiveness = "alive" | "gone";

/** A liveness probe over a pid, injected so production reads `process.kill`. */
export type ParentLivenessProbe = (pid: number) => ParentLiveness;

/** A `setInterval`/`clearInterval`-shaped timer, so the scheduler seam can be faked. */
export interface WatchdogTimer {
  unref(): unknown;
}

/** The interval-scheduling seam the watchdog arms and clears through. */
export interface WatchdogScheduler {
  setInterval(callback: () => void, ms: number): WatchdogTimer;
  clearInterval(timer: WatchdogTimer): void;
}

/** The process seams the watchdog acts through — all injected, no ambient reads. */
export interface SubagentParentWatchdogSeams {
  /** This process's own pid — an arming guard against a carriage that (mis)names itself. */
  readonly ownPid: number;
  readonly probe: ParentLivenessProbe;
  readonly scheduler: WatchdogScheduler;
  readonly writeStderr: (text: string) => void;
  readonly endProcess: (code: number) => void;
}

/** The armed watchdog's handle: the parent pid it polls, and a disposer. */
export interface SubagentParentWatchdogHandle {
  readonly parentPid: number;
  dispose(): void;
}

/**
 * `process.kill(pid, 0)` classified `ESRCH`-only as gone: success and `EPERM`
 * (the process exists; this process may not signal it — relevant on POSIX,
 * and per Node's own docs the same call is the Windows-safe existence check,
 * since win32 routes signal 0 through libuv's `OpenProcess` probe) both read
 * as alive. Any other thrown error is NOT reclassified — no catch-all,
 * CLAUDE.md — it propagates out of the poll callback as an uncaught
 * exception and crashes the child: never folded into "gone" (a quiet kill on
 * a misread) nor into "alive" (a silently disarmed watchdog). With the pid
 * range-validated by `parseParentPidCarriage` (a positive integer no larger
 * than `MAX_PROCESS_ID`), Node's own argument check cannot throw, and the
 * outcomes `kill(2)` defines for signal 0 are exactly success, `EPERM` and
 * `ESRCH`; the crash is reserved for a platform error outside that set.
 */
export function createKillZeroLivenessProbe(
  kill: (pid: number, signal: 0) => unknown,
): ParentLivenessProbe {
  return (pid: number): ParentLiveness => {
    try {
      kill(pid, 0);
      return "alive";
    } catch (error: unknown) { // allow-broad-catch: PIC-65 parent-liveness probe — narrow re-throw below: only ESRCH/EPERM classify; every other error propagates — pi-integration-contract/subagent.md
      const code = (error as { readonly code?: unknown } | null | undefined)?.code;
      if (code === "ESRCH") {
        return "gone";
      }
      if (code === "EPERM") {
        return "alive";
      }
      throw error;
    }
  };
}

/**
 * The largest pid `process.kill` accepts: Node rejects a pid that does not
 * survive `pid | 0` (a signed 32-bit integer) with a `TypeError`
 * (`ERR_INVALID_ARG_TYPE`), which the probe would re-throw and crash the
 * child on its first poll. No OS allocates a pid past it.
 */
export const MAX_PROCESS_ID = 2_147_483_647;

/**
 * Parse the parent-pid carriage into an arming-eligible pid, or `undefined`
 * when the carriage must never arm: absent, not a plain decimal integer, not
 * `> 0`, above `MAX_PROCESS_ID`, or equal to this process's own pid. A bad
 * read leaves the child unwatched — no parent-death bound on its linger —
 * never armed on a pid that cannot be the real parent.
 */
export function parseParentPidCarriage(raw: string | undefined, ownPid: number): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  // Digits only — rejects "4242abc", "-4242", "42.5", "NaN", "Infinity", "" /
  // whitespace-only, and anything `Number(...)` would otherwise coerce.
  if (!/^[0-9]+$/.test(trimmed)) {
    return undefined;
  }
  const pid = Number(trimmed);
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > MAX_PROCESS_ID || pid === ownPid) {
    return undefined;
  }
  return pid;
}

/**
 * Arm the watchdog for `parentPidCarriage`. Returns `undefined` (nothing
 * armed, nothing scheduled) when the carriage does not parse to a valid
 * foreign pid. Otherwise schedules one unref'd interval at
 * `SUBAGENT_PARENT_LIVENESS_POLL_MS`; each tick probes the parent's liveness
 * and, on the FIRST "gone" reading, writes the forensic stderr line and calls
 * `endProcess(1)` exactly once — later ticks (should the injected
 * `endProcess` not actually terminate the process, as in a test) are inert.
 */
export function armSubagentParentWatchdog(
  parentPidCarriage: string | undefined,
  seams: SubagentParentWatchdogSeams,
): SubagentParentWatchdogHandle | undefined {
  const parentPid = parseParentPidCarriage(parentPidCarriage, seams.ownPid);
  if (parentPid === undefined) {
    return undefined;
  }
  let fired = false;
  const poll = (): void => {
    if (fired) {
      return;
    }
    if (seams.probe(parentPid) !== "gone") {
      return;
    }
    fired = true;
    seams.writeStderr(`pi-theta: subagent child exiting — parent process ${parentPid} gone\n`);
    seams.endProcess(1);
  };
  const timer = seams.scheduler.setInterval(poll, SUBAGENT_PARENT_LIVENESS_POLL_MS);
  timer.unref();
  return {
    parentPid,
    dispose: (): void => {
      seams.scheduler.clearInterval(timer);
    },
  };
}

/**
 * Production seams: `process.kill`/`process.pid` for liveness, real
 * `setInterval`/`clearInterval` for the poll, `process.stderr.write` and
 * `process.exit` for the terminal action.
 */
export function createProductionParentWatchdogSeams(): SubagentParentWatchdogSeams {
  return {
    ownPid: process.pid,
    probe: createKillZeroLivenessProbe((pid: number, signal: 0): unknown => process.kill(pid, signal)),
    scheduler: {
      setInterval: (callback: () => void, ms: number): WatchdogTimer => setInterval(callback, ms),
      clearInterval: (timer: WatchdogTimer): void => clearInterval(timer as unknown as NodeJS.Timeout),
    },
    writeStderr: (text: string): void => {
      process.stderr.write(text);
    },
    endProcess: (code: number): void => {
      process.exit(code);
    },
  };
}
