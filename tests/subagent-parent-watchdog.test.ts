// Bug 0493 D1 (b) — the PIC-65 layer-2 parent-liveness watchdog.
//
// A subagent child that has delivered its envelope to a parent that then exits
// has no reader and no prospect of one. The launcher already writes the
// logical parent's pid into the child control plane
// (`PI_THETA_SUBAGENT_PARENT_PID`); this watchdog is the missing reader: poll
// the parent's existence, and once it is gone write one forensic stderr line
// and end the process.
//
// WHAT THESE CELLS PIN (the module contract the production composition wires):
//
//   - Arming guards. Only a parseable integer pid in 1..2147483647 that is not
//     the child's own pid arms. Anything else — absent, garbage, zero,
//     negative, NaN, fractional, above the `process.kill` pid range, own pid —
//     arms nothing: a bad read leaves the child unwatched, never armed on a
//     pid that cannot be its parent (and never on one `process.kill` rejects
//     with a TypeError, which the probe would re-throw into a crash).
//   - Poll. One interval of `SUBAGENT_PARENT_LIVENESS_POLL_MS` (10 s), unref'd so
//     the watchdog alone never holds the process open; disposal clears it.
//   - Liveness. `process.kill(pid, 0)` semantics: success ⇒ alive, `EPERM` ⇒
//     alive (the process exists, we may not signal it), `ESRCH` ⇒ gone. Nothing
//     but `ESRCH` is ever read as gone, so a live parent is never mistaken for
//     a dead one.
//   - Action. Single-fire: exactly one stderr line
//     `pi-theta: subagent child exiting — parent process <pid> gone` (newline
//     terminated) followed by `endProcess(1)`, however many ticks follow.
//
// THE API THESE CELLS BIND (module `src/runtime/subagent-parent-watchdog.ts`):
//
//   SUBAGENT_PARENT_LIVENESS_POLL_MS: 10_000
//   type ParentLiveness = "alive" | "gone"
//   type ParentLivenessProbe = (pid: number) => ParentLiveness
//   createKillZeroLivenessProbe(kill: (pid: number, signal: 0) => unknown): ParentLivenessProbe
//   MAX_PROCESS_ID: 2_147_483_647
//   parseParentPidCarriage(raw: string | undefined, ownPid: number): number | undefined
//   interface WatchdogTimer { unref(): unknown }
//   interface WatchdogScheduler {
//     setInterval(callback: () => void, ms: number): WatchdogTimer;
//     clearInterval(timer: WatchdogTimer): void;
//   }
//   interface SubagentParentWatchdogSeams {
//     readonly ownPid: number;
//     readonly probe: ParentLivenessProbe;
//     readonly scheduler: WatchdogScheduler;
//     readonly writeStderr: (text: string) => void;
//     readonly endProcess: (code: number) => void;
//   }
//   interface SubagentParentWatchdogHandle { readonly parentPid: number; dispose(): void }
//   armSubagentParentWatchdog(
//     parentPidCarriage: string | undefined,
//     seams: SubagentParentWatchdogSeams,
//   ): SubagentParentWatchdogHandle | undefined
//   createProductionParentWatchdogSeams(): SubagentParentWatchdogSeams
//
// The composition-root cells (armed iff regime ∧ valid carriage, reused by a
// repeat compose of one instance, cleared at `session_shutdown`) live in
// `tests/subagent-parent-watchdog-composition.test.ts`; the real-process cells
// over the production seams live in
// `tests/subagent-parent-watchdog-real-process.test.ts`.
//
// TIER: unit — pure logic over injected seams, plus one real-process cell for
// the production probe (a spawned-and-exited node process is the only honest
// "gone" pid). No provider, no tokens.
//
// Spec: docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md
// §Fix "D1 (b)" and §"Witnesses" 2 and 6; subagent.md #subagent-orphan-prevention.

import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  MAX_PROCESS_ID,
  SUBAGENT_PARENT_LIVENESS_POLL_MS,
  armSubagentParentWatchdog,
  createKillZeroLivenessProbe,
  createProductionParentWatchdogSeams,
  parseParentPidCarriage,
  type ParentLiveness,
  type SubagentParentWatchdogSeams,
  type WatchdogTimer,
} from "../src/runtime/subagent-parent-watchdog";

const OWN_PID = 1000;
const PARENT_PID = 4242;

/** The exact forensic line the watchdog writes before ending the process. */
function parentGoneLine(pid: number): string {
  return `pi-theta: subagent child exiting \u2014 parent process ${pid} gone\n`;
}

interface FakeTimer extends WatchdogTimer {
  readonly id: number;
  unrefCalls: number;
  unref(): FakeTimer;
}

