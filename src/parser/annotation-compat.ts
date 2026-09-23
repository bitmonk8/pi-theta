// Annotation-source conversion and binding types for the type-layer checks.

import type { CompatType, PrimitiveName } from "./type-compat";
import { PRIMITIVE_NAMES, type ParamsFieldSource } from "./type-layer-checks";
import { annotationSourceIsNotTypeExpression } from "./annotation-validation";
import type { Expr, FnParam } from "./theta-document";

/**
 * Parse a declared type-annotation source into a `CompatType` for the
 * compatibility checks (the `let`-binding RHS narrowing check and `fn`
 * parameter binding types). Handles the primitive names, top-level unions
 * (`A | B`), and `array<T>`; every other shape (a `NamedType`, an inline object
 * type) resolves to a nominal `named` reference — the same shape the `⊑` engine
 * treats as deferred.
 *
 * Bug 0130 §Fix (f): this function's OWN behaviour is unchanged — it never
 * mints `CompatType`'s `object` arm. That is deliberate, not an oversight:
 * every consumer besides the `let`-annotation site reads a declared type in a
 * position another bug's LANDED bound, or the position's own contract,
 * already governs on the inline-object direction, and widening this shared
 * conversion would move all of them at once. The bounds that pin the hold:
 *
 *   - `collectSchemaFields` (→ `theta/parse/object-field-type-mismatch`) and
 *     the member-access field-type reader it feeds are pinned by
 *     `tests/member-access-declared-field-type.test.ts`'s four cells, which
 *     fix the field-type direction as NOT a narrowing source.
 *   - `invoke-static-checks.ts`'s callee `params:` argument check
 *     (→ `theta/parse/tool-arg-type-mismatch`) evaluates this conversion under
 *     a deliberately EMPTY `TypeEnv` by design, so a non-structural expected
 *     type stays deferred; minting `object` here would make it structurally
 *     decidable and start refusing arguments that design withholds.
 *   - `query-schema-resolve.ts`'s `checkLetMismatch` and `compatToInferred`
 *     convert an `@<T>` ascription and a `let` annotation through this same
 *     function and compare the results as an `InferredSchema`, which has no
 *     `object` case to compare against. `checkLetMismatch` is now gated by a
 *     leading `annotationSourceIsNotTypeExpression` check (bug 0222) that
 *     returns before either conversion runs for a refused `let` annotation;
 *     the conversion it still reaches for every annotation the guard lets
 *     through is this same unwidened function, so bug 0130's hold here is
 *     not narrowed.
 *   - the alias-RHS conversion (`collectTypeEnv`, below), the `fn`-param
 *     binding seed (`walkFn`'s parameter loop), the frontmatter `params:`
 *     binding seed (`paramsFieldBindings`), the `subagent fn` return
 *     annotation (`checkSubagentReturnAnnotation`), and the same-file /
 *     imported `fn`-call parameter conversions (`checkFnCallArgs`;
 *     `invoke-static-checks.ts`'s `checkImportedFnCallArgs`) all read a
 *     declared type in a position TYPE-11 or the parameter contract already
 *     governs by name, not by this report's authority.
 *
 * Widening any of these is separate work; `letAnnotationToCompatType`
 * below is the only converter authorised to mint an `object` arm — see its
 * own comment for the sanctioned call sites.
 */
export function annotationToCompatType(src: string): CompatType | undefined {
  return convertAnnotation(src, false);
}

