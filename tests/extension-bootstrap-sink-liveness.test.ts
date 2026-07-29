import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";
import {
  runCapabilityProbe,
  type ProbeHost,
} from "../src/extension/capability-probe";
import { createThetaExtension } from "../src/extension/factory";
import {
  composeExtensionInstance,
  createBootstrapDiagnosticSink,
  createProductionProbeHost,
  readPeerVersion,
  type ExtensionInstanceWiring,
} from "../src/extension/production-composition";
import { ThetaRegistry } from "../src/extension/reload-wiring";
import { STALE_CTX_MESSAGE_PREFIX } from "../src/extension/stale-ctx";
import {
  RendererGate,
  SYSTEM_NOTE_CHANNEL,
} from "../src/extension/system-note-channel";

// Bug 0023 — the two-tier bootstrap-diagnostic sink, the per-instance
// `RendererGate` threading and the production `ProbeHost`, driven directly at
// the seam.
//
// Four obligations:
//
//  1. **Tier selection (D1).** The five factory-time emission sites hold no
//     `ExtensionContext`, so they get the partial chain `pi.sendMessage` →
//     `console.error`; the six handler-time sites get the full
//     `sendSystemNote` → `ctx.ui.notify` → `console.error` chain through the
//     ctx-latching slot the `session_start` handler fills.
//  2. **PIC-67 / D4 verification obligation.** The bug document takes the
//     existing guards as sufficient and adds no duplicate liveness check at the
//     sink, on the condition that regression coverage prove the two sites NOT
//     covered by that reasoning — the `installHotReload` arming throw and the
//     `session_shutdown` body throw — cannot deliver through an invalidated
//     runtime. PIC-67 clause (c) scopes the no-delivery rule to the invalidated
//     runtime only, so the same two sites MUST deliver on a live one.
//  3. **The production `ProbeHost`.** Step 0 is unreachable without it, and a
//     builder that cannot read its own installed lock-step peers refuses the
//     extension on every host.
//  4. **Per-INSTANCE gate threading (element 2).** The degrade rule is scoped
//     to the extension INSTANCE ("System notes for this extension instance
//     permanently degrade to the `ctx.ui.notify` arm"), so EVERY note channel
//     the instance owns must read the same gate — including the parse-time
//     channel the compose pass hands the lexer, which is a second
//     `buildSystemNoteDeps` call distinct from the one
//     `composeExtensionInstance` builds for its load-diagnostic router.
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-theta.md (the
// System notes fallback chain + the factory-time partial chain),
// pi-integration-contract/session-shutdown-semantics.md PIC-67 (the stale-ctx
// no-delivery rule), pi-integration-contract/capability-probe.md Step 0
// (a)–(e) and its `readPeerVersion` conditions (1)–(4),
// diagnostics/code-registry-load.md (the routed codes).
//
// This file targets the seam the fix introduces, so until the implementation
// lands it reds at module link time on the absent
// `createBootstrapDiagnosticSink` / `createProductionProbeHost` exports and the
// absent `ThetaExtensionDeps.latchSessionContext` member.

/** The four lock-step peers, in capability-probe.md Step 0 (d) order. */
const LOCKSTEP_PEERS = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
] as const;

/** The eight factory-probable SDK members (capability-probe.md Step 0 (c)). */
const FACTORY_PROBABLE_SDK_MEMBERS = [
  "registerCommand",
  "sendUserMessage",
  "registerTool",
  "setActiveTools",
  "getActiveTools",
  "getAllTools",
  "registerMessageRenderer",
  "sendMessage",
] as const;

type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
  readonly triggerTurn: unknown;
}

/** A location-less test diagnostic (the shape every bootstrap site builds). */
function diagnostic(marker: string): Diagnostic {
  return {
    severity: "error",
    code: "theta/load/extension-bootstrap-failed",
    message: `extension bootstrap failed: ${marker}`,
    details: { capability: "pi.registerFlag", error: marker },
  };
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

// ── Host doubles ────────────────────────────────────────────────────────────

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  /** `pi.sendMessage` envelopes the host ACCEPTED. */
  readonly notes: RecordedNote[];
  /** `pi.sendMessage` calls attempted, accepted or not. */
  readonly sendAttempts: () => number;
  /** `ctx.ui.notify` deliveries the host ACCEPTED. */
  readonly notified: Array<readonly [string, string]>;
  /** `ctx.ui.notify` calls attempted, accepted or not. */
  readonly notifyAttempts: () => number;
  readonly handlers: Map<string, PiHandler>;
}

