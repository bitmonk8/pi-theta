// RFC 0015 (D6) — supersession. Decision 4: the run card supersedes BOTH the
// RFC 0010 footer sink and widget sink in TUI — nothing pinned below the
// editor; the scroll-away gap is ACCEPTED; `/theta-status` and non-TUI
// surfaces unaffected. Decision 5: the `Running /<name>` binder echo is
// hidden in TUI entirely (message renderer returning a zero-output component
// — undefined would fall through to the host's default rendering) while its
// channel emission — LLM context and print/json bytes — stays byte-identical.
//
// Spec: docs/spec_topics/pi-integration-contract/theta-run-entries.md
// (PIC-77); docs/spec_topics/execution-status.md EXST-8.
//
// TIER: unit + composition-level, offline, deterministic, provider-free.

import { afterAll, describe, expect, it } from "vitest";
import type { Component } from "@earendil-works/pi-tui";
import type { ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import {
  createSystemNoteRenderer,
  isRunningEchoNote,
} from "../src/extension/system-note-renderer";
import {
  sendSystemNote,
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import { FakeClock } from "./helpers/fake-clock";
import {
  bootComposedHost,
  disposeWorkspace,
  plantThetaWorkspace,
  theta,
} from "./helpers/production-load-harness";

const OPTS = { expanded: false } as never;
const THEME = {} as never;

// ---------------------------------------------------------------------------
// Decision 5 — the `Running /<name>` note-class discriminator.
// ---------------------------------------------------------------------------

describe("D6 — decision 5: isRunningEchoNote discriminator", () => {
  it("matches the binder echo shape: `Running /` prefix + details-ABSENT", () => {
    expect(isRunningEchoNote("Running /code-review: topic=async", undefined)).toBe(true);
  });

  it("does NOT match a details-carrying note whose free text opens with the prefix (a five-shape note is never the echo class)", () => {
    expect(
      isRunningEchoNote("Running /code-review: topic=async", { diagnostics: [] }),
    ).toBe(false);
  });

  it("does NOT match the other informational templates (they open `theta …`, never `Running /`)", () => {
    for (const content of [
      "theta /demo returned Err: transport: boom",
      "theta /demo cancelled",
      "theta /demo aborted: kaboom",
      "theta: dispatch refused — extension draining",
    ]) {
      expect(isRunningEchoNote(content, undefined), content).toBe(false);
    }
  });
});

describe("D6 — decision 5: the TUI message renderer hides ONLY the Running echo", () => {
  const renderer = createSystemNoteRenderer();

  it("a Running echo note (display:true, details absent) renders as a ZERO-OUTPUT component — never undefined (the host falls through a falsy return to its default purple box)", () => {
    const component = renderer(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: "Running /code-review: topic=async, audience=team",
        display: true,
      } as never,
      OPTS,
      THEME,
    );
    // The host-visible outcome: the renderer MUST hand back a truthy
    // component (pi's CustomMessageComponent.rebuild treats undefined as "no
    // custom rendering" and renders the default `[theta-system-note]` box),
    // and that component must draw zero lines at any width. This test REDS
    // on a revert to `return undefined`.
    expect(component).toBeDefined();
    expect((component as Component).render(200)).toEqual([]);
    expect((component as Component).render(1)).toEqual([]);
  });

  it("every OTHER note class keeps rendering: err note, cancelled, panic framing, diagnostics batch, binder failure", () => {
    const stillRendered: { content: string; details?: unknown }[] = [
      { content: "theta /demo returned Err: transport: boom" },
      { content: "theta /demo cancelled" },
      {
        content: "theta /demo aborted: kaboom",
        details: { diagnostics: [{ severity: "error", code: "theta/runtime/internal-error", message: "kaboom" }] },
      },
      {
        content: "a.theta:1:1: theta/parse/schema-case-mismatch: schema name must start with an uppercase letter",
        details: { diagnostics: [{ severity: "error", code: "theta/parse/schema-case-mismatch", message: "schema name must start with an uppercase letter" }] },
      },
      { content: "theta /demo: needs more information: topic" },
    ];
    for (const note of stillRendered) {
      const component = renderer(
        {
          customType: SYSTEM_NOTE_CHANNEL,
          content: note.content,
          display: true,
          ...(note.details !== undefined ? { details: note.details } : {}),
        } as never,
        OPTS,
        THEME,
      );
      expect(component, note.content).toBeDefined();
      const lines = (component as Component).render(200);
      // Non-zero rendered lines: distinguishes "still visible" from the
      // zero-output hide component the Running echo gets.
      expect(lines.length, note.content).toBeGreaterThan(0);
      expect(lines.join("\n")).toContain(note.content.split("\n")[0]!);
    }
  });

  it("a details-CARRYING note whose content opens `Running /` still renders (the hiding keys on the informational class, not the prefix alone)", () => {
    const component = renderer(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: "Running /x: weird",
        display: true,
        details: { diagnostics: [] },
      } as never,
      OPTS,
      THEME,
    );
    expect(component).toBeDefined();
    expect((component as Component).render(200).length).toBeGreaterThan(0);
  });
});

