# `V1b-T` — String, number, and path literals (tests)

**Spec.** [`../spec_topics/lexical.md`](../spec_topics/lexical.md), [`../spec_topics/grammar.md`](../spec_topics/grammar.md).

**Adds.** Failing tests for the paired `V1b` implementation leaf.

**Tests.**
- `loom/parse/integer-literal-out-of-range`, `loom/parse/number-literal-not-finite`, `loom/parse/integer-narrowing`: numeric range/type violations fire.
- String escape errors fire at the offending span; `\u{…}` decodes correctly.
- `loom/parse/invalid-path-separator`: a backslash path separator fires; `.LOOM` is rejected byte-exact cross-OS.
- `loom/parse/unsupported-feature`: reserved hex/octal/binary/underscore numeric forms fire.

**Deps.** `V1a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
