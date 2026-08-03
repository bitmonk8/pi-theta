# Bug 0098 — No step-3 emission rule covers a union of non-string literals: since 0055 (0.59.0) `lowerTypeSource` emits `{"enum":[1,2]}`, `{"enum":[true,false]}` and `{"enum":["x",null]}` from a deliberate branch that two test files pin and no normative sentence states, so the bytes, the `__theta_respond_<slug>` name and the `__inline_<slug>` name a second implementation mints for `schema X = 1 | 2` are underdetermined

- **Status:** open. §Fix is constraint-pinned, not settled. The decision this
  report asks for is which emission `docs/spec_topics/schema-subset.md` step 3
  prescribes for a literal union that is not all strings — the disposition the
  implementation already takes, or a typed emission per literal kind — not the
  wording of one of them.
- **Kind:** spec gap. Step 3 of the Lowering Algorithm gives an emission for a
  single literal of any kind (`docs/spec_topics/schema-subset.md:79`,
  `{ "const": <value> }`), for an enum or a string-literal union (`:80`,
  `{ "type": "string", "enum": [...wire values...] }`), and for a union of
  primitives of any kind (`:81`, SUBS-1, `{ "type": [...] }`). A union of two or
  more literals not all of which are strings falls in none of the three, and no
  other line in the corpus reaches it. The grammar admits the input
  (`docs/spec_topics/grammar.md:94`, `:102`), the parser accepts it with zero
  diagnostics at every position, and the lowering emits a bare
  `{ "enum": [...] }`. The subset admits `enum` as a validation keyword
  (`:7`), so that fragment is inside the subset — what is absent is a sentence
  stating it.
- **Related:**
  - [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) — fixed
    (0.59.0), the origin. Its fix added the all-strings guard that makes the
    non-string case a distinct branch rather than a shared one, and recorded
    the gap twice without filing it: §Fix *Residuals* item (iii) (`:273–277`)
    and §Non-goals (`:778–782`), both ending "Whether the emission table should
    gain one is a spec question". This report files it. No ordering constraint:
    0055 is landed, and this report asks for spec text over the behaviour that
    fix left in place.
  - [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) —
    open, the `params:` position, which reaches no literal sublanguage at all
    (`p: 1 | 2` lowers `{"anyOf":[{},{}]}`, §Reproduction). Its §Status already
    states it inherits whichever literal-union emission 0055 settles; 0055
    settled the all-strings half only, so the other half is this report's. A
    resolution that prescribes typed emissions per literal kind widens what
    0056 must carry to the `params:` position.
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — fixed
    (0.53.0), a different case in the same function. `1 | string` lowers
    `{"anyOf":[{},{"type":"string"}]}` because `parseLiteralArm` fails on
    `string` and the union goes whole to `lowerTypeExpr`; the check this report
    concerns never fires. Its §Non-goals owns that case.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    fixed (0.54.0). Its regression file carries the second in-tree pin of the
    unspecified bytes (`tests/reserved-keyword-type-position.test.ts:777`,
    `true | false` → `{ enum: [true, false] }`), written for a diagnostic
    subject and unaware of this one.