interface HostOptions {
  /** The `ctx.cwd` the compose pass keys its discovery walk to. */
  readonly cwd?: string;
  /**
   * Model the host's post-`invalidate(...)` runtime: every guarded DELIVERY
   * surface throws the stale-ctx error. Only the delivery surfaces are
   * invalidated — the registration/read members stay callable so the two sites
   * under test are reached without a confounding earlier emission from, say, a
   * stale `pi.getCommands()`.
   */
  readonly invalidated?: boolean;
  /** A non-stale `pi.sendMessage` throw (the tier-2 fall-through fixture). */
  readonly sendThrows?: Error;
}

function staleError(surface: string): Error {
  return new Error(
    `${STALE_CTX_MESSAGE_PREFIX}. Re-acquire it from the current session (${surface}).`,
  );
}

function makeHost(options: HostOptions = {}): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();
  let sendAttempts = 0;
  let notifyAttempts = 0;

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (
      message: { customType: string; content: string; details: unknown },
      sendOptions?: { triggerTurn?: unknown },
    ): void => {
      sendAttempts += 1;
      if (options.invalidated === true) {
        throw staleError("pi.sendMessage");
      }
      if (options.sendThrows !== undefined) {
        throw options.sendThrows;
      }
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
        triggerTurn: sendOptions?.triggerTurn,
      });
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: options.cwd ?? "/workspace",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notifyAttempts += 1;
        if (options.invalidated === true) {
          throw staleError("ctx.ui.notify");
        }
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;

  return {
    pi,
    ctx,
    notes,
    notified,
    handlers,
    sendAttempts: () => sendAttempts,
    notifyAttempts: () => notifyAttempts,
  };
}

function conformantPi(): ExtensionAPI {
  return makeHost().pi;
}

// ── Tier selection ──────────────────────────────────────────────────────────

