import { describe, expect, it } from "vitest";
import {
  MAX_BINDER_LLM_CALLS,
  classifyBinderArgs,
  renderAjvSummary,
  renderBinderSystemNote,
  renderDepthWalkAjvSummary,
  type BinderAttemptOutcome,
} from "../src/binder/retry-taxonomy";
import { runBinderCallWithCancellation } from "../src/binder/binder-cancellation";
import {
  DEPTH_VIOLATION_MESSAGE,
  DEPTH_VIOLATION_SCHEMA_KEYWORD,
  depthWalk,
} from "../src/runtime/depth-walk";
import type { ValidationIssue } from "../src/runtime/query-error";

// V11f-T — failing tests for the paired `V11f` "Binder per-class retry budget
// and failure taxonomy" implementation (hard ceiling #3). Closes the GOV-16
// stable-inline-label family `HC3-a … HC3-e` by per-label single-leaf closure
// (hard-ceilings/ceilings-3-and-4.md §HC3), plus the §"Failure-mode templates"
// verbatim rendering and the CIO-1/CIO-3 depth-walk-fast-fail cross-ceiling
// sub-case (binder/determinism-cancellation-failure.md).
//
// The HC3-a…HC3-e budget witnesses below drive the retry budget through
// `runBinderCallWithCancellation` (binder-cancellation.ts) — the ONE
// implementation of the HC3 per-class retry budget (PTQ-0290) — with a
// never-aborting signal, so they pin the same interleave the production path
// runs; `tests/binder-call-cancellation.test.ts` covers its
// cancellation-interaction arms. Each test reds on its own primary assertion
// because the V11f runtime is absent: `runBinderCallWithCancellation` returns
// a zero-call sentinel WITHOUT issuing any attempt (so every budget test reds
// on `s.calls()`/`result.outcome`); `renderBinderSystemNote` /
// `renderAjvSummary` / `renderDepthWalkAjvSummary` return the `UNIMPLEMENTED`
// sentinel (so every template test reds on its equality assertion); and
// `classifyBinderArgs` always reports `ok`. No test reds on a compile error, a
// missing fixture, or a harness throw.
//
// Spec: binder/determinism-cancellation-failure.md (§"Failure-class taxonomy",
// §"Failure-mode templates", §"Per-invocation retry budget"),
// hard-ceilings/ceilings-3-and-4.md (§HC3, CIO-1 / CIO-3).

// A retry-budget scenario: a fixed per-attempt outcome script and a call
// counter. `attempt(i)` returns `script[i]` (or the last element for any index
// past the script end, so an over-budget call is still classified rather than
// throwing) and increments `calls`. The second `attempt` parameter is the
// cancellation signal `runBinderCallWithCancellation` forwards; these
// scenarios never abort, so it is accepted and unused.
function scenario(script: readonly BinderAttemptOutcome[]): {
  attempt: (index: number, signal: AbortSignal) => Promise<BinderAttemptOutcome>;
  calls: () => number;
} {
  let calls = 0;
  const last = script[script.length - 1];
  if (last === undefined) {
    // A scenario script is always non-empty; guard so the fallback below is a
    // defined `BinderAttemptOutcome` rather than `undefined`.
    expect.unreachable("scenario() requires a non-empty attempt script");
  }
  return {
    attempt: async (index: number, _signal: AbortSignal) => {
      calls += 1;
      return script[index] ?? last;
    },
    calls: () => calls,
  };
}

const TRANSPORT: BinderAttemptOutcome = {
  kind: "transport",
  provider: "anthropic-messages",
  message: "connection reset",
};
const MALFORMED: BinderAttemptOutcome = { kind: "malformed" };

// A never-aborting signal for the budget-interleaving scenarios below, which
// exercise the HC3 budget only.
const NO_ABORT = new AbortController().signal;

// ============================================================================
// HC3-a … HC3-e — the per-class retry budget (hard-ceilings/ceilings-3-and-4.md
// §HC3; determinism-cancellation-failure.md §"Per-invocation retry budget")
// ============================================================================

