# Bug 0043 — `lowerTypeExpr` tests for a generic application before it splits a union, so any union whose last arm is `array<T>` is captured whole as one generic: `integer | array<integer>` lowers to `{}` at all four `Type` positions, and an `array`-headed spelling lowers to the concrete wrong type `{"type":"array","items":{}}` while swallowing the `theta/parse/unresolved-named-type` a name inside it owes

- **Status:** open.
- **Kind:** defect, two elements on one frame. (1) *The lowering disagrees with
  SUBS-1.* `docs/spec_topics/schema-subset.md:81` requires that "a union with
  any non-primitive arm MUST lower to `{ "anyOf": [...] }`", and `:77` gives
  `array<T>` its own emission rule (`{ "type": "array", "items": <T-lowered> }`),
  so an `array<T>` union arm is lowerable and must appear as an `anyOf` variant.
  When the union's source text ends with `>` the whole union is consumed by
  `lowerTypeExpr`'s generic-application arm (`src/parser/params.ts:360–375`)
  instead, which runs *before* the union split at `:377–393`. Two outcomes, by
  the text alone: the arm's own permissive return fires (`:374`), or — when the
  text begins `array<` and the mis-sliced argument carries no top-level comma —
  its single-argument `array` branch (`:365–368`) returns
  `{"type":"array","items":{}}`. No spec text defines either emission for a
  union. (2) *A closed-registry diagnostic under-emits in the second outcome.*
  `theta/parse/unresolved-named-type`'s row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:89`) names five
  positions; four of them route through this function. A name written inside the
  `array`-headed spelling (`schema M = array<Ghost> | array<integer>`) resolves
  against nothing and raises nothing, where the same name one arm later
  (`schema M = integer | array<Ghost>`) raises.
