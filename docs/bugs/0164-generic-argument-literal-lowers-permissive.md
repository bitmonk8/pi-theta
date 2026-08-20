# Bug 0164 — `lowerTypeExpr` recurses a generic's argument through ITSELF and never through the literal sublanguage, so `array<"x" | "y">` lowers `{"type":"array","items":{"anyOf":[{},{}]}}` at all four `Type` positions and `array<"x">` lowers `items: {}`: the declared element type enforces nothing, a real `AjvSchemaValidator` admits `[7, null, {}]` for an array the author closed to two strings, and the byte-identical declaration spelled `schema Sev = "x" | "y"` plus `array<Sev>` refuses all three — with no diagnostic distinguishing them

- **Status:** fixed (0.123.0). §Fix was constraint-pinned, not settled: the
  change is a route for `lowerTypeExpr`'s generic-argument recursion, and the
  disposition was left to the run because the recursion is shared by every
  position and is governed by the argument-split nesting rule
  (`TypeSplitNesting`, `src/parser/params.ts:971`), which forbids the widening
  the obvious route invites. Route (i) — *at the argument* — was taken; see
  `## Fix (0.123.0)` below. Ordering: nothing blocked this report from
  starting.
  [0098](./0098-nonstring-literal-union-emission-unspecified.md) is the one
  report whose resolution interacts — it fixes WHICH BYTES a non-string literal
  union carries where it is lowered at all, and this report makes
  `array<1 | 2>` a position where that emission is reached — so whichever
  lands second re-derives the other's rows rather than assuming them.
- **Sev/Diff estimate:** S1/D3 — S1 because a declared element type enforces
  nothing at any of the four `Type` positions with zero diagnostics: the
  lowered fragment is the argument-validation production path, and real AJV
  over it accepts `[7, null, {}]` for `array<"x" | "y">` (§Reproduction (b));
  D3 because the remedy re-routes the one generic-argument recursion every
  position shares, under a named nesting-rule governance that bars widening the
  argument split, and it moves the `array<"x" | "y">` control cells bug 0056
  and bug 0055 deliberately pinned (enumerated in §Fix constraint 3).
- **Kind:** defect. The lowering pass drops a rule the emission table states.
  `docs/spec_topics/schema-subset.md:77` emits `array<T>` as
  `{ "type": "array", "items": <T-lowered> }` — `T` lowered by the same step-3
  table that owns `:79` (`{ "const": <value> }` for a literal) and `:80`
  (`{ "type": "string", "enum": [...] }` for a string-literal union).
  `docs/spec_topics/grammar.md:99` makes the argument a recursive `Type` and
  `:105` names "generic type arguments" among the positions where a bare `Type`
  appears, adding that "the grammar is otherwise identical in every position".
  The implementation reaches the literal rows only from the TOP of a type
  source; the generic-argument recursion (`src/parser/params.ts:525`) re-enters
  `lowerTypeExpr`, which owns no literal sublanguage and returns `{}` from its
  trailing catch-all (`:601–603`). No registry row is implicated: nothing is
  mis-emitted, and no diagnostic fires at any position.
