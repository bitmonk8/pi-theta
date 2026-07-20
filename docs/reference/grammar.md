# Reference — Grammar & lexical structure

Normative surface syntax for Theta (`.theta` and `.thetalib`). Facts only. See
[Type system](./type-system.md) for the type relation, [Diagnostics](./diagnostics.md)
for every `theta/parse/*` code named here.

Notation: `::=` defines a production; `|` alternatives; `?` optional; `*`
zero-or-more; `+` one-or-more; quoted strings are terminals.

## Source files

- **Encoding.** UTF-8. A leading UTF-8 BOM (`EF BB BF`) is consumed and ignored.
  Any other BOM, or any non-UTF-8 byte sequence (including lone surrogates), is
  `theta/load/invalid-encoding` with the zero-based byte offset of the first
  invalid byte (offset `0` for a non-UTF-8 BOM). No transcoding is performed.
- **Newline normalisation.** Before lexing, `\r\n` → `\n` and bare `\r` → `\n`.
  Every "newline" rule operates on the normalised stream. CRLF and LF sources
  tokenise byte-identically.
- **Diagnostic spans.** BOM consumption and newline normalisation happen before
  span recording; line/column numbers are 1-indexed on the normalised stream.
- **Path literals** (`import "..."`, `invoke("...", ...)`, `.theta` entries in
  `tools:`) use forward-slash separators only. A backslash is
  `theta/parse/invalid-path-separator`.
- **Stray backslash** outside any string literal, path literal, or `@`...``
  query-template body is `theta/parse/stray-backslash`. There is no
  line-continuation marker.
- **Extension matching.** `.theta` and `.thetalib` are matched **byte-exact lowercase
  ASCII** everywhere (discovery glob, `import`, `invoke`, `tools:` entries,
  settings/CLI). No case-folding at any site.

## Identifiers

`[A-Za-z_][A-Za-z0-9_]*`, case-sensitive. First-letter case is enforced:

- **PascalCase** (uppercase first): `schema` names, `enum` names, `enum` variant
  names, type-like bindings; the built-ins `Ok`, `Err`, `Result`. Violation:
  `theta/parse/schema-case-mismatch`.
- **lowercase-first** (lowercase letter or `_`): `let` / `let mut` bindings,
  function parameters, function names, schema field names. Both `snake_case` and
  `lowerCamelCase` accepted. Violation: `theta/parse/binding-case-mismatch`.

Casing is the only enforced naming constraint. The lowercase-first rule applies
to the theta-side field name; the wire name (`as "WireName"`) may be any string.

## Reserved keywords

Cannot be used as identifiers (`theta/parse/reserved-keyword-as-identifier`):

```
let mut fn if else for in while break continue return match schema enum
import export from as by invoke true false null Ok Err Result
string number integer boolean array void
```

The discard binding `_` is also reserved. `array` and `Result` double as the
closed set of generic-type constructor keywords in type position.

## Comments

Line comments only. `//` regular; `///` doc comment (lowers to JSON Schema
`description:`). Block comments `/* ... */` are `theta/parse/block-comment`. Text
inside a `@`...`` query template is not a comment. Comments inside `${...}`
behave as in any expression position.

## String literals

Single (`'...'`) and double (`"..."`) forms are equivalent. Escapes: `\"`, `\'`,
`\\`, `\n`, `\t`, `\r`, `\u{XXXX}` (1–6 hex, Unicode scalar value). A `\u{...}`
out of range or naming a surrogate is `theta/parse/invalid-unicode-escape`; a
backslash before any other character is `theta/parse/illegal-escape`; EOF in an
unterminated literal is `theta/parse/unterminated-string`. Single-line only — a
literal newline is `theta/parse/literal-newline-in-string`. No interpolation
(`${` is plain text). Multi-line text and interpolation belong in `@`...``
templates.

## Number literals

