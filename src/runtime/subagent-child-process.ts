// RFC-0006 / RFC-0012 — child-process contracts shared by launch and placement.

/** The child exit info the teardown / crash paths observe. */
export interface ChildExitInfo {
  readonly code: number | null;
  readonly signal: string | null;
}

/**
 * The minimal spawned-child handle the subagent drive consumes. A fake process
 * launcher implements this for the PIC-22 / teardown / wire tests; the
 * production spawn adapts a Node `ChildProcess`.
 */
export interface SubagentChildProcess {
  /**
   * Release any parent-held stdin handle. A structural no-op under the
   * production spawn config — the child's stdin is spawned closed (bug 0002:
   * pi's `-p` startup gates on stdin EOF, so an open pipe deadlocks the pair;
   * EOF was never an exit signal). Retained on the surface so teardown can
   * release a live stdin on non-production children; MUST be an idempotent
   * no-op when there is nothing to close.
   */
  closeStdin(): void;
  /**
   * Subscribe to LF-split stdout lines (the child's `--mode json` event lines,
   * among which the one `theta_result` envelope rides). Returns an unsubscribe
   * handle so a reader detaches its listener on settle.
   */
  onStdoutLine(listener: (line: string) => void): () => void;
  /**
   * Subscribe to LF-split stderr lines (crash-detail capture). Returns an
   * unsubscribe handle (same non-accumulation obligation as `onStdoutLine`).
   */
  onStderrLine(listener: (line: string) => void): () => void;
  /** Subscribe to child exit (observed exit settles the dispose barrier). */
  onExit(listener: (info: ChildExitInfo) => void): void;
  /** Kill the child: process-tree kill (taskkill) on win32; direct `SIGKILL` elsewhere. */
  kill(): void;
  /**
   * RFC-0012 §7: liveness frames a result-channel child sends while its
   * invocation is live (`adaptChannelToChildProcess`). Present ONLY on a
   * channel-adapted child — a `pipe` child's liveness is its `--mode json`
   * stream, which the execution-status tap already reads. Returns the
   * unsubscribe handle.
   */
  onHeartbeat?(listener: () => void): () => void;
}

/** The spawn function the launcher drives (injected; fake in tests). */
export type SpawnFn = (
  execPath: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: Record<string, string | undefined> },
) => SubagentChildProcess;
