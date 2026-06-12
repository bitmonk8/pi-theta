# `V6b-T` — `params` and defaults (tests)

**Spec.** [`../spec_topics/frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md).

**Adds.** Failing tests for the paired `V6b` implementation leaf.

**Tests.**
- A non-defaulted param after a defaulted one fires `loom/parse/non-trailing-default`.
- A default that is not a loom literal fires `loom/parse/default-not-literal`.
- `params` are validated through AJV against their lowered schema.
- A `params:` entry whose type RHS forward-references a `schema`/`enum` declared *later* in the loom body (e.g. a field typed `Author` whose `schema Author` appears below the frontmatter) resolves and validates correctly.
- A `params:` named type that resolves to no body declaration fires `loom/parse/unresolved-named-type`.

**Deps.** `V6a`, `V5d`, `V5f`, `V8c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
