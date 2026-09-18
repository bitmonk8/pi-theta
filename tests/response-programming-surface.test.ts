import { describe, expect, it } from "vitest";
import type { ResponseEvent } from "./harness/index";
import { assertDeterministicReplay, harnessDouble } from "./helpers/response-program-harness";

// H4b — response-programming surface. This is a horizontal (Convention.) leaf:
// the assertions below ARE the inline test surface its "Ships when" gate names —
// `npm test` exercises the response-programming surface through H4a's harness
// and the self-check passes, including the determinism gate and the per-category
// functional-effect assertions (a)–(e). Each block cites the conventions.md
// phase category it operationalises and the spec behaviour model the scripted
// injection is asserted against.
//
//   (a) conversation-drive.md streamed assistant turns / fragments
//   (b) binder-bypass-and-envelope.md tool_use results; V14b mixed batch
//   (c) determinism-cancellation-failure.md §"Failure-class taxonomy" + the
//       per-invocation retry budget (V11f)
//   (d) queryerror-variants.md ERR-19 + frontmatter-fields-b-and-templates.md
//       FRNT-1 (V13c)
//   (e) cancellation.md abort injection (V11f / V17a)
//
// The surface is reached through H4a's harness: `loadExtension(...).double`
// owns the `responses` programmer and the `driveResponses()` drive.

// --- Convention: end-to-end harness — determinism gate -----------------------

describe("H4b — response-programming surface determinism (Convention: end-to-end harness)", () => {
  // Build a program covering categories (a)–(d) (no abort short-circuit, so all
  // phases are observable in one transcript) on a fresh harness-loaded double.
  function scriptAllCategories(double: ReturnType<typeof harnessDouble>): void {
    double.responses
      // (a) two assistant turns, fragments per turn
      .scriptAssistantTurns([
        { fragments: ["Hel", "lo"] },
        { fragments: ["wor", "ld"] },
      ])
      // (b) tool_use results consumed by the (d) tool loop, incl. an error
      .scriptToolResult({ toolUseId: "t1", toolName: "read", content: "ok", isError: false })
      .scriptToolResult({ toolUseId: "t2", toolName: "write", content: "boom", isError: true })
      // (c) a transport failure then a terminal ok
      .scriptBinderAttempts([{ outcome: "transport" }, { outcome: "ok" }])
      // (d) two non-terminating rounds → exhaustion at max_rounds = 2
      .scriptToolLoop(2, [
        { fragments: ["r0"], toolUses: ["t1", "t2"] },
        { fragments: ["r1"], toolUses: ["t1"] },
      ]);
  }

  it("replays the same scripted inputs to the same observable transcript on every run", () => {
    assertDeterministicReplay(scriptAllCategories);
  });

  it("replays each cancellation-injection point deterministically", () => {
    for (const point of ["pre-call", "in-flight", "during-retry"] as const) {
      const a = harnessDouble();
      a.responses
        .scriptBinderAttempts([{ outcome: "transport" }, { outcome: "ok" }])
        .scriptAbortAt(point);
      const b = harnessDouble();
      b.responses
        .scriptBinderAttempts([{ outcome: "transport" }, { outcome: "ok" }])
        .scriptAbortAt(point);
      expect(b.driveResponses()).toEqual(a.driveResponses());
    }
  });
});

// --- Convention: end-to-end harness — per-category functional effect ---------

describe("H4b — (a) scripted assistant turns + fragments (Convention: end-to-end harness)", () => {
  it("emits the scripted assistant turns and per-turn fragments in scripted order", () => {
    const double = harnessDouble();
    double.responses.scriptAssistantTurns([
      { fragments: ["A1", "A2"] },
      { fragments: ["B1"] },
    ]);
    const t = double.driveResponses();

    // Fragments appear in the transcript in the scripted order, grouped by turn.
    const fragments = t.filter(
      (e): e is Extract<ResponseEvent, { kind: "fragment" }> => e.kind === "fragment",
    );
    expect(fragments.map((f) => [f.turn, f.text])).toEqual([
      [0, "A1"],
      [0, "A2"],
      [1, "B1"],
    ]);
    // Exactly one turn-end per scripted turn, in order.
    expect(
      t.filter((e) => e.kind === "turn-end").map((e) => (e as { turn: number }).turn),
    ).toEqual([0, 1]);
  });
});

