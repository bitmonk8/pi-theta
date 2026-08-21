// V5a / V5a-T — the schema-declaration checker seam.
//
// This module owns the parse-time well-formedness checks for the three schema
// declaration shapes of schemas.md and type-system.md:
//
//   - Object schema   — `schema X { f: T, ... }` (incl. `as "WireName"` renames):
//       * `theta/parse/empty-schema-body`   — `schema X { }` with no fields.
//       * `theta/parse/wire-name-collision` — two fields share a wire name, or a
//         wire name collides with another field's theta-side name.
//       * `theta/parse/redundant-wire-name` (W) — a rename whose wire name equals
//         the theta-side name (`field as "field"`).
//   - Enum declaration — `enum X { Low, High = "h", ... }`:
//       * `theta/parse/empty-enum-body`               — `enum X { }` with no variants.
//       * `theta/parse/duplicate-enum-variant-name`   — two variants share an
//         identifier (regardless of explicit value); this check runs BEFORE the
//         value-duplication check (schemas.md §Enum declarations).
//       * `theta/parse/duplicate-enum-value`          — two distinct-named variants
//         share one explicit string value.
//       * `theta/parse/non-string-enum-value`         — an explicit value that is
//         not a single string literal.
//       * `theta/parse/inline-enum`                   — an inline `enum[...]` form
//         (top-level `enum` only).
//   - Variant access  — `Enum.Variant`:
//       * `theta/parse/unknown-variant`               — a reference to a variant the
//         enum does not declare.
//
// V5a-T (tests-task) declared these seam shapes; V5a (this leaf) implements
// every check.

import { type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

/** A located site at which a schema/enum declaration or access is checked. */
export interface SchemaDeclSite {
  readonly file: string;
  readonly range: SourceRange;
}

/**
 * A single object-schema field declaration. `wireName` is the explicit
 * `as "WireName"` rename when present; absent means the wire name equals the
 * theta-side identifier (`thetaName`).
 */
export interface SchemaFieldDecl {
  readonly thetaName: string;
  readonly wireName?: string;
}

/** An object-schema declaration (`schema X { ... }`). */
export interface ObjectSchemaDecl {
  readonly name: string;
  readonly fields: readonly SchemaFieldDecl[];
}

/**
 * The `theta/parse/empty-schema-body` diagnostic (schemas.md §Object schema;
 * grammar.md §"Inline object types"), naming `subject` as whatever has no
 * fields. The SOLE construction point for this code: `checkObjectSchema`'s
 * zero-field arm below passes the declaration's name, and `walkType`
 * (type-grammar.ts) passes the literal two bytes `{}` for an inline object
 * whose brace interior carries no token. A second construction site would let
 * the two positions' messages drift apart.
 */
export function emptySchemaBodyDiagnostic(
  subject: string,
  site: SchemaDeclSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/empty-schema-body",
    file: site.file,
    range: site.range,
    message: `'${subject}' has no fields; an empty schema cannot be validated.`,
  };
}

/**
 * Check an object-schema declaration, returning every diagnostic raised in
 * source order:
 *
 *   - `theta/parse/empty-schema-body`   — the schema declares no fields.
 *   - `theta/parse/redundant-wire-name` (W) — a field's wire name equals its
 *     theta-side name.
 *   - `theta/parse/wire-name-collision` — a field's effective wire name
 *     (`wireName ?? thetaName`) collides with another field's effective wire
 *     name or with another field's theta-side name in the same schema.
 */
