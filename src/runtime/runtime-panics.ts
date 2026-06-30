// V4b / V4b-T — the runtime-panic surface seam.
//
// This module owns the closed loom 1.0 runtime-panic set, the `?`-operator
// runtime propagation seam that panics bypass, and the runtime-defect surface
// (`loom/runtime/internal-error`) for unexpected interpreter / adapter throws
// (errors-and-results/error-model.md §"Runtime panics"; the registered message
// templates live in diagnostics/code-registry-runtime.md).
//
// Five of the six closed panic sources are owned here — array index-out-of-
// bounds, missing-object-key, null-index-access, null-member-access, and
// `invoke`-chain depth-exceeded; the sixth (non-exhaustive `match`) is the
// `MatchError` panic owned by ./match-result.ts. A panic is a thrown JS
// exception, never a `Result` value, so it bypasses `?` and `match` (which
// operate on `Result` values) — the bypass is intrinsic to representing panics
// as thrown `LoomPanic` instances rather than as values.
//
// The runtime-defect surface routes an *unexpected* throw (one that is not a
// panic source) to `loom/runtime/internal-error`. The NOCEIL-3 carve-out
// (errors-and-results/error-model.md §"Runtime panics";
// hard-ceilings/ceiling-invariants-and-audit.md §"No additional ceilings"):
// an *uncatchable* host fatal (V8 heap-OOM via the `OOMErrorCallback` /
// `abort()` path) terminates the host process before any wrap can observe it,
// so it delivers no throw to a catch site and `loom/runtime/internal-error`
// emits no diagnostic for it.
//
// V4b-T (tests-task) declares the seam — the `LoomPanic` base and the five
// panic classes, the `evaluateIndexAccess` / `evaluateMemberAccess` /
// `enterInvokeFrame` accessor seams, the `evaluateQuestion` `?`-propagation
// seam, the `HostFatal` NOCEIL-3 marker, and the `surfaceUnexpectedThrow`
// runtime-defect surface — and stubs every behaviour-bearing function inertly
// so the failing tests red on their own primary assertions (an accessor that
// raises no panic, a `?` seam that neither propagates nor lets a panic through,
// and a runtime-defect surface that emits a wrong-code sentinel for every
// input). The paired V4b implementation leaf fills these in.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { LoomValue } from "./value";

/** The registry codes carried by the five panic sources this module owns. */
export const INDEX_OUT_OF_BOUNDS_CODE = "loom/runtime/index-out-of-bounds";
export const MISSING_OBJECT_KEY_CODE = "loom/runtime/missing-object-key";
export const NULL_INDEX_ACCESS_CODE = "loom/runtime/null-index-access";
export const NULL_MEMBER_ACCESS_CODE = "loom/runtime/null-member-access";
export const INVOKE_DEPTH_EXCEEDED_CODE = "loom/runtime/invoke-depth-exceeded";

/** The runtime-defect-surface code for an unexpected interpreter / adapter throw. */
export const INTERNAL_ERROR_CODE = "loom/runtime/internal-error";

/** The `invoke`-chain depth cap (INV-4 / invocation.md §"Invocation depth bound"). */
export const INVOKE_DEPTH_CAP = 32;

/**
 * Base class for the closed loom 1.0 runtime panics this module owns. A panic
 * is a thrown JS exception, never a `Result` value, so `?` and `match` (which
 * operate on `Result` values) cannot intercept it — it bypasses them by
 * construction. Each subclass carries its registered `loom/runtime/*` code.
 */
export abstract class LoomPanic extends Error {
  abstract readonly code: string;
}

/** `arr[i]` with `i < 0` or `i >= arr.length` (`loom/runtime/index-out-of-bounds`). */
export class IndexOutOfBoundsPanic extends LoomPanic {
  readonly code = INDEX_OUT_OF_BOUNDS_CODE;
  constructor(message: string) {
    super(message);
    this.name = "IndexOutOfBoundsPanic";
  }
}

/** `obj[k]` where `k` is not a present loom-side key (`loom/runtime/missing-object-key`). */
export class MissingObjectKeyPanic extends LoomPanic {
  readonly code = MISSING_OBJECT_KEY_CODE;
  constructor(message: string) {
    super(message);
    this.name = "MissingObjectKeyPanic";
  }
}

/** `[i]` access on `null` (`loom/runtime/null-index-access`). */
export class NullIndexAccessPanic extends LoomPanic {
  readonly code = NULL_INDEX_ACCESS_CODE;
  constructor(message: string) {
    super(message);
    this.name = "NullIndexAccessPanic";
  }
}

/** `.field` access on `null` (`loom/runtime/null-member-access`). */
export class NullMemberAccessPanic extends LoomPanic {
  readonly code = NULL_MEMBER_ACCESS_CODE;
  constructor(message: string) {
    super(message);
    this.name = "NullMemberAccessPanic";
  }
}

/** `invoke` chain depth exceeded (`loom/runtime/invoke-depth-exceeded`). */
export class InvokeDepthExceededPanic extends LoomPanic {
  readonly code = INVOKE_DEPTH_EXCEEDED_CODE;
  constructor(message: string) {
    super(message);
    this.name = "InvokeDepthExceededPanic";
  }
}

