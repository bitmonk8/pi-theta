# Bug 0097 — The `params:` right-hand side keeps the naive `startsWith("{") && endsWith("}")` dispatch, so a top-level union of object arms is read as ONE inline field list: `p: "{a: integer} | {b: integer}"` hoists an enforcing fragment requiring a field `a` whose type asserts nothing, AJV refuses the author's second arm and binds `{"a":null}`, a `NamedType` inside either arm raises nothing — while the identical text at the `@<T>` annotation root and the alias right-hand side lowers to the SUBS-1 two-arm `anyOf`

- **Status:** fixed (0.99.0). This report is the doc authority that lifted bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  §Fix's freeze on the `params:` position's lowered bytes, for the class §Fix
  constraint 1 tabulates and no wider. It landed LAST of the three movers on
  this frame ([0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
  at 0.85.0, [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)
  at 0.86.0), so it re-derived their pins as well as its own (§Fix
  *Coordination*; §Fix (0.99.0) enumerates every re-derived cell).
- **Kind:** defect, two elements on one dispatch.
  1. *A silently wrong lowering at the position whose fragment is the argument
     contract.* grammar.md `:94` admits `Type "|" Type` with `Type` recursive
     and `:101` admits `ObjectType` as a `Type`, so
     `{a: integer} | {b: integer}` is a two-arm union; `:105` names `params:`
     field types among the bare-`Type` positions. schema-subset.md `:81`
     (SUBS-1) requires a union with a non-primitive arm to lower to
     `{"anyOf": [...]}`, and `:73`/`:76` hoist each inline object arm under
     `__inline_<slug>` with a `$ref` at its use. `lowerParamsFieldType`
     (`src/parser/params.ts:761–770`) instead tests
     `s.startsWith("{") && s.endsWith("}")` at `:766` and hands the whole
     interior to `hoistInlineObjectType` as a field list, minting the fragment
     `{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}`
     under `__inline_abb2fcd8521f6115`. No spec text defines that fragment. AJV
     compiles it at three consumers, so the declared second arm is refused and
     `{"a":null}` binds.
  2. *The `params:` position of a closed DIAG-2 row under-emits.*
     `theta/parse/unresolved-named-type`
     (`docs/spec_topics/diagnostics/code-registry-parse.md:90`) names the
     `params:` right-hand side first among its five positions. A `NamedType`
     written inside a brace-group arm of a union resolves against nothing and
     raises nothing there — `p: "{a: Ghost} | {b: integer}"`,
     `p: "{a: Ghost} | Triage"` and `p: "integer | {b: Ghost}"` all load with
     zero diagnostics — where the `@<T>` annotation and the alias right-hand
     side raise for each of the same three sources. The single-group spelling
     `p: "{a: Ghost}"` raises at `params:`, so the silence is the union subset.
- **Related:**
  - [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) —
    **fixed (0.58.0)**, and the filing origin. Its §Fix *Residuals* (ii)
    (`:723–727`) records this report's subject: "The `params:` position keeps
    its own naive test (`src/parser/params.ts:766`) and its bytes by bug 0039
    §Fix's freeze, so `p: "{a: integer} | {b: integer}"` still hoists the
    single-field mis-parse the annotation root no longer mints — the asymmetry
    §Non-goals leaves open, now one-sided." Before that fix the annotation root
    and the name walk carried the same naive test and produced the same
    mis-parse; both now ask `isSingleEnclosingBraceGroup`, so the divergence
    this report files is one-sided rather than shared. 0053's §Non-goals bullet
    (`:740–742`) cites the frame as `src/parser/params.ts:611`, its own 0.49.0
    anchor; at HEAD the line is `:766` (its §Fix records the drift).
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — **fixed (0.49.0)**, the freeze this fix lifts and the machinery it
    reuses. Its §Fix constraint "The `params:` position's bytes do not move"
    (`:637–640`) is why this dispatch is still the naive form; its
    parts A and B built `hoistInlineObjectType` as a shared arm parameterised
    by the caller's per-field recursion (`:130–133`), and gave
    `lowerTypeSource` the two structural guards and the per-arm union path this
    fix routes the `params:` position through. Its import-direction rule
    (`:580–582`) — "`body-type-lowering.ts:15` already imports from
    `params.ts`, and `params.ts` must not import back" — governs where the
    shared predicate can live (§Fix *Where the code lives*).
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — **fixed
    (0.44.0)**, the report that built `lowerParamsFieldType` and its naive
    brace test, and the lock over this position
    (`tests/params-inline-object-lowering.test.ts`). That fix gave the position
    its inline-object arm; it gave it no union arm, and its lock declares no
    `params:` type carrying a top-level `|` (measured at HEAD).
  - [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) —
    **open**, the sibling frozen-bytes mover on the same frame. It adds the
    literal sublanguage to `lowerParamsFieldType` ahead of the brace test and
    moves `parseLiteralArm` into `params.ts` so the two positions share one
    recogniser; this report moves the brace test itself and the union arm
    behind it. The classes are disjoint — an all-literal source carries no
    brace arm — but both re-pin `params:` lowered bytes. See §Fix
    *Coordination*.
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
    **open**, the third mover on this frame: a `params:` scalar carrying text
    no `Type` production spells lowers `{}` with zero diagnostics. Disjoint
    from this class (that text has no top-level `|` with a brace arm), same
    function, same lock set.
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) — **open**,
    and the reason the `schema` body field position has no lowered bytes to
    compare here: `parseType`'s leading-brace arm consumes the first arm and
    returns, so `schema S { f: {a: integer} | {b: integer} }` loses its field
    list and reports `theta/parse/empty-schema-body` against the declaration
    (measured, §Reproduction). That capture is 0095's subject; the frontmatter
    path does not reach it, which is why the same text survives intact to this
    report's frame (0095 `:310–311`).
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — **fixed
    (0.53.0)**, the adjacent arm-precedence defect in `lowerTypeExpr`
    (`src/parser/params.ts:472`), whose fix put the union split (`:483–498`)
    ahead of the generic-application test (`:500–515`). That split is what
    lowers this report's non-brace-suffixed sources per-segment; it has no
    inline-object arm, which is the second half of element 2 (§Actual
    behaviour).
  - [0096](./0096-discriminator-field-classifier-naive-brace-test.md) —
    **open**, the third copy of the same naive test
    (`src/parser/theta-document.ts:5818–5847`). That copy classifies
    discriminator candidates rather than lowering a type, so the two fixes
    touch disjoint code and neither orders before the other; together they
    account for every remaining copy of the prefix/suffix test bug 0053 §Fix
    left standing.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — **fixed (0.45.0)**;
    its §Fix residual (ii) owns the shredded segment set, the shape that stays
    permissive under this fix.
