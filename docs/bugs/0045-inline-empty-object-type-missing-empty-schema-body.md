# Bug 0045 — `grammar.md:109`'s empty-inline-object rule is unimplemented at every `Type` position: `{}` draws no `theta/parse/empty-schema-body` anywhere, so the same two bytes lower to a closed object at `@<T>` / `invoke<T>` (AJV then refuses every non-empty payload) and to the permissive `{}` at the schema-field, alias-RHS and `params:` positions (accepting every JSON value) — while the registry row's *Trigger* describes `schema` declarations only

- **Status:** fixed (0.57.0). One rule, one construction point: the type-grammar
  walk refuses an empty inline object at every `Type` position and every nesting
  depth, and the registry row's *Trigger* names the inline case. See §Fix
  (0.57.0) below.
- **Kind:** defect, two elements on one rule. (1) *A prescribed diagnostic is
  unimplemented at every position it governs.*
  `docs/spec_topics/grammar.md:109` states "An empty inline object `{}` is
  `theta/parse/empty-schema-body`, the same diagnostic an empty named schema
  body raises", and `ObjectType` is admitted "in any `Type` position". No
  position emits it. The type-grammar parser reads `{}` as an object node with
  zero field types (`src/parser/type-grammar.ts:307`) and the walk's `object`
  arm iterates that empty list and returns (`:373–378`); the three checks the
  walk owns (`void`, generic arity, `Result`) do not include this rule
  (`:11–22`, `:311–323`). Three of the eight positions run no type-grammar pass
  at all. (2) *The closed registry does not describe the prescribed trigger.*
  `theta/parse/empty-schema-body`'s row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:86`) reads "A `schema`
  declaration whose shape yields no usable content (neither fields nor alias
  arms): an empty object body (`schema X { }`), a body whose first token is not
  a plain `ident: Type` field list, or no shape at all." An empty inline object
  in a `let` annotation, a `fn` parameter or return type, a `@<T>` or
  `invoke<T>` annotation, a `params:` field type or a schema field type is not a
  `schema` declaration, and `schema X = {}` does carry an alias arm. Under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the registry is
  the closed authority for what the implementation emits, so at HEAD the two
  spec pages disagree with each other as well as with the implementation.