- **Related:**
  - [0033](./0033-body-level-schema-alias-unsupported.md) — its §Fix (0.45.0)
    made the alias RHS a lowering position and recorded this behaviour as
    residual (ii): "A union arm shape the shared lowerer does not support
    (e.g. a generic arm) keeps the pre-existing permissive `{}` —
    field-position parity, unchanged." That record is wrong in three ways,
    corrected here: the shared lowerer *does* support `array<T>`
    (`schema M = array<integer> | integer` lowers the spec-correct `anyOf`);
    the `{}` is not confined to one arm but replaces the whole union, so the
    primitive arms are discarded too; and one family of these inputs does not
    lower `{}` at all but a concrete wrong `array` type. The same claim is
    carried in-tree by two comments —
    `src/parser/theta-document.ts:1151–1156` and
    `src/runtime/query-schema-lowering.ts:41–50`, whose arm-2 trigger list
    enumerates `Result<T, E>`, a non-`array` constructor, and an `array<…>`
    whose argument text carries a top-level comma, and omits the union source
    entirely.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — the
    permissive-`{}` inventory in `src/runtime/query-schema-lowering.ts:26–63`
    is that fix's; this defect is a fourth reachable trigger of its **arm 2,
    the non-`array` generic arm** (`:41–50`), plus a first instance of that arm
    producing a typed fragment rather than `{}`.
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — the inline-object-arm sibling. An inline-object union arm keeps the
    permissive `{}` *as one `anyOf` variant*
    (`schema M = integer | {a: string}` → `{"anyOf":[{"type":"integer"},{}]}`),
    which is the shape 0033's residual (ii) describes and 0039 owns; 0039's
    §Fix explicitly leaves "the non-`array` generic arm" to keep its `{}`, so
    the two reports do not overlap.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — the `params:`
    lowerer this frame sits inside; its §Fix (0.44.0) added
    `lowerParamsFieldType` (`src/parser/params.ts:454`) ahead of
    `lowerTypeExpr` for a brace-rooted field root only, so the union path is
    untouched by it. `tests/schema-alias-union-decl.test.ts:1526` (j3) is the
    brace-arm pin that deliberately carries no byte assertion.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/params.ts:360–375` — the frame. `const lt = s.indexOf("<")`
    (`:361`) and `if (lt > 0 && s.endsWith(">"))` (`:362`) test the *whole
    trimmed source* for a generic application, with no check that the `<`
    belongs to a single top-level term. `integer | array<integer>` satisfies
    both, so `ctor` is `"integer | array"` (`:363`) and `args` is the slice
    between the first `<` and the final `>` (`:364`). `ctor !== "array"`, so
    control reaches `:369–374`: each argument is lowered for its resolution
    side effects and `{}` is returned. `array<string> | array<integer>`
    satisfies both *and* yields `ctor === "array"` with a single mis-sliced
    argument (`string> | array<integer`), so `:365–368` returns
    `{type: "array", items: lowerTypeExpr("string> | array<integer")}`, whose
    argument is neither primitive nor identifier-shaped and lands on the
    catch-all at `:409–411` — `items: {}`.
  - `src/parser/params.ts:377–393` — the union split, unreachable for those
    sources. It is correct: each arm is lowered, classified against
    `PRIMITIVE_TYPES` (`:321–327`) and combined by `lowerUnion` (`:392`).
  - `src/parser/schema-lowering.ts:170–195` — `lowerUnion`, which already
    models SUBS-1 in full: `{type:[…]}` when every arm is primitive, otherwise
    `{anyOf:[…]}` in source order over the arms' own lowered fragments. Its
    `LoweredUnionArm` type (`:151–153`) carries a `non-primitive` case for
    exactly this purpose. Nothing in this module is defective.
  - `src/parser/body-type-lowering.ts:131–154` — `lowerTypeSource`, the shared
    entry for the schema-body and alias positions. Its own literal-union
    pre-check (`:139–151`) does not match a union with a non-literal arm, so
    the whole union source is handed to `lowerTypeExpr` (`:153`).
  - `src/parser/body-type-lowering.ts:79` — `lowerObjectFields`'s per-field
    call, the schema-body field position; `:245` — `buildBodyTypeSchemas`
    pass 2's alias-RHS call over `decl.arms.join(" | ")`, the alias position.
  - `src/parser/params.ts:151` — `parseParams`'s per-field call to
    `lowerParamsFieldType`, the `params:` field position; a non-brace-rooted
    root falls straight through to `lowerTypeExpr`.
  - `src/runtime/query-schema-lowering.ts:116–118` — the `@<T>` annotation
    position's inline union/primitive/`array<T>` route, `lowerTypeSource` over
    the verbatim annotation text.
  - `src/runtime/query-schema-lowering.ts:26–63` — the permissive-`{}`
    inventory. `:41–50` (arm 2, the non-`array` generic arm) does not list a
    union source among its triggers, and the inventory has no entry at all for
    a *typed but wrong* fragment, which the `array`-headed spelling produces.
  - `tests/params-inline-object-lowering.test.ts:910–931` — cell e8 already
    names `{"type":"array","items":{}}` as "a fragment asserting arrayness
    while dropping the element shape the author wrote" (`:915–917`), and pins
    `array<{x: integer, y: string}>` to `{}` on the grounds that the `array`
    branch does not match that text. The union route reaches the same fragment
    today, unpinned and unrecorded.
  - `src/parser/theta-document.ts:1151–1163` — `collectBodyTypes`'s comment
    ("a union arm shape that lowerer does not support — e.g. a generic arm —
    keeps its existing permissive `{}`") ahead of the `buildBodyTypeSchemas`
    call at `:1163`. The claim is false in both directions: `array<T>` is
    supported, and what is kept is not the arm's `{}` but the union's.
  - `src/extension/production-theta-producer.ts:4966–4977` —
    `renderTypedAwareQueryText`. `:4975` interpolates
    `JSON.stringify(lowered)` into the QRY-15 instruction verbatim, so `{}`
    and `{"type":"array","items":{}}` are what the model is told to match.
  - `src/runtime/typed-query-validation.ts:347–349` — `respondSchemaSlug`,
    `sha256(JSON.stringify(lowered)).slice(0,16)`, called at `:194` and from
    `src/extension/production-theta-producer.ts:2617` to name the registered
    `__theta_respond_<slug>` tool. Every annotation that lowers `{}` shares
    one name, `__theta_respond_44136fa355b3678a`.
  - `tests/schema-alias-union-decl.test.ts:411` and `:2240` — 0033's own
    legal-recursion cell n25 uses `schema X = integer | array<X>`, the exact
    defect shape. It asserts the arm capture and a clean load, and states that
    typing is "deferred to the runtime AJV net"; that net is `$defs.X = {}`.
    `:289` / `:1321` — `F_UNION_GENERIC_THEN_LET`
    (`schema X = Cat | array<string>`) is a capture cell, likewise carrying no
    lowered-byte assertion.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument`,
  `lowerQueryResponseSchema`, `lowerTypeExpr` / `lowerUnion` and a real
  `Ajv2020` compile; written, run, deleted.

## Summary

`lowerTypeExpr` is the single recursive lowerer behind four of the five
registered `Type` positions. Its arm order asks "is this a generic
application?" before "is this a union?", and it asks the first question of the
whole source string: a `<` anywhere past the first character plus a trailing
`>`. A union whose last arm is `array<T>` answers yes, so the union is never
split.

Two lowerings result, chosen by text the author did not intend as a signal:

- **`{}` — accept-anything.** `schema M = integer | array<integer>` lowers
  `$defs.M = {}`. An AJV envelope built from it accepts `"not an integer"`,
  `{"nope":true}` and `null` — values matching neither arm — and rejects
  nothing.
