# V8 — Control flow

## V8a — `if` / `else` statement form

- **Spec.** [Control Flow](../spec_topics/control-flow.md) (`if`/`else`).
- **Adds.** Statement-form `if cond { ... } else { ... }`. Mandatory braced bodies. Single-line `if (x) stmt` is a parse error.
- **Tests.** `else if` chains; missing braces rejected; truthiness rule from V2f enforced.
- **Deps.** V2a–V2f.
- **Ships when.** Branching works.

## V8b — `for` ... `in` over arrays

- **Spec.** [Control Flow](../spec_topics/control-flow.md) (`for`), [Grammar Appendix — `array<T>` literal type-sink rule](../spec_topics/grammar.md#arrayt-literal-type-sink-rule).
- **Adds.** `for x in xs { ... }` over `array<T>`; `x` is a fresh immutable binding per iteration. Iterating non-arrays is a parse error with the spec's hint. The iterand position is **not** a type sink for empty-array literals — `for x in []` with no other sink is `loom/parse/array-no-common-type`, the same diagnostic as `let xs = []` without annotation.
- **Tests.** Iteration over `array<T>`; non-array iterand error mentions `obj.keys()` and `s.split(...)`; mutating `x` is a parse error; `for x in []` with no surrounding sink emits `loom/parse/array-no-common-type` and the diagnostic message matches the array-construction spec; `for x in xs` where `xs` is bound by `let xs: array<T> = []` accepts the empty array (sink supplied by the binding annotation).
- **Deps.** V8a, V2h.
- **Ships when.** Loops work over arrays, with the empty-iterand sink rule enforced uniformly.

## V8c — `while` loop

- **Spec.** [Control Flow](../spec_topics/control-flow.md) (`while`).
- **Adds.** `while cond { ... }`; truthiness rule applies.
- **Tests.** Loop terminates; condition re-evaluated each iteration; non-boolean condition rejected.
- **Deps.** V8a.
- **Ships when.** Conditional loops work.

## V8d — `break` statement

- **Spec.** [Control Flow](../spec_topics/control-flow.md) (`break`/`continue`).
- **Adds.** Bare `break` exits innermost enclosing loop. Outside any loop is a parse error.
- **Tests.** Exits innermost; nested-loop semantics; outside-loop rejected; value-carrying `break expr` is a deferred-feature parse error.
- **Deps.** V8b, V8c.
- **Ships when.** Early-exit from loops works.

## V8e — `continue` statement

- **Spec.** [Control Flow](../spec_topics/control-flow.md) (`break`/`continue`).
- **Adds.** Bare `continue` skips to next iteration. Outside any loop is a parse error.
- **Tests.** Skip current iteration; outside-loop rejected.
- **Deps.** V8b, V8c.
- **Ships when.** Loop skipping works.

## V8f — `return` statement

- **Spec.** [Return Statement](../spec_topics/return.md).
- **Adds.** `return expr` exits enclosing function/loom; bare `return` legal only in `void` function. Code after `return` produces unreachable-code warning.
- **Tests.** Return value type-checks against declared return type; bare `return` in non-void is parse error; unreachable-code warning emitted exactly once per dead block.
- **Deps.** V8a.
- **Ships when.** Returns work uniformly.
