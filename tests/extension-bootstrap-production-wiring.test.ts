import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";
import thetaExtension, {
  EXTENSION_BOOTSTRAP_FAILED_CODE,
} from "../src/extension/factory";
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";

// Bug 0023 — the production composition omits its V9k / V9p / step-0 seams.
//
// Every other bootstrap witness in the suite drives `createThetaExtension` with
// an INJECTED recorder, so all of them are structurally blind to what the
// shipped composition actually wires. This file drives ONLY the default export
// (`thetaExtension`) against a recording `ExtensionAPI` double with
// `console.error` and `process.stderr.write` spied, so a constructed-then-
// dropped diagnostic is observable as the absence of a delivery on a real
// surface. It is the inversion of the bug document's §Reproduction probes A,
// B and B2, each of which records `{sends:0, error:0, write:0}` at HEAD.
//
// Spec: diagnostics/code-registry-load.md (the
// `theta/load/extension-bootstrap-failed`, `theta/load/host-incompatible` and
// — element 4's DIAG-2 mint — `theta/load/extension-compose-failed` rows),
// pi-integration-contract/extension-bootstrap-and-per-theta.md (the System
// notes fallback chain the diagnostics route through, and the
// `pi.registerMessageRenderer` per-instance permanent degrade),
// pi-integration-contract/capability-probe.md #entry-capability-probe (step 0
// runs "before any `pi.registerFlag`, `pi.registerCommand`, `pi.registerTool`,
// `pi.registerMessageRenderer`, or `pi.on` call"),
// pi-integration-contract/session-shutdown-semantics.md PIC-67 clause (c)
// (the no-delivery rule is scoped to the invalidated runtime, not a live one).
//
// This is a code-keyed obligation area (PIC, no numbered REQ-IDs): each test
// cites its diagnostics-registry code inline per the conventions.md
// *Diagnostic message anchors* rule.
//
// Every import here is public API that already exists, so each test reds on
// BEHAVIOUR (production drops or mislabels the delivery), never on a missing
// export.

/**
 * The step-0 refusal code (code-registry-load.md). Written as a file-local
 * literal rather than imported so this file stays coupled to the registry
 * string, not to a symbol the fix introduces.
 */
const HOST_INCOMPATIBLE_CODE = "theta/load/host-incompatible";

/**
 * Element 4's DIAG-2 mint for a throw escaping the whole `composeInstance`
 * pass — a distinct phase from a host-binding call failure, so it carries its
 * own code instead of the closed `BootstrapCapability` label set's nearest
 * member. File-local literal for the same reason as above.
 */
const EXTENSION_COMPOSE_FAILED_CODE = "theta/load/extension-compose-failed";

/** The throw the compose-supplier catch receives (bug 0023 §Reproduction B). */
const COMPOSE_THROW_MESSAGE = "ctx.cwd read failed during the discovery walk";

/**
 * The canonical factory-time host-binding call order once step 0 passes:
 * `registerFlag` (step 1), the renderer, then the three `pi.on` subscriptions
 * (steps 1/3/4 of registration-steps.md).
 */
const FULL_BOOTSTRAP_CALLS = [
  "registerFlag",
  "registerMessageRenderer",
  "on:resources_discover",
  "on:session_start",
  "on:session_shutdown",
] as const;

type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

/** One recorded `pi.sendMessage` envelope (the tier-1 transcript arm). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: unknown;
  readonly details: unknown;
  readonly triggerTurn: unknown;
}

interface RecordingHost {
  readonly pi: ExtensionAPI;
  /** Host-binding calls attempted, in call order (`on:<event>` for subscriptions). */
  readonly calls: string[];
  /** `pi.sendMessage` envelopes, in call order. */
  readonly notes: RecordedNote[];
  /** `pi.on` handlers that actually installed, keyed by event. */
  readonly handlers: Map<string, PiHandler>;
}

interface HostOptions {
  /** Host-binding keys whose call throws (`registerFlag`, `on:session_start`, …). */
  readonly throwOn?: ReadonlySet<string>;
  /**
   * SDK members deleted from the `pi` surface. Only the step-0 refusal fixture
   * uses this: every other host carries all eight factory-probable members
   * (capability-probe.md Step 0 (c)) so the probe passes and the test
   * exercises the surface it actually names.
   */
  readonly omit?: ReadonlySet<string>;
}

