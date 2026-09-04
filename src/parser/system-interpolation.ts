// V6d / V6d-T — the `system:` template-interpolation seam.
//
// This module owns the `system:` frontmatter field's interpolation surface of
// frontmatter/frontmatter-fields-b-and-templates.md §`system` Interpolation:
//
//   - the **subagent-mode-only** rule — `system:` on a `mode: prompt` theta is
//     `theta/parse/system-on-prompt-mode` (the prompt-mode session's system
//     prompt belongs to Pi, not the theta);
//   - the restricted `${…}` grammar — only a bare identifier `Path`
//     (`Ident ('.' Ident)*`) is accepted; any other body fires one of the four
//     `theta/parse/system-interp-*` diagnostics:
//       * `system-interp-not-path`      — body is not a `Path`
//         (`${arr[0]}`, `${a + b}`, `${f(x)}`, `${a?.b}`, `${"x"}`);
//       * `system-interp-unknown-param` — head `Ident` names no declared param;
//       * `system-interp-bad-field`     — a `.Ident` step names no reachable
//         theta-side object field (or descends into an array / un-narrowed
//         discriminated union);
//       * `system-interp-unterminated`  — `${` is not closed by a matching `}`;
//   - the `\${` escape — a literal `${` suppresses interpolation;
//   - the resolve-then-stringify path — a validated path resolves against the
//     `params` object and its value is rendered by the **shared** canonical
//     stringification renderer of query/query-escapes-stringification.md
//     (QRY-18), the same table `@`...`` query templates use, so the model sees
//     one rendering of a given value regardless of surface. The `Result<T, E>`
//     row of that table cannot arise here: `params:` types never include
//     `Result`, so the `system:` surface never produces a `result`-typed slot.
//
// V6d-T (tests-task) declares these seam shapes — `SystemParamType`, the parsed
// `SystemTemplate`, the parse-time `checkSystemInterpolation` and the
// resolve-time `renderSystemPrompt` entry points, and the diagnostic code +
// message anchors — and stubs the two behaviour-bearing functions inertly so
// the failing tests compile and red on their own primary assertions (no
// diagnostic fires, no template is produced, and rendering yields empty text).
// The paired V6d implementation leaf fills these in.
//
// Spec: frontmatter/frontmatter-fields-b-and-templates.md,
// query/query-escapes-stringification.md.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";
import { type ThetaMode } from "./frontmatter";
import { isEnumValue, isResultValue, schemaTagOf, type ThetaValue } from "../runtime/value";
import {
  stringifyInterpolatedValue,
  type InterpolationType,
} from "../render/query-render";

// --- Diagnostic codes + registry-anchored message strings ------------------
//
// Message strings are sourced verbatim from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.

/** `theta/parse/system-on-prompt-mode` (E). */
export const SYSTEM_ON_PROMPT_MODE_CODE = "theta/parse/system-on-prompt-mode";
/** `theta/parse/system-interp-not-path` (E). */
export const SYSTEM_INTERP_NOT_PATH_CODE = "theta/parse/system-interp-not-path";
/** `theta/parse/system-interp-unknown-param` (E). */
export const SYSTEM_INTERP_UNKNOWN_PARAM_CODE =
  "theta/parse/system-interp-unknown-param";
/** `theta/parse/system-interp-bad-field` (E). */
export const SYSTEM_INTERP_BAD_FIELD_CODE = "theta/parse/system-interp-bad-field";
/** `theta/parse/system-interp-unterminated` (E). */
export const SYSTEM_INTERP_UNTERMINATED_CODE =
  "theta/parse/system-interp-unterminated";

/** Registry Message for `theta/parse/system-on-prompt-mode`. */
export const SYSTEM_ON_PROMPT_MODE_MESSAGE =
  "'system:' is not permitted on a mode: prompt theta";
/** Registry Message for `theta/parse/system-interp-not-path`. */
export const SYSTEM_INTERP_NOT_PATH_MESSAGE =
  "'system:' interpolation body must be a bare identifier path";
