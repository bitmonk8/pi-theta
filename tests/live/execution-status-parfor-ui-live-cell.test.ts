// RFC 0010 (Phase 6, H8a, live) — layer-gate L0: a REAL live drive of a
// `par for` theta shows lane transitions through the execution-status
// machinery (§7's "design §7 / L0" cell), witnessed via an INJECTED UI
// double riding the real `ExtensionRunner.setUIContext` seam — never the real
// TUI.
//
// INJECTION POINT (chosen after reading `production-composition.ts`'s
// EXST-2/PIC-73 wiring): the composition root reads `ctx.ui.setStatus` /
// `ctx.ui.setWorkingMessage` / `ctx.ui.setWidget` IN PLACE, at every publish
// tick, off whatever `ExtensionContext.ui` the host currently exposes — it
// never captures a local binding (see the "ctx.ui is read IN PLACE" comment
// beside the sink construction). `bootShippedExtension`'s `AgentSession` has
// no attached TUI, so `ExtensionRunner`'s own `uiContext` defaults to its
// internal no-op object (`hasUI() === false`) — every one of `setStatus` /
// `setWorkingMessage` / `setWidget` is a real, callable no-op function, so
// PIC-73's per-surface presence probe (`typeof … === "function"`) passes and
// both sinks get constructed, but nothing is retained to observe. The public,
// real, non-`src/**` seam a genuine host uses to attach ITS UI is
// `ExtensionRunner.setUIContext(uiContext, mode)` (`session.extensionRunner`,
// exposed by the harness as `handle.runner`) — calling it BEFORE driving the
// theta swaps in a recording double the same way a real interactive/print
// host swaps in its own. This is strictly less invasive than reaching into
// `production-composition.ts`'s internal `latchStatusBus` closure (which is
// not threaded through the shipped `extensions/index.ts` entry at all) and
// strictly more real than asserting on the bus directly (the bus is
// `src/**`-internal and not exported for test use at this boundary) — it
// exercises the EXACT same `ExtensionContext.ui` surface production code
// reads, through the EXACT same public attach point a real host uses.
//
// FIXTURE TOPOLOGY: `parforuicaller.theta` (`mode: prompt`) runs ONE `par for`
// over `[1, 2, 3]` with `max 2` (CTRL-2 width throttle), each iteration
// `invoke`-ing `parforuilane.theta` (`mode: subagent`) — CTRL-4 forbids an
// `@`-query directly inside a `par for` body, so each lane's one small model
// turn lives in its own subagent callee, exactly as the RFC-0009 cwd-clause
// cell and the bug-0146 live cell both invoke a `mode: subagent` callee to
// reach a real model turn from inside a driven parent. Each lane's query
// varies by its own loop-bound `n` (`100+n plus 1`) — a task-framed,
// fixed-pair-arithmetic discriminator per AGENTS.md (never a verbatim-echo
// demand), proving each lane reached a REAL, distinct model turn rather than
// three identical no-op dispatches. The caller issues no top-level `@`-query
// of its own, so `session.prompt()` awaits the theta interpreter's own
// synchronous execution of the `par for` (a plain code-side construct, unlike
// an `@`-query's `pi.sendUserMessage` fire-and-forget dispatch) straight
// through to completion — `driveSlashCaptureTurn`'s post-await settle-poll
// then sees no user-role entry at all and returns immediately.
//
// TOKEN BUDGET: exactly 3 small model turns (one per lane; `max 2` bounds
// concurrency to 2 in flight, so it is 2 turns then 1, not 3 at once),
// matching the precedent cell's ~15-20s wall-time profile.
//
// SUBAGENT CHILD PINS: required — `invoke(...)` against the `mode: subagent`
// callee reaches the RFC-0006 child-process launch. `./harness` sets both
// #subagent-child-pins (the real pi CLI entry at `process.argv[1]` and
// `PI_THETA_SUBAGENT_EXTENSION_PIN` at this tree's `extensions/`, with the
// authenticated parent-pid carriage) at module scope, inherited by importing
// it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

/** One recorded call to the injected UI double, timestamped for the
 *  before/after-completion ordering assertions below. */
interface RecordedCall {
  readonly ts: number;
  readonly kind: "setStatus" | "setWorkingMessage" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}

