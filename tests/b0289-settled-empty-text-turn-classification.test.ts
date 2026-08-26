import { describe, expect, it } from "vitest";
import * as liveHarness from "./live/harness";
import { failLoudly } from "./live/harness";

// Bug 0289 — the H8a harness defines "the drive's last turn settled" as "some
// assistant text after the last user entry is non-empty" (`lastTurnSettled` in
// `tests/live/harness.ts`), so a turn that terminated on a NORMAL boundary
// carrying a `thinking` part and a `text` part whose text is `""` — spec-legal
// `Ok("")` under PIC-51b/PIC-53 — is polled to the bound and then reported by
// `waitForLastTurnSettled` as a turn whose "reply never settled into the
// transcript", a state the transcript itself contradicts.
// docs/bugs/0289-settled-empty-text-turn-scored-as-never-settled-in-live-harness.md
//
// WHAT THIS FILE LOCKS. §Fix element (a): `lastTurnSettled` becomes an EXPORTED
// classifier over the post-last-user slice with three outcomes (pending /
// settled-with-text / settled-with-empty-text), and no failure message says
// "never settled" for a slice that holds a trailing assistant entry — it prints
// that entry's `stopReason` and per-part text lengths so the next live red is
// attributable from the log alone. §Fix element (b1): the drive's wait becomes
// `captureSettledTurn`, which on a settled-with-empty-text turn on a normal
// boundary re-issues the LAST user text exactly once through the same
// `prompt()` path and returns the union of turn texts, and fails loudly on a
// second consecutive empty settle rather than retrying without bound. Both
// decisions are gated on an injected idleness observable (`deps.isIdle`, wired
// to `AgentSession.isIdle` on the live path): the trailing assistant entry and
// its string `stopReason` are appended MID-RUN, and `AgentSession.prompt()`
// throws "Agent is already processing" against a streaming session, so an
// empty-text classification is PENDING until the run is observed idle. On
// expiry the ending is decided by a FRESH classification of the slice, so a
// re-ask consumed on the final poll is scored on its own result instead of the
// stale observation that authorised it.
//
// WHY THE LOCK IS OFFLINE. The live witness is cell 89
// (`tests/live/live-production-acceptance.test.ts`, the `/b0273livegood`
// drive), which reproduced the shape in 1 of 5 probe drives: a stochastic,
// token-spending cell that cannot gate the fix. Both surfaces §Fix touches are
// pure over `SessionManager`-shaped entries once their poll dependencies are
// injected, so the whole contract is assertable deterministically and
// provider-free in the default `npm test` (`vitest.config.ts`, which excludes
// `tests/live/**`). Importing the live harness from the default suite is the
// established pattern (`tests/b0287-live-harness-assistant-text-reader.test.ts`,
// `tests/acceptance-stderr-gate.test.ts`); this harness's module-scope
// subagent-child pins are process-global but vitest isolates each test FILE in
// its own worker, so they scope to this file and resolve no provider at load.

/** The trailing-entry shape §Fix element (a) prints instead of "never settled". */
type TrailingAssistantShape = {
  readonly stopReason: string | undefined;
  readonly partKinds: readonly string[];
  readonly textLengths: readonly number[];
};

/** The three outcomes §Fix element (a) replaces `lastTurnSettled`'s boolean with. */
type LastTurnClassification =
  | { readonly kind: "pending"; readonly trailing: TrailingAssistantShape | undefined }
  | {
      readonly kind: "settled-with-text";
      readonly via: "no-user-turn" | "assistant-text" | "system-note";
    }
  | { readonly kind: "settled-with-empty-text"; readonly trailing: TrailingAssistantShape };

type ClassifyLastTurn = (entries: readonly unknown[]) => LastTurnClassification;

type CaptureSettledTurnDeps = {
  readonly getEntries: () => readonly unknown[];
  readonly prompt: (text: string) => Promise<void>;
  readonly isIdle: () => boolean;
  readonly sleep: (ms: number) => Promise<void>;
};

