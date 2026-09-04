import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { composeExtensionInstance } from "../src/extension/production-composition";
import {
  RendererGate,
  SYSTEM_NOTE_CHANNEL,
  SYSTEM_NOTE_DELIVERY_FAILED_CODE,
} from "../src/extension/system-note-channel";

// Bug 0435 — the shipped `composeExtensionInstance` compose wiring routes
// `sendSystemNote`'s step-2 delivery-failure diagnostic back through
// `pi.sendMessage`, so the fallback's diagnostic step re-invokes the very host
// surface that just threw. That violates the channel's re-entry MUST NOT.
//
// SPEC — `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:135`:
//   "Implementers must guard against re-entry: if a future `theta/runtime/*`
//    handler ever routes diagnostics back through `theta-system-note`, the
//    diagnostic step in this fallback MUST NOT re-invoke `pi.sendMessage`."
//
// MECHANISM (at the fork this bug reports, before the off-channel fix):
//   - `sendSystemNote`'s step-2 (`src/extension/system-note-channel.ts:356`)
//     emits a `theta/runtime/system-note-delivery-failed` diagnostic through
//     `deps.emitDiagnostic`; its terminal `console.error("system-note delivery
//     failed: …")` (`system-note-channel.ts:373`) runs only if that emit throws.
//   - At the fork, `runComposePass` builds the parse/producer channel's
//     `emitDiagnostic = sink.emit`. In the `composeExtensionInstance` wiring
//     `sink.emit`'s error arm routes each diagnostic as a single-element note
//     through `preEvalRouter.routePreEvalFailure` → `sendSystemNote(note,
//     deps.channel)` (`src/extension/load-pre-eval.ts:108`) → `pi.sendMessage`.
//     So step 2 is a re-entrant send on a sibling channel.
//   - The conformant sibling one function up builds its own channel with an
//     OFF-channel fallback, `emitToast`, carrying the WHY comment that it
//     "MUST stay off-channel so a throwing `pi.sendMessage` does not re-enter
//     the channel". The bootstrap tier-2 wiring is likewise off-channel via
//     `buildSystemNoteDeps`'s `makeLoadEmit(ctx)` argument.
//     `SYSTEM_NOTE_DELIVERY_FAILED_CODE` is defined at
//     `src/extension/system-note-channel.ts:96`.
//
// The fix (bug 0435 §Fix option 1) rebuilds the `runComposePass` channel with an
// off-channel `makeLoadEmit(ctx)`-based `emitDiagnostic`, so the delivery-failed
// diagnostic exits through the off-channel sink (toast/stderr) and NO
// `pi.sendMessage` re-invocation carries the delivery-failed code.
//
// Offline, provider-free, deterministic: host doubles only, no provider, no
// child process. Modelled on (not shared with)
// `tests/b0268-load-note-path-spelling-single-convention.test.ts` — its
// composeExtensionInstance host-double + workspace-planting shape.
//
// No silent skipping: an unmet precondition (the fixture no longer reaching the
// channel, no throwing send observed) throws naming itself, never an early
// return.

/** A discovered subagent-mode `.theta` with an unterminated backtick template:
 *  a lex/parse-error batch, delivered as a `theta-system-note` parse note. */
const BROKEN_THETA =
  "---\nmode: subagent\ndescription: b0435 broken\n---\nlet t = `unterminated\nlet a = 1\n";

const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
const TERMINAL_PREFIX = "system-note delivery failed: ";

