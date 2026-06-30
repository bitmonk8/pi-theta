// V5a / V5a-T — the schema-declaration checker seam.
//
// This module owns the parse-time well-formedness checks for the three schema
// declaration shapes of schemas.md and type-system.md:
//
//   - Object schema   — `schema X { f: T, ... }` (incl. `as "WireName"` renames):
//       * `loom/parse/empty-schema-body`   — `schema X { }` with no fields.
//       * `loom/parse/wire-name-collision` — two fields share a wire name, or a
//         wire name collides with another field's loom-side name.
//       * `loom/parse/redundant-wire-name` (W) — a rename whose wire name equals
//         the loom-side name (`field as "field"`).
//   - Enum declaration — `enum X { Low, High = "h", ... }`:
//       * `loom/parse/empty-enum-body`               — `enum X { }` with no variants.
//       * `loom/parse/duplicate-enum-variant-name`   — two variants share an
//         identifier (regardless of explicit value); this check runs BEFORE the
//         value-duplication check (schemas.md §Enum declarations).
//       * `loom/parse/duplicate-enum-value`          — two distinct-named variants
//         share one explicit string value.
//       * `loom/parse/non-string-enum-value`         — an explicit value that is
//         not a single string literal.
//       * `loom/parse/inline-enum`                   — an inline `enum[...]` form
//         (top-level `enum` only).
//   - Variant access  — `Enum.Variant`:
//       * `loom/parse/unknown-variant`               — a reference to a variant the
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
 * loom-side identifier (`loomName`).
 */
export interface SchemaFieldDecl {
  readonly loomName: string;
  readonly wireName?: string;
}

/** An object-schema declaration (`schema X { ... }`). */
export interface ObjectSchemaDecl {
  readonly name: string;
  readonly fields: readonly SchemaFieldDecl[];
}

/**
 * Check an object-schema declaration, returning every diagnostic raised in
 * source order:
 *
 *   - `loom/parse/empty-schema-body`   — the schema declares no fields.
 *   - `loom/parse/redundant-wire-name` (W) — a field's wire name equals its
 *     loom-side name.
 *   - `loom/parse/wire-name-collision` — a field's effective wire name
 *     (`wireName ?? loomName`) collides with another field's effective wire
 *     name or with another field's loom-side name in the same schema.
 */
