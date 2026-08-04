# Bug 0053 — `lowerQueryResponseSchema`'s root brace dispatch is a prefix/suffix test, so a top-level union of object arms is read as ONE inline field list: `@<{a: integer} | {b: integer}>` lowers an enforcing fragment requiring a field `a` whose type asserts nothing, QRY-22 refuses `{"b":1}` and accepts `{"a":null}`, and the identical dispatch in `collectUnresolvedNamedTypes` swallows the `theta/parse/unresolved-named-type` a name in either arm owes — at the `@<T>` annotation and the alias RHS alike

- **Status:** fixed (0.58.0).
- **Kind:** defect, two elements on one mechanism at two dispatch sites.
  (1) *A silently wrong lowering at the one position that enforces it.*
  grammar.md `:94` admits `Type "|" Type` with `Type` recursive and `:101`
  admits `ObjectType` as a `Type`, so `{a: integer} | {b: integer}` is a
  two-arm union; schema-subset.md `:81` (SUBS-1) requires a union with a
  non-primitive arm to lower to `{"anyOf": [...]}` and `:73`/`:76` hoist each
  inline object arm under `__inline_<slug>` with a `$ref` at its use.
  `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:139`)
  instead tests `s.startsWith("{") && s.endsWith("}")` and hands the whole
  interior to `lowerInlineObject` as a field list, minting an object fragment
  whose one property `a` has type `integer} | {b: integer` and whose
  `required` and `additionalProperties: false` then enforce it. No spec text
  defines that fragment. (2) *A closed-registry diagnostic under-emits on the
  same predicate.* `collectUnresolvedNamedTypes`
  (`src/parser/body-type-lowering.ts:679`) carries the identical test, so a
  `NamedType` written inside either arm resolves against nothing and raises
  nothing at the `@<T>` annotation position AND at the alias RHS, where
  `theta/parse/unresolved-named-type`'s row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:89`) names both.
  Appending ` | integer` to the same source removes the trailing `}` and both
  elements disappear.
- **Related:**
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — this report files 0039 §Fix (0.49.0) residual (ii), re-derived at HEAD.
    0039's parts A and B gave `lowerTypeSource` the two structural guards
    (`isSingleEnclosingBraceGroup`, `src/parser/body-type-lowering.ts:197`;
    `isBraceBalanced`, `:262`) and the per-arm union path (`:398–411`) that
    lower this shape correctly at every position routing through it, and
    scoped the annotation root out by name: its §Fix blast-radius list ends
    "Unmoved: … and the annotation ROOT's naive brace dispatch (fixture G1)".
    Part A did close one thing at this site — a source whose mis-parsed
    interior carries a nested comma no longer mints a phantom top-level field
    (fixture G7, pinned as `a9b`,
    `tests/inline-object-nested-lowering.test.ts:961`). This report also
    corrects 0039 §Fix's "Newly-refused inputs" clause "a name inside a
    brace-group union ARM of a balanced segment set — at the `@<T>` and
    alias-RHS positions": that holds only where the whole source is not
    `{`-prefixed and `}`-suffixed. `@<integer | {b: Ghost}>` and
    `schema X = {a: Ghost} | integer` raise; `@<{a: integer} | {b: Ghost}>`
    and `schema X = {a: integer} | {b: Ghost}` do not (element 2).
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — the other
    arm-precedence defect on a union of non-primitive arms, in
    `lowerTypeExpr`'s generic-application frame (`src/parser/params.ts:387–402`
    at HEAD; 0043 cites `:360–375` against its own 0.45.0 baseline), which
    fires on a trailing `>`. The two frames are disjoint by their own
    predicates: a source ending `}` never satisfies `s.endsWith(">")`, and a
    source ending `>` never satisfies this report's `s.endsWith("}")`. Neither
    fix orders before the other. 0043's §Non-goals already excludes the
    inline-object arm and points here through 0039.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — the
    origin of `collectUnresolvedNamedTypes` and of the permissive-`{}`
    inventory in `src/runtime/query-schema-lowering.ts:25–74`, whose
    four-origin enumeration this fix re-derives.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — added the
    alias/union RHS as the fifth position of the `unresolved-named-type` row;
    element 2 is that position under-emitting.
