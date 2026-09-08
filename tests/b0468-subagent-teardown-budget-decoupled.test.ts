// Bug 0468 witness — the subagent child's post-envelope EXIT wait
// (`runSubagentChildTeardown`, `SUBAGENT_DISPOSE_BUDGET_MS`) reused the
// `session_shutdown` drain cap (`SHUTDOWN_AWAIT_CAP_MS === 2000`ms), so every
// child that did real provider work overran it and drew a process-tree kill
// plus an error-severity `subagent-teardown-timeout` on the SUCCESS path. Two
// faces, one root, one fix commit (bug 0468 §Fix, option (A) decouple + face
// (b) row/emission reconcile):
//
//   (B) budget decoupling — the exit wait gets its own 30s budget, so a child
//       winding down past 2000ms (provider-connection close, host cleanup) is
//       observed to exit instead of killed.
//   (C) non-vacuity — the decouple RAISES the bound, it does not remove it: a
//       child that never exits is still killed and still emits the diagnostic.
//   (D) row/emission reconcile — the `subagent-teardown-timeout` `message`
//       renders the shipped identifier-less registry template byte-for-byte,
//       and the `hint` carries the MEASURED elapsed wall time. The registry row
//       promised measured elapsed in `hint` and the emission delivered the
//       configured budget instead (bug 0468's second face); the DIAG-4-safe
//       reconcile keeps the shipped Message-column template unchanged (a
//       per-child identifier in `message` would reword it and is deferred to
//       theta 2.0) and makes the `hint` carry real elapsed.
//
// RED EXPECTATION (bug open at v0.463.0, 68d917fe). (B) and (D)'s hint arm red
// against the aliased-2000/budget-in-hint tree; (C) is the both-directions
// guard and is green on both trees by design (it locks that the fix keeps the
// bound). The paired implementation leaf (`src/runtime/subagent-isolation.ts`
// `SUBAGENT_DISPOSE_BUDGET_MS` → own 30000 literal; the `runSubagentChildTeardown`
// timeout emission → measured elapsed in `hint`, shipped identifier-less
// template in `message`) greens the reds; the registry Message column is left
// byte-identical to the shipped template per DIAG-4.
//
// Determinism note: (B)/(C)/(D) drive the teardown's bounded await under a
// `FakeClock` (`tests/helpers/fake-clock.ts`) rather than real timers, so the
// budget boundary and the measured elapsed are exact, not wall-time-racy. The
// child-exit wait races a clock timer set at `budgetMs` against the observed
// child exit; `advance(...)` fires due timers synchronously, so ordering is
// controlled by the test, not the scheduler.
//
// Spec: pi-integration-contract/subagent.md (PIC-65 teardown, PIC-66 kill
// path), diagnostics/diagnostic-shape.md (DIAG-4 Message-column oracle),
// diagnostics/code-registry-runtime.md (the subagent teardown-timeout row).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  runSubagentChildTeardown,
  SUBAGENT_DISPOSE_BUDGET_MS,
  SUBAGENT_TEARDOWN_TIMEOUT_CODE,
  type SubagentChildTeardownDeps,
} from "../src/runtime/subagent-isolation";
import type { SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";
import { FakeJsonChild } from "./helpers/fake-json-child";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

interface DepsBundle {
  readonly deps: SubagentChildTeardownDeps;
  readonly emitted: Diagnostic[];
  barrierSettled(): number;
}

function makeDeps(clock: FakeClock, budgetMs: number): DepsBundle {
  const emitted: Diagnostic[] = [];
  let barrierSettled = 0;
  const deps: SubagentChildTeardownDeps = {
    emitDiagnostic: (d): void => {
      emitted.push(d);
    },
    detachAbortListener: (): void => {},
    settleDisposeBarrier: (): void => {
      barrierSettled += 1;
    },
    clock,
    budgetMs,
  };
  return {
    deps,
    emitted,
    barrierSettled: () => barrierSettled,
  };
}

// A wall-time value strictly BETWEEN the old shared cap (SHUTDOWN_AWAIT_CAP_MS =
// 2000ms) and the decoupled exit budget (SUBAGENT_DISPOSE_BUDGET_MS = 30000ms).
// On the aliased tree the budget IS 2000, so a child that winds down at this
// point is killed (the bug); on the decoupled tree the 30s timer is not due, so
// the wait survives to observe the child's own exit.
const EXIT_AT_MS = 5000;

// A distinctive overshoot past the budget, so the FakeClock's measured elapsed
// (`clock.now()` delta) is a known value DISTINCT from the budget literal — the
// discriminator the hint assertion (D) needs.
const OVERSHOOT_MS = 1234;

/**
 * Drive `runSubagentChildTeardown` for a child that never exits until the
 * FakeClock is advanced past the budget, returning the emitted
 * `subagent-teardown-timeout` diagnostic. Loud-fails if the kill fallback did
 * not fire — a missing diagnostic would make the (D) assertions vacuous.
 */
async function driveToTimeout(
  child: SubagentChildProcess = new FakeJsonChild({ exitOnStdinEof: false }),
): Promise<{ timeout: Diagnostic; child: SubagentChildProcess; clock: FakeClock; budgetMs: number }> {
  const clock = new FakeClock();
  const budgetMs = SUBAGENT_DISPOSE_BUDGET_MS;
  const { deps, emitted } = makeDeps(clock, budgetMs);

  const teardown = runSubagentChildTeardown(child, deps);
  clock.advance(budgetMs + OVERSHOOT_MS);
  await teardown;

  const timeout = emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE);
  if (timeout === undefined) {
    throw new Error(
      "harness: the subagent teardown-timeout diagnostic was not emitted after the budget " +
        "elapsed on a never-exiting child — the kill fallback did not fire, so the (D) " +
        "message/hint assertions would verify nothing",
    );
  }
  return { timeout, child, clock, budgetMs };
}

