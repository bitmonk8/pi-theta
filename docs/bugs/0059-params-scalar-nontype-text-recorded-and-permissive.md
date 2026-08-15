# Bug 0059 — A `params:` right-hand side that is a YAML scalar carrying text no `Type` production spells lowers to the permissive `{}` with zero diagnostics: `p: "a: Tirage"`, the one-line `p: |` and `p: >` block scalars, a folded multi-line, prose, punctuation and the quoted collection spellings all fall past every arm of `lowerTypeExpr` to its catch-all, AJV then accepts every JSON value for the field, and the same text is recorded as the declared type and rendered into the binder's `Parameters:` block

- **Status:** fixed (0.86.0).
- **Kind:** defect, two elements on one frame.
  1. *An input the type grammar does not admit is accepted silently and lowers
     permissively.* frontmatter-fields-a.md (`:58`) makes the `params:`
     right-hand side "a type expression parsed by the theta type grammar — the
     same grammar used in every other type-annotation position", and
     type-system.md (`:15`) names `params:` in that one grammar's position
     list. The `Type` production (grammar.md `:90`–`:102`, with `params:` named
     in the position list at `:105`) admits `PrimitiveType`, `NamedType`,
     `GenericType`, `ObjectType`, a union, and `LiteralType`. `a: Tirage`,
     `not a type at all`, `???`, `[a, b]`, `- a` and the empty string are none
     of them. Each is recorded as the field's declared type, lowers
     `properties.p = {}`, and produces no diagnostic at any severity, so the
     registration gate — `hasLoadParseError`
     (`src/extension/production-composition.ts:1894–1901`), which tests error
     severity only — never fires. schema-subset.md's step 3 (`:74`–`:81`)
     enumerates the emission per type form and defines no `{}` emission for any
     of them, so the declared shape is absent from the document AJV compiles and
     the argument boundary accepts any JSON value for that field.
  2. *The recorded declared type is text that spells no type.*
     `BypassParamsField.type` carries the recovered text verbatim
     (`src/binder/binder-envelope.ts:166–170`, "The field's declared surface
     type"), and the shipped `buildBinderSystemPrompt` renders it into the
     per-field line — `  p (a: Tirage) required`,
     `  p (not a type at all) required`, `  p () required`.
     binder-bypass-and-envelope.md *Type display* (`:129`) requires the rendered
     type to be "the field's declared Theta type written in the surface syntax
     of Type System"; text outside the `Type` production satisfies that for no
     reading. The two multi-line scalar spellings additionally break item 4's
     one-physical-line shape (`:117`) — that reach is bug
     [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)'s
     subject (0041 §Fix *Residuals* (ii)), one member of a family this report's
     input class does not cover.

  The **disposition is pre-existing** and survived bug 0041's fix intact: that
  fix judges the `params:` value **node**, and every spelling here is a YAML
  scalar.
- **Related:**
  - [0041](./0041-params-block-mapping-rhs-silent-permissive.md) — the filing
    origin, **fixed in 0.51.0**, and the report that made this class a route
    decision. Its §Fix settles the enforcement point at the frontmatter read
    with a predicate that reads no text, and states the boundary in its own
    words (`:550–552`): "This closes fixtures A–D and does **not** close fixture
    E: the quoted and block-scalar spellings carry byte-identical text through
    the `isScalar` arm." The reason the settled route reads no text is recorded
    against the rejected point (`:559–561`): "At this point the author's block
    YAML and a quoted string carrying the same bytes are indistinguishable —
    which is why it closes E, and why its diagnostic cannot name the YAML shape
    as the cause." Its §Fix (0.51.0) *Residuals* (i) (`:495–500`) records the
    remainder this report files. Its offline lock,
    `tests/params-block-mapping-rhs-refusal.test.ts`, pins that remainder at
    pre-fix bytes in two places — group (e) (`:813`–`:845`) for the three
    one-line scalar spellings and group (c1) (`:634`–`:656`) for the multi-line
    block scalar — naming a separate decision as the authority licensed to move
    them. This report is that authority for those four rows; a fix here moves
    them with doc authority and leaves the file's other groups untouched.
  - [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) —
    **the adjacent input class, and the ordering dependency.** 0056 owns
    literal-**shaped** text at `params:` (`p: '"x" | "y"'`, `p: '"hello"'`,
    `p: 42`): valid `Type` expressions (grammar.md `:102`) with a defined
    emission (schema-subset.md `:79`, `:80`) that lower permissively because
    the position has no literal arm. This report owns text that is **not a type
    expression at all**, arriving through the same scalar arm and landing on
    the same catch-all. The two sets are disjoint by the recogniser that
    separates them: 0056's fix moves `parseLiteralArm`
    (`src/parser/body-type-lowering.ts:693–714`) into `params.ts` and exports
    it, and this fix refuses exactly the text that recogniser — and every other
    `Type` arm — declines. 0056's pins in the same test file are group (e)'s
    `LiteralType` rows (`:847`–`:876`), beside the rows this report moves.
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — owns
    `lowerTypeExpr`'s **arm ordering**: the generic-application test runs
    before the union split (`src/parser/params.ts:394–409` before `:411–427`),
    so a union whose last arm ends `>` is consumed whole. That defect changes
    which arm a *grammar-admitted* union reaches; this one is about text no
    production spells reaching the trailing catch-all (`:467–469`) whatever the
    ordering. A fix here must not depend on the arm order 0043 changes, and
    0043's §Non-goals third bullet holds the mixed-union literal arm that stays
    on the catch-all after both land.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — the ancestor:
    its §Fix (0.44.0) *Residuals* (iii) (`:164–177`) is where this class was
    first recorded, filed as 0041, "discharged by its fix (0.51.0)" for the
    collection spellings, with the remainder pointed at 0041's residual (i) —
    "The scalar spellings that carry the same bytes stay silent — that route
    reads no text". 0035 also built `lowerParamsFieldType`
    (`params.ts:642–651`), the frame that forwards non-brace-rooted text to
    `lowerTypeExpr`.
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    — the render-seam sibling, filed from 0041 §Fix *Residuals* (ii). It owns
    what the `Parameters:` block does with a recorded type or default carrying
    a line break; this report owns whether the recorded type is a type at all.
    Fixtures E and G here are two of its inputs and two of this report's: a fix
    on either side changes what the other observes for them, and neither fix
    needs the other (refusal removes E and G from the render path; the render
    rule leaves their lowering permissive).
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — owns
    the permissive-`{}` inventory and the question of whether `{}` should ever
    be a lowering. This report removes one reachable trigger of the catch-all at
    one position; it does not reopen that question.
- **Affected** (every citation verified at HEAD `d88742f0`, 0.51.0):
  - `src/parser/frontmatter.ts:379–381` — **the gate that cannot see this
    input.** `paramValueCanCarryType`, bug 0041's admission predicate:
    `isScalar(value) || (isMap(value) && value.flow === true)`. It reads the
    node's kind and nothing else, so every scalar is admitted whatever bytes it
    carries. Its doc comment (`:369–378`) states the same scope.
  - `:700–702` — the per-item read:
    `isScalar(item.value) ? String(item.value.value) : paramValueSource(item.value, yamlSource)`.
    The scalar arm stringifies the node's parsed value, which is where the
    quoted, literal-block and folded-block spellings collapse to identical
    bytes.
  - `:713–721` — the 0041 refusal emission
    (`theta/load/params-type-not-expression`, error, per offending field),
    guarded by `paramValueCanCarryType`. Unreachable for a scalar.
  - `:722–727` — the field is retained in `fieldInputs` even when refused
    (0041's retention), so a refused field still reaches `parseParams`; `:730` —
    `type: typeSource`, the recorded declared type on `BypassParamsField`.
  - `:611–642` — `splitParamValue`: the first top-level `=` splits type from
    default (`:636–639`); with no `=` the whole scalar is the type, trimmed at
    the ends only (`:642`). The trim is why a block scalar's trailing newline
    does not reach the recorded type, and the split is why junk text carrying an
    `=` is judged only on its default half.
  - `src/parser/params.ts:642–651` — `lowerParamsFieldType`, the `params:`
    position's whole type lowering. Text that is not brace-rooted goes straight
    to `lowerTypeExpr` (`:647–648`); brace-rooted text is intercepted and
    hoisted (`:650`).
  - `:391–470` — **the frame.** `lowerTypeExpr`'s arms — generic application
    (`:394–409`), union split (`:411–427`), primitive atom (`:429–431`),
    identifier atom (`:433–465`) — and the trailing catch-all `return {}`
    (`:467–469`), whose comment names what it is for: "A literal-type atom
    (string/number literal) or any other form: lower permissively; literal
    lowering is owned by the schema-subset leaves." `:349` is `PRIMITIVE_TYPES`
    and `:357` the `IDENTIFIER` shape `/^[A-Za-z_][A-Za-z0-9_]*$/`, which a
    colon, a space, a bracket or a hash defeats.
  - `:380–382` — the header comment recording the catch-all as deliberate for
    admitted-but-unlowered forms: "an unrecognised form lowers permissively
    (`{}`) while still resolving any `NamedType` it nests"; `:384–389` — the
    comment recording that a brace-rooted type nested in a generic argument or
    a union arm still reaches this function, which is the traffic any catch-all
    diagnostic must not refuse.
  - `:157` — `parseParams`'s per-field lowering call; `:165–172` — the only
    diagnostic loop over a field's lowering, which reports names appended to
    `lowerCtx.unresolved`. The catch-all appends nothing, so the permissive
    lowering has no diagnostic channel at this site.
  - `:340–347` — `slugCollisions?`, the established **optional per-caller
    sink** on `LowerCtx`: "Like `unresolved`, the caller owns the array's
    lifetime and this module never reads it back: `parseParams` turns each entry
    into `theta/load/schema-slug-collision` at the field it was lowering.
    Absent, the check has nowhere to report". `:184–192` is that consumer — the
    in-tree precedent for a `theta/load/*` code raised from `parseParams` at one
    position only.
  - `:533–554` — `hoistInlineObjectType`, the brace-rooted route, whose
    zero-field arm returns the permissive `{}` (`:553–554`). Brace-rooted junk
    never reaches the catch-all; it lands here.
  - `src/parser/frontmatter.ts:554–600` — `toSystemParamType`, the third
    consumer of the recorded text, whose fall-through is `{ kind: "string" }`
    (`:600`), so `${p}` in a `system:` template is admitted for a junk-typed
    param and `${p.a}` is `theta/parse/system-interp-bad-field`.
  - `:1140` and `:1147–1150` — the two diagnostic pushes at the frontmatter
    seam, in that order, with the in-tree statement of the order's purpose
    (`:1137–1139`): "The per-field shape refusals land before the `parseParams`
    diagnostics: a field whose RHS spells no type expression is reported as
    such, not by whatever the lowering makes of its recovered bytes."
  - `src/binder/binder-envelope.ts:166–170` — `BypassParamsField.type`'s
    declared contract; `:137–157` — `relaxParamsSchema`, which copies the params
    schema's `properties` verbatim into the envelope's `ok.args` arm.
  - `src/binder/binder-system-prompt.ts:151–164` — `renderBinderParamLine`;
    `:157` interpolates the recorded type into
    `` `  ${field.wireName} (${field.type}) ${requirement}` `` with no check.
  - `src/extension/production-theta-producer.ts:603–612` and `:741` —
    `binderPromptParamField` copies `field.type` into the system-prompt
    descriptor for every binder attempt; `:709–712` (the binder envelope
    build), `:1173` (the post-default-merge AJV compile) and `:1968–1976` (the
    subagent child's params-intake validator) are the three consumers of the
    lowered document.
  - `src/extension/production-composition.ts:1894–1901` (`hasLoadParseError`),
    `:1941` (the drop test), `:1969` (the dropped arm) — registration is blocked
    only by an error-severity `theta/load/*` or `theta/parse/*` diagnostic, and
    this input produces none.
  - `tests/params-block-mapping-rhs-refusal.test.ts:634–656` (group (c1), the
    multi-line block scalar pinned as bug 0041's recorded residual — disposition
    only, the rendering deliberately not asserted) and `:813–845` (group (e),
    the three one-line scalar spellings pinned silent and permissive with
    `type` `"a: Tirage"`). Both name a separate decision as the authority
    licensed to move them.
  - `docs/spec_topics/diagnostics/code-registry-load.md:19` — the row bug 0041
    added, which assigns this input's disposition explicitly: "A scalar is
    admitted whatever text it carries: this row judges the node's shape, not its
    text — a scalar's disposition is the lowering's, not this row's."
- **Observed at:** `0.51.0` (`d88742f0`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument` (the real load
  path via `tests/helpers/e2e-s1.ts`), `lowerParamsFieldType` at the unit seam,
  the shipped `buildBinderSystemPrompt`, `Ajv2020` from the installed `ajv`, and
  `yaml`'s value nodes at the production `parseDocument(block.yaml, { lineCounter })`
  call shape; written, run, deleted.

## Summary

The `params:` type side is inline text in one grammar. Since bug 0041's fix the
frontmatter read refuses a value **node** that cannot carry a type expression —
a block mapping, a block sequence, a flow sequence, an alias, a member with no
value node. It refuses none of them by their text, because at that point the
text is not what is in hand: a quoted scalar and a block scalar carrying
byte-identical bytes are indistinguishable from any other scalar at the node
level, which is the property the settled route was chosen for.

So the same bytes still load, one quote character away:

```yaml
params:
  p: "a: Tirage"
```

and so does prose, punctuation, an empty string, a `[a, b]` in quotes, and the
block-scalar spellings `p: |` and `p: >` — including a folded multi-line, which
YAML folds to one physical line before anything downstream can see that it was
written across three. Every one of them:

- **lowers permissively.** The text is not brace-rooted, so
  `lowerParamsFieldType` forwards it to `lowerTypeExpr`, where it has no `<…>`
  to make a generic application, no `|` to split, no primitive name, and no
  `IDENTIFIER` shape — a colon, a space, a bracket or a hash defeats
  `/^[A-Za-z_][A-Za-z0-9_]*$/`. It lands on the trailing `return {}`.
  `properties.p = {}`: AJV validates nothing for that field, and no name inside
  the text is resolved, so `theta/parse/unresolved-named-type` cannot fire even
  though `Tirage` is declared nowhere.
- **is recorded as the declared type.** `BypassParamsField.type` is the junk
  text, and the shipped binder system prompt renders `  p (a: Tirage) required`
  — or `  p () required` for the empty spelling.
- **draws no diagnostic at any severity**, so `hasLoadParseError` is false and
  the theta registers with a param that accepts `7`, `"anything"`, `null`,
  `true`, `[]` and `{"a":{"urgent":true}}` alike.

The catch-all is silent by design, and the design is not this input's. Its own
comment scopes it to forms the grammar admits whose lowering lives elsewhere —
a `LiteralType`, and a brace-rooted arm nested inside a generic argument or a
union arm. Both of those are grammar-admitted and measured symmetric with the
`schema`-body position. Text that no `Type` production spells inherits their
silence without belonging to their class.

Two neighbours bound the class. The same bytes written as YAML nesting — `p:`
over an indented `a: Tirage` — are a block mapping, refused since 0.51.0 with
`theta/load/params-type-not-expression`. A junk text that happens to be
identifier-shaped — `p: 'nonsense = "x"'` — is read as a `NamedType`, resolves
against nothing, and is refused with `theta/parse/unresolved-named-type`.
Between a node shape that is refused and an identifier that is refused sits
arbitrary text, which is accepted.

## Reproduction

Offline at HEAD `d88742f0`. Every fixture is `mode: prompt` (the `system:`
fixtures are `mode: subagent`) plus the `params:` entry shown, over a body
declaring `schema Triage { urgent: boolean }` and `let x = 1`. `Tirage` is
declared nowhere. `lowered` is the lowered `params:` document, `field` the
`BypassParamsField`, `binder` the physical lines the shipped
`buildBinderSystemPrompt` emits.

### The class

```
@@ A  quoted scalar carrying block-YAML bytes      params  p: "a: Tirage"
   diags   :: []
   lowered :: {"type":"object","properties":{"p":{}},"required":["p"],
               "additionalProperties":false}
   field   :: {"wireName":"p","type":"a: Tirage","hasDefault":false,"nullable":false}
   binder  :: ["Parameters:", "  p (a: Tirage) required", ""]
@@ B  literal block scalar, ONE line               params  p: |
                                                             a: Tirage
   byte-identical to A in diags, lowered, field and binder
@@ C  folded block scalar, ONE line                params  p: >
                                                             a: Tirage
   byte-identical to A
@@ D  folded MULTI-line that folds to one line     params  p: >
                                                             a: Tirage
                                                             b: integer
   diags   :: []   properties.p = {}
   field   :: type "a: Tirage b: integer"
   binder  :: ["Parameters:", "  p (a: Tirage b: integer) required", ""]
@@ E  literal block scalar, TWO lines              params  p: |
                                                             a: Tirage
                                                             b: integer
   diags   :: []   properties.p = {}
   field   :: type "a: Tirage\nb: integer"
   binder  :: ["Parameters:", "  p (a: Tirage", "b: integer) required", ""]
@@ F  single-quoted, same bytes    params  p: 'a: Tirage'        → identical to A
@@ G  double-quoted \n escape      params  p: "a: Tirage\nb: integer"
   diags [] · type "a: Tirage\nb: integer" · binder identical to E
@@ H  quoted flow sequence         params  p: '[a, b]'    diags [] · {} · type "[a, b]"
@@ I  quoted block sequence        params  p: '- a'       diags [] · {} · type "- a"
@@ J  prose                        params  p: 'not a type at all'
   diags [] · {} · binder "  p (not a type at all) required"
@@ K  prose, description-shaped    params  p: 'the id of the ticket to triage'
   diags [] · {} · binder "  p (the id of the ticket to triage) required"
@@ L  punctuation                  params  p: '???'       diags [] · {} · type "???"
@@ M  comment-shaped               params  p: '# comment' diags [] · {} · type "# comment"
@@ N  two identifiers              params  p: 'Triage Triage'  diags [] · {} · type "Triage Triage"
@@ O  truncated generic            params  p: 'array<'    diags [] · {} · type "array<"
@@ P  empty and whitespace-only    params  p: ''   and   p: '   '
   diags [] · {} · type "" · binder ["Parameters:", "  p () required", ""]
@@ Q  junk type, literal default   params  p: 'a: Tirage = 5'
   diags   :: []
   lowered :: properties.p = {}, required []          (the default makes it optional)
   field   :: {"wireName":"p","type":"a: Tirage","hasDefault":true,"defaultSource":"5",…}
   binder  :: ["Parameters:", "  p (a: Tirage) default=5", ""]
```

### The YAML node behind each spelling

Read off `parseDocument(yaml, { lineCounter })` at the production call shape —
the level bug 0041's predicate judges:

```
A  p: "a: Tirage"            Scalar / QUOTE_DOUBLE   value "a: Tirage"
B  p: | + one line           Scalar / BLOCK_LITERAL  value "a: Tirage\n"
C  p: > + one line           Scalar / BLOCK_FOLDED   value "a: Tirage\n"
D  p: > + two lines          Scalar / BLOCK_FOLDED   value "a: Tirage b: integer\n"
E  p: | + two lines          Scalar / BLOCK_LITERAL  value "a: Tirage\nb: integer\n"
```

All five are `Scalar`, so `paramValueCanCarryType` (`frontmatter.ts:379–381`)
admits all five. The trailing newline is stripped by `splitParamValue`'s
end-trim (`frontmatter.ts:642`), which is why B and C record `a: Tirage` rather
than `a: Tirage\n`.

### Real AJV over fixture A's lowered document

`{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}`,
compiled with `Ajv2020` from the installed `ajv`:

```
{"p":7}                      -> true
{"p":"anything"}             -> true
{"p":null}                   -> true
{"p":true}                   -> true
{"p":[]}                     -> true
{"p":{"a":{"urgent":true}}}  -> true
{}                           -> false   (the only refusal: `required`)
```

### Unit seam — `lowerParamsFieldType` over the recovered texts

Every text below returns `{}` from both entry points, with `lowerCtx.unresolved`
`[]` and `lowerCtx.defs` `{}`:

```
"a: Tirage"   "a: Tirage\nb: integer"   "a: Tirage b: integer"   "not a type at all"
""            "???"                     "[a, b]"                 "- a"        "array<"
```

### The `system:` seam (`mode: subagent`)

```
params p: "a: Tirage" + system "${p}"    :: diags []   (typed as a string, admitted)
params p: "a: Tirage" + system "${p.a}"  :: ["error theta/parse/system-interp-bad-field:
      'system:' interpolation '.a' does not name a reachable object field on p"]
```

### Neighbours that are refused

```
@@ block mapping   params  p:
                             a: Tirage
   ["error theta/load/params-type-not-expression: 'params:' field 'p' right-hand
    side is not a theta type expression"]   frontmatter null      (bug 0041's fix)
@@ block sequence  params  p:
                             - a
                             - b                          same single code, refused
@@ flow sequence   params  p: [a, b]                       same single code, refused
@@ identifier-shaped junk   params  p: 'nonsense = "x"'
   ["error theta/parse/unresolved-named-type: unresolved named type 'nonsense'"]
@@ junk carrying a top-level `=`   params  p: 'pick one = or two'
   ["error theta/parse/default-not-literal: params default RHS must be a
    literal-sublanguage form; offending sub-expression: or"]
@@ boolean literal          params  p: true
   ["error theta/parse/unresolved-named-type: unresolved named type 'true'"]
```

### Controls that must not move

```
@@ p: Triage        diags [] · properties.p {"$ref":"#/$defs/Triage"} · type "Triage"
@@ p: "Triage"      diags [] · properties.p {"$ref":"#/$defs/Triage"} — a quoted scalar
                    whose text IS a type expression lowers identically
@@ p: string        diags [] · properties.p {"type":"string"}
@@ p: {a: Triage}   diags [] · properties.p {"$ref":"#/$defs/__inline_6a8e2246094f0455"}
                    $defs.__inline_6a8e2246094f0455 ::
                      {"type":"object","properties":{"a":{"$ref":"#/$defs/Triage"}},
                       "required":["a"],"additionalProperties":false}
@@ p:               diags [] · properties.p {"type":"null"} · type "null"   (null scalar)
@@ p: 'array<Ghost>'  ["error theta/parse/unresolved-named-type:
                       unresolved named type 'Ghost'"]   refused
```

### The catch-all's other residents

What else reaches the same `return {}` at this position. The first three rows
and the contrast are grammar-admitted and must keep their bytes (§Fix
constraint 3); the literal rows are bug 0056's; the last row is this report's
own class, reached one level down through a union arm:

```
@@ p: 'array<{a: string}>'      diags [] · properties.p {"type":"array","items":{}}
@@ p: 'string | {a: string}'    diags [] · properties.p {"anyOf":[{"type":"string"},{}]}
@@ p: '{a: array<{m: integer}>}'  hoists __inline_800ba1c3970ee2a8 whose
                                  properties.a is {"type":"array","items":{}}
@@ CONTRAST, `schema` body:  schema S { a: array<{m: integer}> } + p: S
   $defs.S.properties.a :: {"type":"array","items":{}}      — the same bytes, so the
   nested inline object's permissive lowering is symmetric across positions
@@ p: '"x" | "y"'   {"anyOf":[{},{}]}      @@ p: '"hello"'  {}      @@ p: 42  {}
   — bug 0056's class, on the same catch-all
@@ p: 'string | a: Tirage'   {"anyOf":[{"type":"string"},{}]}   — a junk UNION ARM,
   this report's class reached one level down
```

Two shapes reach a different arm and are not this frame:

```
@@ p: 'Result<string, integer>'  diags [] · {} — the generic-application arm's own
   permissive return (params.ts:408), not the catch-all
@@ p: '{junk}'  ·  p: '{}'       diags [] · {} — brace-rooted, so intercepted by
   lowerParamsFieldType and returned by hoistInlineObjectType's zero-field arm
   (params.ts:553–554)
```

### Committed-corpus census

Walked every `.theta` / `.thetalib` in the tree at HEAD (35 files; `node_modules`
and `.git` excluded), parsed each through the real load path: **17 declare
`params:`, and zero declare a field whose lowered fragment is `{}`.** No
committed fixture is in this report's class, so none changes disposition when
this fix lands; 0056 reports the same for its own class (its §Why it matters
census over the same 17 files finds no all-literal `params:` type).

Reading the table:

- **A–Q are one defect at eighteen spellings.** The recorded text differs; the
  lowering, the silence and the AJV envelope do not.
- **B, C and D matter for the fix's evidence**: the block-scalar spellings are
  the ones an author reaches for when the type "looks long", and D proves the
  physical layout is gone before any check could read it — YAML folds it.
- **E and G carry a line break into the recorded type.** The permissive
  lowering is this report's; the rendered two-line `Parameters:` block is bug
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)'s,
  which also reaches through the default RHS and a multi-line flow mapping.
- **Q shows the split**: `splitParamValue` cuts at the first top-level `=`, so
  the default half is checked (`theta/parse/default-not-literal` exists for it)
  and the type half is not checked at all.
- **The refused neighbours bound the class from both sides** — a node shape
  0041 refuses, and an identifier shape the resolution refuses.
- **The catch-all's other residents bound the fix.** Any diagnostic raised
  where the text falls through must decline a literal arm and a brace-rooted
  arm, or it refuses input the grammar admits at all four positions.

## Expected behaviour

Defined for what the right-hand side must be; defined, since 0.51.0, for which
stage owns the judgement; undefined for the judgement itself.

- **The grammar closes the admitted set.** grammar.md `:90`–`:102` gives the
  `Type` production (`PrimitiveType` | `NamedType` | `GenericType` |
  `ObjectType` | union | `LiteralType`), and `:105` names "`params:` field
  types" among the positions where "a bare `Type` appears", adding that "the
  grammar is otherwise identical in every position". None of the texts in
  §Reproduction is spellable by any of those productions.
  frontmatter-fields-a.md `:58` (mirrored at `docs/reference/frontmatter.md:75`)
  binds the position to that grammar; type-system.md `:15` binds all four
  positions to one grammar.
- **The emission table has no `{}` rule.** schema-subset.md step 3
  (`:74`–`:81`) enumerates the lowering per admitted type form — primitive,
  `$ref`, `array<T>`, object, literal, enum, SUBS-1 union, discriminated union.
  A text outside the grammar has no form, so no rule covers it, and the `{}`
  emitted today matches none of them.
- **The corpus already assigns this input's disposition to the lowering.** The
  registry row bug 0041 added (`code-registry-load.md:19`) states its own
  boundary: "A scalar is admitted whatever text it carries: this row judges the
  node's shape, not its text — a scalar's disposition is the lowering's, not
  this row's." The lowering's disposition is `properties.p = {}` and no
  diagnostic, so the sentence routes the judgement to a stage that makes none.
- **No registered row covers it.** Both registries were enumerated at HEAD.
  `theta/load/params-type-not-expression` (`code-registry-load.md:19`) triggers
  on the value node's shape and excludes scalars by its own text;
  `theta/parse/unresolved-named-type` (`code-registry-parse.md:89`) triggers on
  "a `NamedType` that resolves to no declaration usable at the position it is
  written", and junk text is not identifier-shaped, so it is not a `NamedType`;
  `theta/parse/unsupported-feature` (`:27`) triggers on "a theta 1.0-deferred or
  non-Theta **syntactic construct** (arrow function, spread, optional chaining,
  `===`, bitwise op, comma op, nested template, etc.)", which is a statement
  about theta source constructs, not about text in a type position;
  `theta/parse/default-not-literal` (`:48`) triggers on the **default** RHS —
  the other half of the same scalar, and the reason fixture Q is judged on its
  default and not on its type. The registry is closed
  (DIAG-2, `diagnostic-shape.md:72`), so the absence is a spec gap, not an
  implementation oversight.
- **What is not open.** Silence with a permissive lowering satisfies neither
  reading: either the text is refused with a registered code and the theta does
  not register, or it is admitted with a defined emission — and no emission rule
  exists to admit it under. Independently, binder-bypass-and-envelope.md `:129`
  requires the rendered per-field type to be "the field's declared Theta type
  written in the surface syntax of Type System", which `  p (not a type at all)`
  and `  p ()` cannot satisfy for any input the position admits.

## Actual behaviour / root cause

The type side is text by the time anything can judge it as text, and the one
stage that judges it judges the YAML node instead.

1. **The node-shape gate is total over scalars.** `paramValueCanCarryType`
   (`frontmatter.ts:379–381`) is `isScalar(value) || (isMap(value) && value.flow === true)`.
   Bug 0041 settled that predicate deliberately: the point it runs at is the only
   one still holding the YAML node, and at the *text* level "the author's block
   YAML and a quoted string carrying the same bytes are indistinguishable"
   (0041 §Fix, `:559–561`). The predicate is correct for what it decides; it
   decides nothing about text.
2. **The scalar arm collapses the spellings.** `extractParsedParams`
   (`:700–702`) takes `String(item.value.value)` for a scalar, so a
   double-quoted scalar, a literal block scalar and a folded block scalar
   deliver the same bytes, and a folded multi-line delivers its folded form.
   `splitParamValue` (`:611–642`) then trims the ends and cuts at the first
   top-level `=`.
3. **The lowering's catch-all absorbs whatever text arrives.**
   `lowerParamsFieldType` (`params.ts:642–651`) intercepts only brace-rooted
   text; everything else goes to `lowerTypeExpr`, which tests for a generic
   application, splits a union, matches a primitive, matches
   `IDENTIFIER` — and otherwise returns `{}` (`:467–469`). `a: Tirage` fails
   `IDENTIFIER` on the colon and the space; `???`, `[a, b]`, `- a`, `# comment`
   and the empty string fail it on their first character.
4. **The catch-all is silent for a reason that is not this input's.** Its own
   comment and the function header (`:380–382`) scope it to forms the grammar
   admits whose lowering lives elsewhere — a `LiteralType` (bug 0056), and a
   brace-rooted arm nested in a generic argument or a union arm, which
   `:384–389` records explicitly and §Reproduction measures as symmetric with
   the `schema`-body position. Turning the catch-all itself into an error would
   refuse that admitted traffic at all four positions: `lowerTypeSource`
   delegates to this function (`body-type-lowering.ts:413`) for the
   `schema`-body field and the alias RHS, and the `@<T>` annotation enters it
   through the same call (`query-schema-lowering.ts:148`).
5. **`lowerCtx` stays empty, so the sibling diagnostic cannot fire.**
   `parseParams`'s per-field diagnostic loop (`:165–172`) reports only names
   appended to `lowerCtx.unresolved`. The catch-all appends nothing —
   `Tirage` inside `a: Tirage` is never a resolution candidate, because the
   name is never read as a name.
6. **Registration has no other gate.** With no error-severity diagnostic,
   `hasLoadParseError` (`production-composition.ts:1894–1901`) is false, the
   drop arm (`:1941`, `:1969`) is not taken, and the theta registers with a
   param that accepts anything.
7. **The same text is used as a type by two more consumers.** It becomes
   `BypassParamsField.type` (`frontmatter.ts:730`), which reaches the binder
   system prompt verbatim (`production-theta-producer.ts:603–612`, `:741` →
   `binder-system-prompt.ts:157`), and it is typed for `system:` interpolation
   by `toSystemParamType`, whose fall-through is `{ kind: "string" }`
   (`frontmatter.ts:600`).

The mechanism is one gap between two correct decisions: a node-shape gate that
reads no text, and a lowering catch-all that reads text but is licensed to be
silent for a different class.

## Why it matters

- **The lowered fragment is the only enforcement the argument gets.** Three
  sites compile it — the binder envelope
  (`production-theta-producer.ts:709–712` → `binder-envelope.ts:89`), the
  post-default-merge validation (`:1173`), and the subagent child's params
  intake (`:1968–1976`). `properties.p = {}` admits every JSON value at all
  three, so a param declared with a nested shape, a sentence, or nothing at all
  binds `7`, `null` or `{"nope":1}` and the body runs on it. The `params:`
  position is where untrusted input arrives — slash-argument binding,
  `invoke(...)`, tool-call arguments.
- **The binder is grounded in text that is not a type.**
  `relaxParamsSchema` (`binder-envelope.ts:137–157`) copies the permissive
  fragment into the model-facing forced-tool schema, so grammar-constrained
  decoding constrains nothing, while the `Parameters:` block tells the model
  `p (a: Tirage)`, `p (not a type at all)` or `p ()` — a *Type display* MUST
  (`binder-bypass-and-envelope.md:129`) rendered from bytes that spell no type.
- **The silence is spelling-sensitive in a way authors cannot predict.** The
  same bytes are refused written as YAML nesting and accepted written as a
  quoted scalar; a sentence is accepted where a one-word junk text is refused
  as an unresolved named type. An author who writes the type as a YAML block
  gets a diagnostic; the same author who quotes it, or writes it under `p: |`
  because it is long, gets silence.
- **A `params:` description written in the type slot loads clean.** Fixture K —
  `p: 'the id of the ticket to triage'` — is the plausible mistake for the
  position that carries the binder's prompt text, and it produces a registered
  theta whose param validates nothing.
- **The empty spelling produces a malformed prompt line.** `p: ''` records the
  empty string and renders `  p () required`, which satisfies neither the
  template's `<type>` token (`:117`) nor *Type display* (`:129`).
- **No gate scores it.** The census in §Reproduction found 35 committed
  `.theta` / `.thetalib` files, 17 declaring `params:`, none with a permissive
  fragment, so `tests/committed-fixture-parse-gate.test.ts` never meets one, and
  bug 0041's lock pins four rows of this class as *unchanged* by design.

## Fix

Judge the recovered type text at the `params:` position and refuse text that no
`Type` production spells, with one error-severity diagnostic per offending
field, raised where the position's other per-field type diagnostics are raised.

The emission point sees the text — that is the difference from bug 0041's gate,
which sees only the node. The text falls through at one place,
`lowerTypeExpr`'s catch-all (`src/parser/params.ts:467–469`), and that place is
shared by all four type positions since bug 0039, so the judgement is recorded
there and the *refusal* is made by the caller: `lowerTypeExpr` appends the text
it is discarding to an optional `LowerCtx` sink beside `unresolved` and
`slugCollisions` (`:340–347` — the established pattern, whose contract is that
this module never reads the sink back), and `parseParams` (`:157`, `:165–172`)
turns each entry into the diagnostic at the field's range. A position that
threads no sink is unchanged, so the three other type positions keep their
bytes and their diagnostics until they adopt it.

What the caller declines is exactly what the catch-all still carries
legitimately: literal-shaped text — recognised by 0056's `parseLiteralArm`,
exported from `params.ts` by that fix — and brace-rooted text, the test
`lowerParamsFieldType` already applies (`params.ts:647`). No second grammar
walk, and no second literal recogniser.

Registration is withheld by the pre-existing error-severity gate
(`hasLoadParseError`, `production-composition.ts:1894–1901`); no second gate is
added.

**Registry.** The code is `theta/load/params-type-not-expression`
(`code-registry-load.md:19`), whose *Message*, severity (`E`) and phase
(`load`) already state this contract; the fix widens its *Trigger* to cover the
text-level judgement, re-derives the *Fix hint*'s shape-specific second sentence
("A nested YAML mapping or sequence under the field name declares no type"),
and re-derives the sentence that currently excludes this input ("A scalar is
admitted whatever text it carries: this row judges the node's shape, not its
text — a scalar's disposition is the lowering's, not this row's"), together
with the owning spec sentence
(`frontmatter-fields-a.md:58`) and its mirrors
(`docs/reference/frontmatter.md`, `docs/reference/diagnostics.md`). A DIAG-2
*Trigger* change lands in the same commit as the site it is raised from
(`diagnostic-shape.md:72`) and is dispositioned by GOV-15's diagnostic-registry
carve-out (`governance/source-language-stability.md:25`) "as an addition for
inputs newly brought into the code's emission set" — so the added trigger prose
*is* the post-hoc in-scope set and must enumerate the refused spellings. The
*Message* bytes do not change, so no DIAG-4 reword is involved. Raising a
`theta/load/*` code from `parseParams` is precedented in the same function:
`theta/load/schema-slug-collision` (`params.ts:184–192`).

**Ordering.** This fix lands after — or in the same change as —
[0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md). 0056
moves `parseLiteralArm` into `params.ts` and gives the position its literal
arm; without it, this fix carries a private literal recogniser that 0056 then
deletes, and the two changes re-pin the same rows of one test group twice.
Whichever lands second re-derives the other's pins in
`tests/params-block-mapping-rhs-refusal.test.ts` group (e) — this report owns
the three scalar rows (`:826–845`), 0056 owns the three `LiteralType` rows
(`:847–876`) — and re-derives the shared catch-all's residents, since each fix
removes a class from it.

Constraints on any implementation:

1. **Exactly one diagnostic per offending field.** Bug 0041's fix *retains* a
   shape-refused field in `fieldInputs` (`frontmatter.ts:722–727`) precisely so
   the input draws one diagnostic and no cascade, and its lock pins that
   (fixture L, group (f)). The retained field's recovered bytes still reach
   `parseParams`, so a block mapping — refused at `:713–721` — would draw the
   text-level refusal as well unless the fix suppresses one of the two. The
   ordering comment at `frontmatter.ts:1137–1139` states which survives: "a
   field whose RHS spells no type expression is reported as such, not by
   whatever the lowering makes of its recovered bytes."
2. **No cross-position blast radius.** The diagnostic must not be raised inside
   `lowerTypeExpr`, which every type position reaches — the `schema`-body field
   and the alias RHS through `lowerTypeSource`'s delegation
   (`body-type-lowering.ts:413`), the `@<T>` annotation through that same
   function (`query-schema-lowering.ts:148`). The sink is optional per
   `LowerCtx` for that reason, and the three other positions must show
   byte-identical lowered documents and byte-identical diagnostic sequences
   after the change.
3. **Grammar-admitted traffic on the catch-all keeps its bytes.** Measured, and
   all symmetric with the contrast positions: a brace-rooted arm nested in a
   generic argument (`array<{a: string}>` → `{"type":"array","items":{}}`) or in
   a union arm (`string | {a: string}` → `{"anyOf":[{"type":"string"},{}]}`),
   including through a hoisted inline object
   (`{a: array<{m: integer}>}` → `__inline_800ba1c3970ee2a8`); and a literal arm
   of a mixed union (`"x" | integer`), which 0056 leaves on the catch-all by its
   own §Non-goals. The recogniser declines these; a fix that refuses them is
   over-refusing, and the failure mode is the one bug 0041's §Fix disqualified
   its lowering point for.
4. **The refused set is enumerated, and the trigger states it.** From
   §Reproduction: text carrying a YAML mapping or sequence shape (`a: Tirage`,
   `[a, b]`, `- a`), prose, punctuation, a comment-shaped text, two
   space-separated identifiers, a truncated generic (`array<`), and the empty
   or whitespace-only type text — reached through a quoted scalar, either block
   scalar form, or a folded multi-line, and at any depth a union arm reaches
   (`string | a: Tirage`).
5. **Controls do not move.** `p: Triage` and `p: "Triage"` keep
   `{"$ref":"#/$defs/Triage"}`; `p: string` keeps `{"type":"string"}`;
   `p: {a: Triage}` keeps its hoist under `__inline_6a8e2246094f0455`; the
   value-less key `p:` keeps `{"type":"null"}` through the null-scalar arm
   (bug 0041's fixture J); `p: 'array<Ghost>'` keeps its single
   `theta/parse/unresolved-named-type`; and bug 0041's fixtures A–D keep exactly
   one `theta/load/params-type-not-expression` each.
6. **Identifier-shaped junk keeps its current disposition.**
   `p: 'nonsense = "x"'` and `p: true` are refused today through the identifier
   arm with `theta/parse/unresolved-named-type`. Whether that code is the right
   one for keyword-shaped text is bug
   [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s, and
   for a lowercase name bug
   [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s; this fix
   must not move either.
7. **The pins that move, move with this document as their authority.**
   `tests/params-block-mapping-rhs-refusal.test.ts` group (e)'s three scalar
   rows (`:826–845`) and group (c1)'s multi-line block-scalar residual
   (`:634–656`) invert from silent-permissive to refused. Both were written as
   deliberate holds naming a separate decision as the authority licensed to move
   them; the fix re-derives their comments to name this report and leaves the
   file's other groups — (a), (b), (b2), (c1 fence), (c2), (d), (f), (g) — as
   they are.
8. **GOV-15 and the H9a gates.** Files that load today stop loading, which is
   the carve-out's covered effect for the newly in-scope inputs; the census in
   §Reproduction (35 files, 17 with `params:`, zero permissive fragments) is the
   measured blast radius over the committed corpus, and it must be re-derived at
   the fix baseline rather than assumed. The code un-registers the theta and is
   absent from `tests/fixtures/h7a/permitted-codes.json`; it stays absent unless
   a committed H9a fixture enters the class.
9. **Test witness — offline, deterministic, no live provider.** Every fixture in
   §Reproduction is a `parseThetaDocument` call, a `lowerParamsFieldType` call,
   a `buildBinderSystemPrompt` call or an AJV compile. Required beyond the
   probes: each spelling in constraint 4 refused with exactly one diagnostic and
   a nulled frontmatter; the block-mapping input still at exactly one
   diagnostic (constraint 1); the constraint-3 rows pinned byte-for-byte
   including the minted slug; the constraint-5 controls pinned byte-for-byte;
   the four inverted rows of bug 0041's lock updated in place; and the
   diagnostic's message derived from the registry read, not restated.
10. **The `Parameters:` line-shape family is not discharged here.** Refusal
    removes fixtures E and G from the rendering path, but bug
    [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)'s
    other reaches — a multi-line flow mapping, and a line break riding
    `defaultSource` — are grammar-admitted or default-side and survive. A
    render-seam rule is that report's, not this fix's.

## Non-goals

- **Literal-shaped text at `params:`.** `p: '"x" | "y"'`, `p: '"hello"'` and
  `p: 42` are valid `Type` expressions whose permissive lowering is bug
  [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)'s
  subject. This report's recogniser declines them by construction, and its fix
  depends on 0056's.
- **`lowerTypeExpr`'s arm ordering.** The generic-application test running
  before the union split is bug
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md)'s. Nothing here
  changes which arm a grammar-admitted union reaches.
- **The nested inline object's permissive lowering.**
  `array<{a: string}>` lowers `{"type":"array","items":{}}` at the `params:`
  position and at the `schema`-body position alike — measured symmetric, so it
  is not a position defect, and it is grammar-admitted traffic this fix must
  preserve (constraint 3).
- **Brace-rooted junk.** `p: '{junk}'` and `p: '{}'` never reach the catch-all:
  `lowerParamsFieldType` intercepts brace-rooted text (`params.ts:647–650`) and
  `hoistInlineObjectType`'s zero-field arm returns `{}` (`:553–554`). The
  empty-inline-object half is bug
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)'s; the
  frame is the hoist, not this one.
- **`Result<…>` in a lowered-schema position.** `p: 'Result<string, integer>'`
  loads clean and lowers `{}` from the generic-application arm's own return
  (`params.ts:408`), where grammar.md `:107` states
  `theta/parse/result-in-schema-position` for "a `Result` application in a
  lowered-schema position — a schema field type, a `params:` field type".
  Different arm, different rule, not this report's frame.
- **The `system:` interpolation seam's string fall-through.**
  `toSystemParamType` (`frontmatter.ts:600`) types the junk-typed field as a
  string, which is how `${p}` is admitted. It types other unrecognised atoms the
  same way; this report cites it only as the third consumer of the recorded
  text.
- **The `Parameters:` newline family.** Bug
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md).
- **Whether `{}` should ever be a lowering.** Bug
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s inventory
  question.

## Provenance

- Origin: bug
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md)'s fix (0.51.0),
  §Fix *Residuals* (i) (`:495–500`) and residual 1 of the local run artefact
  `.pi/tmp/fixes/0041-report.md`, left unfiled by that fix. That residual names
  four spellings (`p: "a: Tirage"`, one-line `p: |` and `p: >`, and a folded
  multi-line that folds to one line). This report files it, re-derives all four
  at HEAD, and adds what the residual does not state: the input class beyond
  YAML-shaped bytes (prose, punctuation, comment-shaped text, a truncated
  generic, the empty and whitespace-only spellings, the quoted collection
  spellings), the junk-arm-inside-a-union reach, the type/default split at the
  first top-level `=`, the YAML node kinds behind each spelling, the real-AJV
  and binder-prompt observables, the catch-all's other residents as a fix
  constraint, and the committed-corpus census.
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (§`params`
  *Type side* — the RHS is a type expression in the theta type grammar, and the
  0041-added inline-text rule); `docs/spec_topics/type-system.md:15` (one type
  grammar in every annotation position, `params:` named);
  `docs/spec_topics/grammar.md:90`–`:102` (the closed `Type` production set),
  `:102` (`LiteralType`), `:105` (the bare-`Type` position list, `params:` field
  types named), `:107` (§Generic-application constructors — the
  `Result`-in-schema-position rule), `:109` (§Inline object
  types — `ObjectType` in any `Type` position, recursive field `Type`);
  `docs/spec_topics/schema-subset.md:73` (step 2, the `__inline_<slug>` hoist),
  `:74`–`:81` (step 3, the per-type-form emission table), `:79` (the literal
  `const` emission), `:98` (the canonical hash's lowered-fragment input);
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` (§System-prompt
  structure item 4 — one per-field line, the two-space indent, the
  `<wire-name> (<type>) <requirement>` template), `:123` (the token-order MUSTs),
  `:129` (*Type display*);
  `docs/spec_topics/diagnostics/code-registry-load.md:18`
  (`theta/load/params-null`), `:19`
  (`theta/load/params-type-not-expression` — the row bug 0041 added, and its
  scalar-exclusion sentence);
  `docs/spec_topics/diagnostics/code-registry-parse.md:27`
  (`theta/parse/unsupported-feature`), `:48`
  (`theta/parse/default-not-literal`), `:89`
  (`theta/parse/unresolved-named-type`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, the registry is
  closed); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15), `:25` (the diagnostic-registry carve-out and its post-hoc in-scope
  set); `docs/reference/frontmatter.md:75`–`:88` (the reference restatement of
  the type side); `docs/reference/diagnostics.md:180` (the registry mirror row).
- Implementation evidence at `d88742f0`: `src/parser/frontmatter.ts:355–367`
  (`paramValueSource`), `:369–381` (`paramValueCanCarryType` and its comment),
  `:554–600` (`toSystemParamType` and its string fall-through), `:611–642`
  (`splitParamValue`: the `=` split at `:636–639`, the end-trim at `:642`),
  `:676–751` (`extractParsedParams`: the scalar read at `:700–702`, the shape
  refusal at `:713–721`, the retention at `:722–727`, the recorded declared type
  at `:730`, the lowering call at `:741`), `:1137–1150` (the two diagnostic
  pushes and the comment stating their order); `src/parser/params.ts:118`
  (`parseParams`), `:157` (the per-field lowering call), `:165–172` (the
  `unresolved`-driven diagnostic loop), `:184–192` (the
  `theta/load/schema-slug-collision` loop — a load-namespace code raised from
  this function), `:340–347` (the `slugCollisions?` optional-sink contract),
  `:349` (`PRIMITIVE_TYPES`), `:357` (`IDENTIFIER`), `:380–389` (the header
  comment scoping the catch-all and naming the nested brace-rooted traffic),
  `:391–470` (`lowerTypeExpr`: the generic arm at `:394–409`, the union split at
  `:411–427`, the atom arms at `:429–465`, the catch-all at `:467–469`),
  `:533–554` (`hoistInlineObjectType` and its zero-field return), `:642–651`
  (`lowerParamsFieldType`); `src/parser/body-type-lowering.ts:693–714`
  (`parseLiteralArm`, the recogniser bug 0056's fix relocates);
  `src/binder/binder-envelope.ts:89`, `:137–157` (`relaxParamsSchema`),
  `:166–170` (`BypassParamsField.type`'s declared contract);
  `src/binder/binder-system-prompt.ts:151–164` (`renderBinderParamLine`, the
  template at `:157`); `src/extension/production-theta-producer.ts:603–612`
  (`binderPromptParamField`), `:709–712` (the envelope build), `:741` (the
  per-attempt prompt build), `:1173` (the post-default-merge compile),
  `:1968–1976` (the subagent params-intake validator);
  `src/extension/production-composition.ts:1894–1901` (`hasLoadParseError`),
  `:1941`, `:1969` (the drop test and the dropped arm).
- Test evidence at `d88742f0`: `tests/params-block-mapping-rhs-refusal.test.ts`
  — bug 0041's 24-test lock; `:634–656` (group (c1), the multi-line block scalar
  pinned as that fix's recorded residual, disposition only), `:813–845` (group
  (e), the three one-line scalar spellings pinned silent and permissive),
  `:847–876` (group (e)'s `LiteralType` rows, bug 0056's to move);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which declares a `params:` field that lowers
  permissively).
- Reproduction: scratch vitest at `d88742f0` — eighteen spellings of the class
  through the real load path with their lowered documents, recorded fields and
  shipped `Parameters:` blocks; the five YAML value nodes behind them; a real
  `Ajv2020` compile of fixture A's lowered document over seven payloads; the
  unit seam over nine recovered texts from both entry points; the `system:`
  seam at `mode: subagent`; six refused neighbours; six controls; eight
  catch-all residents including the `schema`-body contrast; and a census of
  every committed `.theta` / `.thetalib`. Run on the outputs quoted above, then
  deleted per scratch policy.

## Fix (0.86.0)

- What shipped, keyed to §Fix: the recovered `params:` type text is judged and
  refused when no `Type` production spells it, one error per offending field.
  `src/parser/params.ts` — `LowerCtx.unspellable?: string[]`, an optional sink
  beside `unresolved`/`reservedKeywords`/`slugCollisions` with the same
  never-read-back contract; `lowerTypeExpr`'s trailing catch-all appends the
  text it is discarding (one line, no diagnostic raised there — constraint 2);
  `parseParams`'s per-field loop declines the sink's `LiteralType` atoms
  (0056's exported `parseLiteralArm` — no second recogniser) and every
  brace-carrying FRAGMENT, then raises one
  `theta/load/params-type-not-expression` at the field's range for what
  remains (the `theta/load/schema-slug-collision` emission precedent).
  `src/parser/frontmatter.ts` — `ParamFieldInput.shapeRefused?` set by
  `extractParsedParams`, so a node-shape refusal suppresses the text refusal
  (constraint 1); a same-iteration error-severity diagnostic suppresses it
  (the last-resort guard keeping `p: 'array<'` at its single
  `generic-arity-mismatch`); a refused type half suppresses that field's own
  default-side literal checks (`typeRefused`), the cross-field
  `non-trailing-default` ordering check untouched. Registry row *Trigger*
  widened to the two-stage, FRAGMENT-level judgement (DIAG-2, same commit;
  *Message* bytes unchanged, *Fix hint* second sentence and the
  scalar-exclusion sentence re-derived); owning sentence
  `frontmatter-fields-a.md` §Type side and the `docs/reference/frontmatter.md`
  mirror re-derived the same way. The judged unit is the brace-free fragment
  at any reach — top level, union arm at any depth, generic type argument,
  hoisted inline-object field type at any depth — and the brace exemption is
  the fragment's own, not its enclosure's.
- Operator authorization, recorded verbatim (granted 2026-08-07 at HEAD
  `948b7814`, unblocking the archived pre-Phase-1 stop
  `.pi/tmp/fixes/0059-report-stopped-premeasure.md`): "Authorize the full
  package; re-dispatch 0059" — (1) the 8-cell subject-preserving fixture
  substitution in `tests/binder-param-line-newline-normalisation.test.ts`
  (bug 0060's lock, fixed 0.61.0 — cells a/R1, b/F1, b/R3e, f/R1b) and
  `tests/params-default-string-literal-raw-newline.test.ts` (bug 0102's lock,
  fixed 0.75.0 — group (d) ADMITTED rows R1, R1b, F1, R3e), each lock's own
  subject staying witnessed; (2) the widened brace decline — decline ANY text
  carrying a `{` or `}`, "the brace frame (`lowerParamsFieldType`'s intercept,
  `hoistInlineObjectType`, bugs 0035/0045/0052) owns every text carrying a
  brace; this refusal owns brace-free text", the under-refusal recorded as
  this fix's residual; (3) guard-extension precedence — the type-half refusal
  survives alone, exactly one diagnostic per offending field. The blocker the
  grant resolved: all eight fixture vehicles recover to junk TYPE text —
  §Fix constraint 4's mandatory-refusal class — so refusing them was not
  optional, and constraint 7 named neither lock. Review round 1 established
  that the granted design's decline operates at the FRAGMENT level (the
  validated prototype's own behaviour: the hoist re-enters
  `lowerParamsFieldType` per field and generic arguments recurse through
  `lowerTypeExpr`), so the registry/spec prose was re-derived to state that
  reach — a prose catch-up to the granted design, not a new authorization —
  and the boundary was pinned with cells a21–a24/d12–d13.
- The 12 moved cells, old → new, authority named per cell: 4 in
  `tests/params-block-mapping-rhs-refusal.test.ts` (c1-residual, e/E1, e/E2,
  e/E3: silent-permissive → refused; §Fix constraint 7, this document);
  4 in bug 0060's lock (a/R1 and f/R1b: junk vehicle → `string |`+`null`
  break-carrying TYPE, render transform still exercised; b/F1 and b/R3e: the
  forged `Theta: /evil` / `User arguments: pwned` line moved inside a quoted
  string-literal type that loads, attack bytes proven to still reach the
  rendered prompt, `toContain` hardening added; operator grant); 4 in bug
  0102's lock (group (d) rows R1/R1b/F1/R3e moved from `ADMITTED` into a new
  `TYPE_TEXT_REFUSED` table, original bytes kept, its default-side
  string-span rule untouched and still witnessed by LIT/R1c/R1d/R1e/R2/R2b;
  operator grant).
- Recovery note: the first re-dispatched orchestrator run was killed by a
  host reboot after Phase 1 (witness written and gated red 21/66) with zero
  src edits; the run was completed under the command's §Stability fallback —
  phases driven directly from the main session, each gated there. The stopped
  run's validated artifacts were reused blob-hash-proven
  (`0059-prototype-full.diff`, `0059-cells-head.txt`/`-withfix.txt`, the
  recovered Phase-2 brief).
- Gates: witness `tests/params-scalar-nontype-text-refusal.test.ts` 93/93
  (87 written in Phase 1 + 6 boundary cells from review round 1); full
  default suite 280 files / 4495 tests green; `npx tsc -p tsconfig.json
  --noEmit` clean; `npm run lint` clean; H8a live 29/29 (the additive cell
  below); H9a acceptance 11/11 (one `0xC0000142` child-spawn red on an
  unrelated area, the documented stochastic class, cleared on isolated
  re-run then a full clean 11/11); `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged (blob `a4a8da04…`), decided by the real H9a run — the code
  un-registers thetas and is absent from the acceptance corpus.
- Review: one pre-review correction (two witness self-citations the fix's
  own +9 `frontmatter.ts` shift staled; digest-proven, not a review round);
  round 1 deep — F1 `spec` (Trigger/spec prose understated the fragment-level
  emission set; resolved by prose re-derivation plus additive boundary cells
  a21–a24/d12–d13), F2 `prose` (three witness self-citations pinned to the
  pre-fix `params.ts`; re-derived), residuals R1/R2/R3 (forgery-cell
  `toContain` hardening, substituted-row markers, group-(d) title qualifier —
  all taken); round 2 fast — CLEAN, one recorded nit (the junk-name spelling
  `a: Triage` vs `a: Tirage` differs across the three re-derived prose
  surfaces, each locally consistent, behaviourally identical — tidy on next
  touch). Cap 2 of 5.
- Verification: SOLID, zero findings. Three unit neutralisations, each red
  for the right reason and restored blob-exact (`params.ts` `8e5be897…`,
  `frontmatter.ts` `eef9356a…` re-hashed after every cycle): removing the
  catch-all push reds 25 refusal cells (all observing `[]`); removing the
  brace half of the decline reds exactly the 8 brace-boundary cells
  (d4/d5/d6/d6-body/d9/d11/d12/d13); reverting the default-side suppression
  reds exactly f1 (two diagnostics observed where one is pinned). Live: one
  additive H8a cell (file 28 → 29 cells, +227/−0) — a theta with junk
  `params:` text is refused through the real discovery→registration path
  (`handle.command` undefined, `registeredNames()` excludes it, the
  `theta-system-note` channel carries the registry-sourced fragment) beside
  a registering valid-params sibling and an unrelated control; red direction
  proven live under the catch-all neutralisation (the junk theta registered),
  restored blob-exact, 29/29 green.
- Baseline drift recorded (the doc's §Reproduction was measured at 0.51.0):
  `array<` now draws `generic-arity-mismatch` (0044's walk) and the
  last-resort guard keeps it at that one diagnostic; the value-less `p:`
  lowers `{"const":null}` (0056's null adjudication), not `{"type":"null"}`;
  `p: '{}'` draws `empty-schema-body` (0045); `Result<…>` draws
  `result-in-schema-position`; `p: true` lowers `{"const":true}` (0044), so
  §Fix constraint 3's "boolean rows" refusal claim was already discharged;
  the literal rows carry 0056's emissions; the census is 34 committed
  `.theta`/`.thetalib` files (17 with `params:`, zero in the refused class);
  the doc's slugs `__inline_6a8e2246094f0455` and `__inline_800ba1c3970ee2a8`
  re-derived NOT stale.
- Residuals: (1) an EMPTY default-side literal loads silently —
  `p: 'string = '` records `hasDefault: true`, `defaultSource: ""`,
  `required: []` and renders `default=` with no literal, which
  binder-bypass-and-envelope.md's default-literal rendering cannot satisfy;
  measured on the real load path; the parent files it (boundary vs bug 0163:
  0163 owns type-correct-but-incompatible defaults; this is the empty/absent
  default literal). (2) The authorized under-refusal: a brace-carrying
  fragment that reaches the judgement WHOLE stays silent — `p: '{junk}'`,
  the unterminated `p: '{a: string'`, `string | {a: ???}`,
  `array<{a: ???}>` — pinned by witness cells d11–d13 and stated normatively
  in the row's *Trigger*; the malformed-inline-interior family behind those
  bytes is bugs 0133/0159's territory reached at this position, not a new
  class. (3) The `a: Triage`/`a: Tirage` spelling drift across the three
  prose surfaces (round-2 nit). (4) The witness's
  `frontmatter.ts:1202–1204` citations re-anchor if `frontmatter.ts` moves
  again (bug 0134's class).
- Discharge notes appended: bug 0041 §Fix (0.51.0) *Residuals* (i)
  (discharged — the scalar spellings now refuse); bug 0035 §Fix (0.44.0)
  *Residuals* (iii) (closure clause on its chain); coordinating notes on bug
  0060 and bug 0102 (the operator-granted cell moves, subjects preserved);
  a status note on bug 0162 (its `p: 'enum["x", "y"]'` observable flipped
  from silence to this fix's refusal; its code-divergence subject stands).
- Pinned dispositions / non-goals: `p: '"x" | "y" = "zzz"'` still loads with
  zero diagnostics (bug 0163's subject, pinned AS-IS by witness cell f3);
  `array<"x" | "y">` stays permissive at every position (bug 0164's subject,
  tripwire cells d1–d3); identifier-shaped junk keeps
  `theta/parse/unresolved-named-type` (bugs 0044/0051 own the code-choice
  questions); the guard precedence is normative in the *Trigger* (node-shape
  refusal > same-iteration error > text refusal > that field's default-side
  literal checks); the cross-field `non-trailing-default` check is never
  suppressed.

Discharge note (0.87.0). §Fix's "a position that threads no sink is unchanged,
so the three other type positions keep their bytes and their diagnostics until
they adopt it" has been taken up: bug
[0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) adopted
this fix's `LowerCtx.unspellable` sink at TWO of those three positions — a
`schema` object-body field type and a `schema X = …` alias/union arm — threading
it through `collectUnresolvedNamedTypes`'s optional out-parameter and raising
its own `theta/parse/schema-type-not-expression` at the declaration's range.
§Fix constraint 2's three-position byte-identicality claim therefore now holds
for the `@<T>` annotation ALONE, which still threads no sink
(`lowerQueryResponseSchema` → `buildBodyTypeSchemas` is untouched, deliberately
not the threading site for exactly this reason), together with the `value` and
`return` positions that never reach `lowerTypeSource` at all. **This report's own
claims are untouched.** The `params:` judgement, its two-stage trigger, its
guards, its precedence rules and its lowered bytes are unchanged, and the shared
decline is now literally shared: this fix's inline predicate was extracted into
one exported `isUnspellableTextRefusable` that `parseParams` and both body-position
emitters call, so the brace and `LiteralType` exemptions this report's operator
grant established govern all three positions from one place — 0061's verification
proved it by reddening this report's own group-(d) brace cells
(d4/d5/d6/d6-body/d9/d11/d12/d13) from a single edit to that predicate. Group
(c)'s fence is narrowed, not weakened, under the operator grant "Authorize the
3-cell fence update; re-dispatch 0061" (2026-08-08, HEAD `8e2a199c`): rows c4
(`???` field), c5 (`???` alias) and c7 (`[a, b]` field) moved from silent to
0061's refusal with their lowered-bytes halves byte-unchanged, and the witness
stays at 93 cells with this report's subject fully witnessed by the remaining 90.

Coordination note (appended by the bug 0165 fix, 0.92.0). This fix's
*Residuals* item 1 — the empty default-side literal — is now closed by bug
[0165](./0165-empty-params-default-literal-admitted-and-never-bound.md), fixed
at 0.92.0. 0165 settled on refusing the declaration inside `parseParams`'s
per-field default loop with a new registered code
`theta/parse/default-without-literal`.

**This fix's type-half suppression guard was left intact and keeps
suppressing**, which was 0165's §Fix (d)(2) constraint. The new rule sits
BEHIND the guard — it reads `field.defaultSource === undefined ||
typeRefused.has(field)` and `continue`s before the new rule can run — so the
registry's third precedence rule (`code-registry-load.md:19`, "a field refused
by the text stage draws no default-RHS literal-sublanguage diagnostic … for the
same field") continues to hold for the new code as it does for the two rules
that were already there.

The cells that prove it, all green and all unmodified by 0165:
`tests/params-scalar-nontype-text-refusal.test.ts` f1 (`p: 'pick one = or
two'`), f2 and f3 — the three arms of this guard, each still pinned at exactly
one diagnostic. `p: 'lol wut = '` — a junk type half AND an empty default,
the row where both rules could have fired — still draws exactly one
`theta/load/params-type-not-expression` and never the new code; 0165's own
witness re-pins that row independently in its group D, and states inline that
those cells are what red if a default-side rule is ever placed ahead of this
guard rather than behind it. This file was re-read, not moved: its
`git hash-object` is unchanged from HEAD across the whole 0165 fix.