export function checkObjectSchema(
  decl: ObjectSchemaDecl,
  site: SchemaDeclSite,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // `schema X { }` with no fields — the lowered empty-object shape would
  // silently accept every object (schemas.md §Object schema).
  if (decl.fields.length === 0) {
    diagnostics.push(emptySchemaBodyDiagnostic(decl.name, site));
    return diagnostics;
  }

  // A rename whose wire name equals the theta-side name carries no information
  // (schemas.md §Wire-name renaming) — warning, in source order.
  for (const field of decl.fields) {
    if (field.wireName !== undefined && field.wireName === field.thetaName) {
      diagnostics.push({
        severity: "warning",
        code: "theta/parse/redundant-wire-name",
        file: site.file,
        range: site.range,
        message: `redundant 'as' clause: wire name '${field.wireName}' equals the theta-side name`,
        hint: "Drop the `as` clause.",
      });
    }
  }

  // Wire-name collisions (schemas.md §Wire-name renaming): two fields cannot
  // share an effective wire name (`wireName ?? thetaName`), and an explicit wire
  // name cannot collide with another field's theta-side name. Report each
  // colliding name once, in source order.
  const reported = new Set<string>();
  for (let i = 0; i < decl.fields.length; i += 1) {
    const fi = decl.fields[i];
    if (fi === undefined) {
      continue;
    }
    const wi = fi.wireName ?? fi.thetaName;
    for (let j = 0; j < decl.fields.length; j += 1) {
      if (i === j) {
        continue;
      }
      const fj = decl.fields[j];
      if (fj === undefined) {
        continue;
      }
      const wj = fj.wireName ?? fj.thetaName;
      let collidingName: string | undefined;
      if (wi === wj) {
        // Two fields share an effective wire name.
        collidingName = wi;
      } else if (fi.wireName !== undefined && fi.wireName === fj.thetaName) {
        // An explicit wire name collides with another field's theta-side name.
        collidingName = fi.wireName;
      }
      if (collidingName !== undefined && !reported.has(collidingName)) {
        reported.add(collidingName);
        diagnostics.push({
          severity: "error",
          code: "theta/parse/wire-name-collision",
          file: site.file,
          range: site.range,
          message: `wire name '${collidingName}' collides with another field on schema '${decl.name}'`,
        });
      }
    }
  }

  return diagnostics;
}

/** The literal kind of an enum variant's explicit value. */
export type EnumValueKind = "string" | "integer" | "number" | "boolean" | "null";

/**
 * A single enum-variant declaration. `value` is the explicit `= "..."` value
 * when present; absent means the variant name verbatim is the wire value.
 */
export interface EnumVariantDecl {
  readonly name: string;
  readonly value?: { readonly kind: EnumValueKind; readonly text: string };
}

/** An enum declaration (`enum X { ... }`). */
export interface EnumDecl {
  readonly name: string;
  readonly variants: readonly EnumVariantDecl[];
}

/**
 * Check an enum declaration, returning every diagnostic raised in source order:
 *
 *   - `theta/parse/empty-enum-body`             — the enum declares no variants.
 *   - `theta/parse/duplicate-enum-variant-name` — two variants share an
 *     identifier; this check runs BEFORE the value-duplication check, so a
 *     distinct-explicit-value name collision (`enum X { Low = "a", Low = "b" }`)
 *     fires here, not `theta/parse/duplicate-enum-value`.
 *   - `theta/parse/non-string-enum-value`       — an explicit value whose kind is
 *     not `string`.
 *   - `theta/parse/duplicate-enum-value`        — two distinct-named variants
 *     share one explicit string value.
 */