interface WatchdogRig {
  readonly seams: SubagentParentWatchdogSeams;
  readonly intervals: { readonly callback: () => void; readonly ms: number; readonly timer: FakeTimer }[];
  readonly cleared: FakeTimer[];
  readonly probed: number[];
  readonly stderr: string[];
  readonly ended: number[];
  /** Run every still-scheduled interval callback once (one poll period elapsing). */
  tick(): void;
  liveness: ParentLiveness;
}

function makeRig(): WatchdogRig {
  let nextId = 1;
  const rig: WatchdogRig = {
    intervals: [],
    cleared: [],
    probed: [],
    stderr: [],
    ended: [],
    liveness: "alive",
    tick: (): void => {
      for (const interval of rig.intervals) {
        if (!rig.cleared.includes(interval.timer)) {
          interval.callback();
        }
      }
    },
    seams: {
      ownPid: OWN_PID,
      probe: (pid: number): ParentLiveness => {
        rig.probed.push(pid);
        return rig.liveness;
      },
      scheduler: {
        setInterval: (callback: () => void, ms: number): WatchdogTimer => {
          const timer: FakeTimer = {
            id: nextId++,
            unrefCalls: 0,
            unref: (): FakeTimer => {
              timer.unrefCalls += 1;
              return timer;
            },
          };
          rig.intervals.push({ callback, ms, timer });
          return timer;
        },
        clearInterval: (timer: WatchdogTimer): void => {
          rig.cleared.push(timer as FakeTimer);
        },
      },
      writeStderr: (text: string): void => {
        rig.stderr.push(text);
      },
      endProcess: (code: number): void => {
        rig.ended.push(code);
      },
    },
  };
  return rig;
}

/** A `process.kill`-shaped fake that throws a Node errno error with `code`. */
function killThrowing(code: string): (pid: number, signal: 0) => unknown {
  return (): never => {
    throw Object.assign(new Error(`kill ${code}`), { code });
  };
}

describe("bug 0493 D1 (b) — the poll constant", () => {
  it("SUBAGENT_PARENT_LIVENESS_POLL_MS is the 10 s heartbeat cadence", () => {
    expect(SUBAGENT_PARENT_LIVENESS_POLL_MS).toBe(10_000);
  });
});

describe("bug 0493 D1 (b) — arming guards: only a valid foreign parent pid arms", () => {
  it("a parseable integer pid > 0 that is not the own pid arms ONE unref'd interval at the poll cadence", () => {
    const rig = makeRig();
    const handle = armSubagentParentWatchdog(String(PARENT_PID), rig.seams);
    expect(handle).toBeDefined();
    expect(handle?.parentPid).toBe(PARENT_PID);
    expect(rig.intervals).toHaveLength(1);
    expect(rig.intervals[0]!.ms).toBe(SUBAGENT_PARENT_LIVENESS_POLL_MS);
    expect(rig.intervals[0]!.timer.unrefCalls).toBe(1);
    // Arming alone never ends anything.
    expect(rig.stderr).toEqual([]);
    expect(rig.ended).toEqual([]);
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["garbage", "not-a-pid"],
    ["trailing garbage", "4242abc"],
    ["zero", "0"],
    ["negative", "-4242"],
    ["NaN", "NaN"],
    ["fractional", "42.5"],
    ["infinite", "Infinity"],
    ["one past the process.kill pid range", "2147483648"],
    ["far past the process.kill pid range", "9007199254740991"],
    ["past the safe-integer range", "99999999999999999999"],
    ["own pid", String(OWN_PID)],
  ])("never arms for a %s carriage", (_label, raw) => {
    const rig = makeRig();
    expect(armSubagentParentWatchdog(raw, rig.seams)).toBeUndefined();
    expect(rig.intervals).toEqual([]);
    expect(rig.stderr).toEqual([]);
    expect(rig.ended).toEqual([]);
  });

  it("parseParentPidCarriage applies the same guards: the valid pid, else undefined", () => {
    expect(parseParentPidCarriage("4242", OWN_PID)).toBe(4242);
    expect(parseParentPidCarriage("2147483647", OWN_PID)).toBe(MAX_PROCESS_ID);
    for (const raw of [
      undefined,
      "",
      "abc",
      "0",
      "-1",
      "NaN",
      "1.5",
      "Infinity",
      "2147483648",
      "9007199254740991",
      String(OWN_PID),
    ]) {
      expect(parseParentPidCarriage(raw, OWN_PID), `carriage ${JSON.stringify(raw)}`).toBeUndefined();
    }
  });
});

