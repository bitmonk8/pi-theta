// V15f / V15f-T — the invoke parse/load diagnostics seam.
//
// This module owns the parse-time and load-time diagnostics the paired `V15f`
// implementation leaf fills in, all keyed to the code-keyed INV parse/load
// obligation area (invocation.md §Argument binding / §Typed return /
// §Argument arity / §Resolution / §Static resolution):
//
//   - `loom/parse/invoke-arg-type-mismatch` — a positional argument whose type
//     fails the callee's declared param schema, when the callee is statically
//     resolvable; skipped (runtime AJV net) when it is not.
//   - `loom/parse/invoke-return-type-mismatch` — `invoke<Schema>(...)` against a
//     statically-resolvable callee where `T_calleeReturn ⋢ Schema` by
//     compatibility (not equality); skipped when either side is not statically
//     resolvable.
//   - `loom/parse/invoke-arity-too-few` / `loom/parse/invoke-arity-too-many` —
//     arity checked *before* per-argument type; too-few is a parse error only
//     when statically resolvable (else the runtime AJV net), too-many is always
//     a parse error even when the callee is not statically resolvable.
//   - `loom/parse/invoke-non-loom-extension` — an `invoke(...)` literal or a
//     `tools:` `.loom` entry whose path string does not end byte-exact-lowercase
//     `.loom`.
//   - `loom/load/callee-has-errors` — a callee that is unreadable, unparseable,
//     or fails its own structural checks, emitted at the referencing site with
//     the deliberate severity split (error for a `tools:` entry, warning for an
//     `invoke(...)` literal) and the underlying sites listed via `related`.
//
// V15f-T (tests-task) declares the seam shapes and the registry-anchored message
// builders (real, pure) and stubs the five behaviour-bearing checkers so the
// failing tests compile and red on their own primary assertions: each checker
// returns a single inert stub diagnostic (code `stub/v15f-unimplemented`), so a
// test expecting a specific diagnostic reds (wrong code) and a test expecting no
// diagnostic reds (unexpected length). The paired V15f implementation leaf
// replaces these bodies with the real checks. No test reds on a compile error,
// a missing fixture, or a harness throw.
//
// Spec: invocation.md (§Argument binding, §Typed return, §Argument arity,
// §Resolution, §Static resolution), implementation-notes.md
// ("Static-resolution load pass"), diagnostics/code-registry-parse.md,
// diagnostics/code-registry-load.md, diagnostics/placeholder-rendering-a.md,
// diagnostics/placeholder-rendering-b.md.

import {
  type Diagnostic,
  type RelatedSite,
} from "../diagnostics/diagnostic";
import {
  type CompatSite,
  type CompatType,
  type TypeEnv,
  checkCompatible,
  displayType,
} from "./type-compat";

// --------------------------------------------------------------------------
// Diagnostic codes (diagnostics/code-registry-parse.md, code-registry-load.md)
// --------------------------------------------------------------------------

/** `loom/parse/invoke-arg-type-mismatch` (code-registry-parse.md). */
export const INVOKE_ARG_TYPE_MISMATCH_CODE = "loom/parse/invoke-arg-type-mismatch";

/** `loom/parse/invoke-return-type-mismatch` (code-registry-parse.md). */
export const INVOKE_RETURN_TYPE_MISMATCH_CODE =
  "loom/parse/invoke-return-type-mismatch";

/** `loom/parse/invoke-arity-too-few` (code-registry-parse.md). */
export const INVOKE_ARITY_TOO_FEW_CODE = "loom/parse/invoke-arity-too-few";

/** `loom/parse/invoke-arity-too-many` (code-registry-parse.md). */
export const INVOKE_ARITY_TOO_MANY_CODE = "loom/parse/invoke-arity-too-many";

/** `loom/parse/invoke-non-loom-extension` (code-registry-parse.md). */
export const INVOKE_NON_LOOM_EXTENSION_CODE =
  "loom/parse/invoke-non-loom-extension";

/** `loom/load/callee-has-errors` (code-registry-load.md). */
export const CALLEE_HAS_ERRORS_CODE = "loom/load/callee-has-errors";

// --------------------------------------------------------------------------
// Registry-anchored message + hint builders (real, pure — the *Message*/*Hint*
// columns of the registry are the single source of truth per the
// *Diagnostic message anchors* rule).
// --------------------------------------------------------------------------

