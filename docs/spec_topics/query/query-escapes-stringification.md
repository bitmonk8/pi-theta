# Query escapes stringification

## Escapes

Inside a query template:

- `\``    — literal backtick
- `\$`    — literal `$` (suppresses interpolation when followed by `{`)
- `\\`    — literal backslash
- `\n`, `\t`, `\r` — standard string escapes (rarely needed; literal newlines in the template body work directly)

<a id="qry-17"></a> **QRY-17.** No other escapes are recognised; a backslash followed by any other character is `theta/parse/illegal-template-escape`. EOF inside an unterminated template body surfaces as `theta/parse/unterminated-template`. Curly braces `{` and `}` need no escape — they are ordinary text content. Only the sequence `${` (and the `}` that closes a corresponding `${...}`) has special meaning.

## Stringification of interpolated values

<a id="qry-18"></a> **QRY-18.** A `${expr}` interpolation evaluates `expr` per the [Expression Sublanguage](../expressions.md) and renders the result into the prompt text by the **Theta static type** of the expression — *not* by JavaScript's default `String(...)`, whose `[object Object]` and comma-joined-array defaults would silently corrupt prompts without any diagnostic for the author. The same rule applies to the bare-path `${param}` / `${param.field}` form in the frontmatter `system:` field (see [Parameters and Frontmatter — `system` Interpolation](../frontmatter.md)); the `system:` slot's grammar restricts only the *expression* shape (to bare identifier paths), not the *stringification* of the resolved value.