describe("bug 0023 — createBootstrapDiagnosticSink tier selection", () => {
  it("tier 1: with no ctx latched an emission takes the pi.sendMessage arm and never touches ctx.ui.notify", () => {
    const host = makeHost();
    const errorLines = captureConsoleError();
    const sink = createBootstrapDiagnosticSink(host.pi, new RendererGate());

    sink.emit(diagnostic("registerFlag host seam absent"));

    expect(host.notes).toHaveLength(1);
    expect(host.notes[0]?.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(host.notes[0]?.triggerTurn).toBe(false);
    expect(noteDiagnostics(host.notes[0] as RecordedNote)).toHaveLength(1);

    // The `ctx.ui.notify` rung is unreachable at factory time: the ctx double
    // exists but was never latched, so nothing may have reached it.
    expect(host.notifyAttempts()).toBe(0);
    expect(host.notified).toEqual([]);
    // The transcript arm succeeded, so the terminal rung stays silent.
    expect(errorLines).toEqual([]);
  });

  it("tier 2: after latchSessionContext the emission takes the full chain — the transcript arm first", () => {
    const host = makeHost();
    const sink = createBootstrapDiagnosticSink(host.pi, new RendererGate());

    sink.latchSessionContext(host.ctx);
    sink.emit(diagnostic("getCommands host seam absent"));

    expect(host.notes).toHaveLength(1);
    expect(host.notes[0]?.customType).toBe(SYSTEM_NOTE_CHANNEL);
    // The toast rung is a FALLBACK, not the primary arm: a delivered
    // transcript note must not also toast.
    expect(host.notifyAttempts()).toBe(0);
  });

  it("tier 2: a non-stale pi.sendMessage throw falls through to the ctx.ui.notify arm", () => {
    const host = makeHost({ sendThrows: new Error("transcript arm refused") });
    const errorLines = captureConsoleError();
    const sink = createBootstrapDiagnosticSink(host.pi, new RendererGate());
    const d = diagnostic("registerCommand host seam absent");

    sink.latchSessionContext(host.ctx);
    sink.emit(d);

    // The transcript arm is tried FIRST, then `sendSystemNote`'s fallback step
    // 1 puts the note content on the transient toast. Only the first toast is
    // pinned: fallback step 2's own `theta/runtime/system-note-delivery-failed`
    // diagnostic rides the channel's `emitDiagnostic`, whose surfaces are the
    // pre-existing V7d/PIC-54 contract and not this bug's.
    expect(host.sendAttempts()).toBe(1);
    expect(host.notified[0]).toEqual([renderDiagnosticLine(d), "error"]);
    // The toast delivered, so the PIC-54 terminal console.error does not fire.
    expect(errorLines).toEqual([]);
  });
});

// ── PIC-67 / D4 — the two uncovered emission sites ──────────────────────────

/** Build the `composeInstance` wiring double the two sites are driven through. */
function makeWiring(overrides: {
  readonly installHotReload?: () => unknown;
  readonly snapshot?: () => readonly unknown[];
}): ExtensionInstanceWiring {
  return {
    thetas: [],
    registry: new ThetaRegistry(),
    activeInvocations: {
      snapshot: overrides.snapshot ?? ((): readonly unknown[] => []),
    },
    forwardingSignals: [],
    clock: { now: (): number => 0 },
    installHotReload:
      overrides.installHotReload ?? ((): unknown => ({ detach: (): void => {} })),
  } as unknown as ExtensionInstanceWiring;
}

function bootWithSink(
  host: HostDouble,
  wiring: ExtensionInstanceWiring,
): void {
  const sink = createBootstrapDiagnosticSink(host.pi, new RendererGate());
  createThetaExtension({
    fixtures: [],
    emitDiagnostic: sink.emit,
    latchSessionContext: sink.latchSessionContext,
    composeInstance: async () => wiring,
  })(host.pi);
}

function requireHandler(host: HostDouble, event: string): PiHandler {
  const handler = host.handlers.get(event);
  if (handler === undefined) {
    expect.fail(
      `the factory installed no '${event}' subscription (installed: ${[...host.handlers.keys()].join(", ") || "none"})`,
    );
  }
  return handler;
}

const ARMING_THROW = "watcher arming failed";
const SHUTDOWN_BODY_THROW = "in-flight invocation snapshot failed";

describe("bug 0023 / PIC-67 — the installHotReload arming throw cannot deliver through an invalidated runtime", () => {
  it("PIC-67 clause (c): on an invalidated runtime the arming-throw diagnostic reaches no surface at all", async () => {
    const host = makeHost({ invalidated: true });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    bootWithSink(
      host,
      makeWiring({
        installHotReload: (): never => {
          throw new Error(ARMING_THROW);
        },
      }),
    );
    await requireHandler(host, "session_start")(
      { type: "session_start" },
      host.ctx,
    );

    // Every surface of the invalidated runtime is equally stale, so the sink
    // returns without walking a chain whose every arm would only re-witness
    // the invalidation.
    expect(host.notes).toEqual([]);
    expect(host.notified).toEqual([]);
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });

  it("PIC-67 clause (c): on a LIVE runtime the same arming throw DOES deliver", async () => {
    const host = makeHost();
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    bootWithSink(
      host,
      makeWiring({
        installHotReload: (): never => {
          throw new Error(ARMING_THROW);
        },
      }),
    );
    await requireHandler(host, "session_start")(
      { type: "session_start" },
      host.ctx,
    );

    expect(host.notes).toHaveLength(1);
    const diagnostics = noteDiagnostics(host.notes[0] as RecordedNote);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.details?.capability).toBe("pi.on");
    expect(diagnostics[0]?.details?.event).toBe("session_start");
    expect(diagnostics[0]?.details?.error).toBe(ARMING_THROW);
    // The transcript arm carried it — no fallback rung fired.
    expect(host.notified).toEqual([]);
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });
});