describe("V11f-T — binder per-class retry budget (ceilings-3-and-4.md §HC3)", () => {
  it("HC3-a: at most one transport-class retry per slash invocation", async () => {
    // An all-transport chain issues the initial attempt + exactly one
    // transport-class retry, then surfaces the transport row — 2 LLM calls, no
    // second transport retry (HC3-a).
    const s = scenario([TRANSPORT, TRANSPORT, TRANSPORT]);
    const result = await runBinderCallWithCancellation({
      thetaName: "code-review",
      signal: NO_ABORT,
      attempt: s.attempt,
    });
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") {
      expect.unreachable("expected a completed binder-call result");
    }
    expect(s.calls()).toBe(2);
    expect(result.outcome.kind).toBe("transport");
  });

  it("HC3-b: at most one malformed-envelope-class retry per slash invocation", async () => {
    // An all-malformed chain issues the initial attempt + exactly one
    // malformed-class retry, then surfaces the malformed row — 2 LLM calls, no
    // second malformed retry (HC3-b).
    const s = scenario([MALFORMED, MALFORMED, MALFORMED]);
    const result = await runBinderCallWithCancellation({
      thetaName: "code-review",
      signal: NO_ABORT,
      attempt: s.attempt,
    });
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") {
      expect.unreachable("expected a completed binder-call result");
    }
    expect(s.calls()).toBe(2);
    expect(result.outcome.kind).toBe("malformed");
  });

  it("HC3-c: an AJV-on-`args` failure is not retried (no per-class retry budget)", async () => {
    // A structurally valid `ok` envelope whose args fail AJV is terminal — the
    // re-prompt would not change the outcome. Exactly 1 LLM call, no retry.
    const s = scenario([
      { kind: "ajv_args", ajvSummary: "/language must be string" },
    ]);
    const result = await runBinderCallWithCancellation({
      thetaName: "code-review",
      signal: NO_ABORT,
      attempt: s.attempt,
    });
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") {
      expect.unreachable("expected a completed binder-call result");
    }
    expect(s.calls()).toBe(1);
    expect(result.outcome.kind).toBe("ajv_args");
  });

  it("HC3-d: at most three LLM calls per invocation (interleaving consumes class budget)", async () => {
    // A transport failure observed on the retry of a malformed envelope consumes
    // the transport budget (symmetrically for malformed). An interleaved chain
    // transport → malformed → transport exhausts BOTH budgets: 1 initial + 1
    // transport retry + 1 malformed retry = exactly 3 LLM calls, then surface.
    const s = scenario([TRANSPORT, MALFORMED, TRANSPORT]);
    const result = await runBinderCallWithCancellation({
      thetaName: "code-review",
      signal: NO_ABORT,
      attempt: s.attempt,
    });
    expect(result.kind).toBe("completed");
    expect(s.calls()).toBe(MAX_BINDER_LLM_CALLS);
    // No fourth attempt is ever issued (both budgets exhausted).
    expect(s.calls()).toBe(3);
  });

  it("HC3-e: the surfaced note is the most-recent failure row", async () => {
    // A chain ending in a malformed envelope renders the malformed-envelope row,
    // even though a transport failure occurred earlier in the chain. Sequence:
    // malformed (consume malformed budget) → transport (consume transport
    // budget) → malformed (both budgets exhausted → surface the MOST RECENT).
    const s = scenario([MALFORMED, TRANSPORT, MALFORMED]);
    const result = await runBinderCallWithCancellation({
      thetaName: "code-review",
      signal: NO_ABORT,
      attempt: s.attempt,
    });
    expect(s.calls()).toBe(3);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") {
      expect.unreachable("expected a completed binder-call result");
    }
    expect(result.outcome.kind).toBe("malformed");
    // The surfaced system note is the malformed-envelope row (most recent), not
    // the transport row that fired earlier.
    expect(renderBinderSystemNote("code-review", { kind: "malformed" })).toBe(
      "theta /code-review: argument binding failed \u2014 could not parse arguments",
    );
  });
});

// ============================================================================
// §"Failure-mode templates" — the six verbatim templates
// (determinism-cancellation-failure.md #failure-mode-templates-normative)
// ============================================================================

