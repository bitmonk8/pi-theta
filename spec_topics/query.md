# Query

The `@`...`` query template is the only construct that crosses code → model. It is an **expression** that sends a user turn and returns the model's response wrapped in a `Result`.

**Untyped form** — `Ok` value is the assistant's text response as a `string`:

```loom
let critique = @`Critique this code:\n${code}`?
```

Return type: `Result<string, QueryError>`.

**Typed form** — the response schema is **inferred from the surrounding type context**. The runtime hands the schema to the provider as a structured-output / strict tool-input contract and validates the response with AJV before returning it. The most common form is type-annotated `let`:

```loom
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

Return type: `Result<Schema, QueryError>`, where `Schema` is the inferred response type.

**Schema inference rules.** The response schema flows into the query expression from any of the following type contexts, checked in order:

1. The annotated type of the binding being initialised (`let x: T = @`...`?`).
2. The declared return type of the enclosing function or loom, when the query is in tail-expression or `return`-argument position.
3. The declared parameter type of the enclosing call site (`f(@`...`?)` where `f`'s parameter has type `T`).
4. Explicit ascription via the explicit form (below).

If none apply, the query is untyped (returns `string`).

**Schema inference algorithm.** A query expression searches *outward* through its enclosing AST for a "type sink" — a position whose declared type can supply the schema. The walk is *shallow*: it crosses through context-preserving constructs but stops at any expression that consumes its operand without preserving its type. Concretely:

- **Crossed (transparent):** parenthesisation `(...)`; the RHS of `let x: T = ...`; function / tool / `invoke` arguments matched to a typed parameter; the tail expression of an enclosing function or loom whose return type is declared; the operand of `return`; the branches of a ternary `cond ? a : b` *if and only if* the ternary itself has a sink; the elements of an array literal `[a, b]` *if and only if* the literal has a sink (binding annotation, parameter type, etc.).
- **Stopped (opaque):** binary and unary operators (`+`, `==`, `!`, etc.); member access (`a.b`); indexed access (`a[i]`); the scrutinee of `match`; the condition of `if` / `while`; comparison and logical operators on either side. Inside these positions, only an explicit `@<Schema>`...`` ascription supplies a schema.

If the walk reaches a sink, that schema is the query's response type. If the walk reaches a stop without finding a sink, the query is untyped and returns `Result<string, QueryError>`. An explicit `@<Schema>` ascription wins regardless of where it appears.

*Worked examples:*

- `let x: ReviewScore = @\`...\`?` — sink at the binding annotation. ✅
- `f(g(@\`...\`?))` — `g`'s parameter type is the sink; `f`'s parameter type is not visible past `g`'s call boundary. ✅
- `let x = @\`...\`? + 1` — the `+` operator is opaque; the query has no sink and is untyped (returns `string`), then `+ 1` is a type error against `string`. Add `@<integer>` or annotate the binding to fix.
- `match @\`...\` { ... }` — `match` scrutinee is opaque; the query is untyped unless an explicit `@<Schema>` ascription is added. The grammar requires the explicit form here.
- `let xs: array<Score> = [@\`...\`?, @\`...\`?]` — the array literal has a sink (`array<Score>`), so each element inherits `Score` as its sink. ✅

**Explicit form** — `@<Schema>`...`` overrides inference. Required in any expression position with no usable type context, such as the scrutinee of `match`:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(_) => ReviewScore { value: 0, reason: "unrated" },
}
```

The explicit form also wins over inference: if both a binding annotation and an explicit `<Schema>` are present, the explicit one is used (with `loom/parse/explicit-schema-mismatch` warning if they disagree).

**Multi-line templates.** Backtick templates span as many lines as needed; there is no separate heredoc form. Loom applies two normalisations to the rendered text:

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

**Escapes.** Inside a query template:

- `\``    — literal backtick
- `\$`    — literal `$` (suppresses interpolation when followed by `{`)
- `\\`    — literal backslash
- `\n`, `\t`, `\r` — standard string escapes (rarely needed; literal newlines in the template body work directly)

No other escapes are recognised; a backslash followed by any other character is `loom/parse/illegal-template-escape`. EOF inside an unterminated template body surfaces as `loom/parse/unterminated-template`. Curly braces `{` and `}` need no escape — they are ordinary text content. Only the sequence `${` (and the `}` that closes a corresponding `${...}`) has special meaning.

**Discarded query results are a parse error (`loom/parse/discarded-query-result`).** The author must pick one of:

```loom
@`Summarise the discussion above.`?      // propagate failure via early-return
let _ = @`Summarise the discussion above.`  // discard both Ok and Err explicitly
let summary = @`Summarise the discussion above.`?  // bind the success value
```

The diagnostic on a bare `@`...`` expression-statement reads: *"discarded query result; use `?` to propagate failure or `let _ = @`...`` to discard explicitly."* The intent is to force the author to acknowledge the `Result` once, at the call site, with a one-character change.

