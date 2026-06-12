# `V6b` — `params` and defaults

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** The `params:` contract: AJV validation, type-expression RHS (forward references), literal-sublanguage defaults, and the no-non-defaulted-after-defaulted ordering rule.

**Tests.**
- A non-defaulted param after a defaulted one fires `loom/parse/non-trailing-default`.
- A default that is not a loom literal fires `loom/parse/default-not-literal`.
- `params` are validated through AJV against their lowered schema.
- A `params:` entry whose type RHS forward-references a `schema`/`enum` declared *later* in the loom body (e.g. a field typed `Author` whose `schema Author` appears below the frontmatter) resolves and validates correctly.
- A `params:` named type that resolves to no body declaration fires `loom/parse/unresolved-named-type`.

**Deps.** `V6b-T`, `V6a`, `V5d`, `V5f`, `V8c`

**Ships when.** `npm test` validates `params`, enforces default ordering, rejects non-literal defaults, and resolves forward-referenced named types (firing `loom/parse/unresolved-named-type` when no body declaration matches).