- **Related:**
  - [0033](./0033-body-level-schema-alias-unsupported.md) — origin. Its §Fix
    (0.45.0) residual (iv) (`:205–207`) records this gap, and its offline lock
    pins the equality it rests on: `tests/schema-alias-union-decl.test.ts`
    n10 (`:1801–1816`) asserts `schema X = {}` and `schema X { f: {} }` produce
    the same (empty) diagnostic list, with the cell's own comment stating that
    "the type-grammar parser implements no such rule … at every position it is
    called from". That pin's equality survives this fix; its expected list does
    not.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — its §Expected
    (`:247–249`) left the `params:` position's empty case out of scope
    deliberately: "`p: array<{}>` and an empty `p: {}` keep their current
    dispositions (`theta/parse/empty-schema-body` is the inline-object empty
    case per grammar.md `:109`)". Two landed cells hold that line —
    `tests/params-inline-object-lowering.test.ts` d1 (`:797–819`, whose comment
    requires that "an implementer who ALSO closes that case must update this row
    deliberately") and e6 (`:934–941`, `p: array<{}>` → `items: {}`) — and so
    does the in-tree comment at `src/parser/params.ts:444–447`.
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — open, same spec sentence, different mechanism: the inline-object *lowering*
    (a phantom-field fragment at the `@<T>` root, a permissive `{}` at the field
    and alias positions, and an unresolved-name walk that stops one level down).
    Its §Expected (`:270–274`) pins "an empty inline `{}` keeps its current
    permissive disposition; grammar.md `:109`'s `empty-schema-body` case stays
    unimplemented at every position". This report owns that case; the two fixes
    touch disjoint code (a parse-time check versus the lowerers).
  - [0041](./0041-params-block-mapping-rhs-silent-permissive.md) — open; its
    scope list (`:364–365`) defers the same case here: "`theta/parse/empty-schema-body`
    at the `params:` position (`p: {}`, and 0035's zero-field body arm) stays
    open and unchanged".
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) — open;
    the second diagnostic the `void` walk-reachability proxy in §Reproduction
    draws at the schema-field and alias positions is its subject, not this
    report's.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/type-grammar.ts:275–308` — `TypeParser.parseObject`. For an
    empty interior the field loop at `:278` never runs and the node returned at
    `:307` is `{ kind: "object", fieldTypes: [] }`. Reached from `parsePrimary`'s
    `{` dispatch (`:226`), so every brace-rooted type at every nesting depth
    lands here. The loop is deliberately tolerant — a field name that is not an
    `ident` is skipped (`:283–286`) and a missing `:` breaks the loop
    (`:287–290`) — so a *malformed but non-empty* interior also yields an empty
    `fieldTypes` (§Non-goals).
  - `src/parser/type-grammar.ts:373–378` — `walkType`'s `object` arm: it
    iterates `node.fieldTypes` and returns. Zero fields means zero iterations
    and no diagnostic. The seam header's check inventory (`:11–22`) and the
    walk's own doc comment (`:311–323`) enumerate three rules; the empty-object
    rule is in neither.
  - `src/parser/type-grammar.ts:67–81` — `parseTypeExpression`, the entry point
    the five wired positions call: `theta-document.ts:5650–5654` (`let`
    annotation, `value`), `:5724–5730` (`fn` parameter, `value`), `:5731–5738`
    (`fn` return, `return`), `:5804–5816` (schema body field type,
    `schema-feeding`), `:5405–5408` (alias/union arm, `schema-feeding`, added by
    0033's fix).
  - `src/parser/theta-document.ts:6072–6079` — the `@<T>` annotation root's
    per-type pass. It runs `collectUnresolvedNamedTypes` and nothing else; no
    `parseTypeExpression` call exists at this position.
  - `src/parser/params.ts:143–171` — `parseParams`'s per-field loop, the
    `params:` position's per-type pass. It lowers the field type and drains the
    unresolved-name sink (`:159–167`); no type-grammar pass runs.
    `lowerParamsFieldType`'s zero-field arm (`:478–480`) returns the permissive
    `{}`, and its doc comment (`:444–447`) records the empty case as open.
  - `src/parser/theta-document.ts:5996–6000` — `walkExpr`'s `invoke` arm: it
    walks the arguments only. The `<T>` return annotation captured at
    `:3962–3981` reaches no check pass.
  - `src/parser/schema-declarations.ts:73–81` — the sole construction point for
    `theta/parse/empty-schema-body`, inside `checkObjectSchema`'s zero-field arm,
    rendering `'${decl.name}' has no fields; an empty schema cannot be
    validated.` Two callers: the object-form declaration check
    (`theta-document.ts:5793`) and 0033's mis-shaped-head disposition
    (`:2339`, which passes a synthesised `fields: []` and the declaration name).
  - `src/runtime/query-schema-lowering.ts:109–114` — the annotation root's
    brace-rooted arm, which sends the interior to `lowerInlineObject`
    (`src/parser/body-type-lowering.ts:95–114`); with no entries the call
    reaches `lowerObjectFields` (`:70–92`) with an empty field list, which
    always emits `type`, `properties`, `required` and
    `additionalProperties: false` (`:82–87`). This is the closed fragment
    `@<{}>` and `invoke<{}>` mint.
  - `src/parser/body-type-lowering.ts:131` — `lowerTypeSource`, the shared
    recursive lowerer used by the schema-field and alias-RHS positions. It has
    no brace-rooted arm, so a `{}` field type falls to `lowerTypeExpr`'s
    trailing catch-all (`src/parser/params.ts:409–411`) and lowers `{}`. The
    mechanism is [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
    element 3; the empty case is one of its inputs.
  - `src/extension/production-theta-producer.ts:2312–2319` and `:3308–3317` —
    the two boundaries that consume the minted fragment: the typed-query
    response schema (QRY-22) and the `invoke<T>` return value (ceiling #4,
    `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:27`). For an object root
    the respond tool is registered with the fragment verbatim
    (`src/runtime/respond-tool-wire.ts:55–70`, `:91–94`).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:86` — the row whose
    *Trigger* was widened by 0033 to the declaration shapes and still names only
    declarations. Its *Message* carries one placeholder, `'<X>'`.
  - `tests/committed-fixture-parse-gate.test.ts:122` — the gate requiring zero
    diagnostics from every committed `.theta`. No committed `.theta` /
    `.thetalib` and no file under `docs/examples/` carries an empty inline
    object (`rg ':\s*\{\s*\}|<\{\s*\}>|=\s*\{\s*\}' --glob '*.theta' --glob
    '*.thetalib'` over the tree is empty), so the gate never witnesses the gap.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic; no live model,
  no provider. Scratch vitest driving `parseThetaDocument` (through
  `parseDoc`, `tests/helpers/e2e-s1.ts`), `parseTypeExpression`,
  `buildBodyTypeSchemas`, `lowerQueryResponseSchema` and a real AJV compile over
  the lowered fragments; deleted after the outputs below were recorded.

## Fix (0.57.0)

The settled §Fix, implemented against a tree eleven releases past the one it was
written at; two review rounds and one fixer round hardened the emission key and
the placeholder closure. Line anchors are at the fix commit.

**Baseline drift, re-derived before anything was pinned.** The report's
citations are at `f959f8de` (0.45.0) and its §Fix counts *three* positions that
run no type-grammar pass. Two of the three were wired in the interval:
[0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s fix
(0.54.0) added `parseTypeExpression` at the `params:` per-field loop
(`params.ts`, `schema-feeding`) and at the `@<T>` annotation root
(`theta-document.ts`, `value`), both with the FULL walk — the very widening
§Non-goals reserves as "a different subject", settled there rather than here. A
scratch probe at the fix baseline confirmed it: `@<void>`,
`@<array<string, integer>>`, `params:` `p: "void"` and `p: "array<string,
integer>"` each draw their registered row, while `invoke<Ghost>`,
`invoke<void>`, `invoke<array<string, integer>>` and `invoke<Result<…>>` draw
nothing. So §Fix's "three unwired positions gain one call each" reduces to ONE
new call site, and the other two inherit the rule from the walk with no edit —
adding a second call there would double-emit. Every other observable in
§Reproduction re-derived unchanged: all sixteen matrix rows, the `.thetalib`
spelling and all fifteen seam cells were `[]` at the baseline, and the four
declaration controls rendered byte-identically.
[0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
fix (0.49.0) had already moved the lowering anchors §Fix names, as this
report's own §Fix-ordering addendum anticipated.

**The construction point stays single.** `emptySchemaBodyDiagnostic(subject,
site)` is exported from `schema-declarations.ts`; `checkObjectSchema`'s
zero-field arm calls it with the declaration name, so `schema X { }`, the
headless `schema X` and 0033's mis-shaped heads render byte-identically. The
inline rule calls the same function with `{}`. Two call sites, one constructor.

**The rule.** `TypeParser.parseObject` records two facts about the brace group
the tolerant field loop cannot recover from `fieldTypes`: whether the interior
carried any token, read off the token immediately after `{`, and whether a
closing `}` was consumed. `walkType`'s `object` arm raises for a token-free
interior WITH a closing brace, and for no other shape. The first half is §Fix's
own key — `{ a }`, `{ "a": string }` and `{ a: }` arrive with an empty
`fieldTypes` through the recovery path and keep their silence (§Non-goals). The
second half was added in review: keyed on the interior alone, an unterminated
`{` also emits, and `ObjectType ::= "{" Field ("," Field)* ","? "}"`
(grammar.md) requires the closing brace, so `params:` `p: "{"`, `p: "array<{"`,
`invoke<{>` and `@<{>` would have drawn a row whose *Message* names a `{}` their
source does not contain — an emission outside the widened *Trigger*, which
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) closes.

**Seven positions in one edit, one new call site.** The walk already descends
generic arguments, inline-object field types and union arms, so the `let`
annotation, `fn` parameter, `fn` return, schema body field, alias/union arm,
`params:` field and `@<T>` annotation root are all covered by the walk edit
alone. `walkExpr`'s `invoke` arm gains the one new call, ahead of the argument
walk because the `<T>` annotation precedes the argument list in source. It
selects the rule alone: `parseTypeExpression` takes a `TypeCheckRules`
argument, `"all"` (the default, leaving the eight existing call sites
byte-unchanged) or `"inline-object-shape"`, which descends every construct but
withholds `generic-arity-mismatch`, `void-in-non-return-position` and
`result-in-schema-position` — the three §Non-goals keeps out of this fix at a
position that runs no other pass. The selector is named for the shape its
members govern, not for its single current member, so a further
inline-object-shape rule joins the same set and reuses the same call site.

**Registry — one *Trigger*-only widening; *Message* untouched.**
`code-registry-parse.md`'s row gains the inline case (an empty inline object
type in any `Type` position, at any nesting depth). One further same-commit spec
edit was needed and is not in the report:
`placeholder-rendering-b.md` §7 lists `<X>` under the *Identifier-shaped*
sub-rule, and `{}` is not identifier form, so the settled *Message* rendering
contradicted the closed placeholder surface
(`placeholder-rendering-a.md` §Closure). The bullet now carries an `<X>`
carve-out in the idiom of its neighbouring `<callee>` fall-through, scoped to
this row's inline trigger; the row's declaration triggers and every other `<X>`
row keep identifier form. No new placeholder, no category move, no *Message*
edit — `placeholder-rendering-a.md`'s closure clause (a) admits it, as it admits
`<callee>`'s own conditional. `docs/reference/diagnostics.md` carries no
*Trigger* column and `docs/reference/grammar.md` already states the rule
unqualified by position, so neither mirror moved.

**Multiplicity.** One diagnostic per occurrence, in source order, no dedup: two
sibling empties raise twice, one nested empty raises once. The compound
position is the exception, recorded rather than repaired: a `let` annotation
over a query initialiser (``let r: {} = @`hi` ``) propagates the annotation text
into the query's schema, so the annotation walk and the query walk each check
it and the list carries two lines. The mechanism is the propagation's, not this
rule's — ``let r: array<string, integer> = @`hi` `` doubles
`generic-arity-mismatch` identically with nothing in this fix touching it — and
repairing it would move three other checks at that position (§Non-goals).

**GOV-15.** Every newly-refused input carried no `E` diagnostic before, so all
sit inside the
[loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
set, and the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
disposes of the *Trigger* change. No committed `.theta` / `.thetalib` and no
file under `docs/examples/` carries the shape, so the shipped-fixture parse
gate never witnesses it and the code is unreachable from the H9a acceptance
suite — `tests/fixtures/h7a/permitted-codes.json` is therefore correctly left
unedited under its reachability rule.

**Offline lock.** `tests/inline-empty-object-type.test.ts` (44 cells): a
registry-sourced *Message* oracle (DIAG-4 — a *Message* drift reds group (0)
first and by name); one cell per row of §Reproduction's sixteen-row position
matrix, both `params:` spellings included; the `.thetalib` spelling; the
nested, generic-argument and union-arm depths, the union-arm cells written at
the alias position because the schema-field spelling hits the unrelated capture
defect §Non-goals names; a seam table over all three `TypePosition` values, so
position-independence is asserted rather than inspected; the declaration
controls byte-unchanged; the malformed-interior family and the unterminated
family both silent, at the seam and at four document positions, which is what
pins the two-part key; the multiplicity cells; the compound-position record with
its arity proxy as the pre-existence control; a document-level
lowering-unreachability pair beside a cell pinning both lowerer seams'
bytes unchanged as defence in depth; and the `invoke<T>` cells holding the
narrow rule selection — `invoke<void>`, `invoke<array<string, integer>>`,
`invoke<Result<…>>` and `invoke<Ghost>` stay silent while the three empty
spellings raise. Verified in three directions: removing the walk's push reds 30
of the 44 cells and no control; removing the `invoke<T>` call site reds exactly
the two `invoke<T>` cells; a live probe over the shipped extension's real
registration path reds with the walk neutralised and greens with it. Byte-exact
restores per blob hash, `git stash` unused throughout. Full gate 247 files /
3416 tests; typecheck and lint clean. Live: H8a 7/7 green, H9a acceptance 11/11
green (area (c) timed out once on a provider stall and passed in 10 s on the
isolated re-run; its fixture carries a non-empty inline object and no code path
of this fix).

**The landed pins moved deliberately.** `tests/schema-alias-union-decl.test.ts`
n10 keeps its equality claim and takes the one registry-sourced line, its
comment rewritten. `tests/params-inline-object-lowering.test.ts` d1 and e6
invert into refusal cells, exactly as d1's own comment demanded. One pin the
report could not name because it postdates it moved the same way:
`tests/union-generic-arm-lowering.test.ts`'s `array<{}>` control asserted the
permissive lowering at all four of its positions, and its `params:` column is
the same claim e6 makes; it is split into an unchanged three-position control
and a `params:` refusal cell, using that file's own idiom for the same split
under 0044. `tests/inline-object-nested-lowering.test.ts`'s G4/G5 keep their
assertions untouched — they drive the lowerer directly, below the parse seam —
and only their comment's claim about the rule being unimplemented was corrected,
as were the matching claims in `params.ts` and `query-schema-lowering.ts`.

**0052 coordination.** [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md)
§Fix's ordering clause says whichever of the two lands second reuses the first's
call sites rather than adding a second pass, and records the reuse. This landed
first. The sites 0052 reuses are: `walkType`'s `object` arm for the rule itself,
which reaches seven of the eight positions with no further wiring; the single
`invoke<T>` call in `walkExpr`; and the `"inline-object-shape"` selection, which
is a rule SET rather than a rule, so 0052's duplicate-name check joins it and
the `invoke<T>` call needs no edit. Its rule needs the field NAMES that
`parseObject` currently discards, which is a change to the node rather than to
any call site.

That reuse happened as prescribed: 0052's fix (0.84.0) added
`theta/parse/duplicate-inline-field-name` to `walkType`'s `object` arm as a
second member of the `"inline-object-shape"` set, retained the field names on
the object node, and added no call site — the `invoke<T>` call and the seven
walk-reached positions were unedited. The set's doc comment, which anticipated
exactly this widening, now describes two members.

**Residuals.** (i) The compound `let`-annotation-over-query position emits per
check-site rather than per occurrence, for this rule and for the three the walk
already owned — recorded in the offline lock, unfiled. (ii) `checkSchemaFeedingType`
(`schema-subset-gate.ts`) takes the default rule set and so now also refuses an
empty inline object; it has no production caller and its doc comment enumerates
no checks, pre-existing and unchanged here. (iii) The scope clauses in
[0035](./0035-params-rhs-inline-object-under-emission.md) (§Expected and §Fix
Frame 2), [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
(§Expected and §Fix "Unmoved") and
[0041](./0041-params-block-mapping-rhs-silent-permissive.md) (§Non-goals) state
in the present tense that this case stays open; all three reports are fixed, so
§Fix's "whichever … is still open" clause selects none of them and their records
were left as written. (iv) `schemas.md`'s rationale sentence still describes the
closed empty-object fragment as accepting every object, which real AJV refuses —
§Non-goals' documentation residual, unchanged.

## Summary

`grammar.md:109` gives the empty inline object one disposition in one sentence,
and the implementation has none. `{}` written as a type loads clean at all eight
`Type` positions the grammar admits it in, at every nesting depth, and in both
`.theta` and `.thetalib` files.

Two mechanisms make it silent, and the fix has to reach both:

1. **The type-grammar walk has no rule for it.** `parseObject` reads `{}` into an
   object node carrying zero field types; the walk's `object` arm iterates that
   list. Five positions run this walk — the `let` annotation, the `fn` parameter
   and return types, the schema body field type, and the alias/union arm — so at
   those five the input reaches the one pass that could reject it and is
   accepted.
2. **Three positions run no type-grammar pass at all.** The `@<T>` annotation
   root, the `params:` field type and the `invoke<T>` return annotation are
   checked only by the whole-file name walk (and `invoke<T>` not even by that),
   which is why `@<array<string, integer>>` also raises nothing while the
   identical text in a schema field raises `theta/parse/generic-arity-mismatch`.

Because the input is accepted, three different lowerings run on it, and they
disagree about what the author asked for:

- `@<{}>` and `invoke<{}>` mint
  `{"type":"object","properties":{},"required":[],"additionalProperties":false}`.
  Under AJV that fragment accepts `{}` and rejects every non-empty object, every
  array, every scalar and `null` (§Reproduction). The respond tool is registered
  with it verbatim, so the model is presented a reply schema no informative reply
  satisfies, and terminal non-conformance is
  `Err(QueryError { kind: "validation", cause: "schema_validation" })` per
  QRY-22.
- `schema S { f: {} }` and `schema X = {}` lower the permissive `{}` — the field
  (or the whole alias) accepts every JSON value.
- `params:` `p: {}` lowers `properties.p = {}` — the same total acceptance at the
  argument boundary.

So the same two bytes mean "only the empty object" at two positions and "anything
at all" at three others. The prescribed diagnostic exists to remove that
question; the registered code, its message and its single construction point are
already in the tree, and nothing calls them for this input.

## Reproduction

Offline, at `f959f8de`. Every fixture is a whole `.theta` source driven through
`parseDoc` (`tests/helpers/e2e-s1.ts`), the shipped load path with the standard
inert `parseDeps` double. `diags` is `doc.diagnostics` rendered
`<severity> <code>: <message>` in emission order.

### The position matrix

The frontmatter is `---\nmode: prompt\n---` throughout except where a `params:`
block is shown; each body ends with a tail expression so the theta is complete.

| # | Position | Fixture | `diags` |
|---|---|---|---|
| 1 | alias / union RHS | `schema X = {}` | `[]` |
| 2 | alias arm in a union | `schema X = {} \| null` | `[]` |
| 3 | schema body field type | `schema S { f: {} }` | `[]` |
| 4 | the same, whitespace interior | `schema S { f: {   } }` | `[]` |
| 5 | nested inline object | `schema S { f: { g: {} } }` | `[]` |
| 6 | generic argument | `schema S { f: array<{}> }` | `[]` |
| 7 | `let` annotation | `let x: {} = 1` | `[]` |
| 8 | `fn` parameter | `fn f(p: {}) { 1 }` | `[]` |
| 9 | `fn` return | `fn f(): {} { 1 }` | `[]` |
| 10 | `@<T>` annotation root | ``let r = @<{}>`hi`?`` | `[]` |
| 11 | the same, nested | ``let r = @<{a: {}}>`hi`?`` | `[]` |
| 12 | `invoke<T>` annotation | `let r = invoke<{}>("./x.theta")` | `[]` |
| 13 | `params:` field, quoted | `p: "{}"` | `[]` |
| 14 | `params:` field, flow mapping | `p: {}` | `[]` |
| 15 | `params:` field, nested | `p: "{a: {}}"` | `[]` |
| 16 | `params:` field, generic | `p: "array<{}>"` | `[]` |

The `.thetalib` spelling is silent too: `schema X = {}\nschema S { f: {} }\n` in
a `.thetalib` file yields `diags: []`.

Controls — the declaration positions, where the code does fire:

```
schema S { }   -> ["error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated."]
schema S       -> ["error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated."]
schema X = { a: string }  -> []
schema S { f: {} , g: string }  -> []   (fields f and g captured, f's type `{}`)
```

### The type-grammar seam directly

`parseTypeExpression(source, position, site)` over the five source shapes at all
three positions — fifteen cells, every one empty:

```
seam pos=value           src="{}"        -> []
seam pos=value           src="{   }"     -> []
seam pos=value           src="{ a: {} }" -> []
seam pos=value           src="array<{}>" -> []
seam pos=value           src="{} | null" -> []
seam pos=schema-feeding  (same five)     -> []
seam pos=return          (same five)     -> []
```

### Where the walk does and does not run

`void` is the proxy: `theta/parse/void-in-non-return-position` is a rule the walk
already owns, so its presence proves the walk reached the position and descended
into the inline object, and its absence proves no walk runs there. Same fixtures
with `{ a: void }` in place of `{}`:

```
schema field nested       -> ["theta/parse/void-in-non-return-position","theta/parse/unresolved-named-type"]
schema field generic-nested-> ["theta/parse/void-in-non-return-position"]     (array<{ a: void }>)
alias arm nested          -> ["theta/parse/void-in-non-return-position","theta/parse/unresolved-named-type"]
let annotation nested     -> ["theta/parse/void-in-non-return-position"]
fn param nested           -> ["theta/parse/void-in-non-return-position"]
fn return nested          -> ["theta/parse/void-in-non-return-position"]
annotation root nested    -> ["theta/parse/unresolved-named-type"]
params nested             -> ["theta/parse/unresolved-named-type"]
invoke nested             -> []
```

The second `unresolved-named-type` at the schema-field and alias positions is
the keyword-shaped-text emission
[0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) owns
(0033 §Fix residual (iii)), unrelated here. The arity proxy separates the two groups the same way:
`schema S { f: { a: array<string, integer> } }` raises
`theta/parse/generic-arity-mismatch`; `@<{a: array<string, integer>}>` raises
nothing.

The `invoke<T>` annotation runs no pass at all, not even the name walk:

```
invoke<Ghost>          -> []
invoke<{a: Ghost}>     -> []
invoke<array<Ghost>>   -> []
@<Ghost> (control)     -> ["theta/parse/unresolved-named-type"]
```

### The lowered bytes

```
lowerQueryResponseSchema("{}")      -> {"type":"object","properties":{},"required":[],"additionalProperties":false}
lowerQueryResponseSchema("{a: {}}") -> {"type":"object","properties":{"a":{}},"required":["a"],"additionalProperties":false}

buildBodyTypeSchemas over `schema X = {}` + `schema S { f: {} }`:
  X -> {}
  S -> {"type":"object","properties":{"f":{}},"required":["f"],"additionalProperties":false}

params `p: "{}"`      -> properties.p = {}                         field.type = "{}"
params `p: {}`        -> properties.p = {}                         field.type = "{}"
params `p: "array<{}>"` -> properties.p = {"type":"array","items":{}}
params `p: "{a: {}}"` -> properties.p = {"$ref":"#/$defs/__inline_0fd85a579a785048"},
                         $defs.__inline_0fd85a579a785048 = {"type":"object","properties":{"a":{}},"required":["a"],"additionalProperties":false}
```

Real AJV (`strict: false`) over the two fragments the positions disagree on:

```
@<{}> fragment: {} -> true   {"a":1} -> false   [] -> false   3 -> false   "s" -> false   null -> false
permissive {}:     {} -> true   {"a":1} -> true    [] -> true    3 -> true    "s" -> true    null -> true
```

### Two adjacent mis-parses, recorded as observed

A brace-rooted type in a *union arm* at the schema-field position destroys the
field list, and the resulting diagnostic is misattributed to the declaration —
which does declare a field:

```
schema S { f: {} | null }            -> ["error theta/parse/empty-schema-body: 'S' has no fields; ..."]   decl: no `fields`
schema S { f: { a: string } | null } -> same
schema S { f: null | {} }            -> same
schema S { a: string, f: {} | null } -> same
schema S { f: {} | {} }              -> same
schema S { f: string | null }        -> []   (fields captured; typeSource "string|null")
schema S { f: array<{}> | null }     -> []   (fields captured; typeSource "array<{}>|null")
```

The same shape in a `let` annotation splits into three unrelated diagnostics:

```
let x: {} | null = 1 -> ["error theta/parse/let-without-initialiser: let binding 'x' has no initialiser",
                         "error theta/parse/unsupported-feature: unsupported syntactic feature: stray '|' in statement position",
                         "error theta/parse/unsupported-feature: unsupported syntactic feature: stray '=' in statement position"]
```

Neither is about emptiness — the non-empty `{ a: string } | null` fails
identically — so both are a separate capture defect, unfiled, and out of scope
here (§Non-goals). The alias position captures the same shape correctly:
`schema X = {} | null` yields `arms: ["{}","null"]` and `schema X = null | {}`
yields `arms: ["null","{}"]`, both with `diags: []`.

## Expected behaviour (what the spec says)

- [Grammar Appendix — Type grammar](../spec_topics/grammar.md#type-grammar)
  §"Inline object types"
  (`:109`): "`ObjectType` admits an anonymous object type `{ field: T, ... }` in
  any `Type` position … An empty inline object `{}` is
  `theta/parse/empty-schema-body`, the same diagnostic an empty named schema body
  raises. The `Type` reference inside each field is recursive, so nested inline
  objects and `array<{ ... }>` parse." The rule is unqualified by position and
  unqualified by nesting depth. `:105` enumerates the positions a bare `Type`
  appears in: `let` annotations, `fn` parameter types, schema field types,
  `params:` field types, generic type arguments, union arms, and `invoke<Type>` /
  type-ascription contexts; the `fn` / theta return position takes `ReturnType`,
  which is `Type` plus `void`. `docs/spec_topics/type-system.md:15` repeats the
  invariance: the same type grammar applies in every type-annotation position —
  schema fields, frontmatter `params:`, `let x: T`, function parameters, and the
  explicit `@<T>` query schema — and 0033's fix added the alias/union RHS as a
  further such position. "Type-ascription context" names the `@<T>` annotation
  itself in the implementation's own vocabulary
  (`src/parser/query-schema-inference.ts:106`, "An explicit `@<Schema>`
  ascription"); theta 1.0 spells no separate ascription form, so §Reproduction's
  eight positions are the whole set. The user-facing reference carries the rule
  too (`docs/reference/grammar.md:168–170`).
- [Schemas — Object schema](../spec_topics/schemas.md#object-schema) (`:19`) is
  the sentence `grammar.md:109` defers to for the named case, and fixes the
  message: `theta/parse/empty-schema-body`, *`"'X' has no fields; an empty schema
  cannot be validated."`*
- [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm)
  step 2 (`:73`) hoists an inline object appearing in any type position into
  `$defs` under `__inline_<slug>`, and step 3 (`:76`, `:78`) gives the emission.
  An empty inline object is refused before this step, so no lowering of it is
  specified — neither the closed fragment nor the permissive `{}`.
- [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md)
  `:86` registers the code at severity `E`, phase `parse`, with the *Message*
  `'<X>' has no fields; an empty schema cannot be validated.` and no *Hint*. Its
  *Trigger* names `schema` declarations only; under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the trigger is
  the canonical condition and the registry is closed, so the row has to describe
  the inline case for the implementation to emit it there.
  [DIAG-4](../spec_topics/diagnostics/diagnostic-shape.md#diag-4) fixes the
  *Message* character-for-character with its placeholder interpolated.
- [QRY-22](../spec_topics/query/query-failure-and-repair.md#qry-22) (`:78`)
  requires a typed query's declared annotation — "a named `schema` declaration or
  an inline object/type annotation" — to be lowered, conveyed to the model and
  enforced against the reply. It presumes the annotation is a shape the author
  can satisfy; the empty inline object is the input the parse-time rule keeps out
  of it.

Expected concretely: an empty inline object type raises exactly one
`theta/parse/empty-schema-body` per occurrence, at error severity, in source
order, at every position of `grammar.md:105` and at every nesting depth
(`array<{}>`, `{ a: {} }`, a union arm, a `params:` field, the `@<T>` and
`invoke<T>` annotation roots), so the theta does not load and no lowering of the
shape is reached. The declaration positions' renderings do not change.

## Actual behaviour / root cause

**The rule has no site.** `parseObject` (`type-grammar.ts:275–308`) is
brace-aware and recursive, so it sees every empty interior at every depth: it
eats `{`, finds `}` immediately, and returns `{ kind: "object", fieldTypes: [] }`
(`:307`). `walkType`'s `object` arm (`:373–378`) is a `for` loop over
`fieldTypes` and nothing else, so an empty list is indistinguishable from a
walked one. Both facts are recorded in the module's own inventories — the seam
header lists three checks (`:11–22`) and the walk's doc comment lists the same
three (`:311–323`) — and the empty-object rule is in neither. Every position that
calls `parseTypeExpression` (`:67–81`) inherits the omission; the `void` proxy in
§Reproduction shows those five positions do reach the walk and do descend into
inline objects, so the walk is the whole reason they are silent.

**Three positions never reach the walk.** The `@<T>` annotation root's check pass
is `collectUnresolvedNamedTypes` alone (`theta-document.ts:6072–6079`); the
`params:` per-field pass lowers the type and drains the unresolved-name sink
alone (`params.ts:143–171`); `walkExpr`'s `invoke` arm walks arguments alone
(`theta-document.ts:5996–6000`), so the `<T>` text captured at `:3962–3981` is
never checked. This is why those three positions also miss
`generic-arity-mismatch`, `void-in-non-return-position` and
`result-in-schema-position` (§Reproduction). For this rule the consequence is
that adding it to the walk closes five positions and leaves three open.

**The acceptance then reaches three different lowerings.** The annotation root
dispatches a brace-rooted annotation to `lowerInlineObject`
(`query-schema-lowering.ts:109–114`), whose split yields no entries for an empty
interior, so `lowerObjectFields` (`body-type-lowering.ts:70–92`) emits its
unconditional `type` / `properties` / `required` / `additionalProperties: false`
skeleton over an empty field list. That is the closed fragment, and it is
enforced twice: as the typed-query response schema
(`production-theta-producer.ts:2312–2319`, QRY-22) and as the `invoke<T>`
return-value schema (`:3308–3317`, ceiling #4). Its root is an object, so
`rootIsArgumentObjectSatisfiable` (`respond-tool-wire.ts:55–70`) is true and the
respond tool is registered with it verbatim (`:91–94`) — the model is offered a
reply schema that admits no property. The schema-field and alias-RHS positions
take the opposite route: `lowerTypeSource` (`body-type-lowering.ts:131`) has no
brace-rooted arm, so the type falls to `lowerTypeExpr`'s catch-all
(`params.ts:409–411`) and lowers `{}` — total acceptance. The `params:` position
reaches its own zero-field arm (`params.ts:478–480`) and returns `{}` there, with
the comment above it (`:444–447`) naming this report's subject as the reason it
does not raise.

**The registered machinery is complete and uncalled for this input.** The code,
its severity, its message and its single construction point
(`schema-declarations.ts:73–81`) all exist; 0033's fix added a second caller for
the mis-shaped declaration heads (`theta-document.ts:2339`) by synthesising a
zero-field decl. The inline positions have no caller. The registry row's
*Trigger* is the matching gap on the spec side: widened by 0033 to cover the
declaration shapes, it never mentioned an inline object, so an implementation
that emits the code at a `let` annotation would emit outside the row as written.

## Why it matters

- A rule stated once in the grammar and repeated in the user-facing reference has
  no implementation at any of the eight positions it governs. An author who
  writes `{}` — while stubbing a shape, or after deleting the last field of an
  inline object — gets no diagnostic and a schema that validates the wrong thing.
- The two enforcing positions fail at runtime instead of at load. `@<{}>` and
  `invoke<{}>` mint a fragment that rejects every non-empty payload
  (§Reproduction's AJV table), so the query burns its repair rounds and terminates
  in `Err(QueryError { kind: "validation", cause: "schema_validation" })`, and the
  `invoke<{}>` parent gets
  `Err(InvokeInfraError { cause: "return_validation", … })`. Nothing in either
  failure names the empty annotation.
- The three permissive positions fail silently and in the opposite direction: a
  `params:` field or a schema field typed `{}` validates nothing at all, so the
  argument boundary and the response boundary both accept any JSON value. The two
  dispositions are contradictory readings of one source text, and the prescribed
  diagnostic is what removes the choice.
- The registry is the closed authority for what the runtime emits (DIAG-2), and
  at HEAD it contradicts `grammar.md:109`. A reader reconciling the two pages
  cannot tell which is normative for the inline position.
- Three landed pins and one in-tree comment assert the current silence
  (`tests/schema-alias-union-decl.test.ts:1801–1816`,
  `tests/params-inline-object-lowering.test.ts:797–819` and `:934–941`,
  `src/parser/params.ts:444–447`), and four reports record it as deliberately out
  of their scope (0033 residual (iv) and 0035 §Expected `:247–249`, both fixed;
  0039 §Expected `:270–274` and 0041 `:364–365`, both open). The gap is recorded
  in eight places and owned in none.

## Fix

One rule, one construction point, eight positions.

**The construction point stays single.** Extract the diagnostic from
`checkObjectSchema`'s zero-field arm (`schema-declarations.ts:73–81`) into an
exported `emptySchemaBodyDiagnostic(subject, site)` in the same module.
`checkObjectSchema` calls it with the declaration name, so `schema X { }`, the
headless `schema X` and 0033's mis-shaped heads (`theta-document.ts:2339`) render
byte-identically to today. The inline rule calls the same function.

**The rule.** `TypeParser.parseObject` (`type-grammar.ts:275–308`) records
whether the brace interior carried any token, and `walkType`'s `object` arm
(`:373–378`) raises for an interior that carried none. The check keys on the
interior, not on `fieldTypes.length === 0`: `parseObject`'s tolerant recovery
skips a non-`ident` field name (`:283–286`) and breaks on a missing `:`
(`:287–290`), so `{ a }`, `{ "a": string }` and `{ a: }` also arrive with an
empty `fieldTypes` and must keep their present silence (§Non-goals).
`grammar.md:109` names the empty case and no other.

**The five wired positions need no new call site.** The walk already descends
generic arguments (`:368–370`), inline-object field types (`:374–376`) and union
arms (`:380–382`), so `{}`, `array<{}>`, `{ a: {} }` and a `{}` union arm are all
covered at the `let` annotation, `fn` parameter, `fn` return, schema body field
and alias/union arm positions in one edit. §Reproduction's `void` proxy is the
evidence that each of those five reaches the walk at each depth.

**The three unwired positions gain one call each.** `parseTypeExpression` takes
an explicit rule selection, and the `@<T>` annotation root
(`theta-document.ts:6072–6079`), the `params:` per-field loop
(`params.ts:143–171`) and the `invoke<T>` arm (`theta-document.ts:5996–6000`)
call it with this rule alone. They do not inherit the walk's other three checks:
none of the three runs any type-grammar pass today, so wiring the full walk there
would move `generic-arity-mismatch`, `void-in-non-return-position` and
`result-in-schema-position` at three positions at once — a different subject
(§Non-goals). The `params:` call runs over the field's declared type source
rather than inside `lowerParamsFieldType`, so `p: "array<{}>"` and `p: "{a: {}}"`
are refused exactly as their schema-field spellings are, and any surface text a
later `params:` recovery fix (0041) admits is checked by the same call. The
lowerers' zero-field arms (`params.ts:478–480`,
`body-type-lowering.ts:70–92` via `:95–114`) stay as unreachable defence in
depth, with `params.ts:444–447`'s comment updated to point here.

**Message.** `<X>` interpolates as `{}` at the inline positions:
`'{}' has no fields; an empty schema cannot be validated.` No reword — DIAG-4
defers wording changes to theta 2.0 — and an anonymous type carries no name to
interpolate; the author's own two bytes are the subject, and the diagnostic's
range locates the occurrence (at the schema-field position that range is the
declaration's, for the reason `theta-document.ts:5817–5822` records:
`SchemaFieldSource` carries no range of its own). `schema X = {}` is an inline
object in a `Type` position and renders `'{}'`, not `'X'`; the declaration
positions keep `'X'`.

**Multiplicity.** One diagnostic per empty inline object occurrence, in source
order. `schema S { f: {}, g: {} }` parses to two fields with `typeSource: "{}"`
each and raises twice; `schema S { f: { g: {} } }` parses to one field with
`typeSource: "{g:{}}"` and raises once, for the inner object. No dedup rule.

**Registry — one *Trigger*-only widening, same commit; *Message* untouched.** The
row (`code-registry-parse.md:86`) gains the inline-object case: an empty inline
object type (`{}`) in any `Type` position, at any nesting depth. Its current text
covers none of these inputs — the subject is "A `schema` declaration", and
`schema X = {}` carries an alias arm, so it is not "no usable content" under the
row's own parenthetical either. No new code and no *Message* edit — the row that
carries the case is the one that already exists. This edit also repairs the
spec-internal disagreement element (2) names.

**GOV-15.** Every newly-refused input loads with no `E`-severity diagnostic
today, so all are inside GOV-15's
[loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
input set (`:9`), and the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
(`:25`) disposes of a *Trigger* change "in-scope as an addition for inputs newly
brought into the code's emission set". No committed fixture carries the shape, so
`tests/committed-fixture-parse-gate.test.ts:122` stays green.

**The landed pins move deliberately, in the same commit.**

- `tests/schema-alias-union-decl.test.ts` n10 (`:1801–1816`) — its equality
  claim (`schema X = {}` and `schema X { f: {} }` agree) is preserved and its
  expected list changes from `[]` to the one registry-sourced line. The cell's
  comment, which states that the type grammar implements no such rule, is
  rewritten to record that it now does.
- `tests/params-inline-object-lowering.test.ts` d1 (`:797–819`) — the fixture no
  longer loads, so its `loadCleanly` premise and its `properties.p = {}` /
  `field.type = "{}"` assertions invert into a refusal cell, exactly as the
  cell's own comment requires ("must update this row deliberately, in lock-step
  with a spec decision, not silently"). e6 (`:934–941`, `p: array<{}>`) inverts
  for the same reason.
- 0035 §Expected (`:247–249`), 0039 §Expected (`:270–274`) and 0041 (`:364–365`)
  each record this case as out of their scope; whichever of those reports is
  still open when this lands has its record updated to point here. 0033 §Fix
  residual (iv) (`:205–207`) is marked filed as this report.

**Fix ordering.** 0045 blocks on nothing and blocks nothing. It is independent of
[0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
in mechanism — a parse-time check versus the lowerers — and independent of
[0041](./0041-params-block-mapping-rhs-silent-permissive.md) and
[0043](./0043-union-nonprimitive-arm-lowers-permissive.md), which move lowered
bytes this fix makes unreachable for the empty case only. Whichever of 0045 and
0039 lands second updates the other's record of the empty case; 0039's fix must
not reintroduce a lowering path for an input this fix refuses.

0039 landed first, in 0.49.0. Its fix left the empty case untouched at every
position, as required: the shared hoisting arm returns the permissive `{}` for
a zero-field body, so `@<{}>` still lowers the closed object, and `{}` at the
`schema`-body, alias-RHS, `params:` and nested-field positions still lowers the
permissive `{}` — pinned as unchanged controls in
`tests/inline-object-nested-lowering.test.ts`. The one shift 0045 inherits is
the origin of that permissive `{}` below the query-lowering seam: the
zero-field return of `hoistInlineObjectType` (`src/parser/params.ts`) now
reaches a field's type position where `lowerTypeExpr`'s trailing catch-all used
to, so this report's position matrix reads against that arm rather than the
catch-all.

**Test witness — unit, offline, no live provider.** Every fixture in
§Reproduction is a `parseThetaDocument` call; the red/green contrast is the
diagnostic list, and the message is sourced from the registry row (DIAG-4).
Required beyond the probes: one cell per row of the position matrix asserting
exactly one registry-sourced line, including both `params:` spellings, both
`.theta` and `.thetalib`, and the nested / generic / union-arm depths; the
declaration controls (`schema S { }`, headless `schema S`, 0033's mis-shaped
heads) byte-unchanged with `'S'` / `'X'`; the malformed-interior family
(`{ a }`, `{ "a": string }`, `{ a: }`) asserted still silent, which is what pins
the interior-token key rather than `fieldTypes.length === 0`; a multiplicity cell
for two sibling empties and for one nested empty; and a lowering-unreachability
cell showing the refused fixtures never reach `lowerQueryResponseSchema` /
`lowerParamsFieldType`. The seam-level cells over `parseTypeExpression` cover all
three `TypePosition` values so the rule is position-independent by assertion, not
by inspection.

## Non-goals

- **Malformed but non-empty interiors.** `{ a }`, `{ "a": string }` and `{ a: }`
  drop their field through `parseObject`'s tolerant recovery and stay silent at
  the inline positions. `grammar.md:109` assigns a diagnostic to the empty case
  only; the declaration-position counterpart (a brace body whose first token is
  not a plain `ident: Type` field list) is 0033's disposition and applies to
  declarations. Widening the inline rule to these shapes needs its own spec
  decision.
- **The brace-rooted union-arm capture defect.** `schema S { f: {} | null }`
  loses the whole field list and misattributes `empty-schema-body` to the
  declaration; `let x: {} | null = 1` splits into three unrelated diagnostics
  (§Reproduction). Non-empty inline objects fail identically, so this is a
  capture defect, not an emptiness one. Unfiled, unchanged here. It does bound
  the test witness: the `{}`-in-a-union-arm cells are written at the alias
  position, which captures the arm correctly.
- **The absent type-grammar pass at the `@<T>`, `params:` and `invoke<T>`
  positions.** `generic-arity-mismatch`, `void-in-non-return-position` and
  `result-in-schema-position` do not fire there (§Reproduction) and this fix does
  not make them fire. Unfiled; it is the reason the three new call sites select
  one rule.
- **The permissive `{}` and phantom-field lowerings themselves.** This fix
  refuses the input rather than changing any lowering;
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  and [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) own the
  lowering seams for the non-empty shapes.
- **The rationale sentence at `schemas.md:19`.** It states that the lowered
  `{type:"object", properties:{}, required:[], additionalProperties:false}` shape
  "would silently accept every object". Real AJV over that fragment accepts `{}`
  and rejects every non-empty object (§Reproduction), so the rationale describes
  the fragment's effect incorrectly while the rule it justifies is unaffected.
  Correcting the sentence is a documentation edit outside this report's scope,
  flagged here because this fix cites the rule it accompanies.

## Provenance

- Origin: bug [0033](./0033-body-level-schema-alias-unsupported.md)'s fixer round
  2, cell n10 — the rebuttal that pinned the equality between the alias arm and
  the schema field for `{}` rather than inventing a diagnostic for either, and
  recorded the rule as the type grammar's at both positions. Accepted in review
  round 3, which recommended filing. Carried in the doc as §Fix (0.45.0) residual
  (iv) (`:205–207`) and summarised in `.pi/tmp/fixes/0033-report.md:11`
  ("grammar.md:109's inline-`{}` … rule unimplemented at every Type position").
  The `params:` half of the position matrix was left open deliberately by bug
  [0035](./0035-params-rhs-inline-object-under-emission.md) §Expected
  (`:247–249`), pinned by its fixture-I cell d1 and its scope-bound cell e6, and
  restated in `src/parser/params.ts:444–447`.
- Spec: `docs/spec_topics/grammar.md` (§Type grammar `:105` — the position
  enumeration; §Inline object types `:109` — the rule);
  `docs/spec_topics/schemas.md:19` (the named-body rule and the *Message*);
  `docs/spec_topics/type-system.md:15` (position invariance);
  `docs/spec_topics/schema-subset.md` (`:73` inline hoisting, `:76`/`:78`
  emission); `docs/spec_topics/diagnostics/code-registry-parse.md:86` (the row);
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2 `:72`, DIAG-4
  `:74`); `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22);
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:27` (the `invoke<T>`
  return-value boundary);
  `docs/spec_topics/governance/source-language-stability.md` (loads-cleanly `:9`,
  diagnostic-registry carve-out `:25`);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:`
  right-hand side is the same type grammar). User-facing reference:
  `docs/reference/grammar.md:168–170`, `docs/reference/schema-subset.md:44–45`,
  `docs/reference/diagnostics.md:135`.
- Implementation evidence at `f959f8de`: `src/parser/type-grammar.ts`
  (`:11–22`, `:67–81`, `:90`, `:226`, `:275–308`, `:311–323`, `:368–370`,
  `:373–378`, `:380–382`); `src/parser/theta-document.ts` (`:2339`,
  `:3962–3981`, `:5405–5408`, `:5650–5654`, `:5724–5738`, `:5793`,
  `:5804–5826`, `:5996–6000`, `:6072–6079`); `src/parser/params.ts`
  (`:143–171`, `:409–411`, `:444–447`, `:454–480`);
  `src/parser/schema-declarations.ts:73–81`;
  `src/parser/body-type-lowering.ts` (`:70–92`, `:95–114`, `:131`);
  `src/runtime/query-schema-lowering.ts:109–114`;
  `src/runtime/respond-tool-wire.ts` (`:55–70`, `:91–94`);
  `src/parser/query-schema-inference.ts:106` (the implementation's use of
  "ascription" for the `@<T>` annotation);
  `src/extension/production-theta-producer.ts` (`:2312–2319`, `:3308–3317`).
- Test evidence at `f959f8de`: `tests/schema-alias-union-decl.test.ts`
  (`:351–352` the two `{}` fixtures, `:1801–1816` cell n10);
  `tests/params-inline-object-lowering.test.ts` (`:791–819` group (d) and cell
  d1, `:934–941` cell e6); `tests/committed-fixture-parse-gate.test.ts:122`;
  `tests/schema-declarations.test.ts:53–67` (the named-body control for the
  code).
- Reproduction: scratch vitest at HEAD over the sixteen matrix fixtures, the
  `.thetalib` spelling, four declaration controls, fifteen seam cells across the
  three `TypePosition` values, nine `void` walk-reachability cells plus two
  arity cells and four `invoke<T>` / `@<T>` name-walk cells, the four `params:`
  lowering cells, the two `buildBodyTypeSchemas` entries, the two
  `lowerQueryResponseSchema` calls, twelve real-AJV accept/reject cells, the
  sibling- and nested-empty multiplicity cells, and the union-arm capture cells —
  run on the outputs quoted above, then deleted per scratch policy.

### Discharge note — bug 0095 (0.74.0)

Recorded against this report's §Non-goals *"Unfiled, unchanged here"* exclusion
and the two control cells it produced: the exclusion's **reason has expired** and
one of the cells **inverts**.

[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) fixed the
capture defect this report recorded but declined to own —
`ThetaDocument.parseType`'s leading-brace early return, which ended the capture at
the closing `}` of a leading brace group and left the `("|" Type)*` tail in the
token stream at every non-alias `Type` position. Three consequences for the record
above.

**Cell e5's pinned disposition inverts.** It asserted that
`schema S { f: {} | null }` renders the single declaration-subject line
`'S' has no fields; an empty schema cannot be validated.` — the misattribution
this report's §Reproduction recorded as an adjacent mis-parse. That line is gone.
The field list survives capture, so `finishObjectSchema`'s `fields === null` arm
is not reached, and the field's type source `{}|null` now reaches
`parseTypeExpression` at `schema-feeding`, where **this report's own inline rule**
fires against the empty arm and renders `'{}'`. The cell now asserts that line
together with the retained field. The rule 0045 shipped is unchanged; what changed
is that the input finally reaches it.

**The three bounding comments are rewritten.** They stated that this file's
union-arm cells sit at the ALIAS position because the schema-field spelling is
unusable. That reason no longer holds, so cells **a2** and **c1** gained
schema-field twins **a2b** and **c1b**: the empty-arm rule is now asserted at the
position it governs as well as at the alias position, in both arm orders.
`schema X = {} | null` and `schema X = null | {}` keep their `arms` bytes exactly —
0095 reused the alias branch rather than rewriting it, which is what made that
provable.

**Residual 5 of this report's fix record is discharged.** It named "two adjacent
capture defects, unfiled and unchanged". Both are fixed, together with a third
element 0045 did not record — a `fn` signature corrupted with no diagnostic at
all — which 0095 re-derived and pinned. This report's §Non-goals fence is spent;
nothing in its own §Fix moved.

## Coordination note — bug 0093 landed (0.155.0)

§Fix (0.57.0) *Multiplicity* (`:212`) settled "one diagnostic per occurrence,
in source order, no dedup" for `theta/parse/empty-schema-body` and named the
compound `let`-annotation-over-query position as the exception, recorded rather
than repaired; *Residuals* item (i) (`:291`) left that exception unfiled. Both
sentences stand as written at 0.57.0 — the exception is now closed by
[0093](./0093-let-annotation-query-position-double-emission.md) §Fix (0.155.0),
which marks a query whose schema arrived by `parseLet`'s direct propagation and
withholds the query arm's own type-grammar re-walk for it. The *Multiplicity*
contract therefore now holds at that position too, for this rule and for the
three others the shared walk owns there.

This report's own witness moved with it: cell `RECORDED g3` is now `RED g3`,
its two-line rows for ``let r: {} = @`hi` `` and the arity proxy are one-line
rows, and its three single-emission rows and non-query arity control are
byte-identical. Nothing in the rule 0045 shipped changed; what changed is how
many times the implementation reports it at one position. Status unchanged
(**fixed (0.57.0)**).

## Note — control f2 of this report's witness was re-pinned by bug 0176 (0.161.0)

[0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) refuses
a non-repeating quoted inline field key, so `schema S { f: { "a": string } }` —
control f2 of `tests/inline-empty-object-type.test.ts` — now draws
`theta/parse/quoted-inline-field-name` instead of loading silently. The cell's
subject is preserved by its whole-list assertion: a non-empty interior still
draws no `theta/parse/empty-schema-body`. This report's own reserved shapes are
untouched and asserted after that fix — `{ a }` and `{ a: }` contribute no
quoted key (the first spells no key at all, the second an identifier one), and
`array<{"a": string}>` stays outside the new row on the same generic-argument
ground. Status unchanged (**fixed (0.57.0)**).

### Coordination note — bug 0262's reference-position widening (2026-08-24)

Bug [0262](./0262-unresolved-named-type-silent-at-nine-reference-positions.md)
emits `theta/parse/unresolved-named-type` at the `let` annotation, the `fn`
parameter type, the `fn` return type and the `invoke<T>` ascription. One row of
this report's witness moves.

**What changed.** `tests/inline-empty-object-type.test.ts`, cell `i1`
(`it("i1: …")` at line 1078 of that file), which drives
`let r = invoke<T>("./x.theta")` over a five-spelling table. The `Ghost` row was
`[]` — the control asserting that the whole-file name walk does not run at
`invoke<T>`. It now expects, at line 1098 of that file,
`[line("theta/parse/unresolved-named-type", msg("theta/parse/unresolved-named-type", [["<name>", "Ghost"]]))]`
— the rendered line
`error theta/parse/unresolved-named-type: unresolved named type 'Ghost'`,
interpolated from the live registry through the file's `msg` helper (line 151),
so a DIAG-4 drift reds here. The other four spellings in the same table stay
`[]`: `void`, `array<string, integer>`, `Result<string,string>` and
`{ a: void }`, at lines 1095–1099 of that file. The cell's title and message
were rewritten to name bug 0262; the table's construction and its whole-list
`toEqual` are otherwise the shape this report landed.

**Why.** The operator ruling (sixteenth set), clause (i), names this cell:

> subject-adjacent cells — 0130's let-silence row, 0045's invoke<T>
> no-name-walk control, 0127's three oracle cells, 0089's b12/b13 … — FLIP
> old→new under this ruling, each with a dated coordination note appended to the
> owning bug doc

on the ground that

> a provably-unresolvable WRITTEN name is a provable author error and is judged
> at the position it is written.

**Superseded, for the name walk only.** This report records at line 434 that
"The `invoke<T>` annotation runs no pass at all, not even the name walk", and
its §Fix states at line 665 that "none of the three runs any type-grammar pass
today". The name-walk half of those statements is superseded: `invoke<T>` now
resolves the written head. The type-grammar half is not. The three walk-owned
checks this report declined to wire there —
`theta/parse/generic-arity-mismatch`, `theta/parse/void-in-non-return-position`
and `theta/parse/result-in-schema-position` — still do not fire at `invoke<T>`,
which is what the four surviving `[]` rows of `i1` measure.

**This report's subject is unchanged.** The subject is
`theta/parse/empty-schema-body` firing for an empty inline object type (`{}`) in
any `Type` position at any nesting depth, `invoke<T>` included. `i1` is the
negative fence around that rule, not the rule; cell `i2` (line 1113 of
`tests/inline-empty-object-type.test.ts`), which pins `{}`, `{a: {}}` and
`array<{}>` at `invoke<T>`, is byte-identical to HEAD. The widening changes the
INPUT CLASS that reaches this report's walk, by refusing an unresolvable written
head upstream at the position it is written; it moves neither this report's
*Trigger* nor its verdict at any of the eight positions it covers.

**Measured.** `npx vitest run tests/inline-empty-object-type.test.ts` at the
current tree: 46 of 46 cells pass. Status unchanged (**fixed (0.57.0)**).
