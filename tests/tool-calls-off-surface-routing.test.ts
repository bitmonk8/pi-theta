// V14c-T — failing tests for the paired `V14c` "Code-side tool-call off-surface
// outcome routing" implementation leaf.
//
// Spec: tool-calls.md §"Outcome enumeration" (the four off-surface outcomes),
// cancellation.md §"Race semantics" (CNCL-1/CNCL-2/CNCL-3);
// pi-integration-contract/host-interfaces-core.md §"Tool execution from theta
// code" §"Outcome routing summary".
//
// The four off-surface code-tool outcomes each surface on their own channel,
// **not** all on `theta/runtime/internal-error`:
//   1. a pre-eval setup throw inside the `.theta`-callable parallel-batch adapter
//      → `{ isError: true }` (message carrying the bare callable-set name) + one
//      `theta/runtime/internal-error` diagnostic + one co-emitted `theta-system-note`;
//   2. a non-conforming return shape → `theta/runtime/internal-error`
//      {tool-return-shape} (NOT a `CodeToolError`);
//   3. a non-settling Promise → blocks at its `await` until `thetaAbort.signal`
//      fires and surfaces via the `cause: "cancelled"` path (no `internal-error`);
//   4. a post-cancel late settlement → discarded per CNCL-1/CNCL-2/CNCL-3 (no
//      `internal-error`).
//
// Each test reds on its own primary assertion because the V14c behaviour is
// absent: `routeThetaCallableSetupThrow` returns an inert non-error empty
// envelope and emits nothing; `routeToolReturnShape` returns an inert
// `conforming` outcome; `awaitToolSettlementOrAbort` returns an inert `settled`
// sentinel (without awaiting a never-settling dispatch, so nothing hangs); and
// `discardPostCancelSettlement` forwards the late settlement (the non-discarding
// behaviour CNCL-1/2/3 forbid). No test reds on a compile error, a missing
// fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import type { ThetaValue } from "../src/runtime/value";
import type {
  AgentToolResultEnvelope,
  ToolLoweringSink,
} from "../src/runtime/tool-call-execute";
import {
  awaitToolSettlementOrAbort,
  discardPostCancelSettlement,
  routeThetaCallableSetupThrow,
  routeToolReturnShape,
  type LateSettlementObserver,
} from "../src/runtime/tool-call-off-surface";

const SITE: { file: string; range: SourceRange } = {
  file: "call.theta",
  range: { start: { line: 3, column: 5 }, end: { line: 3, column: 9 } },
};

/**
 * A `ToolLoweringSink` recording every normative side-channel emission so a test
 * can count diagnostics / system notes and assert on the emitted diagnostic
 * shape.
 */
class RecordingSink implements ToolLoweringSink {
  readonly diagnostics: Diagnostic[] = [];
  readonly systemNotes: string[] = [];
  diagnostic(diag: Diagnostic): void {
    this.diagnostics.push(diag);
  }
  systemNote(message: string): void {
    this.systemNotes.push(message);
  }
}

/** A `LateSettlementObserver` spy recording any forbidden post-cancel side effect. */
class SpyObserver implements LateSettlementObserver {
  readonly rebinds: ThetaValue[] = [];
  readonly errs: ThetaValue[] = [];
  readonly runtimeEvents: RuntimeEvent[] = [];
  readonly diagnostics: Diagnostic[] = [];
  rebind(value: ThetaValue): void {
    this.rebinds.push(value);
  }
  emitErr(error: ThetaValue): void {
    this.errs.push(error);
  }
  emitRuntimeEvent(event: RuntimeEvent): void {
    this.runtimeEvents.push(event);
  }
  diagnostic(diag: Diagnostic): void {
    this.diagnostics.push(diag);
  }
}

// ===========================================================================
// (1) Pre-eval setup throw inside the `.theta`-callable parallel-batch adapter →
// `{ isError: true }` (bare callable-set name) + one `theta/runtime/internal-error`
// diagnostic + one `theta-system-note` (tool-calls.md §"Outcome enumeration").
// ===========================================================================