describe("H4b — (b) tool_use results incl. isError + mixed parallel batch (Convention: end-to-end harness)", () => {
  it("surfaces a scripted isError:true tool-result as an error tool-result", () => {
    const double = harnessDouble();
    double.responses
      .scriptToolResult({ toolUseId: "x", toolName: "write", content: "failed", isError: true })
      .scriptAssistantTurns([{ fragments: [], toolUses: ["x"] }]);
    const t = double.driveResponses();

    const result = t.find((e) => e.kind === "tool-result");
    expect(result).toEqual({
      kind: "tool-result",
      toolUseId: "x",
      toolName: "write",
      content: "failed",
      isError: true,
    });
  });

  it("lowers each sibling of a mixed-success parallel tool_use batch independently (V14b)", () => {
    const double = harnessDouble();
    double.responses
      .scriptToolResult({ toolUseId: "ok1", toolName: "read", content: "data", isError: false })
      .scriptToolResult({ toolUseId: "bad1", toolName: "write", content: "denied", isError: true })
      // one parallel batch emitting both siblings
      .scriptAssistantTurns([{ fragments: [], toolUses: ["ok1", "bad1"] }]);
    const t = double.driveResponses();

    const results = t.filter(
      (e): e is Extract<ResponseEvent, { kind: "tool-result" }> => e.kind === "tool-result",
    );
    // Both siblings present; outcomes lowered independently — one ok, one error.
    expect(results.map((r) => [r.toolUseId, r.isError])).toEqual([
      ["ok1", false],
      ["bad1", true],
    ]);
  });
});

describe("H4b — (c) binder failure / retry path (Convention: end-to-end harness)", () => {
  // determinism-cancellation-failure.md §"Failure-class taxonomy" + the
  // per-invocation retry budget: ≤3 binder calls (1 + 1 transport + 1 malformed).
  it("drives the transport-class failure → retry path observably", () => {
    const double = harnessDouble();
    double.responses.scriptBinderAttempts([
      { outcome: "transport" },
      { outcome: "transport" },
    ]);
    const t = double.driveResponses();

    expect(t.filter((e) => e.kind === "binder-call")).toHaveLength(2);
    expect(
      t.filter((e) => e.kind === "binder-failure").map(
        (e) => (e as { failureClass: string }).failureClass,
      ),
    ).toEqual(["transport", "transport"]);
    // Exactly one transport retry consumed; the second failure is terminal.
    expect(t.filter((e) => e.kind === "binder-retry")).toEqual([
      { kind: "binder-retry", failureClass: "transport" },
    ]);
    expect(t.at(-1)).toEqual({ kind: "binder-surfaced-failure", failureClass: "transport" });
  });

  it("drives the malformed-envelope-class failure → retry path observably", () => {
    const double = harnessDouble();
    double.responses.scriptBinderAttempts([
      { outcome: "malformed-envelope" },
      { outcome: "malformed-envelope" },
    ]);
    const t = double.driveResponses();

    expect(t.filter((e) => e.kind === "binder-call")).toHaveLength(2);
    expect(t.filter((e) => e.kind === "binder-retry")).toEqual([
      { kind: "binder-retry", failureClass: "malformed-envelope" },
    ]);
    expect(t.at(-1)).toEqual({
      kind: "binder-surfaced-failure",
      failureClass: "malformed-envelope",
    });
  });

  it("honours the V11f per-invocation budget: ≤3 calls, both class retries, then ok", () => {
    const double = harnessDouble();
    // transport (retry), malformed (retry), ok → 3 calls, both budgets consumed.
    double.responses.scriptBinderAttempts([
      { outcome: "transport" },
      { outcome: "malformed-envelope" },
      { outcome: "ok" },
    ]);
    const t = double.driveResponses();

    expect(t.filter((e) => e.kind === "binder-call")).toHaveLength(3);
    expect(
      t.filter((e) => e.kind === "binder-retry").map(
        (e) => (e as { failureClass: string }).failureClass,
      ),
    ).toEqual(["transport", "malformed-envelope"]);
    expect(t.at(-1)).toEqual({ kind: "binder-outcome", envelopeKind: "ok" });
  });

  it("never issues more than 3 binder calls even when more attempts are scripted", () => {
    const double = harnessDouble();
    double.responses.scriptBinderAttempts([
      { outcome: "transport" },
      { outcome: "malformed-envelope" },
      { outcome: "transport" },
      { outcome: "transport" },
    ]);
    const t = double.driveResponses();
    expect(t.filter((e) => e.kind === "binder-call").length).toBeLessThanOrEqual(3);
  });

  it("surfaces a terminal envelope outcome (needs_info) without retry", () => {
    const double = harnessDouble();
    double.responses.scriptBinderAttempts([{ outcome: "needs_info" }]);
    const t = double.driveResponses();
    expect(t).toEqual([
      { kind: "binder-call", attempt: 0 },
      { kind: "binder-outcome", envelopeKind: "needs_info" },
    ]);
  });
});

