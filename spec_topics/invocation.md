# Invocation

A loom may invoke another loom via the built-in `invoke` expression. This is the only way for a `.loom` to spawn or attach to another `.loom`'s execution by an inline path literal; for repeated or model-exposed callees, register the path in frontmatter `tools:` and call by name (see [Tool Calls](./tool-calls.md)). `import` is reserved for `.warp` library code.

```loom
let plan: Plan = invoke<Plan>("./plan.loom", topic, depth)?
let _ = invoke("./logger.loom", note)?
```

**Resolution.** `path` is a string literal, resolved at parse time relative to the calling loom's directory. It must end in `.loom`, and uses forward-slash separators only — a backslash inside the path literal is a parse error per the "Path literals" rule in [Lexical Structure](./lexical.md). Dynamic dispatch (a runtime-computed path) is not supported in V1.

The resolved path — after `realpath` symlink normalisation — must lie within the union of **discovery roots** active for the current Pi session (see [Directory Convention — Discovery roots](./discovery.md#discovery-roots)). A resolved path that escapes every active root is a load-time error `loom/load/invoke-path-escape`; the parent loom does not register the call site, and a `tools:` `.loom` entry that escapes likewise fails to register the callable. The realpath step is mandatory: a symlink farm inside a discovery root that resolves outside it is still rejected. The same restriction applies to `.loom` paths used as `tools:` entries (see [Tool Calls](./tool-calls.md)). Cross-root composition (a project loom invoking a global utility) stays legal because the check uses the *union* of active roots, not the calling loom's own root.

<a id="static-resolution"></a>

**Static resolution.** A callee referenced by a literal `invoke("./path.loom", ...)` or by a `.loom` entry in `tools:` is *statically resolvable* if the runtime can open, parse, and lower the callee file during the calling loom's load pass. Static resolution is performed by a single per-load-pass parse cache shared by every parse-time check that needs the callee's source: argument-type checking ([Argument binding](#argument-binding) below; [Tool Calls — Argument shape](./tool-calls.md)), cross-loom return-type inference ([Function Definitions — Loom return type](./functions.md), [Tool Calls — Return type](./tool-calls.md)), and cycle detection ([Cycle detection](#cycle-detection) below). The walk is transitive: callees referenced by a callee's own literal `invoke` paths and `.loom` entries in `tools:` are loaded into the same cache. Each visited file is parsed once per pass and its diagnostics are aggregated into the entry loom's drain (sorted by `(file, line, col)` per [Diagnostics — Multi-error reporting](./diagnostics.md)).

A callee whose file is unreadable, fails to parse, or fails its own structural checks is *not statically resolvable* and the parent emits `loom/load/callee-has-errors` at the referencing site, naming the callee and listing the underlying diagnostic codes via `related`. The severity is per surface: a `tools:` `.loom` entry pointing at an unparseable callee is **error** — the callable cannot be created, and the parent loom does not register; a literal `invoke("./path.loom", ...)` whose callee is unparseable is **warning** — the parent registers, static checks against that callee are skipped, and the runtime AJV check is the safety net for the skipped checks. The asymmetry is deliberate: `tools:` exposes the callee as a callable to both code and model and therefore requires a working callable at registration; `invoke(...)` is a code-side reference that already has a documented runtime-AJV fallback. The callee, when later loaded as its own slash command, fails to register on its own merits — the warning-vs-error distinction matters only for the parent's cross-reference. Hot-reload of a callee re-runs the static-resolution pass for every parent that has the callee in its reachable graph (see [Implementation Notes — Runtime](./implementation-notes.md)).

<a id="argument-binding"></a>

**Typed return.** `invoke<Schema>(...)` annotates the expected return type; the runtime AJV-validates the child's return value against the schema. Untyped `invoke(...)` returns `Result<null, QueryError>` — the runtime discards the child's return value entirely. Use `invoke<Schema>` whenever the caller needs the value back; the untyped form exists only for fire-and-forget orchestration (loggers, side-effect-only children).

When both the annotated `Schema` and the callee are statically resolvable (per [Static resolution](#static-resolution) above), the parser checks that the callee's inferred return type is structurally compatible with `Schema` using the same compatibility relation `let x: T = expr` uses (compatibility, not equality — a callee returning a narrower type is legal under a wider annotation). Mismatch is a parse error `loom/parse/invoke-return-type-mismatch`. When either side is not statically resolvable, the runtime AJV check on the child's return value remains the safety net (no parse error fires).

**Argument binding.** Arguments bind positionally to the callee's `params:` in declaration order, with each argument type-checked against the param's declared schema. Type mismatches surface as `loom/parse/invoke-arg-type-mismatch` when the callee is statically resolvable per [Static resolution](#static-resolution) above; otherwise the runtime AJV check is the safety net. The LLM-driven binder used at the slash-command boundary (see [Slash-Command Argument Binding](./binder.md)) does not run here — `invoke(...)` callers pass already-typed values.

**Argument arity.** Arity is checked **before** per-argument type checking, so an arity error is reported as such rather than as a confusing per-argument type error on the first extra slot.

- *Too few arguments* — fewer than the count of non-defaulted `params:` (defaults are defined in [Parameters and Frontmatter — `params:`](./frontmatter.md)). When the callee is statically resolvable, this is a parse error `loom/parse/invoke-arity-too-few`. Otherwise it surfaces at runtime as `Err(InvokeInfraError { reason: "validation", ... })` from the AJV check on the missing required field(s).
- *Too many arguments* — more than the total `params:` count. Always a parse error `loom/parse/invoke-arity-too-many`, even when the callee is not statically resolvable: extra positional arguments cannot be matched to any param, and there is no runtime safety net possible.

The same arity rules apply to registered-loom calls through `tools:` entries (see [Tool Calls — Argument shape](./tool-calls.md)). Pi tool calls take a single object argument and are unaffected.

**Cross-mode semantics.** The callee's mode controls whether it gets a fresh conversation or attaches to its caller's current conversation. The caller's mode is irrelevant to that decision — a subagent's "current conversation" is already its own private one, so a prompt-mode child writing into it stays inside that private context.

| Caller mode | Callee mode | Effect |
|---|---|---|
| prompt | prompt | Child attaches to caller's current conversation (the user's session). Child's queries are user-visible turns. |
| prompt | subagent | Child spawns a fresh isolated conversation; only the return value reaches the caller. |
| subagent | prompt | Child attaches to the caller's current conversation — which is the caller subagent's own private one. Nothing leaks to the grandparent. |
| subagent | subagent | Child spawns a fresh isolated conversation, sibling to (not nested under) the caller's. |

**Tools and model.** The child uses *its own* frontmatter `model`, `tools`, and `system`. The caller's settings are not inherited. Same justification as for queries: tool/model/system inheritance produces surprise.

For the **prompt → prompt** cell of the cross-mode matrix above (child attaches to the caller's existing user session), the child's `tools:` set replaces the parent's *for the duration of the child's body*: on entry the runtime snapshots the user session's active-tool set and calls `pi.setActiveTools(childCallableSet)`; on return (or any `Err` / panic / cancellation) it restores the snapshot in a `finally` block. This is the same snapshot/restore protocol used per-query in [Pi Integration Contract — Tool-registration lifetime and visibility](./pi-integration-contract.md), generalised to the child's whole body. Nested prompt → prompt invokes stack: each level snapshots the immediately-prior set and restores it on return, so peeling back the call stack restores the user session's original active-tool set in reverse order. The child's queries see only the child's tools; on child return, the parent's queries again see the parent's tools — the interleaving is invisible to the user other than via tool-call cards in the transcript.

For the other three cells (any callee in subagent mode, or a subagent caller invoking a prompt-mode child into the subagent's own private session), the child's tools reach the model through `customTools` on the spawned `AgentSession` and die with the session; no active-set mutation is involved.

**Failures.** `invoke` returns `Result<T, QueryError>`. Invoke-specific failures surface via two `QueryError` variants in addition to the query-time variants:

- `InvokeInfraError` (wire `kind: "invoke_failure"`) covers infra-side failure *around* the callee body — load failure, parse failure, return-value validation failure, or callee panic. Its `reason` enum carries the discriminator.
- `InvokeCalleeError` wraps an `Err` the callee itself returned; `inner: QueryError` is the callee's original failure.

The full schema for both variants lives in [Errors and Results — QueryError variants](./errors-and-results.md#queryerror-variants).

The naming carries the partition: `InvokeInfraError` is everything the loom infrastructure raised before the callee could produce a value; `InvokeCalleeError` is the callee's own `Err` propagated through. Folding both into `QueryError` keeps the loom's error type uniform: a function or loom that mixes `?` on queries and `?` on invokes still has a single `Result<_, QueryError>` return type and a single `match` shape to handle. `InvokeCalleeError.inner` is recursive — `QueryError` referencing itself is exactly the discriminated-union pattern from [Schema Declarations](./schemas.md), applied to Loom's own runtime type, and the recursion is now self-contained within the consolidated section. V1 has no configurable per-invoke timeout; cancellation is the only externally driven termination.

<a id="cycle-detection"></a>

**Cycle detection.** Invocation cycles are detected at parse time by walking the per-load-pass static-resolution graph defined under [Static resolution](#static-resolution) above. If `A.loom` invokes `B.loom` invokes `A.loom`, the second discovery is `loom/load/invocation-cycle` ("invocation cycle: A → B → A"). Unresolvable callees (those that produced a `loom/load/callee-has-errors` diagnostic) terminate their own walk arm — the walker treats the unresolvable node as a leaf and the existing diagnostic at every parent invoke or `tools:` site is the visible trace; cycles routed through such a node are not detected until the underlying file is fixed and the watcher re-walks the graph (per [Implementation Notes — Runtime](./implementation-notes.md)). Recursion through subagent-mode looms is allowed where each invocation spawns a fresh sibling conversation; recursion through prompt-mode looms is allowed but must terminate via control flow, just like ordinary function recursion.

**Invocation depth bound.** The interpreter caps the nesting depth of an `invoke` chain at **32**, counting both direct `invoke(...)`, registered-loom calls through `tools:`, and `.warp` `fn` invokes (the count is per-chain, not per-process — sibling invokes do not share budget). Exceeding the cap raises a runtime panic with code `loom/runtime/invoke-depth`; per the panic-routing rules in [Errors and Results](./errors-and-results.md), a top-level overflow surfaces as a Pi system note and an overflow inside an invoke chain surfaces to the parent as `Err(InvokeInfraError { reason: "panic", ... })`. Recursion through cycle-detected paths is unreachable (the cycle fires earlier at parse time); the depth bound exists for legitimate-but-runaway recursive divide-and-conquer.
