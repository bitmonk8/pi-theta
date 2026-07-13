import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createLoomExtension,
  type LoomExtensionDeps,
} from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// V4e (production wiring) — load-phase pre-evaluation failure note-routing.
//
// Mirrors the wired RELOAD-path note tests in
// tests/watcher-hot-reload-integration.test.ts, but for the LOAD phase: boots
// the SHIPPED composition (`composeExtensionInstance`) through the real
// extension factory (`createLoomExtension`) over a real temp-dir workspace and
// asserts that a load-phase FAILURE surfaces one `loom-system-note` on the
// channel with `triggerTurn:false` (the ERR-1…ERR-6/ERR-16 pre-eval surface),
// while a clean load emits NO error note and `session_start` is never aborted.
//
// Spec: errors-and-results/error-model.md — every pre-evaluation failure
// "surfaces per Diagnostics on the loom-system-note channel, does not fire a
// new turn (triggerTurn:false) and produces no final value". Previously the
// shipped LOAD path surfaced load errors via a transient `ctx.ui.notify` toast
// (notes.md "known load-phase routing gap"), inconsistent with the RELOAD path.

const GOOD_LOOM = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);
// A load FAILURE: `tools:` names a Pi tool absent from the threaded registry →
// `loom/load/unknown-tool` (an error-severity ERR-6 pre-eval failure). The loom
// is dropped (un-registered); the failure MUST route onto the note channel.
const BAD_LOOM = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");

/** A recorded `pi.sendMessage` call (the `loom-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] };
  readonly triggerTurn: unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly notifications: string[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
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
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: unknown;
      },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    // A recording toast so a regression back to the toast surface is observable.
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const deps: LoomExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }),
  };
  createLoomExtension(deps)(pi);

  return {
    pi,
    commands,
    notes,
    notifications,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

/** The error-severity load-phase notes routed onto the channel this pass. */
function loadErrorNotes(notes: readonly RecordedNote[]): RecordedNote[] {
  return notes.filter((n) =>
    (n.details.diagnostics ?? []).some((d) => d.severity === "error"),
  );
}

describe("V4e — load-phase pre-evaluation failures route onto the loom-system-note channel", () => {
  let workspace: string;
  let loomDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "loom-v4e-load-"));
    loomDir = join(workspace, ".pi", "looms");
    mkdirSync(loomDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("a load failure surfaces one loom-system-note (triggerTurn:false) and does not abort session_start", async () => {
    // A clean control loom AND a failing loom, so the assertion distinguishes
    // "routes the failure" from "drops everything".
    writeFileSync(join(loomDir, "goodtool.loom"), GOOD_LOOM, "utf8");
    writeFileSync(join(loomDir, "unknowntool.loom"), BAD_LOOM, "utf8");

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // session_start not aborted: the clean loom still registered.
    expect(harness.commands.has("goodtool")).toBe(true);
    // The failing loom was dropped (un-registered).
    expect(harness.commands.has("unknowntool")).toBe(false);

    // The load failure routed onto the `loom-system-note` channel with the
    // error-severity `loom/load/unknown-tool` diagnostic and triggerTurn:false —
    // the SAME envelope shape as the reload path's ERR-7 note.
    const errorNotes = loadErrorNotes(harness.notes);
    expect(errorNotes.length).toBeGreaterThanOrEqual(1);
    const note = errorNotes.find((n) =>
      (n.details.diagnostics ?? []).some(
        (d) => d.code === "loom/load/unknown-tool",
      ),
    );
    expect(note).toBeDefined();
    expect(note?.customType).toBe("loom-system-note");
    expect(note?.triggerTurn).toBe(false);

    // The failure routed onto the channel, NOT the transient toast (the closed
    // load-phase routing gap): no error reached `ctx.ui.notify`.
    expect(harness.notifications).toHaveLength(0);
  });

  it("a clean load emits no error note on the loom-system-note channel", async () => {
    writeFileSync(join(loomDir, "goodtool.loom"), GOOD_LOOM, "utf8");

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    expect(harness.commands.has("goodtool")).toBe(true);
    // Negative: a clean load produces no error-severity pre-eval note.
    expect(loadErrorNotes(harness.notes)).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
  });
});