/**
 * A recording `ExtensionUIContext` double. Only `setStatus` / `setWidget` /
 * `setWorkingMessage` — the three members the footer (L0) and widget (L2)
 * `StatusSink`s touch (`footer-sink.ts` `FooterUi`, `widget-sink.ts`
 * `WidgetUi`) — are wired to record; every other member is a harmless no-op
 * mirroring the runner's own built-in no-op UI context, since nothing this
 * cell drives (a `mode: prompt` theta with no dialog/editor/theme surface)
 * ever calls them.
 */
function createRecordingUi(): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ ts: Date.now(), kind: "setStatus", text, lines: undefined });
    },
    setWorkingMessage: (message?: string) => {
      calls.push({ ts: Date.now(), kind: "setWorkingMessage", text: message, lines: undefined });
    },
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: (_key: string, content: unknown, _options?: unknown) => {
      calls.push({
        ts: Date.now(),
        kind: "setWidget",
        text: undefined,
        lines: Array.isArray(content) ? (content as readonly string[]) : undefined,
      });
    },
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async <T>() => undefined as unknown as T,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    theme: {} as ExtensionUIContext["theme"],
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: true }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  } as unknown as ExtensionUIContext;
  return { calls, ui };
}

/** The subagent-mode lane callee: one tiny, lane-distinguishing model turn. */
const LANE_CALLEE = [
  "---",
  "mode: subagent",
  "params:",
  "  n: integer",
  "---",
  "@`What is ${100 + n} plus 1? Answer with the number only.`",
  "",
].join("\n");

/** The `par for` caller: no top-level `@`-query of its own (CTRL-4 forbids one
 *  inside the body; the caller issues none outside it either, so
 *  `session.prompt()` awaits the whole synchronous `par for` to completion). */
const PARFOR_CALLER = [
  "---",
  "mode: prompt",
  "---",
  'par for n in [1, 2, 3] max 2 { invoke("./parforuilane.theta", n) }',
  "",
].join("\n");

const CALLER_STEM = "parforuicaller";

/** A rendered fragment carries a POSITIVE running-lane count (`N▶`, N ≥ 1). */
function hasPositiveRunningLanes(text: string): boolean {
  return /(?:^|\s)[1-9]\d*▶/.test(text);
}

/** Poll bound for the post-drive completion settle (DONE_LINGER_MS=2000 +
 *  STATUS_TICK_MS=200 margin, `execution-status/types.ts`). */
