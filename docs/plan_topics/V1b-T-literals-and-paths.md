# `V1b-T` — String, number, and path literals (tests)

**Spec.** [`../spec_topics/lexical.md`](../spec_topics/lexical.md), [`../spec_topics/grammar.md`](../spec_topics/grammar.md).

**Adds.** Failing tests for the paired `V1b` implementation leaf.

**Tests.**
- `loom/parse/integer-literal-out-of-range`, `loom/parse/number-literal-not-finite`, `loom/parse/integer-narrowing`: numeric range/type violations fire.
- `loom/parse/illegal-escape`: a backslash followed by an unrecognised character inside a string literal fires at the offending span.
- `loom/parse/invalid-unicode-escape`: a recognised `\u{…}` escape whose value exceeds `U+10FFFF` or names a surrogate fires at the offending span.
- [lexical.md — String literals](../spec_topics/lexical.md#string-literals) (LEX code-keyed area): a recognised `\u{…}` escape decodes to the correct Unicode scalar value.
- `loom/parse/invalid-path-separator`: a backslash path separator fires; `.LOOM` is rejected byte-exact cross-OS.
- `loom/parse/unsupported-feature`: reserved hex/octal/binary/underscore numeric forms fire.

**Deps.** `V1a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