- **Affected** (citations verified at HEAD `52e257bc`, 0.49.0):
  - `src/runtime/query-schema-lowering.ts:139–144` — the frame. The guard is
    `if (s.startsWith("{") && s.endsWith("}"))` over the trimmed annotation,
    with no check that the `{` at index 0 is closed by the `}` at the final
    index. `{a: integer} | {b: integer}` satisfies it, so `s.slice(1, -1)` —
    `a: integer} | {b: integer` — is handed to `lowerInlineObject` as a field
    list and its fragment is returned as the document root through
    `pruneDocumentDefs`.
  - `src/runtime/query-schema-lowering.ts:148` — the arm the guard pre-empts.
    `lowerTypeSource` already holds the structural predicate this position
    needs and lowers the same text correctly (fixture P2b below).
  - `src/parser/body-type-lowering.ts:197–227` —
    `isSingleEnclosingBraceGroup`, a depth walk that skips quoted regions and
    returns true only when the index-0 `{` closes at the final index. Its doc
    comment (`:173–196`) states this exact hazard: "both seams need it rather
    than a naive `startsWith("{") && endsWith("}")`, which also matches
    `{a: integer} | {b: integer}`" — and names the resulting fragment "the
    silently WRONG lowering bug 0039 §Fix constraint 1 forbids". The predicate
    is module-private at HEAD; `lowerTypeSource` is its only caller.
  - `src/parser/body-type-lowering.ts:398–411` — the per-arm union path:
    admitted when every `|` segment is brace-balanced (`isBraceBalanced`,
    `:262`) and at least one segment is a single enclosing brace group, each
    such arm hoisting through `hoistInlineObjectType` and the rest lowering
    through `lowerTypeExpr`, combined by `lowerUnion`. This is the route the
    alias RHS and every non-brace-suffixed annotation take.
  - `src/parser/body-type-lowering.ts:151–171` — `lowerInlineObject`, which
    the root dispatch calls. Its interior split is
    `splitTopLevel(body, ",", "angle-and-brace")` (`:158`, bug 0039 part A),
    so a mis-parsed interior carrying a nested comma no longer yields a second
    entry; `topLevelColon` still splits the one entry at its first depth-0
    colon, yielding the field `a`, and `lowerObjectFields` (`:109`) marks
    every field it is handed `required` and sets `additionalProperties: false`.
  - `src/parser/body-type-lowering.ts:670–685` —
    `collectUnresolvedNamedTypes`, element 2's frame. `:679` repeats the same
    prefix/suffix test, and its doc comment (`:663–668`) records the coupling:
    "the same root-level split `lowerQueryResponseSchema` makes". A
    brace-rooted union therefore reaches `lowerInlineObject`, whose single
    field's type source (`integer} | {b: Ghost`) splits into unbalanced
    segments, declines the arm path and lands on `lowerTypeExpr`'s catch-all,
    which resolves no name.
  - The two production call sites element 2 reaches, both in
    `src/parser/theta-document.ts`: `:6162` (the `@<T>` annotation, via
    `queryResponseAnnotation` at `:4855`) and `:5512` (the alias/union RHS,
    over `s.arms.join(" | ")`). Both emit through
    `unresolvedNamedTypeDiagnostic` (`:4805`).
  - Blast radius of the wrong root fragment — one lowering, four consumers.
    `src/extension/production-theta-producer.ts:2314` lowers once and feeds
    the validation collaborator, the respond-tool registration and the QRY-15
    template (`:2344`); `src/runtime/typed-query-validation.ts:196` derives
    the wire schema and `:219–221` validates against the bare lowered schema;
    `:194` / `:347` derive the registered `__theta_respond_<slug>` name from
    the lowered bytes; `src/runtime/respond-tool-wire.ts:91` returns an
    object-rooted lowering verbatim (`rootIsArgumentObjectSatisfiable`,
    `:55–70`), so the wrong fragment is also the shape the model is shown.
    `production-theta-producer.ts:3308` repeats the lowering at the
    `invoke<T>` return-value boundary.
  - `tests/inline-object-nested-lowering.test.ts:933` (`a9`, fixture G1) and
    `:961` (`a9b`, fixture G7) — the two pins that assert the current bytes.
    Both are labelled pre-existing and out of scope for bug 0039; `a9` is
    labelled CONTROL. The file header (`:148–159`) states the coupling: "The
    `@<T>` annotation root (a9) keeps its pre-existing enforcing fragment for
    that same source because `lowerQueryResponseSchema`'s own ROOT brace
    dispatch decides before this lowering is reached, and bug 0039 does not
    touch that dispatch."
  - `src/runtime/query-schema-lowering.ts:25–74` — the permissive-`{}` origin
    inventory. Its catch-all bullet (`:57–74`) states at `:67–71` that "every
    OTHER brace-rooted type position, at any depth of inline-object FIELDS,
    hoists through the arm `lowerTypeSource` shares with the `params:`
    position, and the annotation root lowers through `lowerInlineObject`",
    which is where the divergence is recorded rather than reported.
  - Not affected: an annotation that IS a single enclosing brace group
    (`@<{a: integer, b: string}>`, `@<{a: integer, b: {x: integer, y: string}}>`,
    `@<{}>`) — those keep bug 0039's post-fix bytes; a named annotation
    (`@<X>`), which resolves through `bodyTypeMap` at `:118–123` before the
    brace test; the `schema` body field position, which refuses
    `schema S { p: {a: integer} | {b: integer} }` at parse with
    `theta/parse/empty-schema-body`; the `params:` right-hand side, whose own
    naive test (`src/parser/params.ts:611`) 0039 §Fix freezes deliberately.
