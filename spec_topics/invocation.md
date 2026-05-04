# Invocation

A loom may invoke another loom via the built-in `invoke` expression. This is the only way for a `.loom` to spawn or attach to another `.loom`'s execution by an inline path literal; for repeated or model-exposed callees, register the path in frontmatter `tools:` and call by name (see [Tool Calls](./tool-calls.md)). `import` is reserved for `.warp` library code.

```loom
let plan: Plan = invoke<Plan>("./plan.loom", topic, depth)?
let _ = invoke("./logger.loom", note)?
```

**Resolution.** `path` is a string literal, resolved at parse time relative to the calling loom's directory. It must end in `.loom`, and uses forward-slash separators only — a backslash inside the path literal is a parse error per the "Path literals" rule in [Lexical Structure](./lexical.md). Dynamic dispatch (a runtime-computed path) is not supported in V1.

**Typed return.** `invoke<Schema>(...)` annotates the expected return type; the runtime AJV-validates the child's return value against the schema. Untyped `invoke(...)` returns `Result<null, QueryError>` — the runtime discards the child's return value entirely. Use `invoke<Schema>` whenever the caller needs the value back; the untyped form exists only for fire-and-forget orchestration (loggers, side-effect-only children).

**Argument binding.** Arguments bind positionally to the callee's `params:` in declaration order, with each argument type-checked against the param's declared schema. Type mismatches surface as parse errors when the callee's frontmatter is statically resolvable; otherwise the runtime AJV check is the safety net. The LLM-driven binder used at the slash-command boundary (see [Slash-Command Argument Binding](./binder.md)) does not run here — `invoke(...)` callers pass already-typed values.

**Cross-mode semantics.** The callee's mode controls whether it gets a fresh conversation or attaches to its caller's current conversation. The caller's mode is irrelevant to that decision — a subagent's "current conversation" is already its own private one, so a prompt-mode child writing into it stays inside that private context.

| Caller mode | Callee mode | Effect |
|---|---|---|
| prompt | prompt | Child attaches to caller's current conversation (the user's session). Child's queries are user-visible turns. |
| prompt | subagent | Child spawns a fresh isolated conversation; only the return value reaches the caller. |
| subagent | prompt | Child attaches to the caller's current conversation — which is the caller subagent's own private one. Nothing leaks to the grandparent. |
| subagent | subagent | Child spawns a fresh isolated conversation, sibling to (not nested under) the caller's. |

**Tools and model.** The child uses *its own* frontmatter `model`, `tools`, and `system`. The caller's settings are not inherited. Same justification as for queries: tool/model/system inheritance produces surprise.

**Failures.** `invoke` returns `Result<T, QueryError>`. Invoke-specific failures surface via two new `QueryError` variants in addition to the query-time variants from [Query](./query.md):

```loom
schema InvokeFailure {
  kind: "invoke_failure",
  message: string,
  callee_path: string,
  reason: "load_failure"     // callee file unreadable
        | "parse_failure"    // callee file failed to parse
        | "validation"       // typed invoke: child's return value failed AJV validation
        | "cancelled"        // callee (or caller) cancelled mid-invoke
        | "panic"            // callee aborted via runtime panic (see Errors and Results)
}

schema InvokeCalleeError {
  kind: "invoke_callee_error",
  message: string,
  callee_path: string,
  inner: QueryError                          // the original Err the callee returned
}
```

Folding invoke errors into `QueryError` keeps the loom's error type uniform: a function or loom that mixes `?` on queries and `?` on invokes still has a single `Result<_, QueryError>` return type and a single `match` shape to handle. `InvokeCalleeError.inner` is recursive — `QueryError` referencing itself via `$ref` is exactly the discriminated-union pattern from [Schema Declarations](./schemas.md), applied to Loom's own runtime type. V1 has no configurable per-invoke timeout; cancellation is the only externally driven termination.

**Cycle detection.** Invocation cycles are detected at parse time by walking statically resolvable `invoke` paths. If `A.loom` invokes `B.loom` invokes `A.loom`, the second discovery is a parse error ("invocation cycle: A → B → A"). Recursion through subagent-mode looms is allowed where each invocation spawns a fresh sibling conversation; recursion through prompt-mode looms is allowed but must terminate via control flow, just like ordinary function recursion.