// cka-13 / V14c: the TOOL code-keyed obligation area's off-surface outcome-routing
// facet closes on V14c; the assertions in this file witness that facet — each of
// the four off-surface outcomes on its own channel — against the shipped router.
describe("V14c-T — pre-eval setup throw inside the `.theta`-callable adapter (tool-calls.md §Outcome enumeration)", () => {
  it("translates the captured setup throw into a clean { isError: true } value carrying the bare callable-set name", () => {
    const sink = new RecordingSink();
    const result = routeThetaCallableSetupThrow(
      new Error("boom"),
      "summarise",
      SITE,
      sink,
    );

    // The adapter returns a clean { isError: true } envelope to Pi normally.
    expect(result.isError, "adapter returns { isError: true } to Pi").toBe(true);
    // Its single text block carries the bare callable-set name (post-`as`,
    // post-hyphen→underscore rewrite) — deliberately NOT the slash-prefixed form.
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toBe(
      "theta summarise aborted with internal error: boom",
    );
    // Not the slash-prefixed user-facing framing.
    expect(result.content[0]?.text).not.toContain("theta /summarise");
  });

  it("emits exactly one theta/runtime/internal-error diagnostic and exactly one theta-system-note in parallel", () => {
    const sink = new RecordingSink();
    const thrown = new Error("boom");
    thrown.stack = "Error: boom\n    at adapter (call.theta:3:5)";
    routeThetaCallableSetupThrow(thrown, "summarise", SITE, sink);

    // Exactly one internal-error diagnostic so an operator observes the failure
    // even though the model's surface is the tool result.
    expect(sink.diagnostics).toHaveLength(1);
    const diag = sink.diagnostics[0]!;
    expect(diag.code).toBe("theta/runtime/internal-error");
    // Message template from code-registry-runtime.md: `internal error: <error.message>`.
    expect(diag.message).toBe("internal error: boom");
    // Hint carries the underlying error.stack for operator triage.
    expect(diag.hint).toBe("Error: boom\n    at adapter (call.theta:3:5)");
    // Exactly one co-emitted theta-system-note.
    expect(sink.systemNotes).toHaveLength(1);
  });

  it("renders `<no stack available>` in the diagnostic hint when the throw carries no stack", () => {
    const sink = new RecordingSink();
    const thrown = new Error("boom");
    thrown.stack = "";
    routeThetaCallableSetupThrow(thrown, "summarise", SITE, sink);

    expect(sink.diagnostics).toHaveLength(1);
    expect(sink.diagnostics[0]?.hint).toBe("<no stack available>");
  });
});

// ===========================================================================
// (2) Non-conforming return shape → `theta/runtime/internal-error`
// {tool-return-shape}, NOT a `CodeToolError` (host-interfaces-core.md §"Tool
// execution from theta code").
// ===========================================================================

describe("V14c-T — non-conforming return shape routes to internal-error{tool-return-shape} (host-interfaces-core.md §Tool execution from theta code)", () => {
  it("a resolved value that is not an object routes to internal-error with details.kind = 'tool-return-shape'", () => {
    const sink = new RecordingSink();
    const outcome = routeToolReturnShape(42, "read", SITE, sink);

    expect(outcome.kind, "non-object return is a return-shape defect").toBe(
      "return-shape-defect",
    );
    if (outcome.kind === "return-shape-defect") {
      expect(outcome.diagnostic.code).toBe("theta/runtime/internal-error");
      expect(outcome.diagnostic.details?.kind).toBe("tool-return-shape");
      expect(outcome.diagnostic.details?.tool_name).toBe("read");
      // First-failing check in inspection order: the resolved value is not an object.
      expect(outcome.diagnostic.details?.shape_check).toBe("resolved-not-object");
    }
  });

  it("a value whose `content` is not iterable routes to internal-error{tool-return-shape} shape_check='content-not-iterable'", () => {
    const sink = new RecordingSink();
    const outcome = routeToolReturnShape({ content: 7 }, "read", SITE, sink);

    expect(outcome.kind).toBe("return-shape-defect");
    if (outcome.kind === "return-shape-defect") {
      expect(outcome.diagnostic.details?.kind).toBe("tool-return-shape");
      expect(outcome.diagnostic.details?.shape_check).toBe("content-not-iterable");
    }
  });

  it("a content entry missing `type` routes to internal-error{tool-return-shape} shape_check='entry-missing-type'", () => {
    const sink = new RecordingSink();
    const outcome = routeToolReturnShape(
      { content: [{ text: "no type here" }] },
      "read",
      SITE,
      sink,
    );

    expect(outcome.kind).toBe("return-shape-defect");
    if (outcome.kind === "return-shape-defect") {
      expect(outcome.diagnostic.details?.shape_check).toBe("entry-missing-type");
    }
  });

  it("a `type: 'text'` entry missing `text` routes to internal-error{tool-return-shape} shape_check='entry-missing-text'", () => {
    const sink = new RecordingSink();
    const outcome = routeToolReturnShape(
      { content: [{ type: "text" }] },
      "read",
      SITE,
      sink,
    );

    expect(outcome.kind).toBe("return-shape-defect");
    if (outcome.kind === "return-shape-defect") {
      expect(outcome.diagnostic.details?.shape_check).toBe("entry-missing-text");
    }
  });

  it("the return-shape defect is NOT observable as a CodeToolError (routed off the CodeToolError surface)", () => {
    const sink = new RecordingSink();
    const outcome = routeToolReturnShape("not an object", "read", SITE, sink);

    // The disposition is the runtime-defect surface, never a CodeToolError value
    // theta code could `match` on.
    expect(outcome.kind).not.toBe("conforming");
    if (outcome.kind === "return-shape-defect") {
      // The only surface is the internal-error diagnostic — carrying no code_tool tag.
      expect(outcome.diagnostic.code).toBe("theta/runtime/internal-error");
      expect((outcome.diagnostic as { kind?: string }).kind).not.toBe("code_tool");
    }
  });

  it("a conforming { content } envelope lowers to Ok(<joined text>) with no defect surface", () => {
    const sink = new RecordingSink();
    const outcome = routeToolReturnShape(
      { content: [{ type: "text", text: "one" }, { type: "text", text: "two" }] },
      "read",
      SITE,
      sink,
    );

    expect(outcome.kind, "well-formed envelope is conforming").toBe("conforming");
    if (outcome.kind === "conforming") {
      expect(outcome.result.ok).toBe(true);
      if (outcome.result.ok) {
        expect(outcome.result.value).toBe("one\ntwo");
      }
    }
    // A conforming lowering emits nothing on the defect channels.
    expect(sink.diagnostics).toEqual([]);
  });
});