| Theta static type | Rendered as |
|---|---|
| `string` | the value itself, no quoting, no escaping |
| `integer` | per [BNDR-4](../binder/defaulting-system-note-echo.md#bndr-4) (canonical decimal `42`, `-7`; never scientific notation; `-0` → `0`) |
| `number` | finite values per [BNDR-5](../binder/defaulting-system-note-echo.md#bndr-5) (shortest round-trip decimal `3.14`, `-0.5`; never scientific notation; `-0` → `0`); `NaN` → `NaN`; `Infinity` → `Infinity`; `-Infinity` → `-Infinity` |
| `boolean` | `true` / `false` |
| `null` | the literal text `null` |
| Enum variant | the variant's **wire** value, unquoted (the enum brand from [Runtime Value Model](../runtime-value-model.md) is dropped — the model only ever sees wire forms) |
| `array<T>` | `JSON.stringify` of the value, **compact** (no pretty-printing), with [wire-name translation](../runtime-value-model.md) applied recursively |
| Schema-typed object | `JSON.stringify` of the value, **compact** (no pretty-printing), with [wire-name translation](../runtime-value-model.md) applied recursively |
| Union type (`T \| U`, including `T \| null`) | rendered by the row of the **resolved value's runtime kind**, not the static union type — see *Value-driven row selection* below |
| `Result<T, E>` | parse error `theta/parse/interpolated-result` — *"`Result` value cannot be interpolated; unwrap with `?` or `match` first"* |

Notes:

- The `Result` rejection is **static**, resolved from the expression's type, and fires even when the `Result`-valued expression sits behind a function call whose return type the parser can resolve. When the type is unresolvable (e.g. an inferred binding that widens past the parser's view), the runtime renderer falls back to a panic carrying the same `theta/parse/interpolated-result` diagnostic code — the same "static where possible, runtime where not" posture used elsewhere for tool-call argument typing.
- Containment does not change the disposition: an `array<T>` or Schema-typed object interpolation whose value holds a `Result` at **any depth** takes the `Result<T, E>` row's disposition, not the `array<T>` or Schema-typed object row's. A container's own static type is never `Result<T, E>`, so this is the **runtime** arm of the previous note — the renderer raises the panic carrying `theta/parse/interpolated-result` when the outbound translation reaches a `Result` — which is what keeps [Runtime Value Model](../runtime-value-model.md)'s "a `Result` value never crosses the wire" true at every depth. The recursive [wire-name translation](../runtime-value-model.md) of the two container rows is unchanged for every value that is not a `Result`.
- **Value-driven row selection.** A union-typed interpolation (`string | null`, `number | null`, `Cat | Dog`) and an opaque imported-`.thetalib`-schema interpolation carry no single static row — the row is selected from the **resolved value's runtime kind**, not the declared static type. A scalar value takes its scalar row (a `null` renders `null`; a non-finite `number`-carrying union whose resolved value is a `number` renders `NaN` / `±Infinity` per the `number` row); an object value takes the Schema-typed object row. On that object row, [wire-name translation](../runtime-value-model.md) runs only through a union arm that names a body object schema directly: the arm is selected by the value's schema brand ([Runtime Value Model](../runtime-value-model.md)) when that brand names an arm; otherwise — on the `system:` bare-path render — the value (whether unbranded, the permissive invoke path, or branded with a name that is not one of the arms) is matched to its arm by an **exact** theta-side field set plus any literal discriminator. A value matching no arm, or matching more than one, renders with its theta-side names untranslated rather than a guessed arm's wire names; the `@`...`` query surface translates a union value by its schema brand alone. An `array<T>` arm, an inline-object or imported-schema arm, and an opaque imported-schema object value form no translating arm and likewise render untranslated (theta-side names) — never a wrong wire name.
- Wire-name translation for objects and arrays uses the **outbound** translation pass defined in [Runtime Value Model — Wire-name translation](../runtime-value-model.md). There is no second translation map for interpolation: the theta-side names an author writes never appear in the rendered prompt. The rendered member order is the value's own key order (schema declaration order for a named-schema value, insertion order otherwise, per [Expressions](../expressions.md)) with wire names substituted — the outbound pass is a rename, not a reordering — for every wire name that is not an array index. **Exception, and intentional:** a wire name the host orders as an array index — a canonical decimal string in `0` … `2^32-2`, so `"0"` and `"4294967294"` but not `"01"`, `"1.0"`, `"-1"`, `"1e2"`, or `"4294967295"` — takes the host's own-key position, ascending numerically ahead of every non-index key, because the row's serialiser is native `JSON.stringify` over a record keyed by wire names and [Runtime Value Model](../runtime-value-model.md)'s engine invariant pins that record's own-key order to the host. The rendered member order is therefore **unspecified** for that class. The key set, key count, and values are unaffected, and the theta-side order clause ([Expressions](../expressions.md) `keys()` / `values()`) is untouched: it orders theta-side names, this note orders wire names.
- Stringification runs **after** expression evaluation but **before** newline-trim and dedent, so the multi-line text that an object or array interpolation introduces participates in the dedent computation like any other content. Authors who need a particular layout interpolate a pre-formatted `string`.
- Whitespace-only and empty renderings get no special treatment at the per-slot level here; whether a *fully-rendered* template is degenerate is pinned earlier in this file under [Degenerate rendered templates](./query-forms.md#degenerate-rendered-templates).
- Interpolation is the spec's blessed escape hatch for value-to-text conversion: the `+`-operator advice in [Expressions](../expressions.md) ("interpolate inside a `@`...`` query template" in place of mixed-type `+`) relies on this rule existing.

## Discarded query results are a parse error (`theta/parse/discarded-query-result`)

<a id="qry-19"></a> **QRY-19.** The author must pick one of:

```theta
@`Summarise the discussion above.`?      // propagate failure via early-return
let _ = @`Summarise the discussion above.`  // discard both Ok and Err explicitly
let summary = @`Summarise the discussion above.`?  // bind the success value
```

The diagnostic on a bare `@`...`` expression-statement reads: *"discarded query result; use `?` to propagate failure or `let _ = @`...`` to discard explicitly."* The intent is to force the author to acknowledge the `Result` once, at the call site, with a one-character change.

`let _ = expr` is a real binding form for any expression — not just queries — making the same escape hatch available to any future `#[must_use]`-style type. A `void`-returning function whose **tail expression** is `@`...`` is also a discard with the same observability contract as the expression-statement form: the `void` return type means the caller has no `Result` to handle, so the `Err` is suppressed at the user-facing surface and emitted on the operator-facing channel exactly as in the explicit `let _ =` case. Only the bare expression-statement position (no `let _ =`, no `?`, no annotation) triggers the parse error.

## Observability of discarded results

<a id="qry-20"></a> **QRY-20.** `let _ = @`...`` (and the equivalent `void`-tail form) is a true discard at the *user-facing* surface: no `theta-system-note` is rendered to the user's transcript, no `Result` flows to the caller, and the theta continues. On the *operator-facing* surface, an `Err` from a discarded query is preserved as a runtime event on the always-log set defined in [Pi Integration Contract — Runtime event channel](../pi-integration-contract.md). The event carries the same `kind`, `code`, `message`, and (where defined) `attempts` / `tokens_used` fields the user-facing note would have carried, plus the source location carried in the `RuntimeEvent` `discard_site` field — the location of the discarding `let _ =` binding for the expression-statement form, and the location of the tail `@`...`` expression (its start, for a tail expression spanning multiple source lines) for the void-tail-function form; it is delivered through the same `theta-system-note` channel as user-facing notes but with `display: false` so log scrapers, replay tools, and `/tree` navigation can recover it without rendering it inline. The runtime event fires exactly once per discarded `Err`, regardless of how many tool-call rounds or respond-repair follow-ups the underlying query consumed. `Ok` discards produce no event (nothing to observe).

### Panics during interpolation are not caught by `let _ =`

<a id="qry-21"></a> **QRY-21.** A `${expr}` interpolation can trip any of the runtime panics in [Errors and Results — Runtime panics](../errors-and-results.md) (non-exhaustive `match`, OOB, null/missing-key access). Panics arise during evaluation of the RHS and propagate before the `let _ =` binding completes; the discard form does not contain them. Authors who need a query-rendering site to be panic-safe must guard the interpolated expressions individually.
