// V15j-T — failing tests for the paired `V15j` "Invoke ceiling-#4 depth-6
// `params` / `invoke<T>`-return routing (live carrier)" implementation leaf.
//
// Spec: hard-ceilings/ceilings-3-and-4.md §"Per-boundary destination/surface
// table (ceiling #4)" (#ceiling-4-table, the `params` / `invoke(...)` and
// `invoke<T>`-return rows) and CIO-3 (#cio-3, the depth-walk-before-AJV
// ordering at every AJV boundary);
// invocation.md §"Failures" (the `InvokeInfraError { cause: "validation" |
// "return_validation" }` carrier). Code-keyed obligation area `cka-10`
// (schema-subset.md, no numbered REQ-ID — the depth ceiling carries no numbered
// PREFIX-N REQ-ID; `V15j` is its `params` / `invoke<T>`-return co-witness
// closing leaf, closed by `V5e`).
//
// This is the delegated live-carrier witness for `V5e`'s `params` /
// `invoke<T>`-return routing rows: `V5e` proves the routing *decision*
// (`params-invoke` → `InvokeInfraError`, `invoke-return` → `InvokeInfraError`)
// in isolation, and this leaf proves the actual wrapping of a depth-6 breach
// into that carrier at each `invoke` boundary, building on the `V15a` invoke
// core.
//
// Each test reds on its own primary assertion while the `V15j` body is absent:
// the V15j-T stubs of `enforceInvokeParamsDepth` / `enforceInvokeReturnDepth`
// never fire (return `undefined`), so a depth-6 value yields no breach and the
// live-carrier assertions red on "expected a breach". No test reds on a compile
// error, a missing fixture, or a harness throw.

import { describe, expect, it } from "vitest";
import {
  enforceInvokeParamsDepth,
  enforceInvokeReturnDepth,
} from "../src/runtime/invoke-ceiling-depth";
import type { InvokeInfraError } from "../src/runtime/query-error";

// A depth-5 value: {a:{b:{c:{d:1}}}} — five nesting levels, at the cap (within
// ceiling #4, deferred to the downstream AJV check).
const DEPTH_5_VALUE = { a: { b: { c: { d: 1 } } } };
// A depth-6 value: {a:{b:{c:{d:{e:1}}}}} — one level over the cap
// (schema-subset.md §Depth worked example), tripping ceiling #4.
const DEPTH_6_VALUE = { a: { b: { c: { d: { e: 1 } } } } };

const CALLEE_PATH = "/proj/child.theta";

describe("V15j-T — depth-6 runtime invoke `params` live carrier (ceiling-4-table `params`/invoke row)", () => {
  it("ceiling-4-table (`params` invoke row) / CIO-3: a depth-6 runtime `invoke(...)` `params` argument trips the theta-owned depth walk before AJV and surfaces as Err(InvokeInfraError { cause: 'validation' }) carrying schema_keyword `maxDepth` (cka-10)", () => {
    // ceilings-3-and-4.md#ceiling-4-table, `params` validation row (`invoke(...)`
    // arm): the theta-owned depth walk (`V5e`) runs before AJV (CIO-3) and a
    // depth-6 `params` value surfaces wrapped as `Err(InvokeInfraError {
    // cause: "validation", ... })`. No AJV schema is consulted here — the depth
    // walk trips purely on the materialised value, proving the
    // depth-walk-before-AJV ordering (#cio-3).
    const breach = enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE);

    // Primary: a depth-6 runtime `invoke` `params` argument trips ceiling #4 at
    // this site.
    expect(breach, "a depth-6 runtime invoke `params` argument must trip ceiling #4").toBeDefined();
    if (breach === undefined) {
      throw new Error("unreachable: a depth-6 `params` argument must breach the depth ceiling");
    }

    // The breach surfaces wrapped as an `Err` carrier to the invoke parent.
    expect(breach.result.ok, "the depth-6 breach surfaces as an Err").toBe(false);

    // The carrier is an `InvokeInfraError` with `cause: "validation"` (the input
    // side; invocation.md §Failures, queryerror-variants.md §Invoke variants).
    expect(breach.error.kind).toBe("invoke_infra");
    expect(breach.error.cause).toBe("validation");
    // The callee path is preserved on the carrier.
    expect(breach.error.callee_path).toBe(CALLEE_PATH);

    // The depth violation carries the canonical `schema_keyword` / message
    // anchored to schema-subset.md §Error shape (sourced via `V5e`'s
    // DepthViolationIssue).
    expect(breach.issue.schema_keyword).toBe("maxDepth");
    expect(breach.issue.message).toBe("JSON document depth exceeds 5");
    // The carrier's own message is the canonical depth-violation string.
    expect(breach.error.message).toBe("JSON document depth exceeds 5");

    // The `Err`'s payload is the same InvokeInfraError carrier.
    if (breach.result.ok === false) {
      const carried = breach.result.error as unknown as InvokeInfraError;
      expect(carried.kind).toBe("invoke_infra");
      expect(carried.cause).toBe("validation");
    }
  });

  it("ceiling-4-table (`params` invoke row) / CIO-3: the depth walk runs before AJV — a within-cap (depth-5) `params` value produces no depth breach and defers to the downstream AJV boundary, while depth-6 trips it (cka-10)", () => {
    // #cio-3: ceiling #4 is the *first* sub-check at the AJV boundary — the
    // depth walk fires before AJV. A depth-5 `params` value is within the cap,
    // so the depth walk produces no breach and the value falls through to the
    // downstream AJV validation; a depth-6 value trips the ceiling here, before
    // any AJV schema is consulted.
    expect(
      enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_5_VALUE),
      "a within-cap (depth-5) `params` value produces no depth breach",
    ).toBeUndefined();
    // Primary: the depth-6 `params` value trips the ceiling at this site.
    expect(
      enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE),
      "a depth-6 `params` value trips ceiling #4",
    ).toBeDefined();
  });
});