/**
 * The shared per-slot preamble of a user-`fn` call's argument-type loop:
 * yield each matched `(param, paramType, arg)` triple that survives the
 * parameter-annotation guards, for both routes that judge the rule — the
 * parse-time same-file loop (`checkFnCallArgLoop`, type-layer-walk.ts) and
 * the compose-time imported-`.thetalib` loop (`checkImportedFnCallArgs`,
 * ../extension/invoke-imported-checks.ts, bug 0138 route 2). Two guards
 * withhold a slot:
 *
 *   - a parameter annotation that derives from none of `Type`'s six
 *     alternatives (`annotationSourceIsNotTypeExpression`) supports no
 *     verdict — treated as absent rather than as an opaque nominal reading
 *     of the junk text; the caller reads the callee's `FnParam` list off
 *     the declaration verbatim, so the absence invariant is established
 *     here for both routes;
 *   - an unannotated parameter (`type` is the empty string, so
 *     `annotationToCompatType` answers `undefined`) has no declared type to
 *     judge against (type-system.md §"Absent operands") — nor to be an
 *     element sink.
 *
 * The two routes diverge only AFTER this preamble, in how they prove and
 * act on the argument's type.
 */
export function* fnCallJudgedArgSlots(
  params: readonly FnParam[],
  args: readonly Expr[],
): Generator<{
  readonly index: number;
  readonly param: FnParam;
  readonly paramType: CompatType;
  readonly arg: Expr;
}> {
  const matchedCount = Math.min(args.length, params.length);
  for (let i = 0; i < matchedCount; i += 1) {
    const param = params[i] as FnParam;
    if (param.type.length > 0 && annotationSourceIsNotTypeExpression(param.type)) {
      continue;
    }
    const paramType = annotationToCompatType(param.type);
    if (paramType === undefined) {
      continue;
    }
    yield { index: i, param, paramType, arg: args[i] as Expr };
  }
}

/**
 * The `let`-annotation-only sibling of `annotationToCompatType` above (bug
 * 0130 §Fix (a)/(f)): identical except that a well-formed, NON-EMPTY inline
 * object type mints `CompatType`'s documented `object` arm
 * (`type-compat.ts:67–70`) instead of falling through to the deferred nominal
 * `named` reference, recursing through top-level union arms and `array<…>`
 * elements so `{a: integer} | null` and `array<{a: integer}>` both carry a
 * real field set. The sanctioned call sites are `walkStmt`'s `case "let"`
 * annotation resolution (`type-layer-walk.ts`) and the two RFC 0011 (seam
 * sheet §0 C6) runtime-tool success-type mints — `theta-document.ts`'s
 * `buildRuntimeToolSuccessTypes` and `invoke-callee-arity.ts`'s
 * `buildComposePassSuccessTypes`; every other consumer keeps calling
 * `annotationToCompatType` for the reasons stated on its comment above.
 *
 * An EMPTY interior (`{}`) is a DECISION, not an accident: it keeps the
 * deferring pseudo-`named` rather than minting `{kind:"object", fields:[]}`,
 * so `let x: {} = 1` keeps exactly bug 0045's single `empty-schema-body` line
 * and bug 0129's open question — a second line for one written mistake —
 * stays untouched. A MALFORMED interior does not convert either: a field with
 * no `:`, a non-identifier key (`{"a": string}`, `{ a }`, `{ a: }`), a
 * duplicate field name (left for `theta/parse/duplicate-inline-field-name` to
 * report alone), or an interior carrying a `void` atom — `void` is not a
 * `Type` (grammar.md:89 admits it in the `ReturnType` slot only), so `{a:
 * void}` is not a well-formed `ObjectType`, and declining it keeps bug 0093's
 * landed lock (`tests/let-annotation-query-double-emission.test.ts` cell b2)
 * byte-identical. A field TYPE tail deriving from no `Type` alternative
 * declines the whole interior the same way (`recognisedFieldType` below), and
 * the ONE trailing comma `ObjectType` admits (grammar.md:101) is not
 * malformation — it converts (`stripOneTrailingComma` below).
 *
 * `splitTopLevelUnion` (below) tracks `<…>` depth only, so a `|` INSIDE a
 * brace group (`{a: integer|null}`) still shreds at the TOP-level union split
 * before this function is ever reached — a recorded residual inherited from
 * the shared splitter, not a claim that this conversion covers it.
 */
export function letAnnotationToCompatType(src: string): CompatType | undefined {
  return convertAnnotation(src, true);
}

