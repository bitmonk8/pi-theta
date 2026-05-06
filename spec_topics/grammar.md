# Grammar Appendix

This appendix is normative for the productions it covers. It exists for the few surface-syntax forms that no single topic page owns end-to-end, and for the **literal sublanguage** that Loom uses wherever a value is written outside expression context (frontmatter `params:` defaults and Pi-tool call arguments). Other surfaces are owned by their topic pages and are not restated here.

Notation: `::=` defines a production; `|` separates alternatives; `?` marks an optional element; `*` zero-or-more, `+` one-or-more; quoted strings are terminal tokens. Lexical productions (`Ident`, `STRING`, `NUMBER`, `BOOLEAN`, `NULL`) are defined in [Lexical Structure](./lexical.md).

## Loom literal sublanguage

The Loom literal sublanguage is a strict subset of the expression grammar admitted in two positions: the RHS of a `params:` default (see [Parameters and Frontmatter — Defaults](./frontmatter.md)) and the single positional argument of a call whose callee resolves to a Pi tool (see [Tool Calls — Argument shape](./tool-calls.md), [Expression Sublanguage — Object construction](./expressions.md)). It is **not** a separate dialect — every literal is a legal Loom expression — but only the productions enumerated below are admitted, and the parser performs an "is-literal" check after parsing the AST in those positions. Failures are `loom/parse/default-not-literal` (defaults position) or `loom/parse/tool-arg-not-literal` (Pi-tool argument position); the diagnostic names the offending sub-expression.

```
Literal      ::= PrimitiveLit
              | NamedValueLit
              | ArrayLit
              | BareObjectLit
              | NamedObjectLit

PrimitiveLit ::= STRING
              | NUMBER
              | "-" NUMBER                  // unary minus on a numeric literal counts as a literal
              | BOOLEAN
              | NULL

NamedValueLit ::= Ident "." Ident           // Enum.Variant access; head is an enum name in scope, tail a declared variant

ArrayLit     ::= "[" (Literal ("," Literal)* ","?)? "]"

BareObjectLit ::= "{" (FieldEntry ("," FieldEntry)* ","?)? "}"
FieldEntry   ::= Ident ":" Literal          // bare-key form; LHS schema supplies the type

NamedObjectLit ::= Ident "{" (FieldEntry ("," FieldEntry)* ","?)? "}"
                                            // schema- or variant-name constructor (`Cat { name: "x" }`)
```

**Position rules.**

- `BareObjectLit` is admitted only when an external schema supplies the type — the LHS of a `params:` default supplies it via the param's declared type; a Pi-tool call argument supplies it via the Pi tool's registered input schema.
- `NamedObjectLit` is the form used wherever the type is not supplied externally — including discriminated-union variants (`Cat { name: "x" }`, never `Animal { species: "cat", name: "x" }`).

**Field rules** (apply identically to `BareObjectLit` and `NamedObjectLit`):

- Every declared field of the LHS schema (or the named variant schema) MUST be present. Omissions are `loom/parse/missing-object-field`; partial defaults are not supported.
- Field order is free; the parser does not require declared order.
- Discriminator fields in discriminated-union-variant constructors are implicit — the variant schema supplies them. Authors write `Cat { name: "Whiskers" }`, not `Cat { species: "cat", name: "Whiskers" }`.

**Forbidden inside a literal** — every form below is rejected by the is-literal check, even though it parses as a Loom expression in unrestricted positions:

- Identifier references other than `Ident "." Ident` against an enum (no parameter references, no `let`-bound names, no function names).
- Operators other than the unary `-` carve-out for numeric literals (no `+`, no `&&`, no comparison, no ternary).
- Function and tool calls (no `f(x)`, no `<tool>(args)`).
- Template interpolation `${...}` and `@`...`` query templates.
- Member access on anything other than `Enum.Variant` (no `obj.field`, no `arr[i]`).

The is-literal check runs at parse time against the Loom AST; it does not require a separate parser. Authors who need expressions inside a value should bind them via `let` first and pass them through a typed `params:` callee or use `invoke(...)`.

## `let` form

```
LetStmt      ::= "let" "mut"? Pattern (":" Type)? "=" Expr
```

`let` requires an initialiser. `let x: T` (annotation, no initialiser) is `loom/parse/let-without-initialiser`: Loom has no `undefined` value, no definite-assignment analysis, and no per-type "zero" default, so a binding with no value cannot be type-soundly admitted. Authors who would write a forward declaration should restructure to bind once at the point a value is available, or use `let mut` with an explicit initial value.

`Pattern` here is the discard `_` or an identifier; full destructuring patterns appear only inside `match` arms (see [Errors and Results — Pattern grammar](./errors-and-results.md)).

`Type` is the type grammar below.

## Type grammar

```
Type         ::= PrimitiveType
              | NamedType
              | "array" "<" Type ">"
              | Type "|" Type                 // type-union; right-associative
              | LiteralType

PrimitiveType ::= "string" | "number" | "integer" | "boolean" | "null" | "void"
NamedType     ::= Ident                       // schema or enum name (PascalCase)
LiteralType   ::= STRING | NUMBER | BOOLEAN | NULL
```

`Type` annotations appear in `let`, `fn` parameter and return positions, schema field types, `params:` field types, and `invoke<Type>` / type-ascription contexts. The same grammar applies in every position; nullability is written `T | null`.

## Block expressions

<a id="block-expressions"></a>

Loom distinguishes *expression-position blocks* (the right-hand side of `let`, `match`-arm bodies wrapped in `{ … }`, `if` / `while` arm bodies, and any other position where a value is required) from *body blocks* (a function body, the top level of a `.loom` file). Expression-position blocks require a trailing tail `Expr`; body blocks do not.

