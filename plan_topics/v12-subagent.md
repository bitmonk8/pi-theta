# V12 — Subagent mode

## V12a — `mode: subagent` accepted; AgentSession spawn

- **Spec.** [Pi Integration Contract — subagent-mode drive](../spec_topics/pi-integration-contract.md), [Pi Integration Contract — Subagent session lifecycle](../spec_topics/pi-integration-contract.md), [Overview — Scope of a Loom File](../spec_topics/overview.md#scope-of-a-loom-file), [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime) (V1 reference implementation of the typed-query mechanism reused inside the spawned session).
- **Adds.** Frontmatter `mode: subagent` accepted; runtime spawns in-process `AgentSession` (against `FakeAgentSession` in tests) with in-memory session manager. Replaces V3a's "not implemented yet" stub. Disposal runs in a `finally` block that wraps the entire interpreter execution against the spawned session, so `AgentSession.dispose()` fires on every exit path (normal return, `Err`, panic, cancellation, unexpected interpreter/SDK exception). `dispose()` failure is reported via `loom/runtime/subagent-dispose-failure` (see [Diagnostics](../spec_topics/diagnostics.md)) without masking the original error.
- **Tests.** Spawn happens at loom invocation, not at load; transcript not retained on `FakeFileSystem`; `dispose()` invoked exactly once on normal return; `dispose()` invoked on `Err` return (query failure, tool failure, child invoke failure, validation failure); `dispose()` invoked on panic inside the subagent; `dispose()` invoked on parent-`AbortSignal`-fired-before-first-turn (spawn-then-immediate-cancel); `dispose()` invoked on unexpected interpreter exception; `dispose()` thrown error surfaces as `loom/runtime/subagent-dispose-failure` diagnostic without masking the original error; nested subagent invocations dispose deepest-first; one-shot tool registrations (typed-query `__loom_respond_<hash>` and per-call loom-callee tools) are unregistered in the same `finally` block, before `dispose()`.
- **Deps.** V3a, V5e.
- **Ships when.** Subagent looms run.

## V12b — `system:` field declaration

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`system:`).
- **Adds.** `system:` accepted only on `mode: subagent`; on prompt-mode is parse error.
- **Tests.** Subagent + system: parses; prompt + system: rejected with documented hint.
- **Deps.** V12a.
- **Ships when.** System prompts can be authored.

## V12c — `${param}` and `${param.field}` in `system:`

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`system:` interpolation), [Query — Stringification of interpolated values](../spec_topics/query.md) (canonical stringification table).
- **Adds.** Bare-identifier-path interpolation in `system:` field. Full expression sublanguage rejected. Resolved value rendered via the same canonical stringification table the `@`...`` interpolation slot uses.
- **Tests.** `${param}` resolves; `${a.b.c}` resolves; `${a + b}` rejected; `${a.b()}` rejected (call rejected); rejection message references the deferred future-consideration. Per-type stringification matches the V5b table for `string`, `integer`, `number`, `boolean`, `null`, enum variant, `array<T>`, and schema-typed object.
- **Deps.** V12b.
- **Ships when.** System prompts can use params.

## V12d — Subagent transcript discard

- **Spec.** [Overview — Scope of a Loom File](../spec_topics/overview.md#scope-of-a-loom-file).
- **Adds.** Spawned conversation's transcript stays private; not surfaced to parent or persisted by runtime.
- **Tests.** Parent never sees subagent's intermediate turns; assertions on parent's conversation log show only invoke return.
- **Deps.** V12a.
- **Ships when.** Subagent isolation is verified.

## V12e — Subagent return value propagation

- **Spec.** [Overview — Scope of a Loom File](../spec_topics/overview.md#scope-of-a-loom-file), [Function Definitions — Loom return type](../spec_topics/functions.md).
- **Adds.** Loom's tail expression is the return value reaching parent; parent sees `Result<T, QueryError>` shape.
- **Tests.** Tail-expression value reaches parent; `Err` from subagent surfaces to parent.
- **Deps.** V12a, V6.
- **Ships when.** Subagent invocation is value-passing.

## V12f — `bind_context: session` on subagent → parse warning

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (binder context).
- **Adds.** Frontmatter validation warning (not error) — subagent has no caller-session context.
- **Tests.** Warning emitted; loom still loads.
- **Deps.** V12a.
- **Ships when.** Misconfiguration is caught early.
