// Bug 0315 — the stdlib method-call argument-surface parse checks.
//
// This module owns the two `type`-phase diagnostics `checkMethodCall`
// (`./type-layer-checks.ts`) fires for a method call on a
// statically-resolvable built-in receiver (`string` / `array<T>` / `object`)
// whose argument list does not satisfy the member's declared signature
// (expressions.md §"Built-in methods and properties"):
//
//   - `theta/parse/stdlib-arity-mismatch` — the positional-argument COUNT is
//     outside the member's `[min, max]` arity. Checked FIRST; on a mismatch
//     the per-argument type check below does not run (mirrors
//     `checkInvokeCall`'s arity-before-type ordering, `./invoke-diagnostics.ts`).
//   - `theta/parse/stdlib-arg-type-mismatch` — arity is satisfied but a
//     positional argument's static type is incompatible with the member's
//     declared parameter type. Deferred (no diagnostic) when the argument's
//     type is statically unresolvable or a withheld binder — `checkCompatible`
//     already answers `"unknown"` for both, so no separate guard is needed
//     (mirrors `checkInvokeArgTypes`'s deferral).
//
// Both codes fire ONLY for a concretely-resolvable receiver kind
// (`classifyReceiver` answering something other than `"unknown"`); a
// laundered receiver defers entirely to the runtime dispatcher belt
// (`StdlibMethodArgumentDefectError`, `../runtime/runtime-panics.ts`).
//
// Spec: expressions.md §"Built-in methods and properties",
// diagnostics/code-registry-parse.md, diagnostics/placeholder-rendering-a.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import {
  checkCompatible,
  displayType,
  resolveNamedRef,
  unfoldAlias,
  type CompatSite,
  type CompatType,
  type TypeEnv,
} from "./type-compat";
import type { StdlibMemberSignature, StdlibParamKind } from "../runtime/stdlib-string";

/** `theta/parse/stdlib-arity-mismatch` (code-registry-parse.md; bug 0315). */
export const STDLIB_ARITY_MISMATCH_CODE = "theta/parse/stdlib-arity-mismatch";

/** `theta/parse/stdlib-arg-type-mismatch` (code-registry-parse.md; bug 0315). */
export const STDLIB_ARG_TYPE_MISMATCH_CODE = "theta/parse/stdlib-arg-type-mismatch";

/**
 * `stdlib method '<method>' on type <type> expects <required> argument(s); got <provided>`.
 * `<required>` is the arity boundary the call VIOLATES — the member's minimum
 * for a too-few call, the maximum for a too-many call (only `slice` has
 * `min !== max`; every other member's boundary is exact either way).
 */
export function stdlibArityMismatchMessage(
  method: string,
  type: string,
  required: number,
  provided: number,
): string {
  return `stdlib method '${method}' on type ${type} expects ${required} argument(s); got ${provided}`;
}

/**
 * `stdlib method '<method>' on type <type> argument <i> type mismatch: expected <expected>, got <actual>`.
 * `<i>` is the 0-based positional argument index.
 */
export function stdlibArgTypeMismatchMessage(
  method: string,
  type: string,
  i: number,
  expected: string,
  actual: string,
): string {
  return `stdlib method '${method}' on type ${type} argument ${i} type mismatch: expected ${expected}, got ${actual}`;
}

/** Registry *Hint* column for `theta/parse/stdlib-arity-mismatch`. */
export const STDLIB_ARITY_MISMATCH_HINT =
  "Match the member's declared arity (Expressions — Built-in methods and properties).";

/** Registry *Hint* column for `theta/parse/stdlib-arg-type-mismatch`. */
export const STDLIB_ARG_TYPE_MISMATCH_HINT =
  "theta 1.0 performs no implicit type conversion; correct the argument type.";

/**
 * The `<expected>` rendering for the `concat`-only `"array"` param descriptor,
 * where `concat`'s parameter is any `array<U>` and no concrete element type is
 * being asked for — only array-ness. `unknown` is the category-1 stand-in token
 * for "an element/common type the layer did not determine"
 * (placeholder-rendering-a.md §1), and category 1 admits it inside a composite
 * (`array<unknown>` renders via the `array<T>` clause). So this conveys
 * "expected an array of some element type" while staying a conformant category-1
 * static-type rendering — unlike the bare type-variable `array<T>`, which is
 * neither a re-serialised static type nor one of the five closed stand-in tokens.
 */
const ANY_ARRAY_DISPLAY = "array<unknown>";

