// QRY-18 `@`-query interpolation rendering & outbound wire-name translation:
// the interpolation route (`renderQueryText` → `stringifyInterpolation`) that
// lowers each `${…}` interpolation's runtime value to wire text, and the
// recursive outbound theta→wire field-name lowering
// (`translateInterpolationOutbound`) — the outbound half of the wire-name
// translation pass whose inbound half is `decodeInboundValue` in
// inbound-boundary.ts (runtime-value-model.md §Wire-name translation). A pure
// value→text lowering: no producer state, only arguments. Re-homed from
// extension/query-text-render.ts (PTQ-1289) to sit with its runtime/render
// substrate.

import { evaluatePureExpression, raiseInterpolatedResult } from "./pure-expression-evaluator";
import type { LexicalEnvironment } from "./lexical-environment";
import type { InvokeChain } from "./invoke-depth-cycle";
import {
  defineRecordField,
  isEnumValue,
  isResultValue,
  schemaTagOf,
  type ThetaValue,
} from "./value";
import type { QueryExpr } from "../parser/theta-document";
import { parseExpressionSource } from "../parser/theta-document";
import { isThetaPanic, retargetInterpolationPanic } from "./runtime-panics";
import {
  interpolationTypeOf,
  lexQueryTemplate,
  renderTemplateText,
  stringifyInterpolatedValue,
} from "../render/query-render";

/**
 * Render one `@`-query template to its wire text against the lexical
 * environment: lex the template into literal / `${…}` interpolation parts,
 * evaluate each interpolation as a full expression (expressions.md
 * §"Supported forms" — not a dotted-path subset), stringify the resulting
 * runtime value by the QRY-18 rule, and apply the QRY-7 newline-trim → dedent
 * normalisation. An interpolation whose source does not parse, or that has no
 * pure runtime value (an effectful `fn` body / tool-call), yields the inert
 * `null` render — this render's own fallback, not a rule expressions.md states
 * (bug 0116) — rather than a throw; a `Result`-valued interpolation the static
 * type-layer gate could not prove instead aborts the theta with QRY-18's
 * runtime-fallback panic (see `stringifyInterpolation`).
 */
export function renderQueryText(expr: QueryExpr, env: LexicalEnvironment, chain?: InvokeChain): string {
  const lexed = lexQueryTemplate(expr.template);
  let text = "";
  for (const part of lexed.parts) {
    if (part.kind === "text") {
      text += part.value;
      continue;
    }
    // Bug 0476 follow-up: `stringifyInterpolation` re-parses `part.exprSource`
    // standalone (`parseExpressionSource`), so any panic it raises carries an
    // interpolation-LOCAL coordinate (line 1, column within the `${…}` body),
    // not a file coordinate. This is the one boundary that knows both that
    // local coordinate and the enclosing query's own real range (`expr.range`)
    // — retarget here, then re-throw.
    try {
      text += stringifyInterpolation(part.exprSource, env, chain);
    } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 follow-up)
      if (isThetaPanic(thrown)) {
        retargetInterpolationPanic(thrown, {
          source: part.exprSource,
          file: env.currentResidence(),
          range: expr.range,
        });
      }
      throw thrown;
    }
  }
  return renderTemplateText(text);
}

/**
 * Evaluate one `${…}` interpolation source and stringify its runtime value by
 * the QRY-18 rule. The source is parsed into the same `Expr` a `let` RHS parses
 * to and evaluated by the shared pure evaluator, so arithmetic, indexing, calls,
 * method calls, ternaries, and `Enum.Variant` access all render their value
 * (EXPR-1/6/7/8, QRY-2/3/4). The `InterpolationType` discriminator is derived
 * from the resulting runtime `ThetaValue` — numbers route through the canonical
 * decimal renderer (so `Infinity`/`NaN` render as `Infinity`/`NaN`, not
 * `null`), an enum renders its bare unquoted wire value, and arrays/objects
 * render as compact JSON. A `Result` value reaching this render is one the
 * static type-layer gate (`src/parser/type-layer-checks.ts`) left unproven: it
 * refuses the load only where the expression's `Result`-ness is certain from its
 * provenance, and defers every other shape — a binding laundered through an
 * unannotated `fn`, a `Result` reached through an operand the inference layer
 * narrows, a `Result` held inside a container. Those shapes arrive here, so this
 * render raises `INTERPOLATED_RESULT_CODE` as a panic (QRY-18's runtime
 * fallback) instead of serialising the interpreter-private carrier (bug 0079).
 */
function stringifyInterpolation(source: string, env: LexicalEnvironment, chain?: InvokeChain): string {
  const parsed = parseExpressionSource(source);
  if (parsed === null) {
    // An unparseable interpolation has no value; render the inert `null` rather
    // than throwing out of the render path — this render's own fallback, not a
    // rule expressions.md states (bug 0116).
    return "null";
  }
  const value = evaluatePureExpression(parsed, env, chain);
  const type = interpolationTypeOf(value);
  const reach: NestedResultReach = { found: false };
  if (type.kind === "object" || type.kind === "array") {
    // QRY-18: a Schema-typed object / `array<T>` interpolation renders as compact
    // `JSON.stringify` with wire-name translation applied recursively. The
    // outbound pass rewrites every renamed field to its wire name at every
    // nesting level, driven by each object value's declaring-schema brand (with
    // the declared field type as a fallback for un-branded nested values); theta
    // code never sees a wire name, and the model never sees a theta-side name.
    const lowered = translateInterpolationOutbound(value, env, reach);
    if (!reach.found) {
      return JSON.stringify(lowered);
    }
    // The lowering reached a branded `Result` somewhere inside the container.
    // Containment does not change QRY-18's disposition (bug 0114): the lowered
    // tree is discarded unrendered, and the value falls to the `Result` arm
    // below — the same arm the top-level case already uses.
  }
  const rendered = stringifyInterpolatedValue(value, reach.found ? { kind: "result" } : type);
  if (!rendered.ok) {
    // QRY-18's runtime fallback (bug 0079, reached at the nested position too
    // per bug 0114): a `Result` reaching this render — top-level or nested
    // inside a container, at any depth — is one the static gate left unproven,
    // so it aborts the theta with the same registered code rather than
    // rendering the carrier. The sole runtime raise, for both positions.
    raiseInterpolatedResult(rendered.diagnostic.message);
  }
  return rendered.text;
}