describe("H4b — (d) tool_loop.max_rounds round-exhaustion (Convention: end-to-end harness)", () => {
  // ERR-19 + FRNT-1: reaching max_rounds without a terminating turn produces
  // the tool_loop_exhausted observable.
  it("produces the round-exhaustion observable at max_rounds", () => {
    const double = harnessDouble();
    double.responses
      .scriptToolResult({ toolUseId: "t", toolName: "read", content: "x", isError: false })
      .scriptToolLoop(2, [
        { fragments: ["r0"], toolUses: ["t"] },
        { fragments: ["r1"], toolUses: ["t"] },
      ]);
    const t = double.driveResponses();

    // Two rounds executed, then exhaustion at the cap.
    expect(t.filter((e) => e.kind === "turn-end")).toHaveLength(2);
    expect(t.at(-1)).toEqual({ kind: "tool-loop-exhausted", rounds: 2 });
  });

  it("max_rounds: 0 disables model-driven tool calls — immediate exhaustion, no tool-result", () => {
    const double = harnessDouble();
    double.responses
      .scriptToolResult({ toolUseId: "t", toolName: "read", content: "x", isError: false })
      .scriptToolLoop(0, [{ fragments: ["r0"], toolUses: ["t"] }]);
    const t = double.driveResponses();
    expect(t).toEqual([{ kind: "tool-loop-exhausted", rounds: 0 }]);
  });

  it("a terminating turn (no tool_use) ends the loop normally — no exhaustion", () => {
    const double = harnessDouble();
    double.responses.scriptToolLoop(5, [{ fragments: ["done"], toolUses: [] }]);
    const t = double.driveResponses();
    expect(t.some((e) => e.kind === "tool-loop-exhausted")).toBe(false);
    expect(t.filter((e) => e.kind === "turn-end")).toHaveLength(1);
  });
});

describe("H4b — (e) abort injection at each chosen point (Convention: end-to-end harness)", () => {
  // cancellation.md: an abort injected pre-call, during an in-flight provider
  // call, and during a budgeted retry each surfaces the cancellation observable.
  it("pre-call abort surfaces the cancellation observable before any binder call", () => {
    const double = harnessDouble();
    double.responses
      .scriptBinderAttempts([{ outcome: "ok" }])
      .scriptAbortAt("pre-call");
    const t = double.driveResponses();
    expect(t).toEqual([{ kind: "cancelled", point: "pre-call" }]);
    expect(t.some((e) => e.kind === "binder-call")).toBe(false);
  });

  it("in-flight abort surfaces the cancellation observable during the initial provider call", () => {
    const double = harnessDouble();
    double.responses
      .scriptBinderAttempts([{ outcome: "ok" }])
      .scriptAbortAt("in-flight");
    const t = double.driveResponses();
    // The initial call was issued, then the in-flight abort surfaced.
    expect(t).toEqual([
      { kind: "binder-call", attempt: 0 },
      { kind: "cancelled", point: "in-flight" },
    ]);
  });

  it("abort during a budgeted retry suppresses the retry and surfaces cancellation", () => {
    const double = harnessDouble();
    // First attempt is a transport failure → a retry is budgeted; the abort
    // lands on that retry and suppresses it.
    double.responses
      .scriptBinderAttempts([{ outcome: "transport" }, { outcome: "ok" }])
      .scriptAbortAt("during-retry");
    const t = double.driveResponses();

    expect(t).toEqual([
      { kind: "binder-call", attempt: 0 },
      { kind: "binder-failure", failureClass: "transport", attempt: 0 },
      { kind: "binder-retry", failureClass: "transport" },
      { kind: "cancelled", point: "during-retry" },
    ]);
    // The suppressed retry was never issued as a second binder call.
    expect(t.filter((e) => e.kind === "binder-call")).toHaveLength(1);
  });
});
