# Reference — Schema subset

The JSON-Schema subset Theta emits and enforces, plus the lowering algorithm,
depth enforcement, and the canonical schema hash. See [Type
system](./type-system.md) for the compatibility relation, [Grammar](./grammar.md)
for `schema`/`enum` productions, [Diagnostics](./diagnostics.md) for codes.

## The subset

Theta's `schema` keyword targets a fixed, theta-defined subset of JSON Schema, not
the full standard. The normative subset:

- **Types**: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`.
- **Composition**: `anyOf` only. `oneOf`, `allOf`, `not`, `if`/`then`/`else` are
  rejected at parse time.
- **Validation**: `enum`, `const`.
- **Objects**: `properties`, `required` (must list *every* declared property),
  `additionalProperties: false` (always emitted).
- **Arrays**: `items` (single subschema). Bare `array` is not a Theta type; use
  `array<T>`.
- **Reuse**: `$defs` + `$ref`, including recursive references. Generated
  automatically by the lowering pass; authors do not write `$defs`/`$ref`.
- **Nullability**: expressed as a union with `null` (`string | null` →
  `{"type": ["string", "null"]}`). `nullable: true` is not emitted.
- **Discriminated unions**: `anyOf` of object schemas distinguished by a
  single-literal discriminator field.
- **Depth**: ≤ 5 levels of runtime JSON-document nesting (not schema-graph depth).
- **Draft**: JSON Schema Draft 2020-12.

Explicitly **not** supported (rejected at parse time): `pattern`, `format`,
`minLength`/`maxLength`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`,
`multipleOf`, `minItems`/`maxItems`, `uniqueItems`,
`contains`/`minContains`/`maxContains`, `patternProperties`, `propertyNames`,
`minProperties`/`maxProperties`, `unevaluatedProperties`, `unevaluatedItems`,
`dependentRequired`, `dependentSchemas`, `nullable`.

## Schema declarations

### Object schema

`schema X { ... }`. Fields comma-separated (trailing comma optional); every
declared field is **required** (lowered `required` lists every property;
`additionalProperties: false` always emitted). Optional fields are `T | null` (no
`field?: T`; non-existence and explicit-`null` are conflated). Empty body is
`theta/parse/empty-schema-body`.

**Wire-name renaming.** `field as "WireName": T` between identifier and type. The
theta-side name is used everywhere in code; the wire name appears only in the
lowered `properties`/`required` keys and in validated/constructed JSON. Rules: a
single non-empty string literal; two fields cannot share a wire name and a wire
name cannot collide with another field's theta name
(`theta/parse/wire-name-collision`); a redundant rename (`field_name as "field_name"`)
is `theta/parse/redundant-wire-name` (warning). For discriminated unions, detection
runs on the wire name; the explicit `by <field>` form accepts the theta-side name.

### Type-alias / union schema

`schema X = ...` is a top-level type alias: literal unions, primitive unions,
object unions (discriminated), and references to other named types. The
right-hand side is exactly one type, or two or more separated by a single
`|`. An arm whose text derives from no `Type` production is
`theta/parse/schema-type-not-expression`. `theta/parse/malformed-alias-rhs`
reports two arrangements: an empty arm position (`schema X = Cat |`,
`schema X = | Cat`), and a boundary token — an identifier, a keyword, a
string or number literal, `@`, a backtick template, `(`, `[`, `!`, or a
unary-negation `-` — on the same source line as the right-hand side's last
token (`schema X = Cat Cat`, `schema X = -1`). Other boundaries keep the
disposition they already have: a stray `,`, `)`, `=` or `}` is
`theta/parse/unsupported-feature`, a `{` is `theta/parse/bare-object-literal`,
and an operator with no operand behind it (`schema X = Cat +`) is absorbed
into the arm, leaving no boundary token to report — the arm itself is
`theta/parse/schema-type-not-expression`. A right-hand side that yields no
arm at all is `theta/parse/empty-schema-body`.

### Enum declarations

`enum X { ... }`. Variant names PascalCase; by default the variant name is the
model-produced string (`Low` → `"Low"`); explicit values override
(`Low = "low"`). Top-level only (no inline `enum["a", "b"]` —
`theta/parse/inline-enum`; use a literal union). String values only
(`theta/parse/non-string-enum-value`). Duplicate explicit values across variants:
`theta/parse/duplicate-enum-value`. Two variants sharing an identifier:
`theta/parse/duplicate-enum-variant-name` (name check runs first). Empty body:
`theta/parse/empty-enum-body`. `Enum.Variant` evaluates to the underlying string
value but is statically typed `Enum`; unknown variant is
`theta/parse/unknown-variant`.

### Discriminated unions

