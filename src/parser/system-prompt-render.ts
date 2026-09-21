// Resolve-time rendering of parsed `system:` templates through the shared
// canonical stringification renderer (QRY-18).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { isEnumValue, isResultValue, schemaTagOf, type ThetaValue } from "../runtime/value";
import {
  interpolationTypeOf,
  stringifyInterpolatedValue,
  type InterpolationType,
} from "../render/query-render";
import type { SystemTemplate, SystemUnionArm } from "./system-interpolation";

// --- Resolve-time render ----------------------------------------------------

/** Inputs to the conversation-creation-time `system:` render. */
export interface RenderSystemPromptInput {
  /** The parsed template produced by {@link checkSystemInterpolation}. */
  readonly template: SystemTemplate;
  /** The validated `params` object the paths resolve against. */
  readonly params: Readonly<Record<string, ThetaValue>>;
}

/**
 * The outcome of rendering a `system:` template. `ok: false` carries a
 * diagnostic for the runtime fallback the shared renderer defines; this arm
 * cannot carry `theta/parse/interpolated-result` from the `system:` surface
 * because `params:` types never include `Result`.
 */
export type RenderSystemPromptResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Render a parsed `system:` template at conversation-creation time: resolve
 * each interpolation path against the validated `params` object and stringify
 * the resolved value through the **shared** canonical renderer
 * (`stringifyInterpolatedValue`, QRY-18), concatenating the literal text runs.
 * Resolves the path segments and feeds each resolved value into
 * `stringifyInterpolatedValue`.
 */
export function renderSystemPrompt(
  input: RenderSystemPromptInput,
): RenderSystemPromptResult {
  let text = "";
  for (const part of input.template.parts) {
    if (part.kind === "text") {
      text += part.value;
      continue;
    }
    // Resolve the validated path against the params object, then stringify the
    // resolved value through the shared canonical renderer (QRY-18) so the model
    // sees one rendering of a given value regardless of surface.
    const value = resolvePath(input.params, part.segments);
    // Element-level union arms (bug 0444 §Fix route (a)): a compact
    // `JSON.stringify` of the array is byte-identical to joining the
    // per-element compact renders with `,` inside `[]`; each element picks its
    // own arm independently so one unmatched element (`interpolationTypeOf`
    // → untranslated object row) never un-translates its siblings (§Fix
    // constraint).
    if (part.elementArms !== undefined && Array.isArray(value)) {
      const pieces: string[] = [];
      for (const element of value as readonly ThetaValue[]) {
        const armType = unionArmObjectType(element, part.elementArms);
        if (armType !== undefined) {
          const renderedElem = stringifyInterpolatedValue(element, armType);
          if (!renderedElem.ok) {
            return { ok: false, diagnostic: renderedElem.diagnostic };
          }
          pieces.push(renderedElem.text);
        } else {
          // No arm admits this element: keep its untranslated JSON bytes,
          // byte-identical to the whole-array JSON.stringify the array row would
          // produce (§Fix "leaving unmatched ones untranslated"). A scalar
          // element routed through its scalar interpolation row would emit
          // invalid JSON inside the array (a bare unquoted string / enum);
          // JSON.stringify quotes and escapes it correctly and collapses a
          // boxed-enum value to its bare wire string, matching the pre-fix bytes.
          // unionArmObjectType returns undefined for any non-object element, so
          // the matched branch above implies an object element that matched an arm.
          pieces.push(JSON.stringify(element));
        }
      }
      text += "[" + pieces.join(",") + "]";
      continue;
    }
    const effectiveType =
      part.valueDriven && part.unionArms !== undefined
        ? (unionArmObjectType(value, part.unionArms) ?? interpolationTypeOf(value))
        : part.valueDriven
          ? interpolationTypeOf(value)
          : part.type;
    const rendered = stringifyInterpolatedValue(value, effectiveType);
    if (!rendered.ok) {
      return { ok: false, diagnostic: rendered.diagnostic };
    }
    text += rendered.text;
  }
  return { ok: true, text };
}

/**
 * Pick the resolved value's arm from a `discriminated-union`'s static arm
 * list and mint the object `InterpolationType` that arm's sidecars translate
 * through (bug 0425 §Fix route (a)). Two pick strategies, tried in order:
 *
 *   1. schema brand — `schemaTagOf` reads the non-enumerable tag
 *      `brandSchemaValue` installs; an exact arm-name match wins outright.
 *   2. structural (no brand, or a brand naming no arm) — an arm ADMITS iff
 *      its field-name set is EXACTLY the value's own key set (same size,
 *      every field name present) and every literal-discriminator field's
 *      value in `arm.literals` matches. The UNIQUE admitting arm wins; zero
 *      or more-than-one admitting arm returns `undefined` — the §Fix's "never
 *      guess" constraint — so the caller falls back to today's untranslated
 *      value-driven row.
 *
 * `undefined` also when `value` is not a plain schema-shaped record (a
 * scalar, `null`, an array, an enum, or a `Result`) — those runtime kinds
 * never reach this helper today (bug 0408 kept them on their own scalar
 * rows), but the guard keeps the predicate honest if that ever changes.
 */
function unionArmObjectType(
  value: ThetaValue,
  arms: readonly SystemUnionArm[],
): InterpolationType | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    isEnumValue(value) ||
    isResultValue(value)
  ) {
    return undefined;
  }
  const armType = (arm: SystemUnionArm): InterpolationType => ({
    kind: "object",
    ...(arm.sidecars !== undefined ? { sidecars: arm.sidecars } : {}),
    rootDef: arm.rootDef,
  });
  const brand = schemaTagOf(value);
  if (brand !== undefined) {
    const byBrand = arms.find((a) => a.name === brand);
    if (byBrand !== undefined) {
      return armType(byBrand);
    }
  }
  const keys = Object.keys(value as Readonly<Record<string, ThetaValue>>);
  const record = value as Readonly<Record<string, ThetaValue>>;
  const admitting = arms.filter((arm) => {
    if (arm.fieldNames.length !== keys.length) {
      return false;
    }
    if (!arm.fieldNames.every((fn) => keys.includes(fn))) {
      return false;
    }
    for (const [field, literal] of arm.literals) {
      if (record[field] !== literal) {
        return false;
      }
    }
    return true;
  });
  return admitting.length === 1 ? armType(admitting[0] as SystemUnionArm) : undefined;
}

/** Resolve a validated `Ident ('.' Ident)*` path against the params object. */
function resolvePath(
  params: Readonly<Record<string, ThetaValue>>,
  segments: readonly string[],
): ThetaValue {
  let current: ThetaValue = params[segments[0] as string] as ThetaValue;
  for (let s = 1; s < segments.length; s++) {
    // The opaque/value-driven path admits `.Ident` chains over intermediates the
    // closed-schema paths never could — a null or absent intermediate reachable
    // here has no field to index, so the walk yields `undefined` rather than
    // throwing a TypeError out of the render (which the spawn's `!ok` fallback
    // would not catch, crashing on admitted input).
    if (current === null || current === undefined) {
      return undefined as unknown as ThetaValue;
    }
    current = (current as { readonly [key: string]: ThetaValue })[
      segments[s] as string
    ] as ThetaValue;
  }
  return current;
}