- **Affected** (every citation verified at HEAD `0b1e20ab`, 0.59.0):
  - **The silence.** `docs/spec_topics/schema-subset.md:74` opens step 3
    (*Emits per type form*) and `:75`–`:85` enumerate the forms. Three lines
    reach a literal: `:79` (a single literal `"foo"` / `42` / `true` / `null` →
    `{ "const": <value> }`), `:80` (an enum or a **string**-literal union →
    `{ "type": "string", "enum": [...] }`), `:81` (SUBS-1, a union all of whose
    arms are **primitive types** → `{ "type": [...] }`). `1 | 2` is neither a
    single literal, nor an enum, nor a string-literal union, nor a union of
    primitive types (`docs/spec_topics/grammar.md:97` lists `PrimitiveType` as
    the five type keywords; `:102` puts `STRING`, `NUMBER`, `BOOLEAN` and
    `NULL` under `LiteralType`). `:85` (*Array element order*) fixes the `enum`
    array's
    order for whatever emits one, and states no emission. The user-facing
    mirror `docs/reference/schema-subset.md:159–170` restates the same three
    lines and inherits the same silence.
  - **The `enum` half of `:80` cannot reach the case.** A named `enum`
    declaration carries string values only —
    `theta/parse/non-string-enum-value` (`docs/spec_topics/schemas.md:93`) — so
    the source form `:80` names first never produces a non-string `enum`
    array. The anonymous literal union is the only source form that can, and it
    is the half `:80` restricts to strings.
  - **The branch that answers the unanswered question.**
    `src/parser/body-type-lowering.ts:378–392` is the literal sublanguage.
    `:378` splits on top-level `|`; `:380–381` require every arm to parse as a
    literal; `:382` derives the values; `:383–385` is a ternary — every value a
    JavaScript string emits `{ type: "string", enum: values }`, anything else
    emits `{ enum: values }`. The `else` arm (`:387–391`) returns
    `{ const: … }` for a single literal, which `:79` spells.
  - **The literal kinds that reach the false side of that ternary.**
    `parseLiteralArm` (`:741–762`) accepts a single- or double-quoted string
    (`:743–748`), `true` (`:749–751`), `false` (`:752–754`), `null`
    (`:755–757`) and `/^-?\d+(\.\d+)?$/` (`:758–760`). Four of the five kinds
    produce a non-string value, so every union mixing them, and every union
    made only of them, takes the unspecified branch.
  - **The disposition is stated in-tree only as a code comment and two test
    rows.** `src/parser/body-type-lowering.ts:303–309` (`lowerTypeSource`'s doc
    comment) says a union of literals of any other kind "lowers to the bare
    `enum` form, because `:80` spells the added `type` keyword for the enum /
    string-literal-union case only" — an argument from `:80`'s silence, not a
    citation of a rule. `tests/literal-union-string-enum-emission.test.ts:620–651`
    (bug 0055 group (d)) pins the four rows `1 | 2`, `"x" | null`,
    `true | false`, `"x" | 1` (`:622–625`) under a failure message (`:631–636`)
    that argues the same way, and its file header repeats it (`:112–115`).
    `tests/reserved-keyword-type-position.test.ts:777` (bug 0044's `d2`) pins
    `true | false` → `{ enum: [true, false] }` as one row of a boolean-keyword
    table. No third artefact in `tests/` or `docs/` states the emission.
  - **The positions that carry the unspecified bytes**, all through
    `lowerTypeSource` and all measured in §Reproduction:
    - `src/runtime/query-schema-lowering.ts:160` — the `@<T>` / `invoke<T>`
      annotation root, non-brace form; `:153` — its brace form, which routes to
      `lowerInlineObject` (`src/parser/body-type-lowering.ts:153`) and from
      there to `lowerObjectFields`'s per-field call (`:120`).
    - `src/parser/body-type-lowering.ts:577` — `buildBodyTypeSchemas` pass 2's
      `schema`-body call, reaching `lowerTypeSource` through `:120`.
    - `src/parser/body-type-lowering.ts:598` — pass 2's alias/union
      right-hand-side call.
    - `src/parser/body-type-lowering.ts:399–407` — the `lowerField` inner
      helper, which re-enters `lowerTypeSource` for each field of a hoisted
      inline object, so the branch fires at every nesting depth of every
      position above.
    - `src/parser/body-type-lowering.ts:729` —
      `collectUnresolvedNamedTypes`'s call. Diagnostics only; the fragment is
      discarded.
  - **What the bytes name.** `src/runtime/typed-query-validation.ts:347–349` —
    `respondSchemaSlug` hashes `JSON.stringify(lowered)` and its 16-hex output
    names the registered `__theta_respond_<slug>` tool.
    `src/parser/params.ts:692–694` — `canonicalForm(lowered)` then
    `schemaSlug(lowered)` mint `__inline_<slug>` over the hoisted fragment, so
    a non-string literal-union field inside an inline object is part of the
    hashed input. `src/extension/production-theta-producer.ts:2620` — the
    PIC-44 registration cache stores `JSON.stringify(lowered)` as the
    byte-equality check. `:4975` — `renderTypedAwareQueryText` interpolates
    `JSON.stringify(lowered)` into the QRY-15 instruction
    (`docs/spec_topics/query/query-tool-loop.md:37`), so the fragment is shown
    to the model.
  - **What the bytes do not name.** `rootIsArgumentObjectSatisfiable`
    (`src/runtime/respond-tool-wire.ts:55–70`) answers `false` for a bare
    `enum` root through `:64` and for a `{"type":…}` root through `:57–62`, so
    `respondSchemaIsEnveloped` (`:73–75`) is `true` under every candidate
    emission (§Reproduction, *Slugs and envelope*). The sidecar's named-enum
    positions map is keyed to the source type kind, not the lowered bytes, and
    excludes anonymous literal-union positions outright
    (`docs/spec_topics/schema-subset.md:87`).
  - **Positions the branch does not reach**, measured:
    `params: p: 1 | 2` lowers `{"anyOf":[{},{}]}` (`lowerParamsFieldType`
    routes to `lowerTypeExpr`, `src/parser/params.ts:767`, whose trailing
    catch-all returns `{}`, `:584–586`) — bug 0056; `array<1 | 2>` lowers
    `{"type":"array","items":{"anyOf":[{},{}]}}`; `1 | string` lowers
    `{"anyOf":[{},{"type":"string"}]}` — bug 0043.
  - **No committed fixture carries the input.** No `.theta` or `.thetalib`
    under `docs/` or `tests/fixtures/` declares a non-string literal union. The
    three committed literal unions are all string-literal
    (`docs/examples/handle-error.theta:8`, `sentiment.theta:8`,
    `review-lens.theta:12`).
- **Observed at:** 0.59.0 (`0b1e20ab`). Offline and deterministic — no live
  model, no provider. Every value below was produced by a scratch vitest probe
  through the shipped front end (`parseThetaDocument` via
  `tests/helpers/e2e-s1.ts`), the shipped `lowerTypeSource` /
  `lowerInlineObject` / `buildBodyTypeSchemas` / `lowerQueryResponseSchema`,
  the shipped `respondSchemaSlug` / `respondToolWireSchema` /
  `respondSchemaIsEnveloped`, an independent `node:crypto` canonical-form
  oracle, and the production `AjvSchemaValidator`; written, run, and deleted.

## Summary

`docs/spec_topics/schema-subset.md` step 3 spells three emissions that touch
literals: a single literal of any kind (`:79`), an enum or a string-literal
union (`:80`), and a union of primitive types (`:81`). A union of two or more
literals not all of which are strings — `1 | 2`, `true | false`, `"x" | null`,
`"x" | 1` — matches none of them.

The implementation answers anyway. Bug 0055's fix (0.59.0) added an
all-strings guard to `lowerTypeSource`'s literal-union arm so a string-literal
union emits the `:80` bytes; the guard's false side emits a bare
`{ "enum": [...] }`. That branch is deliberate — the typed form
`{"type":"string","enum":[1,2]}` would refuse every value `1 | 2` declares —
and it is pinned by five test rows across two files, both regression files of
closed reports. Its stated authority in every one of those places is that `:80`
does not cover the case.

The fragment is inside the subset (`:7` admits `enum`) and both candidate
emissions admit and refuse exactly the same JSON values (measured over eleven
payloads through the production validator). What is underdetermined is bytes,
and bytes name things: the `__theta_respond_<slug>` tool registered for
`@<1 | 2>`, the `__inline_<slug>` entry hoisted for `{b: 1 | 2}`, the PIC-44
cache key, and the schema text interpolated into the QRY-15 instruction shown
to the model. A second implementation reading the corpus cannot derive any of
them.

## Reproduction

Offline, at `0b1e20ab`. Scratch vitest calling `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`lowerTypeSource`, `lowerInlineObject`, `buildBodyTypeSchemas`,
`lowerQueryResponseSchema`, `respondSchemaSlug`, `respondToolWireSchema`,
`respondSchemaIsEnveloped`, the production `AjvSchemaValidator`, and a
`node:crypto` canonical-hash oracle. Every fixture below loads with zero
diagnostics.

### Which step-3 line covers each literal form

`lowerTypeSource` called directly:

```
"x" | "y"        -> {"type":"string","enum":["x","y"]}       :80
"a" | "b" | "c"  -> {"type":"string","enum":["a","b","c"]}   :80
"x"              -> {"const":"x"}                            :79
1                -> {"const":1}                              :79
true             -> {"const":true}                           :79
null             -> {"const":null}                           :79
string | null    -> {"type":["string","null"]}               :81 (SUBS-1)
integer | null   -> {"type":["integer","null"]}              :81 (SUBS-1)
1 | 2            -> {"enum":[1,2]}                           no line
1 | 1.5          -> {"enum":[1,1.5]}                         no line
true | false     -> {"enum":[true,false]}                    no line
"x" | null       -> {"enum":["x",null]}                      no line
1 | null         -> {"enum":[1,null]}                        no line
true | null      -> {"enum":[true,null]}                     no line
"x" | 1          -> {"enum":["x",1]}                         no line
```

The first eight rows are spelled; the last seven are not. `1 | 1.5` and
`"x" | 1` are the mixed-kind cases: the emission for them is unspecified under
the current text and remains unspecified under any resolution that assigns one
`type` keyword per literal kind without naming the mixture.

### The unspecified bytes at every position the branch reaches

`1 | 2` written at each position `lowerTypeSource` serves. The `ann` rows are
`lowerQueryResponseSchema(<annotation text>, schemas, enums)`, the call the
`@<T>` / `invoke<T>` root makes; the `field` and `alias` rows are
`buildBodyTypeSchemas` over the parsed declaration:

```
@@ lowerTypeSource("1 | 2")  direct
   fragment :: {"enum":[1,2]}
@@ ann      let r = @<1 | 2>`go`
   lowered  :: {"enum":[1,2]}
@@ ann      let r = @<{a: 1 | 2}>`go`
   lowered  :: {"type":"object","properties":{"a":{"enum":[1,2]}},"required":["a"],"additionalProperties":false}
@@ ann      let r = @<{a: {b: 1 | 2}}>`go`
   lowered  :: {"type":"object","properties":{"a":{"$ref":"#/$defs/__inline_17e23f7b81fba003"}},"required":["a"],
                "additionalProperties":false,
                "$defs":{"__inline_17e23f7b81fba003":
                  {"type":"object","properties":{"b":{"enum":[1,2]}},"required":["b"],"additionalProperties":false}}}
@@ field    schema S { p: 1 | 2 }
   $defs.S  :: {"type":"object","properties":{"p":{"enum":[1,2]}},"required":["p"],"additionalProperties":false}
@@ alias    schema X = 1 | 2
   $defs.X  :: {"enum":[1,2]}
@@ lowerInlineObject("b: 1 | 2")
   fragment :: {"type":"object","properties":{"b":{"enum":[1,2]}},"required":["b"],"additionalProperties":false}
```

The other two literal kinds behave identically at the same positions:

```
@@ field    schema S { p: true | false }
   $defs.S  :: {"type":"object","properties":{"p":{"enum":[true,false]}},"required":["p"],"additionalProperties":false}
@@ field    schema S { p: "x" | null }
   $defs.S  :: {"type":"object","properties":{"p":{"enum":["x",null]}},"required":["p"],"additionalProperties":false}
```

### Slugs and envelope

Emitted bytes on the left; the alternative a typed emission would produce
below each:

```
{"enum":[1,2]}                                respondSchemaSlug 130e6817ca62c3dc   enveloped true
{"type":"integer","enum":[1,2]}               respondSchemaSlug 4bed5da6973ead51   enveloped true
{"enum":[true,false]}                         respondSchemaSlug 267d6bfcdb5cb580   enveloped true
{"type":"boolean","enum":[true,false]}        respondSchemaSlug 4f2d3141a73c4f0c   enveloped true
{"enum":["x",null]}                           respondSchemaSlug d53f79dd8d454a89   enveloped true
{"type":["string","null"],"enum":["x",null]}  respondSchemaSlug bcca8e4bc9a185fa   enveloped true
{"enum":["x",1]}                              respondSchemaSlug 0765f56c04ac48e7   enveloped true
```

`respondSchemaIsEnveloped` is `true` for every row, so the wire *shape* does
not move under any candidate emission; the registered tool name and the
enveloped payload schema do. `__inline_<slug>` moves the same way — the
canonical form for `{b: 1 | 2}` is

```
{"additionalProperties":false,"properties":{"b":{"enum":[1,2]}},"required":["b"],"type":"object"}
  -> __inline_17e23f7b81fba003   (emitted today, confirmed against the annotation above)
{"additionalProperties":false,"properties":{"b":{"enum":[1,2],"type":"integer"}},"required":["b"],"type":"object"}
  -> __inline_d985fc1927a48150   (a typed emission)
```

both derived from a `node:crypto` oracle following
`docs/spec_topics/schema-subset.md:99–107`, and the first checked against the
lowering's own output.

### Real AJV over both candidate emissions

Through the production `AjvSchemaValidator` (`strict: false`,
`allErrors: true`, `ajv-formats` installed). Payloads across the row;
`A` = accept, `R` = reject:

```
                                              1  2  3  1.5 "1" "x" true false null [] {}
{"enum":[1,2]}                                A  A  R  R   R   R   R    R     R    R  R
{"type":"integer","enum":[1,2]}               A  A  R  R   R   R   R    R     R    R  R
{"enum":[true,false]}                         R  R  R  R   R   R   A    A     R    R  R
{"type":"boolean","enum":[true,false]}        R  R  R  R   R   R   A    A     R    R  R
{"enum":["x",null]}                           R  R  R  R   R   A   R    R     A    R  R
{"type":["string","null"],"enum":["x",null]}  R  R  R  R   R   A   R    R     A    R  R
{"enum":["x",1]}                              A  R  R  R   R   A   R    R     R    R  R
```

The admitted value set is identical for each bare/typed pair on all eleven
payloads. The reported issue list is not:

```
{"enum":[1,2]}                   vs "x"  :: [enum "must be equal to one of the allowed values"]
{"type":"integer","enum":[1,2]}  vs "x"  :: [type "must be integer", enum "must be equal to one of the allowed values"]
{"enum":[1,2]}                   vs 3    :: [enum "must be equal to one of the allowed values"]
{"type":"integer","enum":[1,2]}  vs 3    :: [enum "must be equal to one of the allowed values"]
{"type":"integer","enum":[1,2]}  vs 1.5  :: [type "must be integer", enum "must be equal to one of the allowed values"]
```

A payload of the wrong JSON type gains a leading `type` issue under the typed
emission; a payload of the right type outside the set does not.
`src/seams/schema-validator.ts:155–163` maps every AJV error to a
`ValidationError`, so both entries reach the QRY-11 respond-repair follow-up
and the `invoke<T>` return-validation error.

### Positions the branch does not reach

```
params:  p: 1 | 2   -> {"type":"object","properties":{"p":{"anyOf":[{},{}]}},"required":["p"],"additionalProperties":false}
array<1 | 2>        -> {"type":"array","items":{"anyOf":[{},{}]}}
1 | string          -> {"anyOf":[{},{"type":"string"}]}
```

Owned by [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
and [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) respectively.

## Expected behaviour

Step 3 covers every type form the grammar admits in a lowered-schema position,
so a union of literals not all of which are strings has an emission a reader
can look up. Under the disposition the implementation takes, the text would
read something like:

```
   - Literal union whose arms are not all strings: `{ "enum": [...values...] }`,
     with no `type` keyword.
```

and `1 | 2`, `true | false`, `"x" | null` and `"x" | 1` would lower to the
bytes §Reproduction records because a line says so, rather than because no line
says otherwise.

Three properties any resolution has to leave standing, each measured:

- **The `enum` array's order is already fixed.** `:85` (*Array element order*)
  states `enum` lists values in source enumeration order, and the branch
  satisfies it (`"x" | 1` → `["x",1]`, not `[1,"x"]`).
- **The fragment is already inside the subset.** `:7` admits `enum` as a
  validation keyword with no type-keyword precondition, so the bare form is not
  an out-of-subset emission; it is an unspecified one.
- **The envelope decision does not depend on the answer.**
  `respondSchemaIsEnveloped` is `true` for both a bare-`enum` root and a
  `{"type":…}` root (§Reproduction, *Slugs and envelope*), so no annotation
  crosses between the pass-through and enveloped wire forms under either
  resolution.

## Actual behaviour / root cause

`lowerTypeSource` splits its source on top-level `|`
(`src/parser/body-type-lowering.ts:378`), requires every arm to parse as a
literal (`:380–381`), derives the arm values (`:382`), and returns the result
of a ternary (`:383–385`):

```ts
return values.every((v) => typeof v === "string")
  ? { type: "string", enum: values }
  : { enum: values };
```

The true side is `:80`'s emission. The false side has no line behind it. It is
reached for every union whose arms parse as literals and include at least one
non-string — four of the five atoms `parseLiteralArm` (`:741–762`) recognises:
numbers, `true`, `false`, `null`.

The false side is not an oversight. It carries the emission the arm produced
before 0055, and that fix kept it deliberately in the same statement as the
true side; its §Fix states the reason: `parseLiteralArm`
accepts numbers, booleans and `null`, and `{"type":"string","enum":[1,2]}`
would refuse every value `1 | 2` declares. The alternative
`{"type":"integer","enum":[1,2]}` is admissible under the subset (`:5` lists
`integer`) and produces the identical verdict table (§Reproduction), so the
choice between them is not forced by behaviour — only by bytes.

What the branch has instead of a rule is three in-tree statements that all
reason from `:80`'s silence:

- `src/parser/body-type-lowering.ts:303–309` — the doc comment: the bare form
  applies "because `:80` spells the added `type` keyword for the enum /
  string-literal-union case only".
- `tests/literal-union-string-enum-emission.test.ts:631–636` — group (d)'s
  failure message: "`schema-subset.md:80` covers an enum or a STRING-literal
  union; … `:81` (SUBS-1) governs unions of `PrimitiveType`, not `LiteralType`
  arms (`grammar.md:102`). The emission stays as it is". The cell title reads
  "no rule spells a `type` for it".
- `tests/reserved-keyword-type-position.test.ts:777` — bug 0044's `d2` row,
  which pins `true | false` → `{ enum: [true, false] }` as one row of a table
  written for a diagnostic subject. Its failure message (`:771–773`) argues the
  adjacent `true | string` row and says nothing about this one's bytes.

An argument from a rule's absence is not the rule the reader of a second
implementation needs, and it is not stable: a later editor widening `:80` to
"literal union" without touching the code would falsify all three statements
without failing a test.

## Why it matters

1. **The bytes are content-addressed and the addresses are the contract.**
   `docs/spec_topics/schema-subset.md:94` states the canonical-hash recipe "is
   part of the on-disk and on-wire contract — changing it is a breaking change
   for any cached artefact, fixture snapshot, or replayable provider payload",
   and `:98` makes the lowered fragment the hashed input. Two conforming
   implementations that read the corpus and disagree on the emission mint
   different names for the same source: `@<1 | 2>` registers
   `__theta_respond_130e6817ca62c3dc` under one and
   `__theta_respond_4bed5da6973ead51` under the other; `{b: 1 | 2}` hoists
   `__inline_17e23f7b81fba003` versus `__inline_d985fc1927a48150`.
2. **Behavioural conformance cannot discriminate.** The verdict table is
   identical for every bare/typed pair across eleven payloads
   (§Reproduction), so a conformance suite that tests accept/reject passes both
   implementations. Only a byte-level or slug-level test separates them, and
   nothing in the corpus tells such a test which answer is right.
3. **The rule exists only as test rows in closed reports' regression files.**
   `tests/literal-union-string-enum-emission.test.ts:620–651` and
   `tests/reserved-keyword-type-position.test.ts:777` are the only artefacts
   asserting the emission. A reviewer of a future edit to `:383–385` has a test
   comment as the sole authority, and that comment's argument is that the spec
   is silent.
4. **The fragment is conveyed, not only enforced.**
   `src/extension/production-theta-producer.ts:4975` interpolates
   `JSON.stringify(lowered)` into the QRY-15 instruction
   (`docs/spec_topics/query/query-tool-loop.md:37`), and `respondToolWireSchema`
   puts the same bytes in the registered tool's `parameters`. A model shown
   `{"enum":[1,2]}` is shown a schema no spec line pins. The two forms are not
   interchangeable inputs to grammar-constrained decoding on every provider,
   and nothing in-tree measures the difference.
5. **Repair text depends on the answer.** A payload of the wrong JSON type
   yields one issue under the bare emission and two under a typed one
   (§Reproduction). QRY-11 respond-repair renders the issue list and the
   lowered schema into the follow-up turn (`renderFollowUpTurn`,
   `src/runtime/query-followup-render.ts:106–110`), so the resolution changes
   the instruction the model receives on a validation failure.
6. **The gap is asymmetric within one rule family.** `:79` covers a single
   literal of every kind — `1`, `true` and `null` all lower to `{"const":…}`
   (§Reproduction) — and `:81` covers a union of primitives of every kind.
   Only the multi-arm literal case is restricted to strings, and only there
   does the corpus stop.
7. **Cost grows per release.** Each release adds cached artefacts, fixture
   snapshots and replayable payloads keyed on the current bytes. A resolution
   that moves them costs more later than now; a resolution that ratifies them
   costs the same at any time.

## Fix

Not yet decided. The settled question is a **spec** decision on
`docs/spec_topics/schema-subset.md` step 3: which emission a union of literals
not all of which are strings carries. The code and the test pins follow the
text.

**Candidate dispositions.**

1. *Extend the coverage to state the emitted bytes.* One line added after `:80`
   (or `:80` reworded to name both cases), spelling
   `{ "enum": [...values...] }` with no `type` keyword for a literal union whose
   arms are not all strings. Ratifies §Reproduction as measured, changes no
   code, moves no slug, and gives
   `tests/literal-union-string-enum-emission.test.ts:620–651` and
   `tests/reserved-keyword-type-position.test.ts:777` a normative anchor in
   place of an argument from silence. The false side of the ternary
   (`src/parser/body-type-lowering.ts:385`) and `lowerTypeSource`'s doc comment
   (`:303–309`) are re-anchored on the new line in the same commit.

2. *Prescribe a typed emission per literal kind.* Step 3 gains a rule mapping
   each literal kind to a `type` keyword — `{"type":"integer","enum":[1,2]}`,
   `{"type":"boolean","enum":[true,false]}`,
   `{"type":["string","null"],"enum":["x",null]}` — and `:383–385` becomes a
   kind dispatch. Every affected fragment's bytes move, and with them
   `respondSchemaSlug` (`130e6817ca62c3dc` → `4bed5da6973ead51` for `1 | 2`;
   `267d6bfcdb5cb580` → `4f2d3141a73c4f0c` for `true | false`;
   `d53f79dd8d454a89` → `bcca8e4bc9a185fa` for `"x" | null`), the
   `__inline_<slug>` mint (`17e23f7b81fba003` → `d985fc1927a48150` for
   `{b: 1 | 2}`), the PIC-44 cache key, the QRY-15 instruction text, and the
   AJV issue list for a wrong-type payload. The five test rows move with them.
   This disposition is a behaviour change and its provider-side effect on
   grammar-constrained decoding is unmeasured; the measurement is part of the
   work, not a follow-up.

**Constraints on any resolution.**

1. **Mixed-kind unions get explicit coverage.** `"x" | 1` and `1 | 1.5` reach
   the branch and lower `{"enum":["x",1]}` and `{"enum":[1,1.5]}` today.
   Disposition 1 covers them by construction. Disposition 2 does not: no single
   `type` keyword fits `"x" | 1`, and `1 | 1.5` forces a choice between
   `integer` and `number` that `:5` admits both of. A resolution that assigns
   one keyword per kind states what the mixture emits — a multi-type array
   (`{"type":["string","integer"],…}`), the bare form as a fallback, or a
   parse-time refusal with a registered diagnostic — rather than leaving a
   second gap where the first was.
2. **Null-including unions get explicit coverage.** `"x" | null`, `1 | null`
   and `true | null` reach the branch. SUBS-1 (`:81`) already treats `null` as a
   primitive and fixes the multi-type-array form with `"null"` last for unions
   of `PrimitiveType`; a literal union including `null` is `LiteralType` arms
   (`grammar.md:102`) and is outside SUBS-1. Either the resolution states the
   arm order and form for that case or it states that the bare `enum` carries
   it, and either way the source-order rule at `:85` continues to govern the
   `enum` array (`"x" | null` → `["x",null]`).
3. **The mirror moves in the same commit.**
   `docs/reference/schema-subset.md:159–164` restates step 3 for the
   user-facing reference and `:16` mirrors the subset's validation-keyword
   bullet. Both are edited in the commit that edits
   `docs/spec_topics/schema-subset.md`, per the corpus's spec/reference
   mirroring.
4. **Line-citation drift.** A line inserted at or before `:80` shifts every
   later line of `docs/spec_topics/schema-subset.md`, and `:79`, `:80`, `:81`,
   `:85`, `:87`, `:94`, `:98`, `:100`, `:104` and `:108` all carry inbound
   citations from `docs/bugs/` and from `tests/`. A resolution either appends
   where the shift is nil or re-pins the citations in the same commit.
5. **The string-literal half does not move.** `:80`'s emission, its
   `type`-first key order, and the byte-identity between the named `enum` and
   the equivalent string-literal union are 0055's landed contract. Every cell of
   `tests/literal-union-string-enum-emission.test.ts` groups (a), (b) and (c)
   holds under both dispositions.
6. **The envelope and the sidecar do not move.**
   `respondSchemaIsEnveloped` is `true` for every candidate fragment
   (§Reproduction), and the sidecar's named-enum positions map excludes
   anonymous literal-union positions by source kind (`:87`), so neither
   disposition changes the wire shape or reattaches an enum tag.
7. **No new diagnostic code without a registry row**
   ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2),
   `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — the registry is
   closed). Both dispositions as stated emit no diagnostic. The
   parse-time-refusal variant of constraint 1 does, and would need a registry
   row in `docs/spec_topics/diagnostics/code-registry-parse.md` and an entry in
   `tests/fixtures/h7a/permitted-codes.json`.
