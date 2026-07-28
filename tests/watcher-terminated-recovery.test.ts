import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  armWatcherWithTerminalRecovery,
  WATCHER_TERMINATED_CODE,
} from "../src/extension/watcher-recovery";
import {
  ThetaRegistry,
  type ParsedTheta,
} from "../src/extension/reload-wiring";
import {
  resolveSlashDispatch,
  routeDrainStateArm,
} from "../src/extension/drain-state";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
  type UiNotifier,
} from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileWatchEvent } from "../src/seams/file-watcher";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import {
  STALE_QUIESCE_STDERR_PREFIX,
  StaleQuiesceLog,
} from "../src/extension/stale-ctx";

// V9q-T — failing tests for the paired `V9q` "Watcher post-error terminal
// recovery posture" implementation.
//
// Spec: pi-integration-contract/registration-steps.md (PIC-55),
// pi-integration-contract/host-interfaces-services.md (PIC-14 FileWatcher seam),
// diagnostics.md, diagnostics/code-registry-runtime.md
// (`theta/runtime/watcher-terminated`).
//
// The stopped-delivering — terminal case is driven deterministically through
// the V8e `FakeFileWatcher.terminate()` terminal-signal injection point, which
// mirrors the production chokidar adapter→runtime channel. On that signal the
// runtime MUST: leave the watcher torn down rather than re-armed; emit exactly
// ONE persistent `theta/runtime/watcher-terminated` `theta-system-note` prompting
// `/reload` through the `theta-system-note` channel as its primary sink (NEVER
// `ctx.ui.notify`); keep the `ThetaRegistry` live and dispatchable through arm
// (a) of `readDrainState`; and write NO `ThetaRegistry` drain-state tag.
//
// These tests red because the V9q terminal recovery posture is absent: the
// `armWatcherWithTerminalRecovery` seam wires an inert `onTerminate` callback,
// so the terminal signal emits no persistent note and tears nothing down. Each
// obligation test reds on its own primary assertion (the SUT effect), not on a
// compile error, a missing fixture, or a harness throw.
//
// Per the *Diagnostic message anchors* rule the expected message string is
// sourced from the diagnostics registry's *Message* column (via
// `registryMessage`) and the `theta/runtime/watcher-terminated` code is cited
// inline.

// The live four-page sharded diagnostics registry, read from the spec corpus —
// the single source of truth for the `watcher-terminated` *Message* template.
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
].map((page) =>
  readFileSync(
    fileURLToPath(
      new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
    ),
    "utf8",
  ),
).join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const NOOP_RUN = async (): Promise<void> => {};
const theta = (slashName: string): ParsedTheta => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});

/** A captured `pi.sendMessage` call for the `theta-system-note` channel. */
interface SentMessage {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: SystemNoteDetails;
}

/**
 * Build a `SystemNoteChannelDeps` whose `pi.sendMessage` succeeds and records
 * every sent message, so the primary-sink assertions observe the persistent
 * `theta-system-note` route and can prove `ctx.ui.notify` is never reached.
 */
function channelHarness(): {
  readonly channel: SystemNoteChannelDeps;
  readonly sent: SentMessage[];
  readonly notify: ReturnType<typeof vi.fn>;
  readonly emitDiagnostic: ReturnType<typeof vi.fn>;
} {
  const sent: SentMessage[] = [];
  const pi: SystemNoteSender = {
    sendMessage(message, _options): void {
      sent.push({ ...message });
    },
  };
  const notify = vi.fn<UiNotifier["notify"]>();
  const ui: UiNotifier = { notify };
  const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();
  return { channel: { pi, ui, emitDiagnostic }, sent, notify, emitDiagnostic };
}

// ---------------------------------------------------------------------------
// PIC-55 — stopped-delivering — terminal recovery posture.
// ---------------------------------------------------------------------------

describe("V9q-T — watcher terminal recovery posture (PIC-55)", () => {
  it("PIC-55: a stopped-delivering terminal signal emits exactly one persistent watcher-terminated system note, leaves the watcher torn down, keeps ThetaRegistry live and dispatchable, and writes no drain-state tag", () => {
    const registry = new ThetaRegistry([["greet", theta("greet")]]);
    const { channel, sent, notify } = channelHarness();
    const fw = new FakeFileWatcher();
    const watchSpy = vi.spyOn(fw, "watch");
    const changes: FileWatchEvent[] = [];

    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: (event) => changes.push(event),
      registry,
      channel,
    });

    // Terminal-signal injection point (V8e): one or more roots stop delivering.
    fw.terminate({ roots: ["/root"] });

    // Primary assertion — exactly one persistent `theta-system-note` is emitted
    // through the `theta-system-note` channel (its primary sink), never
    // `ctx.ui.notify`.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(sent[0]?.display).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    // Torn down rather than re-armed: the watcher is not re-armed (a single
    // `watch` call), and a subsequent change no longer reaches the handler.
    expect(watchSpy).toHaveBeenCalledTimes(1);
    fw.emit({ kind: "change", path: "/root/greet.theta" });
    expect(changes).toEqual([]);

    // `ThetaRegistry` stays live and dispatchable through arm (a): no drain-state
    // tag is written, so `readDrainState` reports the steady-state tuple and the
    // published `/greet` entry still dispatches.
    const snapshot = registry.readDrainState();
    expect(snapshot).toEqual({ drained: false, tag: undefined });
    expect(routeDrainStateArm(snapshot)).toBe("dispatch");
    expect(resolveSlashDispatch("greet", snapshot, registry)).toEqual({
      kind: "dispatch",
      theta: theta("greet"),
    });
  });

  it("theta/runtime/watcher-terminated: the emitted note's rendered message is sourced from the registry Message column and routes through the theta-system-note channel as its primary sink", () => {
    const registry = new ThetaRegistry();
    const { channel, sent, notify, emitDiagnostic } = channelHarness();
    const fw = new FakeFileWatcher();

    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: () => {},
      registry,
      channel,
    });

    fw.terminate({ roots: ["/root"] });

    // Sourced from the registry *Message* column (DIAG-4 / Diagnostic message
    // anchors), not prose.
    const expectedMessage = registryMessage(
      REGISTRY,
      WATCHER_TERMINATED_CODE,
    ) as string;
    expect(expectedMessage).toBe(
      "theta watcher terminated; hot-reload halted until /reload",
    );

    // Exactly one note, delivered through the `theta-system-note` channel
    // (primary sink), carrying the registry-sourced message and the
    // `watcher-terminated` diagnostic — the delivery-failed fallback never
    // fires (the transient-toast route is never taken).
    expect(sent).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
    expect(emitDiagnostic).not.toHaveBeenCalled();
    expect(sent[0]?.content).toContain(expectedMessage);

    const details = sent[0]?.details as { diagnostics?: readonly Diagnostic[] };
    expect(details.diagnostics).toHaveLength(1);
    expect(details.diagnostics?.[0]?.code).toBe(WATCHER_TERMINATED_CODE);
    expect(details.diagnostics?.[0]?.code).toBe("theta/runtime/watcher-terminated");
    expect(details.diagnostics?.[0]?.message).toBe(expectedMessage);
  });
});

