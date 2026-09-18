// Shared offline captureSettledTurn poll scaffolding for the bug-0289/0290 witnesses.
// Kept separate from the producer-side scripted-live-session harness so its
// consumers do not inherit tests/live/harness.ts's process-global child pins.
import { expect } from "vitest";
import { failLoudly, messageEntry as message } from "../live/harness";

/** The witnessed shape: a normal `stop` boundary, a thinking part, an EMPTY text part. */
export function emptyTextAfterThinking(stopReason: string): unknown {
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
export async function immediateSleep(): Promise<void> {}

type CaptureSettledTurnDeps = {
  readonly getEntries: () => readonly unknown[];
  readonly prompt: (text: string) => Promise<void>;
  readonly isIdle: () => boolean;
  readonly sleep: (ms: number) => Promise<void>;
};

// Only the input seam matters when measuring a drive that must fail.
type CaptureForPollBound = (
  deps: CaptureSettledTurnDeps,
  entriesBefore: number,
  slashInvocation: string,
) => Promise<unknown>;

/** Bind each witness's failure context without changing its scripted drive. */
export function createSettledTurnPollHarness(options: {
  readonly bug: string;
  readonly unexpectedSuccessMessage: string;
}) {
  /** Run `run`, returning the message of the loud failure it must produce. */
  async function captureLoudFailure(run: () => Promise<unknown>): Promise<string> {
    try {
      await run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return failLoudly(options.unexpectedSuccessMessage);
  }

  /**
   * The harness's own poll bound, measured rather than duplicated as a literal:
   * an all-pending slice consumes exactly one sleep per poll before the drive
   * fails loudly. Reading it back is what lets callers place an empty
   * settle on the FINAL poll without pinning `ASSISTANT_TURN_POLL_BOUND`'s value
   * here.
   */
  async function discoverPollBound(
    capture: CaptureForPollBound,
    query: string,
    slashInvocation: string,
  ): Promise<number> {
    const pending = [message("user", query)];
    let polls = 0;
    const observed = await captureLoudFailure(async () =>
      capture(
        {
          getEntries: () => pending,
          prompt: async () => {
            failLoudly(
              `${options.bug}: a slice with no trailing assistant entry is PENDING, so the ` +
                "drive must not re-ask it.",
            );
          },
          isIdle: () => true,
          sleep: async () => {
            polls++;
          },
        },
        0,
        slashInvocation,
      ),
    );
    // A genuinely pending slice — no trailing assistant entry at all — is the one
    // shape whose expiry may still say "never settled".
    expect(observed).toContain("never settled");
    if (polls < 2) {
      failLoudly(
        `${options.bug} precondition unmet: the drive's poll bound measured as ${polls}, too small ` +
          "to place an empty settle on its final poll.",
      );
    }
    return polls;
  }

  return { captureLoudFailure, discoverPollBound };
}
