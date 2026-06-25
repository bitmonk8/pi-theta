# Return Statement

`return expr` exits the enclosing function (or top-level loom) immediately, producing `expr` as the value of that scope. `return` is a statement, not an expression.

```loom
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

- `return expr` is type-checked against the enclosing scope's declared return type. When the enclosing scope has no declared return type — a top-level loom, or a `fn` with no return annotation — there is nothing to check against; instead `return`'s operand participates, alongside the tail expression, in the scope's inferred return type per [Function Definitions — Loom return type](./functions.md#loom-return-type). The same inference rule that applies to a tail expression applies to `return`'s argument.
- Bare `return` (no argument) is legal only inside a `void`-annotated function; elsewhere it is `loom/parse/bare-return-in-non-void` ("missing return value"). In particular, bare `return` at the top level of a `.loom` file is `loom/parse/bare-return-in-non-void`, because a top-level loom has no return annotation and acquires its return type only by inference per [Function Definitions — Loom return type](./functions.md#loom-return-type).
- From a top-level loom, `return expr` exits the loom with `expr` as its return value, exactly as a tail expression would.
- Code after a `return` in the same block is unreachable; the parser produces `loom/parse/unreachable-code` (warning, not error).
- The `?` operator's `Err`-arm desugaring is literally `return Err(e)`; no separate magic is needed.
