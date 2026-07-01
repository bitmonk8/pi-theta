// V11h / V11h-T — the binder argument-echo formatter seam.
//
// This module owns the data-driven argument-echo renderer of
// binder/defaulting-system-note-echo.md §"Echo policy": the per-value format
// rules (string quote predicate, `integer`/`number` via the shared V2d
// canonical number renderer, `boolean`/`null` literals, enum underlying-wire
// rendering through the quote predicate, the array `[a, b, c]` / `[a, b, c,
// …+N more]` rule, and the object `{first-field-value, …}` rule), the BNDR-6
// reference-rendering table (rows 6a–6x), and the whole-line echo
// `Running /<name>: <formatted-args>` with the `(default)` annotation that
// fires only for a field that took its declared default (fill-if-absent, per
// §Defaulting) — a binder-supplied value for a defaulted field is untagged.
//
// The numeric rows compose the canonical number renderer from `V2d`
// (`renderCanonicalNumber`), selecting BNDR-4 vs BNDR-5 from the field's static
// `integer`-vs-`number` kind carried in the `EchoType` descriptor — never from
// the value's runtime integrality.
//
// Spec: binder/defaulting-system-note-echo.md §"Echo policy" (anchor
// #echo-policy, BNDR-6 reference-rendering table) and §Defaulting
// (fill-if-absent `(default)` tagging).
//
// V11h-T (tests-task) declares these seam shapes — the `EchoType` static-type
// descriptor, the `EchoField` / `EchoParam` / `ArgumentEchoInput` inputs, the
// per-value `renderEchoValue` renderer, and the whole-line `renderArgumentEcho`
// — and stubs the two renderers inertly so the failing tests compile and red on
// their own primary assertions (the format-rule renderer is absent). The paired
// V11h implementation leaf fills these in.

import type { LoomValue } from "../runtime/value";
import { renderCanonicalNumber } from "./canonical-number";

/**
 * The static-type descriptor the formatter consults to select a value's
 * rendering rule. The formatter is data-driven off this descriptor rather than
 * the value's runtime shape: `integer` vs `number` selects BNDR-4 vs BNDR-5
 * (never runtime integrality); `enum` renders the value's underlying wire
 * string through the string quote predicate; `object` carries its declaring
 * schema's field order so the object rule can pick the first field.
 */
export type EchoType =
  | { readonly kind: "string" }
  | { readonly kind: "integer" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "enum" }
  | { readonly kind: "array"; readonly element: EchoType }
  | { readonly kind: "object"; readonly fields: readonly EchoField[] };

/** One object field: its loom-side name (declaration order) and its type. */
export interface EchoField {
  /** The field's loom-side name, in the declaring schema block's source order. */
  readonly name: string;
  /** The field's static type, used to render the field value recursively. */
  readonly type: EchoType;
}

/** One top-level `params:` field to echo, in declaration order. */
export interface EchoParam {
  /** The field's loom-side name, shown as `name=` in the echo. */
  readonly name: string;
  /** The bound value (a runtime value from the value model). */
  readonly value: LoomValue;
  /** The field's static type, selecting its per-value rendering rule. */
  readonly type: EchoType;
  /**
   * Whether the field took its declared default this run (default-supplied, per
   * §Defaulting's fill-if-absent rule — the `defaultedWireNames` from `V11g`).
   * Only a `true` here tags the field `(default)`; a binder-supplied value for a
   * defaulted field carries `false` and is rendered untagged.
   */
  readonly tookDefault: boolean;
}

/** Inputs to the whole-line argument echo `Running /<name>: <formatted-args>`. */
export interface ArgumentEchoInput {
  /** The loom's `/<name>` (shown after `Running /`). */
  readonly loomName: string;
  /** The top-level `params:` fields, in declaration order. */
  readonly params: readonly EchoParam[];
}

/**
 * The unquoted string set: a string renders unquoted iff it is non-empty and
 * every Unicode code point matches `[A-Za-z0-9_.-]`. The set is all-ASCII, so a
 * whole-string anchored match witnesses the per-code-point predicate — any
 * whitespace, out-of-set ASCII punctuation, non-ASCII letter, or C0 control
 * char fails the class and forces quoting.
 */