```
BlockExpr    ::= "{" Stmt* Expr "}"           // expression-position; tail Expr required, value is the tail expression
FnBody       ::= "{" Stmt* Expr? "}"          // function body; tail Expr optional, see Function Definitions — Empty-tail body
LoomBody     ::= Stmt* Expr?                  // top level of a .loom file; tail Expr optional, same rule
```

When `FnBody` or `LoomBody` is parsed without a trailing `Expr`, the function or loom's inferred return type is `null` (the literal type) and its final value is the literal `null`, per [Function Definitions — Empty-tail body](./functions.md#empty-tail-body). Authors who want the function or loom to be syntactically required to produce a value should declare an explicit non-`void` / non-`null` return type; `void` is the explicit "intentionally produces no value" annotation and is governed by the same page.

## `match` arm body

```
MatchArm     ::= Pattern "=>" ArmBody
ArmBody      ::= Expr
              | BlockExpr                    // expression-position block — see above; value is the tail expression
```

An arm body is a single expression. Statements (`if`, `for`, `while`, `let`, assignment, `break`, `continue`, `return`) are not expressions in Loom and are not admissible as arm bodies on their own. To execute statements before producing the arm's value, wrap them in a block expression:

```loom
match result {
  Ok(s)  => s,
  Err(e) => {
    let mut count = 0
    count += 1
    "fallback"
  },
}
```

`if` / `for` / `while` inside an arm body without the surrounding `{ ... }` block is `loom/parse/statement-in-arm-body`. The ternary `cond ? a : b` is the expression form of conditional and is admissible directly.

## `schema X by <field>`

```
SchemaDecl   ::= "schema" Ident SchemaShape
SchemaShape  ::= "{" Field ("," Field)* ","? "}"               // object form
              | "=" UnionRhs                                   // alias / union form
              | "by" Ident "=" UnionRhs                        // explicit-discriminator union form
UnionRhs     ::= Type ("|" Type)+
```

The `by <field>` clause is admitted **only** on the union form (the alternative beginning with `=`). A `schema X by f { ... }` declaration with an object body is `loom/parse/by-on-object-schema`; the diagnostic message is *`"the 'by' clause applies only to discriminated-union schemas (schema X by f = A | B | …)"`*. Object schemas have one variant by definition and the discriminator concept does not apply.

## `///` placement

```
DocComment   ::= ("///" RestOfLine "\n")+
```

A `DocComment` is a maximal run of consecutive `///` lines (joined per [Descriptions](./descriptions.md)). It is admitted immediately above any of the following productions; it MUST NOT appear inline with the production it describes:

- `SchemaDecl` (object form, alias form, and explicit-discriminator union form alike — every `schema X …` declaration accepts a leading `DocComment`).
- `EnumDecl` (the entire enum declaration).
- A field within an object schema body.
- A variant within an `enum` body.
- `FnDecl` (top-level `fn` declarations in `.loom` and `.warp` files; nested `fn` is forbidden by [Function Definitions](./functions.md) regardless of `///`).

`///` above any other production — `let`, `import`, `export`, expression statements, control-flow statements — is `loom/parse/doc-comment-misplaced`. A `///` description on a `fn` lowers nowhere (functions have no JSON Schema); the description is purely human-facing and is preserved on the AST for tooling that wants to render it. A `///` description on an alias schema (`schema X = T | U`) lowers as the description of the named type wherever it surfaces in JSON Schema output.

## Newline continuation

Statements are separated by newlines. A statement implicitly continues across one or more newlines when, and only when, one of the **continuation triggers** below holds at the boundary. The trigger set is closed.

| Trigger | Position | Example |
|---|---|---|
| Open bracket without a matching close | the line ends with an unmatched `(` / `[` / `{` | `let x = [\n  1, 2, 3\n]` |
| Trailing binary or ternary operator | the line ends with one of `+ - * / % == != < <= > >= && \|\| ? :` | `let x = a +\n  b` |
| Trailing comma | the line ends with `,` (inside any open `(` / `[` / `{`) | `f(a,\n  b)` |
| Leading binary or ternary operator | the next non-blank line begins with one of the operators above | `let x = a\n  + b` |

**Blank lines do not break a continuation.** When any of the four triggers holds, the parser continues across one or more newlines regardless of how many of those newlines are blank. `let x =\n\n  foo` is one statement equivalent to `let x = foo`. Trailing whitespace on the prior line is irrelevant. The same rule applies to the leading-operator form: `let x = a\n\n  + b` continues across the blank line.

When no trigger holds, the newline closes the statement. There is no semicolon escape and no explicit line-continuation marker (no `\` at end of line; backslash inside source is a parse error per [Lexical Structure](./lexical.md)).

## `array<T>` literal type-sink rule

`[]` and `[expr, ...]` literals require a *type sink* in surrounding context to determine the element type when the elements alone are insufficient — see [Expression Sublanguage — Array construction](./expressions.md). The sink set is exhaustive:

- A binding annotation (`let xs: array<T> = ...`).
- A function parameter type at a call site.
- The declared type of a surrounding constructor field (`Schema { items: [...] }`).
- The element type of an array-typed sink that this literal is itself an element of (recursive descent).

The iterand of a `for x in expr` is **not** a sink — `for` cannot supply `T` to `[]`. `for x in []` with no other sink is `loom/parse/array-no-common-type`, the same diagnostic that `let xs = []` raises in unannotated position. This is the same hole; resist any `for`-specific carve-out.