const COMPLETION_POLL_BOUND = 40;
const COMPLETION_POLL_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RFC 0010 (H8a, live, L0) — a real `par for` drive shows lane transitions through the injected UI double", () => {
  it("footer setStatus and widget setWidget render `par for` lane evidence during the drive, then settle to no running lanes, with a clean Ok note channel and no chat-side progress leakage", async () => {
    const provider = await requireLiveProvider();

    const workspace = plantThetaWorkspace([
      { source: "project", stem: "parforuilane", text: LANE_CALLEE },
      { source: "project", stem: CALLER_STEM, text: PARFOR_CALLER },
    ]);

    const handle = await bootShippedExtension({ workspace, provider });
    const { calls, ui } = createRecordingUi();
    try {
      if (handle.command(CALLER_STEM) === undefined) {
        failLoudly(
          `no ${CALLER_STEM} command to invoke — the \`par for\` caller failed ` +
            "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        );
      }

      // Attach the recording UI double BEFORE driving — the same public seam
      // a real host uses to attach its own TUI/RPC/print UI implementation.
      handle.runner.setUIContext(ui, "print");

      const driveStartMs = Date.now();
      const turn = await driveSlashCaptureTurn(handle, `/${CALLER_STEM}`);
      const driveEndMs = Date.now();

      // (4) The drive returned Ok — no fail-closed ending landed on the
      // theta-system-note channel (AGENTS.md: absence IS the success
      // observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        new RegExp(`^theta /${CALLER_STEM} (returned Err|cancelled|aborted)`).test(n),
      );
      expect(
        failureNotes,
        "the par-for drive surfaced fail-closed system note(s) instead of completing: " +
          JSON.stringify(failureNotes),
      ).toEqual([]);

      // (1) Time-to-first-signal witness: at least one footer setStatus
      // render occurred DURING the drive (strictly between start and end)
      // naming the fixture theta's basename.
      const duringDriveStatusCalls = calls.filter(
        (c) =>
          c.kind === "setStatus" &&
          c.ts >= driveStartMs &&
          c.ts <= driveEndMs &&
          typeof c.text === "string" &&
          c.text.includes(CALLER_STEM),
      );
      expect(
        duringDriveStatusCalls.length > 0,
        `no setStatus render during the drive named ${JSON.stringify(CALLER_STEM)} — the ` +
          "footer sink never witnessed the running invocation. All setStatus calls: " +
          JSON.stringify(calls.filter((c) => c.kind === "setStatus")),
      ).toBe(true);

      // (2) `par for` lane evidence on BOTH landed templates: the widget's
      // literal `par for <claimed>/<total>` lane-summary line
      // (`widget-sink.ts` renderStatusTree) and the footer's `lanes N▶`
      // kids segment (`footer-sink.ts` renderKidsSegment).
      const widgetCalls = calls.filter((c) => c.kind === "setWidget" && c.lines !== undefined);
      const parForWidgetLine = widgetCalls.some((c) =>
        (c.lines ?? []).some((line) => /par for \d+\/3/.test(line)),
      );
      expect(
        parForWidgetLine,
        "no setWidget render carried a `par for <claimed>/3` lane-summary line. Widget " +
          "calls: " + JSON.stringify(widgetCalls),
      ).toBe(true);
      const statusCalls = calls.filter((c) => c.kind === "setStatus");
      const lanesFooterLine = statusCalls.some(
        (c) => typeof c.text === "string" && /lanes \d+▶/.test(c.text),
      );
      expect(
        lanesFooterLine,
        "no setStatus render carried a `lanes N▶` kids segment. setStatus calls: " +
          JSON.stringify(statusCalls),
      ).toBe(true);

      // (3) Completion: poll until a render (setStatus or setWidget) reflects
      // no running lanes, or the theta-status-sized settle bound expires.
      let settled = false;
      for (let attempt = 0; attempt < COMPLETION_POLL_BOUND; attempt++) {
        const lastStatus = [...calls].reverse().find((c) => c.kind === "setStatus");
        const lastWidget = [...calls].reverse().find((c) => c.kind === "setWidget");
        const statusClean =
          lastStatus === undefined ||
          lastStatus.text === undefined ||
          !hasPositiveRunningLanes(lastStatus.text);
        const widgetClean =
          lastWidget === undefined ||
          lastWidget.lines === undefined ||
          !lastWidget.lines.some((line) => hasPositiveRunningLanes(line));
        if (statusClean && widgetClean) {
          settled = true;
          break;
        }
        await sleep(COMPLETION_POLL_INTERVAL_MS);
      }
      expect(
        settled,
        "no final render settled to zero running lanes within the completion poll bound. " +
          "Last calls: " + JSON.stringify(calls.slice(-6)),
      ).toBe(true);

      // (5) Zero `pi.sendMessage`-class progress traffic: no chat-role
      // (user/assistant) transcript entry carries an execution-status
      // fragment — every legitimate progress emission went through
      // `ui.*` (recorded above) or the PIC-71 entry channel, never the chat
      // transcript.
      const entries = handle.sessionManager.getEntries() as readonly unknown[];
      const chatTextsWithProgressLeakage: string[] = [];
      for (const entry of entries) {
        const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
        if (e.type !== "message") continue;
        if (e.message?.role !== "user" && e.message?.role !== "assistant") continue;
        const content = e.message?.content;
        const texts: string[] =
          typeof content === "string"
            ? [content]
            : Array.isArray(content)
              ? (content as readonly unknown[])
                  .map((p) => (p as { text?: string }).text)
                  .filter((t): t is string => typeof t === "string")
              : [];
        for (const t of texts) {
          if (t.includes("par for") || t.includes(`θ /${CALLER_STEM}`)) {
            chatTextsWithProgressLeakage.push(t);
          }
        }
      }
      expect(
        chatTextsWithProgressLeakage,
        "an execution-status fragment leaked into the chat transcript instead of riding " +
          "ui.*/the entry channel: " + JSON.stringify(chatTextsWithProgressLeakage),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 60_000);
});