function convertAnnotation(src: string, mintInlineObjects: boolean): CompatType | undefined {
  const text = src.trim();
  if (text.length === 0) {
    return undefined;
  }
  // Top-level union: split on `|` that is not inside `<…>` brackets.
  const unionArms = splitTopLevelUnion(text);
  if (unionArms.length > 1) {
    const arms = unionArms
      .map((arm) => convertAnnotation(arm, mintInlineObjects))
      .filter((t): t is CompatType => t !== undefined);
    return arms.length > 0 ? { kind: "union", arms } : undefined;
  }
  const arrayMatch = /^array<(.+)>$/.exec(text);
  if (arrayMatch !== null) {
    const element = convertAnnotation(arrayMatch[1] ?? "", mintInlineObjects);
    return { kind: "array", element: element ?? { kind: "named", name: "unknown" } };
  }
  if (PRIMITIVE_NAMES.has(text)) {
    return { kind: "prim", name: text as PrimitiveName };
  }
  if (mintInlineObjects) {
    const object = inlineObjectAnnotationToCompatType(text);
    if (object !== undefined) {
      return object;
    }
  }
  return { kind: "named", name: text };
}

/**
 * Mints TYPE-8's `object` arm from a brace-delimited annotation source, or
 * `undefined` when the interior is empty or malformed (bug 0130 §Fix (a) —
 * see `letAnnotationToCompatType`'s comment for the decisions this encodes).
 * `undefined` here falls back to the deferring `named` arm in
 * `convertAnnotation`, never to a bogus field set.
 *
 * BOTH sides of every field are validated, the key by the `Ident` regex below
 * and the type tail by `recognisedFieldType`. Declining on an unrecognised
 * tail is the only sound direction, for two reasons that both bite here.
 * First, TYPE-8's operand is an EXACT field set, so a minted field set must
 * spell exactly what the source spells; a tail no `Type` alternative derives
 * has no `CompatType` that means it, and the deferring nominal is the honest
 * answer. Second, `<expected>` renders this shape through `displayType`
 * (docs/spec_topics/diagnostics/placeholder-rendering-a.md category 1 fixes
 * the byte form), and that column admits real static types only — a tail such
 * as `integer>` or `Result<integer>` would render text that is not one. The
 * annotation capture reaching this function is LENIENT (bug 0124: the capture
 * joins trailing punctuation into the source text), so junk genuinely arrives,
 * and declining leaves it exactly the status-quo silence.
 */
function inlineObjectAnnotationToCompatType(text: string): CompatType | undefined {
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return undefined;
  }
  const interior = stripOneTrailingComma(text.slice(1, -1).trim());
  // Empty (R2's decision) or carrying a `void` atom anywhere, including
  // nested (`void` is not a `Type` — grammar.md:89).
  if (interior.length === 0 || /\bvoid\b/.test(interior)) {
    return undefined;
  }
  const fields: { name: string; type: CompatType }[] = [];
  const seen = new Set<string>();
  for (const part of splitTopLevelObjectFields(interior)) {
    const colon = topLevelColonIndex(part);
    if (colon < 0) {
      return undefined;
    }
    const name = part.slice(0, colon).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || seen.has(name)) {
      return undefined;
    }
    const type = recognisedFieldType(part.slice(colon + 1));
    if (type === undefined) {
      return undefined;
    }
    seen.add(name);
    fields.push({ name, type });
  }
  return fields.length > 0 ? { kind: "object", fields } : undefined;
}

/**
 * `ObjectType ::= "{" Field ("," Field)* ","? "}"` (grammar.md:101) admits ONE
 * optional trailing comma, so `{a: integer,}` is a well-formed spelling of the
 * same type as its comma-less twin and must reach the same disposition — the
 * field splitter would otherwise see a trailing empty part and decline the
 * whole interior, which is the two-dispositions-for-one-type defect bug 0130
 * files. A SECOND trailing comma is not grammar-admitted: only one is removed,
 * so `{a: integer,,}` still leaves an empty part and still declines.
 */
function stripOneTrailingComma(interior: string): string {
  return interior.endsWith(",") ? interior.slice(0, -1).trim() : interior;
}