export function checkEnumDeclaration(
  decl: EnumDecl,
  site: SchemaDeclSite,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // `enum X { }` with no variants — the would-be `{type:"string", enum:[]}`
  // lowering is invalid JSON Schema 2020-12 (schemas.md §Enum declarations).
  if (decl.variants.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "theta/parse/empty-enum-body",
      file: site.file,
      range: site.range,
      message: `'${decl.name}' has no variants; an empty enum cannot be validated.`,
    });
    return diagnostics;
  }

  // Name-duplication check runs BEFORE the value-duplication check
  // (schemas.md §Enum declarations): two variants sharing an identifier fail on
  // the name collision regardless of explicit-value assignment. Report each
  // repeated name once, in source order.
  const namesSeen = new Set<string>();
  const nameReported = new Set<string>();
  for (const variant of decl.variants) {
    if (namesSeen.has(variant.name) && !nameReported.has(variant.name)) {
      nameReported.add(variant.name);
      diagnostics.push({
        severity: "error",
        code: "theta/parse/duplicate-enum-variant-name",
        file: site.file,
        range: site.range,
        message: `duplicate variant name '${variant.name}' on enum '${decl.name}'`,
      });
    }
    namesSeen.add(variant.name);
  }

  // theta 1.0 enums carry string values only (schemas.md §Enum declarations):
  // an explicit value of any other literal kind is rejected.
  for (const variant of decl.variants) {
    if (variant.value !== undefined && variant.value.kind !== "string") {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/non-string-enum-value",
        file: site.file,
        range: site.range,
        message: `enum variant value must be a string literal; got ${variant.value.kind}`,
      });
    }
  }

  // Value-duplication check (schemas.md §Enum declarations) is reserved for the
  // orthogonal case of DISTINCT names sharing one explicit string value. Group
  // explicit string values by the distinct variant names carrying them; a value
  // borne by two or more distinct names collides.
  const valueToNames = new Map<string, Set<string>>();
  for (const variant of decl.variants) {
    if (variant.value !== undefined && variant.value.kind === "string") {
      const names = valueToNames.get(variant.value.text) ?? new Set<string>();
      names.add(variant.name);
      valueToNames.set(variant.value.text, names);
    }
  }
  const valueReported = new Set<string>();
  for (const variant of decl.variants) {
    if (variant.value === undefined || variant.value.kind !== "string") {
      continue;
    }
    const value = variant.value.text;
    const names = valueToNames.get(value);
    if (names !== undefined && names.size >= 2 && !valueReported.has(value)) {
      valueReported.add(value);
      diagnostics.push({
        severity: "error",
        code: "theta/parse/duplicate-enum-value",
        file: site.file,
        range: site.range,
        message: `duplicate enum value '${value}' across variants of enum '${decl.name}'`,
      });
    }
  }

  return diagnostics;
}

/**
 * Check an inline-enum form (`enum["a", "b"]` or other inline `enum[...]`),
 * returning `theta/parse/inline-enum` — `enum` is top-level only. Returns
 * `undefined` when `source` is not an inline-enum form.
 */
export function checkInlineEnumForm(
  source: string,
  site: SchemaDeclSite,
): Diagnostic | undefined {
  // `enum` is top-level only; an inline `enum[...]` form is rejected
  // (schemas.md §Enum declarations). Detect the leading `enum` keyword followed
  // by an opening bracket.
  if (!/^\s*enum\s*\[/.test(source)) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/inline-enum",
    file: site.file,
    range: site.range,
    message:
      "inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a literal-union",
    hint: "Use a literal-union (`\"a\" | \"b\"`) or a top-level `enum` declaration.",
  };
}

/** A `Enum.Variant` member-access reference and the enum's declared variants. */
export interface VariantAccess {
  readonly enumName: string;
  readonly variant: string;
  readonly knownVariants: readonly string[];
}

/**
 * Check a `Enum.Variant` reference, returning `theta/parse/unknown-variant` when
 * `variant` is not one of `knownVariants`. Returns `undefined` for a declared
 * variant.
 */
export function checkVariantAccess(
  access: VariantAccess,
  site: SchemaDeclSite,
): Diagnostic | undefined {
  // `Enum.Variant` where `Variant` is not a declared variant of `Enum`
  // (schemas.md §Variant access).
  if (access.knownVariants.includes(access.variant)) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/unknown-variant",
    file: site.file,
    range: site.range,
    message: `unknown variant '${access.variant}' on enum '${access.enumName}'`,
  };
}

