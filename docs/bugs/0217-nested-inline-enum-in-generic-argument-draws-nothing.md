# Bug 0217 — An inline `enum[…]` written inside a generic argument draws no diagnostic at any position: `array<enum["a", "b"]>` loads clean at a `schema` field type, an alias arm and a `params:` field, lowers to `{}` and registers, where the bare `enum["a", "b"]` draws `theta/parse/inline-enum` at the two schema positions and `theta/load/params-type-not-expression` at `params:`, and where the comma-free `array<enum["a"]>` still draws `theta/parse/schema-type-not-expression` — so a top-level comma inside the bracket list decides whether input the spec refuses is refused

- **Status:** open. §Fix is constraint-pinned: the verdict is settled (a nested
  inline `enum[…]` is illegal input and must draw a diagnostic) and the
  mechanism is not — two routes are named below with the cost each pays, and one
  of them moves landed assertions bug 0204's fix wrote. Ordering: nothing blocks
  this report from starting and it blocks nothing.
- **Sev/Diff estimate:** S1/D3 — S1 because input the spec refuses in terms is
  accepted with no diagnostic and a declared constraint is not enforced:
  `schemas.md:93` states `enum` is "**top-level only** — there is no inline
  `enum["a", "b"]` form (`theta/parse/inline-enum`)", and measured at HEAD
  `array<enum["a", "b"]>` draws no type-level diagnostic at any of seven `Type`
  positions (the `let` fixture's only diagnostic is that position's own RHS gate
  answering the `= 1` initialiser), the theta registers (zero error-severity `theta/parse/` / `theta/load/` codes,
  frontmatter present), and the `params:` field lowers to `{}` — a fragment that
  validates every value. D3 because the remedy reaches the per-segment
  suppression bug 0204 landed in `lowerTypeExpr`'s generic arm
  (`classifyGenericArgumentSegments`, `src/parser/params.ts:963`), which every
  `Type` position shares; because the two candidate routes sit in different
  files owned by different rows (`checkInlineEnumForm`'s anchored match versus
  the sink recursion); and because one route must move ten landed assertions
  bug 0204's witness wrote to pin exactly this silence
  (`tests/generic-argument-shredded-group-refusal.test.ts:772–:796`, cells
  g3/g4 × three positions), which needs pre-authorization this report cannot
  grant itself.
- **Kind:** defect, three elements, each measured at HEAD `e5d760bd` (v0.139.0)
  through the real `parseThetaDocument` and the shipped seams directly.
  1. *The nested spelling draws nothing, at every position.*
     `array<enum["a", "b"]>` and `array<enum["a", "b", "c"]>` draw `[]` at a
     `schema` object-body field type, a `schema X = …` alias arm, a `params:`
     field, an `fn` parameter type, an `fn` return type and an `@<T>` query
     annotation, and at a `let` annotation draw that position's RHS-gate
     diagnostic alone (`theta/parse/let-rhs-type-mismatch`, the same one the
     legal `array<"a" | "b">` draws on the same fixture). The bare `enum["a", "b"]` draws
     `theta/parse/inline-enum` at the two schema positions and
     `theta/load/params-type-not-expression` at `params:` on the same fixtures.
     The nested spelling is illegal for the same reason the bare one is
     (`schemas.md:93`; `grammar.md:90–:102` lists six `Type` alternatives and
     none of them is a bracket form).
  2. *The reason is a dropped sink, and the discriminator is a comma.*
     `lowerTypeExpr`'s generic arm classifies its argument list per segment
     (`params.ts:714–:720`) and recurses every segment that is not whole in the
     source through `withoutUnspellableSink` (`:1036`), so no manufactured
     fragment can reach `isUnspellableTextRefusable` (`:1476`). Measured,
     `classifyGenericArgumentSegments('enum["a", "b"]')` is
     `[{text:'enum["a"',whole:false},{text:'"b"]',whole:false}]` — the angle-only
     split cuts the bracket group, both pieces are non-whole, both recurse
     sink-less, and the enclosing `array<…>` lowers `{}` with an empty sink. The
     comma-free `array<enum["a"]>` classifies as one WHOLE segment
     (`[{text:'enum["a"]',whole:true}]`), keeps the sink, is refusable, and still
     draws `theta/parse/schema-type-not-expression` at the two schema positions
     and `theta/load/params-type-not-expression` at `params:`. So whether a
     bracket list carrying two or more items is refused turns on a top-level
     comma the author wrote inside it.
  3. *No other check covers the nested spelling.* `checkInlineEnumForm`'s match
     is anchored (`/^\s*enum\s*\[/`, `src/parser/schema-declarations.ts:289`),
     so a nested `enum[…]` never reaches `theta/parse/inline-enum` — it is
     called on the whole arm (`theta-document.ts:6469`) and the whole field type
     (`:6947`), never on a generic argument. The token-level type parser draws
     nothing either: `array<enum["a", "b"], integer>` — two arguments to an
     arity-1 constructor — draws no type-level diagnostic at any of the seven
     positions, so not even `theta/parse/generic-arity-mismatch` fires for a
     source carrying the bracket form.
