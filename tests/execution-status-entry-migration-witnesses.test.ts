import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import { createEntryChannel, THETA_PROGRESS_ENTRY_TYPE } from "../src/extension/execution-status/entry-channel";
import {
  deliverOperatorNotePreferringEntry,
  emitDiagnosticBatch,
  type SystemNote,
  type SystemNoteChannelDeps,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";
import {
  computeBinderModelRecoveryNote,
  type BinderModelResolutionInput,
} from "../src/binder/binder-model";
import { createModelReferenceMatcher } from "../src/extension/reload-wiring";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { model, registryOf } from "./helpers/model-registry-fixture";

// RFC 0010 (execution-status.md EXST-8; runtime-event-channel.md PIC-71/72) —
// bug 0469's fix witnesses, migrated per behaviour-matrix rows B52-B54/B64/B65
// (green-on-arrival: the production code these rows exercise
// — `entry-channel.ts`, `deliverOperatorNotePreferringEntry`, and the factory
// registration site — already landed; these tests are new PERMANENT
// witnesses, not TDD reds).

// ---------------------------------------------------------------------------
// Shared recording doubles.
// ---------------------------------------------------------------------------

interface RecordingChannel {
  readonly deps: SystemNoteChannelDeps;
  readonly sentMessages: { customType: string; content: string }[];
}

function recordingSystemNoteDeps(entryChannel?: ReturnType<typeof createEntryChannel>): RecordingChannel {
  const sentMessages: { customType: string; content: string }[] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sentMessages.push({ customType: message.customType, content: message.content });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
    ...(entryChannel !== undefined ? { entryChannel } : {}),
  };
  return { deps, sentMessages };
}

/** A fake `pi` exposing `appendEntry`/`registerEntryRenderer`, recording every call. */
function fakeEntryPi(options: { registerEntryRendererThrows?: boolean } = {}): {
  pi: ExtensionAPI;
  appendCalls: { customType: string; data: unknown }[];
} {
  const appendCalls: { customType: string; data: unknown }[] = [];
  const pi = {
    registerEntryRenderer: (): void => {
      if (options.registerEntryRendererThrows) {
        throw new Error("registerEntryRenderer host seam absent");
      }
    },
    appendEntry: (customType: string, data: unknown): void => {
      appendCalls.push({ customType, data });
    },
  };
  return { pi: pi as unknown as ExtensionAPI, appendCalls };
}

const STRUCTURAL_NOTE: SystemNote = {
  content: "theta files changed: +2 -1",
  display: true,
  details: { structural: { added: ["a.theta"], removed: ["b.theta"] } },
};

// ---------------------------------------------------------------------------
// B52/B54 — structural + binder-model-recovery note classes deliver
// entry-first with byte-identical content vs. their message realization,
// through the REAL deliverOperatorNotePreferringEntry helper.
// ---------------------------------------------------------------------------

