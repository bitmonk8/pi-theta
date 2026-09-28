// H9a live acceptance — bug 0493, the runs-B/C shape: a real `pi -p` parent
// whose subagent callee REFUSES to register in its child must fail visibly at
// the process boundary, and the refusing child process must not outlive it
// (docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md).
//
// THE SHAPE. The parent theta lives in the `--theta` discovery root and names
// its subagent callee by relative path (`tools: ./workers/b0493-worker.theta`).
// Discovery does not descend into `workers/`, so the callee's directory is not
// one of the parent's active roots and the child — launched with `--theta
// <parent roots>` and marked for `/b0493-worker` — never discovers it. The child
// writes the PIC-59 refusal envelope ("subagent child refused to register its
// root theta '/b0493-worker': no load diagnostic names it"), the parent's
// `b0493_worker()?` propagates it, and the parent's top-level drive ends Err
// before any assistant turn. Measured before the fix (2026-09-28, this tree):
// text mode exits 0 with EMPTY stdout AND stderr; `--mode json` exits 0 and the
// refusal is visible only inside the note's `details.event.message`.
//
// WHAT THE FIX OWES HERE (§Fix D2 + D1 (a)/(b)):
//   - the parent exits non-zero (D2 `markFailed` → `process.exitCode = 1`,
//     which the host's print path never resets);
//   - the parent's stderr carries the rendered top-level note line (D2
//     `mirrorLine` writes the SAME note content the transcript gets — for this
//     refusal that is the SLSH-3 row `theta /b0493-probe returned Err: invoke of
//     b0493-worker failed (load_failure)`);
//   - text-mode stdout stays empty (the host prints only a trailing assistant
//     message; the fix adds nothing to stdout);
//   - no process carrying this run's unique discovery path survives the parent
//     for longer than one watchdog poll interval plus slack.
//
// PLACEMENT. The children of this harness are `pipe` children (no placement
// backend is registered in a `-ne -e <tree>` run), whose `-p` run self-ends;
// the child-exit cell is therefore expected GREEN before the fix. It is kept as
// the end-to-end guard that the refusal child really ends, and it observes the
// OS process table directly rather than any theta-side artefact.
//
// TOKENS. The parent drive carries no `@` query; the refusal happens in the
// child's load pass before any theta turn. Accepted residual (§Fix D1 (a)): the
// host may demote the child's never-registered `/b0493-worker` argv to ONE
// prompt turn before it exits.
//
// CHILD PINS (AGENTS.md #subagent-child-pins): `spawnPiPrint` writes the
// extension pin and the parent-pid carriage (this vitest process's pid, the
// spawned `pi`'s real parent) into the outer `pi -p` environment, so the child
// loads this working tree's build.
//
// SCOPE ISOLATION (bug 0030): outside the nine-area manifest; own temp root; no
// `assertStderrClean` — stderr is the observable under test here.

import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint, type PiPrintResult } from "./harness";

const PARENT = [
  "---",
  "mode: prompt",
  "tools: ./workers/b0493-worker.theta",
  "---",
  "let r = b0493_worker()?",
  "r",
  "",
].join("\n");

const WORKER = ["---", "mode: subagent", "---", '"777"', ""].join("\n");

/** The child-side refusal the envelope carries (subagent-root-regime.ts `markedRootRegistrationRefusal`). */
const CHILD_REFUSAL = "subagent child refused to register its root theta '/b0493-worker': no load diagnostic names it";

/** The SLSH-3 top-level note the parent's drive renders for the propagated refusal. */
const PARENT_ERR_NOTE = "theta /b0493-probe returned Err: invoke of b0493-worker failed (load_failure)";

/** One watchdog poll (`SUBAGENT_PARENT_LIVENESS_POLL_MS`) plus slack for process teardown. */
const CHILD_EXIT_DEADLINE_MS = 20_000;

interface Workspace {
  readonly project: string;
  readonly roots: string;
  /** A path fragment unique to this run; every child's argv carries it inside `--theta`. */
  readonly marker: string;
}

const workspaces: Workspace[] = [];

function plantWorkspace(): Workspace {
  const project = mkdtempSync(join(tmpdir(), "theta-b0493-live-"));
  const roots = join(project, "thetas");
  mkdirSync(join(roots, "workers"), { recursive: true });
  writeFileSync(join(roots, "b0493-probe.theta"), PARENT, "utf8");
  writeFileSync(join(roots, "workers", "b0493-worker.theta"), WORKER, "utf8");
  const workspace = { project, roots, marker: basename(project) };
  workspaces.push(workspace);
  return workspace;
}