/** Registry Message for `theta/parse/system-interp-unknown-param`. */
export function systemInterpUnknownParamMessage(name: string): string {
  return `'system:' interpolation references unknown param '${name}'`;
}
/** Registry Message for `theta/parse/system-interp-bad-field`. */
export function systemInterpBadFieldMessage(field: string, path: string): string {
  return `'system:' interpolation '.${field}' does not name a reachable object field on ${path}`;
}
/** Registry Message for `theta/parse/system-interp-unterminated`. */
export const SYSTEM_INTERP_UNTERMINATED_MESSAGE =
  "'system:' interpolation '${' is not closed by a matching '}'";

// --- The `system:` param-type model ----------------------------------------

/**
 * The static type of a declared `params` entry, as the `system:` interpolation
 * surface sees it for path resolution and stringification. Note the union
 * carries **no `Result` arm**: `params:` types never include `Result`, so the
 * `Result<T, E>` row of the canonical stringification table can never arise
 * from this surface.
 *
 *   - the scalar arms (`string` / `integer` / `number` / `boolean` / `null` /
 *     `enum`) and `array` terminate a path — `${param}` is always allowed and
 *     rendered by the canonical table;
 *   - `object` carries its reachable fields, so a `.Ident` step is validated
 *     against `fields`;
 *   - `discriminated-union` terminates a path: a `.Ident` step into an arm
 *     without a discriminator narrowing is rejected (theta 1.0 has no narrowing
 *     in this slot);
 *   - `array` / `object` optionally carry the wire-name-translation sidecars so
 *     the compact `JSON.stringify` rendering applies outbound translation.
 *   - `opaque-object` is an imported-`.thetalib` schema whose fields are
 *     invisible at frontmatter-parse (the sync parser carries no `FileSystem`
 *     to resolve the import): it ADMITS any `.Ident` chain — refusing nothing
 *     at parse, the documented imported-field residual (bug 0406 parent
 *     Rec A) — and renders value-driven at resolve time: a walked scalar
 *     renders through its scalar row, an object value through the object/JSON
 *     row with no sidecars (imported wire renames are unavailable at parse).
 */
export type SystemParamType =
  | { readonly kind: "string" }
  | { readonly kind: "integer" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "null" }
  | { readonly kind: "enum" }
  | {
      readonly kind: "array";
      readonly sidecars?: Extract<InterpolationType, { kind: "array" }>["sidecars"];
      readonly rootDef?: string;
    }
  | {
      readonly kind: "object";
      readonly fields: ReadonlyMap<string, SystemParamType>;
      readonly sidecars?: Extract<InterpolationType, { kind: "object" }>["sidecars"];
      readonly rootDef?: string;
    }
  | { readonly kind: "discriminated-union"; readonly arms?: readonly SystemUnionArm[] }
  | { readonly kind: "opaque-object" };

/**
 * One arm of a `discriminated-union` `system:` param's static type (bug 0425
 * §Fix route (a)): the object schema it names, plus enough to pick it at
 * render time by the resolved value's own runtime shape when the static type
 * alone (a bare `discriminated-union`) cannot. `literals` is the arm's
 * literal-discriminator table (theta field name → the one wire-free literal
 * value that field must hold in this arm, schemas.md §Discriminated unions) —
 * empty when the arm carries no literal-discriminator field.
 */
export interface SystemUnionArm {
  readonly name: string;
  readonly sidecars: Extract<InterpolationType, { kind: "object" }>["sidecars"];
  readonly rootDef: string;
  readonly fieldNames: readonly string[];
  readonly literals: ReadonlyMap<string, string>;
}

// --- Parsed template shape --------------------------------------------------

/**
 * One part of a parsed `system:` template: a literal text run (with `\${`
 * escapes already resolved to a literal `${`), or a validated interpolation
 * path carrying the resolved `params` path segments and the canonical-table
 * `InterpolationType` its terminal static type maps to.
 */
export type SystemTemplatePart =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "path";
      readonly segments: readonly string[];
      readonly type: InterpolationType;
      /**
       * When set, the render selects the canonical row from the RESOLVED
       * value's runtime kind (mirroring the query surface's value-driven
       * `interpolationTypeOf`) rather than from `type` — used for the
       * `opaque-object` and `discriminated-union` terminals, whose static
       * type alone cannot tell a scalar-union arm from an object-schema arm,
       * or an imported object field from a walked-off one. `type` remains
       * the object-row fallback used when this flag is absent.
       */
      readonly valueDriven?: true;
      /**
       * The union's arm sidecars, present iff the terminal's static
       * `discriminated-union` type carried arms (bug 0425 §Fix route (a)):
       * `renderSystemPrompt` uses these to pick the resolved value's arm
       * (by schema brand, else by field-set / literal-discriminator match)
       * and translate through that arm's sidecars rather than rendering the
       * bare value-driven object row untranslated.
       */
      readonly unionArms?: readonly SystemUnionArm[];
    };

