// RFC-0006 new coverage — parent-side subagent JSON driver + cancellation.
//
// Spec: pi-integration-contract/subagent.md (PIC-59 envelope consumption,
// PIC-63 cancellation stdin-close grace, PIC-9 teardown), invocation.md
// (INV-5), cancellation.md.
//
// Covers:
//   - launch → await envelope → map: an Ok envelope on the child's `--mode
//     json` stdout maps to Ok(value); an Err envelope maps to the reconstructed
//     QueryError; a child that exits WITHOUT an envelope maps fail-closed to
//     Err(InvokeInfraError { cause: "internal_error" });
//   - kill-during-free-phase (PIC-63): abort closes the child's parent-held
//     stdin (the grace signal), then teardown's bounded grace + process-tree
//     kill; an aborted invocation maps to Err(cancelled) (cancel wins over the
//     no-envelope internal_error map); a thrown grace-signal send routes
//     theta/runtime/internal-error without propagating.
//
// RED EXPECTATION (RFC-0006 not yet implemented): `driveSubagentChild` /
// `attachSubagentStdinCancellation` throw `not implemented: RFC 0006`, so each
// assertion reds on its primary behaviour; the paired implementation greens them.

import { describe, expect, it } from "vitest";
import {
  attachSubagentStdinCancellation,
  driveSubagentChild,
  SUBAGENT_CANCEL_GRACE_INTERNAL_ERROR_CODE,
} from "../src/runtime/subagent-json-driver";
import { adaptChild } from "../src/extension/production-subagent-host";
import {
  SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE,
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";

/**
 * The companion crash-detail code PIC-59 pins ALONGSIDE
 * `subagent-exit-without-envelope` on the child crash / nonzero-exit path
 * (subagent.md #pic-59; code-registry-runtime.md `theta/runtime/subagent-child-crashed`).
 * Asserted as the literal registry string (the successor driver owns no crash-code
 * export; the retired RFC-0005 RPC driver is not imported here).
 */
const SUBAGENT_CHILD_CRASHED_CODE = "theta/runtime/subagent-child-crashed";
import type { SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeRpcChild } from "./helpers/fake-rpc-child";

/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A microtask+macrotask flush so the drive reaches its stdout-read await. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function driveDeps(child: SubagentChildProcess, thetaAbort: AbortController, emitted: Diagnostic[] = []) {
  return {
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    provider: "anthropic-messages",
    emitDiagnostic: (d: Diagnostic): void => {
      emitted.push(d);
    },
  };
}

// ---------------------------------------------------------------------------
// Launch → await envelope → map.
// ---------------------------------------------------------------------------

describe("PIC-59 / INV-5 — parent-side envelope consumption", () => {
  it("an Ok envelope on stdout maps to Ok(value); stray event lines are ignored", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    child.emitRawLine(JSON.stringify({ type: "agent_start" }));
    child.emitRawLine(envelopeLine({ v: THETA_ENVELOPE_VERSION, ok: "FINAL" }));
    child.crashWith(0); // clean exit AFTER the envelope was emitted

    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("FINAL");
    }
  });

  it("an Err envelope on stdout maps to the reconstructed QueryError", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    child.emitRawLine(
      envelopeLine({
        v: THETA_ENVELOPE_VERSION,
        err: { kind: "transport", message: "529", http_status: 529, provider: "anthropic-messages", retryable: true },
      }),
    );
    child.crashWith(0);

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("transport");
    }
  });

  it("a child that exits WITHOUT an envelope maps fail-closed to Err(invoke_infra internal_error)", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const emitted: Diagnostic[] = [];
    const pending = driveSubagentChild(driveDeps(child, thetaAbort, emitted));
    await tick();
    child.crashWith(1, null, "boom"); // exits, never emitted the envelope

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invoke_infra");
      const infra = result.error as { cause?: string };
      expect(infra.cause).toBe("internal_error");
    }
    // PIC-59: the fail-closed no-envelope disposition emits
    // `subagent-exit-without-envelope`, and — because the child exited NONZERO
    // (crashWith(1, ...)) — the companion `subagent-child-crashed` recording the
    // crash detail for operator triage.
    const codes = emitted.map((d) => d.code);
    expect(codes).toContain(SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE);
    expect(codes).toContain(SUBAGENT_CHILD_CRASHED_CODE);
  });
});

// ---------------------------------------------------------------------------
// PIC-59 — terminal-signal ordering: `'close'` (stdio EOF), NOT `'exit'`.
// ---------------------------------------------------------------------------

/**
 * A minimal fake Node `ChildProcess` for the production adapter (`adaptChild`).
 * It models the race PIC-59 guards against: Node may fire the process-termination
 * event and only THEN deliver the final stdout chunk (the `theta_result`
 * envelope) before the stdio streams close. The adapter must record its terminal
 * signal off `'close'` (post-EOF), so a late envelope still maps to Ok.
 */
