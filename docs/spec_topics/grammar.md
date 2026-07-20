# Grammar Appendix

This appendix is normative for the productions it covers. It exists for the few surface-syntax forms that no single topic page owns end-to-end, for the **literal sublanguage** that Theta uses for frontmatter `params:` defaults, and for the **Pi-tool argument** grammar (whose bare-object *shape* it fixes while admitting full expressions for the field *values*). Other surfaces are owned by their topic pages and are not restated here.

Notation: `::=` defines a production; `|` separates alternatives; `?` marks an optional element; `*` zero-or-more, `+` one-or-more; quoted strings are terminal tokens. Lexical productions (`Ident`, `STRING`, `NUMBER`, `BOOLEAN`, `NULL`) are defined in [Lexical Structure](./lexical.md).

## Theta literal sublanguage

The Theta literal sublanguage is a strict subset of the expression grammar admitted in one position: the RHS of a `params:` default (see [Parameters and Frontmatter — Defaults](./frontmatter.md)). It is **not** a separate dialect — every literal is a legal Theta expression — but only the productions enumerated below are admitted, and the parser performs an "is-literal" check after parsing the AST in that position. A failure is `theta/parse/default-not-literal`; the diagnostic names the offending sub-expression.

The single positional argument of a Pi-tool call is **no longer** a literal-sublanguage position for its field *values*. Its bare-object *shape* is still fixed — the argument is written inline as a bare object literal whose field names come from the tool's registered input schema — but each field *value* is a full Theta expression, governed by the [`ToolArg` grammar](#pi-tool-argument-grammar) below rather than by the literal sublanguage.

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

- `BareObjectLit` is admitted only when an external schema supplies the type — in the literal sublanguage this is the LHS of a `params:` default, which supplies it via the param's declared type. (The bare-object argument of a Pi-tool call is also externally typed, but its field values are full expressions and are governed by the [`ToolArg` grammar](#pi-tool-argument-grammar) below, not by this production.)
- `NamedObjectLit` is the form used wherever the type is not supplied externally — including discriminated-union variants (`Cat { name: "x" }`, never `Animal { species: "cat", name: "x" }`).

**Field rules** (apply identically to `BareObjectLit` and `NamedObjectLit`):

- Every declared field of the LHS schema (or the named variant schema) MUST be present. Omissions are `theta/parse/missing-object-field`; partial defaults are not supported.
- Field order is free; the parser does not require declared order.
- Discriminator fields in discriminated-union-variant constructors are implicit — the variant schema supplies them. Authors write `Cat { name: "Whiskers" }`, not `Cat { species: "cat", name: "Whiskers" }`.

**Forbidden inside a literal** — every form below is rejected by the is-literal check, even though it parses as a Theta expression in unrestricted positions:

- Identifier references other than `Ident "." Ident` against an enum (no parameter references, no `let`-bound names, no function names).
- Operators other than the unary `-` carve-out for numeric literals (no `+`, no `&&`, no comparison, no ternary).
- Function and tool calls (no `f(x)`, no `<tool>(args)`).
- Template interpolation `${...}` and `@`...`` query templates.
- Member access on anything other than `Enum.Variant` (no `obj.field`, no `arr[i]`).