// --- V5b / V5b-T — discriminated unions, recursion, cycle detection --------
//
// V5b owns the parse-time checks for the discriminated-union, `by`-clause, and
// type-alias-cycle rules of schemas.md §Discriminated unions and §Recursion:
//
//   - `theta/parse/non-string-discriminator`     — the discriminator field's
//     per-variant literal type is not `string`.
//   - `theta/parse/ambiguous-discriminator`      — more than one field qualifies.
//   - `theta/parse/missing-discriminator`        — no field qualifies.
//   - `theta/parse/duplicate-discriminator-value`— two variants share a value.
//   - `theta/parse/nested-discriminator`         — the discriminator field's
//     value is a nested object, not a top-level literal.
//   - `theta/parse/non-literal-discriminator`    — an explicit `by` field
//     resolves in every variant but its type is not a single string literal.
//   - `theta/parse/by-on-object-schema`          — a `by` clause on an object
//     body, or on a right-hand side of fewer than two arms.
//   - `theta/parse/type-alias-cycle`             — a pure-alias cycle (a cycle
//     through at least one object-schema hop remains legal).
//
// V5b-T declared these seam shapes; V5b (this leaf) implements every check:
// implicit discriminator detection (present-in-all / single string-literal /
// unique-value), the explicit `by <field>` overrides, and the type-alias-cycle
// detector whose object-schema hops remain legal.

/**
 * A field of a union variant relevant to discriminator detection. `literal` is
 * present iff the field type is a single literal `const` (`kind: "v1"`), and
 * carries that literal's type-kind and source text. `nested` marks a field
 * whose value is a nested object (`kind: { type: "x" }`) rather than a
 * top-level literal. `emptyObject` marks a field whose captured type source
 * IS an empty inline object (`{}`) — a construct `theta/parse/empty-schema-body`
 * has already refused as ill-formed, distinct from `nested`, which marks a
 * genuinely nested, well-formed group (bug 0129). Detection runs on the wire
 * name (`wireName ?? name`).
 */
export interface DiscriminatorCandidateField {
  readonly name: string;
  readonly wireName?: string;
  readonly literal?: { readonly kind: EnumValueKind; readonly text: string };
  readonly nested?: boolean;
  readonly emptyObject?: boolean;
}

/** A single object-schema variant of a discriminated union. */
export interface UnionVariantSchema {
  readonly name: string;
  readonly fields: readonly DiscriminatorCandidateField[];
}

/**
 * A `schema X = A | B | C` union (optionally `schema X by f = ...`). `by` is
 * the explicit theta-side discriminator field name when the author overrode
 * implicit detection.
 */
export interface DiscriminatedUnionDecl {
  readonly name: string;
  readonly by?: string;
  readonly variants: readonly UnionVariantSchema[];
}

/**
 * Check a discriminated-union declaration, returning every diagnostic raised in
 * source order (`theta/parse/non-string-discriminator`, `theta/parse/ambiguous-discriminator`,
 * `theta/parse/missing-discriminator`, `theta/parse/duplicate-discriminator-value`,
 * `theta/parse/nested-discriminator`, `theta/parse/non-literal-discriminator`).
 */
export function checkDiscriminatedUnion(
  decl: DiscriminatedUnionDecl,
  site: SchemaDeclSite,
): Diagnostic[] {
  // Explicit `by <field>` overrides implicit detection (schemas.md
  // §Discriminated unions). Detection runs on the wire name in both paths.
  if (decl.by !== undefined) {
    return checkExplicitDiscriminator(decl, decl.by, site);
  }
  return detectImplicitDiscriminator(decl, site);
}

/** The effective wire name a discriminator field is detected under. */
function wireNameOf(field: DiscriminatorCandidateField): string {
  return field.wireName ?? field.name;
}

/** The wire-named field on `variant`, or `undefined` when absent. */
function fieldInVariant(
  variant: UnionVariantSchema,
  wireName: string,
): DiscriminatorCandidateField | undefined {
  return variant.fields.find((f) => wireNameOf(f) === wireName);
}

/**
 * The THETA-SIDE-named field on `variant`, or `undefined` when absent — the
 * resolution an explicit `by <field>` clause uses. schemas.md §Wire-name
 * renaming: "The explicit form `by <field>` accepts the theta-side name — the
 * only name visible in code — and the lowering resolves it to each variant's
 * wire name." Implicit detection keeps `fieldInVariant` above, because it runs
 * over the LOWERED schema, where only wire names exist.
 */
function thetaNamedFieldInVariant(
  variant: UnionVariantSchema,
  name: string,
): DiscriminatorCandidateField | undefined {
  return variant.fields.find((f) => f.name === name);
}

