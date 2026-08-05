// V15f / V15f-T — the invoke parse/load diagnostics seam.
//
// This module owns the parse-time and load-time diagnostics the paired `V15f`
// implementation leaf fills in, all keyed to the code-keyed INV parse/load
// obligation area (invocation.md §Argument binding / §Typed return /
// §Argument arity / §Resolution / §Static resolution):
//
//   - `theta/parse/invoke-arg-type-mismatch` — a positional argument whose type
//     fails the callee's declared param schema, when the callee is statically
//     resolvable; skipped (runtime AJV net) when it is not.
//   - `theta/parse/invoke-return-type-mismatch` — `invoke<Schema>(...)` against a
//     statically-resolvable callee where `T_calleeReturn ⋢ Schema` by
//     compatibility (not equality); skipped when either side is not statically
//     resolvable.
//   - `theta/parse/invoke-arity-too-few` / `theta/parse/invoke-arity-too-many` —
//     arity checked *before* per-argument type; too-few is a parse error only
//     when statically resolvable (else the runtime AJV net), too-many is always
//     a parse error even when the callee is not statically resolvable.
//   - `theta/parse/invoke-non-theta-extension` — an `invoke(...)` literal or a
//     `tools:` `.theta` entry whose path string does not end byte-exact-lowercase
//     `.theta`.
//   - `theta/load/callee-has-errors` — a callee that is unreadable, unparseable,
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

/** `theta/parse/invoke-arg-type-mismatch` (code-registry-parse.md). */
export const INVOKE_ARG_TYPE_MISMATCH_CODE = "theta/parse/invoke-arg-type-mismatch";

/** `theta/parse/invoke-return-type-mismatch` (code-registry-parse.md). */
export const INVOKE_RETURN_TYPE_MISMATCH_CODE =
  "theta/parse/invoke-return-type-mismatch";

/** `theta/parse/invoke-arity-too-few` (code-registry-parse.md). */
export const INVOKE_ARITY_TOO_FEW_CODE = "theta/parse/invoke-arity-too-few";

/** `theta/parse/invoke-arity-too-many` (code-registry-parse.md). */
export const INVOKE_ARITY_TOO_MANY_CODE = "theta/parse/invoke-arity-too-many";

/** `theta/parse/invoke-non-theta-extension` (code-registry-parse.md). */
export const INVOKE_NON_THETA_EXTENSION_CODE =
  "theta/parse/invoke-non-theta-extension";

/** `theta/load/callee-has-errors` (code-registry-load.md). */
export const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";

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

/** `invoke path '<path>' does not end in .theta` (`<path>` is the literal path text). */
export function invokeNonThetaExtensionMessage(literalPath: string): string {
  return `invoke path '${literalPath}' does not end in .theta`;
}

/** `callee '<path>' has errors; see related diagnostics`. */
export function calleeHasErrorsMessage(calleePath: string): string {
  return `callee '${calleePath}' has errors; see related diagnostics`;
}

/** Registry *Hint* column for `theta/parse/invoke-return-type-mismatch`. */
export const INVOKE_RETURN_TYPE_MISMATCH_HINT =
  "Widen the annotation, narrow the callee, or drop the annotation and let the runtime AJV check decide.";

/** Registry *Hint* column for `theta/parse/invoke-arity-too-few`. */
export const INVOKE_ARITY_TOO_FEW_HINT =
  "Provide the missing argument(s) or default the corresponding `params:` field on the callee.";

/** Registry *Hint* column for `theta/parse/invoke-arity-too-many`. */
export const INVOKE_ARITY_TOO_MANY_HINT =
  "Drop the extra argument(s); positional binding has no destination for them.";

/** Registry *Hint* column for `theta/parse/invoke-non-theta-extension`. */
export const INVOKE_NON_THETA_EXTENSION_HINT =
  "invoke and `tools:` paths must end in `.theta`; use `import` for `.thetalib` library code.";

/** Registry *Hint* column for `theta/load/callee-has-errors`. */
export const CALLEE_HAS_ERRORS_HINT = "Open the callee and fix the listed errors.";

// --------------------------------------------------------------------------
// Argument type mismatch — theta/parse/invoke-arg-type-mismatch
// --------------------------------------------------------------------------

