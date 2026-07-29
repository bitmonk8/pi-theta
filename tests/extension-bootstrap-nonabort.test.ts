import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";
import thetaExtension, {
  createThetaExtension,
  EXTENSION_BOOTSTRAP_FAILED_CODE,
  type ThetaFixture,
} from "../src/extension/factory";
import {
  RendererGate,
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import { ThetaRegistry } from "../src/extension/reload-wiring";

// V9p-T — failing tests for the extension-bootstrap SDK-failure NON-ABORT
// surfaces (paired V9p implementation leaf). These are the per-surface
// degrade / drop rules that — unlike the V9k whole-extension abort surfaces —
// keep the factory (or the `session_start` handler) running.
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-theta.md
//   ("Extension-bootstrap SDK failures" — the `pi.registerMessageRenderer`
//   non-abort degrade, the per-theta `pi.registerCommand` drop, and the
//   `#getcommands-read-failure` `pi.getCommands()` read-failure drop),
// diagnostics/code-registry-load.md (the `theta/load/extension-bootstrap-failed`
//   registry row + its `details` payload),
// pi-integration-contract/registration-steps.md (the step-3 collision pass that
//   reads `pi.getCommands()` before the per-theta `pi.registerCommand` loop),
// pi-integration-contract/drain-state-contract.md (the `ThetaRegistry` drain
//   state the getCommands-failure handler MUST NOT set),
// diagnostics/placeholder-rendering-b.md#underlying-error-coercion (the
//   `details.error` coercion).
//
// This is a code-keyed obligation area (PIC, no numbered REQ-IDs): each test
// cites the `theta/load/extension-bootstrap-failed` diagnostics-registry code
// inline per the conventions.md *Diagnostic message anchors* rule.
//
// The factory is driven through a recording `ExtensionAPI` double whose chosen
// host-binding call throws. The current factory swallows the renderer /
// per-theta `registerCommand` failures locally (no diagnostic, no degrade) and
// does not read `pi.getCommands()` at all, so these tests red on their primary
// assertions until the paired V9p implementation lands.

// The canonical factory-time `pi.on` subscription order (steps 1/3/4 of
// registration-steps.md).
const SUBSCRIPTION_ORDER = [
  "resources_discover",
  "session_start",
  "session_shutdown",
] as const;
type PiEvent = (typeof SUBSCRIPTION_ORDER)[number];

type SessionStartHandler = (
  event: unknown,
  ctx: ExtensionCommandContext,
) => unknown;

interface RecordingPi {
  pi: ExtensionAPI;
  /** Every host-binding call attempted, in call order. */
  calls: string[];
  /** Pi events whose `pi.on` subscription actually installed (no throw), in order. */
  subscriptions: PiEvent[];
  /** Slash names `pi.registerCommand` was *called* with, in order (even if it threw). */
  commandCalls: string[];
  /** Slash names that actually registered (the call returned without throwing). */
  registeredCommands: string[];
  /** How many times `pi.getCommands()` was read. */
  getCommandsCalls: number;
  /** Fire the installed `session_start` subscribers (drives per-theta registration). */
  fireSessionStart(): void;
}

interface RecordingOpts {
  /** Make the factory-time `pi.registerMessageRenderer` call throw. */
  readonly throwOnRenderer?: boolean;
  /** Slash names whose `pi.registerCommand` call throws. */
  readonly throwOnCommand?: ReadonlySet<string>;
  /** Make the `session_start`-time `pi.getCommands()` read throw. */
  readonly throwOnGetCommands?: boolean;
}

// A recording `ExtensionAPI` double. Each host-binding call is logged; a call
// configured to fault throws synchronously at its boundary (the only fault mode
// for these synchronous-void calls; `getCommands` faults by a synchronous
// throw out of the read).
function makeRecordingPi(opts: RecordingOpts = {}): RecordingPi {
  const calls: string[] = [];
  const subscriptions: PiEvent[] = [];
  const commandCalls: string[] = [];
  const registeredCommands: string[] = [];
  const sessionStartHandlers: SessionStartHandler[] = [];
  let getCommandsCalls = 0;

  const ctx = {} as unknown as ExtensionCommandContext;

  const pi = {
    registerFlag: (): void => {
      calls.push("registerFlag");
    },
    registerMessageRenderer: (): void => {
      calls.push("registerMessageRenderer");
      if (opts.throwOnRenderer === true) {
        throw new Error("registerMessageRenderer host seam absent");
      }
    },
    registerCommand: (name: string): void => {
      calls.push(`registerCommand:${name}`);
      commandCalls.push(name);
      if (opts.throwOnCommand?.has(name) === true) {
        throw new Error(`registerCommand '${name}' host seam absent`);
      }
      registeredCommands.push(name);
    },
    on: (event: string, handler: SessionStartHandler): void => {
      calls.push(`on:${event}`);
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
      }
      subscriptions.push(event as PiEvent);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] => {
      calls.push("getCommands");
      getCommandsCalls += 1;
      if (opts.throwOnGetCommands === true) {
        throw new Error("getCommands host seam absent");
      }
      return [];
    },
    sendUserMessage: (): void => {},
    sendMessage: (): void => {},
  };

  return {
    pi: pi as unknown as ExtensionAPI,
    calls,
    subscriptions,
    commandCalls,
    registeredCommands,
    get getCommandsCalls(): number {
      return getCommandsCalls;
    },
    fireSessionStart(): void {
      for (const handler of sessionStartHandlers) {
        handler({ type: "session_start" }, ctx);
      }
    },
  };
}