/** Wire-named fields in first-seen order across the variants. */
function orderedWireNames(variants: readonly UnionVariantSchema[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const variant of variants) {
    for (const field of variant.fields) {
      const wire = wireNameOf(field);
      if (!seen.has(wire)) {
        seen.add(wire);
        order.push(wire);
      }
    }
  }
  return order;
}

/**
 * Render a parse-time literal value per diagnostics/placeholder-rendering-b.md
 * category 5: bare when identifier-shaped, double-quoted otherwise.
 */
function renderParseLiteralValue(text: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : JSON.stringify(text);
}

/**
 * The per-variant evaluation of one candidate field across the union. `name`
 * is the spelling the diagnostics report: the wire name under implicit
 * detection, the author's theta-side name under an explicit `by <field>`.
 */
interface FieldEvaluation {
  readonly name: string;
  readonly presentInAll: boolean;
  readonly anyNested: boolean;
  readonly anyEmptyObject: boolean;
  readonly allLiteral: boolean;
  readonly allString: boolean;
  readonly firstNonStringKind?: EnumValueKind | undefined;
  readonly literalTexts: readonly string[];
  readonly uniqueValues: boolean;
  readonly firstDuplicateValue?: string | undefined;
}

/** Evaluate one candidate wire-name's shape across every variant. */
function evaluateField(
  wire: string,
  variants: readonly UnionVariantSchema[],
): FieldEvaluation {
  return evaluateOccurrences(wire, variants.map((v) => fieldInVariant(v, wire)));
}

/**
 * Evaluate the shape of one field ALREADY RESOLVED per variant. The two
 * resolutions differ (implicit detection reads the wire name off the lowered
 * schema; an explicit `by <field>` reads the theta-side name off the source)
 * but every constraint below applies to the resolved field's VALUE, which the
 * rename does not touch — schemas.md §Discriminated unions: "wire-renamed
 * discriminator fields (`kind as "Kind": "v1"`) keep the string-literal
 * constraint on the *value*; the rename does not interact." `name` is the
 * spelling the diagnostics report, so each caller passes the one its author
 * wrote.
 */
function evaluateOccurrences(
  name: string,
  occurrences: readonly (DiscriminatorCandidateField | undefined)[],
): FieldEvaluation {
  const presentInAll = occurrences.every((o) => o !== undefined);
  const anyNested = occurrences.some((o) => o?.nested === true);
  // A `.some` mirroring `anyNested`: the withhold this flag drives is DERIVED
  // from one present, refused occurrence's own text, so one occurrence wide is
  // its whole reach (bug 0046 §Fix constraint 2 owns this fold's asymmetry).
  const anyEmptyObject = occurrences.some((o) => o?.emptyObject === true);
  const allLiteral =
    presentInAll && occurrences.every((o) => o?.literal !== undefined);

  const literals = allLiteral
    ? occurrences.map((o) => o?.literal).filter((l): l is NonNullable<typeof l> => l !== undefined)
    : [];
  const allString = allLiteral && literals.every((l) => l.kind === "string");
  const firstNonStringKind = literals.find((l) => l.kind !== "string")?.kind;
  const literalTexts = literals.map((l) => l.text);

  // First value (in variant order) borne by an earlier variant — the reported
  // duplicate.
  let firstDuplicateValue: string | undefined;
  const seenTexts = new Set<string>();
  for (const text of literalTexts) {
    if (seenTexts.has(text)) {
      firstDuplicateValue = text;
      break;
    }
    seenTexts.add(text);
  }
  const uniqueValues = firstDuplicateValue === undefined;

  return {
    name,
    presentInAll,
    anyNested,
    anyEmptyObject,
    allLiteral,
    allString,
    firstNonStringKind,
    literalTexts,
    uniqueValues,
    firstDuplicateValue,
  };
}

