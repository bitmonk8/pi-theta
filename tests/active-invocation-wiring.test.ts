// Decision 6 / Increment B1 — the shared `ActiveInvocationRegistry` wiring.
//
// Proves B1 (registry only; NOT forwarding listeners, that is B2): the shipped
// composition constructs ONE `ActiveInvocationRegistry` beside the runtime root
// and threads it (a) into every composed theta's producer, so the two bind choke
// points (`bindPromptConversation` / `spawnSubagentConversation`) register one
// `ActiveInvocationEntry` per invocation, and (b) into the factory's
// `session_shutdown` teardown, so sub-step 2 (cancel in-flight) and sub-step 3
// (await dispose) operate on the SAME entries — no longer a fresh empty
// registry (the Increment-A live-but-empty placeholder).
//
// Coverage:
//   1. producer add/remove-on-settle — a prompt bind registers exactly one
//      entry (reusing the per-invocation `thetaAbort`, PIC-20-minted
//      `invocationId`, canonical `theta` name) and removes it on the way out.
//   2. factory cancel-in-flight — an entry in the shared registry is aborted
//      with the synthesised CNCL-4 reason and its `shutdownReason` is stamped
//      BEFORE the abort.
//   3. producer no-leak — a bind body that throws before its surface teardown
//      leaves the registry empty (the `finally` guard).
//   4. factory bounded-await — a never-settling `disposeBarrier` is bounded by
//      `SHUTDOWN_AWAIT_CAP_MS`, emits exactly one `reload-teardown-timeout`
//      naming `/<theta>:<invocationId>`, and still proceeds (drain tag set).
//
// Cancellation is not live-reproducible (no injected Esc / Checkpoint seam), so
// tests 2 + 4 feed REAL `ActiveInvocationEntry` values directly to the shared
// registry the factory reads — the same substrate `session-shutdown.test.ts`
// pins at the handler level, here wired through the production factory.

import { executorHook, resetExecutorHook } from "./helpers/parked-statement-executor";
import { bootFactory } from "./helpers/watch-arming-harness";
import { captureConsoleErrorForEach } from "./helpers/compose-workspace-harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

// SPAN staging: replace the module-level `executeBody` the DRIVE seam
// (`composeThetaFixture.run`) calls with a test-controlled implementation, so a
// REAL producer bind (the entry really added to the shared registry) is driven
// through the REAL drive seam (the real `finally` → `finishInvocation`) while
// the body is parked on a deferred. Everything else in the executor module is
// preserved. This proves the entry SPANS the in-flight window — it is NOT faked
// at the bind level (the bug being fixed).
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const { mockStatementExecutor } = await import("./helpers/parked-statement-executor");
  return mockStatementExecutor(importOriginal);
});

import {
  createProductionProducerDeps,
} from "../src/extension/production-theta-producer";
import {
  composeThetaFixture,
} from "../src/extension/theta-composition-producer";
import type { BodyExecution } from "../src/runtime/statement-executor";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import {
  RELOAD_TEARDOWN_TIMEOUT_CODE,
  SESSION_SHUTDOWN_ABORT_MESSAGE,
} from "../src/extension/session-shutdown";
import { SHUTDOWN_AWAIT_CAP_MS } from "../src/extension/capability-probe";
import { FakeClock } from "./helpers/fake-clock";
import {
  PassthroughCheckpoint,
  rootWith,
  noopPi,
  promptTheta,
  driveCtx,
  tick,
} from "./helpers/fixture-dispatch-harness";

afterEach(resetExecutorHook);

