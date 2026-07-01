// V14e-T — failing tests for the paired `V14e` "Ceiling-#4 depth-6
// code-driven-tool-args routing (live carrier)" implementation leaf.
//
// Spec: hard-ceilings/ceilings-3-and-4.md §"Per-boundary destination/surface
// table (ceiling #4)" (#ceiling-4-table, the code-driven-tool-args row) and
// CIO-3 (#cio-3, the depth-walk-before-AJV ordering at every AJV boundary);
// tool-calls.md §"Failures" (the `CodeToolError { cause: "validation" }`
// carrier). This is the delegated live-carrier witness for `V5e`'s
// code-driven-tool-args routing row: `V5e` proves the routing *decision*
// (`tool-args-code-driven` → `CodeToolError`) in isolation, and this leaf
// proves the actual wrapping of a depth-6 breach into that carrier at the
// `<name>(args)` site, building on `V14a`'s `CodeToolError` carrier.
//
// Both tests red on their own primary assertion while the `V14e` body is
// absent: the V14e-T stub of `enforceCodeToolArgDepth` never fires (returns
// `undefined`), so a depth-6 argument yields no breach and the live-carrier
// assertions red on "expected a breach". No test reds on a compile error, a
// missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import { enforceCodeToolArgDepth } from "../src/runtime/tool-call";
import type { CodeToolError } from "../src/runtime/query-error";

// A depth-5 code-driven argument value: {a:{b:{c:{d:1}}}} — five nesting
// levels, at the cap (within ceiling #4, deferred to the downstream AJV check).
const DEPTH_5_ARG = { a: { b: { c: { d: 1 } } } };
// A depth-6 code-driven argument value: {a:{b:{c:{d:{e:1}}}}} — one level over
// the cap (schema-subset.md §Depth worked example), tripping ceiling #4.
const DEPTH_6_ARG = { a: { b: { c: { d: { e: 1 } } } } };

const TOOL_NAME = "read";

describe("V14e-T — depth-6 code-driven tool-call args live carrier (ceiling-4-table code-driven row)", () => {
  it("ceiling-4-table (code-driven row) / CIO-3: a depth-6 code-driven arg trips the loom-owned depth walk before AJV and surfaces as Err(CodeToolError { cause: 'validation' }) carrying schema_keyword `maxDepth`", () => {
    // ceilings-3-and-4.md#ceiling-4-table, code-driven `<name>(args)` row: the
    // loom-owned depth walk (`V5e`) runs before AJV (CIO-3) and a depth-6
    // argument surfaces wrapped as `Err(CodeToolError { cause: "validation",
    // ... })`. No AJV schema is consulted here — the depth walk trips purely on
    // the materialised argument value, proving the depth-walk-before-AJV
    // ordering (#cio-3).
    const breach = enforceCodeToolArgDepth(TOOL_NAME, DEPTH_6_ARG);

    // Primary: a depth-6 code-driven argument trips ceiling #4 at this site.
    expect(breach, "a depth-6 code-driven tool-call argument must trip ceiling #4").toBeDefined();
    if (breach === undefined) {
      throw new Error("unreachable: a depth-6 code-driven argument must breach the depth ceiling");
    }

    // The breach surfaces wrapped as an `Err` carrier to loom code.
    expect(breach.result.ok, "the depth-6 breach surfaces as an Err").toBe(false);

    // The carrier is a `CodeToolError` with `cause: "validation"` (V14a carrier;
    // queryerror-variants.md §CodeToolError, tool-calls.md §Failures).
    expect(breach.error.kind).toBe("code_tool");
    expect(breach.error.cause).toBe("validation");
    // Post-rename callable-set name is preserved on the carrier.
    expect(breach.error.tool_name).toBe(TOOL_NAME);

    // The depth violation carries the canonical `schema_keyword` / message
    // anchored to schema-subset.md §Error shape (sourced via `V5e`'s
    // DepthViolationIssue).
    expect(breach.issue.schema_keyword).toBe("maxDepth");
    expect(breach.issue.message).toBe("JSON document depth exceeds 5");
    // The carrier's own message is the canonical depth-violation string.
    expect(breach.error.message).toBe("JSON document depth exceeds 5");

    // The `Err`'s payload is the same CodeToolError carrier.
    if (breach.result.ok === false) {
      const carried = breach.result.error as unknown as CodeToolError;
      expect(carried.kind).toBe("code_tool");
      expect(carried.cause).toBe("validation");
    }
  });

  it("ceiling-4-table (code-driven row) / CIO-3: the depth walk runs before AJV — a within-cap (depth-5) code-driven arg produces no depth breach and defers to the downstream AJV boundary, while depth-6 trips it", () => {
    // #cio-3: ceiling #4 is the *first* sub-check at the AJV boundary — the
    // depth walk fires before AJV. A depth-5 argument is within the cap, so the
    // depth walk produces no breach and the argument falls through to the
    // downstream AJV validation (owned elsewhere); a depth-6 argument trips the
    // ceiling here, before any AJV schema is consulted.
    expect(
      enforceCodeToolArgDepth(TOOL_NAME, DEPTH_5_ARG),
      "a within-cap (depth-5) code-driven argument produces no depth breach",
    ).toBeUndefined();
    // Primary: the depth-6 argument trips the ceiling at this site.
    expect(
      enforceCodeToolArgDepth(TOOL_NAME, DEPTH_6_ARG),
      "a depth-6 code-driven argument trips ceiling #4",
    ).toBeDefined();
  });
});
