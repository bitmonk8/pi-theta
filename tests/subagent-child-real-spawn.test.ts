// Bug 0002 regression — a REAL spawned `pi --mode json -p "/<slug>"` subagent
// child completes: envelope on fd 1, exit 0, no hang.
//
// The default suite's other child coverage drives fakes, which is exactly why
// bug 0002 shipped: the production spawn config (`createProductionSpawnFn`)
// left the child's stdin an OPEN parent-held pipe while pi's json/`-p` startup
// reads any non-TTY stdin to EOF BEFORE processing the argv prompt — so the
// child never started and the parent's envelope await deadlocked against it
// (docs/bugs/0002-investigation.md). This test spawns the REAL child through
// the REAL production spawn path (`launchSubagentChild` + the production
// `SpawnFn`, exact argv/env assembly) against a provider-free scratch
// `mode: subagent` theta whose body is a pure tail expression — zero model
// queries, zero tokens (the investigation's validated experiment-B shape) —
// and asserts the `theta_result` envelope arrives and the child exits 0 within
// a bounded time. A regression of the stdio config fails this test (bounded by
// an in-test kill + the per-test timeout) instead of hanging the suite.
//
// The child is pinned to THIS working tree's extension via the
// #subagent-extension-pin env knob (bug 0002 defect 2: an unpinned child binds
// to whatever ambient theta build the machine happens to carry — possibly a
// stale pre-envelope version — making the result meaningless as a regression
// signal).
//
// Spec: pi-integration-contract/subagent.md (PIC-58 launch contract, PIC-59
// envelope, PIC-65 lifecycle, #subagent-extension-pin).

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import { WallClock } from "../src/seams/wall-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test; mirrors the acceptance harness pin). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED on any machine: the scratch theta below is a pure
 * tail expression — zero queries — so no provider resolution or credential is
 * required for the run to succeed (verified by running with the ANTHROPIC_ and
 * OPENAI_ env vars removed). The values only satisfy the launch contract's
 * argv shape.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0002 real-spawn ` +
        `regression test needs the repo install (npm install); it never silently skips.`,
    );
  }
}

describe("bug 0002 — real subagent child spawn (production spawn path, provider-free)", () => {
  it(
    "the real child emits its theta_result envelope and exits 0 (stdin closed at spawn — no startup deadlock)",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // Scratch fixture, built fresh inside this test's own temp dir: a
      // provider-free `mode: subagent` theta whose final value is a pure tail
      // expression — no `@` query, no binder, no tokens.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0002-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      writeFileSync(
        join(thetaDir, "min-child.theta"),
        ["---", "mode: subagent", "---", '"MIN OK"', ""].join("\n"),
      );

      // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
      // (node + the entry script); pinned to the repo's own pi install so the
      // test exercises the version the launch contract is audited against.
      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (p: string): boolean => existsSync(p),
        isGenericRuntime: (): boolean => false,
      };

      const diagnostics: Diagnostic[] = [];
      const emitDiagnostic = (d: Diagnostic): void => {
        diagnostics.push(d);
      };

      // The REAL production spawn path: launchSubagentChild assembles the exact
      // production argv/env (incl. the #subagent-extension-pin knob from the
      // parent env) and spawns via createProductionSpawnFn — a regression of the
      // stdio config or the argv assembly is caught here, not over a fake.
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "min-child",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            tools: [],
            emptyCallableSet: true,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            approve: false,
          },
          cwd: scratchDir,
          parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
          parentPid: process.pid,
          invokeDepth: 0,
          host,
        },
        { spawn: createProductionSpawnFn(), emitDiagnostic },
      );
      expect(launch.ok, `launch failed: ${JSON.stringify(diagnostics)}`).toBe(true);
      if (!launch.ok) {
        return;
      }
      const child = launch.child;

      // Subscribed BEFORE driving so the terminal `'close'` is never missed;
      // hoisted above the `try` so the `finally` can await the exit too.
      const exitPromise = new Promise<ChildExitInfo>((resolve) => child.onExit(resolve));

      try {
        // In-test bound BELOW the vitest timeout: on a regression (child blocked
        // in pi's stdin-EOF startup gate) kill the pair so the drive settles
        // fail-closed and the assertion below reports the regression loudly,
        // instead of the test (and a live child) hanging to the outer timeout.
        let killedByWatchdog = false;
        const watchdog = setTimeout(() => {
          killedByWatchdog = true;
          child.kill();
        }, 20_000);

        const result = await driveSubagentChild({
          child,
          thetaAbort: new AbortController(),
          calleePath: join(thetaDir, "min-child.theta"),
          emitDiagnostic,
          clock: new WallClock(),
        });
        clearTimeout(watchdog);

        expect(
          killedByWatchdog,
          "bug 0002 regression: the real child made no progress within 20s — " +
            "pi's `-p` startup blocks reading stdin to EOF, so a child spawned " +
            "with an open stdin pipe never starts (expected: envelope + exit in ~1-2s)",
        ).toBe(false);
        expect(
          result.ok,
          `child resolved fail-closed instead of Ok: ${JSON.stringify(result)} ` +
            `diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toBe(true);
        if (result.ok) {
          expect(result.value).toBe("MIN OK");
        }

        // PIC-59: one invocation per process — after the envelope the child
        // self-exits 0 (the 'close'-not-'exit' adapter replay makes this await
        // settle even when exit already happened).
        const exit = await exitPromise;
        expect(exit.code).toBe(0);
        expect(exit.signal).toBeNull();
      } finally {
        // Belt-and-braces: reap the child on every path (idempotent on an
        // already-exited child), then await its exit (bounded) before dropping
        // the scratch dir — the dying child's cwd is inside scratchDir, and on
        // the failure path the kill (async taskkill on Windows) may not have
        // landed yet, so an immediate rmSync could throw EBUSY and replace the
        // primary assertion error with a less diagnostic one.
        child.kill();
        let reapTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          exitPromise,
          new Promise<void>((resolve) => {
            reapTimer = setTimeout(resolve, 5_000);
          }),
        ]);
        clearTimeout(reapTimer);
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort scratch cleanup; never mask the primary test failure.
        }
      }
    },
    30_000,
  );
});
