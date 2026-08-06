# Bug 0046 — `schemas.md` §Discriminated unions prescribes no disposition for two reachable `by <field>` inputs, and the implementation loads both with zero diagnostics: an explicit `by` naming a field no variant declares silences every discriminator rejection the same variants draw under implicit detection, and a `by` over a ≥2-arm union whose arms are not all object schemas is accepted as a clause with no subject

- **Status:** open.
- **Kind:** spec gap — two input classes on one clause, both reachable and both
  silent. Neither class is a divergence from a stated rule: the spec states no
  rule for either, and the implementation records that silence rather than
  inventing a code for it
  (`src/parser/schema-declarations.ts:585–596`,
  `tests/schema-alias-union-decl.test.ts:1448`, `:2123`).
  1. *An explicit `by` naming a field no variant declares.*
     `schema Animal by ghost = Cat | Dog` resolves `ghost` against nothing in
     either variant, so every constraint in `checkExplicitDiscriminator`
     evaluates over a list of `undefined` occurrences and returns clean.
     `docs/spec_topics/schemas.md:99–101` states the three properties a
     discriminator must have, `:103` / `:115` prescribe the codes for a
     non-string, non-unique or nested one, and `:105` prescribes
     `theta/parse/missing-discriminator` for **implicit** detection finding no
     candidate. No text disposes of an explicit `by` whose field is absent.
  2. *An explicit `by` over a ≥2-arm union whose arms are not all object
     schemas.* `schema X by f = string | integer` loads with zero diagnostics.
     `theta/parse/by-on-object-schema`'s Trigger
     (`docs/spec_topics/diagnostics/code-registry-parse.md:56`) cuts on the
     declaration's shape and states that this input is outside its emission
     set; the discriminator rows scope to object-schema arms
     (`src/parser/theta-document.ts:5487–5496`, `:5431`); and `schemas.md:97` defines a
     discriminated union as a union "whose variants are all object schemas"
     without dispositioning a `by` over anything else. `:117` disposes of the
     *arms* (a mixed union "lower[s] as plain `anyOf`") and says nothing about
     the clause.

  Both classes accept author intent the language cannot honour: a
  discriminator over a field no variant declares, or over arms that have no
  fields. In both, the clause changes no lowered byte and no type-layer
  answer.