/**
 * Runtime `[i]` indexed access (errors-and-results/error-model.md §"Runtime
 * panics"). `target[index]`:
 *   - `null` target               → `NullIndexAccessPanic` (`[<i>]`);
 *   - array, `i < 0 || i >= len`  → `IndexOutOfBoundsPanic` (`<i> not in 0..<length>`);
 *   - object, missing loom-side key → `MissingObjectKeyPanic` (`<key>`);
 *   - otherwise                    → the indexed element / member value.
 *
 * V4b-T stubs this inert (returns the `null` sentinel, raising nothing), so the
 * panic-source and bypass assertions red on their absent throw. The paired V4b
 * leaf implements the bounds / null / missing-key checks and the registered
 * message templates.
 */
export function evaluateIndexAccess(
  _target: LoomValue,
  _index: number | string,
): LoomValue {
  return null;
}

/**
 * Runtime `.field` member access (errors-and-results/error-model.md §"Runtime
 * panics"). `target.field` on a `null` target raises `NullMemberAccessPanic`
 * (`.<field>`); otherwise it returns the member value.
 *
 * V4b-T stubs this inert (returns the `null` sentinel, raising nothing). The
 * paired V4b leaf implements the null check and the registered message template.
 */
export function evaluateMemberAccess(_target: LoomValue, _field: string): LoomValue {
  return null;
}

/**
 * Guard the `invoke`-chain depth bound (INV-4): about to push a frame bringing
 * the chain count to `nextDepth`. When `nextDepth > 32` the runtime raises
 * `InvokeDepthExceededPanic` (`invoke chain depth exceeded: <depth> > 32`);
 * otherwise it returns normally.
 *
 * V4b-T stubs this inert (returns without raising). The paired V4b leaf
 * implements the bound check and the registered message template.
 */
export function enterInvokeFrame(_nextDepth: number): void {
  // Inert: raises nothing.
}

/**
 * The outcome of evaluating a `?` operand (errors-and-results/error-model.md
 * §"Runtime panics" — the surface panics bypass):
 *   - `value`     — the operand was `Ok(v)`; `v` flows on;
 *   - `propagate` — the operand was `Err(e)`; the enclosing function early-
 *                   returns `Err(e)`.
 * A panic thrown while *producing* the operand is **not** captured here — it
 * propagates past `?` as a thrown `LoomPanic`, never becoming a `propagate`
 * outcome.
 */
export type QuestionResult =
  | { readonly kind: "value"; readonly value: LoomValue }
  | { readonly kind: "propagate"; readonly err: LoomValue };

/**
 * Evaluate `operand?`: invoke `operand` (a thunk producing the `?` operand's
 * `Result`), then apply `?` propagation — `Ok(v)` yields `{ kind: "value" }`,
 * `Err(e)` yields `{ kind: "propagate" }`. A panic thrown by `operand`
 * propagates unchanged (the thunk is invoked without a surrounding catch), so a
 * panic bypasses `?`.
 *
 * V4b-T stubs this inert: it returns a `value` sentinel **without invoking**
 * `operand`, so the `Ok`/`Err` discrimination assertions red on the wrong
 * outcome and the bypass assertion reds because the panic-raising thunk is never
 * called (no throw escapes). The paired V4b leaf invokes the thunk and
 * implements propagation.
 */
export function evaluateQuestion(_operand: () => LoomValue): QuestionResult {
  return { kind: "value", value: null };
}

/**
 * A marker for a host-fatal *uncatchable* condition (NOCEIL-3): a V8 heap-OOM
 * via the `OOMErrorCallback` / `abort()` path terminates the host process
 * before any wrap can observe it, so it never reaches a runtime catch site. The
 * runtime-defect surface emits **no** `loom/runtime/internal-error` for it.
 * Modelled as a distinct marker so the carve-out is testable without crashing
 * the test process.
 */
export class HostFatal {
  constructor(readonly description: string) {}
}

/**
 * The runtime-defect surface (errors-and-results/error-model.md §"Runtime
 * panics"). Classify a value reaching a runtime catch site:
 *   - a `LoomPanic` → `undefined` (already a panic; not a runtime defect, not
 *     reclassified — the caller rethrows it so it bypasses `?`/`match`);
 *   - a `HostFatal` → `undefined` (NOCEIL-3 carve-out: no diagnostic at all);
 *   - any other thrown value → a `loom/runtime/internal-error` `Diagnostic`
 *     whose `message` is the underlying `error.message` and whose `hint` is the
 *     underlying `error.stack` (or `"<no stack available>"` when falsy).
 *
 * V4b-T stubs this inert: it returns a wrong-code sentinel `Diagnostic` for
 * **every** input, so the positive `internal-error` assertion reds on the code
 * mismatch and the NOCEIL-3 / panic-passthrough negative assertions red because
 * a (sentinel) diagnostic is returned where `undefined` is required. The paired
 * V4b leaf implements the discrimination and the registered message template.
 */
export function surfaceUnexpectedThrow(
  _thrown: unknown,
  site: { readonly file: string; readonly range: SourceRange },
): Diagnostic | undefined {
  return {
    severity: "error",
    code: "loom/runtime/__unimplemented__",
    file: site.file,
    range: site.range,
    message: "",
  };
}

/** Whether `error` is one of the runtime panics this module owns. */
export function isLoomPanic(error: unknown): error is LoomPanic {
  return error instanceof LoomPanic;
}
