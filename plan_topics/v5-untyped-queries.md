# V5 — Untyped queries and prompt-mode driver

## V5a — Bare `@`literal`` query parsed

- **Spec.** [Query](../spec_topics/query.md) (untyped).
- **Adds.** `` @`text` `` template parser (no `${}`, no escapes beyond `\``). Returns `Result<string, QueryError>` semantically; bound-to-name only for now.
- **Tests.** Template parses; closing-backtick missing → `unterminated-template`; bare expression-statement deferred to V5f.
- **Deps.** M, V2.
- **Ships when.** A loom can issue a non-trivial bound query.

## V5b — `${expr}` interpolation

- **Spec.** [Query — Stringification of interpolated values](../spec_topics/query.md), [Template Interpolation](../spec_topics/frontmatter.md#template-interpolation).
- **Adds.** `${...}` containing any V2-grammar expression. Nested template `@`...`` and `match` inside `${...}` rejected. Per-Loom-static-type stringification per the canonical table; `${expr}` whose `expr` has type `Result<T, E>` rejected with `loom/parse/interpolated-result`.
- **Tests.** `${param}` resolves; `${a + b}` evaluates; `${@\`nested\`}` rejected; `${match ...}` rejected; `${` inside regular string is plain text (already in V1b). Per-type stringification: `string` (verbatim), `integer` (`42`), `number` (`3.14`, `NaN`, `Infinity`), `boolean` (`true` / `false`), `null` (literal `null`), enum variant (bare wire value), `array<T>` and schema-typed object (compact `JSON.stringify` with wire-name translation). `Result<T, E>` interpoland rejected at parse time with `loom/parse/interpolated-result`; the same code surfaces as a runtime panic when the type is statically unresolvable.
- **Deps.** V5a, V2c.
- **Ships when.** Templates can reference local values.

## V5c — Multi-line templates: newline-trim and dedent

- **Spec.** [Query](../spec_topics/query.md) (multi-line templates).
- **Adds.** Strip newline immediately after opening backtick; strip newline immediately before closing backtick; dedent common leading whitespace per Python `textwrap.dedent`.
- **Tests.** One assertion per normative vector in [Query](../spec_topics/query.md) "Dedent and newline-trim — normative behaviour": (1) multi-line uniform space indent renders as the worked example; (2) whitespace-only blank line is normalised to empty and does not constrain the common prefix; (3) tab-only indentation is stripped; (4) mixed tab/space indentation has no shared literal prefix and nothing is stripped; (5) single-line template with leading whitespace inside the backticks preserves it; (6) template that becomes empty after newline-trim renders as `""`; (7) `` @`\n    only\n` `` renders as `"only"` (pins newline-trim-before-dedent order). Plus: a trailing `\n` followed by whitespace before the closing backtick is *not* newline-trimmed.
- **Deps.** V5a.
- **Ships when.** Multi-line prompts render cleanly.

## V5d — Full template escape set

- **Spec.** [Query](../spec_topics/query.md) (escapes).
- **Adds.** `` \` ``, `\$`, `\\`, `\n`, `\t`, `\r` inside templates. Other `\X` is parse error.
- **Tests.** Each escape; `\$` suppresses interpolation when followed by `{`; `\X` rejected.
- **Deps.** V5a.
- **Ships when.** Templates handle special characters correctly.

## V5e — Prompt-mode conversation driver

- **Spec.** [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (prompt-mode drive).
- **Adds.** `PromptModeConversationDriver` issues `ctx.sendUserMessage(text)` (or `{ deliverAs: "steer" }` mid-stream), awaits via `agent_end` listener, returns assistant text. Replaces M's hard-coded driver.
- **Tests.** Single turn round-trips; mid-stream send uses steer mode; `agent_end` listener cleaned up after each query (no leak); transport failure → `Err({kind:"transport"})`.
- **Deps.** V5a, M.
- **Ships when.** A real Pi session can run a multi-query loom (without `?` yet — bind every result).

## V5f — Bare expression-statement query is parse error

- **Spec.** [Query](../spec_topics/query.md) (discarded results).
- **Adds.** A bare `@`...`` at statement position is parse error with the documented diagnostic. Author must write `?`, `let _ =`, or `let x =`.
- **Tests.** Bare `@` rejected; `let _ = @` accepted; tail-expression `@` in a `void` function NOT rejected (the discard is on the function, not the statement). Cross-linked from V18q — `let _ = @`...`` of an always-log-set `Err` emits exactly one `display: false` runtime event at the discarding `let _` site.
- **Deps.** V5a.
- **Ships when.** Discarded queries can't sneak into code silently.

## V5g — `QueryError` union — initial variants

- **Spec.** [Query](../spec_topics/query.md) (failure modes).
- **Adds.** Discriminated union with `TransportError` (wire `kind: "transport"`), `ContextOverflowError` (wire `kind: "context_overflow"`), and `CancelledError` (wire `kind: "cancelled"`) variants only. (`ValidationError` lands V6i; `CodeToolError` V14f–V14i; `ModelToolError` V14r; `InvokeInfraError` V15l; `InvokeCalleeError` V15m.) Schema declared once at runtime level so later leaves extend non-breakingly.
- **Tests.** Each variant constructible; `match`-on-`kind` works (semantically; full match grammar in V7); `raw_response` field present only on relevant variants.
- **Deps.** V5e.
- **Ships when.** Errors flow through the spec's surface even though `?` doesn't exist yet.
