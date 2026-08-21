# Return Statement

`return expr` exits the enclosing function (or top-level theta) immediately, producing `expr` as the value of that scope. `return` is a statement, not an expression.

```theta
fn first_high_severity(areas: array<string>): Result<string, QueryError> {
  for area in areas {
    let issues: IssueList = @`Review for ${area}`?
    if issues.severity == "high" {
      return Ok(area)
    }
  }
  Ok("")
}
```

Rules:

- <a id="ret-1"></a> **RET-1.** `return expr` is type-checked against the enclosing scope's declared return type. When the enclosing scope has no declared return type — a top-level theta, or a `fn` with no return annotation — there is nothing to check against; instead `return`'s operand participates, alongside the tail expression, in the scope's inferred return type per [Function Definitions — Theta return type](./functions.md#theta-return-type). The same inference rule that applies to a tail expression applies to `return`'s argument. The enclosing function or top-level theta is never reached from inside a `par for` body: a `return` written there is refused at parse ([Control flow — CTRL-4](./control-flow.md#ctrl-4)).
- <a id="ret-2"></a> **RET-2.** Bare `return` (no argument) is legal only inside a `void`-annotated function; elsewhere it is `theta/parse/bare-return-in-non-void` ("missing return value"). In particular, bare `return` at the top level of a `.theta` file is `theta/parse/bare-return-in-non-void`, because a top-level theta has no return annotation and acquires its return type only by inference per [Function Definitions — Theta return type](./functions.md#theta-return-type).
- From a top-level theta, `return expr` exits the theta with `expr` as its return value, exactly as a tail expression would.
- <a id="ret-3"></a> **RET-3.** Code after a `return` in the same block is unreachable; the parser produces `theta/parse/unreachable-code` (warning, not error).
- The `?` operator's `Err`-arm desugaring is literally `return Err(e)`; no separate magic is needed.
