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
- **Depth**: ≤ 5 levels of nesting at runtime (the JSON document depth, not the schema graph). Recursive schema definitions are fine; recursive *data* is bounded by the runtime cap. (OpenAI's stricter cap is treated as the shared ceiling.) The counting algorithm and the enforcement boundaries are pinned down in [Depth Enforcement](#depth-enforcement) below.
- **Draft**: JSON Schema Draft 2020-12 (required by Anthropic; compatible with OpenAI).

Explicitly **not** supported by `schema`, and rejected at parse time: `pattern`, `format`, `minLength`/`maxLength`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, `multipleOf`, `minItems`/`maxItems`, `uniqueItems`, `contains`/`minContains`/`maxContains`, `patternProperties`, `propertyNames`, `minProperties`/`maxProperties`, `unevaluatedProperties`, `unevaluatedItems`, `dependentRequired`, `dependentSchemas`, `nullable`.

Constraints the subset cannot express (string patterns, numeric bounds, array length, etc.) are out of scope for `schema` and belong in code-side validation if needed.

## Depth Enforcement

The `Depth ≤ 5` ceiling above is a property of the **runtime JSON value**, not of the schema graph. AJV has no `maxDepth` keyword (the JSON Schema 2020-12 vocabulary omits it), so the cap is policed by the validator service alongside AJV rather than by the lowered schema document itself.

**Counting algorithm.**

- A scalar (`string`, `number`, `integer`, `boolean`, `null`) has depth `1`.
- An empty object `{}` or empty array `[]` has depth `1`.
- A non-empty object or array has depth `1 + max(depth(child))` over its members or elements.
- `anyOf` arms are not levels: depth is measured against the **materialised** value at runtime (one arm exists; the others do not).
- The cap is `depth ≤ 5`.

Worked examples:

- `42` → depth `1` (accepted).
- `{"a": 1}` → depth `2` (accepted).
- `{"a": [{"b": 1}]}` → depth `4` (accepted).
- `{"a": {"b": {"c": {"d": {"e": 1}}}}}` → depth `6` (rejected).

**Enforcement point.** The depth check lives in the `SchemaValidator` service (the same component that owns the AJV cache; see [Implementation Notes — Runtime](./implementation-notes.md#runtime)). It runs at every site where a Loom-declared schema is validated against runtime JSON:

1. **Typed-query response validation** — after the model's final assistant text is JSON-parsed and before the value is handed back to loom code (see [Query](./query.md)).
2. **Tool-call argument validation, model-driven** — after the model's `arguments` payload is JSON-decoded, before the tool body runs (see [Tool Calls](./tool-calls.md)).
3. **Tool-call argument validation, code-driven** — when loom code invokes `<name>(...)`, on the constructed argument value before encoding (see [Tool Calls](./tool-calls.md)).
4. **`params` validation at loom invocation** — whether bound via the binder or supplied directly by `invoke` (see [Frontmatter](./frontmatter.md)).
5. **`invoke<T>` return-value validation** — when `invoke<Schema>(...)` succeeds and the callee's return value is AJV-validated against `<Schema>` before propagation to the caller (see [Invocation — Typed return](./invocation.md)).

The walk runs **before** AJV at each site: it is a cheap fast-fail and avoids feeding pathologically deep payloads into the validator. Implementation is a recursive descent over the parsed JSON value with a depth counter; the first node whose depth would exceed `5` short-circuits and produces the failure.

**Error shape.** A depth violation always carries `schema_keyword: "maxDepth"` and the canonical message `"JSON document depth exceeds 5"` (the only `schema_keyword` value Loom emits that is not a literal AJV keyword; `query.md`'s `ValidationIssue.schema_keyword` enumeration is open), and always carries `cause: "schema_validation"` even though the depth walk short-circuits before AJV runs (see [Errors and Results — ValidationError](./errors-and-results.md)). The carrier shape and destination differ across the five enforcement points above; the routing class is **boundary-dependent**, not uniformly "recoverable `Err`". Per-boundary surfaces:

| Enforcement point | Destination | Surface |
|---|---|---|
| #1 Typed-query response | loom code | `Err(QueryError { kind: "validation", cause: "schema_validation", validation_errors: [{ schema_keyword: "maxDepth", path: <JSON Pointer to first too-deep node>, message: "JSON document depth exceeds 5" }], ... })` per [Errors and Results — ValidationError](./errors-and-results.md) |
| #2 Tool-call args, model-driven | the model | tool-error result fed back as the next user turn per [Query — Tool calls during a query](./query.md); the round counts against `tool_loop.max_rounds` and the loop continues. No `QueryError` reaches loom code unless the loop later exhausts under ceiling #2 — in particular, this row does **not** surface as `ModelToolError` (which covers tool-execution failures inside the loop, not validation failures the runtime synthesises before the tool body runs) |
| #3 Tool-call args, code-driven | loom code | `Err(CodeToolError { cause: "validation", validation_errors: [...], ... })` per [Tool Calls — Failures](./tool-calls.md) and [Errors and Results — CodeToolError](./errors-and-results.md) |
| #4 `params` validation | depends on call site | `invoke(...)`: `Err(InvokeInfraError { cause: "validation", ... })` per [Invocation — Failures](./invocation.md). Slash-load: routes through ceiling #3's no-retry classification (the binder's AJV-on-`args` arm at the [post-default-merge AJV validation](./binder.md#post-default-merge-ajv-validation) hook) and renders through the AJV-on-`args` row of [Slash-Command Argument Binding — Failure-mode templates](./binder.md#failure-mode-templates-normative); the row's `<ajv-summary>` placeholder carries this enforcement point's canonical issue (`<JSON-Pointer> JSON document depth exceeds 5`) per that table's depth-walk clause. Not an evaluation outcome, no `Result` value observable |
| #5 `invoke<T>` return value | calling loom | `Err(InvokeInfraError { cause: "validation", ... })` per [Invocation — Failures](./invocation.md) |

Because depth violations are `validation` failures, typed-query respond-repair follow-ups apply per [Query — Schema-validation respond-repair](./query.md) at the typed-query response boundary (#1); the depth walk re-runs on each follow-up's response. Respond-repair is not used at the other four boundaries: the model-driven tool-arg row (#2) re-tries naturally inside the loop on the model's next turn; the code-driven (#3), `params` (#4), and `invoke<T>` return (#5) rows surface to loom code (or to the operator) without retry. The full per-boundary routing-class table for ceiling #4 — including the slash-load arm of `params` that crosses into ceiling #3's load-time system-note routing — lives in [`spec.md` — Hard ceilings](../spec.md#hard-runtime-ceilings); this section's table mirrors it with the depth-walk-specific carrier details.

**Edge cases.**

- The depth walk runs on the **post-decode** JSON value, not on the raw assistant text. A response that fails to parse as JSON surfaces as the existing JSON-parse validation failure, not a depth failure.
- Depth applies to the whole validated value, including any nested `array<T>` and any inline-object subtree that the lowering pass hoisted via `__inline_<slug>` indirection. The indirection is purely a schema-side artefact; it does not change the runtime value's structure or its measured depth.
- For `params` whose declared types are restricted to primitives or `array<T>` over primitives, depth is structurally bounded at `2` and the walk is a no-op. The walk is still installed at the `params` boundary unchanged — a uniform implementation across all five sites means future widening of `params` types inherits the cap automatically.
- A schema graph cycle (e.g. `schema Tree { children: array<Tree> }`) is permitted at parse time; the cap fires only on data instances whose realised nesting exceeds `5`.

## Lowering Algorithm

Each loom file is lowered to a JSON Schema document at parse time. The lowering pass:

1. **Collects every named schema** declared at the top level of the file (and transitively imported from `.warp` files used by the file). Each becomes one `$defs/<Name>` entry.
2. **Hoists anonymous inline object schemas** (`{ field: T }` appearing in any type position) into `$defs` under a synthesised name `__inline_<slug>`, where `<slug>` is the schema slug of the *lowered* schema fragment, produced by the canonical schema hash recipe in [Canonical schema hash](#canonical-schema-hash) below. Two inline schemas that lower to byte-identical JSON Schema fragments resolve to one `$defs` entry, regardless of source-level cosmetic differences.
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

Lowering is purely a function of the parsed source (no runtime values), and is performed once per loom-file load. Validator caching is specified in [Implementation Notes — Runtime](./implementation-notes.md#runtime).

## Canonical schema hash

Several runtime sites need a stable, content-addressed identifier for a lowered schema fragment: the `__inline_<slug>` synthesised `$defs` keys produced by step 2 above, the `__loom_respond_<slug>` synthesised tool name used by the typed-query mechanism in [Pi Integration Contract](./pi-integration-contract.md) and [Implementation Notes — Runtime](./implementation-notes.md#runtime), and the per-query AJV compiled-validator cache key. All such sites use the **schema slug** produced by the **canonical schema hash** recipe defined here. The two terms are paired: "canonical schema hash" names the recipe (this section); "schema slug" names its 16-hex output (step 4 below). Spec prose elsewhere uses "schema slug" (or the bare form `slug` in placeholder positions) for the resulting value; the synonyms `schema hash`, `schema-hash`, `sha12`, `lowered-schema hash`, and `lowered-schema content hash` are drift to be avoided (the [Glossary](./glossary.md) entry pins the avoid-list). The recipe is part of the on-disk and on-wire contract — changing it is a breaking change for any cached artefact, fixture snapshot, or replayable provider payload — so the V1 spec pins it exactly.

1. **Input.** The hash is computed over the **lowered** JSON Schema fragment that would be emitted (i.e. the body of the `$defs` entry, or the lowered query response schema), *not* the loom-side AST. Hashing the lowered form is what makes the dedup property in step 2 above mechanical: two source-level inline schemas that lower to the same JSON Schema fragment produce the same slug.
2. **Canonical form.** Serialise the fragment to a deterministic UTF-8 JSON byte sequence:
   - object keys sorted by Unicode code-point (lexical) order;
   - no insignificant whitespace (no spaces, no newlines between tokens);
   - numeric literals in their JSON Schema integer/number form (no trailing zeros, no exponent unless necessary to represent the value);
   - strings escaped per RFC 8259 minimal-escape rules (only the characters JSON requires escaping; no gratuitous `\u` escapes for printable ASCII).
3. **Digest.** SHA-256 of the canonical-form bytes.
4. **Schema slug.** First 16 hex characters of the digest, lowercased — i.e. 64 bits of the digest. This gives a <1-in-10⁹ collision probability for thousands of distinct lowered schemas per loom file and keeps synthesised names short enough to read in error messages and `/tools` listings.
5. **Synthesised names.** `__inline_<slug>` for hoisted inline object schemas (e.g. `__inline_3f9a1c2b8d4e5076`); `__loom_respond_<slug>` for typed-query one-shot tools.

Note that the canonical-form key sorting used for hashing is independent of the property order in the emitted `$defs` entry. The hash sorts keys to make the digest reproducible; the emitted lowered schema retains the loom-source declaration order of fields (per the Object emission rule in step 3 above). Both invariants must hold simultaneously: changing source-level field order changes the emitted schema's property order but does *not* change the canonical hash, because the canonical form sorts keys before hashing.
