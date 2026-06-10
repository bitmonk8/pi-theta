# `V1a` — Lexer core

**Spec.** [`../spec_topics/lexical.md`](../spec_topics/lexical.md), [`../spec_topics/grammar.md`](../spec_topics/grammar.md).

**Adds.** The tokeniser: UTF-8/BOM decode, CRLF→LF normalisation, identifier first-letter case rules, reserved-keyword recognition, `//` line comments, `///` doc-comment rest-of-line capture, block-comment rejection, and the closed statement-termination / newline-continuation trigger set.

**Tests.**
- `loom/load/invalid-encoding`: a non-UTF-8 byte sequence fails load with this code at the byte offset.
- [lexical.md — CRLF→LF normalisation](../spec_topics/lexical.md) (LEX code-keyed area): LF and CRLF inputs tokenise to identical token streams.
- `loom/parse/reserved-keyword-as-identifier`: a reserved word used as an identifier fires.
- `loom/parse/schema-case-mismatch`, `loom/parse/binding-case-mismatch`: identifier first-letter case violations fire.
- `loom/parse/block-comment`: `/* … */` is rejected.
- `loom/parse/single-line-if`, `loom/parse/stray-backslash`: termination/continuation violations fire per the closed trigger table.

**Deps.** `V1a-T`, `V7a`

**Ships when.** `npm test` tokenises LF/CRLF fixtures identically and fires each listed code at the offending span.