const UNQUOTED_STRING = /^[A-Za-z0-9_.-]+$/;

/**
 * Apply the §"Echo policy" string quote predicate. Unquoted when the string is
 * non-empty and matches {@link UNQUOTED_STRING}; otherwise quoted as U+0022,
 * the body with each `\` replaced by `\\` and each `"` by `\"` (backslash
 * first so the escapes are not re-doubled), then a closing U+0022. The empty
 * string renders as `""`.
 */
function renderString(value: string): string {
  if (value.length > 0 && UNQUOTED_STRING.test(value)) {
    return value;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Render an array per the §"Echo policy" array rule: arrays of 3 or fewer
 * elements in full as `[a, b, c]`; arrays of 4 or more as `[a, b, c, …+N more]`
 * where the prefix is the first three elements and `N = total − 3`; an empty
 * array as `[]`. Each element is rendered recursively by the element type.
 */
function renderArray(elements: readonly LoomValue[], element: EchoType): string {
  const rendered = elements.map((el) => renderEchoValue(el, element));
  if (rendered.length <= 3) {
    return `[${rendered.join(", ")}]`;
  }
  const prefix = rendered.slice(0, 3).join(", ");
  return `[${prefix}, …+${rendered.length - 3} more]`;
}

/**
 * Render an object per the §"Echo policy" object rule: `{first-field-value, …}`
 * — just the first field's value, rendered recursively by that field's static
 * type. The first field is the leading entry of the declaring schema block's
 * source order carried in the descriptor's `fields`. The trailing `, …` is
 * fixed text rendered for every object value, including single-field objects.
 */
function renderObject(
  value: { readonly [key: string]: LoomValue },
  fields: readonly EchoField[],
): string {
  const first = fields[0];
  if (first === undefined) {
    // An object schema (or discriminated-union variant) always declares at
    // least one field; an empty descriptor is a caller-side construction bug.
    throw new RangeError(
      "renderObject: object EchoType carries no fields; the object rule needs a first field",
    );
  }
  return `{${renderEchoValue(value[first.name] as LoomValue, first.type)}, …}`;
}

/**
 * Render a single bound value to its echo text, per the §"Echo policy" per-value
 * format rules (string quote predicate; `integer`/`number` via the shared V2d
 * canonical number renderer; `boolean`/`null` literals; enum underlying-wire
 * through the quote predicate; the array and object rules, recursively). The
 * BNDR-6 reference-rendering table (rows 6a–6x) pins the observable byte output.
 */
export function renderEchoValue(value: LoomValue, type: EchoType): string {
  switch (type.kind) {
    case "string":
      return renderString(value as string);
    case "integer":
      return renderCanonicalNumber(value as number, "integer");
    case "number":
      return renderCanonicalNumber(value as number, "number");
    case "boolean":
      return (value as boolean) ? "true" : "false";
    case "null":
      return "null";
    case "enum":
      // The formatter sees only the underlying wire string, passed through the
      // same quote predicate as a top-level string value.
      return renderString(String(value));
    case "array":
      return renderArray(value as readonly LoomValue[], type.element);
    case "object":
      return renderObject(
        value as { readonly [key: string]: LoomValue },
        type.fields,
      );
  }
}

/**
 * Render the whole one-line argument echo `Running /<name>: <formatted-args>`:
 * each top-level `params:` field as `name=<rendered-value>`, comma-space
 * separated in declaration order, with `(default)` appended after the value of
 * a field that took its declared default (default-supplied only — a
 * binder-supplied value for a defaulted field is untagged).
 */
export function renderArgumentEcho(input: ArgumentEchoInput): string {
  const fields = input.params.map((param) => {
    const rendered = renderEchoValue(param.value, param.type);
    // The `(default)` tag fires only for a field that took its declared default
    // (fill-if-absent per §Defaulting); a binder-supplied value is untagged.
    return param.tookDefault
      ? `${param.name}=${rendered} (default)`
      : `${param.name}=${rendered}`;
  });
  return `Running /${input.loomName}: ${fields.join(", ")}`;
}