- **Observed at:** `0.49.0` (HEAD `52e257bc`). Offline, deterministic, no live
  model and no provider: scratch vitest over `parseThetaDocument` (the real
  load path, `tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`,
  `collectUnresolvedNamedTypes`, `respondToolWireSchema`, `respondSchemaSlug`
  and the production `AjvSchemaValidator`; written, run, deleted.

## Summary

A `@<T>` annotation carries a bare `Type` (grammar.md `:105`, type-system.md
`:15`), and `Type "|" Type` over `ObjectType` arms is ordinary grammar. The
annotation lowering asks whether that `Type` is an inline object by testing the
first and last characters of the source. A top-level union of object arms
answers yes, because its first arm opens the source and its last arm closes it.

The interior is then read as a field list it is not. For
`{a: integer} | {b: integer}` the one entry is `a: integer} | {b: integer`,
which `topLevelColon` splits into the field `a` with type source
`integer} | {b: integer`. That type source is two unbalanced segments, so it
lowers `anyOf: [{}, {}]`. The fragment returned as the response schema is:

```
{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}
```

It requires a property `a` the author declared as one alternative among two,
constrains that property to nothing, and refuses every other property. QRY-22
validates the model's reply against it and the respond tool is registered with
it verbatim, so a reply matching the author's second arm (`{"b":1}`) is
refused and `{"a":null}` — matching neither arm — binds.

The same predicate governs the name walk. `collectUnresolvedNamedTypes` splits
the identical way, so a `NamedType` inside either arm reaches no resolution and
raises no `theta/parse/unresolved-named-type`, at the `@<T>` annotation and at
the alias RHS both.

The dispatch is decided by the source's last character. Appending ` | integer`
to the same annotation removes the trailing `}`, routes the source through
`lowerTypeSource`, and produces the SUBS-1 lowering with both object arms
hoisted and the name inside them raised. Writing the same union at the alias
RHS and referring to it by name (`@<X>`) also produces the correct lowering.
Two spellings an author reads as equivalent differ between enforcing a shape
nobody wrote and enforcing the declared one.

## Reproduction

Offline at HEAD `52e257bc`. Probe output quoted verbatim. `Ghost` is declared
nowhere.

**(1) The annotation root — `lowerQueryResponseSchema(annotation, [])`.**

```
P1  {a: integer} | {b: integer}            :: {"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}
P2  integer | {b: integer}                 :: {"anyOf":[{"type":"integer"},{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}],"$defs":{"__inline_8cc8cb1e7074a3af":{"type":"object","properties":{"b":{"type":"integer"}},"required":["b"],"additionalProperties":false}}}
P2b {a: integer} | {b: integer} | integer  :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"},{"type":"integer"}],"$defs":{"__inline_df817b794ef788ce":{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false},"__inline_8cc8cb1e7074a3af":{"type":"object","properties":{"b":{"type":"integer"}},"required":["b"],"additionalProperties":false}}}
```

P2b is P1 with a third arm appended. The two object arms it shares with P1
hoist and `$ref`, so the lowerer derives the correct shape for that text; only
the root dispatch prevents P1 from reaching it.

Variants of P1 that reach the same fragment — the predicate is insensitive to
spacing and to arm count:

```
V1  " {a: integer} | {b: integer}"                :: identical to P1
V2  "{a: integer} | {b: integer} "                :: identical to P1
V3  "{a: integer}|{b: integer}"                   :: identical to P1
V4  {a: integer} | {b: integer} | {c: integer}    :: {"type":"object","properties":{"a":{"anyOf":[{},{},{}]}},"required":["a"],"additionalProperties":false}
```

The load path reaches the dispatch with the same text: parsing
``let r = @<{a: integer} | {b: integer}>`hi` `` loads with zero diagnostics and
captures `expr.schema` as `{a:integer}|{b:integer}`.

Fixture G7, one nesting level deeper, is the shape bug 0039 part A moved:

```
P7  {x: {p: integer, q: boolean}} | {y: string}   :: {"type":"object","properties":{"x":{"anyOf":[{},{}]}},"required":["x"],"additionalProperties":false}
```

Before 0039 the nested comma cut a second entry out of the mis-parsed interior
and minted a phantom top-level `q` (`properties {"x":{},"q":{"anyOf":[{},{}]}}`,
`required ["x","q"]`). The phantom is gone; the mis-parse is not.

Controls — a genuine single enclosing brace group is unchanged:

```
P8  {a: integer, b: string}                :: {"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false}
P8b {a: integer, b: {x: integer, y: string}} :: {"type":"object","properties":{"a":{"type":"integer"},"b":{"$ref":"#/$defs/__inline_c319be1cd4ab5f98"}},"required":["a","b"],"additionalProperties":false,"$defs":{"__inline_c319be1cd4ab5f98":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"string"}},"required":["x","y"],"additionalProperties":false}}}
```

**(2) The same union at the other positions — `parseDoc` over the real load
path, reading the lowered `params:` document for `s: X`.**

```
P3  schema X = {a: integer} | {b: integer}   diags []
    lowered :: {"type":"object","properties":{"s":{"$ref":"#/$defs/X"}},"required":["s"],"additionalProperties":false,"$defs":{"X":{"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}]},"__inline_df817b794ef788ce":{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false},"__inline_8cc8cb1e7074a3af":{"type":"object","properties":{"b":{"type":"integer"}},"required":["b"],"additionalProperties":false}}}
P3b @<X> for that same decl :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}],"$defs":{…both fragments…}}
P4  schema S { p: {a: integer} | {b: integer} }
    diags :: ["error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated."]
P4b params: p: "{a: integer} | {b: integer}"   diags []
    lowered :: {"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_abb2fcd8521f6115"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_abb2fcd8521f6115":{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}}}
```

P3 and P3b are the correct lowering, reached through
`body-type-lowering.ts:398–411`. P3b is the decisive contrast: naming the union
and writing `@<X>` gives the author the declared shape; writing the same text
inline does not. P4 shows the `schema` body field position refuses this shape
at parse, so it has no lowered bytes to compare. P4b is the `params:`
position's own naive read, which bug 0039 §Fix freezes deliberately
(`src/parser/body-type-lowering.ts:191–195`) and which no test pins.

**(3) QRY-22 through the production `AjvSchemaValidator`, compiled over P1.**

```
{"a":1}                 -> {"ok":true}
{"b":1}                 -> {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/required","keyword":"required","message":"must have required property 'a'","params":{"missingProperty":"a"}},{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","message":"must NOT have additional properties","params":{"additionalProperty":"b"}}]}
{"a":"not an integer"}  -> {"ok":true}
{"a":{"deep":true}}     -> {"ok":true}
{"a":null}              -> {"ok":true}
{"a":1,"b":1}           -> {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","message":"must NOT have additional properties","params":{"additionalProperty":"b"}}]}
```

`{"b":1}` is the author's second arm and is refused. `{"a":null}`,
`{"a":"not an integer"}` and `{"a":{"deep":true}}` match neither arm and bind.
The validator emitted no diagnostics.

**(4) The wire shape and the respond-tool name.**

```
respondToolWireSchema(P1)  :: {"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}
respondSchemaSlug(P1)      :: 81e7d0e308042785
respondToolWireSchema(P2b) :: {"type":"object","properties":{"value":{"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"},{"type":"integer"}]}},"required":["value"],"$defs":{…both fragments…}}
respondSchemaSlug(P2b)     :: 9c0dfe304992daaf
```

P1's root is `type: "object"`, so `rootIsArgumentObjectSatisfiable` returns
true and the tool registers with the wrong fragment verbatim. An `anyOf` root
is not argument-object-satisfiable, so the corrected lowering registers under
the `value` envelope.

**(5) The name walk — `collectUnresolvedNamedTypes(source, {Triage})`, then
the load path.**

```
W  {a: integer} | {b: integer}           :: []
W  {a: Ghost} | {b: integer}             :: []
W  {a: integer} | {b: Ghost}             :: []
W  {a: integer} | {b: Ghost} | integer   :: ["Ghost"]
W  integer | {b: Ghost}                  :: ["Ghost"]
W  {a: Ghost}                            :: ["Ghost"]
W  {a: integer, b: Ghost}                :: ["Ghost"]
```

At the `@<T>` annotation position, `parseDoc` over
``let r = @<T>`hi` ``:

```
@<{a: integer} | {b: Ghost}>            diags :: []
@<{a: integer} | {b: Ghost} | integer>  diags :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
@<integer | {b: Ghost}>                 diags :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
@<{a: Ghost}>                           diags :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
```

At the alias RHS, `parseDoc` over `schema X = …` with `params: s: X`:

```
schema X = {a: integer} | {b: Ghost}            diags :: []
   lowered $defs.X :: {"anyOf":[{"$ref":"#/$defs/__inline_df817b794ef788ce"},{"$ref":"#/$defs/__inline_88ec7edfebdec3e7"}]}   (__inline_88ec7edfebdec3e7 = {"type":"object","properties":{"b":{}},"required":["b"],"additionalProperties":false})
schema X = integer | {b: Ghost}                 diags :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
schema X = {a: Ghost} | integer                 diags :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
schema X = {a: integer} | {b: Ghost} | integer  diags :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
```

The alias RHS lowers the arm correctly and still raises nothing: the lowering
runs through `buildBodyTypeSchemas`, the name walk through
`collectUnresolvedNamedTypes`, and only the second carries the naive dispatch.
The silence is exactly the `{`-prefixed-and-`}`-suffixed subset.

## Expected behaviour

- grammar.md `:94` (`Type "|" Type`, recursive) and `:101`
  (`ObjectType` is a `Type`): `{a: integer} | {b: integer}` is a two-arm union
  of object types, not one object type. grammar.md `:105` and type-system.md
  `:15` put the same `Type` grammar in the `@<T>` ascription position
  (query-forms.md `:57`, QRY-4) as in the alias RHS, so one type expression
  lowers identically at both.
- schema-subset.md `:81` (SUBS-1): a union with a non-primitive arm lowers to
  `{"anyOf": [...]}`, arms in source order; `:82` names the object-union case
  explicitly. schema-subset.md `:73` (step 2) hoists each inline object arm
  into `$defs` under `__inline_<slug>` and `:76` (step 3) emits
  `{"$ref": "#/$defs/<Name>"}` at its use. So `@<{a: integer} | {b: integer}>`
  lowers to the document P3b already produces for the same text through a
  named alias: an `anyOf` of two `$ref`s with both fragments closed under
  `$defs`.
- QRY-22 (`docs/spec_topics/query/query-failure-and-repair.md:78`): the
  runtime validates the reply against the declared shape. `{"a":1}` and
  `{"b":1}` both validate; `{"a":null}`, `{"a":"not an integer"}`,
  `{"a":{"deep":true}}` and `{"c":3}` do not. Cell `e5` in
  `tests/inline-object-nested-lowering.test.ts:1347–1359` already asserts that
  accept/reject table for the identical text at the alias position.
- `code-registry-parse.md:89`: a `NamedType` resolving to no declaration
  raises exactly one `theta/parse/unresolved-named-type` at each of the row's
  five positions, at error severity, with the theta refused.
  `{a: integer} | {b: Ghost}` raises at the `@<T>` annotation and the alias
  RHS byte-identically to what `integer | {b: Ghost}` raises there today.
- Unchanged: a single enclosing brace group at the annotation root keeps its
  object-rooted lowering (`@<{a: integer, b: string}>` stays P8, not a `$ref`
  into `$defs`), because the root position is the one place the fragment is
  the document root; `@<{}>` keeps its present disposition (bug
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)); a
  shredded segment set (`{ a: string | null } | Cat`) keeps its permissive
  per-segment `anyOf`.