- **`{"type":"array","items":{}}` — the wrong concrete type.** When the source
  begins `array<`, the mis-sliced argument still presents as one argument, so
  the `array` branch matches. `params: p: array<string> | integer |
  array<boolean>` lowers `properties.p = {"type":"array","items":{}}`: the
  value `3`, which the declared `integer` arm admits, is rejected, and
  `[{"junk":1}]`, which no arm admits, is accepted.

Both are silent at every severity. Reversing the arms fixes both
(`array<integer> | integer` lowers the spec-correct `anyOf`), which localises
the defect to arm precedence rather than to any arm's own lowering: `lowerUnion`
already implements SUBS-1 over non-primitive arms, and `array<T>` already lowers
concretely as a single term.

In the second lowering a `NamedType` inside the union is also lost. `schema M =
integer | array<Ghost>` raises `theta/parse/unresolved-named-type` because the
generic arm lowers its arguments for their resolution side effects; `schema M =
array<Ghost> | array<integer>` raises nothing, because the mis-sliced argument
`Ghost> | array<integer` is not identifier-shaped and never reaches the
resolution arm.

## Reproduction

Offline, at `f959f8de`. Scratch vitest: `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema`, `respondSchemaSlug`, and `Ajv2020` from the
installed `ajv`. `schema Cat { kind: "cat" }` and `schema Dog { kind: "dog" }`
are declared where an arm names them; `Ghost` is declared nowhere.

The alias position is read as `$defs.M` of a `params:` document whose one field
is `a: M`; the schema-body position as `$defs.S`; the `params:` position as
`properties.p`; the annotation position as the whole return of
`lowerQueryResponseSchema`.

### The four positions, one type expression

`integer | array<integer>`, written at each position:

```
@@ alias    schema M = integer | array<integer>
   diags   :: []
   $defs.M :: {}
@@ field    schema S { a: integer | array<integer> }
   diags   :: []
   $defs.S :: {"type":"object","properties":{"a":{}},"required":["a"],"additionalProperties":false}
@@ params   p: integer | array<integer>
   diags   :: []
   props.p :: {}
@@ ann      let r = @<integer | array<integer>>`hi`
   diags   :: []
   captured:: "integer|array<integer>"
   lowered :: {}
@@ ann      schema M = integer | array<integer>   +   @<M>`hi`
   lowered :: {}
```

The quoted `params:` spelling (`p: "integer | array<integer>"`) lowers
byte-identically; the unquoted form is a YAML plain scalar, so bug 0035's
frontmatter frame is not involved.

### The `array`-headed spelling

```
@@ alias    schema M = array<string> | array<integer>
   diags   :: []
   $defs.M :: {"type":"array","items":{}}
@@ field    schema S { a: array<string> | array<integer> }
   diags   :: []
   $defs.S :: {"type":"object","properties":{"a":{"type":"array","items":{}}},"required":["a"],"additionalProperties":false}
@@ params   p: array<string> | integer | array<boolean>
   diags   :: []
   props.p :: {"type":"array","items":{}}
@@ ann      @<array<Cat> | array<Dog>>
   lowered :: {"type":"array","items":{}}
```

`array<Cat> | array<Dog>` loses both `$refs` and both `$defs` entries; nothing
in the lowered document mentions `Cat` or `Dog`.

### The swallowed name

```
@@ schema M = integer | array<Ghost>
   diags   :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
   $defs.M :: {}
@@ schema M = array<Ghost> | array<integer>
   diags   :: []
   $defs.M :: {"type":"array","items":{}}
@@ schema M = array<integer> | array<Ghost>
   diags   :: []
   $defs.M :: {"type":"array","items":{}}
```

Same at the field, `params:` and annotation positions, byte for byte.

### Real AJV over the lowered documents

Compiling the `params:` document for `a: M` under `schema M = integer |
array<integer>` (`{"type":"object","properties":{"a":{"$ref":"#/$defs/M"}},
"required":["a"],"additionalProperties":false,"$defs":{"M":{}}}`):

```
{"a":3}                 -> true      (matches the `integer` arm)
{"a":[1,2]}             -> true      (matches the `array<integer>` arm)
{"a":"not an integer"}  -> true      (matches NEITHER arm)
{"a":{"nope":true}}     -> true      (matches NEITHER arm)
{"a":null}              -> true      (matches NEITHER arm)
{"a":[{"deep":1}]}      -> true      (matches NEITHER arm)
```

Compiling `properties.p = {"type":"array","items":{}}` for `p: array<string> |
integer | array<boolean>`:

```
{"p":["a"]}        -> true
{"p":[true]}       -> true
{"p":[1,2]}        -> true   (matches NO arm — `array<integer>` is not declared)
{"p":[{"junk":1}]} -> true   (matches NO arm)
{"p":3}            -> false  (matches the declared `integer` arm — REJECTED)
{"p":"hi"}         -> false
```

### Controls

