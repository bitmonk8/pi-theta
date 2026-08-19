// V15j / V15j-T — the `invoke` ceiling-#4 depth `params` / `invoke<T>`-return
// live-carrier seam.
//
// This module owns the actual wrapping of a depth-6 JSON-document breach into
// the `InvokeInfraError` carrier at the two `invoke`-boundary ceiling-#4
// enforcement points — the runtime `invoke(...)` `params` argument boundary and
// the `invoke<T>` return-value boundary — building on the `V15a` invoke core
// and consulting the wire-form depth walk (`./wire-form-depth-walk.ts`). It is
// the delegated live-carrier witness for `V5e`'s `params` / `invoke<T>`-return
// routing rows: `V5e` proves the routing *decision* (`params-invoke` →
// `InvokeInfraError`, `invoke-return` → `InvokeInfraError`) in isolation, and
// this leaf proves the wrapping of a depth-6 breach into that carrier at each
// `invoke` site.
//
// The two enforcement points differ only in the `InvokeInfraError.cause` they
// carry (ceilings-3-and-4.md#ceiling-4-table, queryerror-variants.md
// §Invoke variants):
//
//   - `enforceInvokeParamsDepth`  — the runtime `invoke(...)` `params` argument
//     boundary, `cause: "validation"` (the input side). This is the runtime
//     `invoke` boundary, NOT the binder slash-load `params` boundary — per CIO-1
//     a ceiling-#4 breach at the slash-load `params` boundary cross-routes to
//     ceiling #3 (witnessed at `V11f` / `V4e`) and does not surface here.
//   - `enforceInvokeReturnDepth` — the `invoke<T>` return-value boundary,
//     `cause: "return_validation"`.
//
// Both gates are handed the interpreter's OWN value, not parsed JSON, so both
// run `wireFormDepthWalk` (`./wire-form-depth-walk.ts`) — the walk over the
// payload's WIRE FORM, the JSON document `JSON.stringify` writes for it
// (schema-subset.md:13, :22, :24–30) — before AJV (CIO-3, bug 0202): a within-cap
// document defers to the downstream AJV boundary (returns `undefined`) and a
// depth-6+ document trips the ceiling, wrapping the canonical depth-violation issue
// (`schema_keyword: "maxDepth"`, message `"JSON document depth exceeds 5"`) into
// the `InvokeInfraError` carrier and surfacing it as `Err(InvokeInfraError)` to the
// invoke parent.
//
// V15j-T (tests-task) declares the seam shapes and stubs both behaviour-bearing
// functions inertly — each never fires (returns `undefined`), so a depth-6 value
// yields no breach and the failing tests red on their own primary "expected a
// breach" assertion, per the per-phase TDD ritual's "fail red for the intended
// reason". The paired `V15j` implementation leaf fills in the depth-walk
// short-circuit and the `InvokeInfraError` wrapping.
//
// Spec: hard-ceilings/ceilings-3-and-4.md §"Per-boundary destination/surface
// table (ceiling #4)" (#ceiling-4-table, the `params` / `invoke<T>`-return rows)
// and CIO-1 (#cio-1) / CIO-3 (#cio-3); invocation.md §"Failures"
// (the `InvokeInfraError { cause: "validation" | "return_validation" }`
// carrier). Code-keyed obligation area `cka-10` (schema-subset.md, no numbered
// REQ-ID — `V15j` is its `params` / `invoke<T>`-return co-witness closing leaf).

import type { DepthViolationIssue } from "./depth-walk";
import { wireFormDepthWalk } from "./wire-form-depth-walk";
import type { InvokeInfraError } from "./query-error";
import { makeErr, type ThetaValue, type ResultValue } from "./value";

/**
 * A depth-6 `invoke`-boundary ceiling-#4 breach, materialised at one of the two
 * `invoke` enforcement points (ceilings-3-and-4.md#ceiling-4-table, the `params`
 * and `invoke<T>`-return rows):
 *
 *   - `result` — the wrapped `Err(InvokeInfraError { cause, ... })` surfaced to
 *     the invoke parent, matching the per-boundary table's row;
 *   - `error`  — the `InvokeInfraError` carrier itself (`kind: "invoke_infra"`,
 *     the boundary-specific `cause`, canonical depth `message`, `callee_path`);
 *   - `issue`  — `wireFormDepthWalk`'s `DepthViolationIssue`, carrying
 *     `schema_keyword: "maxDepth"` and the canonical
 *     `"JSON document depth exceeds 5"` message — the `DEPTH_VIOLATION_MESSAGE`
 *     / `DEPTH_VIOLATION_SCHEMA_KEYWORD` / `DepthViolationIssue` shape `V5e`
 *     exports from `./depth-walk`, imported rather than restated.
 */