describe("bug 0023 / PIC-67 — the session_shutdown body throw cannot deliver through an invalidated runtime", () => {
  it("PIC-67 clause (c): on an invalidated runtime the shutdown-body diagnostic reaches no surface at all", async () => {
    const host = makeHost({ invalidated: true });
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    bootWithSink(
      host,
      makeWiring({
        snapshot: (): never => {
          throw new Error(SHUTDOWN_BODY_THROW);
        },
      }),
    );
    await requireHandler(host, "session_start")(
      { type: "session_start" },
      host.ctx,
    );
    await requireHandler(host, "session_shutdown")(
      { type: "session_shutdown", reason: "exit" },
      host.ctx,
    );

    expect(host.notes).toEqual([]);
    expect(host.notified).toEqual([]);
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });

  it("PIC-67 clause (c): on a LIVE runtime the same shutdown-body throw DOES deliver", async () => {
    const host = makeHost();
    const errorLines = captureConsoleError();
    const stderrChunks = captureStderr();

    bootWithSink(
      host,
      makeWiring({
        snapshot: (): never => {
          throw new Error(SHUTDOWN_BODY_THROW);
        },
      }),
    );
    await requireHandler(host, "session_start")(
      { type: "session_start" },
      host.ctx,
    );
    // A successful `session_start` emits nothing, so the shutdown site owns the
    // single note asserted below.
    expect(host.notes).toEqual([]);

    await requireHandler(host, "session_shutdown")(
      { type: "session_shutdown", reason: "exit" },
      host.ctx,
    );

    expect(host.notes).toHaveLength(1);
    const diagnostics = noteDiagnostics(host.notes[0] as RecordedNote);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.details?.capability).toBe("pi.on");
    expect(diagnostics[0]?.details?.event).toBe("session_shutdown");
    expect(diagnostics[0]?.details?.error).toBe(SHUTDOWN_BODY_THROW);
    expect(host.notified).toEqual([]);
    expect(errorLines).toEqual([]);
    expect(stderrChunks).toEqual([]);
  });
});

// ── The production ProbeHost ────────────────────────────────────────────────

/**
 * Read a lock-step peer's installed version straight off disk, so the
 * assertion below tracks whatever this tree has installed rather than a
 * hardcoded literal. Fails loudly when the peer is absent — a missing peer
 * would otherwise make the comparison trivially satisfiable.
 */
function installedPeerVersion(pkg: string): string {
  const url = new URL(`../node_modules/${pkg}/package.json`, import.meta.url);
  let raw: string;
  try {
    raw = readFileSync(url, "utf8");
  } catch (readError: unknown) {
    expect.fail(
      `lock-step peer '${pkg}' is not installed at ${fileURLToPath(url)}: ${String(readError)}`,
    );
  }
  const version = (JSON.parse(raw) as { version?: unknown }).version;
  if (typeof version !== "string") {
    expect.fail(`lock-step peer '${pkg}' package.json carries no string version`);
  }
  return version;
}

describe("bug 0023 — createProductionProbeHost (the step-0 host snapshot)", () => {
  it("resolves all four lock-step peers to the versions installed in this tree", () => {
    // Load-bearing: capability-probe.md's non-normative recipe
    // (`createRequire(import.meta.url).resolve("<pkg>")`) throws
    // ERR_PACKAGE_PATH_NOT_EXPORTED against three of these four packages —
    // they publish an ESM-only `exports` map with no `require` condition — so a
    // naive builder reports condition (1) for them and the shipped extension
    // refuses to load on every host.
    const host = createProductionProbeHost(conformantPi());

    const resolved: Record<string, string | undefined> = {};
    const installed: Record<string, string> = {};
    for (const pkg of LOCKSTEP_PEERS) {
      resolved[pkg] = host.readPeerVersion(pkg);
      installed[pkg] = installedPeerVersion(pkg);
    }
    expect(resolved).toEqual(installed);
  });

  it("reports the running process's node version and carries the injected pi namespace", () => {
    const pi = conformantPi();
    const host = createProductionProbeHost(pi);

    expect(host.nodeVersion).toBe(process.versions.node);

    // Identity per member, not merely `typeof === "function"`: the probe must
    // inspect the host's real namespace, not a synthetic stand-in that would
    // pass step 0 (c) regardless of what the host actually exposes.
    const injected = pi as unknown as Record<string, unknown>;
    for (const member of FACTORY_PROBABLE_SDK_MEMBERS) {
      expect(host.pi[member]).toBe(injected[member]);
    }
  });

  it("runCapabilityProbe passes against the production host snapshot under vitest", () => {
    const outcome = runCapabilityProbe(
      createProductionProbeHost(conformantPi()),
    );
    if (!outcome.ok) {
      expect.fail(
        `step 0 refused the real host: ${JSON.stringify(outcome.details)}`,
      );
    }
    expect(outcome).toEqual({ ok: true });
  });

  it("readPeerVersion returns undefined for an unresolvable package (condition 1) instead of throwing", () => {
    const host = createProductionProbeHost(conformantPi());
    let observed: string | undefined = "unset";
    expect(() => {
      observed = host.readPeerVersion("@no-such/package-xyz");
    }).not.toThrow();
    expect(observed).toBeUndefined();
  });
});

