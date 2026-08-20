// Bug 0008 regression — the subagent child must receive EVERY parent theta
// discovery root, not just the last one
// (docs/bugs/0008-subagent-child-drops-all-but-last-theta-root.md).
//
// Defect: `assembleSubagentArgv` forwards the parent's discovery roots as
// REPEATED `--theta <dir>` flags, but host pi stores extension string flags in
// a per-name Map (`unknownFlags.set(flagName, next)`) — a repeated flag
// resolves to its LAST occurrence only. With ≥ 2 parent roots every earlier
// root silently vanishes in the child: a callee living in a dropped root never
// registers, the child treats `-p "/<slug>"` as prose, and the parent surfaces
// a misattributed `Err(InvokeInfraError { cause: "internal_error" })` via the
// exit-without-envelope mapping.
//
// Fixed contract pinned here (bug doc Option 1, the documented operator
// convention):
//   - pi-integration-contract/subagent.md #subagent-launch-contract — launch
//     synopsis `pi --theta <dirs> …`: plural dirs in ONE flag slot;
//   - discovery/discovery-sources.md CLI source — "`--theta <paths>` (single
//     flag; multiple paths joined with the OS path-list separator — uses
//     Node's `path.delimiter`)".
// So: exactly ONE `--theta` flag whose value is all roots joined with
// `path.delimiter`; an EMPTY root set emits NO `--theta` flag at all. The
// child-side reader (`readThetaFlagPaths`, production-composition.ts) already
// splits every occurrence on the delimiter, so the joined form registers all
// roots with no reader change (verified in the bug doc's token-free repro
// matrix: `--theta "A;B"` → both roots registered).
//
// Cells: (A) argv shape, two roots → one joined flag [RED until fixed];
// (B) single root → one plain flag [control]; (C) empty set → no flag
// [control, pins the fixed contract]; (D) reader-side round-trip of the
// joined value through the real `pi.getFlag("theta")` → discovery `cliPaths`
// path [control]; (E) real-spawn end-to-end: a callee in the FIRST of two
// roots completes through a REAL child [RED until fixed].

import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  PI_CLI_DIALECT,
  assembleSubagentArgv,
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import { WallClock } from "../src/seams/wall-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// ---------------------------------------------------------------------------
// (A)–(C) — argv shape (assembleSubagentArgv, #subagent-launch-contract).
// ---------------------------------------------------------------------------

describe("bug 0008 — --theta argv shape (one path.delimiter-joined flag, never repeated)", () => {
  it("(A) two roots → EXACTLY ONE --theta whose value joins both roots with path.delimiter", () => {
    const argv = assembleSubagentArgv({
      slug: "bug8",
      thetaDirs: ["/w/rootA", "/w/rootB"],
      systemPrompt: "sp",
      hostTools: [],
      noHostTools: true,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    }, PI_CLI_DIALECT);

    // Host pi keeps only the LAST occurrence of a repeated extension string
    // flag, so a second `--theta` silently drops the first root in the child
    // (bug 0008). The only lossless multi-root carrier is the documented
    // single-flag form (discovery-sources.md CLI source).
    const occurrences = argv.filter((arg) => arg === "--theta");
    expect(
      occurrences,
      "bug 0008: repeated --theta flags — host pi resolves a repeated extension " +
        "string flag to its last occurrence, dropping every earlier root in the child",
    ).toHaveLength(1);
    // `path.delimiter` (not a hardcoded ';' / ':') keeps the pin
    // platform-correct — the same join the child-side reader splits on.
    expect(argv[argv.indexOf("--theta") + 1]).toBe(`/w/rootA${delimiter}/w/rootB`);
  });

  it("(B) single root → one --theta with the plain root value (no delimiter appended)", () => {
    const argv = assembleSubagentArgv({
      slug: "bug8",
      thetaDirs: ["/w/onlyRoot"],
      systemPrompt: "sp",
      hostTools: [],
      noHostTools: true,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    }, PI_CLI_DIALECT);

    // The single-root case is the degenerate join: one flag, the bare path.
    expect(argv.filter((arg) => arg === "--theta")).toHaveLength(1);
    expect(argv[argv.indexOf("--theta") + 1]).toBe("/w/onlyRoot");
  });

  it("(C) empty root set → NO --theta flag at all (omission, not an empty-string value)", () => {
    const argv = assembleSubagentArgv({
      slug: "bug8",
      thetaDirs: [],
      systemPrompt: "sp",
      hostTools: [],
      noHostTools: true,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    }, PI_CLI_DIALECT);

    // Pins the fixed contract's empty-set arm: joining zero roots must OMIT
    // the flag rather than emit `--theta ""` (an empty value would arrive at
    // the child reader as one all-whitespace occurrence — a different, still
    // rootless, argv than plain omission).
    expect(argv).not.toContain("--theta");
  });
});