- **Affected** (every citation verified against the tree at HEAD `e5d760bd`,
  v0.139.0 — `package.json:3`; symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication):
  - **The dropped sink.** `src/parser/params.ts`: `lowerTypeExpr` (`:668`), its
    generic-application arm (`:699–:729`), the angle-only argument split
    (`:703`), `classifyGenericArgumentSegments` (`:963`) and the per-segment
    `ctxFor` dispatch (`:718–:719`), `withoutUnspellableSink` (`:1036`),
    `lowerGenericArgument` (`:924`), and the shared decline
    `isUnspellableTextRefusable` (`:1476`).
  - **The three sink-threading refusal sites the silence removes.**
    `src/parser/params.ts`: the `params:` refusable filter (`:254`) and the
    refusal with its two guards (`:266–:272`).
    `src/parser/theta-document.ts`: the alias-arm sink filter (`:6519`) and the
    field sink filter (`:6986`).
  - **The row that owns the spelling and cannot reach it.**
    `src/parser/schema-declarations.ts`: `checkInlineEnumForm` (`:282`) and its
    anchored match (`:289`); its two call sites,
    `src/parser/theta-document.ts:6469` (per alias arm) and `:6947` (per field).
  - **The registered rows.** `docs/spec_topics/diagnostics/code-registry-parse.md:102`
    (`theta/parse/inline-enum`, whose *Trigger* is "`enum["a", "b"]` or other
    inline-enum form" with no depth qualifier), `:93`
    (`theta/parse/schema-type-not-expression`, whose *Trigger* carries bug
    0204's per-segment exclusion);
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`theta/load/params-type-not-expression`, the same exclusion). Mirrors:
    `docs/reference/diagnostics.md:151` (Trigger-less),
    `docs/reference/schema-subset.md:80`.
  - **The spec the silence contradicts.** `docs/spec_topics/schemas.md:93`
    (`enum` is top-level only; there is no inline form; the code is named);
    `docs/spec_topics/grammar.md:90–:102` (the closed six-alternative `Type`
    set, which carries no bracket form), `:105` ("The grammar is otherwise
    identical in every position", and the sentence naming the four
    position-level refusal rows), `:109` (the recursive `Type` inside each
    inline-object field and generic argument).
  - **The landed assertions that pin the silence.**
    `tests/generic-argument-shredded-group-refusal.test.ts`: bug 0204's group
    (g) — the fences g1/g2 for the bare spelling (`:751–:752`) and cells g3/g4
    (`:774–:775`, asserted per position at `:780–:794`), which assert `[]` for
    `array<enum["a", "b"]>` and `array<enum["a", "b", "c"]>` at all three sink
    positions; the seam cells a11/a12 (`:430–:431`, the two bracket shards'
    refusability), a24 (`:459`, `array<enum["a", "b"]>` lowers `{}`), and the
    group (l) classification rows (`:1049–:1050`).
  - **The registration gate.** `src/extension/production-composition.ts`:
    `hasLoadParseError` (any error-severity `theta/load/` or `theta/parse/`
    code) and the three guards that read it beside
    `document.frontmatter === null`.
  - **The corpus.** No committed fixture reaches this class: of the 34 files
    `git ls-files '*.theta' '*.thetalib'` lists, 0 contain `enum[`. Reachable
    from clean source, unreached by the corpus, so nothing reds today.
- **Observed at:** v0.139.0 (`e5d760bd`, `package.json:3`), the fix commit for
  bug [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md).
  Offline, deterministic, provider-free, zero model turns: two scratch vitest
  probes (written, run, deleted; one case-insensitive `scratch` sweep afterwards)
  driving the REAL `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s
  `parseDoc` over seven position fixtures, plus the shipped seams directly
  (`splitTopLevel`, `classifyGenericArgumentSegments`, `lowerTypeExpr`,
  `isUnspellableTextRefusable`, `lowerQueryResponseSchema`). Every value in
  §Reproduction is that run's output verbatim. The tree is clean at HEAD.

## Summary

`schemas.md:93` states the rule without qualification: `enum` is "**top-level
only** — there is no inline `enum["a", "b"]` form (`theta/parse/inline-enum`)",
and `grammar.md:90–:102` closes `Type` over six alternatives, none of which is a
bracket form. The bare spelling is refused at the three positions that thread the
refusal sink:

```
schema S { f: enum["a", "b"] }
  → error theta/parse/inline-enum: inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a literal-union
schema X = enum["a", "b"]
  → error theta/parse/inline-enum: inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a literal-union
params: f: 'enum["a", "b"]'
  → error theta/load/params-type-not-expression: 'params:' field 'f' right-hand side is not a theta type expression
```

The same spelling inside a generic argument draws nothing at any position:

```
schema S { f: array<enum["a", "b"]> }        → []
schema X = array<enum["a", "b"]>             → []
params: f: 'array<enum["a", "b"]>'           → [], frontmatter present, properties.f = {}
let x: array<enum["a", "b"]> = 1             → theta/parse/let-rhs-type-mismatch only
fn f(p: array<enum["a", "b"]>): integer …    → []
fn f(): array<enum["a", "b"]> …              → []
let r = @<array<enum["a", "b"]>>`hi`         → []
```

Three checks that could speak do not. `checkInlineEnumForm`'s match is anchored
(`/^\s*enum\s*\[/`, `schema-declarations.ts:289`) and runs on the whole arm and
the whole field type, so a nested bracket form never reaches
`theta/parse/inline-enum`. The token-level type parser draws no
`generic-arity-mismatch` either, even for `array<enum["a", "b"], integer>`. And
`lowerTypeExpr`'s generic arm classifies its argument list per segment
(`params.ts:714–:720`): the angle-only split cuts `enum["a", "b"]` into
`enum["a"` and `"b"]`, both pieces are non-whole in the source, both recurse
through `withoutUnspellableSink` (`:1036`), and no entry reaches
`isUnspellableTextRefusable` — so the sink the three positions refuse from is
empty.

The discriminator is a top-level comma inside the bracket list, not the
enclosure. `array<enum["a"]>` — one item, no comma — classifies as ONE whole
segment, keeps the sink, and still refuses at all three sink positions.

## Reproduction

Zero model turns, no provider contacted. Fixtures, with `T` substituted (`Cat`
is prefixed as `schema Cat { a: string }` only on the rows whose text names it):

```
field     schema S {\n  f: T\n}\nlet x = 1\n
alias     schema X = T\nlet x = 1\n
params    ---\nmode: prompt\nparams:\n  f: 'T'\n---\nlet x = 1\n
let       let x: T = 1\n
fn param  fn f(p: T): integer { 1 }\nlet x = 1\n
fn return fn f(): T { 1 }\nlet x = 1\n
@<T>      let r = @<T>`hi`\n
```

### (a) Per spelling × position — every diagnostic, in emission order

`SCHEMA` is `error theta/parse/schema-type-not-expression`, `PARAMS` is
`error theta/load/params-type-not-expression`, `ENUM` is
`error theta/parse/inline-enum`, `ARITY` is
`error theta/parse/generic-arity-mismatch`, `RESERVED` is
`error theta/parse/reserved-keyword-as-identifier`, `RESULT` is
`error theta/parse/result-in-schema-position`, `UNRESOLVED` is
`error theta/parse/unresolved-named-type`, `LETMM` is
`error theta/parse/let-rhs-type-mismatch`, `ANNOT` is
`error theta/parse/annotation-type-not-expression`, `QANNOT` is
`error theta/parse/query-annotation-type-not-expression`.

| `T` | field | alias | `params:` | `let` | `fn` param | `fn` return | `@<T>` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `enum["a", "b"]` CONTROL, bare | ENUM | ENUM | PARAMS | `[]` | `[]` | `[]` | `[]` |
| `enum["a", "b", "c"]` CONTROL, bare | ENUM | ENUM | PARAMS | `[]` | `[]` | `[]` | `[]` |
| `enum['a', 'b', 'c']` CONTROL, bare | ENUM | ENUM | PARAMS | `[]` | `[]` | `[]` | `[]` |
| `array<enum["a", "b"]>` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<enum["a", "b", "c"]>` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<enum['a', 'b', 'c']>` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<array<enum["a", "b"]>>` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<{a: enum["a", "b"]}>` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<enum["a", "b"]> \| null` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<enum["a", "b"], integer>` **IN-CLASS** | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |
| `array<enum["a"]>` CONTROL, no comma | SCHEMA | SCHEMA | PARAMS | LETMM | `[]` | `[]` | `[]` |
| `array<enum["a", "b"], Cat +>` CONTROL, whole junk beside | SCHEMA | SCHEMA | PARAMS | LETMM | `[]` | `[]` | `[]` |
| `{a: enum["a", "b"]}` CONTROL, brace-rooted root | SCHEMA | SCHEMA | PARAMS | `[]` | `[]` | `[]` | `[]` |
| `array<match>` CONTROL | RESERVED | RESERVED | RESERVED | LETMM | `[]` | `[]` | RESERVED |
| `array<enum>` CONTROL | RESERVED | RESERVED | RESERVED | LETMM | `[]` | `[]` | RESERVED |
| `array<???>` CONTROL | ARITY | ARITY | ARITY | ARITY | ARITY | ARITY | ARITY |
| `array<1 +>` CONTROL | SCHEMA | SCHEMA | PARAMS | ANNOT | ANNOT | ANNOT | QANNOT |
| `array<Cat +>` CONTROL (0061 a21/a22) | SCHEMA | SCHEMA | PARAMS | ANNOT | ANNOT | ANNOT | QANNOT |
| `array<string +>` CONTROL | SCHEMA | SCHEMA | PARAMS | ANNOT | ANNOT | ANNOT | QANNOT |
| `Result<enum["a", "b"], QueryError>` CONTROL | ARITY, RESULT, UNRESOLVED | ARITY, RESULT, UNRESOLVED | ARITY, RESULT, UNRESOLVED | ARITY | ARITY | ARITY | `[]` |
| `array<"a" \| "b">` CONTROL, the legal spelling | `[]` | `[]` | `[]` | LETMM | `[]` | `[]` | `[]` |

`LETMM` at the `let` position is that position's own RHS gate answering the
`= 1` initialiser, not a type-text refusal; it is present on every row whose
annotation the `let` position admits, including the legal
`array<"a" | "b">`. The `let`, `fn` and `@<T>` positions never refused the bare
spelling either — bug 0124's bracket decline
(`type-layer-checks.ts`, `annotationSourceIsNotTypeExpression`) admits any
source carrying a `[` — so those four columns are pre-existing silence and not
this report's subject; the defect is the three sink positions, whose bare-versus-
nested rows differ.

Rendered verbatim, the CONTROL rows that still refuse:

```
error theta/parse/inline-enum: inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a literal-union
error theta/load/params-type-not-expression: 'params:' field 'f' right-hand side is not a theta type expression
error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
error theta/parse/schema-type-not-expression: 'X' declares a type that is not a theta type expression
```

### (b) The lowered bytes, and registration

`lowerTypeExpr(T, ctx)` over a `bodyTypeMap` with no declarations, with an
`unspellable` sink threaded:

| `T` | lowered | sink | refusable |
| --- | --- | --- | --- |
| `enum["a", "b"]` | `{}` | `['enum["a", "b"]']` | `['enum["a", "b"]']` |
| `array<enum["a", "b"]>` | `{}` | `[]` | `[]` |
| `array<enum["a", "b", "c"]>` | `{}` | `[]` | `[]` |
| `array<array<enum["a", "b"]>>` | `{"type":"array","items":{}}` | `[]` | `[]` |
| `array<{a: enum["a", "b"]}>` | `{}` | `[]` | `[]` |
| `array<enum["a", "b"]> \| null` | `{"anyOf":[{},{"type":"null"}]}` | `[]` | `[]` |
| `array<enum["a"]>` | `{"type":"array","items":{}}` | `['enum["a"]']` | `['enum["a"]']` |
| `array<enum["a", "b"], Cat +>` | `{}` | `["Cat +"]` | `["Cat +"]` |
| `array<"a" \| "b">` | `{"type":"array","items":{"type":"string","enum":["a","b"]}}` | `[]` | `[]` |

`lowerQueryResponseSchema(T, [], [])` returns the `lowered` column's fragment on
every row above. The bare brace-rooted `{a: enum["a", "b"]}`, which is not a row
here, lowers
`{"type":"object","properties":{"a":{}},"required":["a"],"additionalProperties":false}`
there against `{}` from `lowerTypeExpr`.

Registration, measured per fixture (the two properties the shipped drop gate
reads — error severity in the `theta/parse/` and `theta/load/` namespaces — plus
the frontmatter collapse):

| fixture | error `theta/parse/`+`theta/load/` codes | `frontmatter` | lowered `properties.f` |
| --- | --- | --- | --- |
| `params:`, `array<enum["a", "b"]>` | **0** | **present** | **`{}`** |
| `params:`, `array<enum["a", "b", "c"]>` | **0** | **present** | **`{}`** |
| `params:`, `array<array<enum["a", "b"]>>` | **0** | **present** | `{"type":"array","items":{}}` |
| `params:`, `array<enum["a", "b"], integer>` | **0** | **present** | **`{}`** |
| `params:`, `enum["a", "b"]` CONTROL | 1 (`params-type-not-expression`) | null — withheld | — |
| `params:`, `array<enum["a"]>` CONTROL | 1 (`params-type-not-expression`) | null — withheld | — |
| field / alias, `array<enum["a", "b"]>` | **0** | — (no frontmatter in the fixture) | — |
| field / alias, `array<enum["a"]>` CONTROL | 1 (`schema-type-not-expression`) | — | — |

### (c) The seam that decides it

`splitTopLevel(interior, ",")` (the `"angle"` default `lowerTypeExpr` uses) and
`classifyGenericArgumentSegments(interior)`:

| interior | `"angle"` split | classification |
| --- | --- | --- |
| `enum["a", "b"]` | `['enum["a"', '"b"]']` | `[{'enum["a"',whole:false},{'"b"]',whole:false}]` |
| `enum["a", "b", "c"]` | `['enum["a"', '"b"', '"c"]']` | all three `whole:false` |
| `enum["a"]` | `['enum["a"]']` | `[{'enum["a"]',whole:true}]` |
| `match` | `["match"]` | `[{"match",whole:true}]` |
| `???` | `["???"]` | `[{"???",whole:true}]` |
| `1 +` | `["1 +"]` | `[{"1 +",whole:true}]` |
| `Cat +` | `["Cat +"]` | `[{"Cat +",whole:true}]` |

`isUnspellableTextRefusable` per fragment: `enum["a"` → refusable, `"b"]` →
refusable, `"b"` → not (a `LiteralType` atom), `enum["a"]` → refusable,
`Cat +` → refusable. So both cut pieces of a two-item bracket list WOULD be
refused if they reached the predicate; the per-segment suppression is what stops
them, and the one-item list has nothing cut so nothing is suppressed.

## Expected behaviour

- **An inline `enum[…]` draws a diagnostic wherever it is written.**
  `schemas.md:93` states the rule with no depth qualifier ("`enum` is
  **top-level only** — there is no inline `enum["a", "b"]` form
  (`theta/parse/inline-enum`)"), and `grammar.md:90–:102` closes `Type` over six
  alternatives that carry no bracket form. `grammar.md:105` adds that the
  grammar "is otherwise identical in every position", so the disposition of
  `array<enum["a", "b"]>` at a `schema` field type, an alias arm and a `params:`
  field is a refusal, as the bare spelling's is today.
- **The item count is not a discriminator.** `array<enum["a"]>` and
  `array<enum["a", "b"]>` are the same illegal construct. Whether the bracket
  list carries a top-level comma decides only how the angle-only split cuts it,
  which is a lowering detail no registered row mentions.
- **The nesting depth is not a discriminator either.** `enum["a", "b"]`,
  `{a: enum["a", "b"]}`, `array<enum["a", "b"]>`,
  `array<array<enum["a", "b"]>>` and `array<{a: enum["a", "b"]}>` all carry the
  same illegal construct; the first two refuse at the three sink positions today
  and the last three do not.
- **An illegal type does not register a schema that asserts nothing.** A
  `params:` field whose right-hand side is `array<enum["a", "b"]>` currently
  lowers `{}` and the theta registers, so a value the author declared as an
  enumeration is validated against nothing. Refusing the input removes the
  fragment; no route makes that fragment stricter (`{}` for an admitted generic
  argument is bug
  [0164](./0164-generic-argument-literal-lowers-permissive.md)'s subject).
- **Bug 0204's repair stands.** Every derivable spelling it made load —
  `array<{a: string, b: integer, c: boolean}>` and its four- and five-field,
  nested, union-arm and brace-rooted variants at all three positions — keeps
  loading clean, and every lowered byte its §Fix froze stays byte-identical. A
  route here separates "a fragment the split manufactured out of a group the
  author wrote as one unit" from "a group the author wrote that no `Type`
  production derives"; it does not re-refuse the former.

## Actual behaviour / root cause

### 1. The refusal sink is dropped for every cut segment, and nothing replaces it

`lowerTypeExpr`'s generic arm (`params.ts:699–:729`) splits the argument
interior angle-only (`:703`), classifies the same cut points per segment
(`classifyGenericArgumentSegments`, `:963`, called at `:714`) and recurses each
non-whole segment through `withoutUnspellableSink` (`:718–:719`, `:1036`). A
segment is whole iff both delimiting comma boundaries sat at `{…}`/`[…]` depth 0
and its own groups balance. `enum["a", "b"]` carries a comma at bracket depth 1,
so both pieces — `enum["a"` and `"b"]` — are non-whole, both recurse sink-less,
and `lowerCtx.unspellable` stays empty. The three positions that refuse from
that sink (`params.ts:254`, `theta-document.ts:6519`, `:6986`) therefore see
nothing to refuse.

That is the intended behaviour of the suppression for a *derivable* group: the
pieces of `{a: string, b: integer, c: boolean}` are not text the author wrote,
so judging them is the defect bug 0204 fixed. What the suppression does not
carry is the case where the group it protects is itself illegal — `enum[…]` is
not a `Type` production, so no arm of the traversal will ever accept it, and
after suppression no arm refuses it either.

### 2. The comma is the discriminator

`array<enum["a"]>` has no top-level comma inside the bracket group, so the split
produces one segment and the classifier marks it whole. It keeps the caller's
context, reaches the catch-all whole, is refusable (no brace, not a literal
atom), and draws `theta/parse/schema-type-not-expression` at the two schema
positions and `theta/load/params-type-not-expression` at `params:` — measured.
The two-item spelling draws nothing. Neither registered row names an item count.

The same asymmetry holds beside a whole segment:
`array<enum["a", "b"], Cat +>` still refuses, once, because `Cat +` is a whole
segment of the same cut list. The refusal names the declaration, and the
`enum[…]` beside it is unmentioned.

### 3. `theta/parse/inline-enum` cannot reach the nested spelling

`checkInlineEnumForm` (`schema-declarations.ts:282`) tests
`/^\s*enum\s*\[/` (`:289`) against the source it is handed, and it is handed the
whole alias arm (`theta-document.ts:6469`) and the whole field type (`:6947`) —
never a generic argument. So the row that owns the spelling
(`code-registry-parse.md:102`, *Trigger* "`enum["a", "b"]` or other inline-enum
form") fires only at depth 0. Before bug 0204 the nested spelling drew two
`theta/parse/schema-type-not-expression` naming the enclosing declaration
instead (0204 §Reproduction (e)) — the wrong code and a count neither row
states, which is why 0204 §Fix (d) recorded the disposition as route-dependent
and its residual 1 named the loss. This report is that residual's filing.

### 4. The arity rule does not cover it either

`array<enum["a", "b"], integer>` applies an arity-1 constructor to two arguments
and draws no type-level diagnostic at any of the seven positions — no
`theta/parse/generic-arity-mismatch`. So no check anywhere in the front end
speaks about a source carrying a nested bracket form, at any position.

### 5. Ten landed assertions pin the silence

Bug 0204's witness group (g)
(`tests/generic-argument-shredded-group-refusal.test.ts:772–:796`) asserts `[]`
for `array<enum["a", "b"]>` and `array<enum["a", "b", "c"]>` at the field, alias
and `params:` positions — cells g3/g4 × three positions — with the reason stated
in the cell message ("the anchored match is not extended to depth"). Its fences
g1/g2 (`:751–:752`) assert the bare spelling's own disposition, and cell a24
(`:459`) pins `array<enum["a", "b"]>`'s lowered `{}`. Any route that makes the
nested spelling refuse moves g3/g4's expected values.

## Why it matters

- **Input the spec refuses in terms is accepted with no diagnostic.**
  `schemas.md:93` names the construct and its code. Measured, the nested
  spelling draws no type-level diagnostic at any of the seven `Type` positions,
  and the theta registers.
- **A declared constraint is not enforced.** A `params:` field declared
  `array<enum["a", "b"]>` lowers `properties.f = {}` and the frontmatter is
  present, so the field validates every value at the argument boundary — the
  author's enumeration constrains nothing and no diagnostic says so.
- **The discriminator is invisible and is not the construct.** One item refuses,
  two do not. Depth-0 refuses, inside a generic argument does not.
  `{a: enum["a", "b"]}` refuses, `array<{a: enum["a", "b"]}>` does not. Nothing
  in any message or registered row mentions item counts, enclosures or split
  segments, so an author who reaches a load that refuses cannot learn the rule
  from the diagnostic, and one who reaches a load that accepts learns nothing at
  all.
- **A registered row shrank without its own text moving.**
  `code-registry-parse.md:102`'s *Trigger* still reads "`enum["a", "b"]` or
  other inline-enum form", which at HEAD is true only at depth 0 and only for
  the two schema positions. The row's stated reach exceeds its input set.
- **Reachable from clean source, unreached by the corpus.** 0 of the 34
  committed `.theta` / `.thetalib` files contain `enum[`, so nothing reds today
  and only bug 0204's ten cells pin the behaviour — the same shape 0204's own
  class carried until it was measured.

## Fix

**Not settled.** Constraint-pinned: the verdict is decided — an inline `enum[…]`
inside a generic argument draws a diagnostic at the positions where the bare
spelling draws one — and the mechanism is not. Bug 0204's zero-lowered-bytes-
moved property is a constraint on every route.

### (a) What is not in question

The construct is illegal at every depth (`schemas.md:93`,
`grammar.md:90–:102`). No route re-refuses a fragment the split manufactured out
of a *derivable* group: bug 0204's §Expected and its cells b1–b7 and c-group
controls stand, and `array<{a: string, b: integer, c: boolean}>` and its variants
keep loading clean at all three positions. No route changes a severity, a
message, a placeholder set or a position's range, and the placeholder table
stays closed.

### (b) Two routes

1. **Extend `checkInlineEnumForm`'s reach to depth.** The anchored match
   (`schema-declarations.ts:289`) becomes reachable from inside a generic
   argument and an inline-object field type, so the nested spelling draws
   `theta/parse/inline-enum` — the row that owns it
   (`code-registry-parse.md:102`), the code the bare spelling draws, and the
   code 0204 §Fix (d) named as one of the two admissible dispositions. The route
   states where the walk consults it (the arm and field walks already call it;
   a generic argument is reached by neither) and how the `params:` position —
   which draws `theta/load/params-type-not-expression` for the bare spelling,
   not `inline-enum` — spells the same verdict without minting a second code for
   one construct. Costs: it edits a row's reach, so both refusing rows' and the
   `inline-enum` row's *Trigger* text move in the same commit; it must not fire
   twice for one construct where the bare spelling already draws it once
   (`enum["a", "b"]` at depth 0 keeps exactly one diagnostic, fences g1/g2); and
   it moves bug 0204's cells g3/g4 (six assertions), which needs
   pre-authorization.
2. **Thread a refusal for a recursed segment that no `Type` production can
   accept.** Keep the split and every lowered byte; distinguish a non-whole
   segment whose ENCLOSING group is derivable (suppress, as today) from one
   whose enclosing group derives from no `Type` alternative (refuse once, on the
   group the author wrote, not on a piece of it). Bug
   [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s sink
   idiom is the precedent: one shared decline
   (`isUnspellableTextRefusable`, `params.ts:1476`) asked by every position,
   with the emission left to each position's own row — under which the two
   schema positions and `params:` keep the codes they draw for the bare
   spelling's siblings. Costs: it needs a stated rule for "the group the author
   wrote", which is the unit `classifyGenericArgumentSegments` currently only
   partitions; the sink carries fragments, so pushing a GROUP is a contract
   question the four readers of the predicate share (`params.ts:254`,
   `theta-document.ts:6519`, `:6986`, `type-layer-checks.ts:984`) — the
   shared-type edit 0204 §Fix (b)(3) explicitly declined to pay; it also moves
   g3/g4, and it must leave the authorized under-refusal 0204 residual 2 records
   (`array<{a: Cat +, b: integer, c: boolean}>`, admitted, cells h1/l4) exactly
   where it is, since that group IS derivable.

### (c) Constraints every route carries

1. **Bug 0204's lowered bytes do not move.** Its §Fix froze every fragment in
   its §Reproduction (a), plus 0059 `d9`/`d13`, 0061 `e1`, 0039 `a8` and 0164
   `d6`/`d7`. Cell a24
   (`tests/generic-argument-shredded-group-refusal.test.ts:459`) pins
   `array<enum["a", "b"]>` → `{}`; a refusal does not need that fragment to
   change and no route here widens the split to `"angle-and-brace"` (0204 §Fix
   (b)(1), rejected there because it reds 0164's `d6`/`d7`).
2. **The landed TRUE refusals stay.** `array<enum["a"]>`,
   `array<enum["a", "b"], Cat +>`, `{a: enum["a", "b"]}`, `array<Cat +>`,
   `array<1 +>`, `array<string +>`, `{b: string +}`, `{b: {c: ???}}` and every
   0059 / 0061 refused row keep their code, count and range — measured at HEAD in
   §Reproduction (a). One refusal per construct: a route must not turn
   `array<enum["a"]>`'s single refusal into two.
3. **Bug 0204's derivable-input admissions stay green.** Its witness groups
   (b), (c), (h) and (l), the live H8a cell `CELL-B2`, and the three positions'
   clean loads for `array<{a: string, b: integer, c: boolean}>` and every
   variant.
4. **The pinned silence is moved deliberately, not discovered.** Cells g3/g4
   (`:774–:775`, six assertions across three positions) assert today's silence
   WITH its reason. A route restates that reason in the same commit rather than
   editing the expected value alone, and the reach change is mirrored into the
   `inline-enum` row and both refusing rows' *Trigger* text (DIAG-2).
5. **The four annotation-side positions are out of scope.** The `let`, `fn`
   parameter, `fn` return and `@<T>` positions admit the bare spelling too
   (bug 0124's bracket decline), so their silence is not this report's
   regression; a route that reaches them is narrowing 0124's decline, which
   0204 §Non-goals holds outside.

## Non-goals

- **What an admitted generic argument lowers to.** `{}` for
  `array<{a: string}>`-class arguments is bugs
  [0164](./0164-generic-argument-literal-lowers-permissive.md),
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  and [0184](./0184-union-arm-literal-lowers-empty-schema.md)' subject. This
  report asks for a diagnostic, not a stricter fragment.
- **Bug 0124's bracket decline.** `annotationSourceIsNotTypeExpression`'s
  admission of any source carrying a `[` keeps its width; the four positions it
  makes immune are not narrowed here.
- **The argument-count disagreement.** The angle-only split still counts three
  arguments where `parseGeneric` counts one (0204 residual 3). Untouched.
- **Junk the author wrote inside a derivable cut group.** 0204 residual 2's
  authorized under-refusal (`array<{a: Cat +, b: integer, c: boolean}>`,
  admitted) stays admitted.
- **The brace frame.** The empty-`ObjectType` rule, the `params:` inline-object
  hoist and the duplicate-field-key rule (bugs 0035 / 0045 / 0052) are not
  reached.

## Related

- [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
  **fixed (0.139.0)**, commit `e5d760bd`. The filing origin: its `## Fix
  (0.139.0)` *Residuals* item 1 names this class ("A nested inline `enum[…]` now
  draws NOTHING, at every position") and marks it a filing candidate, and its
  §Fix (d) flip table records the disposition as route-dependent
  ("`theta/parse/inline-enum`, or nothing — stated either way"). **It caused
  this.** Its per-segment suppression (`classifyGenericArgumentSegments` +
  `withoutUnspellableSink`) removed the only refusal the nested spelling drew,
  and its §Non-goals reserved the alternative to `theta/parse/inline-enum`'s own
  row — which is this report. Its cells g3/g4 pin the silence; its cells b1–b7,
  c-group, h1, l4 and a24 are locks (§Fix (c)(1), (c)(3)).
- [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
  **fixed (0.86.0)**. Owns the `params:` refusal (`params.ts:266–:272`) and the
  SHARED decline every position asks (`isUnspellableTextRefusable`, `:1476`).
  Its sink idiom — one predicate, per-position emission — is §Fix (b)(2)'s
  precedent. Its cells `d9`/`d13` are byte locks.
- [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) —
  **fixed (0.87.0)**. Owns the two schema positions' sink threading and both
  emitters (`theta-document.ts:6519` alias, `:6986` field), including the
  one-diagnostic-per-fragment count. Its landed TRUE refusals (`array<Cat +>`,
  `{b: string +}`, `{b: {c: ???}}`) are re-measured refusing at HEAD in
  §Reproduction (a) and are locks.
- [0164](./0164-generic-argument-literal-lowers-permissive.md) — **fixed
  (0.123.0)**. Owns `lowerTypeExpr`'s generic-argument recursion from the
  emission side (`lowerGenericArgument`, `params.ts:924`, and the literal
  sublanguage consult inside it). Its cells `d6`/`d7` pin two shredded-argument
  shapes as deliberate controls, which is why no route here widens the split.
  Coordination, not blocking: this report adds a diagnostic and moves no lowered
  byte it reads.
- [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **fixed
  (0.121.0)**. Its SHRED decline (`type-layer-checks.ts`,
  `annotationSourceIsNotTypeExpression`) is why the `let`, `fn` and `@<T>`
  positions never refused the bare spelling either, so their columns in
  §Reproduction (a) are pre-existing silence. Not narrowed here (§Fix (c)(5)).
- [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
  adjudicated do-not-chase class for positional drift. Bug 0204's fix grew
  `src/parser/params.ts` and `src/parser/type-layer-checks.ts`; every citation
  in this report is re-verified at HEAD `e5d760bd` and named by symbol beside
  its line number under that adjudication.

## Provenance

Bug 0204's `## Fix (0.139.0)` *Residuals* item 1 and its fix report
(`.pi/tmp/fixes/0204-report.md`, *Residuals / notes* item 1, marked "FILING
CANDIDATE for the parent") both name this class and both measure the flip: the
nested spelling drew two `theta/parse/schema-type-not-expression` at the schema
positions and one `theta/load/params-type-not-expression` at `params:` before
the fix, and `[]` after.

**Re-measured at HEAD `e5d760bd` for this filing, not copied.** The residual's
values reproduce, and the measurement adds three things the residual does not
state:

- **The discriminator is a top-level comma inside the bracket list, not the
  enclosure.** `array<enum["a"]>` still refuses at all three sink positions
  (§Reproduction (a)), because one item means nothing is cut and the classifier
  marks the single segment whole. The residual says "at every position" of the
  two- and three-item spellings and does not name the one-item boundary.
- **The silence is wider than the three sink positions the residual measures.**
  The nested spelling also draws nothing at the `let`, `fn` parameter, `fn`
  return and `@<T>` positions — but so does the bare spelling there, so that
  half is bug 0124's decline and pre-dates 0204 (§Fix (c)(5)).
- **The consequence at `params:` is registration with an assert-nothing
  fragment**, not only a lost diagnostic: zero gate codes, frontmatter present,
  `properties.f` = `{}` (§Reproduction (b)). The residual records the lost
  diagnostic and not the registered schema.

Also measured and not in the residual: `array<enum["a", "b"], integer>` draws no
`theta/parse/generic-arity-mismatch` at any position, and
`array<{a: enum["a", "b"]}>` and `array<array<enum["a", "b"]>>` are silent while
`{a: enum["a", "b"]}` refuses.
