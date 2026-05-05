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

## V6i — Synthesised respond tool: schema lowering, AJV-validating `execute`, per-mode wiring

- **Spec.** [Query — Typed queries are tool-loop-shaped](../spec_topics/query.md), [Errors and Results](../spec_topics/errors-and-results.md), [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md), [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm), [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime).
- **Adds.** The inferred / explicit response schema is lowered (via V4) into a `Type.Unsafe<unknown>` wrapper that becomes the `parameters` of a `__loom_respond_<sha12>` `ToolDefinition` with `label: "Loom typed-query response"`. The `execute` AJV-validates `params` against the original lowered JSON Schema and returns the parsed value or `Err(QueryError {kind:"validation", attempts: 0, validation_errors: [...], raw_response: null})`, reusing the V4a validator-cache key so the validator is not recompiled per call. Per-mode wiring uses H4's plumbing: subagent mode appends the `ToolDefinition` to `customTools` on `createAgentSession`; prompt mode passes through H4's `Map<schema-hash, registeredToolName>` cache (one `pi.registerTool` per unique lowered-schema hash, content-addressed name, cache hits reuse). No loop machinery yet — the respond tool is exercised directly in tests.
- **Tests.** Lowered schema appears verbatim in `parameters` (`Type.Unsafe<unknown>(loweredJsonSchema)`, with `Type.Unsafe` imported from the `typebox` peer dependency); `label` is the literal string `"Loom typed-query response"`, identical across all looms; valid payload unwraps; invalid payload yields `validation` error with `attempts: 0`, populated `validation_errors`, `raw_response: null` (asserted by direct `__loom_respond_<slug>.execute(badParams, ctx)` invocation bypassing Pi's lowering — the validation site is `execute`, not a post-Pi structural-type check); AJV path is JSON-Pointer-shaped; two construction calls with the same lowered schema produce one cached `pi.registerTool` call total in prompt mode, zero in subagent mode; subagent path passes the tool through `customTools`.
- **Deps.** V6c, V4, H4.
- **Ships when.** The respond tool exists, validates payloads, and is wired into the right surface for each mode.

## V6l — Two-phase tool-loop driver for typed queries

- **Spec.** [Query — Typed queries are tool-loop-shaped](../spec_topics/query.md), [Pi Integration Contract — Conversation drive (prompt mode)](../spec_topics/pi-integration-contract.md).
- **Adds.** The driver runs the free phase with `tool_choice` unconstrained (model may call frontmatter tools, runtime services them and loops) until the model emits a plain text turn, then issues exactly one forced respond turn via `options.toolChoice: { type: "tool", name: <respondToolName> }` (pi-ai). Wraps the whole exchange in `withActiveTools([...frontmatterCallableSet, respondToolName], ...)` so the respond tool is visible to the model only for the duration of this query (prompt mode); for subagent mode the respond tool is already in `customTools` from V6i. No coercion follow-ups (V13g–j); no `tool_loop` cap (V6k).
- **Tests.** Free-phase tool call (model invokes a frontmatter tool, runtime services it, model emits text → forced respond turn fires) returns the validated value; pure text turn skips straight to the forced respond turn; `options.toolChoice` is set only on the forced respond turn and never on free-phase turns; user session's active-tool set after a prompt-mode typed-query completion equals the snapshot taken before the query (snapshot/restore around both phases, including on `Err`, panic, cancellation).
- **Deps.** V6i, V14e (frontmatter callable wiring is required to test free-phase tool calls). *(Order: V14e lands later; this leaf is implementable earlier against fakes but its Ships-when gate observes a real frontmatter tool call.)*
- **Ships when.** Typed queries return typed values via the two-phase loop and free-phase tool calls work.

## V6m — Typed-query provider compatibility check

- **Spec.** [Pi Integration Contract — Provider compatibility for typed queries](../spec_topics/pi-integration-contract.md), [Pi Integration Contract — Provider error mapping](../spec_topics/pi-integration-contract.md).
- **Adds.** At loom-load time, when a loom contains any typed-query expression and its resolved `model:` routes through a provider outside the V1 supported set (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`), emit `loom/load/typed-query-unsupported-provider` (warning) naming the offending provider. At runtime, a typed query against such a provider returns `Err(QueryError { kind: "transport", retryable: false, ... })` without contacting the model.
- **Tests.** Each supported provider passes load with no warning; a Gemini-routed model raises the warning at load and the runtime returns the spec's `transport` error without a network call; warning carries the documented code; provider set is enumerated from a single source (no string duplication across the load path and the runtime path).
- **Deps.** V6i.
- **Ships when.** Typed queries on unsupported providers fail loudly at load and at runtime.

## V6j — `ValidationIssue` schema

- **Spec.** [Query](../spec_topics/query.md) (`ValidationIssue` shape).
- **Adds.** Loom-shaped `ValidationIssue { path, message, schema_keyword }` interposed between AJV and `validation_errors` so AJV swap is non-breaking.
- **Tests.** Each AJV error keyword (`type`, `required`, `enum`, `const`) maps to the right `schema_keyword`; path is JSON-Pointer.
- **Deps.** V6i.
- **Ships when.** Loom code never touches raw AJV objects.

## V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`

- **Spec.** [Query — Tool-call loop bound](../spec_topics/query.md), [Parameters and Frontmatter — `tool_loop`](../spec_topics/frontmatter.md).
- **Adds.** `tool_loop: { max_iterations: N }` frontmatter parsing (default 25); per-query iteration counter that counts tool-call rounds (one round = model emits ≥1 `tool_use` blocks + runtime services them all + model produces next turn) and the forced respond turn (one slot). Exhaustion returns `Err(QueryError { kind: "tool_loop_exhausted", iterations: N, last_tool_name: <name | null>, raw_response: <text | null>, message: "tool-call loop exhausted" })`. Each coercion follow-up gets a fresh `tool_loop` budget (not a shared one). `max_iterations: 0` disables model-driven tool calls entirely.
- **Tests.** Out-of-the-box default is 25 (no frontmatter declaration); a loom that loops to exactly 25 succeeds, 26 fails with `tool_loop_exhausted`; `last_tool_name` is the tool from the terminal iteration when exhaustion fires on a free-phase turn, `null` when it fires on the forced respond turn (typed query whose model never picks the respond tool); `max_iterations: 0` causes the model to receive an empty `tools` set during the free phase; one round counts as one slot regardless of how many parallel tool calls the model emitted; cancellation pre-empts the loop at any iteration boundary regardless of remaining budget; coercion follow-ups (V13g) reset the counter.
- **Deps.** V6l, V13f (`tool_loop` is parsed alongside `coercion`).
- **Ships when.** No query can run away.
