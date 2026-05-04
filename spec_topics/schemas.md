# Schema Declarations

A `schema` declaration introduces a named type. Two forms:

**Object schema** — `schema X { ... }`:

```loom
schema Author {
  name: string,
  role: string,
  experience_years: integer,
}
```

Fields are comma-separated; the trailing comma is optional. Field names are identifiers; field types are any expression from the [Type System](./type-system.md) grammar. Every declared field is **required** (the lowered JSON Schema's `required` lists every property; `additionalProperties: false` is always emitted). Optional fields are expressed as `T | null` — there is no `field?: T` shorthand. The non-existence and the explicit-`null` cases are conflated, matching strict-mode provider behaviour.

**Wire-name renaming.** A field declaration may attach an explicit wire name with `as "WireName"` between the field identifier and its type:

```loom
schema ExternalUser {
  first_name as "FirstName": string,
  last_name  as "LastName":  string,
  age:                       integer,    // no rename — wire name is "age"
  ref_url    as "$ref":      string,     // arbitrary JSON property names are fine
}
```

Loom-side, the field is accessed, constructed, and pattern-matched as the loom identifier (`first_name`) — every other corner of the language sees only that identifier, and the lowercase-first rule still applies to it. The wire name appears in only two places:

- the lowered JSON Schema's `properties` and `required` keys (the schema handed to providers), and
- the JSON the runtime validates against and constructs (model output, `invoke` argument lowering).

The runtime translates between loom-side and wire-side names at the validation boundary; loom code never references the wire name directly. This is the only mechanism for expressing schemas whose property names are not loom-identifier-compatible — PascalCase (`"FirstName"`), special-character (`"@type"`, `"$ref"`), kebab-case (`"first-name"`), or reserved-keyword (`"if"`, `"for"`) names — and is what makes loom usable as a contract layer over third-party JSON Schemas.

Rules:

- The wire name is a single non-empty string literal (single- or double-quoted, no interpolation, escape sequences as in any other string literal).
- Two fields in the same schema cannot share a wire name. A wire name cannot collide with another field's loom name in the same schema. Either is `loom/parse/wire-name-collision`.
- A redundant rename whose wire name equals the loom name (`field_name as "field_name": T`) is `loom/parse/redundant-wire-name` (warning, not error).
- For discriminated unions, detection runs on the *wire* name (it inspects the lowered schema). The explicit form `by <field>` accepts the loom-side name — the only name visible in code — and the lowering resolves it to each variant's wire name.

The same `as` keyword is used by imports (`import { X as Y }`) and enum variant explicit values (`Low = "low"`); the surface stays consistent.

**Type-alias / union schema** — `schema X = ...`:

```loom
schema Severity = "low" | "medium" | "high"   // string-literal union (an enum-as-alias)
schema StringOrNumber = string | number       // primitive union
schema Animal = Cat | Dog | Lizard            // discriminated object union
```

The `=` form is a top-level type alias. It composes with every shape from the type grammar: literal unions, primitive unions, object unions (discriminated; see below), and references to other named types.

**Enum declarations** — `enum X { ... }`:

```loom
enum Severity {
  Low,
  Medium,
  High,
}
```

Variant names are PascalCase identifiers. By default, the variant name is the string value the model produces (`Low` → `"Low"`). Explicit values override that mapping:

```loom
enum Severity {
  Low = "low",
  Medium = "medium",
  High = "high",
}

enum ErrorCode {
  NotFound = "ERR_404",
  Forbidden = "ERR_403",
}
```

Variants are comma-separated; trailing comma optional. `enum` is **top-level only** — there is no inline `enum["a", "b"]` form (`loom/parse/inline-enum`). For inline enumerations use literal-union: `severity: "low" | "medium" | "high"`. V1 enums carry **string values only** (no numeric or boolean variant values, no payload-carrying variants — `loom/parse/non-string-enum-value`); duplicate explicit values across variants are `loom/parse/duplicate-enum-value`. For richer variants use the `schema X = A | B` form with object schemas.

**Variant access.** A specific variant is referenced as `Enum.Variant` (e.g., `Severity.High`). The expression evaluates to the variant's underlying string value (the explicit RHS, or the variant name verbatim when no RHS is given) but is statically typed as `Enum`. `Enum.Variant` is the recommended form whenever the value is named in code — type-aware and refactor-safe — over comparing against the bare string literal. Unknown-variant references (`Severity.Critical` when no such variant exists) are `loom/parse/unknown-variant`.

**When to use which.** Reach for `enum X { ... }` when the values are a closed conceptual set referenced by name from multiple places **and** you want descriptions per variant. Reach for literal-union (`"low" | "medium" | "high"`) when the values are inline, ad hoc, or you don't want a separate top-level declaration. Both lower to `{"enum": [...]}` — the choice is purely about the surface ergonomics.

**Discriminated unions.** A `schema X = A | B | C` whose variants are all object schemas is a discriminated union; the discriminator field is normally **detected implicitly**. The detected field must:

1. Be present in every variant.
2. Be a single literal type in every variant (one literal value per variant; not a literal-union).
3. Have a unique value across the variants.

If exactly one field qualifies, it is the discriminator. If multiple qualify, `loom/parse/ambiguous-discriminator`: *`"ambiguous discriminator for X; candidates: <fields>. Declare explicitly with 'by <field>'."`* If none qualify, `loom/parse/missing-discriminator`: *`"X is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'."`* Discriminator-less object unions are rejected because they degrade structured-output quality at every major provider.

The explicit form overrides detection:

```loom
schema Animal by species = Cat | Dog | Lizard
```

Duplicate discriminator values across variants are `loom/parse/duplicate-discriminator-value`. The discriminator field must live at the **top level** of each variant; nested discriminators (`kind: { type: "x" }`) are `loom/parse/nested-discriminator`.

Mixed unions — `string | Author`, `Author | null` — are not discriminated; they lower as plain `anyOf` (or, when all arms are primitives, as the multi-type-array form `{"type": [...]}`).

**Recursion.** Any reference to a named schema lowers to `$ref` against the file's `$defs`. Self- and mutual recursion are supported transparently — authors don't write `$defs` or `$ref`:

```loom
schema Tree {
  value: number,
  children: array<Tree>,            // self-recursion
}

schema Person {
  name: string,
  spouse: Person | null,            // self-recursion via union
  pets: array<Animal>,              // mutual recursion
}

schema Animal {
  species: string,
  owner: Person | null,
}
```

The [Schema Subset](./schema-subset.md)'s depth ceiling applies to runtime JSON document depth, not to the schema graph — a recursive schema definition is fine; recursive *data* is bounded by the runtime cap.