- **Affected** (every citation verified at HEAD `8258e547`, 0.58.0):
  - `src/parser/params.ts:761–770` — **the frame.** `lowerParamsFieldType`, the
    only entry `parseParams` uses for a `params:` field's type. Two arms and no
    third: `:766` is `if (!(s.startsWith("{") && s.endsWith("}")))`, whose
    negative branch delegates to `lowerTypeExpr` (`:767`) and whose positive
    branch hoists the whole source through `hoistInlineObjectType`, passing
    **this function itself** as the per-field recursion (`:769`). The test is
    positional, not structural: a `{` at index 0 and a `}` at the last index.
    Every top-level union whose first and last arms are object types satisfies
    it.
  - `src/parser/params.ts:755–759` — the in-tree statement of the freeze this
    report asks to lift: "this function's own bytes are unchanged by that
    sharing (bug 0039 §Fix constraint: 'The `params:` position's bytes do not
    move'), since it recurses into ITSELF for a nested brace-rooted field
    type".
  - `src/parser/params.ts:652–744` — `hoistInlineObjectType`, the shared arm
    the positive branch reaches. Its interior split is
    `splitTopLevel(source.slice(1, -1), ",", "angle-and-brace")` (`:659`), so a
    mis-parsed interior carrying a nested comma yields one entry, not two;
    `topLevelColon` (`:660`) splits that entry at its first depth-0 colon;
    `:669` lowers the field's type through the caller's recursion; `:676–681`
    marks every field it is handed `required` and sets
    `additionalProperties: false`. Its `lowerFieldType` contract (`:637–643`)
    records that `lowerParamsFieldType` passes itself.
  - `src/parser/params.ts:472–587` — `lowerTypeExpr`, which the negative branch
    reaches and which has **no inline-object arm**. `:483–498` is the union
    split: each arm re-enters this same function, so a brace-group arm reaches
    the trailing catch-all (`:584–586`) and lowers `{}`; the primitive test
    (`:488–494`) reads `{}` as non-primitive and `lowerUnion` (`:497`) emits
    `anyOf`. Its header states the boundary (`:465–470`): "A brace-rooted type
    nested inside a generic argument or a union arm still arrives here
    unintercepted, so this function's own handling of that shape — the trailing
    catch-all — is unchanged." `:549–555` is the identifier arm, the only path
    that appends to `lowerCtx.unresolved`; a shredded or brace-wrapped segment
    never matches `IDENTIFIER` and so never reaches it.
  - `src/parser/params.ts:183` — `parseParams`'s per-field call; `:204–211` —
    the diagnostic loop, which emits `theta/parse/unresolved-named-type` for
    every name in `lowerCtx.unresolved`. A name the lowering never resolves
    appends nothing, so element 2 has no other channel at this site.
  - `src/parser/body-type-lowering.ts:208–238` —
    `isSingleEnclosingBraceGroup`, the structural predicate: a depth walk that
    skips quoted regions and returns true only when the index-0 `{` closes at
    the final index. Exported since 0.58.0 (bug 0053 §Fix). Its doc comment
    (`:176–207`) names this source, this fragment and this hazard, and its
    closing paragraph (`:201–206`) names this report's frame by line: "
    `lowerParamsFieldType`'s own brace check (params.ts:766) is the one copy of
    the naive form among the type-lowering dispatches this predicate serves…
    so `p: "{a: integer} | {b: integer}"` keeps hoisting the one fragment
    `{"a": {"anyOf": [{}, {}]}}` it hoists today."
  - `src/parser/body-type-lowering.ts:415–434` — the dispatch pair the
    `params:` position lacks. `:415–417` routes a single enclosing brace group
    to the hoist; `:419–432` is the per-arm union path, admitted when every `|`
    segment is brace-balanced (`isBraceBalanced`, `:273`, module-private) and
    at least one segment is a single enclosing brace group, each such arm
    hoisting through `hoistInlineObjectType` and the rest lowering through
    `lowerTypeExpr`, combined by `lowerUnion`; `:434` delegates everything else.
  - `src/parser/body-type-lowering.ts:15–22` — the one-way import
    (`body-type-lowering.ts` imports `hoistInlineObjectType`, `lowerTypeExpr`,
    `splitTopLevel`, `topLevelColon` and `classifyLoweredUnionArm` from
    `params.ts`). `params.ts` imports nothing from `body-type-lowering.ts` at
    HEAD, which is what makes the fix a code move rather than an import
    (§Fix).
  - `src/parser/body-type-lowering.ts:704–719` — `collectUnresolvedNamedTypes`,
    corrected by bug 0053 §Fix: `:715` now asks
    `isSingleEnclosingBraceGroup`, so the walker returns `["Ghost"]` for
    `{a: Ghost} | {b: integer}`. The `params:` position does not use this
    walker — it reads names off `lowerCtx.unresolved` — so element 2 survives
    the correction.
  - `src/runtime/query-schema-lowering.ts:151–156` — the annotation root's
    corrected dispatch (the same predicate), and `:160` the `lowerTypeSource`
    call the union falls through to. `:60–81` is the permissive-`{}` origin
    inventory, whose union-arm bullet (`:62–72`) states this asymmetry as
    current behaviour: "a `params:` field's `{a: integer} | integer` lands
    here, where the same text at a `lowerTypeSource` position does not".
  - The three consumers that compile the lowered `params:` document:
    `src/extension/production-theta-producer.ts:709–712` (the binder envelope
    build), `:1173` (the post-default-merge AJV compile) and `:1968–1975` (the
    subagent child's params-intake validator).
    `src/binder/binder-envelope.ts:86–89` and `:137–157`
    (`relaxParamsSchema`) copy the params schema's `properties` and `$defs`
    into the envelope's `ok.args` arm, so the fragment reaches the binder
    model's forced-tool input schema unchanged.
  - `src/binder/binder-envelope.ts:166–170` (`BypassParamsField.type`, "The
    field's declared surface type") and
    `src/binder/binder-system-prompt.ts:151–164` (`renderBinderParamLine`),
    `:200–207` (the `Parameters:` block) — the surface that renders the
    declared type the lowering mis-reads.
  - `tests/annotation-root-brace-union-lowering.test.ts:782–801` (CONTROL a6)
    and `:673–681` (the `params:` row of the ORACLE CROSS-CHECK), with the
    fragment, canonical form and derived name at `:329–337` and the oracle case
    row at `:623` — bug 0053's lock, which pins exactly the bytes and the
    minted name this report asks to move. a6's own comment states the
    disposition: "Bug 0053 §Non-goals freezes `lowerParamsFieldType`'s test
    (src/parser/params.ts:766)."
  - `tests/params-inline-object-lowering.test.ts` — bug 0035's lock over this
    position. Every fixture is an inline object, a named type, a primitive or
    `array<…>`; no fixture's type source carries a top-level `|`, so none of
    its rows is in this report's class.
  - Not affected: a `params:` type that IS a single enclosing brace group
    (`{a: integer, b: string}`, `{a: integer, b: {x: integer, y: string}}`),
    which keeps its hoist and its minted names; a named type (`Triage`); a
    union with no brace arm; the empty inline object `p: "{}"`, refused at
    parse since 0.57.0 (`tests/params-inline-object-lowering.test.ts` group
    (d), bug
    [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md));
    `classifyDiscriminatorFieldType`
    (`src/parser/theta-document.ts:5822`), which carries a third copy of the
    naive test ahead of its own `|` split and is a classifier, not a lowering
    (bug 0053 §Fix residual (i), filed as
    [0096](./0096-discriminator-field-classifier-naive-brace-test.md)).
- **Observed at:** `0.58.0` (HEAD `8258e547`). Offline, deterministic; no live
  model and no provider. Scratch vitest over `parseThetaDocument` (the shipped
  load path, `tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`,
  `collectUnresolvedNamedTypes`, `renderBinderParamLine`,
  `buildBinderEnvelopeSchema` and the production `AjvSchemaValidator`; written,
  run, deleted.

## Summary

Theta has one type grammar and four positions that lower a type expression to
JSON Schema. Three of them — the `@<T>` query annotation, a `schema X = …`
alias right-hand side, and a `schema` body field type — reach the shared
`lowerTypeSource`, which asks a structural question of the source before it
lowers anything: is this ONE enclosing brace group? A union of object arms
answers no, so its arms hoist individually and combine per SUBS-1. The fourth,
the `params:` right-hand side, enters `lowerParamsFieldType`, which asks the
positional question instead — first character `{`, last character `}` — and a
union of object arms answers yes, because its first arm opens the source and
its last arm closes it.

The interior is then read as a field list it is not. For
`{a: integer} | {b: integer}` the one entry is `a: integer} | {b: integer`,
which `topLevelColon` splits into the field `a` with type source
`integer} | {b: integer`. That type source splits into two segments neither of
which is a type, so each lowers `{}`. The hoisted fragment is:

```
{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}
```

It requires a property `a` the author declared as one alternative among two,
constrains that property to nothing, and refuses every other property. AJV
compiles it at the argument boundary, so `{"p":{"b":1}}` — the author's second
arm — is refused and `{"p":{"a":null}}` — matching neither arm — binds.

The same dispatch decides the diagnostic. A `NamedType` written inside a
brace-group arm never reaches `lowerTypeExpr`'s identifier arm, so it appends
nothing to `lowerCtx.unresolved` and `parseParams` has no name to report:
`p: "{a: Ghost} | {b: integer}"` loads with zero diagnostics where
`@<{a: Ghost} | {b: integer}>` and `schema X = {a: Ghost} | {b: integer}` both
refuse the theta. The silence is wider than the mis-parse, because
`lowerTypeExpr` has no inline-object arm at all: `p: "integer | {b: Ghost}"`,
which is not brace-suffixed and lowers per-segment rather than wrongly, is
silent too.

Until 0.58.0 this was a shared reading — the annotation root and the name walk
carried the identical naive test, and bug 0053 fixed both. The `params:`
position was left out by name, on bug 0039 §Fix's freeze. It is now the one
type position that reads a union of object arms as a field list.

## Reproduction

Offline at HEAD `8258e547`. Probe output quoted verbatim. Body fixture
`schema Triage { urgent: boolean }` + `let x = 1`; frontmatter `mode: prompt`
plus the single `params:` entry shown. A theta-side inline object carries
theta-side braces, so the `params:` entry wraps the type expression in a YAML
scalar; the quoted text reaches the lowering unchanged (the recorded
`BypassParamsField.type` below is the evidence). `Ghost` is declared nowhere.

### One type expression, four positions

```
@@ params  p: "{a: integer} | {b: integer}"
   diags []  properties.p :: {"$ref":"#/$defs/__inline_abb2fcd8521f6115"}
   $defs    :: {"__inline_abb2fcd8521f6115":
                 {"type":"object","properties":{"a":{"anyOf":[{},{}]}},
                  "required":["a"],"additionalProperties":false}}
@@ ann     @<{a: integer} | {b: integer}>
   lowered  :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},
                         {"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}],
                "$defs":{"__inline_df817b794ef788ce":
                          {"type":"object","properties":{"a":{"type":"integer"}},
                           "required":["a"],"additionalProperties":false},
                         "__inline_8cc8cb1e7074a3af":
                          {"type":"object","properties":{"b":{"type":"integer"}},
                           "required":["b"],"additionalProperties":false}}}
@@ alias   schema X = {a: integer} | {b: integer}
   diags []  $defs.X :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},
                                  {"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}]}
@@ field   schema S { f: {a: integer} | {b: integer} }
   diags :: ["error theta/parse/empty-schema-body: 'S' has no fields; an empty
              schema cannot be validated."]
```

The annotation root and the alias right-hand side agree byte-for-byte on the
two hoisted arms. The `schema` body field position never reaches a lowering:
its parse capture loses the field list, which is bug
[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)'s subject and
not this one's. The `params:` position is the only one that lowers this text to
a single-field object.

### The brace-suffixed family at `params:`

Every row loads with zero diagnostics.

| `params:` type source | `properties.p` | minted `$defs` name |
| --- | --- | --- |
| `{a: integer} \| {b: integer}` | `$ref` | `__inline_abb2fcd8521f6115` — `{"a":{"anyOf":[{},{}]}}` |
| ` {a: integer} \| {b: integer}` (leading space) | `$ref` | identical |
| `{a: integer} \| {b: integer} ` (trailing space) | `$ref` | identical |
| `{a: integer}\|{b: integer}` (no spaces) | `$ref` | identical |
| `{a: integer} \| {b: integer} \| {c: integer}` | `$ref` | `__inline_6c815aa05d43014d` — `{"a":{"anyOf":[{},{},{}]}}` |
| `{x: {p: integer, q: boolean}} \| {y: string}` | `$ref` | `__inline_89c169adb6920a28` — `{"x":{"anyOf":[{},{}]}}` |
| `{ a: string \| null } \| {b: integer}` | `$ref` | `__inline_62ad2038df56024e` — `{"a":{"anyOf":[{"type":"string"},{},{}]}}` |
| `{a: integer} \| integer}` (malformed) | `$ref` | `__inline_1b7dfa57724a007e` — `{"a":{"anyOf":[{},{"type":"integer"}]}}` |

The dispatch is insensitive to spacing and to arm count, and it fires on
sources that are not unions at all — the malformed row's trailing `}` is enough.

Appending a primitive arm removes the trailing `}` and the mis-parse with it;
what remains is permissive rather than wrong:

```
@@ params  p: "{a: integer} | {b: integer} | integer"
   properties.p :: {"anyOf":[{},{},{"type":"integer"}]}       (no hoist, no $defs)
@@ params  p: "integer | {b: integer}"
   properties.p :: {"anyOf":[{"type":"integer"},{}]}
@@ params  p: "{a: integer} | Triage"
   properties.p :: {"anyOf":[{},{"$ref":"#/$defs/Triage"}]}
@@ ann     @<{a: integer} | Triage>
   lowered      :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},
                             {"$ref":"#/$defs/Triage"}], "$defs":{…both…}}
```

### Controls — the shapes that keep their bytes

```
@@ params  p: "{a: integer, b: string}"
   properties.p :: {"$ref":"#/$defs/__inline_9b890568745f5ea5"}
@@ params  p: "{a: integer, b: {x: integer, y: string}}"
   properties.p :: {"$ref":"#/$defs/__inline_dd69af402813aa7d"}
   $defs        :: __inline_c319be1cd4ab5f98 (the nested {x,y}), __inline_dd69af402813aa7d
@@ field   schema S { f: {a: integer, b: {x: integer, y: string}} }
   $defs        :: __inline_c319be1cd4ab5f98, __inline_dd69af402813aa7d   (the same two names)
@@ params  p: "Triage"
   properties.p :: {"$ref":"#/$defs/Triage"}
@@ params  p: "{ a: string | null } | Triage"     (shredded, not brace-suffixed)
   properties.p :: {"anyOf":[{},{},{"$ref":"#/$defs/Triage"}]}
```

A genuine single brace group already mints the same `__inline_<slug>` at the
`params:` position and at a `schema` body field, nested fragment included:
the hoist is shared, and only the dispatch in front of it diverges.

### Real AJV over the lowered `params:` document

The production `AjvSchemaValidator`, compiled over
`{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_abb2fcd8521f6115"}},"required":["p"],"additionalProperties":false,"$defs":{…}}`.
The validator emitted no diagnostics.

```
{"p":{"a":1}}                  -> ACCEPT
{"p":{"b":1}}                  -> REFUSE   (the author's second arm)
{"p":{"a":null}}               -> ACCEPT   (matches NEITHER arm)
{"p":{"a":"not an integer"}}   -> ACCEPT   (matches NEITHER arm)
{"p":{"a":{"deep":true}}}      -> ACCEPT   (matches NEITHER arm)
{"p":{"a":1,"b":1}}            -> REFUSE
{"p":{"c":3}}                  -> REFUSE
{"p":7}                        -> REFUSE
```

### The named spelling of the same union, which enforces the declared arms

`params: p: X` with `schema X = {a: integer} | {b: integer}` lowers
`properties.p = {"$ref":"#/$defs/X"}` against
`$defs.X = {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}]}`:

```
{"p":{"a":1}}      -> ACCEPT
{"p":{"b":1}}      -> ACCEPT
{"p":{"a":null}}   -> REFUSE
{"p":{"c":3}}      -> REFUSE
{"p":7}            -> REFUSE
```

Naming the union and referring to it by name gives the author the declared
shape; writing the same text inline does not.

### Element 2 — a name inside a brace arm, at four positions

```
type source                    params:   @<T>      alias RHS   schema body field
{a: Ghost} | {b: integer}      []        Ghost     Ghost       empty-schema-body
{a: Ghost} | Triage            []        Ghost     Ghost       empty-schema-body
integer | {b: Ghost}           []        Ghost     Ghost       empty-schema-body
{a: Ghost}                     Ghost     Ghost     Ghost       Ghost
```

`Ghost` above is the rendered line
`error theta/parse/unresolved-named-type: unresolved named type 'Ghost'`, and
`[]` is a clean load. The three union rows refuse the theta at two positions and
load it at `params:`. The single-group row shows the `params:` position raises
this code when the lowering descends at all.

The walker `collectUnresolvedNamedTypes` — the seam the `@<T>` and alias
positions read — returns `["Ghost"]` for these sources at HEAD (bug 0053 §Fix),
which is why those two columns raise. The `params:` position does not consult
it: it reports whatever its own lowering appended to `lowerCtx.unresolved`.

### What the binder is told

```
@@ params  p: "{a: integer} | {b: integer}"
   BypassParamsField :: {"wireName":"p","type":"{a: integer} | {b: integer}",
                         "hasDefault":false,"nullable":false}
   Parameters: line  ::   p ({a: integer} | {b: integer}) required
   envelope ok.args  :: {"type":"object",
                         "properties":{"p":{"$ref":"#/$defs/__inline_abb2fcd8521f6115"}},
                         "required":["p"],"additionalProperties":false}
   envelope $defs    :: {"__inline_abb2fcd8521f6115":
                          {"type":"object","properties":{"a":{"anyOf":[{},{}]}},
                           "required":["a"],"additionalProperties":false}}
```

The prompt states the declared union; the schema the binder's structured output
is constrained by states a required `a` whose type asserts nothing.

## Expected behaviour

- grammar.md `:94` (`Type "|" Type`, recursive) and `:101` (`ObjectType` is a
  `Type`): `{a: integer} | {b: integer}` is a two-arm union of object types,
  not one object type. `:105` names "`params:` field types" among the positions
  where "a bare `Type` appears" and adds that "the grammar is otherwise
  identical in every position". `:109` makes an inline object's field `Type`
  recursive.
- type-system.md `:15`: "The same type grammar applies in every
  type-annotation position: schema fields, frontmatter `params:`, `let x: T`,
  function parameters, and `@<T>`…". One grammar and one emission table give
  one answer per type expression, so the `params:` right-hand side lowers
  `{a: integer} | {b: integer}` to the document the `@<T>` root and the alias
  right-hand side already produce for the same text:

  ```
  properties.p :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},
                            {"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}]}
  $defs        :: both arm fragments, closed at the params document root
  ```

- schema-subset.md `:81` (SUBS-1): a union with a non-primitive arm lowers to
  `{"anyOf": [...]}`, arms in source order; `:82` names the object-union case.
  `:73` (step 2) hoists each inline object arm into `$defs` under
  `__inline_<slug>` and `:76` (step 3) emits `{"$ref": "#/$defs/<Name>"}` at its
  use. `:98` makes the slug a function of the lowered fragment, so two
  positions that lower one source text to one fragment mint one name — which
  the `params:` and body positions already do for a single brace group
  (§Reproduction *Controls*) and would then do for each arm.
- frontmatter-fields-a.md `:58`: "Each `params:` field's right-hand side is a
  type expression parsed by the theta type grammar — the same grammar used in
  every other type-annotation position"; `:57`: "`params` are validated with
  AJV at invocation time". An AJV document that refuses the author's second arm
  and accepts a value matching neither satisfies neither sentence. After the
  fix the compiled document accepts `{"p":{"a":1}}` and `{"p":{"b":1}}` and
  refuses `{"p":{"a":null}}`, `{"p":{"a":"not an integer"}}`,
  `{"p":{"a":{"deep":true}}}`, `{"p":{"c":3}}` and `{"p":7}` — the accept/reject
  table the named spelling already produces (§Reproduction).
- code-registry-parse.md `:90`: a `NamedType` resolving to no declaration
  raises exactly one `theta/parse/unresolved-named-type` at each of the row's
  five positions, at error severity, with the theta refused. The row names the
  `params:` right-hand side first. `p: "{a: Ghost} | {b: integer}"`,
  `p: "{a: Ghost} | Triage"` and `p: "integer | {b: Ghost}"` each raise it
  once, byte-identically to what the `@<T>` and alias positions raise for the
  same text today.
- Unchanged: a `params:` type that IS one enclosing brace group keeps its
  hoisted `$ref` and its minted name; a shredded segment set
  (`{ a: string | null } | Triage`) keeps its per-segment permissive `anyOf`
  and its silence, at every position; a union with no brace arm is unaffected.

## Actual behaviour / root cause

**One dispatch, asked the wrong way.**

`lowerParamsFieldType` (`src/parser/params.ts:761–770`) is the whole of this
position's type lowering:

```ts
export function lowerParamsFieldType(
  source: string,
  lowerCtx: LowerCtx,
): Record<string, unknown> {
  const s = source.trim();
  if (!(s.startsWith("{") && s.endsWith("}"))) {
    return lowerTypeExpr(s, lowerCtx);
  }
  return hoistInlineObjectType(s, lowerCtx, lowerParamsFieldType);
}
```

The test at `:766` is positional. `{a: integer} | {b: integer}` satisfies it on
the first arm's opening brace and the last arm's closing brace, so the whole
source is handed to `hoistInlineObjectType` as an inline object.

What comes back is determined by that function's two steps.
`splitTopLevel(source.slice(1, -1), ",", "angle-and-brace")` (`:659`) yields
ONE entry for `a: integer} | {b: integer` — the brace-aware interior split bug
0039 part A installed is what keeps a nested comma from cutting a second entry
(the `{x: {p: integer, q: boolean}} | {y: string}` row). `topLevelColon`
(`:660`) splits that entry at its first depth-0 colon, so the field is `a` with
type source `integer} | {b: integer`. `:669` lowers that source through the
caller's recursion, which is `lowerParamsFieldType` itself: not brace-rooted, so
`lowerTypeExpr`, whose union split (`:483–498`) cuts it into `integer}` and
`{b: integer`, neither of which matches any arm, so both reach the catch-all
(`:584–586`) and lower `{}`. `:676–681` then marks the one field `required`,
sets `additionalProperties: false`, content-addresses the fragment and returns
a `$ref`.

**The predicate this position needs already exists, and already names it.**
`isSingleEnclosingBraceGroup` (`src/parser/body-type-lowering.ts:208`) walks
brace depth, skips quoted regions, and returns true only when the index-0 `{`
closes at the final index. Bug 0053 §Fix exported it and routed the annotation
root (`src/runtime/query-schema-lowering.ts:151`) and the name walk
(`src/parser/body-type-lowering.ts:715`) through it. Its doc comment
(`:201–206`) records the remaining copy at `params.ts:766` and the fragment
that copy mints — the in-tree record of this report's subject, written as a
deliberate exclusion.

**Declining the source is only half of what the other positions do.**
`lowerTypeSource` asks the structural question and then, for a source that is
not one brace group, asks a second: are the `|` segments arms? (`:419–432`) —
every segment brace-balanced, at least one a single enclosing brace group. On
a set that passes, each brace-group arm hoists and the rest lower through
`lowerTypeExpr`. The `params:` position has neither question. Its negative
branch goes straight to `lowerTypeExpr`, which has no inline-object arm at any
depth: its own header says so (`:465–470`), and the permissive-`{}` inventory
in `src/runtime/query-schema-lowering.ts:62–72` states the divergence as
current behaviour — "a `params:` field's `{a: integer} | integer` lands here,
where the same text at a `lowerTypeSource` position does not".

That is why element 2 is wider than element 1. For a brace-suffixed source the
name is lost inside the mis-parsed field's shredded type text; for
`integer | {b: Ghost}` it is lost because the brace arm reaches
`lowerTypeExpr`'s catch-all instead of a hoist that would descend into it.
Either way `lowerCtx.unresolved` (`params.ts:554` is the only site that appends)
stays empty and `parseParams`'s diagnostic loop (`:204–211`) has nothing to
report.

**Why the position was left this way.** Bug 0035 built this frame with the
naive test (0.44.0). Bug 0039 factored the hoist out into
`hoistInlineObjectType` and gave the shared lowerer the two guards, and its
§Fix constraint froze this position's bytes byte-for-byte (`:637–640`) so the
factoring could be proved to be a no-op here; `lowerParamsFieldType` passing
itself as the per-field recursion (`params.ts:769`) is that constraint in code,
and three in-tree comments state it (`params.ts:637–643`, `:755–759`;
`body-type-lowering.ts:201–206`). Bug 0053 corrected the same predicate at the
annotation root and the name walk and left this one out for the same reason.
Nothing about the mechanism differs at this position; the freeze is what has
held.

**Everything downstream of the frame is correct.** `hoistInlineObjectType`
hoists and content-addresses whatever field list it is handed;
`lowerUnion` (`src/parser/schema-lowering.ts`) implements SUBS-1 over whatever
arms it is given; `parseParams` reports every name the lowering resolves
against nothing. The frame is the positional test and the missing arm path
behind it.

## Why it matters

- **The lowered fragment is the only enforcement the argument gets, and here it
  enforces a shape nobody wrote.** Three sites compile it: the binder envelope
  (`production-theta-producer.ts:709–712` → `binder-envelope.ts:86–89`), the
  post-default-merge validation (`:1173`) and the subagent child's params
  intake (`:1968–1975`). A param declared as `{a: integer} | {b: integer}`
  refuses `{"p":{"b":1}}` — an argument the author declared — and binds
  `{"p":{"a":null}}` and `{"p":{"a":{"deep":true}}}`, which no arm admits.
- **The failure direction is refusal, not permissiveness.** The other silent
  `params:` classes (bugs 0056 and 0059) accept every JSON value, so no
  argument an author writes is turned away. This class turns away arguments the
  declaration admits, and the AJV error names a property
  (`must have required property 'a'`) that is one arm of the declared union.
- **The model is grounded in a schema the author cannot find in their source.**
  The `Parameters:` line renders `p ({a: integer} | {b: integer}) required`
  while the envelope's `ok.args` carries the mis-parsed fragment under
  `additionalProperties: false`, so the binder's structured output cannot carry
  the author's second arm at all.
- **Two spellings of one declaration behave differently with no signal.**
  `p: "{a: integer} | {b: integer}"` and `p: X` with
  `schema X = {a: integer} | {b: integer}` produce different accept/reject
  tables (§Reproduction). type-system.md `:15` is what an author relies on when
  moving a type expression between positions.
- **One position of a closed DIAG-2 row under-emits, so the row over-states the
  implementation.** A typo inside a union arm refuses the theta at the `@<T>`
  and alias positions and loads it at `params:`, where the same typo also
  removes the arm's constraints from the compiled document.
- **The divergence is one-sided and recent.** Before 0.58.0 the annotation root
  and the name walk read this text the same way; bug 0053's fix left `params:`
  as the one type position that mints the mis-parse, and the in-tree comment
  that records it (`src/parser/body-type-lowering.ts:201–206`) states the
  behaviour as deliberate.
- **The content-addressed `$defs` name splits by position.** schema-subset.md
  `:73` collapses two inline schemas to one entry exactly when their lowered
  fragments are byte-identical. For `{a: integer} | {b: integer}` the `params:`
  document mints `__inline_abb2fcd8521f6115` and the annotation and alias
  positions mint `__inline_df817b794ef788ce` and `__inline_8cc8cb1e7074a3af`
  for the same source text.
- **No gate scores it.** A census of the committed corpus finds 17 `.theta` /
  `.thetalib` files declaring `params:` and none whose right-hand side is a
  union carrying a brace arm, so `tests/committed-fixture-parse-gate.test.ts`
  never meets one. The two rows that do drive this shape
  (`tests/annotation-root-brace-union-lowering.test.ts:673–681` and
  `:782–801`) pin it as this position's frozen current behaviour.

## Fix

Ask the `params:` dispatch the structural question the other three positions
ask, and give it the arm path behind that question.

`lowerParamsFieldType` (`src/parser/params.ts:761–770`) tests
`isSingleEnclosingBraceGroup(s)` in place of
`s.startsWith("{") && s.endsWith("}")`. A source that is one enclosing brace
group keeps today's route — `hoistInlineObjectType` over the whole source, this
function as the per-field recursion — so every single-group `params:` type is
byte-unchanged, minted names included. A source that is not takes the per-arm
union dispatch `lowerTypeSource` runs (`src/parser/body-type-lowering.ts:419–432`):
when every `|` segment is brace-balanced and at least one segment is a single
enclosing brace group, each brace-group arm hoists through
`hoistInlineObjectType` and the rest lower through `lowerTypeExpr`, combined by
`lowerUnion` per SUBS-1. Everything else reaches `lowerTypeExpr` exactly as
today.

Both elements close on that route. The arms hoist as the arms they are, so the
lowered document is the one the annotation root and the alias right-hand side
already produce for the same text; and a `NamedType` inside an arm reaches
`lowerTypeExpr`'s identifier arm (`params.ts:549–555`), appends to
`lowerCtx.unresolved`, and refuses the theta through the loop already wired at
`:204–211`.

**Where the code lives.** The substitution is not an import.
`isSingleEnclosingBraceGroup` (`body-type-lowering.ts:208`) and
`isBraceBalanced` (`:273`, module-private) sit in the module that imports
`params.ts` (`:15–22`), and bug 0039 §Fix forbids the reverse direction
(`:580–582`) — which is why `hoistInlineObjectType` lives in `params.ts` in the
first place (`params.ts:620–624`). The two predicates and the arm dispatch move
beside it, and `lowerTypeSource`, `collectUnresolvedNamedTypes` and
`lowerQueryResponseSchema` call them there. One predicate pair and one arm
dispatch serve four positions, which is the sharing bug 0053 §Fix established
and this fix extends rather than duplicates.

**Coordination.** Three open reports move behaviour on this one frame:
[0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) adds the
literal sublanguage ahead of the brace test and moves `parseLiteralArm` into
`params.ts`; [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)
adds a type-expression recogniser at the same position;
this report replaces the brace test and adds the arm path. The three input
classes are disjoint — an all-literal source and a non-`Type` text carry no
brace arm, and this class carries a top-level `|` with at least one — so no
landing order is forced by content. Each re-pins rows in the `params:` lock set
(`tests/params-inline-object-lowering.test.ts`,
`tests/params-block-mapping-rhs-refusal.test.ts` group (e),
`tests/annotation-root-brace-union-lowering.test.ts` group (a) and its oracle
cross-check), so whichever lands last re-derives the others' anchors and slugs
in the same change.

Constraints on any implementation:

1. **The frozen `params:` bytes move, and only for the enumerated class.** Bug
   0039 §Fix pinned this position byte-for-byte (`:637–640`); `params.ts:755–759`
   and `body-type-lowering.ts:201–206` state that freeze in tree, and
   `params.ts:637–643` and `src/runtime/query-schema-lowering.ts:62–72` record
   the asymmetry it produces. This report's §Fix is the authority that lifts it
   for exactly the sources below, and all four records are re-derived in the
   same change. The class that moves:

   | Source shape | HEAD | After |
   | --- | --- | --- |
   | a union of brace-balanced segments with at least one brace-group arm, brace-suffixed | one hoisted mis-parse fragment (`{"a":{"anyOf":[{},{}]}}`) | `anyOf` over the arms, each brace arm hoisted under its own `__inline_<slug>` |
   | the same union not brace-suffixed (`integer \| {b: integer}`, `{a: integer} \| Triage`) | per-segment `anyOf` with each brace arm `{}` | the same `anyOf` with each brace arm hoisted |
   | a brace-suffixed source that is not one group and whose segments are not all balanced (`{ a: string \| null } \| {b: integer}`) | a hoisted mis-parse fragment | the per-segment permissive `anyOf` the annotation root already emits (`{"anyOf":[{},{},{}]}`) |
   | a malformed brace-suffixed source (`{a: integer} \| integer}`) | a hoisted mis-parse fragment | the per-segment permissive `anyOf` |
   | a `NamedType` inside any brace arm of the first two rows | no diagnostic | one `theta/parse/unresolved-named-type`, theta refused |

   Nothing else moves. Every source that is one enclosing brace group, every
   named type, every primitive, every `array<T>` and every union with no brace
   arm keeps its bytes and its minted slugs — measured, not assumed:
   `tests/params-inline-object-lowering.test.ts` declares no `params:` type
   source carrying a top-level `|`, so all of its rows are in the unmoved set.
2. **The two rows that pin the mis-parse are re-derived under this report's
   authority, and neither is relaxed.**
   `tests/annotation-root-brace-union-lowering.test.ts:782–801` (CONTROL a6)
   asserts the whole lowered `params:` document including
   `__inline_abb2fcd8521f6115`, and `:673–681` asserts the same mint inside the
   oracle cross-check; the fragment, its hand-written canonical form and the
   derived name are at `:329–337`, enrolled in the group-(0) oracle case list
   at `:623`. All four are re-derived together: a6 becomes the parity row —
   the `params:` document's arm fragments byte-equal to the annotation root's —
   and the cross-check keeps a `params:`-minted slug by driving a source that
   still mints one (a single enclosing brace group), so the oracle keeps a
   production cross-reference at this position. That file's header inventory
   (`:113–114`) states the frozen row in prose and is re-derived with them.
3. **A genuine single brace group is byte-identical, and the arm mints agree
   with the other positions.** `p: "{a: integer, b: string}"` keeps
   `__inline_9b890568745f5ea5`; `p: "{a: integer, b: {x: integer, y: string}}"`
   keeps `__inline_dd69af402813aa7d` over `__inline_c319be1cd4ab5f98`, the same
   two names the `schema` body position mints today. After the fix
   `p: "{a: integer} | {b: integer}"` mints `__inline_df817b794ef788ce` and
   `__inline_8cc8cb1e7074a3af` — the names the annotation root and the alias
   right-hand side already mint for those arms — so one source text yields one
   name at every position, which is what makes schema-subset.md `:73`'s dedup
   mechanical.
4. **A shape the lowering cannot derive stays permissive.** Bug 0039 §Fix
   constraint 1 continues to bind: the shredded segment set is refused by
   `isBraceBalanced` and keeps its per-segment `anyOf` and its silence. The
   brace-suffixed shredded set (`{ a: string | null } | {b: integer}`) moves
   from WRONG to PERMISSIVE, the direction that constraint admits, and lands on
   the bytes the annotation root already emits for it.
5. **Validation outcomes change for thetas that load unchanged, and the change
   is enumerated rather than discovered.** A param declared as a union of
   object arms begins accepting the arms it declares and refusing values no arm
   admits, at all three consumers of the lowered document. GOV-15 (`:5`)
   promises identical return values for a file that loads cleanly under 1.0.0;
   the affected class is constraint 1's table, and the census in §Why it
   matters found no committed fixture in it.
6. **Newly-refused sources are diagnostic-registry movement, not a registry
   edit.** A name inside a brace arm begins refusing the theta at the `params:`
   position. No code, row or trigger widens — `code-registry-parse.md:90`
   already names this position — and GOV-15's diagnostic-registry carve-out
   (`source-language-stability.md:25`) covers the newly-refused typo inputs as
   it covered 0039's and 0053's. `tests/fixtures/h7a/permitted-codes.json`
   carries no `theta/parse/*` code, and no committed fixture declares a
   `params:` union with a brace arm, so H9a's stderr gate cannot newly fire.
7. **The binder surfaces move with the bytes.** `relaxParamsSchema`
   (`binder-envelope.ts:137–157`) copies `properties` and `$defs` verbatim, so
   the envelope's `ok.args.properties.p` changes from a `$ref` at the
   mis-parsed fragment to the two-arm `anyOf`, with both arm fragments closed
   at the envelope root. The rendered `Parameters:` line does not change: it
   carries `BypassParamsField.type`, the author's own text.
8. **Test witness — unit, offline, provider-free.** Every fixture in
   §Reproduction is a `parseThetaDocument` or `lowerQueryResponseSchema` call
   plus one real AJV compile. Required beyond re-deriving the rows in
   constraint 2: a four-position parity table over
   `{a: integer} | {b: integer}` proving the `params:` document and the
   annotation root carry byte-identical arm fragments under identical names;
   the real-`AjvSchemaValidator` accept/reject table with the four inverting
   cells (`{"p":{"b":1}}` accepted where it is refused; `{"p":{"a":null}}`,
   `{"p":{"a":"not an integer"}}`, `{"p":{"a":{"deep":true}}}` refused where
   they bind); the element-2 table at all four positions, reading expected
   messages from the registry (DIAG-4) rather than copying prose; the
   binder-envelope shape for a union-typed param; and no-op cells for every
   control in §Reproduction, minted slugs included.

## Fix (0.99.0)

- **What shipped.** One structural question, asked at the fourth position, with
  the arm path behind it — §Fix implemented as settled, no substitution.
  - `src/parser/params.ts` — `lowerParamsFieldType`'s dispatch is now literal
    sublanguage → `isSingleEnclosingBraceGroup(s)` → `lowerBraceGroupUnionArms`
    → `lowerTypeExpr`, in place of the positional
    `startsWith("{") && endsWith("}")` test. It still passes ITSELF as
    `hoistInlineObjectType`'s per-field recursion, which is what makes the arm
    path apply at every depth. `isSingleEnclosingBraceGroup` (exported) and
    `isBraceBalanced` (module-private) MOVED here verbatim, and the per-arm
    union dispatch moved with them as the exported
    `lowerBraceGroupUnionArms(source, lowerCtx, lowerFieldType)`, which returns
    `undefined` when its guard declines so each caller falls through to its own
    `lowerTypeExpr`. §Fix *Where the code lives*: the substitution is a code
    move, not an import — bug 0039 §Fix's one-way rule
    (`body-type-lowering.ts` imports from `params.ts`, never the reverse)
    forbids the import.
  - `src/parser/body-type-lowering.ts` — imports the three back and
    RE-EXPORTS `isSingleEnclosingBraceGroup` (`:34`). The re-export is load
    bearing, not cosmetic: `theta-document.ts`, `query-schema-lowering.ts` and
    the bug-0096 witness `tests/discriminator-field-classifier-brace-group.ts`
    reach the predicate at that path, and no importer's import line changed.
    `lowerTypeSource` keeps its shape and now calls the shared dispatch; its
    dead local `splitTopLevel(s, "|")` is gone. ONE predicate pair and ONE arm
    dispatch now serve all four `Type` positions — the 0053 sharing extended,
    not duplicated.
  - `src/runtime/query-schema-lowering.ts`, `src/parser/theta-document.ts` —
    comment-only: the permissive-`{}` origin inventory's union-arm bullet and
    `unresolvedNamedTypeDiagnostic`'s doc comment both stated the `params:`
    asymmetry as current behaviour and are re-derived (below).
- **The class that moved, measured before → after** (offline probes at HEAD
  `a1eec82c` and on the shipped tree; every HEAD value reproduced §Reproduction
  byte-for-byte, so the nine-fix-old evidence held):

  | `params:` type source | HEAD | 0.99.0 |
  | --- | --- | --- |
  | `{a: integer} \| {b: integer}` (and the leading-space / trailing-space / no-space spellings) | `$ref __inline_abb2fcd8521f6115` → `{"a":{"anyOf":[{},{}]}}` | `anyOf` over `$ref __inline_df817b794ef788ce` + `$ref __inline_8cc8cb1e7074a3af` |
  | `{a: integer} \| {b: integer} \| {c: integer}` | `__inline_6c815aa05d43014d` | three hoisted arms, third `__inline_562094ebf0ccad82` |
  | `{x: {p: integer, q: boolean}} \| {y: string}` | `__inline_89c169adb6920a28` | two hoisted arms, the nested group hoisted transitively |
  | `integer \| {b: integer}` (not brace-suffixed) | `{"anyOf":[{"type":"integer"},{}]}` | `{"anyOf":[{"type":"integer"},{"$ref":"…__inline_8cc8cb1e7074a3af"}]}` |
  | `{a: integer} \| Triage` | `{"anyOf":[{},{"$ref":"…Triage"}]}` | `{"anyOf":[{"$ref":"…df817b794ef788ce"},{"$ref":"…Triage"}]}` |
  | `string \| {a: string}` (0059's d5) | `{"anyOf":[{"type":"string"},{}]}` | `{"anyOf":[{"type":"string"},{"$ref":"…__inline_968e40317188aebd"}]}` |
  | `{a: integer} \| array<integer>` (0043's i2) | `{"anyOf":[{},{"type":"array",…}]}` | `{"anyOf":[{"$ref":"…df817b794ef788ce"},{"type":"array",…}]}` |
  | `{ a: string \| null } \| {b: integer}` (shredded, brace-suffixed) | `__inline_62ad2038df56024e` | `{"anyOf":[{},{},{}]}` — WRONG → PERMISSIVE, the annotation root's own bytes |
  | `{a: integer} \| integer}` (malformed) | `__inline_1b7dfa57724a007e` | `{"anyOf":[{},{}]}` — WRONG → PERMISSIVE |
  | `{a: Ghost} \| {b: integer}`, `{a: Ghost} \| Triage`, `integer \| {b: Ghost}` | zero diagnostics, theta loads | ONE `theta/parse/unresolved-named-type` naming `Ghost`, frontmatter `null`, theta refused |

  TWO MEMBERS OF THE MOVED CLASS §Fix's table did not enumerate, both measured
  and both convergent (the position joining its three siblings, never diverging
  further):
  - **A single enclosing brace group whose FIELD type is in the moved class.**
    `p: "{m: {a: integer} | {b: integer}}"` mints `__inline_ae08c181bf6be6f8`
    at HEAD and `__inline_e6cf18116192f591` on the shipped tree — the name the
    alias RHS and the `schema` body field already mint for that text. §Fix
    constraint 1's "a source that is one enclosing brace group keeps its bytes"
    is true of the ROUTE and of every group whose field types are outside the
    moved class; constraint 3's one-source-text-one-name rule is what forces
    this one to move, since the group's own fragment content-addresses its
    fields' fragments. Witnessed by `RED (b12)`.
  - **Non-`Type` text inside a brace arm.** `p: "string | {a: ???}"` is silent
    at HEAD and is now refused `theta/load/params-type-not-expression` — this
    position's OWN registered code, the one it already raises for `{a: ???}`
    (unchanged). The alias RHS and the `schema` body field refuse the same text
    today with `theta/parse/schema-type-not-expression`; the `params:` position
    was the only silent one. The refusal fires because the hoist strips the
    arm's braces and the field's fragment arrives brace-free at bug 0059's
    judgement — the disposition that file's own rule already gives `{a: ???}`.
    Registry MOVEMENT, not a registry edit: no code, row or trigger widens.

  **Unmoved, measured not assumed:** `{a: integer, b: string}`
  (`__inline_9b890568745f5ea5`); `{a: integer, b: {x: integer, y: string}}`
  (`__inline_dd69af402813aa7d` over `__inline_c319be1cd4ab5f98`); `Triage`;
  `array<integer>`; `string | integer` (`{"type":["string","integer"]}`);
  `"x" | "y"`; the shredded non-brace-suffixed `{ a: string | null } | Triage`;
  `{}` (still `theta/parse/empty-schema-body`); every row of
  `tests/params-inline-object-lowering.test.ts` (re-verified: no fixture there
  declares a `params:` type source carrying a top-level `|`).
- **The 0059 interplay, measured** (the operator-named binding constraint):
  - `{a: Ghost} | {b: ???}` → exactly ONE diagnostic, the `Ghost`. 0059's
    `typeRefused` suppression still suppresses the default-side and junk-side
    checks.
  - `{a: Ghost} | {b: integer} = 7` → exactly ONE diagnostic, the `Ghost`; the
    five-occupant `params:` default loop stays behind the type-half refusal.
  - `{a: Ghost} | {b: Ghost}` → TWO diagnostics. NOT introduced here: the
    single-group spelling `{a: Ghost, b: Ghost}`, which is in the UNMOVED
    class, already renders two at this position at HEAD (the alias and body
    positions render one — they dedup through `collectUnresolvedNamedTypes`).
    One diagnostic per offending FIELD holds in both spellings. Pinned in both
    directions by `CONTROL (a10)` and `RED (e3)`.
- **GOV-15 enumeration (constraint 5).** Validation outcomes change, at all
  three consumers of the lowered document, for exactly the sources tabulated
  above; a `params:` union of object arms begins accepting the arms it declares
  and refusing values no arm admits. Census re-run at this HEAD over
  `git ls-files '*.theta' '*.thetalib'`: 17 files declare `params:`, 19 fields
  in total, NONE whose right-hand side carries a top-level `|` with a brace
  arm. `tests/committed-fixture-parse-gate.test.ts` (36 cells, both extensions)
  is green. `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged, decided
  by the real H9a run (11/11), not by inspection — constraint 6 holds.
- **In-tree records re-derived in the same change** (constraint 1's last
  sentence; §Fix named four, the change found and re-derived six):
  1. `params.ts` — `lowerParamsFieldType`'s freeze paragraph: bug 0097 §Fix is
     the authority lifting bug 0039 §Fix's freeze for this class, and the
     surviving invariant is stated as route-invariance plus byte identity for
     groups whose field types are outside the moved class.
  2. `params.ts` — `lowerTypeExpr`'s header: a brace-rooted GENERIC argument
     still arrives unintercepted; a brace-rooted UNION ARM of a balanced
     segment set no longer does.
  3. `body-type-lowering.ts` — `isSingleEnclosingBraceGroup`'s doc comment
     (moved with the function): no dispatch or classifier still asks the naive
     two-ended question on its own account; the predicate's own fast decline is
     the only occurrence left.
  4. `body-type-lowering.ts` — `lowerTypeSource`'s doc comment and
     `isBraceBalanced`'s (moved): the shredded-set reasoning, the
     guard-disjointness proof and the arm-order/SUBS-1 statement moved with the
     code rather than being deleted.
  5. `query-schema-lowering.ts` — the permissive-`{}` origin inventory's
     union-arm bullet, which stated "a `params:` field's `{a: integer} |
     integer` lands here, where the same text at a `lowerTypeSource` position
     does not".
  6. `theta-document.ts` — `unresolvedNamedTypeDiagnostic`'s doc comment, which
     claimed `{a: {x: Tirage} | Cat}` "stays silent" at `params:` (measured
     false now: all four positions raise for both names) and attributed
     `isBraceBalanced` to the wrong module.
- **Constraint-2 re-derivations, cell by cell** (`neither is relaxed`):
  `tests/annotation-root-brace-union-lowering.test.ts` — `CONTROL (a6)` →
  `PARITY (a6, bug 0097 §Fix)`, now asserting the `params:` document equals the
  file's own pre-existing `P1_ROOT` / `P1_DEFS` annotation-root pins (a
  STRENGTHENING: it pins cross-position parity where it pinned frozen bytes);
  the `ORACLE CROSS-CHECK`'s `params:` probe drives `{a: integer}`, a source
  that still mints, so the oracle keeps a production cross-reference at this
  position, and gains a fourth read; the `PARAMS_MISPARSE_*` fragment/canonical/
  derived-name trio and its group-(0) oracle case row are re-derived onto the
  live array-nesting shape `{m: {a: integer} | {b: integer}}` (`M_UNION_*`),
  which preserves the oracle's only canonical form nesting objects inside an
  array — and strengthens it, since that array's two elements are DISTINCT
  `$ref`s, so schema-subset.md `:104`'s lowering-order rule is now
  distinguishable from a sorted recipe (a sorted-element recipe mints
  `__inline_81da9ce2e0c8cf72`; production mints `__inline_e6cf18116192f591`);
  the header inventory line and the group-(a) framing are re-derived with them.
- **Re-derivations beyond constraint 2's enumeration — self-authorized, on the
  record.** The question I would have asked: *§Fix constraint 2 names four cells
  in one file, but the settled change also moves bytes pinned by three cells in
  two files that did not exist when this report was filed (0043's witness landed
  0.53.0, 0059's 0.86.0). May I re-derive them?* Self-authorized as COMPELLED by
  the settled §Fix rather than as a scope extension, on five independent
  sources: (1) constraint 1's table puts all three sources in the moving class —
  `string | {a: string}` is literally row 2's shape; (2) §Fix *Coordination*
  states the rule for exactly this situation ("whichever lands last re-derives
  the others' anchors and slugs in the same change") and 0097 lands last of the
  three frame-movers; (3) constraint 6 covers the newly-refused input as
  registry movement; (4) the operator's own binding instruction to MEASURE the
  0059 interplay presupposes new emissions from arm descent; (5) 0059's witness
  file states the governing rule itself — "junk inside a HOISTED field's
  brace-free type is refused" — so `string | {a: ???}` changes disposition
  because its ROUTE changed, by that file's own principle. BOUND: exactly three
  cells in two files — `union-generic-arm-lowering.test.ts` `RED (i2)`, and
  `params-scalar-nontype-text-refusal.test.ts` `d5` (bytes; re-presented as
  `MOVED (d5)` outside the byte-invariance loop, with a fourth assertion added
  pinning the hoisted body) and `d12` (re-derived as `a25` in the refusal
  family, pinning the convergence with the registry-read message). Every subject
  is preserved; nothing is relaxed, deleted or skipped. STOP VALVE, honoured: any
  further existing cell reddening would have stopped the run — none did (the
  prototype's full-suite sweep reddened exactly these three plus constraint 2's
  two, and nothing else).
- **Second self-authorization — citation correction, comment-only.** The
  question: *the move shifts line numbers cited by comments inside files this
  change already edits, and one citation now points past EOF — may I re-anchor
  them?* Self-authorized under the citation/comment-only branch on four sources:
  the pre-review-correction-round rule; bug 0134's record of the 0102 precedent
  against HALF sweeps (completing the sweep inside touched files is the
  principled boundary); the implementer having already re-anchored two citations
  in one of those files; and one citation pointing past end-of-file.
  BOUND: six citations in two files, plus two module attributions in two further
  files (`inline-object-nested-lowering.test.ts`, `discriminator-field-classifier-brace-group.test.ts`)
  falsified not by line drift but by THIS change's function move — comment text
  only, zero assertions, zero imports, zero executable lines. Everything else in
  the repo-wide `path:line` drift is bug 0134's and was left untouched.
- **Gates** (each re-run by the orchestrator, not taken on report):
  - witness — `npx vitest run tests/params-brace-union-rhs-lowering.test.ts` →
    `Test Files 1 passed (1)` / `Tests 48 passed (48)`. At HEAD, before the fix:
    `21 failed | 25 passed (46)`; with the shipped dispatch neutralised in place
    (byte-exact restore verified by `git hash-object`):
    `22 failed | 26 passed (48)`, exactly the 22 RED-labelled cells.
  - default suite — `npx vitest run` → `Test Files 303 passed (303)` /
    `Tests 4987 passed (4987)`.
  - typecheck — `npx tsc -p tsconfig.json --noEmit` → exit 0, no output.
  - lint — `npm run lint` (`eslint --no-error-on-unmatched-pattern
    "src/**/*.ts"`) → exit 0, no output.
  - live — H8a `tests/live/live-production-acceptance.test.ts` 39/39 (38 at
    HEAD + this fix's cell); H9a `tests/live/acceptance/` 11/11 across BOTH
    files (`noninteractive-acceptance` 10 + `ctor-unresolved-load-refusal` 1).
- **Tests that lock it.**
  - `tests/params-brace-union-rhs-lowering.test.ts` (NEW, 48 cells) — the
    independent SHA-256 slug oracle (12); the invariance controls including the
    pre-existing two-diagnostic posture and a default beside a union-typed param
    (11); the four-position parity table and the whole moved class (12, `b1`–
    `b12`); the real-`AjvSchemaValidator` accept/reject table with the four
    INVERTING cells and the inline-vs-named-spelling equality (2); the element-2
    table at all four positions with every message read from the registry
    (DIAG-4) (5); the 0059 interplay (4); the binder envelope and the unchanged
    rendered `Parameters:` line (2). The `schema` body field position carries no
    lowered-bytes row (§Non-goals — bug 0095's subject), only diagnostic rows.
  - `tests/live/live-production-acceptance.test.ts` — one added cell drives
    `p: "{a: integer} | {b: integer}"` through a real spawned RFC-0006 child's
    marshalled-params AJV intake: the declared SECOND arm is accepted and a
    value no arm admits is refused. Proven in both directions — with the
    dispatch neutralised it reds with the pre-fix signature
    (`GOOD=REJECTED validation BAD=ACCEPTED`).
  - Re-derived: `annotation-root-brace-union-lowering.test.ts` (33),
    `params-scalar-nontype-text-refusal.test.ts` (94),
    `union-generic-arm-lowering.test.ts` (74).
- **Review.** 3 rounds. Round 1 (deep) — FINDINGS: six, all prose/test, with the
  implementation itself certified correct and faithful (a falsified
  `theta-document.ts` record; a false single-group-byte-identity claim; two
  present-tense statements of the retired dispatch; d5's label and the file-top
  inventory; the annotation-root group-(a) framing; and the unwitnessed
  nested-depth class plus the oracle's lost array-nesting case). Round 2 (fast)
  — CLEAN, residuals: historical narration in seven added passages, and two
  module attributions in bystander files falsified by the function move. Round 3
  (fast, confirmation after the comment-only polish) — CLEAN, one cosmetic
  run-on comment line, fixed in place. A pre-review citation-correction round
  ran before round 1 and is not counted as a review round.
- **Verification.** SOLID. (1) The witness reds by neutralisation and greens by
  restore, byte-exact (`git hash-object` identical before and after), and the
  element-2 group reds under the same neutralisation — so the diagnostic half
  depends on this dispatch and not on something else. (2) Default suite green,
  run twice. (3) Live: H8a 39/39 (one documented-class ~180s stall on an
  unrelated bug-0172 cell cleared by a single isolated re-run, per protocol),
  H9a 11/11 both files; the fixed path is exercised end to end by the added
  cell, proven RED-then-GREEN through a real child. (4) `tsc` and `eslint`
  clean. Also confirmed: the committed-fixture parse gate green over `.theta`
  and `.thetalib`, and the changed-file set exactly as declared.
- **Residuals.**
  1. **This change adds shift-induced stale `path:line` citations outside the
     files it edits.** Measured: `params.ts` grew +261 lines (a +7 header edit at
     `:646` and a ~220-line insert at `:948`), `body-type-lowering.ts` shrank
     763 → 622, `query-schema-lowering.ts` grew +7 at its header. Citations into
     those regions from `tests/inline-object-duplicate-field-name.test.ts`,
     `tests/literal-union-string-enum-emission.test.ts`,
     `tests/invoke-return-enum-carrier-projection.test.ts`,
     `tests/schema-body-nontype-text-refusal.test.ts` and
     `tests/inline-object-nested-lowering.test.ts` shifted. They are bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s subject — that
     report already records 17 of 19 `params.ts` citations wrong BEFORE this
     change, and the 0102 precedent of a reverted partial sweep. Not swept here;
     no new report filed.
  2. **`src/parser/theta-document.ts:5127`'s shredded bullet is partly false,
     pre-existing.** It says `{ a: Tirage | null } | Cat` "raises none anywhere";
     measured, the outer `Cat` raises at all four positions and only the
     shard-interior `Tirage` is silent. Measures identically at HEAD, so it is
     not this change's; left for whoever owns that comment next.
  3. **The shredded segment set stays permissive and silent** — constraint 4
     and bug 0033 §Fix residual (ii), unchanged and pinned by group (h) of
     `tests/inline-object-nested-lowering.test.ts` and by `CONTROL (a4)`.
  4. **`src/parser/query-schema-resolve.ts:523`'s `startsWith("{")`** — a
     single-ended, non-lowering test the report does not name. Confirmed out of
     this class (it gates a resolve-time branch, not a type lowering) and left
     alone.
- **Discharge notes appended.**
  [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) — its
  §Fix *Residuals* (ii) names this subject and is discharged.
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  — its §Fix freeze on the `params:` position is LIFTED for the enumerated
  class by this report's authority. No other sibling doc edited.
- **Pinned dispositions / non-goals.** The `schema` body field position's parse
  capture (bug 0095, fixed 0.74.0 — which is why that position now RAISES for a
  name in an arm where this report measured `empty-schema-body` at 0.58.0; the
  witness pins the current disposition and the position still carries no
  lowered-bytes parity row); `classifyDiscriminatorFieldType`'s copy of the
  naive test (bug 0096, fixed 0.73.0); the `params:` literal sublanguage (0056)
  and non-`Type` scalar text (0059), both landed and both disjoint from this
  class; the permissive-`{}` inventory question (bug 0028); the empty inline
  object `p: "{}"` (bug 0045).

## Non-goals

- **The `params:` literal sublanguage.** `p: '"x" | "y"'` and `p: '"x"'` keep
  whatever [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
  settles; a literal union has no brace arm and never enters this fix's arm
  path.
- **A `params:` scalar carrying text no `Type` production spells.**
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s
  subject, same frame, disjoint class.
- **The `schema` body field position's parse capture.**
  `schema S { f: {a: integer} | {b: integer} }` loses its field list before any
  lowering runs and reports `theta/parse/empty-schema-body`; that is
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)'s subject.
  This fix changes nothing there and the position stays absent from the
  four-position parity table's lowered-bytes rows.
- **The shredded segment set's permissive lowering.** `{ a: string | null } | Triage`
  stays per-segment-permissive and silent at every position, guarded by
  `isBraceBalanced`; that is bug 0033 §Fix residual (ii)'s subject and bug 0039
  §Fix's group-(h) pin (`tests/inline-object-nested-lowering.test.ts:1914–2041`).
- **`classifyDiscriminatorFieldType`'s copy of the naive test.**
  `src/parser/theta-document.ts:5822` carries the same two-ended test ahead of
  its own `|` split; it classifies discriminator candidates rather than
  lowering, and is
  [0096](./0096-discriminator-field-classifier-naive-brace-test.md)'s subject
  (bug 0053 §Fix residual (i)).
- **The empty inline object.** `p: "{}"` is refused at parse since 0.57.0 (bug
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md));
  `isSingleEnclosingBraceGroup("{}")` is true, so the fix does not reach it.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments is
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory question.

## Provenance

- Origin: bug
  [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) §Fix
  (0.58.0) *Residuals* (ii) (`:723–727`), recorded when that fix landed and
  left unfiled. This report files it, re-derives it at HEAD `8258e547`, and
  adds what the residual does not state: element 2 (the `params:` position of
  the `unresolved-named-type` row under-emitting, and its reach beyond the
  brace-suffixed subset), the spacing / arm-count / nested / malformed / shredded
  members of the input class with their minted slugs, the AJV accept/reject
  table at the argument boundary, the binder-envelope reach, and the
  enumeration of which frozen bytes and which pinned rows a fix moves.
- Spec: `docs/spec_topics/grammar.md:94` (`Type "|" Type`, right-associative),
  `:101` (`ObjectType` as a `Type`), `:105` (the bare-`Type` position list,
  `params:` field types named), `:109` (§Inline object types, recursive field
  `Type`); `docs/spec_topics/schema-subset.md:73` (step 2 — the
  `__inline_<slug>` hoist and its byte-identity dedup), `:76` (step 3 — the
  `$ref` emission), `:81` ([SUBS-1](../spec_topics/schema-subset.md#subs-1)),
  `:82` (discriminated object union), `:85` (*Array element order*), `:98`
  (canonical hash step 1 — the slug is a function of the lowered fragment);
  `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
  position); `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` (AJV
  validation at invocation), `:58` (the type side);
  `docs/spec_topics/diagnostics/code-registry-parse.md:90`
  (`theta/parse/unresolved-named-type`, the five-position row, `params:`
  first); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15), `:9` (the loads-cleanly predicate), `:25` (the diagnostic-registry
  carve-out).
- Implementation evidence at HEAD `8258e547`: `src/parser/params.ts:183`
  (`parseParams`'s per-field call), `:204–211` (the diagnostic loop),
  `:465–470` (`lowerTypeExpr`'s own statement that a brace-rooted union arm
  arrives unintercepted), `:472–587` (`lowerTypeExpr`: `:483–498` the union
  split, `:549–555` the identifier arm and the `unresolved` append, `:584–586`
  the catch-all), `:620–624` (why the shared hoist lives in this module),
  `:637–643` (`hoistInlineObjectType`'s `lowerFieldType` contract),
  `:652–744` (the hoist itself: `:659` the `"angle-and-brace"` interior split,
  `:660` `topLevelColon`, `:669` the per-field recursion, `:676–681` the
  fragment and its content addressing), `:755–759` (the frozen-bytes comment),
  `:761–770` (`lowerParamsFieldType`), `:766` (the naive test);
  `src/parser/body-type-lowering.ts:15–22` (the one-way import), `:176–207`
  (`isSingleEnclosingBraceGroup`'s doc comment, `:201–206` naming
  `params.ts:766`), `:208–238` (the predicate), `:273` (`isBraceBalanced`),
  `:347` (`lowerTypeSource`), `:372–383` (its literal sublanguage), `:415–417`
  (the single-group dispatch), `:419–432` (the per-arm union dispatch), `:434`
  (the delegation), `:704–719` (`collectUnresolvedNamedTypes` and its corrected
  dispatch at `:715`); `src/runtime/query-schema-lowering.ts:60–81` (the
  permissive-`{}` origin inventory, union-arm bullet `:62–72`), `:151–156` (the
  annotation root's corrected dispatch), `:160` (the arm it falls through to);
  `src/extension/production-theta-producer.ts:709–712`, `:1173`, `:1968–1975`
  (the three consumers of the lowered params document);
  `src/binder/binder-envelope.ts:86–89`, `:137–157` (`relaxParamsSchema`),
  `:166–170` (`BypassParamsField.type`);
  `src/binder/binder-system-prompt.ts:151–164` (`renderBinderParamLine`),
  `:200–207` (the `Parameters:` block);
  `src/parser/theta-document.ts:5822` (the classifier's third copy of the naive
  test, out of scope).
- Test evidence at `8258e547`:
  `tests/annotation-root-brace-union-lowering.test.ts:329–337` (the mis-parse
  fragment, its canonical form and derived name), `:623` (its oracle case row),
  `:673–681` (the `params:` mint inside the oracle cross-check), `:782–801`
  (CONTROL a6, the frozen `params:` document), `:113–114` (the header
  inventory's statement of the frozen row);
  `tests/params-inline-object-lowering.test.ts` (bug 0035's lock over this
  position — no fixture's type source carries a top-level `|`);
  `tests/inline-object-nested-lowering.test.ts:1914–2041` (group (h), the
  shredded-segment guard in both directions);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures; the census found 17 files declaring `params:` and none
  declaring a union with a brace arm).
- Reproduction: scratch vitest at `8258e547` — the four positions over
  `{a: integer} | {b: integer}`; the eight-row brace-suffixed family at
  `params:` with its minted slugs; the primitive-tailed and named-arm rows; six
  controls including the cross-position slug agreement for a nested single
  group; real `AjvSchemaValidator` compiles of the mis-parsed and named-alias
  `params:` documents; the four-position element-2 table; and the recorded
  `BypassParamsField`, rendered `Parameters:` line and built binder envelope.
  Run on the outputs quoted above, then deleted per scratch policy.
