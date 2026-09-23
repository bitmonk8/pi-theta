// Shared real-process launch, watchdog, and teardown plumbing for subagent and live acceptance witnesses.
// Fixtures, assertions, control-plane overrides, and watchdog bounds stay with each caller.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). Never contacted by a witness whose fixtures issue no query.
 */
export const CHILD_MODEL_PROVIDER = "anthropic";
export const CHILD_MODEL_ID = "claude-fable-5";

/** Require both pinned entries, failing loudly with the witness's context — never a silent skip. */
export function requireRealSubagentPathsFor(requirement: string): () => void {
  const requirePath = (path: string, what: string): void => {
    if (!existsSync(path)) {
      throw new Error(`precondition unmet: ${what} not found at ${path} — ${requirement}`);
    }
  };
  return (): void => {
    requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
    requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");
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
        respondToolNames: [],
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
    dropScratchDir(scratchDir);
  }
}

/** Best-effort scratch cleanup; never masks the primary test failure. */
export function dropScratchDir(scratchDir: string): void {
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // Best-effort scratch cleanup; never mask the primary test failure.
  }
}

/**
 * A fresh tmp scratch dir holding a `thetas/` discovery root with every entry
 * of the fixture map (file name → source) written into it.
 */
export function writeRealSubagentScratchTree(
  tmpPrefix: string,
  fixtures: Readonly<Record<string, string>>,
): { readonly scratchDir: string; readonly thetaDir: string } {
  const scratchDir = mkdtempSync(join(tmpdir(), tmpPrefix));
  const thetaDir = join(scratchDir, "thetas");
  mkdirSync(thetaDir, { recursive: true });
  for (const [name, source] of Object.entries(fixtures)) {
    writeFileSync(join(thetaDir, name), source);
  }
  return { scratchDir, thetaDir };
}

/** What `driveRealSubagentRoot` reports: a launch that produced no child, or a driven-and-reaped child. */
export type RealSubagentRootDrive =
  | {
      readonly ok: false;
      readonly reason: string;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly ok: true;
      readonly result: Awaited<ReturnType<typeof driveSubagentChild>>;
      readonly killedByWatchdog: boolean;
      readonly diagnostics: readonly Diagnostic[];
      readonly exited: Promise<ChildExitInfo>;
    };

/**
 * The launch → guard → exit-subscribe → watchdog-drive → reap sequence for ONE
 * root `<thetaDir>/<slug>.theta`, through the REAL production spawn path. A
 * failed launch is RETURNED (with its drained diagnostics) so each caller keeps
 * its own failure policy. `onChild` subscribes line taps before driving;
 * `onExit` observes the exit; `awaitNaturalExit` waits (unbounded) for the
 * child's own exit before the reap, so its exit record is the self-exit rather
 * than the reap's kill. The child is reaped (bounded) on every path.
 */
export async function driveRealSubagentRoot(input: {
  readonly slug: string;
  readonly thetaDir: string;
  readonly cwd: string;
  readonly host: ExecutableHost;
  readonly provider: string;
  readonly model: string;
  readonly controlPlaneEnv?: SubagentLaunchRequest["controlPlaneEnv"];
  readonly watchdogMs: number;
  readonly onChild?: (child: SubagentChildProcess) => void;
  readonly onExit?: (info: ChildExitInfo) => void;
  readonly awaitNaturalExit?: boolean;
}): Promise<RealSubagentRootDrive> {
  const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
    slug: input.slug,
    thetaDirs: [input.thetaDir],
    provider: input.provider,
    model: input.model,
    cwd: input.cwd,
    ...(input.controlPlaneEnv !== undefined ? { controlPlaneEnv: input.controlPlaneEnv } : {}),
    host: input.host,
  });
  if (!launch.ok) {
    return { ok: false, reason: launch.reason, diagnostics };
  }
  const child = launch.child;
  input.onChild?.(child);
  const exited = childExit(child, input.onExit);
  try {
    const { result, killedByWatchdog } = await driveWatchedSubagentChild(
      child, join(input.thetaDir, `${input.slug}.theta`), emitDiagnostic, input.watchdogMs,
    );
    if (input.awaitNaturalExit === true) {
      await exited;
    }
    return { ok: true, result, killedByWatchdog, diagnostics, exited };
  } finally {
    await reapSubagentChildren([{ kill: () => child.kill(), exited }]);
  }
}

/** What a driven fixture cell's assertion body receives from `runDrivenSubagentFixtureCell`. */
export interface DrivenSubagentFixtureOutcome {
  readonly result: Awaited<ReturnType<typeof driveSubagentChild>>;
  readonly killedByWatchdog: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly exitPromise: Promise<ChildExitInfo>;
}

/**
 * The scratch-dir → fixture-write → launch-guard → watchdog-drive →
 * try/finally-reap shell shared by the real-subagent integration cells: write
 * the fixture map plus a `<rootName>.theta` root (default `top`) under a fresh
 * tmp dir, launch the REAL production spawn path with all three child pins
 * (executable, extension identity — inherited by grandchildren — and the
 * authenticating parent PID), drive it under the caller's in-test watchdog bound (BELOW the vitest timeout,
 * so a stall settles fail-closed and reports loudly rather than hanging to the
 * outer timeout), hand the outcome to the caller's assertion body, and reap
 * child and scratch dir on every path. A failed launch throws loudly with the
 * drained diagnostics — never a silent skip.
 */
export async function runDrivenSubagentFixtureCell(input: {
  readonly tmpPrefix: string;
  readonly fixtures: Readonly<Record<string, string>>;
  readonly rootSource: string;
  /** The root fixture's slug and file stem; defaults to `top`. */
  readonly rootName?: string;
  readonly provider: string;
  readonly model: string;
  readonly watchdogMs: number;
  readonly body: (outcome: DrivenSubagentFixtureOutcome) => Promise<void> | void;
}): Promise<void> {
  const { scratchDir, thetaDir } = writeRealSubagentScratchTree(input.tmpPrefix, input.fixtures);
  const rootName = input.rootName ?? "top";
  writeFileSync(join(thetaDir, `${rootName}.theta`), input.rootSource);

  const host: ExecutableHost = realExecutableHost();

  const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
    slug: rootName,
    thetaDirs: [thetaDir],
    provider: input.provider,
    model: input.model,
    cwd: scratchDir,
    host,
  });
  if (!launch.ok) {
    throw new Error(`launch failed: ${JSON.stringify(diagnostics)}`);
  }
  const child = launch.child;

  const exitPromise = childExit(child);

  try {
    const { result, killedByWatchdog } = await driveWatchedSubagentChild(
      child, join(thetaDir, `${rootName}.theta`), emitDiagnostic, input.watchdogMs,
    );
    await input.body({ result, killedByWatchdog, diagnostics, exitPromise });
  } finally {
    await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);
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
