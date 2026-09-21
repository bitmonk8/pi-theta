// Compose-pass callee arity and argument-slot type model, including runtime-tool
// success types and the Pi-tool input-schema subset.

import type { CallableSetSnapshot } from "../parser/callable-set";
import type { ThetaMode } from "../parser/frontmatter";
import type { InvokeArgSlot } from "../parser/invoke-diagnostics";
import { RUNTIME_TOOL_SIGNATURES, type RuntimeToolName } from "../parser/runtime-tools";
import type { StaticTypeInferencePass } from "../parser/static-type-inference";
import type { Expr } from "../parser/theta-document";
import { checkCompatible, displayType, type CompatType, type TypeEnv } from "../parser/type-compat";
import { annotationToCompatType, letAnnotationToCompatType } from "../parser/type-layer-checks";
import { collectProvableArgTypes } from "./invoke-expr-call-surface";

/**
 * RFC 0011 §0 C6: build the runtime-tool success-type map for a compose-pass
 * `StaticTypeInferencePass` from the callable set's `"runtime-tool"` entries.
 * GOV-15 inert: returns `undefined` when the set holds no such entry.
 */
function buildComposePassSuccessTypes(
  callableSet: CallableSetSnapshot | undefined,
): ReadonlyMap<string, CompatType> | undefined {
  if (callableSet === undefined) {
    return undefined;
  }
  let out: Map<string, CompatType> | undefined;
  for (const [presented, entry] of callableSet.entries) {
    if (entry.kind !== "runtime-tool") {
      continue;
    }
    const canonical: RuntimeToolName = (entry as { name: RuntimeToolName }).name;
    const sig = RUNTIME_TOOL_SIGNATURES.get(canonical);
    if (sig === undefined) {
      continue;
    }
    const type = letAnnotationToCompatType(sig.successTypeSource);
    if (type !== undefined) {
      out ??= new Map();
      out.set(presented, type);
    }
  }
  return out;
}

/** One `.theta`-callable / `invoke(...)` callee's `params:` field, as the
 * per-argument type-mismatch checks (`theta/parse/tool-arg-type-mismatch`, bug
 * 0072; `theta/parse/invoke-arg-type-mismatch`, bug 0137) consume it:
 * positional order, verbatim declared type source and field name. */
export interface CalleeArityField {
  /** The field's verbatim declared type source (`params: { x: <this> }`). */
  readonly typeSource: string;
  /**
   * The field's verbatim `params:` name (`params: { <this>: string }`). Bug
   * 0137's invoke-literal arm reports this as `<param>`; the
   * `.theta`-callable arm's own *Message* carries no `<param>` (bug 0072 never
   * needed this field), so that arm does not read it.
   */
  readonly name: string;
}

/** The callee shape the arity check consults, resolved once per site. */
export interface CalleeArity {
  /** Count of `params:` fields that are neither defaulted nor optional. */
  readonly requiredCount: number;
  /** Total `params:` field count. */
  readonly totalCount: number;
  /**
   * The callee's WHOLE `params:` list, in declaration order (bug 0072; bug
   * 0137): slot `i` of a `.theta`-callable call OR an `invoke(...)` call
   * binds to `fields[i]`, the same positional correspondence
   * `checkInvokeArity`'s counts already assume (invocation.md §"Argument
   * binding").
   */
  readonly fields: readonly CalleeArityField[];
  /**
   * The callee's declared frontmatter `mode:` (RFC 0009; invocation.md INV-8's
   * static mode gate). Carried here rather than resolved separately because
   * `arity !== undefined` is already this pass's static-resolvability predicate
   * (invocation.md §Static resolution) and the mode gate keys on exactly that
   * value — so the gate costs no second callee read. Present on every
   * `resolveCalleeArity` return: `mode:` is a required frontmatter field
   * (`theta/load/missing-mode`), so a resolvable callee always has one.
   */
  readonly mode: ThetaMode;
}

/**
 * Read a Pi tool's registered JSON-Schema `parameters.properties` map (bug
 * 0072), or `undefined` when `parameters` is absent or not a plausible
 * JSON-Schema object. A `Map` built from `Object.entries`, never a
 * plain-object property read on a field name: the caller keys into this map
 * by the theta author's own object-literal field name, which is arbitrary
 * source text (the 0031/0038 hazard class) — `parameters`/`properties`/`type`
 * themselves are fixed keys this module chooses, not author-controlled, so a
 * direct property read on them is unaffected.
 */
function toolParameterProperties(
  parameters: unknown,
): ReadonlyMap<string, unknown> | undefined {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    return undefined;
  }
  const properties = (parameters as { readonly properties?: unknown }).properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return undefined;
  }
  return new Map(Object.entries(properties as Record<string, unknown>));
}

/**
 * The JSON-Schema keywords that make one input-schema field's disjointness
 * unprovable: tool-calls.md §"Provable-disjointness check (parse time)" defers
 * anything the schema subset cannot represent to the runtime AJV check, and
 * any of these refines the accepted-value set past what a bare `type`
 * kind-set comparison can decide.
 */
const SCHEMA_REFINEMENT_KEYS: ReadonlySet<string> = new Set([
  "format",
  "pattern",
  "enum",
  "const",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
]);