/** Pids of every live process whose command line carries `marker` (excluding the lister itself). */
function processesCarrying(marker: string): readonly number[] {
  if (process.platform === "win32") {
    const script =
      "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and " +
      `$_.CommandLine -like '*${marker}*' } | ForEach-Object { $_.ProcessId }`;
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(Number);
  }
  const out = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  return out
    .split("\n")
    .filter((line) => line.includes(marker))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((pid) => pid !== process.pid);
}

function killPids(pids: readonly number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (thrown: unknown) { // allow-broad-catch: test-only — ESRCH (already gone) is swallowed, every other error re-raised
      if ((thrown as NodeJS.ErrnoException).code !== "ESRCH") {
        throw thrown;
      }
    }
  }
}

/** Poll until no process carries `marker`, or the deadline passes; returns the survivors. */
async function survivorsAfter(marker: string, deadlineMs: number): Promise<readonly number[]> {
  const start = Date.now();
  let survivors = processesCarrying(marker);
  while (survivors.length > 0 && Date.now() - start < deadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    survivors = processesCarrying(marker);
  }
  return survivors;
}

afterEach(() => {
  // Never leave an orphan behind, whatever the verdict: kill, then remove.
  for (const workspace of workspaces.splice(0)) {
    killPids(processesCarrying(workspace.marker));
    rmSync(workspace.project, { recursive: true, force: true });
  }
});

function describeRun(result: PiPrintResult): string {
  return JSON.stringify({
    exitCode: result.exitCode,
    stdoutTail: result.stdout.slice(-1500),
    stderr: result.stderr.slice(-1500),
  });
}

async function runParent(workspace: Workspace, mode: "text" | "json"): Promise<PiPrintResult> {
  return spawnPiPrint({
    thetaDir: workspace.roots,
    cwd: workspace.project,
    slashInvocation: "/b0493-probe",
    ...(mode === "json" ? { extraArgs: ["--mode", "json"] } : {}),
  });
}

describe("H9a live — bug 0493 runs-B/C: a `pi -p` parent whose subagent callee refuses registration", () => {
  it("--mode json: the refusal really happened in the child, the parent exits non-zero with the note on stderr, and the child process ends", async () => {
    await requireLiveHost();
    const workspace = plantWorkspace();
    const result = await runParent(workspace, "json");

    // Premise: the child-minted refusal reached the parent (the json event
    // stream carries the note's `details.event.message`). Without this the
    // cells below could be observing some unrelated failure.
    if (!result.stdout.includes(CHILD_REFUSAL)) {
      failLoudly(
        "precondition unmet: the json stream carries no child registration refusal — the runs-B/C " +
          `shape was not reproduced. ${describeRun(result)}`,
      );
    }
    expect(result.stdout).toContain(PARENT_ERR_NOTE);

    expect
      .soft(
        result.exitCode,
        `a print-mode parent whose drive ended Err must not exit 0 — ${describeRun(result)}`,
      )
      .not.toBe(0);
    expect
      .soft(result.stderr, `the parent's stderr must carry the rendered Err note — ${describeRun(result)}`)
      .toContain(PARENT_ERR_NOTE);
    expect
      .soft(
        await survivorsAfter(workspace.marker, CHILD_EXIT_DEADLINE_MS),
        "the refusing child process must not outlive its parent",
      )
      .toEqual([]);
  });

  it("text mode: the parent exits non-zero, stdout stays empty, stderr carries the note, and the child process ends", async () => {
    await requireLiveHost();
    const workspace = plantWorkspace();
    const result = await runParent(workspace, "text");

    expect
      .soft(
        result.exitCode,
        `a print-mode parent whose drive ended Err must not exit 0 — ${describeRun(result)}`,
      )
      .not.toBe(0);
    expect
      .soft(result.stderr, `the parent's stderr must carry the rendered Err note — ${describeRun(result)}`)
      .toContain(PARENT_ERR_NOTE);
    expect
      .soft(result.stdout, `text mode prints only a trailing assistant message — ${describeRun(result)}`)
      .toBe("");
    expect
      .soft(
        await survivorsAfter(workspace.marker, CHILD_EXIT_DEADLINE_MS),
        "the refusing child process must not outlive its parent",
      )
      .toEqual([]);
  });
});