interface RecordedSend {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

/** The `details.diagnostics[0].code` a recorded send carries, or `undefined`. */
function firstDiagnosticCode(send: RecordedSend): string | undefined {
  const details = send.details as
    | { diagnostics?: Array<{ code?: string }> }
    | undefined;
  return details?.diagnostics?.[0]?.code;
}

interface Workspace {
  readonly cwd: string;
  readonly dispose: () => void;
}

/** Plant `broken.theta` + `{}` settings on a hermetic temp project source. */
function plantBrokenWorkspace(): Workspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0435-"));
  const planted = join(cwd, ".pi", "theta", "broken.theta");
  mkdirSync(dirname(planted), { recursive: true });
  writeFileSync(planted, BROKEN_THETA, "utf8");
  // An absent settings file is silent; the `{}` plant is hermeticity.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return { cwd, dispose: () => rmSync(cwd, { recursive: true, force: true }) };
}

/**
 * A b0268-style host double whose `pi.sendMessage` records every call.
 * `throwOnSystemNote(index)` decides whether the Nth (1-based) `theta-system-note`
 * send throws; `notifyThrows` makes `ctx.ui.notify` throw (no attached UI).
 */
function makeHost(
  cwd: string,
  opts: {
    throwOnSystemNote: (oneBasedIndex: number) => boolean;
    notifyThrows: boolean;
  },
): {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  sends: RecordedSend[];
  notified: string[];
} {
  const sends: RecordedSend[] = [];
  const notified: string[] = [];
  let systemNoteCount = 0;

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    on: (): void => {},
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: {
      customType: string;
      content: string;
      details: unknown;
    }): void => {
      sends.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
      if (message.customType === SYSTEM_NOTE_CHANNEL) {
        systemNoteCount += 1;
        if (opts.throwOnSystemNote(systemNoteCount)) {
          throw new Error(
            `b0435: host refused theta-system-note #${systemNoteCount}`,
          );
        }
      }
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notified.push(message);
        if (opts.notifyThrows) {
          throw new Error("b0435: no UI attached");
        }
      },
    },
  } as unknown as ExtensionContext;

  return { pi, ctx, sends, notified };
}

