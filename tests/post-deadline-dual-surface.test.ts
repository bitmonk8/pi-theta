// Bug 0208 — the post-deadline arm of the clean-cancel / teardown-timeout pair.
//
// `pi-integration-contract/session-shutdown-semantics.md` §"Session-swap
// behaviour for in-flight invocations", rule **Per-invocation operator
// visibility (clean-cancel path)**, states the mutual exclusion: an invocation
// either emits `theta/runtime/cancelled-by-session-shutdown` or contributes to
// the single `theta/runtime/reload-teardown-timeout` `<list>` of sub-step 3,
// "never both", and the sanctioned dual appearance carries the
// `"<unreadable>"` sentinel in `details.event.reason`
// (`pi-integration-contract/session-only-degraded-state.md` §*Accepted theta
// 1.0 residual gap — sub-step-2 stamp-throw case*). `diagnostics/
// code-registry-runtime.md` §`cancelled-by-session-shutdown` mutual exclusion
// restates the clause and hangs the residual-gap discriminator on it.
//
// This cell locks the measured post-deadline arm: an entry stamped and aborted
// by sub-step 2 whose `disposeBarrier` settles AFTER the
// `SHUTDOWN_AWAIT_CAP_MS` cap appears in BOTH surfaces, on one
// `session_shutdown` event, with a fully stamped `details.event.reason` of
// `"reload"` — not the sentinel. The `"<unreadable>"` sentinel, and not the
// dual appearance, is therefore what discriminates the stamp-throw residual
// gap; that is the discriminator this cell pins.
//
// Bug 0073's five cells (`tests/cancelled-by-session-shutdown-note.test.ts`)
// cannot reach this arm: they release the parked body before the await and
// never advance their `FakeClock`, so the cap cannot fire. The one behavioural
// difference here is the ordering — the clock is advanced past the cap while
// the body is still parked, and only then is the body released.
//
// The cell reds if either surface is suppressed, if the two surfaces stop
// naming one and the same `invocationId`, or if the reason flips to the
// sentinel on this arm.
//
// Everything on the dispatch path is real: `createProductionProducerDeps`, the
// real `composeThetaFixture.run` DRIVE seam, and the real `runSessionShutdown`
// over the SAME `ActiveInvocationRegistry` the producer was constructed with.
// Only `executeBody` is replaced, so the body can be parked on a deferred.
// Offline: no provider, no filesystem, no watcher.

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

// SPAN staging: park the DRIVE seam's body call so the invocation is genuinely
// in flight when the cap fires. A `cancel` outcome is the terminal the CANCEL
// path frames as the SLSH-4 note.
const executorHook = vi.hoisted(() => ({
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
  };
});

import {
  createProductionProducerDeps,
  type ProductionProducerInput,
} from "../src/extension/production-theta-producer";
import { composeThetaFixture } from "../src/extension/theta-composition-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import {
  runSessionShutdown,
  CANCELLED_BY_SESSION_SHUTDOWN_CODE,
  RELOAD_TEARDOWN_TIMEOUT_CODE,
  SHUTDOWN_AWAIT_CAP_MS,
  type EmissionSink,
  type SessionShutdownDeps,
} from "../src/extension/session-shutdown";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import { SESSION_SHUTDOWN_REASON_SNAPSHOT } from "../src/extension/version-bump-gates";
import { FakeClock } from "./helpers/fake-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { ThetaBody } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

/** The canonical lowercase 8-4-4-4-12 `invocationId` the entry carries verbatim
 *  into `details.event.invocation_id` (placeholder-rendering-b.md §7). */
const INVOCATION_ID = "11111111-2222-3333-4444-555555555555";
const THETA_NAME = "demo";
const SHUTDOWN_REASON = "reload";

/** The sentinel the spec's EXCEPT arm pins on the sanctioned dual appearance;
 *  this cell asserts the measured arm does NOT carry it. */
const UNREADABLE_SENTINEL = "<unreadable>";

/** Advanced-to time at which the cap fires with the body still parked. Larger
 *  than the cap so the elapsed wall time the diagnostic renders is unambiguous. */
const ADVANCE_PAST_CAP_MS = SHUTDOWN_AWAIT_CAP_MS + 3000;

/** The `code-registry-runtime.md` message template for the per-invocation row. */
const CLEAN_CANCEL_NOTE = `theta /${THETA_NAME} cancelled by session shutdown (${SHUTDOWN_REASON})`;

// --- scaffolding ------------------------------------------------------------

class PassthroughCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootWithIds(): RuntimeRoot {
  return {
    checkpoint: new PassthroughCheckpoint(),
    idSource: {
      newInvocationId: () => INVOCATION_ID,
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

/** One recorded `pi.sendMessage` payload. */
interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
  readonly display?: boolean;
  readonly details?: Record<string, unknown>;
}

function recordingPi(log: RecordedMessage[]): ExtensionAPI {
  return {
    sendMessage: (message: RecordedMessage): void => {
      log.push(message);
    },
  } as unknown as ExtensionAPI;
}

function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: THETA_NAME,
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}

/** The dispatch ctx the DRIVE seam threads: `signal: undefined` is the
 *  documented idle-entry the cancel-forwarding tolerates. */
function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so `run` reaches the parked body. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A recording `EmissionSink`: `serialise` is the production JSON shape. */
function recordingSink(lines: string[]): EmissionSink {
  return {
    emit: (line: unknown): void => {
      lines.push(String(line));
    },
    serialise: (diagnostic: Diagnostic): string => JSON.stringify(diagnostic),
  };
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds. */
function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: FakeClock,
  sink: EmissionSink,
): SessionShutdownDeps {
  return {
    registry: new ThetaRegistry(),
    activeInvocations,
    clock,
    discoveryWatcher: { close: (): void => {} },
    settingsWatcher: { close: (): void => {} },
    debounceHandle: undefined,
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink,
  };
}

/** Rendered summary of the wire, for a red that names what WAS emitted. */
function wireSummary(notes: readonly RecordedMessage[]): string {
  return notes
    .map(
      (note) =>
        `{customType:${String(note.customType)} content:${JSON.stringify(note.content)} display:${String(note.display)} details:${JSON.stringify(note.details)}}`,
    )
    .join(", ");
}

/** Rendered summary of a sink's lines, for a red that names what WAS emitted. */
function sinkSummary(lines: readonly string[]): string {
  return lines.length === 0 ? "<empty>" : lines.join(" | ");
}

/** Every parsed sink line carrying `code`. */
function rowsWithCode(lines: readonly string[], code: string): Diagnostic[] {
  const parsed: Diagnostic[] = [];
  for (const line of lines) {
    // A bare-`code` PIC-25 fallback line is not JSON; it is not a structured
    // row and must not be counted as one.
    if (!line.startsWith("{")) continue;
    const row = JSON.parse(line) as Diagnostic;
    if (row.code === code) parsed.push(row);
  }
  return parsed;
}

afterEach(() => {
  executorHook.impl = undefined;
});

describe("bug 0208 — the post-deadline dual surface", () => {
  it("an entry still in flight at the cap is named in the teardown-timeout <list> AND emits the clean-cancel row with a fully stamped reason", async () => {
    const registry = new ActiveInvocationRegistry();
    const notes: RecordedMessage[] = [];
    const teardownLines: string[] = [];
    const cleanCancelLines: string[] = [];
    const input = {
      pi: recordingPi(notes),
      root: rootWithIds(),
      modelRegistry: {} as unknown as ModelRegistry,
      activeInvocations: registry,
      cleanCancelSink: recordingSink(cleanCancelLines),
    } as ProductionProducerInput;
    const deps = createProductionProducerDeps(input);

    let releaseBody!: () => void;
    const bodyParked = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    executorHook.impl = async (): Promise<unknown> => {
      await bodyParked;
      return { outcome: "cancel", result: null };
    };

    const run = composeThetaFixture(promptTheta(), deps).run("", driveCtx());
    await tick();

    // Fail loudly if the dispatch never reached the in-flight window: every
    // assertion below is about that window.
    expect(
      registry.size(),
      "harness precondition unmet: the dispatch registered no in-flight entry",
    ).toBe(1);
    const entry = registry.snapshot()[0] as ActiveInvocationEntry | undefined;
    expect(
      entry,
      "harness precondition unmet: the registry snapshot carries no entry",
    ).toBeDefined();
    const inFlight = entry as ActiveInvocationEntry;
    expect(
      inFlight.shutdownReason,
      "harness precondition unmet: shutdownReason is stamped before the shutdown fired",
    ).toBeUndefined();

    // The one behavioural difference from bug 0073's cells: the cap fires while
    // the body is STILL parked, so the barrier cannot settle inside the window.
    const clock = new FakeClock();
    const done = runSessionShutdown(
      { reason: SHUTDOWN_REASON },
      shutdownDeps(registry, clock, recordingSink(teardownLines)),
    );
    setTimeout(() => clock.advance(ADVANCE_PAST_CAP_MS), 0);
    await done;

    expect(
      registry.size(),
      `harness precondition unmet: the entry settled before the cap, so the post-deadline arm was never driven (registry drained during the bounded await); teardown sink: ${sinkSummary(teardownLines)}`,
    ).toBe(1);

    // Surface 1: the sub-step-3 deadline `<list>`.
    const timeoutRows = rowsWithCode(teardownLines, RELOAD_TEARDOWN_TIMEOUT_CODE);
    expect(
      timeoutRows.length,
      `expected exactly one ${RELOAD_TEARDOWN_TIMEOUT_CODE} row from the sub-step-3 cap; teardown sink: ${sinkSummary(teardownLines)}`,
    ).toBe(1);
    const timeoutRow = timeoutRows[0] as Diagnostic;
    const listedEntry = `/${THETA_NAME}:${inFlight.invocationId}`;
    expect(
      timeoutRow.message.includes(listedEntry),
      `the teardown-timeout <list> does not name the in-flight entry as ${listedEntry}; message: ${timeoutRow.message}`,
    ).toBe(true);

    // The per-invocation `finally` now runs, after the deadline.
    releaseBody();
    await run;

    // Surface 2: the per-invocation clean-cancel row.
    const cleanCancelNotes = notes.filter(
      (note) =>
        note.customType === "theta-system-note" &&
        note.content === CLEAN_CANCEL_NOTE,
    );
    expect(
      cleanCancelNotes.length,
      `expected exactly one ${CANCELLED_BY_SESSION_SHUTDOWN_CODE} note after the post-deadline settle; wire: ${wireSummary(notes)}`,
    ).toBe(1);
    const noteRow = cleanCancelNotes[0] as RecordedMessage;
    expect(noteRow.display).toBe(false);
    expect(noteRow.details?.event).toEqual({
      reason: SHUTDOWN_REASON,
      theta: THETA_NAME,
      invocation_id: inFlight.invocationId,
    });

    // The structured half of surface 2, for the code the exclusion clause names.
    const cleanCancelRows = rowsWithCode(
      cleanCancelLines,
      CANCELLED_BY_SESSION_SHUTDOWN_CODE,
    );
    expect(
      cleanCancelRows.length,
      `expected exactly one structured ${CANCELLED_BY_SESSION_SHUTDOWN_CODE} row on the injected clean-cancel sink; sink: ${sinkSummary(cleanCancelLines)}`,
    ).toBe(1);

    // Identity: ONE invocation, named by both surfaces on ONE session_shutdown
    // event. Read the id back out of the timeout message rather than comparing
    // two independent literals, so a divergence cannot pass.
    const listedId = /\/demo:([0-9a-f-]+)/.exec(timeoutRow.message)?.[1];
    expect(
      listedId,
      `the teardown-timeout message names no /demo:<invocation-id>; message: ${timeoutRow.message}`,
    ).toBeDefined();
    expect(
      (noteRow.details?.event as { invocation_id?: unknown } | undefined)
        ?.invocation_id,
      `the clean-cancel row and the teardown-timeout <list> name different invocations; <list> id: ${String(listedId)}; wire: ${wireSummary(notes)}`,
    ).toBe(listedId);

    // The discriminator re-pin: the measured dual appearance carries a fully
    // stamped reason, so the sentinel — not the pair — is what marks the
    // stamp-throw residual gap.
    const observedReason = (
      noteRow.details?.event as { reason?: unknown } | undefined
    )?.reason;
    expect(
      observedReason,
      `the post-deadline clean-cancel row carries an unexpected reason; wire: ${wireSummary(notes)}`,
    ).toBe(SHUTDOWN_REASON);
    expect(
      observedReason,
      `the post-deadline row carries the residual-gap sentinel, so the dual appearance would be the sanctioned stamp-throw case; wire: ${wireSummary(notes)}`,
    ).not.toBe(UNREADABLE_SENTINEL);

    // Sub-step 2 stamped and aborted: this is the healthy arm, not the
    // stamp-throw arm the EXCEPT clause carves out.
    expect(
      inFlight.shutdownReason,
      `sub-step 2 did not stamp shutdownReason, so this run drove the stamp-throw arm rather than the post-deadline arm; observed: ${String(inFlight.shutdownReason)}`,
    ).toBe(SHUTDOWN_REASON);
    expect(
      inFlight.thetaAbort.signal.aborted,
      "sub-step 2's abort() was skipped, so this run drove the stamp-throw arm rather than the post-deadline arm",
    ).toBe(true);
    expect(
      registry.size(),
      `the per-invocation finally never completed (entry still registered); wire: ${wireSummary(notes)}`,
    ).toBe(0);
  });
});
