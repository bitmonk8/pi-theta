# Schema Subset

Loom's `schema` keyword does **not** target the full JSON Schema standard. It targets the **lowest common denominator of OpenAI Structured Outputs (strict mode) and Anthropic tool-use `input_schema` (strict mode)** — the intersection of what both providers' grammar-constrained decoders can enforce. The normative subset is:

- **Types**: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`.
- **Composition**: `anyOf` only. `oneOf`, `allOf`, `not`, `if`/`then`/`else` are rejected at parse time.
- **Validation**: `enum`, `const`.
- **Objects**: `properties`, `required` (must list *every* declared property), `additionalProperties: false` (always emitted).
- **Arrays**: `items` (a single subschema). Bare `array` is not a Loom type; use `array<T>`.
- **Reuse**: `$defs` + `$ref`, including recursive references. Generated automatically by the lowering pass; authors do not write `$defs` or `$ref` directly.
- **Nullability**: expressed as a union with `null` (e.g. a `string | null` Loom type lowers to `{"type": ["string", "null"]}` or an `anyOf` with `{"type": "null"}`). The non-standard `nullable: true` modifier is **not** emitted.
- **Discriminated unions**: `anyOf` of object schemas distinguished by a single-literal discriminator field. The Loom surface syntax (`schema X = A | B | C`, with implicit detection or explicit `by <field>`) is described in [Schema Declarations](./schemas.md).
- **Depth**: ≤ 5 levels of nesting at runtime (the JSON document depth, not the schema graph). Recursive schema definitions are fine; recursive *data* is bounded by the runtime cap. (OpenAI's stricter cap is treated as the shared ceiling.)
- **Draft**: JSON Schema Draft 2020-12 (required by Anthropic; compatible with OpenAI).

Explicitly **not** supported by `schema`, and rejected at parse time: `pattern`, `format`, `minLength`/`maxLength`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, `multipleOf`, `minItems`/`maxItems`, `uniqueItems`, `contains`/`minContains`/`maxContains`, `patternProperties`, `propertyNames`, `minProperties`/`maxProperties`, `unevaluatedProperties`, `unevaluatedItems`, `dependentRequired`, `dependentSchemas`, `nullable`.

Constraints the subset cannot express (string patterns, numeric bounds, array length, etc.) are out of scope for `schema` and belong in code-side validation if needed.

## Lowering Algorithm

Each loom file is lowered to a JSON Schema document at parse time. The lowering pass:

1. **Collects every named schema** declared at the top level of the file (and transitively imported from `.warp` files used by the file). Each becomes one `$defs/<Name>` entry.
2. **Hoists anonymous inline object schemas** (`{ field: T }` appearing in any type position) into `$defs` under a synthesised name `__inline_<hash>`, where `hash` is a stable structural hash of the schema's loom-side AST (sorted keys, normalised types). Two structurally identical inline schemas in the same file resolve to one `$defs` entry.
3. **Emits per type form:**
   - Primitive: `{ "type": "<primitive>" }`.
   - Named or inline schema reference: `{ "$ref": "#/$defs/<Name>" }`.
   - `array<T>`: `{ "type": "array", "items": <T-lowered> }`.
   - Object: `{ "type": "object", "properties": { ...wire names... }, "required": [...every wire name...], "additionalProperties": false }`.
   - Literal `"foo"` / `42` / `true` / `null`: `{ "const": <value> }`.
   - Enum (or string-literal union): `{ "type": "string", "enum": [...wire values...] }`.
   - Union of primitives only: `{ "type": ["a", "b", "null"] }` form preferred for readability; falls back to `anyOf` if any arm is non-primitive.
   - Discriminated object union (`schema X = A | B`): `{ "anyOf": [<A-lowered>, <B-lowered>] }`. The `discriminator` keyword from JSON Schema 2020-12 is *not* emitted (outside the strict subset); each variant carries its own `const`-typed discriminator field, and the runtime relies on `additionalProperties: false` plus the per-variant `const` to drive grammar-constrained decoding.
   - Mixed `anyOf` (e.g., `string | Author`): `{ "anyOf": [...] }`.
4. **Per-query schema document** is built lazily: when a typed query fires, the runtime extracts the query's response schema as the document root and copies in only the `$defs` entries transitively reachable from it. Unused `$defs` are pruned to keep request payloads small.
5. **Wire-name translation** is captured in a sidecar map per schema (`{ loom: "first_name", wire: "FirstName" }`) used by both the validation pass (post-decode) and the construction pass (pre-encode). The lowered JSON Schema only ever sees wire names.
6. **Discriminator detection** runs on the lowered `anyOf` form, examining each variant's `properties` for a single `const`-typed field that is unique across variants. Detection is a parse-time sanity check; the lowered schema has no extra discriminator marker.

Lowering is purely a function of the parsed source (no runtime values), and is performed once per loom-file load. Schema validators (AJV) are compiled once per lowered schema and reused across queries; the file watcher invalidates the cache on change.
