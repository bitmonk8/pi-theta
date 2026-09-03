// Bug 0073 — the per-invocation clean-cancel note
// `theta/runtime/cancelled-by-session-shutdown`.
//
// `session-shutdown-semantics.md` §"Per-invocation operator visibility
// (clean-cancel path)" makes the row MANDATORY: for each
// `ActiveInvocationRegistry` entry whose `disposeBarrier` settles inside the
// `SHUTDOWN_AWAIT_CAP_MS` window of sub-step 3, "the cancellation path inside
// that invocation's own `finally` block emits exactly one
// `theta/runtime/cancelled-by-session-shutdown` (E, runtime) note on
// `theta-system-note` with `display: false`", carrying
// `details.event: { reason, theta, invocation_id }`
// (`diagnostics/diagnostic-shape.md` §"Runtime-constructed sibling carve-out")
// and the message `theta /<name> cancelled by session shutdown (<reason>)`
// (`diagnostics/code-registry-runtime.md`, the row's message column).
//
// The trigger predicate is `entry.shutdownReason !== undefined` — the field
// sub-step 2 stamps (`ActiveInvocationEntry.shutdownReason`,
// `src/runtime/active-invocation-registry.ts`) — and NOT `signal.aborted`: an
// Esc aborts too and must draw nothing.
//
// Cells:
//   (a) a slash-dispatched theta in flight across `runSessionShutdown({reason:
//       "reload"})`, whose barrier settles inside the bounded await, emits the
//       row exactly once, byte-exact, `display: false`, with the pinned
//       `details.event`. RED at HEAD: the only note on the wire is the SLSH-4
//       `theta /<name> cancelled` row (`src/runtime/err-note-render.ts`, SNK-f).
//   (b) predicate control: an Esc-style abort (no `session_shutdown`, so
//       `shutdownReason` stays `undefined`) draws NO such row.
//   (c) once-only: the per-invocation `finish` is reached from more than one
//       site per dispatch (`ProductionThetaProducer.#openInvocationTicket`'s
//       returned ticket is finished by `bindPromptConversation`'s
//       `finishInvocation` AND by `composeThetaFixture.run`'s outer `finally`),
//       and a further explicit `finish()` is a no-op — one row total.
//   (d) the structured emission half: the row also reaches the `EmissionSink`
//       (serialise + emit) exactly once, carrying code / severity / message /
//       details, built through `cancelledBySessionShutdownDiagnostic` and
//       emitted through `emitNestedShapeDiagnostic`
//       (`src/extension/session-shutdown.ts`).
//   (e) channel fidelity: when the composition root's extension-instance
//       `theta-system-note` channel is injected (`systemNoteChannel`), the note
//       rides THAT channel — the one carrying the live `RendererGate` and
//       `SystemNoteChannelHealth` — and not a channel the producer builds from
//       its own `pi` dep.
//
// Everything on the dispatch path is real: `createProductionProducerDeps`, the
// real `composeThetaFixture.run` DRIVE seam, and the real `runSessionShutdown`
// over the SAME `ActiveInvocationRegistry` the producer was constructed with.
// Only `executeBody` is replaced, so the body can be parked on a deferred and
// released from a queued task — that is what puts the barrier settle INSIDE the
// bounded await, i.e. on the clean-cancel arm the rule scopes to. Offline: no
// provider, no filesystem, no watcher.

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";

// SPAN staging (mirrors `tests/active-invocation-wiring.test.ts`): park the DRIVE
// seam's body call so the invocation is genuinely in flight when the shutdown
// fires. A `cancel` outcome is the terminal the CANCEL path frames as the SLSH-4
// note, which is the row cell (a) must NOT be satisfied by.
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
import type {
  ThetaCompositionInput,
  ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
  type ActiveInvocationTicket,
} from "../src/runtime/active-invocation-registry";
import {
  runSessionShutdown,
  CANCELLED_BY_SESSION_SHUTDOWN_CODE,
  type EmissionSink,
  type SessionShutdownDeps,
} from "../src/extension/session-shutdown";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
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

/** The SLSH-4 `SNK-f` row (`src/runtime/err-note-render.ts`, `case "cancelled"`)
 *  — the note an Esc produces, and the ONLY note on the wire at HEAD. It is
 *  required independently and is not a substitute for the per-invocation row. */
const SLSH4_CANCEL_NOTE = `theta /${THETA_NAME} cancelled`;

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
    // Bug 0383: the SLSH-4 boundary now builds a `RuntimeEvent` (stamping
    // `occurred_at` via `root.clock.wallNow()`) whenever cell (b)'s Esc-style
    // abort surfaces the SNK-f cancelled note, so the double needs a `clock`
    // seam or that construction throws before `pi.sendMessage` is reached.
    clock: new FakeClock(),
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