- **Related:**
  [0033](./0033-body-level-schema-alias-unsupported.md) — the fix (0.45.0) that
  made the explicit-discriminator form parse and check end-to-end, and the
  origin of this report. Its §Fix (0.45.0) *Residuals* (v) records both classes
  ("The `by` field naming no variant's field, and `by` over a non-object ≥2-arm
  union, load silently — spec-undecided, pinned as observed") and its witness
  file pins them as cells i2 (`tests/schema-alias-union-decl.test.ts:1448`) and
  n22 (`:2123`). This report holds the disposition 0033 deferred; it changes
  nothing 0033 landed. Sibling reports from the same residual list:
  [0042](./0042-schema-decl-same-line-residue-silent.md) (residual (i)),
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) (residual (ii)),
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)
  (residual (iii)),
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)
  (residual (iv)). This report is residual (v); the list is then fully filed.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/schema-declarations.ts:580–632` —
    `checkExplicitDiscriminator`, class 1's frame. `:597–600` resolves the
    author's field per variant through
    `thetaNamedFieldInVariant` (`:409–415`), which returns `undefined` when no
    field carries the name. Each of the three gates below then declines:
    `:604` (`evaluation.anyNested`), `:618` (`allLiteral && !allString &&
    firstNonStringKind !== undefined`), `:623–627` (`allLiteral && allString &&
    firstDuplicateValue !== undefined`). `:631` returns `[]`.
  - `src/parser/schema-declarations.ts:585–596` — the comment recording the
    silence as undecided: "A `by` naming NO theta-side field of the variants
    resolves to nothing, so every constraint below is vacuous and this function
    returns clean. That disposition is UNDECIDED by the specification … No code
    is invented for it here."
  - `src/parser/schema-declarations.ts:476–516` — `evaluateOccurrences`, which
    fixes what an absent occurrence can and cannot trip. `:480`
    `presentInAll = occurrences.every((o) => o !== undefined)`; `:482–483`
    `allLiteral` is conjoined with `presentInAll`; `:488–489` `allString` and
    `firstNonStringKind` are derived from the literals of an `allLiteral`
    evaluation only. So the non-string and duplicate-value gates are
    unreachable whenever any occurrence is absent. `:481`
    `anyNested = occurrences.some((o) => o?.nested === true)` is the one
    property computed with `.some`, which is why a *half*-present field whose
    present occurrence is nested is the single arrangement of class 1 that
    still raises (fixture A6).
  - `src/parser/schema-declarations.ts:519–577` — `detectImplicitDiscriminator`,
    the control path. It filters candidates by `presentInAll && allLiteral`
    over `orderedWireNames` (`:523–525`), so it cannot select an absent field
    and reaches `missing-discriminator` (`:568–576`) instead. This is the asymmetry: the
    implicit path has a terminal rejection for "no candidate", the explicit
    path has none.
  - `src/parser/schema-declarations.ts:376–386` — `checkDiscriminatedUnion`'s
    dispatch. `decl.by !== undefined` routes to the explicit path
    unconditionally; the implicit path is not consulted as a fallback when the
    named field resolves to nothing.
  - `src/parser/schema-declarations.ts:665–686` — `ByClauseDecl`'s doc comment,
    class 2's record: "The cut is the arm count, NOT whether the arms form a
    discriminated union: a two-arm primitive union
    (`schema X by f = string | integer`) classifies as `"union"` and this check
    admits it."
  - `src/parser/schema-declarations.ts:694–713` — `checkByClause`. `:702–704`
    returns `undefined` for `form === "union"`; the `by-on-object-schema`
    diagnostic at `:705–712` is reached only by the one-variant forms.
  - `src/parser/theta-document.ts:5418` — `const byForm = s.arms.length >= 2 ?
    "union" : "object"`, the arm-count classification; `:5428–5430` the
    `checkByClause` call.
  - `src/parser/theta-document.ts:5431–5439` — the `checkDiscriminatedUnion`
    call, gated on `buildUnionVariantSchemas` returning a variant list. The
    `by` field is forwarded (`:5435`) but the whole check is skipped when the
    gate declines.
  - `src/parser/theta-document.ts:5487–5517` — `buildUnionVariantSchemas`, the
    gate that makes class 2 silent. `:5502` returns `undefined` for fewer than
    two arms; `:5507–5509` for any arm that is not a bare identifier;
    `:5511–5513` for any identifier that is not a declared object-form schema.
    A primitive, literal, generic, inline-object, alias or `enum` arm takes one
    of the last two exits, so no `by`-carrying declaration with such an arm is
    ever checked as a discriminated union.
  - `src/parser/theta-document.ts:2261–2269` — `finishObjectSchema`, which
    retains the clause on the object form specifically so `checkByClause` sees
    it; `:2294–2312` — `finishAliasSchema`, the union form's capture. Both
    are correct; the gap is downstream of them.
  - `docs/spec_topics/schemas.md:95–117` — §Discriminated unions in full. `:97`
    the all-object-schema definition and implicit detection; `:99–101` the
    three detection properties; `:103` `non-string-discriminator`, applying
    "equally to implicit detection and to the explicit `by <field>` form
    below"; `:105` `ambiguous-discriminator` / `missing-discriminator`, the
    latter scoped to detection ("If none qualify"), plus the rationale
    "Discriminator-less object unions are rejected because they degrade
    structured-output quality at every major provider"; `:107–111` the explicit
    form and its example; `:113` the `by`-on-object-body rule; `:115`
    `duplicate-discriminator-value` and `nested-discriminator`; `:117` mixed
    unions. `:103` is explicitly shared with the explicit form, and `:115`'s two
    rules are implemented on both paths; `:105`'s two rejections resolve
    *candidate selection* and are stated over detection alone, and no rule
    replaces them for the explicit form.
  - `docs/spec_topics/schemas.md:46` — §Wire-name renaming: "The explicit form
    `by <field>` accepts the theta-side name — the only name visible in code —
    and the lowering resolves it to each variant's wire name." This is the rule
    that fixes *which* name the `by` clause resolves; it does not say what
    happens when the resolution finds nothing.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:56` —
    `theta/parse/by-on-object-schema`'s Trigger, reworded by 0033 to the shape
    cut: "A `by` clause on an object body (`schema X by f { ... }`), or on a
    right-hand side of fewer than two arms (`schema X by f = Cat`, against
    `UnionRhs ::= Type ("|" Type)+`). The `by` clause applies only to
    discriminated-union schemas; the cut this code makes is the declaration's
    shape — object body, or arm count — so a right-hand side of two or more
    arms is outside this row's emission set whatever its arms are, and whether
    such a union then needs a discriminator is the discriminator rows' subject
    (`theta/parse/missing-discriminator` and neighbours, over object-schema
    arms)." Class 2 is the input this sentence excludes; the row is honest and
    the excluded input is dispositioned nowhere.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:94–98` — the five
    discriminator rows. `:94` `ambiguous-discriminator` and `:95`
    `missing-discriminator` both carry the Trigger "Discriminated-union
    detection finds …", scoping them to detection; `:96` `duplicate…`, `:97`
    `nested…`, `:98` `non-string…` are stated over "a discriminated union" / "the
    discriminator field", and `:98` names the explicit form.
  - `docs/spec_topics/grammar.md:168–179` — §`schema X by <field>`. `:174`
    admits `"by" Ident "=" UnionRhs`; `:175–176` define `AliasRhs` and
    `UnionRhs ::= Type ("|" Type)+` with `Type` unrestricted, so a
    primitive-armed `UnionRhs` under a `by` is grammatical; `:179` prescribes
    `by-on-object-schema` for the object body alone.
  - `docs/spec_topics/schema-subset.md:88` — Lowering Algorithm step 6:
    "**Discriminator detection** runs on the lowered `anyOf` form … Detection
    is a parse-time sanity check; the lowered schema has no extra discriminator
    marker." With `:82` (a discriminated object union lowers to
    `{"anyOf": [<A-lowered>, <B-lowered>]}`, the `discriminator` keyword "*not*
    emitted") this fixes the whole force of a discriminator as the parse-time
    gate — which is what class 1 bypasses.
  - `tests/schema-alias-union-decl.test.ts:1448–1461` — cell i2, class 1's pin:
    "PINNED AS THE CURRENT DISPOSITION, NOT AS A SPECIFIED ONE … If the
    specification later decides this case, this cell is the one to change."
    Fixture `F_BY_WIRE_NAME` at `:306–308`.
  - `tests/schema-alias-union-decl.test.ts:2123–2139` — cell n22, class 2's
    pin, with the same wording plus the registry-honesty clause: "the
    `by-on-object-schema` registry row must not claim this input, which is why
    its Trigger reads as the shape cut". Fixture `F_BY_PRIMITIVE_UNION` at
    `:396`.
  - `tests/schema-alias-union-decl.test.ts:1428–1446` — cell i1, the positive
    control that fixes the resolution rule: `by kind` over
    `kind as "Kind": 1` raises `non-string-discriminator`, so the theta-side
    resolution works and the shared value constraints do bind once the field
    resolves.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts` (the shipped load path with inert seams) over the
  fixtures below, reading `doc.diagnostics`, `doc.body.statements`, each
  declaration's `by` and `arms`, `doc.frontmatter.params.loweredSchema`, and a
  real `AjvSchemaValidator` compile of one lowered document; written, run,
  deleted.

## Summary

0033's fix made `schema X by <field> = A | B` parse and reach the checkers.
Two input classes then have no rule.

