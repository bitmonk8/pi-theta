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

**Deps.** `V7a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