describe("V11f-T — the six failure-mode templates render verbatim (determinism-cancellation-failure.md §Failure-mode templates)", () => {
  const EM_DASH = "\u2014";

  it("renders the `needs_info` / `ambiguous` model-content rows through the em-dash grammar", () => {
    // `<model's message>` is the sanitised model content after the em-dash.
    expect(
      renderBinderSystemNote("code-review", {
        kind: "needs_info",
        message: "which repository?",
      }),
    ).toBe(
      `theta /code-review: argument binding needs more info ${EM_DASH} which repository?`,
    );
    expect(
      renderBinderSystemNote("code-review", {
        kind: "ambiguous",
        message: "be more explicit",
      }),
    ).toBe(
      `theta /code-review: ambiguous arguments ${EM_DASH} be more explicit`,
    );
  });

  it("renders the transport-failure row with `<provider>` = Model.api and `<message>` in the parenthetical", () => {
    // The transport row uses the `(<provider>: <message>)` parenthetical, with
    // `<provider>` the classifier's `TransportError.provider` (`Model<Api>.api`,
    // e.g. `anthropic-messages`) rendered verbatim.
    expect(
      renderBinderSystemNote("code-review", {
        kind: "transport",
        provider: "anthropic-messages",
        message: "503 upstream unavailable",
      }),
    ).toBe(
      "theta /code-review: argument binder unavailable (anthropic-messages: 503 upstream unavailable)",
    );
  });

  it("renders the malformed-envelope and cancelled rows (fixed suffixes)", () => {
    // ContextOverflow folds into the transport class, so it has no row of its
    // own; the malformed and cancelled rows carry fixed, theta-controlled text.
    expect(renderBinderSystemNote("code-review", { kind: "malformed" })).toBe(
      `theta /code-review: argument binding failed ${EM_DASH} could not parse arguments`,
    );
    expect(renderBinderSystemNote("code-review", { kind: "cancelled" })).toBe(
      "theta /code-review: argument binding cancelled",
    );
  });

  it("renders the AJV-on-`args` row with `<ajv-summary>` = `<path> <message>` joined with `; `", () => {
    // `<ajv-summary>` is the in-order `<path> <message>` concatenation joined by
    // the two-character separator `; ` in canonical `validation_errors` order.
    const issues: readonly ValidationIssue[] = [
      { path: "/language", message: "must be string", schema_keyword: "type" },
      {
        path: "/max_files",
        message: "must be <= 100",
        schema_keyword: "maximum",
      },
    ];
    const summary = renderAjvSummary(issues);
    expect(summary).toBe("/language must be string; /max_files must be <= 100");
    expect(
      renderBinderSystemNote("code-review", { kind: "ajv_args", ajvSummary: summary }),
    ).toBe(
      `theta /code-review: argument binding produced invalid args ${EM_DASH} ${summary}`,
    );
    // An empty issue list renders the empty string (no separator, no residue) —
    // the property the depth-walk sub-case below relies on.
    expect(renderAjvSummary([])).toBe("");
  });
});

// ============================================================================
// Depth-walk fast-fail `<ajv-summary>` — the CIO-1 cross-ceiling sub-case
// (ceiling #4 routed to ceiling #3), classified into the AJV-on-`args` class
// (determinism-cancellation-failure.md §Failure-class taxonomy / §Failure-mode
// templates, Depth-walk fast-fail clause; ceilings-3-and-4.md CIO-1 / CIO-3)
// ============================================================================

describe("V11f-T — depth-walk fast-fail at the params boundary (CIO-1 cross-ceiling → AJV-on-`args`)", () => {
  it("classifies a depth-tripping `ok`-envelope args into the AJV-on-`args` class with the depth-walk-synthesised summary (HC3-c no-retry)", () => {
    // A `kind:"ok"` envelope whose args nest past depth 5 trips the depth-walk
    // fast-fail at the `params` boundary. Per CIO-3 the depth-walk runs before
    // AJV; per CIO-1 the breach cross-routes from ceiling #4 to ceiling #3 and
    // is classified into the AJV-on-`args` class (HC3-c: not retried).
    const deepArgs = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    const walk = depthWalk(deepArgs);
    // Sanity (V5e, green): a depth-6 value breaches the walk.
    expect(walk.ok).toBe(false);
    if (walk.ok) {
      expect.unreachable("depth-6 args must breach the depth walk");
    }

    // The breach is the canonical depth-walk issue, NOT an AJV keyword failure:
    // AJV does not run at this site, so its `errors` array is empty.
    expect(walk.issue.schema_keyword).toBe(DEPTH_VIOLATION_SCHEMA_KEYWORD);
    expect(walk.issue.schema_keyword).toBe("maxDepth");
    expect(walk.issue.message).toBe(DEPTH_VIOLATION_MESSAGE);
    expect(walk.issue.message).toBe("JSON document depth exceeds 5");

    // The classification routes into the AJV-on-`args` class with the
    // depth-walk-synthesised summary (empty AJV issue set).
    const classified = classifyBinderArgs({ depth: walk, ajvIssues: [] });
    expect(classified.kind).toBe("ajv_args");
    if (classified.kind !== "ajv_args") {
      expect.unreachable("a depth breach must classify into the AJV-on-`args` class");
    }

    // The `<ajv-summary>` is the single canonical issue `<JSON-Pointer> <message>`
    // — single-issue form, NO `; ` separator — synthesised from the depth-walk
    // issue, not from an `errorsText` traversal of the empty AJV `errors` array
    // (which `renderAjvSummary([])` shows would be the empty string).
    const depthSummary = renderDepthWalkAjvSummary(walk.issue);
    expect(depthSummary).toBe("/a/b/c/d/e JSON document depth exceeds 5");
    expect(depthSummary.includes("; ")).toBe(false);
    expect(renderAjvSummary([])).toBe("");
    expect(classified.ajvSummary).toBe(depthSummary);

    // The full row renders through the AJV-on-`args` template.
    expect(
      renderBinderSystemNote("code-review", {
        kind: "ajv_args",
        ajvSummary: classified.ajvSummary,
      }),
    ).toBe(
      "theta /code-review: argument binding produced invalid args \u2014 /a/b/c/d/e JSON document depth exceeds 5",
    );
  });
});