**Class 1 — the named field is absent.** `checkExplicitDiscriminator` resolves
the author's theta-side name per variant and evaluates the resolved
occurrences. When no variant declares the name, every occurrence is
`undefined`; `presentInAll` is false, so `allLiteral`, `allString` and
`firstDuplicateValue` are all vacuous, and the function returns no
diagnostic. The consequence is not merely a missing message: because the
explicit path *replaces* detection rather than falling back to it, the clause
silences every rejection the same variants draw without it. Over one pair of
variants at a time, `by ghost` turns each rejection into a clean load — four
distinct codes across five arrangements:

| variants | `= Cat \| Dog` | `by ghost = Cat \| Dog` |
| --- | --- | --- |
| disjoint fields | `missing-discriminator` | clean |
| shared `kind: "same"` | `duplicate-discriminator-value` | clean |
| two qualifying fields | `ambiguous-discriminator` | clean |
| `kind: 1` / `kind: 2` | `non-string-discriminator` | clean |
| `kind: { type: … }` | `missing-discriminator` | clean |

The last row of that table is the load `schemas.md:105` refuses by name: an
object union reaching a provider with no `const`-typed discriminator anywhere.
A single misspelling of the field name is enough, and the misspelling is the
only thing in the file that is wrong.

The half-present arrangement — `by kind` where one variant declares `kind` and
another does not — is silent by the same mechanism, with one exception:
`anyNested` is computed with `.some` rather than `.every`, so a present
occurrence that is nested raises `theta/parse/nested-discriminator` while a
present occurrence that is a string literal, a non-string literal or a
non-literal type raises nothing.

**Class 2 — the arms are not all object schemas.** `checkByClause` cuts on the
declaration's shape (object body, or fewer than two arms), so a two-arm
primitive union satisfies it; `buildUnionVariantSchemas` declines any arm that
is not a declared object-form schema, so `checkDiscriminatedUnion` never runs.
`schema X by f = string | integer`, `Cat | string`, `"a" | "b"`,
`array<integer> | string`, `Cat | { a: string }`, `Cat | Y` (alias) and
`E | string` (enum) all load clean. Unlike class 1 the clause suppresses
nothing — the same unions without a `by` are equally clean — but it is accepted
where it can have no subject: `schemas.md:97` restricts the concept to unions
"whose variants are all object schemas", `:117` gives the rest their
non-discriminated lowering, and the arms carry no fields for a discriminator to
name.

In both classes the clause is inert past the checkers. The `by` name reaches
`checkByClause` and `checkDiscriminatedUnion` and nothing else
(`src/parser/theta-document.ts:5386` for the object form, `:5428` and `:5435`
for the union form, its only readers), and
schema-subset.md `:88` states the lowered schema carries no discriminator
marker. The lowered documents for `by ghost = Cat | Dog` and `= Cat | Dog` are
byte-identical, as are those for `by f = string | integer` and
`= string | integer`.

## Reproduction

Offline, at `f959f8de`. Scratch vitest over `parseDoc`
(`tests/helpers/e2e-s1.ts`, the real `parseThetaDocument` with inert seams).
Every `.theta` body is preceded by `---\nmode: prompt\n---` and followed by
`let a = 1` and the tail `a`. Diagnostics are rendered
`<severity> <code>: <message>`; `[]` is a clean load with no diagnostic at any
severity. No row leaks a residue statement: every statement list is the
declarations in source order followed by `let:a`, with no `expr` or `reassign`
entry.

### Class 1 — `by` naming a field no variant declares

`Cat` and `Dog` are `{ kind: "cat", name: string }` and
`{ kind: "dog", name: string }` unless the row says otherwise.

```
A1  schema Animal by ghost = Cat | Dog                        -> []      by="ghost" arms=["Cat","Dog"]
A2  Cat/Dog = { kind as "Kind": 1, … };  by Kind              -> []      (cell i2's fixture)
A3  Dog = { name: string };             by kind               -> []
A4  Cat = { name: string };             by kind               -> []
A5  Cat = { kind: 1, … }, Dog = { name: string };  by kind    -> []
A6  Cat = { kind: { type: "x" }, … }, Dog = { name: string }; by kind
    -> ["error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal"]
A7  Cat = { kind: string, … }, Dog = { name: string }; by kind -> []
A8  Cat/Dog/Fish, Fish = { name: string };  by kind = Cat | Dog | Fish -> []
A9  Cat/Dog = { kind: "same", … }, Fish = { name: string }; by kind = Cat | Dog | Fish -> []
A10 Cat = { ghost: { type: "x" }, … }, Dog = { ghost: { type: "y" }, … }; by ghost
    -> ["error theta/parse/nested-discriminator: discriminator field 'ghost' must be at the top level of each variant of Animal"]
A11 CONTROL  schema Animal by kind = Cat | Dog                -> []      (a well-formed discriminator)
A12 CONTROL  Cat/Dog = { kind: "same", … };  by kind = Cat | Dog
    -> ["error theta/parse/duplicate-discriminator-value: duplicate discriminator value 'same' across variants of Animal"]
```

A6 and A10 are the only rows in this class that raise, and A10's field is
present in both variants — it is not a member of the class. A6 is: `kind` is
absent from `Dog`, and the diagnostic fires because `anyNested` is a `.some`.
A9 against A12 shows the duplicate-value gate is unreachable once any
occurrence is absent: the same two `kind: "same"` variants under the same
`by kind` raise `duplicate-discriminator-value` when both arms carry the field
(A12, the fixture of cell b5) and nothing when a third arm lacking it is added
(A9).

### Class 1 — what the clause suppresses

Each row is one pair of variants, loaded twice: with no clause, and with
`by ghost`.

