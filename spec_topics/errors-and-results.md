# Errors and Results

All queries return `Result<T, QueryError>`. The language provides two destructuring forms.

**`match` expression** — exhaustive destructuring; arms evaluate to a value, so `match` is itself an expression:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(e) => ReviewScore { value: 0, reason: "unrated: ${e.message}" }
}
```

**Pattern grammar (V1).** A `match` arm's left-hand side is one of:

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything; binds nothing |
| Identifier | `x` | anything; binds the value to `x` |
| Literal | `"validation"`, `0`, `true`, `null` | structural equality |
| Constructor | `Ok(p)`, `Err(p)` | the named `Result` variant; recurses into `p` |
| Object/schema | `QueryError { kind: "validation", attempts }` | object whose listed fields match the inner patterns; unlisted fields are ignored. Field shorthand `{ attempts }` is sugar for `{ attempts: attempts }` |
| Array | `[a, b]`, `[first, _, _]` | exact-length array; each slot matches its pattern |

Disambiguation: lowercase identifiers bind, capitalised identifiers refer to constructors or schema names. `Ok` and `Err` are reserved.

Guards (`Ok(x) if x.value > 3 => ...`) and rest patterns (`[first, ...rest]`, `{ kind, ...other }`) are not in V1: their use surfaces as `loom/parse/match-guard-not-supported` and `loom/parse/rest-pattern-not-supported` respectively. See [Future Considerations](./future-considerations.md).

**Exhaustiveness.** Not statically checked in V1. The analyser cannot enumerate the runtime values of `QueryError.kind` from the type system, so static exhaustiveness would be unsound. A `match` whose arms collectively fail to cover the scrutinee at runtime raises a `MatchError` (`loom/runtime/match-error`). Authors who want a catch-all should add a final `_ => ...` arm.

**Arm syntax.** `pattern => expression`, comma-separated. The trailing comma after the last arm is optional. All arms must produce values of the same type (or assignable to a common type, by the same rules as `let` initialisation); a mismatched-arm `match` is `loom/parse/match-arm-type-mismatch`.

**`?` operator** — unwraps `Ok` to the inner value; on `Err`, *early-returns* the `Err` from the enclosing function (or top-level loom block). The enclosing scope's return type must therefore be `Result<_, QueryError>` (or convertible) — otherwise the use of `?` is `loom/parse/question-outside-result-fn`. Concretely:

```loom
let critique = @`Critique this code:\n${code}`?  // string on success; early-return Err otherwise
```

Is equivalent to:

```loom
let critique = match @`Critique this code:\n${code}` {
  Ok(s)  => s,
  Err(e) => return Err(e)
}
```

A function or loom that uses `?` thus implicitly returns `Result<T, QueryError>` where `T` is the type of its last expression. A function that uses neither `?` nor an explicit `Result` return type is required to handle every query failure with `match` (or to discard with the silent-drop semantics described in [Query](./query.md)).

**No rollback.** Neither `?` nor a panic unwinds prior side effects. Tool calls that have already returned, queries already appended to the conversation, and `invoke` children that have already run remain final on early return or abort. This applies uniformly to `?` early-return inside a function, `?` early-return at the top of a loom block, a panic in a slash-command loom (surfaced per the **Runtime panics** paragraph below), and a panic in an `invoke` child (surfaced to the parent as `kind: "invoke_failure", reason: "panic"` per [Invocation](./invocation.md)) — in the last case, the child's already-committed tool calls remain committed even though the parent observes only the failure envelope. Loom has no implicit transactional layer; authors who need compensating actions must `match` on the failing `Result` and execute the undo logic explicitly before re-`Err`-ing or returning. Panics cannot be intercepted at all — code that needs cleanup on a panicking path must avoid the panic source (bounds-check before indexing, exhaustive `match` arms). This note is complementary to the [coercion follow-up paragraph in Query](./query.md): coercion describes what the runtime declines to do *to* the conversation on failure; this paragraph describes what the runtime declines to do *for* the author on failure.

**`Result` as a user-visible type.** `Result<T, E>` is a built-in two-variant type with constructors `Ok(value)` and `Err(error)`. Looms may declare functions returning `Result<T, QueryError>` explicitly, and may construct `Ok` / `Err` directly to bridge to code-side error handling. User-defined error types beyond `QueryError` are out of scope for V1.

**Runtime panics.** Some failures cannot be expressed as a `Result` and are surfaced as **panics** that abort the loom immediately, bypassing `?` and `match`. V1 panic sources — each carrying its registered `loom/runtime/*` code from [Diagnostics](./diagnostics.md):

- Non-exhaustive `match` — `loom/runtime/match-error` (the implementation refers to this as `MatchError`).
- Array index out of bounds (`arr[i]` with `i < 0` or `i >= arr.length`) — `loom/runtime/index-out-of-bounds`.
- `.field` access on `null` — `loom/runtime/null-member-access`.
- `[i]` access on `null` — `loom/runtime/null-index-access`.
- Indexed access on a missing object key — `loom/runtime/missing-object-key`.

This list is closed; division by zero, integer overflow, and explicit author-driven panics are deliberately excluded (see [Diagnostics](./diagnostics.md)).

**Panic message string (normative).** Every panic carries a single human-readable message string formatted at the panic site according to the *Message template* registered for its `loom/runtime/*` code in the [Diagnostics code registry](./diagnostics.md#loomruntime--runtime-panics). The templates are normative: a conformant runtime MUST emit the registered string (with template placeholders filled from the offending value) for every panic of that source, and conformance tests MAY assert on the exact string. The five V1 templates and their placeholders are summarised below — the registry is authoritative if the two ever drift:

| Code | Message template |
|---|---|
| `loom/runtime/match-error` | `MatchError: no arm matched <scrutinee summary>` |
| `loom/runtime/index-out-of-bounds` | `index out of bounds: <i> not in 0..<length>` |
| `loom/runtime/null-member-access` | `null member access: .<field>` |
| `loom/runtime/null-index-access` | `null index access: [<i>]` |
| `loom/runtime/missing-object-key` | `missing object key: <key>` |

There is exactly one message string per panic. The same string flows unchanged to every routing surface listed below — it is *not* re-formatted per surface, and surface-specific framing (the `"loom /<name> aborted: "` prefix, the `InvokeFailure` envelope) wraps the message rather than replacing it. The panic site itself is reported separately through the diagnostic's `file` / `range` (per [Diagnostics](./diagnostics.md)) and is not embedded in the message string. For panics inside a `.warp`-imported frame, the panic site is the leaf source location, not the importer.

Panics surface to the loom's caller as:

- **Slash-command / prompt-mode invocation** — a Pi system note formatted as "loom `/<name>` aborted: `<message>`", where `<message>` is the panic message string defined above. The user's session is not torn down; the user can type a follow-up turn.
- **`invoke` parent** — `Err(QueryError { kind: "invoke_failure", reason: "panic", message: <message>, ... })` (see [Invocation](./invocation.md)), where `<message>` is the same panic message string. Author code that pattern-matches on `InvokeFailure.message` to discriminate panic causes can therefore rely on the registered template, though matching on the `loom/runtime/*` code (when surfaced through the diagnostics channel) is the more stable discriminator.

Panics are not values — they do not flow through `?` and cannot be caught by `match`. Authors who need recoverable behaviour must write code that cannot panic (bounds-check before indexing, add a final `_ => ...` arm to `match`).
