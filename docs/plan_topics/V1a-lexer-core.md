# `V1a` — Lexer core

**Spec.** [`../spec_topics/lexical.md`](../spec_topics/lexical.md), [`../spec_topics/grammar.md`](../spec_topics/grammar.md).

**Adds.** The tokeniser: UTF-8/BOM decode consuming the raw `Uint8Array` from the `V8b` `FileSystem` byte-read seam (so invalid bytes and their byte offsets are recoverable pre-normalisation), CRLF→LF normalisation, identifier first-letter case rules, reserved-keyword recognition, `//` line comments, `///` doc-comment rest-of-line capture, block-comment rejection, and the closed statement-termination / newline-continuation trigger set. The lexer emits its `loom/load/invalid-encoding` and `loom/parse/*` codes through the `V7a` producer-facing **diagnostic-emission seam** (the contract the `Deps.` `V7a` edge stands for), handing each constructed `Diagnostic` to that seam rather than calling `pi.sendMessage` directly.

**Tests.**
- `loom/load/invalid-encoding`: a non-UTF-8 byte sequence fails load with this code at the byte offset.
- [lexical.md — CRLF→LF normalisation](../spec_topics/lexical.md) (LEX code-keyed area): LF and CRLF inputs tokenise to identical token streams.
- `loom/parse/reserved-keyword-as-identifier`: a reserved word used as an identifier fires.
- `loom/parse/schema-case-mismatch`, `loom/parse/binding-case-mismatch`: identifier first-letter case violations fire.
- `loom/parse/block-comment`: `/* … */` is rejected.
- `loom/parse/single-line-if`, `loom/parse/stray-backslash`: termination/continuation violations fire per the closed trigger table.
- [grammar.md — Newline continuation](../spec_topics/grammar.md#newline-continuation) (closed trigger table, positive path): each of the four continuation triggers — unmatched open bracket, trailing binary/ternary operator, trailing comma (inside an open bracket), leading binary/ternary operator — tokenises its spanning lines as a single continued statement.
- [grammar.md — Newline continuation](../spec_topics/grammar.md#newline-continuation) (blank-line-spanning rule): one or more intervening blank lines do not break a continuation — the spanning lines still tokenise as a single continued statement for both the trailing-trigger and leading-operator forms.

**Deps.** `V1a-T`, `V7a`, `V8b`

**Ships when.** `npm test` tokenises LF/CRLF fixtures identically, accepts each continuation-trigger and blank-line-spanning vector as a single continued statement, and fires each listed violation code at the offending span.