/** A successfully-parsed `system:` template: its ordered parts. */
export interface SystemTemplate {
  readonly parts: readonly SystemTemplatePart[];
}

// --- Parse-time check -------------------------------------------------------

/** Inputs to the parse-time `system:` interpolation check. */
export interface CheckSystemInterpolationInput {
  /** The raw `system:` scalar value (block-scalar contents, YAML-unescaped). */
  readonly systemValue: string;
  /** The theta's `mode:` — `system:` on `prompt` is rejected. */
  readonly mode: ThetaMode;
  /** The declared `params`, keyed by theta-side field name. */
  readonly params: ReadonlyMap<string, SystemParamType>;
  /** The source file, for located diagnostics. */
  readonly file: string;
  /** The `system:` value's located range, when known. */
  readonly range?: SourceRange;
}

/** The outcome of the parse-time check. */
export interface CheckSystemInterpolationResult {
  /** Every diagnostic raised, in source order. */
  readonly diagnostics: readonly Diagnostic[];
  /** The parsed template, present iff no error-severity diagnostic was raised. */
  readonly template?: SystemTemplate;
}

/**
 * Validate a `system:` field at frontmatter-parse time
 * (frontmatter/frontmatter-fields-b-and-templates.md §`system` Interpolation):
 *
 *   - `theta/parse/system-on-prompt-mode` when the theta is `mode: prompt`;
 *   - each `${…}` body restricted to the `Path` production —
 *     `theta/parse/system-interp-not-path` for any other body,
 *     `theta/parse/system-interp-unknown-param` for an undeclared head `Ident`,
 *     `theta/parse/system-interp-bad-field` for a `.Ident` step that names no
 *     reachable object field, and `theta/parse/system-interp-unterminated` for
 *     an unclosed `${`;
 *   - `\${` resolved to a literal `${` text run (interpolation suppressed).
 *
 * Returns the parsed template iff no error-severity diagnostic was raised.
 *
 * V6d-T stubs this as an inert pass (no diagnostics, no template); the paired
 * V6d implementation leaf parses the template, applies the four parse checks,
 * the prompt-mode rejection, and the `\${` escape, and maps each validated
 * path's terminal static type to its `InterpolationType`.
 */
export function checkSystemInterpolation(
  input: CheckSystemInterpolationInput,
): CheckSystemInterpolationResult {
  const { systemValue, mode, params, file } = input;

  // Subagent-mode-only: `system:` on a `mode: prompt` theta belongs to Pi, not
  // the theta, and is rejected outright — no template is produced.
  if (mode === "prompt") {
    return {
      diagnostics: [
        located(SYSTEM_ON_PROMPT_MODE_CODE, SYSTEM_ON_PROMPT_MODE_MESSAGE, file, input.range),
      ],
    };
  }

  const parts: SystemTemplatePart[] = [];
  const diagnostics: Diagnostic[] = [];
  let text = "";

  const flushText = (): void => {
    if (text.length > 0) {
      parts.push({ kind: "text", value: text });
      text = "";
    }
  };

  let i = 0;
  while (i < systemValue.length) {
    const c = systemValue[i];

    // `\${` escape — a literal `${` suppresses interpolation. Only this exact
    // sequence is special; in any other position `\` is passed through verbatim.
    if (c === "\\" && systemValue[i + 1] === "$" && systemValue[i + 2] === "{") {
      text += "${";
      i += 3;
      continue;
    }

    if (c === "$" && systemValue[i + 1] === "{") {
      // Scan to the matching `}` (tracking `{`/`}` nesting so a brace inside the
      // body does not close the interpolation early); EOF first ⇒ unterminated.
      flushText();
      let depth = 1;
      let j = i + 2;
      let body = "";
      while (j < systemValue.length) {
        const cj = systemValue[j];
        if (cj === "{") {
          depth += 1;
        } else if (cj === "}") {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        body += cj;
        j += 1;
      }
      if (depth !== 0) {
        diagnostics.push(
          located(SYSTEM_INTERP_UNTERMINATED_CODE, SYSTEM_INTERP_UNTERMINATED_MESSAGE, file, input.range),
        );
        // Unterminated body: stop scanning; no further parts.
        i = systemValue.length;
        break;
      }
      const pathPart = parseInterpolationPath(body, params, file, input.range, diagnostics);
      if (pathPart !== undefined) {
        parts.push(pathPart);
      }
      i = j + 1;
      continue;
    }

    text += c;
    i += 1;
  }
  flushText();

  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) {
    return { diagnostics };
  }
  return { diagnostics, template: { parts } };
}

