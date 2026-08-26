import { describe, expect, it } from "vitest";
import * as liveHarness from "./live/harness";
import { failLoudly } from "./live/harness";

// Bug 0290 — bug 0289's bounded same-session re-ask re-issues the LAST user
// text VERBATIM through the real `prompt()` seam inside `captureSettledTurn`,
// and `capturedTurn` builds `userTexts` over the WHOLE appended slice, so a
// sentinel-carrying query appears TWICE. Four live cells assert an exact count
// of rendered queries (`toBe(1)` / `toHaveLength(1)`) and therefore red on a
// drive that behaved exactly as 0289's contract specifies.
// docs/bugs/0290-exact-rendered-query-counts-red-when-bug-0289s-bounded-re-ask-fires.md
//
// WHAT THIS FILE LOCKS. §Fix element (a): the loop-local boolean flag that
// `captureSettledTurn` used to track whether a re-ask had fired is replaced by
// a COUNTED field `reAskCount: number` on `DrivenTurn`, populated by
// `capturedTurn` on BOTH of its call sites — the in-loop `settled-with-text`
// return and the post-expiry FRESH-classification return — so a cell can key
// an exact assertion to `1 + turn.reAskCount` instead of abandoning
// cardinality. The field is additive: no existing field changes shape, which
// is what keeps every unrelated consumer and the 14864-line pin on
// `tests/live/live-production-acceptance.test.ts` intact.
//
// WHY THE LOCK IS OFFLINE. The live witness fires only when the model's first
// settled reply is empty — roughly 1 in 5 drives per bug 0289 §Fix residual 2 —
// so the exposed live cells are stochastic and token-spending and cannot gate
// this fix. `captureSettledTurn` is pure over `SessionManager`-shaped entries
// once its poll dependencies are injected, so the whole contract is assertable
// deterministically and provider-free under the default `npm test`
// (`vitest.config.ts`, which excludes `tests/live/**`). Importing the live
// harness from the default suite is the established pattern
// (`tests/b0289-settled-empty-text-turn-classification.test.ts`,
// `tests/b0287-live-harness-assistant-text-reader.test.ts`); this harness's
// module-scope subagent-child pins are process-global but vitest isolates each
// test FILE in its own worker, so they scope to this file and resolve no
// provider at load.

type CaptureSettledTurnDeps = {
  readonly getEntries: () => readonly unknown[];
  readonly prompt: (text: string) => Promise<void>;
  readonly isIdle: () => boolean;
  readonly sleep: (ms: number) => Promise<void>;
};

/** The `DrivenTurn` §Fix element (a) owes: bug 0287/0289's three fields plus the
 * counted re-ask indicator. Declared locally rather than imported so this file
 * scores the missing field as its own loud assertion at RUNTIME, instead of
 * failing to typecheck and reporting no cell at all. */
type CaptureSettledTurn = (
  deps: CaptureSettledTurnDeps,
  entriesBefore: number,
  slashInvocation: string,
) => Promise<{
  readonly text: string;
  readonly userTexts: readonly string[];
  readonly systemNotes: readonly string[];
  readonly reAskCount: number;
}>;

// The seam is read through the module namespace rather than a named import so a
// missing export surfaces as this file's own loud, §Fix-naming assertion rather
// than as an import-time SyntaxError.
const seam = liveHarness as unknown as { captureSettledTurn?: CaptureSettledTurn };

function requireCapture(): CaptureSettledTurn {
  if (typeof seam.captureSettledTurn !== "function") {
    failLoudly(
      "bug 0290 precondition unmet: tests/live/harness.ts does not export " +
        "`captureSettledTurn(deps, entriesBefore, slashInvocation)`, so the drive whose " +
        "return must carry §Fix element (a)'s `reAskCount` has no injectable form.",
    );
  }
  return seam.captureSettledTurn;
}

/** One in-memory `SessionManager` message entry, shaped as the harness readers walk it. */
function message(role: string, content: unknown, stopReason?: string): unknown {
  return { type: "message", message: { role, content, stopReason } };
}