/** One positional argument bound against its declared callee param. */
export interface InvokeArgSlot {
  /** The callee `params:` field name this positional slot binds to. */
  readonly paramName: string;
  /**
   * The param's declared schema type, or `undefined` when the caller could
   * not prove a verdict for this slot — the slot defers to the callee's
   * runtime AJV load (`type-system.md` §"Unresolvable operands").
   */
  readonly paramType: CompatType | undefined;
  /**
   * The argument expression's static type, or `undefined` for the same
   * reason as `paramType` (the two are always absent or present together).
   */
  readonly argType: CompatType | undefined;
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
 * `theta/parse/invoke-arg-type-mismatch`. A statically-unresolvable operand
 * within a slot (`checkCompatible` → `"unknown"`) is likewise deferred, and so
 * is a slot whose `paramType` / `argType` is absent — the caller could not
 * prove a verdict for it, so it is skipped before `checkCompatible` runs.
 */
export function checkInvokeArgTypes(input: InvokeArgTypeInput): Diagnostic[] {
  const { staticallyResolvable, args, env, site } = input;
  // Callee not statically resolvable → skip the parse check entirely; the
  // runtime AJV check is the only safety net (invocation.md §Argument binding).
  if (!staticallyResolvable) {
    return [];
  }
  const diags: Diagnostic[] = [];
  for (let i = 0; i < args.length; i++) {
    const slot = args[i] as InvokeArgSlot;
    const { paramType, argType } = slot;
    // Either side absent means the caller could not prove a verdict for this
    // slot (bug 0137) — defer to the callee's runtime AJV load rather than
    // call `checkCompatible` on a manufactured type.
    if (paramType === undefined || argType === undefined) {
      continue;
    }
    const r = checkCompatible(argType, paramType, env);
    if (r === "compatible" || r === "unknown") {
      continue;
    }
    diags.push({
      severity: "error",
      code: INVOKE_ARG_TYPE_MISMATCH_CODE,
      file: site.file,
      range: site.range,
      message: invokeArgTypeMismatchMessage(
        i,
        slot.paramName,
        displayType(paramType),
        displayType(argType),
      ),
    });
  }
  return diags;
}

// --------------------------------------------------------------------------
// Return type mismatch — theta/parse/invoke-return-type-mismatch
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
 * `theta/parse/invoke-return-type-mismatch`. When either side is not statically
 * resolvable no parse error fires (runtime AJV net).
 *
 */
export function checkInvokeReturnType(input: InvokeReturnTypeInput): Diagnostic[] {
  const { callee, calleeResolvable, schema, calleeReturn, env, site } = input;
  // Callee not statically resolvable → no parse error; the runtime AJV check is
  // the net (invocation.md §Typed return).
  if (!calleeResolvable) {
    return [];
  }
  // T_calleeReturn ⊑ Schema by compatibility (not equality). A narrower callee
  // return under a wider annotation (Cat ⊑ Animal) is accepted; an
  // unresolvable operand (either side past the parser's static view) defers to
  // the runtime AJV net.
  const r = checkCompatible(calleeReturn, schema, env);
  if (r === "compatible" || r === "unknown") {
    return [];
  }
  return [
    {
      severity: "error",
      code: INVOKE_RETURN_TYPE_MISMATCH_CODE,
      file: site.file,
      range: site.range,
      message: invokeReturnTypeMismatchMessage(callee, displayType(calleeReturn)),
      hint: INVOKE_RETURN_TYPE_MISMATCH_HINT,
    },
  ];
}

// --------------------------------------------------------------------------
// Argument arity — theta/parse/invoke-arity-too-few / -too-many
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
 * Check `invoke(...)` (and `.theta` callable call) argument arity (invocation.md
 * §Argument arity):
 *
 *   - `providedCount > totalCount` → `theta/parse/invoke-arity-too-many`, always
 *     (even when the callee is not statically resolvable — extra positionals
 *     have no destination and no runtime net is possible).
 *   - `providedCount < requiredCount` → `theta/parse/invoke-arity-too-few` when
 *     statically resolvable; otherwise no parse error (runtime AJV net).
 *
 */
export function checkInvokeArity(input: InvokeArityInput): Diagnostic[] {
  const { callee, staticallyResolvable, requiredCount, totalCount, providedCount, site } =
    input;
  // Too-many is always a parse error: extra positionals have no destination and
  // no runtime net can catch them (invocation.md §Argument arity).
  if (providedCount > totalCount) {
    return [
      {
        severity: "error",
        code: INVOKE_ARITY_TOO_MANY_CODE,
        file: site.file,
        range: site.range,
        message: invokeArityTooManyMessage(callee, totalCount, providedCount),
        hint: INVOKE_ARITY_TOO_MANY_HINT,
      },
    ];
  }
  // Too-few is a parse error only when statically resolvable; otherwise the
  // runtime AJV check reds on the missing required field(s).
  if (providedCount < requiredCount) {
    if (!staticallyResolvable) {
      return [];
    }
    return [
      {
        severity: "error",
        code: INVOKE_ARITY_TOO_FEW_CODE,
        file: site.file,
        range: site.range,
        message: invokeArityTooFewMessage(callee, requiredCount, providedCount),
        hint: INVOKE_ARITY_TOO_FEW_HINT,
      },
    ];
  }
  return [];
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
 */
export function checkInvokeCall(input: InvokeCallInput): Diagnostic[] {
  const { callee, staticallyResolvable, requiredCount, totalCount, args, env, site } =
    input;
  // Arity is checked BEFORE per-argument type (invocation.md §Argument arity).
  const arityDiags = checkInvokeArity({
    callee,
    staticallyResolvable,
    requiredCount,
    totalCount,
    providedCount: args.length,
    site,
  });
  if (arityDiags.length > 0) {
    return arityDiags;
  }
  // Arity is in range → run the per-argument type check.
  return checkInvokeArgTypes({ staticallyResolvable, args, env, site });
}

// --------------------------------------------------------------------------
// Non-theta extension — theta/parse/invoke-non-theta-extension
// --------------------------------------------------------------------------

/** Which surface referenced the path (governs only the diagnostic prose framing). */
export type InvokePathSurface = "invoke" | "tools";

/** Inputs to the extension check. */
export interface InvokeExtensionInput {
  /** The path literal exactly as written (no realpath normalisation). */
  readonly literalPath: string;
  /** The referencing surface: an `invoke(...)` literal or a `tools:` `.theta` entry. */
  readonly surface: InvokePathSurface;
  /** The located referencing site the diagnostic attaches to. */
  readonly site: CompatSite;
}

/**
 * Fire `theta/parse/invoke-non-theta-extension` when the path literal does not end
 * byte-exact-lowercase `.theta` — a `.thetalib` path or any non-lowercase variant
 * such as `.THETA` (invocation.md §Resolution, lexical.md §Extension matching).
 * The same code fires for both surfaces.
 *
 */
export function checkInvokeExtension(input: InvokeExtensionInput): Diagnostic[] {
  const { literalPath, site } = input;
  // Byte-exact-lowercase `.theta` suffix (no realpath normalisation, no
  // case-folding): a `.thetalib` path or any non-lowercase variant such as `.THETA`
  // fires (invocation.md §Resolution). The same code fires for both surfaces.
  if (literalPath.endsWith(".theta")) {
    return [];
  }
  return [
    {
      severity: "error",
      code: INVOKE_NON_THETA_EXTENSION_CODE,
      file: site.file,
      range: site.range,
      message: invokeNonThetaExtensionMessage(literalPath),
      hint: INVOKE_NON_THETA_EXTENSION_HINT,
    },
  ];
}

// --------------------------------------------------------------------------
// Callee has errors — theta/load/callee-has-errors
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
 * Emit `theta/load/callee-has-errors` at the referencing site when the callee
 * failed static resolution (invocation.md §Static resolution,
 * implementation-notes.md "Static-resolution load pass"). Severity is per
 * surface: **error** for a `tools:` `.theta` entry (the callable cannot be
 * created and the parent does not register) and **warning** for a literal
 * `invoke(...)` callee (the parent registers, static checks against that callee
 * are skipped, and the runtime AJV check is the net). The underlying sites are
 * listed via `related`.
 *
 */
export function checkCalleeHasErrors(input: CalleeHasErrorsInput): Diagnostic[] {
  const { calleePath, surface, hasErrors, relatedSites, site } = input;
  if (!hasErrors) {
    return [];
  }
  // Deliberate severity split (invocation.md §Static resolution): **error** for
  // a `tools:` `.theta` entry (the callable cannot be created and the parent does
  // not register) and **warning** for a literal `invoke(...)` callee (the parent
  // registers, static checks against the callee are skipped, and the runtime
  // AJV check is the net).
  const severity = surface === "tools" ? "error" : "warning";
  return [
    {
      severity,
      code: CALLEE_HAS_ERRORS_CODE,
      file: site.file,
      range: site.range,
      message: calleeHasErrorsMessage(calleePath),
      hint: CALLEE_HAS_ERRORS_HINT,
      related: relatedSites,
    },
  ];
}

// Re-export the compatibility helpers the checkers compose with, so consumers
// (and the V15f-T tests) reference one import site. Kept as type-only for the
// model types and value for the relation helpers.
export { checkCompatible, displayType };
export type { CompatType, TypeEnv, CompatSite };
