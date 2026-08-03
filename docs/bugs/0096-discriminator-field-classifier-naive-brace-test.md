# Bug 0096 — `classifyDiscriminatorFieldType` carries a third copy of the naive prefix/suffix brace test ahead of its own top-level `|` split, so a field type `{a: X} | {b: Y}` classifies as ONE nested object instead of a union of two arms; the wrong answer is masked at both ends — the schema-field capture destroys the input before the classifier sees it (bug 0095), and implicit detection discards `nested` — so it becomes an observable false `theta/parse/nested-discriminator` on the explicit `by <field>` path the moment 0095's capture is fixed

- **Status:** open. Latent: the classifier's answer is wrong at HEAD and no
  input reaches it. §Fix must land with or before
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)'s, which is
  what makes the input reachable.
- **Kind:** defect, one predicate. `classifyDiscriminatorFieldType`
  (`src/parser/theta-document.ts:5818–5847`) tests
  `s.startsWith("{") && s.endsWith("}")` at `:5822` and returns
  `{ nested: true }`, ahead of its own top-level-`|` split at `:5825`. The test
  is positional, not structural: every top-level union whose first and last
  arms are brace groups satisfies it, because the first arm's opening brace and
  the last arm's closing brace are the source's endpoints. `{a: X} | {b: Y}` is
  a two-arm union by `docs/spec_topics/grammar.md:94` (`Type "|" Type`) over
  `:101` (`ObjectType`), and the classifier reports it as one nested
  discriminator value. This is the same mis-read bug
  [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) removed
  from two lowering dispatches in 0.58.0; 0053's fix record names this third
  copy as residual (i) and scopes it out ("a classifier, not a lowering").
- **Related:**
  - [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) —
    fixed (0.58.0), the origin. Its §Fix (0.58.0) *Residuals* (i) records this
    copy verbatim, and its review round 1 rejected a first attempt at
    re-deriving `isSingleEnclosingBraceGroup`'s doc comment on exactly this
    ground: the naive test's "whole remaining reach" is only true when scoped
    to that predicate's callers, because the classifier is not one of them.
    0053 exported the predicate (`src/parser/body-type-lowering.ts:208`), which
    is the ingredient §Fix uses; the scoping paragraph it wrote (`:201–206`)
    moves with this fix.
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) — open,
    and the reason this report is latent rather than observable. `parseType`'s
    leading-brace early return (`src/parser/theta-document.ts:2936–2939`) ends
    a schema-body field capture at the first balanced group, and the residue
    `| {b: Y}` then trips `parseSchemaObjectBody`'s non-field-name recovery
    (`:2542–2548`), which discards the whole field list. The declaration
    reaches `checkSchemaDeclarationGraph` with no `fields`, never enters
    `objectFields` (`:5610`), and the classifier is never handed the source.
    0095's §Fix widens the capture to the full `Type ("|" Type)*` extent; from
    that commit forward the classifier is fed `{a:integer}|{b:string}` and
    answers `{ nested: true }`. Ordering is recorded in §Fix. 0095's §Status
    reads "This report blocks nothing and is blocked by nothing" — that holds
    for 0095's own three elements and is superseded here only in the weak
    sense that this report's fix must not land after it.
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — open, the
    `by <field>` sibling, and a different question. 0046 is a spec silence
    about two `by` input classes: an explicit `by` naming a field **no variant
    declares** (its `presentInAll` is false), and a `by` over a ≥2-arm union
    **whose arms are not all object schemas**. This report's fixture is neither
    — the named field resolves in every variant and both arms are declared
    object-form schemas — and the defect is that the resolved field's SHAPE is
    reported wrongly. Whichever way 0046's disposition lands, `{a: X} | {b: Y}`
    is a union type and not a nested object, so the classifier's answer is
    wrong under either. 0046's own §Fix constraint 2 (the `.some`/`.every`
    asymmetry at `schema-declarations.ts:496–497`) touches the same
    `FieldEvaluation`; it is about which occurrences are absent, not about what
    a present occurrence is.
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — fixed (0.49.0), origin of `isSingleEnclosingBraceGroup` and of the
    deliberate freeze on the fourth copy of the naive test
    (`src/parser/params.ts:766`, the `params:` position). That copy stays; see
    §Non-goals.
