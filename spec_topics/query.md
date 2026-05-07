# Query

The `@`...`` query template is the only construct that crosses code → model. It is an **expression** that sends a user turn and returns the model's response wrapped in a `Result`.

## Untyped form

`Ok` value is the assistant's text response as a `string`:

```loom
let critique = @`Critique this code:\n${code}`?
```

Return type: `Result<string, QueryError>`.

## Typed form

The response schema is **inferred from the surrounding type context**. The runtime hands the schema to the provider as a structured-output / strict tool-input contract and validates the response with AJV before returning it. The most common form is type-annotated `let`:

```loom
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

Return type: `Result<Schema, QueryError>`, where `Schema` is the inferred response type.

### Schema inference rules

The response schema flows into the query expression from any of the following type contexts, checked in order:

1. The annotated type of the binding being initialised (`let x: T = @`...`?`).
2. The declared return type of the enclosing function or loom, when the query is in tail-expression or `return`-argument position.
3. The declared parameter type of the enclosing call site (`f(@`...`?)` where `f`'s parameter has type `T`).
4. Explicit ascription via the explicit form (below).

If none apply, the query is untyped (returns `string`).

### Schema inference algorithm

A query expression searches *outward* through its enclosing AST for a "type sink" — a position whose declared type can supply the schema. The walk is *shallow*: it crosses through context-preserving constructs but stops at any expression that consumes its operand without preserving its type. Concretely:

- **Crossed (transparent):** parenthesisation `(...)`; the RHS of `let x: T = ...`; function / tool / `invoke` arguments matched to a typed parameter; the tail expression of an enclosing function or loom whose return type is declared; the operand of `return`; the branches of a ternary `cond ? a : b` *if and only if* the ternary itself has a sink; the elements of an array literal `[a, b]` *if and only if* the literal has a sink (binding annotation, parameter type, etc.).
- **Stopped (opaque):** binary and unary operators (`+`, `==`, `!`, etc.); member access (`a.b`); indexed access (`a[i]`); the scrutinee of `match`; the condition of `if` / `while`; comparison and logical operators on either side. Inside these positions, only an explicit `@<Schema>`...`` ascription supplies a schema.

If the walk reaches a sink, that schema is the query's response type. If the walk reaches a stop without finding a sink, the query is untyped and returns `Result<string, QueryError>`. An explicit `@<Schema>` ascription wins regardless of where it appears.

*Worked examples:*

- `let x: ReviewScore = @\`...\`?` — sink at the binding annotation. ✅
- `f(g(@\`...\`?))` — `g`'s parameter type is the sink; `f`'s parameter type is not visible past `g`'s call boundary. ✅
- `let x = @\`...\`? + 1` — the `+` operator is opaque; the query has no sink and is untyped (returns `string`), then `+ 1` is a type error against `string`. Add `@<integer>` or annotate the binding to fix.
- `match @\`...\` { ... }` — `match` scrutinee is opaque; the query is untyped unless an explicit `@<Schema>` ascription is added. The grammar requires the explicit form here.
- `let xs: array<Score> = [@\`...\`?, @\`...\`?]` — the array literal has a sink (`array<Score>`), so each element inherits `Score` as its sink. ✅

### Explicit form

`@<Schema>`...`` overrides inference. Required in any expression position with no usable type context, such as the scrutinee of `match`:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(_) => ReviewScore { value: 0, reason: "unrated" },
}
```

The explicit form also wins over inference: if both a binding annotation and an explicit `<Schema>` are present, the explicit one is used (with `loom/parse/explicit-schema-mismatch` warning if the explicit `<Schema>` ascription is not compatible with the binding annotation under [Type System — Type compatibility](./type-system.md#type-compatibility) — i.e. `ascription ⋢ annotation`). The check fires in one direction only: a value the explicit form would produce that the binding annotation could not accept is the warned condition; a binding annotation wider than the ascription (a safe widening) is silently allowed. When either side is past the parser's static view (per [Type System — Unresolvable operands](./type-system.md#type-compatibility)), the warning is skipped and the runtime AJV check is the safety net.

*Test vectors (normative).*

- `let x: number = @<integer>\`Rate 1-5: ${q}\`?` — **no warning**. `integer ⊑ number` by Type-compatibility rule 2; the explicit form's value is acceptable to the binding.
- `let x: integer = @<number>\`...\`?` — **fires `loom/parse/explicit-schema-mismatch`**. `number ⋢ integer` (the explicit `number` could yield `3.5`, which the `integer` binding cannot accept).
- `let x: ReviewScore = @<ReviewScore>\`...\`?` — **no warning**. Reflexivity (rule 1).
- `let x: Animal = @<Cat>\`...\`?` where `schema Animal = Cat | Dog` — **no warning**. Variant-to-union (rule 4): `Cat ⊑ Animal`.

