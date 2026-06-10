# `V5b` — Discriminated unions, recursion, and cycle detection

**Spec.** [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** Implicit discriminated-union detection (present-in-all / single string-literal / unique, string-only), explicit `by <field>` (on `=` aliases only), recursion via auto `$defs`/`$ref`, and the type-alias-cycle detector (object-hop cycles legal).

**Tests.**
- `loom/parse/non-string-discriminator`, `loom/parse/ambiguous-discriminator`, `loom/parse/missing-discriminator`, `loom/parse/duplicate-discriminator`, `loom/parse/nested-discriminator`: discriminator violations fire.
- `loom/parse/by-on-object-schema`: `by` on an object schema fires.
- `loom/parse/type-alias-cycle`: a non-object alias cycle fires; an object-hop cycle is accepted.

**Deps.** `V5b-T`, `V5a`

**Ships when.** `npm test` detects implicit/explicit discriminators and the legal/illegal recursion cases.