/** Implicit discriminator detection (no `by` clause). */
function detectImplicitDiscriminator(
  decl: DiscriminatedUnionDecl,
  site: SchemaDeclSite,
): Diagnostic[] {
  const evaluations = orderedWireNames(decl.variants)
    .map((wire) => evaluateField(wire, decl.variants))
    .filter((e) => e.presentInAll && e.allLiteral);

  // String-literal, present-in-all fields are discriminator-shaped; those with
  // unique values qualify, those with duplicate values are duplicate-value
  // candidates (schemas.md §Discriminated unions, detection rules 1–3).
  const stringShaped = evaluations.filter((e) => e.allString);
  const qualifying = stringShaped.filter((e) => e.uniqueValues);
  const duplicateValued = stringShaped.filter((e) => !e.uniqueValues);
  const nonStringShaped = evaluations.filter((e) => !e.allString);

  if (qualifying.length === 1) {
    // Exactly one field qualifies — it is the discriminator. No diagnostic.
    return [];
  }

  if (qualifying.length >= 2) {
    const candidates = qualifying.map((e) => e.name).join(", ");
    return [
      {
        severity: "error",
        code: "theta/parse/ambiguous-discriminator",
        file: site.file,
        range: site.range,
        message: `ambiguous discriminator for ${decl.name}; candidates: ${candidates}. Declare explicitly with 'by <field>'.`,
      },
    ];
  }

  // No field qualifies. A discriminator-shaped string field with duplicate
  // values is the most specific failure; then a structurally-shaped field whose
  // literal type is non-string; otherwise no discriminator exists at all.
  const dup = duplicateValued[0];
  if (dup !== undefined && dup.firstDuplicateValue !== undefined) {
    return [duplicateValueDiagnostic(decl.name, dup.firstDuplicateValue, site)];
  }

  const nonString = nonStringShaped[0];
  if (nonString !== undefined && nonString.firstNonStringKind !== undefined) {
    return [
      nonStringDiagnostic(decl.name, nonString.name, nonString.firstNonStringKind, site),
    ];
  }

  return [
    {
      severity: "error",
      code: "theta/parse/missing-discriminator",
      file: site.file,
      range: site.range,
      message: `${decl.name} is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'.`,
    },
  ];
}

/** Explicit `by <field>` discriminator validation. */
function checkExplicitDiscriminator(
  decl: DiscriminatedUnionDecl,
  field: string,
  site: SchemaDeclSite,
): Diagnostic[] {
  // Resolved by THETA-SIDE name (schemas.md §Wire-name renaming), then
  // evaluated: `schema Animal by kind = Cat | Dog` selects each variant's
  // `kind` field even where it is written `kind as "Kind": "v1"`, and the
  // constraints below then bind that field's VALUE.
  //
  // A `by` naming NO theta-side field of the variants resolves to nothing, so
  // `presentInAll` is false and every constraint below is vacuous — this
  // function returns clean. That disposition is UNDECIDED by the
  // specification: schemas.md §Discriminated unions prescribes a code for a
  // discriminator that is nested, non-string or non-unique, and
  // `missing-discriminator` for an IMPLICIT detection that finds no candidate,
  // but says nothing about an explicit `by` naming a field no variant
  // declares. No code is invented for it here. A field that DOES resolve in
  // every variant but is not a single literal is DECIDED (bug 0128): the gate
  // below refuses it.
  const evaluation = evaluateOccurrences(
    field,
    decl.variants.map((v) => thetaNamedFieldInVariant(v, field)),
  );

  // A nested discriminator value (`kind: { type: "x" }`) is not a top-level
  // literal — checked first, since its value/type cannot otherwise be read.
  if (evaluation.anyNested) {
    return [
      {
        severity: "error",
        code: "theta/parse/nested-discriminator",
        file: site.file,
        range: site.range,
        message: `discriminator field '${field}' must be at the top level of each variant of ${decl.name}`,
      },
    ];
  }

  // An empty inline object type (`{}`) is a construct
  // `theta/parse/empty-schema-body` has already refused as ill-formed, and that
  // refusal fires ALONE: every row below reads the field's captured text as a
  // well-formed type, which a refused `{}` does not supply (bug 0129, Reading
  // A). The derived-verdict test: would the occurrence's ABSENCE reach the same
  // verdict? An absent `kind` reaches no nesting verdict at all, so `{}`'s is
  // derived, and withheld. Ordered after `anyNested` so a sibling's genuinely
  // nested occurrence — an independent fault — still returns above. The
  // implicit path reads neither flag, so its pairing is untouched.
  if (evaluation.anyEmptyObject) {
    return [];
  }

  // A named field that resolves in every variant but is not a single literal
  // (a literal-union, a bare `string`, an `enum` name, `integer`, an `array`,
  // a nullable literal, or a named/brace-rooted union of object schemas) is
  // refused: detection rule 2 (schemas.md §Discriminated unions) binds a named
  // field the same way the top-level rule and the uniqueness rule already do
  // (bug 0128). Checked after `anyNested` — a nested occurrence is more
  // specific and keeps its own code — and before the non-string gate, which
  // presupposes a literal this evaluation does not have.
  if (evaluation.presentInAll && !evaluation.allLiteral) {
    return [nonLiteralDiagnostic(decl.name, field, site)];
  }

  // The string-literal constraint applies equally to the explicit form
  // (schemas.md §Discriminated unions).
  if (evaluation.allLiteral && !evaluation.allString && evaluation.firstNonStringKind !== undefined) {
    return [nonStringDiagnostic(decl.name, field, evaluation.firstNonStringKind, site)];
  }

  // A chosen discriminator whose value is not unique across the variants.
  if (
    evaluation.allLiteral &&
    evaluation.allString &&
    evaluation.firstDuplicateValue !== undefined
  ) {
    return [duplicateValueDiagnostic(decl.name, evaluation.firstDuplicateValue, site)];
  }

  return [];
}