function makeRecordingHost(options: HostOptions = {}): RecordingHost {
  const calls: string[] = [];
  const notes: RecordedNote[] = [];
  const handlers = new Map<string, PiHandler>();
  const throwOn = options.throwOn ?? new Set<string>();

  const guard = (key: string): void => {
    calls.push(key);
    if (throwOn.has(key)) {
      throw new Error(`${key} host seam absent`);
    }
  };

  const surface: Record<string, unknown> = {
    registerFlag: (): void => guard("registerFlag"),
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      // `guard` throws before the handler is stored, so a failing subscription
      // leaves nothing installed for that event.
      guard(`on:${event}`);
      handlers.set(event, handler);
    },
    // The eight factory-probable SDK members (capability-probe.md Step 0 (c)).
    registerCommand: (name: string): void => guard(`registerCommand:${name}`),
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => guard("registerMessageRenderer"),
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: unknown;
        details: unknown;
      },
      sendOptions?: { triggerTurn?: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details,
        triggerTurn: sendOptions?.triggerTurn,
      });
    },
  };

  for (const member of options.omit ?? []) {
    if (!(member in surface)) {
      expect.fail(
        `host fixture cannot omit '${member}': the double carries no such member`,
      );
    }
    delete surface[member];
  }

  return { pi: surface as unknown as ExtensionAPI, calls, notes, handlers };
}

interface RecordingCtx {
  readonly ctx: ExtensionContext;
  /** `ctx.ui.notify(message, type)` deliveries, in call order. */
  readonly notified: Array<readonly [string, string]>;
}

/**
 * A `session_start` ctx whose `cwd` getter throws, so the REAL
 * `composeExtensionInstance` the default export supplies throws out of its
 * discovery walk and the one live compose-supplier catch runs. `hasUI: false`
 * keeps the no-UI stderr mirror reachable, so a delivery that fell back to it
 * would be observable on the spied `process.stderr.write`.
 */
function makeComposeThrowingCtx(): RecordingCtx {
  const notified: Array<readonly [string, string]> = [];
  const ctx = {
    get cwd(): string {
      throw new Error(COMPOSE_THROW_MESSAGE);
    },
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;
  return { ctx, notified };
}

// ── Loud narrowing helpers (no silent skipping) ─────────────────────────────

function exactlyOneNote(notes: readonly RecordedNote[]): RecordedNote {
  if (notes.length !== 1) {
    expect.fail(
      `expected exactly one theta-system-note pi.sendMessage, got ${notes.length}`,
    );
  }
  return notes[0] as RecordedNote;
}

function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}

function exactlyOneDiagnostic(note: RecordedNote): Diagnostic {
  const diagnostics = noteDiagnostics(note);
  if (diagnostics.length !== 1) {
    expect.fail(
      `expected exactly one diagnostic in the note batch, got ${diagnostics.length}`,
    );
  }
  return diagnostics[0] as Diagnostic;
}

function requireHandler(host: RecordingHost, event: string): PiHandler {
  const handler = host.handlers.get(event);
  if (handler === undefined) {
    expect.fail(
      `the factory installed no '${event}' subscription (installed: ${[...host.handlers.keys()].join(", ") || "none"})`,
    );
  }
  return handler;
}

/** Spy `console.error`, returning its accumulating argument log. */
function captureConsoleError(): unknown[][] {
  const calls: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
    calls.push(args);
  });
  return calls;
}

/** Spy `process.stderr.write`, returning its accumulating chunk log. */
function captureStderr(): string[] {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array): boolean => {
      chunks.push(String(chunk));
      return true;
    },
  );
  return chunks;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Element 1 / V9k — the abort surfaces deliver through the shipped export ──

