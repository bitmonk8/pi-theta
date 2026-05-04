# Expression Sublanguage

Loom expressions are a bounded subset of TypeScript. The same grammar applies wherever an expression is expected: the RHS of `let`, `if` / `match` scrutinees, function arguments, and inside `${...}` template interpolations.

**Supported forms:**

- Literals: `string` (single- or double-quoted), `number`, `boolean` (`true` / `false`), `null`
- Identifiers (variables, parameters, function names, schema constructors)
- Member access: `a.b`
- Indexed access: `a["b"]`, `a[0]`, `a[i]`
- Function, method, and tool calls: `f(x)`, `obj.method(x, y)`, `<name>(args)` where `<name>` resolves to a Pi tool or registered loom from the loom's `tools:` frontmatter (see [Tool Calls](./tool-calls.md))
- Unary: `!`, `-`
- Binary arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Logical: `&&`, `||`
- Ternary: `cond ? a : b`
- Parenthesised: `(expr)`
- Query templates (back-tick prefixed by `@`): the literal form of the [Query](./query.md) expression; `${...}` inside them takes any expression listed above
- Array literals: `[]`, `[a, b, c]`
- Schema constructors: `Schema { field: expr, ... }` (see [Object construction](#object-construction-array-construction-and-operator-rules) below)
- Enum variant access: `Enum.Variant`
- `Result` constructors: `Ok(expr)`, `Err(expr)`

**Not supported (parse error):**

- Assignment in expression position (`=`, `+=`, etc.) — assignment is a statement, see [Bindings and Mutability](./bindings.md)
- Field- or index-level mutation (`obj.field = ...`, `arr[i] = ...`) — only whole-binding rebinding is supported in V1; see [Bindings and Mutability](./bindings.md)
- Arrow functions and any callback-taking higher-order method (no `map` / `filter` / `reduce`; use `for`)
- Spread / rest (`...`)
- `new`, `typeof`, `instanceof`, `delete`, `void`, `yield`, `await`
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Strict equality (`===`, `!==`) — Loom `==` is structural (see below)
- Bitwise operators (`& | ^ ~ << >> >>>`)
- Increment / decrement (`++`, `--`)
- Comma operator
- Nested template strings inside a `${...}` interpolation
- Query templates (`@`...``) and `match` inside `${...}` — both are allowed at statement / `let`-RHS level only, so template evaluation is guaranteed to be code-only and never silently fires a model turn

**Identifier resolution.** A bare identifier in call position (`name(args)`) resolves in this order, first match wins:

1. A local `let` binding or function parameter currently in scope.
2. A top-level `fn` declaration in the same `.loom` or `.warp` file.
3. A symbol imported from a `.warp` file (see [Imports](./imports.md)).
4. A name registered in the loom's frontmatter `tools:` set (Pi tool or `.loom` path; see [Tool Calls](./tool-calls.md)).

No match is an `"unknown identifier"` parse error. Collisions across (2)–(4) are rejected at load time — a `tools:` entry whose post-rename name shadows a top-level `fn` or import in the same file fails to register; resolve with the `as` clause. Local bindings (1) shadow everything else lexically, the same as in Rust or TypeScript.

**Equality.** `==` is structural: deep value equality for objects and arrays, value equality for primitives. There is no `===`.

**Truthiness.** Only `true` and `false` are accepted in boolean position (`if`, `while`, `&&`, `||`, ternary condition). Using a non-boolean (`if (x)` where `x: string`) is a parse error; write `if (x != "")`, `if (xs.length > 0)`, etc. This avoids the JS empty-string / zero / `null` ambiguity.

**Built-in methods and properties.** A small stdlib is exposed on the primitive composite types. No user-defined methods; no `this`. V1 set:

*`string`*

| Member | Signature | Semantics |
|---|---|---|
| `length` | `: integer` | Number of UTF-16 code units (matches JS `.length`; loom does not perform grapheme segmentation in V1) |
| `toLowerCase()` | `(): string` | Locale-independent (`String.prototype.toLowerCase`) |
| `toUpperCase()` | `(): string` | Locale-independent |
| `trim()` | `(): string` | Strips Unicode whitespace from both ends |
| `startsWith(s)` | `(s: string): boolean` | JS semantics |
| `endsWith(s)` | `(s: string): boolean` | JS semantics |
| `includes(s)` | `(s: string): boolean` | JS semantics |
| `split(sep)` | `(sep: string): array<string>` | Literal-only (no regex). Empty separator splits into individual code-unit strings |
| `replace(from, to)` | `(from: string, to: string): string` | Replaces all occurrences. Literal-only (no regex) |

*`array<T>`*

| Member | Signature | Semantics |
|---|---|---|
| `length` | `: integer` | Element count |
| `join(sep)` | `(sep: string): string` | Concatenates elements with `sep`. Element type must be `string`; non-string element types are a parse error (no implicit coercion in V1) |
| `includes(x)` | `(x: T): boolean` | Membership test using loom structural equality |
| `indexOf(x)` | `(x: T): integer` | First index by structural equality, or `-1` if absent |
| `slice(start, end?)` | `(start: integer, end?: integer): array<T>` | JS semantics: negative indices count from the end; `end` exclusive; omitted `end` slices to length |
| `concat(other)` | `(other: array<T>): array<T>` | Returns a new array with `other`'s elements appended; element type must match |

*`object` (any object value, schema-typed or anonymous)*

| Member | Signature | Semantics |
|---|---|---|
| `keys()` | `(): array<string>` | Loom-side field names, in schema declaration order for named schemas; insertion order otherwise |
| `values()` | `(): array<T>` (heterogeneous; element type is the union of field types) | Field values in the same order as `keys()` |
| `has(k)` | `(k: string): boolean` | Whether a loom-side field name is present. Returns `false` for unknown keys (no panic) — this is the explicit safe-check |

Additional methods may be added non-breakingly later (see [Future Considerations](./future-considerations.md)). Anything not on this list is a parse-time "unknown method" error rather than a runtime failure.

## Operator precedence

From highest to lowest. Within the same level, associativity is as noted.

| Level | Operators | Associativity |
|---|---|---|
| 1 | `.` (member), `[]` (index), `()` (call) | left |
| 2 | unary `!`, unary `-` | right |
| 3 | `*`, `/`, `%` | left |
| 4 | `+`, `-` | left |
| 5 | `<`, `<=`, `>`, `>=` | non-associative |
| 6 | `==`, `!=` | non-associative |
| 7 | `&&` | left |
| 8 | `\|\|` | left |
| 9 | `?:` (ternary) | right |

Comparison and equality are non-associative: `a < b < c` is a parse error ("comparison operators do not chain; use `&&`"). The type-position `|` (in type expressions) is the lowest-precedence type operator; it does not appear in value-expression grammar and so does not enter this table.

## Grammar disambiguation

Two ambiguities deserve explicit rules:

- **Struct-expression in scrutinee position.** Inside the condition of `if` / `while`, the scrutinee of `match`, and the iterated expression of `for`, a bare `Schema { ... }` constructor would be ambiguous with the body brace. These positions therefore require parentheses around any constructor: `if (Author { name: "x", role: "r", experience_years: 0 } == author) { ... }`. Outside scrutinee positions (RHS of `let`, function arguments, `${...}` interpolations, etc.), no parens are needed.
- **Newline continuation.** A binary or ternary operator at the *end* of a line continues the statement to the next line (`x +\n  y`); a binary or ternary operator at the *start* of a line continues from the previous line (`x\n  + y`). Both forms are legal and equivalent. Open-bracket forms (`(`, `[`, `{`) and trailing commas continue per the existing rule. A line break inside a `@`...`` query template's text is *not* a statement boundary — the template is one expression regardless of internal newlines.
- **`match`-arm body.** An arm body is a single expression. To execute multiple statements in an arm, wrap them in a block expression `{ ... }` whose value is the block's tail expression.

## Object construction, array construction, and operator rules

**Object construction.** Schema-typed values are constructed with `Schema { field: expr, ... }`. Every declared field of the schema must be present; extra fields are a parse error; field order is irrelevant. Bare object literals (`{ field: expr }` with no leading schema name) are not legal in expression position — every constructed object must name its schema, so the type is unambiguous from the syntax alone. The frontmatter `params:` defaults are the one exception: there the param's declared type supplies the schema name, so the literal is bare (and is parsed as JSON-shaped, not as a Loom expression).

For a discriminated union `schema Animal = Cat | Dog | Lizard`, construct via the variant schema name (`Cat { ... }`), not the union name. The constructed value is statically typed as the variant; assignment to an `Animal`-typed slot widens it.

**Array construction.** `[]` is the empty array; its element type is inferred from context (binding annotation, parameter type, or surrounding constructor field). `[a, b, c]` is non-empty; its element type is the common type of its elements, narrowed by context if applicable. An array whose elements have no common type and no context to narrow against is a parse error.

*Common-type rules for array literals (and ternary branches):*

1. If a type sink is in scope (binding annotation, parameter type, etc.), every element type-checks against the sink's element type; a mismatch is a parse error naming the offending element.
2. Otherwise, the parser computes the *least upper bound* of the element types: identical types collapse; `integer` widens to `number` when mixed with `number`; otherwise the element types are unioned (`["a", null]` → `array<string | null>`; `[1, "a"]` → `array<number | string>`).
3. Object schemas do not unify implicitly — an array containing two different named schemas yields `array<A | B>` only if some sink in scope expects a union; otherwise it is a parse error ("array elements have no common type; annotate the binding with `array<A | B>` or use a single schema").

**`+` operator.** On two `number` (or `integer`) operands, addition; the result widens to `number` if either operand is `number`. On two `string` operands, concatenation. Mixed-type operands are a parse error — write an explicit conversion or interpolate inside a string. `+` on `array<T>` is not supported; use `arr.concat(other)`.

**Other arithmetic.** `-`, `*`, `/`, `%` accept only numeric operands. `/` always produces `number` (no integer-division operator in V1; see [Future Considerations](./future-considerations.md)). `%` requires same-typed operands and preserves the type. Division by zero produces IEEE-754 `Infinity` / `-Infinity` / `NaN` per JS semantics; it does not panic.