A `schema X = A | B | C` of object schemas. The discriminator field is normally
detected implicitly; it must be present in every variant, a single **string**
literal type per variant, and unique across variants. Numeric/boolean
discriminators are rejected (`theta/parse/non-string-discriminator`). Exactly one
qualifying field is the discriminator; multiple →
`theta/parse/ambiguous-discriminator`; none → `theta/parse/missing-discriminator`.
Explicit form `schema Animal by species = Cat | Dog | Lizard` overrides detection
(`by` on an object body is `theta/parse/by-on-object-schema`). Duplicate
discriminator values: `theta/parse/duplicate-discriminator-value`; a
non-top-level discriminator: `theta/parse/nested-discriminator`. Mixed unions
(`string | Author`, `Author | null`) are not discriminated — they lower as plain
`anyOf` (or the multi-type-array form when all arms are primitives).

### Recursion

Any named-schema reference lowers to `$ref` against `$defs`; self- and mutual
recursion are supported transparently. The depth ceiling applies to runtime JSON
data depth, not the schema graph. Pure-alias cycles (`schema X = X`, or transitive
through aliases) are `theta/parse/type-alias-cycle`; cycles through at least one
object-schema hop remain legal.

## Depth enforcement

`Depth ≤ 5` is a property of the runtime JSON value. AJV has no `maxDepth`
keyword, so the cap is policed by the validator service alongside AJV.

**Counting algorithm.** A scalar has depth `1`; empty `{}`/`[]` has depth `1`; a
non-empty object/array has `1 + max(depth(child))`. `anyOf` arms are not levels
(depth is measured against the materialised value). Cap is `depth ≤ 5`.

Worked examples: `42` → 1 (accepted); `{"a": 1}` → 2 (accepted);
`{"a": [{"b": 1}]}` → 4 (accepted); `{"a": {"b": {"c": {"d": {"e": 1}}}}}` → 6
(rejected).

**Enforcement points.** The walk runs before AJV at every site where a
Theta-declared schema is validated against runtime JSON: (1) typed-query response;
(2) tool-call args, model-driven; (3) tool-call args, code-driven; (4) `params`
validation at theta invocation; (5) `invoke<T>` return value.