describe("bug 0023 element 1 — the production emitDiagnostic sink (theta/load/extension-bootstrap-failed)", () => {
  it("theta/load/extension-bootstrap-failed: a fatal pi.registerFlag throw through the DEFAULT EXPORT delivers one diagnostic on the tier-1 theta-system-note transcript arm", () => {
    const host = makeRecordingHost({ throwOn: new Set(["registerFlag"]) });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    expect(() => thetaExtension(host.pi)).not.toThrow();

    // Tier 1 (bug 0023 D1): no `ctx` exists at factory time, so the partial
    // chain's transcript arm carries it (`ctx.ui.notify` is unreachable).
    const note = exactlyOneNote(host.notes);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(note.display).toBe(true);
    expect(note.triggerTurn).toBe(false);

    const diagnostic = exactlyOneDiagnostic(note);
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(diagnostic.details?.capability).toBe("pi.registerFlag");
    expect(diagnostic.details?.error).toBe("registerFlag host seam absent");
    // The envelope's content is the rendered batch (one diagnostic → one
    // rendered line), so the note reads as a system note and not as an opaque
    // payload.
    expect(note.content).toBe(renderDiagnosticLine(diagnostic));

    // The transcript arm succeeded, so neither terminal fallback fires.
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);

    // Wiring the sink does not weaken the V9k fatal abort: nothing after the
    // failing call is attempted.
    expect(host.calls).toEqual(["registerFlag"]);
    expect(host.handlers.size).toBe(0);
  });

  it("theta/load/extension-bootstrap-failed: a fatal pi.on('session_start') throw through the DEFAULT EXPORT delivers one diagnostic and still aborts the remaining steps", () => {
    const host = makeRecordingHost({ throwOn: new Set(["on:session_start"]) });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    expect(() => thetaExtension(host.pi)).not.toThrow();

    const note = exactlyOneNote(host.notes);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    const diagnostic = exactlyOneDiagnostic(note);
    expect(diagnostic.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(diagnostic.details?.capability).toBe("pi.on");
    expect(diagnostic.details?.event).toBe("session_start");

    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);

    // Fatal: the `session_shutdown` subscription is never attempted.
    expect(host.calls).toEqual([
      "registerFlag",
      "registerMessageRenderer",
      "on:resources_discover",
      "on:session_start",
    ]);
    expect(host.calls).not.toContain("on:session_shutdown");
  });
});

// ── Element 2 / V9p — the RendererGate is constructed and threaded ───────────

describe("bug 0023 element 2 — the production RendererGate (theta/load/extension-bootstrap-failed)", () => {
  it("theta/load/extension-bootstrap-failed: a pi.registerMessageRenderer throw through the DEFAULT EXPORT degrades the gate, so tier 1 skips the transcript arm and lands the delivery on console.error", () => {
    const host = makeRecordingHost({
      throwOn: new Set(["registerMessageRenderer"]),
    });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    expect(() => thetaExtension(host.pi)).not.toThrow();

    // The renderer that would render a `theta-system-note` failed to register,
    // so the transcript arm is skipped rather than delivering into a
    // transcript that renders nothing.
    expect(host.notes).toEqual([]);

    // `renderDiagnosticLine` keys on file/range/code/message/hint/related only,
    // so the location-less diagnostic below renders byte-identically to the
    // one the factory constructs for this surface.
    const expectedLine = renderDiagnosticLine({
      severity: "error",
      code: EXTENSION_BOOTSTRAP_FAILED_CODE,
      message:
        "extension bootstrap failed: pi.registerMessageRenderer threw registerMessageRenderer host seam absent",
    });
    expect(errorLines).toEqual([[`theta: ${expectedLine}`]]);
    expect(stderrChunks).toEqual([]);

    // Non-abort (V9p): the remaining steps still run.
    expect(host.calls).toEqual([...FULL_BOOTSTRAP_CALLS]);
  });

  it("theta/load/extension-bootstrap-failed: the degraded gate is threaded into the handler-time chain — a later compose diagnostic routes through ctx.ui.notify and never through pi.sendMessage", async () => {
    const host = makeRecordingHost({
      throwOn: new Set(["registerMessageRenderer"]),
    });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    thetaExtension(host.pi);
    const sessionStart = requireHandler(host, "session_start");
    const { ctx, notified } = makeComposeThrowingCtx();

    await sessionStart({ type: "session_start" }, ctx);

    // Both ends of the gate are live: the factory degraded the same instance
    // the System-notes channel consults, so the `session_start`-time chain
    // takes the `ctx.ui.notify` arm.
    expect(host.notes).toEqual([]);
    expect(notified).toHaveLength(1);
    expect(notified[0]?.[1]).toBe("error");
    expect(notified[0]?.[0]).toContain(COMPOSE_THROW_MESSAGE);

    // Exactly the one factory-time terminal line (the renderer diagnostic):
    // the handler-time delivery landed on the toast, not on stderr.
    expect(errorLines).toHaveLength(1);
    expect(stderrChunks).toEqual([]);
  });
});

