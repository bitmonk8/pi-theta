// V12a-T — failing tests for the paired `V12a` slash-dispatch leaf: no-params
// overflow (SLSH-1) and prompt-mode user-visible streaming ordering (SLSH-2).
//
// Spec: slash-invocation.md SLSH-1 (no-params overflow note) and SLSH-2
// (user-visible streaming: streamed tokens observable before the interpreter
// resumes; the forced-respond turn runs off-session with no transcript card; on
// an `Err` propagated by `?` after partial assistant text, and on mid-stream
// cancellation, the streamed prefix is retained and the failure/cancellation
// `loom-system-note` is appended AFTER the prefix, never interleaved).
//
// The streaming-ordering coverage runs through the in-process Pi session double
// (H4a), whose `ctx.waitForIdle()`-vs-streaming ordering is the one the
// session-double fidelity contract requires the double to model.
//
// Every test reds on its own primary assertion while `V12a` is absent, because
// the `slash-dispatch.ts` seam stub is deliberately NON-COMPLIANT:
//   - `renderNoParamsOverflowNote` returns a sentinel, not the SLSH-1 template;
//   - `dispatchNoParamsLoom` emits the overflow note unconditionally (ignoring
//     the trim-to-empty and slash-path-only rules);
//   - `rendersTranscriptCard` reports the off-session forced-respond turn as
//     card-rendering;
//   - `driveSlashPromptTurn` appends the note before any streamed prefix and
//     never awaits `ctx.waitForIdle()`.
// No test reds on a compile error, a missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import {
  dispatchNoParamsLoom,
  driveSlashPromptTurn,
  rendersTranscriptCard,
  renderNoParamsOverflowNote,
  type SlashPromptDriveDeps,
  type SlashTurnOutcome,
} from "../src/runtime/slash-dispatch";
import { SessionDouble } from "./harness/index";

// ===========================================================================
// SLSH-1 — no-params slash-argument overflow.
// ===========================================================================

/** A recording no-params dispatch harness: the emitted notes and a run marker. */
function makeNoParamsHarness(): {
  readonly notes: string[];
  readonly runLog: string[];
  readonly deps: {
    emitOverflowNote: (note: string) => void;
    run: () => Promise<void>;
  };
} {
  const notes: string[] = [];
  const runLog: string[] = [];
  return {
    notes,
    runLog,
    deps: {
      emitOverflowNote: (note): void => {
        notes.push(note);
      },
      run: async (): Promise<void> => {
        runLog.push("ran");
      },
    },
  };
}

describe("V12a-T — SLSH-1 no-params slash-argument overflow", () => {
  it("SLSH-1: a non-empty overflow (after trimming) emits the exact overflow note, then runs", async () => {
    const h = makeNoParamsHarness();

    // Surrounding slash-argument whitespace is trimmed; the remainder is
    // non-empty, so the overflow note fires before the loom runs.
    await dispatchNoParamsLoom(
      { name: "greet", caller: "slash", rawArgs: "  TypeScript stuff  " },
      h.deps,
    );

    // SLSH-1 primary assertion: exactly one note, whose rendered string is the
    // normative SLSH-1 template with `<name>` interpolated (em-dash separator).
    expect(h.notes).toEqual([
      "loom /greet: ignoring extra arguments — this loom takes no parameters",
    ]);
    // The note never blocks execution: the loom still runs, and after the note.
    expect(h.runLog).toEqual(["ran"]);
    // The renderer itself produces the same normative SLSH-1 string.
    expect(renderNoParamsOverflowNote("greet")).toBe(
      "loom /greet: ignoring extra arguments — this loom takes no parameters",
    );
  });

  it("SLSH-1: a whitespace-only remainder trims to empty and emits no note (still runs)", async () => {
    const h = makeNoParamsHarness();

    await dispatchNoParamsLoom(
      { name: "greet", caller: "slash", rawArgs: "   \t  " },
      h.deps,
    );

    // SLSH-1: whitespace-only remainders trim to empty and emit no note.
    expect(h.notes).toEqual([]);
    // The loom still runs — the note's absence does not gate execution.
    expect(h.runLog).toEqual(["ran"]);
  });

  it("SLSH-1: the overflow note is slash-path-only — an invoke/tool caller never emits it", async () => {
    const invoke = makeNoParamsHarness();
    const tool = makeNoParamsHarness();

    await dispatchNoParamsLoom(
      { name: "greet", caller: "invoke", rawArgs: "extra text an invoke passed" },
      invoke.deps,
    );
    await dispatchNoParamsLoom(
      { name: "greet", caller: "tool", rawArgs: "extra text a tool passed" },
      tool.deps,
    );

    // SLSH-1: `invoke(...)` and registered-tool callers skip the slash parser
    // and have no notion of "extra text" — no overflow note is emitted.
    expect(invoke.notes).toEqual([]);
    expect(tool.notes).toEqual([]);
    // The loom still runs on both non-slash paths.
    expect(invoke.runLog).toEqual(["ran"]);
    expect(tool.runLog).toEqual(["ran"]);
  });
});

// ===========================================================================
// SLSH-2 — user-visible streaming ordering.
// ===========================================================================

