# `V6d-T` — `system` template interpolation (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`](../spec_topics/frontmatter/frontmatter-fields-b-and-templates.md), [`../spec_topics/expressions.md`](../spec_topics/expressions.md).

**Adds.** Failing tests for the paired `V6d` implementation leaf.

**Tests.**
- The four `loom/parse/system-interp-*` codes fire on their respective interpolation violations.
- `\${` escapes interpolation; a Path-only `${…}` resolves against the validated `params` object.
- Driving a reference param through the `system:` surface, each distinct param-resolvable Loom static type stringifies per the canonical table in [`../spec_topics/query/query-escapes-stringification.md`](../spec_topics/query/query-escapes-stringification.md): `string`; `integer`; `number` (finite, plus the non-finite `NaN` / `Infinity` / `-Infinity` cases, which reach the slot only through the non-slash `invoke(...)` / `.loom`-callable arms); `boolean`; `null` (renders the literal text `null`, not the empty string); an enum variant (its wire value); an `array<T>`; and a schema-typed object (compact `JSON.stringify` with wire-name translation). Row-level correctness stays owned by `V13a`; these vectors witness only that the `system:` resolve-then-stringify path feeds each type into the shared renderer.
- The `Result<T, E>` row does not arise from this surface (`params:` types never include `Result`).
- `system:` on a prompt-mode loom is rejected.

**Deps.** `V6a`, `V3a`, `V13a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