// --- Path-body parsing + resolution ----------------------------------------

/** A lexical identifier start character (lexical.md — Identifiers). */
function isIdentStart(c: string): boolean {
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_";
}

/** A lexical identifier continuation character (lexical.md — Identifiers). */
function isIdentPart(c: string): boolean {
  return isIdentStart(c) || (c >= "0" && c <= "9");
}

/**
 * Split a trimmed `${…}` body into `Ident ('.' Ident)*` segments, or return
 * `undefined` when the body is not a bare identifier `Path` (indexed access,
 * call syntax, optional chaining, arithmetic, string literals, empty body, …).
 * The restriction is applied to the tokenised body, not a `${param}` regex, so
 * the deferred richer-expression extension widens the filter here.
 */
function splitPathSegments(body: string): readonly string[] | undefined {
  const segments: string[] = [];
  let k = 0;
  for (;;) {
    const first = body[k];
    if (first === undefined || !isIdentStart(first)) {
      return undefined;
    }
    let seg = "";
    for (let ch = body[k]; ch !== undefined && isIdentPart(ch); ch = body[k]) {
      seg += ch;
      k += 1;
    }
    segments.push(seg);
    if (k === body.length) {
      return segments;
    }
    if (body[k] !== ".") {
      return undefined;
    }
    k += 1; // consume the `.`
  }
}

/**
 * Parse one interpolation body into a validated path part, pushing the relevant
 * `theta/parse/system-interp-*` diagnostic and returning `undefined` on any
 * violation: not-path, unknown head param, or a `.Ident` step that names no
 * reachable object field (or descends into an array / un-narrowed union).
 */
function parseInterpolationPath(
  rawBody: string,
  params: ReadonlyMap<string, SystemParamType>,
  file: string,
  range: SourceRange | undefined,
  diagnostics: Diagnostic[],
): Extract<SystemTemplatePart, { kind: "path" }> | undefined {
  const body = rawBody.trim();
  const segments = splitPathSegments(body);
  if (segments === undefined) {
    diagnostics.push(located(SYSTEM_INTERP_NOT_PATH_CODE, SYSTEM_INTERP_NOT_PATH_MESSAGE, file, range));
    return undefined;
  }

  const head = segments[0] as string;
  let current = params.get(head);
  if (current === undefined) {
    diagnostics.push(
      located(SYSTEM_INTERP_UNKNOWN_PARAM_CODE, systemInterpUnknownParamMessage(head), file, range),
    );
    return undefined;
  }

  // Each subsequent `.Ident` must name a reachable field of an *object* schema;
  // arrays, discriminated unions, and scalars terminate the path.
  for (let s = 1; s < segments.length; s++) {
    const field = segments[s] as string;
    if (current.kind === "object") {
      const next = current.fields.get(field);
      if (next === undefined) {
        diagnostics.push(
          located(
            SYSTEM_INTERP_BAD_FIELD_CODE,
            systemInterpBadFieldMessage(field, segments.slice(0, s).join(".")),
            file,
            range,
          ),
        );
        return undefined;
      }
      current = next;
    } else if (current.kind === "opaque-object") {
      // An imported schema's fields are invisible at parse (bug 0406 parent
      // Rec A) — the step is admitted opaquely, refusing nothing; `current`
      // stays `opaque-object` so a chain of steps all admit.
      continue;
    } else {
      // A non-object type terminates the path: a `.Ident` step into an array,
      // discriminated union, or scalar is a bad-field error.
      diagnostics.push(
        located(
          SYSTEM_INTERP_BAD_FIELD_CODE,
          systemInterpBadFieldMessage(field, segments.slice(0, s).join(".")),
          file,
          range,
        ),
      );
      return undefined;
    }
  }

  // A `discriminated-union` terminal carrying arms (bug 0425 §Fix route (a))
  // threads them through so the value-driven render can pick and translate
  // through the resolved value's arm; an arm-less union (scalar arms, or an
  // arm the static type could not resolve) falls through to the pre-existing
  // untranslated value-driven row below, unchanged.
  if (current.kind === "discriminated-union" && current.arms !== undefined) {
    return {
      kind: "path",
      segments,
      type: { kind: "object" },
      valueDriven: true,
      unionArms: current.arms,
    };
  }
  if (current.kind === "opaque-object" || current.kind === "discriminated-union") {
    return { kind: "path", segments, type: { kind: "object" }, valueDriven: true };
  }
  return { kind: "path", segments, type: toInterpolationType(current) };
}