```
S1  Cat = { name: string }, Dog = { age: integer }
    = Cat | Dog          -> ["error theta/parse/missing-discriminator: Animal is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'."]
    by ghost = Cat | Dog -> []
S2  Cat/Dog = { kind: "same", name: string }
    = Cat | Dog          -> ["error theta/parse/duplicate-discriminator-value: duplicate discriminator value 'same' across variants of Animal"]
    by ghost = Cat | Dog -> []
S3  Cat = { kind: "cat", species: "felis", name: string }, Dog = { kind: "dog", species: "canis", name: string }
    = Cat | Dog          -> ["error theta/parse/ambiguous-discriminator: ambiguous discriminator for Animal; candidates: kind, species. Declare explicitly with 'by <field>'."]
    by ghost = Cat | Dog -> []
S4  Cat = { kind: 1, name: string }, Dog = { kind: 2, name: string }
    = Cat | Dog          -> ["error theta/parse/non-string-discriminator: discriminator 'kind' on Animal must be a string-literal type; got integer"]
    by ghost = Cat | Dog -> []
S5  Cat = { kind: { type: "x" }, … }, Dog = { kind: { type: "y" }, … }
    = Cat | Dog          -> ["error theta/parse/missing-discriminator: …"]
    by ghost = Cat | Dog -> []
S6  CONTROL  Cat/Dog with distinct string `kind`
    = Cat | Dog          -> []
    by ghost = Cat | Dog -> []
```

S3's remedy prose — "Declare explicitly with 'by <field>'" — is the action
that produces the silent load when the field name is wrong.

### Class 2 — `by` over a ≥2-arm union whose arms are not all object schemas

```
B1  schema X by f = string | integer                -> []   (cell n22's fixture)
B2  schema X by f = Cat | string                    -> []
B3  schema X by f = string | Cat                    -> []
B4  schema X by f = "a" | "b"                       -> []
B5  schema X by f = Cat | Dog | string              -> []
B6  schema X by f = array<integer> | string         -> []
B7  schema X by f = Cat | { a: string }             -> []
B8  schema X by f = Cat | Y     (schema Y = string) -> []
B9  schema X by f = E | string  (enum E { Low, High }) -> []
B10 schema X by f = string | null                   -> []
B11 schema X by f = string | integer | boolean      -> []
B12 schema X by kind = Cat | string                 -> []   (a name a variant does declare)
B13 schema X by f = Ghost | Dog
    -> ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
B14 CONTROL  schema X by f = Cat                    -> ["error theta/parse/by-on-object-schema: the 'by' clause applies only to discriminated-union schemas (schema X by f = A | B | …)"]
B15 CONTROL  schema X by f { a: string }            -> ["error theta/parse/by-on-object-schema: …"]
```

The arm-shape controls, without the clause, are identical:
`schema X = Cat | Dog | string`, `= Cat | string` and `= string | integer` all
load `[]`. B13's diagnostic is the arm's own name resolution, not the clause's.

`let v: X = 3` under `schema X by f = string | integer` also loads `[]`: the
clause does not reach the type layer.

### Both classes in a `.thetalib`

No frontmatter and no trailing `let` — declarations are permitted top-level
forms there, so the file is the declarations alone.

```
schema Animal by ghost = Cat | Dog          (.thetalib) -> []
schema X by f = string | integer            (.thetalib) -> []
CONTROL  schema Animal = Cat | Dog, disjoint variants   -> ["error theta/parse/missing-discriminator: …"]
```

### The clause changes no lowered byte

Read as `$defs` of a `params:` document whose one field is `a: <name>`.

```
by ghost = Cat | Dog  ->  $defs.Animal = {"anyOf":[{"$ref":"#/$defs/Cat"},{"$ref":"#/$defs/Dog"}]}
       = Cat | Dog    ->  identical
by kind  = Cat | Dog  ->  identical
by f = string | integer ->  $defs.X = {"type":["string","integer"]}
     = string | integer ->  identical
by f = Cat | string   ->  $defs.X = {"anyOf":[{"$ref":"#/$defs/Cat"},{"type":"string"}]}
     = Cat | string   ->  identical
```

### What reaches the provider in the S1 arrangement

`by ghost = Cat | Dog` with `Cat = { name: string }` and
`Dog = { age: integer }` loads clean and lowers the whole `params:` document:

```
{"type":"object","properties":{"a":{"$ref":"#/$defs/Animal"}},"required":["a"],
 "additionalProperties":false,
 "$defs":{"Animal":{"anyOf":[{"$ref":"#/$defs/Cat"},{"$ref":"#/$defs/Dog"}]},
          "Cat":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"],"additionalProperties":false},
          "Dog":{"type":"object","properties":{"age":{"type":"integer"}},"required":["age"],"additionalProperties":false}}}
```

Compiled through the real `AjvSchemaValidator` (V8c seam), with no emitted
diagnostic: `{"a":{"name":"x"}}` and `{"a":{"age":1}}` validate,
`{"a":{"name":"x","age":1}}`, `{"a":{}}` and `{"a":"hi"}` do not. AJV
discriminates structurally; the discriminator's purpose per
`schemas.md:105`/`:103` is grammar-constrained decoding quality at the
provider, which this document has no field to drive.

## Expected behaviour

Undefined by the spec for both classes. What the spec does state, and what it
does not, is the finding:

- `schemas.md:103` and `:115` bind their three rules to "the discriminator
  field", and `:103` says the string-literal rule "applies equally to implicit
  detection and to the explicit `by <field>` form below". All three are
  implemented on both paths (`schema-declarations.ts:604`, `:618`, `:623–627`;
  cells i1, b5 and b6 are the witnesses).