```
@@ schema M = array<integer> | integer     $defs.M :: {"anyOf":[{"type":"array","items":{"type":"integer"}},{"type":"integer"}]}
@@ schema M = integer | array<string> | string
                                          $defs.M :: {"anyOf":[{"type":"integer"},{"type":"array","items":{"type":"string"}},{"type":"string"}]}
@@ schema M = integer | string            $defs.M :: {"type":["integer","string"]}
@@ schema M = Cat | Dog                   $defs.M :: {"anyOf":[{"$ref":"#/$defs/Cat"},{"$ref":"#/$defs/Dog"}]}
@@ schema M = array<integer>              $defs.M :: {"type":"array","items":{"type":"integer"}}
@@ schema X = array<X>  (self)            $defs.X :: {"type":"array","items":{"$ref":"#/$defs/X"}}
@@ schema M = string | Result<integer, string>
   diags :: ["error theta/parse/result-in-schema-position: 'Result' has no lowered-schema form and is not permitted in a schema-feeding position"]
                                          $defs.M :: {}
```

Reading the controls:

- **Arm order is the whole difference.** `array<integer> | integer` and
  `integer | array<integer>` carry the same two arms and the same lowerer. The
  first lowers per SUBS-1; the second lowers `{}`.
- **A generic that is not last is fine.** `integer | array<string> | string`
  does not end with `>`, so the generic test fails and the union splits.
- **Primitive-only and named-only unions are unaffected** — 0033's c3 and c1
  cells (`tests/schema-alias-union-decl.test.ts`) pin both.
- **A single `array<T>`, including a self-recursive one, lowers concretely.**
  The `array` arm itself is correct; only its precedence over the union split
  is not.
- **`Result` in a union arm is loud**, so the generic arm is not silent for
  every input that reaches it — the parse gate refuses that one first.

### Legal recursion 0033's fix protects

```
@@ schema X = integer | array<X>   +   params a: X
   diags   :: []
   $defs.X :: {}
@@ schema X = array<X> | integer   +   params a: X
   $defs.X :: {"anyOf":[{"type":"array","items":{"$ref":"#/$defs/X"}},{"type":"integer"}]}
```

`schema X = integer | array<X>` is the fixture of 0033's cell n25
(`tests/schema-alias-union-decl.test.ts:411`, `:2240`), which admits the
declaration and defers typing to "the runtime AJV net". That net is `{}`.

### Slug collapse

```
respondSchemaSlug({})                                  -> 44136fa355b3678a
respondSchemaSlug({"type":["integer","string"]})       -> 28d8af6e8cf33469
respondSchemaSlug({"anyOf":[{"type":"integer"},{}]})   -> e577312c6a118b2e
```

Every `@<T>` whose annotation lowers `{}` — this defect's family, an
undeclared-but-in-scope import, a `Result<T,E>`-typed binding — registers under
the one name `__theta_respond_44136fa355b3678a`.

## Expected behaviour

- `docs/spec_topics/schema-subset.md:81` (SUBS-1): a union with any
  non-primitive arm lowers to `{"anyOf":[...]}`, arms in source order.
  `docs/spec_topics/schema-subset.md:77` gives the `array<T>` variant its
  bytes. So:

  ```
  integer | array<integer>          -> {"anyOf":[{"type":"integer"},{"type":"array","items":{"type":"integer"}}]}
  array<string> | array<integer>    -> {"anyOf":[{"type":"array","items":{"type":"string"}},{"type":"array","items":{"type":"integer"}}]}
  array<Cat> | array<Dog>           -> {"anyOf":[{"type":"array","items":{"$ref":"#/$defs/Cat"}},{"type":"array","items":{"$ref":"#/$defs/Dog"}}]}
  integer | array<X>   (self)       -> {"anyOf":[{"type":"integer"},{"type":"array","items":{"$ref":"#/$defs/X"}}]}
  ```

  The first two are what the shipped `splitTopLevel` + `lowerTypeExpr` +
  `lowerUnion` already produce when the union split is reached; the AJV
  document compiled from the first accepts `3` and `[1,2]` and rejects `"no"`,
  `["s"]`, `{"a":1}` and `null`.
- `docs/spec_topics/grammar.md:94` admits `Type "|" Type` with `Type`
  recursive, `:99` gives `GenericType ::= "array" "<" Type ">"`, and `:105`
  names union arms as a bare-`Type` position. An `array<T>` union arm is
  ordinary grammar, not an edge case.
- `docs/spec_topics/type-system.md:15` applies one type grammar to every
  annotation position, so the four positions above lower one type expression
  identically. They do today — identically wrongly.
- `docs/spec_topics/diagnostics/code-registry-parse.md:89`: a `NamedType` in
  any of the row's five positions that resolves to no declaration raises
  `theta/parse/unresolved-named-type`. `array<Ghost> | array<integer>` raises
  exactly one such diagnostic naming `Ghost`, byte-identical to what
  `integer | array<Ghost>` raises.
