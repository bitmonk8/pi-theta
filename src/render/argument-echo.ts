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

import { sanitizeSystemNoteSubstring } from "../binder/system-note";
import type { ThetaValue } from "../runtime/value";
import { renderCanonicalNumber } from "./canonical-number";

/**
 * The static-type descriptor the formatter consults to select a value's
 * rendering rule. The formatter is data-driven off this descriptor rather than
 * the value's runtime shape: `integer` vs `number` selects BNDR-4 vs BNDR-5
 * (never runtime integrality); `enum` renders the value's underlying wire
 * string through the string quote predicate; `array` carries one descriptor
 * per element in element order, so a heterogeneous array (e.g. a
 * discriminated-union `anyOf`) describes each element by its own shape
 * instead of reusing one element's shape for all; `object` carries `fields`
 * in the order the sole producer derives from the lowered schema
 * (`defaulting-system-note-echo.md:43`;
 * docs/bugs/0381-echo-object-first-field-model-key-order.md) so the object
 * rule can pick the first field — declaration order for the schema-typed,
 * inline-object, and matching-discriminated-union classes, with the value's
 * own key order as the fallback for the producer's descriptor-less recursion
 * arms.
 */
export type EchoType =
  | { readonly kind: "string" }
  | { readonly kind: "integer" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "enum" }
  | { readonly kind: "array"; readonly elements: readonly EchoType[] }
  | { readonly kind: "object"; readonly fields: readonly EchoField[] };

/** One object field: its theta-side name and its type (see `renderObject`). */
export interface EchoField {
  /** The field's theta-side name; ordering across fields is the declaring schema's source order where the producer has a descriptor, the value's own key order in its descriptor-less recursion arms (see `EchoType`). */
  readonly name: string;
  /** The field's static type, used to render the field value recursively. */
  readonly type: EchoType;
}

/** One top-level `params:` field to echo, in declaration order. */
export interface EchoParam {
  /** The field's theta-side name, shown as `name=` in the echo. */
  readonly name: string;
  /** The bound value (a runtime value from the value model). */
  readonly value: ThetaValue;
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
  /** The theta's `/<name>` (shown after `Running /`). */
  readonly thetaName: string;
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
 * Apply the §"Echo policy" string quote predicate over the
 * §"System-note rendering" rule 1 output (anchor #system-note-rendering), not
 * over the raw `value`: `value` is first passed through
 * {@link sanitizeSystemNoteSubstring}, which collapses each ASCII-whitespace
 * run — the six-character set {U+0009, U+000A, U+000B, U+000C, U+000D,
 * U+0020}, which subsumes `\r`/`\n`/`\r\n` — to one U+0020 and trims that
 * same set from both ends; non-ASCII whitespace (e.g. U+00A0) lies outside
 * the set and survives verbatim. The predicate and the escape pass below
 * therefore never see an interpolated value carrying a line break. Unquoted
 * when the sanitised string is non-empty and matches {@link UNQUOTED_STRING};
 * otherwise quoted as U+0022, the body with each `\` replaced by `\\` and
 * each `"` by `\"` (backslash first so the escapes are not re-doubled), then
 * a closing U+0022. The empty string, and a value that sanitises to empty,
 * render as `""`.
 */
function renderString(value: string): string {
  const sanitized = sanitizeSystemNoteSubstring(value);
  if (sanitized.length > 0 && UNQUOTED_STRING.test(sanitized)) {
    return sanitized;
  }
  const escaped = sanitized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Render an array per the §"Echo policy" array rule: arrays of 3 or fewer
 * elements in full as `[a, b, c]`; arrays of 4 or more as `[a, b, c, …+N more]`
 * where the prefix is the first three elements and `N = total − 3`; an empty
 * array as `[]`. Each element is rendered recursively by its own descriptor.
 */
function renderArray(elements: readonly ThetaValue[], descriptors: readonly EchoType[]): string {
  if (descriptors.length !== elements.length) {
    // The producer derives one descriptor per element from the same value it
    // renders (echoTypeFromValue, src/extension/production-theta-producer.ts);
    // a count mismatch can only originate from a hand-built or otherwise
    // malformed descriptor, the same caller-side class the empty-`fields` arm
    // of `renderObject` below already raises.
    throw new RangeError(
      `renderArray: descriptor count ${descriptors.length} does not match element count ${elements.length} (first uncovered index ${Math.min(descriptors.length, elements.length)})`,
    );
  }
  const rendered = elements.map((el, i) => renderEchoValue(el, descriptors[i]!));
  if (rendered.length <= 3) {
    return `[${rendered.join(", ")}]`;
  }
  const prefix = rendered.slice(0, 3).join(", ");
  return `[${prefix}, …+${rendered.length - 3} more]`;
}

/**
 * Render an object per the §"Echo policy" object rule: `{first-field-value, …}`
 * — just the first field's value, rendered recursively by that field's static
 * type. The first field is `fields[0]`; the sole producer
 * (`echoTypeFromValue`, `src/extension/production-theta-producer.ts`) orders
 * `fields` by the lowered schema's declaration order — the declaring `schema`
 * block's source order, or the matching discriminated-union variant's own
 * source order — per `defaulting-system-note-echo.md:43` and
 * docs/bugs/0381-echo-object-first-field-model-key-order.md §Fix (settling the
 * question 0092 §Non-goals left open). The trailing `, …` is fixed text
 * rendered for every object value, including single-field objects.
 */
function renderObject(
  value: unknown,
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    // A descriptor derived from a value always matches that value at the
    // producer; a non-record value here can only mean the descriptor and the
    // value it renders come from different sources — the same caller-side
    // construction-bug class as the empty-`fields` arm above.
    throw new RangeError(
      `renderObject: expected a non-null, non-array object for field '${first.name}', got ${value === null ? "null" : Array.isArray(value) ? "an array" : typeof value}`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(value, first.name)) {
    throw new RangeError(
      `renderObject: value has no own field '${first.name}'; its own keys are [${Object.keys(value).join(", ")}]`,
    );
  }
  const record = value as { readonly [key: string]: ThetaValue };
  return `{${renderEchoValue(record[first.name] as ThetaValue, first.type)}, …}`;
}

/**
 * Render a single bound value to its echo text, per the §"Echo policy" per-value
 * format rules (string quote predicate; `integer`/`number` via the shared V2d
 * canonical number renderer; `boolean`/`null` literals; enum underlying-wire
 * through the quote predicate; the array and object rules, recursively). The
 * BNDR-6 reference-rendering table (rows 6a–6x) pins the observable byte output.
 */
export function renderEchoValue(value: ThetaValue, type: EchoType): string {
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
      return renderArray(value as readonly ThetaValue[], type.elements);
    case "object":
      return renderObject(value, type.fields);
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
  return `Running /${input.thetaName}: ${fields.join(", ")}`;
}