8. **No committed fixture blocks either path.** No `.theta` or `.thetalib`
   under `docs/` or `tests/fixtures/` declares a non-string literal union, so
   the committed-fixture parse gate and the H7a golden transcript are
   unaffected under both dispositions.
9. **0056 inherits the answer.** Its §Status already defers to 0055's
   settlement for the literal-union emission; the non-string half is this
   report's question, and disposition 2 widens what 0056 has to carry to the
   `params:` position.

## Non-goals

- **Changing the emission ahead of the decision.** The bytes §Reproduction
  records are what the resolution either ratifies or replaces. This report
  files no code change.
- **The `params:` position.** `p: 1 | 2` lowers `{"anyOf":[{},{}]}` — neither
  candidate emission — because `lowerParamsFieldType` routes to `lowerTypeExpr`
  (`src/parser/params.ts:767`), which has no literal sublanguage
  (`:584–586`). That is
  [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md), which
  will inherit whatever this resolution settles.
- **A literal arm of a mixed union and a generic argument's element type.**
  `1 | string` lowers `{"anyOf":[{},{"type":"string"}]}` and `array<1 | 2>`
  lowers `{"type":"array","items":{"anyOf":[{},{}]}}`; neither reaches the
  branch. [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) §Non-goals
  owns both.
- **The string-literal-union emission.** `:80` spells it and
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) landed it
  (0.59.0). The ternary's true side, the byte-identity between
  `enum Sev { Low = "low", High = "high" }` and `schema Sev = "low" | "high"`,
  and the `type`-first key order are settled and stay.