describe("Increment B1 — the registry entry SPANS the in-flight body via the DRIVE seam", () => {
  it("(spans the body) a REAL producer bind driven through composeThetaFixture.run keeps size()===1 WHILE the parked body runs, then 0 after it settles", async () => {
    const registry = new ActiveInvocationRegistry();
    // Capture the registered entry to assert it reuses the per-invocation
    // controller / canonical name / PIC-20 id — the fields the teardown reads.
    let captured: ActiveInvocationEntry | undefined;
    const realAdd = registry.add.bind(registry);
    vi.spyOn(registry, "add").mockImplementation((entry: ActiveInvocationEntry) => {
      captured = entry;
      realAdd(entry);
    });

    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootWith(new PassthroughCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
      activeInvocations: registry,
    });

    // Park the body on a test-controlled deferred: while it is pending the
    // invocation is genuinely in-flight and its entry MUST be in the registry.
    let releaseBody!: () => void;
    const bodyParked = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    // Capture the executor deps the DRIVE seam passes so we can prove the entry
    // reuses the SAME per-invocation `thetaAbort` the executor gates on.
    let bodySignal: AbortSignal | undefined;
    executorHook.impl = async (...args: readonly unknown[]): Promise<unknown> => {
      bodySignal = (args[1] as { signal: AbortSignal }).signal;
      await bodyParked;
      // A `fail` outcome routes the prompt surface down the branch that does not
      // read `sessionManager` (STL-6), keeping the harness minimal.
      return { outcome: "fail", error: null } as unknown as BodyExecution;
    };

    const fixture = composeThetaFixture(promptTheta(), deps);
    const runPromise = fixture.run("", driveCtx());

    // The bind added the entry; the DRIVE seam is now awaiting the parked body.
    await tick();
    expect(registry.size()).toBe(1);
    expect(captured).toBeDefined();
    const entry = captured as ActiveInvocationEntry;
    expect(entry.theta).toBe("demo");
    expect(entry.invocationId).toBe("inv-1");
    expect(entry.shutdownReason).toBeUndefined();
    // The entry reuses the dispatch-owned controller, never a fresh one: the
    // signal the executor body gates on is the entry's `thetaAbort.signal`.
    expect(bodySignal).toBeDefined();
    expect(entry.thetaAbort.signal).toBe(bodySignal);

    // Release the body; the DRIVE `finally` calls `finishInvocation`, which
    // settles the barrier and removes the entry.
    releaseBody();
    await runPromise;
    expect(registry.size()).toBe(0);
    // The barrier the teardown awaits is settled after finish.
    await expect(entry.disposeBarrier).resolves.toBeUndefined();
  });

  it("(no leak on body throw) a body that REJECTS is drained by the DRIVE finally — size()===0", async () => {
    const registry = new ActiveInvocationRegistry();
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootWith(new PassthroughCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
      activeInvocations: registry,
    });

    // The parked body rejects: the entry was added by the bind, and only the
    // DRIVE seam's `finally` (finishInvocation) can remove it.
    executorHook.impl = (): Promise<unknown> =>
      Promise.reject(new Error("body boom"));

    const fixture = composeThetaFixture(promptTheta(), deps);

    // run() RESOLVES: a top-level runtime defect is now caught by
    // `composeThetaFixture.run`'s outer catch and framed as ONE `theta-system-note`
    // (error-model.md §"Runtime panics"), rather than escaping to the host. (The
    // prior `.rejects.toThrow("body boom")` encoded the old buggy escape.) The
    // registry-drain contract this test pins is unaffected — the inner DRIVE
    // `finally` runs INSIDE the outer catch, so `finishInvocation` still removes
    // the entry despite the mid-body throw.
    await expect(fixture.run("", driveCtx())).resolves.toBeUndefined();

    // The DRIVE `finally` removed the entry despite the mid-body throw.
    expect(registry.size()).toBe(0);
  });
});

describe("Increment B1 — factory session_shutdown operates on the shared registry", () => {
  const errors = captureConsoleErrorForEach();

  it("(cancel in-flight) aborts an entry with the synthesised CNCL-4 reason and stamps shutdownReason BEFORE the abort", async () => {
    const activeInvocations = new ActiveInvocationRegistry();
    const thetaAbort = new AbortController();
    let reasonAtAbort: string | undefined = "<not-observed>";
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      // Immediately-settling barrier so sub-step 3 does not park.
      disposeBarrier: Promise.resolve(),
      shutdownReason: undefined,
      theta: "foo",
      invocationId: "inv-42",
    };
    // Record `shutdownReason` at the instant of abort: sub-step 2 must stamp the
    // field BEFORE calling `thetaAbort.abort(reason)`.
    thetaAbort.signal.addEventListener("abort", () => {
      reasonAtAbort = entry.shutdownReason;
    });
    activeInvocations.add(entry);

    const { harness } = await bootFactory(new FakeClock(), { activeInvocations });
    await harness.fireSessionShutdown("quit");

    expect(thetaAbort.signal.aborted).toBe(true);
    expect(thetaAbort.signal.reason).toBeInstanceOf(Error);
    expect((thetaAbort.signal.reason as Error).message).toBe(SESSION_SHUTDOWN_ABORT_MESSAGE);
    // Stamp-before-abort: the abort listener saw the populated field.
    expect(reasonAtAbort).toBe("quit");
    expect(entry.shutdownReason).toBe("quit");
  });

  it("(bounded await) a never-settling disposeBarrier is bounded by the cap, emits one reload-teardown-timeout naming /<theta>:<invocationId>, and still proceeds", async () => {
    const clock = new FakeClock();
    const activeInvocations = new ActiveInvocationRegistry();
    const entry: ActiveInvocationEntry = {
      thetaAbort: new AbortController(),
      // Never settles — forces the sub-step 3 cap to fire.
      disposeBarrier: new Promise<void>(() => {}),
      shutdownReason: undefined,
      theta: "foo",
      invocationId: "inv-stuck",
    };
    activeInvocations.add(entry);

    const { harness, registry } = await bootFactory(clock, { activeInvocations });

    // Fire the teardown; the bounded-await timer is armed synchronously before
    // the first `await`, so advancing the fake clock past the cap fires it.
    const pending = harness.fireSessionShutdown("reload");
    clock.advance(SHUTDOWN_AWAIT_CAP_MS);
    await pending;

    // Exactly one reload-teardown-timeout, naming the still-in-flight entry.
    const timeoutLines = errors.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes(RELOAD_TEARDOWN_TIMEOUT_CODE));
    expect(timeoutLines).toHaveLength(1);
    expect(timeoutLines[0]).toContain("/foo:inv-stuck");

    // Teardown still proceeded past the cap: sub-step 1 set the drain tag.
    expect(registry.readDrainState()).toEqual({
      drained: true,
      tag: "shutting-down",
    });
  });
});
