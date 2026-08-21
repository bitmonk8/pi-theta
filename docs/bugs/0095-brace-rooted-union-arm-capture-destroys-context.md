# Bug 0095 — A brace-rooted union arm is captured as the whole type at every non-alias `Type` position: `schema S { f: {} | null }` loses the entire field list and misattributes `theta/parse/empty-schema-body` to the declaration, `let x: {} | null = 1` splits into four diagnostics naming an initialiser the source has, and `fn f(p: {} | null)` mints two phantom parameters — while the alias right-hand side, the `@<T>` root and a `params:` field capture the same text as two arms

- **Status:** fixed (0.74.0). One edit at one site: `parseType`'s arm-start `{`
  branch is reached at every `Type` position instead of the alias right-hand side
  alone, so every position consumes the same `Type ("|" Type)*` extent
  (`grammar.md:94`, `:105`). The leading-brace early return is gone; the three
  alias-only boundary stops stay alias-only. See §Fix (0.74.0).
  Independent of every open report: no other open report touches
  `ThetaDocument.parseType`'s capture, and the one report that pinned this
  shape ([0045](./0045-inline-empty-object-type-missing-empty-schema-body.md))
  is fixed. This report blocks nothing and is blocked by nothing.
- **Kind:** defect. One root cause — `parseType`'s leading-brace arm
  (`src/parser/theta-document.ts:2936–2939`) consumes the balanced brace group
  and RETURNS, so the `("|" Type)*` tail of `Type "|" Type`
  (`docs/spec_topics/grammar.md:94`) is left in the token stream — with three
  observable elements, each on legal-shaped input:
  1. *Field-list destruction, reported against the wrong subject.*
     `schema S { f: {} | null }` and `schema S { a: string, f: {} | null }`
     parse to a `schema` statement carrying no `fields` at all, and the single
     diagnostic reads `'S' has no fields; an empty schema cannot be validated.`
     The declaration does declare fields. Nothing names the field, the arm or
     the loss.
  2. *A `let` statement split into a statement and two token fragments.*
     `let x: {} | null = 1` records `x` with annotation `{}` and NO initialiser,
     and the residue `| null = 1` re-enters statement position as two stray
     puncts. Four diagnostics; the first states the binding "has no
     initialiser" against a source that spells `= 1`.
  3. *A `fn` signature corrupted without any diagnostic.*
     `fn f(p: {} | null) { 1 }` records THREE parameters — `p: {}`, then one
     named `|` and one named `null`, both with empty type text — and
     `fn f(): {} | null { 1 }` takes the body block as a bare object literal and
     swallows the rest of the file into the function body, leaving the document
     with no tail expression.

  The emptiness of the brace group is not the trigger: the non-empty
  `{a: integer} | null` fails identically at all three (§Reproduction). Under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the registry
  is the closed authority for what the runtime emits, and every diagnostic
  these inputs draw sits outside the *Trigger* of the row it is emitted under
  (§Actual behaviour).
- **Related:**
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    fixed (0.57.0), the origin. Its §Reproduction *"Two adjacent mis-parses,
    recorded as observed"* (`:460–488`) recorded elements 1 and 2 and the
    alias-position contrast; its §Non-goals (`:766–772`) excluded them
    deliberately ("Unfiled, unchanged here"), and that exclusion is what bounds
    its own test witness — its union-arm cells are written at the alias
    position because the schema-field spelling is unusable. Two landed cells
    pin the current dispositions as controls:
    `tests/inline-empty-object-type.test.ts:704–718` (e5) and
    `tests/union-generic-arm-lowering.test.ts:1239–1250` (i3). Three comments
    in the first of those files (`:80–82`, `:321–325`, `:525–527`) state the
    bounding reason. All four move with this fix (§Fix).
  - [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)
    — open, and it owns a different question about two of the four lines
    element 2 draws: whether the `<construct>` tail `stray '<t>' in statement
    position` (`src/parser/theta-document.ts:1757`) may be rendered at all,
    given `placeholder-rendering-a.md` §3's closed token-name table. This
    report holds that the emission should not be REACHED from this input, not
    that its rendering is wrong. The two fixes are disjoint: 0063 edits a spec
    table, this one edits a capture; each leaves the other's witnesses intact.
  - [0042](./0042-schema-decl-same-line-residue-silent.md) — fixed (0.52.0). It
    built `parseType`'s `aliasArmBoundary` mode into its present shape,
    including the arm-start `{` branch (`:2975–2984`) that makes the alias
    position the conformant one here. §Fix reuses that branch rather than
    writing a second one, so `theta/parse/malformed-alias-rhs`'s boundary set
    is not perturbed.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    open, and it reaches the same inputs from the other side: its rule fires on
    an inline object's field NAMES at every `Type` position. At the
    schema-field, `let`-annotation and `fn` positions a brace-rooted union arm
    never reaches the type-grammar walk today, so 0052's rule cannot see
    `schema S { f: {a: integer, a: string} | null }` until this fix lands.
    Neither fix depends on the other; whichever lands second gains coverage of
    that shape for free.
