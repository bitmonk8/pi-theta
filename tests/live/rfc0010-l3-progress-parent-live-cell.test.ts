// RFC 0010 (Phase 7d, H8a, live, L3) — the parent-regime `theta_progress`
// arm. Behaviour-matrix row L3-B35 (the pinned cell) plus a cheap
// model-call-direction bonus. Contract: `execute()`'s parent regime branch
// + the render grammar (EXST-14) + the milestone entry (PIC-71).
//
// PRECEDENTS MIRRORED: `execution-status-parfor-ui-live-cell.test.ts`'s
// `handle.runner.setUIContext(ui, "print")` injection point (the same public,
// real, non-`src/**` seam a genuine host uses to attach its UI, wired BEFORE
// the drive) and its recording-UI-double shape; `tests/live/harness.ts`'s
// `bootShippedExtension` / `driveSlashCaptureTurn` / `failLoudly` /
// `plantThetaWorkspace`. AGENTS.md live conventions: fail-loud precondition
// (`requireLiveProvider`), task-framed discriminators (fixed-pair arithmetic,
// never a verbatim-echo demand), the theta-system-note absence-is-success
// observable, and asserting real observables (the entry-channel milestone
// payload, the recorded UI double's rendered ✎ segment) rather than
// `resolves.toBeDefined()`.
//
// TWO CELLS, both PARENT regime (no subagent invoke, so no child-process
// launch and no #subagent-child-pins requirement here — unlike the wire
// cell's file, this one never reaches the RFC-0006 child-process boundary):
//
//   (1) CODE-SIDE call — the fixture's own code calls
//       `theta_progress({message: "phase one done"})` (a bare discard,
//       `let _ = … ?` per `bindings.md`'s discard-form convention — the tool
//       never returns `Err`, EXST-13), then issues ONE fixed-pair-arithmetic
//       `@`-query so the drive has a real turn to settle against and to
//       prove the theta reached execution past the progress call (a
//       task-framed discriminator: "What is 263 plus 514?", never a
//       verbatim-echo demand).
//   (2) MODEL SELF-REPORT — the query itself instructs the model to call
//       `theta_progress` once with a fixed message, `theta_progress` present
//       in the callee's `tools:` list (the model-driven tool-call loop,
//       PIC-64's model-facing reach). This is a cheap "ALSO" bonus: the
//       model can paraphrase or vary its own tool-call
//       argument, so this cell asserts only that a milestone entry LANDED,
//       not its exact text — unlike cell (1), whose code-side call argument is
//       deterministic and pinned exactly.
//
// BUDGET: cell (1) is one small model turn (the arithmetic query); cell (2)
// is a model-driven tool-call loop (tool_use + reply), both well inside the
// ≤4-tiny-turn budget.
//
// RED-DIRECTION PROOF (verified this pass, then restored): temporarily
// removed cell (1)'s `tools:\n  - theta_progress` entry from `CODE_SIDE_CALLER`
// (a `tools:`-omission proof — the theta code still calls `theta_progress`,
// but the callable set no longer admits it). Re-ran cell (1) alone: it reds
// at the harness's OWN discovery/parse precondition —
// `failLoudly("no l3progresscodeside command to invoke — the code-side caller
// failed discovery/parse. Registered: [\"theta-status\"]")` — zero live-model
// cost, since `theta/load/unknown-tool` refuses the theta before any turn
// drives. Restored the `tools:` entry, green again (including the live
// milestone/render assertions this cell exists to pin). This proves the
// milestone-entry and rendered-segment assertions genuinely depend on
// `theta_progress` being in the callable set, not on an incidental side
// effect of the theta merely existing.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

/** One recorded call to the injected UI double — mirrors the parfor-ui cell's
 *  `RecordedCall` shape exactly (only the three members footer (L0) and
 *  widget (L2)/class-2 sinks touch are wired to record). */
interface RecordedCall {
  readonly kind: "setStatus" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}