// Narrow the recorded diagnostics to exactly one, failing loudly (no silent
// skip) when the factory emitted none or more than one.
function exactlyOne(diagnostics: readonly Diagnostic[]): Diagnostic {
  if (diagnostics.length !== 1) {
    expect.fail(
      `expected exactly one extension-bootstrap-failed diagnostic, got ${diagnostics.length}`,
    );
  }
  return diagnostics[0] as Diagnostic;
}

function fixture(slashName: string): ThetaFixture {
  return { slashName, run: async () => {} };
}

// ── `pi.registerMessageRenderer` failure — non-abort renderer degrade ────────

// cka-16 / V9p: the extension-bootstrap SDK-failure code-keyed obligation area's
// three non-abort surfaces (renderer degrade, per-theta registerCommand drop,
// getCommands read-failure drop) close on V9p; the assertions in this file
// witness the V9p facet against the shipped bootstrap.
describe("V9p extension bootstrap — pi.registerMessageRenderer failure (theta/load/extension-bootstrap-failed)", () => {
  it("theta/load/extension-bootstrap-failed: a factory-time pi.registerMessageRenderer throw drops the renderer, completes the remaining steps, and emits one diagnostic with details.capability='pi.registerMessageRenderer'", () => {
    const gate = new RendererGate();
    const rec = makeRecordingPi({ throwOnRenderer: true });
    const diagnostics: Diagnostic[] = [];

    expect(() =>
      createThetaExtension({
        fixtures: [],
        emitDiagnostic: (d) => diagnostics.push(d),
        rendererGate: gate,
      })(rec.pi),
    ).not.toThrow();

    // Non-abort: the factory still completes the remaining steps — all three
    // factory-time subscriptions install after the renderer registration drops.
    expect(rec.subscriptions).toEqual([...SUBSCRIPTION_ORDER]);

    // Exactly one diagnostic naming the failing capability.
    const d = exactlyOne(diagnostics);
    expect(d.severity).toBe("error");
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.registerMessageRenderer");
    // `details.error` carries the caught throw's underlying-error string
    // (placeholder-rendering-b.md#underlying-error-coercion).
    expect(d.details?.error).toBe("registerMessageRenderer host seam absent");
    // Message anchors on the byte-identical registry-template prefix; `<error>`
    // is a §8 host-derived tail so the assertion is an anchored partial match.
    expect(
      d.message.startsWith(
        "extension bootstrap failed: pi.registerMessageRenderer threw ",
      ),
    ).toBe(true);
  });

  it("theta/load/extension-bootstrap-failed: a pi.registerMessageRenderer throw permanently degrades this extension instance's system notes to the ctx.ui.notify arm", () => {
    const gate = new RendererGate();
    const rec = makeRecordingPi({ throwOnRenderer: true });

    createThetaExtension({
      fixtures: [],
      emitDiagnostic: () => {},
      rendererGate: gate,
    })(rec.pi);

    // The renderer registration failed, so the persistent-transcript surface is
    // unavailable and the gate is permanently degraded for this instance.
    expect(gate.available()).toBe(false);
  });

  it("theta/load/extension-bootstrap-failed: a degraded System-notes channel skips the persistent-transcript (pi.sendMessage) arm and routes every note through ctx.ui.notify", () => {
    // A degraded gate models the post-renderer-failure extension instance: the
    // System-notes fallback chain MUST skip the `pi.sendMessage` (transcript)
    // arm — delivering to a transcript whose renderer failed renders nothing —
    // and route straight through the `ctx.ui.notify` arm.
    const gate = new RendererGate();
    gate.degrade();

    const sent: string[] = [];
    const notified: Array<readonly [string, string]> = [];
    const deps: SystemNoteChannelDeps = {
      pi: {
        sendMessage: (message): void => {
          sent.push(message.content);
        },
      },
      ui: {
        notify: (message: string, type: "error"): void => {
          notified.push([message, type]);
        },
      },
      emitDiagnostic: () => {},
      rendererGate: gate,
    };

    const note = (content: string): SystemNote => ({
      content,
      display: true,
      details: { diagnostics: [] },
    });

    sendSystemNote(note("theta load: renderer down"), deps);
    sendSystemNote(note("theta /demo aborted"), deps);

    // The transcript arm is skipped for the degraded instance...
    expect(sent).toEqual([]);
    // ...and every note routes through the transient toast (notify) arm,
    // permanently (a second note degrades the same way).
    expect(notified).toEqual([
      ["theta load: renderer down", "error"],
      ["theta /demo aborted", "error"],
    ]);
  });
});