describe("V15j-T — depth-6 `invoke<T>` return-value live carrier (ceiling-4-table invoke<T>-return row)", () => {
  it("ceiling-4-table (`invoke<T>` return row) / CIO-3: a depth-6 `invoke<T>` return value trips the theta-owned depth walk before AJV and surfaces as Err(InvokeInfraError { cause: 'return_validation' }) carrying schema_keyword `maxDepth` (cka-10)", () => {
    // ceilings-3-and-4.md#ceiling-4-table, `invoke<T>` return-value row: the
    // theta-owned depth walk (`V5e`) runs before AJV (CIO-3) and a depth-6 return
    // value surfaces wrapped as `Err(InvokeInfraError { cause:
    // "return_validation", ... })`.
    const breach = enforceInvokeReturnDepth(CALLEE_PATH, DEPTH_6_VALUE);

    // Primary: a depth-6 `invoke<T>` return value trips ceiling #4 at this site.
    expect(breach, "a depth-6 `invoke<T>` return value must trip ceiling #4").toBeDefined();
    if (breach === undefined) {
      throw new Error("unreachable: a depth-6 `invoke<T>` return value must breach the depth ceiling");
    }

    // The breach surfaces wrapped as an `Err` carrier to the invoke parent.
    expect(breach.result.ok, "the depth-6 breach surfaces as an Err").toBe(false);

    // The carrier is an `InvokeInfraError` with `cause: "return_validation"`
    // (invocation.md §Failures, queryerror-variants.md §Invoke variants).
    expect(breach.error.kind).toBe("invoke_infra");
    expect(breach.error.cause).toBe("return_validation");
    expect(breach.error.callee_path).toBe(CALLEE_PATH);

    // The depth violation carries the canonical `schema_keyword` / message
    // anchored to schema-subset.md §Error shape (sourced via `V5e`'s
    // DepthViolationIssue).
    expect(breach.issue.schema_keyword).toBe("maxDepth");
    expect(breach.issue.message).toBe("JSON document depth exceeds 5");
    expect(breach.error.message).toBe("JSON document depth exceeds 5");

    if (breach.result.ok === false) {
      const carried = breach.result.error as unknown as InvokeInfraError;
      expect(carried.kind).toBe("invoke_infra");
      expect(carried.cause).toBe("return_validation");
    }
  });

  it("ceiling-4-table (`invoke<T>` return row) / CIO-3: the depth walk runs before AJV — a within-cap (depth-5) return value produces no depth breach and defers to the downstream AJV boundary, while depth-6 trips it (cka-10)", () => {
    // #cio-3: a depth-5 return value is within the cap and defers to the
    // downstream AJV validation; a depth-6 return value trips the ceiling here,
    // before any AJV schema is consulted.
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, DEPTH_5_VALUE),
      "a within-cap (depth-5) return value produces no depth breach",
    ).toBeUndefined();
    // Primary: the depth-6 return value trips the ceiling at this site.
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, DEPTH_6_VALUE),
      "a depth-6 return value trips ceiling #4",
    ).toBeDefined();
  });
});

describe("V15j-T — runtime invoke `params` breach classification (ceiling-4-table, cka-10)", () => {
  it("ceiling-4-table (`params` invoke row): a depth-6 `params` argument reports invoke_infra with cause validation", () => {
    // This cell checks the runtime invoke breach's kind and cause only;
    // it does not exercise or compare the binder slash-load boundary.
    const breach = enforceInvokeParamsDepth(CALLEE_PATH, DEPTH_6_VALUE);

    expect(breach, "the runtime invoke `params` boundary surfaces an InvokeInfraError").toBeDefined();
    if (breach === undefined) {
      throw new Error("unreachable: the runtime invoke `params` boundary must surface a breach");
    }
    expect(breach.error.kind).toBe("invoke_infra");
    expect(breach.error.cause).toBe("validation");
  });
});