describe("bug 0435 — the compose channel's delivery-failure diagnostic step must not re-invoke pi.sendMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── MANDATORY WITNESS: the re-entry symptom itself ────────────────────────
  it("routes the step-2 delivery-failed diagnostic OFF-channel — no post-throw pi.sendMessage carries the delivery-failed code", async () => {
    // The first `theta-system-note` send (the parse batch) throws; every later
    // send is recorded and delivered. This is bug 0435 §Reproduction probe P4.
    const workspace = plantBrokenWorkspace();
    const host = makeHost(workspace.cwd, {
      throwOnSystemNote: (i) => i === 1,
      notifyThrows: false,
    });
    try {
      await composeExtensionInstance(
        host.pi,
        host.ctx,
        undefined,
        new RendererGate(),
      );

      const systemNoteSends = host.sends.filter(
        (s) => s.customType === SYSTEM_NOTE_CHANNEL,
      );
      // Precondition — the fixture must actually reach the channel AND drive a
      // throwing send, or nothing below is verified (fail loudly, never skip).
      const throwingIndex = host.sends.findIndex(
        (s) => s.customType === SYSTEM_NOTE_CHANNEL,
      );
      if (throwingIndex < 0) {
        throw new Error(
          "harness: the compose pass put NOTHING on the theta-system-note channel — " +
            "the bug-0435 broken.theta fixture no longer reaches the channel, so the " +
            "re-entry symptom is not exercised",
        );
      }
      // The parse batch must be the throwing send — otherwise the fallback step
      // 2 under test never ran (fail loudly).
      expect(
        firstDiagnosticCode(host.sends[throwingIndex]!),
        `the throwing send must be the parse batch:\n${systemNoteSends
          .map((s, i) => `[${i}] ${firstDiagnosticCode(s)} ${s.content}`)
          .join("\n")}`,
      ).toBe(UNTERMINATED_TEMPLATE_CODE);

      // THE RE-ENTRY ASSERTION. `sendSystemNote`'s step-2 diagnostic MUST NOT
      // re-invoke `pi.sendMessage` (runtime-event-channel.md:135). At the fork,
      // the `runComposePass` channel's `emitDiagnostic = sink.emit` re-delivers the delivery-failed
      // diagnostic as a sibling-channel note, so a post-throw send carries
      // `theta/runtime/system-note-delivery-failed`. Under the off-channel fix
      // that send does not exist.
      const reInvocations = host.sends
        .slice(throwingIndex + 1)
        .filter(
          (s) => firstDiagnosticCode(s) === SYSTEM_NOTE_DELIVERY_FAILED_CODE,
        );
      expect(
        reInvocations,
        "a pi.sendMessage AFTER the throwing send carries the delivery-failed " +
          "code — the step-2 diagnostic re-invoked the host surface that just " +
          `threw (re-entry MUST NOT, runtime-event-channel.md:135):\n${host.sends
            .map((s, i) => `[${i}] ${s.customType} ${firstDiagnosticCode(s)}`)
            .join("\n")}`,
      ).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── SECONDARY WITNESS: the terminal stderr line's reachability ────────────
  it("keeps the terminal `system-note delivery failed:` line reachable, carrying the ORIGINAL parse note content, when both the send and the off-channel emit fail", async () => {
    // Both surfaces fail: EVERY `theta-system-note` send throws AND
    // `ctx.ui.notify` throws. After the fix the `runComposePass` channel's step-2
    // `emitDiagnostic = makeLoadEmit(ctx)` also throws (no UI), so the
    // originating channel's PIC-54 terminal `console.error` fires carrying the
    // ORIGINAL parse-note content. At the fork step 2 "succeeds" by delegation
    // (the re-invocation's OWN off-channel toast swallows the failure), so the
    // originating channel's terminal line is never reached — bug 0435 §Why it
    // matters / §Fix.
    const workspace = plantBrokenWorkspace();
    const host = makeHost(workspace.cwd, {
      throwOnSystemNote: () => true,
      notifyThrows: true,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await composeExtensionInstance(
        host.pi,
        host.ctx,
        undefined,
        new RendererGate(),
      );

      // Precondition — the fixture must have driven a throwing send.
      if (
        !host.sends.some((s) => s.customType === SYSTEM_NOTE_CHANNEL)
      ) {
        throw new Error(
          "harness: no theta-system-note send observed — the bug-0435 both-throw " +
            "fixture no longer exercises the fallback chain",
        );
      }

      const terminalLines = errorSpy.mock.calls
        .map((call) => call[0])
        .filter(
          (arg): arg is string =>
            typeof arg === "string" && arg.startsWith(TERMINAL_PREFIX),
        );

      // The PIC-54 terminal line must fire at all (unreachable at the fork).
      expect(
        terminalLines,
        "the terminal `system-note delivery failed:` line never fired — the " +
          "originating channel's step 2 'succeeded' by delegating to a sibling " +
          "channel, so the terminal arm was unreachable (bug 0435 §Why it matters)",
      ).not.toEqual([]);

      // And it must carry the ORIGINAL parse-note content, not the re-delivered
      // delivery-failed note content. The original content contains the parse
      // code and does NOT contain the runtime delivery-failed code; the
      // delivery-failed note content leads with the runtime code.
      const carriesOriginal = terminalLines.some((line) => {
        const content = line.slice(TERMINAL_PREFIX.length);
        return (
          content.includes(UNTERMINATED_TEMPLATE_CODE) &&
          !content.includes(SYSTEM_NOTE_DELIVERY_FAILED_CODE)
        );
      });
      expect(
        carriesOriginal,
        "the terminal line does not carry the ORIGINAL parse note content " +
          `(expected ${UNTERMINATED_TEMPLATE_CODE}, not ` +
          `${SYSTEM_NOTE_DELIVERY_FAILED_CODE}):\n${terminalLines.join("\n")}`,
      ).toBe(true);
    } finally {
      errorSpy.mockRestore();
      workspace.dispose();
    }
  });
});
