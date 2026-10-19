// Bug 0503 causal units. These exercise the real producer-side predicate and
// runtime readers, without a session/clock double. In this no-drift layout the
// own user is exactly at turnStart; a later user opens a FOREIGN turn.
// Ownership-aware extraction is a caller obligation: trailing-turn helpers
// intentionally have no attempt token. The green reader cells demonstrate
// the difference between passing the whole session and passing an own slice;
// they do not propose changing those helpers' trailing-turn contract.
import { describe, expect, it } from "vitest";
import type { Message } from "@earendil-works/pi-ai";
import { thisTurnSettled } from "../src/extension/turn-settlement";
import { extractTrailingTurnText } from "../src/runtime/conversation-drive";
import { probePostTurnFailure } from "../src/runtime/prompt-transport-mapping";
import { assistant, assistantMessage, user } from "./helpers/agent-message-fixtures";

const OWN_REPLY = "driven calculation: 777";
const FOREIGN_REPLY = "foreign calculation: 222";
const HISTORY: readonly Message[] = [user("an earlier query"), assistant("earlier reply")];
const TURN_START = HISTORY.length;
const OWN_USER = user("our query");
const FOREIGN_USER = user("a different writer's query");
const PROBE = { aborted: false, provider: "fixture-provider", excludeCancelled: false } as const;

function expectOwnStillSettled(actual: boolean): void {
  expect(actual, "B0503_OWN_SETTLED: a later unanswered foreign user must not unsettle our committed reply").toBe(true);
}

function expectOwnUnanswered(actual: boolean): void {
  expect(actual, "B0503_NO_BORROWED_SETTLE: a foreign assistant must not settle our unanswered own turn").toBe(false);
}

describe("bug 0503 own-turn settledness, exact no-drift anchor", () => {
  it("healthy control: a previously settled turn cannot stand in for an absent own send", () => {
    expectOwnUnanswered(thisTurnSettled(HISTORY, TURN_START, []));
  });

  it("healthy control: our user alone is unanswered despite the earlier reply", () => {
    expectOwnUnanswered(thisTurnSettled([...HISTORY, OWN_USER], TURN_START, []));
  });

  it("healthy control: our committed reply settles our turn", () => {
    expectOwnStillSettled(thisTurnSettled([...HISTORY, OWN_USER, assistant(OWN_REPLY)], TURN_START, []));
  });

  it("healthy control: an empty-text normal assistant is a definite ending", () => {
    expectOwnStillSettled(thisTurnSettled([
      ...HISTORY, OWN_USER, assistantMessage({ stopReason: "stop" }),
    ], TURN_START, []));
  });

  it("red-direction controls: both ownership assertions reject the opposite boolean", () => {
    expect(() => expectOwnStillSettled(false)).toThrow(/B0503_OWN_SETTLED/);
    expect(() => expectOwnUnanswered(true)).toThrow(/B0503_NO_BORROWED_SETTLE/);
  });

  it("regression: own committed reply remains settled when a foreign user lands without a reply", () => {
    const messages = [...HISTORY, OWN_USER, assistant(OWN_REPLY), FOREIGN_USER];
    expect(messages[TURN_START]).toBe(OWN_USER);
    expectOwnStillSettled(thisTurnSettled(messages, TURN_START, []));
  });

  it("regression: a later completed foreign turn cannot supply the own turn's missing ending", () => {
    const messages = [...HISTORY, OWN_USER, FOREIGN_USER, assistant(FOREIGN_REPLY)];
    expect(messages[TURN_START]).toBe(OWN_USER);
    expectOwnUnanswered(thisTurnSettled(messages, TURN_START, []));
  });
});

describe("bug 0503 trailing-reader boundary controls (not ownership-aware APIs)", () => {
  it("the whole session selects foreign text, whereas the bounded own slice selects only own text", () => {
    const messages = [...HISTORY, OWN_USER, assistant(OWN_REPLY), FOREIGN_USER, assistant(FOREIGN_REPLY)];
    expect(extractTrailingTurnText(messages)).toBe(FOREIGN_REPLY);
    expect(extractTrailingTurnText(messages.slice(TURN_START, TURN_START + 2))).toBe(OWN_REPLY);
  });

  it("bounded extraction retains all own assistant text, not just the final assistant", () => {
    const messages = [OWN_USER, assistant("own tool-round narration"), assistant(OWN_REPLY), FOREIGN_USER, assistant(FOREIGN_REPLY)];
    expect(extractTrailingTurnText(messages.slice(0, 3))).toBe(`own tool-round narration\n${OWN_REPLY}`);
    expect(extractTrailingTurnText(messages)).toBe(FOREIGN_REPLY);
  });

  it("the unbounded probe hides an own length ending behind a foreign normal ending", () => {
    const messages = [OWN_USER, assistantMessage({ text: "own partial", stopReason: "length" }), FOREIGN_USER, assistant(FOREIGN_REPLY)];
    expect(probePostTurnFailure(messages, PROBE)).toBeUndefined();
    expect(probePostTurnFailure(messages.slice(0, 2), PROBE)).toMatchObject({ kind: "context_overflow", raw_response: "own partial" });
  });

  it("the unbounded probe attributes a foreign length ending to a healthy own turn", () => {
    const messages = [OWN_USER, assistant(OWN_REPLY), FOREIGN_USER, assistantMessage({ text: "foreign partial", stopReason: "length" })];
    expect(probePostTurnFailure(messages, PROBE)).toMatchObject({ kind: "context_overflow", raw_response: "foreign partial" });
    expect(probePostTurnFailure(messages.slice(0, 2), PROBE)).toBeUndefined();
  });

  it("the bounded own probe retains cancellation precedence", () => {
    const messages = [OWN_USER, assistant(OWN_REPLY)];
    expect(probePostTurnFailure(messages, { ...PROBE, aborted: true })).toMatchObject({ kind: "cancelled" });
  });
});