## Actual behaviour / root cause

**One predicate, two copies.**

`lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:105`)
dispatches in three arms: a bare identifier resolved against `bodyTypeMap`
(`:118–123`), a brace-rooted inline object (`:139–144`), and everything else
through `lowerTypeSource` (`:148`). The second arm's guard is

```ts
if (s.startsWith("{") && s.endsWith("}")) {
  return pruneDocumentDefs(
    lowerInlineObject(s.slice(1, -1), bodyTypeMap, undefined, sinks),
    s,
  ) as LoweredSchema;
}
```

The test is positional, not structural: a `{` at index 0 and a `}` at the last
index. Every top-level union whose first and last arms are object types
satisfies it, because the first arm's opening brace and the last arm's closing
brace are the source's endpoints. `s.slice(1, -1)` then strips one brace from
each end and hands the remainder to `lowerInlineObject` as a field list.

What comes back is determined by `lowerInlineObject`'s own two steps.
`splitTopLevel(body, ",", "angle-and-brace")` (`:158`) yields ONE entry for
`a: integer} | {b: integer` — bug 0039 part A is what makes this one entry
rather than two whenever a nested comma is present (fixture G7). `topLevelColon`
splits that entry at its first depth-0 colon, so the field is `a` with type
source `integer} | {b: integer`. `lowerObjectFields` (`:109`) lowers that type
source through `lowerTypeSource`, which splits it into the segments `integer}`
and `{b: integer`; `isBraceBalanced` (`:262`) rejects both, so the arm path
declines and `lowerTypeExpr` lowers each segment to `{}` on its trailing
catch-all. `lowerObjectFields` marks the field `required` and sets
`additionalProperties: false`, producing P1.

**The predicate the position needs already exists.**
`isSingleEnclosingBraceGroup` (`src/parser/body-type-lowering.ts:197`) walks
brace depth, skips quoted regions, and returns true only when the index-0 `{`
closes at the final index. Its doc comment (`:173–196`) names this source, this
fragment and this hazard, and was written for bug 0039's two seams; it is
module-private, and `lowerTypeSource` is its only caller. `lowerTypeSource`
(`:335`) asks it of the whole source (`:394`) and then of each `|` segment
(`:398–411`), which is why every position routing through that function — the
alias RHS, the `schema` body field type, and any annotation whose source is not
`{`-prefixed-and-`}`-suffixed — lowers the union correctly.

**Why the annotation root is the position that ends up wrong rather than
permissive.** It is the one position where an inline-object fragment is the
document root rather than a field's type. Nothing downstream distinguishes a
derived fragment from a mis-parsed one:
`src/extension/production-theta-producer.ts:2314` performs the lowering once
and hands the same object to the validation collaborator, the respond-tool
registration and the QRY-15 template (`:2344`);
`src/runtime/typed-query-validation.ts:196` derives the wire schema and
`:219–221` validates against the lowered schema itself;
`src/runtime/respond-tool-wire.ts:91` passes an object root through verbatim;
and `production-theta-producer.ts:3308` repeats the lowering at the
`invoke<T>` return boundary.

**Element 2 is the same predicate in the walker.**
`collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts:670`) exists
to collect names, not fragments, but it collects them BY lowering: `:679`
dispatches a brace-rooted source to `lowerInlineObject` and everything else to
`lowerTypeSource`, threading an `unresolved` sink. Its doc comment (`:663–668`)
states the copy is deliberate — "the same root-level split
`lowerQueryResponseSchema` makes". So for a brace-rooted union the walk
reproduces the mis-parse: the single field's type source is a shredded segment
set, `lowerTypeExpr` lowers each segment on its catch-all without reaching the
identifier arm, and no name is appended. Both production call sites inherit
this — `theta-document.ts:6162` for the `@<T>` annotation and `:5512` for the
alias RHS — which is why the alias position lowers the arms correctly through
`buildBodyTypeSchemas` while its diagnostic stays silent.

**Why the `params:` position is not part of this.**
`lowerParamsFieldType` (`src/parser/params.ts:606–615`) carries the same naive
test at `:611`, and bug 0039 §Fix froze that position's bytes byte-for-byte, so
`p: "{a: integer} | {b: integer}"` hoists one fragment whose sole property is
`a` (P4b). That is recorded at `src/parser/body-type-lowering.ts:191–195` and
is out of scope here.

## Why it matters

- The annotation root is where a lowering defect becomes an ENFORCED contract
  rather than an absent one. A permissive `{}` validates everything; this
  fragment refuses the author's second arm. A theta declaring
  `@<{ok: string} | {error: string}>` and receiving the error variant
  terminates as `Err(QueryError { kind: "validation", cause: "schema_validation" })`
  after QRY-11 exhausts its attempts, and every repair turn shows the model
  the same wrong shape (`respondToolWireSchema(P1)`), so repair drives towards
  a payload the theta cannot use.
- The accepted set is wrong in the other direction too. `{"a":null}` and
  `{"a":{"deep":true}}` match neither declared arm and bind as the typed
  value, because the mis-parsed field's type lowers `anyOf: [{}, {}]`.
- The same lowering governs `invoke<T>` return values
  (`production-theta-producer.ts:3308`), so a callee returning the second arm
  of a declared union is refused as
  `InvokeInfraError { cause: "return_validation" }`.
- The defect is decided by the source's last character, and nothing surfaces
  the distinction. `@<{a: integer} | {b: integer}>` and
  `@<{a: integer} | {b: integer} | integer>` differ between an enforcing wrong
  fragment and the SUBS-1 lowering; so do the inline spelling and the
  `schema X = …` + `@<X>` spelling of the same union. type-system.md `:15` is
  what an author relies on when moving a type expression between positions.
