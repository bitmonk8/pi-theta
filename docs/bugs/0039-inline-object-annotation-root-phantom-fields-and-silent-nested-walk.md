# Bug 0039 — `lowerInlineObject` splits an inline object type's field list without tracking braces, so `@<{a: integer, b: {x: integer, y: string}}>` lowers to a fragment carrying a phantom top-level `y` that QRY-22 then enforces — rejecting the author's own conformant reply and accepting a shape they never declared — while a name written inside a nested inline object is invisible to `theta/parse/unresolved-named-type` at three of the row's five positions

- **Status:** fixed (0.49.0).
- **Kind:** defect, three elements on two mechanisms in one function pair.
  (1) *Implementation disagrees with the specification, silently and
  wrongly.* grammar.md `:109` admits `ObjectType` "in any `Type` position"
  with the `Type` inside each field recursive; schema-subset.md step 2
  (`:73`) hoists an inline object appearing in any type position into
  `$defs` under `__inline_<slug>` and step 3 (`:76`) emits
  `{"$ref": "#/$defs/<Name>"}`. At the `@<T>` annotation root the lowering
  instead mints an object fragment whose `properties` and `required` name a
  field the author never declared. No spec text defines that fragment.
  (2) *The widened diagnostic under-emits at three of its five declared
  positions.* `theta/parse/unresolved-named-type`'s row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:89`) names the
  `@<T>` query annotation, a `schema` body field type and the
  `schema X = …` alias/union right-hand side; at all three, a name written
  one level down inside an inline object resolves against nothing and
  raises nothing, where the identical text on the `params:` right-hand side
  raises (bug [0035](./0035-params-rhs-inline-object-under-emission.md)'s
  fix, 0.44.0). (3) *A permissive lowering at the `schema` body field and
  alias-RHS positions.* Every inline object type written as a field type
  lowers to `{}` — nested or flat, resolvable or not — because the shared
  recursive lowerer has no inline-object arm at all.
