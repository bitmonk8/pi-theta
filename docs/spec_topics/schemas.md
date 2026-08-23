# Schema Declarations

A `schema` declaration introduces a named type. Two forms:

## Object schema

`schema X { ... }`:

```theta
schema Author {
  name: string,
  role: string,
  experience_years: integer,
}
```

Fields are comma-separated; the trailing comma is optional. Field names are identifiers; field types are any expression from the [Type System](./type-system.md) grammar. Every declared field is **required** (the lowered JSON Schema's `required` lists every property; `additionalProperties: false` is always emitted). Optional fields are expressed as `T | null` — there is no `field?: T` shorthand. The non-existence and the explicit-`null` cases are conflated, matching strict-mode provider behaviour. A field type whose text derives from no `Type` production is `theta/parse/schema-type-not-expression`.

A `schema X { }` declaration with no fields is `theta/parse/empty-schema-body`: *`"'X' has no fields; an empty schema cannot be validated."`* Empty bodies have no use case: the lowered `{type:"object", properties:{}, required:[], additionalProperties:false}` shape accepts only the empty object `{}` and rejects every non-empty object, so no informative payload satisfies it — almost certainly not what the author intended. A body whose field capture derives at least one field and then reaches a token from which no further field derives — the field-name position holding neither an identifier nor a keyword, an `as` rename's wire name holding no string literal, or a field name with no following `:` — is `theta/parse/malformed-schema-field`, anchored at that offending token; the fields already derived are retained, so the declaration's other checks run against them. A body whose field capture derives at least one field and then reaches end of input with no closing `}` ahead is `theta/parse/schema-body-unclosed`, anchored at the body's opening `{` — the mirror, for the object body, of the `fn` parameter list's own unclosed-list rule ([Grammar Appendix — `fn` declarations](./grammar.md#fn-declarations)); the fields already derived are retained there too.

### Wire-name renaming

A field declaration may attach an explicit wire name with `as "WireName"` between the field identifier and its type:

```theta
schema ExternalUser {
  first_name as "FirstName": string,
  last_name  as "LastName":  string,
  age:                       integer,    // no rename — wire name is "age"
  ref_url    as "$ref":      string,     // arbitrary JSON property names are fine
}
```

Theta-side, the field is accessed, constructed, and pattern-matched as the theta identifier (`first_name`) — every other corner of the language sees only that identifier, and the lowercase-first rule still applies to it. The wire name appears in only two places:

- the lowered JSON Schema's `properties` and `required` keys (the schema handed to providers), and
- the JSON the runtime validates against and constructs (model output, `invoke` argument lowering).

The runtime translates between theta-side and wire-side names at the validation boundary; theta code never references the wire name directly. This is the only mechanism for expressing schemas whose property names are not theta-identifier-compatible — PascalCase (`"FirstName"`), special-character (`"@type"`, `"$ref"`), kebab-case (`"first-name"`), or reserved-keyword (`"if"`, `"for"`) names — and is what makes theta usable as a contract layer over third-party JSON Schemas.

Rules:

- The wire name is a single non-empty string literal (single- or double-quoted, no interpolation, escape sequences as in any other string literal).
- Two fields in the same schema cannot share a wire name. A wire name cannot collide with another field's theta name in the same schema. Either is `theta/parse/wire-name-collision`.
- A redundant rename whose wire name equals the theta name (`field_name as "field_name": T`) is `theta/parse/redundant-wire-name` (warning, not error).
- For discriminated unions, detection runs on the *wire* name (it inspects the lowered schema). The explicit form `by <field>` accepts the theta-side name — the only name visible in code — and the lowering resolves it to each variant's wire name.

The same `as` keyword is used by imports (`import { X as Y }`) and field wire-name renames; both read as "this thing, known outside as that name."

## Type-alias / union schema

`schema X = ...`:

```theta
schema Severity = "low" | "medium" | "high"   // string-literal union (an enum-as-alias)
schema StringOrNumber = string | number       // primitive union
schema Animal = Cat | Dog | Lizard            // discriminated object union
```

The `=` form is a top-level type alias. It composes with every shape from the type grammar: literal unions, primitive unions, object unions (discriminated; see below), and references to other named types.

The right-hand side is exactly an `AliasRhs` — one `Type`, or two or more separated by a single `|` ([Grammar Appendix — `schema X by <field>`](./grammar.md#schema-x-by-field)). An arm whose text derives from no `Type` production at all is `theta/parse/schema-type-not-expression`. Two of the arrangements that production does not derive are `theta/parse/malformed-alias-rhs`: an empty arm position (`schema X = Cat |`, `schema X = | Cat`), and a boundary token of one of these kinds — an identifier, a keyword, a string or number literal, the query-template `@`, a bare backtick template, `(`, `[`, `!`, or a unary-negation `-` — sitting on the same source line as the right-hand side's last token (`schema X = Cat Cat`, `schema X = -1`, `schema X = Cat (1)`). The code is the whole of the disposition — the declaration still records the arms it captured, and a severed residue keeps the disposition it already had in statement position: it parses as the statement it spells when it spells one (`schema X = Cat Cat`), and is discarded unreported when it spells none (`schema X = Cat else`). A right-hand side that yields no arm at all is `theta/parse/empty-schema-body`. A token on the next source line is not residue on either of two grounds: when no continuation trigger holds at the end of the declaration's line, the newline closes the declaration ([Grammar Appendix — Newline continuation](./grammar.md#newline-continuation)); when a trailing trigger holds so that the newline separates nothing (`schema X = array<integer>` with `let a = 1` on the next line), the right-hand side still ends at its last arm, ahead of that line's first token.

The rule is that boundary token and no wider. Three arrangements the same production also fails to derive keep the disposition they already have, and this code does not reach them: a stray `,`, `)`, `=` or `}` at that boundary is `theta/parse/unsupported-feature` (`schema X = Cat, Dog`, `schema X = Cat )`, `schema X = Cat = 1`, `schema X = Cat }`); a `{` there is `theta/parse/bare-object-literal` (`schema X = Cat { a: "x" }`); and an operator with no operand behind it (`schema X = Cat +`, `schema X = string +`) is absorbed into the arm rather than left at the boundary, so no boundary token remains for `theta/parse/malformed-alias-rhs` to name — the arm itself, `Cat+` or `string+`, derives from no `Type` production and is `theta/parse/schema-type-not-expression`.

## Enum declarations

`enum X { ... }`:

```theta
enum Severity {
  Low,
  Medium,
  High,
}
```

Variant names are PascalCase identifiers. By default, the variant name is the string value the model produces (`Low` → `"Low"`). Explicit values override that mapping:

```theta
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

Variants are comma-separated; trailing comma optional. `enum` is **top-level only** — there is no inline `enum["a", "b"]` form (`theta/parse/inline-enum`). For inline enumerations use literal-union: `severity: "low" | "medium" | "high"`. theta 1.0 enums carry **string values only** (no numeric or boolean variant values, no payload-carrying variants — `theta/parse/non-string-enum-value`); duplicate explicit values across variants are `theta/parse/duplicate-enum-value`. Two variants in the same `enum` that share an identifier — regardless of whether either carries an explicit value — are `theta/parse/duplicate-enum-variant-name`. The name-duplication check runs before the value-duplication check, so both `enum X { Low, Low }` (implicit values that would both lower to `"Low"`) and `enum X { Low = "a", Low = "b" }` (distinct explicit values) fail on the name collision rather than on an implicit-value collision; `theta/parse/duplicate-enum-value` remains reserved for the orthogonal case of distinct names sharing one explicit value (`enum X { Low = "x", High = "x" }`). For richer variants use the `schema X = A | B` form with object schemas. An `enum X { }` declaration with no variants is `theta/parse/empty-enum-body`: *`"'X' has no variants; an empty enum cannot be validated."`* The would-be lowering (`{type:"string", enum:[]}`) is invalid JSON Schema 2020-12 (the `enum` array must be non-empty) and would be rejected by AJV at compile time regardless. A variant list that has captured at least one variant and then reaches end of input with no closing `}` is `theta/parse/enum-body-unclosed`, ranged on the body's opening `{`; the variants already captured are retained on the declaration.

### Variant access

A specific variant is referenced as `Enum.Variant` (e.g., `Severity.High`). The expression evaluates to the variant's underlying string value (the explicit RHS, or the variant name verbatim when no RHS is given) but is statically typed as `Enum`. `Enum.Variant` is the recommended form whenever the value is named in code — type-aware and refactor-safe — over comparing against the bare string literal. Unknown-variant references (`Severity.Critical` when no such variant exists) are `theta/parse/unknown-variant`.

## Discriminated unions

A `schema X = A | B | C` whose variants are all object schemas is a discriminated union; the discriminator field is normally **detected implicitly**. The detected field must:

1. Be present in every variant.
2. Be a single **string** literal type in every variant (one literal value per variant; not a literal-union).
3. Have a unique value across the variants.

Numeric and boolean literal discriminators are rejected in theta 1.0 (`theta/parse/non-string-discriminator`): provider grammar-constrained decoders are only validated against string `const`, and non-string tags degrade decoding quality — exactly the failure mode the discriminator-required rule was introduced to avoid. Authors needing a numeric or boolean tag should wrap it as a string: `kind: "v1"` rather than `kind: 1`. The rule applies equally to implicit detection and to the explicit `by <field>` form below — wire-renamed discriminator fields (`kind as "Kind": "v1"`) keep the string-literal constraint on the *value*; the rename does not interact.

If exactly one field qualifies, it is the discriminator. If multiple qualify, `theta/parse/ambiguous-discriminator`: *`"ambiguous discriminator for X; candidates: <fields>. Declare explicitly with 'by <field>'."`* If none qualify, `theta/parse/missing-discriminator`: *`"X is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'."`* Discriminator-less object unions are rejected because they degrade structured-output quality at every major provider.

The explicit form overrides detection:

```theta
schema Animal by species = Cat | Dog | Lizard
```

Where the named field resolves in every variant, its type must satisfy property 2 above — a single string literal per variant, not a literal-union — the same way the top-level rule and the uniqueness rule already bind a named field; a resolved field that is not a single literal is `theta/parse/non-literal-discriminator`. Excluded from this rule (a clarification, not an added exception): an occurrence whose field type is an empty inline object (`{}`) is already `theta/parse/empty-schema-body`, and that refusal fires alone rather than also drawing this row — its verdict would otherwise be derived from text an earlier rule already refused. The `by <field>` clause is admitted **only** on the union form (the alternative beginning with `=`). A `schema X by f { ... }` declaration with an object body is `theta/parse/by-on-object-schema`: object schemas have one variant by definition and the discriminator concept does not apply. The full grammar for the schema declaration shapes that admit `by` lives in [Grammar Appendix — `schema X by <field>`](./grammar.md#schema-x-by-field).

Duplicate discriminator values across variants are `theta/parse/duplicate-discriminator-value`. The discriminator field must live at the **top level** of each variant; nested discriminators (`kind: { type: "x" }`) are `theta/parse/nested-discriminator`. "Nested" names a genuinely nested, well-formed group — an occurrence whose own field type is an empty inline object (`{}`) declares no field at any level and is not this case: it is already `theta/parse/empty-schema-body`, and that refusal fires alone.

Mixed unions — `string | Author`, `Author | null` — are not discriminated; they lower as plain `anyOf` (or, when all arms are primitives, as the multi-type-array form `{"type": [...]}`).

## Recursion

Any reference to a named schema lowers to `$ref` against the file's `$defs`. Self- and mutual recursion are supported transparently — authors don't write `$defs` or `$ref`:

```theta
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

Cycle detection extends to pure type aliases. A `schema X = ...` whose right-hand side reduces to `X` itself — directly (`schema X = X`) or transitively through other aliases (`schema X = Y; schema Y = X`) — is `theta/parse/type-alias-cycle` with the cycle path printed (*`"type-alias cycle: X → Y → X"`*, mirroring the import- and invocation-cycle diagnostics in [Imports](./imports.md) and [Invocation](./invocation.md)). Cycles that pass through at least one object-schema hop remain legal: each hop crosses a `$ref` against `$defs`, and the runtime data depth bounds termination. The alias-cycle detector runs after schema-name resolution but before lowering.