function teardownSink(): EmissionSink {
  return {
    emit: (): void => {},
    serialise: (diagnostic): string => JSON.stringify(diagnostic),
  };
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds. */
function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: FakeClock,
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
    sink: teardownSink(),
  };
}

interface ParkedDispatch {
  readonly registry: ActiveInvocationRegistry;
  readonly notes: RecordedMessage[];
  readonly run: Promise<void>;
  readonly entry: ActiveInvocationEntry;
  releaseBody(): void;
  /** How many times the per-invocation ticket's `finish` was reached. */
  finishCalls(): number;
  /** The ticket the dispatch opened, for the explicit re-`finish` in cell (c). */
  ticket(): ActiveInvocationTicket;
}

/**
 * Dispatch `/demo` through the real DRIVE seam and leave it parked in its body.
 *
 * `extraInput` is spread onto the real `ProductionProducerInput`; cell (d) uses
 * it to hand in the optional `cleanCancelSink` emission dep. At HEAD the
 * producer has no such member, so it is ignored — which is exactly the
 * red this file witnesses, not a type-level probe.
 */
async function dispatchParkedInBody(
  extraInput: Readonly<Record<string, unknown>> = {},
): Promise<ParkedDispatch> {
  const registry = new ActiveInvocationRegistry();
  const notes: RecordedMessage[] = [];
  const input = {
    pi: recordingPi(notes),
    root: rootWithIds(),
    modelRegistry: {} as unknown as ModelRegistry,
    activeInvocations: registry,
    ...extraInput,
  } as ProductionProducerInput;
  const base = createProductionProducerDeps(input);

  // Count the reaches of the per-invocation `finish` (the once-only witness in
  // cell (c)) by wrapping the ticket the dispatch-site `beginInvocation` opens.
  // The wrapper forwards to the REAL ticket, so the producer's own idempotence
  // guard — and the emission the fix places inside it — are untouched.
  let openedTicket: ActiveInvocationTicket | undefined;
  let finishCalls = 0;
  const deps = new Proxy(base, {
    get: (target, property): unknown => {
      if (property === "beginInvocation") {
        return (beginInput: Parameters<
          NonNullable<ThetaProducerDeps["beginInvocation"]>
        >[0]): ActiveInvocationTicket => {
          const real = target.beginInvocation?.(beginInput);
          if (real === undefined) {
            throw new Error(
              "harness precondition unmet: the producer exposes no beginInvocation",
            );
          }
          const wrapped: ActiveInvocationTicket = {
            settleDisposeBarrier: real.settleDisposeBarrier,
            invocationId: real.invocationId,
            theta: real.theta,
            finish: (): void => {
              finishCalls += 1;
              real.finish();
            },
          };
          openedTicket = wrapped;
          return wrapped;
        };
      }
      // The producer is a class instance whose methods read private fields, so
      // the receiver must stay the real instance — not the proxy.
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ThetaProducerDeps;

  let releaseBody!: () => void;
  const bodyParked = new Promise<void>((resolve) => {
    releaseBody = resolve;
  });
  executorHook.impl = async (): Promise<unknown> => {
    await bodyParked;
    // The CANCEL terminal outcome: the theta unwound because sub-step 2 aborted
    // it, and the slash boundary frames the SLSH-4 note from it.
    return { outcome: "cancel", result: null };
  };

  const run = composeThetaFixture(promptTheta(), deps).run("", driveCtx());
  await tick();

  // Fail loudly if the dispatch never reached the in-flight window: every
  // assertion below is about that window, and a harness that missed it would
  // assert nothing.
  expect(
    registry.size(),
    "harness precondition unmet: the dispatch registered no in-flight entry",
  ).toBe(1);
  const entry = registry.snapshot()[0];
  expect(
    entry,
    "harness precondition unmet: the registry snapshot carries no entry",
  ).toBeDefined();
  expect(
    (entry as ActiveInvocationEntry).shutdownReason,
    "harness precondition unmet: shutdownReason is stamped before the shutdown fired",
  ).toBeUndefined();

  return {
    registry,
    notes,
    run,
    entry: entry as ActiveInvocationEntry,
    releaseBody,
    finishCalls: () => finishCalls,
    ticket: (): ActiveInvocationTicket => {
      if (openedTicket === undefined) {
        throw new Error(
          "harness precondition unmet: the dispatch opened no invocation ticket",
        );
      }
      return openedTicket;
    },
  };
}

/**
 * Fire the real `/reload` teardown while `dispatch` is parked, releasing the
 * body from a queued task so the entry's `disposeBarrier` settles INSIDE
 * sub-step 3's bounded await — the clean-cancel arm. The `FakeClock` is never
 * advanced, so the cap cannot fire and the mutual-exclusion counterpart
 * (`reload-teardown-timeout`) stays out of the picture.
 */
async function driveCleanCancelShutdown(dispatch: ParkedDispatch): Promise<void> {
  const done = runSessionShutdown(
    { reason: SHUTDOWN_REASON },
    shutdownDeps(dispatch.registry, new FakeClock()),
  );
  setTimeout(() => dispatch.releaseBody(), 0);
  await done;
  await dispatch.run;

  expect(
    dispatch.entry.shutdownReason,
    "harness precondition unmet: sub-step 2 did not stamp shutdownReason, so the predicate the row keys on was never true",
  ).toBe(SHUTDOWN_REASON);
  expect(
    dispatch.registry.size(),
    "harness precondition unmet: the per-invocation finally never ran (entry still registered)",
  ).toBe(0);
}

/** Every `theta-system-note` whose content is the per-invocation clean-cancel row. */
function cleanCancelNotes(notes: readonly RecordedMessage[]): RecordedMessage[] {
  return notes.filter(
    (note) =>
      note.customType === "theta-system-note" &&
      note.content === CLEAN_CANCEL_NOTE,
  );
}

/** Rendered summary of the wire, for a red that names what WAS emitted. */
function wireSummary(notes: readonly RecordedMessage[]): string {
  return notes
    .map(
      (note) =>
        `{customType:${String(note.customType)} content:${JSON.stringify(note.content)} display:${String(note.display)}}`,
    )
    .join(", ");
}

afterEach(() => {
  executorHook.impl = undefined;
});

describe("bug 0073 — the per-invocation cancelled-by-session-shutdown note", () => {
  it("(a) a clean-cancelled slash dispatch emits exactly one byte-exact display:false note carrying details.event", async () => {
    const dispatch = await dispatchParkedInBody();

    await driveCleanCancelShutdown(dispatch);

    const rows = cleanCancelNotes(dispatch.notes);
    expect(
      rows.length,
      `session_shutdown cancelled an in-flight theta but no theta/runtime/cancelled-by-session-shutdown note reached the wire; the only rows are: ${wireSummary(dispatch.notes)} (the generic SLSH-4 "${SLSH4_CANCEL_NOTE}" note — byte-identical to an Esc — is not a substitute)`,
    ).toBe(1);
    const row = rows[0] as RecordedMessage;
    // `display: false`: operator-visible via the structured payload only.
    expect(row.display).toBe(false);
    // Runtime construction obligation: a fresh `{ reason, theta, invocation_id }`
    // with static property names, sourced from the registry entry.
    expect(row.details?.event).toEqual({
      reason: SHUTDOWN_REASON,
      theta: THETA_NAME,
      invocation_id: dispatch.entry.invocationId,
    });
    // The SLSH-4 note is required independently and stays on the wire.
    expect(
      dispatch.notes.some(
        (note) =>
          note.customType === "theta-system-note" &&
          note.content === SLSH4_CANCEL_NOTE,
      ),
    ).toBe(true);
  });

  it("(b) an Esc-style cancel with no session_shutdown draws no such note", async () => {
    const dispatch = await dispatchParkedInBody();

    // Abort the invocation's own controller directly: the Esc path aborts the
    // same signal sub-step 2 aborts, but leaves `shutdownReason` unset. The row
    // keys on that field, not on `signal.aborted`.
    dispatch.entry.thetaAbort.abort(new Error("cancelled by user"));
    dispatch.releaseBody();
    await dispatch.run;

    expect(
      dispatch.entry.thetaAbort.signal.aborted,
      "harness precondition unmet: the Esc-style abort did not land",
    ).toBe(true);
    expect(
      dispatch.entry.shutdownReason,
      "harness precondition unmet: shutdownReason was stamped without a session_shutdown",
    ).toBeUndefined();
    expect(
      cleanCancelNotes(dispatch.notes).length,
      `an ordinary cancel emitted the session-shutdown row; the predicate is entry.shutdownReason !== undefined, not signal.aborted. Wire: ${wireSummary(dispatch.notes)}`,
    ).toBe(0);
  });

  it("(c) the note is emitted once even though the per-invocation finish is reached from more than one site", async () => {
    const dispatch = await dispatchParkedInBody();

    await driveCleanCancelShutdown(dispatch);
    // A further explicit finish stands in for the third HEAD reach (the
    // child-regime `finally`), which this prompt-mode dispatch does not run.
    dispatch.ticket().finish();

    expect(
      dispatch.finishCalls(),
      "harness precondition unmet: the dispatch reached the per-invocation finish only once, so the once-only guard is not exercised",
    ).toBeGreaterThanOrEqual(2);
    expect(
      cleanCancelNotes(dispatch.notes).length,
      `expected exactly one theta/runtime/cancelled-by-session-shutdown note across ${String(dispatch.finishCalls())} reaches of the per-invocation finish; wire: ${wireSummary(dispatch.notes)}`,
    ).toBe(1);
  });

  it("(d) the structured row reaches the EmissionSink exactly once with code/severity/message/details", async () => {
    // The structured half of the emission: the row is serialised and emitted
    // through `emitNestedShapeDiagnostic` over an injected `EmissionSink`. The
    // sink reaches the per-invocation `finally` through the optional
    // `cleanCancelSink` producer dep; at HEAD that dep is ignored, so the
    // sink stays empty — the red.
    const emitted: string[] = [];
    const sink: EmissionSink = {
      emit: (line: unknown): void => {
        emitted.push(String(line));
      },
      serialise: (diagnostic: Diagnostic): string => JSON.stringify(diagnostic),
    };
    const dispatch = await dispatchParkedInBody({
      cleanCancelSink: sink,
    });

    await driveCleanCancelShutdown(dispatch);

    expect(
      emitted.length,
      `the per-invocation finally emitted no structured ${CANCELLED_BY_SESSION_SHUTDOWN_CODE} row on the injected EmissionSink (emitCleanCancelNote was never invoked)`,
    ).toBe(1);
    expect(JSON.parse(emitted[0] as string)).toEqual({
      severity: "error",
      code: CANCELLED_BY_SESSION_SHUTDOWN_CODE,
      message: CLEAN_CANCEL_NOTE,
      details: {
        event: {
          reason: SHUTDOWN_REASON,
          theta: THETA_NAME,
          invocation_id: dispatch.entry.invocationId,
        },
      },
    });
  });

  it("(e) the note rides the injected extension-instance system-note channel, not one built from the producer's own pi", async () => {
    // Channel fidelity: the composition root hands the producer the SAME
    // `buildSystemNoteDeps` channel every other system note on that extension
    // instance rides (carrying the live `RendererGate` / delivery-health latch).
    // Recording both surfaces separately makes the choice observable: the row
    // must land on the injected channel's sender and never on the producer's
    // own `pi`.
    const channelLog: RecordedMessage[] = [];
    const channel: SystemNoteChannelDeps = {
      pi: {
        sendMessage: (message): void => {
          channelLog.push(message);
        },
      },
      ui: {
        notify: (): void => {
          throw new Error(
            "the display:false clean-cancel note must never reach the toast arm",
          );
        },
      },
      emitDiagnostic: (): void => {},
    };
    const dispatch = await dispatchParkedInBody({ systemNoteChannel: channel });

    await driveCleanCancelShutdown(dispatch);

    // Fail loudly if the producer's own `pi` was never live on this dispatch:
    // without the SLSH-4 row there the "never received the clean-cancel row"
    // assertion below would hold vacuously.
    expect(
      dispatch.notes.some(
        (note) =>
          note.customType === "theta-system-note" &&
          note.content === SLSH4_CANCEL_NOTE,
      ),
      "harness precondition unmet: the producer's own pi received no system note at all, so a clean-cancel row missing from it proves nothing",
    ).toBe(true);

    const rows = cleanCancelNotes(channelLog);
    expect(
      rows.length,
      `the clean-cancel row did not ride the injected extension-instance channel; injected-channel wire: ${wireSummary(channelLog)}; producer-pi wire: ${wireSummary(dispatch.notes)}`,
    ).toBe(1);
    const row = rows[0] as RecordedMessage;
    expect(row.display).toBe(false);
    expect(row.details?.event).toEqual({
      reason: SHUTDOWN_REASON,
      theta: THETA_NAME,
      invocation_id: dispatch.entry.invocationId,
    });
    expect(
      cleanCancelNotes(dispatch.notes).length,
      `the clean-cancel row also reached the producer-built channel, so the note does not ride the extension instance's channel; producer-pi wire: ${wireSummary(dispatch.notes)}`,
    ).toBe(0);
  });
});