/**
 * A field type tail, converted ONLY when the text derives from a recognised
 * `Type` shape (grammar.md:90–:95): a primitive name, an identifier-shaped
 * `NamedType`, `array<T>` over a recognised element, a brace-rooted interior
 * that itself converts, or a top-level union whose EVERY arm is recognised.
 * Anything else — a stray `>`, punctuation, a generic application such as
 * `Result<…>` — returns `undefined` and declines the whole interior (see
 * `inlineObjectAnnotationToCompatType` for why declining is the sound
 * direction). Deliberately stricter than `convertAnnotation`, whose catch-all
 * mints a nominal `named` from any non-empty text.
 */
function recognisedFieldType(src: string): CompatType | undefined {
  const text = src.trim();
  if (text.length === 0) {
    return undefined;
  }
  const unionArms = splitTopLevelUnion(text);
  if (unionArms.length > 1) {
    const arms: CompatType[] = [];
    for (const arm of unionArms) {
      const converted = recognisedFieldType(arm);
      if (converted === undefined) {
        return undefined;
      }
      arms.push(converted);
    }
    return { kind: "union", arms };
  }
  const arrayMatch = /^array<(.+)>$/.exec(text);
  if (arrayMatch !== null) {
    const element = recognisedFieldType(arrayMatch[1] ?? "");
    return element === undefined ? undefined : { kind: "array", element };
  }
  if (PRIMITIVE_NAMES.has(text)) {
    return { kind: "prim", name: text as PrimitiveName };
  }
  if (text.startsWith("{")) {
    return inlineObjectAnnotationToCompatType(text);
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? { kind: "named", name: text } : undefined;
}

/**
 * Indices of every top-level `delimiter` in `text`: outside `<…>` nesting
 * depth, and outside `{…}` depth too when `trackBraces` is set. Depth is a
 * bare counter (a stray close token drives it negative and keeps later
 * delimiters non-top-level) — the one nesting scan all three splitters below
 * share, so a change to which tokens count as nesting lands in every split at
 * once. `splitTopLevelUnion` deliberately passes `trackBraces: false`; see its
 * own doc comment and the caller comment above `letAnnotationToCompatType`.
 */
function topLevelDelimiterIndices(
  text: string,
  delimiter: string,
  trackBraces: boolean,
): number[] {
  const indices: number[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "<" || (trackBraces && c === "{")) {
      depth += 1;
    } else if (c === ">" || (trackBraces && c === "}")) {
      depth -= 1;
    } else if (c === delimiter && depth === 0) {
      indices.push(i);
    }
  }
  return indices;
}

/** Split an object type's interior on top-level `,` (outside `<…>` / `{…}` depth). */
function splitTopLevelObjectFields(interior: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const cut of topLevelDelimiterIndices(interior, ",", true)) {
    parts.push(interior.slice(start, cut));
    start = cut + 1;
  }
  parts.push(interior.slice(start));
  return parts.map((p) => p.trim());
}

/** The index of a field's top-level `:` (outside `<…>` / `{…}` depth), or `-1`. */
function topLevelColonIndex(part: string): number {
  return topLevelDelimiterIndices(part, ":", true)[0] ?? -1;
}