## Multi-line templates

Backtick templates span as many lines as needed; there is no separate heredoc form. Loom applies two normalisations to the rendered text:

- **Newline trim.** A newline immediately after the opening backtick is stripped; a newline immediately before the closing backtick is stripped. This makes the natural-looking form produce clean text:

  ```loom
  let plan: Plan = @`
    The author is ${author.name}, a ${author.role}
    with ${author.experience_years} years of experience.
    Produce a review plan tailored to that level.
  `?
  ```

  renders as `"  The author...\n  with...\n  Produce..."` *before* dedent.

- **Dedent.** Loom strips the common leading whitespace shared by every non-blank line of the rendered text (Python's `textwrap.dedent` algorithm). The example above renders as `"The author...\nwith...\nProduce..."` after dedent. Authors writing prompts inside indented code blocks therefore do not pay an indent tax in what the model sees.

Dedent and newline-trim apply uniformly to every `@`...`` template regardless of length — single-line templates have no leading whitespace and no internal newlines, so the rules are no-ops in that case.

### Degenerate rendered templates

Two layers defend against sending the provider a turn that contains no useful text:

- **Parse-time warning** (`loom/parse/empty-template`, severity *warning*): if a template's *static* body — every literal segment between interpolations, after newline-trim and dedent — is empty or whitespace-only, the parser emits a one-line warning at the template's source location. The loom still loads. Authors who genuinely intend a whitespace-only prompt can suppress the warning by writing an explicit literal escape (`\n`).
- **Runtime short-circuit:** immediately before the user turn would be issued, if the *fully-rendered* text (post-interpolation, post-newline-trim, post-dedent) has length 0 or matches the regular expression `^\s*$`, the query short-circuits to `Err(QueryError { kind: "validation", cause: "empty_template", message: "rendered query template is empty", attempts: 0, validation_errors: [], raw_response: null })` without consuming a provider round-trip. The empty-template short-circuit emits the `cause: "empty_template"` arm of `ValidationError` (see [Errors and Results — ValidationError](./errors-and-results.md)) so it is observably distinct on the wire from a `cause: "schema_validation"` failure even though both share `kind: "validation"`. The short-circuit fires equally on the original turn and on any respond-repair follow-up turn (defensive — should not occur for follow-ups, since the runtime constructs them); a follow-up that short-circuits does **not** consume an `attempts` slot. An empty-template short-circuit on the original user turn of a typed query MUST NOT trigger the respond-repair path: zero respond-repair follow-up turns are issued, no follow-up user turn is appended to the conversation history, and the returned `ValidationError.attempts` is 0 regardless of `respond_repair.attempts` and `respond_repair.methodology`. Rationale: respond-repair repairs a malformed model response (see Schema-validation respond-repair); the short-circuit is the runtime refusing input it constructed itself, before any model response exists, so there is nothing for a follow-up turn to repair.

Oversized rendered templates have no pre-flight bound in V1; they pass through to the provider and are detected reactively via the provider's overflow error envelope (see `ContextOverflowError` below).

### Dedent and newline-trim — normative behaviour

The two normalisations are applied in a fixed order: **newline-trim first**, then **dedent**. The normative reference is the behaviour of CPython 3.x `textwrap.dedent` *as illustrated by the table below*; an implementer who cannot read the CPython source can still pass the conformance tests from the spec alone. Three behaviours of `textwrap.dedent` matter for the rendered prompt the model sees:

1. Whitespace-only lines are ignored when computing the common prefix and are normalised to an empty line in the output. A "blank" line that contains stray spaces still dedents as if it were empty.
2. The common prefix is the longest common literal prefix of the non-blank lines, not a visual column. A template that mixes tab-indented and space-indented lines has no shared prefix; nothing is stripped.
3. Tab-only and space-only indentation are stripped uniformly — the prefix being stripped is whatever bytes are common across all non-blank lines.

The following input → output pairs are normative. `\n` and `\t` denote literal newline and tab bytes inside the source between the backticks; they are not escape sequences interpreted by the loom parser (a literal newline or tab in the source has the same effect).

| # | Template (between backticks) | Rendered text |
|---|---|---|
| 1 | `` @`\n    The author...\n    with...\n    Produce...\n` `` | `"The author...\nwith...\nProduce..."` |
| 2 | `` @`\n    a\n      \n    b\n` `` | `"a\n\nb"` |
| 3 | `` @`\n\t\tx\n\t\ty\n` `` | `"x\ny"` |
| 4 | `` @`\n\tx\n  y\n` `` | `"\tx\n  y"` |
| 5 | `` @`  hi` `` | `"  hi"` |
| 6 | `` @`\n` `` | `""` |
| 7 | `` @`\n    only\n` `` | `"only"` |

Vector commentary:

1. Multi-line, uniform space indent — the worked example above, restated as a normative vector.
2. The whitespace-only middle line is normalised to an empty line and does not constrain the common prefix; the four-space prefix shared by `a` and `b` is stripped.
3. Tab-only indentation is stripped exactly when it forms the common prefix.
4. Mixed tab and space indentation share no literal prefix, so nothing is stripped and the model sees the indentation verbatim.
5. A single-line template has no internal newlines for newline-trim to act on and exactly one line for dedent to consider, so any leading whitespace inside the backticks is preserved.
6. A template that consists solely of a single newline becomes the empty string after newline-trim; dedent on the empty string is the empty string. (How the runtime treats an empty rendered template — error, warning, or silent send — is decided separately; see the discussion of empty rendered templates and their downstream handling.)
7. Newline-trim removes the leading newline and the newline immediately before the closing backtick, leaving the single line `    only`; dedent then strips the four-space common prefix, yielding `"only"`. This pins the order: newline-trim first, dedent second.

Newline-trim strips a newline only when it sits **immediately** after the opening backtick or **immediately** before the closing backtick. A trailing `\n` followed by whitespace before the closing backtick (e.g. `\n    only\n  `) is not trimmed; the trailing whitespace-only line is then handled by dedent's whitespace-only-line normalisation (it does not contribute to the common prefix and is rendered as an empty line).

## Escapes

Inside a query template:

- `\``    — literal backtick
- `\$`    — literal `$` (suppresses interpolation when followed by `{`)
- `\\`    — literal backslash
- `\n`, `\t`, `\r` — standard string escapes (rarely needed; literal newlines in the template body work directly)

No other escapes are recognised; a backslash followed by any other character is `loom/parse/illegal-template-escape`. EOF inside an unterminated template body surfaces as `loom/parse/unterminated-template`. Curly braces `{` and `}` need no escape — they are ordinary text content. Only the sequence `${` (and the `}` that closes a corresponding `${...}`) has special meaning.

## Stringification of interpolated values

A `${expr}` interpolation evaluates `expr` per the [Expression Sublanguage](./expressions.md) and renders the result into the prompt text by the **Loom static type** of the expression — *not* by JavaScript's default `String(...)`, whose `[object Object]` and comma-joined-array defaults would silently corrupt prompts without any diagnostic for the author. The same rule applies to the bare-path `${param}` / `${param.field}` form in the frontmatter `system:` field (see [Parameters and Frontmatter — `system` Interpolation](./frontmatter.md)); the `system:` slot's grammar restricts only the *expression* shape (to bare identifier paths), not the *stringification* of the resolved value.

| Loom static type | Rendered as |
|---|---|
| `string` | the value itself, no quoting, no escaping |
| `integer` | shortest decimal (`42`, `-7`); never scientific notation |
| `number` | shortest round-trip decimal (`3.14`, `-0.5`); `NaN` → `NaN`; `Infinity` → `Infinity`; `-Infinity` → `-Infinity` |
| `boolean` | `true` / `false` |
| `null` | the literal text `null` |
| Enum variant | the variant's **wire** value, unquoted (the enum brand from [Runtime Value Model](./runtime-value-model.md) is dropped — the model only ever sees wire forms) |
| `array<T>` | `JSON.stringify` of the value, **compact** (no pretty-printing), with [wire-name translation](./runtime-value-model.md) applied recursively |
| Schema-typed object | `JSON.stringify` of the value, **compact** (no pretty-printing), with [wire-name translation](./runtime-value-model.md) applied recursively |
| `Result<T, E>` | parse error `loom/parse/interpolated-result` — *"`Result` value cannot be interpolated; unwrap with `?` or `match` first"* |

Notes:

- The `Result` rejection is **static**, resolved from the expression's type, and fires even when the `Result`-valued expression sits behind a function call whose return type the parser can resolve. When the type is unresolvable (e.g. an inferred binding that widens past the parser's view), the runtime renderer falls back to a panic carrying the same `loom/parse/interpolated-result` diagnostic code — the same "static where possible, runtime where not" posture used elsewhere for tool-call argument typing.
- Wire-name translation for objects and arrays uses the **outbound** translation pass defined in [Runtime Value Model — Wire-name translation](./runtime-value-model.md). There is no second translation map for interpolation: the loom-side identifiers an author writes never appear in the rendered prompt.
- Stringification runs **after** expression evaluation but **before** newline-trim and dedent, so the multi-line text that an object or array interpolation introduces participates in the dedent computation like any other content. Authors who need a particular layout interpolate a pre-formatted `string`.
- Whitespace-only and empty renderings get no special treatment at the per-slot level here; the question of whether a *fully-rendered* template is degenerate is decided separately (see the discussion of empty rendered templates in this file's overall handling).
- Interpolation is the spec's blessed escape hatch for value-to-text conversion: the `+`-operator advice in [Expressions](./expressions.md) ("interpolate inside a string" in place of mixed-type `+`) relies on this rule existing.

## Discarded query results are a parse error (`loom/parse/discarded-query-result`)

The author must pick one of:

```loom
@`Summarise the discussion above.`?      // propagate failure via early-return
let _ = @`Summarise the discussion above.`  // discard both Ok and Err explicitly
let summary = @`Summarise the discussion above.`?  // bind the success value
```

The diagnostic on a bare `@`...`` expression-statement reads: *"discarded query result; use `?` to propagate failure or `let _ = @`...`` to discard explicitly."* The intent is to force the author to acknowledge the `Result` once, at the call site, with a one-character change.

`let _ = expr` is a real binding form for any expression — not just queries — making the same escape hatch available to any future `#[must_use]`-style type. A `void`-returning function whose **tail expression** is `@`...`` is also a discard with the same observability contract as the expression-statement form: the `void` return type means the caller has no `Result` to handle, so the `Err` is suppressed at the user-facing surface and emitted on the operator-facing channel exactly as in the explicit `let _ =` case. Only the bare expression-statement position (no `let _ =`, no `?`, no annotation) triggers the parse error.

## Observability of discarded results

`let _ = @`...`` (and the equivalent `void`-tail form) is a true discard at the *user-facing* surface: no `loom-system-note` is rendered to the user's transcript, no `Result` flows to the caller, and the loom continues. On the *operator-facing* surface, an `Err` from a discarded query is preserved as a runtime event on the always-log set defined in [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md). The event carries the same `kind`, `code`, `message`, and (where defined) `attempts` / `tokens_used` fields the user-facing note would have carried, plus the source location of the discarding `let _ =`; it is delivered through the same `loom-system-note` channel as user-facing notes but with `display: false` so log scrapers, replay tools, and `/tree` navigation can recover it without rendering it inline. The runtime event fires exactly once per discarded `Err`, regardless of how many tool-call rounds or respond-repair follow-ups the underlying query consumed. `Ok` discards produce no event (nothing to observe).

### Panics during interpolation are not caught by `let _ =`

A `${expr}` interpolation can trip any of the runtime panics in [Errors and Results — Runtime panics](./errors-and-results.md) (non-exhaustive `match`, OOB, null/missing-key access). Panics arise during evaluation of the RHS and propagate before the `let _ =` binding completes; the discard form does not contain them. Authors who need a query-rendering site to be panic-safe must guard the interpolated expressions individually.

## Tool calls during a query

If the model responds with tool-use, the runtime executes the requested tool against the loom's callable set, feeds the result back to the model, and loops until the model produces a final (non-tool-call) response or the round cap fires (see **Tool-call loop bound** below). That final response is what the query returns. A response schema, if given, is enforced against the final response only — not against intermediate tool-call payloads. The lifetime and visibility of the loom's callable set (including the typed-query `__loom_respond_<slug>` tool when a schema is in force) is governed by [Pi Integration Contract — Tool-registration lifetime and visibility](./pi-integration-contract.md): subagent-mode queries see the callable set via `customTools` on the spawned `AgentSession`; prompt-mode queries see it via a `pi.setActiveTools` snapshot/restore around the turn, so the user's bare session never inherits the loom's callable set.

## Typed queries are tool-loop-shaped

A typed query is an ordinary tool-loop conversation whose *final* response is structured. The runtime presents the loom's frontmatter `tools:` to the model alongside a synthesised one-shot respond tool (`__loom_respond_<slug>`, see [Implementation Notes — Runtime](./implementation-notes.md#runtime)) and runs a **two-phase** loop:

1. *Free phase.* Each turn, the model may call any frontmatter tool (serviced and looped, exactly as for an untyped query) or emit a plain text turn. Tool calls in this phase satisfy `frontmatter.md`'s "available to the model during query-time tool loops" guarantee and can surface `ModelToolError` exactly as for untyped queries.
2. *Forced respond turn.* Once the model emits a plain text turn (provider stop reason `end_turn` / `stop`), the runtime issues one additional follow-up user turn — *"Return your final answer using the `__loom_respond_<slug>` tool, conforming to this schema: …"* with the lowered response schema inlined — and forces the provider's tool choice to the respond tool for that turn. The respond tool's `execute` AJV-validates the call payload against the lowered response schema and resolves the query's promise with the validated value.

The forced respond turn counts against the same round cap as free-phase turns (one slot, not zero). Respond-repair follow-ups (see **Schema-validation respond-repair** below) restart the *whole* two-phase loop — the model may need to retool (re-read a file, re-issue a search) before answering the repair request — and each follow-up gets a fresh `tool_loop` budget. Provider stop reasons other than `end_turn` / `stop` / `tool_use` (e.g. `length`, content filter) surface as `transport` or `context_overflow` per the existing classification rules.

The technique used to obtain the structured payload is provider-specific (synthesised one-shot tool + forced tool choice for the V1 reference; native structured output where supported in future revisions); the *behavioural* contract above is what authors and tests rely on. Provider compatibility is bounded by **Provider compatibility for typed queries** in [Pi Integration Contract](./pi-integration-contract.md).

## Tool-call loop bound

Every query — untyped, typed, and any respond-repair follow-up — runs its tool-call loop under a per-query round cap configured by the loom's `tool_loop` frontmatter block (see [Parameters and Frontmatter — `tool_loop`](./frontmatter.md)). The cap counts *tool-call rounds* (one round = the model emits one or more `tool_use` blocks, the runtime executes them all in parallel where the provider supports parallel tool calls, feeds the results back, and the model produces its next turn) — a model that emits three parallel tool calls in one round consumes one slot. The forced respond turn for typed queries also consumes one slot. When the cap is reached without the model producing a terminating turn (a plain text turn for untyped queries, a respond-tool call for typed queries), the runtime returns `Err(QueryError { kind: "tool_loop_exhausted", ... })` with the fields documented in **Failure modes** below. Cancellation via `AbortSignal` (see [Cancellation](./cancellation.md)) preempts the loop at any round boundary; the cap is a ceiling, not a floor. Each respond-repair follow-up gets a *fresh* `tool_loop` budget — the existing rule that "each follow-up counts as one against `respond_repair.attempts` regardless of how many tool-call rounds it contains" composes naturally with this.

### Untyped return type (V1)

The `Ok` payload of an untyped query is a plain `string` containing the assistant's final text. V1 deliberately keeps it as `string` to minimise surface area; freezing a richer structure before real provider integration would lock in details that real-world use is likely to revise. See [Future Considerations](./future-considerations.md).

## Options surface

> **V1 seam — per-call timeout / per-query overrides.** The runtime-internal options record passed into the query primitive — the record carrying per-call configuration not surfaced to authors in V1 (cancellation hookup, provider routing, the typed-query schema slot) — is an **open struct**, not a closed positional record. V1 reserves the right to add fields in a minor revision without breaking call sites or test fixtures that construct or pattern-match on the struct; consumers MUST tolerate unknown fields rather than enforcing exhaustive shape equality. The seam is what allows the deferred per-call timeout and per-query `model` / `tools` / `system` override extensions in [Future Considerations](./future-considerations.md) to land additively.

## Failure modes

A query never throws. Both forms return a `Result` (see [Errors and Results](./errors-and-results.md)) carrying a `QueryError` on failure. `QueryError` is a discriminated union (`anyOf` over `kind`-tagged variants), exactly the shape the [Schema Subset](./schema-subset.md) blesses for user-defined unions — the canonical example of the pattern, applied to Loom's own runtime type.

The canonical declaration of `QueryError` and every variant it carries lives in [Errors and Results — QueryError variants](./errors-and-results.md#queryerror-variants). The six **query-time** variants — `ValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `CancelledError`, `ToolLoopExhaustedError` — are the ones a query primitive can return on its own; `CodeToolError` (defined for code-side `<name>(args)` failures) and `InvokeInfraError` / `InvokeCalleeError` (defined for invoked callees) round out the union but originate at the call sites covered by [Tool Calls](./tool-calls.md) and [Invocation](./invocation.md).

`ModelToolError` is the model-loop counterpart to `CodeToolError`: it covers a tool the **model** invoked inside a query's tool-call loop (and carries `tool_call_id` plus a `raw_response`), while `CodeToolError` covers a tool that **loom code** invoked directly. The shapes diverge because the contexts diverge.

### Detection of `ContextOverflowError`

The runtime maps recognised provider "context window exceeded" error responses to this variant — concretely, payloads matching one of the per-provider signatures listed in [Pi Integration Contract — Provider error mapping](./pi-integration-contract.md). All other 4xx and 5xx responses map to `TransportError`. `tokens_used` and `tokens_limit` are populated when the provider supplies them in the error payload, and `null` otherwise; pre-flight token estimation is out of V1 scope (see [Future Considerations](./future-considerations.md)). Detection runs at end-of-stream for streamed responses; mid-stream errors are still classified at end-of-stream. A streamed response truncated mid-emission because the *output* hit the context boundary is classified as `context_overflow` (not `validation`), with `raw_response` set to the partial text. A provider that returns the overflow as an HTTP 200 with an error envelope is recognised by inspecting the body, not only the status. Recognised-overflow payloads with no token-count fields surface `tokens_used: null, tokens_limit: null` — that is the documented `null` condition, not a missing implementation.

## Schema-validation respond-repair

When a typed query's final response fails AJV validation, the runtime attempts **respond-repair via follow-up turns**, not by re-issuing the original query. This distinction matters: a query may have produced tool-call side effects (file writes, API calls, network requests) on the way to its malformed final response. Re-issuing the original user turn would risk firing those side effects a second time. Respond-repair instead appends a *new* user turn to the same conversation — phrased per the loom's `respond_repair.methodology` — and awaits a corrected response. The conversation history, including the malformed response and any tool calls that preceded it, stays intact. The mechanism is configured by the loom's `respond_repair:` frontmatter block (see [Parameters and Frontmatter](./frontmatter.md)).

Respond-repair follow-ups are bounded by `respond_repair.attempts` from frontmatter (default 3). When attempts are exhausted, the typed query returns `Err(QueryError { kind: "validation", cause: "schema_validation", ... })` — terminal exhaustion is always the `schema_validation` arm of `ValidationError` (see [Errors and Results — ValidationError](./errors-and-results.md)). A respond-repair follow-up may itself trigger tool calls; the runtime services those the same way as in the original query, then validates the resulting response. Each follow-up counts as one against `respond_repair.attempts` regardless of how many tool-call rounds it contains.

### Follow-up turn templates (normative)

Each non-`none` respond-repair methodology emits its follow-up as a **user-role turn** appended to the conversation (per the "appends a *new* user turn" rule above — never as a system turn). Renderers MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated. Wording changes — including whitespace inside the template body — are spec-versioned breaking changes.

*Placeholders.*

- `<ajv-summary>` is rendered by the AJV helper `errorsText(errors, { separator: '; ' })` with the data-path prefix retained, the same renderer fixed in [Binder — Failure-mode templates (normative)](./binder.md#failure-mode-templates-normative). On a multi-attempt sequence (attempts 2, 3, …), each follow-up's `<ajv-summary>` reflects only the **most recent** failed attempt's AJV errors — never a cumulative concatenation across attempts.
- `<schema-json>` is `JSON.stringify(schema, null, 2)` over the **lowered** response schema (the JSON Schema actually handed to AJV per [Schema Subset](./schema-subset.md)), not the source-Loom-type form. The lowered form is canonical because it is the only form the model has seen during the original turn (via the synthesised respond tool's `parameters`); the lowering pipeline emits keys in deterministic order, so the serialisation is reproducible byte-for-byte across runs.
- `<slug>` is the schema slug of the lowered response schema, identical to the slug used for the synthesised `__loom_respond_<slug>` tool name (see [Schema Subset — Canonical schema hash](./schema-subset.md#canonical-schema-hash)). Tying both sites to the same source-of-truth keeps the follow-up turn's tool reference byte-equal to the tool name actually registered.

*Templates.* One template per non-`none` methodology. The fenced body of each block is the verbatim user-turn text — every character between the opening and closing fence (including the single U+000A line feed shown between the instruction sentence and the `<schema-json>` placeholder, and the literal U+0060 backtick characters around `__loom_respond_<slug>`) is part of the emitted text. The opening and closing fence lines themselves are not emitted.

`validator_error`:

~~~text
Your previous response did not match the required schema. Validation errors: <ajv-summary>. Return your final answer using the `__loom_respond_<slug>` tool, conforming to this schema:
<schema-json>
~~~

`schema_repeat`:

~~~text
Your previous response did not match the required schema. Return your final answer using the `__loom_respond_<slug>` tool, conforming to this schema:
<schema-json>
~~~

`none` is excluded — no follow-up is issued, so there is no template to specify; the `respond_repair.methodology: none` bullet in [Parameters and Frontmatter](./frontmatter.md) carries the full contract for that case.

### Non-validation failures during a respond-repair follow-up

A follow-up turn is a full provider round-trip and can fail for any reason the original turn could fail for — transport, cancellation, tool failure, context overflow, invoke failure, invoke-callee error. The runtime handles such failures uniformly:

- The proximate failure **propagates as the corresponding `QueryError` variant** (`transport`, `cancelled`, `model_tool`, `tool_loop_exhausted`, `context_overflow`, `invoke_failure`, `invoke_callee_error`) and **terminates respond-repair immediately**. The query does not return `validation` with the prior attempt count when the actual failure was, say, transport; the proximate cause wins.
- A follow-up that fails for a non-validation reason **does not consume an `attempts` slot**. `attempts` counts only follow-ups that produced an assistant response which was then re-validated (whether successfully or not). Rationale: `attempts` is the bound on *respond-repair*, not on incidental infrastructure failure; consuming a slot for a transport blip would silently shorten the repair budget on retry.
- `context_overflow` **short-circuits respond-repair permanently** for the lifetime of that typed query. Once detected on any turn — original or follow-up — the runtime returns `Err({ kind: "context_overflow", ... })` without issuing further follow-ups, because the conversation only grows and subsequent attempts cannot succeed.
- **Conversation-history cleanup:** the malformed assistant response and any tool-call traffic that preceded it remain in history (consistent with the "history stays intact" rule above). The follow-up user turn that triggered the propagated failure also remains; nothing is rolled back. Subagent-mode looms see the partial transcript via the same conversation handle on their next query.

Edge cases: a follow-up's *own* tool-call loop may fail with `model_tool` mid-loop, before any final assistant text — that is a non-`schema_validation` cause and follows the rule above (propagate, do not consume `attempts`, do not retry). The same rule applies to an empty-template short-circuit observed on a follow-up turn (defensive — the runtime constructs follow-ups, so this should not occur, but if it does the `cause: "empty_template"` follow-up does not consume an `attempts` slot either). `respond_repair.methodology: none` (equivalent to `attempts: 0`) means there is no follow-up to fail and the rule is a no-op. The `ValidationError.attempts` field returned on terminal exhaustion still reflects the number of *re-validated* follow-ups, which under this rule equals `respond_repair.attempts` exactly when exhaustion is the cause.

Non-validation failures on the **original** response (i.e. before any respond-repair follow-up has been issued) are likewise not retried by the query primitive; the loom is responsible for whatever recovery makes sense. Wrapping retries at the loom level via a function plus `match` is the expected pattern.
