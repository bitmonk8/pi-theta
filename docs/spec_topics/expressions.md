# Expression Sublanguage

Theta expressions are a bounded subset of TypeScript. The same grammar applies wherever an expression is expected: the RHS of `let`, `if` / `match` scrutinees, function arguments, and inside `${...}` template interpolations.

## Supported forms

- Literals: `string` (single- or double-quoted), `number`, `boolean` (`true` / `false`), `null`
- Identifiers (variables, parameters, function names, schema constructors)
- Member access: `a.b`
- Indexed access: `a["b"]`, `a[0]`, `a[i]` — the receiver `a` must be an `array<T>` or an object value; indexing any other type (including a `string`) is `theta/parse/non-indexable-receiver` (use `s.split(...)` to decompose a string). For an **object** receiver the index expression must be of type `string`; a non-`string` index (e.g. `obj[0]`) is rejected at parse time as `theta/parse/non-string-object-index`, with no literal-key/dynamic-key distinction (`obj["b"]` and `obj[k]` parse identically). The index names a theta-side name (see [Runtime Value Model](./runtime-value-model.md)), not a wire name. The static result type of `obj[k]` is the union of the receiver's declared field types — the same element type [`values()`](#built-in-methods-and-properties) produces — applied uniformly regardless of the index; an author wanting the per-field declared type uses member access (`obj.fieldName`). At runtime an array index outside `0..arr.length` panics with `theta/runtime/index-out-of-bounds`, and an object index whose theta-side name is absent panics with `theta/runtime/missing-object-key`; both are entries on the canonical closed list in [Errors and Results — Runtime panics](./errors-and-results/error-model.md#runtime-panics). The read order is the parse-time key-type check first, then the runtime missing-key panic.
- Function, method, and tool calls: `f(x)`, `obj.method(x, y)`, `<name>(args)` where `<name>` resolves to a Pi tool or `.theta` callable from the theta's `tools:` frontmatter (see [Tool Calls](./tool-calls.md))
- Unary: `!`, `-`
- Binary arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Logical: `&&`, `||`
- Ternary: `cond ? a : b`
- Postfix error-propagation: `expr?` — admitted only on a `Result<T, QueryError>`-typed (for some `T`) operand; the operand-type and enclosing-scope preconditions and the unwrap / early-return semantics are specified at [§ Error propagation — the `?` operator](#question-operator) below
- Parenthesised: `(expr)`
- Query templates (back-tick prefixed by `@`): the literal form of the [Query](./query.md) expression; `${...}` inside them takes any expression listed above
- Array literals: `[]`, `[a, b, c]`
- Schema constructors: `Schema { field: expr, ... }` (see [Object construction](#object-construction-array-construction-and-operator-rules) below)
- Enum variant access: `Enum.Variant`
- `Result` constructors: `Ok(expr)`, `Err(expr)`

## Not supported

(Parse error — `theta/parse/unsupported-feature` unless a more specific code below applies.)

- Assignment in expression position (`=`, `+=`, etc.) — assignment is a statement, see [Bindings and Mutability](./bindings.md)
- Field- or index-level mutation (`obj.field = ...`, `arr[i] = ...`) — only whole-binding rebinding is supported in theta 1.0; see [Bindings and Mutability](./bindings.md)
- Arrow functions and any callback-taking higher-order method (no `map` / `filter` / `reduce`; use `for`)
- Spread / rest (`...`)
- `new`, `typeof`, `instanceof`, `delete`, `void`, `yield`, `await`
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Strict equality (`===`, `!==`) — Theta `==` is structural (see below)
- Bitwise operators (`& | ^ ~ << >> >>>`)
- Increment / decrement (`++`, `--`)
- Comma operator
- Nested template strings inside a `${...}` interpolation
- Query templates (`@`...``) and `match` inside `${...}` — both are allowed at statement / `let`-RHS level only, so template evaluation is guaranteed to be code-only and never silently fires a model turn

## Identifier resolution

A bare identifier in call position (`name(args)`) resolves in this order, first match wins:

1. A local `let` binding or function parameter currently in scope.
2. A top-level `fn` declaration in the same `.theta` or `.thetalib` file.
3. A symbol imported from a `.thetalib` file (see [Imports](./imports.md)).
4. A name registered in the theta's callable set (Pi tool or `.theta` callable; see [Tool Calls](./tool-calls.md)).

No match is `theta/parse/unknown-identifier`. Collisions across (2)–(4) are rejected at load time — a `tools:` entry whose post-rename name shadows a top-level `fn` or import in the same file fails to register; resolve with the `as` clause. Local bindings (1) shadow everything else lexically, the same as in Rust or TypeScript.

## Equality

`==` is structural: deep value equality for objects and arrays, value equality for primitives. There is no `===`. As primitive refinements, `NaN == NaN` is `true` and `+0 == -0` is `true` — deliberately asymmetric with the `NaN` ordering rule in [§ Ordering comparisons](#ordering-comparisons), under which all four ordering operators on `NaN` produce `false`. `==` / `!=` also accept operands of *different* static types: unlike the ordering operators, a cross-type pair never raises `theta/parse/non-orderable-operands` — it loads and evaluates to `false` (`==`) or `true` (`!=`) when neither operand's static type is compatible with the other per [Type System — Type compatibility](./type-system.md#type-compatibility) (neither `⊑` the other). The full rule — arrays, objects, enums, `Result`, and the cross-type disposition — is defined in [Runtime Value Model — Equality](./runtime-value-model.md#equality).

## Truthiness

Only `true` and `false` are accepted in boolean position (`if`, `while`, `&&`, `||`, ternary condition). Using a non-boolean (`if (x)` where `x: string`) is `theta/parse/non-boolean-condition`; write `if (x != "")`, `if (xs.length > 0)`, etc. This avoids the JS empty-string / zero / `null` ambiguity.

## Evaluation order and short-circuiting

Operands evaluate left-to-right, and `&&` / `||` short-circuit. `&&` evaluates its left operand and evaluates the right operand only when the left is `true`; `||` evaluates its left operand and evaluates the right operand only when the left is `false`. A short-circuited right operand is not evaluated: its `@`-queries, tool calls, and `invoke` children do not run, produce no transcript entries, and spend no tokens. Both operators always produce `boolean` — theta has no JS last-truthy-operand widening, because operands are already constrained to boolean position (see [Truthiness](#truthiness)).

`cond ? a : b` evaluates `cond` first, then evaluates only the taken branch; the not-taken branch is not evaluated.

This order is fixed rather than implementation-defined because it is observable: which operands are skipped, and the order in which the evaluated ones run, determines which side effects commit and where cancellation can intervene between them. See [Cancellation — Granularity](./cancellation.md), whose per-sub-expression checkpoint placement depends on this order.

## Built-in methods and properties

A small stdlib is exposed on the primitive composite types. No user-defined methods; no `this`. theta 1.0 set:

*`string`*

| Member | Signature | Semantics |
|---|---|---|
| `length` | `: integer` | Number of UTF-16 code units (matches JS `.length`; theta does not perform grapheme segmentation in theta 1.0) |
| `toLowerCase()` | `(): string` | Locale-independent (`String.prototype.toLowerCase`) |
| `toUpperCase()` | `(): string` | Locale-independent |
| `trim()` | `(): string` | Strips Unicode whitespace from both ends |
| `startsWith(s)` | `(s: string): boolean` | JS semantics |
| `endsWith(s)` | `(s: string): boolean` | JS semantics |
| `includes(s)` | `(s: string): boolean` | JS semantics |
| `split(sep)` | `(sep: string): array<string>` | Literal-only (no regex). Empty separator splits into individual code-unit strings |
| `replace(from, to)` | `(from: string, to: string): string` | Replaces all occurrences via a single left-to-right, non-overlapping scan: after each match the next match is sought past the consumed region, with no rewind into the consumed text or the inserted replacement (matching host `String.prototype.replaceAll`). Literal-only (no regex); `$`-sequences in `to` (e.g. `$&`, `$$`, `$n`) are inserted literally, not interpreted as JS replacement patterns. Empty `from` returns the receiver unchanged |

`replace(from, to)` reference vectors (normative; conforming implementations MUST reproduce these exactly):

| Expression | Result |
| --- | --- |
| `"aXbXc".replace("X", "[$&]")` | `"a[$&]b[$&]c"` |
| `"100".replace("0", "$$")` | `"1$$$$"` |
| `"a-b".replace("-", "x$1y")` | `"ax$1yb"` |
| `"abc".replace("", "X")` | `"abc"` |
| `"aaaaa".replace("aa", "x")` | `"xxa"` |

The first vector exercises both the "Replaces all occurrences" clause and literal `$&`: a host `String.prototype.replaceAll` interpreting `$&` as the matched substring would yield `"a[X]b[X]c"`. The second vector distinguishes literal `$$` from the host `$$`→`$` escape (which would yield `"1$$"`). The third vector confirms `$n` is inserted literally (no capture-group expansion). The fourth vector exercises the "Empty `from` returns the receiver unchanged" clause. The fifth vector pins the left-to-right, non-overlapping scan: a right-to-left scan would yield `"axx"` and a rewind-after-replacement policy would yield other shapes, so reproducing `"xxa"` discriminates the mandated scan direction.

`string` is not indexable: `s[i]` is `theta/parse/non-indexable-receiver` (theta 1.0 exposes no `charAt` / `codePointAt`; use `s.split(...)` to decompose a string into a code-unit `array<string>`, then index that).

*`array<T>`*

| Member | Signature | Semantics |
|---|---|---|
| `length` | `: integer` | Element count |
| `join(sep)` | `(sep: string): string` | Concatenates elements with `sep`. Element type must be `string`; non-string element types are `theta/parse/non-string-array-join` (no implicit type conversion in theta 1.0) |
| `includes(x)` | `(x: T): boolean` | Membership test using theta structural equality |
| `indexOf(x)` | `(x: T): integer` | First index by structural equality, or `-1` if absent |
| `slice(start, end?)` | `(start: integer, end?: integer): array<T>` | JS semantics: negative indices count from the end; `end` exclusive; omitted `end` slices to length |
| `concat(other)` | `(other: array<U>): array<T ⊔ U>` | Returns a new array with `other`'s elements appended. Admissibility and the result element type are routed through `⊑` (see [Type System — Type compatibility](./type-system.md#type-compatibility)), as with the `+` operator: the result element type `T ⊔ U` is the least upper bound of the receiver element type `T` and `other`'s element type `U` under `⊑` — the same LUB the [array-literal rule](#object-construction-array-construction-and-operator-rules) computes — so `array<integer>.concat(array<number>)` widens to `array<number>` in both call directions. Disjoint element types union exactly as the array-literal LUB rule (case 2) computes, so `array<integer>.concat(array<string>)` types as `array<integer | string>`. |

*`object` (any object value, schema-typed or anonymous)*

| Member | Signature | Semantics |
|---|---|---|
| `keys()` | `(): array<string>` | Theta-side field names, in schema declaration order for named schemas; insertion order otherwise |
| `values()` | `(): array<T>` (heterogeneous; element type is the union of field types) | Field values in the same order as `keys()` |
| `has(k)` | `(k: string): boolean` | Whether a theta-side name is present. Returns `false` for unknown keys (no panic) — this is the explicit safe-check |

Additional methods may be added non-breakingly later (see [Future Considerations](./future-considerations.md)). Anything not on this list is `theta/parse/unknown-method` rather than a runtime failure.

## Operator precedence

From highest to lowest. Within the same level, associativity is as noted.

| Level | Operators | Associativity |
|---|---|---|
| 1 | `.` (member), `[]` (index), `()` (call), postfix `?` | left |
| 2 | unary `!`, unary `-` | right |
| 3 | `*`, `/`, `%` | left |
| 4 | `+`, `-` | left |
| 5 | `<`, `<=`, `>`, `>=` | non-associative |
| 6 | `==`, `!=` | non-associative |
| 7 | `&&` | left |
| 8 | `\|\|` | left |
| 9 | `?:` (ternary) | right |

Comparison and equality are non-associative: `a < b < c` is `theta/parse/comparison-chaining` ("comparison operators do not chain; use `&&`"). The type-position `|` (in type expressions) is the lowest-precedence type operator; it does not appear in value-expression grammar and so does not enter this table.

## Grammar disambiguation

Two ambiguities deserve explicit rules:

- **Struct-expression in scrutinee position.** Inside the condition of `if` / `while`, the scrutinee of `match`, and the iterated expression of `for`, a bare `Schema { ... }` constructor would be ambiguous with the body brace. These positions therefore require parentheses around any constructor: `if (Author { name: "x", role: "r", experience_years: 0 } == author) { ... }`. Outside scrutinee positions (RHS of `let`, function arguments, `${...}` interpolations, etc.), no parens are needed.
- **Newline continuation.** A binary or ternary operator at the *end* of a line continues the statement to the next line (`x +\n  y`); a binary or ternary operator at the *start* of a line continues from the previous line (`x\n  + y`). Both forms are legal and equivalent. Open-bracket forms (`(`, `[`, `{`) and trailing commas continue per the existing rule. A line break inside a `@`...`` query template's text is *not* a statement boundary — the template is one expression regardless of internal newlines.
- **`match`-arm body.** An arm body is a single expression; the full rule and the block-expression escape hatch for multi-statement arms are specified at [§ `match` expression — Arm syntax](#match-expression) above.

## `match` expression

**`match` expression** — exhaustive destructuring; arms evaluate to a value, so `match` is itself an expression:

```theta
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(e) => ReviewScore { value: 0, reason: "unrated: ${e.message}" }
}
```

<a id="pattern-grammar"></a>

**Pattern grammar (theta 1.0).** A `match` arm's left-hand side is one of:

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything; binds nothing |
| Identifier | `x` | anything; binds the value to `x` |
| Literal | `"validation"`, `0`, `true`, `null` | structural equality |
| Constructor | `Ok(p)`, `Err(p)` | the named `Result` variant; recurses into `p` |
| Object/schema | `QueryError { kind: "validation", cause: "schema_validation", attempts }` | object whose listed fields match the inner patterns; unlisted fields are ignored. Field shorthand `{ attempts }` is sugar for `{ attempts: attempts }` |
| Array | `[a, b]`, `[first, _, _]` | exact-length array; each slot matches its pattern |

Disambiguation: lowercase identifiers bind, capitalised identifiers refer to constructors or schema names. `Ok` and `Err` are reserved.

Guards (`Ok(x) if x.value > 3 => ...`) and rest patterns (`[first, ...rest]`, `{ kind, ...other }`) are not in theta 1.0: their use surfaces as `theta/parse/match-guard-not-supported` and `theta/parse/rest-pattern-not-supported` respectively. See [Future Considerations](./future-considerations.md).

**Exhaustiveness.** Not statically checked in theta 1.0. The analyser cannot enumerate the runtime values of `QueryError.kind` from the type system, so static exhaustiveness would be unsound. A `match` whose arms collectively fail to cover the scrutinee at runtime raises a `MatchError` (`theta/runtime/match-error`). Authors who want a catch-all should add a final `_ => ...` arm.

**Arm syntax.** `pattern => expression`, comma-separated. The trailing comma after the last arm is optional. All arms must produce values of the same type, or values whose types share a common upper bound under [Type System — Type compatibility](./type-system.md#type-compatibility) (every arm `⊑` the chosen common type, narrowed by any sink in scope on the `match` expression itself); a mismatched-arm `match` is `theta/parse/match-arm-type-mismatch`. An arm body is a single expression — statements (`if`, `for`, `while`, `let`, assignment, `break`, `continue`, `return`) are not expressions in Theta and are not admissible as arm bodies on their own. To execute statements before producing the arm's value, wrap them in a block expression `{ ... }` whose tail expression is the arm's value; the ternary `cond ? a : b` is the expression form of conditional and is admissible directly. A bare statement in arm-body position is `theta/parse/statement-in-arm-body`. The full grammar lives in [Grammar Appendix — `match` arm body](./grammar.md#match-arm-body).

## Error propagation — the `?` operator

<a id="question-operator"></a>

**`?` operator** — unwraps `Ok` to the inner value; on `Err`, *early-returns* the `Err` from the enclosing function (or top-level theta). The enclosing scope's return type must therefore be compatible with `Result<U, QueryError>` for some `U` under [Type System — Type compatibility](./type-system.md#type-compatibility) — i.e. either the scope carries no explicit return annotation (whereupon using `?` makes it implicitly return `Result<T, QueryError>`, per the implicit-return rule below) or its explicit return annotation `R` satisfies `Result<U, QueryError> ⊑ R`; otherwise the use of `?` is `theta/parse/question-outside-result-fn`. Concretely:

```theta
let critique = @`Critique this code:\n${code}`?  // string on success; early-return Err otherwise
```

Is equivalent to:

```theta
let critique = match @`Critique this code:\n${code}` {
  Ok(s)  => s,
  Err(e) => return Err(e)
}
```

A function or theta that uses `?` thus implicitly returns `Result<T, QueryError>` where `T` is the type of its last expression. A function that uses neither `?` nor an explicit `Result` return type is required to handle every query failure with `match` (or to discard explicitly per [Query — Discarded query results](./query.md), which defines the user-facing-vs-operator-facing observability contract for the discarded `Err`).

<a id="err-18"></a> **ERR-18.** **`?` operand-type precondition.** The operand to which `?` is applied MUST itself have Theta static type `Result<T, QueryError>` for some `T` — for instance a `@`-query, an `invoke(...)`, or an explicit `Ok(...)` / `Err(...)`. Applying `?` to an operand of any other type — e.g. `let x = 5?`, where `5` is `integer` — is `theta/parse/question-on-non-result`. The check is static (`type`-phase, per [Diagnostics](./diagnostics.md)); its disposition is the lex / parse / type batch pre-evaluation failure ([ERR-2](./errors-and-results/error-model.md#err-2)), so no `Result` is produced and there is no runtime disposition — the theta fails to load. This operand precondition is distinct from the enclosing-scope precondition above: `theta/parse/question-on-non-result` constrains the operand `?` unwraps, whereas `theta/parse/question-outside-result-fn` constrains the scope `?` early-returns from. The postfix `?` operator's surface syntax and precedence live in [Operator precedence](#operator-precedence).

## Object construction, array construction, and operator rules

## Object construction

Schema-typed values are constructed with `Schema { field: expr, ... }`. Every declared field of the schema must be present (omissions are `theta/parse/missing-object-field`); extra fields are `theta/parse/extra-object-field`; field order is irrelevant. Bare object literals (`{ field: expr }` with no leading schema name) surface as `theta/parse/bare-object-literal` — every constructed object must name its schema, so the type is unambiguous from the syntax alone. There are exactly two carve-outs, and in both an external schema supplies the type so the literal is bare. The two differ in what the field *values* may be: a `params:` default restricts them to the [Theta literal sublanguage](./grammar.md#theta-literal-sublanguage), whereas a Pi-tool argument admits full expressions:

1. **Frontmatter `params:` defaults.** The param's declared type supplies the schema name. The field values are restricted to the [Theta literal sublanguage](./grammar.md#theta-literal-sublanguage) (not the full expression grammar). See [Parameters and Frontmatter — Defaults](./frontmatter.md).
2. **Single positional argument of a Pi-tool call.** When a call's callee resolves (via the `tools:` table) to a Pi tool, a single bare-object argument is admitted; the Pi tool's registered input schema (TypeBox / JSON Schema) supplies the shape. Its field values are **full Theta expressions**, not literal-sublanguage forms (see the [`ToolArg` grammar](./grammar.md#pi-tool-argument-grammar)). See [Tool Calls — Argument shape](./tool-calls.md). The exception applies only when the callee is a Pi tool — `f({ ... })` for a `let`-bound name or a `.theta` callable remains `theta/parse/bare-object-literal` — and only to the single positional argument; multi-argument forms (`read({...}, {...})`) are rejected regardless.

For a discriminated union `schema Animal = Cat | Dog | Lizard`, construct via the variant schema name (`Cat { ... }`), not the union name. The constructed value is statically typed as the variant; assignment to an `Animal`-typed slot widens it.

## Array construction

`[]` is the empty array; its element type is inferred from context (binding annotation, parameter type, or surrounding constructor field). `[a, b, c]` is non-empty; its element type is the common type of its elements, narrowed by context if applicable. An array whose elements have no common type and no context to narrow against is `theta/parse/array-no-common-type`.

*Common-type rules for array literals (and ternary branches):* the underlying compatibility check is governed by [Type System — Type compatibility](./type-system.md#type-compatibility); the rules below apply that relation to the array-and-ternary case.

1. If a type sink is in scope (binding annotation, parameter type, etc.), every element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is `theta/parse/array-element-type-mismatch` naming the offending element.
2. Otherwise, the parser computes the *least upper bound* of the element types under `⊑`: identical types collapse ([TYPE-1](./type-system.md#type-1)); `integer` widens to `number` when mixed with `number` ([TYPE-2](./type-system.md#type-2)); otherwise the element types are unioned via [TYPE-5](./type-system.md#type-5) and [TYPE-6](./type-system.md#type-6) (`["a", null]` → `array<string | null>`; `[1, "a"]` → `array<number | string>`).
3. Object schemas do not unify implicitly — an array containing two different named schemas yields `array<A | B>` only if some sink in scope expects a union; otherwise it is `theta/parse/array-no-common-type` ("array elements have no common type; annotate the binding with `array<A | B>` or use a single schema").

**`+` operator.** On two `number` (or `integer`) operands, addition; the result widens to `number` if either operand is `number` — the same `integer ⊑ number` widening defined in [Type System — Type compatibility](./type-system.md#type-2) (TYPE-2). On two `string` operands, concatenation. Mixed-type operands are `theta/parse/mixed-plus-operands` — write an explicit conversion or interpolate inside a string. `+` on `array<T>` is not supported; use `arr.concat(other)`. See [Diagnostics](./diagnostics.md) for the full code registry.

## Other arithmetic

`-`, `*`, `/`, `%` accept only numeric operands. Binary `-` and `*` produce `integer` when both operands are `integer` and widen to `number` when either operand is `number` — the same `integer ⊑ number` widening defined in [Type System — Type compatibility](./type-system.md#type-2) (TYPE-2). Unary `-` applies the same rule to its single operand: `integer` in yields `integer`, `number` in yields `number`. `/` always produces `number` (no integer-division operator in theta 1.0; see [Future Considerations](./future-considerations.md)). `%` follows the same `integer ⊑ number` widening: two `integer` operands produce `integer`, and either operand being `number` widens the result to `number`. Division by zero produces IEEE-754 `Infinity` / `-Infinity` / `NaN` per JS semantics; it does not panic. Modulo by zero (`n % 0`) likewise produces `NaN` and does not panic; because `NaN` is a `number`, an `integer % 0` result widens to `number` — the same `integer ⊑ number` widening defined in [Type System — Type compatibility](./type-system.md#type-2) (TYPE-2). An `integer`-typed result of binary `-`, `*`, `%`, or unary `-` whose computed magnitude exceeds the safe-integer bound (`|value| > 2^53 - 1`) is computed in IEEE-754 double precision and silently loses precision; it does not panic, and it retains the static `integer` type assigned by the operator's widening rule above rather than widening to `number`. This non-panic disposition matches integer overflow's deliberate exclusion from the closed panic list in [Errors and Results — Runtime panics](./errors-and-results/error-model.md#runtime-panics); `/` already produces `number` and is outside this rule.

## Ordering comparisons

`<`, `<=`, `>`, `>=` accept either two `number`/`integer` operands or two `string` operands. The `integer ⊑ number` widening defined in [Type System — Type compatibility](./type-system.md#type-2) (TYPE-2) applies, so a `number` may be compared against an `integer`. Any other operand pairing — for instance a numeric operand against a `string`, or an operand whose type is `boolean`, `null`, an enum, a union, an object schema, or `array<T>` — is `theta/parse/non-orderable-operands`; use `==` / `!=` for value comparison on those types.

Numeric operands order by their signed IEEE-754 numeric value, so `-5 < 3` (this is ordinary signed ordering, not ordering by magnitude / absolute value); `NaN` operands follow the unordered rule in the paragraph below. String operands order lexicographically by UTF-16 code unit — the same code-unit basis as the string [`length` member](#built-in-methods-and-properties) — not by Unicode code point or by locale-aware collation.

Ordering against `NaN` always produces `false` and never panics: `NaN < 1`, `1 < NaN`, `NaN <= NaN`, and the `>` / `>=` forms all evaluate to `false`. This follows IEEE-754 unordered semantics and is deliberately asymmetric with the equality rule, under which `NaN == NaN` is `true` (see [Runtime Value Model — Equality](./runtime-value-model.md#equality)).
