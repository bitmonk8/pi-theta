// Shared real-process launch, watchdog, and teardown plumbing for subagent and live acceptance witnesses.
// Fixtures, assertions, control-plane overrides, and watchdog bounds stay with each caller.
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { createProductionSpawnFn } from "../../src/extension/production-subagent-host";
import { driveSubagentChild } from "../../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
  type SubagentChildProcess,
  type SubagentLaunchRequest,
} from "../../src/runtime/subagent-launcher";

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
export const PI_CLI_ENTRY = fileURLToPath(
  new URL("../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
export const EXTENSION_ENTRY = fileURLToPath(new URL("../../extensions", import.meta.url));

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
export function requirePathFor(requirement: string): (path: string, what: string) => void {
  return (path, what): void => {
    if (!existsSync(path)) {
      throw new Error(`precondition unmet: ${what} not found at ${path} — ${requirement}`);
    }
  };
}

/** Rung-1 executable resolution, pinned to the repo's own pi install. */
export function realExecutableHost(): ExecutableHost {
  return {
    argv1: PI_CLI_ENTRY,
    execPath: process.execPath,
    fileExists: (p: string): boolean => existsSync(p),
    isGenericRuntime: (): boolean => false,
  };
}

/**
 * The REAL production spawn path with all three child pins: executable,
 * extension identity (inherited by grandchildren), and the authenticating parent PID.
 * Per-launch control-plane carriers remain separate from the inherited environment.
 */
export function launchRealSubagentChild(
  input: Pick<SubagentLaunchRequest, "cwd" | "host" | "controlPlaneEnv"> &
    Partial<Pick<SubagentLaunchRequest, "parentEnv">> &
    Pick<SubagentLaunchRequest["argv"], "slug" | "thetaDirs" | "provider" | "model">,
) {
  const diagnostics: Diagnostic[] = [];
  const emitDiagnostic = (d: Diagnostic): void => {
    diagnostics.push(d);
  };
  const launch = launchSubagentChild(
    {
      argv: {
        slug: input.slug,
        thetaDirs: input.thetaDirs,
        systemPrompt: "",
        hostTools: [],
        noHostTools: true,
        provider: input.provider,
        model: input.model,
        projectTrust: false,
      },
      cwd: input.cwd,
      parentEnv: input.parentEnv ?? { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
      ...(input.controlPlaneEnv !== undefined ? { controlPlaneEnv: input.controlPlaneEnv } : {}),
      parentPid: process.pid,
      invokeDepth: 0,
      host: input.host,
    },
    { spawn: createProductionSpawnFn(), emitDiagnostic },
  );
  return { launch, diagnostics, emitDiagnostic };
}

/** Subscribe BEFORE driving so the terminal `close` is never missed. */
export function childExit(
  child: SubagentChildProcess,
  onExit?: (info: ChildExitInfo) => void,
): Promise<ChildExitInfo> {
  return new Promise((resolve) => child.onExit((info) => {
    onExit?.(info);
    resolve(info);
  }));
}

/** Kill a stalled tree below the caller's test timeout, retaining the watchdog observable. */
export async function driveWatchedSubagentChild(
  child: SubagentChildProcess,
  calleePath: string,
  emitDiagnostic: (d: Diagnostic) => void,
  watchdogMs: number,
) {
  let killedByWatchdog = false;
  const watchdog = setTimeout(() => {
    killedByWatchdog = true;
    child.kill();
  }, watchdogMs);
  const result = await driveSubagentChild({
    child,
    thetaAbort: new AbortController(),
    calleePath,
    emitDiagnostic,
  });
  clearTimeout(watchdog);
  return { result, killedByWatchdog };
}

/**
 * Reap on every path (idempotent on exited children), then await exits with a
 * 5s bound before dropping scratch: a dying child's cwd may still hold it busy.
 * Best-effort scratch cleanup never masks the primary test failure.
 */
export async function reapSubagentChildren(
  children: readonly { readonly kill: () => void; readonly exited: Promise<ChildExitInfo> }[],
  scratchDir?: string,
): Promise<void> {
  for (const child of children) {
    child.kill();
  }
  let reapTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    children.length === 1 ? children[0]!.exited : Promise.all(children.map((c) => c.exited)),
    new Promise<void>((resolve) => {
      reapTimer = setTimeout(resolve, 5_000);
    }),
  ]);
  clearTimeout(reapTimer);
  if (scratchDir !== undefined) {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch {
      // Best-effort scratch cleanup; never mask the primary test failure.
    }
  }
}

/** Spawn a Node entry with closed stdin and capture both streams through process close. */
export function spawnCapturedNodeProcess(
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly abortAfterMs?: number;
  },
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      // Close the child's stdin: `pi -p` in non-interactive print mode reads its
      // prompt from argv, but an OPEN inherited stdin pipe leaves it waiting for
      // EOF and the process-and-exit run never terminates. `"ignore"` gives the
      // child an already-closed stdin so it exits after emitting its output.
      // (The same treatment is applied to the INNER subagent child by
      // `createProductionSpawnFn` — the bug 0002 primary fix.)
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    let timer: NodeJS.Timeout | undefined;
    if (options.abortAfterMs !== undefined) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.abortAfterMs);
    }
    child.on("error", (err) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