- **The named `enum` declaration's string-only values.**
  `theta/parse/non-string-enum-value` (`docs/spec_topics/schemas.md:93`) is a
  separate decision that keeps the `enum` half of `:80` inside the string case;
  widening it is not asked for here.
- **Whether `respondSchemaSlug` should hash the canonical form.** It hashes
  `JSON.stringify(lowered)` (`src/runtime/typed-query-validation.ts:348`)
  rather than the key-sorted canonical form `:99–105` defines, which is why
  emission key order matters at all. 0055 §Non-goals records it; unfiled and
  untouched here.

## Provenance

- Origin: bug
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) §Fix
  (0.59.0) *Residuals* item (iii) (`:273–277`) and §Non-goals (`:778–782`),
  both left unfiled. This report files it and re-derives every value at HEAD
  `0b1e20ab`.
- Spec: `docs/spec_topics/schema-subset.md:5` (the subset's type keywords),
  `:7` (`enum` / `const` as validation keywords), `:74` (step 3, *Emits per
  type form*), `:79` (the single-literal `const` rule), `:80` (the enum /
  string-literal-union rule), `:81` ([SUBS-1](../spec_topics/schema-subset.md#subs-1),
  unions of primitives), `:85` (*Array element order*), `:87` (step 5, the
  sidecar's deliberate absence of anonymous literal-union positions), `:94`
  (§Canonical schema hash — the on-disk/on-wire contract statement), `:98`
  (step 1, the lowered fragment as hash input), `:99–107` (canonical form,
  digest, slug), `:108` (§Synthesised names);
  `docs/spec_topics/grammar.md:94` (`Type "|" Type`), `:97` (`PrimitiveType`),
  `:102` (`LiteralType`), `:105` (the bare-`Type` positions);
  `docs/spec_topics/type-system.md:9` (literal types as type expressions),
  `:15` (one type grammar in every annotation position);
  `docs/spec_topics/schemas.md:60` (the `=` form composes with literal unions),
  `:93` (`theta/parse/non-string-enum-value`);
  `docs/spec_topics/query/query-tool-loop.md:37` (QRY-15 conveyance).
  User-facing mirror: `docs/reference/schema-subset.md:16`, `:159–170`.
- Implementation at `0b1e20ab`: `src/parser/body-type-lowering.ts:95–101`
  (`lowerEnumToSchema`, emission at `:100`), `:109–140` (`lowerObjectFields`,
  per-field call at `:120`), `:153–174` (`lowerInlineObject`, delegating at
  `:173`), `:303–309` (`lowerTypeSource`'s doc comment on the literal arm),
  `:353` (the signature), `:378–392` (the literal sublanguage — union arm
  `:379–386`, the ternary `:383–385`, single literal `:387–391`), `:399–407`
  (the `lowerField` inner helper), `:577` (pass 2's `schema`-body call), `:598`
  (pass 2's alias-RHS call), `:729` (`collectUnresolvedNamedTypes`'s call),
  `:741–762` (`parseLiteralArm`); `src/parser/params.ts:472` (`lowerTypeExpr`),
  `:584–586` (its trailing catch-all), `:692–694` (the `__inline_<slug>` mint),
  `:767` (`lowerParamsFieldType`'s `lowerTypeExpr` route);
  `src/runtime/query-schema-lowering.ts:153` (the annotation root's brace arm),
  `:160` (its non-brace arm);
  `src/runtime/typed-query-validation.ts:347–349` (`respondSchemaSlug`);
  `src/runtime/respond-tool-wire.ts:55–70`
  (`rootIsArgumentObjectSatisfiable`), `:73–75`
  (`respondSchemaIsEnveloped`);
  `src/runtime/query-followup-render.ts:106–110` (`renderFollowUpTurn`);
  `src/seams/schema-validator.ts:155–163` (the AJV error mapping);
  `src/extension/production-theta-producer.ts:2620` (the PIC-44 cache's
  byte-equality bytes), `:4975` (the QRY-15 interpolation).
- Tests: `tests/literal-union-string-enum-emission.test.ts:112–115` (the file
  header's statement of the disposition), `:620–651` (group (d)), `:622–625`
  (the four rows), `:631–636` (the failure message);
  `tests/reserved-keyword-type-position.test.ts:777` (bug 0044's `d2` row).
- Fixtures surveyed: every `.theta` and `.thetalib` under `docs/` and
  `tests/fixtures/`; the three literal unions are all string-literal
  (`docs/examples/handle-error.theta:8`, `sentiment.theta:8`,
  `review-lens.theta:12`).
- Observations: throwaway vitest probe at `0b1e20ab` over `parseDoc`,
  `lowerTypeSource`, `lowerInlineObject`, `buildBodyTypeSchemas`,
  `lowerQueryResponseSchema`, `respondSchemaSlug`, `respondToolWireSchema`,
  `respondSchemaIsEnveloped`, the production `AjvSchemaValidator`, and a
  `node:crypto` canonical-hash oracle; sixteen direct lowerings, eight
  positions, seven slug rows, seven eleven-payload AJV rows, five issue lists,
  three unreached positions. Deleted after the run.