// ── The step-0 (d) readPeerVersion mechanic, at the exported seam ──────────

/**
 * A synthetic peer name the CJS resolver cannot resolve, so rung 1 contributes
 * no candidate and the planted tree alone decides the answer.
 */
const FIXTURE_PEER = "@theta-fixture/peer-under-test";

/**
 * The first package in Step 0 (d)'s fixed iteration order, and the one whose
 * `./package.json` subpath the CJS resolver refuses
 * (`ERR_PACKAGE_PATH_NOT_EXPORTED`) — so a planted candidate is the mechanic's
 * first, and `runCapabilityProbe`'s short-circuit names this package.
 */
const FIRST_LOCKSTEP_PEER = LOCKSTEP_PEERS[0];

interface PeerTree {
  /** The `moduleDir` the rung-2 `node_modules` ancestor walk starts from. */
  readonly moduleDir: string;
  /**
   * Plant `package.json` text at the candidate `depth` ancestor directories up
   * from `moduleDir` — depth 0 is the walk's FIRST candidate, so a plant there
   * is consulted before any ancestor and before any real tree.
   */
  readonly plant: (depth: number, pkg: string, contents: string) => void;
  /** Plant a DIRECTORY where the candidate file belongs (an `EISDIR` read). */
  readonly plantDirectory: (depth: number, pkg: string) => void;
  readonly dispose: () => void;
}

function makePeerTree(): PeerTree {
  const root = mkdtempSync(join(tmpdir(), "theta-0023-peer-"));
  const moduleDir = join(root, "nested");
  mkdirSync(moduleDir, { recursive: true });
  const candidateDir = (depth: number, pkg: string): string => {
    let dir = moduleDir;
    for (let i = 0; i < depth; i += 1) {
      dir = dirname(dir);
    }
    return join(dir, "node_modules", pkg);
  };
  return {
    moduleDir,
    plant: (depth, pkg, contents): void => {
      const dir = candidateDir(depth, pkg);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), contents, "utf8");
    },
    plantDirectory: (depth, pkg): void => {
      mkdirSync(join(candidateDir(depth, pkg), "package.json"), {
        recursive: true,
      });
    },
    dispose: (): void => rmSync(root, { recursive: true, force: true }),
  };
}

/** The production probe host with its peer-version read redirected at `moduleDir`. */
function probeHostReadingFrom(moduleDir: string): ProbeHost {
  return {
    ...createProductionProbeHost(conformantPi()),
    readPeerVersion: (pkg: string) => readPeerVersion(pkg, moduleDir),
  };
}