// ---------------------------------------------------------------------------
// Registry-sourced oracle (DIAG-4): the Message template, never a copy of it.
// Shape mirrored from tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts.
// ---------------------------------------------------------------------------

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(new URL("../docs/spec_topics/diagnostics/code-registry-runtime.md", import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The `subagent-teardown-timeout` row's normative *Message* template, sourced
 * live from the registry (DIAG-4). A missing row/template is a loud harness
 * failure naming the unmet precondition — never a skip, never a hard-coded
 * fallback — because the template IS this file's only oracle for the row's
 * shape and a degraded comparison against `undefined` would report success
 * while verifying nothing.
 */
function timeoutMessageTemplate(): string {
  const template = registryMessage(REGISTRY, SUBAGENT_TEARDOWN_TIMEOUT_CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message template for ` +
        `${SUBAGENT_TEARDOWN_TIMEOUT_CODE} — the DIAG-4 Message column is this file's only oracle ` +
        `for face (b), so its absence fails the run loudly`,
    );
  }
  return template;
}

describe("bug 0468 — subagent child-exit wait is decoupled from the shutdown drain cap and its diagnostic is reconciled", () => {
  it("(B) budget decoupled — a child that exits at 5000ms (past the old 2000ms shared cap, under the 30s exit budget) is NOT killed", async () => {
    const clock = new FakeClock();
    const bundle = makeDeps(clock, SUBAGENT_DISPOSE_BUDGET_MS);
    // A child whose stdin EOF does NOT self-exit — modelling a real `-p` child
    // that keeps winding down after its envelope (bug 0002: EOF is its start
    // gate, not a stop signal).
    const child = new FakeJsonChild({ exitOnStdinEof: false });

    // The teardown runs synchronously to its bounded-await race, registering a
    // clock timer at budgetMs. Do NOT await yet — the test controls the clock.
    const teardown = runSubagentChildTeardown(child, bundle.deps);

    // Advance to EXIT_AT_MS. On the CURRENT aliased tree the budget IS 2000, so
    // this fires the timer and the child is killed (the bug). On the decoupled
    // tree the 30s timer is not due, so the wait survives.
    clock.advance(EXIT_AT_MS);
    await flush();
    // The child then self-exits at 5000ms (graceful wind-down) — a code-0 exit.
    child.crashWith(0, null);
    await teardown;

    expect(child.killed).toBe(false);
    expect(bundle.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE)).toBeUndefined();
    // The dispose barrier still settles on the observed (self-)exit.
    expect(bundle.barrierSettled()).toBe(1);
  });

  it("(C) non-vacuity — a child that NEVER exits is still killed and still emits subagent-teardown-timeout under the larger budget", async () => {
    // The decouple RAISES the bound; it does not turn the wait unbounded. Bug
    // 0468 §Fix constraint: teardown stays bounded and the kill fallback (also
    // reused by PIC-66 cancellation) remains. Green on both trees by design —
    // this is the both-directions guard for (B).
    const clock = new FakeClock();
    const bundle = makeDeps(clock, SUBAGENT_DISPOSE_BUDGET_MS);
    const child = new FakeJsonChild({ exitOnStdinEof: false });

    const teardown = runSubagentChildTeardown(child, bundle.deps);
    clock.advance(SUBAGENT_DISPOSE_BUDGET_MS + 1);
    await teardown;

    expect(child.killed).toBe(true);
    expect(bundle.emitted.find((d) => d.code === SUBAGENT_TEARDOWN_TIMEOUT_CODE)).toBeDefined();
  });

  it("(D) message equals the shipped identifier-less registry Message template (DIAG-4), byte-for-byte with <ms> interpolated as the budget", async () => {
    const template = timeoutMessageTemplate();
    const { timeout, budgetMs } = await driveToTimeout();

    // DIAG-4: the emission IS the registry row's shipped Message template with
    // `<ms>` interpolated as the configured budget — no reword. Adding a
    // per-child identifier to `message` would reword a shipped Message-column
    // template and is deferred to theta 2.0 (bug 0468 CHANGE 1 / DIAG-4), so the
    // row and the emission stay byte-identical to the shipped template. The
    // template is sourced live from the registry, never copied prose.
    expect(template).toBe("subagent child did not exit within <ms>ms; killed");
    expect(timeout.message).toBe(template.replace("<ms>", String(budgetMs)));
  });

  it("(D) hint is the measured elapsed wall time, not the configured budget", async () => {
    const { timeout, clock, budgetMs } = await driveToTimeout();

    // Face (b): hint = measured elapsed via `deps.clock.now()` delta, read in
    // the teardown continuation AFTER the bounded await settled. The fake clock
    // started at 0 and was advanced to budgetMs + OVERSHOOT_MS, so the elapsed
    // the reconciled emission reads is `clock.now()` = budgetMs + OVERSHOOT_MS —
    // deterministically DISTINCT from the budget.
    const elapsedMs = clock.now();
    expect(elapsedMs).toBe(budgetMs + OVERSHOOT_MS);
    // Current emission reports `${budgetMs}ms` (the CONFIGURED budget), so both
    // assertions red now; after face (b) the hint carries the measured elapsed.
    expect(timeout.hint).not.toBe(`${budgetMs}ms`);
    expect(timeout.hint).toBe(`${elapsedMs}ms`);
  });
});