- **Related:**
  - [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) —
    fixed (0.85.0, commit `81600080`), the origin. Its fix gave the `params:`
    position the shared literal sublanguage at every depth and pinned this
    depth as a control; §Non-goals (`:705–710`) declines it by name and states
    the remedy ("a change to `lowerTypeExpr`'s recursion, which the
    argument-split nesting rule … governs"), and `## Fix (0.85.0)` *Residuals*
    item 3 (`:1043–1049`) re-derives it at the fixed tree and records it as
    unfiled and owned by neither of the two reports that mention it. This
    report files it. The fix also moved the remedy's ingredient into reach:
    `parseLiteralArm` and `lowerLiteralSublanguage` are exported from
    `src/parser/params.ts` since 0.85.0 (`:784`, `:834`), the same module
    `lowerTypeExpr` lives in, so no import direction has to be crossed.
  - [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) —
    fixed (0.59.0). §Non-goals (`:774–777`) names `array<"x" | "y">` in passing
    and holds it outside, attributing it to the mixed-union family. Its
    regression file carries the one-position fence this report moves
    (`tests/literal-union-string-enum-emission.test.ts:693–701`, cell `e2`).
  - [0098](./0098-nonstring-literal-union-emission-unspecified.md) — open, the
    boundary stated precisely below. 0098 owns WHICH BYTES a non-string literal
    union emits where it IS lowered; this report owns the generic-argument
    DEPTH where the literal check never runs at all. 0098 §Non-goals
    (`:551–555`) attributes `array<1 | 2>` to 0043 §Non-goals; 0043 §Non-goals
    (`:727–766`) carries no such bullet — verified below.
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — fixed
    (0.53.0), arm ordering. Its §Non-goals holds two adjacent shapes that stay
    permissive by that doc's own holding and are outside this report: a literal
    arm of a MIXED union (`:743–759`, `"a" | Triage`) and an `array<…>` whose
    argument text carries a top-level comma (`:736–742`). It also holds
    `splitTopLevel`'s angle-only default nesting outside (`:760–763`), which is
    the same rule §Fix constraint 1 pins here.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — open,
    the inventory of what a permissive `{}` should ever be. The `array<"x">`
    row of this report emits one; whether `{}` is ever an admissible lowering
    is 0028's question, not this one's.
- **Affected** (every citation verified at HEAD `04c6585f`; the two working-tree
  files a sibling orchestrator is editing, `src/parser/params.ts` and
  `src/parser/frontmatter.ts`, are cited at HEAD, not at their working-tree
  line numbers):
  - **The recursion.** `src/parser/params.ts:490` (`lowerTypeExpr`), whose
    generic-application arm is `:518–533`: `:522` splits the argument list with
    `splitTopLevel`'s default `"angle"` nesting, `:523` tests `ctor === "array"`
    at arity 1, and `:525` returns
    `{ type: "array", items: lowerTypeExpr(first, lowerCtx) }` — the
    self-recursion. `:529–531` is the best-effort loop for every other
    constructor, also `lowerTypeExpr`. Neither call site can reach a literal
    rule, because `lowerTypeExpr` has none: `:601–603` is the trailing
    catch-all ("A literal-type atom (string/number literal) or any other form:
    lower permissively"), and `:501–516` is the union split whose per-arm
    recursion (`:504`) lands each literal arm on that same catch-all.
    `classifyLoweredUnionArm`'s inlined test at `:506–512` admits into SUBS-1's
    `{"type":[…]}` form only a fragment whose sole key is a `type` naming a
    primitive, so `{}` is `non-primitive` and `lowerUnion` emits `anyOf`.
  - **The sublanguage, one function away and never called from there.**
    `src/parser/params.ts:834–848` (`lowerLiteralSublanguage`) carries the one
    emission: `:835` splits on `|`, `:837–839` require every arm to parse as a
    literal, `:840–842` is bug 0055's landed ternary, `:846–847` returns
    `{ const: … }` for a single accepted atom. `:784–805` is `parseLiteralArm`.
    Both are exported. Two callers exist and both call it at the TOP of a type
    source only: `lowerParamsFieldType` (`:871–884`, the call at `:876`, the
    `lowerTypeExpr` delegation at `:881`) and `lowerTypeSource`
    (`src/parser/body-type-lowering.ts:359`, the call at `:388`, the
    `lowerTypeExpr` delegation at `:444`). An `array<…>` source is declined by
    both — it is not a literal and not brace-rooted — and goes whole to
    `lowerTypeExpr`, which then owns everything below the angle bracket.
  - **The four positions all converge there.** `params:` —
    `src/parser/params.ts:183` (`parseParams`'s per-field
    `lowerParamsFieldType` call). `schema`-body field and alias RHS —
    `src/parser/body-type-lowering.ts:545` (`buildBodyTypeSchemas`), reaching
    `lowerTypeSource` through `lowerObjectFields` (`:110`). `@<T>` /
    `invoke<T>` — `src/runtime/query-schema-lowering.ts:113`
    (`lowerQueryResponseSchema`), the non-brace root at `:160`.
  - **The in-tree record that names both halves and never joins them.**
    `src/runtime/query-schema-lowering.ts:25–81` inventories every permissive
    `{}` below the seam. `:60–62` names the generic-argument recursion
    ("A GENERIC ARGUMENT: `array<{a: string}>` recurses its element type
    through `lowerTypeExpr` directly — `items: {}`") with a brace-rooted
    example only; `:78–81` names the literal atom ("a literal atom is
    recognised only by `lowerTypeSource`'s own top-level check") with a
    mixed-union example only. The all-literal argument is in neither item.
  - **The governance the remedy runs under.** `src/parser/params.ts:948–971`
    documents `TypeSplitNesting` and why a `GenericType` ARGUMENT list is one
    of the two lists that need `"angle-and-brace"`; `:988` and `:1046` are
    `splitTopLevelSegments` / `splitTopLevel`, whose default is `"angle"`.
    `lowerTypeExpr:522` passes the default. `src/parser/theta-document.ts:5087–5092`
    states the constraint directly: "the argument split stays angle-only
    because widening it would disagree with `theta/parse/generic-arity-mismatch`
    (params.ts, `TypeSplitNesting`)".
  - **The three consumers of the lowered `params:` document**, each a real AJV
    compile: `src/extension/production-theta-producer.ts:726` (the binder
    envelope build, `buildBinderEnvelopeSchema` →
    `src/binder/binder-envelope.ts:89`, `relaxParamsSchema` at `:137`), `:1189`
    (the post-default-merge compile), `:1991` (the subagent child's params
    intake, the schema read at `:1984`).
  - **The `@<T>` position's bytes name a registered tool.**
    `src/extension/production-theta-producer.ts:2578` (`respondToolWireSchema`
    feeding the registration), `:2633` (`respondSchemaSlug(lowered)`), `:5045`
    (`renderTypedAwareQueryText`, which interpolates the fragment into the
    QRY-15 instruction shown to the model).
  - **The control cells that pin the current bytes.**
    `tests/params-literal-sublanguage-lowering.test.ts:928–936` (bug 0056's
    group-(d) cell `d6`, `array<"x" | "y">` →
    `{ type: "array", items: { anyOf: [{}, {}] } }` over all four `POSITIONS`,
    `:276`), whose failure message names bug 0056 §Non-goals and this
    recursion; `tests/literal-union-string-enum-emission.test.ts:693–701` (bug
    0055's group-(e) cell `e2`, one position, message naming 0055 §Non-goals),
    and `:103`, the file header's signature-table row for the same source.
  - **No committed fixture carries the shape.** No `.theta` or `.thetalib` in
    the tree declares a generic argument that is a literal or a literal union;
    the two committed `array<…>` sites are
    `docs/examples/summarise-doc.theta:10` (`themes: array<string>`) and
    `docs/examples/fan-out-reviews.theta:16` (a comment). The documented
    `params:` `array<T>` examples are
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:23` and `:65`, both
    `array<string>`. So `tests/committed-fixture-parse-gate.test.ts` never
    meets the input.
- **Observed at:** v0.85.0 `04c6585f`. Offline and deterministic — no live
  model, no provider. Every value below was produced by a scratch vitest probe
  through the shipped front end (`parseThetaDocument` via
  `tests/helpers/e2e-s1.ts`), the shipped `lowerQueryResponseSchema`, the
  shipped `buildBinderEnvelopeSchema` / `renderBinderParamLine`, and the
  production `AjvSchemaValidator`; run twice, the second time against a working
  tree byte-identical to HEAD (`git diff --stat` empty), with identical output
  on every shared row; then deleted.

## Summary

`array<"x" | "y">` lowers `{"type":"array","items":{"anyOf":[{},{}]}}` at the
`params:` field position, the `schema`-body field position, the alias
right-hand side and the `@<T>` annotation root. `array<"x">` lowers
`{"type":"array","items":{}}` at the same four. Both load with zero
diagnostics. Real AJV over the lowered `params:` document accepts `["zzz"]`,
`[7]`, `[null]`, `[{}]` and `[7, null, {}]` for a param the author closed to
two strings; the only values it refuses are the ones `{"type":"array"}` alone
refuses.

The four positions agree, and agree on the wrong answer, because they share one
function below the top of the type source. `lowerTypeSource` and
`lowerParamsFieldType` each check the literal sublanguage
(`lowerLiteralSublanguage`, `src/parser/params.ts:834`) before anything else,
decline an `array<…>` source, and hand it whole to `lowerTypeExpr`.
`lowerTypeExpr`'s `array` arm then recurses the argument through `lowerTypeExpr`
(`:525`), never back through either caller, so the element type meets the union
split and the trailing catch-all and nothing else. One absence, four positions.

The same declaration spelled through a name enforces:
`schema Sev = "x" | "y"` with `p: array<Sev>` lowers
`{"type":"array","items":{"$ref":"#/$defs/Sev"}}` with
`$defs.Sev = {"type":"string","enum":["x","y"]}`, and refuses `["zzz"]`, `[7]`
and `[7, null, {}]`. Nothing at load, in the recorded type, or in the binder
prompt distinguishes the two spellings.

Bug 0056's fix (0.85.0) closed the top level at all four positions and pinned
this depth as a control on the way past. Its §Non-goals states the remedy: a
change to `lowerTypeExpr`'s recursion, governed by the argument-split nesting
rule.

## Reproduction

Offline, at `04c6585f`. Scratch vitest calling `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema`, `buildBinderEnvelopeSchema`,
`renderBinderParamLine` and the production `AjvSchemaValidator`. Declarations in
scope: `schema Sev = "x" | "y"`. The four positions are read as bug 0043's
witness reads them — `params:` as `properties.p`, the `schema`-body field as
`$defs.S.properties.a`, the alias as `$defs.M`, and the annotation as
`lowerQueryResponseSchema`'s return with `$defs` split off. Every fixture below
loads with **zero diagnostics** at every position.

### (a) One type expression, four positions

All four positions produce byte-identical fragments for every row, so one column
is shown; the parity was asserted per row, not assumed.

```
array<"x" | "y">          {"type":"array","items":{"anyOf":[{},{}]}}
array<"x">                {"type":"array","items":{}}
array<array<"x" | "y">>   {"type":"array","items":{"type":"array","items":{"anyOf":[{},{}]}}}
array<1 | 2>              {"type":"array","items":{"anyOf":[{},{}]}}
array<"x" | null>         {"type":"array","items":{"anyOf":[{},{"type":"null"}]}}
array<null>               {"type":"array","items":{"type":"null"}}
array<true | false>       {"type":"array","items":{"anyOf":[{"const":true},{"const":false}]}}
array<"x" | integer>      {"type":"array","items":{"anyOf":[{},{"type":"integer"}]}}
array<Sev>                {"type":"array","items":{"$ref":"#/$defs/Sev"}}
array<string>             {"type":"array","items":{"type":"string"}}
```

The top-level contrast, for the same literal-union text:

```
"x" | "y"                 {"type":"string","enum":["x","y"]}   (all four positions, since 0.85.0)
```

### (b) Real AJV over the lowered `params:` document

Through the production `AjvSchemaValidator` (the shipped V8c seam:
`strict: false`, `allErrors: true`, `ajv-formats` installed).
`p: 'array<"x" | "y">'` lowers the document

```
{"type":"object","properties":{"p":{"type":"array","items":{"anyOf":[{},{}]}}},
 "required":["p"],"additionalProperties":false}
```

and validates:

```
{"p":["x"]}          -> true     (an element the author declared)
{"p":["x","y"]}      -> true     (elements the author declared)
{"p":[]}             -> true     (vacuous)
{"p":["zzz"]}        -> true     (matches NEITHER arm)
{"p":[7]}            -> true     (matches NEITHER arm)
{"p":[true]}         -> true     (matches NEITHER arm)
{"p":[null]}         -> true     (matches NEITHER arm)
{"p":[[]]}           -> true     (matches NEITHER arm)
{"p":[{}]}           -> true     (matches NEITHER arm)
{"p":[7,null,{}]}    -> true     (three elements, none of them either arm)
{"p":"notanarray"}   -> false    (the outer `{"type":"array"}` still holds)
{"p":7}              -> false    (the outer `{"type":"array"}` still holds)
```

The last two rows are the whole of what the declared type enforces. `items` is
`{"anyOf":[{},{}]}` — two variants, each of which AJV satisfies with any JSON
value — so no element is ever refused.

`array<"x">` is one step worse in bytes and identical in effect: `items` is `{}`,
with no `anyOf` wrapper.

```
p: 'array<"x">'    {"p":["x"]} -> true   {"p":["zzz"]} -> true   {"p":[7,null,{}]} -> true
```

### (c) The enforcing contrast — a named alias used as the argument

`schema Sev = "x" | "y"` with `p: 'array<Sev>'`:

```
document :: {"type":"object","properties":{"p":{"type":"array","items":{"$ref":"#/$defs/Sev"}}},
             "required":["p"],"additionalProperties":false,
             "$defs":{"Sev":{"type":"string","enum":["x","y"]}}}

{"p":["x"]}          -> true
{"p":[]}             -> true
{"p":["zzz"]}        -> false
{"p":[7]}            -> false
{"p":[7,null,{}]}    -> false
```

The `$ref` inside `items` enforces. `lowerTypeExpr`'s identifier arm resolves
the name whole-file, registers the alias's own lowering under `$defs.Sev`, and
emits the pointer — and the alias's lowering went through `lowerTypeSource`,
which ran the literal check at the top of `"x" | "y"`. The declared constraint
survives exactly when it is written somewhere the check reaches.

`array<string>` is the primitive control and behaves the same way:
`{"p":[7]}` and `{"p":[7,null,{}]}` are refused, `{"p":["x"]}` accepted.

### (d) Depth

Nesting costs the defect nothing and gains it nothing:

```
p: 'array<array<"x" | "y">>'
document.properties.p :: {"type":"array","items":{"type":"array","items":{"anyOf":[{},{}]}}}

{"p":[["x"]]}          -> true
{"p":[[7,null,{}]]}    -> true
{"p":[7]}              -> false    (the inner `{"type":"array"}`)
```

Each `array` level emits its own `{"type":"array"}` and hands the remainder back
to `lowerTypeExpr`, so every level constrains the container and no level
constrains the leaf.

### (e) What the binder is told

```
p: 'array<"x" | "y">'
  BypassParamsField  :: {"wireName":"p","type":"array<\"x\" | \"y\">","hasDefault":false,"nullable":false}
  Parameters: line   ::   p (array<"x" | "y">) required
  envelope `args`    :: {"type":"object","properties":{"p":{"type":"array","items":{"anyOf":[{},{}]}}},
                         "required":["p"],"additionalProperties":false}

p: 'array<Sev>'
  Parameters: line   ::   p (array<Sev>) required
  envelope `args`    :: {"type":"object","properties":{"p":{"type":"array","items":{"$ref":"#/$defs/Sev"}}},
                         "required":["p"],"additionalProperties":false}
  envelope `$defs`   :: {"Sev":{"type":"string","enum":["x","y"]}}
```

The prompt line carries the declared type verbatim in both cases; the schema the
model is constrained by carries the arms in one case only.

### (f) The minted `$defs` name does not split

```
p: '{m: array<"x" | "y">}'
  params:      {"$ref":"#/$defs/__inline_bf7d6fbea15638b6"}
  schema body: {"$ref":"#/$defs/__inline_bf7d6fbea15638b6"}
  alias RHS:   {"$ref":"#/$defs/__inline_bf7d6fbea15638b6"}
  $defs entry: {"type":"object","properties":{"m":{"type":"array","items":{"anyOf":[{},{}]}}},
                "required":["m"],"additionalProperties":false}
```

One source text, one name, at every hoisting position — because the permissive
`items` fragment is identical at all four positions. (The `@<T>` root lowers the
object in place rather than to a `$ref`, and carries the same `items`.) This is
an enforcement defect, not a content-addressing one; a fix moves the mint, which
is why §Fix constraint 4 names it.

### (g) Adjacent shapes that are NOT this report's, measured for the boundary

At all four positions:

```
array<"x" | integer>       {"type":"array","items":{"anyOf":[{},{"type":"integer"}]}}   — 0043 §Non-goals, the MIXED union
array<{m: "x" | "y"}>      {"type":"array","items":{"anyOf":[{},{}]}}                   — a brace-rooted argument
array<{m: "x", n: "y"}>    {}                                                          — arity 2 by the angle-only split; 0043 §Non-goals :736–742
```

The last two rows come from the argument split, not from the literal check.
Through `lowerTypeExpr` directly:

```
lowerTypeExpr('{m: "x" | "y"}')     {"anyOf":[{},{}]}
lowerTypeExpr('{m: "x"}')           {}
lowerTypeExpr('array<{m: "x"}>')    {"type":"array","items":{}}
```

The angle-only `|` split cuts the brace group into `{m: "x"` and `"y"}`, so
`array<{m: "x" | "y"}>` reaches `items: {"anyOf":[{},{}]}` for a reason
unrelated to the missing literal rule. A fix for this report reaches none of
these three: the argument text is brace-rooted, which the literal recogniser
declines.

## Expected behaviour

- `docs/spec_topics/schema-subset.md:77` — "`array<T>`:
  `{ "type": "array", "items": <T-lowered> }`". `<T-lowered>` is `T` lowered by
  step 3, which is the same list that carries `:79` ("Literal `"foo"` / `42` /
  `true` / `null`: `{ "const": <value> }`") and `:80` ("Enum (or string-literal
  union): `{ "type": "string", "enum": [...wire values...] }`"). Nothing scopes
  either rule away from an element type. So:

  ```
  array<"x" | "y">   ->  {"type":"array","items":{"type":"string","enum":["x","y"]}}
  array<"x">         ->  {"type":"array","items":{"const":"x"}}
  ```

  and an AJV document built from the first accepts `["x"]`, `["x","y"]` and `[]`
  and refuses `["zzz"]`, `[7]`, `[null]`, `[{}]` and `[7, null, {}]` — which is
  what the `array<Sev>` document already does for the byte-identical arm set.
- `docs/spec_topics/grammar.md:99` — `GenericType ::= "array" "<" Type ">"`, and
  `:107` — "The `Type` reference inside each `<…>` is recursive". `:95` and
  `:102` put `LiteralType` in `Type` (`LiteralType ::= STRING | NUMBER |
  BOOLEAN | NULL`), so a literal inside an argument is ordinary grammar. `:105`
  names "generic type arguments" among the positions where "a bare `Type`
  appears" and adds "The grammar is otherwise identical in every position".
- `docs/spec_topics/type-system.md:7` lists `array<T>` among the generic types
  and `:9` lists literal types as "valid type expressions"; `:15` — "The same
  type grammar applies in every type-annotation position". One grammar and one
  emission table give one answer per type expression, and a type expression the
  grammar admits at a position where AJV enforces has to lower to something AJV
  can enforce.
- `docs/spec_topics/schema-subset.md:85` (*Array element order*) fixes the
  `enum` array's order and the `anyOf` variant order "so that source fragments
  which lower identically also serialise to identical bytes". It governs the
  ORDER of whatever an element type emits; it states no emission and does not
  exempt `items` from step 3. Under the expectation above,
  `array<"x" | "y">`'s `enum` is `["x","y"]` in source enumeration order.
- `docs/spec_topics/schema-subset.md:9` — "**Arrays**: `items` (a single
  subschema)" — makes the element position an ordinary subschema position, and
  `:7` admits `enum` and `const` as validation keywords with no positional
  restriction. The expected fragments are inside the subset.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` — "`params` are
  validated with AJV at invocation time"; `:58` — "Each `params:` field's
  right-hand side is a type expression parsed by the theta type grammar — the
  same grammar used in every other type-annotation position". A type expression
  the grammar admits and the AJV validation cannot enforce satisfies neither
  sentence.
- The user-facing mirror restates the same rule:
  `docs/reference/schema-subset.md:160–164`.

## Actual behaviour / root cause

One function owns everything below the top of a type source, and it has no
literal rule.

`lowerTypeExpr` (`src/parser/params.ts:490–604`) dispatches by shape: the union
split (`:501–516`), the generic application (`:518–533`), the primitive atom,
the reserved-keyword spellings, the identifier atom, and then the catch-all
(`:601–603`):

```ts
  // A literal-type atom (string/number literal) or any other form: lower
  // permissively; literal lowering is owned by the schema-subset leaves.
  return {};
```

The `array` arm is `:523–526`:

```ts
    if (ctor === "array" && args.length === 1) {
      const first = args[0] ?? "";
      return { type: "array", items: lowerTypeExpr(first, lowerCtx) };
    }
```

`items` is this function applied to the argument. For `array<"x">` the argument
is a single literal atom, which falls to `:601–603` and returns `{}`. For
`array<"x" | "y">` the argument splits at `:501`, each arm re-enters at `:504`
and returns `{}`, the inlined primitive test at `:506–512` finds no sole `type`
key and classifies both arms `non-primitive`, and `lowerUnion` emits
`{"anyOf":[{},{}]}`. That is SUBS-1 applied faithfully to arms carrying no
information.

The literal sublanguage exists in the same module and is exported.
`lowerLiteralSublanguage` (`:834–848`) splits on `|`, requires every arm to
parse through `parseLiteralArm` (`:784–805`), and emits bug 0055's landed
ternary (`:840–842`) or the single-atom `const` (`:846–847`). It has exactly two
callers, and both call it at the top of a type source and nowhere else:

- `lowerParamsFieldType` (`:871–884`) calls it at `:876`, before its brace test,
  and delegates to `lowerTypeExpr` at `:881`.
- `lowerTypeSource` (`src/parser/body-type-lowering.ts:359`) calls it at `:388`,
  before its two dispatches, and delegates to `lowerTypeExpr` at `:444`.

An `array<…>` source is neither a literal nor brace-rooted, so both callers
decline it and hand the WHOLE source to `lowerTypeExpr`. From there the argument
never returns to either caller: `:525` passes it to `lowerTypeExpr`. The
`params:` position's per-field recursion (`:883`) and `lowerTypeSource`'s
`lowerField` inner helper (`body-type-lowering.ts:398–405`) both re-enter a
literal-aware function, which is why an inline object's FIELD type reaches the
check at every depth — but a generic's ARGUMENT is not a field, and there is no
corresponding re-entry.

The route is deliberate on both sides. `lowerTypeSource`'s doc comment
(`body-type-lowering.ts:319–327`) states why its field recursion must re-enter
itself — "without that re-entry a nested `"x" | "y"` reaches `lowerTypeExpr`,
which owns no literal sublanguage, and lowers `anyOf: [{}, {}]`". The same
sentence describes what the generic argument does, and nothing re-enters for it.
Bug 0056's fix carried the check to every FIELD depth at the `params:` position
by reusing `lowerParamsFieldType` as its own recursion, and left the argument
depth as it found it (`0056-…md:1043–1049`).

Four sub-cases fall out of the one absence, and they are not uniform:

- **A string or number literal, alone or in an all-literal union, enforces
  nothing.** `array<"x">` → `items: {}`; `array<"x" | "y">`,
  `array<1 | 2>` → `items: {"anyOf":[{},{}]}`.
- **`null` reaches the primitive arm, not the literal one.** `array<null>`
  lowers `items: {"type":"null"}`, from `lowerTypeExpr`'s `PRIMITIVE_TYPES` test
  (`:420–426`, `:536–538`). Bug 0056 §Fix constraint 2 settled `null` as a
  `LiteralType` for lowering purposes at all four positions and moved the
  `params:` position to `{"const":null}` for that reason. Inside a generic
  argument the settlement does not apply, because the settlement lives in
  `lowerLiteralSublanguage` and the argument never reaches it. The two fragments
  accept exactly `null`, so this row diverges in bytes and slugs, not in what it
  validates.
- **Booleans DO enforce here, for an unrelated reason.** Bug 0044's fix (0.54.0)
  gave `lowerTypeExpr`'s atom section its own `true` / `false` arm
  (`:546–551`), so `array<true>` lowers `items: {"const":true}` and
  `array<true | false>` lowers `items: {"anyOf":[{"const":true},{"const":false}]}`
  — the latter accepting exactly `true` and `false`. The boolean rows are the
  one literal kind that constrains at this depth. Their bytes still diverge from
  the `{"enum":[true,false]}` the same source emits at depth 0.
- **Depth is uniform.** `array<array<"x" | "y">>` repeats the arm once more; no
  level introduces a check.

Everything else on the path is correct. `lowerUnion`
(`src/parser/schema-lowering.ts`) implements SUBS-1 over whatever arms it is
handed; the identifier arm resolves `array<Sev>` to a `$ref` and registers the
alias's own — literal-aware — lowering under `$defs`; the hoist and the slug
mint agree across positions (§Reproduction (f)). The defect is one missing
re-entry, replicated to four positions by being below all of them.

The in-tree inventory of permissive `{}` origins has both halves and never joins
them: `src/runtime/query-schema-lowering.ts:60–62` names the generic-argument
recursion with a brace-rooted example, and `:78–81` names the literal atom with
a mixed-union example. Neither item names an all-literal generic argument, so
nothing in the tree records that the two meet.

## Why it matters

- **The lowered fragment is the only enforcement the argument gets.** Three
  sites compile the `params:` document: the binder envelope
  (`production-theta-producer.ts:726` → `binder-envelope.ts:89`), the
  post-default-merge validation (`:1189`), and the subagent child's params
  intake (`:1991`). An `items` of `{"anyOf":[{},{}]}` admits every element at
  all three, so a param declared `array<"x" | "y">` binds `[7, null, {}]` and
  the body runs on it. Bug 0056's fix closed exactly this hole for `p: '"x" |
  "y"'` and its H8a live cell pins the closure; one `array<…>` wrapper reopens
  it.
- **Two spellings of one declaration behave differently with no signal.**
  `p: 'array<"x" | "y">'` accepts every element; `schema Sev = "x" | "y"` plus
  `p: 'array<Sev>'` refuses `"zzz"`, `7` and `null`. Nothing distinguishes them
  at load, in the recorded `BypassParamsField.type`, or in the rendered
  `Parameters:` line.
- **The spec routes authors into the losing spelling.**
  `docs/spec_topics/schemas.md:93` — "`enum` is **top-level only** … For inline
  enumerations use literal-union: `severity: "low" | "medium" | "high"`" — and
  the `theta/parse/inline-enum` registry row repeats it in its *Fix hint*
  (`docs/spec_topics/diagnostics/code-registry-parse.md:95`). The form the spec
  names as the way to write an inline enumeration is the form that stops
  constraining as soon as it is wrapped in `array<…>`, and
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:23` and `:65` show
  `array<T>` as an ordinary `params:` shape.
- **The failure is invisible to a `{}`-shaped check.** `array<"x" | "y">`
  emits a fragment whose root key is `{"type":"array"}`, so any audit asking
  "did this type lower to a bare `{}`?" — including the inventory
  `src/runtime/query-schema-lowering.ts:25–81` maintains — answers no. Only the
  `array<"x">` row emits a visible `{}`, and it emits it one level down inside
  `items`.
- **The model is grounded in the type the schema drops.** The `Parameters:`
  block renders the declared Theta type verbatim, so the binder prompt says
  `p (array<"x" | "y">) required` while `relaxParamsSchema`
  (`binder-envelope.ts:137`) copies `items: {"anyOf":[{},{}]}` into the
  model-facing envelope. Grammar-constrained decoding has nothing to constrain
  at that position, and the binder's structured output is accepted whatever it
  emits inside the array.
- **At the `@<T>` position the bytes name a registered tool and are shown to
  the model.** `respondSchemaSlug` (`production-theta-producer.ts:2633`) hashes
  the lowered fragment to name `__theta_respond_<slug>`, `respondToolWireSchema`
  (`:2578`) puts it in that tool's `parameters`, and
  `renderTypedAwareQueryText` (`:5045`) interpolates it into the QRY-15
  instruction. A fix moves all three for every annotation carrying a literal
  argument.
- **The gap is asymmetric within one rule family, and the asymmetry is new.**
  Since 0.85.0 every literal kind lowers to its emission at depth 0 at all four
  positions, and inside an inline object at every field depth. Inside a generic
  argument, string and number literals lower to nothing enforceable, `null`
  takes the primitive reading the same fix rejected for every other position,
  and booleans enforce by an unrelated arm. One type expression, four readings
  by depth.
- **No gate scores it.** No committed `.theta` or `.thetalib` declares a literal
  or literal-union generic argument, so `tests/committed-fixture-parse-gate.test.ts`
  never meets one. The only in-tree records of the shape are the two control
  cells and one file-header comment that pin the current bytes (§Fix
  constraint 3).

## Fix

Route the generic-argument recursion through the literal sublanguage, so an
argument that is wholly what `parseLiteralArm` recognises lowers to its step-3
emission at every position, and everything else lowers exactly as it does today.

The recursion is `src/parser/params.ts:525` — `lowerTypeExpr(first, lowerCtx)`
for the arity-1 `array` arm — plus the best-effort loop at `:529–531` for every
other constructor. The ingredient is `lowerLiteralSublanguage`
(`:834–848`), exported from the same module since bug 0056's fix (0.85.0), so
no import direction has to be crossed and no second emission is spelled.

**The disposition is left to the run**, because two placements have different
blast radii and the choice is a claim about which function owns the literal
rule:

- *At the argument.* Only `:525` (and, for consistency, `:529–531`) consults
  `lowerLiteralSublanguage` before recursing. Minimal, reaches exactly the shape
  this report measures, and leaves `lowerTypeExpr`'s other recursions — the
  per-arm union recursion at `:504` — untouched, so a literal arm of a mixed
  union stays where 0043 §Non-goals holds it.
- *At the head of `lowerTypeExpr`.* The function consults the sublanguage once,
  before its union split. This makes the check unconditional at every re-entry,
  which reaches the argument AND the mixed union's literal arm in one change —
  moving a shape 0043 §Non-goals holds and 0055's cell `e3`
  (`tests/literal-union-string-enum-emission.test.ts`) and bug 0056's cells
  `d4`/`d5` pin. A run taking this route re-opens that disposition explicitly
  rather than as a side effect.

Constraints on any implementation:

1. **The argument split's nesting mode does not widen.**
   `lowerTypeExpr:522` splits the argument list with `splitTopLevel`'s default
   `"angle"` nesting (`TypeSplitNesting`, `:948–971`; `splitTopLevel`, `:1046`).
   `src/parser/theta-document.ts:5087–5092` records the constraint: "the
   argument split stays angle-only because widening it would disagree with
   `theta/parse/generic-arity-mismatch`" (`grammar.md:107`). A remedy changes
   where the argument text GOES, never what the split hands it. Two measured
   consequences of the current mode stay put: `array<{m: "x", n: "y"}>` reports
   two arguments and lowers `{}` (0043 §Non-goals `:736–742`), and
   `array<{m: "x" | "y"}>` lowers `items: {"anyOf":[{},{}]}` because
   `lowerTypeExpr` itself splits the brace group — a brace-rooted argument the
   literal check declines either way.
2. **The class that moves is enumerated before the change, not discovered
   after.** At every generic-argument depth, at all four positions:

   | Argument shape | HEAD | After |
   | --- | --- | --- |
   | a single string or number literal | `items: {}` | `items: {"const": <value>}` |
   | an all-string-literal union | `items: {"anyOf":[{},…]}` | `items: {"type":"string","enum":[…]}` |
   | any other all-literal union | `items: {"anyOf":[…]}` | `items: {"enum":[…]}` (see constraint 6) |
   | a bare `null` | `items: {"type":"null"}` | `items: {"const":null}` |
   | an all-boolean union | `items: {"anyOf":[{"const":true},{"const":false}]}` | `items: {"enum":[true,false]}` |
   | a single boolean literal | `items: {"const":true}` | unchanged (bug 0044's arm already) |

   Nothing else moves. `array<string>`, `array<Sev>`, `array<Triage>`,
   `array<"x" | integer>`, `array<{…}>`, `Result<…>` and every non-`array`
   constructor keep their bytes and their minted slugs, measured as controls
   rather than assumed. The `null` row is the settlement bug 0056 §Fix
   constraint 2 already made for every other position, applied here by the same
   structural means (no `null` special case anywhere).
3. **The control cells earlier fixes deliberately pinned move, in lock-step,
   under this report's §Fix as the authority that lifts them.** Exactly three
   in-tree artefacts pin the current bytes; each names the recursion in its own
   failure message, so each reds with a message that is still true about the
   mechanism and false about the disposition:

   | Artefact | old | new | authority it cites today |
   | --- | --- | --- | --- |
   | `tests/params-literal-sublanguage-lowering.test.ts:928–936` cell `d6`, all four `POSITIONS` | `{type:"array",items:{anyOf:[{},{}]}}` | the constraint-2 row | "bug 0056 §Non-goals — … routing it back is a change to that recursion and is not this fix" |
   | `tests/literal-union-string-enum-emission.test.ts:693–701` cell `e2`, one position | the same | the same | "bug 0055 §Non-goals — `lowerTypeExpr`'s `array` branch recurses into ITSELF" |
   | `tests/literal-union-string-enum-emission.test.ts:103` | the file header's signature-table row | the same | the same file's signature table |

   Prose pins that stop being accurate and are re-derived in the same change:
   bug 0056 §Non-goals (`:705–710`), its §Reproduction control reading
   (`:385–388`), and its `## Fix (0.85.0)` *Residuals* item 3 (`:1043–1049`);
   bug 0055 §Non-goals (`:774–777`) and its `e2` fence sentence; the in-tree
   inventory `src/runtime/query-schema-lowering.ts:60–62` and `:78–81`.
   Bug 0043 §Non-goals takes no note under the first route — the mixed union
   does not move — and needs one under the second.
4. **The minted `$defs` names move with the bytes.**
   `docs/spec_topics/schema-subset.md:73` makes `__inline_<slug>` a function of
   the lowered fragment and `:98` confirms it, so every inline object carrying a
   literal-argument field re-mints: `{m: array<"x" | "y">}` currently mints
   `__inline_bf7d6fbea15638b6` at all three hoisting positions
   (§Reproduction (f)), and a fix moves that name at all three together. The
   agreement across positions is a property to preserve, not one to establish;
   a change that moves one position's bytes without the others splits a name
   that is currently single.
5. **Validation outcomes change for thetas that load unchanged.** A param whose
   elements were unconstrained begins refusing elements no declared arm admits,
   at all three consumers of the lowered document, and an `@<T>` annotation's
   registered tool name changes with its bytes. GOV-15
   (`docs/spec_topics/governance/source-language-stability.md:5`, the
   loads-cleanly predicate at `:9`) promises identical return values for a file
   that loads cleanly under 1.0.0, so the fix's evidence enumerates the affected
   shapes — exactly constraint 2's table — rather than leaving them to be
   discovered. The census in §Affected found no committed fixture in that class.
6. **The non-string rows inherit
   [0098](./0098-nonstring-literal-union-emission-unspecified.md)'s answer.**
   `array<1 | 2>`, `array<true | false>` and `array<"x" | null>` land on
   `lowerLiteralSublanguage`'s bare-`enum` branch (`:842`), whose emission no
   step-3 line states — that is 0098's subject. This report does not decide
   those bytes: it makes the generic-argument depth a position where whatever
   0098 settles is reached. Whichever of the two lands second re-derives the
   other's rows; neither blocks the other from starting.
7. **No new diagnostic and no new permissive lowering.** The fix removes `{}`
   emissions; it adds none, and it registers no diagnostic code
   ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) — the
   registry is closed). Every argument the recogniser declines keeps its exact
   current disposition, including the brace-rooted and mixed-union shapes named
   in constraint 1 and §Non-goals.
8. **Test witness — unit, offline, no live provider.** Every fixture in
   §Reproduction settles inside one `parseThetaDocument` or
   `lowerQueryResponseSchema` call plus one real `AjvSchemaValidator` compile.
   Required beyond the probes: four-position byte AND key-order parity over
   constraint 2's whole table, including the twice-nested form
   (`array<array<…>>`) and the minted `__inline_<slug>` for
   `{m: array<"x" | "y">}`; a real-AJV accept/reject table over the lowered
   `params:` document showing the inverted rows (`["zzz"]`, `[7]`, `[null]`,
   `[{}]`, `[7,null,{}]` refused; `["x"]`, `["x","y"]`, `[]` accepted); a no-op
   control set pinned byte-for-byte over `array<string>`, `array<Sev>`,
   `array<"x" | integer>`, `array<{m: "x"}>` and `array<{m: "x", n: "y"}>`;
   and the binder-envelope shape, since `relaxParamsSchema` copies the fragment
   into the model-facing schema. Key order is asserted with `Object.keys`, not
   only `toEqual` — `type` before `enum` is contractual and slug-bearing (bug
   0056 §Fix).

## Non-goals

- **Which bytes a non-string literal union emits.** `array<1 | 2>` currently
  lowers `items: {"anyOf":[{},{}]}` and would lower whatever
  `lowerLiteralSublanguage`'s bare-`enum` branch emits. That branch's bytes are
  [0098](./0098-nonstring-literal-union-emission-unspecified.md)'s subject —
  it owns WHICH BYTES a non-string literal union carries wherever it is lowered.
  This report owns the DEPTH at which the literal check never runs at all, and
  asks only that a generic argument emit whatever the other positions emit.
- **A literal arm of a mixed union, at any depth.** `array<"x" | integer>`
  lowers `items: {"anyOf":[{},{"type":"integer"}]}` at all four positions —
  measured — because the all-arms-literal test declines a union carrying a
  non-literal arm everywhere.
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) §Non-goals
  (`:743–759`) holds that class permissive by its own holding, restated at
  0.59.0 and unmoved by 0.85.0. A fix taking this report's second route touches
  it and must say so; the first route does not.
- **A brace-rooted generic argument.** `array<{m: "x"}>` lowers `items: {}` and
  `array<{m: "x", n: "y"}>` lowers `{}`, both from the argument split rather
  than from the missing literal rule (§Reproduction (g)). 0043 §Non-goals
  (`:736–742`) holds the second and
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s inventory
  covers both. `splitTopLevel`'s angle-only default is held outside by 0043
  §Non-goals `:760–763` as well.
- **`Result<T, E>`'s permissive `{}`.** `docs/spec_topics/schema-subset.md:84`
  makes `Result` unlowerable and `theta/parse/result-in-schema-position` refuses
  it in a lowered-schema position before the pass runs, so the best-effort loop
  at `src/parser/params.ts:529–531` is a resolution walk, not an emission. A
  literal argument written there (`Result<"x" | "y", string>`) is refused at the
  `params:`, `schema`-body and alias positions and lowers `{}` at the annotation
  root — measured, and outside this report.
- **The *Array element order* rule.** `docs/spec_topics/schema-subset.md:85`
  fixes the order of `enum` values and `anyOf` variants and states no emission.
  It is satisfied by the current bytes and by the expected ones; this report
  asks for no change to it.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments is
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory question.
- **Whether `respondSchemaSlug` should hash the canonical form.** It hashes
  `JSON.stringify(lowered)` rather than the key-sorted canonical form
  `docs/spec_topics/schema-subset.md:99–107` defines, which is why emission key
  order matters at all. 0055 §Non-goals records it; unfiled and untouched here.

## Provenance

- Origin: bug
  [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)'s fix
  (0.85.0, commit `81600080`), *Residuals* item 3 of
  `.pi/tmp/fixes/0056-report.md` and of the doc's `## Fix (0.85.0)`
  (`:1043–1049`), both recording the shape as re-derived at the fixed tree,
  unfiled, and "OWNED by neither" of the two reports that mention it. This
  report files it, re-derives every value at HEAD `04c6585f`, and adds what the
  residual does not state: the single-literal row (`items: {}`, not only the
  union's `anyOf`), the `null` row's divergence from that fix's own constraint-2
  settlement, the boolean rows' unrelated enforcement, the nested depth, the
  real-AJV accept table, the enforcing `array<Sev>` contrast, the binder reach,
  the unsplit mint, and the enumeration of which pins a fix moves.
- Ownership boundary, verified: bug 0055 §Non-goals (`:774–777`) names the shape
  and attributes it to the mixed-union family; bug 0098 §Non-goals (`:551–555`)
  names `array<1 | 2>` and attributes it to bug 0043 §Non-goals; bug 0043
  §Non-goals (`:727–766`) carries five bullets and none of them is this shape —
  its `array<…>` bullet (`:736–742`) is the top-level-comma argument and its
  literal bullet (`:743–759`) is the mixed union `"a" | Triage`. Neither
  attribution lands anywhere, which is the sense in which the shape was owned by
  no report before this one.
- Spec: `docs/spec_topics/schema-subset.md:7` (`enum` / `const` as validation
  keywords), `:9` (`items`, a single subschema), `:73` (step 2, the
  `__inline_<slug>` hoist and its byte-identity dedup), `:77` (the `array<T>`
  emission), `:79` (the literal `const` emission), `:80` (the enum /
  string-literal-union emission), `:81`
  ([SUBS-1](../spec_topics/schema-subset.md#subs-1)), `:84` (`Result<T, E>` is
  not lowerable), `:85` (*Array element order*), `:98` (canonical hash step 1 —
  the slug is a function of the lowered fragment), `:99–107` (canonical form,
  digest, slug); `docs/spec_topics/grammar.md:90` (`Type`), `:95` and `:102`
  (`LiteralType` in `Type`), `:97` (`PrimitiveType`, which also names `null`),
  `:99` (`GenericType ::= "array" "<" Type ">"`), `:105` (the bare-`Type`
  position list, generic type arguments named), `:107` (§Generic-application
  constructors — the recursive `Type` inside `<…>`, and
  `theta/parse/generic-arity-mismatch`); `docs/spec_topics/type-system.md:7`
  (generic types), `:9` (literal types), `:15` (one grammar per annotation
  position); `docs/spec_topics/schemas.md:93` (no inline `enum[…]`; use a
  literal union); `docs/spec_topics/frontmatter/frontmatter-fields-a.md:23` and
  `:65` (`array<T>` at `params:`), `:57` (AJV validation at invocation), `:58`
  (the type side); `docs/spec_topics/diagnostics/code-registry-parse.md:95`
  (the `theta/parse/inline-enum` row, whose *Fix hint* names the literal union);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate). User-facing mirror:
  `docs/reference/schema-subset.md:160–164`.
- Implementation at `04c6585f` (line numbers read from
  `git show HEAD:<path>`, because a sibling orchestrator is editing
  `src/parser/params.ts` in the working tree): `src/parser/params.ts:183`
  (`parseParams`'s per-field call), `:420–426` (`PRIMITIVE_TYPES`),
  `:490–604` (`lowerTypeExpr`: `:501–516` the union split, `:504` its per-arm
  recursion, `:506–512` the primitive test, `:518–533` the generic-application
  arm, `:522` the argument split, `:523–526` the arity-1 `array` arm with the
  self-recursion at `:525`, `:529–531` the best-effort loop, `:536–538` the
  primitive atom, `:546–551` bug 0044's boolean arm, `:601–603` the catch-all),
  `:621` (`classifyLoweredUnionArm`), `:677` (`hoistInlineObjectType`),
  `:784–805` (`parseLiteralArm`), `:834–848` (`lowerLiteralSublanguage`, the
  ternary at `:840–842`, the single-atom `const` at `:846–847`), `:871–884`
  (`lowerParamsFieldType`, the literal call at `:876`, the `lowerTypeExpr`
  delegation at `:881`, the self-recursion at `:883`), `:948–971`
  (`TypeSplitNesting`), `:988` (`splitTopLevelSegments`), `:1046`
  (`splitTopLevel`); `src/parser/body-type-lowering.ts:110`
  (`lowerObjectFields`), `:154` (`lowerInlineObject`), `:319–327`
  (`lowerTypeSource`'s statement of why its field recursion re-enters itself),
  `:359` (`lowerTypeSource`), `:388` (its literal call), `:398–405` (the
  `lowerField` inner helper), `:444` (the `lowerTypeExpr` delegation), `:545`
  (`buildBodyTypeSchemas`); `src/runtime/query-schema-lowering.ts:25–81` (the
  permissive-`{}` inventory, `:60–62` the generic argument, `:78–81` the
  literal atom), `:113` (`lowerQueryResponseSchema`), `:153` and `:160` (its
  two roots); `src/parser/theta-document.ts:5087–5092` (the angle-only argument
  split and its `TypeSplitNesting` governance);
  `src/extension/production-theta-producer.ts:619` (`binderPromptParamField`),
  `:726` (the envelope build), `:1189` (the post-default-merge compile),
  `:1984` and `:1991` (the subagent params-intake validator), `:2578`
  (`respondToolWireSchema` feeding the registration), `:2633`
  (`respondSchemaSlug`), `:5045` (`renderTypedAwareQueryText`);
  `src/binder/binder-envelope.ts:86` (`buildBinderEnvelopeSchema`), `:89` and
  `:137` (`relaxParamsSchema`); `src/binder/binder-system-prompt.ts:168`
  (`renderBinderParamLine`).
- Test evidence at `04c6585f`:
  `tests/params-literal-sublanguage-lowering.test.ts:276` (the four `POSITIONS`),
  `:928–936` (cell `d6`, the four-position control this report contradicts),
  `:912–927` (cells `d4` / `d5`, the mixed-union controls it does not);
  `tests/literal-union-string-enum-emission.test.ts:103` (the header's
  signature-table row), `:693–701` (cell `e2`), `:703–711` (cell `e3`, the
  mixed union); `tests/union-generic-arm-lowering.test.ts` (bug 0043's
  four-position frame, whose `readAt` shape this report's probe follows);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which declares a literal generic argument).
- Fixtures surveyed: every `.theta` and `.thetalib` in the tree. The two
  `array<…>` sites are `docs/examples/summarise-doc.theta:10`
  (`themes: array<string>`) and `docs/examples/fan-out-reviews.theta:16` (a
  comment); no committed file declares a literal or literal-union generic
  argument.
- Reproduction: scratch vitest at `04c6585f` — sixteen type sources at all four
  positions with per-row parity asserted; twelve payloads through the production
  `AjvSchemaValidator` over the `array<"x" | "y">` document and five over the
  `array<Sev>` document; the `array<"x">`, `array<string>` and
  `array<array<…>>` documents; the binder field record, rendered `Parameters:`
  line and envelope for three sources; the `{m: array<"x" | "y">}` mint at all
  four positions (a `$ref` at the three hoisting ones); and six direct
  `lowerTypeExpr` calls isolating the brace-group split. The ten load-bearing
  sources were re-run against a working tree byte-identical to HEAD, with
  identical output; then deleted per scratch policy and the deletion swept.

## Fix (0.123.0)

Route **(i) — at the argument**, of §Fix's two candidates. The rejected second
candidate (a consult at the head of `lowerTypeExpr`) reaches the mixed union's
literal arm in the same change, re-opening a disposition bug 0043 §Non-goals,
bug 0055's cell `e3` and bug 0056's cells `d4`/`d5` pin — and bug 0184's own
`## Fix (0.115.0)` had already rejected it for that reason. Nothing in the
measurement forced it.

- **What shipped:**
  - `src/parser/params.ts` — `lowerTypeExpr`'s generic-application arm routes
    BOTH the arity-1 `array` argument (`:702`) and the best-effort loop's
    arguments (`:707`) through one new module-private helper,
    `lowerGenericArgument` (`:899`) = `lowerLiteralSublanguage(arg) ??
    lowerTypeExpr(arg, lowerCtx)`. Four executable lines; the whole rest of the
    diff is comments and tests. The per-arm union recursion (`:681`, bug 0184's
    mixed-gated `lowerLiteralUnionArm`) is byte-untouched, so a literal arm of a
    MIXED union keeps its landed disposition, and §Fix constraint 1's angle-only
    argument split is unmoved (`:699`, still the two-argument
    `splitTopLevel(…, ",")`). No `null` special case exists anywhere: the `null`
    row moves to `{"const":null}` purely because the consult precedes the
    `PRIMITIVE_TYPES` atom arm — the structural means bug 0056 §Fix constraint 2
    used at the other three positions.
  - `src/runtime/query-schema-lowering.ts` — the permissive-`{}` inventory
    (`:25–110`) re-derived. The trailing-catch-all item's generic-argument
    sentence now scopes to an argument the literal sublanguage DECLINES (the
    brace-rooted origin `array<{a: string}>` → `items: {}` SURVIVES and is still
    stated), and the "Separately, an ALL-literal union reached through a GENERIC
    ARGUMENT still lowers `{}` per arm here" paragraph is the inventory member
    this fix removes. The "exactly four origins" arithmetic was checked and is
    unchanged — the fix removes an EXAMPLE of the catch-all origin, not the
    origin.
  - `src/parser/params.ts` doc comments re-derived where the change falsified
    them: `isMixedLiteralArmSet` (the gate's rationale survives — it prevents
    shadowing the whole-source emission with a per-arm `anyOf`; the consequence
    sentence naming this recursion as permanently permissive does not),
    `lowerLiteralSublanguage` and `parseLiteralArm` (their two-caller sentences
    now under-counted; four call sites share the recogniser), and the new
    helper's own comment states the rejected placement, why one call covers the
    discarded-return best-effort loop, and why `null` needs no special case.
    `src/parser/body-type-lowering.ts` was inspected and needed no edit:
    `lowerTypeSource`'s field-recursion statement is about a field's OWN union
    type, not a generic argument, and is still true.
  - **§Fix constraint 2's class table, as measured at HEAD `3ef7e086` before AND
    after — byte-identical at all four `Type` positions, zero diagnostics at
    every one, both directions.** Declarations `schema Sev = "x" | "y"`,
    `schema Triage { urgent: boolean }`:

    ```
    MOVED                     BEFORE                                              AFTER
    array<"x" | "y">          {"type":"array","items":{"anyOf":[{},{}]}}           {"type":"array","items":{"type":"string","enum":["x","y"]}}
    array<"x">                {"type":"array","items":{}}                          {"type":"array","items":{"const":"x"}}
    array<7>                  {"type":"array","items":{}}                          {"type":"array","items":{"const":7}}
    array<"a" | "b" | "c">    {"type":"array","items":{"anyOf":[{},{},{}]}}        {"type":"array","items":{"type":"string","enum":["a","b","c"]}}
    array<1 | 2>              {"type":"array","items":{"anyOf":[{},{}]}}           {"type":"array","items":{"enum":[1,2]}}
    array<1.5 | -2>           {"type":"array","items":{"anyOf":[{},{}]}}           {"type":"array","items":{"enum":[1.5,-2]}}
    array<"x" | 1>            {"type":"array","items":{"anyOf":[{},{}]}}           {"type":"array","items":{"enum":["x",1]}}
    array<"x" | null>         {"type":"array","items":{"anyOf":[{},{"type":"null"}]}}                 {"type":"array","items":{"enum":["x",null]}}
    array<null>               {"type":"array","items":{"type":"null"}}             {"type":"array","items":{"const":null}}
    array<true | false>       {"type":"array","items":{"anyOf":[{"const":true},{"const":false}]}}     {"type":"array","items":{"enum":[true,false]}}
    array<array<"x" | "y">>   nested `anyOf`                                       {"type":"array","items":{"type":"array","items":{"type":"string","enum":["x","y"]}}}
    array<array<"x">>         {"type":"array","items":{"type":"array","items":{}}}                    {"type":"array","items":{"type":"array","items":{"const":"x"}}}

    UNMOVED (controls, measured not assumed)
    array<true>               {"type":"array","items":{"const":true}}              bug 0044's arm; the ROUTE moved, the bytes did not
    array<false>              {"type":"array","items":{"const":false}}             the same
    array<string>             {"type":"array","items":{"type":"string"}}
    array<Sev>                {"type":"array","items":{"$ref":"#/$defs/Sev"}}
    array<Triage>             {"type":"array","items":{"$ref":"#/$defs/Triage"}}
    array<"x" | integer>      {"type":"array","items":{"anyOf":[{"const":"x"},{"type":"integer"}]}}   bug 0184's landed mixed-gating
    array<{m: "x"}>           {"type":"array","items":{}}
    array<{m: "x" | "y"}>     {"type":"array","items":{"anyOf":[{},{}]}}
    array<{m: "x", n: "y"}>   {}
    map<"x" | "y">            {}
    Result<"x" | "y", string> refused at params/field/alias, `{}` at the @<T> root
    ```

    The `array<"x" | integer>` row is why the report's own §Reproduction (g) is
    STALE: it was measured at 0.85.0 and quotes the pre-0184
    `{"anyOf":[{},{"type":"integer"}]}`. Bug 0184 §Fix (0.115.0) moved the
    literal ARM to `:79`'s `const`, and this fix preserves that value exactly —
    route (i) touches the per-arm recursion not at all.
  - **The emission question §Fix constraint 6 flagged is answered by
    propagation, not by choice.** Every moved row's `items` is BYTE-IDENTICAL to
    what the SAME argument text lowers to at depth 0, and the depth-0 value is
    unchanged by this fix. `1 | 2` has emitted the bare `{"enum":[1,2]}` at all
    four positions since 0.85.0; this fix makes the generic-argument depth a
    position where that already-shipped emission is reached. **No emission in
    this change is a value no landed branch produced before** — measured, and
    asserted cell by cell as a comparison of two OBSERVATIONS (witness group
    `(dp)`, 9 cells), never as a restated literal. `array<1.5 | -2>` is
    deliberately absent from that group and the omission is recorded there as
    measured: bare `1.5 | -2` at depth 0 draws `theta/parse/empty-schema-body`
    at the `schema`-body field position and `theta/parse/malformed-alias-rhs` at
    the alias position (bug 0056 §Fix residual 4's still-open `-` parse-layer
    gap), so no four-position depth-0 twin exists for it. Inside the angle
    brackets it loads clean at all four.
  - **§Fix constraint 4 — the minted names moved at all three hoisting positions
    together, and did not split.** `{m: array<"x" | "y">}`
    `__inline_bf7d6fbea15638b6` → `__inline_9dd1f359f0ef05f8`;
    `{m: array<"x">}` `__inline_4f092d3f28fd90b7` → `__inline_81666e1f0dfc6a75`;
    `{m: array<string>}` `__inline_f6742b8db79cc0a2` UNCHANGED, the control. The
    `@<T>` registered-tool names moved with their bytes: `@<array<"x" | "y">>`
    `375e24c5c87417d8` → `388269b1b7511ff9`; `@<array<"x">>`
    `4718677af1cfaad3`, `@<array<"x" | null>>` `dfff68c6e0ed2d78`,
    `@<array<null>>` `65404ea87ccac5b0` and `@<array<true | false>>`
    `1a105bdd080709e5` all moved; `@<array<1 | 2>>` COLLIDED with
    `@<array<"x" | "y">>` on `375e24c5c87417d8` at HEAD because both lowered the
    same permissive bytes, and the witness asserts they must now DIFFER;
    `@<array<Sev>>` `fb500505b0a56925` UNCHANGED, the control. Every slug is
    derived in the witness from a hand-written canonical / `JSON.stringify` byte
    string hashed with `node:crypto` — `schemaSlug` is not imported as an oracle
    — and a group-(0) honesty check proves each hand-written string parses back
    to the fragment it claims to serialise, carries no insignificant whitespace
    and is key-sorted by code point.
  - **§Fix constraint 5 — the GOV-15 addition direction, enumerated.** Exactly
    constraint 2's moved rows above newly refuse mistyped element values at all
    three AJV consumers of the lowered `params:` document (the binder envelope,
    the post-default-merge compile, the subagent child's params intake), and the
    `@<T>` position's registered tool name changes with its bytes. Census:
    **zero committed `.theta`/`.thetalib` fixtures declare a literal or
    literal-union generic argument** — re-verified at HEAD by sweeping every
    tracked fixture (the only `array<…>` sites remain
    `docs/examples/summarise-doc.theta:10`'s `array<string>` and a comment in
    `docs/examples/fan-out-reviews.theta:16`), and discharged corpus-wide by
    `tests/committed-fixture-parse-gate.test.ts` (green), not by a scratch probe.
  - **§Fix constraint 7 — no new diagnostic, no registry edit, no new permissive
    `{}`.** Verified by inspection over the whole diff: no registry file is
    touched and no diagnostic code is added
    ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) — the
    registry is closed). The helper adds no `{}` return; an argument the
    recogniser declines takes exactly its old route.
- **Gates** (every one re-run independently of the nested workers):
  - Witness RED before / GREEN after, by neutralising exactly the two call sites
    (`:702`, `:707`) back to `lowerTypeExpr`: `Tests 56 failed | 260 passed
    (316)`; restored by edit (blob `e909a2557629f8a42c9194c0c56d09cdef591a66`,
    matching the pre-neutralisation hash): `Tests 316 passed (316)`.
  - Full default suite: `Test Files 325 passed (325)` / `Tests 5947 passed
    (5947)` — from 324 files / 5876 tests at HEAD `3ef7e086`; the +1 file and
    +71 cells are this report's witness.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean, no output.
  - `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`)
    clean, no output.
  - LIVE H8a additive cell 60, run for real, BOTH directions: green with the fix
    (`✓ … 6337ms`), RED under the same two-line neutralisation with the exact
    pre-fix signature (`outbound: ["Reply with exactly: GOOD=ACCEPTED
    BAD=ACCEPTED"]`), green again after restoration (`✓ … 13616ms`).
  - LIVE H9a, BOTH files, run for real: `Tests 11 passed (11)` (10 + 1). Every
    "no-error exit and permitted codes only" cell passed, so the `@<T>` slug
    movement surfaced NO new stderr and needed NO permitted-code append —
    established by the real run, not by reasoning.
  - Remaining H8a files (`typed-query-wire-shapes`,
    `off-session-overflow-classification`, `provider-error-revalidation-gate`,
    `double-session-start-live`): `Tests 8 passed (8)`. Hardening probes: 8/8
    files green — `session-convdrive` red on the first pass with the
    sentinel-refusal stochastic class AGENTS.md names (the model declined to echo
    an embedded sentinel as suspected prompt injection); no `docs/bugs/` report
    matches that signature and its surface is prompt/subagent conversation
    drive, unrelated to `array<literal>` param lowering; green on the single
    authorized re-run.
- **Review:** 2 rounds, both CLEAN.
  - Round 1 (`bug-fix-reviewer`, deep): CLEAN, quoting the executable hunk, the
    constraint-1 split line, `isUnspellableTextRefusable`, a group-(a) cell, a
    group-(d) control, a group-(e) mint assertion and bug 0059's silence
    assertion. Two non-blockers: R1 (pre-existing citation drift — Residuals 1)
    and R2 (constraint 2's "single string OR NUMBER literal" row was witnessed at
    the string half only — Residuals 4). Its own analysis of the subtlest
    question in the change — whether skipping `lowerTypeExpr` for a wholly-literal
    argument in the BEST-EFFORT LOOP drops anything observable from `lowerCtx`'s
    sinks — concluded inert, with the mechanism: every `unspellable` entry that
    stops being fed is exactly one `parseLiteralArm` accepts, and all four
    readers of that sink filter through `isUnspellableTextRefusable`, whose first
    conjunct declines precisely those texts. `parseLiteralArm` never accepts an
    identifier, so no name-resolution walk is skipped and `unresolved` / `defs` /
    `reservedKeywords` are unaffected. The loop's return is discarded, so the
    emission is unchanged — pinned by the `map<"x" | "y">` and `Result<…>`
    controls.
  - Fixer round 1 (`bug-fix-fixer-light`) closed R2: one group-(a) row `a12`
    (`array<7>` → `items: {"const":7}`) and one depth-parity row `dp9`, both
    APPENDED rather than inserted — renumbering a cell id another document may
    cite is forbidden. 68 → 71 cells.
  - Round 2 (`bug-fix-reviewer-fast`, confirmation, dispatched because the fixer
    round touched executable test-data lines): CLEAN, no escalation.
  - A PRE-REVIEW CORRECTION ROUND ran before round 1. It is not a review round
    and round numbering is unaffected; see Residuals 2.
- **Verification** (`bug-fix-verifier`): SOLID, all four obligations discharged
  with quoted evidence.
  1. The witness genuinely witnesses the bug — neutralise / RED / restore /
     GREEN, with pre- and post-neutralisation blob hashes quoted and matching.
     Under neutralisation bug 0059's tripwire cells red on the BYTE pin only:
     the `.toEqual([])` silence assertion precedes it in each cell and passed.
  2. Full default suite green, 325 files / 5947 tests.
  3. Live end-to-end coverage of the fixed path exists, is NEW (H8a cell 60),
     and was run for real in both directions; H9a both files 11/11 for real; the
     rest of the live suite and the hardening probes run and accounted for.
  4. Typecheck and lint clean.
- **Residuals** (each with its evidence; the parent files any that warrant a
  report — this fix creates none):
  1. **This fix's +46-line shift in `src/parser/params.ts` drifted three
     PRE-EXISTING citations in a file it otherwise edits** —
     `tests/union-arm-literal-const-lowering.test.ts:213`, `:765` and `:1459`
     (`params.ts:1274` ×2 and `:1188`, now `:1317` and `:1230`) — beside three
     already-drifted ones in `tests/params-scalar-nontype-text-refusal.test.ts`
     (`:693–:702` at line 15, `:1159` at line 748, `:421–:510` at line 751,
     drifted by EARLIER fixes). Deliberately NOT swept: this is bug 0134's
     recorded class, and bug 0184 §Fix *Residuals* item 2 fixes the policy —
     only citations THIS run wrote were repaired, and all of them were (verified:
     every `params.ts:NNN` written in this diff resolves to the symbol it names
     in the post-fix file).
  2. **One orchestrator self-authorization, citation/comment-only.** A PRE-REVIEW
     CORRECTION ROUND repaired 16 `params.ts:NNN` citations this run's own
     writing had made stale via the +46-line shift — 13 in the untracked witness
     (every citation in it was written this run, so no pre-existing citation was
     at risk) and 3 in `tests/params-scalar-nontype-text-refusal.test.ts`, all
     three on lines this run ADDED, verified by `git diff -U0`. The question that
     would have been asked: *may I repair citations my own change made stale,
     rather than ship a witness whose citations for one symbol mix repaired and
     stale numbering?* Evidence: `git status --short` proves the witness is
     untracked; the correction-round mandate names exactly this hazard ("rather
     than letting stale citations propagate into review and into the shipped
     record"); each target line was read out of the post-fix source and quoted;
     and the fixer's independent re-derivation agreed line for line on all 13
     symbol positions. Bound: citation digits inside comments and
     failure-message-string interiors only — zero executable lines, zero
     assertion predicates, zero expected values, zero fixture texts, zero `it(`
     titles — and both files' line counts UNCHANGED (1387, 1428). STOP valve: any
     red, or any repair reaching an executable line, stops the round; neither
     occurred and the gates re-ran green after.
  3. **§Fix constraint 3's artefact census was STALE, and a SIXTH artefact of the
     identical class moved.** Constraint 3 states "exactly three in-tree
     artefacts pin the current bytes", measured at 0.85.0. The blast-radius
     pre-measurement at HEAD (prototype, full suite, every red enumerated and
     bucketed) found SIX: `d6` (bug 0056), `e2` plus the `:103` header
     signature-table row (bug 0055), `d7`/`d8` (bug 0184's protected 81-cell
     witness, which the doc did not know about), and FOUR cells of bug 0059's
     protected witness — `d1`, `d2`, `d3` and `d3-body` of
     `tests/params-scalar-nontype-text-refusal.test.ts`, named in that file as
     *the 0164 tripwire*. `d3` and `d3-body` are slug assertions carrying a
     re-minted name. `d1` and `d2` are byte pins on this report's exact subject
     texts (`array<"x" | "y">`, `array<1 | 2>`): their reds are MECHANICALLY
     FORCED by the settled constraint-2 table — no compliant implementation
     avoids them — and the RULE that governs them (constraint 3: the pins move in
     lock-step under this report's §Fix as the authority that lifts them, subject
     preserved) was already settled. Only the MEMBERSHIP LIST was stale, and
     re-deriving it is the measurement §Evidence-staleness required. All four
     cells keep their SUBJECT: bug 0059 §Fix constraint 3's SILENCE claim, the
     `.toEqual([])` assertion, is untouched and green — verified to still pass
     UNDER neutralisation, where those cells red on the byte pin alone. The file
     stays 94 cells (`it(` count 25 before and after; no row added or removed —
     and the "93" in the dispatch was itself a stale figure). The file's own
     precedent for this treatment is its `d7`/`d8` rows, re-derived in place under
     bug 0184 §Fix with their silence preserved. **Flagged for the parent as the
     one item that widens the operator's enumerated authorized set.**
  4. **A single-NUMBER generic argument had no witness anywhere before this run.**
     Constraint 2's first row says "a single string **or number** literal"; review
     round 1 found the number half unpinned in the whole of `tests/`. Closed
     in-run by cells `a12` / `dp9`. Recorded because the gap existed in §Fix
     constraint 8's own witness list too, which names the twice-nested form and
     the mint but not the number atom.
  5. **`array<{m: "x" | "y"}>` still lowers `items: {"anyOf":[{},{}]}`** and
     `array<{m: "x", n: "y"}>` still lowers `{}` — both from the angle-only
     argument split shredding the brace group, not from the missing literal rule,
     and both held outside by §Non-goals and bug 0043 §Non-goals
     `:736–742`/`:760–763`. Pinned as controls (`d6`, `d7` of the new witness;
     `d4`, `d9`, `d13` of bug 0059's). Unmoved, by design.
- **Discharge notes appended** (append-only, nothing deleted):
  [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
  §Non-goals' generic-argument bullet, its §Reproduction control reading, and
  its `## Fix (0.85.0)` *Residuals* item 3 — this report's filing origin,
  discharged here;
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md)
  §Non-goals' `array<"x" | "y">` sentence and its `e2` fence sentence;
  [0184](./0184-union-arm-literal-lowers-empty-schema.md)'s `## Fix (0.115.0)`
  *Pinned dispositions* — its `d7`/`d8` preservation statement anticipated this
  fix by name ("0164's fix is what lifts that") and is marked lifted here; and a
  COORDINATION note on
  [0098](./0098-nonstring-literal-union-emission-unspecified.md) §Non-goals
  stating the new reach, its status untouched.
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) §Non-goals takes NO
  note under route (i) — the mixed union did not move, which is exactly what §Fix
  constraint 3 says of the first route.
- **Pinned dispositions / non-goals:** the mixed union's literal arm stays where
  bug 0184 §Fix put it and where bug 0043 §Non-goals holds the class (route (i)
  touches the per-arm recursion not at all). `splitTopLevel`'s angle-only default
  argument split is unmoved (§Fix constraint 1), so the brace-rooted and
  shredded-argument shapes keep their permissive fragments — and bug 0204's
  subject, a falsified clause of `theta-document.ts`'s governance sentence for
  that same rule, was neither touched nor chased.
  [0098](./0098-nonstring-literal-union-emission-unspecified.md) stays OPEN with
  its subject intact: this fix decides none of the bare-`enum` branch's bytes, it
  only makes the generic-argument depth a position where that branch is reached,
  so 0098's subject INHERITS the new depth and whichever future work moves those
  bytes re-derives this report's rows per §Fix constraint 6.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) keeps the
  remaining permissive-`{}` inventory, one member lighter and its in-tree comment
  re-derived. Whether `respondSchemaSlug` should hash the canonical form rather
  than `JSON.stringify` is still unfiled and untouched (§Non-goals).
