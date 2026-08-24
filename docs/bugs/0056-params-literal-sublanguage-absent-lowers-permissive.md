# Bug 0056 — The `params:` position has no literal sublanguage at any depth: `p: '"x" | "y"'` lowers to `{"anyOf":[{},{}]}` and `p: '"x"'` to `{}`, where the same type text at the `schema`-body, alias-RHS and `@<T>` positions lowers to `{"enum":["x","y"]}` / `{"const":"x"}` — the declared type constrains nothing, AJV accepts every JSON value, and the binder is still told the type the schema drops

- **Status:** fixed (0.85.0).
- **Kind:** defect — the implementation disagrees with the specification at one
  of the four type-expression lowering positions. schema-subset.md §Lowering
  Algorithm step 3 gives a literal its emission (`:79`,
  `{ "const": <value> }`) and a string-literal union its own (`:80`,
  `{ "type": "string", "enum": [...wire values...] }`). grammar.md puts
  `LiteralType` in `Type` (`:95`, `:102`) and names `params:` field types among
  the bare-`Type` positions (`:105`). type-system.md lists literal types among
  the type forms (`:9`) and applies one type grammar to every annotation
  position, `params:` named (`:15`). No spec text defines a `{}` emission for
  any type form. The grammar admits the input and the parser accepts it: the
  theta loads with zero diagnostics and the field is recorded carrying the
  author's type text verbatim. Only the lowering drops it, and it drops it at
  one position out of four.
- **Related:**
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — the filing origin, and the report that made the asymmetry a route
    decision. Its §Fix (0.49.0) §Residuals item (viii) (`:282–285`) states the
    observable and the reason: "The `params:` position has no literal
    sublanguage at any depth (`p: "x" | "y"` lowers `anyOf: [{}, {}]`) where
    the `lowerTypeSource` positions do; the shared arm takes each caller's own
    recursion precisely so that asymmetry does not move the frozen `params:`
    bytes." Its §Fix constraints carry both halves: "The literal sublanguage
    must not regress" (`:570–575`) required the *shared* inline-object arm to
    recurse each field's type back through `lowerTypeSource`, and "The
    `params:` position's bytes do not move" (`:607–610`) required
    `lowerParamsFieldType` to keep recursing into itself. Both held; the price
    is this report's subject.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — the fix that
    built `lowerParamsFieldType` (0.44.0) and the 37-test lock over this
    position (`tests/params-inline-object-lowering.test.ts`, its §Fix `:125`).
    That fix gave the `params:` position its inline-object arm; it did not give
    it a literal arm, and its lock declares no all-literal `params:` type.
  - [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) —
    **fix-ordering dependency.** 0055 owns the bytes the three contrast
    positions emit for a literal union (a bare `{"enum":[…]}` where
    schema-subset.md `:80` spells `{"type":"string","enum":[…]}`). This report
    asks the `params:` position to emit the same bytes, so the two fixes must
    not re-pin the same position twice: land 0055 first, or land both in one
    change. See §Fix *Ordering*.
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — its §Non-goals
    third bullet holds the adjacent shape, a literal arm of a **mixed** union
    (`"x" | integer`), which is symmetric across the four positions and is not
    this report's subject. That bullet's parenthetical is stale at HEAD in two
    ways, corrected here: it cites `src/parser/body-type-lowering.ts:139–151`,
    which is `:358–369` after the 0039 fix; and it says literal recognition
    lives in `lowerTypeSource`'s "top-level check", where since 0.49.0 the
    check is re-entered at every depth through that function's own `lowerField`
    recursion (`:371–375`).
  - [0041](./0041-params-block-mapping-rhs-silent-permissive.md) — the
    `params:` sibling with the same three observables (permissive `{}`, zero
    diagnostics, the author's text still recorded and rendered into the binder's
    `Parameters:` block) reached from the YAML intake rather than from the
    lowering. Its frame is `extractParsedParams`; this one's is
    `lowerParamsFieldType`, one layer down and after the text survives intact.
    **Fixed in 0.51.0**, and the route framing above still holds: that fix is a
    YAML **node-shape** test — a `params:` value node that is neither a scalar
    nor a flow mapping (or absent) is `theta/load/params-type-not-expression`
    (`paramValueCanCarryType`, `src/parser/frontmatter.ts:379–381`, judged in
    `extractParsedParams` at `:713`) — and it reads no text, so every scalar is
    admitted whatever it carries and this report's whole input class is
    untouched. It does add a **third pinned lock** beside the two named in §Fix
    constraint 1: `tests/params-block-mapping-rhs-refusal.test.ts` group (e)
    pins, at pre-0056 bytes, exactly the rows this report inverts — `p: 42` and
    `p: '"hello"'` lowering `{}`, and `p: true` refused as an unresolved named
    type — naming this report as the authority licensed to move them; move all
    three in lock-step. That file's one-line scalar rows and its multi-line
    block-scalar row stay green under this report's fix (the literal recogniser
    declines their text). Citation drift from the 0.51.0 change: `type:
    typeSource` (cited here as `frontmatter.ts:686`) is now `:730`, and FM-5
    (cited as `:737–750`) now begins at `:782`.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — owns
    the permissive-`{}` inventory (`src/runtime/query-schema-lowering.ts:26–63`)
    and the question of whether `{}` should ever be a lowering. This report adds
    a reachable trigger of the catch-all arm at one position; it does not reopen
    that question.