// ---------------------------------------------------------------------------
// bug 0018 (PIC-67) — terminal signal on an invalidated runtime.
// ---------------------------------------------------------------------------

describe("bug 0018 (PIC-67) — terminal signal on an invalidated runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Byte-exact host stale-ctx message (see tests/system-note-channel.test.ts). */
  const HOST_STALE_MESSAGE =
    "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";

  function staleChannel(): {
    readonly channel: SystemNoteChannelDeps;
    readonly notify: ReturnType<typeof vi.fn>;
  } {
    const pi: SystemNoteSender = {
      sendMessage(): void {
        throw new Error(HOST_STALE_MESSAGE);
      },
    };
    const notify = vi.fn<UiNotifier["notify"]>();
    return {
      channel: { pi, ui: { notify }, emitDiagnostic: vi.fn() },
      notify,
    };
  }

  function stderrLines(spyCalls: unknown[][]): {
    quiesce: string[];
    cascades: string[];
  } {
    const firsts = spyCalls
      .map((args) => args[0])
      .filter((first): first is string => typeof first === "string");
    return {
      quiesce: firsts.filter((line) =>
        line.startsWith(STALE_QUIESCE_STDERR_PREFIX),
      ),
      cascades: firsts.filter((line) =>
        line.startsWith("system-note delivery failed:"),
      ),
    };
  }

  it("PIC-67: a stale watcher-terminated note delivery is swallowed (no throw into the seam), the watcher stays torn down, and exactly one latched quiesce line lands on stderr", () => {
    const calls: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
      calls.push(args);
    });
    const registry = new ThetaRegistry();
    const { channel, notify } = staleChannel();
    const fw = new FakeFileWatcher();
    const changes: FileWatchEvent[] = [];

    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: (event) => changes.push(event),
      registry,
      channel,
    });

    // The terminal signal must not throw into the FileWatcher seam's dispatch.
    expect(() => fw.terminate({ roots: ["/root"] })).not.toThrow();

    // Torn down: a later change no longer reaches the handler.
    fw.emit({ kind: "change", path: "/root/greet.theta" });
    expect(changes).toEqual([]);

    // The equally-stale fallback arm was never re-entered.
    expect(notify).not.toHaveBeenCalled();

    // Fail-loud-once: exactly one designed quiesce line, never the PIC-54
    // cascade prefix (the disease bug 0018 fixed).
    const { quiesce, cascades } = stderrLines(calls);
    expect(quiesce, "one designed stderr line on the stale terminal arm").toHaveLength(1);
    expect(cascades, "never a delivery-failed cascade for the stale case").toEqual([]);
  });

  it("PIC-67: a throwing console.error at the quiesce line is swallowed — the stale terminal arm still does not throw into the seam's terminate dispatch", () => {
    // Defended last-resort sink (the PIC-24/PIC-27/PIC-54 invariant family):
    // closed stdio, fd exhaustion, or a console-proxying host makes the
    // stderr write itself throw. Unwrapped, that throw would escape the
    // onTerminate callback into the watcher seam's terminate dispatch
    // (production: chokidar's error-event dispatch — an uncaught exception).
    vi.spyOn(console, "error").mockImplementation((): void => {
      throw new Error("stderr closed");
    });
    const { channel } = staleChannel();
    const fw = new FakeFileWatcher();
    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: () => {},
      registry: new ThetaRegistry(),
      channel,
    });

    expect(() => fw.terminate({ roots: ["/root"] })).not.toThrow();
  });

  it("PIC-67: an installer-shared StaleQuiesceLog that already logged suppresses the terminal arm's line (at most one per extension instance)", () => {
    const calls: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
      calls.push(args);
    });
    const shared = new StaleQuiesceLog();
    shared.log("reload-pass quiesce fired first (simulated)");
    expect(stderrLines(calls).quiesce).toHaveLength(1);

    const { channel } = staleChannel();
    const fw = new FakeFileWatcher();
    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: () => {},
      registry: new ThetaRegistry(),
      channel,
      staleLog: shared,
    });

    expect(() => fw.terminate({ roots: ["/root"] })).not.toThrow();

    // The shared latch already fired: the terminal arm adds no second line.
    expect(
      stderrLines(calls).quiesce,
      "the shared latch bounds the whole instance to one line",
    ).toHaveLength(1);
  });
});