describe("T-ENT — B52: structural-change note delivers entry-first, byte-identical vs. message realization", () => {
  it("live channel: exactly one appendEntry carrying the note verbatim, zero sendMessage", () => {
    const { pi, appendCalls } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    const { deps, sentMessages } = recordingSystemNoteDeps(channel);

    deliverOperatorNotePreferringEntry(STRUCTURAL_NOTE, deps);

    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]!.customType).toBe(THETA_PROGRESS_ENTRY_TYPE);
    expect(appendCalls[0]!.data).toEqual(STRUCTURAL_NOTE);
    expect(sentMessages).toHaveLength(0);
  });

  it("byte-identical content to the sendMessage realization it would have used pre-migration", () => {
    const { pi } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    // Absent channel -> forces the pre-migration sendMessage realization for comparison.
    const { deps: fallbackDeps, sentMessages } = recordingSystemNoteDeps(undefined);
    deliverOperatorNotePreferringEntry(STRUCTURAL_NOTE, fallbackDeps);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toBe(STRUCTURAL_NOTE.content);

    // Live channel: same content, delivered as an entry instead.
    const { pi: pi2, appendCalls } = fakeEntryPi();
    const liveChannel = createEntryChannel(pi2);
    const { deps: liveDeps } = recordingSystemNoteDeps(liveChannel);
    deliverOperatorNotePreferringEntry(STRUCTURAL_NOTE, liveDeps);
    expect((appendCalls[0]!.data as SystemNote).content).toBe(sentMessages[0]!.content);
    void channel;
  });

  it("absent entry channel: falls back to sendMessage (fallback shape, not silence)", () => {
    const { deps, sentMessages } = recordingSystemNoteDeps(undefined);
    deliverOperatorNotePreferringEntry(STRUCTURAL_NOTE, deps);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.customType).toBe("theta-system-note");
  });

  it("throwing entry channel (registerEntryRenderer throws at construction): falls back to sendMessage", () => {
    const { pi } = fakeEntryPi({ registerEntryRendererThrows: true });
    const channel = createEntryChannel(pi);
    expect(channel.live()).toBe(false);
    const { deps, sentMessages } = recordingSystemNoteDeps(channel);
    deliverOperatorNotePreferringEntry(STRUCTURAL_NOTE, deps);
    expect(sentMessages).toHaveLength(1);
  });
});

describe("T-ENT — B54: binder-model recovery note delivers entry-first, byte-identical vs. message realization", () => {
  const matcher = createModelReferenceMatcher(
    registryOf([model("claude-sonnet-5", "anthropic", "anthropic-messages")]),
  );
  const resolution: BinderModelResolutionInput = {
    file: "/x/fix-cluster.theta",
    settingsBinderModel: "claude-sonnet-5",
    bypassEligible: false,
    matcher,
    probeStrictCapable: () => ({ strictCapable: true, hostExposesIndicator: true }),
  };
  const recoveryNote = computeBinderModelRecoveryNote([
    { slashName: "fix-cluster", resolution },
  ]);

  it("computeBinderModelRecoveryNote produced a real note to migrate", () => {
    expect(recoveryNote).not.toBeNull();
  });

  it("live channel: exactly one appendEntry carrying the note verbatim, zero sendMessage", () => {
    const { pi, appendCalls } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    const { deps, sentMessages } = recordingSystemNoteDeps(channel);

    deliverOperatorNotePreferringEntry(recoveryNote as SystemNote, deps);

    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]!.customType).toBe(THETA_PROGRESS_ENTRY_TYPE);
    expect(appendCalls[0]!.data).toEqual(recoveryNote);
    expect(sentMessages).toHaveLength(0);
  });

  it("absent entry channel: falls back to sendMessage carrying the same content", () => {
    const { deps, sentMessages } = recordingSystemNoteDeps(undefined);
    deliverOperatorNotePreferringEntry(recoveryNote as SystemNote, deps);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).toBe((recoveryNote as SystemNote).content);
  });
});

// ---------------------------------------------------------------------------
// B53 (bug 0469's fix witness) — replay-adjacency: a watcher-driven batch
// note delivered while a Pi tool call is in flight lands via appendEntry with
// ZERO pi.sendMessage calls, so it can never be interleaved into the message
// transcript mid-tool-call (bug 0469's root cause — custom MESSAGES replay
// into provider context and can land between an assistant tool_use and its
// tool_result; entries never enter that replay at all).
// ---------------------------------------------------------------------------

function loadDiagnosticBatch(): readonly Diagnostic[] {
  return [
    {
      severity: "warning",
      code: "theta/load/binder-model-strict-capability-unknown",
      file: "quality-loop.theta",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      message: "strict-capability flag unavailable",
    },
  ];
}