`let _ = expr` is a real binding form for any expression — not just queries — making the same escape hatch available to any future `#[must_use]`-style type. A `void`-returning function whose **tail expression** is `@`...`` is not a discard: the `Result` is the function's return value and the caller is responsible for it. Only true expression-statement position triggers the error.

**Tool calls during a query.** If the model responds with tool-use, the runtime executes the requested tool against the loom's callable set, feeds the result back to the model, and loops until the model produces a final (non-tool-call) response. That final response is what the query returns. A response schema, if given, is enforced against the final response only — not against intermediate tool-call payloads.

**Untyped return type (V1).** The `Ok` payload of an untyped query is a plain `string` containing the assistant's final text. V1 deliberately keeps it as `string` to minimise surface area; freezing a richer structure before real provider integration would lock in details that real-world use is likely to revise. See [Future Considerations](./future-considerations.md).

**Failure modes.** A query never throws. Both forms return a `Result` (see [Errors and Results](./errors-and-results.md)) carrying a `QueryError` on failure. `QueryError` is a discriminated union (`anyOf` over `kind`-tagged variants), exactly the shape the [Schema Subset](./schema-subset.md) blesses for user-defined unions — the canonical example of the pattern, applied to Loom's own runtime type. The variants:

```loom
schema ValidationIssue {
  path: string,           // JSON pointer, e.g. "/issues/0/severity"
  message: string,        // human-readable summary of the failure
  schema_keyword: string  // "type", "required", "enum", "const", ...
}

schema ValidationError {
  kind: "validation",
  message: string,
  attempts: number,                          // coercion follow-ups made before giving up
  validation_errors: array<ValidationIssue>,
  raw_response: string | null                // final malformed assistant text
}

schema TransportError {
  kind: "transport",
  message: string,
  http_status: number | null,                // null on network-level failure (no HTTP response)
  provider: string,                          // "openai" | "anthropic" | ...
  retryable: boolean                         // whether the runtime considers a retry worth attempting
}

schema ToolFailureError {
  kind: "tool_failure",
  message: string,
  tool_name: string,
  tool_call_id: string,
  raw_response: string | null                // any text the model produced before the tool loop crashed
}

schema ContextOverflowError {
  kind: "context_overflow",
  message: string,
  tokens_used: number | null,
  tokens_limit: number | null
}

schema CancelledError {
  kind: "cancelled",
  message: string
}

schema QueryError = ValidationError
                  | TransportError
                  | ToolFailureError
                  | ToolCallError
                  | ContextOverflowError
                  | CancelledError
                  | InvokeFailure
                  | InvokeCalleeError
```

(`ToolCallError` is defined in [Tool Calls](./tool-calls.md); `InvokeFailure` and `InvokeCalleeError` are defined in [Invocation](./invocation.md). They are listed here only to complete the union.)

`ToolFailureError` and `ToolCallError` are deliberately *separate* variants for *separate* situations: `ToolFailureError` covers a tool that the **model** invoked during a query's tool-call loop (and so carries `tool_call_id` and a `raw_response` for any text the model emitted before the loop crashed); `ToolCallError` covers a tool that **loom code** invoked directly via `<name>(...)` (no model, no `raw_response`, but a structured `cause` enum). The shapes diverge because the contexts diverge.

Each variant carries only its meaningful fields; there are no null-padded sentinel fields shared across variants. Authors `match` on `QueryError { kind: "...", ... }` (pattern grammar from [Errors and Results](./errors-and-results.md)) and only the relevant variant's fields are in scope.

`validation_errors` is an `array<ValidationIssue>`, a Loom schema rather than raw AJV objects. This isolates Loom's surface from the AJV API: a future validator swap is not a breaking change.

`raw_response` only appears on variants where the model produced (or attempted to produce) a final text response. `cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response.

**Schema-validation coercion.** When a typed query's final response fails AJV validation, the runtime attempts **coercion via follow-up turns**, not by re-issuing the original query. This distinction matters: a query may have produced tool-call side effects (file writes, API calls, network requests) on the way to its malformed final response. Re-issuing the original user turn would risk firing those side effects a second time. Coercion instead appends a *new* user turn to the same conversation — phrased per the loom's `retry.methodology` — and awaits a corrected response. The conversation history, including the malformed response and any tool calls that preceded it, stays intact.

Coercion follow-ups are bounded by `retry.attempts` from frontmatter (default 3). When attempts are exhausted, the typed query returns `Err(QueryError { kind: "validation", ... })`. A coercion follow-up may itself trigger tool calls; the runtime services those the same way as in the original query, then validates the resulting response. Each follow-up counts as one against `retry.attempts` regardless of how many tool-call iterations it contains.

Non-validation failures (`transport`, `tool_failure`, etc.) are not retried by the query primitive; the loom is responsible for whatever recovery makes sense. Wrapping retries at the loom level via a function plus `match` is the expected pattern.