/** Inputs to the combined arity-then-type stdlib method-call check. */
export interface StdlibMethodCallInput {
  /** The method name as written (`e.method`). */
  readonly method: string;
  /** The member's declared signature, looked up by the caller. */
  readonly signature: StdlibMemberSignature;
  /**
   * `displayType` of the receiver's RAW declared type — the same operand
   * `pushUnknownMethod` (`./type-layer-checks.ts`) names, so an alias reads
   * back as itself here too.
   */
  readonly displayReceiverType: string;
  /** `e.args.length`. */
  readonly argCount: number;
  /**
   * The static type of positional argument `i`, or `undefined` when the
   * caller could not resolve one (unused past `argCount` — the caller need
   * not populate every index).
   */
  readonly argTypeAt: (i: number) => CompatType | undefined;
  /**
   * The array receiver's own (already-unfolded) element type, for the
   * `"element"` param descriptor (`includes` / `indexOf` on `array<T>`).
   * `undefined` for a non-array receiver, where no signature spells
   * `"element"`.
   */
  readonly elementType: CompatType | undefined;
  /** Resolves `NamedType`s for the compatibility relation. */
  readonly env: TypeEnv;
  /** The located call-expression site the diagnostics attach to. */
  readonly site: CompatSite;
}

/**
 * Check a stdlib method call's argument list against its member's declared
 * signature: arity first (`theta/parse/stdlib-arity-mismatch`, and if it
 * fails the type check below does not run), then per-argument type
 * (`theta/parse/stdlib-arg-type-mismatch`), deferring any argument whose
 * static type the caller could not resolve.
 */
export function checkStdlibMethodCall(input: StdlibMethodCallInput): Diagnostic[] {
  const { method, signature, displayReceiverType, argCount, argTypeAt, elementType, env, site } =
    input;
  if (argCount < signature.min || argCount > signature.max) {
    const required = argCount < signature.min ? signature.min : signature.max;
    return [
      {
        severity: "error",
        code: STDLIB_ARITY_MISMATCH_CODE,
        file: site.file,
        range: site.range,
        message: stdlibArityMismatchMessage(method, displayReceiverType, required, argCount),
        hint: STDLIB_ARITY_MISMATCH_HINT,
      },
    ];
  }
  const diags: Diagnostic[] = [];
  for (let i = 0; i < signature.params.length && i < argCount; i++) {
    const descriptor = signature.params[i] as StdlibParamKind;
    const argType = argTypeAt(i);
    // The caller could not prove a verdict for this slot (statically
    // unresolvable, or a withheld binder read out under `TypeEnv`) — defer to
    // the runtime belt rather than call `checkCompatible` on a manufactured
    // type (mirrors `checkInvokeArgTypes`'s slot-absent deferral).
    if (argType === undefined) {
      continue;
    }
    if (descriptor === "array") {
      // `concat(other)` accepts ANY `array<U>` — there is no single concrete
      // sup type `checkCompatible` could be asked about, so the array-ness
      // test is inlined here instead of resolved through the compatibility
      // relation. An unresolved `named` argument type defers, exactly as
      // `checkCompatible` would for every other descriptor.
      const unfolded = unfoldAlias(argType, env);
      if (unfolded.kind === "array") {
        continue;
      }
      if (unfolded.kind === "named" && resolveNamedRef(env, unfolded) === undefined) {
        continue;
      }
      diags.push({
        severity: "error",
        code: STDLIB_ARG_TYPE_MISMATCH_CODE,
        file: site.file,
        range: site.range,
        message: stdlibArgTypeMismatchMessage(
          method,
          displayReceiverType,
          i,
          ANY_ARRAY_DISPLAY,
          displayType(argType),
        ),
        hint: STDLIB_ARG_TYPE_MISMATCH_HINT,
      });
      continue;
    }
    const expected: CompatType | undefined =
      descriptor === "element"
        ? elementType
        : { kind: "prim", name: descriptor === "string" ? "string" : "integer" };
    // `elementType` is `undefined` only for a non-array receiver, where no
    // signature spells `"element"` — defensive, unreachable in practice.
    if (expected === undefined) {
      continue;
    }
    const verdict = checkCompatible(argType, expected, env);
    if (verdict === "compatible" || verdict === "unknown") {
      continue;
    }
    diags.push({
      severity: "error",
      code: STDLIB_ARG_TYPE_MISMATCH_CODE,
      file: site.file,
      range: site.range,
      message: stdlibArgTypeMismatchMessage(
        method,
        displayReceiverType,
        i,
        displayType(expected),
        displayType(argType),
      ),
      hint: STDLIB_ARG_TYPE_MISMATCH_HINT,
    });
  }
  return diags;
}