The is-literal check runs at parse time against the Theta AST; it does not require a separate parser. Authors who need expressions inside a `params:` default should bind them via `let` first and pass them through a typed `params:` callee or use `invoke(...)`. (Inside a Pi-tool argument, field-value expressions are admitted directly — see the [`ToolArg` grammar](#pi-tool-argument-grammar) below.)

<a id="pi-tool-argument-grammar"></a>

## Pi-tool argument grammar

The single positional argument of a call whose callee resolves to a Pi tool (see [Tool Calls — Argument shape](./tool-calls.md), [Expression Sublanguage — Object construction](./expressions.md)) is a bare object literal whose field *values* are full Theta expressions. The bare-object *shape* is fixed — the tool's registered input schema supplies the field names — but the value restriction that the literal sublanguage imposes on a `params:` default does **not** apply here.

```
ToolArg   ::= "{" (ToolField ("," ToolField)* ","?)? "}"
ToolField ::= Ident ":" Expr             // field value is a full Theta expression
```

- **Shape rule.** The argument is a single bare object literal written inline at the call site; the callee's registered input schema supplies the shape. A whole `let`-bound object passed positionally (`read(args)`) does not satisfy `ToolArg` and is rejected — the inline literal is what lets the external schema supply the field names. A multi-argument form (`read({...}, {...})`) is `theta/parse/tool-arg-arity`.
- **Field values are full expressions.** Each `ToolField` value is any `Expr` — identifier references, operators, function and tool calls, `?`, `${...}` interpolation, and nested arrays and objects whose leaves are themselves expressions. Nothing in the literal sublanguage's *Forbidden inside a literal* list is forbidden here.
- **Evaluation order.** Field-value expressions evaluate left-to-right in source order, at call time, before dispatch; a panic or an early-returning `?` inside a field expression aborts the call and the tool is not dispatched.
- **Type checking.** Field values are AJV-validated at runtime against the tool's input schema, surfacing as `Err(CodeToolError { cause: "validation", ... })`. The parser additionally emits `theta/parse/tool-arg-schema-conflict` when a field value's static type is *provably disjoint* from the schema field type mapped through the [schema subset](./schema-subset.md) — a sound front-run of a certain runtime rejection; anything the subset cannot represent falls through to the runtime AJV check (see [Tool Calls — Argument shape](./tool-calls.md)).

## `let` form

```
LetStmt      ::= "let" "mut"? Pattern (":" Type)? "=" Expr
```

`let` requires an initialiser. `let x: T` (annotation, no initialiser) is `theta/parse/let-without-initialiser`: Theta has no `undefined` value, no definite-assignment analysis, and no per-type "zero" default, so a binding with no value cannot be type-soundly admitted. Authors who would write a forward declaration should restructure to bind once at the point a value is available, or use `let mut` with an explicit initial value.

`Pattern` here is the discard `_` or an identifier; full destructuring patterns appear only inside `match` arms (see [Expression Sublanguage — Pattern grammar](./expressions.md#pattern-grammar)).

`Type` is the type grammar below.

## Type grammar

```
ReturnType   ::= Type | "void"                  // function-/theta-return position only; "void" is admitted here and nowhere else
Type         ::= PrimitiveType
              | NamedType
              | GenericType
              | ObjectType
              | Type "|" Type                 // type-union; right-associative
              | LiteralType

PrimitiveType ::= "string" | "number" | "integer" | "boolean" | "null"
NamedType     ::= Ident                       // schema or enum name (PascalCase)
GenericType   ::= "array" "<" Type ">"           // arity 1
               | "Result" "<" Type "," Type ">"  // arity 2
ObjectType    ::= "{" Field ("," Field)* ","? "}"  // inline anonymous object type; Field per Schema Declarations
LiteralType   ::= STRING | NUMBER | BOOLEAN | NULL
```

A bare `Type` appears in `let` annotations, `fn` parameter types, schema field types, `params:` field types, generic type arguments, union arms, and `invoke<Type>` / type-ascription contexts. The function- and top-level-theta **return** position instead uses `ReturnType` — `Type` plus the return-only `void` annotation, whose semantics are owned by [Function Definitions — Empty-tail body](./functions.md#empty-tail-body) — and `void` is admitted nowhere else. A `void` keyword in any `Type` position (`let x: void`, a schema or `params:` field, a generic argument such as `array<void>` or `Result<void, E>`, an `invoke<void>` annotation, a type ascription, or a union arm) is `theta/parse/void-in-non-return-position`. The grammar is otherwise identical in every position; nullability is written `T | null`.

**Generic-application constructors.** `GenericType` is a closed set in theta 1.0: `array` (arity 1) and `Result` (arity 2). No other identifier is parameterisable; a future release that introduces a new parameterised constructor extends this set. Both constructor heads are reserved keywords (see [Lexical Structure — Reserved keywords](./lexical.md)) and appear here as constructor keywords, not as `NamedType ::= Ident` — this is why `Result` (a reserved keyword) is nonetheless reachable in type position. The `Type` reference inside each `<…>` is recursive, so nested generics such as `Result<array<T>, E>` parse. Applying a constructor with a type-argument count other than its declared arity (e.g. `array<T, U>` or `Result<T>`) is `theta/parse/generic-arity-mismatch`. A `Result` application in a lowered-schema position — a schema field type, a `params:` field type, or any type reachable transitively from those (including `array<T>` element types and union arms) — is `theta/parse/result-in-schema-position`; `Result` remains admitted in every other `Type` position (`fn` parameter and return types, `let` annotations, generic arguments outside a lowered-schema position, and `invoke<Type>` / type-ascription contexts). `Result` values are observed only by theta code and are never lowered to a JSON Schema fragment (see [Runtime Value Model](./runtime-value-model.md) and [Schema Subset — Lowering Algorithm](./schema-subset.md#lowering-algorithm)).

**Inline object types.** `ObjectType` admits an anonymous object type `{ field: T, ... }` in any `Type` position. Its fields reuse the same `Field` form as an object-schema body and carry the same field semantics ([Schema Declarations — Object schema](./schemas.md#object-schema)): each field is required by default, optionality is written `T | null`, and a field may attach an optional `as "WireName"` rename ([Wire-name renaming](./schemas.md#wire-name-renaming)) under which the `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name` diagnostics apply within the one inline object. An empty inline object `{}` is `theta/parse/empty-schema-body`, the same diagnostic an empty named schema body raises. The `Type` reference inside each field is recursive, so nested inline objects and `array<{ ... }>` parse. At lowering, an inline object type is hoisted into `$defs` under a synthesised `__inline_<slug>` name — see [Schema Subset — Lowering Algorithm](./schema-subset.md#lowering-algorithm).

## Block expressions

<a id="block-expressions"></a>

Theta distinguishes *expression-position blocks* (the right-hand side of `let`, `match`-arm bodies wrapped in `{ … }`, and any other position where a value is required) from *body blocks* (a function body, the top level of a `.theta` file) and from *statement-form control-flow blocks* (the `{ … }` body of a statement-form `if` / `else` / `while` / `for`). Expression-position blocks require a trailing tail `Expr`; body blocks and statement-form control-flow blocks do not.

```
BlockExpr    ::= "{" Stmt* Expr "}"           // expression-position; tail Expr required, value is the tail expression
FnBody       ::= "{" Stmt* Expr? "}"          // function body; tail Expr optional, see Function Definitions — Empty-tail body
ThetaBody     ::= Stmt* Expr?                  // top level of a .theta file; tail Expr optional, same rule
StmtBlock    ::= "{" Stmt* Expr? "}"          // statement-form control-flow body; tail Expr optional, value discarded

IfStmt       ::= "if" Expr StmtBlock ElseClause?
ElseClause   ::= "else" (IfStmt | StmtBlock)
WhileStmt    ::= "while" Expr StmtBlock
ForStmt      ::= "for" Ident "in" Expr StmtBlock
```

When `FnBody` or `ThetaBody` is parsed without a trailing `Expr`, the function or theta's inferred return type is `null` (the literal type) and its final value is the literal `null`, per [Function Definitions — Empty-tail body](./functions.md#empty-tail-body). Authors who want the function or theta to be syntactically required to produce a value should declare an explicit non-`void` / non-`null` return type; `void` is the explicit "intentionally produces no value" annotation and is governed by the same page.

A statement-form `if` / `for` / `while` (the `IfStmt` / `WhileStmt` / `ForStmt` productions above, whose surface forms and diagnostics are owned by [Control Flow](./control-flow.md)) is a statement, not an expression: it produces no value and is not admissible in expression position — the ternary `cond ? a : b` is the expression form of conditional. Its `StmtBlock` body accepts zero or more statements with an optional tail `Expr`; an empty `{}` body is admitted. A present tail `Expr` is evaluated and its value is discarded (the block produces no value), except that a tail `Expr` ending in the postfix `?` operator — applied to any operand `?` admits, per [Expression Sublanguage — `?` operand-type precondition](./expressions.md#err-18) — still triggers `?` early-return on failure, because `?` desugars to `return Err(e)` per [Return Statement](./return.md).

## `fn` declarations

<a id="fn-declarations"></a>

```
FnDecl       ::= "fn" Ident "(" FnParams? ")" (":" ReturnType)? FnBody
FnParams     ::= FnParam ("," FnParam)* ","?
FnParam      ::= Ident ":" Type
```

A `FnDecl` is a top-level `fn` declaration; its placement, nesting, call-position, and documentation rules are owned by [Function Definitions](./functions.md). The parameter list is parenthesised in every case — a zero-parameter function is written `fn f()`, never bare `fn f` — with parameters separated by `,` and a trailing comma admitted. Each `FnParam` is an `Ident ":" Type` pair: a `fn` parameter carries no default (theta 1.0 admits literal-valued defaults only on `params:` frontmatter fields, see [Parameters and Frontmatter — Defaults](./frontmatter.md)), so every `fn` parameter is non-defaulted for the argument-arity count at [Invocation — Argument arity](./invocation.md#argument-binding), and a `mut` modifier on a `fn` parameter is `theta/parse/mut-on-immutable-context` (see [Bindings — Immutable contexts](./bindings.md)). The `: ReturnType` annotation is optional; when present, the body type-checks its tail and every `return` operand against it, and when absent the return type is inferred per [Function Definitions — Theta return type](./functions.md#theta-return-type) (an annotation-less body whose last form is a statement infers `null` per [Empty-tail body](./functions.md#empty-tail-body)). `FnBody` is the relaxed function-body block defined under [Block expressions](#block-expressions) above.

## `match` arm body

```
MatchArm     ::= Pattern "=>" ArmBody
ArmBody      ::= Expr
              | BlockExpr                    // expression-position block — see above; value is the tail expression
```

An arm body is a single expression. Statements (`if`, `for`, `while`, `let`, assignment, `break`, `continue`, `return`) are not expressions in Theta and are not admissible as arm bodies on their own. To execute statements before producing the arm's value, wrap them in a block expression:

```theta
match result {
  Ok(s)  => s,
  Err(e) => {
    let mut count = 0
    count += 1
    "fallback"
  },
}
```

`if` / `for` / `while` inside an arm body without the surrounding `{ ... }` block is `theta/parse/statement-in-arm-body`. The ternary `cond ? a : b` is the expression form of conditional and is admissible directly.

## `schema X by <field>`

```
SchemaDecl   ::= "schema" Ident SchemaShape
SchemaShape  ::= "{" Field ("," Field)* ","? "}"               // object form
              | "=" AliasRhs                                    // alias / union form
              | "by" Ident "=" UnionRhs                        // explicit-discriminator union form
AliasRhs     ::= Type ("|" Type)*                              // single-type alias (schema X = T) or multi-type union
UnionRhs     ::= Type ("|" Type)+                              // discriminated union (≥2 variants)
```

The `by <field>` clause is admitted **only** on the union form (the alternative beginning with `=`). A `schema X by f { ... }` declaration with an object body is `theta/parse/by-on-object-schema`; the diagnostic message is *`"the 'by' clause applies only to discriminated-union schemas (schema X by f = A | B | …)"`*. Object schemas have one variant by definition and the discriminator concept does not apply.

## `///` placement

```
DocComment   ::= ("///" RestOfLine "\n")+
```

A `DocComment` is a maximal run of consecutive `///` lines (joined per [Descriptions](./descriptions.md)); `RestOfLine` is defined in [Lexical Structure — `RestOfLine` terminal](./lexical.md#rest-of-line). It is admitted immediately above any of the following productions; it MUST NOT appear inline with the production it describes:

- `SchemaDecl` (object form, alias form, and explicit-discriminator union form alike — every `schema X …` declaration accepts a leading `DocComment`).
- `EnumDecl` (the entire enum declaration).
- A field within an object schema body.
- A variant within an `enum` body.
- `FnDecl` (top-level `fn` declarations in `.theta` and `.thetalib` files; nested `fn` is forbidden by [Function Definitions](./functions.md) regardless of `///`).

`///` above any other production — `let`, `import`, `export`, expression statements, control-flow statements — is `theta/parse/doc-comment-misplaced`. A `///` description on a `fn` lowers nowhere (functions have no JSON Schema); the description is purely human-facing and is preserved on the AST for tooling that wants to render it. A `///` description on an alias schema (`schema X = T | U`) lowers as the description of the named type wherever it surfaces in JSON Schema output.

## Newline continuation

Statements are separated by newlines. A statement implicitly continues across one or more newlines when, and only when, one of the **continuation triggers** below holds at the boundary. The trigger set is closed.

| Trigger | Position | Example |
|---|---|---|
| Open bracket without a matching close | the line ends with an unmatched `(` / `[` / `{` | `let x = [\n  1, 2, 3\n]` |
| Trailing binary or ternary operator | the line ends with one of `+ - * / % == != < <= > >= && \|\| ? :` | `let x = a +\n  b` |
| Trailing comma | the line ends with `,` (inside any open `(` / `[` / `{`) | `f(a,\n  b)` |
| Leading binary or ternary operator | the next non-blank line begins with one of the operators above | `let x = a\n  + b` |

**The `?` trigger is the ternary head only.** In both operator rows, `?` triggers continuation solely as the ternary-conditional head (`cond ?\n  a : b`). The postfix error-propagation `?` (ERR-18) is a complete-expression terminator that desugars to `return Err(e)`, so it never triggers continuation and always closes the statement — see the [StmtBlock tail-`?` carve-out](#block-expressions).

**Blank lines do not break a continuation.** When any of the four triggers holds, the parser continues across one or more newlines regardless of how many of those newlines are blank. `let x =\n\n  foo` is one statement equivalent to `let x = foo`. Trailing whitespace on the prior line is irrelevant. The same rule applies to the leading-operator form: `let x = a\n\n  + b` continues across the blank line.

When no trigger holds, the newline closes the statement. There is no semicolon escape and no explicit line-continuation marker (no `\` at end of line; backslash inside source is `theta/parse/stray-backslash` per [Lexical Structure](./lexical.md#stray-backslash)).

## `array<T>` literal type-sink rule

`[]` and `[expr, ...]` literals require a *type sink* in surrounding context to determine the element type when the elements alone are insufficient — see [Expression Sublanguage — Array construction](./expressions.md). The sink set is exhaustive:

- A binding annotation (`let xs: array<T> = ...`).
- A function parameter type at a call site.
- The declared type of a surrounding constructor field (`Schema { items: [...] }`).
- The element type of an array-typed sink that this literal is itself an element of (recursive descent).

The iterand of a `for x in expr` is **not** a sink — `for` cannot supply `T` to `[]`. `for x in []` with no other sink is `theta/parse/array-no-common-type`, the same diagnostic that `let xs = []` raises in unannotated position. This is the same hole; resist any `for`-specific carve-out.