/**
 * Whether the outbound lowering (`translateInterpolationOutbound`) reached a
 * branded `Result` anywhere inside the interpolated value. Threaded down the
 * walk as an explicit parameter — no global, no module state — so the reach is
 * exact at whatever depth the lowering itself visits, which is what "no
 * carrier keys at any depth" (bug 0114) requires.
 *
 * No depth cap: this rides the walk `translateInterpolationOutbound` already
 * performs for QRY-18's wire-name translation rather than adding a second
 * traversal, so there is no new depth walk for CIO-3's `MAX_JSON_DEPTH`
 * discipline to bound. A cap here would admit past it the very `Result` this
 * reach exists to catch — the shape of defect bug 0187 documents at a
 * different boundary — trading one leak for another instead of closing this
 * one.
 */
interface NestedResultReach {
  found: boolean;
}

/**
 * Recursively lower an object/array interpolation value to its wire-named JSON
 * form (QRY-18 outbound wire-name translation, runtime-value-model.md §Wire-name
 * translation). Each object-schema value renames its fields theta→wire using the
 * schema resolved from the value's declaring-schema brand (attached at
 * construction) — falling back to the declared field type `typeHint` for a value
 * that carries no brand (e.g. a bare object literal in a schema-typed field).
 * Enum values collapse to their bare wire string; arrays recurse element-wise;
 * primitives pass through. A value whose schema cannot be resolved recurses with
 * its keys unchanged (the safe no-rename default).
 *
 * A branded `Result` reached at any depth records `reach.found` and returns
 * immediately, ahead of schema resolution: `schemaTagOf` never resolves one
 * (it carries `RESULT_TAG`, not `SCHEMA_TAG`), so falling through to the
 * no-rename default would copy its carrier keys straight through unchanged
 * (bug 0114). Classification is `isResultValue` — the non-enumerable brand —
 * never the `{ ok, … }` shape, so an ordinary object whose own declared fields
 * spell `ok` still falls through to that path unchanged (bug 0017).
 */
function translateInterpolationOutbound(
  value: ThetaValue,
  env: LexicalEnvironment,
  reach: NestedResultReach,
  typeHint?: string,
): unknown {
  if (isEnumValue(value)) {
    // The enum brand is dropped; the model only ever sees the bare wire string.
    return String(value);
  }
  if (Array.isArray(value)) {
    const elementHint = typeHint !== undefined ? arrayElementTypeSource(typeHint) : undefined;
    return value.map((element) => translateInterpolationOutbound(element, env, reach, elementHint));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isResultValue(value)) {
    reach.found = true;
    return value;
  }

  // Resolve the declaring schema: the construction-time brand is authoritative;
  // an un-branded value falls back to the declared field type when that names a
  // resolvable schema (a bare object literal resolves to neither and recurses
  // with its keys unchanged).
  const hintName = typeHint !== undefined ? identifierTypeSource(typeHint) : undefined;
  const brand = schemaTagOf(value);
  const schemaName =
    brand ?? (hintName !== undefined && env.resolveSchema(hintName) !== undefined ? hintName : undefined);
  const decl = schemaName !== undefined ? env.resolveSchema(schemaName) : undefined;
  const fields = new Map<string, { readonly wire: string; readonly type: string }>();
  if (decl?.fields !== undefined) {
    for (const field of decl.fields) {
      fields.set(field.name, { wire: field.wireName ?? field.name, type: field.typeSource });
    }
  }

  // The wire key is as author-controlled as the theta-side name: a rename is
  // constrained to a non-empty string literal and nothing more (schemas.md:43),
  // so the inherited-accessor hazard reaches this write too. Defining the key
  // keeps the QRY-18 render `JSON.stringify` of the value with wire-name
  // translation applied (query-escapes-stringification.md:27) for every
  // admitted wire name, the prototype-accessor spelling included.
  const result: Record<string, unknown> = {};
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const field = fields.get(thetaKey);
    const wireKey = field?.wire ?? thetaKey;
    defineRecordField(result, wireKey, translateInterpolationOutbound(fieldValue, env, reach, field?.type));
  }
  return result;
}

/** The leading identifier of a type-expression source (`Inner`), else `undefined`. */
function identifierTypeSource(source: string): string | undefined {
  const s = source.trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : undefined;
}

/** The element type source of an `array<T>` type-expression source, else `undefined`. */
function arrayElementTypeSource(source: string): string | undefined {
  const m = /^array<(.+)>$/.exec(source.trim());
  return m !== null ? (m[1] as string).trim() : undefined;
}