/** The witnessed empty settle: a normal `stop` boundary, a thinking part, an EMPTY text part. */
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
    "bug 0290: the drive returned instead of failing loudly, so the poll bound it " +
      "consumed cannot be measured.",
  );
}

// The sentinel-carrying rendered query the exposed live cells filter for, in the
// task-framed compute-from-inline-value shape AGENTS.md §"Assert on real
// observables" prescribes (no verbatim-echo demand).
const SENTINEL = "THETA-b0290-CANON";
const SENTINEL_QUERY = `Status line: ${SENTINEL} <<high>>. What is 218 plus 639? Answer with the number only.`;
const SETUP_QUERY = "Classify the severity as either low or high. Answer with one word.";

const SLASH = "/b0290reaskcount";

describe("bug 0290 — the bounded re-ask is observable on the drive's result", () => {
  it("reports reAskCount 1 and BOTH byte-identical occurrences when the re-ask fires", async () => {
    // §Fix element (a) at the IN-LOOP `settled-with-text` return: the drive's
    // first turn settles empty on a normal boundary while idle, the re-ask
    // re-issues the last user text verbatim, and the next poll returns. The
    // count must be 1, and bug 0289's existing shape must be unchanged — both
    // occurrences still reach the caller and are byte-identical, which is the
    // property the exposed cells' identity constraint
    // (`new Set(echoed).size === 1`) reads.
    const capture = requireCapture();
    const firstTurn = [
      message("user", SETUP_QUERY),
      message("assistant", "high", "stop"),
      message("user", SENTINEL_QUERY),
      emptyTextAfterThinking("stop"),
    ];
    const reAskTurn = [message("user", SENTINEL_QUERY), message("assistant", "857", "stop")];
    const promptTexts: string[] = [];
    let entries: readonly unknown[] = firstTurn;

    const turn = await capture(
      {
        getEntries: () => entries,
        prompt: async (text: string) => {
          promptTexts.push(text);
          entries = [...firstTurn, ...reAskTurn];
        },
        isIdle: () => true,
        sleep: immediateSleep,
      },
      0,
      SLASH,
    );

    expect(promptTexts).toEqual([SENTINEL_QUERY]);
    expect(turn.reAskCount).toBe(1);

    // Bug 0289's shape, unchanged: the whole appended slice, both occurrences.
    expect(turn.userTexts).toEqual([SETUP_QUERY, SENTINEL_QUERY, SENTINEL_QUERY]);
    const echoed = turn.userTexts.filter((text) => text.includes(SENTINEL));
    expect(echoed).toHaveLength(1 + turn.reAskCount);
    expect(new Set(echoed).size).toBe(1);
  });

  it("reports reAskCount 0 when the first turn settles WITH text", async () => {
    // The not-fired case: `1 + turn.reAskCount` must collapse to the
    // pre-0.286.0 invariant the exposed cells encoded, so a drive that renders
    // exactly one query still pins exactly one. The injected `prompt` counts
    // calls because a count of 0 is only meaningful if no re-ask was issued.
    const capture = requireCapture();
    const entries = [message("user", SENTINEL_QUERY), message("assistant", "857", "stop")];
    let promptCalls = 0;

    const turn = await capture(
      {
        getEntries: () => entries,
        prompt: async () => {
          promptCalls++;
        },
        isIdle: () => true,
        sleep: immediateSleep,
      },
      0,
      SLASH,
    );

    expect(promptCalls).toBe(0);
    expect(turn.reAskCount).toBe(0);
    expect(turn.userTexts.filter((text) => text.includes(SENTINEL))).toHaveLength(
      1 + turn.reAskCount,
    );
  });

  it("carries reAskCount 1 out of the post-expiry FRESH-classification return path", async () => {
    // `capturedTurn` has TWO call sites: the in-loop `settled-with-text`
    // return, and the post-expiry FRESH-classification return. A re-ask
    // consumed on the FINAL poll lands its reply after the loop ends, so the
    // drive returns through the second one — and that return must carry the
    // count too. This cell exists to cover that site INDEPENDENTLY: threading
    // the count into the in-loop return alone leaves the expiry return
    // reporting a re-ask that demonstrably happened as none.
    const capture = requireCapture();
    const pollBound = await discoverPollBound(capture);
    const settledEmpty = [message("user", SENTINEL_QUERY), emptyTextAfterThinking("stop")];
    const reAskTurn = [message("user", SENTINEL_QUERY), message("assistant", "857", "stop")];
    const pending = [message("user", SENTINEL_QUERY)];
    let polls = 0;
    let entries: readonly unknown[] = pending;
    const promptPollCounts: number[] = [];

    const turn = await capture(
      {
        getEntries: () => entries,
        prompt: async () => {
          promptPollCounts.push(polls);
          entries = [...settledEmpty, ...reAskTurn];
        },
        isIdle: () => true,
        // The slice stays PENDING until the last-but-one sleep, so the empty
        // settle is first observed on the FINAL poll and its re-ask can only be
        // scored by the post-loop fresh classification.
        sleep: async () => {
          polls++;
          if (polls === pollBound - 1) entries = settledEmpty;
        },
      },
      0,
      SLASH,
    );

    // The single re-ask happened on the LAST loop iteration (every earlier
    // iteration saw a pending slice), so the value returned above cannot have
    // come from the in-loop return: it is the post-expiry classification's.
    expect(promptPollCounts).toEqual([pollBound - 1]);
    expect(turn.text).toContain("857");
    expect(turn.reAskCount).toBe(1);
    const echoed = turn.userTexts.filter((text) => text.includes(SENTINEL));
    expect(echoed).toHaveLength(1 + turn.reAskCount);
    expect(new Set(echoed).size).toBe(1);
  });

  it("still distinguishes a SECOND DISTINCT sentinel-carrying query from a verbatim re-ask", async () => {
    // WHY this cell is GREEN at HEAD and stays green after the fix: it is the
    // leak detector, not a red witness. §Fix trades the exposed cells'
    // cardinality for an IDENTITY constraint, and §Fix's own falsifier demands
    // that the constraint still red when two DISTINCT sentinel-carrying texts
    // reach the session. Two distinct texts must yield a set of size 2 — if a
    // future edit made the occurrences compare equal, the identity constraint
    // would admit a real double-emission (the class bug 0093 covers) and this
    // report would be re-filed.
    const capture = requireCapture();
    const leakedQuery = SENTINEL_QUERY.replace("218 plus 639", "104 plus 251");
    const entries = [
      message("user", SENTINEL_QUERY),
      message("assistant", "857", "stop"),
      message("user", leakedQuery),
      message("assistant", "355", "stop"),
    ];

    const turn = await capture(
      {
        getEntries: () => entries,
        prompt: async () => {
          failLoudly(
            "bug 0290: a slice whose last turn settled WITH text must not be re-asked, so " +
              "the two distinct occurrences below cannot be an artefact of the re-ask.",
          );
        },
        isIdle: () => true,
        sleep: immediateSleep,
      },
      0,
      SLASH,
    );

    const echoed = turn.userTexts.filter((text) => text.includes(SENTINEL));
    expect(echoed).toHaveLength(2);
    expect(new Set(echoed).size).toBe(2);
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
  const pending = [message("user", SENTINEL_QUERY)];
  let polls = 0;
  const observed = await captureLoudFailure(async () =>
    capture(
      {
        getEntries: () => pending,
        prompt: async () => {
          failLoudly(
            "bug 0290: a slice with no trailing assistant entry is PENDING, so the drive " +
              "must not re-ask it.",
          );
        },
        isIdle: () => true,
        sleep: async () => {
          polls++;
        },
      },
      0,
      SLASH,
    ),
  );
  // A genuinely pending slice — no trailing assistant entry at all — is the one
  // shape whose expiry still says "never settled" (bug 0289 §Fix element (a)).
  expect(observed).toContain("never settled");
  if (polls < 2) {
    failLoudly(
      `bug 0290 precondition unmet: the drive's poll bound measured as ${polls}, too small ` +
        "to place an empty settle on its final poll.",
    );
  }
  return polls;
}
