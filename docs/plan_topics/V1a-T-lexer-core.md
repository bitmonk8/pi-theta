# `V1a-T` — Lexer core (tests)

**Spec.** [`../spec_topics/lexical.md`](../spec_topics/lexical.md), [`../spec_topics/grammar.md`](../spec_topics/grammar.md).

**Adds.** Failing tests for the paired `V1a` implementation leaf.

**Tests.**
- `loom/load/invalid-encoding`: a non-UTF-8 byte sequence fails load with this code at the byte offset.
- [lexical.md — CRLF→LF normalisation](../spec_topics/lexical.md) (LEX code-keyed area): LF and CRLF inputs tokenise to identical token streams.
- `loom/parse/reserved-keyword-as-identifier`: a reserved word used as an identifier fires.
- `loom/parse/schema-case-mismatch`, `loom/parse/binding-case-mismatch`: identifier first-letter case violations fire.
- `loom/parse/block-comment`: `/* … */` is rejected.
- `loom/parse/single-line-if`, `loom/parse/stray-backslash`: termination/continuation violations fire per the closed trigger table.
- [grammar.md — Newline continuation](../spec_topics/grammar.md#newline-continuation) (closed trigger table, positive path): each of the four continuation triggers — unmatched open bracket, trailing binary/ternary operator, trailing comma (inside an open bracket), leading binary/ternary operator — tokenises its spanning lines as a single continued statement.
- [grammar.md — Newline continuation](../spec_topics/grammar.md#newline-continuation) (blank-line-spanning rule): one or more intervening blank lines do not break a continuation — the spanning lines still tokenise as a single continued statement for both the trailing-trigger and leading-operator forms.

**Deps.** `V7a`, `V8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