// ── Element 4 — the compose-supplier catch stops mislabelling ────────────────

describe("bug 0023 element 4 — compose-phase label (theta/load/extension-compose-failed)", () => {
  it("theta/load/extension-compose-failed: a throw escaping the whole composeInstance pass is delivered under its own code, not as extension-bootstrap-failed with capability pi.registerCommand", async () => {
    const host = makeRecordingHost();
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    thetaExtension(host.pi);
    const sessionStart = requireHandler(host, "session_start");
    const { ctx, notified } = makeComposeThrowingCtx();

    await expect(
      sessionStart({ type: "session_start" }, ctx),
    ).resolves.not.toThrow();

    const note = exactlyOneNote(host.notes);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    const diagnostic = exactlyOneDiagnostic(note);

    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.code).toBe(EXTENSION_COMPOSE_FAILED_CODE);
    expect(diagnostic.message.startsWith("extension compose failed: ")).toBe(
      true,
    );
    expect(diagnostic.details?.error).toBe(COMPOSE_THROW_MESSAGE);

    // The registry row defines `capability` as naming "the failing call";
    // nothing reached `pi.registerCommand`, so neither the label nor the
    // host-binding code may be reused for a compose-phase throw.
    expect(diagnostic.code).not.toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(diagnostic.details?.capability).not.toBe("pi.registerCommand");

    // The gate is available on this run, so the transcript arm carried it.
    expect(notified).toEqual([]);
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });
});

// ── Element 3 / step 0 — the capability probe runs in the shipped export ─────

describe("bug 0023 element 3 — the step-0 capability probe (theta/load/host-incompatible)", () => {
  it("theta/load/host-incompatible: a host missing one factory-probable SDK member is refused at load with kind sdk-capability-missing and NO host-binding call is made", () => {
    // capability-probe.md Step 0 (c): `pi.getAllTools` is one of the eight
    // factory-probable function members (bug 0001 / PIC-64). The factory never
    // calls it, so only step 0 can notice its absence.
    const host = makeRecordingHost({ omit: new Set(["getAllTools"]) });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    expect(() => thetaExtension(host.pi)).not.toThrow();

    const note = exactlyOneNote(host.notes);
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    const diagnostic = exactlyOneDiagnostic(note);
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.code).toBe(HOST_INCOMPATIBLE_CODE);
    expect(diagnostic.details?.kind).toBe("sdk-capability-missing");
    expect(diagnostic.details?.member).toBe("pi.getAllTools");

    // The refusal posture: step 0 runs "before any `pi.registerFlag`,
    // `pi.registerCommand`, `pi.registerTool`, `pi.registerMessageRenderer`,
    // or `pi.on` call", and a failure refuses every subsequent one.
    expect(host.calls).toEqual([]);
    expect(host.handlers.size).toBe(0);

    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });

  it("theta/load/host-incompatible: a conformant host passes step 0 — the factory registers normally and emits no refusal", () => {
    // The both-directions guard for the probe host builder: a production
    // `ProbeHost` that cannot read its own installed lock-step peers would
    // refuse on every host, so this must stay green after the fix lands.
    const host = makeRecordingHost();
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    expect(() => thetaExtension(host.pi)).not.toThrow();

    expect(host.calls).toEqual([...FULL_BOOTSTRAP_CALLS]);
    expect(host.notes).toEqual([]);
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });
});