export function checkObjectSchema(
  decl: ObjectSchemaDecl,
  site: SchemaDeclSite,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // `schema X { }` with no fields — the lowered empty-object shape would
  // silently accept every object (schemas.md §Object schema).
  if (decl.fields.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "loom/parse/empty-schema-body",
      file: site.file,
      range: site.range,
      message: `'${decl.name}' has no fields; an empty schema cannot be validated.`,
    });
    return diagnostics;
  }

  // A rename whose wire name equals the loom-side name carries no information
  // (schemas.md §Wire-name renaming) — warning, in source order.
  for (const field of decl.fields) {
    if (field.wireName !== undefined && field.wireName === field.loomName) {
      diagnostics.push({
        severity: "warning",
        code: "loom/parse/redundant-wire-name",
        file: site.file,
        range: site.range,
        message: `redundant 'as' clause: wire name '${field.wireName}' equals the loom-side name`,
        hint: "Drop the `as` clause.",
      });
    }
  }

  // Wire-name collisions (schemas.md §Wire-name renaming): two fields cannot
  // share an effective wire name (`wireName ?? loomName`), and an explicit wire
  // name cannot collide with another field's loom-side name. Report each
  // colliding name once, in source order.
  const reported = new Set<string>();
  for (let i = 0; i < decl.fields.length; i += 1) {
    const fi = decl.fields[i];
    if (fi === undefined) {
      continue;
    }
    const wi = fi.wireName ?? fi.loomName;
    for (let j = 0; j < decl.fields.length; j += 1) {
      if (i === j) {
        continue;
      }
      const fj = decl.fields[j];
      if (fj === undefined) {
        continue;
      }
      const wj = fj.wireName ?? fj.loomName;
      let collidingName: string | undefined;
      if (wi === wj) {
        // Two fields share an effective wire name.
        collidingName = wi;
      } else if (fi.wireName !== undefined && fi.wireName === fj.loomName) {
        // An explicit wire name collides with another field's loom-side name.
        collidingName = fi.wireName;
      }
      if (collidingName !== undefined && !reported.has(collidingName)) {
        reported.add(collidingName);
        diagnostics.push({
          severity: "error",
          code: "loom/parse/wire-name-collision",
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
 *   - `loom/parse/empty-enum-body`             — the enum declares no variants.
 *   - `loom/parse/duplicate-enum-variant-name` — two variants share an
 *     identifier; this check runs BEFORE the value-duplication check, so a
 *     distinct-explicit-value name collision (`enum X { Low = "a", Low = "b" }`)
 *     fires here, not `loom/parse/duplicate-enum-value`.
 *   - `loom/parse/non-string-enum-value`       — an explicit value whose kind is
 *     not `string`.
 *   - `loom/parse/duplicate-enum-value`        — two distinct-named variants
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
      code: "loom/parse/empty-enum-body",
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
        code: "loom/parse/duplicate-enum-variant-name",
        file: site.file,
        range: site.range,
        message: `duplicate variant name '${variant.name}' on enum '${decl.name}'`,
      });
    }
    namesSeen.add(variant.name);
  }

  // loom 1.0 enums carry string values only (schemas.md §Enum declarations):
  // an explicit value of any other literal kind is rejected.
  for (const variant of decl.variants) {
    if (variant.value !== undefined && variant.value.kind !== "string") {
      diagnostics.push({
        severity: "error",
        code: "loom/parse/non-string-enum-value",
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
        code: "loom/parse/duplicate-enum-value",
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
 * returning `loom/parse/inline-enum` — `enum` is top-level only. Returns
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
    code: "loom/parse/inline-enum",
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
 * Check a `Enum.Variant` reference, returning `loom/parse/unknown-variant` when
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
    code: "loom/parse/unknown-variant",
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
//   - `loom/parse/non-string-discriminator`     — the discriminator field's
//     per-variant literal type is not `string`.
//   - `loom/parse/ambiguous-discriminator`      — more than one field qualifies.
//   - `loom/parse/missing-discriminator`        — no field qualifies.
//   - `loom/parse/duplicate-discriminator-value`— two variants share a value.
//   - `loom/parse/nested-discriminator`         — the discriminator field's
//     value is a nested object, not a top-level literal.
//   - `loom/parse/by-on-object-schema`          — a `by` clause on an object body.
//   - `loom/parse/type-alias-cycle`             — a pure-alias cycle (a cycle
//     through at least one object-schema hop remains legal).
//
// V5b-T (this tests-task) declares these seam shapes and stubs the
// behaviour-bearing functions so the failing tests compile and red on their own
// primary assertions. The paired V5b implementation leaf fills these in.

/**
 * A field of a union variant relevant to discriminator detection. `literal` is
 * present iff the field type is a single literal `const` (`kind: "v1"`), and
 * carries that literal's type-kind and source text. `nested` marks a field
 * whose value is a nested object (`kind: { type: "x" }`) rather than a
 * top-level literal. Detection runs on the wire name (`wireName ?? name`).
 */
export interface DiscriminatorCandidateField {
  readonly name: string;
  readonly wireName?: string;
  readonly literal?: { readonly kind: EnumValueKind; readonly text: string };
  readonly nested?: boolean;
}

/** A single object-schema variant of a discriminated union. */
export interface UnionVariantSchema {
  readonly name: string;
  readonly fields: readonly DiscriminatorCandidateField[];
}

/**
 * A `schema X = A | B | C` union (optionally `schema X by f = ...`). `by` is
 * the explicit loom-side discriminator field name when the author overrode
 * implicit detection.
 */
export interface DiscriminatedUnionDecl {
  readonly name: string;
  readonly by?: string;
  readonly variants: readonly UnionVariantSchema[];
}

/**
 * Check a discriminated-union declaration, returning every diagnostic raised in
 * source order (`loom/parse/non-string-discriminator`,
 * `loom/parse/ambiguous-discriminator`, `loom/parse/missing-discriminator`,
 * `loom/parse/duplicate-discriminator-value`, `loom/parse/nested-discriminator`).
 */
export function checkDiscriminatedUnion(
  decl: DiscriminatedUnionDecl,
  site: SchemaDeclSite,
): Diagnostic[] {
  // V5b-T stub: inert until the paired V5b implementation lands.
  void decl;
  void site;
  return [];
}

/**
 * A schema declaration carrying a `by <field>` clause. `form` distinguishes the
 * object body (`schema X by f { ... }`, illegal) from the union form
 * (`schema X by f = A | B`, legal).
 */
export interface ByClauseDecl {
  readonly name: string;
  readonly form: "object" | "union";
  readonly field: string;
}

/**
 * Check a `by <field>` clause, returning `loom/parse/by-on-object-schema` when
 * the clause sits on an object body (the `by` concept applies only to
 * discriminated unions). Returns `undefined` for the union form.
 */
export function checkByClause(
  decl: ByClauseDecl,
  site: SchemaDeclSite,
): Diagnostic | undefined {
  // V5b-T stub: inert until the paired V5b implementation lands.
  void decl;
  void site;
  return undefined;
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
 * `loom/parse/type-alias-cycle` per pure-alias cycle (a cycle whose every node
 * is an alias). A cycle that traverses at least one object-schema hop crosses a
 * `$ref` against `$defs` and is legal — it raises no diagnostic.
 */
export function detectTypeAliasCycles(
  nodes: readonly SchemaGraphNode[],
  site: SchemaDeclSite,
): Diagnostic[] {
  // V5b-T stub: inert until the paired V5b implementation lands.
  void nodes;
  void site;
  return [];
}
