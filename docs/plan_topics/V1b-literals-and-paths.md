# `V1b` — String, number, and path literals

**Spec.** [`../spec_topics/lexical.md`](../spec_topics/lexical.md), [`../spec_topics/grammar.md`](../spec_topics/grammar.md).

**Adds.** Quoted-string lexing with the full escape table (including `\u{…}`), decimal number lexing with integer/number typing and range checks, and path-literal validation (forward-slash only, byte-exact lowercase `.loom`/`.warp` final segment).

**Tests.**
- `loom/parse/integer-literal-out-of-range`, `loom/parse/number-literal-not-finite`, `loom/parse/integer-narrowing`: numeric range/type violations fire.
- String escape errors fire at the offending span; `\u{…}` decodes correctly.
- `loom/parse/invalid-path-separator`: a backslash path separator fires; `.LOOM` is rejected byte-exact cross-OS.
- `loom/parse/unsupported-feature`: reserved hex/octal/binary/underscore numeric forms fire.

**Deps.** `V1b-T`, `V1a`

**Ships when.** `npm test` lexes the escape table, fires each numeric/path code, and rejects `.LOOM`.