/**
 * Build the root `bindings` map `checkTypeLayer`'s top-level walk starts from
 * (bug 0192 §Fix): one entry per frontmatter `params:` field, projecting its
 * declared type source onto a `CompatType` through THIS module's own
 * `annotationToCompatType` — the converter `walkFn` seeds an annotated `fn`
 * parameter's scope entry from
 * (`annotationToCompatType(p.type) ?? { kind: "named", name: p.type }`),
 * mirrored here byte-for-byte in shape so the two positions decide identically
 * BY CONSTRUCTION rather than by coincidence over whichever spellings happen
 * to be measured. `paramsDeclaredCompatType` (./type-compat.ts) is
 * deliberately NOT used here: the two converters differ on the
 * `array<T>`-with-declining-element decline path (a nominal-`unknown` element
 * here, `undefined` there), and where they differ the body position follows
 * the `fn`-parameter position — this converter, not that one. A `params:`
 * field always declares a type (unlike a `fn` parameter, which may be
 * unannotated), so every entry is seeded unconditionally — there is no
 * WITHHELD branch to mirror from `walkFn` here.
 *
 * A plain function, not a `TypeLayerWalk` method, so it has no access to
 * `unprovableBindings`: a seeded entry can never be recorded there by
 * construction, which is what keeps a `params:`-declared read a PROOF at the
 * `provableArgType` sink — an author-written annotation IS a declared type,
 * exactly as an annotated `fn` parameter's is (`unprovableBindings`'s own doc
 * comment states the rule this position inherits).
 *
 * Returns a fresh `Map` per call: `TypeLayerWalk.walkBlock` mutates its root
 * argument directly for each top-level `let`, so a shared or cached map would
 * leak bindings across parses.
 */
function paramsFieldBindings(
  fields: readonly ParamsFieldSource[],
): Map<string, CompatType> {
  const bindings = new Map<string, CompatType>();
  for (const field of fields) {
    bindings.set(
      field.name,
      annotationToCompatType(field.typeSource) ?? { kind: "named", name: field.typeSource },
    );
  }
  return bindings;
}

/**
 * Split a type source on top-level `|` (outside any `<…>` bracket depth).
 * Exported so the runtime schema-subset disjointness computation
 * (`../runtime/tool-call.ts` — RFC 0002) reuses this single copy rather than
 * carrying a duplicate; the two must agree on where a top-level union arm begins.
 */
export function splitTopLevelUnion(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const cut of topLevelDelimiterIndices(text, "|", false)) {
    parts.push(text.slice(start, cut));
    start = cut + 1;
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Whether a declared return-type source names a `Result<…>` type. */
function isResultAnnotation(src: string): boolean {
  return /^Result\b/.test(src.trim());
}

/**
 * Whether a type NAME spells the GENERIC `Result<…>` form. Deliberately
 * narrower than `isResultAnnotation` above, which reads an author's WRITTEN
 * annotation: this predicate reads a name `static-type-inference.ts` minted,
 * and that mint draws on author-controlled identifiers (an enum variant, an
 * object field, a callee, a schema). `<` cannot occur in an identifier, so
 * demanding it makes the acceptance unambiguous by construction, where the bare
 * `Result` that `isResultAnnotation`'s `\b` admits would not be.
 */
function isResultGenericTypeName(name: string): boolean {
  return /^Result</.test(name.trim());
}

/**
 * The static type a LITERAL match-pattern sub-pattern (`R { a: 1 }`'s `1`)
 * types as, for `checkPatternFieldTypes` (bug 0226 §Fix, bug 0234 §Fix) to
 * judge through `checkObjectFieldCompat` — the same relation the constructor
 * position already decides at `checkObjectField` above. A numeric literal is
 * typed by its SOURCE spelling (lexical.md §"Number literals": no fractional
 * or exponent part is `integer`, otherwise `number`), matching the EXPRESSION
 * path's reading of `NumberExpr.numericType`
 * (`static-type-inference.ts`'s `case "literal"`). `PatternNode`'s
 * `numericType` (theta-document.ts) is set only for a `"number"` spelling, so
 * an absent field reads `"integer"` — the same default `parsePattern` applies
 * when it carries the field (theta-document.ts).
 */
function patternLiteralType(
  value: string | number | boolean | null,
  numericType?: "integer" | "number",
): CompatType {
  if (typeof value === "string") {
    return { kind: "literal", typesAs: "string" };
  }
  if (typeof value === "boolean") {
    return { kind: "literal", typesAs: "boolean" };
  }
  if (value === null) {
    return { kind: "literal", typesAs: "null" };
  }
  return { kind: "literal", typesAs: numericType ?? (Number.isInteger(value) ? "integer" : "number") };
}

export { paramsFieldBindings, isResultAnnotation, isResultGenericTypeName, patternLiteralType };
