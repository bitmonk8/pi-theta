// Bug 0451 — RED witnesses that the factory's two lifecycle note sites bypass
// the `theta-system-note` channel's mandated best-effort fallback chain.
//
// WHY these witnesses exist. `runtime-event-channel.md:132` pins the chain for
// EVERY note shape on this channel ("for every other note shape … it is the
// `pi.sendMessage` call only. If any of those steps throws, the runtime falls
// back in this order: … 2. a `theta/runtime/system-note-delivery-failed`
// diagnostic …"). `:137` pins the invariant these two sites violate verbatim:
// "On a live runtime the fallback never aborts the slash-command handler". Both
// factory lifecycle notes are enumerated members of the channel's informational
// class at `:43`: "the two factory lifecycle notes (the drain-state
// dispatch-refusal note and the repeat-start supersession note)". At the fork
// (v0.437.0) both emit RAW `pi.sendMessage` with no chain:
//
//   - Drain-state refusal note (src/extension/factory.ts:696): a raw send inside
//     the registered slash handler body, run through
//     `runGuardedSlashHandler` (session-swap-tripwire.ts:163 →
//     `return dispatch()` at :168). A NON-stale `pi.sendMessage` throw on the
//     `theta-system-note` channel rejects the async dispatch closure's promise,
//     which propagates out of the handler into Pi's command dispatch — no chain
//     step runs (no toast, no delivery-failed diagnostic).
//   - Repeat-start supersession note (src/extension/factory.ts:761): a raw send
//     wrapped in `try { … } catch (e) { void e; }` (:771) — a throw is
//     SWALLOWED with zero fallback artefacts.
//
// Spec: docs/bugs/0451-factory-lifecycle-notes-bypass-fallback-chain.md
// (§Summary, §Reproduction probe P1a/P1b, §Expected behaviour, §Fix). The fix
// routes both sites through `sendSystemNote` (system-note-channel.ts), which on
// a non-stale throw walks the chain and returns normally — so the drain-note
// handler resolves and one `theta/runtime/system-note-delivery-failed`
// diagnostic reaches the off-channel `emitDiagnostic` sink.
//
// Each cell pairs a CONTROL fail-loud precondition (the note site was genuinely
// reached — so a witness red is never a vacuous "note never emitted" pass) with
// the WITNESS assertions (RED at the fork). The harness (fake pi / ctx / deps,
// makeTheta / boot / invoke) is copied from
// tests/drain-gated-dispatch-integration.test.ts, with a throwing
// `pi.sendMessage` on the `theta-system-note` channel, a `ctx.ui.notify`
// recorder, and an `emitDiagnostic` recorder threaded through
// `ThetaExtensionDeps.emitDiagnostic` — the off-channel sink the fix delivers to.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import type { ExtensionInstanceWiring } from "../src/extension/production-composition";
import { ThetaRegistry, type ParsedTheta } from "../src/extension/reload-wiring";
import { FakeClock } from "./helpers/fake-clock";
import { ActiveInvocationRegistry } from "../src/runtime/active-invocation-registry";
import {
  SYSTEM_NOTE_CHANNEL,
  SYSTEM_NOTE_DELIVERY_FAILED_CODE,
} from "../src/extension/system-note-channel";
import { isStaleCtxError } from "../src/extension/stale-ctx";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// A NON-stale host refusal: an ordinary Error, deliberately NOT the host's
// stale-ctx invalidation message. `isStaleCtxError` MUST reject it, so the fix's
// chain treats it as a live-runtime delivery failure (walk the chain, return
// normally) rather than a stale rethrow. Asserted below.
const NON_STALE_REFUSAL = "scratch: host refused sendMessage (non-stale)";

/** A recorded (non-throwing) `pi.sendMessage` call. */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly triggerTurn: unknown;
}

/** A recorded `ctx.ui.notify(message, type)` call. */
interface RecordedNotify {
  readonly message: string;
  readonly type: string;
}

/** The registered pi command options shape this test invokes against. */
interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly commands: Map<string, unknown>;
  /** Non-throwing sends recorded (customType !== theta-system-note). */
  readonly notes: RecordedNote[];
  /**
   * Every `theta-system-note` send ATTEMPT recorded BEFORE the throw — the
   * fail-loud "the note site was reached" observable, independent of whether
   * the throw then propagates (drain arm) or is swallowed (repeat-start arm).
   */
  readonly noteAttempts: RecordedNote[];
  /** `ctx.ui.notify` recorder (fallback-chain step 1 observable). */
  readonly notified: RecordedNotify[];
  /** Off-channel `emitDiagnostic` sink (fallback-chain step 2 observable). */
  readonly diagnostics: Diagnostic[];
  fireSessionStart(): Promise<void>;
}