/**
 * `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`.
 * `<i>` is the 0-based positional argument index (numeric placeholder, category
 * 4 of placeholder-rendering-a.md), matching the `fn-arg-type-mismatch` base.
 */
export function invokeArgTypeMismatchMessage(
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return `invoke argument ${index} ('${paramName}') type mismatch: expected ${expected}, got ${actual}`;
}

/**
 * `invoke<Schema> annotation incompatible with callee '<callee>' return type <actual>`.
 * `<callee>` renders per the category-7 `<callee>` rule (registered slash name,
 * else the verbatim path-literal source text); `<actual>` is the callee's
 * inferred return type display form.
 */
export function invokeReturnTypeMismatchMessage(
  callee: string,
  actual: string,
): string {
  return `invoke<Schema> annotation incompatible with callee '${callee}' return type ${actual}`;
}

/**
 * `invoke '<callee>' passes too few arguments: expected <required> non-defaulted, got <provided>`.
 * `<required>` / `<provided>` are the category-4 numeric integer counts.
 */
export function invokeArityTooFewMessage(
  callee: string,
  required: number,
  provided: number,
): string {
  return `invoke '${callee}' passes too few arguments: expected ${required} non-defaulted, got ${provided}`;
}

/**
 * `invoke '<callee>' passes too many arguments: expected at most <max>, got <provided>`.
 * `<max>` / `<provided>` are the category-4 numeric integer counts.
 */
export function invokeArityTooManyMessage(
  callee: string,
  max: number,
  provided: number,
): string {
  return `invoke '${callee}' passes too many arguments: expected at most ${max}, got ${provided}`;
}

/** `invoke path '<path>' does not end in .loom` (`<path>` is the literal path text). */
export function invokeNonLoomExtensionMessage(literalPath: string): string {
  return `invoke path '${literalPath}' does not end in .loom`;
}

/** `callee '<path>' has errors; see related diagnostics`. */
export function calleeHasErrorsMessage(calleePath: string): string {
  return `callee '${calleePath}' has errors; see related diagnostics`;
}

/** Registry *Hint* column for `loom/parse/invoke-return-type-mismatch`. */
export const INVOKE_RETURN_TYPE_MISMATCH_HINT =
  "Widen the annotation, narrow the callee, or drop the annotation and let the runtime AJV check decide.";

/** Registry *Hint* column for `loom/parse/invoke-arity-too-few`. */
export const INVOKE_ARITY_TOO_FEW_HINT =
  "Provide the missing argument(s) or default the corresponding `params:` field on the callee.";

/** Registry *Hint* column for `loom/parse/invoke-arity-too-many`. */
export const INVOKE_ARITY_TOO_MANY_HINT =
  "Drop the extra argument(s); positional binding has no destination for them.";

/** Registry *Hint* column for `loom/parse/invoke-non-loom-extension`. */
export const INVOKE_NON_LOOM_EXTENSION_HINT =
  "invoke and `tools:` paths must end in `.loom`; use `import` for `.warp` library code.";

/** Registry *Hint* column for `loom/load/callee-has-errors`. */
export const CALLEE_HAS_ERRORS_HINT = "Open the callee and fix the listed errors.";

// --------------------------------------------------------------------------
// V15f-T stub sentinel
// --------------------------------------------------------------------------

/**
 * The inert stub diagnostic every V15f-T checker returns until the paired V15f
 * implementation replaces the body. Its code is deliberately *not* a
 * `loom/...` registry code, so no test asserts it and the closing-gate registry
 * parity is unaffected; every V15f-T test reds because it observes this sentinel
 * instead of the intended diagnostic (or instead of an empty result).
 */
const STUB_CODE = "stub/v15f-unimplemented";

function stub(): Diagnostic[] {
  return [
    {
      severity: "error",
      code: STUB_CODE,
      message: "V15f invoke diagnostics not implemented",
    },
  ];
}

// --------------------------------------------------------------------------
// Argument type mismatch — loom/parse/invoke-arg-type-mismatch
// --------------------------------------------------------------------------

/** One positional argument bound against its declared callee param. */
export interface InvokeArgSlot {
  /** The callee `params:` field name this positional slot binds to. */
  readonly paramName: string;
  /** The param's declared schema type. */
  readonly paramType: CompatType;
  /** The argument expression's static type. */
  readonly argType: CompatType;
}

