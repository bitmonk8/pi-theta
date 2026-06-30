import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  createLoomExtension,
  EXTENSION_BOOTSTRAP_FAILED_CODE,
  type LoomFixture,
} from "../src/extension/factory";
import {
  RendererGate,
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import { LoomRegistry } from "../src/extension/reload-wiring";

// V9p-T — failing tests for the extension-bootstrap SDK-failure NON-ABORT
// surfaces (paired V9p implementation leaf). These are the per-surface
// degrade / drop rules that — unlike the V9k whole-extension abort surfaces —
// keep the factory (or the `session_start` handler) running.
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-loom.md
//   ("Extension-bootstrap SDK failures" — the `pi.registerMessageRenderer`
//   non-abort degrade, the per-loom `pi.registerCommand` drop, and the
//   `#getcommands-read-failure` `pi.getCommands()` read-failure drop),
// diagnostics/code-registry-load.md (the `loom/load/extension-bootstrap-failed`
//   registry row + its `details` payload),
// pi-integration-contract/registration-steps.md (the step-3 collision pass that
//   reads `pi.getCommands()` before the per-loom `pi.registerCommand` loop),
// pi-integration-contract/drain-state-contract.md (the `LoomRegistry` drain
//   state the getCommands-failure handler MUST NOT set),
// diagnostics/placeholder-rendering-b.md#underlying-error-coercion (the
//   `details.error` coercion).
//
// This is a code-keyed obligation area (PIC, no numbered REQ-IDs): each test
// cites the `loom/load/extension-bootstrap-failed` diagnostics-registry code
// inline per the conventions.md *Diagnostic message anchors* rule.
//
// The factory is driven through a recording `ExtensionAPI` double whose chosen
// host-binding call throws. The current factory swallows the renderer /
// per-loom `registerCommand` failures locally (no diagnostic, no degrade) and
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
  /** Fire the installed `session_start` subscribers (drives per-loom registration). */
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

function fixture(slashName: string): LoomFixture {
  return { slashName, run: async () => {} };
}

// ── `pi.registerMessageRenderer` failure — non-abort renderer degrade ────────

describe("V9p extension bootstrap — pi.registerMessageRenderer failure (loom/load/extension-bootstrap-failed)", () => {
  it("loom/load/extension-bootstrap-failed: a factory-time pi.registerMessageRenderer throw drops the renderer, completes the remaining steps, and emits one diagnostic with details.capability='pi.registerMessageRenderer'", () => {
    const gate = new RendererGate();
    const rec = makeRecordingPi({ throwOnRenderer: true });
    const diagnostics: Diagnostic[] = [];

    expect(() =>
      createLoomExtension({
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

  it("loom/load/extension-bootstrap-failed: a pi.registerMessageRenderer throw permanently degrades this extension instance's system notes to the ctx.ui.notify arm", () => {
    const gate = new RendererGate();
    const rec = makeRecordingPi({ throwOnRenderer: true });

    createLoomExtension({
      fixtures: [],
      emitDiagnostic: () => {},
      rendererGate: gate,
    })(rec.pi);

    // The renderer registration failed, so the persistent-transcript surface is
    // unavailable and the gate is permanently degraded for this instance.
    expect(gate.available()).toBe(false);
  });

  it("loom/load/extension-bootstrap-failed: a degraded System-notes channel skips the persistent-transcript (pi.sendMessage) arm and routes every note through ctx.ui.notify", () => {
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

    sendSystemNote(note("loom load: renderer down"), deps);
    sendSystemNote(note("loom /demo aborted"), deps);

    // The transcript arm is skipped for the degraded instance...
    expect(sent).toEqual([]);
    // ...and every note routes through the transient toast (notify) arm,
    // permanently (a second note degrades the same way).
    expect(notified).toEqual([
      ["loom load: renderer down", "error"],
      ["loom /demo aborted", "error"],
    ]);
  });
});

// ── `pi.registerCommand` failure — per-loom drop ────────────────────────────

describe("V9p extension bootstrap — pi.registerCommand failure (loom/load/extension-bootstrap-failed)", () => {
  it("loom/load/extension-bootstrap-failed: a session_start-time pi.registerCommand failure drops only the failing loom, siblings still register, and one diagnostic is emitted per failing loom with details.capability='pi.registerCommand' and details.loom = the slash name", () => {
    const rec = makeRecordingPi({ throwOnCommand: new Set(["b"]) });
    const diagnostics: Diagnostic[] = [];

    createLoomExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
    })(rec.pi);

    // The per-loom `pi.registerCommand` calls fire from the `session_start`
    // handler (the registration-timing split), not the factory body.
    expect(() => rec.fireSessionStart()).not.toThrow();

    // Only the failing loom is dropped; the siblings register through their own
    // `pi.registerCommand` calls.
    expect(rec.registeredCommands).toEqual(["a", "c"]);

    // Exactly one diagnostic — for the one failing loom — naming the capability
    // and the failing loom's slash name.
    const d = exactlyOne(diagnostics);
    expect(d.severity).toBe("error");
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.registerCommand");
    expect(d.details?.loom).toBe("b");
    // `details.error` carries the caught throw's underlying-error string.
    expect(d.details?.error).toBe("registerCommand 'b' host seam absent");
  });

  it("loom/load/extension-bootstrap-failed: a per-loom pi.registerCommand failure emits exactly one diagnostic per failing loom (two failures → two diagnostics, each naming its loom)", () => {
    const rec = makeRecordingPi({ throwOnCommand: new Set(["a", "c"]) });
    const diagnostics: Diagnostic[] = [];

    createLoomExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
    })(rec.pi);
    rec.fireSessionStart();

    // The non-failing sibling still registers.
    expect(rec.registeredCommands).toEqual(["b"]);

    // One diagnostic per failing loom, each naming its own slash name.
    expect(diagnostics).toHaveLength(2);
    for (const d of diagnostics) {
      expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
      expect(d.details?.capability).toBe("pi.registerCommand");
    }
    expect(diagnostics.map((d) => d.details?.loom)).toEqual(["a", "c"]);
  });
});

// ── `pi.getCommands()` read failure — pending-list drop, no drain state ──────

describe("V9p extension bootstrap — pi.getCommands() read failure (loom/load/extension-bootstrap-failed)", () => {
  it("loom/load/extension-bootstrap-failed: a session_start-time pi.getCommands() read failure drops the pending-registration list (no pi.registerCommand call issues), the handler swallows the throw, MUST NOT set drain state, and emits one diagnostic with details.capability='pi.getCommands'", () => {
    const registry = new LoomRegistry();
    const rec = makeRecordingPi({ throwOnGetCommands: true });
    const diagnostics: Diagnostic[] = [];

    createLoomExtension({
      fixtures: [fixture("a"), fixture("b"), fixture("c")],
      emitDiagnostic: (d) => diagnostics.push(d),
      registry,
    })(rec.pi);

    // The handler swallows the read throw rather than propagating it into Pi's
    // `session_start` dispatch.
    expect(() => rec.fireSessionStart()).not.toThrow();

    // The pending-registration list for this pass is dropped: no
    // `pi.registerCommand` call issues for any pending loom.
    expect(rec.commandCalls).toEqual([]);

    // Exactly one diagnostic, naming the failing read capability — asserted
    // distinctly from the write-side `pi.registerCommand` surface.
    const d = exactlyOne(diagnostics);
    expect(d.severity).toBe("error");
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.getCommands");
    // No `details.loom` — the read failure is not per-loom.
    expect(d.details?.loom).toBeUndefined();
    // `details.error` carries the caught throw's underlying-error string.
    expect(d.details?.error).toBe("getCommands host seam absent");

    // MUST NOT set drain state — drain state is owned by V9m's `LoomRegistry`
    // contract; the read-failure handler leaves the registry at its
    // steady-state drain tuple (drain-state-contract.md).
    expect(registry.readDrainState()).toEqual({
      drained: false,
      tag: undefined,
    });
  });
});