- `docs/spec_topics/schemas.md:119` (§Recursion) and `:143` admit recursion
  guarded by a structural constructor, so `schema X = integer | array<X>`
  lowers to the self-`$ref` `anyOf` above rather than to a fragment that
  validates nothing.

## Actual behaviour / root cause

One frame, `src/parser/params.ts:360–375`.

`lowerTypeExpr` dispatches by testing the trimmed source against arm shapes in
a fixed order. The first test is for a generic application:

```ts
const lt = s.indexOf("<");
if (lt > 0 && s.endsWith(">")) {
  const ctor = s.slice(0, lt).trim();
  const args = splitTopLevel(s.slice(lt + 1, s.length - 1), ",");
  if (ctor === "array" && args.length === 1) {
    const first = args[0] ?? "";
    return { type: "array", items: lowerTypeExpr(first, lowerCtx) };
  }
  // Any other generic (e.g. `Result<T, E>`, which has no lowered-schema form):
  // resolve nested named types best-effort, lower permissively.
  for (const arg of args) {
    lowerTypeExpr(arg, lowerCtx);
  }
  return {};
}
```

The predicate is positional, not structural: a `<` anywhere past index 0 and a
final `>`. Every union whose last arm is `array<T>` satisfies it, because that
arm's own closing `>` is the source's last character. The union split at `:377`
— which would have handed each arm to this same function separately, where
`array<T>` lowers correctly — is never reached, because the generic arm returns
first.

What is returned depends on the text between the first `<` and the final `>`:

- `ctor` is everything before the first `<`. For `integer | array<integer>`
  that is `"integer | array"`, which is not `"array"`, so control falls to
  `:369–374`: the `args` are lowered for their resolution side effects (which is
  why a name in the *last* arm still reaches `theta/parse/unresolved-named-type`)
  and `{}` is returned. Every arm's shape, including the primitive ones, is
  discarded.
- When the source begins `array<`, `ctor` *is* `"array"`. `args` is
  `splitTopLevel` over the slice between the first `<` and the final `>` —
  `"string> | array<integer"` for `array<string> | array<integer>` — and that
  slice carries no top-level comma, so `args.length === 1` and the single-argument
  `array` branch matches. The recursive call on the slice finds no `<`-with-
  trailing-`>` (the slice ends in `r`), and `splitTopLevel` does not split its
  `|` either: the leading `string>` drives the angle depth to `-1`, so the `|`
  is not at depth 0. One arm, not primitive, not identifier-shaped, so the
  catch-all at `:409–411` returns `{}`. The result is
  `{"type":"array","items":{}}` — a typed fragment asserting an array of
  anything, for a union that admits non-arrays.

That second path is also where the name resolution is lost: the slice is never
identifier-shaped, so `lowerCtx.unresolved` (`:403`) is never appended to, and
the diagnostic loop in `parseParams` / the body-type walker has nothing to
report.

The `{"type":"array","items":{}}` fragment is already named in-tree as a hazard,
on the other route into the same branch:
`tests/params-inline-object-lowering.test.ts:915–917` calls it "a fragment
asserting arrayness while dropping the element shape the author wrote", and pins
`array<{x: integer, y: string}>` to `{}` precisely because the `array` branch
does *not* match that text. A union source makes the branch match.

Everything downstream of the frame is correct. `lowerUnion`
(`src/parser/schema-lowering.ts:170–195`) implements SUBS-1 in both directions
and its `LoweredUnionArm` type (`:151–153`) already carries the `non-primitive`
case. `lowerTypeSource` (`src/parser/body-type-lowering.ts:131–154`) forwards
the whole union source unchanged after its literal-union pre-check declines it.
The four positions reach the frame through
`lowerObjectFields` (`body-type-lowering.ts:79`),
`buildBodyTypeSchemas` pass 2 (`:245`), `parseParams` (`params.ts:151`) and
`lowerQueryResponseSchema` (`query-schema-lowering.ts:118`); none of them
inspects the result, so all four inherit the frame's answer byte for byte.

The behaviour is pre-existing: `lowerTypeExpr`'s arm order predates 0033, which
only added the alias RHS as a fourth position reaching it. What 0033 added was
the record — residual (ii) — and that record mis-describes the mechanism
(see §Related), as do the two in-tree comments at
`src/parser/theta-document.ts:1151–1156` and
`src/runtime/query-schema-lowering.ts:41–50`.

## Why it matters

- The lowered fragment is the only validation a typed query's response gets.
  A `{}` root means the QRY-22 gate constrains nothing: any payload binds as
  the typed value. `docs/spec_topics/schema-subset.md:11` and `:81` are what an
  author reads to decide the declaration is worth writing.
- The `array`-headed spelling does not fail open: it rejects values the declared
  type admits. A `params:` field declared
  `array<string> | integer | array<boolean>` refuses `3` from a slash
  invocation or a binder inference, with a validation failure naming a type the
  author did not write, while accepting `[{"junk":1}]`, which no arm admits.
