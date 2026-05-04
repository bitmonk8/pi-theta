# Future Considerations

Features deliberately deferred from V1, organised by the kind of decision V1 must make about each. The buckets answer two questions: which V1 surfaces must leave a forward-compatible seam, and which items are post-V1 work that V1 is *not* expected to anticipate.

The categories are:

1. **Tooling deferrals (no V1 impact).** Items that ship as new tools or commands and require no V1 runtime decision.
2. **Surface extensions (V1 leaves a seam).** Items that extend a V1 type, struct, or call shape in a backward-compatible way. Each item names the V1 seam it needs.
3. **Model-level changes (no V1 seam expected).** Items that change the runtime value model, evaluation model, or tool-result contract enough that V1 is not expected to anticipate them; adding them post-V1 will require a migration.

Items occasionally carry a `Depends on:` annotation where they presuppose another item in the list.

---

## Tooling deferrals (no V1 impact)

- **LSP support** for `.loom` and `.warp` files (syntax highlighting, type checking, autocomplete).
- **`loom test` command** for dry-run execution that runs a loom against a recorded transcript or a stub model without hitting a live provider.
- **Richer runtime-event telemetry** — per-loom token aggregation, latency histograms, cost reporting, retention policies, and a consumer-facing read API for the `details: { event }` stream defined in [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md). V1 ships only the per-occurrence emission and the `RuntimeEvent` payload shape; downstream consumers in V1 read from Pi's session transcript via existing surfaces.

---

## Surface extensions (V1 leaves a seam)

- **Per-call timeouts** on queries, tool calls, and invokes (V1 has only AbortSignal-driven cancellation; cf. [Cancellation](./cancellation.md)).
  *Seam:* the query-options / tool-call-options / invoke-options struct must be open to additional fields, not a closed positional record.
- **Pre-flight token-count check** before the runtime issues a user turn, so oversized rendered templates surface as `ContextOverflowError` without a wasted provider round-trip.
  *Seam:* `ContextOverflowError`'s `tokens_used` and `tokens_limit` fields are already nullable and population-rule documented per [Query](./query.md); a pre-flight path can populate them from the local estimate rather than from the provider error envelope without changing the variant shape.
- **Typed-query support for providers without named-tool forcing** (Gemini, OpenAI Responses, weak local models) via a JSON-mode / system-prompt fallback. V1 narrows typed queries to providers where pi-ai exposes named-tool forcing (per [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md)) and rejects unsupported providers with a load-time warning.
  *Seam:* the V1-supported provider set is a single named runtime constant; widening it adds a fallback path without touching the typed-query behavioural contract.
- **Per-query overrides for `model`, `tools`, and `system`** (project → loom → query cascade).
  *Seam:* same query-options struct as per-call timeouts.
- **User-defined error types beyond `QueryError`.**
  *Seam:* the `QueryError` discriminator must be a string, not a closed enum at the type level (the V1 set is still exhaustively matched at use sites).
- **`BinderError` as a Loom-visible `QueryError` variant**, once looms become first-class values invocable from non-loom programmatic harnesses that need to observe binder failures structurally.
  *Seam:* same `QueryError` discriminator seam as user-defined error types.
  *Depends on:* First-class loom values (for non-loom harnesses needing structured observation).
- **Per-loom `binder_temperature` knob**, if real usage shows authors need to tune the binder's nondeterminism budget.
  *Seam:* the frontmatter schema must tolerate forward-compatible unknown keys under a documented policy (V1 must state that policy explicitly).
- **User-overridable binder system prompt** — V1 fixes the binder prompt for predictability.
  *Seam:* same frontmatter unknown-key policy as `binder_temperature`, plus an injection point in the binder for an author-supplied prompt template.
- **Automatic context escalation:** when binding fails without context, automatically retry with `bind_context: session` attached — trades a second binder call for a smoother success rate on context-sensitive looms that forgot to opt in.
  *Seam:* the binder-invocation path must not assume `bind_context` is set exactly once per loom.
  *Depends on:* Binder refinement loop, only if escalation surfaces user-visible turns; otherwise independent.
- **Named-argument / key=value invocation syntax.**
  *Seam:* the invocation AST node must carry a positional-vs-named flag even though V1 only emits positional.
- **Richer expression sublanguage inside frontmatter `system:`** (full `${expr}` interpolation rather than just `${param}` paths).
  *Seam:* `${...}` interpolation must go through a parser entry point that can later accept full expressions, not a hand-rolled `${param}` regex.
- **Package-style (`@scope/pkg`) and project-rooted (`/looms/...`) `import` paths** — V1 supports relative paths only.
  *Seam:* the module-resolution path must be a pluggable resolver, not a hard-coded relative-path resolution.

---

## Model-level changes (no V1 seam expected)

- **First-class loom values** (`Loom<T>` type, passing looms as arguments, higher-order composition) — V1 only supports literal-path `invoke` and frontmatter-registered callables.
- **Loom-level concurrency primitives** (e.g. `parallel { ... }` blocks or a parallel-`for` form) building on Pi tools' Promise-returning shape — V1 keeps every tool call sequential and synchronous-looking.
- **Streaming partial tool results** from Pi's `onUpdate` callback into loom code (e.g. an iterator-style consumption form) — V1 returns only the final result.
- **Structured tool output schemas**, when Pi (or upstream providers) introduce a strict output-schema contract for tools — V1 returns `string` from every Pi tool call.
- **Richer untyped-query return shape** (e.g. `Result<string | AssistantMessage, QueryError>` exposing tool-use traces, multiple content blocks, citations) — V1 returns plain `Result<string, QueryError>`. A future widening would change the value model even though existing call sites would keep working under the union form.
- **Binder refinement loop:** multi-turn `needs_info` negotiation (binder asks the user a clarifying question, gets a reply, retries) instead of V1's single-shot "system note then stop" behaviour.
- **Per-parameter `mut` on function parameters** (Rust-style `fn f(mut x: T)`) — V1 keeps all function parameters immutable.
- **Value-carrying `break expr`** inside `for` / `while` loops — V1's `break` and `continue` carry no value.
- **`match` guards** (`Ok(x) if x.value > 3 => ...`) and **rest patterns** (`[first, ...rest]`, `{ kind, ...other }`) — neither is in V1.
- **Non-decimal number literals** (hex `0x...`, octal `0o...`, binary `0b...`) **and underscore digit separators** (`1_000_000`) — V1 accepts decimal literals only with no separators.
- **Integer-division operator** — V1's `/` always produces `number`; there is no dedicated truncating-division operator.
- **Additional string and array stdlib methods** beyond the V1 set — the V1 method surface is deliberately small; extending it is non-breaking by design (anything not on the list is a parse-time "unknown method" error, leaving the namespace open).