/**
 * The rendered subset-kind-set source `computeToolArgSchemaConflict`
 * (../runtime/tool-call.ts) consumes for one Pi-tool input-schema field, or
 * `undefined` when the field carries no `type` or any `SCHEMA_REFINEMENT_KEYS`
 * keyword (unprovable: defer to the runtime AJV net). A JSON-Schema
 * `type` array (`["string", "null"]`) renders as `a | b` — `subsetKinds`
 * splits top-level unions the same way an author-written union annotation
 * does.
 */
function fieldSchemaType(fieldSchema: unknown): string | undefined {
  if (typeof fieldSchema !== "object" || fieldSchema === null || Array.isArray(fieldSchema)) {
    return undefined;
  }
  const record = fieldSchema as Record<string, unknown>;
  if (Object.keys(record).some((key) => SCHEMA_REFINEMENT_KEYS.has(key))) {
    return undefined;
  }
  const type = record["type"];
  if (typeof type === "string") {
    return type;
  }
  if (Array.isArray(type) && type.every((t) => typeof t === "string")) {
    return (type as string[]).join(" | ");
  }
  return undefined;
}

/**
 * Build one `invoke(...)` positional argument slot (bug 0137), reusing the
 * `.theta`-callable arm's per-slot mechanisms unchanged: the expected side
 * from the callee's verbatim `params:` field type (`annotationToCompatType`),
 * the actual side from the SET of types the argument can evaluate to
 * (`collectProvableArgTypes`), both judged under `emptyCalleeAnnotationEnv` so
 * a caller-local homonym cannot decide a verdict about the callee's contract.
 *
 * Returns a WITHHELD slot (`paramType` / `argType` both `undefined`) whenever
 * any input is absent or the every-member-incompatible test does not hold:
 * `field` absent is the too-many case (arity already fails on this site, so
 * `checkInvokeCall` never reaches the per-argument check, and no field name is
 * available to report); `argExpr` absent cannot arise given how the caller
 * derives its loop bound from the same `invoke.args`, kept as a defensive
 * withhold rather than an unchecked index read; `annotationToCompatType`
 * returning `undefined` and `collectProvableArgTypes` returning `undefined`
 * both mean the same thing `type-system.md` §"Unresolvable operands" already
 * names — a side past the parser's static view defers to the callee's runtime
 * AJV load. `checkInvokeArgTypes` skips a withheld slot before it calls
 * `checkCompatible`.
 *
 * Never fabricates a `CompatType` for a withheld slot: `decide`
 * (`../parser/type-compat.ts`) tests `sup.kind === "array"` / `"object"`
 * before its `sub.kind === "named"` branch, so a sentinel unresolvable
 * `named` argument type would answer `"incompatible"` at an `array<…>` or
 * inline-object param — a false `E` against a well-typed program.
 */
function buildInvokeArgSlot(
  argExpr: Expr | undefined,
  field: CalleeArityField | undefined,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
  emptyCalleeAnnotationEnv: TypeEnv,
): InvokeArgSlot {
  const withheld = (paramName: string): InvokeArgSlot => ({
    paramName,
    paramType: undefined,
    argType: undefined,
  });
  if (field === undefined) {
    return withheld("");
  }
  if (argExpr === undefined) {
    return withheld(field.name);
  }
  const expectedType = annotationToCompatType(field.typeSource);
  if (expectedType === undefined) {
    return withheld(field.name);
  }
  const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
  if (argTypes === undefined) {
    return withheld(field.name);
  }
  const everyMemberIncompatible = argTypes.every(
    (argType) =>
      checkCompatible(argType, expectedType, emptyCalleeAnnotationEnv) === "incompatible",
  );
  if (!everyMemberIncompatible) {
    // One arm the `params:` field accepts — or answers `"unknown"` /
    // `"integer-narrowing"` for — means a runtime value may well type-check,
    // so the slot defers to the runtime AJV net.
    return withheld(field.name);
  }
  return {
    paramName: field.name,
    paramType: expectedType,
    argType: dedupeArgType(argTypes),
  };
}

/**
 * Reduce a collected value-type set (`collectProvableArgTypes`) to the single
 * `CompatType` `checkInvokeArgTypes` re-decides against (`buildInvokeArgSlot`):
 * one member per distinct `displayType` rendering — the same de-duplication
 * `renderCollectedTypes` applies for the message string — collapsed to that
 * member alone when only one rendering survives, else a `union` over the
 * survivors so `displayType` reproduces the identical `" | "`-joined spelling.
 * Every returned member is drawn from `types` itself, never invented: the
 * every-member-incompatible verdict is decided by `buildInvokeArgSlot` BEFORE
 * this function runs, so `checkCompatible`'s union-sub rule (`decide`,
 * type-compat.ts, TYPE-6 — which returns `"incompatible"` on the FIRST
 * mismatching arm) only RE-DERIVES that verdict when `checkInvokeArgTypes`
 * re-runs it, rather than deciding it here. That rule is unsound as a
 * discriminator over a mixed set, and sound only because every arm already
 * agrees by construction.
 */
export function dedupeArgType(types: readonly CompatType[]): CompatType {
  const byDisplay = new Map<string, CompatType>();
  for (const type of types) {
    const key = displayType(type);
    if (!byDisplay.has(key)) {
      byDisplay.set(key, type);
    }
  }
  const arms = [...byDisplay.values()];
  return arms.length === 1 ? (arms[0] as CompatType) : { kind: "union", arms };
}

export {
  buildComposePassSuccessTypes,
  buildInvokeArgSlot,
  fieldSchemaType,
  toolParameterProperties,
};