function createRecordingUi(): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ kind: "setStatus", text, lines: undefined });
    },
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: (_key: string, content: unknown, _options?: unknown) => {
      calls.push({
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

const AUTHOR_MESSAGE_GLYPH = "\u270E";

/** Whether any recorded call's text/lines carries the `✎ <needle>` segment. */
function anyCallCarries(calls: readonly RecordedCall[], needle: string): boolean {
  const fragment = `${AUTHOR_MESSAGE_GLYPH} ${needle}`;
  return calls.some(
    (c) =>
      (typeof c.text === "string" && c.text.includes(fragment)) ||
      (c.lines !== undefined && c.lines.some((l) => l.includes(fragment))),
  );
}

/** Poll bound for the render to catch up with a just-landed milestone
 *  (STATUS_TICK_MS=200ms per `execution-status/types.ts`, generous margin). */
const RENDER_POLL_BOUND = 30;
const RENDER_POLL_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A `type:"custom"` `theta-progress-entry` entry carrying a `milestone`
 *  payload, read off the settled in-memory `SessionManager` (PIC-71). */
function milestoneEntries(
  entries: readonly unknown[],
): readonly { readonly milestone: Record<string, unknown> }[] {
  const found: { readonly milestone: Record<string, unknown> }[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; customType?: string; data?: unknown };
    if (e.type !== "custom" || e.customType !== "theta-progress-entry") continue;
    const data = e.data as { milestone?: unknown } | undefined;
    if (data?.milestone !== undefined && typeof data.milestone === "object") {
      found.push({ milestone: data.milestone as Record<string, unknown> });
    }
  }
  return found;
}

/** The reserved marker prefixing the PIC-64 code-side extension-tool
 *  dispatch's fabricated request turn (`production-host-loop-dispatch.ts`'s
 *  `REQUEST_MARKER`) — the ACCEPTED, pre-existing fabricated-turn cost of
 *  ANY code-side extension-tool call in prompt mode (`docs/examples/
 *  prompt-extension-tool.theta`'s own header comment: "expect one
 *  fabricated user message plus a tool-call and a tool-result card"). This
 *  is PIC-64 scaffolding, not `theta_progress`'s own `sendMessage` reach
 *  (EXST-1 forbids the message channel for progress output outright) — the
 *  progress-leakage scan below excludes it so it scores the channel EXST-1
 *  actually governs, not the unrelated host-loop-dispatch encoding. */
const HOST_LOOP_REQUEST_MARKER = "THETA-HOST-LOOP-REQUEST:";

/** Chat-role (user/assistant) message text fragments from `entries`,
 *  excluding the PIC-64 fabricated-turn encoding (see
 *  `HOST_LOOP_REQUEST_MARKER` above). */
function chatTexts(entries: readonly unknown[]): readonly string[] {
  const texts: string[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
    if (e.type !== "message") continue;
    if (e.message?.role !== "user" && e.message?.role !== "assistant") continue;
    const content = e.message?.content;
    const push = (t: string): void => {
      if (!t.startsWith(HOST_LOOP_REQUEST_MARKER)) texts.push(t);
    };
    if (typeof content === "string") push(content);
    else if (Array.isArray(content)) {
      for (const part of content as readonly unknown[]) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") push(t);
      }
    }
  }
  return texts;
}

const CODE_SIDE_STEM = "l3progresscodeside";
const CODE_SIDE_CALLER = [
  "---",
  "mode: prompt",
  "tools:",
  "  - theta_progress",
  "---",
  'let _ = theta_progress({message: "phase one done"})?',
  "@`What is 263 plus 514? Answer with the number only.`?",
  "",
].join("\n");

const MODEL_SELF_REPORT_STEM = "l3progressmodelreport";
const MODEL_SELF_REPORT_CALLER = [
  "---",
  "mode: prompt",
  "tools:",
  "  - theta_progress",
  "---",
  '@`Call the theta_progress tool exactly once with message set to "model ' +
    'reported progress". Then answer: what is 812 plus 37? Reply with the ' +
    "number only.`?",
  "",
].join("\n");

describe("RFC 0010 (H8a, live, L3) — parent-regime theta_progress lands one milestone entry and one rendered ✎ segment", () => {
  it("code-side call: exactly one milestone entry carrying the exact message, the ✎ segment renders on the UI double, drive Ok, no chat-side progress leakage", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: CODE_SIDE_STEM, text: CODE_SIDE_CALLER },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    const { calls, ui } = createRecordingUi();
    try {
      if (handle.command(CODE_SIDE_STEM) === undefined) {
        failLoudly(
          `no ${CODE_SIDE_STEM} command to invoke — the code-side caller failed ` +
            "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        );
      }
      handle.runner.setUIContext(ui, "print");

      const turn = await driveSlashCaptureTurn(handle, `/${CODE_SIDE_STEM}`);

      // Drive Ok: no fail-closed system note.
      const failureNotes = turn.systemNotes.filter((n) =>
        new RegExp(`^theta /${CODE_SIDE_STEM} (returned Err|cancelled|aborted)`).test(n),
      );
      expect(
        failureNotes,
        "the code-side progress drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);

      // Fixed-pair arithmetic reached the model: proves execution continued
      // past the theta_progress call rather than aborting silently.
      expect(
        turn.text.includes("777"),
        `expected the arithmetic answer 777 in the assistant reply; got ${JSON.stringify(turn.text)}`,
      ).toBe(true);

      // Exactly one milestone entry, exact message.
      const entries = handle.sessionManager.getEntries();
      const milestones = milestoneEntries(entries);
      expect(
        milestones.length,
        "expected exactly one theta-progress-entry milestone; got " +
          JSON.stringify(milestones),
      ).toBe(1);
      expect(milestones[0]!.milestone.message).toBe("phase one done");

      // The ✎ segment renders on the UI double (poll for the tick).
      let rendered = false;
      for (let attempt = 0; attempt < RENDER_POLL_BOUND; attempt++) {
        if (anyCallCarries(calls, "phase one done")) {
          rendered = true;
          break;
        }
        await sleep(RENDER_POLL_INTERVAL_MS);
      }
      expect(
        rendered,
        "no setStatus/setWidget render carried the `✎ phase one done` segment. Calls: " +
          JSON.stringify(calls),
      ).toBe(true);

      // No sendMessage-class progress traffic: the milestone content never
      // enters the chat transcript.
      const leaked = chatTexts(entries).filter((t) => t.includes("phase one done"));
      expect(
        leaked,
        "the progress message leaked into the chat transcript instead of riding " +
          "the entry channel / ui.*: " + JSON.stringify(leaked),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 60_000);

  it("model self-report: the model's own theta_progress tool call lands a milestone entry, drive Ok", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: MODEL_SELF_REPORT_STEM, text: MODEL_SELF_REPORT_CALLER },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      if (handle.command(MODEL_SELF_REPORT_STEM) === undefined) {
        failLoudly(
          `no ${MODEL_SELF_REPORT_STEM} command to invoke — the model-self-report caller ` +
            "failed discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        );
      }

      const turn = await driveSlashCaptureTurn(handle, `/${MODEL_SELF_REPORT_STEM}`);

      const failureNotes = turn.systemNotes.filter((n) =>
        new RegExp(`^theta /${MODEL_SELF_REPORT_STEM} (returned Err|cancelled|aborted)`).test(n),
      );
      expect(
        failureNotes,
        "the model-self-report drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);

      expect(
        turn.text.includes("849"),
        `expected the arithmetic answer 849 in the assistant reply; got ${JSON.stringify(turn.text)}`,
      ).toBe(true);

      // The model-driven tool call landed a milestone entry (content not
      // pinned — a model may paraphrase its own tool-call argument).
      const milestones = milestoneEntries(handle.sessionManager.getEntries());
      expect(
        milestones.length > 0,
        "no theta-progress-entry milestone landed from the model's own tool call. " +
          "Session entries: " + JSON.stringify(handle.sessionManager.getEntries()),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  }, 60_000);
});