/**
 * The minimal fake-pi harness copied from
 * tests/drain-gated-dispatch-integration.test.ts, with three additions for this
 * bug: a `pi.sendMessage` that THROWS a non-stale error on the
 * `theta-system-note` channel (recording the attempt first), a `ctx.ui.notify`
 * recorder, and (built in `boot`) an `emitDiagnostic` recorder.
 */
function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const noteAttempts: RecordedNote[] = [];
  const notified: RecordedNotify[] = [];
  const diagnostics: Diagnostic[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean },
      options: { triggerTurn: unknown },
    ): void => {
      const record: RecordedNote = {
        customType: message.customType,
        content: message.content,
        display: message.display,
        triggerTurn: options.triggerTurn,
      };
      if (message.customType === SYSTEM_NOTE_CHANNEL) {
        // Record the attempt (fail-loud observable), then refuse NON-stale so
        // the fix's chain treats it as a live-runtime delivery failure.
        noteAttempts.push(record);
        throw new Error(NON_STALE_REFUSAL);
      }
      notes.push(record);
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: "/does/not/matter",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        notified.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return {
    pi,
    commands,
    notes,
    noteAttempts,
    notified,
    diagnostics,
    fireSessionStart: () => fire("session_start"),
  };
}

/**
 * A minimal `ParsedTheta` (only `slashName` + `run` are read at dispatch time),
 * copied from tests/drain-gated-dispatch-integration.test.ts.
 */
function makeTheta(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run,
  };
}

function makeWiring(
  thetas: readonly ParsedTheta[],
  registry: ThetaRegistry,
): ExtensionInstanceWiring {
  return {
    thetas,
    registry,
    activeInvocations: new ActiveInvocationRegistry(),
    forwardingSignals: [],
    clock: new FakeClock(),
    installHotReload: () => ({ detach: (): void => {} }),
  };
}

/**
 * Boot the extension through the REAL factory with the given `composeInstance`
 * and the `emitDiagnostic` recorder wired into `ThetaExtensionDeps` — the
 * off-channel sink the fix delivers the delivery-failed diagnostic to.
 */
function boot(
  harness: Harness,
  composeInstance: ThetaExtensionDeps["composeInstance"],
): void {
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    emitDiagnostic: (d: Diagnostic): void => {
      harness.diagnostics.push(d);
    },
    // `exactOptionalPropertyTypes`: the optional member takes a function or is
    // absent, never a present `undefined`, so spread the key conditionally.
    ...(composeInstance !== undefined ? { composeInstance } : {}),
  };
  createThetaExtension(deps)(harness.pi);
}

/** The recorded delivery-failed diagnostics (the fix's off-channel step 2). */
function deliveryFailed(harness: Harness): readonly Diagnostic[] {
  return harness.diagnostics.filter(
    (d) => d.code === SYSTEM_NOTE_DELIVERY_FAILED_CODE,
  );
}

/** The recorded `theta-system-note` send attempts (the note site was reached). */
function refusalAttempts(harness: Harness): readonly RecordedNote[] {
  return harness.noteAttempts.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

interface Settlement {
  readonly rejected: boolean;
  readonly value?: unknown;
  readonly error?: unknown;
}

/** Invoke the captured pi handler for `name`, capturing settle vs reject. */
async function invokeSettling(
  harness: Harness,
  name: string,
  args = "",
): Promise<Settlement> {
  const options = harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    // No silent skipping (AGENTS.md): a missing registration is a setup fault.
    throw new Error(`no command registered for /${name}`);
  }
  try {
    const value = await options.handler(args, {} as unknown as ExtensionCommandContext);
    return { rejected: false, value };
  } catch (error: unknown) {
    return { rejected: true, error };
  }
}

