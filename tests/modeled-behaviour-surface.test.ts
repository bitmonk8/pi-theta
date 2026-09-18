import { describe, expect, it } from "vitest";
import type { ResponseEvent } from "./harness/index";
import { assertDeterministicReplay, harnessDouble } from "./helpers/response-program-harness";

// H4c — modeled-behaviour response-programming surface. This is a horizontal
// (Convention.) leaf: the assertions below ARE the inline self-check its "Ships
// when" gate names — `npm test` exercises the modeled-behaviour surface through
// H4a's harness and the self-check passes, including the determinism gate and
// the per-category functional-effect assertions (f)–(g). The modeled-behaviour
// extension of H4b's surface carries the two scripted-injection categories whose
// authoring complexity comes from modelling not-yet-authored slice contracts,
// resolved by treating this harness contract as authoritative for `V4c` / `V4f`
// / `V9i` / `V9o`:
//
//   (f) completed-invoke-child — the no-rollback completed-invoke-child contract
//       per error-model.md ERR-13 (the V4f vector): a nested invoke(...) child
//       driven to completion surfaces its produced final value as an observable
//       completed-invoke-child outcome.
//   (g) subagent-mode callee — a private subagent AgentSession dispatched per the
//       V9i subagent-mode session contract (subagent.md; PIC-43 terminal
//       agent_end extraction), the V4c vector: the callee's outcome surfaces as
//       an observable subagent-theta outcome, modelled on the subagent-mode
//       session contract rather than a plain scripted turn.
//
// The surface is reached through H4a's harness: `loadExtension(...).double`
// owns the `responses` programmer and the `driveResponses()` drive.

// --- Convention: end-to-end harness — determinism gate -----------------------

describe("H4c — modeled-behaviour surface determinism (Convention: end-to-end harness)", () => {
  // Build a program covering both modeled-behaviour categories (f)+(g) — a
  // subagent callee whose private session retries once before terminating, and
  // two completed invoke-children — on a fresh harness-loaded double.
  function scriptModeledCategories(
    double: ReturnType<typeof harnessDouble>,
  ): void {
    double.responses
      // (f) two nested invoke-children driven to completion
      .scriptInvokeChild({ childName: "child-a", finalValue: "alpha" })
      .scriptInvokeChild({ childName: "child-b", finalValue: "beta" })
      // (g) a subagent callee: an interim willRetry:true event (ignored) then
      // the terminal willRetry:false event the outcome resolves from
      .scriptSubagentCallee({
        thetaName: "sub.theta",
        agentEnds: [
          { value: "interim", willRetry: true },
          { value: "final", willRetry: false },
        ],
      });
  }

  it("replays the same scripted modeled inputs to the same transcript on every run", () => {
    assertDeterministicReplay(scriptModeledCategories);
  });
});

// --- Convention: end-to-end harness — per-category functional effect ---------

describe("H4c — (f) completed-invoke-child outcome (Convention: end-to-end harness)", () => {
  // error-model.md ERR-13 (no rollback): an invoke child that has run to its
  // terminal event remains final; the parent observes its produced final value.
  it("surfaces a scripted invoke-child completion's produced final value as a completed-invoke-child outcome", () => {
    const double = harnessDouble();
    double.responses.scriptInvokeChild({
      childName: "compute",
      finalValue: "42",
    });
    const t = double.driveResponses();

    const outcome = t.find((e) => e.kind === "completed-invoke-child");
    expect(outcome).toEqual({
      kind: "completed-invoke-child",
      childName: "compute",
      finalValue: "42",
    });
  });

  it("surfaces each of several completed invoke-children in scripted order (ERR-13 no-rollback)", () => {
    const double = harnessDouble();
    double.responses
      .scriptInvokeChild({ childName: "one", finalValue: "1" })
      .scriptInvokeChild({ childName: "two", finalValue: "2" });
    const t = double.driveResponses();

    const outcomes = t.filter(
      (e): e is Extract<ResponseEvent, { kind: "completed-invoke-child" }> =>
        e.kind === "completed-invoke-child",
    );
    expect(outcomes.map((o) => [o.childName, o.finalValue])).toEqual([
      ["one", "1"],
      ["two", "2"],
    ]);
  });
});

describe("H4c — (g) subagent-mode callee outcome (Convention: end-to-end harness)", () => {
  // subagent.md V9i: a private in-memory AgentSession is spawned
  // (createAgentSession) and the outcome is extracted from the TERMINAL
  // agent_end event, ignoring willRetry:true events (PIC-43).
  it("surfaces a scripted subagent-mode callee's outcome as a subagent-theta outcome", () => {
    const double = harnessDouble();
    double.responses.scriptSubagentCallee({
      thetaName: "reviewer.theta",
      agentEnds: [{ value: "approved", willRetry: false }],
    });
    const t = double.driveResponses();

    // Modelled on the V9i session contract: a private session is spawned, then
    // the outcome surfaces as a subagent-theta outcome — not a plain (a) turn.
    expect(t).toEqual([
      { kind: "subagent-spawn", thetaName: "reviewer.theta" },
      { kind: "subagent-theta", thetaName: "reviewer.theta", finalValue: "approved" },
    ]);
    // The outcome is a subagent-theta outcome, not an ordinary assistant turn:
    // no fragment / turn-end events are emitted for the private session.
    expect(t.some((e) => e.kind === "fragment" || e.kind === "turn-end")).toBe(false);
  });

  it("resolves the outcome from the terminal agent_end, ignoring willRetry:true events (PIC-43)", () => {
    const double = harnessDouble();
    double.responses.scriptSubagentCallee({
      thetaName: "sub.theta",
      agentEnds: [
        { value: "decoy-1", willRetry: true },
        { value: "decoy-2", willRetry: true },
        { value: "terminal", willRetry: false },
      ],
    });
    const t = double.driveResponses();

    const outcome = t.find(
      (e): e is Extract<ResponseEvent, { kind: "subagent-theta" }> =>
        e.kind === "subagent-theta",
    );
    // The willRetry:true decoys do NOT resolve the query; only the terminal
    // willRetry:false event's value surfaces.
    expect(outcome?.finalValue).toBe("terminal");
  });

  it("fails loudly when a scripted subagent callee never reaches a terminal agent_end", () => {
    const double = harnessDouble();
    double.responses.scriptSubagentCallee({
      thetaName: "never.theta",
      agentEnds: [{ value: "x", willRetry: true }],
    });
    // A subagent query with no terminal agent_end is a scripting error and is
    // modelled deterministically as a throw rather than a hang.
    expect(() => double.driveResponses()).toThrow(/no terminal agent_end/);
  });
});