- Two of the five positions of a closed DIAG-2 row under-emit for this input
  class, so the row over-states what the implementation does, and a typo
  inside a union arm refuses the theta or not depending on whether a
  primitive arm happens to be written last.
- The failure is invisible at authoring time: every fixture in §Reproduction
  that carries the defect loads with zero diagnostics. The symptom surfaces at
  query time as a validation failure against a schema the author cannot find
  in their source.
- No gate scores it. `a9` and `a9b`
  (`tests/inline-object-nested-lowering.test.ts:933`, `:961`) pin the wrong
  bytes as current behaviour, and no committed `.theta` or `.thetalib` fixture
  carries a brace-rooted union of object arms, so
  `tests/committed-fixture-parse-gate.test.ts` never witnesses it.

## Fix

Replace the root dispatch's prefix/suffix test with the structural predicate
the shared lowering already owns, at both copies.

**A — the annotation root.** At
`src/runtime/query-schema-lowering.ts:139`, guard the inline-object arm with
`isSingleEnclosingBraceGroup` (`src/parser/body-type-lowering.ts:197`, exported
for this caller) instead of `s.startsWith("{") && s.endsWith("}")`. A source
that is one enclosing brace group keeps today's route — `lowerInlineObject`
over its interior, the fragment returned as the document root — so every
single-group annotation is byte-unchanged. Everything else falls through to
`lowerTypeSource` at `:148`, which splits the top-level union, hoists each
brace-group arm and combines through `lowerUnion` (`:398–411`), producing the
document P3b already produces for the named spelling.

**B — the name walk.** Apply the same substitution at
`src/parser/body-type-lowering.ts:679` in `collectUnresolvedNamedTypes`. Part A
alone leaves the annotation lowering the declared shape while a name inside
either arm stays silent at both the `@<T>` and alias-RHS positions, which is a
worse asymmetry than the present one: the fragment would carry a `$ref` to a
fragment whose field lowers `{}` for a name that resolves nowhere, with no
diagnostic. The two parts land together.

Neither part is new machinery. The predicate, the balanced-segment guard and
the per-arm hoist all shipped with bug 0039; this fix routes two callers
through them.

Constraints on any implementation:

- **The respond-tool wire shape moves, and the move must be assessed before
  landing.** For every affected annotation the lowered root changes from
  `type: "object"` to `anyOf`, so `rootIsArgumentObjectSatisfiable`
  (`src/runtime/respond-tool-wire.ts:55–70`) flips from true to false and the
  respond tool registers under the single-property `value` envelope (`:91`)
  instead of passing the fragment through verbatim. The QRY-15 initial
  instruction and the QRY-12 follow-ups carry the envelope with it
  (`query-tool-loop.md:20`, `:37`; `query-failure-and-repair.md:42` — the
  `<schema-json>` interpolation is over the wire schema). Both forms are
  specified; which annotations cross is enumerated in the fix's evidence
  rather than discovered by users. The registered tool name changes with the
  bytes: `respondSchemaSlug` (`src/runtime/typed-query-validation.ts:347`,
  called at `:194`) gives `81e7d0e308042785` for P1 today.
- **Payloads that validated will start failing, and the reverse.** `{"a":null}`
  and `{"a":"not an integer"}` are refused after the fix and route through
  QRY-11 repair; `{"b":1}` is accepted where it is refused today. This changes
  runtime outcomes for thetas that load unchanged. That is the QRY-22
  correction, and the affected shapes belong in the fix's evidence.
- **The `a9` and `a9b` pins move by design, and bug 0039's witness
  pre-authorizes nothing.** `tests/inline-object-nested-lowering.test.ts:933`
  (`a9`, fixture G1) asserts P1 with the rationale "pre-existing and out of
  scope for bug 0039", and `:961` (`a9b`, fixture G7) asserts P7 with the same
  caveat; 0039 §Fix lists the annotation root's naive brace dispatch among the
  shapes its change leaves UNMOVED. Both pins are re-derived under this
  report's authority — `a9` to the P2b-shaped `anyOf` over two hoisted arms,
  `a9b` to the corresponding two-arm document — and neither is relaxed. The
  file header's coupling paragraph (`:148–159`) is re-derived with them.
- **A shape the lowering cannot derive stays permissive `{}`.** Bug 0039 §Fix
  constraint 1 continues to bind: the shredded segment set
  (`{ a: string | null } | Cat`), which `isBraceBalanced`
  (`src/parser/body-type-lowering.ts:262`) refuses, keeps its present
  per-segment `anyOf` and its present silence at every position, annotation
  root included. Group (h) of the same test file pins that family in both
  directions and must stay green byte-for-byte.
