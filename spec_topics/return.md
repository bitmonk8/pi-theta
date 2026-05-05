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

- `return expr` is type-checked against the enclosing scope's declared return type. The same inference rule that applies to a tail expression applies to `return`'s argument.
- Bare `return` (no argument) is legal only inside a `void` function or `void` top-level loom; elsewhere it is `loom/parse/bare-return-in-non-void` ("missing return value").
- From a top-level loom, `return expr` exits the loom with `expr` as its return value, exactly as a tail expression would.
- Code after a `return` in the same block is unreachable; the parser produces `loom/parse/unreachable-code` (warning, not error).
- The `?` operator's `Err`-arm desugaring is literally `return Err(e)`; no separate magic is needed.
