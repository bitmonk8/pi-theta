// V4c-T — failing tests for the paired `V4c` terminal-outcomes / partial-append
// leaf.
//
// Spec: errors-and-results/error-model.md (§"Partial-append contract", §"No
// rollback", and the mid-stream-cancellation conversation-state obligations
// ERR-8 … ERR-12); cancellation.md (§"Surfacing" — the non-mutation obligation
// toward the Pi-committed conversation).
//
// These tests red on their own non-mutation primary assertions while `V4c` is
// absent, because the V4c-T seam stub is deliberately NON-COMPLIANT:
//   - `handlePartialTerminalOutcome` truncates + rewrites a committed surface
//     (ERR-8) and injects a compensating turn (ERR-9) on every path (ERR-10)
//     and in every mode (ERR-12); the compliant impl calls nothing on the
//     mutator, so the "no mutation" / "no injection" assertions red today; and
//   - `classifyNonMutationWindow` mis-scopes the window (closes at the LAST
//     driver send, collects every append), so the ERR-11 scope assertions red.
// No test reds on a compile error, a missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import {
  classifyNonMutationWindow,
  handlePartialTerminalOutcome,
  type CommittedConversationMutator,
  type CommittedSurface,
  type PartialTerminalPath,
  type WindowTimelineEvent,
} from "../src/runtime/terminal-outcomes";
import { loadExtension, type ResponseEvent } from "./harness/index";

/**
 * A recording double of the mutating surface the runtime holds against Pi's
 * committed conversation. Every call is logged; a compliant runtime makes none
 * of them on the cancellation / `?`-propagation paths (ERR-8 / ERR-9).
 */
function makeRecordingMutator(): {
  mutator: CommittedConversationMutator;
  calls: string[];
} {
  const calls: string[] = [];
  const mutator: CommittedConversationMutator = {
    truncate: (surfaceId): void => {
      calls.push(`truncate:${surfaceId}`);
    },
    rewrite: (surfaceId, content): void => {
      calls.push(`rewrite:${surfaceId}:${content}`);
    },
    replace: (surfaceId): void => {
      calls.push(`replace:${surfaceId}`);
    },
    remove: (surfaceId): void => {
      calls.push(`remove:${surfaceId}`);
    },
    injectCompensatingTurn: (surface): void => {
      calls.push(`inject:${surface.id}`);
    },
  };
  return { mutator, calls };
}

/** The surfaces Pi committed before a mid-stream cancellation interrupted the turn. */
const COMMITTED: readonly CommittedSurface[] = [
  { kind: "assistant-tokens", id: "asst-1", content: "partial assistant tok" },
  { kind: "tool-call-card", id: "tool-1", content: "search(...)" },
  { kind: "system-note", id: "note-1", content: "loom-system-note" },
];

// ===========================================================================
// ERR-8 — mid-stream cancellation does not mutate Pi-committed surfaces.
// ===========================================================================

describe("V4c-T — ERR-8 non-mutation of committed surfaces on mid-stream cancellation", () => {
  it("ERR-8: the runtime issues no truncate / rewrite / replace / remove of any committed surface after a mid-stream cancellation", () => {
    const { mutator, calls } = makeRecordingMutator();

    handlePartialTerminalOutcome(
      { path: "cancelled", mode: "prompt", committed: COMMITTED },
      mutator,
    );

    // ERR-8: none of the mutating operations against a Pi-committed surface fire.
    const mutations = calls.filter((c) => !c.startsWith("inject:"));
    expect(mutations).toEqual([]);
  });
});

// ===========================================================================
// ERR-9 — no compensating turn is injected.
// ===========================================================================

describe("V4c-T — ERR-9 no compensating injection after mid-stream cancellation", () => {
  it("ERR-9: the runtime injects no compensating turn into the Pi-committed conversation after a mid-stream cancellation", () => {
    const { mutator, calls } = makeRecordingMutator();

    handlePartialTerminalOutcome(
      { path: "cancelled", mode: "prompt", committed: COMMITTED },
      mutator,
    );

    // ERR-9: no compensating-turn injection fires.
    const injections = calls.filter((c) => c.startsWith("inject:"));
    expect(injections).toEqual([]);
  });
});

// ===========================================================================
// ERR-10 — ERR-8/ERR-9 hold symmetrically for cancellation and `?`-propagation.
// ===========================================================================