- **Affected** (citations verified at HEAD `9ea93511`, 0.57.0):
  - `src/parser/theta-document.ts:2936–2939` — the root cause.
    `if (!aliasArmBoundary && this.peek().kind === "punct" && this.peek().text
    === "{") { this.consumeInlineObjectType(parts); return parts.join(""); }`.
    The early return ends the capture at the closing `}` of the leading group.
    Its own comment (`:2929–2935`) states the intent — carry the whole object
    shape rather than terminate at the opening brace — and names the alias
    contrast: "In `aliasArmBoundary` mode the loop below consumes the same group
    instead and keeps scanning for the `|` and the arms after it."
  - `src/parser/theta-document.ts:2975–2984` — the conformant capture, reached
    only under `aliasArmBoundary`. At an arm start (`atArmStart`, `:2945`: the
    scan's first token, or the token straight after a depth-0 `|`) a `{`
    consumes the balanced group, sets `armComplete` and CONTINUES the scan.
  - `src/parser/theta-document.ts:2985–2995` — the depth-0 stop set
    (`,` `)` `{` `}` `=`). A `{` reaching this test ends the capture, which is
    what keeps a `fn` return type from swallowing its body block. It sees a `{`
    only after at least one token has been captured: in alias mode the arm-start
    branch above takes an arm-start `{` first, and everywhere else a leading `{`
    never enters the loop at all.
  - `src/parser/theta-document.ts:3047–3065` — `consumeInlineObjectType`, the
    balanced-group scanner both arms call. It is correct in isolation; only its
    caller's disposition of the tokens after the group differs.
  - The five callers of `parseType` (`:2918–2922`), four of which take the
    defect: `:1957` (`let` annotation), `:2172` (`fn` parameter), `:2192`
    (`fn` return, `stopAtWithClause`), `:2573` (schema body field,
    `stopAtFieldBoundary`) — and `:2400` (alias / `by` right-hand side), the
    sole `aliasArmBoundary` caller.
  - `src/parser/theta-document.ts:2542–2548` — where the schema field list is
    destroyed. Back in `parseSchemaObjectBody` after the truncated capture, the
    next token is `|` (or `{`, for `null | {}`), which is not an
    `ident` / `keyword` field name, so the arm calls `skipBraceRemainder`
    (`:2610–2620`) and returns `null` — discarding every field already pushed
    at `:2574–2578`.
  - `src/parser/theta-document.ts:2366–2374` — `finishObjectSchema`. A `null`
    field list takes `emitEmptySchemaBody(name, range)` (`:2508–2512`) and
    returns a `schema` statement with no `fields` and no `arms`.
  - `src/parser/schema-declarations.ts:63–74`, `:87–98` —
    `emptySchemaBodyDiagnostic` and `checkObjectSchema`'s zero-field arm, the
    sole construction point. The subject interpolated on this path is the
    declaration's name.
  - `src/parser/bindings.ts:51–67` — `checkLetBinding`, which returns
    `theta/parse/let-without-initialiser` whenever `decl.hasInitialiser` is
    false. The truncated annotation leaves the `=` unconsumed, so `parseLet`
    (`:1954–1962`) never enters its initialiser arm and the flag is false for a
    source that spells one.
  - `src/parser/theta-document.ts:1752–1764` — the statement-loop arm that
    emits `theta/parse/unsupported-feature` with the tail
    `stray '<t>' in statement position` for a punct that starts no form. The
    severed `|` and `=` each reach it.
  - `src/parser/theta-document.ts:2168–2174` — the `fn` parameter loop. It
    reads a name token, optionally a `: Type`, and pushes; the severed `|` and
    `null` are read as two further parameter names with empty type text. No
    diagnostic guards the shape.
  - `src/parser/type-grammar.ts:258–272` (`parseUnion`), `:483–488` (`walkType`'s
    `union` arm) and `:108` (`parseTypeExpression`) — the type grammar the
    captured text is handed to. It parses and walks `{} | null` and
    `null | {}` correctly at all three `TypePosition` values (§Reproduction, the
    seam table), so the defect is entirely in the document-level text capture
    above it.
  - `src/extension/production-composition.ts:1488` — `const registered =
    !diagnostics.some((d) => d.severity === "error")`. Every fixture in
    §Reproduction's first two tables carries an `E`, so the theta does not
    register and the author's only signal is the misattributed message.
  - `tests/inline-empty-object-type.test.ts:704–718` and
    `tests/union-generic-arm-lowering.test.ts:1239–1250` — the two landed cells
    asserting the present dispositions as controls (0045 §Non-goals).
  - `tests/committed-fixture-parse-gate.test.ts` — the gate requiring zero
    diagnostics from every committed `.theta` / `.thetalib`. None of the 35
    committed files and no file under `docs/examples/` carries a `}` followed by
    a `|` (`rg '\}\s*\|' --glob '*.theta' --glob '*.thetalib'` over the tree is
    empty), so the gate never witnesses the shape.
- **Observed at:** `0.57.0` (`9ea93511`). Offline, deterministic; no live model,
  no provider. Scratch vitest driving `parseDoc` (`tests/helpers/e2e-s1.ts`, the
  shipped load path with the standard inert `parseDeps` double) and
  `parseTypeExpression` directly, reading `doc.diagnostics` and the parsed
  `doc.body`; deleted after the outputs below were recorded.

## Summary

`ThetaDocument.parseType` captures a type annotation as source text, and it has
two ways of doing it. In `aliasArmBoundary` mode — used by exactly one caller,
the `schema X = …` right-hand side — a `{` at an arm start opens a balanced
group that is consumed and then scanned PAST, so `{} | null` is captured whole
and split into two arms. In every other mode a leading `{` takes an early
return: the group is captured and the function exits, leaving `| null` in the
token stream for whatever follows to make of it.

Four positions take that early return, and each one's caller mis-reads the
residue in its own way:

- **Schema body field** — the `|` is not a field name, so the recovery path
  discards the whole field list and the declaration raises
  `theta/parse/empty-schema-body` against its own name. Every field already
  captured goes with it.
- **`let` annotation** — the `=` is never reached, so the binding is recorded
  without an initialiser and the residue `| null = 1` becomes two stray-punct
  diagnostics.
- **`fn` parameter** — the residue is read as two more parameters, named `|` and
  `null`.
- **`fn` return** — the residue's `|` is stray, and the body block `{ 1 }` is
  read as a bare object literal, into which the rest of the file is absorbed.

The type grammar underneath is not implicated: `parseTypeExpression("{} | null")`
parses the union and reports exactly the empty arm at all three `TypePosition`
values. Neither is emptiness: `{a: integer} | null` is destroyed identically at
all four positions. Three other capture sites for the same text — the alias
right-hand side, the `@<T>` annotation root and a `params:` field — capture it
whole, which settles what the correct disposition is.

`T | null` is not an exotic spelling. `schemas.md:17` makes it the ONLY way to
write an optional field ("Optional fields are expressed as `T | null` — there is
no `field?: T` shorthand"), and `grammar.md:105` repeats it for every type
position ("nullability is written `T | null`"). An optional inline-object field
is therefore unwritable at the schema-field position, and the diagnostic the
author gets points at the declaration.

## Reproduction

Offline, at `9ea93511`. Every fixture is a whole `.theta` source
(`---\nmode: prompt\n---\n<statement>\nlet a = 1\na\n`) driven through
`parseDoc`. `diags` is `doc.diagnostics` rendered `<severity> <code>: <message>`
in emission order; the AST column reads the parsed statement off `doc.body`.
`E` abbreviates `error theta/parse/`.

### Element 1 — the schema-field position loses the field list

| # | Fixture (statement) | `diags` | Parsed `schema` statement |
|---|---|---|---|
| 1 | `schema S { f: {} \| null }` | `["E empty-schema-body: 'S' has no fields; an empty schema cannot be validated."]` | no `fields`, no `arms` |
| 2 | `schema S { f: {a: integer} \| null }` | same | same |
| 3 | `schema S { f: null \| {} }` | same | same |
| 4 | `schema S { f: {} \| {} }` | same | same |
| 5 | `schema S { a: string, f: {} \| null }` | same | same — field `a` destroyed too |
| 6 | `schema S { f: {} \| null, g: string }` | same | same — field `g` destroyed too |
| 7 | `schema S { f: {  } \| null }` | same | same |
| 8 | `schema S { a: {a: integer} \| array<integer> }` | same | same |

Row 2 is the emptiness control: the arm carries a field and the disposition does
not move. Row 8 is the spelling `tests/union-generic-arm-lowering.test.ts` i3
pins.

Controls at the same position — the field list survives, and the only diagnostic
is 0045's inline rule firing on a `{}` that IS reached:

| Fixture | `diags` | Parsed fields |
|---|---|---|
| `schema S { f: string \| null }` | `[]` | `f`, `typeSource "string\|null"` |
| `schema S { f: {a: integer} }` | `[]` | `f`, `typeSource "{a:integer}"` |
| `schema S { f: {a: integer}, g: string }` | `[]` | `f` and `g` |
| `schema S { f: {} }` | `["E empty-schema-body: '{}' has no fields; …"]` | `f`, `typeSource "{}"` |
| `schema S { f: array<{}> \| null }` | `["E empty-schema-body: '{}' has no fields; …"]` | `f`, `typeSource "array<{}>\|null"` |
| `schema S { f: array<{a: integer} \| null> }` | `[]` | `f`, `typeSource "array<{a:integer}\|null>"` |
| `schema S { f: {} g: string }` | `["E empty-schema-body: '{}' has no fields; …", "E unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated"]` | `f` and `g` |

The last four rows bound the defect precisely. A brace-rooted field type with no
`|` after it captures correctly, because the early return and a full capture
coincide there. A brace group inside `<…>` sits at depth > 0, never reaches the
leading-brace arm, and captures with its union intact — the same two bytes, one
level down, behave as the grammar says. And the comma-missing recovery
(`:2579–2604`) still fires after a brace-rooted field type, so a widened capture
must not disturb it.

Recovery is scoped to the one declaration:

```
schema S { f: {a: integer} | null }
schema T { g: string }
  -> ["E empty-schema-body: 'S' has no fields; …"]
     S: no fields;  T: fields [g: string]
```

### Element 2 — the `let` annotation splits the statement

```
let x: {} | null = 1
  -> ["E let-without-initialiser: let binding 'x' has no initialiser",
      "E empty-schema-body: '{}' has no fields; an empty schema cannot be validated.",
      "E unsupported-feature: unsupported syntactic feature: stray '|' in statement position",
      "E unsupported-feature: unsupported syntactic feature: stray '=' in statement position"]
     statements: [let x (annotation "{}", init null), expr, expr, …]

let x: {a: integer} | null = 1
  -> ["E let-without-initialiser: …", "E unsupported-feature: … stray '|' …",
      "E unsupported-feature: … stray '=' …"]
     statements: [let x (annotation "{a:integer}", init null), expr, expr, …]

let x: integer | null = 1      (control)
  -> []            statements: [let x (annotation "integer|null", init number), …]
```

The four-line list is the HEAD measurement. 0045's §Reproduction (`:479–481`)
records three lines, and its fix report's residual 5 repeats that count; the
second line is new since 0.57.0 — the truncated annotation `{}` now reaches the
type-grammar walk and draws 0045's own inline rule. The non-empty fixture is the
same defect with that line absent.

### Element 3 — the `fn` signature

```
fn f(p: {} | null) { 1 }
  -> ["E empty-schema-body: '{}' has no fields; …"]
     params: [{name "p", type "{}"}, {name "|", type ""}, {name "null", type ""}]

fn f(p: {a: integer} | null) { 1 }
  -> []
     params: [{name "p", type "{a:integer}"}, {name "|", type ""}, {name "null", type ""}]

fn f(): {} | null { 1 }
  -> ["E empty-schema-body: '{}' has no fields; …",
      "E unsupported-feature: unsupported syntactic feature: stray '|' in statement position",
      "E bare-object-literal: bare object literal not permitted in this position; name the schema (Schema { ... })"]
     returnType "{}"; the fn body holds [expr null, expr {}, let a = 1] with tail `a`;
     the DOCUMENT's tail is null

fn f(): {a: integer} | null { 1 }
  -> ["E unsupported-feature: … stray '|' …", "E bare-object-literal: …"]
     returnType "{a:integer}"; same absorption, DOCUMENT tail null

fn f(): integer | null { 1 }   (control)  -> []   returnType "integer|null"
fn f(): {a: integer} { 1 }     (control)  -> []   returnType "{a:integer}"
fn f(): {} { 1 }               (control)  -> ["E empty-schema-body: '{}' …"]  returnType "{}"
```

The non-empty parameter fixture loads with no diagnostic at all and a
three-parameter function the author did not write. The two `fn f(): …` controls
are what a widened capture must not move: the body block is a `{` at a
COMPLETED-arm boundary, not at an arm start.

### The three conformant capture sites

```
schema X = {} | null           -> ["E empty-schema-body: '{}' has no fields; …"]  arms ["{}","null"]
schema X = null | {}           -> ["E empty-schema-body: '{}' has no fields; …"]  arms ["null","{}"]
schema X = {a: integer} | null -> []                                              arms ["{a:integer}","null"]

let r = @<{} | null>`hi`            -> ["E empty-schema-body: '{}' …"]   query schema text "{}|null"
let r = @<{a: integer} | null>`hi`  -> []                                query schema text "{a:integer}|null"

params:  p: "{} | null"             -> ["E empty-schema-body: '{}' …"]
params:  p: "{a: integer} | null"   -> []
```

All three capture the full union and report exactly the empty arm, once. 0045's
§Reproduction records the alias rows as `diags: []` at 0.45.0 (`:487–488`); the
single `'{}'` line is 0045's own fix and is the correct disposition, not drift
in this report's subject — the `arms` values are byte-identical to what it
recorded.

### The type grammar under the capture

`parseTypeExpression(source, position, site)` over five sources at all three
`TypePosition` values — fifteen cells, identical across positions:

```
"{} | null"           -> ["E empty-schema-body: '{}' has no fields; …"]
"null | {}"           -> ["E empty-schema-body: '{}' has no fields; …"]
"{a: integer} | null" -> []
"{}"                  -> ["E empty-schema-body: '{}' has no fields; …"]
"string | null"       -> []
```

The union is parsed, the arms are walked, and the empty arm alone is refused. No
part of the reported behaviour originates here.

## Expected behaviour (what the spec says)

- [Grammar Appendix — Type grammar](../spec_topics/grammar.md#type-grammar)
  `:90–102`: `Type ::= PrimitiveType | NamedType | GenericType | ObjectType |
  Type "|" Type | LiteralType`, with `ObjectType ::= "{" Field ("," Field)*
  ","? "}"`. A brace-rooted union is a `Type`: the union alternative (`:94`)
  places no restriction on which alternative its left operand takes, and
  `ObjectType` is one of them.
- `grammar.md:105` enumerates the positions a bare `Type` appears in — "`let`
  annotations, `fn` parameter types, schema field types, `params:` field types,
  generic type arguments, union arms, and `invoke<Type>` / type-ascription
  contexts" — and closes: "The grammar is otherwise identical in every position;
  nullability is written `T | null`." The `fn` / theta return position takes
  `ReturnType` (`:89`), which is `Type` plus `void`.
- `grammar.md:109` (§"Inline object types"): "`ObjectType` admits an anonymous
  object type `{ field: T, ... }` in **any** `Type` position."
- [Type System](../spec_topics/type-system.md) `:15`: "The same type grammar
  applies in every type-annotation position: schema fields, frontmatter
  `params:`, `let x: T`, function parameters, and `@<T>`...`` explicit query
  schemas." Position invariance is the property the four positions in
  §Reproduction break.
- [Schema Declarations — Object schema](../spec_topics/schemas.md#object-schema)
  `:17`: "field types are any expression from the Type System grammar … Optional
  fields are expressed as `T | null` — there is no `field?: T` shorthand." An
  optional inline-object field has exactly one spelling and it is the one that
  destroys the field list.
- `grammar.md:77` (`LetStmt ::= "let" "mut"? Pattern (":" Type)? "=" Expr`) and
  `:138` (`FnDecl ::= "fn" Ident "(" FnParams? ")" (":" ReturnType)? FnBody`,
  with `:143` "Each `FnParam` is an `Ident ":" Type` pair"). In both, the type
  slot is one `Type`, and what follows it (`= Expr`, `,`, `)`, `FnBody`) is a
  separate slot of the same production. Neither admits a parameter named `|`.
- `grammar.md:175`: `AliasRhs ::= Type ("|" Type)*` — the alias right-hand side
  is the same union of the same `Type`, which is why its capture is the
  reference implementation rather than a special case.
- [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2): the registry
  is closed, and a code's trigger is a spec-level property. An emission from an
  input the row does not describe is outside the contract.

Expected concretely, at all four positions:

- `schema S { f: {} | null }` parses to one field `f` with type source
  `{}|null`, and the field's own type reaches `parseTypeExpression` at
  `schema-feeding`. The only line is 0045's inline rule against the empty arm,
  rendering `'{}'` — the same single line the alias spelling
  `schema X = {} | null` produces today. `schema S { f: {a: integer} | null }`
  loads clean with one field. No `'S' has no fields` line is emitted for either:
  the declaration has a field.
- `let x: {} | null = 1` records annotation `{}|null` with its initialiser bound,
  and emits neither `let-without-initialiser` nor a stray-punct line. Whether the
  initialiser check then objects to `1` against a union annotation is that
  check's own question — `let x: string | null = 1` draws
  `theta/parse/let-rhs-type-mismatch` and `let x: integer | null = 1` draws
  nothing, both independently of this fix.
- `fn f(p: {} | null) { 1 }` records ONE parameter, `p`, with type `{}|null`.
- `fn f(): {} | null { 1 }` records the return type `{}|null` and the body block
  `{ 1 }` as the body, with the file's remaining statements at file level.

## Actual behaviour / root cause

**One early return.** `parseType` (`:2918–2922`) takes three flags and joins
token texts until a delimiter. Before the scan loop runs, `:2936–2939` tests for
a leading `{` and, outside `aliasArmBoundary` mode, consumes the balanced group
and returns. `consumeInlineObjectType` (`:3047–3065`) is correct — it tracks
brace depth and stops at the matching `}` or at a `stmt-sep` — so the capture is
exactly the group, and the `|` that follows is left at the cursor. Inside
`aliasArmBoundary` mode the same group is consumed by `:2975–2984`, which sets
`armComplete` and CONTINUES the loop, so the `|` is joined, the next arm start is
recognised, and a second `{` there is consumed the same way. The two code paths
implement two different grammars for one production, and the comment at
`:2929–2935` records the split without treating it as a defect.

The scan loop's own `{` stop (`:2985–2995`, depth 0) is what handles a `{` that
is NOT at an arm start — a `fn` body block after a completed return type. That
rule is correct and unchanged by this report; it is never consulted at an arm
start outside alias mode, because the early return fires first.

**Each caller mis-reads its own residue.**

- *Schema field* (`:2573`). `parseSchemaObjectBody` pushes the field
  (`:2574–2578`), finds no `,`, and finds a boundary token that is not an
  ident/keyword, so it emits no comma diagnostic (`:2588–2604`). The loop then
  re-enters at `:2542` with `|` at the cursor, fails the field-name test, calls
  `skipBraceRemainder` and RETURNS `null` (`:2544–2548`) — discarding the fields
  array it has been building. `finishObjectSchema` (`:2366–2374`) reads `null` as
  "this declaration yields no fields either way" and calls
  `emitEmptySchemaBody(name, …)`, which renders the DECLARATION's name. For
  `schema S { f: null | {} }` the route differs by one step and ends the same
  way: `null` and `|` join the capture, then the depth-0 `{` stop (`:2990`) ends
  it at `"null|"`, and `{` is the non-field-name token at `:2542`.
- *`let` annotation* (`:1957`). `parseLet` reads the annotation, then tests
  `isPunct("=")` (`:1960`) against a `|` and skips the initialiser arm, so the
  statement is recorded with `init: null`. `checkLetBinding`
  (`bindings.ts:51–67`) sees `hasInitialiser === false`. The residue re-enters
  the statement loop, where `|` and `=` each start no form and reach the
  stray-punct emission at `:1752–1764`.
- *`fn` parameter* (`:2172`). The parameter loop pushes `{p, "{}"}`, finds no
  `,`, and re-enters; `|` is read as a parameter name (`:2168`) with no `:`, so
  its type is the empty string, and `null` follows it. The loop exits at `)`.
  Nothing checks that a parameter name is an identifier.
- *`fn` return* (`:2192`). The residue's `|` is stray; `{ 1 }` is then parsed in
  expression position as a bare object literal and draws
  `theta/parse/bare-object-literal`, and the enclosing recovery absorbs the
  file's remaining statements into the function body, leaving `doc.body.tail`
  null.

**Every emission sits outside its row's registered *Trigger*.**

- `theta/parse/empty-schema-body`
  (`code-registry-parse.md:86`) triggers on "A `schema` declaration whose shape
  yields no usable content (neither fields nor alias arms): an empty object body
  (`schema X { }`), a body whose first token is not a plain `ident: Type` field
  list, or no shape at all" — plus, since 0045, "An empty inline object type
  (`{}`) in any `Type` position, at any nesting depth." `schema S { f: {} |
  null }`'s body DOES begin with a plain `ident: Type` field (`{} | null` is a
  `Type` by `grammar.md:94`), so it matches no declaration clause; the `'S'` line
  it draws is unregistered for this input. Its `{}` arm does match the inline
  clause — and that line, `'{}'`, is the one NOT emitted. The registry describes
  the opposite of what happens. For `schema S { f: {a: integer} | null }` no
  clause matches at all.
- `theta/parse/let-without-initialiser` (`:53`) triggers on "`let x: T`
  (annotation, no initialiser)". `let x: {} | null = 1` has an initialiser.
- `theta/parse/unsupported-feature` (`:27`) triggers on "A theta 1.0-deferred or
  non-Theta syntactic construct (arrow function, spread, optional chaining,
  `===`, bitwise op, comma op, nested template, etc.)". The severed `|` is the
  type-union operator of `grammar.md:94` and the severed `=` is `LetStmt`'s own
  initialiser token (`:77`). Neither is a deferred or non-theta construct. (The
  separate question of whether the tail `stray '<t>' in statement position` is a
  permitted `<construct>` rendering at all is
  [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)'s.)
- `theta/parse/bare-object-literal` (`:47`) triggers on a bare `{ field: expr }`
  "used in expression position". `fn f(): {} | null { 1 }`'s `{ 1 }` is a
  `FnBody` (`grammar.md:138`), which the parser placed in expression position
  itself.

**Nothing downstream sees any of it.** Each fixture carries an `E`, so
`production-composition.ts:1488` refuses registration and the parse-time list is
the author's only signal.

## Why it matters

1. An optional inline-object field cannot be written. `schemas.md:17` gives
   `T | null` as the only spelling for optionality and `grammar.md:109` admits
   `ObjectType` in any `Type` position; the intersection —
   `schema S { f: {a: integer} | null }` — destroys the declaration. There is no
   other spelling to fall back to.
2. The diagnostic sends the author to the wrong construct. `'S' has no fields;
   an empty schema cannot be validated.` names a declaration that has fields,
   for a reason that is neither emptiness nor the declaration. An author acting
   on it inspects a body that is already correct, and the arm that caused it is
   never mentioned. `schema S { a: string, f: {} | null }` reports the same line
   while destroying a field the arm has nothing to do with.
3. Element 3 reports nothing about the loss it causes.
   `fn f(p: {a: integer} | null) { 1 }` loads with zero diagnostics and a
   three-parameter signature, so the corrupted arity is carried into the
   callable set; `fn f(): {} | null { 1 }` leaves the document with no tail
   expression, which is a different program, and the three lines it does draw
   name a stray `|` and an object literal the author did not write.
4. The behaviour is position-dependent for one grammar. `type-system.md:15`
   states the invariance directly, and the same source text is captured three
   ways: two arms at the alias / `@<T>` / `params:` positions, one arm plus
   residue at four others, and correctly again one level down inside
   `array<…>`. A reader cannot derive any of this from the spec.
5. Under DIAG-2 the registry is the closed authority for what the runtime
   emits, and all four codes these inputs draw are emitted outside their rows.
   Two landed test cells
   (`tests/inline-empty-object-type.test.ts:704–718`,
   `tests/union-generic-arm-lowering.test.ts:1239–1250`) currently pin those
   out-of-contract emissions as expected values, and three comments in the first
   file record the defect as the reason its union-arm coverage sits at a
   different position than the rule it tests governs.

## Fix

One edit at one site, with the boundary rules already in the file.

**The capture.** Delete the early return at
`src/parser/theta-document.ts:2936–2939` and make the arm-start branch at
`:2975–2984` unconditional on `aliasArmBoundary`: at an arm start — the scan's
first token, or the token straight after a depth-0 `|` (`atArmStart`, `:2945`) —
a `{` consumes the balanced group through `consumeInlineObjectType`, sets
`armComplete`, and the scan continues. Every non-alias position then consumes
the same `Type ("|" Type)*` extent the alias right-hand side consumes, which is
what `grammar.md:94` and `:105` require of all of them.

The three remaining `aliasArmBoundary` guards (`:2946–2954` the punct stops,
`:2965–2974` the `-` stop, `:2976–2978` the keyword stops) stay alias-only:
they exist for the newline-continuation boundary a declaration's trailing `=`
swallows (0042 §Fix), which no other caller has.

**What must not move, and the fixture that proves each.**

- *The `fn` body block.* A `{` after a COMPLETED arm must still end the capture
  at the depth-0 stop (`:2985–2995`). `fn f(): {a: integer} { 1 }` and
  `fn f(): {} { 1 }` keep their present dispositions (`[]` and the single
  `'{}'` line), and `fn f(): {a: integer} | null { 1 }` newly loads clean with
  return type `{a:integer}|null`.
- *The comma-missing field recovery.* `stopAtFieldBoundary`'s value-ish rule
  (`:3009–3018`) must still fire after a brace-rooted arm.
  `schema S { f: {} g: string }` keeps both fields, the
  `schema fields must be comma-separated` line and the `'{}'` line.
- *The other field delimiters.* `,` and `}` still end a field type at depth 0, so
  `schema S { f: {a: integer}, g: string }` and every fixture in
  §Reproduction's control table is byte-unchanged.
- *The `let` initialiser and the parameter delimiters.* `=` still ends a `let`
  annotation and `,` / `)` still end a `fn` parameter type, at the
  completed-arm boundary as they do today.
- *The alias right-hand side.* Its `arms` are byte-identical for
  `schema X = {} | null`, `schema X = null | {}` and
  `schema X = {a: integer} | null`, and 0042's `malformed-alias-rhs` boundary set
  is untouched, because the branch is reused rather than rewritten.
- *The `@<T>` root and `params:` fields.* Different capture code; unchanged.

**What the fix produces.** `parseSchemaObjectBody` retains the field list, so
`finishObjectSchema`'s `fields === null` arm (`:2369–2372`) is not reached for
these inputs and the declaration-subject `empty-schema-body` line disappears
from them. The field's type source `{}|null` then reaches
`parseTypeExpression` at `schema-feeding` (`:6071`), whose walk descends union
arms (`type-grammar.ts:483–488`) and raises 0045's inline rule against the empty
arm — the `'{}'` rendering. So the misattributed declaration line is replaced by
the field-scoped inline line, and both emissions land inside the *Trigger* the
registry already carries (`code-registry-parse.md:86`): the declaration clauses
stop firing for inputs that match none of them, and the inline clause starts
firing for an input it describes. At the `let` position the
`let-without-initialiser` and two stray-punct lines disappear with the residue;
at the `fn` positions the parameter list holds the one parameter the author
wrote and the body block stays the body. No registry edit, no new code, no
`docs/reference/` edit.

**The landed pins move with the fix, in the same commit.**

- `tests/inline-empty-object-type.test.ts:704–718` (e5) asserts
  `schema S { f: {} | null }` renders the single `'S'` line. It inverts to the
  `'{}'` line, and its comment — "the union-arm capture defect is out of scope
  (§Non-goals)" — is rewritten to record the repair. The same file's three
  bounding comments (`:80–82`, `:321–325`, `:525–527`) state that the union-arm
  cells sit at the alias position because the field spelling is unusable; that
  reason expires, and a2 / c1 gain a schema-field twin.
- `tests/union-generic-arm-lowering.test.ts:1239–1250` (i3) asserts the
  schema-field position "cannot carry this spelling at all" and keys on the
  presence of `empty-schema-body`. After the fix
  `schema S { a: {a: integer} | array<integer> }` loads, so the cell becomes the
  four-position parity assertion its own comment says it could not be — the same
  claim i1 makes at the alias and annotation positions.

**GOV-15, in two parts.** Most inputs this fix moves carry an `E` today, so they
sit outside the
[loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
set the equivalence promise ranges over, and the direction of travel is out of
the refused set: `schema S { f: {a: integer} | null }` and
`fn f(): {a: integer} | null { 1 }` newly load clean, while
`fn f(p: {} | null) { 1 }` and `schema S { f: {} | null }` keep exactly one
`'{}'` line and stay refused.

One family is inside the set and must be dispositioned rather than assumed:
`fn f(p: {a: integer} | null) { 1 }` loads with zero diagnostics TODAY, carrying
three parameters, and after the fix it loads with zero diagnostics carrying one.
GOV-15 (a) ranges over return values, and a call site's argument binding
([Invocation — Argument binding](../spec_topics/invocation.md#argument-binding),
`:48` §"Argument arity") reads the parameter list, so a theta that loads
cleanly can change behaviour. The fix must state the disposition
explicitly: no spec text defines a parameter named `|`, so the pre-fix signature
is not behaviour GOV-15 was written to preserve — but the claim needs the same
evidence any carve-out needs, namely that no committed or documented theta
exhibits it. No committed `.theta` / `.thetalib` and no file under
`docs/examples/` carries a `}` followed by a `|`, so
`tests/committed-fixture-parse-gate.test.ts` cannot witness a change and no
shipped example moves.

**The blast-radius question the fix must answer before it lands.** Widening the
capture changes what is consumed for every source in which a depth-0 `{` stands
at an arm start in a non-alias type slot. The set is enumerable from the code:
today that is exactly a leading `{` (where the early return and a correct
capture coincide, so nothing moves) plus a `{` straight after a depth-0 `|`
(where nothing parses correctly today). The fix must demonstrate that rather
than assert it — by re-parsing all 35 committed `.theta` / `.thetalib` files (21
of them under `docs/examples/`) with the change in place and with it
neutralised, asserting byte-identical diagnostic dispositions, and by pinning
each control above at each of the four positions. The `fn`-return body block is
the one place where the widened rule and an existing construct compete for the
same token, and it is the case to test in both directions.

**Test witness — unit, offline, provider-free.** Every fixture in §Reproduction
is one `parseDoc` call over a string; the observable is the ordered diagnostic
list plus the parsed statement. Required: one cell per fixture of the three
element sections and per control, asserting the whole ordered list AND the
parsed shape (field names and type sources, the `let` annotation and initialiser
presence, the parameter list, `doc.body.tail`), since two of the fixtures move an
AST without moving a diagnostic; the three conformant capture sites asserted
byte-unchanged; the seam table over all three `TypePosition` values as the
control that the type grammar was never implicated; and the two landed cells
above rewritten in place rather than duplicated. Messages are sourced from the
registry row (DIAG-4), as `tests/inline-empty-object-type.test.ts` already does.

## Non-goals

- **The `<construct>` rendering vocabulary.** Whether `stray '<t>' in statement
  position` may be rendered at all is
  [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)'s
  subject. This fix removes one route to that emission and changes neither the
  tail nor the closed table.
- **`theta/parse/let-rhs-type-mismatch` against a union annotation.**
  `let x: string | null = 1` draws it today and `let x: integer | null = 1` does
  not; both are unchanged here. Once `let x: {} | null = 1` records its
  initialiser, whatever that check says about `1` against an object union is the
  check's own disposition, reached for the first time rather than altered.
- **A diagnostic for a non-identifier `fn` parameter name.** The parameter loop
  (`:2168–2174`) accepts any token as a name and this fix does not add a guard;
  it removes the one route that reaches the loop with `|` at the cursor. A
  source that spells a non-identifier parameter name directly is a separate
  question against `grammar.md:143`.
- **The tolerant recoveries themselves.** `parseSchemaObjectBody`'s
  discard-the-whole-list arm (`:2544–2548`), `skipBraceRemainder` and the
  `fn`-return body-absorption path stay as written. This fix stops feeding them
  well-formed input; whether discarding an already-captured field list is the
  right recovery for input that is genuinely mis-shaped is not settled here.
- **Anything below the parse seam.** `parseTypeExpression`, `walkType` and every
  lowerer are correct for this text already (§Reproduction's seam table), and no
  lowering is reachable from any fixture in the first two tables, since all
  carry an `E`.

## Provenance

- Origin: bug
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md), which
  recorded elements 1 and 2 and the alias contrast in §Reproduction
  (`:460–488`), excluded them in §Non-goals (`:766–772`), and pinned the current
  dispositions as controls e5 and i3 so a later fix would have to move them
  deliberately. Its fix report (`.pi/tmp/fixes/0045-report.md:295–301`,
  residual 5) names them "two adjacent capture defects, unfiled and unchanged".
  Element 3 is not in that record and is re-derived here.
- Spec: `docs/spec_topics/grammar.md` (`:77` `LetStmt`, `:89–102` the type
  grammar, `:105` the position enumeration and the `T | null` sentence, `:109`
  inline object types, `:138`/`:143` `FnDecl` and `FnParam`, `:175` `AliasRhs`);
  `docs/spec_topics/schemas.md:17` (field types and the optional-field
  spelling); `docs/spec_topics/type-system.md:15` (position invariance);
  `docs/spec_topics/diagnostics/diagnostic-shape.md`
  ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2),
  [DIAG-4](../spec_topics/diagnostics/diagnostic-shape.md#diag-4));
  `docs/spec_topics/diagnostics/code-registry-parse.md` (`:27`
  `unsupported-feature`, `:47` `bare-object-literal`, `:53`
  `let-without-initialiser`, `:86` `empty-schema-body`);
  `docs/spec_topics/governance/source-language-stability.md`
  ([GOV-15](../spec_topics/governance/source-language-stability.md#gov-15) and
  its loads-cleanly predicate).
- Implementation evidence at `9ea93511`: `src/parser/theta-document.ts`
  (`:1752–1764`, `:1954–1962`, `:2168–2174`, `:2183–2192`, `:2366–2374`,
  `:2400`, `:2508–2512`, `:2542–2548`, `:2573–2604`, `:2610–2620`,
  `:2886–2939`, `:2945`, `:2975–2995`, `:3009–3018`, `:3047–3065`, `:6071`);
  `src/parser/bindings.ts:51–67`; `src/parser/schema-declarations.ts:63–74`,
  `:87–98`; `src/parser/type-grammar.ts:108`, `:258–272`, `:483–488`;
  `src/extension/production-composition.ts:1488`.
- Test evidence at `9ea93511`: `tests/inline-empty-object-type.test.ts`
  (`:80–82`, `:321–325`, `:525–527`, `:704–718`);
  `tests/union-generic-arm-lowering.test.ts:1239–1250`;
  `tests/committed-fixture-parse-gate.test.ts`; `tests/helpers/e2e-s1.ts:38–42`
  (`parseDoc`).
- Reproduction: scratch vitest at HEAD over the eight element-1 fixtures and
  seven controls, the two-declaration recovery fixture, the three element-2
  fixtures, the seven element-3 fixtures, the seven conformant-capture fixtures
  and the fifteen seam cells — run on the outputs quoted above, then deleted per
  scratch policy.

### Coordination note — bug 0096 (0.73.0)

[0096](./0096-discriminator-field-classifier-naive-brace-test.md) landed first,
at 0.73.0, as its §Fix ordering clause permits ("lands with or before 0095's").
Two consequences for this report.

**This report's blast radius no longer includes a false
`theta/parse/nested-discriminator`.** Widening the schema-field capture feeds
`classifyDiscriminatorFieldType` the source `{a:integer}|{b:string}`. Under the
naive prefix/suffix brace test that classifier applied before 0096, that source
classified `{ nested: true }`, and `Cat { kind: {a: integer} | {b: string}, … }`
under `schema Animal by kind = Cat | Dog` would have been refused with
`discriminator field 'kind' must be at the top level of each variant of Animal`,
naming a nesting the source does not contain — the `empty-schema-body` line this
fix removes replaced by a different wrong line. The classifier now answers `{}`
for that source, so element 1's stated outcome (a clean load) is what the widened
capture actually produces. 0096's fix record carries the offline proof: with this
report's capture widening applied as a temporary probe, the fixture loads with no
diagnostics under the corrected guard.

**This report inherits 0096 §Fix witness item 4.** That item — a `parseDoc` cell
for `Cat { kind: {a: integer} | {b: string}, … }` plus
`schema Animal by kind = Cat | Dog` asserting the clean load, with
`kind: "a" | "b"` beside it as the parity control — is assigned by 0096 §Fix to
"whichever of the two changes carries 0095's widened capture", because that
capture is what makes the input reachable through `parseDoc`. 0096 does not carry
it. **This fix owes it**, and it is also where the end-to-end live witness for
the corrected classification belongs: 0096 could only run its live suites as a
no-regression check, since the input was unreachable.
`tests/discriminator-field-classifier-brace-group.test.ts` item 3 pins that
cell's before-bytes (`empty-schema-body` naming `Cat`), so this fix has the
disposition it is moving.

## Fix (0.74.0)

The settled §Fix, implemented at a tree sixteen releases past the one the report
was written at. **One edit at one site**, reusing a branch that already existed.
Citations below are symbols, not line anchors — the report's anchors had drifted
(see *Baseline drift*).

**Baseline drift: citations only, observables none.** The report's evidence is at
`9ea93511` (0.57.0); this fix's baseline is `04504288` (0.73.0), with 0071, 0072,
0079, 0084 and 0096 having grown `src/parser/theta-document.ts` in between.
`parseType`'s leading-brace early return had moved `:2936–2939`→`:2963–2966`, its
signature `:2918–2922`→`:2945–2949`, `atArmStart` `:2945`→`:2972`, the arm-start
`{` branch `:2975–2984`→`:3002–3010` (nine lines, not ten), the depth-0 stop set
`:2985–2995`→`:3012–3022`, `consumeInlineObjectType` `:3047`→`:3074`;
`tests/union-generic-arm-lowering.test.ts`'s i3 `:1239–1250`→`:1245–1256`. A
scratch probe at this baseline re-derived **every observable of §Reproduction** —
all eight element-1 fixtures, all seven controls, the two-declaration recovery
fixture, all three element-2 fixtures, all seven element-3 fixtures, all seven
conformant-capture fixtures, all fifteen seam cells, and the two cells inherited
from 0096 — and **every one was byte-identical** to the recorded 0.57.0 output,
including the four-line `let` list and element 3's `doc.body.tail` of `null`.
Probes written, run, deleted.

**Three statements in the report are wrong rather than stale.** (i) The corpus is
**34 tracked** `.theta` / `.thetalib` files (32 `.theta` plus 2 `.thetalib`; 21
under `docs/examples/`, 11 under `tests/live/acceptance/fixtures/`, one
`tests/fixtures/h7a/acceptance.theta`, one seeded-invalid
`tests/fixtures/h7b-invalid/malformed.theta`), not 35. The figure 35 is reached
only by counting the present-but-untracked `.pi/theta/smoke.theta`, which the
shipped gate's filesystem walk does cover. (ii) §Fix delegates the blast-radius
proof to `tests/committed-fixture-parse-gate.test.ts`, but that walk filters
`entry.name.endsWith(".theta")`, so it **cannot witness either committed
`.thetalib`**; the oracle written for this fix covers both extensions. (iii)
§Fix's list of landed pins that move is **incomplete** — see *One pin the report
does not list*.

**What shipped.**

- `src/parser/theta-document.ts` — `parseType`'s leading-brace early return is
  deleted, and its arm-start `{` branch is now reached at every `Type` position:
  the outer guard is `depth === 0 && atArmStart`, with only the
  `ALIAS_ARM_STOP_KEYWORDS` check inside it still gated on `aliasArmBoundary`.
  The branch body — `consumeInlineObjectType`, `armComplete = true`, `continue` —
  is **byte-unchanged**, which is what makes the alias right-hand side provably
  untouched: it already ran through exactly this branch. Four deleted lines and
  one restructured condition are the whole behavioural delta.
- `src/parser/theta-document.ts` — `parseType`'s doc comment re-derived. The
  arm-start inline-`ObjectType` rule is stated as **position-general**
  (`grammar.md` §"Type grammar", §"Inline object types"; `type-system.md`'s
  position-invariance sentence), with the reason a `{` reaching the scan at a
  non-arm-start still falls through to the depth-0 stop set — the `fn` body
  block. The alias-mode paragraph now names exactly the three stops that remain
  alias-scoped and why only that caller needs them: its `Type` slot is the one
  that is delimiter-less at the end, so a trailing `=` / `>` continuation can
  swallow the newline ending its logical line (bug 0042 §Fix), where every other
  caller's slot is bounded by its own `)`, `,`, `}`, `=`, or the return slot's
  `with` / body-block stop.
- No registry edit, no new diagnostic code, no `docs/reference/` edit, no
  `docs/spec_topics/` edit — `git diff --stat -- docs/` was empty through the
  whole pipeline. `src/parser/params.ts` byte-unchanged (bug 0039 §Fix freeze).

**What moved, exactly as §"What the fix produces" states.**
`parseSchemaObjectBody` retains the field list, so `finishObjectSchema`'s
`fields === null` arm is not reached for these inputs and the declaration-subject
`empty-schema-body` line disappears; the field's type source `{}|null` reaches
`parseTypeExpression` at `schema-feeding`, whose walk descends the union arms and
raises bug 0045's inline rule against the empty arm — the `'{}'` rendering. The
misattributed declaration line is **replaced** by the field-scoped inline line,
and both emissions sit inside the *Trigger* `code-registry-parse.md:86` already
carries. At the `let` position `let-without-initialiser` and the two stray-punct
lines go with the residue; at the `fn` positions the parameter list holds the one
parameter the author wrote and the body block stays the body.

**Two post-fix dispositions the report leaves open, measured rather than
assumed.** `let x: {} | null = 1` draws the single inline `'{}'` line and **no**
`theta/parse/let-rhs-type-mismatch`: that row is scoped to a statically
resolvable right-hand-side type, and an object union is not one.
`schema S { f: {} | {} }` draws **two** `'{}'` lines, one per arm — the only
fixture that proves the capture reached the *second* arm-start `{`.

**Every "must not move" control, with the fixture that pins it.** All are cells
of `tests/brace-rooted-union-arm-capture.test.ts` unless named otherwise, and all
were confirmed byte-identical across the fix and its neutralisation.

- *The `fn` body block* — the one place the widened rule and an existing
  construct compete for the same token, tested in both directions:
  `fn f(): {a: integer} { 1 }` keeps `[]` and return type `{a:integer}` (4a);
  `fn f(): {} { 1 }` keeps the single `'{}'` line (4b); and
  `fn f(): {a: integer} | null { 1 }` **newly loads clean** with return type
  `{a:integer}|null`, the body block still the body and `doc.body.tail` present
  (3d).
- *The comma-missing field recovery* — `schema S { f: {} g: string }` keeps both
  fields, the `schema fields must be comma-separated` line and the `'{}'` line,
  in that order (4c).
- *The other field delimiters* — `,` and `}` still end a field type at depth 0
  (4d–4f); every fixture of §Reproduction's control table is byte-unchanged,
  including both `array<…>` shapes, where the brace group sits at depth greater
  than zero and never reaches the arm-start branch at all (4g).
- *The `let` initialiser and the parameter delimiters* — `=` still ends a `let`
  annotation and `,` / `)` still end a `fn` parameter type, at the completed-arm
  boundary (4h, 4i, 2c, 3e).
- *The alias right-hand side* — `arms` byte-identical for `schema X = {} | null`,
  `schema X = null | {}` and `schema X = {a: integer} | null` (5a); bug 0042's
  `malformed-alias-rhs` boundary family probed unchanged, and that report's own
  31-test witness green.
- *The `@<T>` root and `params:` fields* — different capture code, unchanged
  (5b, 5c). Measured while strengthening those two cells to pin capture bytes
  rather than diagnostics alone: a `params:` field's recorded type is the **raw
  YAML scalar trimmed only at its ends** (`splitParamValue`), so
  `{a: integer} | null` keeps its internal spaces there and never takes
  `parseType`'s token-join form; and the empty spelling has **no** captured-text
  observable at all, because `empty-schema-body` is error-severity and
  `parseFrontmatter`'s registration gate leaves `doc.frontmatter` null. Both are
  pinned as measured, with the asymmetry stated in the cell rather than hidden.
- *The type grammar under the capture* — the fifteen-cell seam table over all
  three `TypePosition` values, identical across positions and across the fix
  (group 7): the control that the type grammar was never implicated.

**The blast-radius demonstration, in both directions, with numbers.** A corpus
oracle lexes and parses every tracked `.theta` / `.thetalib` plus the present
`.pi/theta/smoke.theta` exactly as the shipped gate does, and renders each file's
ordered `theta/load/*` and `theta/parse/*` list. Run with the change in place,
then with it neutralised by a targeted byte edit, then restored: **35 files parsed
in each direction, 0 rows differing in either direction** — a byte-empty `diff`,
both ways. The enumerable set of affected sources is a leading `{` (where the
early return and a correct capture coincide, so nothing moves) plus a `{`
straight after a depth-0 `|` (which nothing parses correctly today), and no
committed or documented theta spells the second.
`tests/committed-fixture-parse-gate.test.ts` was reused as the shipped oracle,
not rewritten, and stayed green throughout.

**GOV-15, in two parts.** Most inputs this fix moves carry an `E` today, so they
sit outside the
[loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
set the equivalence promise ranges over, and the direction of travel is **out of**
the refused set: `schema S { f: {a: integer} | null }` and
`fn f(): {a: integer} | null { 1 }` newly load clean, while
`schema S { f: {} | null }` and `fn f(p: {} | null) { 1 }` keep exactly one
`'{}'` line and stay refused.

The family that is **inside** the set is `fn f(p: {a: integer} | null) { 1 }`:
zero diagnostics today carrying three parameters, zero diagnostics after carrying
one. Its disposition is recorded on four grounds, each measured rather than
asserted.

1. *The parameter list is not one of GOV-15's observables.* The promise ranges
   over (a) return values, (b) ordered diagnostic-code sequences and (c)
   `theta-system-note` content, and that list is **closed at theta 1.0.0**. A
   recorded parameter list is none of the three, and GOV-15's own third-bucket
   clause dispositions such an observable directly: its divergence between
   releases "is, by default, a documentation defect against GOV-15 … and is not
   itself a departure from the current release's equivalence promise."
2. *Observable (b) cannot move for this family, and the report's stated ground
   for fearing otherwise does not apply.* §Fix reasons from
   [Invocation — Argument binding](../spec_topics/invocation.md#argument-binding)
   and `:48` §"Argument arity" that a call site reads the parameter list. Those
   rules govern `invoke<T>` and `.theta`-callable calls through `tools:`;
   measured at this baseline, an **in-document `fn` call is not arity-checked at
   the parse seam at all** — `fn f(p: integer) { 1 }` called with three arguments
   draws `[]`, exactly as the phantom three-parameter signature called with one
   draws `[]`. The phantom arity was never visible in the diagnostic sequence,
   before or after.
3. *Observable (a) cannot move either.* It could only differ if a body read a
   phantom parameter's binding, and the phantom names are `|` and `null` —
   neither is a referenceable `Ident`. `grammar.md:143` requires each `FnParam`
   to be an `Ident ":" Type` pair; `|` is the type-union operator of `:94` and
   `null` is a keyword. The pre-fix signature is therefore not behaviour GOV-15
   was written to preserve.
4. *The empirical carve-out, re-verified at this HEAD.* Three sweeps, each
   returning no match (ripgrep exit 1): `}` followed by `|` over every
   `.theta` / `.thetalib` in the tree; the same pattern over `docs/examples/`;
   and `|` followed by `{` for the second mover below. Corroborated by the corpus
   oracle's 0-rows-differing result over 35 files in both directions. No
   committed or documented theta exhibits the shape, so no shipped example moves.

This is the disposition-by-argument shape bug 0031 recorded and bug 0084 reused
narrowly, applied to a different clause: 0031 and 0084 engaged the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out),
whose covered effect is that previously clean-loading inputs **gain** an emission.
This fix engages no carve-out, because no in-set input's (a), (b) or (c) moves at
all; the argument is that the divergence is confined to a third-bucket observable.

**A second member of the same class, found in review and dispositioned
identically.** `fn f(): integer | { 1 }` — a `{` straight after a depth-0 `|` in
the return slot, with no arm text after it — draws `[]` on both sides of the fix
while its program shape moves: return type `"integer|"` with the block as the
body and a document tail, becoming return type `"integer|{1}"` with the following
statements absorbed and no document tail. §Fix's GOV-15 paragraph dispositions
only the parameter-arity family, so this one is recorded here and pinned as cell
3f, on the same four grounds: the pre-fix capture `"integer|"` is not
spec-describable either (`grammar.md:94` requires a `Type` after a depth-0 `|`,
and `:109` admits `ObjectType` there, so the `{` **is** an arm start), and the
`|`-then-`{` sweep over the corpus is empty. Its arm-order mirror
`fn f(): integer | {a: integer} { 1 }` — three diagnostics today, `[]` after, the
sharpest two-`{` competition in the language — is pinned as cell 3g.

**Test witness.** `tests/brace-rooted-union-arm-capture.test.ts` — new, 37 cells
in seven groups, offline / provider-free / deterministic, every cell asserting
the **whole ordered diagnostic list AND the parsed shape** (field names and type
sources, the `let` annotation and initialiser presence, the parameter list,
`returnType`, the body's statement kinds, `doc.body.tail`). The parsed shape is
not decoration: cells 3a and 3b move an AST with the diagnostic list identical on
both sides (the single `'{}'` line, and `[]`, respectively), so they red on
`params` arity alone. Groups: (1) element 1's eight fixtures plus the
two-declaration recovery; (2) element 2 plus its control; (3) element 3 plus
3f / 3g; (4) the must-not-move controls; (5) the three conformant capture sites;
(6) the inherited 0096 cell, its parity control and a still-nested bound; (7) the
seam table. Messages are read from the registry through `parseRegistry` /
`registryMessage` with row presence and placeholder asserted before filling
(DIAG-4); no prose is copied.

**The landed pins, rewritten in place.**

- `tests/inline-empty-object-type.test.ts` — cell **e5** inverts:
  `schema S { f: {} | null }` now renders the inline `'{}'` line with the field
  retained, and its comment states the rule instead of the exclusion. The file's
  **three bounding comments** are rewritten: their stated reason — that the
  union-arm cells sit at the alias position because the schema-field spelling is
  unusable — has expired. Cells **a2** and **c1** gained schema-field twins
  **a2b** and **c1b**, so the rule is now asserted at the position it governs as
  well as at the alias position. Nothing else in the file moved.
- `tests/union-generic-arm-lowering.test.ts` — cell **i3** becomes the
  four-position parity assertion its own comment said it could not be:
  `schema S { a: {a: integer} | array<integer> }` loads clean and lowers the same
  hoisted `anyOf` that i1 pins at the alias and annotation positions. One hunk.

**One pin the report does not list.**
`tests/discriminator-field-classifier-brace-group.test.ts` (bug 0096's witness)
also moves, and §Fix's pin list omits it. That file's own comments hand the move
here — "That is the cell §Fix's witness item 4 rewrites, in whichever change
carries bug 0095's widened capture" and "That is bug 0095 element 1, unchanged
here" — as do this report's coordination note and 0096's fix record, which states
that item 3 "pins that cell's before-bytes … so its carrier has the disposition
it is moving". The edit is bounded to that: the ten brace-rooted-plus-`|` rows'
expected values (eight in item 3's first table, the two union rows of its second),
the two comments whose stated reason expired, one registry-sourced helper needed
to express the one row whose new disposition is the comma-missing recovery rather
than `empty-schema-body`, and the two constants the moved rows orphaned. Every
other row is byte-identical, no row was deleted or reordered, items 1 and 2 are
untouched, and every changed expected value is **stronger** than the one it
replaces — full field lists in place of the discard shape. Recorded as a scope
extension rather than a pre-authorised pin.

**0096's inherited witness item 4 is discharged, and carries the end-to-end live
witness with it.** Cell **6a** asserts that
`Cat { kind: {a: integer} | {b: string}, name: string }` under
`schema Animal by kind = Cat | Dog` loads with **no** diagnostics — no
`empty-schema-body`, and no false `theta/parse/nested-discriminator`, the wrong
line this widening would have produced before 0096 landed. Cell 6b is the
`kind: "a" | "b"` parity control and 6c bounds it, pinning that a single
enclosing group still reports nested. The live half is an additive H8a cell in
`tests/live/live-production-acceptance.test.ts` (the 0089 precedent):
registration-only, zero tokens, a same-workspace precondition control theta, and
the `theta-system-note` channel read off the settled in-memory `SessionManager`
rather than off events or on `prompt()` resolving. Proven in both directions — it
reds with the capture neutralised, naming the registration that did not happen,
and the precondition control registers in both states.

**Gates.** Witness 37/37; the four moved test files 166/166; **`npm test` 266
files / 3905 tests passed** (baseline 265 / 3866); `npx tsc -p tsconfig.json
--noEmit` clean; `npm run lint` clean. Witness run RED under a targeted
neutralisation restored byte-exact (blob
`edd2a5ee1b74c0eaa0b219b1ecaafed8d2b3025a`, verified): **24 red / 142 green**
across the four files — 1a–1i, 2a, 2b, 3a–3d, 3f, 3g, 6a, plus e5 / a2b / c1b, i3
and both discriminator item-3 tables; every control stayed green. Live, run for
real: H8a `live-production-acceptance` **17/17**, H9a `tests/live/acceptance/`
**11/11**, both green in one pass, no stochastic stall.
`tests/fixtures/h7a/permitted-codes.json` is unchanged at
`a4a8da04209f90e13d815edd92c1fc682e2a2236` — decided by the real H9a run, not by
assumption: both codes this fix redistributes were already registered, and both
are parse-phase codes that un-register the caller rather than reaching the
shipped-extension stderr surface the empty-capture gate polices. `git stash` was
never used at any point, by any worker.

**Residuals.** (i) `theta/parse/let-rhs-type-mismatch`'s disposition against an
object union is now **reached for the first time** rather than altered:
`let x: {} | null = 1` records its initialiser and the check declines to fire,
because the row is scoped to a statically resolvable right-hand-side type.
§Non-goals declines to settle whether that silence is right; pinned as measured,
surfaced not filed. (ii) The tolerant recoveries are untouched as §Non-goals
requires, and whether discarding an already-captured field list is the right
recovery for input that is genuinely mis-shaped remains unsettled — this fix
stops feeding that arm well-formed input, nothing more. (iii)
`fn f(): integer | { 1 }` and its mirror are the second GOV-15-class movers,
dispositioned above and pinned as 3f / 3g. (iv) An in-document `fn` call is not
arity-checked at the parse seam, at any arity — measured while dispositioning
GOV-15, independent of this fix, and the reason §Fix's argument-binding premise
does not bite. (v) Pre-existing position-only citation drift in
`tests/annotation-root-brace-union-lowering.test.ts`,
`tests/ctor-unresolved-schema-name.test.ts` and
`tests/import-export-from-clause-required.test.ts`: each cites a
`theta-document.ts` line that had already drifted by hundreds of lines before
this change, neither caused nor worsened here. (vi) The two untracked sibling
reports being written in this tree, 0128 and 0129, cite line ranges into
`tests/discriminator-field-classifier-brace-group.test.ts`, which this fix grew;
their authors will need to re-derive those anchors. 0128 explicitly anticipates
this fix landing first.

- **Discharge note (bug 0132, 0.95.0).** §Fix delegates this fix's blast-radius
  proof to `tests/committed-fixture-parse-gate.test.ts` over "every committed
  `.theta` / `.thetalib`", and the fix record above corrects that the gate's
  walk filtered `.theta` only, so the `.thetalib` half rested on the separate
  corpus oracle written for that run. That gap is closed: the gate's corpus is
  now `git ls-files '*.theta' '*.thetalib'` and both committed libraries are
  scored cells, so the corpus-wide claim is re-derivable by running the default
  suite rather than by re-writing an oracle. Status unchanged.

## Discharge note — bug 0128 (X.Y.Z)

The witness cell this report inherited from bug 0096 item 4 —
`tests/brace-rooted-union-arm-capture.test.ts`, the `by kind` union over
`kind: {a: integer} | {b: string}` — asserted a **clean load**. Bug 0128 §Fix
(d) reserved that cell for whichever report landed second; 0095 landed first, so
0128 rewrote it: the same input now draws
`theta/parse/non-literal-discriminator`, and the parity row `kind: "a" | "b"`
draws the same code. The relief this report shipped is unchanged — the
misattributed `theta/parse/empty-schema-body` is still removed and the field
list still survives capture; only what the exposed field then draws at the
discriminator checker moved. Status unchanged.
