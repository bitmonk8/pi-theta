// Bug 0493 D1 (b) — the parent-liveness watchdog over its PRODUCTION seams, in
// a real process (subagent.md #subagent-orphan-prevention layer 2).
//
// The unit cells (`tests/subagent-parent-watchdog.test.ts`) drive the watchdog
// over fake seams, and the composition cells drive the arming. Neither proves
// that `createProductionParentWatchdogSeams()` really ends a process: the real
// `setInterval` has to fire, the real `process.kill(pid, 0)` has to read
// `ESRCH` for a dead parent, and the real `process.stderr.write` +
// `process.exit(1)` have to reach the process boundary. These cells spawn a
// plain `node` child that imports the watchdog module directly (Node's native
// type stripping; the module has no imports of its own) and arms it with the
// production seams:
//
//   - against `MAX_PROCESS_ID` (2147483647), a pid no process holds: it is
//     above Linux's pid ceiling (2^22) and, not being a multiple of 4, is never
//     a Windows process id, so it reads `ESRCH` without the pid-reuse race a
//     recently exited donor's pid would carry. The child exits with code 1
//     within one poll interval plus margin, and its stderr is exactly the
//     forensic line;
//   - CONTROL, against the pid of this (live) test process: the child is still
//     running one poll interval plus margin after arming, with empty stderr.
//
// The child holds its event loop open with its own ref'd keep-alive interval —
// the stand-in for the pi host's event loop — because the watchdog's interval
// is unref'd and never holds the process open by itself.
//
// Both children run concurrently, so the pair costs one poll interval of wall
// time. Every spawned process is killed in `afterEach`.
//
// TIER: real child process, provider-free, zero tokens.

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_PROCESS_ID,
  SUBAGENT_PARENT_LIVENESS_POLL_MS,
} from "../src/runtime/subagent-parent-watchdog";

const WATCHDOG_MODULE_URL = pathToFileURL(resolve("src/runtime/subagent-parent-watchdog.ts")).href;
const ARMED_SENTINEL = "watchdog-armed";
/** Slack past one poll interval for spawn, module load and scheduling jitter. */
const MARGIN_MS = 5_000;

const spawned: ChildProcess[] = [];

afterEach(() => {
  for (const child of spawned.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
});

function requireTypeStripping(): void {
  const typescript = (process.features as { readonly typescript?: unknown }).typescript;
  if (typescript !== "strip" && typescript !== "transform") {
    throw new Error(
      `precondition unmet: this Node (${process.version}) cannot import a .ts module natively ` +
        `(process.features.typescript = ${JSON.stringify(typescript)}); the real-process watchdog ` +
        "cells need Node's type stripping",
    );
  }
}

interface WatchedChild {
  readonly child: ChildProcess;
  readonly stderr: () => string;
  /** Resolves with the wall time the child reported its watchdog armed. */
  readonly armedAt: Promise<number>;
  /** Resolves with the child's exit code once it exits. */
  readonly exited: Promise<number | null>;
}

/** Spawn a node child that arms the watchdog with the PRODUCTION seams against `parentPid`. */
function spawnWatchedChild(parentPid: number): WatchedChild {
  const script = [
    `import { armSubagentParentWatchdog, createProductionParentWatchdogSeams } from ${JSON.stringify(WATCHDOG_MODULE_URL)};`,
    `const handle = armSubagentParentWatchdog(${JSON.stringify(String(parentPid))}, createProductionParentWatchdogSeams());`,
    "if (handle === undefined) { process.stdout.write('watchdog-not-armed\\n'); process.exit(3); }",
    "setInterval(() => {}, 1000);",
    `process.stdout.write(${JSON.stringify(`${ARMED_SENTINEL}\n`)});`,
  ].join("\n");
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", script],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  spawned.push(child);
  let stdout = "";
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const armedAt = new Promise<number>((settle, reject) => {
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.includes(ARMED_SENTINEL)) {
        settle(Date.now());
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      reject(new Error(`child exited (${String(code)}) before arming: stdout=${stdout} stderr=${stderr}`));
    });
  });
  const exited = new Promise<number | null>((settle) => {
    child.once("exit", (code) => {
      settle(code);
    });
  });
  return { child, stderr: () => stderr, armedAt, exited };
}

function sleep(ms: number): Promise<void> {
  return new Promise((settle) => setTimeout(settle, ms));
}

describe("bug 0493 D1 (b) — the watchdog over its production seams ends a real orphaned process", () => {
  it(
    "a child armed against a pid no process holds exits 1 with exactly the forensic stderr line; a child armed against a live pid keeps running",
    async () => {
      requireTypeStripping();
      const gonePid = MAX_PROCESS_ID;
      const orphan = spawnWatchedChild(gonePid);
      const control = spawnWatchedChild(process.pid);
      const [orphanArmedAt, controlArmedAt] = await Promise.all([orphan.armedAt, control.armedAt]);

      const deadline = SUBAGENT_PARENT_LIVENESS_POLL_MS + MARGIN_MS;
      const orphanCode = await Promise.race([
        orphan.exited,
        sleep(deadline).then((): "timed-out" => "timed-out"),
      ]);
      expect(
        orphanCode,
        `a child whose parent pid ${gonePid} is gone must exit within ${deadline} ms of arming ` +
          `(armed ${Date.now() - orphanArmedAt} ms ago; stderr: ${JSON.stringify(orphan.stderr())})`,
      ).toBe(1);
      expect(orphan.stderr()).toBe(`pi-theta: subagent child exiting \u2014 parent process ${gonePid} gone\n`);

      // CONTROL: past one full poll of its own, the live-parent child still runs.
      const controlPolledBy = controlArmedAt + SUBAGENT_PARENT_LIVENESS_POLL_MS + 1_500;
      await sleep(Math.max(0, controlPolledBy - Date.now()));
      expect(
        control.child.exitCode,
        `a child whose parent (this test process, pid ${process.pid}) lives must not exit — ` +
          `stderr: ${JSON.stringify(control.stderr())}`,
      ).toBeNull();
      expect(control.child.signalCode).toBeNull();
      expect(control.stderr()).toBe("");
    },
    SUBAGENT_PARENT_LIVENESS_POLL_MS + MARGIN_MS + 10_000,
  );
});