/** Inputs to the per-argument type check. */
export interface InvokeArgTypeInput {
  /**
   * Whether the callee is statically resolvable per invocation.md §Static
   * resolution. When `false`, the parse check is skipped and the runtime AJV
   * check is the only safety net (no parse error).
   */
  readonly staticallyResolvable: boolean;
  /** The positional argument slots, in declaration order. */
  readonly args: readonly InvokeArgSlot[];
  /** Resolves `NamedType`s for the compatibility relation. */
  readonly env: TypeEnv;
  /** The located referencing site the diagnostics attach to. */
  readonly site: CompatSite;
}

/**
 * Check each positional `invoke(...)` argument against the callee's declared
 * param schema (invocation.md §Argument binding). When the callee is not
 * statically resolvable the check is skipped entirely (runtime AJV net);
 * otherwise a static mismatch on slot `i` fires
 * `loom/parse/invoke-arg-type-mismatch`. A statically-unresolvable operand
 * within a slot (`checkCompatible` → `"unknown"`) is likewise deferred.
 *
 * V15f-T stubs this inert (a single sentinel diagnostic); the paired V15f leaf
 * fills it in.
 */
export function checkInvokeArgTypes(_input: InvokeArgTypeInput): Diagnostic[] {
  return stub();
}

// --------------------------------------------------------------------------
// Return type mismatch — loom/parse/invoke-return-type-mismatch
// --------------------------------------------------------------------------

/** Inputs to the typed-return compatibility check. */
export interface InvokeReturnTypeInput {
  /** `<callee>` render form (registered slash name or verbatim path). */
  readonly callee: string;
  /**
   * Whether the callee is statically resolvable. When `false`, no parse error
   * fires (runtime AJV net). The annotation `Schema`'s own resolvability is
   * carried through `checkCompatible` returning `"unknown"`.
   */
  readonly calleeResolvable: boolean;
  /** The `invoke<Schema>` annotation type. */
  readonly schema: CompatType;
  /** The callee's inferred return type `T_calleeReturn`. */
  readonly calleeReturn: CompatType;
  /** Resolves `NamedType`s for the compatibility relation. */
  readonly env: TypeEnv;
  /** The located referencing site the diagnostic attaches to. */
  readonly site: CompatSite;
}

/**
 * Check `T_calleeReturn ⊑ Schema` by compatibility (not equality) when both the
 * annotation and the callee are statically resolvable (invocation.md §Typed
 * return): a narrower callee return under a wider annotation (e.g. `Cat ⊑
 * Animal`) is accepted; an incompatible one fires
 * `loom/parse/invoke-return-type-mismatch`. When either side is not statically
 * resolvable no parse error fires (runtime AJV net).
 *
 * V15f-T stubs this inert; the paired V15f leaf fills it in.
 */
export function checkInvokeReturnType(_input: InvokeReturnTypeInput): Diagnostic[] {
  return stub();
}

// --------------------------------------------------------------------------
// Argument arity — loom/parse/invoke-arity-too-few / -too-many
// --------------------------------------------------------------------------

/** Inputs to the arity check. */
export interface InvokeArityInput {
  /** `<callee>` render form. */
  readonly callee: string;
  /**
   * Whether the callee is statically resolvable. Governs only the *too-few*
   * arm: too-few is a parse error when resolvable, else it falls back to the
   * runtime AJV validation on the missing required field(s). *too-many* is
   * always a parse error regardless.
   */
  readonly staticallyResolvable: boolean;
  /** Count of non-defaulted `params:` (the minimum required arity). */
  readonly requiredCount: number;
  /** Total `params:` count (the maximum accepted arity). */
  readonly totalCount: number;
  /** Number of positional arguments supplied at the call site. */
  readonly providedCount: number;
  /** The located referencing site the diagnostic attaches to. */
  readonly site: CompatSite;
}

/**
 * Check `invoke(...)` (and `.loom` callable call) argument arity (invocation.md
 * §Argument arity):
 *
 *   - `providedCount > totalCount` → `loom/parse/invoke-arity-too-many`, always
 *     (even when the callee is not statically resolvable — extra positionals
 *     have no destination and no runtime net is possible).
 *   - `providedCount < requiredCount` → `loom/parse/invoke-arity-too-few` when
 *     statically resolvable; otherwise no parse error (runtime AJV net).
 *
 * V15f-T stubs this inert; the paired V15f leaf fills it in.
 */
