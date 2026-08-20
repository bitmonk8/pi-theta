# Bug 0061 — Type text that no `Type` production spells is kept verbatim and lowered to the permissive `{}` with zero diagnostics at the two non-`params:` schema positions: an operator absorbed into an alias arm (`schema X = Cat +` → arm `"Cat+"`, `$defs.X = {}`) and the field-position dangling `|` (`schema S { a: Cat | }` → `properties.a = {}`) both load clean, and the type-grammar seam that already runs over the same text reports only its three position rules

- **Status:** fixed (0.87.0). §Fix's one open disposition — the emission point —
  was adjudicated to the lowering sink (option (b), through bug 0059's landed
  `LowerCtx.unspellable`); every other constraint shipped as written, and the
  four pins constraint 7 licenses moved two, held two, and needed one operator
  grant for three further cells (§Fix (0.87.0)). **Coordination with
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) (open) and
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) (fixed
  0.86.0)** — all
  three move behaviour on the one shared lowering path
  (`src/parser/params.ts:391–470`), none of them needs another's fix, and
  whichever lands last re-derives the others' pins (§Fix *Coordination*).
- **Kind:** defect, two elements on one frame.
  1. *Text outside the `Type` production is accepted at two type positions and
     lowers permissively.* `Type` is closed
     (`docs/spec_topics/grammar.md:90`–`:102`: `PrimitiveType`, `NamedType`,
     `GenericType`, `ObjectType`, a union, `LiteralType`), it is the same
     grammar in every annotation position (`type-system.md:15`,
     `grammar.md:105`), schema "field types are any expression from the Type
     System grammar" (`schemas.md:17`), and the alias right-hand side "is
     exactly an `AliasRhs`" — one `Type` or several separated by a single `|`
     (`schemas.md:62`). `Cat+`, `Cat.`, `string+`,
     `Cat|`, `|string`, `|`, `???` and `+` are none of them. Each is recorded
     as the declaration's arm or the field's `typeSource`, lowers to `{}`
     through `lowerTypeExpr`'s trailing catch-all
     (`src/parser/params.ts:467–469`), and produces no diagnostic at any
     severity — so the registration gate `hasLoadParseError`
     (`src/extension/production-composition.ts:1894–1901`), which tests error
     severity only, never fires, and AJV accepts every JSON value at that
     position.
  2. *The two positions disagree, and the position that reports is the one
     whose lowering survives.* Since bug
     [0042](./0042-schema-decl-same-line-residue-silent.md)'s fix (0.52.0)
     `schema X = Cat |` draws `theta/parse/malformed-alias-rhs` **and** lowers
     `$defs.X` to `{"$ref":"#/$defs/Cat"}` — the dangling `|` is dropped by the
     arm filter before lowering. The same author error one position over,
     `schema S { a: Cat | }`, draws nothing and lowers `properties.a` to `{}`,
     because the `|` survives into `typeSource` and defeats every arm of the
     lowerer. `schema S { a: -1 }` draws `theta/parse/empty-schema-body` where
     the alias position draws `malformed-alias-rhs`. The disagreement is
     **pinned, not drift**: 0042 §Fix constraint 4 (`:591–593`) reads "The
     field-position controls (fixtures 1d, 2a, 3b) belong to the acceptance set
     either way: a change at the alias position that also moves the object
     body's behaviour is out of scope", and that fix's record (`:470–472`)
     states the controls are unmoved and the object body byte-identical.