- **Related:**
  [0035](./0035-params-rhs-inline-object-under-emission.md) — its §Fix
  (0.44.0) gave the `params:` position an `"angle-and-brace"` interior
  split and a hoisting inline-object arm, and recorded the sibling
  positions' angle-only split as residual (i) (`:141`). This report is that
  residual, re-derived at HEAD, and it corrects it in two places: residual
  (i) names two sibling positions where the row now has three (bug
  [0033](./0033-body-level-schema-alias-unsupported.md) added the alias
  RHS), and it attributes a minted "silently-wrong fragment" to all of
  them, where in fact only the annotation root's fragment survives into
  lowered bytes — at the field and alias positions the fragment
  `lowerInlineObject` builds is discarded by the walker that built it, and
  the bytes those positions lower are `{}` (element 3).
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — the
  origin of `collectUnresolvedNamedTypes`, the walker whose brace dispatch
  reaches `lowerInlineObject`.
  [0033](./0033-body-level-schema-alias-unsupported.md) — added the
  alias/union RHS as the row's fifth position, on the same walker; its
  arms capture is per-`|`-SEGMENT rather than per-`Type` for a brace arm
  under the same angle-only split (`src/parser/theta-document.ts:563`), a
  caveat that becomes reducible once the split nests brace depth.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/body-type-lowering.ts:95` — `lowerInlineObject`, whose
    field-list split at `:101` is `splitTopLevel(body, ",")` with the
    nesting argument omitted. The default is `"angle"`
    (`src/parser/params.ts:614` / `:621` / `:624`), which tracks `<…>` and
    string literals but not `{…}` (`:627`, `tracksBraces`), so a comma
    inside a nested inline object splits the outer field list. This is
    mechanism A.
  - `src/parser/body-type-lowering.ts:131` — `lowerTypeSource`, the shared
    recursive type-source lowerer: literal handling at `:139–150`, then
    `lowerTypeExpr` at `:152–153`. It has no brace-rooted arm, and
    `lowerTypeExpr` (`src/parser/params.ts:357`) drops a brace-rooted
    source on its trailing catch-all (`:409–411`). So every inline object
    type below a root lowers `{}` and resolves none of its names. This is
    mechanism B.
  - `src/parser/body-type-lowering.ts:70`/`:79` — `lowerObjectFields`
    lowers each field through `lowerTypeSource`, which is why the `schema`
    body field position never mints an inline fragment (element 3), and
    `:113` — `lowerInlineObject` returns through the same function, so the
    annotation root's fields lower through mechanism B one level down.
  - `src/runtime/query-schema-lowering.ts:88`/`:108–113` —
    `lowerQueryResponseSchema`'s brace-rooted arm, the one position where
    `lowerInlineObject` is the ROOT lowerer: its fragment becomes the
    document root (`pruneDocumentDefs` is a no-op for it — the fragment
    carries no `$defs`).
  - `src/parser/body-type-lowering.ts:334`/`:342–345` —
    `collectUnresolvedNamedTypes`, the second and last caller of
    `lowerInlineObject` (grep at HEAD: two call sites). It dispatches a
    brace-rooted `source` to `lowerInlineObject` and everything else to
    `lowerTypeSource`, so mechanism A truncates its entries and mechanism B
    stops the descent one level down.
  - The three production call sites of that walker, all in
    `src/parser/theta-document.ts`: `:5823` (registry row position — a
    `schema` body field type), `:6075` (the `@<T>` annotation, via
    `queryResponseAnnotation` at `:4773`), `:5425` (the alias/union RHS).
    The `params:` position emits from its own site (`parseParams`,
    `src/parser/params.ts:117`) through `lowerParamsFieldType` (`:454`),
    whose interior split is `"angle-and-brace"` (`:465`) and which recurses
    into itself for a nested brace-rooted type — the one position with
    neither mechanism.
  - `src/parser/params.ts:424–441` — `lowerParamsFieldType`'s doc comment
    states mechanism A's consequence for the `params:` position ("mints a
    fragment carrying a permissive `b`, a PHANTOM top-level `y`, and a
    three-name `required`, so AJV then rejects the author's own payload and
    accepts the phantom shape instead") and records the divergence from
    `lowerInlineObject` as deliberate and unchanged from there.
    `src/parser/theta-document.ts:4674–4703` records the same asymmetry
    from the diagnostic side.
  - Blast radius of the annotation root's fragment — one lowering, four
    consumers: `src/extension/production-theta-producer.ts:2314` lowers
    once and feeds the validation collaborator, the respond-tool
    registration and the QRY-15 template
    (`:2344`; `src/runtime/typed-query-validation.ts:196` builds the wire
    schema, `:219–223` validates), and `:3308` lowers the same way for the
    `invoke<T>` return-value boundary. `src/runtime/respond-tool-wire.ts:91`
    passes an object-rooted lowering through verbatim, so the phantom
    fragment is also the shape the model is shown.
  - Not affected: the `params:` right-hand side (bug 0035's fix — probed
    below, fixture C3); single-level inline objects at every position
    (fixture A2 lowers both fields; fixtures B2/B4/D2 raise on a
    single-level typo); a name at the OUTER level of an inline object with a
    nested sibling (fixture D3 raises); `array<{…}>`, whose permissive `{}`
    is deliberate and load-bearing (`src/parser/params.ts:591–612`,
    `src/parser/theta-document.ts:4705–4716`).
- **Observed at:** `0.45.0` (HEAD `f959f8de`). Offline, deterministic, no
  live model: scratch vitest over `parseThetaDocument` (the real load path,
  `tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`,
  `collectUnresolvedNamedTypes`, `lowerTypeSource`, `lowerInlineObject`,
  `respondToolWireSchema`, and the production `AjvSchemaValidator` with the
  real canonical-hash slug function; written, run, deleted.

## Fix (0.49.0)

The settled §Fix, both parts, in the shared lowering so every caller inherits
them; five review rounds and four fixer rounds hardened the dispatch guards,
the retention posture and the comment set. Line anchors are at the fix commit.

**A — `lowerInlineObject`'s interior split nests brace depth.**
`splitTopLevel(body, ",", "angle-and-brace")` (`src/parser/body-type-lowering.ts`).
`topLevelColon` needed no change. This closes the phantom-field and
duplicate-`required` class at the `@<T>` annotation root (fixtures A1, F1, F2,
F3) and restores per-`Type` entries for the diagnostic walk.

**B — the recursive lowerer gains the hoisting inline-object arm.** The hoist
`lowerParamsFieldType` has owned since bug 0035 is factored out as exported
`hoistInlineObjectType` (`src/parser/params.ts`), parameterised by the
caller's per-field recursion. `lowerParamsFieldType` passes itself, so the
`params:` position's bytes and minted slugs are byte-identical to 0.48.0.
`lowerTypeSource` passes an inner helper that returns through its own literal
check, so the SUBS-1 literal sublanguage survives at depth (`{a: {b: "x" |
"y"}}` lowers the enum form, not `anyOf: [{}, {}]`). `body-type-lowering.ts`
imports from `params.ts`; the reverse import the §Fix forbids does not appear.

**Two dispatch guards, settled inside §Fix constraint 1** ("a shape the
lowering cannot derive stays permissive `{}` — permissive is admissible, wrong
is not"). A naive `startsWith("{") && endsWith("}")` also matches a union of
object arms and a shredded brace group, and reading either interior as a field
list mints a `properties` key the author never wrote at that level. So
`lowerTypeSource` hoists a whole source only when it is a SINGLE ENCLOSING
BRACE GROUP (`isSingleEnclosingBraceGroup`), and takes the per-arm path only
when every `|` segment is brace-balanced and at least one is such a group
(`isBraceBalanced`). The two guards are provably disjoint — a balanced segment
set forces brace depth 0 at every cut, a single enclosing group holds depth at
least 1 strictly inside — so their order is immaterial. The shredded family
(`Cat | {a: integer | {c: Ghost} | boolean}`, bug 0033's per-`|`-segment
`arms` caveat) is byte- and diagnostic-identical to 0.48.0, pinned by group (h)
in both directions.

**`$defs` closure absorption.** `buildBodyTypeSchemas`'s pass 3 rebuilt each
name's closure from `bodies`, where an `__inline_<slug>` has no entry — a mint
at the `schema`-body or alias-RHS position would have left a dangling `$ref`
and an AJV `MissingRefError` at compile. A second `inlineBodies` map (first-wins,
never merged into `bodies`, so an `__inline_` name stays unresolvable as an
author-written `NamedType` — bug 0040's subject is untouched) carries the
minted fragments, and pass 3 resolves `bodies` first, `inlineBodies` second.

**Slug-collision posture wired at the new mint sites** (schema-subset.md
§Schema-slug collision posture). The retention is split across two optional
`LowerCtx` sinks: `inlineCanonical` (the canonical bytes the posture requires
beside the artefact) and a new `inlineFragments` (the winning fragment, so a
scope that does not hold the `$defs` entry can re-register it rather than
dangle its `$ref`). The already-minted guard consults BOTH this call's `defs`
and the retention, because `buildBodyTypeSchemas` shares one retention across a
document while giving each schema decl its own `defs` — consulting `defs` alone
let a second decl skip the byte comparison and overwrite the retention
last-wins, the silent aliasing the posture forbids. `collectBodyTypes` drains
the document-scoped sink into the registered `theta/load/schema-slug-collision`
at the offending decl's range, message held to the registry template by DIAG-4.
`lowerQueryResponseSchema` threads the retention per call so the byte check runs
and first-wins is deliberate; it is a runtime call with no load-time channel
(residual (iii)).

**No spec or registry edit.** DIAG-2 holds: no new code, no new row, no trigger
widening. The `unresolved-named-type` row (`code-registry-parse.md:89`) already
names all five positions; `theta/load/schema-slug-collision`
(`code-registry-load.md:58`) was already registered, its trigger is
position-agnostic ("one theta file's lowering pass"), and it was already in
`tests/fixtures/h7a/permitted-codes.json` — H9a's empty-capture stderr gate
needed no change and stayed clean. GOV-15's carve-out covers the newly-refused
inputs enumerated below.

**Reproduction re-derived at the fix baseline** (`8847de79`, 0.48.0): every
fixture A1–A4, B0–B5, C1–C6, D1/D3/D5/D6, E1–E3, F1–F3 byte-identical to the
recorded 0.45.0 table — zero drift, and no cited `path:line` moved. Post-fix:
A1 lowers C3's shape (two root fields, `b` a `$ref` to a fragment carrying both
`x` and `y`, `$defs` closed); A3 (the author's own declared payload) validates
and A4 (the phantom shape) is refused; D6's wire schema follows; B0/B1/B3/D1/D5
each raise exactly one `unresolved named type 'Tirage'` byte-identical to B5,
with the theta refused; C1/C2 lower `$defs.S.properties.p` to a `$ref` and stop
being byte-identical; C5 hoists; C6 lowers an `anyOf` of two `$ref`s.

**Blast radius — lowered bytes that move for thetas that load unchanged**
(§Fix's "assessed before landing"), across a 41-source by 5-position sweep:
(1) brace-rooted `@<T>` roots whose field types contain a brace group — the
phantom family, the nested single-field and nested-literal families, and the
mis-parsed union-of-objects with a nested comma (fixture G7, where part A
removes the phantom the comma minted); (2) non-brace `@<T>` roots that are a
top-level union carrying a balanced brace arm, including `{…} | array<T>`;
(3) every brace-rooted `schema` body field type (`{}` to a `$ref` plus closure
entries); (4) alias RHS — single-group rejoins and balanced brace-arm unions;
(5) the respond-tool `parameters`, the QRY-15 `<schema-json>` conveyance,
QRY-22 validation and the `invoke<T>` return boundary move exactly with (1)–(2).
Unmoved: the `params:` field lowering itself (byte-identical over 18 shapes;
a params document changes only where a referenced schema's closure now carries
hoisted entries), `array<{…}>` (`items: {}`), the empty inline `{}` at every
position (bug 0045 untouched), `@<{}>`, `{a: {}}`, brace-free unions, the
shredded family, and the annotation ROOT's naive brace dispatch (fixture G1).

**Newly-refused inputs** (loaded clean at 0.48.0, now refused; GOV-15
carve-out; the only code is `theta/parse/unresolved-named-type` at error
severity): a name the descent now reaches inside inline-object FIELDS at depth
1 or deeper, including inside a union arm or a generic argument of such a
field's type — at the `@<T>`, `schema`-body-field and alias-RHS positions; and
a name inside a brace-group union ARM of a balanced segment set — at the `@<T>`
and alias-RHS positions (the `schema`-body field position refuses that shape at
parse with `theta/parse/empty-schema-body` already; that clause holds only
where the whole source is not `{`-prefixed and `}`-suffixed — the correction
bug [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md)
§Related records — and is unconditional from its fix (0.58.0), which routes
the brace-suffixed subset through the same walk). NOT refused: the shredded
segment sets; a name inside a brace group that is itself a generic argument
(`array<{x: Tirage}>`, any depth); anything under `params:` (zero new raises).
`theta/load/schema-slug-collision` gains two emission positions with no
constructible input (it needs a genuine 64-bit slug collision).

**Offline lock.** `tests/inline-object-nested-lowering.test.ts` (58 tests):
group (0) an independent `node:crypto` slug oracle over hand-written canonical
forms (`schemaSlug` is never imported), cross-checked against two
production-minted slugs; (a) the annotation root incl. the SUBS-1 literal and
declared-name depths and the unchanged controls; (b) QRY-22 through the real
`AjvSchemaValidator`; (c) the respond-tool wire shape; (d) the five-position
diagnostic parity, message read from the registry (DIAG-4); (e) the
`schema`-body and alias-RHS bytes with `$ref` closure and AJV compile;
(f) the two shared lowerers at the seam; (g) the cross-scope retention states,
the re-registration branch, the collision sink and the registry template;
(h) the shredded-set guard in both directions. Neutralisation evidence, each a
targeted byte edit restored byte-exactly (blob-hash equal before and after;
`git stash` never used): part A gives 12 red with the report's own signatures;
part B whole-source 21 red; part B union-arm 4 red; the `inlineBodies` fallback
7 red, with `MissingRefError: can't resolve reference
#/$defs/__inline_dd69af402813aa7d` reproduced through the production validator;
`arms.every(isBraceBalanced)` forced true gives h1–h3 red while h4 stays green.
Full gate 239 files / 3112 tests; typecheck and lint clean; the bug-0035 lock
(`tests/params-inline-object-lowering.test.ts`) and the bug-0033 lock
(`tests/schema-alias-union-decl.test.ts`) SHA-identical to 0.48.0 and unedited.

