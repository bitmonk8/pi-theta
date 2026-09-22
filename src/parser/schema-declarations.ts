// V5a / V5a-T — the schema-declaration checker seam.
//
// This module checks object schemas, enum declarations, variant access, `by`
// clauses, and alias cycles (schemas.md and type-system.md); the sibling
// discriminated-union-checks.ts owns the discriminated-union checks:
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

import { normaliseLiteralValueLineBreaks, type Diagnostic, type SourceRange } from "../diagnostics/diagnostic";

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
 * zero-field arm below passes the declaration's name, and type-grammar.ts
 * passes the literal two bytes `{}` at its two inline-object positions —
 * `walkType` for an interior that carries no token, and `TypeParser.parseObject`
 * for an empty entry slot met before any field derives (bug 0257). A second
 * construction site would let the positions' messages drift apart.
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

  // `schema X { }` with no fields — the lowered empty-object shape is closed
  // over nothing, so it admits only `{}` (schemas.md §Object schema).
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
        message: `duplicate enum value '${normaliseLiteralValueLineBreaks(value)}' across variants of enum '${decl.name}'`,
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
//   - `theta/parse/absent-discriminator-field`   — an explicit `by` field that
//     at least one variant does not declare.
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
 * A schema declaration carrying a `by <field>` clause. `form` distinguishes
 * what the clause sits on: `"union"` is a right-hand side of two or more arms
 * EVERY ONE of which is an object schema — an inline `ObjectType`, or an
 * identifier resolving to a declared object-form schema, with no alias hop —
 * and is the one legal case here (schemas.md §Discriminated unions defines the
 * concept over unions "whose variants are all object schemas"). `"object"` is
 * every other declaration the clause can sit on: an object body
 * (`schema X by f { ... }`), a right-hand side of fewer than two arms
 * (`schema X by f = Cat`), or a two-or-more-arm union with at least one
 * non-object-schema arm (`schema X by f = string | integer`) — none of these
 * is a discriminated union for the clause to apply to, so all three fail the
 * same way (bug 0046, settled route — the cut widened from arm COUNT alone to
 * arm count AND arm kind). The caller (`checkSchemaDeclarationGraph`,
 * theta-document.ts) computes `form`, since that is where the arm text and the
 * declared object-schema names are both in scope.
 */
export interface ByClauseDecl {
  readonly name: string;
  readonly form: "object" | "union";
  readonly field: string;
}

/**
 * Check a `by <field>` clause, returning `theta/parse/by-on-object-schema`
 * when the clause sits on a one-variant declaration or a non-discriminated
 * union — an object body, a right-hand side of fewer than two arms, or a
 * two-or-more-arm union not every arm of which is an object schema (see
 * `ByClauseDecl.form`). Returns `undefined` for a right-hand side of two or
 * more object-schema arms. The caller withholds this diagnostic when the
 * declaration's own arm walk already pushed an error-severity diagnostic (an
 * unresolved name, a reserved keyword, unspellable text), so that fault keeps
 * its own code alone rather than drawing a second diagnostic for the same
 * written mistake.
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