// ── `pi.registerCommand` failure — per-theta drop ────────────────────────────

describe("V9p extension bootstrap — pi.registerCommand failure (theta/load/extension-bootstrap-failed)", () => {
  it("theta/load/extension-bootstrap-failed: a session_start-time pi.registerCommand failure drops only the failing theta, siblings still register, and one diagnostic is emitted per failing theta with details.capability='pi.registerCommand' and details.theta = the slash name", () => {
    const rec = makeRecordingPi({ throwOnCommand: new Set(["b"]) });
    const diagnostics: Diagnostic[] = [];

    createThetaExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
    })(rec.pi);

    // The per-theta `pi.registerCommand` calls fire from the `session_start`
    // handler (the registration-timing split), not the factory body.
    expect(() => rec.fireSessionStart()).not.toThrow();

    // Only the failing theta is dropped; the siblings register through their own
    // `pi.registerCommand` calls.
    expect(rec.registeredCommands).toEqual(["a", "c"]);

    // Exactly one diagnostic — for the one failing theta — naming the capability
    // and the failing theta's slash name.
    const d = exactlyOne(diagnostics);
    expect(d.severity).toBe("error");
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.registerCommand");
    expect(d.details?.theta).toBe("b");
    // `details.error` carries the caught throw's underlying-error string.
    expect(d.details?.error).toBe("registerCommand 'b' host seam absent");
  });

  it("theta/load/extension-bootstrap-failed: a per-theta pi.registerCommand failure emits exactly one diagnostic per failing theta (two failures → two diagnostics, each naming its theta)", () => {
    const rec = makeRecordingPi({ throwOnCommand: new Set(["a", "c"]) });
    const diagnostics: Diagnostic[] = [];

    createThetaExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
    })(rec.pi);
    rec.fireSessionStart();

    // The non-failing sibling still registers.
    expect(rec.registeredCommands).toEqual(["b"]);

    // One diagnostic per failing theta, each naming its own slash name.
    expect(diagnostics).toHaveLength(2);
    for (const d of diagnostics) {
      expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
      expect(d.details?.capability).toBe("pi.registerCommand");
    }
    expect(diagnostics.map((d) => d.details?.theta)).toEqual(["a", "c"]);
  });
});

// ── `pi.getCommands()` read failure — pending-list drop, no drain state ──────