describe("bug 0023 — readPeerVersion (capability-probe.md Step 0 (d)) at the exported seam", () => {
  it("a malformed candidate package.json THROWS rather than answering undefined", () => {
    // capability-probe.md's Self-failure clause scopes `undefined` to the four
    // installation-observable conditions; a parse failure is outside them, so
    // answering `undefined` here would mis-report a corrupt install as a clean
    // "no readable version" verdict.
    const tree = makePeerTree();
    try {
      tree.plant(0, FIRST_LOCKSTEP_PEER, '{ "name": "broken", ');
      expect(() => readPeerVersion(FIRST_LOCKSTEP_PEER, tree.moduleDir)).toThrow(
        SyntaxError,
      );
    } finally {
      tree.dispose();
    }
  });

  it("an unreadable candidate that is not ENOENT propagates instead of being walked past", () => {
    // The errno classification's rethrow arm: only ENOENT means "no file at
    // this candidate". A directory where the file belongs reads as EISDIR — a
    // genuine read failure that must reach the probe, not advance the walk.
    const tree = makePeerTree();
    try {
      tree.plantDirectory(0, FIRST_LOCKSTEP_PEER);
      expect(() => readPeerVersion(FIRST_LOCKSTEP_PEER, tree.moduleDir)).toThrow(
        /EISDIR/,
      );
    } finally {
      tree.dispose();
    }
  });

  it("runCapabilityProbe routes that throw to kind probe-failed, step peer-dep-version, naming the package", () => {
    const tree = makePeerTree();
    try {
      tree.plant(0, FIRST_LOCKSTEP_PEER, '{ "name": "broken", ');
      const outcome = runCapabilityProbe(probeHostReadingFrom(tree.moduleDir));
      if (outcome.ok) {
        expect.fail(
          "step 0 passed over a host whose peer-version read throws — the probe-failed route is unreachable",
        );
      }
      expect(outcome.details.kind).toBe("probe-failed");
      expect(outcome.details.step).toBe("peer-dep-version");
      expect(outcome.details.package).toBe(FIRST_LOCKSTEP_PEER);
      // PIC-6: the throw is trapped, never re-raised out of the probe.
      expect(outcome.details.cause).toContain("JSON");
    } finally {
      tree.dispose();
    }
  });

  it("condition (3): a located package.json with no own version field answers undefined", () => {
    const tree = makePeerTree();
    try {
      tree.plant(0, FIXTURE_PEER, JSON.stringify({ name: FIXTURE_PEER }));
      expect(readPeerVersion(FIXTURE_PEER, tree.moduleDir)).toBeUndefined();
    } finally {
      tree.dispose();
    }
  });

  it("a located package.json whose name does not match keeps walking instead of answering prematurely", () => {
    const tree = makePeerTree();
    try {
      tree.plant(
        0,
        FIXTURE_PEER,
        JSON.stringify({ name: "@theta-fixture/some-other-peer", version: "9.9.9" }),
      );
      tree.plant(
        1,
        FIXTURE_PEER,
        JSON.stringify({ name: FIXTURE_PEER, version: "1.2.3" }),
      );
      expect(readPeerVersion(FIXTURE_PEER, tree.moduleDir)).toBe("1.2.3");
    } finally {
      tree.dispose();
    }
  });
});

// ── Element 2 — the gate reaches the compose pass's parse-time channel ──────

/**
 * A `.theta` whose BODY carries a block comment. The lexer rejects it
 * (`theta/parse/block-comment`) and hands the batch to the parse-time note
 * channel `runComposePass` builds for `parseThetaDocument` — a SECOND
 * `buildSystemNoteDeps` instance, distinct from the load-diagnostic channel
 * `composeExtensionInstance` builds, and the one a gate threaded per channel
 * rather than per extension instance leaves ungated.
 */
const BLOCK_COMMENT_THETA = [
  "---",
  "mode: prompt",
  "---",
  "/* the lexer rejects block comments */",
  "@`hi`",
  "",
].join("\n");

interface ComposeWorkspace {
  /** The discovery-root `ctx.cwd` points at. */
  readonly cwd: string;
  readonly dispose: () => void;
}

/** Plant the malformed theta on the conventional project source (`.pi/theta/`). */
function plantMalformedTheta(): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-0023-gate-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "theta", "malformed-0023.theta"),
    BLOCK_COMMENT_THETA,
    "utf8",
  );
  // An empty-but-valid settings file: an absent one raises a
  // `theta/load/settings-unreadable` warning that is noise against the
  // delivery-surface assertions below, not behaviour under test.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

describe("bug 0023 element 2 — the per-instance RendererGate reaches the compose pass's parse-time channel", () => {
  it("a degraded gate routes a parse-time diagnostic through ctx.ui.notify and never through pi.sendMessage", async () => {
    const workspace = plantMalformedTheta();
    try {
      const host = makeHost({ cwd: workspace.cwd });
      const errorLines = captureConsoleError();
      const stderrChunks = captureStderr();
      // The state the factory leaves the gate in when the factory-time
      // `pi.registerMessageRenderer` registration throws.
      const gate = new RendererGate();
      gate.degrade();

      await composeExtensionInstance(host.pi, host.ctx, undefined, gate);

      // extension-bootstrap-and-per-theta.md scopes the degrade to the
      // INSTANCE: with the `theta-system-note` renderer absent, no channel this
      // instance owns may deliver into a transcript that renders nothing.
      expect(host.sendAttempts()).toBe(0);
      expect(host.notes).toEqual([]);

      const toasted = host.notified.map(([message]) => message).join("\n");
      expect(toasted).toContain("theta/parse/block-comment");
      expect(host.notified.every(([, type]) => type === "error")).toBe(true);

      // The toast arm accepted every delivery, so neither terminal fallback of
      // the System-notes chain fires.
      expect(errorLines).toEqual([]);
      expect(stderrChunks).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