describe("D6 — decision 5: the channel emission is untouched (byte-identity)", () => {
  it("sendSystemNote still delivers the Running echo verbatim — content byte-identical, display:true, details-ABSENT on the wire (bug 0401 contract)", () => {
    // The hiding lives ONLY in the renderer; the send path (LLM context,
    // print/json observables, the live suite's note-channel assertions) is
    // byte-identical. `tests/e2e-s5-binder-echo-emission.test.ts` anchors the
    // same bytes end-to-end through the real binder; this is the unit pin
    // beside the renderer change.
    const sent: Record<string, unknown>[] = [];
    const deps: SystemNoteChannelDeps = {
      pi: {
        sendMessage: (message): void => {
          sent.push(message as unknown as Record<string, unknown>);
        },
      },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    };
    sendSystemNote(
      { content: "Running /code-review: topic=async, audience=team", display: true },
      deps,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      customType: SYSTEM_NOTE_CHANNEL,
      content: "Running /code-review: topic=async, audience=team",
      display: true,
    });
    expect("details" in sent[0]!).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Decision 4 — composition-level retirement witness. Mirrors the run-card
// suite's composeHost harness (real factory + real composition root over a
// planted workspace); the observable is the recording `ctx.ui`: after a full
// compose + dispatch, NO `setStatus` / `setWorkingMessage` call ever fires
// and `setWidget` never receives status-tree content — the only permitted
// touches are the run card's TUI-handle capture pair (a factory-overload
// component registered and removed under its own key).
// ---------------------------------------------------------------------------

interface UiCall {
  readonly member: "setStatus" | "setWorkingMessage" | "setWidget";
  readonly key?: string;
  readonly content?: unknown;
}

async function composeAndDispatch(options: {
  readonly cwd: string;
  readonly mode: "tui" | "print";
}): Promise<readonly UiCall[]> {
  const uiCalls: UiCall[] = [];
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    // Position-exact forwarding against BOTH production signatures (the D3
    // review's audit discipline): the factory hands (…, inProcessTools,
    // resultChannel, placementRegistration, runCardView); the composition
    // takes (…, inProcessTools, runCardView) with the channel/registration
    // riding overrides. `runCardView` MUST be forwarded here — it is what
    // arms the TUI-handle capture this suite pins (D5 residual 3).
    composeInstance: (
      composePi,
      composeCtx,
      ownRegisteredNames,
      entryChannel,
      latchStatusBus,
      inProcessTools,
      _resultChannel,
      _placementRegistration,
      runCardView,
    ) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }, undefined, ownRegisteredNames, entryChannel, latchStatusBus, inProcessTools, runCardView),
  };
  const host = await bootComposedHost({
    cwd: options.cwd,
    mode: options.mode,
    deps,
    ctxExtras: {
      // A ctx.ui EXPOSING all three retired-or-kept members, in BOTH modes: the
      // retirement must hold because the sinks are gone, not because a surface
      // happened to be absent (the pre-D6 composition presence-probed and would
      // have rendered against exactly this double).
      ui: {
        notify: (): void => {},
        setStatus: (key: string, _text: string | undefined): void => {
          uiCalls.push({ member: "setStatus", key });
        },
        setWorkingMessage: (_message?: string): void => {
          uiCalls.push({ member: "setWorkingMessage" });
        },
        setWidget: (key: string, content: unknown): void => {
          uiCalls.push({ member: "setWidget", key, content });
        },
      },
    },
  });
  await host.dispatch("demo", "");
  return uiCalls;
}

describe("D6 — decision 4: composition-level footer/widget retirement", () => {
  const workspace = plantThetaWorkspace(
    "theta-d6-supersession-",
    [{ stem: "demo", text: theta("---", "mode: prompt", "---", '"DONE"') }],
    "{}",
  );

  afterAll(() => {
    disposeWorkspace(workspace);
  });

  it("TUI: a full compose + drive never calls setStatus/setWorkingMessage, and setWidget carries only the run card's capture pair (no string[] status tree)", async () => {
    const calls = await composeAndDispatch({ cwd: workspace, mode: "tui" });
    expect(calls.filter((c) => c.member === "setStatus")).toEqual([]);
    expect(calls.filter((c) => c.member === "setWorkingMessage")).toEqual([]);
    const widgetCalls = calls.filter((c) => c.member === "setWidget");
    // The capture pair: one factory-overload registration + one removal,
    // under the capture's own key — never the retired widget sink's "theta"
    // key, never string[] tree content (D5 residual 3: the capture SURVIVES
    // the retirement).
    expect(widgetCalls.length).toBe(2);
    for (const call of widgetCalls) {
      expect(call.key).toBe("theta-run-card-tui-capture");
      expect(Array.isArray(call.content)).toBe(false);
    }
    expect(typeof widgetCalls[0]!.content).toBe("function");
    expect(widgetCalls[1]!.content).toBeUndefined();
  });

  it("print: the same compose + drive touches NO ui status surface at all (even though the divergent host exposes them)", async () => {
    const calls = await composeAndDispatch({ cwd: workspace, mode: "print" });
    expect(calls).toEqual([]);
  });
});