- **Related:**
  - [0042](./0042-schema-decl-same-line-residue-silent.md) — **the filing
    origin, fixed in 0.52.0.** Its §Fix (0.52.0) *Residuals* (i) (`:501–507`)
    and (ii) (`:507–512`) are this report's two sub-classes, left unfiled.
    Residual (i) names the general case in its own words: "the general case is
    arm-text validation against the type grammar, which is shared by all four
    `Type` positions". The boundary is drawn in the registry itself: the
    *Trigger* of `theta/parse/malformed-alias-rhs`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:87`) closes with
    "and an operator with no operand behind it is absorbed INTO the arm rather
    than left at the boundary (`schema X = Cat +`, `schema X = string +`), so
    nothing is left over at the boundary and no token stands there for this row
    to name", mirrored at `schemas.md:64` and
    `docs/reference/schema-subset.md:68–70`. 0042 owns the *boundary token* a
    completed capture leaves behind; this report owns the *text the capture
    kept*. The two are disjoint by the mechanism: `schema X = Cat + 1` fires
    0042's code at the severed `1`, and `schema X = Cat +` fires nothing
    because the `+` joined the arm.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — the fix (0.45.0)
    that made the alias/union declaration parse and made its arms a lowering
    position (`src/parser/body-type-lowering.ts:566`). Its §Fix (0.45.0)
    *Residuals* (ii) (`:209–211`) records "A union arm shape the shared lowerer
    does not support (e.g. a generic arm) keeps the pre-existing permissive
    `{}` — field-position parity, unchanged"; that record is about arms the
    grammar admits (0043's subject), where this report's arms are not `Type`
    expressions at all. 0033's witness file
    `tests/schema-alias-union-decl.test.ts` carries the two field-position
    controls this report inverts, at `:2235–2241` (the dangling `|`) and
    `:2409–2416` (the `-1`).
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — **open**, and
    the adjacent frame on the same function. It owns `lowerTypeExpr`'s **arm
    ordering**: the generic-application test runs before the union split
    (`params.ts:394–409` before `:411–427`), so a *grammar-admitted* union whose
    last arm ends `>` is consumed whole. That defect changes which arm a
    well-formed union reaches. This report owns text that reaches the trailing
    catch-all (`:467–469`) whatever the ordering, and a fix here must not depend
    on the arm order 0043 changes.
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
    **open**, the same input class at the fourth `Type` position. 0059 owns
    non-type text arriving through a `params:` **scalar** (`p: "a: Tirage"`, the
    block-scalar spellings, prose, punctuation, the empty spelling), where the
    text is additionally recorded on `BypassParamsField.type` and rendered into
    the binder's `Parameters:` block. This report owns the two positions inside
    the theta body — a `schema` object-body field type and a `schema X = …`
    alias arm — which have no `BypassParamsField` and no binder render. The two
    input sets are disjoint by position and land on one catch-all; §Fix's
    per-position blast-radius constraint is what keeps them separable.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **open**, the complementary failure at the same two positions. 0044 owns
    keyword-shaped text drawing the **wrong** registered diagnostic
    (`schema X { f: match }` → `unresolved named type 'match'`, where a reserved
    keyword is not an `Ident` and so not a `NamedType`). This report owns junk
    text drawing **no** diagnostic. The two meet at one measured row:
    `schema S { a: void }` emits `void-in-non-return-position` plus 0044's
    spurious `unresolved-named-type`, while `schema S { a: void + }` emits the
    first alone — the absorbed operator suppresses the name-shaped read
    entirely (§Reproduction).
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **open**, and the reason the empty inline object is not this report's. `{}`
    is a grammar-admitted `ObjectType` (`grammar.md:109`) whose prescribed
    `theta/parse/empty-schema-body` is unimplemented at every position; that
    disposition is 0045's. Junk text is not an `ObjectType`, and a recogniser
    here must decline `{}` rather than refuse it.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — fixed
    in 0.38.0; owns the permissive-`{}` inventory and the question of whether
    `{}` should ever be a lowering. This report removes reachable triggers of the
    catch-all at two positions; it does not reopen that question.
- **Affected** (every citation verified at HEAD `9c961f7f`, 0.52.0):
  - `src/parser/theta-document.ts:2915–3037` — **`parseType`, the capture that
    accepts any bytes.** The loop joins the current token's text unconditionally
    (`:3026`) and breaks only on a closed stop set: `stmt-sep` (`:2939`), a
    depth-0 `,` / `)` / `{` / `}` / `=` (`:2982–2992`), the field boundary
    (`:3006–3016`, a value-ish token after a completed atom with no intervening
    `|`), and — in `aliasArmBoundary` mode only — an `ALIAS_ARM_STOP_PUNCT` head
    (`:2943–2951`), a completed-arm `-` (`:2962–2971`) and an arm-start
    `ALIAS_ARM_STOP_KEYWORDS` head (`:2972–2981`). `+`, `.`, `*`, `/`, `%`, `==`,
    `&&`, `?` and `:` are in no stop set at either position, so they join the
    type source. No arm of the loop asks whether what it accumulated derives
    from `Type`.
  - `:2396–2422` — `finishAliasSchema`. One capture (`:2397`), one split
    (`:2404`), the non-empty filter that produces `arms` (`:2405`), and
    `emitMalformedAliasRhs` (`:2420`). The declaration is returned carrying
    whatever arm strings the filter left (`:2421`).
  - `:2452–2480` — `emitMalformedAliasRhs`, bug 0042's emission. Two shapes:
    a segment-count/arm-count mismatch (`:2459–2468`), and a residue head at the
    cursor on the declaration's last line (`:2469–2479`). Both read the split and
    the cursor; neither reads the arm text. This is why `schema X = Cat +` — one
    segment, one arm, nothing at the cursor — is silent.
  - `:2522–2604` — `parseSchemaObjectBody`. The field type is one
    `this.parseType(true)` (`:2570`) recorded verbatim into `typeSource`
    (`:2571–2575`) with no check. The comma rule (`:2585–2601`) fires only when
    the token after a field is an `ident` / `keyword` (`:2589–2591`), so a punct
    residue never reaches it.
  - `src/parser/type-grammar.ts:67–81` — **`parseTypeExpression`, the seam that
    owns the type grammar and does run over this text.** It parses, and when the
    parse yields nothing it returns an empty diagnostic list (`:75–77`); when the
    parse yields a node it walks it for exactly three position rules — `void`,
    generic arity, `Result` in a schema-feeding position (`:78–80`, the walk at
    `:311+`). It never reports that a source is not a `Type`. Three tolerance
    points make that structural: `parse()` does not require the token stream to
    be consumed (`:186–189`), `parsePrimary` skips unexpected punctuation to
    stay tolerant (`:216–231`, the comment at `:228`), and `parseUnion` /
    `parseObject` break out of their loops on a failed arm or field
    (`:197–203`, `:287–304`).
  - `src/parser/theta-document.ts:5627–5630` — the alias position's call:
    `checkInlineEnumForm` then `parseTypeExpression(arm, "schema-feeding", site)`
    per arm, with the comment (`:5615–5626`) stating that an arm "answers to
    exactly what the object form's field-type position answers to". `:6026–6047`
    — the field position's call, the same pair per field, plus the
    `collectUnresolvedNamedTypes` walk at `:6045–6046`; the alias position's
    equivalent walk is `:5647–5648`.
  - `src/parser/body-type-lowering.ts:670–685` — `collectUnresolvedNamedTypes`,
    the name walk both positions drive. It resolves through the same
    `lowerTypeSource` / `lowerTypeExpr` path, so a name is a resolution
    candidate only when the whole atom matches `IDENTIFIER`
    (`params.ts:357`, `/^[A-Za-z_][A-Za-z0-9_]*$/`). `Ghost+` does not, which is
    why the absorbed operator also suppresses `theta/parse/unresolved-named-type`.
  - `:335–414` — `lowerTypeSource`, the body positions' lowering entry: the
    literal check (`:358–369`), the brace-rooted hoist (`:394–396`), the
    inline-object union arm (`:398–411`), and the fall-through
    `return lowerTypeExpr(s, ctx)` (`:413`). `:109–138` — `lowerObjectFields`,
    which calls it once per field (`:119–125`); `:566` — the alias arm call,
    `lowerTypeSource(decl.arms.join(" | "), …)`.
  - `src/parser/params.ts:391–470` — **the shared frame.** `lowerTypeExpr`'s
    arms — generic application (`:394–409`), union split (`:411–427`), primitive
    atom (`:429–431`), identifier atom (`:433–465`) — and the trailing catch-all
    `return {}` (`:467–469`), whose comment names what it is for: "A literal-type
    atom (string/number literal) or any other form: lower permissively; literal
    lowering is owned by the schema-subset leaves." `:380–382` and `:384–389` are
    the header comment recording the same scope and the nested brace-rooted
    traffic any catch-all diagnostic must not refuse.
  - `:740–754` and `:803–821` — `splitTopLevelSegments` and its non-empty filter
    `splitTopLevel`. The filter is why the alias position's dangling `|`
    disappears before lowering (arm `Cat`, lowered `$ref`) while the field
    position's survives inside one `typeSource` (`Cat|`, lowered `{}`).
  - `src/extension/production-composition.ts:1894–1901` (`hasLoadParseError`),
    `:1941` (the drop test), `:1969` (the dropped arm) — registration is blocked
    only by an error-severity `theta/load/*` or `theta/parse/*` diagnostic, and
    these inputs produce none.
  - `tests/schema-alias-rhs-malformed.test.ts:1267–1305` (cell e5) and
    `:1307–1316` (cell e6) — bug 0042's anti-widening fences, which pin
    `schema S { a: string | }` silent with `properties.a = {}` and
    `schema S { a: -1 }` at `empty-schema-body` alone. Both state the scope in
    their assertion messages ("the rule is scoped to the alias right-hand side").
    `tests/schema-alias-union-decl.test.ts:2235–2241` and `:2409–2416` are the
    same two controls in bug 0033's witness file. These four cells are the pins a
    fix here moves.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:87` — the
    `theta/parse/malformed-alias-rhs` row whose *Trigger* excludes sub-class (a)
    by name; `:86` (`empty-schema-body`), `:27` (`unsupported-feature`), `:90`
    (`unresolved-named-type`) — the three rows whose triggers were enumerated
    against this input class and do not cover it.
- **Observed at:** `0.52.0` (`9c961f7f`). Offline, deterministic; no live model,
  no provider. Scratch vitest driving `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts` (the shipped load path with inert seams),
  `parseTypeExpression` at its unit seam, `Ajv2020` from the installed `ajv`, and
  a `git ls-files` census over every committed `.theta` / `.thetalib`; written,
  run, deleted.

## Summary

Both `Type` positions inside a theta body capture their type as source text and
never ask whether that text derives from `Type`. The capture
(`parseType`) joins any token it does not have a stop for; the lowering
(`lowerTypeSource` → `lowerTypeExpr`) tries each admitted form in turn and
answers `{}` when none matches; and the one component that owns the type grammar
— `parseTypeExpression` — is a *position-check* pass, not a recogniser: it
returns an empty diagnostic list for text it cannot parse, and its parser is
written to be tolerant of what it cannot consume.

Two sub-classes are measured at HEAD.

**(a) An operator absorbed into an alias arm.** `schema X = Cat +` records the
arm `"Cat+"`, emits nothing, and lowers `$defs.X` to `{}`. The same silence
covers `Cat .`, `string +`, `Cat *`, `Cat /`, `Cat %`, `Cat ==`, `Cat &&`,
`Cat ?`, `Cat :`, the bare `schema X = +`, the `by` spelling and the `.thetalib`
spelling; in the union spelling `string | integer +` the junk arm lands inside
the lowered union instead (`{"anyOf":[{"type":"string"},{}]}`). Bug
0042's rule cannot see any of them: it fires on the *boundary token* a completed
capture leaves behind, and here the operator was absorbed, so there is no
boundary token. `schema X = Cat + 1` does fire — the field-boundary stop severs
the `1`. The registry *Trigger* for `theta/parse/malformed-alias-rhs` states
that exclusion in its own words (`code-registry-parse.md:87`): "an operator with
no operand behind it is absorbed INTO the arm rather than left at the boundary
(`schema X = Cat +`, `schema X = string +`), so nothing is left over at the
boundary and no token stands there for this row to name."

**(b) The field-position dangling `|`.** `schema S { a: string | }` and
`schema S { a: Cat | }` stay silent and lower the field to `{}`, where the alias
position now refuses the same dangling arm. The asymmetry is the reverse of the
one 0042 opened with, and it costs more at the position that stays silent: the
alias arm list drops the empty segment before lowering, so `schema X = Cat |`
keeps `{"$ref":"#/$defs/Cat"}` *and* draws the code, while the field keeps the
`|` inside one `typeSource` and loses the reference. `schema S { a: -1 }` draws
`empty-schema-body`, a third answer to the same family. That the field position
did not move is deliberate: 0042 §Fix constraint 4 (`:591–593`) put the
field-position controls in the acceptance set either way, and its fix record
(`:470–472`) reports them unmoved and the object body byte-identical.

The same shape reaches every other junk spelling the position admits — `Cat .`,
`???`, a leading `| string`, a bare `|` — and the operator absorption also
suppresses diagnostics the bare name would have drawn: `schema X = Ghost` raises
`theta/parse/unresolved-named-type`, `schema X = Ghost +` raises nothing, and
`schema S { a: void + }` loses the `unresolved-named-type` half of the pair
`schema S { a: void }` emits.

## Reproduction

Offline at HEAD `9c961f7f`. Every fixture is `mode: prompt` frontmatter plus the
body shown. `arms` is the named declaration's captured arm list, `fields` the
object body's captured field sources, `stmts` the top-level statement kinds,
`diags` the whole diagnostic list, and `$defs.<N>` the lowered fragment read
through a `params:` field `p: <N>` over the same body. Spans are body-relative.

### (a) An operator absorbed into an alias arm

```
@@ a1  schema Cat { a: string } / schema X = Cat +
   arms   :: ["Cat+"]
   stmts  :: ["schema:Cat","schema:X","let:a"]     decl X 2:1-2:17
   diags  :: []
   $defs.X :: {}
@@ a2  schema Cat { a: string } / schema X = Cat .
   arms ["Cat."]        diags []    $defs.X {}
@@ a3  schema X = string +
   arms ["string+"]     diags []    $defs.X {}
@@ a4  the other operators, all silent, arm = `Cat` + the operator's text:
   Cat *   Cat /   Cat %   Cat ==   Cat &&   Cat ?   Cat :   Cat +++
   arms ["Cat*"] ["Cat/"] ["Cat%"] ["Cat=="] ["Cat&&"] ["Cat?"] ["Cat:"] ["Cat+++"]
   diags [] in every member
@@ a5  schema X = +
   arms ["+"]           diags []    $defs.X {}
@@ a6  schema X = string | integer +
   arms ["string","integer+"]       diags []
   $defs.X :: {"anyOf":[{"type":"string"},{}]}    — one junk arm sinks the union
@@ a7  schema Cat {…} / schema Dog {…} / schema X by a = Cat | Dog +
   arms ["Cat","Dog+"]  diags []
   $defs.X :: {"anyOf":[{"$ref":"#/$defs/Cat"},{}]}
@@ a8  schema X = Ghost +   (Ghost declared nowhere)
   arms ["Ghost+"]      diags []    $defs.X {}
   CONTROL  schema X = Ghost
   arms ["Ghost"]  diags ["error theta/parse/unresolved-named-type:
                          unresolved named type 'Ghost'"]   $defs.X {}
@@ a9  the .thetalib spelling — schema Cat {…} / fn f(): integer { 1 } /
       schema X = Cat +
   stmts ["schema:Cat","fn:f","schema:X"]         diags []
```

### The contrasts that fire (bug 0042's rule, 0.52.0)

Same family, same absorbed operator, one severed token — and the code fires.
Every message below is the registry's, rendered with `<X>` as the declaration
name.

```
@@ a10 schema Cat {…} / schema X = Cat + 1
   arms ["Cat+"]  stmts ["schema:Cat","schema:X","expr","let:a"]
   diags ["error theta/parse/malformed-alias-rhs: 'X' has a malformed
           right-hand side; …" @2:18-2:19]              (the severed `1`)
@@ a11 schema Cat {…} / schema Dog {…} / schema X = Cat . Dog
   arms ["Cat."]  diags [malformed-alias-rhs @3:18-3:21]      (the severed `Dog`)
@@ a12 schema X = string+integer          (no spaces)
   arms ["string+"]  diags [malformed-alias-rhs @1:19-1:26]
@@ a13 schema Cat {…} / schema X = Cat.a
   arms ["Cat."]  diags [malformed-alias-rhs @2:16-2:17,
                         "error theta/parse/unknown-identifier: unknown
                          identifier 'a'" @2:16-2:17]
@@ a14 schema X = string ++ integer
   arms ["string++"]  diags [malformed-alias-rhs @1:22-1:29]
```

### (b) The field position

```
@@ b1  schema S { a: string | }
   fields [{name:"a",typeSource:"string|"}]     diags []
   $defs.S :: {"type":"object","properties":{"a":{}},"required":["a"],
               "additionalProperties":false}
@@ b2  schema Cat { a: string } / schema S { a: Cat | }
   fields [{name:"a",typeSource:"Cat|"}]        diags []
   $defs.S.properties.a :: {}                   — the `$ref` to Cat is lost
   CONTRAST, the alias position, same author error:
      schema Cat {…} / schema X = Cat |
      diags [malformed-alias-rhs @decl range]
      $defs.X :: {"$ref":"#/$defs/Cat"}         — reported AND correctly lowered
@@ b3  schema S { a: | string }   typeSource "|string"  diags []  properties.a {}
   CONTRAST, the alias position:  schema X = | Cat      → malformed-alias-rhs
@@ b4  schema S { a: | }          typeSource "|"        diags []  properties.a {}
@@ b5  schema S { a: string + }   typeSource "string+"  diags []  properties.a {}
       schema S { a: Cat + }      typeSource "Cat+"     diags []  properties.a {}
       schema S { a: Cat . }      typeSource "Cat."     diags []  properties.a {}
       schema S { a: ??? }        typeSource "???"      diags []  properties.a {}
@@ b6  schema S { a: Ghost + }    typeSource "Ghost+"   diags []  properties.a {}
   CONTROL  schema S { a: Ghost }
   diags ["error theta/parse/unresolved-named-type: unresolved named type
           'Ghost'"]                                    properties.a {}
@@ b7  schema S { a: string |, b: integer }   — the junk field does not spread
   fields [{a,"string|"},{b,"integer"}]        diags []
   $defs.S.properties :: {"a":{},"b":{"type":"integer"}}
@@ b8  the .thetalib spelling — schema S { a: string + }   diags []
```

### The field-position neighbours that are loud

```
@@ b9  schema S { a: -1 }
   field list dropped whole; no `fields`
   diags ["error theta/parse/empty-schema-body: 'S' has no fields; an empty
           schema cannot be validated." @1:1-1:19]      $defs.S {}
@@ b10 schema Cat {…} / schema S { f: Cat Cat }
   diags [empty-schema-body @2:1-2:24,
          "error theta/parse/unsupported-feature: unsupported syntactic feature:
           schema fields must be comma-separated" @2:19-2:22]
@@ b11 schema S { a: string || integer }        (the lexer emits `||` as ONE token)
   diags [empty-schema-body @1:1-1:34, unsupported-feature "…comma-separated"
          @1:25-1:32]                                   $defs.S {}
@@ b12 schema S { a: array< }                   (the `<` runs the capture to EOF)
   diags [empty-schema-body @1:1-4:1]                   $defs.S {}
```

### Controls that must not move

```
@@ schema S { a: string }         properties.a {"type":"string"}        diags []
@@ schema S { a: "x" }            properties.a {"const":"x"}            diags []
@@ schema S { a: string | integer }
   typeSource "string|integer"    properties.a {"type":["string","integer"]}
@@ schema Cat {…} / schema S { a: Cat }
   properties.a {"$ref":"#/$defs/Cat"}                                  diags []
@@ schema Cat {…} / schema X = Cat
   $defs.X {"$ref":"#/$defs/Cat"}                                       diags []
@@ schema X = "low" | "high"      $defs.X {"enum":["low","high"]}       diags []
```

### Grammar-admitted traffic already on the same catch-all

Measured at both positions, symmetric, and silent by the catch-all's own
recorded scope. A refusal that reaches these is over-refusing.

```
@@ schema S { a: array<{b: string}> }  properties.a {"type":"array","items":{}}
@@ schema X = array<{b: string}>       $defs.X      {"type":"array","items":{}}
@@ schema S { a: "x" | integer }  properties.a {"anyOf":[{},{"type":"integer"}]}
@@ schema X = "x" | integer       $defs.X      {"anyOf":[{},{"type":"integer"}]}
@@ schema S { a: {} }             properties.a {}        — bug 0045's class
@@ schema X = {}                  $defs.X      {}        — bug 0045's class
   diags [] in every row
```

### The same class one level down

```
@@ schema S { a: array<Cat +> }   properties.a {"type":"array","items":{}}
   diags []                       — the `array` emission is grammar-admitted;
                                    the junk is its argument
@@ schema S { a: {b: string +} }  properties.a {"$ref":"#/$defs/__inline_88ec7edfebdec3e7"}
   $defs.__inline_88ec7edfebdec3e7 ::
     {"type":"object","properties":{"b":{}},"required":["b"],
      "additionalProperties":false}
   diags []                       — the hoist is grammar-admitted; the junk is
                                    the nested field's type
```

### The type-grammar seam over the same texts

`parseTypeExpression(<text>, "schema-feeding", site)` at its unit seam — the
call both positions make (`theta-document.ts:5629`, `:6034`):

```
"Cat+"  "Cat."  "string+"  "string|"  "|string"  "|"  "???"  "Ghost+"  "+"
"-"     "-1"    "array<Cat +>"                                     ->  []
"void"                          -> [void-in-non-return-position]
"void +"                        -> [void-in-non-return-position]
"+ void"                        -> [void-in-non-return-position]
"array<integer, integer>"       -> [generic-arity-mismatch]
"array<integer, integer>+"      -> [generic-arity-mismatch]
"Result<string, integer>"       -> [result-in-schema-position]
"Result<string, integer> +"     -> [result-in-schema-position]
```

The last seven rows are the proof that the seam runs and then declines to look
at what it did not consume: a trailing or leading operator changes nothing about
which position rule fires, because the rule fired on the node the tolerant
parser did build and no arm inspects the remainder. End-to-end at both
positions:

```
@@ schema S { a: void }    diags [void-in-non-return-position @1:1-1:21,
                                  unresolved-named-type 'void' @1:1-1:21]
@@ schema S { a: void + }  diags [void-in-non-return-position @1:1-1:23]
@@ schema X = void         diags [void-in-non-return-position @1:1-1:16,
                                  unresolved-named-type 'void' @1:1-1:16]
@@ schema X = void +       diags [void-in-non-return-position @1:1-1:18]
@@ schema S { a: array<integer, integer> + }
                           diags [generic-arity-mismatch @1:1-1:42]
@@ schema X = Result<string, integer> +
                           diags [result-in-schema-position @1:1-1:37]
```

The `void +` rows carry a second observation: the absorbed operator also removes
the `unresolved-named-type` half of the pair (bug 0044's class), because the atom
is no longer `IDENTIFIER`-shaped.

### Real AJV over the lowered documents

`Ajv2020` from the installed `ajv`, compiled over the whole lowered `params:`
document of the two representative fixtures:

```
alias  {"type":"object","properties":{"p":{"$ref":"#/$defs/X"}},"required":["p"],
        "additionalProperties":false,"$defs":{"X":{}}}
   {"p":7}                     -> true      {"p":"anything"}  -> true
   {"p":null}                  -> true      {"p":true}        -> true
   {"p":[]}                    -> true      {"p":{"a":{"urgent":true}}} -> true
   {}                          -> false     (the only refusal: `required`)

field  $defs.S = {"type":"object","properties":{"a":{}},"required":["a"],
                  "additionalProperties":false}
   {"p":{"a":7}}   -> true    {"p":{"a":null}} -> true    {"p":{"a":[]}} -> true
   {"p":{"a":"x"}} -> true    {"p":{}}         -> false   (`required` again)
```

### Adjacent positions, measured and not owned here

```
@@ @<T> annotation:  schema Cat {…} / let r = @<Cat +>`hi`      diags []
   CONTROL           let r = @<Ghost>`hi`
                     diags [unresolved-named-type 'Ghost']
@@ params: scalar:   p: 'Cat +'      — bug 0059's frame, same catch-all
```

### Committed-corpus census

`git ls-files` at HEAD lists **34** `.theta` / `.thetalib` files (32 `.theta`,
2 `.thetalib`); the working tree carries a 35th, `.pi/theta/smoke.theta`, which
`.gitignore:26` excludes. Parsed through the real load path, the 34 declare
**zero** alias/union declarations and **11** object schemas with **25** fields
in total, and every field's `typeSource` is a well-formed `Type` (an identifier,
a primitive, a generic application, a literal, an inline object, or a union of
those). No committed fixture is in either sub-class, so none changes disposition
when a fix lands.

Reading the tables:

- **(a) and (b) are one defect at two positions.** The captured text differs;
  the silence, the `{}` and the absent registration gate do not.
- **a6 and a7 show the reach through a union.** One junk arm forces the whole
  union to `anyOf` with a permissive member, so the well-formed arms lose the
  SUBS-1 multi-type-array form (`schema-subset.md:81`) as well.
- **a8 and b6 show the second-order loss.** An absorbed operator hides an
  unresolvable name from the resolution walk, so this input class also
  suppresses a diagnostic the corpus already registers.
- **a10–a14 bound sub-class (a) exactly.** One severed token is enough for bug
  0042's rule; zero severed tokens is this report's class. `string+integer` and
  `string ++ integer` are the same operator with the arm cut in a different
  place — the disposition flips on where the whitespace is.
- **b2 is the sharpest form of the position asymmetry.** The position that
  reports keeps the correct lowering; the position that stays silent loses it.
- **b9–b12 show the field position is not uniformly silent.** It answers with
  `empty-schema-body`, with the comma rule, or with nothing, depending on which
  stop the junk trips — three answers to one author error class.
- **The catch-all's other residents bound any fix.** `array<{b: string}>`, a
  mixed literal union and `{}` reach the same `return {}` at both positions and
  are grammar-admitted; `array<Cat +>` and `{b: string +}` are this report's
  class one level down, inside a form whose own emission is defined.
- **The seam rows locate the gap precisely.** The component that owns the type
  grammar already runs over this exact text at both positions and is silent by
  construction, not by omission of a call.

## Expected behaviour

Defined for what the text must be; defined for what each admitted form lowers
to; undefined for text that is neither.

- **The grammar closes the admitted set.** `grammar.md:90`–`:102` gives `Type`
  as `PrimitiveType` | `NamedType` | `GenericType` | `ObjectType` | union |
  `LiteralType`, `:105` names schema field types among the bare-`Type` positions
  and adds "The grammar is otherwise identical in every position", and
  `type-system.md:15` binds every annotation position to that one grammar.
  `schemas.md:17` states that "field types are any expression from the Type
  System grammar". `schemas.md:62` states the alias right-hand side "is exactly
  an `AliasRhs`", i.e. `Type ("|" Type)*`
  (`grammar.md:175`). None of `Cat+`, `Cat.`, `string+`, `Cat|`, `|string`, `|`,
  `???` or `+` is derivable from any of those productions.
- **The emission table has no `{}` rule.** `schema-subset.md:74`–`:84`
  enumerates the lowering per admitted type form — primitive, `$ref`,
  `array<T>`, object, literal, enum, SUBS-1 union, discriminated union, mixed
  `anyOf`. Text outside the grammar has no form, so no rule covers it, and the
  `{}` emitted today matches none of them. `:81` additionally makes the union
  case concrete: a junk arm turns a union the author wrote as primitives into
  `anyOf` with a member that constrains nothing.
- **The alias position's own rule already states the intended posture and its
  one exclusion.** `schemas.md:64` and the registry *Trigger*
  (`code-registry-parse.md:87`) name the absorbed-operator case as outside
  `theta/parse/malformed-alias-rhs` because no boundary token remains — a
  statement about which token that row can point at, not a statement that the
  arm text is well-formed. `docs/reference/schema-subset.md:68–70` mirrors it.
- **No registered row covers this input.** Both registries were enumerated at
  HEAD. `theta/parse/malformed-alias-rhs` (`:87`) excludes sub-class (a) by its
  own text and is scoped to the alias declaration, so it reaches no field type.
  `theta/parse/empty-schema-body` (`:86`) triggers on a `schema` shape that
  "yields no usable content (neither fields nor alias arms)" — these
  declarations yield both. `theta/parse/unsupported-feature` (`:27`) triggers on
  "A theta 1.0-deferred or non-Theta syntactic construct … appears in source",
  a statement about source constructs, and its `<construct>` placeholder renders
  from the closed token-name table of `placeholder-rendering-a.md` §3 (`:43–68`).
  `theta/parse/unresolved-named-type` (`:90`) triggers on "A `NamedType` that
  resolves to no declaration usable at the position it is written", and `Cat+`
  is not a `NamedType` (`NamedType ::= Ident`, `grammar.md:98`). The registry is
  closed (DIAG-2, `diagnostic-shape.md:72`), so the absence is a spec gap.
- **What is not open.** Silence with a permissive lowering satisfies neither
  reading: either the text is refused with a registered code and the theta does
  not register, or it is admitted with a defined emission — and no emission rule
  exists to admit it under. The two positions answering differently for one
  author error additionally contradicts `grammar.md:105`'s "The grammar is
  otherwise identical in every position".

## Actual behaviour / root cause

Three components see this text. One accepts any bytes, one is built to report
three specific rules and nothing else, and one is licensed to be silent for a
different class.

1. **The capture accepts any bytes.** `parseType`
   (`theta-document.ts:2915–3037`) joins the current token's text
   unconditionally (`:3026`) and breaks only on its closed stop set — `stmt-sep`,
   a depth-0 `,` / `)` / `{` / `}` / `=`, the field boundary, and in alias mode
   an `ALIAS_ARM_STOP_PUNCT` head, a completed-arm `-`, or an arm-start keyword.
   Arithmetic, comparison, logical, ternary and member-access punctuation is in
   no stop set at either position, so `+`, `.`, `*`, `/`, `%`, `==`, `&&`, `?`
   and `:` join the type source. The alias position's `-` stop is scoped to
   `armComplete && !atArmStart` (`:2962–2971`) for a reason the comment records,
   and that scoping is exactly what makes an operator *after* a completed arm
   the only punct family that ends a capture.
2. **The type-grammar seam reports its three position rules and nothing else.**
   `parseTypeExpression` (`type-grammar.ts:67–81`) is called per arm
   (`theta-document.ts:5629`) and per field (`:6034`) in the schema-feeding
   position. When its tolerant parser yields no node it returns `[]` (`:75–77`);
   when it yields one it walks for `void`, generic arity and `Result` only
   (`:78–80`). Nothing asks whether the source was fully consumed
   (`parse()`, `:186–189`), unexpected punctuation is skipped by design
   (`parsePrimary`, `:216–231`), and a failed union arm or object field ends the
   loop rather than the parse (`:197–203`, `:287–304`). `"void +"` and
   `"+ void"` therefore emit exactly what `"void"` emits.
3. **The lowering's catch-all absorbs whatever text arrives.**
   `lowerTypeSource` (`body-type-lowering.ts:335–414`) tries the literal forms
   (`:358–369`), the brace-rooted hoist (`:394–396`) and the inline-object union
   arm (`:398–411`), then falls through to `lowerTypeExpr` (`:413`), which tests
   for a generic application, splits a union, matches a primitive, matches
   `IDENTIFIER` — and otherwise returns `{}` (`params.ts:467–469`). `Cat+` fails
   `IDENTIFIER` (`:357`) on the `+`; `string|` fails it on the `|` after the
   split has already dropped the empty segment; `???` and `+` fail it on their
   first character.
4. **The catch-all is silent for a reason that is not this input's.** Its own
   comment and the function header (`params.ts:380–389`) scope it to forms the
   grammar admits whose lowering lives elsewhere — a `LiteralType`, and a
   brace-rooted arm nested in a generic argument or a union arm. §Reproduction
   measures both of those as grammar-admitted traffic at these positions
   (`array<Cat +>`, `{b: string +}`), which is what a diagnostic raised at the
   catch-all itself would refuse across all four positions.
5. **The name walk cannot see a name inside junk.**
   `collectUnresolvedNamedTypes` (`body-type-lowering.ts:670–685`) resolves
   through the same path, so an atom is a resolution candidate only when the
   whole trimmed string matches `IDENTIFIER`. `Ghost+` does not, so
   `theta/parse/unresolved-named-type` — which both positions do raise for
   `Ghost` (`theta-document.ts:5647`, `:6045`) — never fires for the same name
   with an operator stuck to it.
6. **The two positions diverge at the split, not at the check.**
   `finishAliasSchema` filters empty segments out of the arm list before the
   declaration is built (`theta-document.ts:2404–2405`), so the alias position's
   dangling `|` never reaches lowering and `schema X = Cat |` keeps its `$ref`.
   `parseSchemaObjectBody` records the field's type verbatim (`:2570–2575`), so
   the field position's `|` reaches `lowerTypeSource` inside one source string
   and takes the whole field to `{}`. Bug 0042 added a reporting rule at the
   first position only, by its §Fix constraint 4 (`:591–593`).
7. **Registration has no other gate.** With no error-severity diagnostic,
   `hasLoadParseError` (`production-composition.ts:1894–1901`) is false, the drop
   arm (`:1941`, `:1969`) is not taken, and the theta registers with a schema
   that constrains nothing at that field.

The mechanism is one gap between three correct decisions: a capture whose job is
extent rather than validity, a check pass whose job is three position rules, and
a lowering catch-all licensed to be silent for grammar-admitted forms.

## Why it matters

- **The lowered fragment is the only enforcement the value gets.** A `$defs`
  entry of `{}` — or a field property of `{}` — admits every JSON value.
  §Reproduction's AJV rows measure it at the `params:` argument boundary: `7`,
  `"anything"`, `null`, `true`, `[]` and a nested object all pass where the
  author declared an object schema or a named alias. The same `$defs` document
  is what a typed-query annotation lowers into
  (`src/runtime/query-schema-lowering.ts:148`), so a body schema carrying `{}`
  constrains neither an incoming argument nor a model response.
- **A junk arm demotes the whole union.** `string | integer +` lowers
  `{"anyOf":[{"type":"string"},{}]}` — the `anyOf` member that constrains
  nothing makes the union vacuous, so the well-formed arm buys nothing, and
  SUBS-1's multi-type-array form (`schema-subset.md:81`) is lost as well.
- **The silence is spelling-sensitive in a way authors cannot predict.**
  `schema X = Cat +` is silent, `schema X = Cat + 1` is refused;
  `schema X = string+integer` is refused, `schema X = string +` is silent;
  `schema X = Cat |` is refused, `schema S { a: Cat | }` is silent and lowers
  worse. The disposition turns on whitespace and on which of the two positions
  the author is writing in.
- **The absorbed operator hides a diagnostic the corpus does register.**
  `schema X = Ghost` and `schema S { a: Ghost }` raise
  `theta/parse/unresolved-named-type`; adding one `+` removes it. A typo that
  would have been caught becomes a permissive lowering.
- **The field position loses the reference the alias position keeps.**
  `schema S { a: Cat | }` discards `{"$ref":"#/$defs/Cat"}` for `{}` while
  saying nothing, so a schema that reads as a typed field validates nothing at
  that field.
- **These inputs are inside the GOV-15 loads-cleanly set.** Every fixture in
  sub-classes (a) and (b) loads with zero error-severity diagnostics
  (`source-language-stability.md:9`), so a later refusal is a stability question
  needing the [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`), whose input set is defined post-hoc over the diff.
- **No gate scores it.** The census found 34 committed `.theta` / `.thetalib`
  files, zero alias declarations and 25 well-formed schema fields, so
  `tests/committed-fixture-parse-gate.test.ts` never meets one of these inputs,
  and bug 0042's lock pins two rows of this class as *unchanged* by design
  (`tests/schema-alias-rhs-malformed.test.ts:1267–1305`, `:1307–1316`).

## Fix

Judge arm and field type text against the type grammar at the two positions
inside the theta body, and refuse text that no `Type` production spells, with
one error-severity diagnostic per offending arm or field.

The disposition open here is the **emission point**, and the constraints below
are settled either way:

- **At the type-grammar seam.** `parseTypeExpression`
  (`src/parser/type-grammar.ts:67–81`) already owns the grammar, already
  receives the `TypePosition` and the site, and is already called per arm
  (`theta-document.ts:5629`) and per field (`:6034`). Making it report
  non-derivability means removing three tolerances — requiring `parse()` to
  consume the token stream, and replacing `parsePrimary`'s punct skip and the
  `parseUnion` / `parseObject` loop breaks with a reported failure. Its blast
  radius is every caller: the `value` position (`let` annotations at `:5874`,
  `fn` parameter types at `:5949`) and the `return` position (`:5955`), which
  this report does not measure and does not own.
- **At the lowering, through a `LowerCtx` sink.** `lowerTypeExpr`'s catch-all
  (`src/parser/params.ts:467–469`) is where the text lands, and `LowerCtx`
  already carries the optional per-caller sink pattern (`slugCollisions`,
  `:340–347`) whose contract is that the module never reads it back. A position
  that threads no sink is unchanged, which is what keeps the four positions
  separable — and it is the point bug 0059 settles on for `params:`. It needs a
  recogniser to decline literal-shaped and brace-rooted text, where the seam
  above has one already.

Whichever point is taken, the judgement is the same: text is refused when it is
not derivable from `Type`, and declined when it is — including the
grammar-admitted traffic the catch-all legitimately carries.

**Registry.** The code is a DIAG-2 operation (`diagnostic-shape.md:72`):
either a new row, or a widened *Trigger* on an existing one. Three existing rows
were assessed and none fits as written. `theta/parse/malformed-alias-rhs`
(`code-registry-parse.md:87`) excludes sub-class (a) by its own text and is
scoped to the alias declaration, so covering the field position widens both its
trigger and its position set, and its *Message* names "the declaration's line",
which no field type has. `theta/parse/empty-schema-body` (`:86`) triggers on a
shape yielding no content; these yield arms and fields.
`theta/parse/unsupported-feature` (`:27`) would need a new freeform tail in the
closed `<construct>` table of `placeholder-rendering-a.md` §3 (`:43–68`), a
GOV-7 / GOV-8 table edit that would also have to reconcile the two tails already
emitted unlisted (§Non-goals of bug 0042). A DIAG-2 registry edit lands in the
same commit as the site it is raised from, is dispositioned by GOV-15's
diagnostic-registry carve-out (`source-language-stability.md:25`) "as an
addition for inputs newly brought into the code's emission set", and the trigger
prose *is* that post-hoc in-scope set, so it enumerates the refused spellings.
The owning spec sentences are `schemas.md:17` (the field position) and `:62`
(the alias position), with `:64`'s absorbed-operator exclusion re-derived, and
the mirrors in `docs/reference/schema-subset.md` and
`docs/reference/diagnostics.md`.

**Coordination.** This fix, bug
[0043](./0043-union-nonprimitive-arm-lowers-permissive.md) and bug
[0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) all move
behaviour on `src/parser/params.ts:391–470`: 0043 reorders the arms, 0059 adds a
refusal sink at the catch-all for the `params:` position, and this one refuses
text at two other positions. None needs another's fix — the three input sets are
disjoint (a well-formed union that reaches the wrong arm; non-type text at
`params:`; non-type text at a body position). Whichever lands last re-derives
the others' §Reproduction rows for the shared function, since each removes a
class from the catch-all: specifically the catch-all's resident list in 0059
§Reproduction, the arm-order table in 0043 §Reproduction, and the junk-arm rows
here.

Constraints on any implementation:

1. **Exactly one diagnostic per offending arm or field, and no cascade.** The
   alias position emits per declaration (`emitMalformedAliasRhs`,
   `theta-document.ts:2452–2480`) and checks per arm (`:5627–5630`); the field
   position's type diagnostics are raised per field in one walk
   (`:6026–6047`). An input that
   already draws a code must not double up: `schema S { a: void + }` keeps
   `void-in-non-return-position`, `schema S { a: array<integer, integer> + }`
   keeps `generic-arity-mismatch`, `schema X = Result<string, integer> +` keeps
   `result-in-schema-position`, and `schema X = Cat + 1` keeps exactly one
   `theta/parse/malformed-alias-rhs`.
2. **Per-position blast radius, stated and measured.** The three other `Type`
   positions must show byte-identical lowered documents and byte-identical
   diagnostic sequences after the change, or the change states which of them it
   moves and why: the `params:` position is bug 0059's (`params.ts:642–651`),
   the `@<T>` annotation enters the same path through
   `src/runtime/query-schema-lowering.ts:141` and `:148`, and the
   `value` / `return` positions
   (`let` annotations, `fn` parameter and return types) reach
   `parseTypeExpression` but not `lowerTypeSource`. `@<Cat +>` is measured
   silent at HEAD (§Reproduction) and is not claimed here.
3. **Grammar-admitted traffic keeps its bytes.** Measured at both positions and
   pinned in §Reproduction: a brace-rooted arm nested in a generic argument
   (`array<{b: string}>` → `{"type":"array","items":{}}`), a mixed literal union
   (`"x" | integer` → `{"anyOf":[{},{"type":"integer"}]}`), the empty inline
   object `{}` (bug 0045's disposition), a literal atom
   (`"x"` → `{"const":"x"}`), a literal union
   (`"low" | "high"` → `{"enum":["low","high"]}`), and a primitive union
   (`string | integer` → `{"type":["string","integer"]}`). A fix that refuses any
   of these is over-refusing.
4. **The refused set is enumerated, and the trigger states it.** From
   §Reproduction: an operator absorbed into an arm or field type (`Cat +`,
   `Cat .`, `string +`, `Cat *`, `Cat /`, `Cat %`, `Cat ==`, `Cat &&`, `Cat ?`,
   `Cat :`, `Cat +++`, `string ++`), an operator alone (`+`), a dangling,
   leading or lone `|` at the field position (`string|`, `Cat|`, `|string`,
   `|`), punctuation text (`???`), and each of these reached one level down
   through a union arm (`string | integer +`) or a nested inline object
   (`{b: string +}`), at the `.theta` and `.thetalib` spellings and at the `by`
   spelling alike.
5. **Controls do not move.** `schema S { a: string }`, `{ a: "x" }`,
   `{ a: string | integer }`, `{ a: Cat }`, `schema X = Cat`,
   `schema X = string | integer`; `schema S { a: -1 }` keeps
   `empty-schema-body` alone unless the change states otherwise;
   `schema S { f: Cat Cat }` keeps its `empty-schema-body` plus
   `unsupported-feature`; and bug 0042's own fixtures keep exactly one
   `theta/parse/malformed-alias-rhs` each.
6. **The suppressed sibling diagnostics come back or are recorded.**
   `schema X = Ghost +` and `schema S { a: Ghost + }` today emit nothing where
   the bare name emits `theta/parse/unresolved-named-type`. A refusal at these
   positions must state whether the input now draws the refusal alone or the
   refusal plus the name diagnostic, and pin it. Whether keyword-shaped text
   should draw `unresolved-named-type` at all is bug
   [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s and
   must not move here.
7. **The pins that move, move with this document as their authority.**
   `tests/schema-alias-rhs-malformed.test.ts:1267–1305` (cell e5) and
   `:1307–1316` (cell e6), and `tests/schema-alias-union-decl.test.ts:2235–2241`
   and `:2409–2416`, pin the field-position dangling `|` silent-and-permissive
   and the field `-1` at `empty-schema-body`. All four were written as
   deliberate holds under bug 0042 §Fix constraint 4 (`:591–593`); the fix
   re-derives their comments to name this report and leaves the rest of both
   files untouched.
8. **GOV-15 and the H9a gates.** Files that load today stop loading, which is
   the carve-out's covered effect for the newly in-scope inputs; the census in
   §Reproduction (34 committed files, zero alias declarations, 25 well-formed
   fields) is the measured blast radius over the committed corpus and must be
   re-derived at the fix baseline rather than assumed. A new `theta/parse/*`
   code un-registers the theta and is absent from
   `tests/fixtures/h7a/permitted-codes.json`; it stays absent unless a committed
   H9a fixture enters the class — `parseSystemNoteCodes`
   (`tests/live/acceptance/harness.ts:463–466`) matches
   `theta/(?:load|parse|runtime)/[a-z0-9-]+`, so a `theta/parse/*` code is
   scored, which bug
   [0047](./0047-h9a-code-gate-blind-to-host-namespace.md) records.
9. **Test witness — offline, deterministic, no live provider.** Every fixture in
   §Reproduction is a `parseThetaDocument` call, a `parseTypeExpression` call or
   an AJV compile. Required beyond the probes: each spelling in constraint 4
   refused with exactly one diagnostic; the constraint-3 rows pinned
   byte-for-byte, and the nested rows with their minted slugs; the
   constraint-5 controls pinned byte-for-byte; the four inverted rows updated in
   place; and every expected message read from the registry at runtime rather
   than restated (DIAG-4).

## Non-goals

- **The `params:` position.** Non-type text arriving through a `params:` scalar
  is bug [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s,
  together with the recorded `BypassParamsField.type` and the binder
  `Parameters:` render that only that position has.
- **`lowerTypeExpr`'s arm ordering.** The generic-application test running
  before the union split is bug
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md)'s. Nothing here
  changes which arm a grammar-admitted union reaches.
- **Keyword-shaped text drawing the wrong code.** `schema X { f: match }` and
  the `void` double emission are bug
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s. This
  report cites them only where an absorbed operator suppresses them.
- **The empty inline object `{}`.** Its missing `theta/parse/empty-schema-body`
  (`grammar.md:109`) is bug
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)'s, and
  `{}` is grammar-admitted traffic a recogniser here must decline.
- **Whether `{}` should ever be a lowering.** Bug
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s inventory
  question.
- **The boundary token after a completed capture.** Bug
  [0042](./0042-schema-decl-same-line-residue-silent.md), fixed in 0.52.0. Its
  code and its two shapes are unchanged by this report; the contrast rows a10–a14
  exist to fence them.
- **Whether `-1` should be a `Type`.** `grammar.md:102` gives `LiteralType` no
  unary-minus alternative and no `Type` position carries one; bug 0042
  §Non-goals holds that question. In scope here is only that
  `schema S { a: -1 }` and `schema X = -1` answer differently.
- **The capture over-run through `<` and `>`.** `schema X = Cat >` and
  `schema X = Cat <` swallow the following line into the arm
  (`arms ["Cat>leta=1"]`, the `let` statement gone, an `unknown-identifier` at
  the tail): the mechanism is the depth counter at
  `theta-document.ts:3017–3025` plus the lexer's trailing-trigger continuation,
  not the arm-text check, and the input is not silent. Unfiled, and not this
  report's frame.
- **The `.thetalib` top-level-statement code's attribution.** Recorded in bug
  0042 §Summary; unchanged here.

## Provenance

- Origin: bug [0042](./0042-schema-decl-same-line-residue-silent.md)'s fix
  (0.52.0), §Fix (0.52.0) *Residuals* (i) (`:501–507`) and (ii) (`:507–512`),
  and residuals 1 and 2 of the local run artefact `.pi/tmp/fixes/0042-report.md`,
  both left unfiled by that fix. Residual (i) names three spellings
  (`Cat +`, `Cat .`, `string +`), the firing contrast (`Cat + 1`) and the
  general case ("arm-text validation against the type grammar, which is shared
  by all four `Type` positions"); residual (ii) names the field-position
  dangling `|` and the `-1` asymmetry. This report files both as one family,
  re-derives every row at HEAD, and adds what the residuals do not state: the
  other absorbed operators and their arm texts, the union and `by` spellings,
  the `.thetalib` spelling, the suppressed `unresolved-named-type`, the field
  position's own junk spellings (`Cat|`, `|string`, `|`, `???`, `Ghost +`), the
  measured lowering asymmetry between the two positions, the type-grammar seam's
  silence and the three tolerance points that cause it, the real-AJV rows, the
  catch-all's grammar-admitted residents at these two positions, and the
  committed-corpus census.
- Spec: `docs/spec_topics/grammar.md:90`–`:102` (the closed `Type` production
  set), `:98` (`NamedType ::= Ident`), `:102` (`LiteralType`), `:105` (the
  bare-`Type` position list and the one-grammar sentence), `:109` (§Inline
  object types — `ObjectType` in any `Type` position, and the empty-`{}` rule),
  `:171–176` (`SchemaDecl` / `AliasRhs` / `UnionRhs`);
  `docs/spec_topics/type-system.md:15` (one type grammar in every
  annotation position); `docs/spec_topics/schemas.md:17` (§Object schema — field
  types are any expression from the type grammar), `:19` (the empty-body rule),
  `:50–64` (§Type-alias / union schema, with `:62` the `AliasRhs` sentence and
  `:64` the absorbed-operator exclusion);
  `docs/spec_topics/schema-subset.md:73` (step 2, the `__inline_<slug>` hoist),
  `:74`–`:84` (step 3, the per-type-form emission table), `:81` (SUBS-1);
  `docs/spec_topics/diagnostics/code-registry-parse.md:27`
  (`unsupported-feature`), `:86` (`empty-schema-body`), `:87`
  (`malformed-alias-rhs` — the row bug 0042 added, and its absorbed-operator
  exclusion sentence), `:90` (`unresolved-named-type`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
  (DIAG-2, the registry is closed);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:43–68` (the closed
  `<construct>` table); `docs/spec_topics/governance/source-language-stability.md:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out);
  `docs/reference/schema-subset.md:56–70` (the reference mirror of the alias
  rule and its exclusions); `docs/reference/diagnostics.md:136` (the registry
  mirror row).
- Implementation evidence at `9c961f7f`: `src/parser/theta-document.ts:1559`
  (`ALIAS_ARM_STOP_PUNCT`), `:1581–1592` (`isAliasResidueHead`), `:2396–2422`
  (`finishAliasSchema`: the capture at `:2397`, the split at `:2404`, the
  non-empty filter at `:2405`, the emission call at `:2420`), `:2452–2480`
  (`emitMalformedAliasRhs`), `:2522–2604` (`parseSchemaObjectBody`: the field
  type capture at `:2570`, the verbatim record at `:2571–2575`, the comma rule
  at `:2585–2601`), `:2915–3037` (`parseType`: the alias punct stop at
  `:2943–2951`, the `-` stop at `:2962–2971`, the arm-start stops at
  `:2972–2981`, the structural punct stop at `:2982–2992`, the field-boundary
  stop at `:3006–3016`, the depth counter at `:3017–3025`, the unconditional
  join at `:3026`, `armComplete` at `:3034`), `:5627–5630` (the per-arm
  `checkInlineEnumForm` + `parseTypeExpression` pair), `:5647–5648` (the alias
  position's `unresolved-named-type` walk), `:6026–6047` (the per-field pair and
  the field position's walk); `src/parser/type-grammar.ts:51` (`TypePosition`),
  `:67–81` (`parseTypeExpression`, the empty return at `:75–77`), `:186–189`
  (`parse()`), `:191–205` (`parseUnion`'s arm break), `:207–254` (`parsePrimary`,
  the tolerant punct skip at `:228–230`), `:275–308` (`parseObject`'s breaks),
  `:311+` (the position-rule walk); `src/parser/body-type-lowering.ts:109–138`
  (`lowerObjectFields`), `:335–414` (`lowerTypeSource`: the literal check at
  `:358–369`, the hoist at `:394–396`, the inline-object union arm at
  `:398–411`, the fall-through at `:413`), `:566` (the alias arm lowering call),
  `:670–685` (`collectUnresolvedNamedTypes`);
  `src/parser/params.ts:349` (`PRIMITIVE_TYPES`), `:357` (`IDENTIFIER`),
  `:380–389` (the header comment scoping the catch-all), `:391–470`
  (`lowerTypeExpr` and its catch-all at `:467–469`), `:340–347` (the
  `slugCollisions?` optional-sink contract), `:533–554`
  (`hoistInlineObjectType`), `:642–651` (`lowerParamsFieldType`), `:740–754`
  (`splitTopLevelSegments`), `:803–821` (`splitTopLevel`);
  `src/extension/production-composition.ts:1894–1901` (`hasLoadParseError`),
  `:1941`, `:1969` (the drop test and the dropped arm).
- Test evidence at `9c961f7f`: `tests/schema-alias-rhs-malformed.test.ts` — bug
  0042's 31-cell witness; `:1267–1305` (cell e5, the field dangling `|` pinned
  silent with `properties.a = {}`) and `:1307–1316` (cell e6, the field `-1`
  pinned at `empty-schema-body` alone), both stating the alias-only scope in
  their assertion messages; `tests/schema-alias-union-decl.test.ts:2235–2241`
  and `:2409–2416` — the same two controls in bug 0033's witness;
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which is in this report's class).
- Reproduction: scratch vitest at `9c961f7f` — the two sub-classes through the
  real load path with their arm lists, field sources, statement kinds, spans,
  diagnostics and lowered `$defs`; the five firing contrasts; the four loud
  field-position neighbours; six controls; six grammar-admitted catch-all
  residents measured at both positions; the two nested-junk rows;
  `parseTypeExpression` over nineteen texts at its unit seam plus six
  end-to-end confirmations; a real `Ajv2020` compile of both lowered documents
  over twelve payloads; the `@<T>` annotation rows; and a `git ls-files` census
  over every committed `.theta` / `.thetalib`. Run on the outputs quoted above,
  then deleted per scratch policy.

## Fix (0.87.0)

- What shipped, keyed to §Fix: arm and field type text at the two `Type`
  positions inside a theta body is judged against the type grammar and refused
  when no `Type` production spells it, one error-severity
  `theta/parse/schema-type-not-expression` per offending brace-free FRAGMENT, at
  the declaration's range, and the theta does not register.
  **Emission point — the disposition §Fix left open — adjudicated as option
  (b), the lowering sink**, at the narrowest threading site: bug 0059's landed
  `LowerCtx.unspellable` reached through `collectUnresolvedNamedTypes`'s
  optional out-parameter pattern (the bug 0044 `reservedKeywords` shape:
  caller-owned, append-only, the module never reads it back). Option (a), the
  type-grammar seam (`parseTypeExpression`), was rejected on measurement: its
  blast radius is every caller, including the `value` and `return` positions
  this report neither owns nor measures, and §Fix constraint 2 pins `@<Cat +>`
  as "measured silent at HEAD and … not claimed here" — measured at HEAD with
  the prototype absent, `let x: Cat + = 1`, `fn f(p: Cat +): integer { 1 }` and
  `@<Cat +>` all draw `[]`, so making the seam a recogniser moves three
  unclaimed positions at once.
  `src/parser/body-type-lowering.ts` — `collectUnresolvedNamedTypes` gains a
  fourth optional out-parameter `unspellable?: string[]`, threaded into the
  `LowerCtx` it builds through `lowerTypeSource` / `lowerObjectFields` /
  `lowerInlineObject`, so the sink rides the hoist to every nesting depth;
  pushed WITHOUT the `[...new Set(...)]` dedup its two siblings use, because
  constraint 4's count rule is one diagnostic per FRAGMENT.
  `src/parser/theta-document.ts` — the two threading sites, re-anchored by
  symbol: the per-field `collectUnresolvedNamedTypes` call in `walkStatement`'s
  `schema` arm, and the joined-arms call in `checkSchemaDeclarationGraph`;
  `schemaTypeNotExpressionDiagnostic` as the single emitter builder;
  `emitMalformedAliasRhs` now returns `boolean` and `finishAliasSchema` records
  it as `SchemaDecl.aliasRhsRefused?: true` (guard 2's channel — explicit node
  state, no global). `buildBodyTypeSchemas` is deliberately NOT the threading
  site: it is called by `collectBodyTypes` (the load path) AND by
  `lowerQueryResponseSchema` (the `@<T>` path), so threading there would put the
  annotation one optional argument from inheriting the refusal.
  `src/parser/params.ts` — bug 0059's inline decline extracted verbatim into one
  exported `isUnspellableTextRefusable`
  (`parseLiteralArm(text) === undefined && !text.includes("{") && !text.includes("}")`),
  called by `parseParams` and by both body-position emitters: ONE decline, never
  a copy, so narrowing it narrows every position's refusal at once. The
  `LowerCtx.unspellable` contract comment and the catch-all's reader comment
  re-derived to name the three readers.
  Registry: a NEW `theta/parse/*` row (DIAG-2, same commit as the sites it is
  raised from), `E`, phase `parse`, *Message*
  `'<X>' declares a type that is not a theta type expression`, with the
  *Trigger* authored as the GOV-15 post-hoc in-scope set. Same-commit spec
  edits: `schemas.md:17` (the field position) and `:62` (the alias position) now
  name the refusal, `:64`'s absorbed-operator exclusion re-derived to say the
  boundary token is absent *for `malformed-alias-rhs` to name* and that the arm
  text itself is this row's; `malformed-alias-rhs`'s own registry *Trigger*
  sentence re-derived identically; mirrors `docs/reference/schema-subset.md`
  §Type-alias / union schema and `docs/reference/diagnostics.md` (confirmed
  Trigger-less — Code | Sev | Phase | Message only, re-verified at HEAD).
- **Message shape — the `<text>` placeholder was rejected, and why.** The
  prototype used `'<text>' is not a theta type expression` for measurement only.
  `<text>` is admissible under NO category of the placeholder surface, and that
  surface is CLOSED (`placeholder-rendering-a.md` §Closure: "No other
  placeholders are admitted; this closure is enforced at build time. Introducing
  a new placeholder … is a spec-versioned breaking change governed by GOV-7 and
  GOV-8"), which is the same objection §Fix already raises against
  `unsupported-feature`'s closed `<construct>` table. Category 3's `<expr>` is
  the only verbatim-source-span placeholder and fails on two independent
  grounds: it is scoped by name to `theta/parse/default-not-literal`, and its
  rule requires the span "copied byte-for-byte from the source file … with
  internal whitespace preserved", where the refused fragment is `parseType`'s
  JOINED text (`Cat +` in source is `Cat+` in the arm) and the diagnostic's
  range is the declaration's, not the fragment's — so no sub-expression span
  exists to copy. `<X>` is category 7's identifier-shaped `schema`-declaration
  placeholder, already carried by `empty-schema-body`, `empty-enum-body` and
  `malformed-alias-rhs`, whose rule extends to "every other row carrying `<X>`";
  no table edit, no GOV-7 / GOV-8 exposure. This mirrors bug 0059's own row,
  which names the FIELD (`<param>`) rather than the text. Consequence, stated
  normatively in the *Trigger* rather than left as an accident: two junk
  fragments in one declaration render two diagnostics with identical text and
  identical range, because each fragment is refused independently so fixing one
  does not silently hide the other. Witness cells a28/a29 pin the count; group
  (r) pins the row's placeholder set as exactly `["<X>"]`, so a later
  junk-text placeholder reds rather than passing silently.
- Operator authorization, recorded verbatim (granted 2026-08-08 at HEAD
  `8e2a199c`, unblocking the archived pre-Phase-1 stop
  `.pi/tmp/fixes/0061-report-stopped-premeasure.md`): "Authorize the 3-cell
  fence update; re-dispatch 0061" — scope: in
  `tests/params-scalar-nontype-text-refusal.test.ts` (bug 0059's 93-cell
  witness), group (c) `CONTRAST_ROWS` rows c4 (`???` field), c5 (`???` alias),
  c7 (`[a, b]` field): change ONLY the codes column (`[]` → the new refusal
  line), leaving each row's lowered-bytes half byte-unchanged; re-derive group
  (c)'s header sentence and the affected assertion messages to name bug 0061 as
  the authority for the two body positions and to state that the fence now
  covers the `@<T>` / `value` / `return` positions (which remain unthreaded);
  mark each moved row inline with its authority (the idiom 0059's own 12 moved
  cells use); 0059's subject stays witnessed by its remaining 90 cells. Also
  authorized as its rider: the append-only note on 0059's doc whose
  thread-no-sink claim this change makes stale for two of the three positions.
  The blocker the grant resolved: §Fix constraint 4 names punctuation text
  (`???`) in the refused set at both positions, and `[a, b]` is text no `Type`
  production spells, is not what `parseLiteralArm` recognises, and carries no
  brace — so the ONE SHARED decline cannot decline either without narrowing bug
  0059's landed refusal as well. No implementation faithful to constraint 4
  keeps c4/c5/c7 green. Constraint 7 could not have named them: this document
  was verified at `9c961f7f` (0.52.0) and 0059's witness was created at
  `f31eac45` (0.86.0), 34 minors later.
- The 7 cells §Fix constraint 7 and the grant cover, old → new, authority per
  cell — 5 moved, 2 measured unmoved:

  | file | cell | old → new | authority |
  |---|---|---|---|
  | `tests/schema-alias-rhs-malformed.test.ts` | `e5` (fixture 2a) | `schema S { a: string \| }` diags `[]` → one `schema-type-not-expression` at the decl range; `properties.a` still `{}` | §Fix constraint 7 |
  | `tests/schema-alias-union-decl.test.ts` | `n24` CONTROL | same input, same flip | §Fix constraint 7 |
  | `tests/schema-alias-rhs-malformed.test.ts` | `e6` (fixture 3b) | **MEASURED UNMOVED** — `schema S { a: -1 }` keeps `empty-schema-body` alone; comment re-derived | §Fix constraint 7 |
  | `tests/schema-alias-union-decl.test.ts` | `n29` CONTROL | **MEASURED UNMOVED** — same `-1` control; comment re-derived | §Fix constraint 7 |
  | `tests/params-scalar-nontype-text-refusal.test.ts` | `c4` (`???`, field) | codes `[]` → `["error theta/parse/schema-type-not-expression"]`; `S_WITH_PERMISSIVE_A` byte-unchanged | **OPERATOR GRANT** |
  | `tests/params-scalar-nontype-text-refusal.test.ts` | `c5` (`???`, alias) | codes `[]` → same; `PERMISSIVE` byte-unchanged | **OPERATOR GRANT** |
  | `tests/params-scalar-nontype-text-refusal.test.ts` | `c7` (`[a, b]`, field) | codes `[]` → same; `S_WITH_PERMISSIVE_A` byte-unchanged | **OPERATOR GRANT** |

  e6 and n29 do not move because `parseSchemaObjectBody` drops the malformed
  field list WHOLE, so no field-type walk runs and no fragment reaches the
  judgement — the fix moves fewer pins than constraint 7 licenses. The three
  granted cells were relocated from `CONTRAST_ROWS` into a `BODY_POSITION_REFUSED`
  table inside the same `describe`, which review round 1 verified is the idiom
  0059's own moved cells use (its four `params-default-string-literal-raw-newline`
  rows moved from `ADMITTED` into a new `TYPE_TEXT_REFUSED` table under the same
  grant), with both halves still asserted per cell and the file still at 93
  cells; recorded because the grant's words "change ONLY the codes column"
  describe a smaller textual edit than shipped, while every semantic obligation
  of the grant is met.
- Per-position sink-threading map after the change (§Fix constraint 2, measured
  in both directions): `params:` field type — bug 0059's sink;
  `schema` object-body field type — **this fix's**, at
  `collectUnresolvedNamedTypes` per field in `walkStatement`'s `schema` arm;
  `schema X = …` alias/union arm — **this fix's**, at
  `collectUnresolvedNamedTypes` over the joined arms in
  `checkSchemaDeclarationGraph`; `@<T>` annotation — **none** (its own
  `collectUnresolvedNamedTypes` call threads no fourth argument and
  `lowerQueryResponseSchema` → `buildBodyTypeSchemas` is untouched); `value`
  (`let` annotation, `fn` parameter type) and `return` (`fn` return type) —
  none, they never reach `lowerTypeSource`. All five unthreaded observables
  measured byte-identical across the change and pinned as over-refusal
  tripwires: `@<Cat +>` → `[]`, `lowerQueryResponseSchema("Cat +", …)` → `{}`,
  `let x: Cat + = 1` → `[]`, `fn f(p: Cat +): integer { 1 }` → `[]`,
  `fn f(): Cat + { 1 }` → `[]` (the return position captures `"Cat+"` whole and
  stays silent; `ReturnType` is a different production and refusing it is
  nobody's claim here). `@<Ghost>` → `unresolved-named-type` is the control
  proving those four absence assertions can red.
- The emission set — the *Trigger*'s post-hoc in-scope set, measured. Judged
  unit: the brace-free FRAGMENT `lowerTypeExpr`'s trailing catch-all is handed,
  at either body position, at any reach — the whole arm or field type
  (`schema X = Cat +` → `Cat+`; `schema S { a: string | }` → `string|`), a union
  arm at either position (`string | integer +` → `integer+`), a `GenericType`
  argument (`array<Cat +>` → `Cat+`), an inline `ObjectType`'s field type at any
  depth (`{b: string +}` → `string+`; `{b: {c: ???}}` → `???`), and the `by`
  spelling (`schema X by a = Cat | Dog +` → `Dog+`) and the `.thetalib` spelling
  alike. Count: one per offending fragment, no dedup (`Cat + | Dog +` → two;
  `{ a: string +, b: Cat . }` → two). Range: the declaration's, which is the
  range both positions' existing type diagnostics already carry
  (`SchemaFieldSource` has none of its own). The fragment-level brace/literal
  decline is SHARED with `theta/load/params-type-not-expression`, stated as
  shared in both rows rather than copied.
- Guards (§Fix constraint 1), two, both modelled on bug 0059's landed pair.
  (1) *Same-scope last resort* — a field, resp. a declaration, that already drew
  an error-severity diagnostic in its own walk keeps it alone:
  `schema S { a: void + }` → `void-in-non-return-position`;
  `{ a: array<integer, integer> + }` → `generic-arity-mismatch`;
  `schema X = Result<string, integer> +` → `result-in-schema-position`;
  `{ a: enum["x"] + }` → `inline-enum`; `schema X = Ghost | Cat +` →
  `unresolved-named-type`. The window is DECLARATION-wide at the alias position
  and PER-FIELD at the object position, which follows the shape of each
  position's own walk — one `collectUnresolvedNamedTypes` call over the joined
  arms versus one per field — and review round 1 verified it independently:
  a per-arm alias window would red `schema X = Ghost | Cat +` with two
  diagnostics, and would additionally move pre-existing behaviour
  (`schema X = Ghost | Ghost` emits one `unresolved-named-type` today through
  the single call's dedup, two under per-arm calls), which nothing authorizes.
  (2) *Node-refusal flag* — `emitMalformedAliasRhs` runs at PARSE time into a
  different diagnostic array from the checker pass, so guard 1 cannot see it;
  its boolean return is recorded as `SchemaDecl.aliasRhsRefused` and the alias
  emitter skips a flagged declaration. `schema X = Cat + 1`, `Cat . Dog`,
  `string+integer`, `Cat.a`, `string ++ integer` each keep exactly one
  `malformed-alias-rhs` (and `Cat.a`'s pair with `unknown-identifier` stays a
  pair of two). Verification found guard 2 additionally protects
  `schema X = -1`, whose captured arm is the lone `"-"` — itself unspellable —
  so `tests/schema-alias-rhs-malformed.test.ts` cells b4/b5/d3 depend on it too.
- §Fix constraint 6, the suppressed sibling, DECIDED: the refusal ALONE.
  `schema X = Ghost +` and `schema S { a: Ghost + }` draw
  `schema-type-not-expression` and NOT `unresolved-named-type`, because `Ghost+`
  is not a `NamedType` (`NamedType ::= Ident`, `grammar.md:98`) so that row's
  trigger does not reach it, and restoring it would be the mis-attribution bug
  0044 owns, which constraint 6 forbids moving. `schema S { a: match + }`
  likewise draws the refusal alone; `schema S { a: match }` keeps
  `reserved-keyword-as-identifier` untouched.
- §Fix constraint 3, grammar-admitted traffic keeps its bytes AND its silence,
  pinned byte-for-byte at both positions: `array<{b: string}>` →
  `{"type":"array","items":{}}`; `"x" | integer` →
  `{"anyOf":[{},{"type":"integer"}]}`; `{b: string}` →
  `{"$ref":"#/$defs/__inline_0aac28182e71617b"}`; `"low" | "high"` →
  `{"type":"string","enum":["low","high"]}`; `string | integer` →
  `{"type":["string","integer"]}`; `"x"` → `{"const":"x"}`; and `{}` keeps
  `theta/parse/empty-schema-body` ALONE — declined, never refused. The
  `__inline_<slug>` names are minted by hand-written canonical-form SHA-256
  oracles with their own honesty cells; `schemaSlug` is deliberately not
  imported.
- Committed-corpus census, re-derived at the fix baseline rather than assumed
  (§Fix constraint 8): `git ls-files` lists **34** committed `.theta` /
  `.thetalib` files (32 `.theta`, 2 `.thetalib`) declaring **zero** alias/union
  declarations and **11** object schemas with **25** field types, every one a
  well-formed `Type`. No committed fixture is in either sub-class, so none
  changes disposition; `tests/committed-fixture-parse-gate.test.ts` is green,
  and `tests/fixtures/h7a/permitted-codes.json` stays byte-unchanged (blob
  `a4a8da04…`), decided by the real H9a run.
- Baseline drift recorded — the doc's §Reproduction was measured at 0.52.0 and
  two rows have since moved; everything else re-derived exact. (1) `{}` at both
  body positions now draws `theta/parse/empty-schema-body` (bug **0045 is
  fixed**), so this document's `diags []` row for `schema S { a: {} }` /
  `schema X = {}` and its §Related description of 0045 as "open" are stale: the
  disposition a recogniser must decline is now a *diagnostic to leave alone*,
  not a silence to preserve. The lowered bytes are unchanged, so constraint 3's
  byte requirement still holds. (2) `schema S { a: match }` now draws
  `theta/parse/reserved-keyword-as-identifier`, not the spurious
  `unresolved named type 'match'` this document cites for bug 0044. Neither
  error changes any constraint's substance.
- Gates: witness `tests/schema-body-nontype-text-refusal.test.ts` 96/96 green
  (RED before the fix at HEAD `8e2a199c`: 49 failed | 47 passed (96) — group (a)
  43 refusal cells, group (d) 3 constraint-6 cells, group (r) 3 registry cells,
  with the six fence groups (a0)/(b)/(c)/(e)/(f)/(g) green already); full
  default suite `npm test` 281 files / 4591 tests green;
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) exit 0; `npm run lint`
  exit 0; H8a live 30/30 (the additive cell below); H9a acceptance 11/11.
- Review: round 1 deep — FINDINGS, both non-behavioural: F1 `house-rule` (the
  catch-all's comment still claimed `parseParams` was the sink's "one reader",
  contradicting the same file's own updated `LowerCtx.unspellable` contract;
  re-derived to name the three readers and the shared predicate), F2 `test`
  (two `path:line` citations inside the new witness wrong at the post-fix
  tree — `code-registry-parse.md:91`→`:92`, shifted by this fix's own row
  insertion, and `schemas.md:63`→`:64`; re-anchored). Both posed questions were
  answered with independent evidence: the guard-1 window asymmetry is correct
  and follows each position's walk, and the three granted cells' relocation is
  the idiom 0059's own moved cells use. Two comment-only polish passes followed
  (the second re-anchoring three further `params.ts` citations that the first
  pass's own +3 comment lines staled); every hunk of both passes touches only
  comment prose, verified hunk-by-hunk against the tree, so the confirmation
  review round was skipped per the polish rule with the gates re-run green.
  Cap 1 of 5.
- Verification: SOLID, zero findings. Four neutralisations, each red for the
  right reason and restored blob-hash-exact against the working-tree oracle
  (`theta-document.ts` `cdf7db1b…`, `params.ts` `3dbd9c03…`, all 11 files
  re-hashed after every cycle). (i) Removing the `unspellable` argument from
  both threading sites reds 46 cells — group (a)'s 43 plus d1/d2/d3 — with the
  six fence groups still green. (ii) Dropping the BRACE half of the shared
  decline reds exactly 10 cells: this fix's e1 at both positions, and bug 0059's
  own group-(d) brace rows d4/d5/d6/d6-body/d9/d11/d12/d13 — one edit reddening
  both bugs' witnesses, which is the proof the decline is genuinely shared and
  that narrowing it narrows 0059's landed refusal. (iii) Deleting the
  `s.aliasRhsRefused` conjunct doubles up the `malformed-alias-rhs` pairs
  (witness group (c)'s five cells) and additionally reds b4/b5/d3 in bug 0042's
  witness. (iv) The additive H8a cell was red-proven live under (i): the junk
  theta `b61livebroken` registered where the cell asserts it must not.
  Live: one additive H8a cell (file 29 → 30 cells, +211/−0) — a theta whose
  `schema S { a: string + }` field type is junk is refused through the real
  `session_start` → `resources_discover` → `composeExtensionInstance` →
  `discoverAndComposeFixtures` path (`handle.command` undefined,
  `registeredNames()` excludes it, and the `theta-system-note` channel carries
  the registry-sourced message exactly once) beside a well-formed sibling
  (`schema S { a: string }`) and an unrelated control that both register;
  registration-only, so zero tokens. No open live signature was hit — both
  halves ran clean first time.
- Residuals: (1) **Cross-file `src`-line citation drift.** The change grew
  `theta-document.ts` by +102 lines, `body-type-lowering.ts` by +31 and
  `params.ts` by +25, so `path:line` citations in roughly two dozen OTHER test
  files' comments are now stale. Every citation inside the eleven touched files
  was re-anchored and verified at the post-fix tree (review round 1 swept all 30
  in the new witness); the others are outside this fix's file allowlist, and the
  repo does not maintain them — two such citations in
  `tests/schema-alias-union-decl.test.ts` (`:143`, `:694`) were already stale at
  HEAD from earlier fixes. Bug 0134's class. (2) **The `.thetalib` field-position
  reach is pinned at one position only.** The *Trigger* claims both extensions
  at both positions; the witness pins `.thetalib` at the alias position, and the
  field position in a `.thetalib` was verified live by review round 1
  (`schema S { a: ??? }` in a library → one refusal) but carries no cell. A cell
  would close it. (3) **`schema X by a = Cat +` draws the refusal plus
  `by-on-object-schema`** — two distinct author errors, not a cascade: the
  `by`-clause check is outside the *Trigger*'s closed guard set and the row
  promises one diagnostic per FRAGMENT, not per declaration. Verified live in
  review round 1; unpinned. (4) The `-1` alias arm's dependence on guard 2
  (witness-adjacent cells b4/b5/d3 in bug 0042's file) is load-bearing but
  documented only in this record and in verification's N3.
- Discharge notes appended: bug 0042 §Fix (0.52.0) *Residuals* (i) and (ii) —
  both discharged, this report being the filing of exactly those two residuals;
  bug 0059 — its §Fix's "a position that threads no sink is unchanged, so the
  three other type positions keep their bytes and their diagnostics until they
  adopt it" and its constraint 2 are now discharged for two of the three
  positions (the operator grant's rider). NO note on bug 0033 §Fix (0.45.0)
  *Residuals* (ii): it records grammar-admitted arms (bug 0043's subject), which
  this fix DECLINES rather than refuses, so its claim is untouched.
- Pinned dispositions / non-goals: the `@<T>` annotation, the `value` position
  and the `return` position keep byte-identical lowered documents and
  diagnostic sequences and are NOT claimed here (§Fix constraint 2, witness
  group (g)); `{}` keeps bug 0045's `empty-schema-body` alone and is declined,
  never refused; `schema S { a: -1 }` and `schema X = |` keep
  `empty-schema-body` alone (both measured — the field list, resp. the arm list,
  is dropped whole before any fragment reaches the judgement); keyword-shaped
  text drawing the wrong code stays bug 0044's (`schema S { a: match }`
  untouched); `lowerTypeExpr`'s arm ordering stays bug 0043's; the boundary
  token after a completed capture stays bug 0042's, its five contrast fixtures
  each keeping exactly one `malformed-alias-rhs`; and the capture over-run
  through `<` / `>` (`schema X = Cat >`) remains unfiled and out of frame.

### Discharge note — bug 0124's fix (0.121.0)

Appended by bug [0124](./0124-parsetype-trailing-punctuation-leniency.md)'s fix.
Two statements of this record are now superseded, both in the direction this
record anticipated.

1. **Three of the five over-refusal tripwires have fired, as designed.** The
   *Per-position sink-threading map* pins `let x: Cat + = 1`,
   `fn f(p: Cat +): integer { 1 }` and `fn f(): Cat + { 1 }` as `[]` with the
   `value` and `return` positions "unthreaded", against the day a change
   over-refused into positions this report declines in terms (§Fix constraint 2:
   "not claimed here"). Bug 0124 owns exactly those three positions and its §Fix
   requires them refused, so cells `g3` / `g4` / `g5` of
   `tests/schema-body-nontype-text-refusal.test.ts` now expect one
   `theta/parse/annotation-type-not-expression` each, marked inline with bug
   0124 as their authority. The file's cell count is unchanged at 96 and nothing
   else in it moved. The remaining two tripwires — `@<Cat +>` → `[]` and
   `lowerQueryResponseSchema("Cat +", …)` → `{}` — are byte-identical across
   that change and still guard the `@<T>` position, which stays unthreaded.
2. **The map's "none" entries for `value` and `return` are superseded, and the
   threading point is NOT this report's sink.** Bug 0124 reaches those three
   positions through a recogniser beside `annotationToCompatType`
   (`src/parser/type-layer-checks.ts`) that calls
   `collectUnresolvedNamedTypes`'s fourth out-parameter — this report's own sink
   — and filters through the ONE shared decline `isUnspellableTextRefusable`, so
   the four positions agree on a fragment's disposition by construction rather
   than by coincidence, and narrowing that decline still narrows all four at
   once. `lowerTypeSource` is not reached at those positions and no lowering
   byte moves. Its refusal is a separate registered row,
   `theta/parse/annotation-type-not-expression`, minted rather than a widening
   of this row's *Trigger*: this row's slug and *Trigger* name a `schema`
   object-body field type and an alias arm, and a `let` annotation is neither —
   widening would be the bug 0044 honest-identity overreach. This row's
   *Trigger*, Message, guards and count rule are byte-unchanged.

One defect in this fix's landed refusal was measured while 0124 was in flight
and is NOT repaired: the angle-only generic-argument split shreds a brace group
of three or more fields, so the brace-free middle shard reaches the judgement
and a LEGAL annotation is falsely refused —
`schema S { a: array<{a: string, b: integer, c: boolean}> }` and
`schema X = array<{a: string, b: integer, c: boolean}>` each draw
`theta/parse/schema-type-not-expression`, and the `params:` spelling draws
`theta/load/params-type-not-expression`. The hazard reaches any depth
(`{a: array<{x: string, y: integer, z: boolean}>}`) and any `enum[…]` list of
two or more items, since no split tracks bracket depth. Bug 0124's three
positions are immune because its recogniser declines a source carrying a
bracket, or carrying both a brace and an angle bracket, before consulting the
shared sink; repairing this row would move landed behaviour and belongs to
whoever files it.
