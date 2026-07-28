// H8a — bug 0021 live witness: a shutdown-less repeat `session_start` at one
// live extension instance SUPERSEDES the prior hot-reload generation instead
// of leaking its armed watcher.
//
// Defect (docs/bugs/0021-double-session-start-leaks-armed-watcher.md): the
// public host SDK's `AgentSession.bindExtensions()` carries no once-guard and
// re-emits the stored `session_start` to the SAME factory closure; pre-fix the
// second compose pass overwrote the single-slot teardown handle with no detach
// of the prior generation, so generation 1's REAL chokidar watcher stayed
// armed with no reachable teardown. After the (single) `session_shutdown` +
// dispose, that leaked watcher's next filesystem event trips the PIC-67 entry
// probe against the invalidated runtime and emits exactly one
// `theta hot-reload quiesced:` stderr line (the `StaleQuiesceLog` sink) —
// misattributed evidence of the leak. Post-fix the superseding pass detaches
// generation 1 at supersede-before-publish time and the shutdown detaches
// generation 2, so NO armed watcher survives into the invalidated runtime and
// no quiesce line can ever fire (registration-steps.md
// #watcher-hot-reload-registration, PIC-57/PIC-68).
//
// Token cost: ZERO model turns are driven — the test only boots the session
// and exercises registration + watcher lifecycle, so it burns nothing beyond
// session boot. The production debounce is 250 ms REAL clock, so each churn
// is followed by a ~1000 ms real-time wait to let any (leaked) reload pass
// cross its boundary.
//
// Live-suite conventions (AGENTS.md): fail loudly when the live provider
// precondition is unmet (never skip); the harness sets both
// #subagent-child-pins at module scope (no subagent child is spawned here,
// but the pins are harness-wide).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { SUBAGENT_ROOT_ENV_MARKER } from "../../src/runtime/subagent-root-regime";
import {
  bootShippedExtension,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

/** The PIC-67 fail-loud-once stderr prefix (stale-ctx.ts `StaleQuiesceLog`). */
const STALE_QUIESCE_PREFIX = "theta hot-reload quiesced:";

/**
 * Real-time wait for the production 250 ms real-clock debounce to fire and any
 * resulting reload pass to run its probe/rebuild. Generous 4x margin: the
 * discriminator is a leaked watcher's stderr line, so an over-wait costs only
 * wall time while an under-wait could mask the pre-fix red.
 */
const DEBOUNCE_SETTLE_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A minimal prompt-mode `.theta`; the body line varies per churn. */
function promptTheta(line: string): string {
  return ["---", "mode: prompt", "---", "@`" + line + "`", ""].join("\n");
}

describe("bug 0021 — live double session_start supersession (H8a, registration-steps.md step 5, PIC-57/PIC-68)", () => {
  let consoleErrorSpy: MockInstance | undefined;

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = undefined;
  });

  it("a second bindExtensions supersedes the prior generation: the command stays registered and no leaked watcher quiesces after shutdown", async () => {
    // The watcher arming under test is suppressed entirely inside a subagent
    // child (PIC-58), which would green this test vacuously — fail loudly
    // instead of asserting against a watcher that was never armed.
    if (process.env[SUBAGENT_ROOT_ENV_MARKER] !== undefined) {
      failLoudly(
        `live-host precondition unmet: ${SUBAGENT_ROOT_ENV_MARKER} is set, so ` +
          "the shipped factory suppresses step-5 watcher arming (PIC-58) and " +
          "this watcher-lifecycle witness would be vacuous. Run the live " +
          "suite outside a theta subagent child.",
      );
    }
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      {
        source: "project",
        stem: "greetlive",
        text: promptTheta("Reply with exactly the token LIVE-0021 and nothing else."),
      },
    ]);
    const thetaPath = join(workspace.cwd, ".pi", "theta", "greetlive.theta");
    const handle = await bootShippedExtension({ workspace, provider });
    let handleDisposed = false;
    try {
      // Spy BEFORE the second bind so every stderr line the superseded
      // generation could ever emit — including a leaked watcher's
      // post-invalidation quiesce — is captured. `vi.spyOn` records calls and
      // still writes through, so real teardown diagnostics stay visible.
      consoleErrorSpy = vi.spyOn(console, "error");

      // The shutdown-less double start: the harness boot already called
      // `bindExtensions` once; this second call re-emits `session_start` to
      // the SAME runner and the SAME factory closure (no once-guard).
      await handle.session.bindExtensions({});

      // Sanity: the second start SUPERSEDED the prior generation rather than
      // breaking registration — the discovered slash command is still
      // registered after the double bind.
      expect(
        handle.command("greetlive"),
        "the double bindExtensions must leave the discovered slash command " +
          "registered (the superseding pass re-runs discovery + registration). " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Churn 1 (session live): rewrite the `.theta` body and cross the real
      // 250 ms debounce. Post-fix only generation 2's watcher fires (a normal
      // live reload); pre-fix generation 1's leaked watcher ALSO rebuilds —
      // silently, since the shared runtime is still live.
      writeFileSync(
        thetaPath,
        promptTheta("Reply with exactly the token LIVE-0021-EDIT and nothing else."),
        "utf8",
      );
      await sleep(DEBOUNCE_SETTLE_MS);

      // Graceful shutdown then dispose: the harness emits `session_shutdown`
      // (reason "quit") — detaching the LATEST generation's watcher — then
      // invalidates the runtime via `session.dispose()`.
      await handle.dispose();
      handleDisposed = true;

      // Churn 2 (runtime invalidated): pre-fix the leaked generation-1
      // watcher is still armed — its debounced reload's PIC-67 entry probe
      // now throws the stale-ctx error and emits exactly one
      // `theta hot-reload quiesced:` stderr line. Post-fix no armed watcher
      // exists (generation 1 detached at supersession, generation 2 at
      // shutdown), so nothing can quiesce.
      writeFileSync(
        thetaPath,
        promptTheta("Reply with exactly the token LIVE-0021-POST and nothing else."),
        "utf8",
      );
      await sleep(DEBOUNCE_SETTLE_MS);

      const quiesceLines = consoleErrorSpy.mock.calls
        .map((args) => args.map(String).join(" "))
        .filter((line) => line.includes(STALE_QUIESCE_PREFIX));
      expect(
        quiesceLines,
        "a `theta hot-reload quiesced:` stderr line means a superseded " +
          "generation's watcher survived both the supersession and the " +
          "shutdown — the bug-0021 leak. Captured: " + JSON.stringify(quiesceLines),
      ).toStrictEqual([]);
    } finally {
      if (!handleDisposed) {
        await handle.dispose();
      }
      workspace.dispose();
    }
  });
});