describe("V4c-T — ERR-10 cancellation / `?`-propagation symmetry", () => {
  const paths: readonly PartialTerminalPath[] = ["cancelled", "question-propagation"];

  it.each(paths)(
    "ERR-10: neither mutation nor compensating injection fires on the %s path",
    (path) => {
      const { mutator, calls } = makeRecordingMutator();

      handlePartialTerminalOutcome({ path, mode: "prompt", committed: COMMITTED }, mutator);

      // ERR-10: the ERR-8 (no mutation) and ERR-9 (no injection) obligations
      // apply symmetrically to the cancellation path AND the `?`-propagation
      // path — the mutator is untouched on both.
      expect(calls).toEqual([]);
    },
  );
});

// ===========================================================================
// ERR-11 — the non-mutation window binds between the cancelled turn and the
// next driver send.
// ===========================================================================

describe("V4c-T — ERR-11 non-mutation window scope [cancelled-turn, next-driver-send)", () => {
  it("ERR-11: the window opens at the cancelled streaming turn and closes at the NEXT driver send, excluding respond-repair appends after that send", () => {
    // A respond-repair timeline: the cancelled streaming turn, then a
    // respond-repair append the runtime records BEFORE the next driver send
    // (inside the window), then the next driver send, then the respond-repair
    // loop's own append AFTER the send (outside the window — governed by Query
    // §respond-repair, not ERR-11), then a later, second driver send.
    const insideAppend: CommittedSurface = {
      kind: "assistant-tokens",
      id: "inside-window",
      content: "append before next send",
    };
    const outsideAppend: CommittedSurface = {
      kind: "assistant-tokens",
      id: "after-next-send",
      content: "respond-repair loop's own append",
    };
    const timeline: readonly WindowTimelineEvent[] = [
      { kind: "cancelled-turn", turnId: "cancelled-turn-1" },
      { kind: "respond-repair-append", surface: insideAppend },
      { kind: "driver-send", sendId: "next-send" },
      { kind: "respond-repair-append", surface: outsideAppend },
      { kind: "driver-send", sendId: "later-send" },
    ];

    const window = classifyNonMutationWindow(timeline);

    // ERR-11: the window binds between the cancelled turn and the NEXT driver
    // send (not a later one).
    expect(window.opensAt).toBe("cancelled-turn-1");
    expect(window.closesAt).toBe("next-send");
    // The append recorded after the next driver send is the respond-repair
    // loop's own and is NOT part of the ERR-11 window.
    expect(window.appendsInsideWindow.map((s) => s.id)).toEqual(["inside-window"]);
  });
});

// ===========================================================================
// ERR-12 — ERR-8 holds inside a subagent loom, exercised via the H4a harness
// modelling a subagent-mode callee — not the live V9i surface.
// ===========================================================================

describe("V4c-T — ERR-12 non-mutation inside a subagent loom (via the H4a harness)", () => {
  it("ERR-12: with the H4a harness modelling a subagent-mode callee, the runtime mutates none of the subagent conversation's committed surfaces on cancellation", () => {
    // Model the subagent-mode callee through the H4a / H4c harness surface
    // (category (g)), NOT the live V9i surface: a private in-memory session is
    // spawned and its outcome surfaces as a subagent-loom outcome.
    const double = loadExtension({ fixtures: [] }).double;
    double.responses.scriptSubagentCallee({
      loomName: "reviewer.loom",
      agentEnds: [{ value: "approved", willRetry: false }],
    });
    const transcript = double.driveResponses();

    // Confirm the harness modelled a subagent-mode callee (the ERR-12 context)
    // rather than a plain prompt-mode turn.
    const subagentOutcome = transcript.find(
      (e: ResponseEvent): e is Extract<ResponseEvent, { kind: "subagent-loom" }> =>
        e.kind === "subagent-loom",
    );
    expect(subagentOutcome?.loomName).toBe("reviewer.loom");

    // The subagent loom's own committed surfaces, interrupted mid-stream by a
    // cancellation inside the subagent.
    const subagentCommitted: readonly CommittedSurface[] = [
      { kind: "assistant-tokens", id: "sub-asst-1", content: "partial subagent tok" },
      { kind: "tool-call-card", id: "sub-tool-1", content: "read(...)" },
    ];
    const { mutator, calls } = makeRecordingMutator();

    handlePartialTerminalOutcome(
      { path: "cancelled", mode: "subagent", committed: subagentCommitted },
      mutator,
    );

    // ERR-12: ERR-8 holds inside the subagent loom too — no mutation and no
    // compensating injection of the subagent conversation's committed surfaces.
    expect(calls).toEqual([]);
  });
});