export function checkInvokeArity(_input: InvokeArityInput): Diagnostic[] {
  return stub();
}

// --------------------------------------------------------------------------
// Arity-before-type orchestration
// --------------------------------------------------------------------------

/** Inputs to the combined arity-then-type invoke-call check. */
export interface InvokeCallInput {
  /** `<callee>` render form. */
  readonly callee: string;
  /** Whether the callee is statically resolvable. */
  readonly staticallyResolvable: boolean;
  /** Count of non-defaulted `params:`. */
  readonly requiredCount: number;
  /** Total `params:` count. */
  readonly totalCount: number;
  /** The positional argument slots, in declaration order. */
  readonly args: readonly InvokeArgSlot[];
  /** Resolves `NamedType`s for the compatibility relation. */
  readonly env: TypeEnv;
  /** The located referencing site the diagnostics attach to. */
  readonly site: CompatSite;
}

/**
 * Run the invoke-call static checks in the mandated order: arity is checked
 * **before** per-argument type (invocation.md §Argument arity), so a call that
 * both mis-arities and mis-types reports the arity error rather than a confusing
 * per-argument type error on the first extra slot. When arity fails the
 * per-argument type check does not run.
 *
 * V15f-T stubs this inert; the paired V15f leaf fills it in.
 */
export function checkInvokeCall(_input: InvokeCallInput): Diagnostic[] {
  return stub();
}

// --------------------------------------------------------------------------
// Non-loom extension — loom/parse/invoke-non-loom-extension
// --------------------------------------------------------------------------

/** Which surface referenced the path (governs only the diagnostic prose framing). */
export type InvokePathSurface = "invoke" | "tools";

/** Inputs to the extension check. */
export interface InvokeExtensionInput {
  /** The path literal exactly as written (no realpath normalisation). */
  readonly literalPath: string;
  /** The referencing surface: an `invoke(...)` literal or a `tools:` `.loom` entry. */
  readonly surface: InvokePathSurface;
  /** The located referencing site the diagnostic attaches to. */
  readonly site: CompatSite;
}

/**
 * Fire `loom/parse/invoke-non-loom-extension` when the path literal does not end
 * byte-exact-lowercase `.loom` — a `.warp` path or any non-lowercase variant
 * such as `.LOOM` (invocation.md §Resolution, lexical.md §Extension matching).
 * The same code fires for both surfaces.
 *
 * V15f-T stubs this inert; the paired V15f leaf fills it in.
 */
export function checkInvokeExtension(_input: InvokeExtensionInput): Diagnostic[] {
  return stub();
}

// --------------------------------------------------------------------------
// Callee has errors — loom/load/callee-has-errors
// --------------------------------------------------------------------------

/** Inputs to the callee-has-errors check. */
export interface CalleeHasErrorsInput {
  /** `<path>` render form for the callee. */
  readonly calleePath: string;
  /** The referencing surface — governs the deliberate severity split. */
  readonly surface: InvokePathSurface;
  /**
   * Whether the callee is unreadable, unparseable, or failed its own structural
   * checks during the static-resolution walk (i.e. is *not* statically
   * resolvable). When `false`, no diagnostic fires.
   */
  readonly hasErrors: boolean;
  /** One `related` entry per underlying error site in the callee. */
  readonly relatedSites: readonly RelatedSite[];
  /** The located referencing site the diagnostic attaches to. */
  readonly site: CompatSite;
}

/**
 * Emit `loom/load/callee-has-errors` at the referencing site when the callee
 * failed static resolution (invocation.md §Static resolution,
 * implementation-notes.md "Static-resolution load pass"). Severity is per
 * surface: **error** for a `tools:` `.loom` entry (the callable cannot be
 * created and the parent does not register) and **warning** for a literal
 * `invoke(...)` callee (the parent registers, static checks against that callee
 * are skipped, and the runtime AJV check is the net). The underlying sites are
 * listed via `related`.
 *
 * V15f-T stubs this inert; the paired V15f leaf fills it in.
 */
export function checkCalleeHasErrors(_input: CalleeHasErrorsInput): Diagnostic[] {
  return stub();
}

// Re-export the compatibility helpers the checkers compose with, so consumers
// (and the V15f-T tests) reference one import site. Kept as type-only for the
// model types and value for the relation helpers.
export { checkCompatible, displayType };
export type { CompatType, TypeEnv, CompatSite };