- The lowered bytes are conveyed to the model, not only enforced. `:4975` of
  `src/extension/production-theta-producer.ts` interpolates
  `JSON.stringify(lowered)` into the QRY-15 instruction
  (`docs/spec_topics/query/query-tool-loop.md:37`,
  `docs/spec_topics/query/query-failure-and-repair.md:42`), so the model is
  told to match `{}` or `{"type":"array","items":{}}` for a union the author
  spelled out. Grammar-constrained decoding has nothing to constrain.
- The respond tool's identity is derived from the same bytes.
  `respondSchemaSlug` (`src/runtime/typed-query-validation.ts:347`) hashes
  `JSON.stringify(lowered)`, so every distinct annotation that lowers `{}`
  registers under `__theta_respond_44136fa355b3678a` — one tool name for
  unrelated declared shapes, and the PIC-44 registration cache reuses the first
  registration by construction.
- One of the five registered positions of a closed DIAG-2 row under-emits for
  the `array`-headed family at all four lowering positions, so the row
  over-states what the implementation does. The same condition 0035 closed for
  the `params:` position and 0039 files for the inline-object interior.
- The behaviour is order-sensitive in a way nothing surfaces. Two declarations
  an author would read as equivalent — `integer | array<integer>` and
  `array<integer> | integer` — differ between accept-anything and correct, with
  no diagnostic distinguishing them. 0033's own recursion cell n25 sits on the
  losing side.
- No gate scores it. No committed `.theta` or `.thetalib` fixture carries a
  union whose last arm is a generic
  (`rg '\| *array<' --glob '*.theta' --glob '*.thetalib'` is empty), so
  `tests/committed-fixture-parse-gate.test.ts` never witnesses it, and the two
  in-tree fixtures that do carry the shape
  (`tests/schema-alias-union-decl.test.ts:289`, `:411`) assert capture and
  clean loading, not lowered bytes.

## Fix

Split the union before testing for a generic application: in `lowerTypeExpr`
(`src/parser/params.ts:357`), move the union block at `:377–393` above the
generic block at `:360–375`. One frame, one reordering; no new arm, no change
to `lowerUnion`, `lowerTypeSource`, or any of the four callers.

The reordering is a no-op for every source without a top-level `|`.
`splitTopLevel(s, "|")` (`src/parser/params.ts:621`) tracks angle depth, so
`array<integer|string>` yields one arm and falls through to the generic block
exactly as today; so do `array<integer>`, `Result<integer, string>`, every
primitive, every identifier and every literal. Only a source with a `|` at
depth 0 changes behaviour, and for those the per-arm path is the one the
controls above already exercise: each arm is lowered by the same function as a
single term, classified against `PRIMITIVE_TYPES`, and combined by `lowerUnion`
in source order per SUBS-1 and the *Array element order* clause
(`docs/spec_topics/schema-subset.md:85`).

The name-resolution under-emission closes with it: each arm lowers through the
identifier arm at `:399–408`, so `Ghost` in any arm of any spelling appends to
`lowerCtx.unresolved` and raises `theta/parse/unresolved-named-type` at all
four positions. No registry edit — the row already names them
(`docs/spec_topics/diagnostics/code-registry-parse.md:89`).

**The three stale records are corrected in the same change**, since each states
the behaviour this removes: 0033 §Fix (0.45.0) residual (ii),
`src/parser/theta-document.ts:1151–1156`, and the arm-2 trigger list of the
permissive-`{}` inventory at `src/runtime/query-schema-lowering.ts:41–50`. The
inventory's arm 2 keeps its other three triggers (`Result<T, E>`, a non-`array`
constructor, an `array<…>` whose argument text carries a top-level comma); what
is deleted is the union source, which after the fix cannot reach it.

**Blast radius.** The lowered bytes move for exactly the inputs enumerated in
§Reproduction, and those bytes are both AJV-enforced and conveyed on the wire:

- **QRY-15 text and respond-tool names change for affected annotations.** An
  `@<T>` that lowered `{}` now lowers an `anyOf`, so
  `renderTypedAwareQueryText`'s interpolation
  (`src/extension/production-theta-producer.ts:4975`) and the
  `respondSchemaSlug` (`src/runtime/typed-query-validation.ts:347`) that names
  the registered tool both change. That is the correction, not a regression:
  today's slug is the slug of a schema the author did not declare. The
  annotation also crosses the object-root boundary in
  `src/runtime/respond-tool-wire.ts:73` — a `{}` root is
  argument-object-satisfiable and registers verbatim, an `anyOf` root is not
  and registers under the `value` envelope (`:91`; the root test is
  `rootIsArgumentObjectSatisfiable`, `:55–70`) — so the affected
  annotations move from the pass-through form to the enveloped form. Both forms
  are specified (`docs/spec_topics/query/query-failure-and-repair.md:42`); the
  fix's evidence enumerates which annotations cross.
