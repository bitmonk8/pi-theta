# Function Definitions

Functions encapsulate reusable orchestration. A function body is a block; its value is the value of its last expression (Rust-style). Top-level loom files follow the same rule — the loom's return value is the value of the last expression of the top-level block.

```loom
fn rate_strictness(p: Author): Result<ReviewScore, QueryError> {
  @`
    Reviewer context: ${p.name} (${p.role}, ${p.experience_years}y experience).
    Rate this reviewer's likely strictness 1-5.
  `
}

let strictness = rate_strictness(author)?
```

A function whose body uses `?` must declare a `Result<_, QueryError>` return type, since `?` early-returns `Err`. A function whose purpose is purely to drive turns without producing a value can declare a `void` return type and discard its last expression's value; when that tail expression is a query, the discard observes the same user-facing-vs-operator-facing contract as the expression-statement form (see [Query — Discarded query results](./query.md)).

A function call participates in the loom's *current* conversation; it does not open a new one. To open a new isolated conversation, invoke another loom in subagent mode (see [Invocation](./invocation.md)).

**Placement.** `fn` declarations are top-level only — both in `.loom` files and in `.warp` library files. Nested function definitions surface as `loom/parse/nested-fn`; closures and first-class function values are not part of V1, so function names appear only in call position. A function name used as a value (bound to `let`, passed as an argument) surfaces as `loom/parse/function-as-value`. Mutual recursion between two top-level `fn`s is allowed (declarations are hoisted within the file); recursion through `invoke` is bounded by the parse-time cycle check from [Invocation](./invocation.md). See [Diagnostics](./diagnostics.md) for the full code registry.

**Loom return type.** A `.loom` file's overall return type is inferred from its body using the same rule as a function: the type of its tail expression, wrapped in `Result<T, QueryError>` if any `?` appears in the body. There is no frontmatter `returns:` field. Cross-loom static type checking at `invoke<Schema>` sites uses the callee's inferred return type when the callee's source is statically resolvable; otherwise the runtime AJV check is the safety net.
