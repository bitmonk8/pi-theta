# V1 — Lexer hardening

Leaves are listed in implementation order. The pre-lex pipeline leaf (V1f) runs before the token-emitting leaves V1a–V1e despite its later letter; leaf IDs are not reused (per [`conventions.md`](conventions.md)).

## V1f — Source decoding (UTF-8, BOM) and newline normalisation

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (Source files, Encoding, Newline normalisation, Diagnostic spans), [Diagnostics](../spec_topics/diagnostics.md) (`loom/load/invalid-encoding`).
- **Adds.** Pre-lex source pipeline applied to every `.loom` and `.warp` file in this fixed order: (1) byte-to-character UTF-8 decode — a leading `EF BB BF` is consumed and discarded; any other BOM, any invalid UTF-8 byte sequence, and any lone surrogate produces `loom/load/invalid-encoding` carrying the file path and the byte offset of the first invalid byte; (2) newline normalisation — `\r\n` → `\n` and bare `\r` → `\n`, applied after BOM consumption and before any span recording. Span bookkeeping is initialised so that column 1 of line 1 falls *after* a stripped BOM *and* after CRLF→LF folding (a CRLF source line counts as one newline, not two). Every downstream rule that mentions "newline" — statement separation in V1e, `loom/parse/literal-newline-in-string` in V1b, `` @`...` `` newline-trim and dedent in V5c, and `///` doc-comment joining in V1c / V13 — operates on the normalised stream.
- **Tests.** *Encoding:* plain ASCII tokenises; UTF-8 sans BOM tokenises; UTF-8 with leading BOM tokenises identically to the same source without the BOM, with no leading whitespace token and column 1 of line 1 sitting on the first post-BOM byte; UTF-16 LE BOM (`FF FE`), UTF-16 BE BOM (`FE FF`), and UTF-32 BOMs all emit `loom/load/invalid-encoding` at offset 0; a lone high surrogate mid-stream emits `loom/load/invalid-encoding` at the offending byte; an isolated UTF-8 continuation byte (e.g. `0x80`) at offset N emits `loom/load/invalid-encoding` with offset N; an overlong encoding emits `loom/load/invalid-encoding`; the diagnostic carries the absolute file path the loader was asked to read. *Newline normalisation:* CRLF source tokenises byte-identically to the LF version of the same source across the V5c dedent vectors, V1c `///` joining, and V1b `loom/parse/literal-newline-in-string`; bare-CR-only source tokenises identically to LF; a single file mixing CRLF + bare-CR + LF normalises uniformly to LF; diagnostic line/column on a CRLF source matches the LF source byte-for-byte (CRLF counts as one newline); a UTF-8 BOM followed by `\r\n` produces BOM-stripped + `\n` (BOM consumption runs before normalisation, not the other way around); a bare `\r` at end-of-file becomes `\n` and the file has one logical newline (no implicit terminator appended on top); the literal escape sequence `"\r"` inside a regular string survives normalisation untouched (normalisation acts on the byte stream, not on the post-V1b escape table).
- **Deps.** H3 (diagnostics primitive), M.
- **Ships when.** Every `.loom` and `.warp` file passes through the decoder and newline-normaliser before any V1a–V1e tokenisation runs; non-UTF-8 inputs fail fast with `loom/load/invalid-encoding` rather than producing token-stream mojibake; every downstream lexer test passes against the CRLF transform of its own input fixture.

## V1a — Numeric literals

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (number literals).
- **Adds.** `42`, `3.14`, `1e10`, `1.5e-3`, `0`, `0.5`. `integer` vs. `number` token tag based on presence of fractional/exponent parts.
- **Tests.** Each form tokenises; hex/octal/binary/underscore-separator are parse errors with hints; leading `-` is the unary operator (lexer emits `MINUS NUMBER`, not a signed-literal token).
- **Deps.** V1f.
- **Ships when.** Numeric literals are accepted in any future expression position; M's body parser still passes its tests.

## V1b — String literals and escapes

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (string literals). Operates on the post-normalisation stream produced by V1f, so "literal newline in regular string" means a `\n` in the normalised stream (CRLF and bare CR both reach this rule as `\n`).
- **Adds.** Single- and double-quoted forms; escape set `\"`, `\'`, `\\`, `\n`, `\t`, `\r`, `\u{XXXX}`. Single-line only — literal `\n` inside a regular string is a parse error. No `${...}` interpolation in regular strings.
- **Tests.** Each escape; illegal escape; literal newline in string; `${` inside regular string is plain text; unterminated string error.
- **Deps.** V1a.
- **Ships when.** String tokens flow through to later parser slices.

## V1c — Line comments (`//` and `///`)

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (comments). Operates on the post-normalisation stream produced by V1f, so `///` joining sees CRLF/bare-CR sources identically to LF.
- **Adds.** `//` regular-comment token (discarded); `///` doc-comment token (preserved with its text). Block comments `/* */` are a parse error.
- **Tests.** Both forms tokenise; block-comment is rejected; `///` text is captured (semantics in V13).
- **Deps.** V1a.
- **Ships when.** Doc-comment tokens reach the AST builder.

## V1d — Identifier case rule and reserved keywords

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (identifiers, reserved keywords).
- **Adds.** First-letter-case enforcement (PascalCase vs. lowercase-first / `_`); reserved-keyword recognition for the spec's full list; the reserved discard `_`.
- **Tests.** Lowercase-first identifier accepted in binding position; PascalCase identifier accepted in schema-name position; mismatch in schema-name position emits `loom/parse/schema-case-mismatch` with message `"schema name must start with an uppercase letter"`; mismatch in binding / parameter / fn-name / field-name position emits `loom/parse/binding-case-mismatch` with message `` "binding name must start with a lowercase letter or `_`" ``; every reserved keyword listed in [`spec_topics/lexical.md` — Reserved keywords](../spec_topics/lexical.md) used in identifier position emits `loom/parse/reserved-keyword-as-identifier`; `_` cannot be referenced as a regular identifier after binding. Source-of-truth note: the two quoted message strings are the parenthesised quotes in [`spec_topics/lexical.md`](../spec_topics/lexical.md)'s "Violating either rule is a parse error: …" sentence; if the spec text is later edited, this fixture must follow.
- **Deps.** V1a.
- **Ships when.** Case rule and keyword set are uniform across the lexer.

## V1e — Statement separators and newline continuation

- **Spec.** [Lexical Structure](../spec_topics/lexical.md) (statement terminators), [Grammar disambiguation](../spec_topics/expressions.md#grammar-disambiguation) (newline continuation), [Grammar Appendix — Newline continuation](../spec_topics/grammar.md#newline-continuation). Operates on the post-normalisation stream produced by V1f — "newline" in this leaf means the normalised `\n`.
- **Adds.** Newline-as-separator; continuation across the closed trigger set: open `(`/`{`/`[`, trailing binary/ternary operator, trailing comma, leading binary/ternary operator on the next non-blank line. Blank lines do not break a continuation — when any trigger holds, the parser continues across one or more newlines regardless of how many are blank. Semicolons rejected.
- **Tests.** Each continuation form; semicolon rejected; bracket-balance error reports the unmatched opener; operator-at-end-of-line and operator-at-start-of-next-line both join; `let x =\n\n  foo` parses as one statement; `let x = a\n\n  + b` parses as one statement; a blank line with no trigger above it ends the prior statement (`let x = 1\n\nlet y = 2` is two statements).
- **Deps.** V1a–V1d.
- **Ships when.** Multi-line statements parse without explicit terminators, including across blank lines.