**Error shape.** A depth violation always carries `schema_keyword: "maxDepth"`,
the canonical message `"JSON document depth exceeds 5"`, and `cause:
"schema_validation"`. `"maxDepth"` is the only `schema_keyword` value Theta emits
that is not a literal AJV keyword. Routing is boundary-dependent (per the ceiling
#4 table in [Hard ceilings](./hard-ceilings.md)):

| Enforcement point | Destination | Surface |
|---|---|---|
| #1 Typed-query response | theta code | `Err(QueryError { kind: "validation", cause: "schema_validation", validation_errors: [{ schema_keyword: "maxDepth", ... }], ... })` |
| #2 Tool-call args, model-driven | the model | tool-error result fed back as next user turn; round counts against `tool_loop.max_rounds`; not `ModelToolError` |
| #3 Tool-call args, code-driven | theta code | `Err(CodeToolError { cause: "validation", validation_errors: [...], ... })` |
| #4 `params` validation | depends on call site | `invoke(...)`: `Err(InvokeInfraError { cause: "validation", ... })`. Slash-load: routes through ceiling #3's no-retry classification (binder AJV-on-`args`); not an evaluation outcome |
| #5 `invoke<T>` return value | invoke parent | `Err(InvokeInfraError { cause: "return_validation", ... })` |

Typed-query respond-repair applies only at row #1; the other rows surface without
retry (row #2 retries naturally on the model's next turn). The walk runs on the
post-decode JSON value; a response that fails to parse as JSON is a JSON-parse
validation failure, not a depth failure. `params` restricted to primitives /
`array<T>` over primitives are structurally bounded at depth 2 (walk is a no-op,
still installed).

## Lowering algorithm

Each theta file is lowered to a JSON Schema document at parse time:

1. **Collects every named schema** (top-level + transitively imported from
   `.thetalib`) into `$defs/<Name>`.
2. **Hoists anonymous inline object schemas** (`{ field: T }`) into `$defs` under
   `__inline_<slug>`, where `<slug>` is the schema slug of the lowered fragment.
   Two inline schemas collapse to one entry only when their lowered fragments are
   byte-identical (verified via the slug-collision byte-equality check); a slug
   match with non-byte-identical fragments is `theta/load/schema-slug-collision`.
3. **Emits per type form:** primitive → `{ "type": "<primitive>" }`; named/inline
   reference → `{ "$ref": "#/$defs/<Name>" }`; `array<T>` →
   `{ "type": "array", "items": <T-lowered> }`; object →
   `{ "type": "object", "properties": {...wire names...}, "required": [...every wire name...], "additionalProperties": false }`;
   literal → `{ "const": <value> }`; enum / string-literal union →
   `{ "type": "string", "enum": [...wire values...] }`.
   - **SUBS-1** (union of primitives only): a union all of whose arms are
     primitive (treating `null` as primitive) lowers to `{ "type": [...] }`; a
     union with any non-primitive arm lowers to `{ "anyOf": [...] }`. Vectors:
     `string | number` → `{ "type": ["string", "number"] }`; `string | null` →
     `{ "type": ["string", "null"] }`; `string | Author` →
     `{ "anyOf": [{ "type": "string" }, { "$ref": "#/$defs/Author" }] }`.
   - Discriminated object union → `{ "anyOf": [<A>, <B>] }`; the `discriminator`
     keyword is not emitted (each variant carries its own `const`-typed field).
   - `Result<T, E>` is not lowerable (`theta/parse/result-in-schema-position`
     fires before lowering).
   - **Array element order** — `required`, `enum`, the `{ "type": [...] }`
     primitive-union form, and `anyOf` all emit in theta-source declaration order
     (with `"null"` last whenever the union admits it).
4. **Per-query schema document** is built lazily: the query's response schema is
   the root, and only transitively-reachable `$defs` are copied in (unused pruned).
   Each reachable def lands at the document's *top-level* `$defs` regardless of
   how deeply the referencing fragment nests it, so every emitted root-absolute
   `$ref: "#/$defs/<Name>"` resolves; boundary annotations (`@<…>` typed query,
   `invoke<…>` / `subagent fn` return) assemble through the same step.
5. **Per-schema sidecar** captures a *wire-name translation* map and a
   *named-enum positions* map (keyed by JSON Pointer, valued by declaring-enum
   theta-side name; anonymous string-literal-union positions absent). The inbound
   translation pass reads the latter to reattach enum tags.
6. **Discriminator detection** runs on the lowered `anyOf` form (parse-time sanity
   check; no extra marker emitted).

Lowering is a pure function of the parsed source, performed once per file load.

## Canonical schema hash

The recipe that content-addresses a lowered fragment; its 16-hex output is the
**schema slug**.

1. **Input** — the lowered JSON Schema fragment (not the theta-side AST).
2. **Canonical form** — deterministic UTF-8 JSON: object keys sorted by Unicode
   code-point order; no insignificant whitespace; embedded numeric literals
   serialised by the `integer`/`number` rendering algorithm (e.g. `1e21` →
   `1000000000000000000000`, `42.0` → `42`, `-0` → `0`); array elements left in
   lowering order (keys sorted, arrays never reordered); strings escaped per
   RFC 8259 minimal-escape rules.
3. **Digest** — SHA-256 of the canonical-form bytes.
4. **Schema slug** — first 16 lowercase hex characters (64 bits).

**SUBS-2** (terminology): use `schema slug` (or bare `slug`); avoid `schema hash`,
`schema-hash`, `sha12`, `lowered-schema hash`, `lowered-schema content hash`.

**Synthesised names** (source of truth for the full set): `__inline_<slug>`
(hoisted inline object schemas); `__theta_respond_<slug>` (typed-query one-shot
tool); `__theta_callee_<slug>__<post-rename-name>` (prompt-mode registered tool of
a `.theta` callee); `__theta_bind_<slug>` (binder's structured-output tool).

The full set is reserved against author-introduced names. At a parsed `import` /
`export` specifier's local binding (with or without a trailing `from` clause) —
the one name-introducing position the [Grammar](./grammar.md#identifiers) casing
rule does not close — a matching binding is
`theta/parse/import-reserved-synthesised-name`.

Canonical-form key sorting is independent of the emitted `$defs` property order:
the hash sorts keys for reproducibility; the emitted schema retains theta-source
field order.

**Schema-slug collision posture.** Because the slug is a 64-bit SHA-256
truncation, two distinct fragments can produce the same slug. Every slug-keyed
cache/dedup table verifies byte-equality of canonical-form bytes on a slug match
before treating the two as the same fragment; on a byte-mismatch it surfaces a
diagnostic and disambiguates rather than aliasing. The three slug-keyed sites and
their diagnostics: the `__inline_<slug>` `$defs` dedup →
`theta/load/schema-slug-collision`; the per-query AJV compiled-validator cache →
`theta/runtime/validator-cache-collision`; the prompt-mode `pi.registerTool`
registration cache → `theta/runtime/registration-cache-collision` (with a
counter-suffixed disambiguation).

## Provenance

- Subset enumeration, depth enforcement (counting algorithm, enforcement points,
  boundary table), lowering algorithm (SUBS-1, sidecar, array element order),
  canonical schema hash (SUBS-2, synthesised names, collision posture):
  `docs/spec_topics/schema-subset.md`.
- Object/alias/enum schema declarations, wire-name renaming, discriminated unions,
  recursion: `docs/spec_topics/schemas.md`.
- Implementation confirmation: `MAX_JSON_DEPTH = 5`
  (`src/runtime/depth-walk.ts:40`); `DEPTH_VIOLATION_SCHEMA_KEYWORD = "maxDepth"`,
  `DEPTH_VIOLATION_MESSAGE = "JSON document depth exceeds 5"`
  (`src/runtime/depth-walk.ts`).
