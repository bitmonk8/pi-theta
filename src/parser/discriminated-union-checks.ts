// Parse-time implicit discriminator detection and explicit `by` validation for
// discriminated unions (schemas.md §Discriminated unions).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { EnumValueKind, SchemaDeclSite } from "./schema-declarations";

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
 * `theta/parse/nested-discriminator`, `theta/parse/absent-discriminator-field`,
 * `theta/parse/non-literal-discriminator`).
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
  // A `by` naming a field at least one variant does not declare is DECIDED
  // (bug 0046, settled route): detection rule 1 — "be present in every
  // variant" (schemas.md §Discriminated unions) — binds the named field the
  // same way rule 2 already does for a resolved-but-non-literal field (bug
  // 0128), so `presentInAll === false` is refused below rather than left to
  // vacate every remaining gate. A field that DOES resolve in every variant
  // but is not a single literal is the separate, already-decided case (bug
  // 0128): the gate after this one refuses it.
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

  // A field at least one variant does not declare (bug 0046, settled route,
  // §Fix constraint 2 answered "absent from ANY variant"): every gate
  // downstream presupposes a field present in every variant (`allLiteral`
  // folds `presentInAll` in), so an absent field is refused here rather than
  // left to fall through them and silence the four rejections a misspelled or
  // unresolved field name would draw without the clause.
  // Ordered AFTER `anyNested` — a nested occurrence is more specific and keeps
  // its own code (fixtures A6/A10) — and BEFORE the empty-object withhold
  // below, so an absent field wins over a sibling occurrence's refused `{}`
  // text rather than being swallowed by it.
  if (!evaluation.presentInAll) {
    return [absentFieldDiagnostic(decl.name, field, site)];
  }

  // An empty inline object type (`{}`) is a construct
  // `theta/parse/empty-schema-body` has already refused as ill-formed, and that
  // refusal fires ALONE: every row below reads the field's captured text as a
  // well-formed type, which a refused `{}` does not supply (bug 0129, Reading
  // A). The derived-verdict test: would the occurrence's ABSENCE reach the same
  // verdict? An absent `kind` reaches no nesting verdict at all, so `{}`'s is
  // derived, and withheld. Ordered after `anyNested` and the absent-field gate
  // so a sibling's genuinely nested occurrence — an independent fault — still
  // returns above. The implicit path reads neither flag, so its pairing is
  // untouched.
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
  if (!evaluation.allLiteral) {
    return [nonLiteralDiagnostic(decl.name, field, site)];
  }

  // The string-literal constraint applies equally to the explicit form
  // (schemas.md §Discriminated unions).
  if (!evaluation.allString && evaluation.firstNonStringKind !== undefined) {
    return [nonStringDiagnostic(decl.name, field, evaluation.firstNonStringKind, site)];
  }

  // A chosen discriminator whose value is not unique across the variants.
  if (evaluation.firstDuplicateValue !== undefined) {
    return [duplicateValueDiagnostic(decl.name, evaluation.firstDuplicateValue, site)];
  }

  return [];
}

/** The shared `theta/parse/absent-discriminator-field` diagnostic. */
function absentFieldDiagnostic(
  schemaName: string,
  field: string,
  site: SchemaDeclSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/absent-discriminator-field",
    file: site.file,
    range: site.range,
    message: `discriminator '${field}' on ${schemaName} must be declared in every variant`,
  };
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