class FakeNodeChild {
  // `undefined` pid keeps the adapter's kill on the platform-uniform
  // `child.kill("SIGKILL")` + pipe-destroy path (the Windows `taskkill` branch is
  // gated on a defined pid), so this test spawns no real `taskkill` process.
  readonly pid: number | undefined = undefined;
  killed = false;
  destroyed = false;
  #closeListeners: ((code: number | null, signal: string | null) => void)[] = [];
  #stdoutData: ((chunk: unknown) => void)[] = [];
  #stderrData: ((chunk: unknown) => void)[] = [];
  readonly stdin = { write: (): void => {}, end: (): void => {}, destroy: (): void => { this.destroyed = true; } };
  readonly stdout = {
    on: (_event: "data", listener: (chunk: unknown) => void): void => {
      this.#stdoutData.push(listener);
    },
    destroy: (): void => { this.destroyed = true; },
  };
  readonly stderr = {
    on: (_event: "data", listener: (chunk: unknown) => void): void => {
      this.#stderrData.push(listener);
    },
    destroy: (): void => {},
  };
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void {
    if (event === "close") this.#closeListeners.push(listener);
  }
  kill(): void {
    this.killed = true;
  }
  /** Deliver a stdout chunk (the line pump splits on LF). */
  emitStdout(chunk: string): void {
    for (const l of [...this.#stdoutData]) l(chunk);
  }
  /** Fire the terminal `'close'` event (post stdio-EOF). */
  emitClose(code: number | null, signal: string | null = null): void {
    for (const l of [...this.#closeListeners]) l(code, signal);
  }
}

describe("PIC-59 — adapter terminal signal fires on stdio close, not process exit", () => {
  it("an envelope line delivered AFTER process termination but BEFORE stdio close still maps to Ok", async () => {
    const fake = new FakeNodeChild();
    const child = adaptChild(fake as unknown as Parameters<typeof adaptChild>[0]);
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();

    // The final stdout chunk (the envelope) arrives AFTER Node would have fired
    // `'exit'` (modelled by delivering it before `'close'`); the adapter's
    // terminal signal is wired off `'close'`, so the envelope is pumped first.
    fake.emitStdout(envelopeLine({ v: THETA_ENVELOPE_VERSION, ok: "LATE-FINAL" }) + "\n");
    // Now the stdio streams reach EOF and the process closes.
    fake.emitClose(0);

    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("LATE-FINAL");
    }
  });

  it("a killed child whose stdout never EOFs still terminates the drive (kill destroys the pipes → close fires)", async () => {
    const fake = new FakeNodeChild();
    const child = adaptChild(fake as unknown as Parameters<typeof adaptChild>[0]);
    const thetaAbort = new AbortController();
    const emitted: Diagnostic[] = [];
    const pending = driveSubagentChild(driveDeps(child, thetaAbort, emitted));
    await tick();

    // Kill: the production kill path destroys the stdio pipes so `'close'` fires
    // deterministically even when stdout never reached EOF on its own.
    child.kill();
    expect(fake.killed).toBe(true);
    // The bounded fallback: the kill path destroyed our end of the stdio pipes.
    expect(fake.destroyed).toBe(true);
    // Model the OS delivering `'close'` once the (now-destroyed) pipes EOF.
    fake.emitClose(null, "SIGKILL");

    const result = await pending;
    // No envelope was emitted, so the drive fails closed rather than hanging.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invoke_infra");
    }
  });
});

// ---------------------------------------------------------------------------
// PIC-63 — cancellation: stdin-close grace then kill.
// ---------------------------------------------------------------------------

/** A `SubagentChildProcess` double whose `closeStdin` throws (a thrown grace-signal send). */
function throwingStdinChild(): SubagentChildProcess {
  return {
    pid: 1,
    writeStdin: (): void => {},
    closeStdin: (): void => {
      throw new Error("stdin pipe already closed");
    },
    onStdoutLine: (): (() => void) => (): void => {},
    onStderrLine: (): (() => void) => (): void => {},
    onExit: (): void => {},
    kill: (): void => {},
  };
}

describe("PIC-63 — cancellation forwarding (stdin-close grace signal)", () => {
  it("abort closes the child's parent-held stdin (the grace signal)", () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const reg = attachSubagentStdinCancellation(thetaAbort, child, { emitDiagnostic: () => {} });
    expect(child.stdinClosed).toBe(false);
    thetaAbort.abort(new Error("cancelled"));
    // PIC-63: closing the parent-held stdin pipe is the grace signal to a `-p` child.
    expect(child.stdinClosed).toBe(true);
    reg.detach();
  });

  it("spawn-then-immediate-cancel: an already-aborted thetaAbort closes stdin synchronously", () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    thetaAbort.abort(new Error("pre-aborted"));
    attachSubagentStdinCancellation(thetaAbort, child, { emitDiagnostic: () => {} });
    expect(child.stdinClosed).toBe(true);
  });

  it("a thrown grace-signal send routes theta/runtime/internal-error and does NOT propagate", () => {
    const child = throwingStdinChild();
    const thetaAbort = new AbortController();
    const emitted: Diagnostic[] = [];
    attachSubagentStdinCancellation(thetaAbort, child, {
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    });
    // The close-throw must NOT escape (it would mask the in-flight cancelled result).
    expect(() => thetaAbort.abort(new Error("cancelled"))).not.toThrow();
    expect(emitted.map((d) => d.code)).toContain(SUBAGENT_CANCEL_GRACE_INTERNAL_ERROR_CODE);
  });

  it("kill-during-free-phase: an aborted invocation maps to Err(cancelled), not the no-envelope internal_error", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    // Cancel mid-free-phase: abort fires, then the abort-driven process-tree kill
    // exits the child WITHOUT an envelope. The cancellation short-circuit wins.
    thetaAbort.abort(new Error("cancelled"));
    child.kill();

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("cancelled");
    }
  });
});
