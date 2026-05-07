# V4 — Schemas, AJV pipeline, lowering

## V4a — AJV pipeline scaffold

- **Spec.** [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm), [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (schema-validation contract in [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime)).
- **Adds.** `SchemaValidator` service that satisfies the validator behavioural contract: one-pass multi-error reporting, no type conversion, no default-filling, in-document `$ref` only, and silent acceptance of any `format` keyword. Reference implementation uses AJV v8 (non-normative) with `strict: false`, `allErrors: true`, and `ajv-formats` registered. Compiled-schema cache keyed by schema slug (per [Schema Subset — Canonical schema hash](../spec_topics/schema-subset.md#canonical-schema-hash)).
- **Tests.** Cache hit on identical schema; cache miss on changed schema; AJV instance not shared across loom loads (no global state); `allErrors:true` returns every violation in one pass (fixture: object missing two required fields and one type-mismatched field → `errors.length === 3`); no type conversion (string `"1"` against `{type:"number"}` fails; data unchanged); no default-filling (schema with `default` does not mutate input); in-document `$ref` resolves; cross-document `$ref` rejected at compile time; unknown `format` keyword silently accepted (e.g. `{format:"uri"}` compiles and validates without warning); loom-shaped error translation deferred to V6j.
- **Deps.** H2.
- **Ships when.** Validator service can compile and validate against arbitrary JSON Schema documents.

## V4b — Object schema declaration and lowering

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (object form), [Grammar Appendix — `schema X by <field>`](../spec_topics/grammar.md#schema-x-by-field).
- **Adds.** `schema X { f: T, ... }` parsed; lowered to `$defs/X` with `required` listing every field, `additionalProperties: false`, properties in declaration order. The object-body shape does **not** admit a `by <field>` clause; `schema X by f { ... }` is `loom/parse/by-on-object-schema` (the explicit-discriminator form is reserved for the `=` union shape, finalised in V11d).
- **Tests.** Trailing comma optional; missing field rejected; `additionalProperties:false` always emitted; snapshot against `test/fixtures/schemas/object-basic.json`; `schema X by f { ... }` emits `loom/parse/by-on-object-schema`; `schema X { }` emits `loom/parse/empty-schema-body` with message `"'X' has no fields; an empty schema cannot be validated."`; constructing an object whose `: integer` field receives a `number`-typed expression emits `loom/parse/integer-narrowing`; a `: number` field accepting an `integer`-typed expression widens silently.
- **Deps.** V4a.
- **Ships when.** Schemas can be declared and compiled; nothing yet uses them; misuse of `by` on object bodies rejected with the documented diagnostic.

## V4c — Type-alias `schema X = T` for primitive unions

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (union/alias form).
- **Adds.** `schema X = T | U` lowered as multi-type-array `{type:[a,b]}` when all primitives, `anyOf` otherwise.
- **Tests.** `string | number` → multi-type-array; `string | null` → multi-type-array including `"null"`; `string | Author` → `anyOf`.
- **Deps.** V4b.
- **Ships when.** Primitive aliases compose.

## V4d — Literal types in schemas

- **Spec.** [Type System](../spec_topics/type-system.md) (literal types).
- **Adds.** `"foo"`, `42`, `true`, `false`, `null` as type expressions; lowered as `{const: value}`.
- **Tests.** Each literal lowers correctly; literal-union `"low" | "medium" | "high"` lowers to `{type:string, enum:[...]}`.
- **Deps.** V4c.
- **Ships when.** Const fields and literal unions work.

## V4e — `array<T>` lowering

- **Spec.** [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm).
- **Adds.** `array<T>` → `{type:array, items: <T-lowered>}`.
- **Tests.** Nested `array<array<T>>` lowers; element-type errors propagate.
- **Deps.** V4b.
- **Ships when.** Array-typed fields validate.

## V4f — Inline anonymous object hoisting

- **Spec.** [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm) (step 2).
- **Adds.** `{ field: T }` in any type position lifted into `$defs/__inline_<hash>` with stable structural hash; structurally-identical inline schemas dedup to one entry.
- **Tests.** Two identical inline schemas → one `$defs` entry; differing key order produces same hash; differing types produces different hashes; canonical hash matches a checked-in fixture snapshot pinning the full algorithm (SHA-256 over the canonical-form bytes of the **lowered** JSON Schema fragment — object keys sorted by Unicode code-point order, no insignificant whitespace, JSON-numeric form, RFC-8259 minimal-escape strings — truncated to the first 16 lowercase hex chars), with fixtures covering: a flat object schema, a nested-object schema with reordered source-level fields (asserting the emitted `$defs` entry preserves source order while the slug is invariant), a schema containing a string with characters that distinguish minimal-escape from gratuitous-`\u`-escape encoding, a schema containing an integer and a float (asserting JSON-numeric form), and a schema whose key set requires Unicode code-point ordering distinct from byte-wise lexicographic ordering.
- **Deps.** V4b.
- **Ships when.** Anonymous object types are usable in any field position.

## V4g — Schema-subset whitelist enforcement

- **Spec.** [Schema Subset](../spec_topics/schema-subset.md) (rejected keyword list).
- **Adds.** Parse-time rejection of every disallowed keyword: `pattern`, `format`, `minLength`/`maxLength`, `minimum`/`maximum`, `exclusiveMinimum`/`exclusiveMaximum`, `multipleOf`, `minItems`/`maxItems`, `uniqueItems`, `contains`, `patternProperties`, `propertyNames`, `min/maxProperties`, `unevaluatedProperties`, `unevaluatedItems`, `dependentRequired`, `dependentSchemas`, `nullable`, `oneOf`, `allOf`, `not`, `if`/`then`/`else`. (These would only appear if a future feature tried to emit them; the lowering pass asserts none escape.)
- **Tests.** Architectural test: walk a synthesised schema containing each forbidden keyword; lowering pass throws. No surface-syntax accepts these in V4.
- **Deps.** V4b.
- **Ships when.** Any future feature accidentally emitting a disallowed keyword is caught at parse time.

## V4h — Per-query schema document with `$defs` pruning

- **Spec.** [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm) (step 4).
- **Adds.** When a typed query fires, runtime extracts the response schema as document root and copies in only transitively reachable `$defs`.
- **Tests.** Unreachable `$defs` are pruned; reachable cycles are preserved; document is self-contained (no dangling `$ref`).
- **Deps.** V4a, V4b.
- **Ships when.** Provider request payloads are minimal.

## V4i — Recursive schema references

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (recursion), [Schema Subset](../spec_topics/schema-subset.md) (depth), [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement).
- **Adds.** Validator service compiles a hand-written JSON Schema document containing recursive `$defs`/`$ref` (no surface-syntax involvement) and runs the depth-counting walk defined in [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement) before AJV at every validation site. The walk is a recursive descent over the parsed JSON value with a depth counter, short-circuiting on the first node whose depth would exceed 5.
- **Tests.** AJV compiles a hand-authored recursive `$defs`/`$ref` document and validates a 4-deep instance; depth walk on a 6-deep instance returns the canonical depth violation (`schema_keyword: "maxDepth"`, JSON Pointer to first too-deep node, message `"JSON document depth exceeds 5"`); depth walk runs before AJV (asserted by feeding a payload that would otherwise trip an AJV error and confirming the depth error is the one returned).
- **Deps.** V4h.
- **Ships when.** AJV-side recursion and depth cap are exercised; surface-syntax recursive schemas can be built on top in V11g–V11i.

## V4j — Type-alias cycle detector

- **Spec.** [Schema Declarations — recursion / type-alias cycle](../spec_topics/schemas.md).
- **Adds.** Pass that walks the type-alias graph after schema-name resolution but before lowering; rejects any `schema X = ...` whose right-hand side reduces to `X` through aliases only — directly (`schema X = X`) or transitively (`schema X = Y; schema Y = X`, longer chains). Emits `loom/parse/type-alias-cycle` with the printed cycle path in the spec format `"type-alias cycle: X → Y → X"` (separator `→` is U+2192; literal prefix `"type-alias cycle: "`; trailing node repeats the head, mirroring V15n / V17k). Cycles that traverse at least one object-schema hop are walk leaves — the walker stops descending at the object hop and the cycle remains legal (the runtime data-depth cap of V11i bounds termination). An alias to a primitive or to `null` (`schema X = X | null`) is *not* an object hop; the walker continues through it.
- **Tests.** Self-cycle `schema X = X` → `loom/parse/type-alias-cycle`, message exactly `"type-alias cycle: X → X"` (sourced from the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) Message column); two-step `schema X = Y; schema Y = X` → diagnostic, message `"type-alias cycle: X → Y → X"`; three-step chain → diagnostic with full path; cycle that passes through one object schema (`schema X = Y; schema Y { next: X }`) → no diagnostic, lowers normally; alias-only cycle through a `| null` union (`schema X = Y | null; schema Y = X | null`) → diagnostic (the `null` arm is not an object hop); the pass runs before V4c lowering (asserted by feeding `schema X = X` and confirming the diagnostic surfaces rather than a stack overflow from lowering). REQ-IDs to be assigned during the Phase 12b REQ-ID pass over [`schemas.md`](../spec_topics/schemas.md).
- **Deps.** V4c (alias surface), V4b (object schema, to identify object-hop walk leaves).
- **Ships when.** Pure-alias cycles rejected at parse time with the documented code and printed path; cycles through object schemas remain legal and lower normally.
