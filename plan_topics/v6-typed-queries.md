# V6 — Typed queries, `Result`, `?`, schema inference

## V6a — `Ok` / `Err` constructors and `Result<T, E>` type

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (`Result` as user-visible type), [Runtime Value Model](../spec_topics/runtime-value-model.md) (`Result` representation).
- **Adds.** `Ok(value)` and `Err(error)` as expressions; `Result<T, E>` as a type expression; runtime representation distinguishes `Ok` and `Err` and carries the payload (concrete shape is an interpreter-internal detail, not a language surface).
- **Tests.** Construction and equality (`Ok(1) == Ok(1)`, `Ok(1) != Err(1)`, `Ok(1) != Ok(2)`); type checker rejects `Ok` as a value passed where a non-Result type is expected. Tests do not assert on specific discriminator or payload field names. Cross-linked from V18q — `?`-propagation of an always-log-set `Err` emits exactly one event at the originating site, not at each rethrow.
- **Deps.** V5g.
- **Ships when.** Loom code can construct and compare Result values.

## V6b — `?` operator desugaring

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (`?` operator).
- **Adds.** `expr?` desugars to `match expr { Ok(v) => v, Err(e) => return Err(e) }`. Enclosing function/loom must therefore return `Result<_, QueryError>` (or have it inferred).
- **Tests.** `?` on `Ok` unwraps; `?` on `Err` early-returns at the matching enclosing scope; `?` in a non-Result function is a parse error with the spec's hint. Cross-linked from V18q — `?`-propagation of an always-log-set `Err` through this operator emits exactly one event at the originating site, not at each rethrow.
- **Deps.** V6a.
- **Ships when.** Looms can use `?` to propagate failures.

## V6c — Schema inference: binding-annotation sink

- **Spec.** [Query](../spec_topics/query.md) (typed form, inference rule 1).
- **Adds.** `let x: T = @\`...\`?` infers `T` as the response schema for the query.
- **Tests.** Spec's worked example; nested annotation flows through parens; missing annotation falls through to next rule (later leaves).
- **Deps.** V4, V6b.
- **Ships when.** The most common typed-query pattern works.

## V6d — Schema inference: enclosing return-type sink

- **Spec.** [Query](../spec_topics/query.md) (inference rule 2).
- **Adds.** When a query is in tail-expression position of a function/loom whose return type is declared, that type supplies the schema.
- **Tests.** Function with declared `Result<T, QueryError>` return; query in tail position infers `T`; `return @\`...\`?` infers from declared return type.
- **Deps.** V6c, V9 (functions). *(Order: this leaf depends on V9a–V9e; reorder as needed.)*
- **Ships when.** Functions can be written without redundant annotations.

## V6e — Schema inference: enclosing call-site parameter-type sink

- **Spec.** [Query](../spec_topics/query.md) (inference rule 3).
- **Adds.** `f(@\`...\`?)` where `f`'s parameter is typed `T` infers `T`. Crosses a single call boundary; outer call's parameter is opaque past inner call's argument.
- **Tests.** Spec's `f(g(@\`...\`?))` example: `g`'s param is the sink, `f`'s isn't; tool-call argument as sink works the same way.
- **Deps.** V6c, V9.
- **Ships when.** Pipeline-style code reads cleanly.

## V6f — Schema inference: array-literal sink propagation

- **Spec.** [Query](../spec_topics/query.md) (worked example: array literal).
- **Adds.** `let xs: array<T> = [@\`...\`?, @\`...\`?]` propagates `T` to each element's query.
- **Tests.** Spec's example; mixed-type elements without sink → parse error.
- **Deps.** V6c, V2h.
- **Ships when.** Arrays of typed query results work.

## V6g — Schema inference: stop-set rule

- **Spec.** [Query](../spec_topics/query.md) (inference algorithm — opaque list).
- **Adds.** Walk stops at: binary/unary operators, member access, indexed access, `match` scrutinee, `if`/`while` condition. Inside these, only explicit `@<T>`...`` ascription supplies a schema.
- **Tests.** `let x = @\`...\`? + 1` is a type error (query untyped, returns `string`, `+ 1` mismatch); `match @\`...\` { ... }` is a type error without explicit ascription; each opaque position tested.
- **Deps.** V6c–V6f.
- **Ships when.** The walk's boundaries are predictable.

## V6h — Explicit `@<Schema>`...`` ascription

- **Spec.** [Query](../spec_topics/query.md) (explicit form).
- **Adds.** `@<T>`...`` syntax overrides inference; required in any position with no usable sink.
- **Tests.** Wins over inference (with parse warning if it disagrees with binding annotation); allowed in `match` scrutinee; parsed correctly when `T` is a generic like `array<Score>`.
- **Deps.** V6g.
- **Ships when.** Untypeable positions become typeable.

## V6i — AJV validation of typed query results (two-phase tool loop)