- **Payloads that validated will start failing.** Any value accepted only by
  the permissive `{}` (or by `items:{}`) is refused and routes through QRY-11
  repair; conversely, a value the `array`-headed fragment refused — `3` against
  `array<string> | integer | array<boolean>` — is accepted. Thetas that load
  unchanged change runtime outcome, so the affected shapes are enumerated in
  the fix's evidence rather than discovered by users. The
  [GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  covers the newly-refused typo inputs (the `array`-headed spelling naming an
  undeclared type); the lowered-byte and validation changes are the SUBS-1
  correction, not a source-language change.
- **No existing pin inverts.** No committed `.theta` / `.thetalib` fixture
  carries the shape. The two in-tree fixtures that do
  (`tests/schema-alias-union-decl.test.ts:289` `schema X = Cat | array<string>`,
  `:411` `schema X = integer | array<X>`) assert arm capture, statement
  integrity and clean loading, none of which moves; n26 (`schema X = array<X>`,
  no top-level `|`) and j3 (brace arms, no `<`) are outside the changed set;
  0033's c1/c2/c3 and `tests/params-inline-object-lowering.test.ts`'s e8
  (`:910–931`, `array<{x: integer, y: string}>` → `{}`) and e6 (`:934–941`,
  `array<{}>` → `items: {}`) are all single-term or `|`-free sources and stay
  byte-identical.
- **The type layer is untouched.** `collectTypeEnv`'s alias entries and 0033's
  cycle-participant omission are keyed to the parsed arms, not to the lowered
  fragment, so `schema X = integer | array<X>` keeps its clean load and gains
  a fragment AJV can enforce.

**Test witness — unit, offline, no live provider.** Every fixture in
§Reproduction is a `parseThetaDocument` or `lowerQueryResponseSchema` call.
Required beyond the probes: byte pins at all four positions for both spellings
and for the reversed-arm controls, proving the four agree; a real-AJV
accept/reject table over the lowered document for both spellings, including the
`{"p":3}` cell that inverts; a `theta/parse/unresolved-named-type` parity cell
across `integer | array<Ghost>`, `array<Ghost> | array<integer>` and
`array<integer> | array<Ghost>` at all four positions; a `respondSchemaSlug`
cell showing the affected annotation no longer hashes to
`44136fa355b3678a`; and no-op cells for `array<integer|string>`,
`Result<integer, string>`, `array<{x: integer, y: string}>` and `array<{}>`
proving the single-term path is byte-unchanged.

## Non-goals

- **Inline-object union arms.** `schema M = integer | {a: string}` lowers
  `{"anyOf":[{"type":"integer"},{}]}` — one permissive variant inside an
  otherwise correct `anyOf`, from the trailing catch-all rather than from the
  generic arm.
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  owns that arm and its §Fix names the inline-object shape explicitly. Nothing
  here changes it.
- **The other three triggers of the permissive-`{}` arm 2.** `Result<T, E>`
  propagated off a `let` annotation, a non-`array` constructor application, and
  an `array<…>` whose argument text carries a top-level comma keep their `{}`
  (`src/runtime/query-schema-lowering.ts:41–50`;
  `tests/params-inline-object-lowering.test.ts:910–931` pins the third).
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory continues to cover them.
- **A literal arm of a mixed union.** `"a" | Triage` lowers
  `{"anyOf":[{},{"$ref":…}]}` because literal recognition lives only in
  `lowerTypeSource`'s top-level check
  (`src/parser/body-type-lowering.ts:139–151`). Unfiled, unchanged here.
- **`splitTopLevel`'s angle-only default nesting.** A brace-carrying union
  source (`{a: string | null}`) still splits inside the braces. That is 0039's
  and 0035's subject; the reordering neither improves nor worsens it, because
  such a source reaches the union split today as well.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments — a diagnostic, a refusal, or the present silence — is
  0028's inventory question, not this report's.

## Provenance

- Origin: bug [0033](./0033-body-level-schema-alias-unsupported.md) review
  round 4 finding F3 — a comment-truth finding whose probes exposed the
  observable. The finding was recorded as 0033 §Fix (0.45.0) residual (ii)
  and summarised in `.pi/tmp/fixes/0033-report.md:11` ("generic union arms keep
  permissive {} (field parity)"), left unfiled. This report files it,
  re-derives it at HEAD, identifies the frame the record does not name, and
  corrects the record in three places: the shared lowerer supports `array<T>`;
  the `{}` replaces the whole union rather than one arm; and the `array`-headed
  family lowers a wrong typed fragment rather than `{}`, with the
  `theta/parse/unresolved-named-type` under-emission that goes with it.
- Spec: `docs/spec_topics/schema-subset.md:11` (nullability via SUBS-1), `:77`
  (the `array<T>` emission rule), `:81`
  ([SUBS-1](../spec_topics/schema-subset.md#subs-1)), `:82` (discriminated
  object union), `:83` (mixed `anyOf`), `:85` (*Array element order*);
  `docs/spec_topics/grammar.md:94` (`Type "|" Type`), `:99`
  (`GenericType ::= "array" "<" Type ">"`), `:105` (bare `Type` in union arms),
  `:107` (§Generic-application constructors — the closed set and the
  `result-in-schema-position` rule for union arms);
  `docs/spec_topics/type-system.md:15` (one type grammar per annotation
  position); `docs/spec_topics/schemas.md:119` (§Recursion), `:143` (the
  pure-alias cycle rule that admits `array`-guarded recursion);
  `docs/spec_topics/diagnostics/code-registry-parse.md:89`
  (`theta/parse/unresolved-named-type`, the five-position row);
  `docs/spec_topics/query/query-tool-loop.md:37` (QRY-15 conveyance);
  `docs/spec_topics/query/query-failure-and-repair.md:42` (`<schema-json>` over
  the respond tool's wire schema);
  `docs/spec_topics/governance/source-language-stability.md:25` (the
  diagnostic-registry carve-out). User-facing reference:
  `docs/reference/schema-subset.md:153–158` (SUBS-1 and its vectors).
- Implementation evidence at `f959f8de`: `src/parser/params.ts:151`
  (`parseParams`'s per-field call), `:321–327` (`PRIMITIVE_TYPES`), `:357`
  (`lowerTypeExpr`), `:360–375` (the generic-application arm — the frame,
  single-argument `array` branch `:365–368`, permissive return `:374`),
  `:377–393` (the union split), `:392` (the `lowerUnion` call), `:399–408` (the
  identifier arm, `unresolved` append at `:403`), `:409–411` (the trailing
  catch-all), `:454` (`lowerParamsFieldType`), `:621` (`splitTopLevel` and its
  angle-depth tracking); `src/parser/schema-lowering.ts:139`
  (`LoweredPrimitiveType`), `:151–153` (`LoweredUnionArm`), `:160–162`
  (`LoweredUnion`), `:170–195` (`lowerUnion`);
  `src/parser/body-type-lowering.ts:70–92` (`lowerObjectFields`, per-field call
  at `:79`), `:131–154` (`lowerTypeSource`, literal pre-check `:139–151`,
  forward `:153`), `:245` (`buildBodyTypeSchemas` pass 2's alias-RHS call);
  `src/parser/theta-document.ts:1151–1163` (`collectBodyTypes`'s stale comment
  and the `buildBodyTypeSchemas` call);
  `src/runtime/query-schema-lowering.ts:26–63` (the three-`{}` inventory),
  `:41–50` (arm 2, whose trigger list omits the union source), `:88`
  (`lowerQueryResponseSchema`), `:99–107` (the named-annotation route), `:116–118`
  (the inline union route); `src/runtime/respond-tool-wire.ts:55–70`
  (`rootIsArgumentObjectSatisfiable`), `:73` (`respondSchemaIsEnveloped`), `:91`
  (`respondToolWireSchema`); `src/runtime/typed-query-validation.ts:194`,
  `:347–349` (`respondSchemaSlug`);
  `src/extension/production-theta-producer.ts:2617` (the respond-tool
  registration), `:4966–4977` (`renderTypedAwareQueryText`, the `:4975`
  interpolation).
- Test evidence at `f959f8de`: `tests/schema-alias-union-decl.test.ts:289`
  (`F_UNION_GENERIC_THEN_LET`) and `:1321` (its only use — a capture cell);
  `:411` (`F_RECURSIVE_UNION_TYPED_LET`) and `:2240` (cell n25, which defers
  typing to the AJV net); `:996` (c1, named arms → `anyOf` of `$ref`s), `:1002`
  (c2, arm order), `:1011` (c3, primitive-only → `{"type":[…]}`), `:1024` (c4,
  the real-AJV round trip), `:1526` (j3, brace arms, no byte pin), `:2259`
  (n26, `schema X = array<X>` → self-`$ref`);
  `tests/params-inline-object-lowering.test.ts:910–931` (cell e8 — the
  top-level-comma trigger's `{}` pin and the `items: {}` hazard note at
  `:915–917`), `:934–941` (cell e6, `array<{}>` → `items: {}`);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which carries the shape).
- Reproduction: scratch vitest at `f959f8de` — the four positions over
  `integer | array<integer>` (alias, schema-body field, quoted and unquoted
  `params:`, `@<T>` both inline and via an alias name); the `array`-headed
  spelling over the same four; the `Ghost` resolution triple; nine controls;
  the recursion pair; real `Ajv2020` compiles of both lowered documents; and
  `respondSchemaSlug` over the three fragments. Run on the outputs quoted
  above, then deleted per scratch policy.