- **Affected** (every citation verified at HEAD `52e257bc`, 0.49.0):
  - `src/parser/params.ts:606–615` — **the frame.** `lowerParamsFieldType`, the
    only entry `parseParams` uses for a `params:` field's type. Two arms and no
    third: a source that is not brace-rooted goes straight to `lowerTypeExpr`
    (`:611–612`), and a brace-rooted one hoists through `hoistInlineObjectType`
    passing **this function itself** as the per-field recursion (`:614`). No
    literal check on either path, so no nesting depth reaches one.
  - `src/parser/params.ts:384–439` — `lowerTypeExpr`, which has no literal arm.
    `:436–438` is the trailing catch-all and states the delegation in its own
    comment: "A literal-type atom (string/number literal) or any other form:
    lower permissively; literal lowering is owned by the schema-subset leaves."
    `:404–420` is the union split: each arm re-enters this same function, so
    each literal arm returns `{}` from `:438`, the primitive test at `:410–414`
    reads `{}` as non-primitive, and `lowerUnion` (`:419`) combines the arms
    into `anyOf`. The header comment repeats the boundary at `:373–375`
    ("Literal-type and inline-object lowering beyond this subset is owned by the
    schema-subset lowering leaves, not this seam").
  - `src/parser/params.ts:489–495` — `hoistInlineObjectType`'s `lowerFieldType`
    contract, the in-tree record of this exact asymmetry: "`lowerParamsFieldType`
    passes itself… `lowerTypeSource` passes an inner helper that returns through
    ITS OWN literal-sublanguage check first — recursing through `lowerTypeExpr`
    instead would lower a nested `"x" | "y"` to `anyOf: [{}, {}]` rather than
    the SUBS-1 enum form". The sentence describes what the `params:` position
    does today, stated as the reason the other callers do something else.
  - `src/parser/params.ts:156` — `parseParams`'s per-field call; `:164–172` —
    the diagnostic loop, which reports only names appended to
    `lowerCtx.unresolved`. A literal appends nothing, so the permissive
    lowering has no diagnostic channel at this site.
  - `src/parser/body-type-lowering.ts:335–414` — `lowerTypeSource`, the contrast
    lowerer. `:358–369` is the literal sublanguage: split on `|`; when every arm
    parses as a literal, return `{ enum: [...] }`; a single literal returns
    `{ const: ... }`. `:371–375` is `lowerField`, the inner recursion that
    re-enters this function for a nested field's type, which is what carries the
    sublanguage to depth. `:413` delegates everything else to `lowerTypeExpr`.
  - `src/parser/body-type-lowering.ts:693–714` — `parseLiteralArm`: a quoted
    string (either quote form, per lexical.md `:26`), `true`, `false`, `null`,
    and `/^-?\d+(\.\d+)?$/`. It is module-private, and `params.ts` cannot call
    it: `body-type-lowering.ts:15–22` imports from `params.ts`, and bug 0039
    §Fix (`:550–552`) forbids the reverse import.
  - `src/parser/body-type-lowering.ts:119` — `lowerObjectFields`'s per-field
    call, the `schema` body field position, reached also from `lowerInlineObject`
    (`:170`); `:566` — `buildBodyTypeSchemas` pass 2's alias-RHS call;
    `src/runtime/query-schema-lowering.ts:148` — the `@<T>` annotation's inline
    route (`:141` is its brace-rooted route through `lowerInlineObject`). These
    are the three contrast positions.
  - `src/parser/body-type-lowering.ts:191–195` — the in-tree statement of the
    freeze this report asks to lift: "`lowerParamsFieldType`'s own brace check
    (params.ts) stays the naive form on purpose: bug 0039 §Fix freezes the
    `params:` position's lowered bytes byte-for-byte". The same claim is carried
    at `src/parser/params.ts:600–604`.
  - `src/parser/frontmatter.ts:686` — `type: typeSource`, which records the
    author's type text on `BypassParamsField`; `:737–750` — FM-5, which refuses
    a YAML-malformed frontmatter and is what the unquoted spelling of a literal
    type reaches (see §Reproduction *Spelling*).
  - `src/extension/production-theta-producer.ts:709–712` — the
    `buildBinderEnvelopeSchema` call, which embeds the lowered params document
    in the binder envelope; `:1173` — the post-default-merge AJV compile;
    `:1968–1976` — the subagent child's params-intake validator. These are the
    three consumers of the lowered document. `:603–612` —
    `binderPromptParamField`, which carries `field.type` (the author's text)
    into the binder system prompt.
  - `src/binder/binder-envelope.ts:89`, `:137–157` — `relaxParamsSchema`, which
    copies the params schema's `properties` verbatim into the envelope's
    `ok.args` arm, so the fragment reaches the binder model's forced-tool input
    schema unchanged.
  - `src/binder/binder-system-prompt.ts:151` (`renderBinderParamLine`),
    `:200–207` (the `Parameters:` block) — the surface that renders the declared
    type the lowering dropped.
  - `tests/params-inline-object-lowering.test.ts` — bug 0035's 37-test lock over
    this position. Every fixture is an inline object, a named type, a primitive
    or `array<…>`; none is an all-literal type.
  - `tests/inline-object-nested-lowering.test.ts:990–1007` (a10) and `:344–358`
    / `:846` (a5, fixture G2) — bug 0039's pins that the contrast positions
    lower `"x" | "y"` to `{"enum":["x","y"]}` at depth 0 and at depth 1. No cell
    in that file drives an all-literal type through the `params:` position.
- **Observed at:** `0.49.0` (`52e257bc`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument`,
  `lowerQueryResponseSchema`, `renderBinderParamLine` and a real `Ajv2020`
  compile; written, run, deleted.

## Summary

Theta has one type grammar and four positions that lower a type expression to
JSON Schema. Three of them — a `schema` body field type, a `schema X = …`
alias/union right-hand side, and the `@<T>` query annotation — enter
`lowerTypeSource`, whose first act is the literal sublanguage: an all-literal
union lowers to an `enum` fragment, a single literal to a `const` fragment. The
fourth, the `params:` right-hand side, enters `lowerParamsFieldType`, which
routes a non-brace-rooted source directly to `lowerTypeExpr`. `lowerTypeExpr`
has no literal arm. A literal reaches its trailing catch-all and returns the
permissive `{}`.

The two consequences are one fragment apart:

- **A single literal lowers `{}`.** `p: '"x"'` declares a one-value type and
  produces the accept-anything fragment.
- **An all-literal union lowers `{"anyOf":[{},{}]}`.** Each arm lowers `{}` on
  its own, the arm classifier reads each as non-primitive, and `lowerUnion`
  combines them per SUBS-1 into an `anyOf` whose every variant asserts nothing.
  An empty schema matches every JSON value, so the union admits what neither arm
  admits.

Neither emission raises a diagnostic at any severity. The field is still
recorded with the author's type text, so the binder system prompt tells the
model `p ("x" | "y") required` for a schema that admits `7`, `null` and
`{"nope":1}`.

The gap does not close at depth. `hoistInlineObjectType` takes the caller's own
per-field recursion, and `lowerParamsFieldType` passes itself, so an inline
object at `params:` lowers its fields through the same literal-free path:
`p: '{m: "x" | "y"}'` hoists a fragment whose `m` is `{"anyOf":[{},{}]}`, while
the identical text in a `schema` body hoists one whose `m` is
`{"enum":["x","y"]}`. The two fragments differ, so the two positions mint two
different `__inline_<slug>` names for byte-identical source text.

Naming the union makes it enforce. `schema Sev = "x" | "y"` with `p: Sev`
lowers `{"$ref":"#/$defs/Sev"}` against `$defs.Sev = {"enum":["x","y"]}`, and
AJV then refuses `{"p":"zzz"}`. The declaration the author writes inline and the
declaration they write by name differ in what they validate, with nothing
surfacing the difference.

## Reproduction

Offline, at `52e257bc`. Scratch vitest: `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema`, `renderBinderParamLine`, and `Ajv2020` from the
installed `ajv`. Body fixture `schema Triage { urgent: boolean }` + `let x = 1`;
frontmatter `mode: prompt` plus the single `params:` entry shown.

The `params:` position is read as `properties.p` of the lowered params
document. The `schema`-body and alias-RHS positions are read as `$defs.S` /
`$defs.M` of a params document whose one field is `a: S` / `a: M`. The `@<T>`
position is the whole return of `lowerQueryResponseSchema`.

### Spelling

A theta-side literal carries theta-side quotes, so the `params:` entry wraps the
whole type expression in a YAML scalar: `p: '"x" | "y"'`. The unquoted spelling
is not valid YAML — `p: "x" | "y"` and `p: {m: "x" | "y"}` both fail the YAML
parse, and FM-5 (`src/parser/frontmatter.ts:737–750`) discards the recovered
document, so the observable is a single `theta/load/missing-mode` and the theta
is refused. That frame is 0035's and 0028 §Residuals (iv)'s, not this one's;
every row below uses the quoted spelling, whose text reaches the lowering
unchanged.

### One type expression, four positions

```
@@ params   p: '"x" | "y"'                 diags [] props.p {"anyOf":[{},{}]}
@@ field    schema S { a: "x" | "y" }      diags [] $defs.S.properties.a {"enum":["x","y"]}
@@ alias    schema M = "x" | "y"           diags [] $defs.M {"enum":["x","y"]}
@@ ann      @<"x" | "y">                            lowered {"enum":["x","y"]}
```

### The all-literal family at `params:`, against its contrast

| Type source | `params:` `properties.p` | `schema` body field |
| --- | --- | --- |
| `"x" \| "y"` | `{"anyOf":[{},{}]}` | `{"enum":["x","y"]}` |
| `"x"` | `{}` | `{"const":"x"}` |
| `1 \| 2` | `{"anyOf":[{},{}]}` | `{"enum":[1,2]}` |
| `42` | `{}` | `{"const":42}` |
| `"x" \| null` | `{"anyOf":[{},{"type":"null"}]}` | `{"enum":["x",null]}` |
| `"x" \| "y" \| null` | `{"anyOf":[{},{},{"type":"null"}]}` | `{"enum":["x","y",null]}` |
| `null` | `{"type":"null"}` | `{"const":null}` |
| `true` | *refused:* `theta/parse/unresolved-named-type: unresolved named type 'true'` | `{"const":true}` |
| `true \| false` | *refused:* the same code twice, naming `true` and `false` | `{"enum":[true,false]}` |

Every `params:` row above except the last two loads with zero diagnostics. The
`null` row diverges in bytes but not in what it validates: `{"type":"null"}` and
`{"const":null}` accept exactly `null`. The boolean rows are the one place the
absence is loud rather than silent: with no literal arm, `true` reaches
`lowerTypeExpr`'s identifier arm (`params.ts:426–435`), resolves against no
declaration, and refuses the theta with a code that names a type the author did
not write.

### At depth

```
@@ params   p: '{m: "x" | "y"}'
   props.p :: {"$ref":"#/$defs/__inline_b5d5a13ca7926846"}
   $defs   :: {"__inline_b5d5a13ca7926846":
                {"type":"object","properties":{"m":{"anyOf":[{},{}]}},
                 "required":["m"],"additionalProperties":false}}
@@ field    schema S { a: {m: "x" | "y"} }
   $defs.S.properties.a :: {"$ref":"#/$defs/__inline_743ab811743679bb"}
   $defs   :: {"__inline_743ab811743679bb":
                {"type":"object","properties":{"m":{"enum":["x","y"]}},
                 "required":["m"],"additionalProperties":false}}
@@ ann      @<{m: "x" | "y"}>
   lowered :: {"type":"object","properties":{"m":{"enum":["x","y"]}},
               "required":["m"],"additionalProperties":false}
```

Two levels down, unchanged in kind:

```
@@ params   p: '{m: {n: "x" | "y"}}'
   props.p :: {"$ref":"#/$defs/__inline_438f9e4c9fffd394"}
   $defs   :: {"__inline_829bfb0636444915":
                {"type":"object","properties":{"n":{"anyOf":[{},{}]}},…},
               "__inline_438f9e4c9fffd394":
                {"type":"object","properties":{"m":{"$ref":"#/$defs/__inline_829bfb0636444915"}},…}}
@@ ann      @<{m: {n: "x" | "y"}}>
   $defs.__inline_daf9b1da56abcd49 :: {"type":"object","properties":{"n":{"enum":["x","y"]}},…}
```

### The minted slugs split by position

Byte-identical source text, two `$defs` names, because the slug is the hash of
the lowered fragment (schema-subset.md §Canonical schema hash, `:98`):

```
{m: "x" | "y"}   params: __inline_b5d5a13ca7926846   body: __inline_743ab811743679bb
{m: "x"}         params: __inline_4b5ea26f0093b13c   body: __inline_419c8179123a99b0
{m: null}        params: __inline_168515c51f5e820f   body: __inline_84af3dd41af27d3e
```

### Real AJV over the lowered documents

`p: '"x" | "y"'` lowers the document
`{"type":"object","properties":{"p":{"anyOf":[{},{}]}},"required":["p"],
"additionalProperties":false}`:

```
{"p":"x"}          -> true     (an arm the author declared)
{"p":"y"}          -> true     (an arm the author declared)
{"p":"zzz"}        -> true     (matches NEITHER arm)
{"p":""}           -> true     (matches NEITHER arm)
{"p":7}            -> true     (matches NEITHER arm)
{"p":true}         -> true     (matches NEITHER arm)
{"p":null}         -> true     (matches NEITHER arm)
{"p":[]}           -> true     (matches NEITHER arm)
{"p":{"nope":1}}   -> true     (matches NEITHER arm)
```

`p: '{m: "x" | "y"}'`, through the hoisted `$ref`:

```
{"p":{"m":"x"}}           -> true
{"p":{"m":"zzz"}}         -> true
{"p":{"m":7}}             -> true
{"p":{"m":null}}          -> true
{"p":{"m":{"deep":1}}}    -> true
```

The same field shape declared in a `schema` body (`schema S { m: "x" | "y" }`,
`params: a: S`):

```
{"a":{"m":"x"}}    -> true
{"a":{"m":"zzz"}}  -> false
{"a":{"m":7}}      -> false
```

### The named-alias route, which enforces

```
@@ params   p: Sev   +   schema Sev = "x" | "y"
   lowered :: {"type":"object","properties":{"p":{"$ref":"#/$defs/Sev"}},
               "required":["p"],"additionalProperties":false,
               "$defs":{"Sev":{"enum":["x","y"]}}}
   {"p":"x"}    -> true
   {"p":"zzz"}  -> false
   {"p":7}      -> false
```

### What the binder is told

```
@@ params   p: '"x" | "y"'
   BypassParamsField :: {"wireName":"p","type":"\"x\" | \"y\"","hasDefault":false,"nullable":false}
   Parameters: line  ::   p ("x" | "y") required
@@ params   p: '"x" | "y" = "x"'
   Parameters: line  ::   p ("x" | "y") default="x"
@@ params   p: '"x" | "y" = "zzz"'      diags [] — a default no arm admits loads clean
   Parameters: line  ::   p ("x" | "y") default="zzz"
```

### Controls — the shapes that do not move

```
@@ string | null      params {"type":["string","null"]}     field {"type":["string","null"]}
@@ integer | null     params {"type":["integer","null"]}
@@ Triage | null      params {"anyOf":[{"$ref":"#/$defs/Triage"},{"type":"null"}]}
                      field  {"anyOf":[{"$ref":"#/$defs/Triage"},{"type":"null"}]}
@@ "x" | integer      params {"anyOf":[{},{"type":"integer"}]}
                      field  {"anyOf":[{},{"type":"integer"}]}
@@ "x" | Triage       params {"anyOf":[{},{"$ref":"#/$defs/Triage"}]}
@@ array<"x" | "y">   params {"type":"array","items":{"anyOf":[{},{}]}}
                      field  {"type":"array","items":{"anyOf":[{},{}]}}
@@ string             params {"type":"string"}
@@ array<string>      params {"type":"array","items":{"type":"string"}}
@@ Triage             params {"$ref":"#/$defs/Triage"}
@@ {m: integer}       params {"$ref":"#/$defs/__inline_0b0411e1b6314e7d"}
```

Reading the controls:

- **The nullability idiom is untouched.** `T | null` for a non-literal `T` has a
  non-literal arm, so it never enters a literal check at any position and lowers
  identically at all four today.
- **A mixed union is symmetric.** `"x" | integer` lowers
  `{"anyOf":[{},{"type":"integer"}]}` at the `params:` position and at all three
  contrast positions: the literal arm is permissive everywhere. That is 0043's
  §Non-goals bullet, not this defect.
- **A literal union inside a generic argument is symmetric.**
  `array<"x" | "y">` lowers `items: {"anyOf":[{},{}]}` at all four positions,
  because `lowerTypeExpr` recurses a generic's argument through itself
  everywhere.
  **Moved at 0.123.0.** Bug
  [0164](./0164-generic-argument-literal-lowers-permissive.md) §Fix is the
  authority: the argument recursion now consults the same literal sublanguage
  first, so `array<"x" | "y">` lowers
  `items: {"type":"string","enum":["x","y"]}` at all four positions. The
  SYMMETRY this bullet records is unchanged — the four positions still agree,
  because they still share the one function below the top of a type source; what
  moved is what that function returns for a wholly-literal argument.
- **Primitives, named types, `array<T>` and inline objects are unaffected** —
  they have arms in `lowerTypeExpr`, which is why the `params:` position lowers
  them correctly today.

## Expected behaviour

- `docs/spec_topics/schema-subset.md:79` — "Literal `"foo"` / `42` / `true` /
  `null`: `{ "const": <value> }`". `:80` — "Enum (or string-literal union):
  `{ "type": "string", "enum": [...wire values...] }`". Neither rule is scoped
  to a position; §Lowering Algorithm step 3 is the emission table for every type
  form the pass meets.
- `docs/spec_topics/grammar.md:95` and `:102` put `LiteralType` in `Type`
  (`LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`), and `:105` names
  "`params:` field types" among the positions where "a bare `Type` appears",
  adding that "the grammar is otherwise identical in every position". `:109`
  makes an inline object's field `Type` recursive, so a literal nested inside an
  inline object at `params:` is ordinary grammar.
- `docs/spec_topics/type-system.md:9` lists literal types as "valid type
  expressions"; `:15` — "The same type grammar applies in every type-annotation
  position: schema fields, frontmatter `params:`, `let x: T`, function
  parameters, and `@<T>`…". One grammar and one emission table give one answer
  per type expression. So:

  ```
  p: '"x" | "y"'          -> the same fragment `schema S { a: "x" | "y" }` lowers for `a`
  p: '"x"'                -> the same fragment `schema S { a: "x" }` lowers for `a`
  p: '{m: "x" | "y"}'     -> a hoisted fragment whose `m` matches the body position's `m`,
                             under the same `__inline_<slug>` name
  ```

  An AJV document built from the first accepts `"x"` and `"y"` and rejects
  `"zzz"`, `7`, `true`, `null`, `[]` and `{"nope":1}` — which is what the
  contrast position's document already does for byte-identical type text.
- `docs/spec_topics/schemas.md:89` directs authors to this form: "`enum` is
  **top-level only** — there is no inline `enum["a", "b"]` form
  (`theta/parse/inline-enum`). For inline enumerations use literal-union:
  `severity: "low" | "medium" | "high"`." The registry row's *Fix hint* repeats
  it (`docs/spec_topics/diagnostics/code-registry-parse.md:93`). The form the
  spec names as the way to write an inline enumeration is the form that stops
  constraining at `params:`.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` — "Each `params:`
  field's right-hand side is a type expression parsed by the theta type grammar
  — the same grammar used in every other type-annotation position". `:57` —
  "`params` are validated with AJV at invocation time". A type expression the
  grammar admits and the AJV validation cannot enforce satisfies neither
  sentence.
- `docs/spec_topics/schema-subset.md:73` (step 2) makes the `__inline_<slug>`
  name a function of the *lowered* fragment, and `:98` (step 1 of the canonical
  hash) confirms it. Two positions that lower one source text to two fragments
  therefore mint two names by construction; agreeing on the fragment is what
  makes the dedup property mechanical.

## Actual behaviour / root cause

Two functions, one boundary between them.

`lowerParamsFieldType` (`src/parser/params.ts:606–615`) is the whole of the
`params:` position's type lowering:

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

A literal is not brace-rooted, so it takes the first arm. `lowerTypeExpr`
(`:384–439`) dispatches by shape: generic application, union split, primitive
atom, identifier atom, and then a catch-all that names what it is discarding:

```ts
  // A literal-type atom (string/number literal) or any other form: lower
  // permissively; literal lowering is owned by the schema-subset leaves.
  return {};
```

For a single literal that catch-all is the whole story. For an all-literal union
the union split at `:404–420` runs first, lowering each arm through this same
function — so each arm arrives at `:438` and returns `{}`. The classifier at
`:410–414` admits into the `{"type":[…]}` form only a fragment whose sole key is
a `type` naming a primitive; `{}` fails that test, so every arm is
`non-primitive` and `lowerUnion` emits `anyOf`. The result is SUBS-1 applied
faithfully to arms that carry no information: `{"anyOf":[{},{}]}`.

The literal sublanguage exists, one module over. `lowerTypeSource`
(`src/parser/body-type-lowering.ts:335–414`) runs it before anything else
(`:358–369`): split on `|`, and when `parseLiteralArm` (`:693–714`) accepts
every arm, return `{ enum: [...] }`; a single accepted atom returns
`{ const: ... }`. The three positions that enter this function get the
sublanguage; the `params:` position never enters it.

**The depth behaviour is a route decision, not an oversight.** Both positions
hoist an inline object through the same `hoistInlineObjectType`
(`params.ts:502–589`), which is parameterised by the caller's own per-field
recursion. `lowerTypeSource` passes an inner helper that re-enters
`lowerTypeSource` (`body-type-lowering.ts:371–375`), so the sublanguage reaches
every nested field. `lowerParamsFieldType` passes *itself* (`params.ts:614`), so
the `params:` position's nested fields take the same literal-free path its
top-level fields take. `hoistInlineObjectType`'s own contract states the
consequence (`params.ts:489–495`), and bug 0039's §Fix took the pairing
deliberately: "The literal sublanguage must not regress" (`:570–575`) demanded
the shared arm recurse through `lowerTypeSource` for the three positions, and
"The `params:` position's bytes do not move" (`:607–610`) demanded
`lowerParamsFieldType` keep its own recursion. Its §Residuals item (viii)
(`:282–285`) records the result. Two further in-tree comments state the freeze —
`params.ts:600–604` and `body-type-lowering.ts:191–195`.

The behaviour predates that fix. `lowerTypeExpr`'s catch-all has owned this
input since before bug 0035 added the inline-object arm beside it; 0035 gave the
`params:` position a brace-rooted arm and 0039 shared that arm out. Neither
touched the literal question at this position.

Three sub-cases fall out of the same absence:

- **`null`** is both `PrimitiveType` (grammar.md `:97`) and `LiteralType`
  (`:102`). `lowerTypeExpr` matches it as a primitive and emits
  `{"type":"null"}`; `parseLiteralArm` matches it as a literal and
  `lowerTypeSource` emits `{"const":null}`. Both accept exactly `null`, so the
  positions disagree in bytes and slugs only.
- **`true` / `false`** are absent from `PRIMITIVE_TYPES` (`params.ts:348–354`)
  and match `IDENTIFIER` (`:356`), so at `params:` they reach the identifier arm
  (`:426–435`), resolve against no declaration, append to
  `lowerCtx.unresolved`, and refuse the theta with
  `theta/parse/unresolved-named-type`. The contrast positions match them in
  `parseLiteralArm` first and lower them to `{"const":true}` /
  `{"enum":[true,false]}`.
- **A default is never checked against a literal type.**
  `p: '"x" | "y" = "zzz"'` loads clean and renders `default="zzz"`, because the
  declared type carries no arms after lowering. frontmatter-fields-a.md `:60`
  requires the default's static type to be compatible with the declared type;
  that check is the type layer's, and this report does not establish where it
  fails — only that the input is silent at HEAD.

Everything downstream of the frame is correct. `lowerUnion`
(`src/parser/schema-lowering.ts:170–195`) implements SUBS-1 over whatever arms
it is handed; `hoistInlineObjectType` hoists and content-addresses correctly;
`parseParams` reports every name the lowering resolves against nothing. The
frame is the missing arm and the recursion that carries its absence down.

## Why it matters

- **The lowered fragment is the only enforcement the argument gets.** Three
  sites compile it: the binder envelope
  (`production-theta-producer.ts:709–712` → `binder-envelope.ts:89`), the
  post-default-merge validation (`:1173`), and the subagent child's params
  intake (`:1968–1976`). A `properties.p` of `{"anyOf":[{},{}]}` admits every
  JSON value at all three, so a param declared as one of two strings binds `7`,
  `null` or `{"nope":1}` and the body runs on it.
- **The model is grounded in the type the schema drops.** The `Parameters:`
  block renders the declared Theta type verbatim — binder-bypass-and-envelope.md
  `:129` (*Type display*) makes that normative — so the binder prompt says
  `p ("x" | "y") required` while the envelope schema it is constrained by
  (`relaxParamsSchema`, `binder-envelope.ts:137–157`) carries two empty
  variants. Grammar-constrained decoding has nothing to constrain, and the
  binder's structured output is accepted whatever it emits for that field.
- **The spec routes authors into it.** schemas.md `:89` and the
  `theta/parse/inline-enum` row's *Fix hint*
  (`code-registry-parse.md:93`) both name the literal union as the way to write
  an inline enumeration. `docs/examples/handle-error.theta:8` writes exactly
  that shape (`category: "bug" | "feature" | "question"`) — in a `schema` body,
  where it enforces. The same line moved to `params:` stops enforcing.
- **Two spellings of one declaration behave differently with no signal.**
  `p: '"x" | "y"'` accepts everything; `schema Sev = "x" | "y"` plus `p: Sev`
  refuses `"zzz"`. Nothing distinguishes them at load, in the recorded type, or
  in the binder prompt.
- **The content-addressed `$defs` name splits by position.** schema-subset.md
  `:73` collapses two inline schemas to one entry exactly when their lowered
  fragments are byte-identical. For `{m: "x" | "y"}` they are not, so the
  `params:` document and the body document mint `__inline_b5d5a13ca7926846` and
  `__inline_743ab811743679bb` for the same fourteen bytes of source.
- **One position emits another rule's code.** The
  boolean sub-case refuses a grammatically admitted type with
  `theta/parse/unresolved-named-type` naming `true` — a code whose registered
  trigger is a `NamedType` that resolves to no declaration
  (`code-registry-parse.md:89`), applied to text that is not a `NamedType`.
  That is bug [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s
  family reached through this frame.
- **No gate scores it.** A census of every `params:` right-hand side in the
  committed corpus (17 `.theta` / `.thetalib` files declaring `params:`, plus
  the `params:` blocks reachable in `tests/` and `docs/`) finds no all-literal
  type at that position, so `tests/committed-fixture-parse-gate.test.ts` never
  meets one and neither 0035's 37-test lock nor 0039's 58-test file drives one.

## Fix

Give the `params:` position the literal sublanguage the other three have, at
every depth it reaches, by sharing one implementation rather than adding a
second.

`lowerParamsFieldType` (`src/parser/params.ts:606–615`) checks the literal
sublanguage before its brace test and returns the `const` / `enum` fragment when
it matches, delegating to `lowerTypeExpr` only for what is left. Because that
function is also the recursion it hands to `hoistInlineObjectType` (`:614`), the
check applies at every nesting depth without a second change; nothing about the
hoist, the slug retention or the collision posture moves.

The recogniser is `parseLiteralArm`, today module-private in
`body-type-lowering.ts:693–714`, and the import direction forbids `params.ts`
calling it (`body-type-lowering.ts:15–22` imports from `params.ts`; bug 0039
§Fix `:550–552` forbids the reverse). It moves to `params.ts` and is exported, and
`lowerTypeSource`'s literal arm (`:358–369`) calls it there — so the two
positions share one recogniser and one emission, and their agreement is a
property of the code rather than a convention to maintain.

**Ordering.** This fix lands after — or in the same change as —
[0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md), which
decides whether the union emission is the bare `{"enum":[…]}` the three
positions emit today or the `{"type":"string","enum":[…]}` schema-subset.md
`:80` spells. The `params:` position must adopt the settled spelling once. If
0055 lands first, this fix inherits it and the pins written here are written
against it; landing this first would re-pin the same fragments twice, including
every `__inline_<slug>` a nested literal mints.

The ordering clause is discharged by 0055's fix (0.59.0): 0055 landed first and
alone, so this fix inherits its emission rather than deciding it. The settled
spelling is `{ type: "string", enum: values }` with `type` written FIRST when
every arm is a string literal, and the bare `{ enum: values }` for any other
literal kind. `type`-first is contractual, not cosmetic — `respondSchemaSlug`
hashes `JSON.stringify(lowered)` and is key-order sensitive, so the order is what
collapses a string-literal union onto `lowerEnumToSchema`'s slug. The exported
recogniser this fix moves to `params.ts` must reuse that emission verbatim, order
included, or the `params:` position will agree with the other three on `toEqual`
and disagree on every slug. Two of this report's citations are stale at 0.59.0:
`parseLiteralArm` is `body-type-lowering.ts:741`, not `:693–714`; the literal
sublanguage is `:378–392` (the union arm's emitting ternary at `:382–385`), not
`:358–369`; and the four references to `lowerField` at `:371–375` (`:55`, `:114`,
`:494`, `:764`) are `:399`. The frozen `params:` bytes 0055 left byte-identical
are pinned as no-ops in that fix's witness, group (e).

Constraints on any implementation:

1. **The frozen `params:` bytes move, and only for the enumerated class.** Bug
   0039 §Fix pinned this position byte-for-byte (`:607–610`), and three in-tree
   comments state that freeze (`params.ts:489–495`, `:600–604`;
   `body-type-lowering.ts:191–195`). This report's §Fix is the authority that
   lifts it for exactly these sources, and the three comments are re-derived in
   the same change. The class that moves, at any depth:

   | Source shape | HEAD | After |
   | --- | --- | --- |
   | a single string or number literal | `{}` | `{"const": <value>}` |
   | an all-literal union of strings / numbers | `{"anyOf":[{},…]}` | the settled `enum` form |
   | a literal union carrying `null` | `{"anyOf":[…,{"type":"null"}]}` | the settled `enum` form with `null` among the values |
   | a bare `null` | `{"type":"null"}` | see constraint 2 |
   | a single boolean literal, or an all-boolean union | *refused* (`theta/parse/unresolved-named-type`) | `{"const": true}` / the settled `enum` form |

   Nothing else moves. A source with any non-literal arm fails the all-arms test
   and reaches `lowerTypeExpr` exactly as today, so `string | null`,
   `Triage | null`, `"x" | integer`, `array<"x" | "y">`, every primitive, every
   named type, every `array<T>` and every inline object keep their bytes and
   their minted slugs. The `params:`-position rows of 0035's 37-test lock
   (`tests/params-inline-object-lowering.test.ts`) and of 0039's file
   (`tests/inline-object-nested-lowering.test.ts`) are all in the unmoved set,
   measured, not assumed: neither file declares an all-literal `params:` type.
2. **`null` is adjudicated, once, for all four positions.** grammar.md `:97`
   makes it a `PrimitiveType` and `:102` a `LiteralType`; `params:` reads it as
   the first (`{"type":"null"}`) and the other three as the second
   (`{"const":null}`). The two fragments validate identically, so the decision
   is about bytes, slugs and which spec line governs — but type-system.md `:15`
   admits only one answer, and the fix records it. Whichever is chosen, the
   losing position's bytes move and its pins are re-derived; the SUBS-1
   `{"type":[…,"null"]}` form for a union with a non-literal arm is a different
   rule and is not in scope.
3. **The boolean rows change from refusal to acceptance.** `p: 'true'` loads
   after the fix where it is refused today, so `theta/parse/unresolved-named-type`
   loses an input from its emission set. GOV-15's diagnostic-registry carve-out
   (`docs/spec_topics/governance/source-language-stability.md:25`) covers a
   trigger change "as a removal for inputs taken out of it", so this is
   admissible within a 1.x minor. No registry edit: the row's trigger prose is
   unchanged, and the inputs leaving it were never `NamedType`s.
4. **Validation outcomes change for thetas that load unchanged.** A param that
   accepted every JSON value begins refusing values no declared arm admits, at
   all three consumers of the lowered document. GOV-15 (`:5`) promises identical
   return values for a file that loads cleanly under 1.0.0, so the fix's
   evidence enumerates the affected shapes rather than leaving them to be
   discovered: the class is exactly constraint 1's table, and the census in
   §Why it matters found no committed fixture in it.
5. **No new diagnostic and no new permissive lowering.** The fix removes
   `{}`-emissions; it adds none, and it registers no diagnostic code. A source
   the literal recogniser declines keeps its current disposition, which for a
   mixed union is the permissive arm bug 0043 §Non-goals owns.
6. **Test witness — unit, offline, no live provider.** Every fixture in
   §Reproduction is a `parseThetaDocument` or `lowerQueryResponseSchema` call.
   Required beyond the probes: four-position byte parity over the whole
   constraint-1 table, including the nested and twice-nested forms and the
   minted `__inline_<slug>` names, proving the two positions now mint one name
   for one source text; a real-AJV accept/reject table over the lowered
   `params:` document showing the six inverted rows (`"zzz"`, `""`, `7`, `true`,
   `[]`, `{"nope":1}` refused, `"x"` and `"y"` accepted); a no-op set over the
   controls in §Reproduction pinned byte-for-byte, including the `array<…>` and
   mixed-union rows that stay permissive; the boolean rows proving the refusal
   is gone and the theta loads; and the binder-envelope shape for a literal-typed
   param, since `relaxParamsSchema` copies the fragment into the model-facing
   schema.

## Non-goals

- **The literal-union emission's own bytes.** Whether the three contrast
  positions should emit `{"enum":[…]}` or schema-subset.md `:80`'s
  `{"type":"string","enum":[…]}` is
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md)'s
  subject. This report asks only that the `params:` position emit whatever they
  emit.
- **A literal arm of a mixed union.** `"x" | integer` lowers
  `{"anyOf":[{},{"type":"integer"}]}` at all four positions — measured — because
  the all-arms-literal test declines a union carrying a non-literal arm
  everywhere; `"x" | Triage` lowers `{"anyOf":[{},{"$ref":"#/$defs/Triage"}]}` at
  `params:` by the same route.
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md)'s §Non-goals holds
  that shape. Nothing here changes it.
  **Moved at 0.115.0.** Bug
  [0184](./0184-union-arm-literal-lowers-empty-schema.md) §Fix is the authority:
  `"x" | integer` lowers `{"anyOf":[{"const":"x"},{"type":"integer"}]}` and
  `"x" | Triage` lowers `{"anyOf":[{"const":"x"},{"$ref":"#/$defs/Triage"}]}`,
  at all four positions. The all-arms-literal test this report installed is
  unchanged — a mixed union still declines it whole; what moved is that the
  union-ARM recursion consults the same sublanguage per arm once the arm set
  carries a non-literal arm. Cells `d4` and `d5` were re-derived under 0184 §Fix
  constraint 3. `d1`–`d3` (the `null` idiom, which 0184 §Fix constraint 5
  protects by reading a `PrimitiveType` spelling first) and `d6` (the generic
  argument, [0164](./0164-generic-argument-literal-lowers-permissive.md)'s) are
  byte-untouched.
- **A literal union inside a generic argument.** `array<"x" | "y">` lowers
  `items: {"anyOf":[{},{}]}` at every position, because `lowerTypeExpr` recurses
  a generic's argument through itself. The fix as scoped does not reach it;
  routing generic arguments back through the literal check is a change to
  `lowerTypeExpr`'s recursion, which the argument-split nesting rule
  (`TypeSplitNesting`, `params.ts`) governs.
  **Moved at 0.123.0.** Bug
  [0164](./0164-generic-argument-literal-lowers-permissive.md) §Fix is the
  authority, and it made exactly the change this bullet names: route (i) — *at
  the argument* — has `lowerTypeExpr`'s arity-1 `array` arm and its best-effort
  loop consult `lowerLiteralSublanguage` before recursing, so
  `array<"x" | "y">` lowers `items: {"type":"string","enum":["x","y"]}` and
  `array<"x">` lowers `items: {"const":"x"}` at all four positions. THE NESTING
  RULE THIS BULLET DEFERRED TO WAS HONOURED, not lifted: the argument split is
  still `splitTopLevel`'s angle-only default, so a remedy changed where the
  argument text GOES and never what the split hands it. This report's cell `d6`
  was re-derived under 0164 §Fix constraint 3; `d1`–`d3`, `d7`–`d9` stay
  byte-frozen.
- **Negative numeric literals.** `p: '-1 | 1'` lowers `{"anyOf":[{},{}]}`, but
  the contrast is not available: `schema S { a: -1 | 1 }` raises
  `theta/parse/empty-schema-body` — the field is lost before lowering — and
  `schema X = -1` keeps a junk `-` arm, which
  [0042](./0042-schema-decl-same-line-residue-silent.md) owns. `-` handling is a
  parse-layer question, so negative numerics stay outside constraint 1's table
  until 0042 settles.
- **`theta/parse/inline-enum` at the `params:` right-hand side.** Measured
  adjacent and distinct: `p: 'enum["x", "y"]'` loads with zero diagnostics and
  lowers `{}`, where `schema S { a: enum["x", "y"] }` and
  `schema S = enum["x", "y"]` both raise the registered code. That is a trigger
  gap in a different row, unfiled, and no part of this fix.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments is
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s inventory
  question.

## Provenance

- Origin: bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
  fix (0.49.0), residual 8 of `.pi/tmp/fixes/0039-report.md` and §Residuals item
  (viii) of the doc (`:282–285`), left unfiled by that fix. This report files
  it, re-derives it at HEAD `52e257bc`, and adds what the residual does not
  state: the single-literal case (`{}`, not only the union's
  `anyOf: [{}, {}]`), the `null` and boolean sub-cases, the depth behaviour and
  its minted-slug consequence, the AJV and binder-envelope reach, and the
  enumeration of which frozen bytes a fix moves.
- Spec: `docs/spec_topics/schema-subset.md:73` (step 2, the `__inline_<slug>`
  hoist and its byte-identity dedup), `:79` (the literal `const` emission),
  `:80` (the enum / string-literal-union emission), `:81`
  ([SUBS-1](../spec_topics/schema-subset.md#subs-1)), `:85` (*Array element
  order*), `:87` (step 5, the sidecar's deliberate omission of anonymous
  string-literal-union positions), `:98` (canonical hash step 1 — the slug is a
  function of the lowered fragment); `docs/spec_topics/grammar.md:95` and `:102`
  (`LiteralType` in `Type`), `:97` (`PrimitiveType`, which also names `null`),
  `:105` (the bare-`Type` position list, `params:` named), `:109` (§Inline
  object types, recursive field `Type`); `docs/spec_topics/type-system.md:9`
  (literal types), `:15` (one grammar per annotation position);
  `docs/spec_topics/lexical.md:26` (both quote forms);
  `docs/spec_topics/schemas.md:89` (no inline `enum[…]`; use a literal union);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` (AJV validation at
  invocation), `:58` (the type side), `:60` (defaults and their compatibility
  rule); `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` (the
  `Parameters:` block), `:129` (*Type display* — the surface type, not the
  lowering), `:35` and `:79` (the envelope schema built from `params:`);
  `docs/spec_topics/diagnostics/code-registry-parse.md:89`
  (`theta/parse/unresolved-named-type`, the five-position row), `:93`
  (`theta/parse/inline-enum` and its fix hint);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing reference: `docs/reference/schema-subset.md:151–152` (the literal
  and enum emissions), `:66` (the literal-union direction).
- Implementation evidence at `52e257bc`: `src/parser/params.ts:156`
  (`parseParams`'s per-field call), `:164–172` (the diagnostic loop),
  `:373–375` (the delegation comment), `:384–439` (`lowerTypeExpr`: `:404–420`
  the union split, `:410–414` the primitive test, `:419` the `lowerUnion` call,
  `:422–435` the atom arms, `:436–438` the catch-all), `:502–589`
  (`hoistInlineObjectType`), `:489–495` (its `lowerFieldType` contract — the
  in-tree record of this asymmetry), `:600–604` and `:606–615`
  (`lowerParamsFieldType` and its frozen-bytes comment);
  `src/parser/body-type-lowering.ts:15–22` (the one-way import), `:119`
  (`lowerObjectFields`'s per-field call), `:170` (`lowerInlineObject`'s
  delegation to it), `:191–195` (the freeze restated), `:291–304`
  (`lowerTypeSource`'s contract), `:335–414` (the function: `:358–369` the
  literal sublanguage, `:371–375` the `lowerField` recursion, `:413` the
  delegation), `:566` (`buildBodyTypeSchemas` pass 2's alias-RHS call),
  `:693–714` (`parseLiteralArm`);
  `src/parser/schema-lowering.ts:170–195` (`lowerUnion`), `:199–208` and
  `:238–262` (the sidecar's anonymous-literal-union omission);
  `src/runtime/query-schema-lowering.ts:141` (the annotation's brace route),
  `:148` (its inline route), `:26–63` (the permissive-`{}` inventory);
  `src/parser/frontmatter.ts:686` (the recorded declared type), `:737–750`
  (FM-5); `src/extension/production-theta-producer.ts:603–612`
  (`binderPromptParamField`), `:709–712` (the envelope build), `:1173` (the
  post-default-merge compile), `:1968–1976` (the subagent params-intake
  validator); `src/binder/binder-envelope.ts:89`, `:137–157`
  (`relaxParamsSchema`); `src/binder/binder-system-prompt.ts:151`, `:200–207`
  (the `Parameters:` block).
- Test evidence at `52e257bc`: `tests/params-inline-object-lowering.test.ts`
  (bug 0035's 37-test lock over the `params:` position — inline objects, named
  types, primitives and `array<…>`, no literal type);
  `tests/inline-object-nested-lowering.test.ts:344–358` (G2's nested fragment,
  `{"b":{"enum":["x","y"]}}`), `:846` (a5 — the sublanguage surviving one level
  down at the annotation root), `:990–1007` (a10 — the literal-union emission
  pinned at depth 0, with the SUBS-1 spelling divergence 0055 owns noted in the
  cell); `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk
  over committed fixtures, none of which declares an all-literal `params:`
  type); `docs/examples/handle-error.theta:8` (the literal union written where
  it enforces).
- Reproduction: scratch vitest at `52e257bc` — the four positions over
  `"x" | "y"`; the nine-row all-literal family at `params:` against its
  `schema`-body contrast; the nested and twice-nested forms with their minted
  slugs at both positions; real `Ajv2020` compiles of the `params:`, nested
  `params:` and `schema`-body documents; the named-alias route; the binder field
  record and rendered `Parameters:` line, including the two default rows; and
  ten controls. Run on the outputs quoted above, then deleted per scratch
  policy.

## Fix (0.85.0)

- **Baseline drift, re-derived before anything was pinned.** The report's
  citations are at `52e257bc` (0.49.0), 35 minors back; its addendum re-anchored
  two at 0.59.0. Every observable was re-measured at HEAD `f856fd33` (0.84.0)
  with a scratch probe before Phase 1. Two §Reproduction rows are STALE in the
  fix's favour and were NOT re-pinned as the report writes them:
  - **The boolean rows already load.** Bug 0044's fix (0.54.0) gave
    `lowerTypeExpr`'s atom section its own `true` / `false` arm, so at HEAD
    `p: 'true'` loads with zero diagnostics and already lowers `{"const":true}`.
    The refusal §Reproduction records (`theta/parse/unresolved-named-type`
    naming `true`) is gone before this fix touches anything. **Constraint 3 is
    therefore already discharged for the single-boolean case, and this fix
    removes NO input from any diagnostic's emission set.** Only
    `p: 'true | false'` moves, from `{"anyOf":[{"const":true},{"const":false}]}`
    — `lowerUnion` combining two `const` arms — to `{"enum":[true,false]}`.
  - **The `schema`-body slugs moved with 0055.** `{m: "x" | "y"}` mints
    `__inline_cf9a345524fd2d87` at the contrast positions, not the report's
    `__inline_743ab811743679bb`, because 0055 (0.59.0) changed that emission.
    The `params:` position's own pre-fix slugs are byte-exact as written
    (`__inline_b5d5a13ca7926846`, `__inline_4b5ea26f0093b13c`,
    `__inline_168515c51f5e820f`, `__inline_438f9e4c9fffd394`).
- **What shipped**
  - `src/parser/params.ts` — `parseLiteralArm` MOVED here from
    `body-type-lowering.ts` and exported, its body byte-identical (a quoted
    string in either quote form, `true`, `false`, `null`,
    `/^-?\d+(\.\d+)?$/`); the import direction `body-type-lowering.ts` →
    `params.ts` is the one bug 0039 §Fix permits, which is why the recogniser
    moves rather than being exported in place. New exported
    `lowerLiteralSublanguage` carries the ONE emission: `splitTopLevel` on `|`,
    then all-arms-literal → 0055's landed ternary MOVED VERBATIM
    (`{ type: "string", enum: values }` when every value is a string, the bare
    `{ enum: values }` otherwise), single accepted arm → `{ const: value }`,
    anything else → `undefined`. `lowerParamsFieldType` calls it BEFORE its
    brace test and returns the fragment on a match; a decline falls through to
    its two existing arms unchanged.
  - `src/parser/body-type-lowering.ts` — `lowerTypeSource`'s inline literal
    block replaced by a call to the shared helper; `parseLiteralArm` removed.
  - **Depth cost nothing.** `lowerParamsFieldType` is itself the per-field
    recursion it hands `hoistInlineObjectType`, so the check re-runs at every
    nesting depth with no second change. The hoist, the slug retention and the
    slug-collision posture are untouched; `lowerTypeExpr`, `lowerUnion` and
    SUBS-1 are untouched.
  - **Five in-tree comments re-derived** (§Fix constraint 1 names three; the
    change falsified two more): `hoistInlineObjectType`'s `lowerFieldType`
    contract and `lowerParamsFieldType`'s frozen-bytes paragraph (params.ts),
    `isSingleEnclosingBraceGroup`'s freeze restatement and `lowerTypeSource`'s
    "this function's own" claim (body-type-lowering.ts), and
    `toLoweredJsonValue`'s "no numeric consts arise from a `params:` inline
    object" claim, which `p: '{m: 42}'` now falsifies.
  - `src/parser/theta-document.ts` — two comment lines only, in
    `classifyDiscriminatorFieldType`'s doc comment: `parseLiteralArm`'s file
    attribution corrected to `params.ts`, and `isSingleEnclosingBraceGroup`'s
    volatile `:208` dropped in favour of the symbol. Line count unchanged
    (6904). Zero executable lines.
- **Constraint 2 — the `null` adjudication, settled once for all four
  positions.** **`null` is a `LiteralType` for lowering purposes; the `params:`
  position adopts `{"const":null}` and the three contrast positions do not
  move.** Implemented structurally, by NOT special-casing `null` anywhere — the
  moved recogniser already accepts it. The reasoning:
  - `schema-subset.md:79` names `null` EXPLICITLY among the literal row's own
    members ("Literal `"foo"` / `42` / `true` / `null`: `{ "const": <value> }`"),
    while the primitive row (`{ "type": "<primitive>" }`) names no member at
    all. Step 3 is the emission table, and it spells `null` in exactly one
    emission row.
  - `:81` (SUBS-1) scopes its "treating `null` as a primitive" clause to the
    UNION rule alone ("A union all of whose arms are primitive types — treating
    `null` as a primitive, so the `string | null` case is included"). The
    parenthetical exists because the primitive reading is a union-only
    accommodation; outside a union the literal row governs.
  - The three contrast positions already emit `{"const":null}` at HEAD and are
    pinned doing so.
  - **Both directions were measured before choosing**, by prototyping each and
    running the full suite. The literal reading reds SIX cells, every one at the
    `params:` position. The primitive reading reds FIVE — numerically smaller,
    but it moves a MAJORITY position's bytes, it needs a `null` carve-out inside
    the very helper this fix exists to share, and it is internally incoherent
    with constraint 1 row 3 (it would read `null` as a literal arm inside
    `"x" | null` but not alone — two readings of one atom in one function).
    The losing position is therefore `params:`, and its pins are re-derived
    below.
- **Constraint 4 — the GOV-15 affected class, enumerated.** Exactly constraint
  1's table, at any depth, at the `params:` position only:

  | Source shape | before | after |
  | --- | --- | --- |
  | a single string or number literal | `{}` | `{"const": <value>}` |
  | an all-string-literal union | `{"anyOf":[{},…]}` | `{"type":"string","enum":[…]}` |
  | any other all-literal union | `{"anyOf":[…]}` | `{"enum":[…]}` |
  | a literal union carrying `null` | `{"anyOf":[…,{"type":"null"}]}` | `{"enum":[…,null]}` |
  | a bare `null` | `{"type":"null"}` | `{"const":null}` |
  | an all-boolean union | `{"anyOf":[{"const":true},{"const":false}]}` | `{"enum":[true,false]}` |
  | a single boolean literal | `{"const":true}` | unchanged (bug 0044 already) |

  Nothing else moves. `string | null`, `integer | null`, `Triage | null`,
  `"x" | integer`, `"x" | Triage`, `array<"x" | "y">`, every primitive, every
  named type, every `array<T>` and every non-literal inline object keep their
  bytes AND their minted slugs — pinned as controls, not assumed.
  **The census was re-run at HEAD**: 17 committed `.theta` / `.thetalib` files
  declare `params:`, and every right-hand side is `string`, `number = 3` or the
  named type `Author`. **No committed theta fixture is in the moved class**, so
  no shipped example changes what it validates. One committed TEST fixture is
  (`ROW.LIT` in `tests/params-default-string-literal-raw-newline.test.ts`), and
  it is re-pinned below.
- **Constraint 5 held**: no diagnostic registered, no registry row edited, no
  new permissive lowering. Every source the recogniser declines keeps its exact
  current disposition.
- **The minted-slug split heals.** One source text now mints ONE name across
  the `params:`, `schema`-body and alias positions: `{m: "x" | "y"}` →
  `__inline_cf9a345524fd2d87` (was `__inline_b5d5a13ca7926846` at `params:`),
  `{m: "x"}` → `__inline_419c8179123a99b0` (was `__inline_4b5ea26f0093b13c`),
  `{m: null}` → `__inline_84af3dd41af27d3e` (was `__inline_168515c51f5e820f`),
  and twice-nested `{m: {n: "x" | "y"}}` → `__inline_b29de9705c9f6fd4` over
  `__inline_5e132cb3f692fe5a` (was `__inline_438f9e4c9fffd394` over
  `__inline_829bfb0636444915`). The unmoved control `{m: integer}` keeps
  `__inline_0b0411e1b6314e7d` at both positions.
- **A measured consequence of sharing one recogniser, recorded rather than
  filtered.** `parseLiteralArm`'s `/^-?\d+(\.\d+)?$/` accepts a NEGATIVE numeric
  atom, and already did so at the three contrast positions, so `p: '-1 | 1'`
  moves `{"anyOf":[{},{}]}` → `{"enum":[-1,1]}` and joins the agreement the
  `@<T>` position already had. §Non-goals holds negative numerics outside
  constraint 1's table; that bullet forbids ADDING handling for them, and
  excluding them here would need a second, differently-behaving recogniser — an
  explicitly rejected route — recreating for `-1 | 1` the very split this fix
  removes. The parse-layer refusals that are 0042's family are untouched:
  `schema S { a: -1 | 1 }` still raises `theta/parse/empty-schema-body` and
  `schema X = -1 | 1` still raises `theta/parse/malformed-alias-rhs` plus the
  stray-`|` residue. Pinned in both directions by cell `d12`.
- **Authorized pins moved, in lock-step, each under the class authority**
  (§Fix constraint 1 for the bytes, constraint 2 for the `null` rows). No
  assertion outside this list changed, and no cell was weakened:

  | Cell | old bytes | new bytes | authority |
  | --- | --- | --- | --- |
  | `literal-union-string-enum-emission.test.ts` (e) e1 | `p: {"anyOf":[{},{}]}` | `p: {"type":"string","enum":["x","y"]}` | 0055's no-op pin over this position; constraint 1 |
  | `params-block-mapping-rhs-refusal.test.ts` (b) b2 | `p: {"type":"null"}` | `p: {"const":null}` | constraint 1 row 4 + constraint 2 |
  | `params-block-mapping-rhs-refusal.test.ts` (d) d4 | `p: {"type":"null"}` | `p: {"const":null}` | constraint 1 row 4 + constraint 2 |
  | `params-block-mapping-rhs-refusal.test.ts` (e) M1 | `{}` | `{"const":42}` | that cell's own clause names this report |
  | `params-block-mapping-rhs-refusal.test.ts` (e) M2 | `{}` | `{"const":"hello"}` | that cell's own clause names this report |
  | `params-default-string-literal-raw-newline.test.ts` `ROW.LIT` | `{}` | `{"const":"a\nb"}` | constraint 1 row 1 |
  | `union-generic-arm-lowering.test.ts` g7 (params) | `{"anyOf":[{},{}]}` | `{"type":"string","enum":["x","y"]}` | constraint 1 row 2 |

  Each keeps its OWN claim intact: bug 0041's b2/d4 still assert that the
  value-less key's scalar arm ADMITS the field and records the type `"null"`;
  bug 0102's `LIT` row still asserts zero diagnostics and that the refusal
  predicate is a break inside a STRING SPAN on the default RHS; bug 0043's g8
  (the MIXED union) does not move. **0035's 37-cell lock
  (`params-inline-object-lowering.test.ts`), 0039's file
  (`inline-object-nested-lowering.test.ts`) and 0052's 49-cell witness
  (`inline-object-duplicate-field-name.test.ts`) were measured in the unmoved
  set and stayed green throughout** — none declares an all-literal `params:`
  type. So did every protected whole-list `toEqual([])` witness and
  `committed-fixture-parse-gate`.
- **Two comment-only corrections outside the §Fix's named files**, both
  self-authorized on the record because the change itself falsified them and
  neither touches an assertion or an executable line: `theta-document.ts`'s two
  citation lines (above), and `tests/reserved-keyword-type-position.test.ts`
  cells a3 and d6, whose comments recorded that the `params:` position "never
  gets `parseLiteralArm`" — false once `lowerParamsFieldType` calls the shared
  helper first. That file's assertions, fixtures and cell names are byte-
  identical and it still reports 42 passing cells; its observables never moved.
- **Gates**
  - Witness RED before: `npx vitest run` → `Test Files 5 failed | 274 passed
    (279)`, `Tests 24 failed | 4376 passed (4400)`, every failure observing the
    permissive `{}` / `{"anyOf":[{},{}]}` / `{"type":"null"}` or a stale slug.
  - Witness GREEN after: `npx vitest run` → `Test Files 279 passed (279)`,
    `Tests 4402 passed (4402)`.
  - `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.
  - `npm run lint` → exit 0, no output.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Test Files 1 passed (1)`,
    `Tests 28 passed (28)` (27 → 28 cells).
  - Live H9a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/` → `Test Files 2 passed (2)`, `Tests 11 passed (11)`.
    `tests/fixtures/h7a/permitted-codes.json` byte-unchanged from the real run
    (`git status --porcelain` and `git diff --stat` on it both empty), as a fix
    that registers no code and removes an emission input class should leave it.
  - Line pins intact: `static-type-inference.ts` 378, `functions.ts` 427,
    `type-layer-checks.ts` 2531, `type-compat.ts` untouched.
- **Review**: 2 rounds plus one bounded pre-review citation correction (not a
  review round; citation/comment-only, `theta-document.ts` line count proven
  unchanged at 6904).
  - Round 1 (deep) — FINDINGS: four, ALL `prose`; zero `correctness`, zero
    `fidelity`, zero `spec`, zero `house-rule`, zero `test`. Two stale
    `parseLiteralArm` file attributions in `params.ts` itself; two falsified
    mechanism comments in bug 0044's witness; a self-contradicting `describe`
    title; one banned "used to" narration. It independently audited and endorsed
    the negative-numeric reasoning above.
  - Round 2 (fast) — CLEAN. Zero correctness, fidelity, spec. One non-blocking
    `test` residual: `toLoweredJsonValue`'s re-derived comment advertised a
    reachability nothing pinned. Closed by adding cell `b5` (`{m: 42}` and
    `{m: 1.5}`, both sides of the `Number.isInteger` split, one minted name per
    source text at three positions, against the file's independent oracle).
- **Verification**: SOLID, zero findings.
  - *The witness can red.* Two targeted neutralisations, each restored
    blob-exact (`git hash-object src/parser/params.ts` =
    `ba2467c6098745eb7c2ff024bc81187c5df279a7` before and after both
    round-trips; no `git stash`, no `git checkout`). Removing
    `lowerParamsFieldType`'s literal interception → 26 failed / 4376 passed
    across the 5 expected files, every failure back at the permissive fragment.
    Dropping `-?` from `parseLiteralArm`'s regex → exactly 1 failed, cell
    `d12`.
  - *The default suite is green.* 279 files / 4402 tests / 0 failed.
  - *A live test exercises the fixed path, run for real, proven both ways.* The
    new H8a cell drives the third of the three consumers the report names — the
    subagent child's params intake — because this fix moves no register /
    non-register verdict for any input in its own table, so `registeredNames`
    cannot witness it. An `invoke(...)` argument is supplied from CODE and
    marshalled past the binder (PIC-60) to the child's real AJV compile of
    `params.loweredSchema`: pre-fix `{"anyOf":[{},{}]}` admits an out-of-enum
    value (`BAD=ACCEPTED`), post-fix `{"type":"string","enum":["x","y"]}`
    refuses it as `Err(InvokeInfraError { cause: "validation" })`. The theta
    `match`es both `Result` arms, so nothing asserts on `prompt()` resolving.
    Under the neutralisation the cell REDS with `expected 'Reply with exactly:
    GOOD=ACCEPTED BAD…' to contain 'BAD=REJECTED validation'`; restored, it is
    green. Confirmed independently by this orchestrator: 28/28.
  - *Lint and typecheck pass.* Both exit 0, no output.
- **Residuals** — all re-derived at the fixed tree, none filed by this fix:
  1. **`theta/parse/inline-enum` at the `params:` right-hand side.**
     `p: 'enum["x", "y"]'` loads with ZERO diagnostics and lowers `{}`, where
     `schema S { a: enum["x", "y"] }` and `schema S = enum["x", "y"]` both raise
     the registered code. The literal recogniser declines the text, so this fix
     leaves it exactly as it found it. A trigger gap in a different row,
     unfiled. (§Non-goals measured it; re-measured here post-fix.)
  2. **A literal-typed default is still unchecked at LOAD.**
     `p: '"x" | "y" = "zzz"'` loads with zero diagnostics and records
     `defaultSource: "\"zzz\""`, though `frontmatter-fields-a.md:60` requires
     the default's static type to be compatible with the declared type. What
     CHANGED: the lowered fragment now enforces, so the impossible default is
     refused at INVOCATION — real AJV over the lowered document returns `false`
     for `{"p":"zzz"}` where before the fix it returned `true`. The silence is
     therefore no longer total, but it is still a load-time gap: the author
     learns at invocation, not at load.
  3. **`array<"x" | "y">` stays permissive at ALL FOUR positions**
     (`{"type":"array","items":{"anyOf":[{},{}]}}`), because `lowerTypeExpr`
     recurses a generic's argument through ITSELF and never back through the
     literal check. §Non-goals declines it (the remedy is a change to
     `lowerTypeExpr`'s recursion, which `TypeSplitNesting` governs) and pins it
     as a control. Named in passing by 0055 §Non-goals and 0098, OWNED by
     neither — unfiled. Bug 0043 owns the MIXED union, not this.
     **FILED AND DISCHARGED (0.123.0).** This residual is bug
     [0164](./0164-generic-argument-literal-lowers-permissive.md)'s filing
     origin — its §Provenance cites this item — and 0164 §Fix closed it at
     0.123.0 by route (i), the change this item predicted. `array<"x" | "y">`
     now lowers `items: {"type":"string","enum":["x","y"]}` and `array<"x">`
     `items: {"const":"x"}` at all four positions, and `array<null>` takes THIS
     report's own constraint-2 `{"const":null}` settlement at that depth too,
     applied by the same structural means (the consult precedes the primitive
     atom arm; no `null` special case). Cell `d6` was re-derived under 0164 §Fix
     constraint 3, subject preserved. Residuals 1, 2 and 4 above are untouched
     and still open.
  4. **The `-` parse layer still splits the four positions for negative
     numerics.** `p: '-1 | 1'` and `@<-1 | 1>` now agree on `{"enum":[-1,1]}`,
     but `schema S { a: -1 | 1 }` is still lost to
     `theta/parse/empty-schema-body` and `schema X = -1 | 1` to
     `theta/parse/malformed-alias-rhs` plus `theta/parse/unsupported-feature`.
     Bug 0042 is fixed and its fix did not reach the junk `-` arm, so the
     parse-layer gap §Non-goals defers to remains open at HEAD.
- **Discharge notes appended**: bug 0039 §Fix (0.49.0) §Residuals item (viii);
  bug 0055 §Fix (0.59.0); bug 0041 §Fix (0.51.0) group-(e) authority clause.
  Bug 0043 §Non-goals stays accurate — the mixed union did not move — so it
  takes no note.
- **Pinned dispositions / non-goals**: the mixed-union literal arm (0043
  §Non-goals), the generic-argument element type (residual 3), whether `{}`
  should ever be a lowering (0028's inventory), and the `theta/parse/inline-enum`
  trigger gap (residual 1) are all unmoved by design and pinned as controls.

## Coordination note — the §Reproduction collapse is fixed in bug 0263 (0.262.0)

§Reproduction measures the FM-5 collapse in passing and disclaims it, deferring
to bug 0028 §Residuals (iv). That class is filed and fixed as bug
[0263](./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md),
which also covers the leading-quote spelling of the same collapse
(`p: "a" | "b"`, the unwrapped literal union this report's subject is written
in). A frontmatter block the YAML parser rejects now draws the located
`theta/load/malformed-frontmatter-yaml` row rather than `theta/load/missing-mode`.
The lowering dispositions this report pins are unaffected: every row whose
frontmatter parses keeps its measured diagnostics and its measured lowering.
