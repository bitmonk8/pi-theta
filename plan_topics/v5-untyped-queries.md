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
- **Tests.** `${param}` resolves; `${a + b}` evaluates; `${@\`nested\`}` rejected; `${match ...}` rejected; `${` inside regular string is plain text (already in V1b). Per-type stringification: `string` (verbatim), `integer` (`42`), `number` (`3.14`, `NaN`, `Infinity`), `boolean` (`true` / `false`), `null` (literal `null`), enum variant (bare wire value), `array<T>` and schema-typed object render as `JSON.stringify(translatedValue)` invoked with no `space` argument and no replacer, where `translatedValue` is the result of the outbound wire-name translation pass from [`runtime-value-model.md`](../spec_topics/runtime-value-model.md) applied recursively. Worked fixture: a schema-typed object with a wire-renamed field `loom_name → wire-name` and value `{ loom_name: "x", count: 1 }` interpolates as the literal text `{"wire-name":"x","count":1}`; a nested `array<schema>` interpolates the array form of the same. No `undefined` keys, no replacer transform, no inserted whitespace. `Result<T, E>` interpoland rejected at parse time with `loom/parse/interpolated-result`; the same code surfaces as a runtime panic when the type is statically unresolvable.
- **Deps.** V5a, V2c.
- **Ships when.** Templates can reference local values.

## V5c — Multi-line templates: newline-trim and dedent