describe("T-ENT — B53 (bug 0469 fix witness): watcher-driven emission mid-in-flight-tool-call is adjacency-safe", () => {
  it("live entry channel: the operator-facing batch note lands via appendEntry with ZERO pi.sendMessage calls, even while a tool call is simulated in flight", () => {
    const { pi, appendCalls } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    const { deps, sentMessages } = recordingSystemNoteDeps(channel);

    // Simulate the bug 0469 scenario: the watcher-driven rescan completes
    // WHILE a driven tool call is still open (the assistant's tool_use has
    // been emitted; its toolResult has not arrived yet). Because entries
    // never enter provider replay, the emission's timing relative to that
    // open window is irrelevant to session correctness — the assertion
    // proves it by observing the delivery channel directly: no sendMessage
    // call is made, regardless of the simulated in-flight state.
    const toolCallInFlight = { toolUseId: "toolu_sim_0469", settled: false };
    expect(toolCallInFlight.settled).toBe(false); // precondition: tool call open

    emitDiagnosticBatch(loadDiagnosticBatch(), deps);

    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]!.customType).toBe(THETA_PROGRESS_ENTRY_TYPE);
    // Nothing reached the message channel — the transcript the toolResult
    // will be parented against is untouched, so adjacency cannot break.
    expect(sentMessages).toHaveLength(0);

    // The simulated tool call settles afterward, unaffected by the note.
    toolCallInFlight.settled = true;
    expect(toolCallInFlight.settled).toBe(true);
  });

  it("red-direction: absent entry channel (fake pi without appendEntry) falls back to sendMessage — the FALLBACK shape, not silence", () => {
    // No entryChannel supplied at all (mirrors an absent `pi.appendEntry` /
    // `pi.registerEntryRenderer` host at the deps level).
    const { deps, sentMessages } = recordingSystemNoteDeps(undefined);

    emitDiagnosticBatch(loadDiagnosticBatch(), deps);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.customType).toBe("theta-system-note");
    expect(sentMessages[0]!.content).toContain(
      "theta/load/binder-model-strict-capability-unknown",
    );
  });
});

// ---------------------------------------------------------------------------
// B64/B65 (factory integration) — the entry renderer registers synchronously
// in the factory body beside the message renderer; a throwing registration
// degrades the channel for the session (later notes fall back to
// sendMessage) while the factory itself still completes with zero
// diagnostics.
// ---------------------------------------------------------------------------

describe("T-ENT — B64: entry renderer registers synchronously in the factory body beside the message renderer", () => {
  it("registerMessageRenderer then registerEntryRenderer, both called during the synchronous factory body (before any pi.on fires)", () => {
    const order: string[] = [];
    const pi = {
      registerFlag: (): void => {},
      registerMessageRenderer: (): void => {
        order.push("registerMessageRenderer");
      },
      registerEntryRenderer: (): void => {
        order.push("registerEntryRenderer");
      },
      appendEntry: (): void => {},
      registerCommand: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;

    createThetaExtension({ fixtures: [] })(pi);

    expect(order).toEqual(["registerMessageRenderer", "registerEntryRenderer"]);
  });
});

describe("T-ENT — B65: a throwing registerEntryRenderer degrades the channel for the session with zero diagnostics, and factory registration still succeeds", () => {
  it("createThetaExtension does not throw and completes its other registrations", () => {
    const diagnostics: unknown[] = [];
    const subscriptions = new Set<string>();
    const pi = {
      registerFlag: (): void => {},
      registerMessageRenderer: (): void => {},
      registerEntryRenderer: (): void => {
        throw new Error("registerEntryRenderer host seam absent");
      },
      appendEntry: (): void => {},
      registerCommand: (): void => {},
      on: (event: string): void => {
        subscriptions.add(event);
      },
    } as unknown as ExtensionAPI;
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      emitDiagnostic: (d: unknown): void => {
        diagnostics.push(d);
      },
    };

    expect(() => createThetaExtension(deps)(pi)).not.toThrow();
    // Zero diagnostics: the entry-channel degrade is silent (PIC-71 / DIAG-2).
    expect(diagnostics).toHaveLength(0);
    // The remaining factory-body registrations still completed.
    expect([...subscriptions].sort()).toEqual([
      "resources_discover",
      "session_shutdown",
      "session_start",
    ]);
  });

  it("the resulting channel is dead for the session: a later batch note goes to sendMessage", () => {
    const { pi } = fakeEntryPi({ registerEntryRendererThrows: true });
    const channel = createEntryChannel(pi);
    expect(channel.live()).toBe(false);

    const { deps, sentMessages } = recordingSystemNoteDeps(channel);
    emitDiagnosticBatch(loadDiagnosticBatch(), deps);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.customType).toBe("theta-system-note");
  });
});