export interface InvokeDepthBreach {
  readonly result: ResultValue;
  readonly error: InvokeInfraError;
  readonly issue: DepthViolationIssue;
}

/**
 * Enforce ceiling #4 at the runtime `invoke(...)` `params` argument boundary:
 * the `params` value is the interpreter's OWN value, not parsed JSON, so this
 * runs `wireFormDepthWalk` over its WIRE FORM *before* AJV (CIO-3), and — on
 * a depth-6+ breach — surface it wrapped as
 * `Err(InvokeInfraError { cause: "validation", ... })` per the `params` /
 * `invoke(...)` row of the ceiling-#4 per-boundary table
 * (ceilings-3-and-4.md#ceiling-4-table). Returns `undefined` for a within-cap
 * value, deferring to the downstream AJV boundary.
 *
 * This is the runtime `invoke` boundary, NOT the binder slash-load `params`
 * boundary — per CIO-1 the slash-load arm cross-routes to ceiling #3 (witnessed
 * at `V11f` / `V4e`) and does not surface here.
 */
export function enforceInvokeParamsDepth(
  calleePath: string,
  paramsValue: unknown,
): InvokeDepthBreach | undefined {
  return enforceInvokeDepth(calleePath, paramsValue, "validation");
}

/**
 * Enforce ceiling #4 at the `invoke<T>` return-value boundary: the return
 * value is the interpreter's OWN value, not parsed JSON, so this runs
 * `wireFormDepthWalk` over its WIRE FORM *before* AJV (CIO-3), and — on a
 * depth-6+ breach — surface it wrapped as
 * `Err(InvokeInfraError { cause: "return_validation", ... })` per the
 * `invoke<T>` return-value row of the ceiling-#4 per-boundary table
 * (ceilings-3-and-4.md#ceiling-4-table). Returns `undefined` for a within-cap
 * value, deferring to the downstream AJV boundary.
 */
export function enforceInvokeReturnDepth(
  calleePath: string,
  returnValue: unknown,
): InvokeDepthBreach | undefined {
  return enforceInvokeDepth(calleePath, returnValue, "return_validation");
}

/**
 * The shared enforcement both `invoke`-boundary sites run before AJV (CIO-3).
 * Both are handed the interpreter's OWN value, not parsed JSON, so this runs
 * `wireFormDepthWalk` over the payload's WIRE FORM (schema-subset.md:13, :22,
 * :24–30; bug 0202); a within-cap document returns `undefined` (deferring to
 * the downstream AJV boundary), and a depth-6+ breach is wrapped into the
 * boundary-specific `InvokeInfraError` carrier (`cause: "validation"` at the
 * `params` argument boundary, `cause: "return_validation"` at the `invoke<T>`
 * return boundary) and surfaced as `Err(InvokeInfraError)` to the invoke
 * parent (ceilings-3-and-4.md#ceiling-4-table).
 *
 * The two boundaries route identically per `V5e`'s `routeDepthBoundary`
 * (`params-invoke` → `InvokeInfraError`, `invoke-return` → `InvokeInfraError`);
 * they differ only in the `cause` the carrier records, so the caller passes the
 * boundary-specific `cause` directly.
 */
function enforceInvokeDepth(
  calleePath: string,
  value: unknown,
  cause: "validation" | "return_validation",
): InvokeDepthBreach | undefined {
  const walk = wireFormDepthWalk(value);
  if (walk.ok) {
    return undefined;
  }
  const error: InvokeInfraError = {
    kind: "invoke_infra",
    message: walk.issue.message,
    callee_path: calleePath,
    cause,
  };
  return {
    result: makeErr(error as unknown as ThetaValue),
    error,
    issue: walk.issue,
  };
}