// ===========================================================================
// (3) Non-settling Promise → blocks at its `await` until `thetaAbort.signal`
// fires and surfaces via the `cause: "cancelled"` path, with NO internal-error
// (tool-calls.md §"Outcome enumeration"; NOCEIL-1).
// ===========================================================================

describe("V14c-T — non-settling Promise surfaces via the cancelled path (tool-calls.md §Outcome enumeration)", () => {
  it("a never-settling execute() Promise blocks until thetaAbort fires, then surfaces cause: 'cancelled' with no internal-error", async () => {
    const sink = new RecordingSink();
    const controller = new AbortController();
    // A Promise that never settles — theta 1.0 makes no internal timeout attempt.
    const neverSettles = (): Promise<AgentToolResultEnvelope> =>
      new Promise<AgentToolResultEnvelope>(() => {
        // deliberately never resolve or reject
      });

    // Start the call, then fire thetaAbort so the blocked `await` observes it.
    const pending = awaitToolSettlementOrAbort(neverSettles, controller.signal, "read", sink);
    controller.abort();
    const outcome = await pending;

    // The non-settling Promise surfaces through the existing cancelled path.
    expect(outcome.kind, "non-settling Promise surfaces via cancelled path").toBe(
      "cancelled",
    );
    if (outcome.kind === "cancelled") {
      expect(outcome.error.kind).toBe("code_tool");
      expect(outcome.error.cause).toBe("cancelled");
    }
    // No internal-error is emitted on the cancelled path.
    expect(
      sink.diagnostics.filter((d) => d.code === "theta/runtime/internal-error"),
      "no internal-error on the cancelled path",
    ).toEqual([]);
  });

  it("a Promise that settles before the signal fires surfaces the settled envelope (not cancelled)", async () => {
    const sink = new RecordingSink();
    const controller = new AbortController();
    const settles = async (): Promise<AgentToolResultEnvelope> => ({
      content: [{ type: "text", text: "done" }],
    });

    const outcome = await awaitToolSettlementOrAbort(settles, controller.signal, "read", sink);

    expect(outcome.kind, "a settling Promise is not cancelled").toBe("settled");
    if (outcome.kind === "settled") {
      expect(outcome.envelope.content).toHaveLength(1);
    }
  });
});

// ===========================================================================
// (4) Post-cancel late settlement → discarded per CNCL-1 / CNCL-2 / CNCL-3, and
// emits no internal-error (cancellation.md §"Race semantics").
// ===========================================================================

describe("V14c-T — post-cancel late settlement is discarded (cancellation.md §Race semantics CNCL-1/2/3)", () => {
  it("CNCL-1: a late resolve after cancellation surfaced does NOT rebind the call site", () => {
    const observer = new SpyObserver();
    discardPostCancelSettlement(
      { kind: "resolve", envelope: { content: [{ type: "text", text: "late" }] } },
      observer,
    );
    // CNCL-1 — the runtime MUST NOT rebind the call site to the late value.
    expect(observer.rebinds, "CNCL-1: no rebind of the call site").toEqual([]);
  });

  it("CNCL-2: a late reject after cancellation surfaced does NOT emit a second Err", () => {
    const observer = new SpyObserver();
    discardPostCancelSettlement(
      { kind: "reject", reason: new Error("late reject") },
      observer,
    );
    // CNCL-2 — the runtime MUST NOT emit a second `Err` for the same invocation.
    expect(observer.errs, "CNCL-2: no second Err").toEqual([]);
  });

  it("CNCL-3: a late reject after cancellation surfaced does NOT emit a second RuntimeEvent", () => {
    const observer = new SpyObserver();
    discardPostCancelSettlement(
      { kind: "reject", reason: new Error("late reject") },
      observer,
    );
    // CNCL-3 — the runtime MUST NOT emit a second `RuntimeEvent` for the same invocation.
    expect(observer.runtimeEvents, "CNCL-3: no second RuntimeEvent").toEqual([]);
  });

  it("CNCL-2/CNCL-3: an OOM-style late reject is still discarded — no internal-error of any severity", () => {
    const observer = new SpyObserver();
    // A late rejection whose .message would otherwise be diagnostic-worthy — promotion
    // to theta/runtime/internal-error would re-introduce the second-event surface CNCL-2/3 forbid.
    discardPostCancelSettlement(
      { kind: "reject", reason: new Error("JavaScript heap out of memory") },
      observer,
    );
    expect(
      observer.diagnostics.filter((d) => d.code === "theta/runtime/internal-error"),
      "no internal-error promoted from a discarded late reject",
    ).toEqual([]);
  });
});