- **The single-group root is byte-unchanged.** Every annotation that is one
  enclosing brace group keeps its object-rooted fragment and its
  argument-object-satisfiable wire form: fixtures A1, A2 and G2–G6 — the
  whole of group (a) other than `a9` and `a9b`, `@<{}>` (fixture G5, bug
  0045's subject) included. The named-annotation arm (`:118–123`) is
  untouched.
- **Cross-position diagnostic identity.** After the fix,
  `{a: integer} | {b: Ghost}` raises exactly one
  `theta/parse/unresolved-named-type` naming `Ghost` at the `@<T>` annotation
  and at the alias RHS, byte-identically to what `integer | {b: Ghost}` raises
  there today, with the theta refused. No registry edit: the row
  (`code-registry-parse.md:89`) already names both positions, and GOV-15's
  diagnostic-registry carve-out
  (`docs/spec_topics/governance/source-language-stability.md:25`) covers the
  newly-refused typo inputs, as it covered 0035's and 0039's.
- **The `params:` position does not move.** `lowerParamsFieldType`'s own naive
  test (`src/parser/params.ts:611`) stays as it is — bug 0039 §Fix freezes that
  position's bytes and its 37-test lock
  (`tests/params-inline-object-lowering.test.ts`) must stay green byte-for-byte,
  minted slugs included. The asymmetry this leaves (P4b against the corrected
  P1) is recorded, not closed here.
- **Three in-tree records state the behaviour the fix removes and are
  re-derived in the same change:** the permissive-`{}` origin inventory's
  catch-all bullet (`src/runtime/query-schema-lowering.ts:57–74`, the claim
  at `:67–71`); `collectUnresolvedNamedTypes`'s "the same root-level split
  `lowerQueryResponseSchema` makes" comment
  (`src/parser/body-type-lowering.ts:663–668`); and
  `isSingleEnclosingBraceGroup`'s doc comment (`:173–196`), whose closing
  paragraph scopes the naive form to the `params:` position once this fix
  lands.

**Test witness — unit, offline, provider-free.** Every fixture in
§Reproduction is a `lowerQueryResponseSchema`, `collectUnresolvedNamedTypes` or
`parseThetaDocument` call plus one real AJV compile. Required beyond re-deriving
`a9`/`a9b`: a byte pin proving the annotation root and the alias RHS lower the
identical text identically (P1 against P3b); the real-AJV accept/reject table
over the corrected root, including the `{"b":1}` and `{"a":null}` cells that
invert; a `respondToolWireSchema` / `respondSchemaSlug` pair showing the
envelope crossing; the name-walk parity table of §Reproduction (5) at both
positions; and no-op cells for `@<{a: integer, b: string}>`, `@<{}>`,
`@<X>`, the shredded segment set and the `params:` spelling proving each is
byte-unchanged.

## Fix (0.58.0)

The settled §Fix, implemented against a tree eight releases past the one it was
written at. Parts A and B landed together behind one export; three review
rounds and two fixer rounds hardened the in-tree records and the test file's
own slug oracle. Line anchors are at the fix commit.

**Baseline drift: citations only, observables none.** The report's evidence is
at `52e257bc` (0.49.0), and [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s
fix (0.54.0) and [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)'s
(0.57.0) have since grown all three files this report cites. A scratch probe at
the fix baseline (`bdb1cca5`, 0.57.0) re-derived every fixture of
§Reproduction (1)–(5) — P1, P2, P2b, the V1–V4 spacing and arm-count variants,
P7, the P8/P8b controls, the AJV six-payload table, the
`respondToolWireSchema` / `respondSchemaSlug` pair, the seven-row walker table
and its load-path counterparts at both emitting positions — and every one was
**byte-identical** to the recorded 0.49.0 output, minted slugs included. Only
the line anchors moved: `query-schema-lowering.ts:139`→`:140` (the frame),
`:148`→`:149` (the arm it pre-empts), `:25–74`→`:25–80` (the permissive-`{}`
inventory); `body-type-lowering.ts:197`→`:200`
(`isSingleEnclosingBraceGroup`), `:173–196`→`:172–199` (its doc comment),
`:262`→`:265` (`isBraceBalanced`), `:335`→`:339` (`lowerTypeSource`),
`:398–411`→`:412–424` (the per-arm union path), `:670`→`:696` /
`:679`→`:707` (`collectUnresolvedNamedTypes` and its dispatch);
`theta-document.ts:6162`→`:6375` (the `@<T>` walker call site),
`:5512`→`:5676` (the alias RHS); `params.ts:611`→`:766`. The registry row is at
`code-registry-parse.md:90`, not `:89`.

**The change is five lines of code.** `isSingleEnclosingBraceGroup`
(`src/parser/body-type-lowering.ts`) is exported; `lowerQueryResponseSchema`
imports it and asks it in place of `s.startsWith("{") && s.endsWith("}")`
(part A); `collectUnresolvedNamedTypes` asks it at the identical dispatch
(part B). No new machinery: the predicate, the balanced-segment guard
(`isBraceBalanced`) and the per-arm hoist all shipped with bug 0039, and this
fix routes two callers through them. The substitution is a **conservative
refinement** — the predicate's own first line is the naive test, so
`isSingleEnclosingBraceGroup(s)` implies it and no source that already reached
`lowerTypeSource` changed route.

**The crossing set, enumerated rather than left to be discovered.** Exactly the
sources that satisfy the naive test but are not one enclosing brace group move,
in three families — and for every one of them the lowered root becomes `anyOf`,
so `rootIsArgumentObjectSatisfiable` (`src/runtime/respond-tool-wire.ts`) flips
to false, the respond tool registers under the single-property `value` envelope
instead of passing the fragment through verbatim, and the QRY-15 initial
instruction and QRY-12 follow-ups carry the envelope with it. The registered
`__theta_respond_<slug>` name moves with the bytes.

1. *A union of brace-balanced arms with at least one brace-group arm* — the
   report's subject. `{a: integer} | {b: integer}` goes from the enforcing
   single-field fragment to the SUBS-1 `anyOf` over two hoisted `$ref`s, which
   is byte-identical to what `@<X>` for `schema X = {a: integer} | {b: integer}`
   already produced (P1 = P3b, now pinned). Three arms and the nested-arm shape
   (fixture G7, whose first arm's own object hoists in turn, closing three
   `$defs`) behave the same.
2. *A shredded segment set that happens to end `}`* — `{ a: string | null } | {b: Cat}`
   goes from the enforcing mis-parse to the per-segment permissive
   `{"anyOf":[{},{},{}]}`, and stays silent at the name walk. §Fix's shredded
   clause names `{ a: string | null } | Cat`, which never satisfied the naive
   test and is byte-unchanged; its `}`-suffixed sibling **does** move, and moves
   from WRONG to PERMISSIVE, which is the direction bug 0039 §Fix constraint 1
   admits.
3. *A malformed brace-suffixed source* — `{a: integer} | integer}` likewise
   lowers per-segment permissive instead of minting a field list.

Byte-unchanged, verified as no-op cells: every genuine single enclosing brace
group (`@<{a: integer, b: string}>`, `@<{a: integer, b: {x: integer, y: string}}>`,
and `@<{}>` — `isSingleEnclosingBraceGroup("{}")` is true, so bug 0045's
subject is not reached), the named-annotation arm (`@<X>`), the unsuffixed
shredded set, and the `params:` spelling.

**Element 2 at both positions.** `{a: integer} | {b: Ghost}` now raises exactly
one `theta/parse/unresolved-named-type` naming `Ghost` at the `@<T>` annotation
and at the alias RHS, byte-identically to what `integer | {b: Ghost}` raises
there. This also discharges the correction §Related records: 0039 §Fix's
"Newly-refused inputs" clause about a name in a brace-group union arm now holds
unconditionally, not only where the source is not `{`-prefixed-and-`}`-suffixed.

**No spec or registry edit.** The row (`code-registry-parse.md:90`) already
names both positions; no code, row or trigger widened, so DIAG-2's closure is
untouched, and GOV-15's diagnostic-registry carve-out
(`source-language-stability.md:25`) covers the newly-refused typo inputs as it
covered 0035's and 0039's. `tests/fixtures/h7a/permitted-codes.json` needs no
edit: it carries no `theta/parse/*` code at all, and no committed `.theta` /
`.thetalib` fixture carries a brace-rooted union of object arms — verified by
grep and by the green `tests/committed-fixture-parse-gate.test.ts`, so H9a's
empty-capture stderr gate cannot newly fire.

**Three in-tree records re-derived**, as §Fix requires: the permissive-`{}`
origin inventory's catch-all bullet (`src/runtime/query-schema-lowering.ts`),
`collectUnresolvedNamedTypes`'s "the same root-level split" doc comment, and
`isSingleEnclosingBraceGroup`'s own doc comment, whose closing paragraph now
scopes the naive form's remaining reach — among the type-lowering dispatches
this predicate serves — to `params.ts:766`. Review round 1 caught a **fourth**
record stating the removed behaviour as live (the test file header's clause
naming G1 a byte-frozen CONTROL) and rejected a first attempt at the third as
categorically false: `classifyDiscriminatorFieldType`
(`src/parser/theta-document.ts:5822`) carries the identical two-ended test
ahead of its own `|` split, so "the naive test's whole remaining reach" is only
true when scoped to this predicate's callers. That classifier is a different
mechanism — discriminator-candidate classification, not lowering and not the
name walk — and is left untouched; it is recorded as a residual below.

**Offline lock.** `tests/annotation-root-brace-union-lowering.test.ts`, 33
tests in six groups: (0) an independent oracle — hand-written canonical forms
per the §Canonical schema hash recipe hashed with `node:crypto`, never
`schemaSlug`, cross-checked against three slugs production mints today; (a)
eight byte-invariance controls; (b) the corrected root over P1, the V1–V4
variants and G7; (c) the P1-against-P3b parity pin, which asserts the
resolution set is non-empty so an empty one fails loudly instead of pinning a
lie; (d) the real-`AjvSchemaValidator` accept/reject table with both inverting
cells (`{"b":1}` accepts where it was refused; `{"a":null}`,
`{"a":"not an integer"}` and `{"a":{"deep":true}}` are refused where they
bound) plus the envelope crossing and the slug move; (e) the name-walk parity
table at the walker, the `@<T>` position and the alias RHS, reading expected
messages from the registry (DIAG-4) rather than copying prose. `a9` and `a9b`
(`tests/inline-object-nested-lowering.test.ts`) are re-derived under this
report's authority — neither relaxed — with the file header's coupling
paragraph; that file's group (0) oracle self-check grew three rows to enrol the
canonical forms `a9b` needed, 58→61 tests.

**Verified in both directions.** Neutralising the two guard substitutions
(targeted byte edits, restored byte-exact per `git hash-object`; no `git
stash`) reds exactly 14 cells — the 12 of the new file plus `a9`/`a9b` — each
with bug 0053's own symptom in the failure text (the observed
`{"type":"object","properties":{"a":{"anyOf":[{},{}]}},…}` fragment, or an
empty diagnostic list where the registry line is owed), never a typecheck,
import or harness error. Full gate 248 files / 3452 tests; typecheck and lint
clean.

**Live.** H8a `live-production-acceptance` 7/7 and H9a acceptance 11/11 green,
including area (c)'s `acc-typed-inline.theta`, whose annotation is a single
enclosing brace group and is the no-op control. No committed live fixture
carries the union shape, so the obligation was met the way bug 0033's fix met
it: a scratch live probe drove `@<{ flagAlpha: integer } | { chosenText: string }>`
end to end, green with the fix and red with it neutralised, then deleted. The
red is the defect made visible at the wire: under the mis-parsed schema the
only offered field is `flagAlpha`, so the model crammed the author's intended
payload into it as a string —
`{"flagAlpha":"{\"chosenText\": \"ZQPROBE42DONE\"}"}` — with zero diagnostics,
which is §"Why it matters"'s "invisible at authoring time" clause observed live.

**Residuals.** (i) `classifyDiscriminatorFieldType`
(`src/parser/theta-document.ts:5822`) carries a third copy of the naive
prefix/suffix test, ordered ahead of its own top-level `|` split, so
`{a: X} | {b: Y}` classifies as one nested object there; it is a classifier,
not a lowering, and is outside this report's settled two-copy scope. (ii) The
`params:` position keeps its own naive test (`src/parser/params.ts:766`) and
its bytes by bug 0039 §Fix's freeze, so `p: "{a: integer} | {b: integer}"`
still hoists the single-field mis-parse the annotation root no longer mints —
the asymmetry §Non-goals leaves open, now one-sided. (iii) The annotation
position's slug-collision sink is still a runtime mint with no load-time
diagnostic channel (bug 0039 §Fix residual (iii)); routing the root through
`lowerTypeSource` threads the same sinks and does not change that. (iv) The
test file header at `tests/inline-object-nested-lowering.test.ts:143` cites
`(a10, g7)` for "a LITERAL arm of a mixed union keeps its `{}`"; the row that
actually asserts it is `g8`'s first table row. Pre-existing, untouched here.
(v) The oracle cross-check block of
`tests/annotation-root-brace-union-lowering.test.ts` labels two of three rows
for one fragment triad where its sibling file labels all three.

## Non-goals

- **The `params:` position's naive brace test.** `src/parser/params.ts:611`
  keeps it and keeps its bytes, by bug 0039 §Fix's freeze. The resulting
  divergence from the corrected annotation root is stated above and left open.
- **The empty inline object.** `@<{}>` and `{a: {}}` keep their present
  permissive disposition;
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) owns
  `theta/parse/empty-schema-body` at the inline positions, and this fix does
  not reach it.