**Live.** H8a `tests/live/live-production-acceptance.test.ts` 7/7 and H9a
`tests/live/acceptance/` 11/11 green against the real provider. No shipped live
fixture reaches the changed branch — the live inline-object annotations are all
flat single-level and were proved byte-identical to 0.48.0 — so the obligation
was discharged by a scratch live probe over fixture A1's annotation
(`@<{a: integer, b: {x: integer, y: string}}>`), asserting on the settled
`SessionManager`'s system-note channel and the bound value's shape with a
fixture-pinned sentinel: GREEN with the fix, RED with part A neutralised (the
QRY-11 repair spin against the phantom contract, the live consequence this
report predicts), GREEN again on restore. Probe deleted.

**Residuals.** (i) An author-written duplicate field name
(`{a: integer, a: string}`) lowers a last-wins `properties.a` and
`required: ["a", "a"]` at the newly-hoisting positions — byte-identical to the
frozen `params:` position's output for the same text, so deduping in the shared
arm is not available; the phantom-induced duplicate (fixture F1) IS closed, and
no duplicate-field diagnostic exists for an inline object body. (ii)
`lowerQueryResponseSchema`'s ROOT brace dispatch keeps its naive
prefix/suffix test, so `@<{a: integer} | {b: integer}>` is still read as one
field list and mints an enforcing fragment naming `a` (pinned as fixture G1);
the alias-RHS and non-brace annotation positions handle that shape correctly.
Filed as bug
[0053](./0053-annotation-root-brace-union-read-as-one-field-list.md), which
also found the identical predicate in `collectUnresolvedNamedTypes` that this
residual does not mention, and discharged by its fix (0.58.0): the root
dispatch and the name walk both ask the exported `isSingleEnclosingBraceGroup`
this report added, so the annotation root reaches the same per-arm hoist every
other position already took, and fixture G1's pin (`a9`) moved to the SUBS-1
`anyOf` under 0053's authority.
(iii) The annotation position's mint is a runtime call, so its collision sink
has no load-time diagnostic channel; the byte check runs and first-wins holds,
but a mismatch there is retained without a report. (iv) `hoistNestedDefs`
(params.ts) and `pruneDocumentDefs` (query-schema-lowering.ts) merge
`__inline_` names arriving from two independent mint scopes under name-keyed
first-wins with no byte comparison — a surface that did not exist while only
`params:` minted. (v) Bug 0043's family narrows: `{a: integer} | array<integer>`
lowered `{}` (swallowed by `lowerTypeExpr`'s generic pre-emption) and now lowers
`anyOf: [{$ref}, {type: array}]`; brace-free unions stay `{}`. Discharged by
bug [0043](./0043-union-nonprimitive-arm-lowers-permissive.md)'s fix (0.53.0),
which retired the pre-emption itself: `lowerTypeExpr` splits a union before
testing for a generic application, so the brace-free unions this residual
left `{}` now lower per SUBS-1 too. The `braceFree` cell that pinned
`Triage | array<integer>` to `{}`
(`tests/inline-object-nested-lowering.test.ts`) moved to the `anyOf` under
that fix's authority; the other two rows are byte-unchanged, and the
brace-arm dispatch this report added is untouched — at the `params:`
position, whose naive brace check declines a source ending `>`,
`{a: integer} | array<integer>` moves from `{}` to `anyOf: [{}, {type:
array}]`, the permissive fragment surviving as one variant. (vi) Bug 0044's
blast radius widens: keyword-shaped text at the newly-descended sites now draws
the row (`@<{a: {b: match}}>` refuses). Discharged by bug
[0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s fix
(0.54.0): the descent this report added is unchanged and those sites still
refuse, but the row they draw is now
`theta/parse/reserved-keyword-as-identifier` — a reserved spelling is not a
`NamedType ::= Ident`, so `theta/parse/unresolved-named-type` was never its
trigger. `@<{a: {b: match}}>` is pinned at the new row in that fix's witness.
(vii) `lowerTypeSource`'s literal-union
arm emits a bare `{ enum: [...] }` where SUBS-1 (schema-subset.md `:81`) spells
`{"type": "string", "enum": [...]}` — pre-existing, pinned as a control. Filed as
[0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md), which
corrects the record in two ways — the governing line is `:80`, the step-3 enum /
string-literal-union emission rule, not `:81` (SUBS-1 governs unions of
`PrimitiveType`, and a string-literal union is `LiteralType` arms), and the
divergence is not confined to the annotation root but reaches every
`lowerTypeSource` position at every depth after this fix's part B — and
discharged by its fix (0.59.0): the arm emits `{"type":"string","enum":[…]}` with
`type` first when every arm is a string literal, so that spelling and the
equivalent named `enum` produce byte-identical fragments, one `respondSchemaSlug`
and one respond-tool registration. Non-string literal unions keep the bare
`enum`, which `:80` does not spell. The `a10` control was re-pinned with the spec
line as authority, discharging the purpose its own comment states.
(viii) The `params:` position has no literal sublanguage at any depth
(`p: "x" | "y"` lowers `anyOf: [{}, {}]`) where the `lowerTypeSource` positions
do; the shared arm takes each caller's own recursion precisely so that
asymmetry does not move the frozen `params:` bytes. All unfiled.

## Summary

An inline object type is recursive by the grammar: a field's `Type` may be
another inline object. `lowerInlineObject` splits the field list on
top-level commas without tracking brace depth, so
`{a: integer, b: {x: integer, y: string}}` reads as the three entries
`a: integer`, `b: {x: integer`, `y: string}`. Separately, no lowerer below
a root has an inline-object arm, so a nested object's own shape and names
are dropped even when no comma is involved.

The two mechanisms produce three dispositions, which differ per position and
must not be conflated:

1. **The `@<T>` annotation root mints a wrong fragment and enforces it.**
   This is the one position where `lowerInlineObject` is the root lowerer,
   so its fragment becomes the response schema: `properties` gains a
   top-level `y` the author declared one level down, `b` lowers `{}`, and
   `required` lists `[a, b, y]`. QRY-22 validates the model's reply against
   that fragment and QRY-15 conveys it to the model, so the author's own
   conformant payload fails validation and a payload matching the phantom
   shape passes. When a nested field name equals an outer field name, the
   outer field's lowered type is replaced by `{}` and `required` carries the
   name twice.
2. **The diagnostic name walk stops one level down.** At the `@<T>`
   annotation, a `schema` body field type and the alias/union RHS,
   `{a: integer, b: {x: Tirage, y: string}}` raises nothing:
   `theta/parse/unresolved-named-type` is silent on a typo the identical
   text raises on at the `params:` position, and raises on at all four
   positions when the same typo sits at the outer level.
3. **The `schema` body field and alias-RHS positions lower `{}`.** An
   inline object type as a field type never reaches `lowerInlineObject`
   at all — `lowerObjectFields` lowers each field through `lowerTypeSource`
   — so `schema S { p: {a: integer, b: {x: integer, y: string}} }` lowers
   `$defs.S.properties.p = {}`. That is permissive-silent (it asserts
   nothing), not phantom-wrong, and it holds for a flat inline object too.

So the annotation root is wrong where the field positions are merely empty,
and both are silent.

## Reproduction

Offline at HEAD `f959f8de`. `Triage` is declared in every fixture that
names it; `Tirage` is declared nowhere. Probe output quoted verbatim.

**(1) The annotation root — `lowerQueryResponseSchema(annotation, [])`,
then the production AJV validator over its result.**

```
A1 annotation root nested :: {"type":"object","properties":{"a":{"type":"integer"},"b":{},"y":{}},"required":["a","b","y"],"additionalProperties":false}
A2 annotation root flat   :: {"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false}
A3 conformant payload {"a":1,"b":{"x":1,"y":"s"}} :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/required","keyword":"required","message":"must have required property 'y'","params":{"missingProperty":"y"}}]}
A4 phantom payload    {"a":1,"b":{"anything":true},"y":"s"} :: {"ok":true}
D6 respondToolWireSchema :: {"type":"object","properties":{"a":{"type":"integer"},"b":{},"y":{}},"required":["a","b","y"],"additionalProperties":false}
```

A1 is `@<{a: integer, b: {x: integer, y: string}}>`; A2 is
`@<{a: integer, b: string}>` and is correct. A3 is the reply the author's
own declaration describes, refused. A4 is the phantom shape, accepted. D6
is the wire schema the forced respond turn registers and the QRY-15
template interpolates (`query-failure-and-repair.md:42`) — the phantom
fragment verbatim, because an object-rooted lowering needs no envelope.

Further damage at the same root:

```
F1 {a: integer, b: {x: integer, a: string}}            :: {"type":"object","properties":{"a":{},"b":{}},"required":["a","b","a"],"additionalProperties":false}
F2 {a: integer, b: {x: integer, y: string}, c: boolean} :: {"type":"object","properties":{"a":{"type":"integer"},"b":{},"y":{},"c":{"type":"boolean"}},"required":["a","b","y","c"],"additionalProperties":false}
F3 {a: integer, b: {x: {p: integer, q: integer}, y: string}} :: {"type":"object","properties":{"a":{"type":"integer"},"b":{},"q":{},"y":{}},"required":["a","b","q","y"],"additionalProperties":false}
```

F1: the nested field name `a` collides with the outer field's, so the
outer field's `{"type":"integer"}` is overwritten by the phantom `{}` and
`required` names `a` twice. F3: two levels of nesting hoist two phantom
names.

**(2) The diagnostic walk — `parseDoc` over the real load path; codes
only.** `T` is `{a: integer, b: {x: Tirage, y: string}}`.

```
B0  collectUnresolvedNamedTypes(T)                          :: []
B0b collectUnresolvedNamedTypes("{a: integer, b: Tirage}")  :: ["Tirage"]
B1  @<T>                                    :: []
B2  @<{a: integer, b: Tirage}>              :: ["theta/parse/unresolved-named-type"]
B3  schema S { p: T }                       :: []
B4  schema S { p: {a: integer, b: Tirage} } :: ["theta/parse/unresolved-named-type"]
B5  params: p: T                            :: ["theta/parse/unresolved-named-type"]  "unresolved named type 'Tirage'"
B6  params: p: {a: integer, b: Tirage}      :: ["theta/parse/unresolved-named-type"]
D1  schema X = T                            :: []
D2  schema X = {a: integer, b: Tirage}      :: ["theta/parse/unresolved-named-type"]
D3  @<{a: Tirage, b: {x: integer, y: string}}> :: ["theta/parse/unresolved-named-type"]  "unresolved named type 'Tirage'"
D5  @<{a: integer, b: {x: Tirage}}>         :: []
```

B1/B3/D1 are the three under-emitting positions on text B5 raises on.
D3 bounds the loss to nesting depth: an outer-level typo still raises with
a nested sibling present. D5 bounds it away from mechanism A: the nested
object has one field and no interior comma, and the typo is still invisible
— mechanism B alone.

**(3) The `schema` body field position — `parseDoc`, then the frontmatter's
lowered `params:` schema for `s: S`.**

```
C1 schema S { p: {a: integer, b: {x: integer, y: string}} }  diags []
   lowered :: {"type":"object","properties":{"s":{"$ref":"#/$defs/S"}},"required":["s"],"additionalProperties":false,"$defs":{"S":{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}}}
C2 schema S { p: {a: integer, b: string} }                   diags []
   lowered :: {"type":"object","properties":{"s":{"$ref":"#/$defs/S"}},"required":["s"],"additionalProperties":false,"$defs":{"S":{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}}}
C3 params: p: {a: integer, b: {x: integer, y: string}}       diags []
   lowered :: {"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_dd69af402813aa7d"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_c319be1cd4ab5f98":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"string"}},"required":["x","y"],"additionalProperties":false},"__inline_dd69af402813aa7d":{"type":"object","properties":{"a":{"type":"integer"},"b":{"$ref":"#/$defs/__inline_c319be1cd4ab5f98"}},"required":["a","b"],"additionalProperties":false}}}
C4 @<{a: integer, b: {x: integer, y: string}}>  diags []
```

C1 and C2 are byte-identical: the body field position lowers `{}` for a
nested and a flat inline object alike, so element 3 is not a nesting
defect. C3 is the same declaration at the `params:` position after bug
0035's fix — two hoisted `__inline_` defs, both fields of the nested object
present — and is what the other positions are measured against. C4 shows
the phantom annotation loads with zero diagnostics.

**Mechanism B in isolation** — `lowerTypeSource` and `lowerInlineObject`
called directly, `Triage` present in the resolution map:

```
E1 lowerTypeSource("{x: Tirage, y: string}") :: {} unresolved=[]
E2 lowerTypeSource("{x: Triage}")            :: {} unresolved=[]
E3 lowerInlineObject("a: integer, b: {x: Tirage, y: string}") :: {"type":"object","properties":{"a":{"type":"integer"},"b":{},"y":{}},"required":["a","b","y"],"additionalProperties":false} unresolved=[]
```

E2 is the sharpest statement of mechanism B: a nested inline object whose
single field names a DECLARED schema still lowers `{}` and registers no
`$ref`.

## Expected behaviour

- schema-subset.md step 2 (`:73`) and step 3 (`:76`), and grammar.md `:109`
  (recursive `Type` in each field): at every type position, a nested inline
  object hoists into `$defs` under `__inline_<slug>` and the enclosing
  field emits `{"$ref": "#/$defs/__inline_<slug>"}`. Fixture A1 lowers to
  the shape C3 lowers for the identical declaration: two fields at the
  root, `b` a `$ref` to a fragment carrying both `x` and `y`. No fragment
  names a property the author did not declare at that level, and no
  `required` list carries a name twice.
- QRY-22 (`docs/spec_topics/query/query-failure-and-repair.md:78`): the
  reply the author's declaration describes validates; a reply omitting `b`'s
  declared fields does not. A3 passes and A4 fails.
- `code-registry-parse.md:89`:
  `{a: integer, b: {x: Tirage, y: string}}` raises exactly one
  `theta/parse/unresolved-named-type` naming `Tirage` at each of the five
  registered positions, at error severity, with the theta refused —
  fixtures B1, B3 and D1 byte-identical to B5.
- schema-subset.md step 2 at the `schema` body field and alias-RHS
  positions: `schema S { p: {a: integer, b: string} }` lowers
  `$defs.S.properties.p` to a `$ref`, not `{}` (fixture C2).
- Unchanged: `array<{…}>` keeps its permissive `{}` (the angle-only
  argument split is load-bearing — `src/parser/params.ts:591–612`), and an
  empty inline `{}` keeps its current permissive disposition;
  grammar.md `:109`'s `empty-schema-body` case stays unimplemented at every
  position (0033 §Fix residual (iv)).

## Actual behaviour / root cause

**Mechanism A — the interior split does not track braces.**
`lowerInlineObject` (`body-type-lowering.ts:95`) calls
`splitTopLevel(body, ",")` (`:101`) with the nesting argument omitted.
`splitTopLevel`'s default is `"angle"` (`params.ts:624`), which increments
depth only on `<` and, when `tracksBraces` is set, `{` (`:627`) — it is not
set here. `topLevelColon` (`:566`) does track brace depth, so each
truncated entry still splits at its own first depth-0 colon: `b: {x: integer`
yields the field `b` with type source `{x: integer`, and `y: string}`
yields a field named `y`. Both go to `lowerObjectFields` (`:70`), which
marks every field it is handed `required` and sets
`additionalProperties: false`. The result is fixture A1 / E3.

**Mechanism B — no lowerer below a root has an inline-object arm.**
`lowerObjectFields` lowers each field through `lowerTypeSource` (`:79`),
whose only arms are the literal sublanguage (`:139–150`) and
`lowerTypeExpr` (`:152–153`). `lowerTypeExpr` (`params.ts:357`) recognises
generics, unions, primitives and identifiers, and drops everything else on
its trailing catch-all (`:409–411`) — brace-rooted sources included, which
its own comment records. So a nested inline object lowers `{}` and none of
its names is pushed to `lowerCtx.unresolved` (fixtures E1, E2, D5). Since
the `schema` body field and alias-RHS positions lower through
`lowerTypeSource` and never through `lowerInlineObject`, mechanism B is the
whole of element 3 (fixtures C1, C2).

**Why the annotation root is the position that ends up wrong rather than
empty.** `lowerQueryResponseSchema` (`query-schema-lowering.ts:88`)
dispatches a brace-rooted annotation to `lowerInlineObject` at `:108–113`
and returns that fragment as the document root. Nothing downstream can tell
the phantom fields from declared ones: `production-theta-producer.ts:2314`
performs this lowering once and hands the same object to the validation
collaborator, the respond-tool registration and the QRY-15 template
(`:2344`), `typed-query-validation.ts:196` derives the wire schema from it
(`respond-tool-wire.ts:91` returns an object root verbatim), and `:3308`
repeats the lowering at the `invoke<T>` return-value boundary. The
diagnostic walk cannot flag the input either: `collectUnresolvedNamedTypes`
(`body-type-lowering.ts:334`) resolves names through the SAME two
mechanisms (`:342–345`), so the fragment it builds is truncated in exactly
the way that hides the typo, and it discards the fragment and returns only
names.

**Why the `params:` position is exempt.** `parseParams` routes a
brace-rooted field through `lowerParamsFieldType` (`params.ts:454`), which
splits `"angle-and-brace"` (`:465`) and recurses into ITSELF for a nested
brace-rooted type, so both mechanisms are absent there. Its doc comment
(`:424–441`) states mechanism A's damage and records the divergence as
deliberate; `theta-document.ts:4674–4703` records the diagnostic side of
the same asymmetry.

## Why it matters

- The annotation root is the only place in the pipeline where a silent
  lowering defect becomes an ENFORCED wrong contract. A permissive `{}`
  validates everything; the phantom fragment refuses the author's declared
  shape, and QRY-11 repair cannot recover — the model is shown the same
  phantom schema on every follow-up turn (D6), so a conforming author reply
  fails, is repaired towards the phantom shape, and either terminates as
  `Err(QueryError { kind: "validation", cause: "schema_validation" })` or
  binds a value whose `b` was never checked.
- The same lowering governs `invoke<T>` return values
  (`production-theta-producer.ts:3308`), so a nested inline return
  annotation refuses a conformant callee return as
  `InvokeInfraError { cause: "return_validation" }`.
- Three of five positions of a closed DIAG-2 row under-emit, and the row
  claims otherwise. An author who moves a type expression between
  annotation positions — the uniformity type-system.md `:15` states — gets
  the typo caught under `params:` and silence under `@<T>`, on
  byte-identical text.
- The failure is invisible at authoring time. Fixtures C4, B1, B3 and D1
  load with zero diagnostics; the symptom surfaces at query time as a
  validation failure against a schema the author cannot find in their
  source.
- Element 3 keeps a documented spec step (hoist in ANY type position)
  unimplemented at two positions whose lowered bytes reach both AJV and the
  model.

## Fix

One change pair in the shared lowering, so every caller inherits it. Both
parts are required: part A alone leaves the nested shape dropped and the
nested typo silent (fixtures D5, E1, E2); part B alone leaves the phantom
fields and the wrong `required` at the annotation root (fixture E3).
Neither part is new machinery — the `params:` position implements both
already, and the fix makes the shared lowerer do what
`lowerParamsFieldType` does.

**A — `lowerInlineObject`'s interior split nests brace depth.**
`splitTopLevel(body, ",", "angle-and-brace")` at
`body-type-lowering.ts:101`. `topLevelColon` needs no change (it already
tracks brace depth). This closes the phantom-field and duplicate-`required`
class at the annotation root and restores per-`Type` entries for the
diagnostic walk at all three positions. It does NOT touch bug 0033's
per-`|`-segment `arms` caveat (`theta-document.ts:563`): that segmentation
is a different call site — the alias-RHS capture's own
`splitTopLevel(rhsSource, "|")` (`:2296`) and the re-split
`lowerTypeSource` applies to the rejoined arms (`:139`) — both still
angle-only, and both out of scope here.

**B — the recursive lowerer gains the hoisting inline-object arm.**
`lowerTypeSource` (`:131`) already builds the `LowerCtx` (`:152`) whose
`defs` record is the hoist target, so a brace-rooted source routes through
the arm `lowerParamsFieldType` (`params.ts:454`) implements: hoist under
`__inline_<slug>`, retain the canonical-form bytes, dedup on byte equality,
first-wins on a byte mismatch. The import direction permits sharing one
implementation — `body-type-lowering.ts:15` already imports from
`params.ts`, and `params.ts` must not import back.

Constraints on any implementation of the above:

- **No silent-wrong fragment survives.** After the fix, no position may
  lower a `properties` key or a `required` entry the author did not write
  at that level, and no `required` list may repeat a name (fixture F1). A
  shape the lowering cannot derive stays permissive `{}` — permissive is
  admissible, wrong is not.
- **Cross-position diagnostic identity for identical text.**
  `{a: integer, b: {x: Tirage, y: string}}` raises exactly one
  `unresolved named type 'Tirage'` at all five positions of the
  `code-registry-parse.md:89` row, with the theta refused. The two message
  literals (`theta-document.ts:4718`, `parseParams`) stay held identical by
  DIAG-4, not by shared code. GOV-15's diagnostic-registry carve-out
  (`docs/spec_topics/governance/source-language-stability.md:25`) covers
  the newly-refused typo inputs, exactly as it covered 0035's; the row
  already names all five positions, so no registry edit is needed.
- **The literal sublanguage must not regress.** Literal handling lives in
  `lowerTypeSource` (`:139–150`), not in `lowerTypeExpr`
  (`params.ts:409–411`), so the arm must recurse each field's type back
  through `lowerTypeSource` — otherwise a nested `{a: "x" | "y"}` lowers
  `anyOf: [{}, {}]` where the same field at depth 0 lowers
  `{"type":"string","enum":["x","y"]}` (SUBS-1, schema-subset.md `:81`).
  This constraint's mechanism held, but its cited depth-0 byte string was the
  spec's rather than the implementation's: depth 0 lowered `{"enum":["x","y"]}`
  here and at every release until bug
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md)'s fix
  (0.59.0) made the sentence true as written. The rule is `:80`, not `:81`.
- **`buildBodyTypeSchemas`'s `$defs` discipline must absorb the new
  entries.** Pass 2 discards `lowerObjectFields`'s nested `$defs`
  (`body-type-lowering.ts:237`) and pass 3 rebuilds the closure by looking
  each name up in `bodies` (`:270–282`). An `__inline_<slug>` name has no
  `bodies` entry, so a hoisted inline def minted at the body-field or
  alias-RHS position would be dropped from the closure and leave a dangling
  `$ref` that fails AJV compilation with `MissingRefError`. The acyclicity
  invariant pass 3 exists to maintain — the one `pruneDocumentDefs`
  (`query-schema-lowering.ts`) and `inlineDefsRefs`
  (`src/binder/binder-inference.ts:219`) both rely on — must hold for the
  new entries too.
- **The slug-collision posture must be wired where entries are now
  minted.** `LowerCtx.inlineCanonical` and `LowerCtx.slugCollisions` are
  optional precisely because only the `params:` position minted
  `__inline_` entries (`params.ts:306–318`); the body-type and
  query-lowering call sites thread neither. Minting at those positions
  without threading both sinks leaves a byte-mismatched slug match silently
  first-wins, against schema-subset.md `:112` and the registered
  `theta/load/schema-slug-collision`
  (`docs/spec_topics/diagnostics/code-registry-load.md:58`).
- **QRY-15 / wire-shape blast radius is assessed before landing.** The
  lowered bytes at the annotation root, the `schema` body field and the
  alias RHS all change for inline-object inputs, and those bytes are both
  AJV-enforced and conveyed to the model — the respond tool's `parameters`
  and the `<schema-json>` interpolation
  (`query-failure-and-repair.md:42`, `query-tool-loop.md:37`). Payloads
  that validated under the phantom or permissive fragments (A4, C1) will
  fail and route through QRY-11 repair; that is the QRY-22 correction, but
  it changes runtime outcomes for thetas that load unchanged, so the
  affected shapes are enumerated in the fix's evidence rather than
  discovered by users.
- **The `params:` position's bytes do not move.** Its 37-test lock
  (`tests/params-inline-object-lowering.test.ts`) stays green byte-for-byte,
  including the minted slugs, if the shared arm is factored out of
  `lowerParamsFieldType`.
- **Existing pins that move by design.** A well-formed brace-rooted union
  arm currently lowers permissively; part B makes it hoist a `$ref`, so
  `tests/schema-alias-union-decl.test.ts` group (j) (j3 pins the lowered arm
  COUNT and deliberately carries no byte pin on the inline-object arm) stays
  green while the arm's bytes change, and 0033 §Fix residual (ii) narrows to
  the shapes the lowerer still does not support. Body-position pins that
  assert `properties.<f> = {}` for an inline-object field type invert; each
  such pin is re-derived rather than relaxed.

Element 3's disposition: the route above closes it, because the `schema`
body field and alias-RHS lowerings run through `lowerTypeSource`. The
overlap with the separately filed permissive-`{}` family is the
inline-object shape only; that family's other members — the non-`array`
generic arm, an unresolved name, a literal arm of a mixed union — keep
their `{}` and are not touched here.

## Provenance

- Origin: bug [0035](./0035-params-rhs-inline-object-under-emission.md)
  review round 1 finding F1 (`.pi/tmp/fixes/0035-report.md:8`, `:11`) — the
  `params:`-position half was fixed in 0.44.0 with the
  `"angle-and-brace"` interior split; the sibling half was recorded as
  0035 §Fix (0.44.0) residual (i) (`:141`) and left unfiled. This report
  files it, re-derives it at HEAD, and corrects residual (i)'s position
  count (three siblings, not two — bug
  [0033](./0033-body-level-schema-alias-unsupported.md) added the alias
  RHS) and its claim that all siblings mint a wrong fragment (only the
  annotation root does; the others lower `{}`).
- Spec: `docs/spec_topics/grammar.md:109` (§Inline object types —
  `ObjectType` in any `Type` position, recursive `Type` per field);
  `docs/spec_topics/schema-subset.md:73` (§Lowering Algorithm step 2 — the
  inline hoist in any type position), `:76` (step 3 — the `$ref`
  emission), `:81` (SUBS-1), `:112` (§Schema-slug collision posture);
  `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22), `:42`
  (`<schema-json>` is the respond tool's wire schema);
  `docs/spec_topics/query/query-tool-loop.md:37` (QRY-15), `:20`
  (§Respond-tool wire schema);
  `docs/spec_topics/type-system.md:15` (one type grammar in every
  annotation position);
  `docs/spec_topics/diagnostics/code-registry-parse.md:89`
  (`theta/parse/unresolved-named-type`, the five-position row — the `@<T>`
  annotation, the `schema` body field type and the alias/union RHS are
  positions 2, 3 and 4 of that list);
  `docs/spec_topics/diagnostics/code-registry-load.md:58`
  (`theta/load/schema-slug-collision`);
  `docs/spec_topics/governance/source-language-stability.md:25` (GOV-15
  diagnostic-registry carve-out).
- Implementation evidence at HEAD `f959f8de`:
  `src/parser/body-type-lowering.ts:95`/`:101`/`:113`
  (`lowerInlineObject` and its angle-only split), `:70`/`:79`
  (`lowerObjectFields`), `:131`/`:139–150`/`:152–153`
  (`lowerTypeSource`), `:237`/`:270–282` (`buildBodyTypeSchemas` passes
  2–3), `:334`/`:342–345` (`collectUnresolvedNamedTypes`);
  `src/parser/params.ts:117` (`parseParams`), `:293–319` (`LowerCtx`,
  including the optional collision sinks), `:357`/`:409–411`
  (`lowerTypeExpr` and its catch-all), `:424–441`/`:454`/`:465`
  (`lowerParamsFieldType` and its `"angle-and-brace"` split), `:566`
  (`topLevelColon`), `:591–612`/`:614`/`:621`/`:624`/`:627`
  (`TypeSplitNesting`, `splitTopLevel` and its `"angle"` default);
  `src/parser/theta-document.ts:563` (the 0033 `arms` per-segment caveat),
  `:4674–4703` (the five positions and the recorded asymmetry), `:4718`
  (`unresolvedNamedTypeDiagnostic`), `:4773`
  (`queryResponseAnnotation`), `:5425`/`:5823`/`:6075` (the walker's three
  production call sites);
  `src/runtime/query-schema-lowering.ts:88`/`:108–113`
  (`lowerQueryResponseSchema`'s brace-rooted arm);
  `src/runtime/respond-tool-wire.ts:91` (`respondToolWireSchema`);
  `src/runtime/typed-query-validation.ts:196`/`:219–223`;
  `src/extension/production-theta-producer.ts:2314`/`:2344`/`:3308` (the
  single lowering, its three consumers, the `invoke<T>` boundary);
  `src/binder/binder-inference.ts:219` (`inlineDefsRefs`).
- Reproduction: scratch vitest at HEAD `f959f8de` — fixtures A1–A4, B0–B6,
  C1–C4, D1–D6, E1–E3, F1–F3 quoted verbatim above, over
  `parseThetaDocument`, `lowerQueryResponseSchema`,
  `collectUnresolvedNamedTypes`, `lowerTypeSource`, `lowerInlineObject`,
  `respondToolWireSchema` and the production `AjvSchemaValidator` (real
  `schemaSlug` / `canonicalForm`); deleted per scratch policy.

## Note (2026-08-02) — clauses touched by bug 0040's fix (0.50.0)

Two clauses of §Fix (0.49.0) are now dated, without their substance changing.

1. *`$defs` closure absorption* says `inlineBodies` is never merged into
   `bodies` "so an `__inline_` name stays unresolvable as an author-written
   `NamedType` — bug 0040's subject is untouched". Still true, and now
   redundant on the reachable path: bug
   [0040](./0040-inline-slug-def-namespace-not-reserved.md)'s fix reserves the
   four schema-subset.md §Synthesised names forms against an `import` /
   `export` specifier's local binding
   (`theta/parse/import-reserved-synthesised-name`) and bars
   `lowerTypeExpr`'s `IDENTIFIER` arm from registering a resolved fragment
   under a reserved-form key. Keeping the two maps separate remains the local
   invariant; it is no longer the only thing holding the namespace.
2. *Slug-collision posture wired at the new mint sites* — the retention arm's
   comment about an entry carrying no retained canonical bytes attributed that
   input class to an author-declared `__inline_<16hex>` schema. With the
   namespace reserved, its only remaining reachable input is a cross-scope
   mint, which is bug
   [0054](./0054-inline-slug-merges-unchecked-across-mint-scopes.md)'s
   §Element 1; the comment was rewritten to say so. The branch's behaviour is
   unchanged.

Residual (iv) (the name-keyed first-wins merges in `hoistNestedDefs` and
`pruneDocumentDefs`) is **not** discharged — it remains open as bug 0054. What
0040's fix did close is the instance where residual (iv) composed with 0040's
own mechanism: an imported reserved-form binding no longer reaches the merge,
so a `schema` body field's hoisted fragment keeps its enforcement.

### Note — bug 0096 (0.73.0)

Note only; nothing here is discharged.
[0096](./0096-discriminator-field-classifier-naive-brace-test.md) routed
`classifyDiscriminatorFieldType` (`src/parser/theta-document.ts`) through
`isSingleEnclosingBraceGroup`, and **§Fix's freeze on the `params:` position is
intact**: `src/parser/params.ts` is byte-unchanged by that fix (`git diff` on it
empty), so `lowerParamsFieldType` keeps its own naive prefix/suffix brace test
and `p: "{a: integer} | {b: integer}"` keeps hoisting the one fragment it hoists
today. That copy is now the only occurrence of the naive form in `src/` outside
`isSingleEnclosingBraceGroup`'s own first statement, which is what the
predicate's re-derived closing paragraph records.