// ---------------------------------------------------------------------------
// (D) — reader-side round-trip of the joined value (control; the private
// `readThetaFlagPaths` is reached through the exported production-composition
// seam, mirroring tests/e2e-s6-description-registration.test.ts).
// ---------------------------------------------------------------------------

describe("bug 0008 — the joined --theta value splits back to both roots on the reader side", () => {
  it("(D) pi.getFlag('theta') = `A${delimiter}B` → discovery registers a theta from EACH root", async () => {
    // Two roots, one registrable theta each, inside one scratch workspace. The
    // body mirrors the proven e2e-s6 composition fixture (prompt mode, binder
    // query) so composition needs no model registry entries.
    const workspace = mkdtempSync(join(tmpdir(), "pi-theta-bug0008-d-"));
    const dirA = join(workspace, "dirA");
    const dirB = join(workspace, "dirB");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    const THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
    writeFileSync(join(dirA, "bug8a-unit.theta"), THETA, "utf8");
    writeFileSync(join(dirB, "bug8b-unit.theta"), THETA, "utf8");

    // The REAL child-side path: `discoverAndComposeFixtures` calls the private
    // `readThetaFlagPaths(pi)` (pi.getFlag("theta") → split on path.delimiter
    // → discovery `cliPaths`), exactly what a spawned child runs at
    // session_start — no private export needed.
    const joined = [dirA, dirB].join(delimiter);
    const pi = {
      getFlag: (name: string): string | undefined => (name === "theta" ? joined : undefined),
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;

    // Scoped stderr spy — hermeticity, not behaviour under test: an absent
    // settings file and an absent conventional root are both SILENT today
    // (package-and-settings.md §Failure modes; DISC-2's conventional-root
    // exemption), so the headless (hasUI:false) composition's stderr mirror is
    // expected quiet here — the spy keeps any machine-dependent global-root
    // noise out of `npm test` output. Nothing here asserts on stderr.
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);
    try {
      const thetas = await discoverAndComposeFixtures(pi, ctx);
      const slugs = thetas.map((theta) => theta.slashName);
      // Both roots survive the join → split round-trip: neither theta is lost.
      // Membership (not exact length) so an ambient global/project discovery
      // source on the host machine cannot flake the pin.
      expect(slugs).toContain("bug8a-unit");
      expect(slugs).toContain("bug8b-unit");
    } finally {
      stderrSpy.mockRestore();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// (E) — real-spawn end-to-end regression (mirrors
// tests/subagent-child-real-spawn.test.ts: real launchSubagentChild +
// createProductionSpawnFn + driveSubagentChild; provider-free, zero tokens).
// ---------------------------------------------------------------------------

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test; mirrors the acceptance harness pin). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED: the scratch thetas below are pure tail expressions
 * — zero queries. The reference must still RESOLVE in the child's own model
 * registry — the child-side PIC-62 preflight re-resolves it and fails the
 * invocation on a registry miss, which would mask the root-forwarding signal
 * this test exists for — so the scratch agent dir below defines it in a
 * models.json (dummy apiKey, loopback baseUrl). On the red (repeated-flag
 * regression) run the prose turn runs against the refused loopback — pi's
 * provider retry/backoff makes that red path take ~15s — zero tokens, zero
 * external network — and exits without an envelope.
 */
const CHILD_MODEL_PROVIDER = "fable";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0008 real-spawn ` +
        `regression test needs the repo install (npm install); it never silently skips.`,
    );
  }
}

describe("bug 0008 — real subagent child with TWO discovery roots (production spawn path, provider-free)", () => {
  it(
    "a callee living in the FIRST of two roots registers in the child and completes (no last-root-wins drop)",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // Scratch fixture: TWO roots, each holding a registrable provider-free
      // `mode: subagent` theta (pure tail expression — zero queries, zero
      // tokens). The callee (`bug8a`) lives in the FIRST root — the root the
      // last-wins host drops today — and dirB holds a real registrable theta
      // so the child genuinely carries a second root, not an empty decoy.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0008-"));
      const dirA = join(scratchDir, "dirA");
      const dirB = join(scratchDir, "dirB");
      mkdirSync(dirA, { recursive: true });
      mkdirSync(dirB, { recursive: true });
      writeFileSync(
        join(dirA, "bug8a.theta"),
        ["---", "mode: subagent", "---", '"BUG8A OK"', ""].join("\n"),
      );
      writeFileSync(
        join(dirB, "bug8b.theta"),
        ["---", "mode: subagent", "---", '"BUG8B OK"', ""].join("\n"),
      );

      // CREDENTIAL ISOLATION. The RED path (a root-forwarding regression) is
      // child-treats-slug-as-prose — an ordinary model conversation — which
      // must NEVER reach a real provider from a test. Two belts: (i) strip
      // every *API_KEY* env var; (ii) point PI_CODING_AGENT_DIR at a scratch
      // agent dir so pi's own credential store is invisible. The scratch dir is
      // not bare: its models.json defines the marshalled reference (provider
      // `fable` — dummy apiKey, loopback baseUrl) so the CHILD-side PIC-62
      // preflight resolves it and the green path reaches the theta's Ok, while
      // the red prose path runs against the refused loopback (pi's provider
      // retry/backoff makes it take ~15s) and exits with no envelope (exit
      // code immaterial) → the parent maps exit-without-envelope →
      // Err(InvokeInfraError internal_error). Zero tokens, zero external
      // network, on both the red and the green run.
      const scratchAgentDir = join(scratchDir, "agent-dir");
      mkdirSync(scratchAgentDir, { recursive: true });
      writeFileSync(
        join(scratchAgentDir, "models.json"),
        JSON.stringify({
          providers: {
            [CHILD_MODEL_PROVIDER]: {
              baseUrl: "http://127.0.0.1:1/v1",
              api: "openai-completions",
              apiKey: "unused-dummy-never-contacted",
              models: [{ id: CHILD_MODEL_ID }],
            },
          },
        }),
      );
      const parentEnv: Record<string, string | undefined> = { ...process.env };
      for (const key of Object.keys(parentEnv)) {
        if (key.toUpperCase().includes("API_KEY")) {
          delete parentEnv[key];
        }
      }
      parentEnv["PI_CODING_AGENT_DIR"] = scratchAgentDir;
      // #subagent-extension-pin (bug 0002 defect 2): pin the child to THIS
      // working tree's extension build — an unpinned child could bind a stale
      // ambient theta build, voiding the regression signal.
      parentEnv[SUBAGENT_EXTENSION_PIN_ENV] = EXTENSION_ENTRY;

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
      // production argv (including the --theta forwarding under test) and
      // spawns via createProductionSpawnFn — the argv-collapse regression is
      // caught against the real host flag parser, not over a fake.
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "bug8a",
            thetaDirs: [dirA, dirB],
            systemPrompt: "",
            hostTools: [],
            noHostTools: true,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            projectTrust: false,
          },
          cwd: scratchDir,
          parentEnv,
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
        // In-test bound BELOW the vitest timeout: on a hang kill the pair so
        // the drive settles fail-closed and the assertion below reports loudly,
        // instead of the test (and a live child) hanging to the outer timeout.
        // 25s: the pre-fix red path measures ~15s (provider retry/backoff
        // against the refused loopback), so the bound needs headroom above it.
        let killedByWatchdog = false;
        const watchdog = setTimeout(() => {
          killedByWatchdog = true;
          child.kill();
        }, 25_000);

        const result = await driveSubagentChild({
          child,
          thetaAbort: new AbortController(),
          calleePath: join(dirA, "bug8a.theta"),
          emitDiagnostic,
          clock: new WallClock(),
        });
        clearTimeout(watchdog);

        expect(
          killedByWatchdog,
          "the real child made no progress within 25s (expected: envelope + exit in ~1-2s)",
        ).toBe(false);
        // THE bug-0008 assertion: with the callee in the FIRST root, a
        // last-wins collapse of repeated --theta flags drops dirA in the
        // child, `/bug8a` runs as prose against the loopback provider and
        // exits without an envelope (exit code immaterial — envelope absence
        // drives the exit-without-envelope mapping) → result is
        // Err(internal_error) — the JSON surfaced in this message shows
        // exactly that on the red run.
        expect(
          result.ok,
          `bug 0008: child resolved fail-closed instead of Ok — the first theta root ` +
            `was dropped by the repeated --theta forwarding: ${JSON.stringify(result)} ` +
            `diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toBe(true);
        if (result.ok) {
          expect(result.value).toBe("BUG8A OK");
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
    35_000,
  );
});