type CaptureSettledTurn = (
  deps: CaptureSettledTurnDeps,
  entriesBefore: number,
  slashInvocation: string,
) => Promise<{
  readonly text: string;
  readonly userTexts: readonly string[];
  readonly systemNotes: readonly string[];
}>;

// The seam is read through the module namespace rather than named imports so a
// missing export surfaces as this file's own loud, §Fix-naming assertion rather
// than as an import-time SyntaxError that reports no cell at all.
const seam = liveHarness as unknown as {
  classifyLastTurn?: ClassifyLastTurn;
  captureSettledTurn?: CaptureSettledTurn;
};

function requireClassifier(): ClassifyLastTurn {
  if (typeof seam.classifyLastTurn !== "function") {
    failLoudly(
      "bug 0289 §Fix element (a) unmet: tests/live/harness.ts does not export " +
        "`classifyLastTurn(entries)`, so a settled-but-empty turn cannot be " +
        "distinguished from a turn whose reply never arrived.",
    );
  }
  return seam.classifyLastTurn;
}

function requireCapture(): CaptureSettledTurn {
  if (typeof seam.captureSettledTurn !== "function") {
    failLoudly(
      "bug 0289 §Fix element (b1) unmet: tests/live/harness.ts does not export " +
        "`captureSettledTurn(deps, entriesBefore, slashInvocation)`, so the " +
        "bounded same-session re-ask has no injectable drive to run in.",
    );
  }
  return seam.captureSettledTurn;
}

/** One in-memory `SessionManager` message entry, shaped as the harness readers walk it. */
function message(role: string, content: unknown, stopReason?: string): unknown {
  return { type: "message", message: { role, content, stopReason } };
}

/** A `theta-system-note` custom entry — clause C's accept reason. */
function note(content: string): unknown {
  return { customType: "theta-system-note", content };
}

/** The witnessed shape: a normal `stop` boundary, a thinking part, an EMPTY text part. */
function emptyTextAfterThinking(stopReason: string): unknown {
  return message(
    "assistant",
    [
      { type: "thinking", thinking: "…" },
      { type: "text", text: "" },
    ],
    stopReason,
  );
}

/** A sleep that resolves on the microtask queue — the poll bound must cost no wall time here. */
async function immediateSleep(): Promise<void> {}

/** Run `run`, returning the message of the loud failure it must produce. */
async function captureLoudFailure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return failLoudly(
    "bug 0289: the drive returned instead of failing loudly, so the state it " +
      "reported for the turn cannot be inspected.",
  );
}

const QUERY_ONE = "What is 471 plus 133? Answer with the number only.";
const QUERY_TWO =
  "A computation produced the value 524. What is that value plus 341? " +
  "Answer with the number only.";