describe("bug 0493 D1 (b) — the poll: alive parents are left alone, a gone parent ends the child exactly once", () => {
  it("an alive probe never fires, however many polls elapse", () => {
    const rig = makeRig();
    armSubagentParentWatchdog(String(PARENT_PID), rig.seams);
    rig.tick();
    rig.tick();
    rig.tick();
    expect(rig.probed.length).toBeGreaterThan(0);
    expect(rig.probed.every((pid) => pid === PARENT_PID)).toBe(true);
    expect(rig.stderr).toEqual([]);
    expect(rig.ended).toEqual([]);
  });

  it("a gone probe fires once: one stderr line, then endProcess(1)", () => {
    const rig = makeRig();
    const order: string[] = [];
    const seams: SubagentParentWatchdogSeams = {
      ...rig.seams,
      writeStderr: (text: string): void => {
        order.push("stderr");
        rig.seams.writeStderr(text);
      },
      endProcess: (code: number): void => {
        order.push("end");
        rig.seams.endProcess(code);
      },
    };
    armSubagentParentWatchdog(String(PARENT_PID), seams);
    rig.tick();
    expect(rig.stderr).toEqual([]);
    rig.liveness = "gone";
    rig.tick();
    expect(rig.stderr).toEqual([parentGoneLine(PARENT_PID)]);
    expect(rig.ended).toEqual([1]);
    expect(order).toEqual(["stderr", "end"]);
  });

  it("single-fire: further polls after the parent is gone write nothing more and end nothing more", () => {
    const rig = makeRig();
    armSubagentParentWatchdog(String(PARENT_PID), rig.seams);
    rig.liveness = "gone";
    rig.tick();
    rig.tick();
    rig.tick();
    expect(rig.stderr).toEqual([parentGoneLine(PARENT_PID)]);
    expect(rig.ended).toEqual([1]);
  });

  it("dispose clears the armed interval (the very timer it scheduled)", () => {
    const rig = makeRig();
    const handle = armSubagentParentWatchdog(String(PARENT_PID), rig.seams);
    expect(handle).toBeDefined();
    handle?.dispose();
    expect(rig.cleared).toContain(rig.intervals[0]!.timer);
    // With the interval cleared no poll runs, so a parent that dies later ends nothing.
    rig.liveness = "gone";
    rig.tick();
    expect(rig.stderr).toEqual([]);
    expect(rig.ended).toEqual([]);
  });
});

describe("bug 0493 D1 (b) — the production probe: process.kill(pid, 0) classified ESRCH-only", () => {
  it("a successful signal-0 send ⇒ alive, and the probe sends signal 0 to the probed pid", () => {
    const sent: [number, number][] = [];
    const probe = createKillZeroLivenessProbe((pid: number, signal: 0): true => {
      sent.push([pid, signal]);
      return true;
    });
    expect(probe(PARENT_PID)).toBe("alive");
    expect(sent).toEqual([[PARENT_PID, 0]]);
  });

  it("EPERM ⇒ alive (the process exists; this process may not signal it)", () => {
    expect(createKillZeroLivenessProbe(killThrowing("EPERM"))(PARENT_PID)).toBe("alive");
  });

  it("ESRCH ⇒ gone", () => {
    expect(createKillZeroLivenessProbe(killThrowing("ESRCH"))(PARENT_PID)).toBe("gone");
  });

  it("over the REAL process.kill: this process is alive", () => {
    const probe = createKillZeroLivenessProbe((pid: number, signal: 0): true => process.kill(pid, signal));
    expect(probe(process.pid)).toBe("alive");
  });

  it("over the REAL process.kill: a spawned node process that has exited is gone", async () => {
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    const pid = child.pid;
    expect(pid, "precondition: the probe subject process must have spawned").toBeTypeOf("number");
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => {
        resolve();
      });
    });
    const probe = createKillZeroLivenessProbe((target: number, signal: 0): true => process.kill(target, signal));
    expect(probe(pid as number)).toBe("gone");
  });

  it("over the REAL process.kill: MAX_PROCESS_ID is the pid ceiling — classified at it, a re-thrown TypeError one past it", () => {
    const probe = createKillZeroLivenessProbe((target: number, signal: 0): true => process.kill(target, signal));
    expect(probe(MAX_PROCESS_ID)).toBe("gone");
    // The pid the carriage parser refuses: an unclassified error propagates
    // rather than being folded into either reading.
    expect(() => probe(MAX_PROCESS_ID + 1)).toThrow(TypeError);
  });

  it("createProductionParentWatchdogSeams reads this process: ownPid is process.pid and its probe sees this process alive", () => {
    const seams = createProductionParentWatchdogSeams();
    expect(seams.ownPid).toBe(process.pid);
    expect(seams.probe(process.pid)).toBe("alive");
  });
});
