# Control Flow

Loom has three loop and branch forms. Because a query returns a value, control flow can branch on what the model just said.

**`if` / `else`** — statement form (the ternary `cond ? a : b` is the expression form):

```loom
if author.experience_years < 2 {
  @`Re-explain your top recommendation in simple language.`?
}
```

**`for` ... `in`** — iterates an array, binding the iteration variable as a fresh immutable local per iteration. The expression after `in` must have type `array<T>` for some `T`; iterating strings, objects, or numbers is `loom/parse/non-array-iterand` (use `obj.keys()` for objects, `s.split(...)` for strings). The iterand position is **not** an element-type sink for empty-array literals — `for x in []` with no surrounding sink is `loom/parse/array-no-common-type`, the same diagnostic that `let xs = []` raises in unannotated position. Annotate via a `let xs: array<T> = []` immediately above the loop, or inline the literal under a sink that supplies `T` (see [Grammar Appendix — `array<T>` literal type-sink rule](./grammar.md#arrayt-literal-type-sink-rule)).

<a id="ctrl-1"></a> **CTRL-1.** The iterand expression MUST be evaluated exactly once, at loop entry, before the first iteration; the loop then iterates the resulting `array<T>` snapshot. Where the iterand carries effects (for instance a function-call iterand, an `@`-query iterand, or an `invoke` child iterand), that effect commits exactly once at loop entry — including when the resulting array is empty and the body never runs — and reassigning a `let mut` from inside the body does not change the already-snapshotted sequence.

```loom
for area in focus_areas {
  let issues: IssueList = @`
    Review the code specifically for ${area} concerns:
    ${code}
  `?

  if issues.severity == "high" {
    @`Suggest concrete fixes for the high-severity ${area} issues you just listed.`?
  }
}
```

**`while`** — repeats while the condition is `true`. The condition must be `boolean`; loom performs no truthiness coercion, so a non-boolean condition is `loom/parse/non-boolean-condition` (see [Truthiness](./expressions.md#truthiness)):

```loom
let mut round = 0
let mut satisfied = false
while !satisfied && round < 5 {
  let critique = @`Critique round ${round + 1}: ${draft}`?
  let verdict: Verdict = @`Is the critique addressed? ${critique}`?
  satisfied = verdict.done
  round += 1
}
```

**`break` / `continue`** — bare statements; legal only inside `for` / `while` bodies. `break` outside a loop is `loom/parse/break-outside-loop`; `continue` outside a loop is `loom/parse/continue-outside-loop`. `break` exits the innermost enclosing loop; `continue` skips to the next iteration. Neither carries a value in loom 1.0: `break expr` is `loom/parse/break-with-value`. See [Future Considerations](./future-considerations.md) and [Diagnostics](./diagnostics.md).

```loom
for area in focus_areas {
  let issues: IssueList = @`Review for ${area}`?
  if issues.findings.length == 0 {
    continue
  }
  if issues.severity == "critical" {
    break
  }
  @`Drafting fixes for ${area}...`?
}
```
