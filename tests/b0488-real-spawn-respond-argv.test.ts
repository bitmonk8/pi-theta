// Bug 0488 — REAL-SPAWN witness: the exact production spawn call (the same
// `createProductionSpawnFn` wiring `tests/subagent-child-real-spawn.test.ts`
// exercises for bug 0002) receives a `--tools` argv value that carries the
// launch-carried synthesised respond-tool name, AND the real `pi` host does
// not reject that unrecognised-at-startup allowlist entry (bug 0488 cell 4's
// empirical claim, re-verified here against THIS repo's pinned pi build,
// offline / zero tokens).
//
// docs/bugs/0488-…​.md §"Witness guidance": "the pinned SDK (0.80.10) cannot
// witness the ≥0.86 host-side filtering; the live cell asserts the spawned
// child argv carries the names (real-spawn path), and the 0.86.1 end-to-end
// verification is recorded in this document (cell 4)." This file is that
// real-spawn cell: it does not (and must not need to) drive a model turn — the
// callee below is a pure tail expression (zero queries, zero tokens), exactly
// tests/subagent-child-real-spawn.test.ts's fixture shape — because the
// assertion is entirely about (a) the argv the REAL production spawn function
// is actually invoked with, and (b) that the real host still completes the
// invocation normally with an unrecognised-at-startup `--tools` entry present
// (no exit-2, no hang).
//
// Pins mirrored exactly from tests/subagent-child-real-spawn.test.ts /
// tests/helpers/real-subagent-spawn.ts (#subagent-child-pins, AGENTS.md):
// rung-1 executable resolution pinned to this repo's pi CLI entry, extension
// identity pinned via SUBAGENT_EXTENSION_PIN_ENV, parent-pid carriage.

import {
  requireRealSubagentPathsFor,
  realExecutableHost,
  childExit,
  driveWatchedSubagentChild,
  reapSubagentChildren,
  EXTENSION_ENTRY,
} from "./helpers/real-subagent-spawn";
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type SpawnFn,
} from "../src/runtime/subagent-launcher";

/** The canonical-form respond-tool name for `@<"low" | "high">` (bug 0488 cell 4; bug 0099). */
const RESPOND_LOW_HIGH = "__theta_respond_1aae0990d53b3485";

const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
const requireRealSubagentPaths = requireRealSubagentPathsFor(
  `the bug-0488 real-spawn respond-argv witness needs the repo install (npm install); ` +
    `it never silently skips.`,
);

/**
 * Wrap the REAL production spawn function, recording every argv array it is
 * invoked with BEFORE delegating to the real spawn — a genuine OS-level child
 * process still gets created with exactly this argv (unlike the offline
 * `tests/b0488-launch-respond-argv-integration.test.ts`, which records over a
 * fake).
 */
function recordingProductionSpawnFn(): { readonly spawn: SpawnFn; readonly calls: string[][] } {
  const real = createProductionSpawnFn();
  const calls: string[][] = [];
  const spawn: SpawnFn = (execPath, args, options) => {
    calls.push([...args]);
    return real(execPath, args, options);
  };
  return { spawn, calls };
}

describe("bug 0488 — real subagent child spawn carries the respond name on --tools (production spawn path, provider-free)", () => {
  it(
    "a real child launched with hostTools read,grep,bash + one respond name → the ACTUAL spawned argv's --tools carries it, and the real host still completes the invocation (no exit-2 on the unrecognised-at-startup entry)",
    async () => {
      requireRealSubagentPaths();

      // Scratch fixture: a provider-free `mode: subagent` theta whose body is
      // a pure tail expression (zero `@` queries, zero tokens) — this test's
      // assertion is entirely about the argv the real spawn receives, not
      // about the model ever binding a respond tool.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0488-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      writeFileSync(
        join(thetaDir, "min-child.theta"),
        ["---", "mode: subagent", "---", '"MIN OK"', ""].join("\n"),
      );

      const host = realExecutableHost();
      const { spawn, calls } = recordingProductionSpawnFn();
      const diagnostics: unknown[] = [];

      // The REAL launchSubagentChild entry, argv shaped exactly as the
      // production producer's spawn site shapes it post-fix: hostTools +
      // respondToolNames both non-empty (design §3's `--tools` union arm, NOT
      // the `--no-tools`-flip arm — that arm is covered by the offline argv
      // suite; this real-spawn cell exercises the union path a live worker
      // actually launches with, e.g. `tools: read,grep,bash` + a typed
      // result query).
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "min-child",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            hostTools: ["read", "grep", "bash"],
            respondToolNames: [RESPOND_LOW_HIGH],
            noHostTools: false,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            projectTrust: false,
          },
          cwd: scratchDir,
          parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
          parentPid: process.pid,
          invokeDepth: 0,
          host,
        },
        { spawn, emitDiagnostic: (d) => diagnostics.push(d) },
      );
      expect(launch.ok, `launch failed: ${JSON.stringify(diagnostics)}`).toBe(true);
      if (!launch.ok) {
        return;
      }
      const child = launch.child;
      const exitPromise = childExit(child);

      try {
        // THE bug-0488 real-spawn assertion: the argv the REAL production
        // spawn function was actually invoked with (not a fake's recording)
        // carries the respond name on --tools, exactly once, alongside the
        // host tools.
        expect(calls, "the production spawn function must have been invoked exactly once").toHaveLength(
          1,
        );
        const args = calls[0]!;
        const i = args.indexOf("--tools");
        expect(i, "the real spawn's argv must carry a --tools allowlist").toBeGreaterThanOrEqual(0);
        const tools = args[i + 1]!.split(",");
        expect(tools).toEqual(expect.arrayContaining(["read", "grep", "bash"]));
        expect(
          tools.filter((t) => t === RESPOND_LOW_HIGH),
          `the minted respond name must ride the REAL spawned --tools exactly once; observed ${JSON.stringify(tools)}`,
        ).toHaveLength(1);
        expect(args).not.toContain("--no-tools");

        // Bug 0488 cell 4's empirical claim, re-verified against THIS repo's
        // pinned pi build: the real host does NOT reject an allowlist entry
        // unrecognised at startup (no exit-2). If it did, the pure-tail-
        // expression callee below would never emit its envelope.
        const { result, killedByWatchdog } = await driveWatchedSubagentChild(
          child, join(thetaDir, "min-child.theta"), (d) => diagnostics.push(d), 20_000,
        );
        expect(
          killedByWatchdog,
          "the real child made no progress within 20s — an unrecognised-at-startup " +
            "--tools entry may have made the real host exit-2 or hang instead of " +
            "tolerating it (bug 0488 cell 4 / bug 0218's OTHER dialect)",
        ).toBe(false);
        expect(
          result.ok,
          `child resolved fail-closed instead of Ok: ${JSON.stringify(result)} ` +
            `diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toBe(true);
        if (result.ok) {
          expect(result.value).toBe("MIN OK");
        }

        const exit = await exitPromise;
        expect(exit.code).toBe(0);
        expect(exit.signal).toBeNull();
      } finally {
        await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);
      }
    },
    30_000,
  );
});