/** Wire a `SlashPromptDriveDeps` onto a `SessionDouble` for the given outcome. */
function makePromptDeps(
  double: SessionDouble,
  outcome: SlashTurnOutcome,
): SlashPromptDriveDeps {
  return {
    pi: {
      sendUserMessage: (content): void => {
        double.pi.sendUserMessage(content);
      },
      sendMessage: (message): void => {
        double.pi.sendMessage(message);
      },
    },
    ctx: {
      waitForIdle: (): Promise<void> => double.ctx.waitForIdle(),
    },
    outcome,
  };
}

describe("V12a-T — SLSH-2 user-visible streaming ordering", () => {
  it("SLSH-2: streamed assistant tokens are observable before the interpreter resumes (before waitForIdle resolves)", async () => {
    const double = new SessionDouble();
    double.programResponse(["Hel", "lo"]);

    await driveSlashPromptTurn("Greet the user.", makePromptDeps(double, { kind: "ok" }));

    // SLSH-2: the driver resumes only after `ctx.waitForIdle()` resolves, and
    // the stream's appearance in the transcript precedes that resumption — so a
    // buffer-then-append-after-resume driver (which never awaits idle) fails.
    const log = double.events;
    expect(log).toContain("idle");
    expect(log.filter((e) => e === "stream-token").length).toBeGreaterThan(0);
    // All streamed tokens precede the terminal `agent-end`, which precedes the
    // `waitForIdle()` resolution the interpreter resumes on.
    expect(log.indexOf("agent-end")).toBeGreaterThan(log.lastIndexOf("stream-token"));
    expect(log.indexOf("idle")).toBeGreaterThan(log.indexOf("agent-end"));
    // The committed prefix is exactly the streamed text.
    const assistant = double.transcript.filter((m) => m.role === "assistant");
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.text).toBe("Hello");
  });

  it("SLSH-2: the off-session forced-respond turn renders no transcript card; user-visible turns do", () => {
    // SLSH-2: the forced respond turn is dispatched off-session through pi-ai's
    // `complete()` free function and attaches no turn to the user session, so it
    // renders no transcript card; an ordinary user-visible turn does.
    expect(rendersTranscriptCard("forced_respond")).toBe(false);
    expect(rendersTranscriptCard("user_visible")).toBe(true);
  });

  it("SLSH-2: on an Err after partial assistant text, the streamed prefix is retained and the failure note is appended AFTER it (not interleaved)", async () => {
    const double = new SessionDouble();
    double.programResponse(["par", "tial ", "answer"]);
    const failureNote = "loom /greet returned Err: transport — connection reset";

    await driveSlashPromptTurn(
      "Greet the user.",
      makePromptDeps(double, { kind: "err", note: failureNote }),
    );
    // Flush the turn so the streamed prefix has fully committed regardless of
    // driver correctness (the double's streaming settles on `waitForIdle`).
    await double.ctx.waitForIdle();

    const log = double.events;
    // SLSH-2 primary assertion: the failure `loom-system-note` is appended after
    // the streamed prefix — after the terminal `agent-end` — not interleaved
    // with the streamed tokens.
    expect(log.indexOf("system-note")).toBeGreaterThan(log.indexOf("agent-end"));
    expect(log.indexOf("system-note")).toBeGreaterThan(log.lastIndexOf("stream-token"));
    // The streamed prefix is retained (never rolled back), and the appended note
    // carries the failure text.
    const assistant = double.transcript.filter((m) => m.role === "assistant");
    expect(assistant[0]?.text).toBe("partial answer");
    expect(double.systemNotes.map((n) => n.content)).toContain(failureNote);
  });

  it("SLSH-2: on mid-stream cancellation, the partial prefix is retained and the cancellation note is appended AFTER it (not interleaved)", async () => {
    const double = new SessionDouble();
    double.programResponse(["a", "b", "c", "d", "e", "f"]);
    const cancelNote = "loom /greet cancelled";

    const driven = driveSlashPromptTurn(
      "Greet the user.",
      makePromptDeps(double, { kind: "cancelled", note: cancelNote }),
    );
    // Let a couple of tokens stream, then a Pi/user-initiated cancel lands
    // mid-stream (the CNCL-4 source).
    await Promise.resolve();
    await Promise.resolve();
    double.cancelTurn(new Error("cancelled mid-stream"));
    await driven;
    // Flush so the (aborted) turn has settled regardless of driver correctness.
    await double.ctx.waitForIdle();

    const log = double.events;
    // SLSH-2 primary assertion: the cancellation note is appended after the
    // partial prefix — after the terminal `agent-end` — not interleaved.
    expect(log.indexOf("system-note")).toBeGreaterThan(log.indexOf("agent-end"));
    // Whatever partial text Pi already rendered stays visible (not rolled back):
    // a non-empty prefix that is a genuine prefix of the full programmed text.
    const assistant = double.transcript.filter((m) => m.role === "assistant");
    const partial = assistant[0]?.text ?? "";
    expect(partial.length).toBeGreaterThan(0);
    expect("abcdef".startsWith(partial)).toBe(true);
    expect(double.systemNotes.map((n) => n.content)).toContain(cancelNote);
  });
});