/**
 * Map a terminal `SystemParamType` to the canonical-table `InterpolationType`
 * the shared renderer consumes. There is no `Result` arm — `params:` types
 * never include `Result` — so the `Result<T, E>` row can never arise here. A
 * discriminated union renders as a compact-JSON object (it is an object value
 * at runtime); the `system:` grammar rejects descending *into* one.
 */
function toInterpolationType(type: SystemParamType): InterpolationType {
  switch (type.kind) {
    case "string":
      return { kind: "string" };
    case "integer":
      return { kind: "integer" };
    case "number":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "null":
      return { kind: "null" };
    case "enum":
      return { kind: "enum" };
    case "array":
      return {
        kind: "array",
        ...(type.sidecars !== undefined ? { sidecars: type.sidecars } : {}),
        ...(type.rootDef !== undefined ? { rootDef: type.rootDef } : {}),
      };
    case "object":
      return {
        kind: "object",
        ...(type.sidecars !== undefined ? { sidecars: type.sidecars } : {}),
        ...(type.rootDef !== undefined ? { rootDef: type.rootDef } : {}),
      };
    case "discriminated-union":
      return { kind: "object" };
    case "opaque-object":
      // Fallback only — an `opaque-object` terminal is always paired with
      // `valueDriven: true` (parseInterpolationPath's terminal `return`), so
      // `renderSystemPrompt` overrides this with the resolved value's own
      // runtime kind before it reaches `stringifyInterpolatedValue`.
      return { kind: "object" };
  }
}

/** Build an error-severity diagnostic, carrying `file` (and `range` when known). */
function located(
  code: string,
  message: string,
  file: string,
  range: SourceRange | undefined,
): Diagnostic {
  return {
    severity: "error",
    code,
    message,
    file,
    ...(range !== undefined ? { range } : {}),
  };
}

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
 *
 * V6d-T stubs this as an inert pass returning empty text; the paired V6d
 * implementation leaf resolves the path segments and feeds each resolved value
 * into `stringifyInterpolatedValue`.
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
    const effectiveType =
      part.valueDriven && part.unionArms !== undefined
        ? (unionArmObjectType(value, part.unionArms) ?? interpolationTypeOfValue(value))
        : part.valueDriven
          ? interpolationTypeOfValue(value)
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
 * The canonical-table row a RESOLVED value selects by its own runtime kind
 * (mirrors `production-theta-producer.ts`'s `interpolationTypeOf` exactly):
 * used for the `opaque-object` and `discriminated-union` terminals, whose
 * static type alone cannot distinguish a scalar-union arm from an
 * object-schema arm, or an imported-schema field from a walked-off one. A
 * walked-off imported field resolves to JS `undefined`, which falls through
 * to the `object` row — `JSON.stringify(undefined)` yields the literal text
 * `undefined`. That is the documented residual bug 0406 W7 pins, not a case
 * to special-case away here.
 */
function interpolationTypeOfValue(value: ThetaValue): InterpolationType {
  if (typeof value === "string") {
    return { kind: "string" };
  }
  if (typeof value === "number") {
    return { kind: "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (isEnumValue(value)) {
    return { kind: "enum" };
  }
  if (Array.isArray(value)) {
    return { kind: "array" };
  }
  if (isResultValue(value)) {
    return { kind: "result" };
  }
  return { kind: "object" };
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