- **Affected** (citations verified at HEAD `8258e547`, 0.58.0):
  - `src/parser/theta-document.ts:5822` — the defect.
    `if (s.startsWith("{") && s.endsWith("}")) { return { nested: true }; }`,
    over the trimmed `SchemaFieldSource.typeSource`, with no check that the `{`
    at index 0 is closed by the `}` at the final index.
  - `src/parser/theta-document.ts:5825` — the arm it pre-empts.
    `if (splitTopLevel(s, "|").length > 1) { return {}; }` is the answer a
    two-arm union is owed; `splitTopLevel` tracks brace depth and string
    literals, so it splits this source into two arms correctly when reached.
  - `src/parser/theta-document.ts:5795–5817` — the classifier's doc comment.
    `:5806–5809` states the union rule for the literal case ("A LITERAL UNION
    is not a literal … so `kind: "a" | "b"` is no candidate at all"), and
    `:5812–5814` states the current ordering as intentional: the `|` split
    "runs after the inline-object test so a nested type whose own interior
    carries a union (`{ type: "x" | "y" }`) still reports as nested". That
    requirement is real and §Fix preserves it; the comment records no reason
    for the test being positional rather than structural.
  - `src/parser/theta-document.ts:5785–5793` — `discriminatorCandidateFields`,
    the classifier's sole caller (`:5791`), mapping every field of a resolved
    object-schema variant.
  - `src/parser/theta-document.ts:5756–5776` — `buildUnionVariantSchemas`, the
    sole caller of that (`:5773`). It declines any union with fewer than two
    arms, any arm that is not a bare identifier, and any identifier that is not
    a declared object-form schema.
  - `src/parser/theta-document.ts:5690–5698` — the gated `checkDiscriminatedUnion`
    call in `checkSchemaDeclarationGraph`, and `:5610`
    (`objectFields.set(s.name, s.fields)`), the map's only feed.
  - `src/parser/schema-declarations.ts:362–367` —
    `DiscriminatorCandidateField`. `nested` (`:366`) is the field the
    classifier sets; its documented meaning is "a field whose value is a nested
    object (`kind: { type: "x" }`) rather than a top-level literal" (`:358–360`).
  - `src/parser/schema-declarations.ts:497` — `const anyNested =
    occurrences.some((o) => o?.nested === true)`, the only derivation from
    `nested`, inside `evaluateOccurrences` (`:492–532`).
  - `src/parser/schema-declarations.ts:620–630` — the only reader of
    `anyNested`, in `checkExplicitDiscriminator`. It returns
    `theta/parse/nested-discriminator` with the message
    `discriminator field '<field>' must be at the top level of each variant of
    <X>`. This is the whole observable surface of the misclassification.
  - `src/parser/schema-declarations.ts:535–541` — `detectImplicitDiscriminator`,
    which never reads `anyNested`: its candidate filter is
    `presentInAll && allLiteral` (`:541`), and a field classified
    `{ nested: true }` and one classified `{}` both lack `literal`, so both are
    filtered out and both land on the same terminal branch. The implicit path
    is insensitive to the defect (§Reproduction, table E).
  - `src/parser/schema-declarations.ts:392–399` —
    `checkDiscriminatedUnion`'s dispatch on `decl.by !== undefined`, which
    routes to the explicit path unconditionally.
  - `src/parser/body-type-lowering.ts:208–238` — `isSingleEnclosingBraceGroup`,
    the predicate this position needs, exported by 0053's fix. Its first
    statement (`:209–211`) IS the naive test, so it is a strict refinement.
    Its doc comment (`:176–207`) names this exact source and hazard at
    `:181–184` ("both seams need it rather than a naive
    `startsWith("{") && endsWith("}")`, which also matches
    `{a: integer} | {b: integer}`"), and its closing paragraph (`:201–206`)
    scopes the naive form's remaining reach to `params.ts:766` "among the
    type-lowering dispatches this predicate serves" — a scoping that changes
    when the classifier becomes a caller.
  - `src/parser/params.ts:766` — the fourth copy of the naive test, in
    `lowerParamsFieldType`, frozen by bug 0039 §Fix. Out of scope
    (§Non-goals).
  - The producer chain that masks the defect today, all in
    `src/parser/theta-document.ts`: `:2367` (`finishObjectSchema`'s
    `parseSchemaObjectBody()` call, the only producer of a `schema`
    statement's `fields`), `:2573` (`const typeSource = this.parseType(true)`),
    `:2936–2939` (the leading-brace early return — 0095's root cause),
    `:3047–3065` (`consumeInlineObjectType`, which returns at the matching `}`
    or at a `stmt-sep`), `:2542–2548` (the non-field-name recovery that calls
    `skipBraceRemainder` and returns `null`).
  - `docs/spec_topics/schemas.md:99–121` — §Discriminated unions. `:101` the
    all-object-schema definition; `:103–105` the three detection properties,
    `:104` being rule 2 ("Be a single **string** literal type in every variant
    (one literal value per variant; not a literal-union)"); `:119` the
    top-level rule the misclassification triggers ("The discriminator field
    must live at the **top level** of each variant; nested discriminators
    (`kind: { type: "x" }`) are `theta/parse/nested-discriminator`").
  - `docs/spec_topics/diagnostics/code-registry-parse.md:98` —
    `theta/parse/nested-discriminator`'s row. Its *Trigger* is "Discriminator
    field is not at the top level of each variant (e.g. `kind: { type: "x" }`)".
    A field whose declared type is a union of two object types is not that
    input; it has no single value to sit at any level.
  - `tests/disc-unions-recursion.test.ts:174–195` — the seam-level
    `nested-discriminator` cell. It hand-builds `{ name: "kind", nested: true }`
    for both variants, so it exercises the consumer and never the classifier;
    it is unaffected by §Fix.
  - `tests/committed-fixture-parse-gate.test.ts` — the zero-diagnostics walk
    over committed `.theta` / `.thetalib`. No committed file carries a `}`
    followed by a `|` (`rg '\}\s*\|' --glob '*.theta' --glob '*.thetalib'` over
    the tree is empty), and no committed file carries a `by` clause at all
    (bug 0046 §"Why it matters"), so the gate cannot witness the shape before
    or after either fix.
- **Observed at:** `0.58.0` (`8258e547`). Offline, deterministic; no live model
  and no provider. Scratch vitest driving `parseDoc`
  (`tests/helpers/e2e-s1.ts`, the shipped load path with inert seams),
  `isSingleEnclosingBraceGroup` and `checkDiscriminatedUnion` directly, plus a
  byte-for-byte copy of the module-private classifier and of the same function
  with the predicate substituted; written, run, deleted.

## Summary

`classifyDiscriminatorFieldType` answers one question about a schema field's
captured type source: is it a single literal, a nested inline object, or
neither. It asks the nested question with a two-ended character test, and asks
the union question after it. A top-level union of brace-group arms answers the
first question yes, so the second is never reached and the field is reported as
one nested object.

The correct answer is "neither". `{a: X} | {b: Y}` is a `Type "|" Type` over two
`ObjectType` arms (`grammar.md:94`, `:101`), and a union is not a discriminator
candidate — the classifier's own doc comment states that rule for the literal
case (`theta-document.ts:5806–5809`), which the `|` split at `:5825` implements
and the brace test at `:5822` pre-empts.

Two masks keep the wrong answer off every observable at HEAD.

**Upstream, the input never arrives.** The classifier's only feed is
`SchemaFieldSource.typeSource` from a `schema X { … }` body, and `parseType`'s
leading-brace arm (`:2936–2939`) returns at the closing `}` of the first
balanced group. A `{`-prefixed field capture is therefore either exactly one
enclosing brace group or does not end with `}` at all, and the two predicates
agree on every such source (table C). The union spelling never yields a field
list at all:
the residue `| {b: Y}` is not a field name, so the recovery at `:2542–2548`
discards the declaration's fields and the load ends on
`theta/parse/empty-schema-body` naming the schema. That is bug 0095 element 1.

**Downstream, half the consumers discard the answer.**
`detectImplicitDiscriminator` filters candidates on `presentInAll && allLiteral`
(`schema-declarations.ts:541`) and never reads `anyNested`, so `{ nested: true }`
and `{}` produce byte-identical output on the implicit path. Only
`checkExplicitDiscriminator`'s `anyNested` gate (`:620`) distinguishes them, and
it is an error-severity terminal rejection.

So the defect's whole reach is: an explicit `by <field>` naming a field whose
declared type is a union of brace-group arms raises
`theta/parse/nested-discriminator` where the correct classification raises
nothing. Today that input is destroyed before the classifier runs. 0095's §Fix
widens the capture so the field survives with type source
`{a:integer}|{b:string}`, at which point the false rejection is live.

## Reproduction

Offline at HEAD `8258e547`. The classifier is module-private
(`theta-document.ts:5818`), so tables A and F run a byte-for-byte copy of it
against a copy with `isSingleEnclosingBraceGroup` substituted at `:5822`;
tables B, C, D and G drive the shipped `parseDoc`; table E drives the shipped
`checkDiscriminatedUnion`. Every `.theta` fixture is
`---\nmode: prompt\n---\n<decls>\nlet a = 1\na`. `E` abbreviates
`error theta/parse/`.

### A — the classifier's answer, naive against structural

`isSEBG` is `isSingleEnclosingBraceGroup` over the same trimmed source.

```
"{a: integer} | {b: string}"            naive {"nested":true}   structural {}              isSEBG false
"{a: integer}|{b: string}"              naive {"nested":true}   structural {}              isSEBG false
"{ type: \"x\" | \"y\" }"               naive {"nested":true}   structural {"nested":true} isSEBG true
"{a: integer}"                          naive {"nested":true}   structural {"nested":true} isSEBG true
"{}"                                    naive {"nested":true}   structural {"nested":true} isSEBG true
"\"a\" | \"b\""                         naive {}                structural {}              isSEBG false
"\"cat\""                               naive {"literal":{"kind":"string","text":"cat"}}   identical
"{a: integer} | {b: string} | integer"  naive {}                structural {}              isSEBG false
"integer | {b: string}"                 naive {}                structural {}              isSEBG false
```

Rows 3–5 are the controls the substitution must not move: a single enclosing
brace group keeps `nested: true`, interior union and empty body included. Rows
8–9 show the crossing set is decided by the source's first and last characters
alone — appending ` | integer`, or writing a primitive arm first, removes the
divergence.

### B — what the schema-field position captures today

```
schema Cat { kind: {a: integer} | {b: string}, name: string }
   -> ["E empty-schema-body: 'Cat' has no fields; an empty schema cannot be validated."]   no fields
   (multi-line spelling, `kind: {a: integer}\n | {b: string},`)                identical
   (no comma before `name`)                                                    identical
   (the union field written last)                                             identical
   (wire-renamed: `kind as "Kind": {a: integer} | {b: string}`)                identical
   (the same three declarations in a .thetalib, no frontmatter)                identical for Cat
schema Cat { kind: { type: "x" }, name: string }        -> []  kind typeSource "{type:\"x\"}"
schema Cat { kind: { type: "x" | "y" }, name: string }  -> []  kind typeSource "{type:\"x\"|\"y\"}"
schema Cat { kind: "a" | "b", name: string }            -> []  kind typeSource "\"a\"|\"b\""
```

The three clean rows are the only shapes that reach the classifier from this
position, and all three are classified identically by the naive and the
structural test.

### C — no capture the parser can produce splits the two predicates

Read off `doc.body.statements`. `startsEnds` is the naive test.

```
schema Cat { kind: {a: integer                      typeSource "{a:integerleta=1a"  startsEnds false  isSEBG false
schema Cat { kind: {a: integer\n}, name: string }   typeSource "{a:integer}"        startsEnds true   isSEBG true
schema Cat { kind: {a: integer}}                    typeSource "{a:integer}"        startsEnds true   isSEBG true
schema Cat { kind: {a: {b: integer}}, name: string} typeSource "{a:{b:integer}}"    startsEnds true   isSEBG true
schema Cat { kind: {a: "}"}, name: string }         typeSource "{a:\"}\"}"          startsEnds true   isSEBG true
```

`consumeInlineObjectType` (`:3047–3065`) returns at the matching `}` or at a
`stmt-sep`, so a capture that starts `{` either ends at that group's close or
does not end with `}` at all. No parse route at HEAD hands the classifier a
source on which the two tests disagree. That is the upstream mask, stated as a
measurement.

### D — the explicit `by <field>` path, end to end

Each row declares `Dog { kind: "dog", name: string }` and
`schema Animal by kind = Cat | Dog`, varying `Cat.kind`.

```
Cat.kind = {a: integer} | {b: string}  -> ["E empty-schema-body: 'Cat' has no fields; …"]
Cat.kind = { type: "x" }               -> ["E nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal"]
Cat.kind = { type: "x" | "y" }         -> ["E nested-discriminator: … of Animal"]
Cat.kind = "a" | "b"                   -> []
Cat.kind = { type: "x" }, no `by`      -> ["E missing-discriminator: Animal is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'."]
```

Row 1 is the defect's input and it never reaches the classifier. Row 4 is the
disposition the corrected classification produces for row 1: a union-typed
field is not a candidate, the explicit path's three gates are all vacuous, and
the load is clean.

### E — the seam, with each classification supplied directly

`checkDiscriminatedUnion` over `Cat` and `Dog` as above, with `Cat.kind`
carrying the classification the two predicates produce.

```
by kind, Cat.kind {"nested":true}  -> ["E nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal"]
by kind, Cat.kind {}               -> []
implicit, Cat.kind {"nested":true} -> ["E missing-discriminator: Animal is a union of object schemas … 'by <field>'."]
implicit, Cat.kind {}              -> ["E missing-discriminator: Animal is a union of object schemas … 'by <field>'."]
```

The last two rows are the downstream mask: the implicit path's output does not
depend on `nested`.

### F — the chain as it stands after 0095's fix

`parseType` joins token texts with no separator, so the widened capture 0095
§Fix produces for `kind: {a: integer} | {b: string}` is the byte string
`{a:integer}|{b:string}`. Each row runs that source through the classifier copy
and then through `checkDiscriminatedUnion` on the explicit path.

```
"{a:integer}|{b:string}"       isSEBG false  naive {"nested":true} -> ["E nested-discriminator: … of Animal"]   structural {} -> []
"{a:integer}|{b:string}|null"  isSEBG false  naive {}              -> []                                        structural {} -> []
"{a:integer}|null"             isSEBG false  naive {}              -> []                                        structural {} -> []
"null|{a:integer}"             isSEBG false  naive {}              -> []                                        structural {} -> []
"{type:\"x\"|\"y\"}"           isSEBG true   naive {"nested":true} -> ["E nested-discriminator: … of Animal"]   structural identical
"{a:integer}"                  isSEBG true   naive {"nested":true} -> ["E nested-discriminator: … of Animal"]   structural identical
"\"a\"|\"b\""                  isSEBG false  naive {}              -> []                                        structural {} -> []
```

Row 1 is the false rejection 0095's fix activates. Rows 2–4 show the crossing
set is narrow: a trailing `| null`, or a leading `null |`, removes the trailing
or leading brace and the naive test already declines. Rows 5–6 are the
byte-unchanged controls; row 7 is the literal-union parity case whose
disposition row 1 should match.

### G — the same sources at the schema-field position today

```
schema Cat { kind: {a: integer} | {b: string}, name: string } -> ["E empty-schema-body: 'Cat' has no fields; …"]
schema Cat { kind: {a: integer} | null, name: string }        -> ["E empty-schema-body: 'Cat' has no fields; …"]
schema Cat { kind: null | {a: integer}, name: string }        -> ["E empty-schema-body: 'Cat' has no fields; …"]
```

All three are bug 0095 element 1. Only the first becomes this report's subject
once that capture is widened; the second and third fall to the `|` split under
both predicates (table F rows 3–4).

## Expected behaviour

- `grammar.md:94` admits `Type "|" Type` with `Type` recursive and `:101`
  admits `ObjectType` as a `Type`, so `{a: X} | {b: Y}` is a union of two object
  types. `:109` puts `ObjectType` "in any `Type` position", and the schema
  field type is one (`grammar.md:105`). The classifier reports the shape of a
  declared type; for this source the shape is a union.
- `schemas.md:104` (detection rule 2) requires the discriminator field to "be a
  single **string** literal type in every variant (one literal value per
  variant; not a literal-union)". A union is not a single anything. The
  classifier's own doc comment (`theta-document.ts:5806–5809`) states this rule
  and the `|` split at `:5825` implements it; the same reasoning binds a union
  of object types as it binds a union of string literals.
- `schemas.md:119` and the registry row (`code-registry-parse.md:98`) scope
  `theta/parse/nested-discriminator` to a discriminator "not at the top level
  of each variant (e.g. `kind: { type: "x" }`)". A field declared
  `{a: X} | {b: Y}` has no value at any level for that rule to test; it is
  outside the row's *Trigger*, and under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the registry
  is the closed authority for what the runtime emits.

Expected concretely, for `Cat { kind: {a: integer} | {b: string}, name: string }`,
`Dog { kind: "dog", name: string }`, `schema Animal by kind = Cat | Dog`, once
the field survives capture:

- `classifyDiscriminatorFieldType("{a:integer}|{b:string}")` returns `{}` —
  neither `literal` nor `nested`.
- `evaluateOccurrences` then reports `presentInAll` true, `anyNested` false,
  `allLiteral` false, and `checkExplicitDiscriminator`'s three gates
  (`schema-declarations.ts:620–630`, `:632–636`, `:639–645`) are all vacuous. The
  declaration loads with no diagnostic — the same disposition
  `Cat.kind = "a" | "b"` has today (table D row 4).
- Byte-unchanged: `{ type: "x" }` and `{ type: "x" | "y" }` keep
  `{ nested: true }` and keep raising `nested-discriminator`; `{}` keeps
  `{ nested: true }`; every literal and every non-brace source keeps its
  present classification. The implicit path is byte-unchanged at every input,
  since it never reads `nested`.

Whether a clean load is the right end state for a `by` field that resolves but
is not a literal in every variant is not settled by any spec sentence, and is
not settled here: it is the disposition the literal-union spelling already
receives, and this report brings the object-union spelling to parity with it.
It is not one of bug 0046's two classes (§Related).

## Actual behaviour / root cause

**One positional test, ordered first.** `classifyDiscriminatorFieldType`
(`theta-document.ts:5818`) trims the captured source and asks four questions in
order: brace-rooted (`:5822`), top-level union (`:5825`), quoted literal
(`:5828–5833`), scalar literal (`:5834–5845`). The first is
`s.startsWith("{") && s.endsWith("}")` with no check that the `{` at index 0 is
closed by the `}` at the final index. `{a: X} | {b: Y}` satisfies it — the first
arm opens the source and the last arm closes it — so `{ nested: true }` is
returned and the union split never runs.

The ordering itself is required. `:5812–5814` records why: a nested type whose
interior carries a union (`{ type: "x" | "y" }`) must still report as nested, so
the brace test cannot be moved after the split. The defect is the test's shape,
not its position — a structural predicate at the same position answers both
sources correctly (table A rows 1 and 3).

**The predicate the position needs already exists and is already exported.**
`isSingleEnclosingBraceGroup` (`body-type-lowering.ts:208–238`) walks brace
depth, skips quoted regions, and returns true only when the index-0 `{` closes
at the final index. Its first statement (`:209–211`) is the naive test, so it is
a strict refinement: every source the naive test rejects it rejects, and no
source that reaches `:5825` today would stop reaching it. Its doc comment
(`:181–184`) names `{a: integer} | {b: integer}` as the source the naive form
mis-reads. 0053's fix exported it for the two lowering dispatches and, in
review, recorded that the classifier was NOT covered by that scoping (`:201–206`
reads "among the type-lowering dispatches this predicate serves").

**Why nothing observes it at HEAD — the upstream mask.** The classifier's only
input is `SchemaFieldSource.typeSource`, produced at `theta-document.ts:2573`
by `parseType(true)` and reaching `objectFields` at `:5610` only through
`finishObjectSchema` (`:2367`). `parseType`'s first statement (`:2936–2939`)
tests for a leading `{` and, outside `aliasArmBoundary` mode, calls
`consumeInlineObjectType` and RETURNS. That scanner (`:3047–3065`) stops at the
matching `}` or at a `stmt-sep`. So a `{`-prefixed field capture is either
exactly one balanced group — on which both predicates agree — or is truncated
without a trailing `}`, on which both decline. Table F is that claim measured.
The residue then fails the field-name test at `:2542`, `skipBraceRemainder`
runs, and `parseSchemaObjectBody` returns `null`, discarding every field
already captured; `finishObjectSchema` emits `empty-schema-body` against the
declaration's name. That is bug 0095's element 1, and it is why the divergent
source is unreachable rather than merely unusual.

**Why half the consumers would not observe it either — the downstream mask.**
`nested` is read in exactly one place: `anyNested` in `evaluateOccurrences`
(`schema-declarations.ts:497`), itself read in exactly one place, the terminal
gate at `:620` inside `checkExplicitDiscriminator`.
`detectImplicitDiscriminator` filters on `presentInAll && allLiteral` (`:541`)
and consults no other property of a non-literal field, so a field classified
`{ nested: true }` and one classified `{}` are both dropped from the candidate
set and the declaration reaches `missing-discriminator` either way (table E).
The one path that distinguishes them is the explicit `by <field>` path, and
there the distinction is an error that refuses the theta.

**What lands when 0095 lands.** 0095 §Fix deletes the early return and makes
the arm-start `{` branch (`:2975–2984`) unconditional, so the schema-field
capture becomes the full `Type ("|" Type)*` extent — `{a:integer}|{b:string}`
for the fixture above. That source is the first row of table F: the classifier
answers `{ nested: true }`, `anyNested` is true, and `schema Animal by kind =
Cat | Dog` is refused with `discriminator field 'kind' must be at the top level
of each variant of Animal`, naming a nesting the source does not contain. The
`empty-schema-body` line 0095 removes is replaced by a different wrong line
rather than by nothing.

## Why it matters

- The classifier's answer is wrong at HEAD, independently of whether anything
  reads it. `{a: X} | {b: Y}` is two arms by `grammar.md:94`, and the function
  whose job is to report a field's shape reports one nested object.
- The defect is scheduled to become observable by another report's fix. 0095's
  §Fix is settled and its stated outcome for `schema S { f: {a: integer} | null }`
  is a clean load; for the two-brace-arm spelling under an explicit `by`, the
  outcome would instead be a false `theta/parse/nested-discriminator`. Landing
  0095 alone converts a latent wrong answer into a load-refusing diagnostic.
- The emission would sit outside its registry row's *Trigger*
  (`code-registry-parse.md:98`, "not at the top level of each variant (e.g.
  `kind: { type: "x" }`)"), which under DIAG-2 is the closed authority for what
  the runtime emits. The remedy column is empty, so an author reading the
  message is told to un-nest a field that is not nested.
- One spelling of the same declared shape already loads clean.
  `Cat.kind = "a" | "b"` under `by kind` is a union, is not a candidate, and
  draws nothing (table D row 4). The object-union spelling would draw an error.
  `type-system.md:15` is what an author relies on when the same type grammar
  is used across positions and shapes.
- No gate scores it. The classifier is module-private and has no direct test;
  `tests/disc-unions-recursion.test.ts:174–195` hand-builds `nested: true` and
  exercises the consumer only. No committed `.theta` / `.thetalib` carries a
  `}` followed by a `|`, and none carries a `by` clause, so
  `tests/committed-fixture-parse-gate.test.ts` witnesses neither the input nor
  the change.
- 0053's fix left three in-tree records re-derived and one predicate exported
  precisely so a third caller could be routed through it. Leaving the third
  copy keeps two answers to one question in one parser.

## Fix

Substitute the exported structural predicate for the naive test, at the one
site.

**The change.** At `src/parser/theta-document.ts:5822`, guard the nested arm
with `isSingleEnclosingBraceGroup` (`src/parser/body-type-lowering.ts:208`)
instead of `s.startsWith("{") && s.endsWith("}")`. One import, one call. A
source that is one enclosing brace group keeps `{ nested: true }`; everything
else falls through to the top-level-`|` split at `:5825` and then to the
literal tests, unchanged. The ordering the doc comment requires is preserved:
the brace test still runs first, so `{ type: "x" | "y" }` still reports nested.

The substitution is a conservative refinement — the predicate's own first
statement (`:209–211`) is the naive test, so `isSingleEnclosingBraceGroup(s)`
implies it and no source that already reached `:5825` changes route. The
crossing set is exactly the sources that satisfy the naive test and are not one
enclosing brace group — a top-level union whose FIRST and LAST arms are both
brace groups. `{a:integer}|{b:string}`, `{}|{}`, a union of three or more arms
bounded by brace groups, and a union whose arms carry interior unions
(`{a:string|null}|{b:Cat}`) are all members. Every member moves from
`{ nested: true }` to `{}`; every non-member is byte-unchanged.

**Ordering.** This fix lands with or before
[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)'s. Landing
0095 first makes the misclassification observable as a false
`theta/parse/nested-discriminator` (§Reproduction, table F row 1). Landing this
one first changes no observable — every input at HEAD is byte-unchanged — and
removes that outcome from 0095's blast radius.

Constraints on any implementation:

- **Every present observable is unchanged.** No input reachable through
  `parseDoc` at HEAD hands the classifier a source on which the two predicates
  disagree (table C), so the whole default gate is byte-identical, the
  `empty-schema-body` dispositions of table G are byte-identical, and the
  implicit path is byte-identical at every input because it never reads
  `nested` (table E). A fix that moves any of these is wrong.
- **The single-group controls stay nested.** `{ type: "x" }`,
  `{ type: "x" | "y" }`, `{a: integer}`, `{a: {b: integer}}`, `{a: "}"}` and
  `{}` keep `{ nested: true }` and keep raising `nested-discriminator` under an
  explicit `by`. The interior-union case is the one the doc comment calls out
  and the one a mis-ordered fix would break.
- **The doc comment is re-derived in the same change.**
  `theta-document.ts:5795–5817` records the ordering rationale
  (`:5812–5814`) without recording why the brace test must be structural; after
  the fix it states both. `isSingleEnclosingBraceGroup`'s closing paragraph
  (`body-type-lowering.ts:201–206`) scopes the naive form's remaining reach to
  `params.ts:766` "among the type-lowering dispatches this predicate serves";
  the classifier becomes a caller that is not such a dispatch, so the scoping
  clause is rewritten rather than left as a false record. 0053 §Fix (0.58.0)
  residual (i) is the entry this report discharges.
- **No spec, registry or `docs/reference/` edit.** No code, row or trigger
  widens; one code stops being reachable from an input its row never described.
  Every input this fix touches keeps or improves its GOV-15 disposition — none
  moves into the refused set, and the one that would move out
  (`by kind` over a two-brace-arm field, once 0095 lands) moves from refused to
  clean.
- **The `params:` copy does not move.** `src/parser/params.ts:766` keeps the
  naive test and its bytes (§Non-goals).

**Test witness — unit, offline, provider-free.** Required:

1. A predicate table over the crossing set and the controls: for each source of
   §Reproduction table A, the naive test's answer, `isSingleEnclosingBraceGroup`'s
   answer, and the classification, asserted as bytes.
2. Seam cells over `checkDiscriminatedUnion` proving both directions of the
   consequence: `{ nested: true }` raises `nested-discriminator` on the
   explicit path, `{}` raises nothing, and both raise the identical
   `missing-discriminator` on the implicit path (table E). These pin the reach
   of the defect, and the last two pin the downstream mask so a later change to
   the implicit path cannot silently widen it.
3. A `parseDoc` cell asserting the schema-field position's dispositions are
   byte-unchanged for every row of tables B and G.
4. A `parseDoc` cell for `Cat { kind: {a: integer} | {b: string}, … }` +
   `schema Animal by kind = Cat | Dog` asserting the clean load, with the
   literal-union spelling (`kind: "a" | "b"`) beside it as the parity control.
   This cell is written in whichever of the two changes carries 0095's widened
   capture, since that is what makes the input reachable through `parseDoc`.

The classifier stays module-private (`theta-document.ts:5818`). Item 1 asserts
the predicate pair — the naive test is two string operations and
`isSingleEnclosingBraceGroup` is already exported — and item 4 asserts the
resulting classification end to end, so no test-only export is added.

**Verified in both directions.** Neutralising the substitution must red items 1
and 2's divergent cells with this report's own symptom in the failure text —
the observed `{"nested":true}` classification, or the observed
`discriminator field 'kind' must be at the top level of each variant of Animal`
where none is owed — and must not red any control cell.

## Non-goals

- **The `params:` position's naive brace test.** `src/parser/params.ts:766`
  keeps it and keeps its bytes, by bug 0039 §Fix's freeze
  (`body-type-lowering.ts:201–206`). It is a lowering dispatch, not a
  classifier, and this report does not reopen it.
- **The schema-field capture.** `parseType`'s early return
  (`theta-document.ts:2936–2939`) and `parseSchemaObjectBody`'s
  discard-the-whole-list recovery (`:2542–2548`) are
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)'s subject
  and are unchanged here. This report does not make the input reachable; it
  makes the answer right for when it becomes reachable.
- **The disposition of a resolved but non-literal `by` field.** After the fix,
  `by kind` over a field typed `{a: X} | {b: Y}` loads clean, which is the
  disposition `kind: "a" | "b"` already receives. Whether that silence is the
  right end state is a spec question about `schemas.md:99–121`, adjacent to but
  not inside
  [0046](./0046-by-clause-undecided-inputs-load-silently.md)'s two classes.
  Not settled here.
- **`theta/parse/nested-discriminator`'s registry row.** The row
  (`code-registry-parse.md:98`) is accurate; this fix stops one input from
  reaching an emission the row never described. No Trigger, Message or remedy
  changes.
- **The `.some`/`.every` asymmetry in `evaluateOccurrences`.**
  `anyNested` is a `.some` (`schema-declarations.ts:497`) while `allLiteral` is
  conjoined with `presentInAll` (`:496`, `:498–499`). That asymmetry is bug
  0046 §Fix constraint 2's subject and is untouched: this fix changes what
  `nested` is set to, not how absent occurrences are folded.

## Provenance

- Origin: bug
  [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) §Fix
  (0.58.0) *Residuals* (i) — "`classifyDiscriminatorFieldType`
  (`src/parser/theta-document.ts:5822`) carries a third copy of the naive
  prefix/suffix test, ordered ahead of its own top-level `|` split, so
  `{a: X} | {b: Y}` classifies as one nested object there; it is a classifier,
  not a lowering, and is outside this report's settled two-copy scope." Recorded
  when 0053 landed, together with the review-round-1 finding that produced it
  (a first attempt at re-deriving `isSingleEnclosingBraceGroup`'s doc comment
  was rejected as categorically false because it omitted this copy). This
  report files the residual, re-verifies every citation at HEAD `8258e547`, and
  adds what 0053's record does not carry: the reachability analysis (the
  upstream capture mask and the downstream implicit-path mask), the single
  observable the defect has, and the ordering dependency on 0095.
- Spec: `docs/spec_topics/grammar.md:90–102` (the type grammar; `:94`
  `Type "|" Type`, `:101` `ObjectType`), `:105` (the bare-`Type` position
  enumeration, schema field types among them), `:109` (§Inline object types —
  `ObjectType` in any `Type` position);
  `docs/spec_topics/schemas.md:99–121` (§Discriminated unions; `:101` the
  all-object definition, `:103–105` the three detection properties with `:104`
  the not-a-literal-union rule, `:111–117` the explicit `by` form, `:119` the
  top-level rule);
  `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
  position);
  `docs/spec_topics/diagnostics/code-registry-parse.md:86`
  (`theta/parse/empty-schema-body`), `:96` (`missing-discriminator`), `:98`
  (`nested-discriminator`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md`
  ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2));
  `docs/spec_topics/governance/source-language-stability.md`
  ([GOV-15](../spec_topics/governance/source-language-stability.md#gov-15) and
  its loads-cleanly predicate).
- Implementation evidence at `8258e547`: `src/parser/theta-document.ts:2367`
  (`finishObjectSchema`'s body call), `:2542–2548` (the non-field-name
  recovery), `:2573` (the field's `parseType(true)`), `:2936–2939` (the
  leading-brace early return), `:3047–3065` (`consumeInlineObjectType`),
  `:5610` (`objectFields.set`), `:5690–5698` (the gated
  `checkDiscriminatedUnion` call), `:5756–5776` (`buildUnionVariantSchemas`),
  `:5785–5793` (`discriminatorCandidateFields`), `:5795–5817` (the classifier's
  doc comment), `:5818–5847` (`classifyDiscriminatorFieldType`, the naive test
  at `:5822`, the `|` split at `:5825`);
  `src/parser/schema-declarations.ts:362–367`
  (`DiscriminatorCandidateField`, `nested` at `:366`), `:392–399`
  (`checkDiscriminatedUnion`'s dispatch), `:492–532` (`evaluateOccurrences`,
  `presentInAll` `:496`, `anyNested` `:497`, `allLiteral` `:498–499`),
  `:535–541` (`detectImplicitDiscriminator` and its candidate filter),
  `:596–648` (`checkExplicitDiscriminator`, the `anyNested` gate at
  `:620–630`, the non-string gate at `:632–636`, the duplicate-value gate at
  `:639–645`, the clean return at `:647`);
  `src/parser/body-type-lowering.ts:176–207` (the predicate's doc comment; the
  hazard at `:181–184`, the scoping paragraph at `:201–206`), `:208–238`
  (`isSingleEnclosingBraceGroup`, its own naive first statement at `:209–211`);
  `src/parser/params.ts:766` (the frozen fourth copy).
- Test evidence at `8258e547`: `tests/disc-unions-recursion.test.ts:174–195`
  (the seam-level `nested-discriminator` cell, hand-built);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk;
  `rg '\}\s*\|' --glob '*.theta' --glob '*.thetalib'` over the tree is empty);
  `tests/helpers/e2e-s1.ts:38–42` (`parseDoc`).
- Reproduction: scratch vitest at `8258e547` — the nine classification rows of
  table A against a byte-for-byte copy of the classifier and a
  predicate-substituted copy, the nine schema-field capture rows of table B
  (including the multi-line, no-comma, trailing, wire-renamed and `.thetalib`
  spellings), the five capture-shape probes of table C read off
  `doc.body.statements`, the five `parseDoc` rows of table D, the four
  `checkDiscriminatedUnion` seam rows of table E, the seven post-0095 chain
  rows of table F, and the three rows of table G — run on the outputs quoted
  above, then deleted per scratch policy.
