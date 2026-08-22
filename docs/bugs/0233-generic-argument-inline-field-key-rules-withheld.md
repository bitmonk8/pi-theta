# Bug 0233 — the generic-argument carve-out registered on all four inline raw-key rows leaves every non-`Ident` inline-object field key inside a generic argument unjudged as a class: `array<{a b: integer}>`, `array<{ "q": string }>`, `array<{ q: string, q: integer }>`, `array<{ a as "w": integer }>`, `array<{ 3: string }>` and `array<{ éLan: string }>` all report `[]` and register at seven of the eight `Type` positions measured, and draw no key rule at the eighth, where the byte-identical bare interior draws `theta/parse/inline-field-name-not-identifier`, `theta/parse/quoted-inline-field-name`, `theta/parse/duplicate-inline-field-name` or `theta/parse/renamed-inline-field-name` — while the two rules at the same `walkType` arm that carry no carve-out (bug 0154's identifier pass, the empty-interior rule) DO fire there, so `array<{ Elan: string }>` and `array<{}>` are refused beside their silent neighbours

- **Status:** open.
- **Sev/Diff estimate:** S1/D3 — S1 because inputs the grammar derives from no
  `ObjectType` are accepted with no diagnostic and register, and four registered
  rows whose *Trigger*s state their reach as "any `Type` position and at any
  nesting depth" do not enforce it there: §Reproduction (b) measures `[]` at
  seven of eight positions including `params:` and the `.thetalib` spelling —
  the eighth draws that position's own RHS gate alone and no key rule — and
  §Reproduction (c) measures the same silence at every depth beneath a generic
  argument. No non-`Ident` key reaches the provider — the interior lowers to
  `items: {}` at every measured surface (§Reproduction (d)), so the wire-leak
  face of bugs 0227 and 0228 is absent here and the S1 ground is the unenforced
  constraint alone. D3 because the fix adjudicates a carve-out registered in
  four rows' *Trigger* prose (`code-registry-parse.md:98`, `:99`, `:100`,
  `:101`) with one spec sentence that carves out the duplicate rule only
  (`grammar.md:109`) and one mirror clause that counts three rules where the
  code withholds four (`docs/reference/grammar.md:251`), and because it moves
  pinned bytes: bug 0227's 62-cell witness pins these silences in cells h8/h9
  and its group (A) pins the identifier pass firing at the same position.