- **Spec.** [Query](../spec_topics/query.md) (multi-line templates).
- **Adds.** Strip newline immediately after opening backtick; strip newline immediately before closing backtick; dedent common leading whitespace per Python `textwrap.dedent`.
- **Tests.** One assertion per normative vector in [Query](../spec_topics/query.md) "Dedent and newline-trim — normative behaviour": (1) multi-line uniform space indent renders as the worked example; (2) whitespace-only blank line is normalised to empty and does not constrain the common prefix; (3) tab-only indentation is stripped; (4) mixed tab/space indentation has no shared literal prefix and nothing is stripped; (5) single-line template with leading whitespace inside the backticks preserves it; (6) template that becomes empty after newline-trim renders as `""`; (7) `` @`\n    only\n` `` renders as `"only"` (pins newline-trim-before-dedent order). Plus: each of the seven normative vectors above is asserted twice — once with LF inputs, once with the CRLF transform of the same input (per V1f's pre-lex normalisation) — and the rendered output is byte-identical across the pair; the trailing-whitespace-before-closing-backtick assertion below is also re-run with `\r\n` immediately before the closing backtick (which V1f normalises to `\n` and the existing rule then handles). Plus: a template ending `\n    only\n  ` (newline, content, newline, trailing spaces, closing backtick) preserves both the final `\n` and the trailing spaces in the pre-dedent string; dedent then normalises the whitespace-only trailing line to empty (it does not contribute to the common prefix), so the rendered output is `"only\n"`.
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
- **Adds.** `PromptModeConversationDriver` issues `pi.sendUserMessage(text)` when `ctx.isIdle()` is true and `pi.sendUserMessage(text, { deliverAs: "steer" })` otherwise, where `pi: ExtensionAPI` is the reference captured by the extension factory and held by the runtime for the lifetime of each loom invocation; `ctx: ExtensionCommandContext` is consulted only for idle-state probes (`ctx.isIdle()` / `ctx.waitForIdle()`) per [Pi Integration Contract — Conversation drive — prompt mode](../spec_topics/pi-integration-contract.md). The driver awaits completion via `await ctx.waitForIdle()` (the prompt-mode driver's authoritative completion signal per the spec) and reads the accumulated assistant text from the command context once `waitForIdle()` resolves; that text is the `Ok(string)` value. The driver MUST NOT subscribe to `pi.on("agent_end", …)` for query completion — that global event fires for every `AgentSession` in the process with no per-session origin marker and would cross-fire across concurrent looms or sibling subagents. Replaces M's hard-coded driver.
- **Tests.** Single turn round-trips with text equal to the assistant transcript captured between `pi.sendUserMessage` and `ctx.waitForIdle()` resolution (no truncation, no transformation, no extra turns); mid-stream send uses `deliverAs: "steer"` (selected by `ctx.isIdle() === false`); `ctx.waitForIdle()` is the only completion primitive consulted (no `pi.on`, no `session.subscribe` against the user session); transport failure → `Err({kind:"transport"})`. Driver references the factory-captured `pi.sendUserMessage` for both initial and steer sends; an architectural test asserts no source file under the prompt-mode driver module reads `sendUserMessage` off any `ExtensionCommandContext`-typed value. A second architectural test scans the runtime tree and asserts no source file matches the regex `pi\.on\(\s*["']agent_end["']` — subagent-mode `session.subscribe(...)` against the spawned `AgentSession` remains permitted (the prohibition is scoped to the global `pi.on` emitter, not to `subscribe` on a session handle). If a future cancellation path needs to forward an external `agent_end` (e.g. user `/abort` mid-loom), V5e/M MUST state that scope explicitly and route it through the existing `loomAbort` controller rather than through query-completion semantics.
- **Deps.** V5a, M.
- **Ships when.** Manual: a `multi.loom` placed in `.pi/looms/` containing two consecutive `` let x = @`...` `` queries, slash invocation produces two distinct assistant turns in a real Pi session (manual smoke recorded as a new entry in `docs/manual-smoke.md` per the H4-defined format).

## V5f — Bare expression-statement query is parse error

- **Spec.** [Query](../spec_topics/query.md) (discarded results).
- **Adds.** A bare `@`...`` at statement position is parse error with the documented diagnostic. Author must write `?`, `let _ =`, or `let x =`.
- **Tests.** Bare `@` rejected; `let _ = @` accepted; tail-expression `@` in a `void` function NOT rejected (the discard is on the function, not the statement). Cross-linked from V18q — `let _ = @`...`` of an always-log-set `Err` emits exactly one `display: false` runtime event at the discarding `let _` site. A panic raised inside `${expr}` (e.g. OOB index, null-access, non-exhaustive `match`) inside a `let _ = @`...`` propagates out of the discard form rather than being absorbed; assert via a synthetic `${arr[i]}` with `i` out of bounds and a synthetic `${match x { … }}` whose value falls outside the arms (the panic surfaces at the discard's enclosing frame's panic-routing surface per V18m / V18n, not as a `RuntimeEvent`).
- **Deps.** V5a.
- **Ships when.** Discarded queries can't sneak into code silently.

## V5g — `QueryError` union — initial variants

- **Spec.** [Query](../spec_topics/query.md) (failure modes).
- **Adds.** Discriminated union with `TransportError` (wire `kind: "transport"`), `ContextOverflowError` (wire `kind: "context_overflow"`), and `CancelledError` (wire `kind: "cancelled"`) variants only. (`ValidationError` lands V6i; `CodeToolError` V14f–V14i; `ModelToolError` V14r; `InvokeInfraError` V15l; `InvokeCalleeError` V15m.) Schema declared once at runtime level so later leaves extend non-breakingly.
- **Tests.** Each variant constructible; `match`-on-`kind` works (semantically; full match grammar in V7); `raw_response` field present only on relevant variants.
- **Deps.** V5e.
- **Ships when.** Errors flow through the spec's surface even though `?` doesn't exist yet.

## V5h — Provider error mapping for `ContextOverflowError`

- **Spec.** [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (Provider error mapping table), [Query — Detection of `ContextOverflowError`](../spec_topics/query.md#detection-of-contextoverflowerror).
- **Adds.** Provider-error classifier mapping recognised overflow envelopes to `ContextOverflowError`; all other 4xx/5xx and network-level failures map to `TransportError`. Classifier inspects response body for the HTTP-200-with-error-envelope case. Token counts populated from provider payload digits when present, `null` otherwise. End-of-stream classification step runs even on mid-stream truncation; partial assistant text captured in `raw_response`. The four signatures are version-coupled to `@mariozechner/pi-ai` and tests use synthesised envelopes shaped exactly per the spec table, never live provider calls.
- **Tests.** One bullet per provider signature in the [Pi Integration Contract](../spec_topics/pi-integration-contract.md) table: synthesised `anthropic-messages` overflow → `ContextOverflowError` with provider-supplied `tokens_used`/`tokens_limit`; synthesised `openai-completions` HTTP 400 form → `ContextOverflowError` with provider-supplied counts; synthesised `openai-completions` HTTP 200 envelope (`error.code: "context_length_exceeded"`) recognised by body inspection (not classified as success); synthesised `mistral` overflow → `ContextOverflowError` with `tokens_used: null, tokens_limit: null`; synthesised `amazon-bedrock` overflow → `ContextOverflowError` with `tokens_used: null, tokens_limit: null`; recognised overflow payload lacking digit fields → `tokens_used: null, tokens_limit: null`; mid-stream truncation triggered by output hitting the context boundary → `Err({kind: "context_overflow", raw_response: "<partial>", ...})` at end-of-stream (not `validation`); a non-overflow 4xx → `TransportError`; a generic 5xx → `TransportError`; a network-level failure → `TransportError`. Cross-link: every assertion above also asserts zero `RuntimeEvent` emissions on the always-log channel (`context_overflow` is excluded from the always-log set per V18q). Cancellation-mid-stream remains scoped to V18a–V18e.
- **Deps.** V5g.
- **Ships when.** Every V1-supported provider's overflow envelope round-trips to `ContextOverflowError`; non-overflow provider failures fall through to `TransportError`.