/** The shared `theta/parse/non-literal-discriminator` diagnostic. */
function nonLiteralDiagnostic(
  schemaName: string,
  field: string,
  site: SchemaDeclSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/non-literal-discriminator",
    file: site.file,
    range: site.range,
    message: `discriminator '${field}' on ${schemaName} must be a single string-literal type in every variant`,
  };
}

/** The shared `theta/parse/non-string-discriminator` diagnostic. */
function nonStringDiagnostic(
  schemaName: string,
  field: string,
  kind: EnumValueKind,
  site: SchemaDeclSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/non-string-discriminator",
    file: site.file,
    range: site.range,
    message: `discriminator '${field}' on ${schemaName} must be a string-literal type; got ${kind}`,
  };
}

/** The shared `theta/parse/duplicate-discriminator-value` diagnostic. */
function duplicateValueDiagnostic(
  schemaName: string,
  valueText: string,
  site: SchemaDeclSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/duplicate-discriminator-value",
    file: site.file,
    range: site.range,
    message: `duplicate discriminator value '${renderParseLiteralValue(valueText)}' across variants of ${schemaName}`,
  };
}

/**
 * A schema declaration carrying a `by <field>` clause. `form` distinguishes
 * what the clause sits on by SHAPE: `"union"` is a right-hand side of TWO OR
 * MORE arms, per `UnionRhs ::= Type ("|" Type)+` (grammar.md §"schema X by
 * <field>"), and is the one legal case here. `"object"` is every other
 * declaration the clause can sit on: an object body (`schema X by f { ... }`)
 * or a right-hand side of fewer than two arms (`schema X by f = Cat`). Both
 * carry one variant, so both fail the same way.
 *
 * The cut is the arm count, NOT whether the arms form a discriminated union:
 * a two-arm primitive union (`schema X by f = string | integer`) classifies
 * as `"union"` and this check admits it. That matches the registry Trigger
 * for `theta/parse/by-on-object-schema` ("A `by` clause on an object body …,
 * or on a right-hand side of fewer than two arms …"); whether a two-or-more-
 * arm union then needs a discriminator is `checkDiscriminatedUnion`'s
 * question, over object-schema arms.
 */
export interface ByClauseDecl {
  readonly name: string;
  readonly form: "object" | "union";
  readonly field: string;
}