describe("bug 0289 — settled-but-empty turn classification", () => {
  it("exports the classifier and the injectable drive §Fix elements (a) and (b1) owe", () => {
    // Fails loudly naming the unmet element rather than skipping, per AGENTS.md
    // §"No silent skipping": with no seam there is nothing to score.
    requireClassifier();
    requireCapture();
  });

  it("classifies the four post-last-user slice shapes distinctly", () => {
    const classify = requireClassifier();

    // Pending: the query is on the session and nothing has answered it. The one
    // shape whose failure message may still say "never settled".
    expect(classify([message("user", QUERY_TWO)])).toEqual({
      kind: "pending",
      trailing: undefined,
    });

    // Settled with text — bug 0287 clause B, preserved verbatim: a NON-EMPTY
    // text part after the LAST user entry.
    expect(classify([message("user", QUERY_TWO), message("assistant", "865", "stop")])).toEqual({
      kind: "settled-with-text",
      via: "assistant-text",
    });

    // The witnessed shape (probe drive, 1 of 5): normal `stop` boundary,
    // partKinds ["thinking","text"], textLen 0. At HEAD this is what
    // `lastTurnSettled` polls for 15000ms and then calls "never settled".
    expect(classify([message("user", QUERY_TWO), emptyTextAfterThinking("stop")])).toEqual({
      kind: "settled-with-empty-text",
      trailing: { stopReason: "stop", partKinds: ["thinking", "text"], textLengths: [0] },
    });

    // The thinking-only shape bug 0287's clause-B justification names — no
    // `text` part at all — which is as settled as the shape above.
    expect(
      classify([
        message("user", QUERY_TWO),
        message("assistant", [{ type: "thinking", thinking: "…" }], "stop"),
      ]),
    ).toEqual({
      kind: "settled-with-empty-text",
      trailing: { stopReason: "stop", partKinds: ["thinking"], textLengths: [] },
    });
  });

  it("preserves bug 0287's clause A and clause C accept reasons", () => {
    const classify = requireClassifier();

    // Clause A — no user-role entry at all (a subagent-mode drive, whose
    // transcript is private, or a drive that never sent).
    expect(classify([note("Running /b0273livegood: …")])).toEqual({
      kind: "settled-with-text",
      via: "no-user-turn",
    });

    // Clause C — a fail-closed ending AFTER the last user entry explains the
    // missing reply, so the cell's own assertions must run.
    expect(
      classify([message("user", QUERY_TWO), note("theta /b0273livegood returned Err: …")]),
    ).toEqual({ kind: "settled-with-text", via: "system-note" });
  });

  it("never reports 'never settled' on expiry while a trailing assistant entry exists", async () => {
    const capture = requireCapture();
    // §Fix element (a): the expiry message must name the true state and print
    // the trailing entry's stopReason and per-part text lengths. A streaming
    // turn has no string `stopReason` yet, so it is PENDING — but the slice
    // still holds the evidence that refutes "never settled".
    const streaming = [
      message("user", QUERY_TWO),
      message("assistant", [
        { type: "thinking", thinking: "…" },
        { type: "text", text: "" },
      ]),
    ];
    let promptCalls = 0;
    const observed = await captureLoudFailure(async () =>
      capture(
        {
          getEntries: () => streaming,
          prompt: async () => {
            promptCalls++;
          },
          isIdle: () => true,
          sleep: immediateSleep,
        },
        0,
        "/b0273livegood",
      ),
    );

    expect(observed).not.toContain("never settled");
    expect(observed).toContain("thinking");
    expect(promptCalls).toBe(0);
  });

  it("re-asks the last user text exactly once and returns BOTH turns' texts", async () => {
    // §Fix element (b1): one bounded same-session re-ask through the same
    // `prompt()` path. The union of turn texts over the appended slice is what
    // cell 89's sentinel assertion then reads, so the first turn's text must
    // survive the re-ask and the pre-drive prefix must stay out of it.
    const prefix = [message("assistant", "stale-prefix-not-part-of-this-drive", "stop")];
    const firstTurn = [
      message("user", QUERY_ONE),
      message("assistant", "604", "stop"),
      message("user", QUERY_TWO),
      emptyTextAfterThinking("stop"),
    ];
    const reAskTurn = [message("user", QUERY_TWO), message("assistant", "865", "stop")];
    const capture = requireCapture();
    const promptTexts: string[] = [];
    let entries = [...prefix, ...firstTurn];

    const turn = await capture(
      {
        getEntries: () => entries,
        prompt: async (text: string) => {
          promptTexts.push(text);
          entries = [...prefix, ...firstTurn, ...reAskTurn];
        },
        isIdle: () => true,
        sleep: immediateSleep,
      },
      prefix.length,
      "/b0273livegood",
    );

    expect(promptTexts).toEqual([QUERY_TWO]);
    expect(turn.text).toContain("604");
    expect(turn.text).toContain("865");
    expect(turn.text).not.toContain("stale-prefix-not-part-of-this-drive");
    expect(turn.userTexts).toEqual([QUERY_ONE, QUERY_TWO, QUERY_TWO]);
  });

  it("fails loudly on a SECOND consecutive empty settle instead of retrying without bound", async () => {
    // §Fix element (b1): "Exactly one retry; a second empty settle fails loudly
    // with the classification from (a)." The message names the true state —
    // settled, on this stopReason — and never the refuted one.
    const firstTurn = [message("user", QUERY_TWO), emptyTextAfterThinking("stop")];
    const secondEmptyTurn = [message("user", QUERY_TWO), emptyTextAfterThinking("stop")];
    const capture = requireCapture();
    let promptCalls = 0;
    let entries = [...firstTurn];

    const observed = await captureLoudFailure(async () =>
      capture(
        {
          getEntries: () => entries,
          prompt: async () => {
            promptCalls++;
            entries = [...firstTurn, ...secondEmptyTurn];
          },
          isIdle: () => true,
          sleep: immediateSleep,
        },
        0,
        "/b0273livegood",
      ),
    );

    expect(promptCalls).toBe(1);
    expect(observed).toContain("settled");
    expect(observed).toContain("stop");
    expect(observed).not.toContain("never settled");
  });

  it("does not re-ask an empty settle on a NON-normal boundary", async () => {
    // §Fix element (b1) admits the re-ask only for a normal boundary
    // ("stop"/"end_turn"/"toolUse"/"tool_use"). An "error" boundary is a
    // failure to report, not a turn to repeat.
    const capture = requireCapture();
    const entries = [message("user", QUERY_TWO), emptyTextAfterThinking("error")];
    let promptCalls = 0;

    const observed = await captureLoudFailure(async () =>
      capture(
        {
          getEntries: () => entries,
          prompt: async () => {
            promptCalls++;
          },
          isIdle: () => true,
          sleep: immediateSleep,
        },
        0,
        "/b0273livegood",
      ),
    );

    expect(promptCalls).toBe(0);
    expect(observed).toContain("error");
    expect(observed).not.toContain("never settled");
  });

  it("takes no re-ask decision while the run is NOT idle", async () => {
    // The trailing assistant entry and its string `stopReason` are appended at
    // `message_end`, MID-RUN, while the session keeps streaming until the run's
    // settled event; `AgentSession.prompt()` THROWS "Agent is already
    // processing" when called then. So the empty-text classification is
    // PENDING until the injected idleness observable reports the run finished —
    // the same discipline the producer-side twin holds (bug 0288: settledness
    // is only consulted once the run has been observed IDLE).
    const capture = requireCapture();
    const midRun = [message("user", QUERY_TWO), emptyTextAfterThinking("stop")];
    const reAskTurn = [message("user", QUERY_TWO), message("assistant", "865", "stop")];
    const IDLE_AFTER_POLLS = 3;
    let polls = 0;
    let entries = [...midRun];
    const promptPollCounts: number[] = [];

    const turn = await capture(
      {
        getEntries: () => entries,
        prompt: async () => {
          promptPollCounts.push(polls);
          entries = [...midRun, ...reAskTurn];
        },
        isIdle: () => polls >= IDLE_AFTER_POLLS,
        sleep: async () => {
          polls++;
        },
      },
      0,
      "/b0273livegood",
    );

    // No re-ask on any of the non-idle polls, exactly one on the first idle
    // poll: the count recorded at the single call is the poll idleness arrived.
    expect(promptPollCounts).toEqual([IDLE_AFTER_POLLS]);
    expect(turn.text).toContain("865");
  });

  it("scores an empty settle observed on the LAST poll on its FRESH result", async () => {
    // §Fix element (a)'s invariant is about the slice, not about the poll that
    // happened to observe it: branching on the last loop iteration's stale
    // classification reports "never settled" for a slice that holds a trailing
    // assistant entry, and discards the re-ask's own result unclassified.
    const capture = requireCapture();
    const pollBound = await discoverPollBound(capture);
    const settledEmpty = [message("user", QUERY_TWO), emptyTextAfterThinking("stop")];
    const reAskTurn = [message("user", QUERY_TWO), message("assistant", "865", "stop")];

    // (i) The re-ask consumed on the final poll lands real text: the fresh
    // classification is settled-with-text, so the drive RETURNS it.
    {
      const pending = [message("user", QUERY_TWO)];
      let polls = 0;
      let entries: readonly unknown[] = pending;
      const turn = await capture(
        {
          getEntries: () => entries,
          prompt: async () => {
            entries = [...settledEmpty, ...reAskTurn];
          },
          isIdle: () => true,
          sleep: async () => {
            polls++;
            if (polls === pollBound - 1) entries = settledEmpty;
          },
        },
        0,
        "/b0273livegood",
      );
      expect(turn.text).toContain("865");
    }

    // (ii) The re-ask's reply is itself empty: the ending names the settled
    // shape, and the refuted wording stays out of it.
    {
      const pending = [message("user", QUERY_TWO)];
      let polls = 0;
      let entries: readonly unknown[] = pending;
      const observed = await captureLoudFailure(async () =>
        capture(
          {
            getEntries: () => entries,
            prompt: async () => {
              entries = [...settledEmpty, ...settledEmpty];
            },
            isIdle: () => true,
            sleep: async () => {
              polls++;
              if (polls === pollBound - 1) entries = settledEmpty;
            },
          },
          0,
          "/b0273livegood",
        ),
      );
      expect(observed).not.toContain("never settled");
      expect(observed).toContain("SETTLED WITH EMPTY TEXT");
      expect(observed).toContain("the turn ended");
      expect(observed).toContain("thinking");
    }
  });

  it("names an empty settle observed while the run is NOT idle as still in flight", async () => {
    // A tool-using turn appends its trailing entry with a `toolUse` stopReason
    // and empty text MID-RUN, so a run that outlives the bound expires on a
    // slice that is settled-shaped while the turn has not ended. §Expected
    // behaviour 1: the failure text names the true state, which here is a run
    // still in flight, not a finished turn.
    const capture = requireCapture();
    const inFlight = [message("user", QUERY_TWO), emptyTextAfterThinking("toolUse")];
    let promptCalls = 0;

    const observed = await captureLoudFailure(async () =>
      capture(
        {
          getEntries: () => inFlight,
          prompt: async () => {
            promptCalls++;
          },
          isIdle: () => false,
          sleep: immediateSleep,
        },
        0,
        "/b0273livegood",
      ),
    );

    expect(promptCalls).toBe(0);
    expect(observed).not.toContain("the turn ended");
    expect(observed).toContain("STILL IN FLIGHT");
    expect(observed).toContain("isIdle=false");
    expect(observed).toContain("thinking");
    expect(observed).toContain("toolUse");
    expect(observed).not.toContain("never settled");
  });
});

/**
 * The harness's own poll bound, measured rather than duplicated as a literal:
 * an all-pending slice consumes exactly one sleep per poll before the drive
 * fails loudly. Reading it back is what lets the cell above place its empty
 * settle on the FINAL poll without pinning `ASSISTANT_TURN_POLL_BOUND`'s value
 * here.
 */
async function discoverPollBound(capture: CaptureSettledTurn): Promise<number> {
  const pending = [message("user", QUERY_TWO)];
  let polls = 0;
  const observed = await captureLoudFailure(async () =>
    capture(
      {
        getEntries: () => pending,
        prompt: async () => {
          failLoudly(
            "bug 0289: a slice with no trailing assistant entry is PENDING, so the " +
              "drive must not re-ask it.",
          );
        },
        isIdle: () => true,
        sleep: async () => {
          polls++;
        },
      },
      0,
      "/b0273livegood",
    ),
  );
  // A genuinely pending slice — no trailing assistant entry at all — is the one
  // shape whose expiry may still say "never settled".
  expect(observed).toContain("never settled");
  if (polls < 2) {
    failLoudly(
      `bug 0289 precondition unmet: the drive's poll bound measured as ${polls}, too small ` +
        "to place an empty settle on its final poll.",
    );
  }
  return polls;
}
