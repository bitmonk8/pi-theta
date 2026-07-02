import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  armWatcherWithTerminalRecovery,
  WATCHER_TERMINATED_CODE,
} from "../src/extension/watcher-recovery";
import {
  LoomRegistry,
  type ParsedLoom,
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

// V9q-T — failing tests for the paired `V9q` "Watcher post-error terminal
// recovery posture" implementation.
//
// Spec: pi-integration-contract/registration-steps.md (PIC-55),
// pi-integration-contract/host-interfaces-services.md (PIC-14 FileWatcher seam),
// diagnostics.md, diagnostics/code-registry-runtime.md
// (`loom/runtime/watcher-terminated`).
//
// The stopped-delivering — terminal case is driven deterministically through
// the V8e `FakeFileWatcher.terminate()` terminal-signal injection point, which
// mirrors the production chokidar adapter→runtime channel. On that signal the
// runtime MUST: leave the watcher torn down rather than re-armed; emit exactly
// ONE persistent `loom/runtime/watcher-terminated` `loom-system-note` prompting
// `/reload` through the `loom-system-note` channel as its primary sink (NEVER
// `ctx.ui.notify`); keep the `LoomRegistry` live and dispatchable through arm
// (a) of `readDrainState`; and write NO `LoomRegistry` drain-state tag.
//
// These tests red because the V9q terminal recovery posture is absent: the
// `armWatcherWithTerminalRecovery` seam wires an inert `onTerminate` callback,
// so the terminal signal emits no persistent note and tears nothing down. Each
// obligation test reds on its own primary assertion (the SUT effect), not on a
// compile error, a missing fixture, or a harness throw.
//
// Per the *Diagnostic message anchors* rule the expected message string is
// sourced from the diagnostics registry's *Message* column (via
// `registryMessage`) and the `loom/runtime/watcher-terminated` code is cited
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
const loom = (slashName: string): ParsedLoom => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});

/** A captured `pi.sendMessage` call for the `loom-system-note` channel. */
interface SentMessage {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: SystemNoteDetails;
}

/**
 * Build a `SystemNoteChannelDeps` whose `pi.sendMessage` succeeds and records
 * every sent message, so the primary-sink assertions observe the persistent
 * `loom-system-note` route and can prove `ctx.ui.notify` is never reached.
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
  it("PIC-55: a stopped-delivering terminal signal emits exactly one persistent watcher-terminated system note, leaves the watcher torn down, keeps LoomRegistry live and dispatchable, and writes no drain-state tag", () => {
    const registry = new LoomRegistry([["greet", loom("greet")]]);
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

    // Primary assertion — exactly one persistent `loom-system-note` is emitted
    // through the `loom-system-note` channel (its primary sink), never
    // `ctx.ui.notify`.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(sent[0]?.display).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    // Torn down rather than re-armed: the watcher is not re-armed (a single
    // `watch` call), and a subsequent change no longer reaches the handler.
    expect(watchSpy).toHaveBeenCalledTimes(1);
    fw.emit({ kind: "change", path: "/root/greet.loom" });
    expect(changes).toEqual([]);

    // `LoomRegistry` stays live and dispatchable through arm (a): no drain-state
    // tag is written, so `readDrainState` reports the steady-state tuple and the
    // published `/greet` entry still dispatches.
    const snapshot = registry.readDrainState();
    expect(snapshot).toEqual({ drained: false, tag: undefined });
    expect(routeDrainStateArm(snapshot)).toBe("dispatch");
    expect(resolveSlashDispatch("greet", snapshot, registry)).toEqual({
      kind: "dispatch",
      loom: loom("greet"),
    });
  });

  it("loom/runtime/watcher-terminated: the emitted note's rendered message is sourced from the registry Message column and routes through the loom-system-note channel as its primary sink", () => {
    const registry = new LoomRegistry();
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
      "loom watcher terminated; hot-reload halted until /reload",
    );

    // Exactly one note, delivered through the `loom-system-note` channel
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
    expect(details.diagnostics?.[0]?.code).toBe("loom/runtime/watcher-terminated");
    expect(details.diagnostics?.[0]?.message).toBe(expectedMessage);
  });
});
