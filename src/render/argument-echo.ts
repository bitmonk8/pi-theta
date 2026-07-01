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
 * A sentinel returned by the inert V11h-T stubs. It equals no expected
 * rendering (in particular it is not the empty string `""`, so the BNDR-6a
 * `""` row still reds), so every assertion reds on its own primary comparison
 * while the V11h body is absent.
 */
const UNIMPLEMENTED = "\u0000loom/render/argument-echo:unimplemented";

/**
 * Render a single bound value to its echo text, per the §"Echo policy" per-value
 * format rules (string quote predicate; `integer`/`number` via the shared V2d
 * canonical number renderer; `boolean`/`null` literals; enum underlying-wire
 * through the quote predicate; the array and object rules, recursively). The
 * BNDR-6 reference-rendering table (rows 6a–6x) pins the observable byte output.
 *
 * V11h-T stubs this inertly (returns the {@link UNIMPLEMENTED} sentinel); the
 * paired V11h implementation leaf fills in the data-driven format rules.
 */
export function renderEchoValue(value: LoomValue, type: EchoType): string {
  void value;
  void type;
  return UNIMPLEMENTED;
}

/**
 * Render the whole one-line argument echo `Running /<name>: <formatted-args>`:
 * each top-level `params:` field as `name=<rendered-value>`, comma-space
 * separated in declaration order, with `(default)` appended after the value of
 * a field that took its declared default (default-supplied only — a
 * binder-supplied value for a defaulted field is untagged).
 *
 * V11h-T stubs this inertly (returns the {@link UNIMPLEMENTED} sentinel); the
 * paired V11h implementation leaf fills in the line composition.
 */
export function renderArgumentEcho(input: ArgumentEchoInput): string {
  void input;
  return UNIMPLEMENTED;
}