- **The shredded segment set.** `{ a: string | null } | Cat` stays
  per-segment-permissive and silent, guarded by `isBraceBalanced`. That is bug
  0033 §Fix residual (ii)'s subject and 0039 §Fix's group-(h) pin.
- **`lowerTypeExpr`'s generic-application precedence.** A union whose last arm
  ends in `>` never reaches this report's frame;
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) owns it.
- **The annotation position's collision channel.** The mint at
  `src/runtime/query-schema-lowering.ts:132–136` is a runtime call with no
  load-time diagnostic site, so a slug collision there is retained without a
  report (bug 0039 §Fix residual (iii)). Routing the root through
  `lowerTypeSource` threads the same sinks and does not change that.
- **The SUBS-1 literal-emission divergence.** `lowerTypeSource`'s literal-union
  arm emits a bare `{ enum: [...] }` where schema-subset.md `:81` spells
  `{"type": "string", "enum": [...]}` (bug 0039 §Fix residual (vii), pinned as
  control `a10`, `tests/inline-object-nested-lowering.test.ts:990`). Unchanged
  here.

## Provenance

- Origin: bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  §Fix (0.49.0) residual (ii) (`.pi/tmp/fixes/0039-report.md`, §Residuals item
  2), recorded when 0039 landed and left unfiled. This report files it,
  re-derives it at HEAD `52e257bc`, and adds element 2 — the identical
  predicate in `collectUnresolvedNamedTypes`, which 0039's residual does not
  mention — together with the correction to 0039 §Fix's "Newly-refused inputs"
  clause about brace-group union arms (see §Related).