describe("bug 0451 — factory lifecycle notes route through the fallback chain", () => {
  it("the refusal error is genuinely NON-stale (guards the harness premise)", () => {
    // CONTROL — a plain Error must NOT be recognised as the host's stale-ctx
    // invalidation error, or the fix would (correctly) rethrow instead of
    // walking the chain and this witness would test the wrong arm.
    expect(
      isStaleCtxError(new Error(NON_STALE_REFUSAL)),
      "the harness refusal Error must be non-stale for the chain to apply",
    ).toBe(false);
  });

  it("(a) drain refusal: handler resolves and one delivery-failed diagnostic reaches the sink (P1a)", async () => {
    // Doc probe P1a. Boot with a registry holding /foo (the drain-gated boot),
    // fire session_start, drain the registry, then invoke the /foo handler: the
    // PIC-32 drain arm emits the shutting-down refusal note
    // (factory.ts:694/:696), whose raw send throws non-stale.
    const foo = makeTheta("foo", async () => {});
    const registry = new ThetaRegistry([["foo", foo]]);
    const harness = makeHarness();
    boot(harness, async (): Promise<ExtensionInstanceWiring> =>
      makeWiring([foo], registry),
    );
    await harness.fireSessionStart();

    // Fail-loud precondition: the drain-gated handler was actually registered.
    expect(
      harness.commands.has("foo"),
      "/foo was not registered — the drain-gated handler never wired up",
    ).toBe(true);

    registry.drain();
    const settlement = await invokeSettling(harness, "foo");

    // Fail-loud precondition: the drain-state refusal NOTE SITE was reached (a
    // theta-system-note send was attempted) — so a witness red below is the
    // fallback-chain bypass, not a vacuous "note never emitted".
    const attempts = refusalAttempts(harness);
    expect(
      attempts,
      "the drain-state refusal note site was never reached (no theta-system-note send attempted)",
    ).toHaveLength(1);
    expect(attempts[0]?.content).toBe("theta /foo: extension shutting down");

    // WITNESS 1 (RED at fork): the handler promise RESOLVES (does not reject).
    // Equivalent to `await expect(invoke(...)).resolves.toBeUndefined()`. At the
    // fork the raw send throws and the async dispatch closure rejects with
    // NON_STALE_REFUSAL, propagating out of runGuardedSlashHandler into Pi's
    // command dispatch (runtime-event-channel.md:137 — "the fallback never
    // aborts the slash-command handler").
    expect(
      settlement.rejected,
      `the /foo handler rejected instead of resolving: ${String(
        settlement.rejected ? (settlement.error as Error)?.message : "",
      )}`,
    ).toBe(false);
    expect(settlement.value).toBeUndefined();

    // WITNESS 2 (RED at fork): the delivery-failed diagnostic reached the
    // off-channel sink exactly once (fallback-chain step 2). Empty at the fork.
    expect(
      deliveryFailed(harness),
      "no theta/runtime/system-note-delivery-failed diagnostic reached the off-channel sink",
    ).toHaveLength(1);

    // WITNESS 3 (RED at fork): the fallback-chain step-1 toast (ctx.ui.notify)
    // fired for this display:true note, so the operator still sees the refusal
    // in-session. At the fork the raw send throws before any toast, so nothing
    // is recorded.
    expect(
      harness.notified,
      "the fallback-chain step-1 toast did not fire for the display:true refusal note",
    ).toContainEqual({ message: "theta /foo: extension shutting down", type: "error" });
  });

  it("(b) repeat-start: one delivery-failed artefact rather than zero (P1b)", async () => {
    // Doc probe P1b. A FRESH wiring per compose (mirrors b0401 site 4's
    // driveRepeatStart). Fire session_start TWICE: the second, shutdown-less
    // delivery fires the repeat-start supersession note (factory.ts:758/:761),
    // whose raw send throws non-stale and is SWALLOWED by `catch { void e }`
    // (:771) — zero fallback artefacts at the fork.
    const harness = makeHarness();
    boot(harness, async (): Promise<ExtensionInstanceWiring> => {
      const foo = makeTheta("foo", async () => {});
      return makeWiring([foo], new ThetaRegistry([["foo", foo]]));
    });
    await harness.fireSessionStart();
    await harness.fireSessionStart();

    // Fail-loud precondition: the repeat-start supersession NOTE SITE was
    // reached (its send was attempted) — so a witness red is the swallow, not a
    // vacuous "repeat-start predicate never fired".
    const attempts = refusalAttempts(harness);
    expect(
      attempts,
      "the repeat-start supersession note site was never reached (no theta-system-note send attempted)",
    ).toHaveLength(1);
    expect(attempts[0]?.content).toBe(
      "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation",
    );

    // WITNESS (RED at fork): exactly ONE delivery-failed artefact rather than
    // zero. At the fork the throw is swallowed with no diagnostic.
    expect(
      deliveryFailed(harness),
      "the repeat-start note throw was swallowed: no delivery-failed diagnostic reached the off-channel sink",
    ).toHaveLength(1);
  });
});