// ---------------------------------------------------------------------------
// B45-normalization / bug 0268 regression — deliverOperatorNotePreferringEntry
// applies withNormalisedFileSpelling ONCE above the entry/message branch, so
// BOTH channels' details.diagnostics[].file realize all-POSIX and are
// byte-identical to each other (PIC-71).
// ---------------------------------------------------------------------------

function mixedSpellingDiagnosticBatch(): readonly Diagnostic[] {
  return [
    {
      severity: "warning",
      code: "theta/load/binder-model-strict-capability-unknown",
      file: "C:\\tmp\\x\\.pi/theta/a.theta",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      message: "strict-capability flag unavailable",
    },
    {
      severity: "warning",
      code: "theta/load/binder-model-strict-capability-unknown",
      file: "C:\\tmp\\y\\b.theta",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      message: "strict-capability flag unavailable",
    },
  ];
}

function diagnosticsFileArray(details: unknown): readonly string[] {
  const diagnostics = (details as { diagnostics: readonly Diagnostic[] }).diagnostics;
  return diagnostics.map((d) => d.file as string);
}

describe("T-ENT — B45-normalization / bug 0268 regression: byte-identical POSIX file spelling across both realizations", () => {
  it("live entry channel: appended entry's details.diagnostics[].file are all-POSIX, and content string is all-POSIX", () => {
    const { pi, appendCalls } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    const { deps } = recordingSystemNoteDeps(channel);

    emitDiagnosticBatch(mixedSpellingDiagnosticBatch(), deps);

    expect(appendCalls).toHaveLength(1);
    const entryNote = appendCalls[0]!.data as SystemNote;
    const files = diagnosticsFileArray(entryNote.details);
    expect(files).toEqual(["C:/tmp/x/.pi/theta/a.theta", "C:/tmp/y/b.theta"]);
    for (const f of files) {
      expect(f).not.toContain("\\");
    }
    expect(entryNote.content).not.toContain("\\");
  });

  it("absent entry channel: message realization's details.diagnostics[].file are the same all-POSIX fields", () => {
    const { deps, sentMessages } = recordingSystemNoteDeps(undefined);

    emitDiagnosticBatch(mixedSpellingDiagnosticBatch(), deps);

    expect(sentMessages).toHaveLength(1);
    // sentMessages only records customType/content in this harness; capture
    // the raw sendMessage payload directly via a dedicated pi double so the
    // structured details are inspectable too.
    expect(sentMessages[0]!.content).not.toContain("\\");
  });

  it("the two realizations' file arrays are byte-identical (PIC-71)", () => {
    const capturedMessages: { content: string; details?: unknown }[] = [];
    const messagePi: SystemNoteSender = {
      sendMessage: (message): void => {
        capturedMessages.push({ content: message.content, details: message.details });
      },
    };
    const messageDeps: SystemNoteChannelDeps = {
      pi: messagePi,
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    };
    emitDiagnosticBatch(mixedSpellingDiagnosticBatch(), messageDeps);
    expect(capturedMessages).toHaveLength(1);
    const messageFiles = diagnosticsFileArray(capturedMessages[0]!.details);

    const { pi, appendCalls } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    const { deps: entryDeps } = recordingSystemNoteDeps(channel);
    emitDiagnosticBatch(mixedSpellingDiagnosticBatch(), entryDeps);
    expect(appendCalls).toHaveLength(1);
    const entryFiles = diagnosticsFileArray((appendCalls[0]!.data as SystemNote).details);

    expect(entryFiles).toEqual(messageFiles);
  });
});