/**
 * Check a `by <field>` clause, returning `theta/parse/by-on-object-schema`
 * when the clause sits on a one-variant declaration — an object body, or a
 * right-hand side of fewer than two arms (see `ByClauseDecl.form`). Returns
 * `undefined` for a right-hand side of two or more arms.
 */
export function checkByClause(
  decl: ByClauseDecl,
  site: SchemaDeclSite,
): Diagnostic | undefined {
  // The `by` clause is admitted on the two-or-more-arm form; an object body —
  // and equally a one-arm right-hand side — has one variant by definition, so
  // there is nothing for a discriminator to select between
  // (schemas.md §Discriminated unions, grammar.md §`schema X by <field>`).
  if (decl.form === "union") {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/by-on-object-schema",
    file: site.file,
    range: site.range,
    message:
      "the 'by' clause applies only to discriminated-union schemas (schema X by f = A | B | …)",
  };
}

/**
 * A node in the schema-reference graph for type-alias-cycle detection. `kind`
 * is `"alias"` for the `schema X = ...` form and `"object"` for an object
 * schema (`schema X { ... }`); `references` lists the named schemas the node's
 * right-hand side refers to.
 */
export interface SchemaGraphNode {
  readonly name: string;
  readonly kind: "alias" | "object";
  readonly references: readonly string[];
}

/**
 * Detect type-alias cycles across the schema-reference graph, returning one
 * `theta/parse/type-alias-cycle` per pure-alias cycle (a cycle whose every node
 * is an alias). A cycle that traverses at least one object-schema hop crosses a
 * `$ref` against `$defs` and is legal — it raises no diagnostic.
 *
 * `site` is the whole-graph fallback anchor. `nodeSites`, when supplied, gives
 * a per-declaration range and each cycle's diagnostic is anchored at the first
 * node of the path it renders — a declaration that is IN the cycle, rather
 * than whichever declaration the caller happened to pass as the graph-wide
 * site. Optional so a caller with no per-node ranges (the seam tests) keeps
 * the whole-graph anchor unchanged; a name absent from the map falls back to
 * `site.range` the same way.
 */
export function detectTypeAliasCycles(
  nodes: readonly SchemaGraphNode[],
  site: SchemaDeclSite,
  nodeSites?: ReadonlyMap<string, SourceRange>,
): Diagnostic[] {
  const nodeMap = new Map(nodes.map((n) => [n.name, n] as const));
  const diagnostics: Diagnostic[] = [];
  const reportedCycles = new Set<string>();
  const fullyExplored = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  // DFS detecting back-edges to a node currently on the recursion stack. A
  // cycle whose every node is an alias is rejected; a cycle traversing at least
  // one object-schema hop crosses a `$ref` against `$defs` and is legal
  // (schemas.md §Recursion). Detection runs over the resolved reference graph.
  const dfs = (name: string): void => {
    const node = nodeMap.get(name);
    if (node === undefined) {
      // Dangling reference (unresolved name) — not this checker's concern.
      return;
    }
    stack.push(name);
    onStack.add(name);
    for (const ref of node.references) {
      if (onStack.has(ref)) {
        const idx = stack.indexOf(ref);
        const cycleNodes = stack.slice(idx);
        const allAlias = cycleNodes.every(
          (n) => nodeMap.get(n)?.kind === "alias",
        );
        if (allAlias) {
          const signature = [...cycleNodes].sort().join("|");
          if (!reportedCycles.has(signature)) {
            reportedCycles.add(signature);
            const path = [...cycleNodes, ref].join(" \u2192 ");
            const head = cycleNodes[0];
            diagnostics.push({
              severity: "error",
              code: "theta/parse/type-alias-cycle",
              file: site.file,
              range:
                (head !== undefined ? nodeSites?.get(head) : undefined) ?? site.range,
              message: `type-alias cycle: ${path}`,
            });
          }
        }
      } else if (!fullyExplored.has(ref)) {
        dfs(ref);
      }
    }
    onStack.delete(name);
    stack.pop();
    fullyExplored.add(name);
  };

  for (const node of nodes) {
    if (!fullyExplored.has(node.name)) {
      dfs(node.name);
    }
  }
  return diagnostics;
}
