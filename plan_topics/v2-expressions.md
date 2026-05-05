# V2 — Expression sublanguage and bindings

## V2a — `let` immutable bindings

- **Spec.** [Bindings and Mutability](../spec_topics/bindings.md), [Grammar Appendix — `let` form](../spec_topics/grammar.md#let-form).
- **Adds.** `let x = expr` with optional `: T` annotation; an initialiser is required. `let x: T` (annotation, no initialiser) is `loom/parse/let-without-initialiser`. Reassignment of an immutable binding is a parse error.
- **Tests.** Immutable binding declared and read; reassignment rejected; `let _ = expr` accepted (discard); `let mut _ = ...` rejected; `let x: T` (no initialiser) emits `loom/parse/let-without-initialiser` and the diagnostic message references the spec rule; `let x: T = <expr>` accepted.
- **Deps.** V1.
- **Ships when.** Loom bodies can name values.

## V2b — `let mut` and reassignment statements

- **Spec.** [Bindings and Mutability](../spec_topics/bindings.md).
- **Adds.** `let mut x = ...`; statement forms `=`, `+=`, `-=`, `*=`, `/=`, `%=`. Assignment-as-expression rejected (`if (x = 1)` is a parse error).
- **Tests.** Each compound form; rebind preserves type; field-/index-mutation (`o.f = x`, `a[i] = x`) rejected with the deferred-feature diagnostic; param-binding rejects `mut`.
- **Deps.** V2a.
- **Ships when.** Mutable counters work in straight-line code.

## V2c — Arithmetic, comparison, logical, ternary, parens

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md), [Operator precedence](../spec_topics/expressions.md#operator-precedence).
- **Adds.** `+ - * / %` with `+` overloaded for string concat; `< <= > >= == !=`; `&& ||`; ternary `? :`; parens. Comparison/equality non-associative (`a < b < c` rejected).
- **Tests.** One test per row of the precedence table; `a < b < c` and `a == b == c` each emit `loom/parse/comparison-chaining` whose message matches the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) *Message* template; mixed-type `+` rejected with `loom/parse/mixed-plus-operands` (registry template); division-by-zero produces `Infinity` per JS; ternary type-checks both arms.
- **Deps.** V2a.
- **Ships when.** Arithmetic and boolean expressions evaluate.

## V2d — Member access and indexed access

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md).
- **Adds.** `a.b` for objects; `a[i]` for arrays and string-keyed objects. `obj.field = ...` and `arr[i] = ...` remain parse errors (V2b).
- **Tests.** Member access on anonymous object literals (V2-internal); index access on arrays; OOB returns runtime panic (V18o-routed); null member access panics.
- **Deps.** V2c.
- **Ships when.** Loom code can read structured values.

## V2e — Structural `==` deep equality

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md), [Runtime Value Model](../spec_topics/runtime-value-model.md) (equality).
- **Adds.** Deep value equality for arrays and anonymous objects; primitive equality via `Object.is` (NaN==NaN is true; +0 != -0). `===` rejected.
- **Tests.** Nested array/object equality; NaN reflexivity; +0/-0 inequality; `===` rejected with the documented hint.
- **Deps.** V2c.
- **Ships when.** `==` works on all V2-reachable value shapes.

## V2f — Truthiness rule

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md) (truthiness).
- **Adds.** `if`/`while`/ternary-cond/`&&`/`||` accept only `boolean`. Non-boolean operand is a parse error with the spec's hint (`if (x != "")`, etc.).
- **Tests.** Each position rejects `string`, `number`, `null` with `loom/parse/non-boolean-condition` (registry *Message* template); `boolean` accepted; the rendered hint matches the [diagnostics registry](../spec_topics/diagnostics.md#code-registry) *Hint* column.
- **Deps.** V2c (operators).
- **Ships when.** Truthiness rule is enforced uniformly.

## V2g — String stdlib

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md) (`string` table).
- **Adds.** `length`, `toLowerCase`, `toUpperCase`, `trim`, `startsWith`, `endsWith`, `includes`, `split`, `replace` (all-occurrences, literal-only).
- **Tests.** Each method against JS semantics; `replace` divergence from JS verified (replaces all); `split` literal-only (regex args rejected); unknown method is parse-time error.
- **Deps.** V2d.
- **Ships when.** String operations available in expressions.

## V2h — Array stdlib and array literals

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md) (`array<T>` table), [Object construction, array construction, and operator rules](../spec_topics/expressions.md#object-construction-array-construction-and-operator-rules).
- **Adds.** `[]`, `[a, b, c]`; `length`, `join`, `includes`, `indexOf`, `slice`, `concat`. Common-type rules for literals (sink-driven; `integer`-widens-to-`number`).
- **Tests.** Each method; `join` rejects non-string element type with `loom/parse/non-string-array-join` (registry *Message* template); element-type-mismatch in literal rejected with `loom/parse/array-element-type-mismatch` (registry template, naming the offending element); sink propagates element type into elements.
- **Deps.** V2c, V2d.
- **Ships when.** Arrays usable end-to-end.

## V2i — Object stdlib

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md) (`object` table).
- **Adds.** `keys`, `values`, `has` on any object value (anonymous in V2; schema-typed once V4 lands).
- **Tests.** Iteration order matches insertion order for anonymous objects; `has` returns `false` for unknown key (no panic); values-array element type is union of field types.
- **Deps.** V2d.
- **Ships when.** Object reflection methods callable.