- Spec: `docs/spec_topics/grammar.md:94` (`Type "|" Type`, right-associative),
  `:101` (`ObjectType` as a `Type`), `:105` (bare `Type` positions, including
  type-ascription contexts), `:109` (§Inline object types);
  `docs/spec_topics/schema-subset.md:73` (Lowering Algorithm step 2 — the
  inline hoist in any type position), `:76` (step 3 — the `$ref` emission),
  `:81` ([SUBS-1](../spec_topics/schema-subset.md#subs-1)), `:82`
  (discriminated object union), `:85` (*Array element order*);
  `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
  position); `docs/spec_topics/query/query-forms.md:57` (QRY-4, the explicit
  `@<Schema>` form); `docs/spec_topics/query/query-failure-and-repair.md:78`
  (QRY-22), `:42` (`<schema-json>` over the respond tool's wire schema);
  `docs/spec_topics/query/query-tool-loop.md:20` (§Respond-tool wire schema),
  `:37` (QRY-15); `docs/spec_topics/diagnostics/code-registry-parse.md:89`
  (`theta/parse/unresolved-named-type`, the five-position row);
  `docs/spec_topics/governance/source-language-stability.md:25` (GOV-15
  diagnostic-registry carve-out).
- Implementation evidence at HEAD `52e257bc`:
  `src/runtime/query-schema-lowering.ts:25–74` (the permissive-`{}` origin
  inventory, catch-all bullet `:57–74`), `:105` (`lowerQueryResponseSchema`),
  `:118–123` (the named-annotation arm), `:132–136` (the runtime sinks),
  `:139–144` (the frame), `:148` (the arm it pre-empts);
  `src/parser/body-type-lowering.ts:109` (`lowerObjectFields`), `:151`/`:158`
  (`lowerInlineObject` and its `"angle-and-brace"` interior split),
  `:173–196`/`:197–227` (`isSingleEnclosingBraceGroup` and its doc comment,
  including the `params:` freeze note at `:191–195`), `:262`
  (`isBraceBalanced`), `:335` (`lowerTypeSource`), `:394–395` (the
  single-group hoist), `:398–411` (the per-arm union path), `:663–668`/`:670`/
  `:679` (`collectUnresolvedNamedTypes`, its doc comment and its dispatch);
  `src/parser/params.ts:606–615` (`lowerParamsFieldType` and its naive test at
  `:611`); `src/parser/theta-document.ts:4805`
  (`unresolvedNamedTypeDiagnostic`), `:4855` (`queryResponseAnnotation`),
  `:5512` (the alias-RHS walker call site), `:6162` (the `@<T>` walker call
  site); `src/runtime/respond-tool-wire.ts:55–70`
  (`rootIsArgumentObjectSatisfiable`), `:73` (`respondSchemaIsEnveloped`),
  `:91` (`respondToolWireSchema`); `src/runtime/typed-query-validation.ts:194`,
  `:196`, `:219–221`, `:347` (`respondSchemaSlug`);
  `src/extension/production-theta-producer.ts:2314`/`:2344`/`:3308` (the single
  lowering, its consumers, the `invoke<T>` boundary).
- Test evidence at `52e257bc`: `tests/inline-object-nested-lowering.test.ts:106`
  (fixture G1's recorded signature), `:112–113` (fixture G7's), `:148–159` (the
  header paragraph recording the root dispatch's exclusion from bug 0039),
  `:933` (`a9`), `:961` (`a9b`), `:990` (`a10`), `:1322`–`:1359` (`e5` — the
  alias RHS over the identical text, its accept/reject table at
  `:1347–1359`); `tests/params-inline-object-lowering.test.ts` (the bug-0035
  lock the `params:` freeze protects);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which carries the shape).
- Reproduction: scratch vitest at `52e257bc` — the annotation root over
  `{a: integer} | {b: integer}` and its spacing / arm-count variants, the
  three-arm and primitive-first spellings, fixture G7, the two single-group
  controls, the same union at the alias RHS (lowered bytes and `@<X>`), the
  `schema` body field and `params:` positions, a real `AjvSchemaValidator`
  compile with six payloads, `respondToolWireSchema` / `respondSchemaSlug`
  over both fragments, and the seven-row `collectUnresolvedNamedTypes` table
  with its load-path counterparts at both emitting positions. Run on the
  outputs quoted above, then deleted per scratch policy.

### Discharge note — bug 0096 (0.73.0)

§Fix (0.58.0) *Residuals* (i) is **discharged** by the 0096 fix
(`docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md` §Fix
(0.73.0)). That entry recorded `classifyDiscriminatorFieldType`
(`src/parser/theta-document.ts`) as carrying a third copy of the naive
prefix/suffix brace test, ordered ahead of its own top-level `|` split, and
scoped it out as "a classifier, not a lowering". The classifier now guards its
nested-object arm with `isSingleEnclosingBraceGroup` — the predicate this fix
exported — so the third copy is gone and `{a: X} | {b: Y}` classifies as a union
of arms there. The guard still runs ahead of the `|` split, so
`{ type: "x" | "y" }` still reports nested.

Two consequences for the record above. The **closing paragraph of
`isSingleEnclosingBraceGroup`'s doc comment** — which this fix wrote, scoping the
naive form's remaining reach to `params.ts:766` "among the type-lowering
dispatches this predicate serves" — is rewritten by 0096, because the classifier
becomes a caller that is not such a dispatch. The scoping clause was true when
written and would have become a false record; it now states that the predicate
serves callers beyond the lowering dispatches and that `params.ts:766` is the one
**remaining** copy. The review-round-1 finding this record names (a first attempt
at that paragraph rejected as categorically false because it omitted this
classifier) is what made the rewrite obligatory rather than optional.
*Residuals* (ii) — the `params:` position keeping its own naive test and its
bytes by bug 0039 §Fix's freeze — **stands unchanged**, and is now the only copy
of the naive form in `src/`.

### Note — bug 0095 (0.74.0)

Recorded against this report's §Fix (0.58.0): **nothing this report owns moved,
and its exported predicate is now exercised on reachable input.**

[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) widened
`ThetaDocument.parseType`'s arm-start `{` handling to every `Type` position, so a
schema field typed `{a: X} | {b: Y}` finally keeps its field list and its whole
type source. Two consequences for the record above.

`isSingleEnclosingBraceGroup` — the predicate this report extracted and exported —
is now asked about brace-rooted union sources that a real `.theta` can actually
produce at the schema-field position. Bug 0096 substituted it for the naive
prefix/suffix test in `classifyDiscriminatorFieldType` at 0.73.0, and that
substitution was observably neutral only because 0095's capture had not landed
yet; with the capture widened, the two item-3 tables of
`tests/discriminator-field-classifier-brace-group.test.ts` exercise the guard on
input that reaches it. The predicate's bytes and its two lowering-dispatch callers
are untouched.

*Residuals* (ii) — the `params:` position keeping its own naive two-ended test and
its bytes under bug 0039 §Fix's freeze — **stands unchanged**. 0095 verified the
freeze directly: `git diff -- src/parser/params.ts` was empty through the whole
change, and the `params:` capture path is asserted byte-unchanged as a control
(a `params:` field records the raw YAML scalar trimmed only at its ends, never
`parseType`'s token-join form, so the two positions remain independent).