- `:105`'s two rejections resolve *candidate selection* and are stated over
  detection ("If exactly one field qualifies…", "If multiple qualify…", "If
  none qualify…"). Under an explicit `by` there is no candidate set — the
  author names the field — so neither rule has a subject, and no rule replaces
  them. The registry agrees: `code-registry-parse.md:94` and `:95` both read
  "Discriminated-union detection finds …".
- `:97` and `:117` together define which unions are discriminated (all-object)
  and how the rest lower (plain `anyOf` / `{"type": […]}`). Neither says
  whether a `by` clause may be written on the rest.
- `:113` and `grammar.md:179` state the one shape rule for the clause — not on
  an object body — and 0033 extended it to a one-arm right-hand side under the
  same code. Both rules are about the count of variants, not their kind.

The two candidate outcomes, for either class:

- **The declaration is refused.** Then the corpus states the rule and the
  registry carries a Trigger that names the input. `:105`'s rationale —
  "Discriminator-less object unions are rejected because they degrade
  structured-output quality at every major provider" — is the argument for
  refusing class 1: the S1/S5 arrangements reach a provider with no `const`
  tag, which is the outcome that rationale exists to prevent, and the only
  difference from the refused spelling is a clause naming a field that is not
  there.
- **The silence is normatively blessed.** Then the corpus states that an
  explicit `by` over a non-qualifying shape is inert, and says what that means
  where it is observable: for class 1, that a `by` clause suppresses the
  detection rules of `:105` whether or not its field resolves — i.e. that the
  clause doubles as an opt-out from the discriminator requirement; for class 2,
  that a clause with no subject is admitted and ignored. Both statements are
  author-visible, and neither is currently derivable from the text.

What is not open: the present behaviour is not a third option that needs no
text. It differs between two inputs an author would read as equivalent
(`by kind` and `by knid` over the same variants), and it makes `:105`'s
rejection opt-out-able by a typo.

## Actual behaviour / root cause

One dispatch and one gate, each correct in isolation.

1. **The explicit path replaces detection instead of specialising it.**
   `checkDiscriminatedUnion` (`schema-declarations.ts:376–386`) routes on
   `decl.by !== undefined` alone. The explicit path
   (`:580–632`) implements exactly the three rules `:103` and `:115` state over
   a *resolved* field, and has no rule for the resolution itself failing —
   which is the case `:105` covers on the other branch. The absent-field
   evaluation is not an error state inside `evaluateOccurrences`: it produces a
   well-formed `FieldEvaluation` in which `presentInAll` is false
   (`:480`), and every gate downstream is conjoined with `allLiteral`
   (`:482–483`), which is itself conjoined with `presentInAll`. The single
   `.some`-computed property (`anyNested`, `:481`) is why the half-present
   nested arrangement still raises.

2. **The union gate cuts on arm kind, and nothing re-examines the clause.**
   `buildUnionVariantSchemas` (`theta-document.ts:5487–5517`) returns
   `undefined` unless every arm is a bare identifier resolving to a declared
   object-form schema, so `checkDiscriminatedUnion` is not called at all for
   class 2 (`:5431–5439`). `checkByClause` has already admitted the
   declaration by then, on the arm count (`:5418`). Neither function is wrong
   about its own cut: `checkByClause`'s cut is the one its registry row states
   (`code-registry-parse.md:56`), and the gate's cut is the one 0033's §Fix
   specifies ("unions whose arms ALL resolve to declared object schemas"). The
   composition leaves a gap between them that no third check occupies.

Downstream, the clause has no other reader. `s.by` is consumed at
`theta-document.ts:5386` (object form), `:5429` and `:5435` — the two checkers
— and nowhere else; the lowering path takes `decl.arms` only
(`src/parser/body-type-lowering.ts:245`), and schema-subset.md `:88` states the
lowered schema carries no discriminator marker. That is why the probes show
byte-identical lowerings with and without the clause, and why the type layer
answers identically.

The behaviour dates from 0033 (0.45.0), which is when the form first parsed.
Before it, `schema Animal by ghost = Cat | Dog` failed on the re-parsed residue
(`immutable-rebinding` / `stray '|'`), so neither class was reachable as a
clean load.

## Why it matters

- A one-character misspelling of the discriminator field turns off every
  rejection the section prescribes for the variants under it. S1–S5 are five
  arrangements carrying four distinct codes, each clean under `by ghost`, and
  the author's file is otherwise correct, so the only signal is the absence of
  a signal.
- The two arrangements the spec calls out as quality failures — no shared
  discriminator (`:105`) and a non-string tag (`:103`) — are exactly the ones
  reached this way. `:103`'s rationale is that provider decoders "are only
  validated against string `const`"; S4 loads clean with two integer tags
  because the clause names a field neither variant has.
- The remedy prose of two registered messages points authors at the clause
  that produces the silence: `ambiguous-discriminator` and
  `missing-discriminator` both end "declare explicitly with 'by <field>'"
  (`code-registry-parse.md:94`, `:95`), and a mistyped field there is
  unreported.
- Both classes are inside the
  [GOV-15 loads-cleanly set](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
  (`:9`) — zero error-severity diagnostics — so a later decision to reject them
  is a stability question needing the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`), not an ordinary bug fix. The longer the disposition is open, the
  more author code depends on the silence.
- The implementation is already waiting on the text. Two source comments and
  two test cells state the disposition is undecided
  (`schema-declarations.ts:585–596`, `:674–680`;
  `tests/schema-alias-union-decl.test.ts:1448–1461`, `:2123–2139`), and the
  `by-on-object-schema` registry Trigger was reworded specifically so it does
  not claim class 2 (`code-registry-parse.md:56`). Three artefacts encode a
  question the corpus does not ask.
- No gate scores either class. No committed `.theta` or `.thetalib` fixture
  carries a `by` clause at all (`rg "schema [A-Za-z_]+ by "` over
  `*.theta` / `*.thetalib` is empty), so
  `tests/committed-fixture-parse-gate.test.ts` never witnesses them, and the
  two in-tree witnesses assert the silence rather than a rule.

## Non-goals

- **The discriminator rules over a resolved field.** `nested`, `non-string` and
  `duplicate-value` fire correctly on the explicit path once the field resolves
  (cells i1 `:1428`, b5 `:941`, b6 `:957` of
  `tests/schema-alias-union-decl.test.ts`, whose fixtures `F_DUP` `:253–255` and
  `F_NESTED` `:256–258` both carry `by kind`), and implicit detection's
  `ambiguous` / `missing` / `duplicate` / `non-string` selection is correct on
  its own path (fixtures S1–S5, no-clause column). Nothing here proposes
  changing them.
- **The theta-side resolution rule.** `schemas.md:46` fixes that `by` names the
  theta-side identifier and 0033 implemented it (`i1`); the wire spelling
  `by Kind` in fixture A2 is a member of class 1 *because* of that rule, not in
  spite of it. Changing the resolution to also accept a wire name is a
  different question and is not proposed.
- **`by-on-object-schema`'s existing emission set.** The object body and the
  one-arm right-hand side (fixtures B14, B15) keep their code and message
  under any disposition here.
- **The arms' own lowering.** A mixed or primitive union under a `by` lowers
  per SUBS-1 exactly as the same union without one
  (`docs/spec_topics/schema-subset.md:81`), and the generic-arm defect of
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) is unrelated to
  the clause. Fixture B6 (`array<integer> | string`) is clean here and is not
  0043's shape.
- **Field-name casing enforcement.** `theta/parse/binding-case-mismatch`'s row
  (`code-registry-parse.md:19`) names the "field-name position", and
  `docs/spec_topics/lexical.md:13` states "The **first letter's case is
  enforced** by the parser" with `:16` requiring lowercase-first for "schema
  field names", but `schema Cat { Kind: "cat" }` loads clean at HEAD (the same code
  does fire for `let A = 1` and `fn F()`). That gap is pre-existing, unfiled,
  and orthogonal — it only bears on A2 in that a PascalCase theta-side field
  is currently reachable, so `by Kind` is a member of class 1 only where no
  variant declares such a field, which cell i2's fixture ensures.

  **Discharge note (0.82.0).** The "loads clean at HEAD" premise of this bullet
  no longer holds for the two faces
  [0149](./0149-field-name-case-positions-unenforced.md) closed: an
  uppercase-first field name in a `schema X { … }` body and an uppercase-first
  `params:` frontmatter key each now draw
  `theta/parse/binding-case-mismatch` at the field name and the theta does not
  register. `schema Cat { Kind: "cat" }` — this bullet's own example — is
  refused as of 0.82.0. Read the bullet's first three sentences as historical.
  What is unchanged and still load-bearing here: the gap was pre-existing and
  orthogonal to this report's `by`-clause subject, and cell i2's fixture keeps
  the reachability of a PascalCase theta-side field from being load-bearing for
  the class-1 membership claim — that fixture is lowercase and stays clean.
  0149's third face, the inline object type (`{ Ys: string }` in any `Type`
  position), remains unenforced and unclaimed, so a PascalCase theta-side field
  is still reachable there.
- **0033's other recorded residuals.** (i) is filed as
  [0042](./0042-schema-decl-same-line-residue-silent.md), (ii) as
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md), (iii) — the
  `unknown-identifier` / `unresolved-named-type` double emission for
  keyword-shaped names — as
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md), and
  (iv) — `grammar.md:109`'s inline-`{}` `empty-schema-body` rule — as
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md). All four
  are distinct classes and none is touched here.

## Fix

Not yet decided. The settled question is a **spec** decision, and it is one
decision covering both classes: `schemas.md` §Discriminated unions either
prescribes rejections for these inputs or normatively blesses the silence. The
implementation follows the text; no code change is justified ahead of it,
because the current behaviour is the honest reading of the current text.

**Candidate dispositions, assessed.**

1. *Widen `theta/parse/by-on-object-schema`'s Trigger again, to cover class 2.*
   Its registered *Message* — "the 'by' clause applies only to
   discriminated-union schemas (schema X by f = A | B | …)" — is already true of
   class 2: a union with a primitive, literal, generic, inline-object, alias or
   `enum` arm is not a discriminated-union schema (`schemas.md:97`, `:117`).
   Reusing the row is therefore a Trigger change with no *Message* reword,
   which is a DIAG-2 operation
   (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`) covered by the
   GOV-15 carve-out "in-scope as an addition for inputs newly brought into the
   code's emission set"
   (`docs/spec_topics/governance/source-language-stability.md:25`). The cost is
   that the row's cut stops being the declaration's shape and becomes its arm
   kinds, which reverses 0033's rewording; the row's current sentence naming
   the excluded input has to go, and the Trigger must then state which arm
   kinds count (a name resolving to an object schema — with the alias hop of
   fixture B8 decided one way or the other). This candidate does not reach
   class 1: `by ghost = Cat | Dog` *is* a union of object schemas, so the
   Message is false of it.
2. *A new registered code for class 1.* A DIAG-2 addition
   (`diagnostic-shape.md:72`), same carve-out. Its *Message* can be built from
   placeholders that already exist — `<field>` is category 5
   (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:5`) and `<X>` is
   category 7 (`:51`) — so no new placeholder is introduced and the closed
   placeholder-rendering surface (`placeholder-rendering-a.md:7`) is not
   touched. This is the difference from 0042's candidate assessment, where the
   only fitting code carried a `<construct>` freeform tail from a closed table.
   The site is the declaration's range, which the implementation already passes
   (`site` in `checkExplicitDiscriminator`, one range per declaration —
   DIAG-1, `diagnostic-shape.md:71`).
3. *Reuse `theta/parse/missing-discriminator` for class 1.* Rejected on the
   registered *Message*: "`<X>` is a union of object schemas with no shared
   single-literal discriminator field. Add a 'kind' (or similar) field to each
   variant, or declare explicitly with 'by `<field>`'."
   (`code-registry-parse.md:95`). The remedy instructs the author to do what
   they have already done, and the first clause misdescribes S2–S4, where a
   shared single-literal field exists and is not the one named. Rewording it is
   a DIAG-4 operation deferred to theta 2.0
   (`source-language-stability.md:25`: a *Message* reword "alters the identity
   or rendered content observed by every in-scope input that already emits the
   code"), and every input that emits it today would observe the new text.
4. *Bless the silence.* No registry edit and no code change; the corpus gains
   the two statements §Expected behaviour names. The obligation is that the
   text must say what class 1's silence means for `:105` — that a `by` clause
   removes the discriminator requirement from a union whether or not its field
   resolves — since that is the observable consequence, and an author reading
   `:105` today cannot derive it.

**Constraints on any resolution.**

1. **The two classes may be dispositioned differently, but both must be
   dispositioned.** They are reached by different mechanisms (a failed
   resolution inside the explicit check; a gate that never calls it) and only
   class 1 suppresses live rejections. A resolution that refuses class 2 and
   leaves class 1 silent, or the reverse, is admissible — with the residue
   recorded, not left as the present silence.
2. **The half-present arrangement moves with class 1.** A6 shows `by kind`
   with one variant lacking `kind` already raising when the present occurrence
   is nested, and A3/A4/A5/A7/A8/A9 show it silent otherwise. Any rule about an
   absent field must state whether "absent" means absent from every variant or
   from any variant, and the `.some`/`.every` asymmetry at
   `schema-declarations.ts:480–481` is where the answer lands.
3. **Cross-position message identity does not apply.** The `by` clause occurs
   at exactly one position — `SchemaShape`'s third alternative
   (`grammar.md:174`) — so unlike the alias-vs-field questions of 0042 and 0043
   there is no sibling position that must emit the same code for the same
   defect. No parity argument constrains the choice.
4. **A rejection moves inputs out of the GOV-15 loads-cleanly set.** Every
   fixture above except A6, A10, A12, B13, B14, B15 and the no-clause column of
   S1–S5 loads with zero
   error-severity diagnostics (`source-language-stability.md:9`), so refusing
   any of them relies on the diagnostic-registry carve-out (`:25`), whose input
   set is defined post-hoc over the diff. The resolution names the inputs it
   moves — including B4/B6/B7/B8/B9's arm kinds, which are the same clause over
   other arm shapes.
5. **The witness pins are updated deliberately, never silently.** Cells i2
   (`tests/schema-alias-union-decl.test.ts:1448`) and n22 (`:2123`) each assert
   a clean load and each say in-cell that they are the cell to change when the
   specification decides. A resolution that rejects either class rewrites the
   corresponding cell and its message; one that blesses the silence leaves the
   assertion and replaces "UNDECIDED" with the citation that decides it.
   Neither outcome may be reached by deleting a cell. The positive controls i1
   (`:1428`), b5 (`:941`), b6 (`:957`) and the arm-shape controls stay green
   either way.
6. **Two source comments state the same undecidedness and move with the text.**
   `schema-declarations.ts:585–596` ("No code is invented for it here") and
   `:674–680` ("The cut is the arm count, NOT whether the arms form a
   discriminated union") describe the current disposition, as does the
   `by-on-object-schema` Trigger's exclusion sentence
   (`code-registry-parse.md:56`). Whichever way the decision goes, all three
   are edited in the same change; leaving them is a false record.

The fixtures above are the acceptance set for either disposition: A6, A10, A12,
B13, B14 and B15 keep their current diagnostics, the no-clause column of
S1–S6 stays byte-identical, and the remaining rows converge on one disposition
that a rule names.

## Provenance

- Origin: bug [0033](./0033-body-level-schema-alias-unsupported.md) — fixer
  round 1's undecided pin for i2, review round 3 finding F3 (what the
  by-clause check actually cuts on, which produced cell n22 and the
  `by-on-object-schema` Trigger rewording), and round 5's residual list.
  Landed as 0033 §Fix (0.45.0) *Residuals* (v): "The `by` field naming no
  variant's field, and `by` over a non-object ≥2-arm union, load silently —
  spec-undecided, pinned as observed." The uncommitted local run artefact
  `.pi/tmp/fixes/0033-report.md` records the same item in its residual list
  and the review shape ("5 rounds + 4 fixer rounds", "R3: 1 major (cycle
  crash) + 4 minor", "R5: 3 exact-wording items … + 4 residuals"). The
  per-round review files are not in the tree; the round attributions are as
  recorded in that artefact and in the witness file's group headers
  (`tests/schema-alias-union-decl.test.ts:1420–1425` "(i) REVIEW ROUND 1, F3",
  `:2115–2120` "(q) REVIEW ROUND 3, F3 — what the by-clause check actually cuts
  on"). This report files the residual, re-derives both classes at HEAD, and
  adds the suppression evidence (S1–S5) that 0033's records do not carry.
- Spec: `docs/spec_topics/schemas.md:46` (§Wire-name renaming — the theta-side
  resolution rule for `by`), `:95–117` (§Discriminated unions in full: `:97`
  the all-object definition, `:99–101` the three detection properties, `:103`
  `non-string-discriminator` and its shared-with-explicit clause, `:105`
  `ambiguous-` / `missing-discriminator` and the provider-quality rationale,
  `:107–111` the explicit form, `:113` the `by`-on-object-body rule, `:115`
  `duplicate-` and `nested-discriminator`, `:117` mixed unions);
  `docs/spec_topics/grammar.md:168–179` (§`schema X by <field>` — `:174` the
  explicit-discriminator alternative, `:175–176` `AliasRhs` / `UnionRhs`,
  `:179` the object-body rule);
  `docs/spec_topics/schema-subset.md:12` (discriminated unions in the supported
  subset), `:81` (SUBS-1), `:82` (the discriminated-object-union emission, no
  `discriminator` keyword), `:83` (mixed `anyOf`), `:88` (Lowering Algorithm
  step 6 — detection is a parse-time sanity check, no lowered marker);
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`
  (`binding-case-mismatch`, §Non-goals), `:56` (`by-on-object-schema`'s
  shape-cut Trigger), `:89` (`unresolved-named-type`, fixture B13), `:94–98`
  (the five discriminator rows);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72` (DIAG-2
  and its GOV-15 carve-out disposition);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (§Closure — the
  closed placeholder surface, GOV-7 / GOV-8);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:5` (category 5,
  `<field>`), `:51` (category 7, `<X>`);
  `docs/spec_topics/governance/source-language-stability.md:9` (the
  loads-cleanly predicate), `:25` (the diagnostic-registry carve-out);
  `docs/spec_topics/lexical.md:13` (case enforcement), `:15–16` (the two casing
  rules, §Non-goals).
  User-facing reference: `docs/reference/schema-subset.md:54`, `:82`;
  `docs/reference/grammar.md:273–284`; `docs/reference/diagnostics.md:102`,
  `:143–144`.
- Implementation evidence at `f959f8de`:
  `src/parser/schema-declarations.ts:346–351` (`DiscriminatorCandidateField`),
  `:354–357` (`UnionVariantSchema`), `:364–368` (`DiscriminatedUnionDecl`, `by`
  at `:366`), `:376–386` (`checkDiscriminatedUnion`'s dispatch), `:409–415`
  (`thetaNamedFieldInVariant`), `:445–455` (`FieldEvaluation`), `:476–516`
  (`evaluateOccurrences`, `presentInAll` `:480`, `anyNested` `:481`,
  `allLiteral` `:482–483`, `allString` / `firstNonStringKind` `:488–489`),
  `:519–577` (`detectImplicitDiscriminator`, the candidate filter `:523–525`,
  `missing-discriminator` `:568–576`), `:580–632`
  (`checkExplicitDiscriminator` — the undecided-disposition comment `:585–596`,
  the resolution `:597–600`, the three gates `:604`, `:618`, `:623–627`, the
  clean return `:631`), `:635–648` (`nonStringDiagnostic`), `:651–663`
  (`duplicateValueDiagnostic`), `:665–686` (`ByClauseDecl` and its arm-count
  comment `:674–680`), `:694–713` (`checkByClause`);
  `src/parser/theta-document.ts:544–586` (`SchemaDecl`, `arms` at `:576`, `by`
  at `:585`), `:2252–2269` (`finishObjectSchema` retaining the clause),
  `:2294–2312` (`finishAliasSchema`), `:5336–5459`
  (`checkSchemaDeclarationGraph` — the object-form `checkByClause` call `:5386`,
  the arm-count classification `:5418`, the union-form call `:5428–5430`, the
  gated `checkDiscriminatedUnion` `:5431–5439`), `:5487–5517`
  (`buildUnionVariantSchemas` — the three declining exits `:5502`, `:5507–5509`,
  `:5511–5513`), `:5526–5534` (`discriminatorCandidateFields`), `:5559–5588`
  (`classifyDiscriminatorFieldType`);
  `src/parser/body-type-lowering.ts:245` (the alias-RHS lowering, which reads
  `arms` only); `src/seams/schema-validator.ts:104–168` (`AjvSchemaValidator`,
  `compile` at `:116` — the compile used in §Reproduction).
- Test evidence at `f959f8de`: `tests/schema-alias-union-decl.test.ts:301–308`
  (group (i)'s fixtures `F_BY_THETA_NAME` / `F_BY_WIRE_NAME`), `:394–396`
  (group (q)'s `F_BY_PRIMITIVE_UNION`), `:1420–1425` (group (i)'s header),
  `:1428–1446` (cell i1, the positive control), `:1448–1461` (cell i2 — class
  1's pin), `:1463–1477` (cell i3, the renamed-discriminator control),
  `:2115–2120` (group (q)'s header), `:2123–2139` (cell n22 — class 2's pin);
  `tests/disc-unions-recursion.test.ts:200–216` (the seam-level `checkByClause`
  cell, the object form at `:203` and the union form at `:213`);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which carries a `by` clause).
- Reproduction: scratch vitest at `f959f8de` — the class-1 arrangements A1–A12,
  the suppression pairs S1–S6, the class-2 arrangements B1–B15 plus the
  no-clause arm-shape controls, the `.thetalib` spelling of both classes with
  its control, seven `params:` lowerings read as `$defs` bytes, one real
  `Ajv2020` compile through `AjvSchemaValidator`, and a field-name-casing probe
  (`let A = 1`, `fn F()`, `fn f(P: string)`, `schema Cat { Kind: … }`,
  `schema cat { … }`). Run on the outputs quoted above, then deleted per
  scratch policy.

### Note — bug 0096 (0.73.0)

Note only; nothing here is discharged and nothing here is settled by
[0096](./0096-discriminator-field-classifier-naive-brace-test.md). Two touch
points, both left open.

**The adjacent silence stays unsettled.** 0096 corrected the SHAPE a resolved
`by` field reports: a field typed `{a: X} | {b: Y}` is a union of arms, not one
nested object. Once
[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) widens the
schema-field capture, such a field under an explicit `by` will load clean — the
disposition `kind: "a" | "b"` already receives. Whether that silence is the right
end state for a `by` field that resolves but is not a literal in every variant is
a spec question about `schemas.md:99–121`; 0096 §Non-goals declines to settle it
and records it as a residual. It is adjacent to, but not inside, this report's
two classes (an explicit `by` naming a field no variant declares, and a `by` over
a ≥2-arm union whose arms are not all object schemas).

**§Fix constraint 2 is untouched.** The `.some`/`.every` asymmetry in
`evaluateOccurrences` (`src/parser/schema-declarations.ts`) — `anyNested` a
`.some` while `allLiteral` is conjoined with `presentInAll` — is unchanged by
0096, which altered what `nested` is set to, not how absent occurrences are
folded.

### Note — bug 0095 (0.74.0)

Recorded against the *Note — bug 0096 (0.73.0)* above: **the adjacent silence it
described is now reachable, and this report's two classes are still untouched.**

[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) widened
`ThetaDocument.parseType`'s schema-field capture, so a `by` field typed
`{a: X} | {b: Y}` survives capture and the declaration loads. The disposition 0096
predicted is what it receives: **no diagnostic at all** under an explicit
`by kind`, the same silence `kind: "a" | "b"` already received, asserted as cell 6a
of `tests/brace-rooted-union-arm-capture.test.ts` with the literal-union spelling
beside it as the parity control. What was a prospective spec question about
`schemas.md:99–121` is now a live one; the operator is filing it separately.

**§Fix constraint 2 remains untouched.** The `.some` / `.every` asymmetry in
`evaluateOccurrences` (`src/parser/schema-declarations.ts`) is unchanged by 0095,
which altered what text reaches the classifier, not how absent occurrences are
folded. Neither of this report's two classes moved: an explicit `by` naming a field
no variant declares, and a `by` over a two-or-more-arm union whose arms are not all
object schemas. 0095 §Non-goals places everything below the parse seam out of
scope, and `git diff --stat -- docs/` was empty for the whole change, so no spec
sentence about `by` was written or relied on.