- **Spec.** [Query — Typed queries are tool-loop-shaped](../spec_topics/query.md), [Query — Tool-call loop bound](../spec_topics/query.md), [Errors and Results](../spec_topics/errors-and-results.md), [Pi Integration Contract — Conversation drive (prompt mode)](../spec_topics/pi-integration-contract.md), [Pi Integration Contract — Provider compatibility for typed queries](../spec_topics/pi-integration-contract.md), [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md), [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime) (V1 reference implementation of the typed-query mechanism).
- **Adds.** Inferred or explicit schema lowered to the synthesised `__loom_respond_<slug>` one-shot tool's `parameters`. The runtime registers the respond tool alongside the loom's frontmatter `tools:` set (per-mode wiring per [Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md)) and runs the **two-phase loop**: free phase with `tool_choice` unconstrained (model may call frontmatter tools, serviced and looped) until the model emits a plain text turn; then one forced respond turn (`options.toolChoice: { type: "tool", name }` via pi-ai) that calls the respond tool. The respond tool's `execute` AJV-validates against the original lowered JSON Schema; failure → `Err(QueryError {kind:"validation", attempts: 0, ...})`. Load-time check against the V1-supported provider set (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`) emits `loom/load/typed-query-unsupported-provider` (warning) when the resolved `model:` is outside the set; runtime returns `Err(QueryError { kind: "transport", retryable: false, ... })` for typed queries on those providers. No coercion follow-ups yet (V13g–j); no tool-loop cap enforcement yet (separate leaf below). No `before_provider_request` hook is installed in V1.
- **Tests.** Free-phase tool call (model invokes a frontmatter tool, runtime services it, model then emits text → forced respond turn fires) returns the validated value; pure text turn skips straight to the forced respond turn; valid respond payload unwraps; invalid respond payload yields `validation` error with `attempts: 0`, populated `validation_errors`, `raw_response: null`; AJV error path matches JSON-Pointer format; two typed queries with the same lowered response schema (across separate invocations of the same loom) trigger exactly one `pi.registerTool` call total in prompt mode (cache hit on the second); typed query in subagent mode triggers zero `pi.registerTool` calls; the user session's active-tool set after a prompt-mode typed-query completion equals the snapshot taken before the query (snapshot/restore around both phases); a typed query against a Gemini-routed model fails to load with the spec's warning code and returns the spec's `transport` error at runtime; the runtime calls `options.toolChoice` only on the forced respond turn and never on free-phase turns; the synthesised `__loom_respond_<slug>` `ToolDefinition` has `label: "Loom typed-query response"` (literal string, identical across all looms); its `parameters` is `Type.Unsafe<unknown>(loweredJsonSchema)` over the lowered response schema (same wrap shape as loom callees per V14e), with `Type.Unsafe` imported from the `typebox` peer dependency; the AJV validation on an invalid respond payload happens inside `ToolDefinition.execute` (asserted by direct `__loom_respond_<slug>.execute(badParams, ctx)` invocation bypassing Pi's lowering — the validation site is `execute`, not a post-Pi structural-type check) and reuses the V4a validator-cache key so the validator is not recompiled per call.
- **Deps.** V6c, V4, V14e.
- **Ships when.** Typed queries return typed values via the two-phase loop, free-phase tool calls work, unsupported providers fail loudly.

## V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`

- **Spec.** [Query — Tool-call loop bound](../spec_topics/query.md), [Parameters and Frontmatter — `tool_loop`](../spec_topics/frontmatter.md).
- **Adds.** `tool_loop: { max_iterations: N }` frontmatter parsing (default 25); per-query iteration counter that counts tool-call rounds (one round = model emits ≥1 `tool_use` blocks + runtime services them all + model produces next turn) and the forced respond turn (one slot). Exhaustion returns `Err(QueryError { kind: "tool_loop_exhausted", iterations: N, last_tool_name: <name | null>, raw_response: <text | null>, message: "tool-call loop exhausted" })`. Each coercion follow-up gets a fresh `tool_loop` budget (not a shared one). `max_iterations: 0` disables model-driven tool calls entirely.
- **Tests.** Out-of-the-box default is 25 (no frontmatter declaration); a loom that loops to exactly 25 succeeds, 26 fails with `tool_loop_exhausted`; `last_tool_name` is the tool from the terminal iteration when exhaustion fires on a free-phase turn, `null` when it fires on the forced respond turn (typed query whose model never picks the respond tool); `max_iterations: 0` causes the model to receive an empty `tools` set during the free phase; one round counts as one slot regardless of how many parallel tool calls the model emitted; cancellation pre-empts the loop at any iteration boundary regardless of remaining budget; coercion follow-ups (V13g) reset the counter.
- **Deps.** V6i, V13f (`tool_loop` is parsed alongside `coercion`).
- **Ships when.** No query can run away.

## V6j — `ValidationIssue` schema

- **Spec.** [Query](../spec_topics/query.md) (`ValidationIssue` shape).
- **Adds.** Loom-shaped `ValidationIssue { path, message, schema_keyword }` interposed between AJV and `validation_errors` so AJV swap is non-breaking.
- **Tests.** Each AJV error keyword (`type`, `required`, `enum`, `const`) maps to the right `schema_keyword`; path is JSON-Pointer.
- **Deps.** V6i.
- **Ships when.** Loom code never touches raw AJV objects.