- **Kind:** defect — implementation and registered prose, one carve-out, three
  elements.
  1. **The carve-out is a class, not a spelling.** `walkType`'s `object` arm
     gates its whole raw-key loop on `!insideGenericArgument`
     (`src/parser/type-grammar.ts:1057`), and the generic arm sets that flag
     unconditionally for every argument subtree (`:986`). All four raw-key rows
     inside that block — `duplicate-inline-field-name` (`:1082`),
     `quoted-inline-field-name` (`:1100`), `renamed-inline-field-name` (`:1137`)
     and `inline-field-name-not-identifier` (`:1160`) — are therefore withheld
     for every key of every inline object reached through a generic argument.
     Measured, the silent set spans every key-rule family: a space-broken key,
     a quoted key, a repeated key, a rename clause, a numeric key and a
     non-ASCII key (§Reproduction (a)).
  2. **Two rules at the same arm are not withheld, so one interior gets two
     regimes.** The empty-interior rule (`:997`) and bug 0154's identifier pass
     (`:1021–:1037`) carry no generic gate by design, the pass's own comment
     stating why (`:1005–:1019`). So `array<{}>` draws
     `theta/parse/empty-schema-body` and `array<{ Elan: string }>` draws
     `theta/parse/binding-case-mismatch`, while `array<{ éLan: string }>`,
     `array<{ a b: integer }>` and `array<{ "q": string }>` draw nothing
     (§Reproduction (a), (e)). Which key spellings a generic argument admits is
     decided by which of the six rules at one arm happens to carry the flag.
  3. **The registered prose does not agree with itself.** The carve-out is
     stated in all four registry rows' *Trigger*s
     (`docs/spec_topics/diagnostics/code-registry-parse.md:98`, `:99`, `:100`,
     `:101`), each on the ground "the lowering never divides that interior into
     fields, so no property name is ever minted there for this row to name" —
     which §Reproduction (d) confirms as fact. The spec paragraph those rows
     anchor to states the exception for the duplicate rule alone ("a generic
     type argument's interior is outside that rule", `grammar.md:109`) and
     states the quoted and rename rows with no exception at all, and the
     reference mirror says "all three rules skip generic arguments"
     (`docs/reference/grammar.md:251`) where the code withholds four.
- **Related:**
  - [0227](./0227-non-ascii-inline-object-field-name-admitted.md) — **fixed
    (0.183.0)**, the origin. Its `## Fix (0.183.0)` *Residuals* item 1 records
    this class from the non-ASCII side: row i5
    (`schema S { a: array<{ Élan: string }> }`) is left silent, the disposition
    is ratified at that merge rather than closed, the class is stated as "NOT
    non-ASCII-specific", and cells h8/h9 of its witness pin the silence so a
    later refusal reds. This report is that forward filing, re-derived at HEAD
    across every key-rule family and every position.
  - [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md) —
    **fixed (0.179.0)**, which minted
    `theta/parse/inline-field-name-not-identifier` inside the existing
    `!insideGenericArgument && node.closingBraceSpelled` block "so it inherits
    the generic-argument carve-out and the closing-brace gate unchanged". That
    inheritance is the registered boundary this report measures; its row is
    `code-registry-parse.md:101`.
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) — **fixed
    (0.165.0)**, whose identifier pass is the one rule at this arm that does
    fire inside a generic argument, and whose group (A) cell `g1`
    (`array<{ Ys: string }>`) exists to pin that it is not withheld.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    **fixed (0.84.0)**, the origin of the carve-out and of the ground the other
    three rows inherited from it; its §Non-goals scopes the generic argument
    out.
  - [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) —
    **fixed (0.161.0)**, the second inheritor; its row's spec sentence
    (`grammar.md:109`) states no generic exception, which is element 3's
    sharpest case.
  - [0160](./0160-inline-object-wire-name-rename-unparsed.md) — **fixed
    (0.172.0)**, the third inheritor.
  - [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
    **fixed (0.139.0)** — and
    [0164](./0164-generic-argument-literal-lowers-permissive.md) own the
    lowering side of the same argument list, including the permissive `{}` an
    inline object in a generic argument lowers to. That permissiveness is this
    report's measured GROUND, not its subject.
  - [0217](./0217-nested-inline-enum-in-generic-argument-draws-nothing.md) —
    **fixed (0.148.0)**, the precedent for a refusal that a generic argument
    swallowed: the same position, a different construct, closed by pushing the
    author's own group at the lowering.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for the positional drift any fix here
    induces in `src/parser/type-grammar.ts` citations.
- **Affected** (every citation verified at HEAD `4c157bcc`, 0.183.0; cited by
  symbol, the line numbers being 0134's class):
  - **The gate and the flag** — `src/parser/type-grammar.ts`: `walkType`
    (`:930`) and its `insideGenericArgument` parameter (`:936`); the `generic`
    arm's argument descent, which passes `true` unconditionally (`:986`); the
    `object` arm (`:990`); the raw-key gate
    `!insideGenericArgument && node.closingBraceSpelled` (`:1057`); the field
    and union descents that propagate the incoming flag (`:1169`, `:1175`).
  - **The four withheld rows' emission sites** — `type-grammar.ts:1082`
    (`theta/parse/duplicate-inline-field-name`), `:1100`
    (`theta/parse/quoted-inline-field-name`), `:1137`
    (`theta/parse/renamed-inline-field-name`), `:1160`
    (`theta/parse/inline-field-name-not-identifier`), all inside that block,
    over the keys `inlineObjectFieldKeys` (`:776`) derives from
    `TypeNode.interiorSource`.
  - **The two rows that fire inside** — `type-grammar.ts:997`
    (`emptySchemaBodyDiagnostic`, imported from `./schema-declarations`) and
    `:1021–:1037`, bug 0154's identifier pass over `TypeNode.fieldNames` with
    the house predicate `first >= "A" && first <= "Z"`; the comment at
    `:1005–:1019` states why the pass is deliberately not withheld.
  - **The registered rows carrying the carve-out** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:98`, `:99`, `:100`,
    `:101`. Each *Trigger* states "the row is withheld for an object reached
    through a generic type argument, at every depth beneath it" with the
    lowering ground beside it, and each states its reach as "any `Type`
    position and any nesting depth reachable through inline object fields and
    union arms". `:19` is `theta/parse/binding-case-mismatch`, whose *Trigger*
    names a field-name position with no generic qualifier; `:97` is
    `theta/parse/empty-schema-body`. Mirrors: `docs/reference/diagnostics.md`.
  - **The spec sentences** — `docs/spec_topics/grammar.md:99–:100`
    (`GenericType ::= "array" "<" Type ">"` and the `Result` arity-2 form),
    `:101` (`ObjectType ::= "{" Field ("," Field)* ","? "}"`, `Field per Schema
    Declarations`), `:105` (a bare `Type` appears in "generic type arguments,
    union arms"), `:109` (§"Inline object types" — "`ObjectType` admits an
    anonymous object type … in any `Type` position", the duplicate rule's
    generic exception, the quoted and rename rules with none, and
    "`array<{ ... }>` parse[s]"); `docs/spec_topics/schemas.md:17` ("Field
    names are identifiers"); `docs/spec_topics/lexical.md:13` (`Ident` is
    `[A-Za-z_][A-Za-z0-9_]*`) and `:16` (the lowercase-first rule over schema
    field names); `docs/spec_topics/type-system.md:15` (one type grammar in
    every type-annotation position); `docs/spec_topics/schema-subset.md:9` and
    `:77` (`array<T>` lowers to `{ "type": "array", "items": <T-lowered> }`).
  - **The stale mirror clause** — `docs/reference/grammar.md:251`, "all three
    rules skip generic arguments", written before 0228 minted the fourth.
  - **The lowering that supplies the carve-out's ground** —
    `src/parser/params.ts`: `lowerTypeExpr`'s generic arm, its angle-only
    `splitTopLevel` over the argument interior, `classifyGenericArgumentSegments`
    (`:975`), `lowerGenericArgument` (`:935`) and the `array` arm's
    `items: lowerGenericArgument(...)` (`:722`); `isSingleEnclosingBraceGroup`
    (`:1401`), the predicate that keeps a non-root brace group from being read
    as a field list, and `hoistInlineObjectType`, which mints `$defs`
    properties at the `params:` root only.
  - **The wire surfaces the interior reaches as `{}`** —
    `src/runtime/query-schema-lowering.ts:153` (`lowerQueryResponseSchema`);
    `src/extension/production-theta-producer.ts:2672` (the typed-query
    lowering), `:3834` (`invoke<T>`'s return validator input), `:822`
    (`paramsSchema: params.loweredSchema` into the binder envelope).
  - **The witness locks** — `tests/inline-object-field-name-case.test.ts`
    (bug 0227's re-pinned witness, 43 `it` blocks / 62 cells, LEDGER at `:100`):
    cell `h8/h9` (`:1022`) asserts `array<{ éLan: string }>` and
    `array<{ *Lan: string }>` as WHOLE empty lists, its comment naming
    `type-grammar.ts:1057` and stating that a later refusal there "reds and
    must be recorded"; group (A)'s `g1` pins the identifier pass firing at the
    same position; group (J) pins the unclosed-interior silence.
    `tests/inline-object-duplicate-field-name.test.ts`,
    `tests/inline-object-quoted-field-name-refusal.test.ts`,
    `tests/inline-object-wire-name-rename-refusal.test.ts` and 0228's witness
    each carry generic-argument cells asserting today's silence.
    `tests/generic-argument-shredded-group-refusal.test.ts` is 0204's and
    0217's lowering-side witness at the same position.
    `tests/params-inline-object-lowering.test.ts` (37 cells) is 0035's
    `params:` byte freeze. `tests/committed-fixture-parse-gate.test.ts` is the
    corpus-wide zero-diagnostic gate.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files, and
    `git grep -nE '(array|Result)<[^>]*\{'` over them returns **zero** hits: no
    committed theta writes an inline object inside a generic argument at all,
    so no committed source moves under any route in §Fix.
- **Observed at:** `0.183.0` (HEAD `4c157bcc`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, frontmatter
  `---\nmode: subagent\n---` on lines 1–3 so the source under test sits on
  line 4; the `.thetalib` row passes `path = "lib.thetalib"` with no
  frontmatter. Diagnostic cells are the whole unfiltered `doc.diagnostics` in
  emission order rendered `<severity> <code>: <message>`; "registers" is the
  house definition (no error-severity `theta/parse/` or `theta/load/` code),
  so a `[]` cell registers by construction. `params:` lowerings are
  `doc.frontmatter.params.loweredSchema` verbatim; annotation-root lowerings
  are `lowerQueryResponseSchema(<annotation>, [], [])`, the same call
  `production-theta-producer.ts:2672` makes. Two scratch vitest files over
  those entry points, run on the outputs quoted below, then deleted.

## Summary

`walkType`'s `object` arm holds six inline-object rules. Four read the raw
pre-colon key and sit inside one block gated on `!insideGenericArgument`
(`type-grammar.ts:1057`); two — the empty-interior rule and bug 0154's
identifier pass over `TypeNode.fieldNames` — sit outside it. The `generic` arm
sets that flag for every argument subtree unconditionally (`:986`), so an
inline object reached through `array<…>` or `Result<…,…>`, at any depth beneath
it, is judged by two rules and not by four.

Measured at the same position, the withheld four cover every key spelling the
grammar refuses: `array<{a b: integer}>` (a space-broken key,
`inline-field-name-not-identifier`'s own registry example),
`array<{ "q": string }>` (quoted), `array<{ q: string, q: integer }>`
(repeated), `array<{ a as "w": integer }>` (a rename clause),
`array<{ 3: string }>` (numeric) and `array<{ éLan: string }>` (non-ASCII) each
report `[]` and register at seven of the eight `Type` positions measured and
draw no key rule at the eighth, where the byte-identical bare interior is
refused at every one of them. The two rules that do fire
produce the discriminator: `array<{ Elan: string }>` draws
`theta/parse/binding-case-mismatch` and `array<{}>` draws
`theta/parse/empty-schema-body` beside those silences, so a generic argument's
admitted key set is decided by which of six co-located rules carries the flag
rather than by the grammar.

The carve-out's registered ground holds as fact: the lowering never divides a
generic argument's interior into fields. `array<{ éLan: string }>` lowers to
`{"type":"array","items":{}}` at the annotation root and at `params:`, and
`Result<…>` lowers to `{}`, so no key of any spelling — conformant or not —
reaches the provider from that position, and the well-formed
`array<{ a: integer }>` lowers to the same `items: {}`. What the ground does
not establish is that the interior needs no judgement: `grammar.md:109` admits
`ObjectType` "in any `Type` position", states `array<{ ... }>` parses, and
states the generic exception for the duplicate rule alone; `docs/reference/
grammar.md:251` says "all three rules skip generic arguments", one row short
since 0228.

## Reproduction

Offline, deterministic, at HEAD `4c157bcc`. Whole unfiltered diagnostic lists
in emission order.

### (a) The six rules at one arm, inside a generic argument versus outside

Both columns at the same `schema` body field position, the interior written
bare (`schema S { a: <I> }`) and inside one generic argument
(`schema S { a: array<<I>> }`).

| # | interior | bare | inside `array<…>` |
|---|---|---|---|
| a1 | `{a b: integer}` | `error theta/parse/inline-field-name-not-identifier: field name 'a b' within one inline object type is not an identifier` | `[]` |
| a2 | `{ "a": integer }` | `error theta/parse/quoted-inline-field-name: quoted field name '"a"' within one inline object type; field names are identifiers` | `[]` |
| a3 | `{ a: integer, a: string }` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'a' within one inline object type` | `[]` |
| a4 | `{ a as "w": integer }` | `error theta/parse/renamed-inline-field-name: wire-name rename on field 'a' within one inline object type` | `[]` |
| a5 | `{ 3: string }` | `error theta/parse/inline-field-name-not-identifier: field name '3' …` | `[]` |
| a6 | `{ éLan: string }` | `error theta/parse/inline-field-name-not-identifier: field name 'éLan' …` | `[]` |
| a7 | `{ Élan: string }` | `error theta/parse/inline-field-name-not-identifier: field name 'Élan' …` | `[]` |
| a8 | `{ *Lan: string }` | `error theta/parse/inline-field-name-not-identifier: field name '*Lan' …` | `[]` |
| a9 | `{ Elan: string }` | `error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _` | same code, same message |
| a10 | `{}` | `error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.` | same code, same message |
| a11 | `{ a: integer }` | `[]` | `[]` |

Rows a9 and a10 are the attribution: the harness still reaches the arm inside a
generic argument, and two of its six rules answer there. Row a11 is the
no-move control.

### (b) The class at eight `Type` positions

Fixture `array<{a b: integer}>`; the `éLan`, `"q"`, repeated-key, rename and
numeric spellings of §(a) give the same cell at every row.

| # | position | diagnostics | registers |
|---|---|---|---|
| b1 | `fn f(p: array<{a b: integer}>): integer { 1 }` | `[]` | yes |
| b2 | `fn f(): array<{a b: integer}> { 1 }` | `[]` | yes |
| b3 | `schema S { a: array<{a b: integer}> }` | `[]` | yes |
| b4 | `schema T = array<{a b: integer}>` | `[]` | yes |
| b5 | `let r = @<array<{a b: integer}>>` + backtick body | `[]` | yes |
| b6 | b3 written in `lib.thetalib`, no frontmatter | `[]` | n/a |
| b7 | `params:` → `p: 'array<{a b: integer}>'` | `[]` | yes |
| b8 | `let x: array<{a b: integer}> = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected array<{a b: integer}>, got integer` | no |

Row b8's only diagnostic is that position's own RHS gate answering the `= 1`
initialiser — the same line the legal `array<{ a: integer }>` draws on the same
fixture (row a11's spelling). No key rule fires there either; the registration
denial is the RHS gate's, and the interior is rendered back to the author
verbatim inside that message.

### (c) Reach: every depth beneath a generic argument

| # | source | diagnostics |
|---|---|---|
| c1 | `schema S { a: array<{ p: { x y: string } }> }` | `[]` |
| c2 | `schema S { a: array<{ p: { "q": string } }> }` | `[]` |
| c3 | `schema S { a: { p: array<{ x y: string }> } }` | `[]` |
| c4 | `schema S { a: { p: array<{ q: string, q: integer }> } }` | `[]` |
| c5 | `schema S { a: array<array<{ x y: string }>> }` | `[]` |
| c6 | `schema S { a: array<{ "q": string } \| integer> }` | `[]` |
| c7 | `schema S { a: Result<string, { x y: string }> }` | `error theta/parse/result-in-schema-position: 'Result' has no lowered-schema form and is not permitted in a schema-feeding position` |
| c8 | `schema S { a: array<{ x y: string, p q: integer }> }` | `[]` |
| c9 | `schema S { a: array<{ p: { Bad: string } }> }` | `error theta/parse/binding-case-mismatch: …` |

c1 and c2 are the flag's inheritance downward (`:1169`); c3 and c4 are the
converse — an outer object outside the carve-out holding an inner one inside
it; c6 is a union arm inside a generic argument; c8 measures multiplicity: two
offending keys in one interior, zero diagnostics. c7's only line is the
`Result`-in-schema-position row, not a key rule. c9 is the depth-wise
counterpart of a9.

### (d) What lowers, and what reaches the provider

`lowerQueryResponseSchema(<annotation>, [], [])` — the call
`production-theta-producer.ts:2672` makes — and, for `params:`,
`doc.frontmatter.params.loweredSchema` verbatim.

| # | annotation | lowered |
|---|---|---|
| d1 | `array<{ éLan: string }>` | `{"type":"array","items":{}}` |
| d2 | `array<{a b: integer}>` | `{"type":"array","items":{}}` |
| d3 | `array<{ "a": integer }>` | `{"type":"array","items":{}}` |
| d4 | `array<{ 3: string }>` | `{"type":"array","items":{}}` |
| d5 | `array<{ a: integer }>` (well-formed control) | `{"type":"array","items":{}}` |
| d6 | `Result<{ éLan: string }, string>` | `{}` |
| d7 | `params:` → `p: 'array<{ éLan: string }>'` | `{"type":"object","properties":{"p":{"type":"array","items":{}}},"required":["p"],"additionalProperties":false}` |
| d8 | `params:` → `p: 'array<{ a: integer, a: string }>'` | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| d9 | `params:` → `p: '{ a: integer }'` (bare control) | `…"$defs":{"__inline_df817b794ef788ce":{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false}}` |

No key of any spelling reaches the wire from inside a generic argument: the
interior is not divided into fields, so the carve-out's registered ground is
true as stated. Row d5 shows the same erasure for a conformant interior, and
row d9 shows the field division the bare `params:` position does perform. Row
d8's `{}` is 0204's shredded-argument disposition, not this report's.

### (e) The bare spelling of every silent row, refused

Each interior of §(a) at the `fn` parameter, `schema` body field and `params:`
positions, written bare. All three agree per row: `{a b: integer}`,
`{ éLan: string }`, `{ Élan: string }`, `{ *Lan: string }` and `{ 3: string }`
draw `theta/parse/inline-field-name-not-identifier` naming the author's key;
`{ "a": integer }` draws `theta/parse/quoted-inline-field-name`;
`{ a: integer, a: string }` draws `theta/parse/duplicate-inline-field-name`;
`{ a as "w": integer }` draws `theta/parse/renamed-inline-field-name`;
`{ Elan: string }` draws `theta/parse/binding-case-mismatch`; and
`{ a: integer }` draws `[]`. Registration is denied for every refused row and
the `params:` lowering is absent (`loweredSchema` null).

### (f) Bounds

| # | source | observable |
|---|---|---|
| f1 | `schema S { a: array<{ a: integer }> }` | `[]` — a conformant interior is silent inside and outside the carve-out |
| f2 | `let x: Result<{a b: integer}, string> = 1` | `error theta/parse/generic-arity-mismatch: generic type 'Result' expects 2 type argument(s); got 1` — a space-broken key inside a `Result` argument miscounts the argument list. `Result<{ a as "w": integer }, string>` behaves alike; `Result<{ a: integer, b: string }, string>`, `Result<{ 3: string }, string>` and `Result<{ "a": integer }, string>` draw `[]`. Recorded as a measured neighbour, claimed in §Non-goals |
| f3 | `schema S { a: array<{ éLan: string }` (unclosed interior) | `[]` — the closing-brace gate withholds every rule at this arm, bug 0227 group (J)'s class |

### (g) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files;
`git grep -nE '(array|Result)<[^>]*\{'` over them → zero hits. No committed
theta writes an inline object inside a generic argument, so no committed source
moves and `tests/committed-fixture-parse-gate.test.ts` takes no new refusal
under any route.

## Expected behaviour

`grammar.md:109` admits `ObjectType` "in any `Type` position", states that its
fields "reuse the same `Field` form as an object-schema body and carry the same
field semantics", and states that `array<{ ... }>` parses. `:105` lists generic
type arguments and union arms among the positions a bare `Type` appears in.
`schemas.md:17` fixes a field name as an identifier and `lexical.md:13` gives
`Ident` as `[A-Za-z_][A-Za-z0-9_]*`. `type-system.md:15` states one type
grammar in every type-annotation position.

From that, one statement per element:

- **A key deriving from no `Field` is judged wherever the grammar admits the
  `ObjectType` that holds it, or the exemption is registered as law in the one
  place that governs both the rule and the position.** Rows a1–a8, b1–b8 and
  c1–c8 have one disposition each, and it is the same disposition their bare
  spellings have (§Reproduction (e)) or an explicitly stated exception. What is
  not admissible is the current state, where the exception is asserted in four
  *Trigger*s, contradicted for two of those rows by `grammar.md:109`, and
  miscounted by `docs/reference/grammar.md:251`.
- **One interior is judged by one regime.** Rows a9 and a10 fire where a1–a8
  are silent, so today a generic argument admits `{ éLan: string }` and refuses
  `{ Elan: string }`. Whichever way the carve-out is settled, the six rules at
  this arm agree about whether the position is judged.
- **The lowering ground is stated as what it is.** §Reproduction (d) confirms
  that no property name is minted inside a generic argument, for conformant and
  non-conformant interiors alike (rows d1–d6). That fact supports "no wire leak
  here"; it does not by itself establish "no judgement here", since
  `grammar.md:109` admits the construct as a `Type` and rows a9, a10 and c9
  already judge it.

Rows f1 and d5 do not move: a conformant interior keeps its silence and its
`items: {}` lowering. Row f3 keeps its silence, which the closing-brace gate
owns.

## Actual behaviour / root cause

**One flag, set for a whole subtree, gates four of six rules.** `walkType`
(`type-grammar.ts:930`) carries `insideGenericArgument` (`:936`). The `generic`
arm descends into every argument with the flag hard-set to `true` (`:986`),
with the comment stating that descending into ANY generic argument
re-establishes it regardless of the incoming value. The `object` arm (`:990`)
then runs, in order: the empty-interior rule (`:997`, ungated); bug 0154's
identifier pass over `TypeNode.fieldNames` (`:1021–:1037`, gated on
`node.closingBraceSpelled` alone); and the raw-key loop (`:1057`), gated on
`!insideGenericArgument && node.closingBraceSpelled`, holding all four raw-key
rows (`:1082`, `:1100`, `:1137`, `:1160`). Field and union descents propagate
the incoming flag unchanged (`:1169`, `:1175`), which is why the carve-out
reaches every depth beneath the argument (rows c1, c2, c5, c6) and why an inner
generic argument establishes it for an outer object that is itself outside one
(rows c3, c4).

**The split is deliberate at each site and unadjudicated as a whole.** The
identifier pass's comment (`:1005–:1019`) states its own exemption from the
carve-out and the reason: the raw-key rules withhold because the lowering never
divides a generic argument's interior into fields, "a fact about agreement with
the lowered artefact that an identifier rule does not depend on", so
`array<{ Ys: string }>` must still fire. The duplicate rule's comment
(`:1039–:1056`) states the same ground from the other side, naming
`params.ts`'s `lowerTypeExpr` and its angle-only split. 0228 then placed the
fourth row inside the same block "so it inherits the generic-argument carve-out
and the closing-brace gate unchanged". Each decision is recorded; the resulting
partition of six co-located rules into two regimes is recorded nowhere as a
disposition of the position.

**The ground is true, and narrower than the conclusion drawn from it.**
`lowerTypeExpr`'s generic arm splits its argument interior on angle depth only,
classifies each segment (`params.ts:975`) and lowers `array`'s single argument
through `lowerGenericArgument` (`:935`, `:722`). A brace group that is not a
root position is never read as a field list —
`isSingleEnclosingBraceGroup` (`:1401`) is what keeps a naive prefix/suffix
test from doing so, and `hoistInlineObjectType` mints `$defs` properties at the
`params:` root alone. So the interior lowers to `{}` and no key is minted
(rows d1–d6), exactly as the four *Trigger*s say. What the *Trigger*s draw from
it is that there is nothing "for this row to name" — a statement about the
lowered artefact, while the rows' own subject, per `code-registry-parse.md:101`,
is "the raw text before that entry's own top-level `:`", which exists in the
source at that position and is what rows a9 and c9 already judge there.

**The prose disagrees three ways.** `code-registry-parse.md:98`, `:99`, `:100`
and `:101` state the carve-out. `grammar.md:109` states it for the duplicate
rule only ("a generic type argument's interior is outside that rule") and
states the quoted and rename rows with no exception, while admitting
`ObjectType` in any `Type` position and stating that `array<{ ... }>` parses.
`docs/reference/grammar.md:251` states "all three rules skip generic
arguments", written before 0228 minted the fourth row into the same block.

## Why it matters

- **Six spellings the grammar derives from no `ObjectType` load and register
  wherever registration applies.** Rows a1–a8 and b1–b7; row b8 draws its
  position's own RHS gate and no key rule. Four registered rows whose *Trigger*
  reach is "any `Type` position and any nesting depth" do not reach a position
  `grammar.md:105` lists and `:109` admits.
- **One arm answers two ways about the same interior.**
  `array<{ Elan: string }>` is refused and `array<{ éLan: string }>` is
  admitted (rows a6, a9); `array<{}>` is refused and
  `array<{ a b: integer }>` is admitted (rows a1, a10). An author cannot derive
  either verdict from the rules as registered.
- **Moving an interior across the carve-out silently changes its verdict.**
  `schema S { a: { q: string, q: integer } }` is refused and
  `schema S { a: array<{ q: string, q: integer }> }` is not (rows a3, b3), where
  `grammar.md:109` gives the two the same `Field` form and `type-system.md:15`
  one grammar for both positions.
- **The declared fields are erased at the lowering, conformant or not.** Rows
  d1–d5: `array<{ a: integer }>` and `array<{a b: integer}>` both lower to
  `items: {}`, a fragment that validates every value. The erasure is 0204's and
  0164's registered class, and it is also what makes the silence invisible to
  the wire — the fix's benefit is the refusal, not a schema correction.
- **Two documents state the carve-out's scope differently and one miscounts
  it.** `grammar.md:109` versus the four *Trigger*s, and
  `docs/reference/grammar.md:251`'s "all three rules". Whichever way the
  disposition goes, prose changes; today the reader is told three different
  things.
- **The silences are load-bearing in a shipped witness.** Bug 0227's cells
  h8/h9 assert them as whole empty lists, so any refusal here reds a pinned
  cell and must be authorised rather than arriving unnoticed.
- **Closing it costs no committed source.** §Reproduction (g): zero committed
  theta files write an inline object inside a generic argument.

## Non-goals

- **The lowering's permissive `{}` for a generic argument's interior.** Rows
  d1–d6 measure it for conformant and non-conformant interiors alike; it is
  0204's and 0164's class (and 0039's constraint 1, "permissive is admissible,
  wrong is not"). This report claims the key-rule silence, not the erasure of
  the fields, and no route here divides a generic argument's interior into
  lowered properties.
- **`theta/parse/generic-arity-mismatch` miscounting a `Result` argument list
  whose first argument holds a space-broken key or a rename clause** (row f2:
  `Result<{a b: integer}, string>` reports one argument). Measured and recorded
  so the evidence is not lost; the shape draws a loud diagnostic rather than
  loading, is not a key rule, and its cause is the argument parse rather than
  this carve-out. Unclaimed here.
- **`theta/parse/result-in-schema-position`** (row c7) and the `let` RHS gate
  (row b8). Both are the positions' own rows answering their own questions; no
  route here changes either.
- **Bug 0154's identifier pass and the empty-interior rule as such.** Rows a9,
  a10 and c9 fire today and are this report's attribution controls. A route
  that settles the carve-out as law must state what happens to them, but their
  own triggers are not this report's subject.
- **The theta identifier alphabet.** ASCII, stated as law in bug 0227's
  `## Fix (0.183.0)`. Row a6 and a7's non-ASCII spellings are inside this
  report as members of the silent class, not as a request to widen `Ident`.
- **The unclosed-interior class** (row f3). Bug 0227 group (J) pins it silent
  for every rule at this arm; the closing-brace gate is not touched here.
- **The `params:` KEY position** (bug 0227 §Non-goals) and the `schema`
  declaration field-name surface. Neither is reached by any row above.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts` — bug 0134's adjudicated do-not-chase class.

## Fix

Not settled. The two routes below are constraint-pinned; the run selects one,
states it, and corrects the prose the choice falsifies. Both are anchored by
two settled facts: the theta identifier alphabet is ASCII (bug 0227's
`## Fix (0.183.0)`, "the alphabet decision, as law"), and 0228's registered
*Trigger* (`code-registry-parse.md:101`) states the boundary as "the row is
withheld for an object reached through a generic type argument, at every depth
beneath it, on the same ground as the three rows above (the lowering never
divides that interior into fields, so no property name is ever minted there for
this row to name)" — the sentence any widening must falsify explicitly.

**(a) Where the class is settled.**

- *Route 1 — widen the four raw-key rows into generic arguments.* Drop
  `!insideGenericArgument` from the raw-key gate (`type-grammar.ts:1057`),
  leaving the closing-brace gate, so all six rules at the arm answer alike at
  every depth. The four *Trigger*s' carve-out sentences are then false and are
  removed in the same change (DIAG-2, with the `docs/reference/diagnostics.md`
  mirrors), `grammar.md:109`'s duplicate-rule exception is removed, and
  `docs/reference/grammar.md:251`'s "all three rules skip generic arguments"
  goes with it. The cost is measured, not speculative: rows a1–a8, b1–b7,
  c1–c6 and c8 become refusals — a newly-refused set whose in-repo input set is
  empty (§Reproduction (g)) and which the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  disposes of — and bug 0227's cells h8/h9 red and must be re-pinned with this
  report named as the authority. The route must also state the precedence
  interaction at the newly-reached position: repeat first, quote-led second,
  rename third, non-identifier fourth (`code-registry-parse.md:101`), and bug
  0129's count-consequence law against the identifier pass that already fires
  there (row a9's spelling combined with a bad key, e.g.
  `array<{ Elan: string, a b: integer }>`, must be measured before it is
  claimed).
- *Route 2 — state the carve-out as law and make the prose say it once.* Keep
  the gate, and settle that a generic argument's interior carries no raw-key
  judgement: `grammar.md:109` gains the exception for all four rows rather than
  the duplicate alone, `docs/reference/grammar.md:251` is corrected to four
  rules, and the ground is restated as what §Reproduction (d) measures. This
  route must dispose of element 2 rather than inherit it: with four rows
  withheld and two firing, the position's admitted key set stays
  discontinuous — `array<{ Elan: string }>` refused, `array<{ éLan: string }>`
  admitted — so the route states either why the identifier pass and the
  empty-interior rule are correct to fire where the raw-key rows do not (the
  ground the pass's own comment at `:1005–:1019` already gives, promoted to
  registered prose) or that they withhold too, which is a change to
  `code-registry-parse.md:19` and `:97` and reds bug 0227 group (A)'s `g1` and
  row a10's cells.

**(b) Binding under either route.** The disposition is stated once, for all six
rules at the arm and for both spec surfaces (`grammar.md:109` and the four
registry *Trigger*s), with `docs/reference/grammar.md:251`'s count corrected in
the same change. A route that leaves the two documents disagreeing about which
rows the exception covers has not closed element 3.

**(c) Reach and multiplicity.** Whatever the disposition, it holds at every
`Type` position (rows b1–b8, including `params:` and the `.thetalib` spelling)
and at every depth beneath a generic argument, in both directions of nesting
(rows c1–c6). Under route 1, one diagnostic per offending key in source order,
which row c8 (`array<{ x y: string, p q: integer }>`, two offending keys) is
the multiplicity witness for.

**(d) Locks.** Fresh inline witnesses for every row of §Reproduction, as whole
ordered unfiltered `toEqual` lists with every *Message* through
`parseRegistry` / `registryMessage` (DIAG-4). The pinned bytes are:
`tests/inline-object-field-name-case.test.ts` (bug 0227's re-pinned witness, 43
`it` blocks / 62 cells) — cells h8/h9 pin rows a6 and a8's silences and its
comment names `type-grammar.ts:1057`, group (A)'s `g1` pins row a9, group (J)
pins row f3; `tests/inline-object-duplicate-field-name.test.ts`,
`tests/inline-object-quoted-field-name-refusal.test.ts` and
`tests/inline-object-wire-name-rename-refusal.test.ts` carry generic-argument
cells asserting today's silence; 0228's witness carries its own;
`tests/generic-argument-shredded-group-refusal.test.ts` is the lowering side;
`tests/params-inline-object-lowering.test.ts` (37 cells) and
`tests/committed-fixture-parse-gate.test.ts` must not move under either route
and are proven by hash. Rows d1–d9 are lowering tripwires: no route here mints
a property name inside a generic argument, so every cell of §Reproduction (d)
holds byte-for-byte after the fix.

**(e) Ordering.** No report blocks this one. It is bug 0227's
`## Fix (0.183.0)` *Residuals* item 1, ratified at that merge and filed forward
here; 0227 and 0228 are both fixed, so their rows and gates are inputs rather
than moving parts.

## Provenance

Filed as the ratified follow-up to bug
[0227](./0227-non-ascii-inline-object-field-name-admitted.md)'s
`## Fix (0.183.0)` *Residuals* item 1, which records `array<{ Élan: string }>`
(its row i5) as silent under 0228's registered carve-out, states the class as
"NOT non-ASCII-specific" with `array<{ a b: string }>`,
`array<{ "Élan": string }>` and `array<{ Élan: string, Élan: string }>`
measured silent beside it, and leaves the disposition to the parent to ratify
or file forward. This report is the forward filing, against the class rather
than the spelling.

Independently re-derived at HEAD `4c157bcc` (0.183.0), not copied from that
record: two scratch vitest files over `parseDoc` (`tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:153`) and
`doc.frontmatter.params.loweredSchema`, covering the eleven interiors of
§Reproduction (a) at eight positions, the nine reach rows of (c), the nine
lowering rows of (d), the bare-spelling controls of (e) and the three bounds of
(f); the corpus census over `git ls-files -- '*.theta' '*.thetalib'`. Both
scratch files were deleted; the tracked tree carries this document alone.

Two facts the 0227 record does not state, added by this measurement: the class
covers the repeated-key and rename families as well as the non-identifier one
(rows a3, a4), so all four raw-key rows are withheld, not one; and the
carve-out's registered ground is confirmed true at every measured lowering
surface (rows d1–d6, `items: {}` for conformant and non-conformant interiors
alike), which is what keeps this report's severity off the wire-leak footing
0227 and 0228 stood on.

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing. Four untracked scratch files belonging to sibling
sessions (`tests/scratch-0231-probe.test.ts`,
`tests/zz-scratch-0232-probe*.test.ts`) and one working-tree edit to
`docs/spec_topics/diagnostics/code-registry-parse.md` (a one-line deletion, not
this filing's) were present throughout; every registry citation above was read
from HEAD rather than from the working tree.
