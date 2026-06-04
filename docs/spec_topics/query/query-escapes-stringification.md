# Query escapes stringification

## Escapes

Inside a query template:

- `\``    — literal backtick
- `\$`    — literal `$` (suppresses interpolation when followed by `{`)
- `\\`    — literal backslash
- `\n`, `\t`, `\r` — standard string escapes (rarely needed; literal newlines in the template body work directly)

No other escapes are recognised; a backslash followed by any other character is `loom/parse/illegal-template-escape`. EOF inside an unterminated template body surfaces as `loom/parse/unterminated-template`. Curly braces `{` and `}` need no escape — they are ordinary text content. Only the sequence `${` (and the `}` that closes a corresponding `${...}`) has special meaning.

## Stringification of interpolated values

A `${expr}` interpolation evaluates `expr` per the [Expression Sublanguage](../expressions.md) and renders the result into the prompt text by the **Loom static type** of the expression — *not* by JavaScript's default `String(...)`, whose `[object Object]` and comma-joined-array defaults would silently corrupt prompts without any diagnostic for the author. The same rule applies to the bare-path `${param}` / `${param.field}` form in the frontmatter `system:` field (see [Parameters and Frontmatter — `system` Interpolation](../frontmatter.md)); the `system:` slot's grammar restricts only the *expression* shape (to bare identifier paths), not the *stringification* of the resolved value.

| Loom static type | Rendered as |
|---|---|
| `string` | the value itself, no quoting, no escaping |
| `integer` | shortest decimal (`42`, `-7`); never scientific notation |
| `number` | shortest round-trip decimal (`3.14`, `-0.5`); `NaN` → `NaN`; `Infinity` → `Infinity`; `-Infinity` → `-Infinity` |
| `boolean` | `true` / `false` |
| `null` | the literal text `null` |
| Enum variant | the variant's **wire** value, unquoted (the enum brand from [Runtime Value Model](../runtime-value-model.md) is dropped — the model only ever sees wire forms) |
| `array<T>` | `JSON.stringify` of the value, **compact** (no pretty-printing), with [wire-name translation](../runtime-value-model.md) applied recursively |
| Schema-typed object | `JSON.stringify` of the value, **compact** (no pretty-printing), with [wire-name translation](../runtime-value-model.md) applied recursively |
| `Result<T, E>` | parse error `loom/parse/interpolated-result` — *"`Result` value cannot be interpolated; unwrap with `?` or `match` first"* |

Notes:

- The `Result` rejection is **static**, resolved from the expression's type, and fires even when the `Result`-valued expression sits behind a function call whose return type the parser can resolve. When the type is unresolvable (e.g. an inferred binding that widens past the parser's view), the runtime renderer falls back to a panic carrying the same `loom/parse/interpolated-result` diagnostic code — the same "static where possible, runtime where not" posture used elsewhere for tool-call argument typing.
- Wire-name translation for objects and arrays uses the **outbound** translation pass defined in [Runtime Value Model — Wire-name translation](../runtime-value-model.md). There is no second translation map for interpolation: the loom-side names an author writes never appear in the rendered prompt.
- Stringification runs **after** expression evaluation but **before** newline-trim and dedent, so the multi-line text that an object or array interpolation introduces participates in the dedent computation like any other content. Authors who need a particular layout interpolate a pre-formatted `string`.
- Whitespace-only and empty renderings get no special treatment at the per-slot level here; whether a *fully-rendered* template is degenerate is pinned earlier in this file under [Degenerate rendered templates](./query-forms.md#degenerate-rendered-templates).
- Interpolation is the spec's blessed escape hatch for value-to-text conversion: the `+`-operator advice in [Expressions](../expressions.md) ("interpolate inside a string" in place of mixed-type `+`) relies on this rule existing.

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

`let _ = @`...`` (and the equivalent `void`-tail form) is a true discard at the *user-facing* surface: no `loom-system-note` is rendered to the user's transcript, no `Result` flows to the caller, and the loom continues. On the *operator-facing* surface, an `Err` from a discarded query is preserved as a runtime event on the always-log set defined in [Pi Integration Contract — Runtime event channel](../pi-integration-contract.md). The event carries the same `kind`, `code`, `message`, and (where defined) `attempts` / `tokens_used` fields the user-facing note would have carried, plus the source location of the discarding `let _ =` carried in the `RuntimeEvent` `discard_site` field; it is delivered through the same `loom-system-note` channel as user-facing notes but with `display: false` so log scrapers, replay tools, and `/tree` navigation can recover it without rendering it inline. The runtime event fires exactly once per discarded `Err`, regardless of how many tool-call rounds or respond-repair follow-ups the underlying query consumed. `Ok` discards produce no event (nothing to observe).

### Panics during interpolation are not caught by `let _ =`

A `${expr}` interpolation can trip any of the runtime panics in [Errors and Results — Runtime panics](../errors-and-results.md) (non-exhaustive `match`, OOB, null/missing-key access). Panics arise during evaluation of the RHS and propagate before the `let _ =` binding completes; the discard form does not contain them. Authors who need a query-rendering site to be panic-safe must guard the interpolated expressions individually.