Decimal only: `42`, `3.14`, `1e10`, `1.5e-3`, `0`, `0.5`. No sign (negation is
unary `-` at parse time). No hex/octal/binary and no underscore separators (→
`theta/parse/unsupported-feature`). A literal with no fractional/exponent part is
`integer`; otherwise `number`. `integer` widens to `number`; the reverse is
`theta/parse/integer-narrowing`. Per-token magnitude: an `integer` token with
`|value| > 2^53 - 1` is `theta/parse/integer-literal-out-of-range`; a `number`
token whose parsed value is not a finite IEEE-754 double (e.g. `1e400`) is
`theta/parse/number-literal-not-finite`. The bound is per-token, so
`-12345678901234567890` is rejected.

## Statement termination & newline continuation

Statements are separated by newlines; no semicolons. A statement continues
across one or more newlines only when a **continuation trigger** holds. The
trigger set is closed:

| Trigger | Position |
|---|---|
| Open bracket without matching close | line ends with unmatched `(` / `[` / `{` |
| Trailing binary/ternary operator | line ends with one of `+ - * / % == != < <= > >= && \|\| ? :` |
| Trailing comma | line ends with `,` inside any open `(` / `[` / `{` |
| Leading binary/ternary operator | next non-blank line begins with one of the operators above |

- The `?` trigger is the **ternary head only**; the postfix error-propagation `?`
  is a complete-expression terminator (it desugars to `return Err(e)`) and never
  continues.
- Blank lines do not break a continuation: `let x =\n\n  foo` is one statement.
- No trigger closes the statement. Single-line `if (x) stmt` does not exist;
  `if`/`for`/`while`/`fn` bodies are always braced blocks
  (`theta/parse/single-line-if`).

## `let` form

```
LetStmt ::= "let" "mut"? Pattern (":" Type)? "=" Expr
```

