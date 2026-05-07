# V11 — Discriminated unions and recursion

## V11a — Implicit discriminator detection

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (discriminated unions).
- **Adds.** `schema X = A | B | C` where each variant has exactly one shared single-literal field with unique values per variant: detected as discriminator.
- **Tests.** Detection works on representative examples; lowering is plain `anyOf` (no discriminator keyword emitted); a variant set with a numeric literal tag (`kind: 1` per variant) emits `loom/parse/non-string-discriminator`, and the same for boolean literal tags (`kind: true`), with the diagnostic message matching the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) *Message* template verbatim; wire-renamed discriminators (`kind as "Kind": 1`) still emit `loom/parse/non-string-discriminator` (the rename does not interact with the string-literal constraint on the value).
- **Deps.** V4b, V4c.
- **Ships when.** Standard discriminated unions work.

## V11b — Ambiguous-candidate diagnostic

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (discriminated unions).
- **Adds.** Multiple qualifying fields → parse error naming all candidates with hint to use `by`.
- **Tests.** Two-candidate case; three-candidate case; message matches the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) *Message* template for `loom/parse/ambiguous-discriminator`.
- **Deps.** V11a.
- **Ships when.** Author has clear path to disambiguate.

## V11c — Missing-discriminator diagnostic

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (discriminated unions).
- **Adds.** No qualifying field → parse error with hint to add `kind` field or use `by`.
- **Tests.** Three different no-candidate shapes; message matches the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) *Message* template for `loom/parse/missing-discriminator`.
- **Deps.** V11a.
- **Ships when.** Discriminator-less unions are caught early.

## V11d — Explicit `by <field>` form

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (discriminated unions), [Grammar Appendix — `schema X by <field>`](../spec_topics/grammar.md#schema-x-by-field).
- **Adds.** `schema X by kind = A | B`. The `by` clause is admitted **only** on the union form (the alternative beginning with `=`); a `schema X by f { ... }` declaration with an object body is `loom/parse/by-on-object-schema`. Resolves to loom-side identifier; lowering uses each variant's wire name.
- **Tests.** Explicit form overrides detection; loom-side name accepted; wire name forbidden in `by` clause; `schema X by f { a: string }` (object body with `by`) emits `loom/parse/by-on-object-schema` whose message matches the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) *Message* template; `schema X by f` (no RHS at all) is rejected; `schema X by kind = A | B` where the named `kind` field has numeric or boolean literal values across variants emits `loom/parse/non-string-discriminator` (the rule applies under explicit `by` exactly as under implicit detection); two variants under explicit `by kind` carrying the same string-literal `kind` value emits `loom/parse/duplicate-discriminator-value` (asserted as the literal registry code string per the V18s diagnostic-code gate).
- **Deps.** V11a, V4b.
- **Ships when.** Author can override detection on union schemas; misuse on object schemas is rejected with a clear diagnostic.

## V11e — Discriminator must be top-level

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (discriminated unions).
- **Adds.** Nested discriminator like `kind: { type: "x" }` → parse error.
- **Tests.** Nested case rejected with `loom/parse/nested-discriminator` (asserted as the literal registry code string per the V18s diagnostic-code gate); the diagnostic message matches the registry *Message* template verbatim.
- **Deps.** V11a.
- **Ships when.** Nested discriminators can't sneak in.

## V11f — Mixed unions

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (mixed unions).
- **Adds.** `string | Author`, `Author | null` lower as plain `anyOf` (multi-type-array form preferred when all primitives).
- **Tests.** `Author | null` lowers correctly; `string | Author` produces `anyOf`.
- **Deps.** V11a, V4c.
- **Ships when.** Non-discriminated unions still work.

## V11g — Self-recursive object schemas

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (recursion).
- **Adds.** `schema Tree { value, children: array<Tree> }` lowers via `$defs`/`$ref`.
- **Tests.** Recursion lowered transparently; AJV validates 4-deep tree.
- **Deps.** V4i.
- **Ships when.** Authors don't write `$ref`/`$defs` manually.

## V11h — Mutual recursion across schemas

- **Spec.** [Schema Declarations](../spec_topics/schemas.md) (recursion).
- **Adds.** `Person ↔ Animal` mutual references resolve.
- **Tests.** Both schemas lower; AJV validates representative document.
- **Deps.** V11g.
- **Ships when.** Mutual recursion is transparent.

## V11i — Runtime depth cap of 5

- **Spec.** [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement).
- **Adds.** `SchemaValidator` exposes a pre-AJV depth walk over post-decode JSON values: depth-5 accepted, depth-6 short-circuits at the first too-deep node and produces `ValidationIssue { schema_keyword: "maxDepth", path: <JSON Pointer>, message: "JSON document depth exceeds 5" }`. The walk is unconditionally installed at every boundary that calls `SchemaValidator.validate(...)`; per-boundary surfacing is verified by the leaf that owns each enforcement point per the ceiling #4 per-boundary table in [`spec.md` — Hard ceilings](../spec.md#hard-runtime-ceilings) and [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement) — V6i for the typed-query response boundary (`Err(QueryError { kind: "validation", cause: "schema_validation", … })` to loom code), V14e for the model-driven tool-arg boundary (tool-error result fed back to the model; round counts against `tool_loop.max_iterations`; **not** a `QueryError` to loom code), V14f for the code-driven tool-arg boundary (`Err(CodeToolError { cause: "validation", … })` to loom code), V16p for the slash-load arm of `params` validation (load-time system note via the binder's AJV-on-`args` failure-mode template; not an evaluation outcome). The `invoke(...)` arm of `params` validation and the `invoke<T>` return-value boundary route to the calling loom as `Err(InvokeInfraError { cause: "validation", … })` per [Invocation — Failures](../spec_topics/invocation.md); no V1 leaf currently owns dedicated per-boundary surfacing tests for those two surfaces beyond the service-level coverage in this leaf.
- **Tests.** Service-level: depth-5 accepted, depth-6 rejected; first-too-deep node short-circuits (deeper subtrees not walked); `ValidationIssue.schema_keyword === "maxDepth"`; `path` is a JSON Pointer to the first too-deep node; `message` is exactly `"JSON document depth exceeds 5"`; the walk runs before AJV (an AJV-keyword issue against the same depth-6 payload is not produced); recursive `schema Tree` with depth-3 instance accepted (cap is on data not schema graph). When the walk surfaces at the typed-query response boundary (V6i), the resulting `ValidationError` carries `cause: "schema_validation"` per [`errors-and-results.md`](../spec_topics/errors-and-results.md) — even though the depth walk short-circuits before AJV, the cause stays `schema_validation` because the walk is verifying the model's response shape, not refusing input the runtime constructed itself.
- **Deps.** V11g.
- **Ships when.** Depth cap is enforced uniformly.
