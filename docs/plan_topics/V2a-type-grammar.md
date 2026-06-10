# `V2a` — Type grammar and loom literal sublanguage

**Spec.** [`../spec_topics/grammar.md`](../spec_topics/grammar.md), [`../spec_topics/type-system.md`](../spec_topics/type-system.md).

**Adds.** The type-expression parser (primitive / named / generic `array`/`Result` / inline-object / union / literal types, return-only `void`), the loom literal sublanguage (primitive / named-value / array / bare- and named-object literals with full-field requirement and is-literal check), and `array<T>` type-sink resolution over the exhaustive sink set.

**Tests.**
- `loom/parse/generic-arity-mismatch`, `loom/parse/void-in-non-return-position`, `loom/parse/result-in-schema-position`: type-grammar violations fire.
- `loom/parse/default-not-literal`, `loom/parse/tool-arg-not-literal`, `loom/parse/missing-object-field`: literal-sublanguage violations fire.
- `loom/parse/array-no-common-type`: an `[]` with no resolving sink fires (a `for` iterand is not a sink).

**Deps.** `V2a-T`, `V1a`

**Ships when.** `npm test` parses the type/literal grammar and fires each listed code.