`let` requires an initialiser; `let x: T` with no initialiser is
`theta/parse/let-without-initialiser`. `Pattern` here is the discard `_` or an
identifier (full destructuring appears only in `match` arms). Immutable by
default; `let mut` opts into reassignment. Reassignment is a statement (`=`, `+=`,
`-=`, `*=`, `/=`, `%=`); see [Bindings](#bindings-mutability).

## Type grammar

```
ReturnType    ::= Type | "void"                    // function/theta-return position only
Type          ::= PrimitiveType
               | NamedType
               | GenericType
               | ObjectType
               | Type "|" Type                     // type-union; right-associative
               | LiteralType
PrimitiveType ::= "string" | "number" | "integer" | "boolean" | "null"
NamedType     ::= Ident                            // schema or enum name (PascalCase)
GenericType   ::= "array" "<" Type ">"             // arity 1
               | "Result" "<" Type "," Type ">"    // arity 2
ObjectType    ::= "{" Field ("," Field)* ","? "}"  // inline anonymous object type
LiteralType   ::= STRING | NUMBER | BOOLEAN | NULL
```

- `void` is admitted **only** as `ReturnType`. In any other type position:
  `theta/parse/void-in-non-return-position`. `void` does not participate in the
  compatibility relation.
- `GenericType` is closed in theta 1.0: `array` (arity 1), `Result` (arity 2).
  Wrong arity is `theta/parse/generic-arity-mismatch`. Nested generics parse.
- `Result` in a lowered-schema position (schema field type, `params:` field type,
  or any type reachable transitively) is `theta/parse/result-in-schema-position`.
  `Result` remains admitted elsewhere (`fn` params/returns, `let` annotations,
  `invoke<Type>`, type ascription).
- `ObjectType` fields reuse the object-schema `Field` form; empty `{}` is
  `theta/parse/empty-schema-body`. At lowering, hoisted into `$defs` under
  `__inline_<slug>` (see [Schema subset](./schema-subset.md)).
- Nullability is written `T | null`.

## Blocks

```
BlockExpr ::= "{" Stmt* Expr "}"        // expression-position; tail Expr required
FnBody    ::= "{" Stmt* Expr? "}"       // function body; tail Expr optional
ThetaBody  ::= Stmt* Expr?               // top level of a .theta file; tail Expr optional
StmtBlock ::= "{" Stmt* Expr? "}"       // statement-form control-flow body; value discarded

IfStmt    ::= "if" Expr StmtBlock ElseClause?
ElseClause::= "else" (IfStmt | StmtBlock)
WhileStmt ::= "while" Expr StmtBlock
ForStmt   ::= "for" Ident "in" Expr StmtBlock
```

- Expression-position blocks require a trailing tail `Expr`. Function bodies, the
  top level of `.theta`, and statement-form control-flow bodies do not.
- A `FnBody`/`ThetaBody` with no tail expression has inferred return type `null`
  (the literal type) and final value literal `null` (see [Type system — final
  value](./type-system.md)). `void` is the only explicit "produces no value"
  signal; absent tail does **not** imply `void`.
- A statement-form `if`/`for`/`while` produces no value and is not admissible in
  expression position (the ternary `cond ? a : b` is the expression form). A tail
  `Expr` in a `StmtBlock` is evaluated and discarded — except a tail expression
  ending in postfix `?`, which still early-returns on failure.

## `fn` declarations

```
FnDecl   ::= "fn" Ident "(" FnParams? ")" (":" ReturnType)? FnBody
FnParams ::= FnParam ("," FnParam)* ","?
FnParam  ::= Ident ":" Type
```

Top-level only (nested is `theta/parse/nested-fn`). Parameter list always
parenthesised (`fn f()`, never `fn f`); trailing comma admitted. `fn` parameters
carry no default and are immutable — `mut` on one is
`theta/parse/mut-on-immutable-context`. Functions are not first-class; a name used
outside call position is `theta/parse/function-as-value`. `: ReturnType` optional;
absent → return type inferred (see [Type system](./type-system.md)).

## `match` arm body

```
MatchArm ::= Pattern "=>" ArmBody
ArmBody  ::= Expr | BlockExpr
```

An arm body is a single expression. A bare statement (`if`, `for`, `while`,
`let`, assignment, `break`, `continue`, `return`) as an arm body is
`theta/parse/statement-in-arm-body`; wrap statements in a block expression. The
ternary is admissible directly.

Pattern grammar (theta 1.0):

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything; binds nothing |
| Identifier | `x` | anything; binds |
| Literal | `"validation"`, `0`, `true`, `null` | structural equality |
| Constructor | `Ok(p)`, `Err(p)` | the named `Result` variant; recurses |
| Object/schema | `QueryError { kind: "validation", attempts }` | listed fields match; others ignored; `{ attempts }` sugars `{ attempts: attempts }` |
| Array | `[a, b]`, `[first, _, _]` | exact-length array |

Lowercase identifiers bind; capitalised refer to constructors/schema names.
Guards (`theta/parse/match-guard-not-supported`) and rest patterns
(`theta/parse/rest-pattern-not-supported`) are not in theta 1.0. Exhaustiveness is
**not** statically checked; a non-exhaustive `match` panics at runtime
(`theta/runtime/match-error`).

## `schema X by <field>`

```
SchemaDecl  ::= "schema" Ident SchemaShape
SchemaShape ::= "{" Field ("," Field)* ","? "}"     // object form
             | "=" AliasRhs                          // alias / union form
             | "by" Ident "=" UnionRhs               // explicit-discriminator union form
AliasRhs    ::= Type ("|" Type)*
UnionRhs    ::= Type ("|" Type)+
```

`by <field>` is admitted **only** on the union (`=`) form. `schema X by f { ... }`
with an object body is `theta/parse/by-on-object-schema`. Object/union declaration
detail lives in [Schema subset](./schema-subset.md).

## `///` placement

```
DocComment ::= ("///" RestOfLine "\n")+
```

A maximal run of consecutive `///` lines, admitted immediately above (never
inline with): `SchemaDecl` (all forms), `EnumDecl`, an object-schema field, an
`enum` variant, `FnDecl`. Anywhere else: `theta/parse/doc-comment-misplaced`. A
`///` on a `fn` lowers nowhere; on an alias schema it lowers as that named type's
description.

## Expression sublanguage

Supported forms: literals; identifiers; member access `a.b`; indexed access
`a[k]` (receiver must be `array<T>` or object — otherwise
`theta/parse/non-indexable-receiver`; object index must be `string` —
`theta/parse/non-string-object-index`); calls `f(x)`, `obj.method(x)`,
`<name>(args)`; unary `!` / `-`; arithmetic `+ - * / %`; comparison
`== != < <= > >=`; logical `&& ||`; ternary `cond ? a : b`; postfix `?`;
parenthesisation; `@`...`` query templates; array literals `[]` / `[a, b]`;
schema constructors `Schema { field: expr }`; enum access `Enum.Variant`;
`Result` constructors `Ok(e)` / `Err(e)`.

Not supported (→ `theta/parse/unsupported-feature` unless a more specific code
applies): assignment in expression position; field/index mutation
(`theta/parse/assignment-to-member-or-index`); arrow functions and higher-order
methods (`map`/`filter`/`reduce`); spread/rest; `new`/`typeof`/`instanceof`/
`delete`/`void`/`yield`/`await`; optional chaining `?.` and `??`; `===`/`!==`;
bitwise; `++`/`--` (`theta/parse/increment-decrement`); comma operator; nested
template strings inside `${...}`; `@`...`` and `match` inside `${...}`.

### Operator precedence

Highest to lowest:

| Level | Operators | Associativity |
|---|---|---|
| 1 | `.` `[]` `()` postfix `?` | left |
| 2 | unary `!`, unary `-` | right |
| 3 | `*` `/` `%` | left |
| 4 | `+` `-` | left |
| 5 | `<` `<=` `>` `>=` | non-associative |
| 6 | `==` `!=` | non-associative |
| 7 | `&&` | left |
| 8 | `\|\|` | left |
| 9 | `?:` ternary | right |

Chained comparison (`a < b < c`) is `theta/parse/comparison-chaining`. The
type-position `|` is not in the value-expression grammar.

### Truthiness & short-circuiting

Only `true`/`false` are accepted in boolean position (`if`, `while`, `&&`, `||`,
ternary condition). A non-boolean is `theta/parse/non-boolean-condition`. Operands
evaluate left-to-right; `&&`/`||` short-circuit (a skipped right operand runs no
queries/tools/invokes and spends no tokens); both always produce `boolean`.
`cond ? a : b` evaluates `cond` then only the taken branch.

### Object & array construction

- `Schema { field: expr, ... }`: every declared field required
  (`theta/parse/missing-object-field`); extra fields `theta/parse/extra-object-field`;
  order irrelevant. A bare `{ field: expr }` (no schema name) is
  `theta/parse/bare-object-literal` except in two carve-outs (both restricted to
  the [literal sublanguage](#theta-literal-sublanguage)): `params:` defaults, and
  the single positional argument of a Pi-tool call. Construct a discriminated-union
  value via the variant name (`Cat { ... }`).
- `[]` element type inferred from a type sink; `[a, b, c]` element type is the
  common type of its elements narrowed by any sink. No sink and no common type is
  `theta/parse/array-no-common-type`. See [Type system](./type-system.md) for the
  LUB rules.

### `array<T>` literal type-sink rule

`[]` / `[expr, ...]` require a *type sink* when the elements alone are
insufficient. The exhaustive sink set: a binding annotation
(`let xs: array<T> = ...`); a function parameter type at a call site; the declared
type of a surrounding constructor field; the element type of an array-typed sink
this literal is an element of (recursive). The `for x in expr` iterand is **not**
a sink: `for x in []` with no other sink is `theta/parse/array-no-common-type`.

### `?` operator

Unwraps `Ok` to the inner value; on `Err`, early-returns the `Err` from the
enclosing function or top-level theta. The operand must have static type
`Result<T, QueryError>` for some `T` — otherwise `theta/parse/question-on-non-result`
(a static, load-fail check). The enclosing scope's return type must be compatible
with `Result<U, QueryError>` — otherwise `theta/parse/question-outside-result-fn`.
`?` desugars to `return Err(e)`.

## Built-in methods & properties

No user-defined methods, no `this`. theta 1.0 set:

`string`: `length: integer` (UTF-16 code units); `toLowerCase()`; `toUpperCase()`;
`trim()`; `startsWith(s)`; `endsWith(s)`; `includes(s)`; `split(sep): array<string>`
(literal-only; empty separator → per-code-unit); `replace(from, to): string`
(replaces all occurrences via a single left-to-right non-overlapping scan;
literal-only; `$`-sequences inserted literally; empty `from` returns receiver
unchanged). `string` is not indexable. `replace` normative reference vectors:

| Expression | Result |
|---|---|
| `"aXbXc".replace("X", "[$&]")` | `"a[$&]b[$&]c"` |
| `"100".replace("0", "$$")` | `"1$$$$"` |
| `"a-b".replace("-", "x$1y")` | `"ax$1yb"` |
| `"abc".replace("", "X")` | `"abc"` |
| `"aaaaa".replace("aa", "x")` | `"xxa"` |

`array<T>`: `length: integer`; `join(sep): string` (element type must be
`string` — else `theta/parse/non-string-array-join`); `includes(x): boolean`
(structural equality); `indexOf(x): integer` (`-1` if absent); `slice(start, end?)`;
`concat(other): array<T ⊔ U>` (result element type is the LUB under the
compatibility relation).

`object` (any object value): `keys(): array<string>` (theta-side names, schema
declaration order for named schemas); `values(): array<T>` (union of field types,
same order as `keys()`); `has(k): boolean` (false for unknown keys, no panic).

Anything not on this list is `theta/parse/unknown-method`.

## Control flow

- **`if` / `else`** — statement form. Braced blocks only.
- **`for x in expr`** — iterates an `array<T>`; a non-array iterand is
  `theta/parse/non-array-iterand`. The iterand is evaluated **exactly once** at
  loop entry (CTRL-1), before the first iteration, including when the array is
  empty. The iteration variable is a fresh immutable local per iteration.
- **`while expr`** — condition must be `boolean` (no coercion).
- **`break` / `continue`** — bare statements, legal only inside a loop
  (`theta/parse/break-outside-loop`, `theta/parse/continue-outside-loop`). Carry no
  value: `break expr` is `theta/parse/break-with-value`. `break` exits the
  innermost loop; `continue` skips to the next iteration.

## `return`

`return expr` exits the enclosing function or top-level theta immediately. It is a
statement, not an expression.

- Type-checked against the declared return type when present; when absent (a
  top-level theta, or an annotation-less `fn`), its operand participates in the
  inferred return type alongside the tail expression (RET-1).
- Bare `return` (no argument) is legal only in a `void`-annotated function;
  elsewhere (including top-level theta) it is `theta/parse/bare-return-in-non-void`
  (RET-2).
- Code after a `return` in the same block is `theta/parse/unreachable-code`
  (warning) (RET-3). This warning is editorial, not an inference input — an
  unreachable `return expr` still contributes to return-type inference.
- The `?` operator's `Err`-arm desugars literally to `return Err(e)`.

<a id="bindings-mutability"></a>

## Bindings & mutability

Immutable-by-default. `let x` is immutable (rebinding is
`theta/parse/immutable-rebinding`); `let mut x` is reassignable. Reassignment is a
statement (`theta/parse/assignment-as-expression` in expression position); RHS must
be compatible with the binding's type. Mutability is **binding-level only** —
`obj.field = ...` / `arr[i] = ...` is `theta/parse/assignment-to-member-or-index`;
rebind the whole value. Always-immutable contexts (`mut` →
`theta/parse/mut-on-immutable-context`): function parameters, `for` iteration
variables, `match` pattern bindings, the discard `let _` (also
`theta/parse/mut-on-discard`).

<a id="theta-literal-sublanguage"></a>

## Theta literal sublanguage

A strict subset of the expression grammar admitted in one position: the RHS of a
`params:` default. An is-literal check runs at parse time; a failure is
`theta/parse/default-not-literal`, naming the offending sub-expression. The single
positional argument of a Pi-tool call is **not** a literal-sublanguage position for
its field values — its bare-object shape is fixed but the field values are full
expressions; see the [Pi-tool argument grammar](#pi-tool-argument-grammar) below.

```
Literal       ::= PrimitiveLit | NamedValueLit | ArrayLit | BareObjectLit | NamedObjectLit
PrimitiveLit  ::= STRING | NUMBER | "-" NUMBER | BOOLEAN | NULL
NamedValueLit ::= Ident "." Ident                      // Enum.Variant
ArrayLit      ::= "[" (Literal ("," Literal)* ","?)? "]"
BareObjectLit ::= "{" (FieldEntry ("," FieldEntry)* ","?)? "}"
FieldEntry    ::= Ident ":" Literal
NamedObjectLit::= Ident "{" (FieldEntry ("," FieldEntry)* ","?)? "}"
```

- `BareObjectLit` is admitted only when an external schema supplies the type (in
  the literal sublanguage, the `params:` default's declared type; the Pi-tool
  argument's bare object is externally typed too but uses the `ToolArg` grammar
  below).
- `NamedObjectLit` is used where the type is not supplied externally, including
  discriminated-union variants (`Cat { name: "x" }`, never
  `Animal { species: "cat", ... }`).
- Every declared field of the LHS schema must be present
  (`theta/parse/missing-object-field`); field order is free; discriminator fields
  are implicit.
- Forbidden inside a literal (each rejected by the is-literal check): identifier
  references other than `Enum.Variant`; operators other than unary `-` on a
  numeric literal; function and tool calls; `${...}` and `@`...`` templates;
  member access other than `Enum.Variant`.

<a id="pi-tool-argument-grammar"></a>

## Pi-tool argument grammar

The single positional argument of a Pi-tool call is a bare object literal whose
field *values* are full Theta expressions. The bare-object *shape* is fixed (the
tool's registered input schema supplies the field names); the literal-sublanguage
value restriction does **not** apply.

```
ToolArg   ::= "{" (ToolField ("," ToolField)* ","?)? "}"
ToolField ::= Ident ":" Expr
```

- Shape: single bare object literal written inline. A `let`-bound object passed
  positionally (`read(args)`) does not satisfy `ToolArg`; multi-argument forms are
  `theta/parse/tool-arg-arity`.
- Field values are any `Expr` (identifiers, operators, calls, `?`, `${...}`,
  nested arrays/objects). They evaluate left-to-right in source order at call
  time, before dispatch; a panic or early-returning `?` aborts dispatch.
- Field values are AJV-validated at runtime
  (`Err(CodeToolError { cause: "validation" })`). The parser additionally emits
  `theta/parse/tool-arg-schema-conflict` when a field value's static type is
  provably disjoint from the schema field type mapped through the schema subset
  — a sound front-run of a certain runtime rejection; anything the subset cannot
  represent falls through to the runtime AJV check.

## Provenance

- Grammar productions, literal sublanguage, Pi-tool argument grammar, `let` form,
  block productions, `fn`, `match` arm body, `schema X by <field>`, `///`
  placement, newline continuation, `array<T>` type-sink rule:
  `docs/spec_topics/grammar.md` (transcribed verbatim
  where mechanical).
- Lexical rules (encoding, newline normalisation, identifiers, reserved keywords,
  comments, string/number literals, statement terminators, extension matching):
  `docs/spec_topics/lexical.md`.
- Expression forms, operator precedence, truthiness, short-circuiting, built-in
  methods, object/array construction, `?`: `docs/spec_topics/expressions.md`.
- Control flow (CTRL-1): `docs/spec_topics/control-flow.md`.
- `fn` placement/inference (FN-1…FN-5): `docs/spec_topics/functions.md`.
- `return` (RET-1…RET-3): `docs/spec_topics/return.md`.
- Bindings & mutability: `docs/spec_topics/bindings.md`.
- Implementation confirmation: reserved-keyword set in `src/lexer/lexer.ts:152`
  matches the spec list byte-for-byte; `src/lexer/lexer.ts` trailing/leading
  continuation-trigger sets match the closed trigger table.