describe("V9p extension bootstrap — pi.getCommands() read failure (theta/load/extension-bootstrap-failed)", () => {
  it("theta/load/extension-bootstrap-failed: a session_start-time pi.getCommands() read failure drops the pending-registration list (no pi.registerCommand call issues), the handler swallows the throw, MUST NOT set drain state, and emits one diagnostic with details.capability='pi.getCommands'", () => {
    const registry = new ThetaRegistry();
    const rec = makeRecordingPi({ throwOnGetCommands: true });
    const diagnostics: Diagnostic[] = [];

    createThetaExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
      registry,
    })(rec.pi);

    // The handler swallows the read throw rather than propagating it into Pi's
    // `session_start` dispatch.
    expect(() => rec.fireSessionStart()).not.toThrow();

    // The pending-registration list for this pass is dropped: no
    // `pi.registerCommand` call issues for any pending theta.
    expect(rec.commandCalls).toEqual([]);

    // Exactly one diagnostic, naming the failing read capability — asserted
    // distinctly from the write-side `pi.registerCommand` surface.
    const d = exactlyOne(diagnostics);
    expect(d.severity).toBe("error");
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.getCommands");
    // No `details.theta` — the read failure is not per-theta.
    expect(d.details?.theta).toBeUndefined();
    // `details.error` carries the caught throw's underlying-error string.
    expect(d.details?.error).toBe("getCommands host seam absent");

    // MUST NOT set drain state — drain state is owned by V9m's `ThetaRegistry`
    // contract; the read-failure handler leaves the registry at its
    // steady-state drain tuple (drain-state-contract.md).
    expect(registry.readDrainState()).toEqual({
      drained: false,
      tag: undefined,
    });
  });
});

// ── Bug 0023 — the same non-abort surface through the SHIPPED default export ─

// Every test above drives `createThetaExtension` with an INJECTED recorder and
// an INJECTED `RendererGate`, so all of them are structurally blind to what the
// shipped composition wires: at bug 0023's HEAD the production default export
// supplied neither, so the renderer diagnostic was discarded and the degrade
// recorded nothing. Bug 0023 (§Regression locks) adds this arm on the V9p
// non-abort surfaces, asserting the delivery ARRIVES on a real surface — the
// inversion of the bug document's §Reproduction probes A / B2, which record
// `{sends:0, error:0, write:0}`.
//
// The renderer surface is the one the fallback chain exists for ("because the
// renderer itself may be the failing capability"): the gate degrades in the
// same catch that emits, so the factory-time tier skips the transcript arm
// (delivering into a transcript that renders nothing) and the delivery lands on
// the terminal `console.error` rung instead.

interface ProductionRendererHost {
  readonly pi: ExtensionAPI;
  /** Host-binding calls attempted, in call order. */
  readonly calls: string[];
  /** `pi.sendMessage` envelopes — MUST stay empty once the gate is degraded. */
  readonly notes: unknown[];
}

/**
 * A recording host conformant to the step-0 capability probe (all eight
 * factory-probable SDK members, capability-probe.md Step 0 (c)) whose
 * `pi.registerMessageRenderer` faults, so the probe passes and the test
 * exercises the V9p renderer-degrade surface it names.
 */
function makeProductionRendererHost(): ProductionRendererHost {
  const calls: string[] = [];
  const notes: unknown[] = [];
  const pi = {
    registerFlag: (): void => {
      calls.push("registerFlag");
    },
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    on: (event: string): void => {
      calls.push(`on:${event}`);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {
      calls.push("registerMessageRenderer");
      throw new Error("registerMessageRenderer host seam absent");
    },
    sendMessage: (message: unknown): void => {
      notes.push(message);
    },
  };
  return { pi: pi as unknown as ExtensionAPI, calls, notes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("V9p extension bootstrap — the shipped default export (bug 0023)", () => {
  it("theta/load/extension-bootstrap-failed: a pi.registerMessageRenderer throw through the production default export DELIVERS the diagnostic on the degraded chain's terminal rung, and the remaining steps still run", () => {
    const host = makeProductionRendererHost();
    const errorSpy = vi.spyOn(console, "error").mockImplementation((): void => {});
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    expect(() => thetaExtension(host.pi)).not.toThrow();

    // The gate is constructed per extension instance and degraded in the same
    // catch that emits, so the transcript arm is skipped for this instance.
    expect(host.notes).toEqual([]);

    // `renderDiagnosticLine` keys on file/range/code/message/hint/related only,
    // so this location-less diagnostic renders byte-identically to the one the
    // factory constructs for this surface.
    const expectedLine = renderDiagnosticLine({
      severity: "error",
      code: EXTENSION_BOOTSTRAP_FAILED_CODE,
      message:
        "extension bootstrap failed: pi.registerMessageRenderer threw registerMessageRenderer host seam absent",
    });
    expect(errorSpy.mock.calls).toEqual([[`theta: ${expectedLine}`]]);
    expect(stderrSpy.mock.calls).toEqual([]);

    // Non-abort: the factory still completes the remaining steps.
    expect(host.calls).toEqual([
      "registerFlag",
      "registerMessageRenderer",
      "on:resources_discover",
      "on:session_start",
      "on:session_shutdown",
    ]);
  });
});
