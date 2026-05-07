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

**Documentation.** A `fn` declaration accepts a leading `///` doc comment (full anchor list in [Grammar Appendix — `///` placement](./grammar.md#-placement)). The description is preserved on the AST as human-facing documentation only — functions have no JSON Schema, so the description does not lower into provider payloads. Tools and editors that surface symbol documentation can render it; the runtime does not consume it.

<a id="loom-return-type"></a>

**Loom return type.** A `.loom` file's overall return type is inferred from its body using the same rule as a function: the type of its tail expression, wrapped in `Result<T, QueryError>` if any `?` appears in the body. There is no frontmatter `returns:` field. Cross-loom static type checking at `invoke<Schema>` sites uses the callee's inferred return type when the callee is statically resolvable per [Invocation — Static resolution](./invocation.md#static-resolution); otherwise the runtime AJV check is the safety net.

<a id="empty-tail-body"></a>

**Empty-tail body.** A function or loom body with no tail expression — the last form is a statement (`let`, `for`, `while`, `if`-statement form, assignment, `break`, `continue`, expression-statement of `void` type), or there are no expression statements at all (a literal-text-only loom) — has inferred return type `null` (the literal type) and produces the literal `null` as its final value. An explicit `void` return type still discards any tail expression value silently and is the only way to signal that the function or loom intentionally produces no value; absence of a tail expression on its own does NOT imply `void`. The grammar's `BlockExpr ::= "{" Stmt* Expr "}"` production (see [Grammar Appendix — Block expressions](./grammar.md#block-expressions)) requires the trailing `Expr` only in expression-position blocks (the right-hand side of `let`, `match`-arm bodies wrapped in `{ … }`, `if`/`while` arm bodies); function bodies and the top level of `.loom` files are governed by the relaxed `FnBody` / `LoomBody` productions on the same page and accept zero or more statements with no required tail.

*`?` interaction with empty tail.* A body with `?` whose last form is a statement infers `Result<null, QueryError>` (not `Result<void, QueryError>`). The implicit `null` is the success-arm payload.

*Foot-gun — `let x = expr?` as the final form.* A body whose last form is `let x = expr?` (a `let` binding whose RHS uses `?`) returns `Ok(null)` on the success path regardless of `x`'s value. The `let` is a statement, so the empty-tail rule applies and the implicit `null` is the final value. Authors who want the bound value as the final value must add a tail expression: `let x = expr?\nx`. This is the same pattern Rust's `let` has and is best caught by linting, not by the language rule.

<a id="final-value-language-definition"></a>

**Final value (language definition).** A loom or function's *final value* is the value of its tail expression on the success path, the operand of an explicit `return expr` if one short-circuits the body before the tail is reached (per [Return Statement](./return.md)), or the literal `null` per the **Empty-tail body** rule above when no tail expression exists. The final value is observable to programmatic callers in two places: an `invoke` parent receives it as the `Ok` payload of the returned `Result` per [Invocation — Typed return](./invocation.md#typed-return); a subagent-mode parent receives it across the subagent boundary per the same anchor. On failure (`?` propagation, panic, exhausted runtime ceiling) and on cancellation, NO final value flows: the caller observes only the corresponding `Err` envelope per [Errors and Results — QueryError variants](./errors-and-results.md#queryerror-variants) and [Cancellation](./cancellation.md). The success / fail / cancelled trichotomy and what the `Err` envelope carries per outcome are owned by [Errors and Results — Terminal outcomes](./errors-and-results.md#terminal-outcomes).
