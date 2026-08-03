# Bug 0041 — A `params:` right-hand side written as a YAML block mapping is not a theta type expression, yet it loads with no diagnostic: the recovered block-YAML text falls past every lowering arm to the permissive `{}`, the param accepts any JSON value, and the same text is recorded as the field's declared type and rendered — newlines included — into the binder's `Parameters:` block

- **Status:** fixed (0.51.0)
- **Kind:** defect, two elements on one mechanism.
  1. *An input the type grammar does not admit is accepted silently and lowers
     permissively.* frontmatter-fields-a.md (`:58`) pins the `params:` right-hand
     side as "a type expression parsed by the theta type grammar — the same
     grammar used in every other type-annotation position", and type-system.md
     (`:15`) names `params:` in that one grammar's position list. The `Type`
     production (grammar.md `:90`–`:102`, with `params:` named in the position
     list at `:105`) admits `PrimitiveType`, `NamedType`, `GenericType`,
     `ObjectType`, a union, and `LiteralType` — no form of it spells a YAML
     block collection. `p:` followed by an indented `a: Tirage` produces no
     diagnostic at any severity, lowers `properties.p = {}`, and leaves the
     registration gate unfired — `hasLoadParseError`
     (`src/extension/production-composition.ts:1894–1901`) tests error severity
     only. schema-subset.md's step 3 (`:74`–`:81`) enumerates the
     emission per type form and defines no `{}` emission for any of them, so the
     declared shape is absent from the document AJV compiles and the argument
     boundary accepts any JSON value for that field.
  2. *The recorded declared type is block-YAML bytes, and a multi-key block
     breaks the binder `Parameters:` block.* `BypassParamsField.type` carries the
     recovered text verbatim (`src/binder/binder-envelope.ts:166–170`), so a
     two-key block records `"a: Tirage\n    b: integer"` and the shipped
     `buildBinderSystemPrompt` emits two physical lines for one field, the
     second indented with four spaces. binder-bypass-and-envelope.md item 4 (`:117`) requires "one
     per-field line per declared field", each "indented with exactly two U+0020
     SPACE characters" and containing "no other leading whitespace", and *Type
     display* (`:129`) requires the rendered type to be "the field's declared
     Theta type written in the surface syntax of Type System". Both are stated as
     MUSTs; the rendering satisfies neither.

  The **disposition is pre-existing**: before bug 0035's 0.44.0 fix the same
  input was equally silent with `typeSource` recorded as the empty string
  (0035 §Affected, `frontmatter.ts:645` at that baseline: `const rawValue =
  isScalar(item.value) ? String(item.value.value) : "";`). 0035 changed the
  recorded text only — `""` and `"a: Tirage"` both land on the same catch-all
  (fixture K). What 0035 added is element 2's rendering consequence.
- **Related:**
  [0035](./0035-params-rhs-inline-object-under-emission.md) — filed from its
  §Fix (0.44.0) Residuals (iii), which names this input class and its
  disposition: "A block-mapping RHS (`p:` followed by an indented YAML mapping)
  now recovers its block-YAML bytes as the recorded type and still lowers
  permissively silent". 0035 is the recovery mechanism (`paramValueSource`,
  which is total over every non-scalar value node while its comment names only
  the flow mapping) and the fix for the flow-mapping sibling `p: {a: Triage}`,
  which now hoists and emits a `$ref` (fixtures F–G).
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
  §Residuals (iv) — the fail-closed neighbour on the same field: braces inside a
  generic's angle brackets (`p: array<{a: string}>`) are not valid YAML
  (`BLOCK_AS_IMPLICIT_KEY`), so FM-5 (`src/parser/frontmatter.ts:737–750`)
  discards the recovered document and the load fails on
  `theta/load/missing-mode` (fixture I). That spelling is refused; this one
  registers. The two other filed residuals of 0035 —
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  (Residual (i), the sibling positions' interior split) and
  [0040](./0040-inline-slug-def-namespace-not-reserved.md) (Residual (ii), the
  `__inline_` namespace) — are disjoint mechanisms: both concern a type
  expression that *is* admitted by the grammar, this one an RHS that is not.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/frontmatter.ts:671–673` — `extractParsedParams`'s per-item read:
    `isScalar(item.value) ? String(item.value.value) : paramValueSource(item.value, yamlSource)`.
    The non-scalar arm runs for **every** non-scalar value node, block
    collections included; nothing tests the node's shape.
  - `:344–361` — `paramValueSource` and its doc comment. The comment scopes the
    recovery to one shape ("An unquoted inline object type
    (`p: {a: Triage}`) parses as a YAML flow mapping, not a scalar"); the
    function is total over any node carrying a range and slices
    `yamlSource.slice(start, end)` for all of them. A block mapping's range
    covers its indented body including the trailing newline (`"a: Tirage\n"`,
    probed), which `splitParamValue`'s `raw.trim()` (`:622`) strips at the ends
    only — interior newlines survive.
  - `src/parser/params.ts:143–151` — `parseParams`'s per-field loop calls
    `lowerParamsFieldType(field.typeSource, lowerCtx)` (`:151`).
  - `:454–460` — `lowerParamsFieldType`'s brace-root test: text that does not
    start with `{` and end with `}` is handed to `lowerTypeExpr` unchanged. The
    recovered block text is not brace-rooted, so 0035's inline-object arm never
    sees it.
  - `:357–411` — `lowerTypeExpr`'s arms and its trailing catch-all `return {}`
    (`:409–411`). `a: Tirage` has no `<`, splits into one union arm, is not a
    primitive, and fails the `IDENTIFIER` shape (`:329`,
    `/^[A-Za-z_][A-Za-z0-9_]*$/`) on the `:` and the space — so it reaches the
    catch-all, contributing nothing to `lowerCtx.unresolved` and nothing to
    `lowerCtx.defs`. The doc comment above `lowerTypeExpr` records the catch-all
    as the disposition for "an unrecognised form".
  - `src/parser/frontmatter.ts:684–692` — the same `typeSource` becomes
    `BypassParamsField.type` (`:686`), whose declared contract is "The field's
    declared surface type" (`src/binder/binder-envelope.ts:166–170`).
  - `src/extension/production-theta-producer.ts:603–612` and `:741` —
    `binderPromptParamField` copies `field.type` into the system-prompt
    descriptor, and `params.fields.map(binderPromptParamField)` feeds
    `buildBinderSystemPrompt` for every binder attempt.
  - `src/binder/binder-system-prompt.ts:151–164` — `renderBinderParamLine`
    interpolates the type into `` `  ${field.wireName} (${field.type}) ${requirement}` ``
    (`:157`). Nothing rejects or escapes a newline.
  - `src/parser/frontmatter.ts:534–580`, `:1132–1138` — the third consumer of
    `typeSource`: `toSystemParamType` types each field for the `system:`
    `${...}` interpolation checks and falls through to `{ kind: "string" }`
    (`:580`) for any text it does not recognise. A block-mapping param is
    therefore typed as a string at that seam (fixture L).
  - `src/extension/production-composition.ts:1894–1901` (`hasLoadParseError`),
    `:1941` (the drop test), `:1969` (the dropped arm) — registration is blocked
    only by an error-severity `theta/load/*` or `theta/parse/*` diagnostic. A
    block-mapping RHS produces none, so nothing on this path drops the theta.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic, no live model:
  scratch vitest driving `parseThetaDocument` (the real load path via
  `tests/helpers/e2e-s1.ts`), the real `AjvSchemaValidator` over the lowered
  document, the shipped `buildBinderSystemPrompt` and `renderBinderParamLine`,
  `lowerParamsFieldType` / `lowerTypeExpr` at the unit seam, and `yaml`'s value
  nodes at the production `parseDocument(block.yaml, { lineCounter })` call
  shape; written, run, deleted.

## Summary

The theta type grammar is inline text. A `params:` field whose YAML value is a
block mapping —

```yaml
params:
  p:
    a: Tirage
```

— writes no type expression, and every stage downstream treats the author's
bytes as one anyway:

- **The lowering.** The recovered text `a: Tirage` is not brace-rooted, so
  `lowerParamsFieldType` forwards it to `lowerTypeExpr`, where it fails every
  arm and lands on the trailing `return {}`. `properties.p = {}`: AJV validates
  nothing for that field, and no name inside the block is resolved, so
  `theta/parse/unresolved-named-type` cannot fire even though `Tirage` is
  declared nowhere.
- **The recorded declared type.** `BypassParamsField.type` is the block-YAML
  text. With one key the binder system prompt renders
  `  p (a: Tirage) required`; with two keys it renders one field across two
  physical lines.
- **The `system:` seam.** `toSystemParamType` types the field as a string, so
  `${p}` in a `system:` template is accepted and `${p.a}` is
  `theta/parse/system-interp-bad-field`.
- **The diagnostics.** None, at any severity, so the registration gate
  (`hasLoadParseError`) does not fire.

The same silence covers a block sequence (`p:` + `- a`), a flow sequence
(`p: [a, b]`), and the scalar spellings that carry the same bytes
(`p: "a: Tirage"`, `p: |`, `p: >`) — one recorded-text difference, one shared
disposition. The declaration a theta author is most likely to write by mistake
here — YAML-shaped nesting instead of the inline object type — is the one that
loses validation without saying so.

Two neighbours bound the defect. The flow-mapping spelling `p: {a: Triage}` is
a legal inline object type and, since 0035's fix, hoists into `$defs` and emits
a `$ref`; the same text with an undeclared name raises exactly one
`theta/parse/unresolved-named-type` and the theta is refused. The
brace-under-generic spelling `p: array<{a: string}>` breaks the YAML frame and
fails closed on `theta/load/missing-mode`. Between a lowering that works and a
frame that refuses sits this shape, which does neither.

## Reproduction

Offline at HEAD `f959f8de`. Every fixture is `mode: prompt` (fixture L is
`mode: subagent`) plus the `params:` entries shown, over a body declaring
`schema Triage { urgent: boolean }`. `Tirage` is declared nowhere.

```
@@ A  block mapping, one key, name declared NOWHERE
      params  p:
                a: Tirage
   diags   :: []
   lowered :: {"type":"object","properties":{"p":{}},"required":["p"],
               "additionalProperties":false}
   field   :: {"wireName":"p","type":"a: Tirage","hasDefault":false,"nullable":false}
   binder  :: "  p (a: Tirage) required"   bypass={"kind":"binder"}
   AJV     :: {p: 7} accepted   {p: "anything"} accepted   {p: null} accepted
              {p: {a: {urgent: true}}} accepted
@@ B  block mapping, two keys
      params  p:
                a: Tirage
                b: integer
   diags   :: []
   lowered :: properties.p = {}
   field   :: type "a: Tirage\n    b: integer"
   binder  :: the shipped buildBinderSystemPrompt emits, verbatim:
              ["Parameters:", "  p (a: Tirage", "    b: integer) required", ""]
@@ C  block sequence
      params  p:
                - a
                - b
   diags   :: []   properties.p = {}   type "- a\n    - b"
@@ D  flow sequence            params  p: [a, b]
   diags   :: []   properties.p = {}   type "[a, b]"
@@ E  three SCALAR spellings carrying the same bytes
      E1  params  p: "a: Tirage"
      E2  params  p: |
                    a: Tirage
      E3  params  p: >
                    a: Tirage
   all three :: diags []   properties.p = {}   type "a: Tirage"
@@ F  CONTROL — flow mapping, undeclared name (0035's fixed route)
      params  p: {a: Tirage}
   diags   :: ["error theta/parse/unresolved-named-type: unresolved named type 'Tirage'"]
   → refused (frontmatter null)
@@ G  CONTROL — flow mapping, resolvable (0035's fixed route)
      params  p: {a: Triage}
   diags   :: []
   lowered :: properties.p = {"$ref":"#/$defs/__inline_6a8e2246094f0455"}
              $defs :: {"Triage":{...},
                        "__inline_6a8e2246094f0455":
                          {"type":"object","properties":{"a":{"$ref":"#/$defs/Triage"}},
                           "required":["a"],"additionalProperties":false}}
   field   :: type "{a: Triage}"
@@ H  CONTROL — plain named RHS      params  p: Triage
   diags   :: []   properties.p = {"$ref":"#/$defs/Triage"}   type "Triage"
@@ I  CONTROL — the fail-closed neighbour (0028 §Residuals (iv))
      params  p: array<{a: string}>
   diags   :: ["error theta/load/missing-mode: frontmatter is missing required field 'mode:'"]
   frontmatter :: null (FM-5 collapse), with `mode: prompt` literally present
@@ J  SCOPE BOUND — value-less key      params  p:
   diags   :: []   properties.p = {"type":"null"}   type "null"
   (the isScalar arm reads a null scalar; a different disposition, not this class)
@@ K  UNIT SEAM — lowerParamsFieldType and lowerTypeExpr over the recovered texts
   "a: Tirage" → {}   "a: Tirage\n    b: integer" → {}   "" → {}
   "- a\n    - b" → {}   "[a, b]" → {}
   in every case: identical from both entry points, lowerCtx.unresolved [] and
   lowerCtx.defs {}
@@ L  SCOPE BOUND — `system:` interpolation typing (mode: subagent)
   block mapping + system "${p}"    :: diags []
   block mapping + system "${p.a}"  :: ["error theta/parse/system-interp-bad-field:
        'system:' interpolation '.a' does not name a reachable object field on p"]
   flow mapping  + system "${p.a}"  :: byte-identical to the line above
@@ M  SCOPE BOUND — LiteralType traffic through the same catch-all
   p: 42          :: diags []   properties.p = {}   type "42"
   p: '"hello"'   :: diags []   properties.p = {}   type "\"hello\""
   p: true        :: ["error theta/parse/unresolved-named-type:
                      unresolved named type 'true'"]
```

Reading the table:

- **A is the defect.** No diagnostic, a permissive lowered fragment, an AJV
  envelope that accepts a number where an object was declared, and an undeclared
  name that is never resolved.
- **B is element 2.** One declared field, two physical lines in a block whose
  per-field line shape is normative.
- **C, D, and E are the same disposition reached by five other spellings.** E
  matters for the fix: the two block-scalar spellings and the quoted spelling
  are YAML *scalars*, so a node-shape check at the frontmatter read does not see
  them.
- **F, G, and H are the working routes** — the two 0035 fixed and the plain
  named RHS. G's slug is the schema slug of the lowered fragment
  (schema-subset.md `:73`).
- **I is the fail-closed neighbour**, refused before any type text is read.
- **J bounds the class from below**: an absent RHS is a null scalar, not a
  collection, and lowers to `{"type":"null"}`.
- **K localises the mechanism to the catch-all**, and shows the pre-0035
  recorded text (`""`) lowering identically — the recovered bytes changed, the
  disposition did not.
- **L bounds the `system:` seam out of this asymmetry**: it types the legal
  flow-mapping spelling as a string too, so its mis-typing is not evidence of
  this defect.
- **M bounds the fix's blast radius.** The same catch-all currently absorbs
  `LiteralType` (grammar.md `:102`), whose lowering schema-subset.md `:79`
  defines as `{"const": <value>}` and which is unimplemented. Turning the
  catch-all itself into a diagnostic refuses that legal input as well.

## Expected behaviour

Defined for what the RHS must be, undefined for what happens when it is not.

Defined: frontmatter-fields-a.md `:58` (and its reference restatement,
`docs/reference/frontmatter.md:75`) makes the RHS a type expression in the theta
type grammar; grammar.md `:90`–`:102` closes that grammar's productions;
schema-subset.md `:74`–`:81` gives the emission for each admitted form, none of
which is `{}`. A block mapping is outside the grammar, so no emission rule
covers it, and the current `{}` matches none.

Undefined: the corpus registers no diagnostic for a `params:` RHS that is not a
type expression. Both registries were enumerated at HEAD
(`code-registry-parse.md`, `code-registry-load.md`) and no row's trigger covers
it — `theta/parse/unresolved-named-type` (`code-registry-parse.md:89`) triggers
on a `NamedType` that resolves to no declaration, `theta/parse/unsupported-feature`
(`:27`) on "a theta 1.0-deferred or non-Theta **syntactic construct**" of the
theta language, `theta/load/params-null` (`code-registry-load.md:18`) on
`params: null` exactly, and `theta/load/frontmatter-value-out-of-range` (`:19`)
on "a frontmatter scalar covered by the non-negative-integer rule (currently
`tool_loop.max_rounds` and `respond_repair.attempts`)". The registry is closed
(DIAG-2, `diagnostic-shape.md:72`), so the absence is a spec gap, not an
implementation oversight.

What is not open: silence with a permissive lowering satisfies neither reading.
Either the input is refused with a registered code, or it is admitted with a
defined emission — and no emission rule exists to admit it under.
Independently, the `Parameters:` block rendering (element 2) is a defect against
text that already exists: binder-bypass-and-envelope.md `:117` and `:129` are
MUSTs, and no `params:` RHS may produce a rendering that breaks them.

## Actual behaviour / root cause

The type side is text by the time anything checks it, and nothing checks it as
text.

1. **The frontmatter read recovers bytes for any non-scalar node.**
   `extractParsedParams` (`frontmatter.ts:671–673`) branches on `isScalar` and
   sends everything else to `paramValueSource`, which slices the node's range
   out of the frontmatter source (`:354–361`). The branch was widened for the
   flow mapping (0035 frame 1) and is total over block mappings, block
   sequences, and flow sequences alike. This is the one point in the pipeline
   where the YAML node — and therefore the author's *shape* — is still in hand;
   downstream stages see only a string.
2. **The lowering's catch-all absorbs whatever text arrives.**
   `lowerParamsFieldType` (`params.ts:454–460`) intercepts only brace-rooted
   text; `a: Tirage` is forwarded to `lowerTypeExpr`, which has an arm per
   admitted form and a trailing `return {}` (`:409–411`) for everything else.
   The catch-all is deliberate for forms whose lowering lives elsewhere
   (`LiteralType`, fixture M) — which is why it is silent rather than an error,
   and why the block-YAML text inherits that silence.
3. **`lowerCtx` stays empty, so the sibling diagnostic cannot fire.** The
   diagnostic 0028 and 0035 wired is emitted off `lowerCtx.unresolved`
   (`params.ts:159–167`), which the catch-all never appends to. `Tirage` inside
   the block is never a resolution candidate — the name is not read as a name.
4. **Registration has no other gate.** With no error-severity diagnostic,
   `hasLoadParseError` (`production-composition.ts:1894–1901`) is false, the
   drop arm (`:1941`, `:1969`) is not taken, and the theta reaches registration
   with a param that accepts anything.
5. **The recorded text is used as a type in two more places.** It becomes
   `BypassParamsField.type` (`frontmatter.ts:686`), which reaches the binder
   system prompt verbatim (`production-theta-producer.ts:603–612`, `:741` →
   `binder-system-prompt.ts:157`), and it is typed for `system:` interpolation
   by `toSystemParamType`, whose fall-through is `{ kind: "string" }`
   (`frontmatter.ts:580`).

## Why it matters

- The `params:` position is where untrusted input arrives — slash-argument
  binding, `invoke(...)`, tool-call arguments — and `properties.p = {}` means
  the AJV envelope check accepts any JSON value for that field. Fixture A
  accepts `7`, `"anything"`, and `null` for a param the author wrote as a
  nested shape.
- It is silent for input the author believes is a declaration. Nothing at any
  severity says the shape was discarded; the observable is a param that accepts
  junk and a binder prompt line whose parenthesised "type" is YAML.
- The binder is misinformed at the one seam that decides what goes into the
  field: *Type display* (`binder-bypass-and-envelope.md:129`) exists so the
  model sees the declared Theta type, and a multi-key block additionally breaks
  item 4's per-field line shape (`:117`), so the `Parameters:` block the binder
  reads is malformed as well as wrong.
- The spellings that reach this state — block mapping, block sequence, flow
  sequence, and the three scalar spellings of the same bytes — are the ones a
  YAML-fluent author reaches for before learning that the type side is not YAML.
  The neighbouring inline-object spelling works since 0035, which makes the
  silence harder to notice: one nesting syntax validates, the other does not,
  and only one of them says so.

## Non-goals

- The `system:` interpolation seam's string fall-through
  (`toSystemParamType`, `frontmatter.ts:580`) mis-types the legal
  flow-mapping spelling identically (fixture L). That is a separate, unfiled
  gap at that seam; this report covers it only as evidence that the recovered
  text reaches a third consumer unchecked.
- `LiteralType` on the `params:` RHS (fixture M: `p: 42` lowering to `{}`
  rather than schema-subset.md `:79`'s `{"const": 42}`, and `p: true` reported
  as an unresolved named type) is pre-existing and unfiled. It appears here
  only as a constraint on §Fix: the catch-all carries legal-by-grammar traffic.
- `theta/parse/empty-schema-body` at the `params:` position (`p: {}`, and
  0035's zero-field body arm) stays open and unchanged.
- The value-less key `p:` (fixture J) lowers to `{"type":"null"}` through the
  scalar arm. Whether that is the intended reading of an absent RHS is a
  separate question; this report does not cover it.
- 0035 §Fix (0.44.0) Residuals (i) and (ii) are filed as
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  and [0040](./0040-inline-slug-def-namespace-not-reserved.md) and are not in
  scope here.

## Fix (0.51.0)

The §Fix below settles the code and leaves the enforcement point open between
two candidate points. The point taken is **the frontmatter read**, and the
check is the shape test the §Fix specifies for it. Line anchors are at the fix
commit.

**Why that point.** The lowering point is unavailable at this baseline on the
§Fix's own terms: its catch-all is still the disposition for `LiteralType`
(fixture M), whose lowering is unimplemented and is bug
[0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md)'s
subject — that bug is open and was not scheduled ahead of this one, so the
§Fix's escape clause ("unless literal lowering lands first") does not apply.
The alternative escape — narrowing the trigger to text no `Type` production
can spell — needs a text-level grammar recogniser, and `lowerTypeExpr` is the
shared arm of all four type positions since bug 0039, so a diagnostic there
would move three positions this report does not cover. The frontmatter read
closes fixtures A–D with a predicate that reads no text at all.

**The check.** `extractParsedParams` (`src/parser/frontmatter.ts:713`) tests
the field's YAML value node through `paramValueCanCarryType` (`:379–381`),
stated positively exactly as the §Fix requires: a scalar, or a mapping whose
`flow` is `true` (the inline object type), is admitted; every other node kind
and a field carrying no value node at all is refused. No text is parsed, no
`lowerCtx` is consulted, and the refusal is available before any name is
resolved. `paramValueSource`'s doc comment (`:344–358`) now names the refused
shapes, per the §Fix's last obligation.

**The field is retained.** A refused field still enters `fieldInputs` and
`bypassFields`, so `toSystemParamType` and `parseParams` see the baseline
field set and the input draws exactly one diagnostic; fixture L's
`system: "${p}"` spelling stays at one. Registration is withheld by the
pre-existing error-severity gate (`:1153` → `hasLoadParseError`,
`production-composition.ts:1894–1901`); no second gate was added.

**Registry.** `theta/load/params-type-not-expression` (E, load) is registered
in `code-registry-load.md` immediately after `theta/load/params-null` and
mirrored in `docs/reference/diagnostics.md` — a DIAG-2 same-commit landing
covered within a 1.x minor by the GOV-15 diagnostic-registry carve-out. The
*Message* uses only the established category-5 `<param>` placeholder (the same
one `theta/parse/invoke-arg-type-mismatch` renders for a `params:` field
name), so the closed placeholder surface is untouched. The *Trigger* is the
GOV-15 post-hoc in-scope set and names every refused spelling, including the
two the report's table does not reach (an alias node, and a field with no
value node — `? p`, `params: {p}`); it also states the admission that reads
alike, the value-less key `p:` / `params: {p: }`, which parses as a null
*scalar* and keeps fixture J's `{"type":"null"}`. The owning spec sentence is
`frontmatter-fields-a.md` §`params` *Type side*, mirrored in
`docs/reference/frontmatter.md`. The code un-registers the theta and is
unreachable from every committed H9a fixture, so
`tests/fixtures/h7a/permitted-codes.json` was correctly left alone — verified
by the H9a run.

**The `Parameters:` newline obligation is discharged for this input class, not
corpus-wide.** Element 2's stated input — the two-key block mapping
(fixture B), which rendered `["Parameters:", "  p (a: Tirage", "    b: integer) required", ""]` —
is closed by refusal, as are C and D. A first implementation also refused any
recovered type text carrying a line break; review round 1 removed it, because
it refused a **multi-line flow mapping** (`p: {a: Triage,` newline
`b: integer}`) — a grammar-admitted `ObjectType` that loads clean and hoists a
correct `$ref` — with a message asserting it is not a type expression, the
exact failure mode this §Fix rejects the lowering point for; and because it
did not close the reach anyway (a line break still arrives through the default
RHS). The escapes are recorded in *Residuals* below. The §Fix's own route-1
text licenses the scalar half ("This closes fixtures A–D and does **not** close
fixture E").

**Reproduction re-derived at the fix baseline** (`8ea0c958`, 0.50.0, after
0038/0039/0040): all sixteen fixtures byte-identical to the recorded 0.45.0
table — **zero drift**, including fixture G's slug `__inline_6a8e2246094f0455`
re-derived by an independent `node:crypto` oracle and fixture J's node-level
claim (a value-less `p:` is a Scalar carrying `null`, not an absent node).
Only source anchors drifted: `extractParsedParams` `:666–696` → `:670`,
`lowerTypeExpr`'s catch-all `:409–411` → `params.ts:469`,
`lowerParamsFieldType` `:454–460` → `params.ts:642`.

**Post-fix acceptance set.** A, B, C, D: exactly one error-severity
`theta/load/params-type-not-expression` at the offending field, and the theta
is refused. E1–E3 and M unchanged (the settled route admits every scalar).
F, G, H, J byte-identical; I keeps its single `theta/load/missing-mode`.

**Newly-refused inputs** (GOV-15 post-hoc in-scope set; the only code is
`theta/load/params-type-not-expression` at error severity): a `params:` field
whose YAML value node is a block mapping, a block sequence, a flow sequence,
an alias, or any other node kind; and a field written with no value node at
all (`? p`, `params: {p}`) — the last two lowered permissively-silent at HEAD
through `paramValueSource`'s empty-string arm and are the only members outside
the report's own table. **Lowered bytes that move for thetas that still load:
none** — the change adds a diagnostic branch and touches no lowering.

**Offline lock.** `tests/params-block-mapping-rhs-refusal.test.ts` (24 tests):
(a) the DIAG-4 registry anchor, every expected message in the file derived
from it; (b) fixtures A–D refused with exactly one diagnostic and a nulled
frontmatter; (b2) the two absent-value-node spellings refused, with
`params: {p: }` fenced as admitted; (c) the multi-line block scalar pinned as
the recorded residual, the multi-line flow mapping fenced as still admitted
and correctly hoisted against an independent `node:crypto` oracle, and the
registering controls' `Parameters:` block pinned to one physical line per
field; (d) F, G, H, J, I byte-identical; (e) the scalar spellings and the
`LiteralType` traffic pinned unchanged, bug 0056 named as the authority
licensed to move them; (f) fixture L at exactly one diagnostic (the retention
witness); (g) the H9a permitted-codes fence. Neutralisation evidence, each a
targeted byte edit restored byte-exactly (`git hash-object` equal before and
after; `git stash` never used): killing the emission gives 7 red, all with the
report's `diags :: []` signature; removing the registry row gives 8 red at the
DIAG-4 anchor and every message-derived assertion; inverting the predicate to
refuse everything gives 14 red across every fence. Full gate 241 files /
3181 tests; typecheck and lint clean; the 0035, 0039 and 0040 locks unedited.

**Live.** H8a `tests/live/live-production-acceptance.test.ts` 7/7 and H9a
`tests/live/acceptance/` 11/11 green against the real provider, the H9a
empty-capture stderr gate holding with the new code absent from the permitted
list. No committed live fixture carries a block-mapping `params:` RHS, so the
end-to-end obligation was discharged by a scratch live probe over the real
load path in a planted workspace: a block-mapping offender plus a
flow-mapping control and a driven single-string control, asserting on
registration and on the settled `SessionManager`'s `theta-system-note`
channel — GREEN with the fix (only the controls register, exactly one note
naming the code), RED with the emission neutralised (the offender registers),
GREEN again on restore. Probe deleted.

**Residuals.** (i) The one-line scalar spellings (fixture E: `p: "a: Tirage"`,
one-line `p: |` / `p: >`, and a folded multi-line that folds to one line) stay
silent-permissive with `properties.p = {}` — the settled route reads no text,
and the §Fix names this as route 1's boundary. Unfiled; adjacent to 0056's
surface but not its subject (0056 owns literal-shaped text, these carry
non-type text). (ii) The `Parameters:` per-field line-shape MUSTs
(binder-bypass-and-envelope.md `:117`/`:129`) remain violable for a theta that
**registers**, through three reaches, all byte-identical to 0.50.0 and none in
this report's input class: a multi-line block-scalar type text
(`"a: Tirage\nb: integer"` → `["Parameters:", "  p (a: Tirage", "b: integer) required"]`);
a multi-line **flow-mapping** type text, which is grammar-admitted and lowers
correctly to `$ref #/$defs/__inline_d84e83b5ca07d0e6` yet records the raw
slice (`["Parameters:", "  p ({a: Triage,", "      b: integer}) required"]`);
and the **default** RHS, where the break rides `defaultSource` rather than the
type (`p: |` + `array<integer> = [1,` + `2]` → `["Parameters:", "  p (array<integer>) default=[1,", "2]"]`,
and the same through a double-quoted `\n` escape). One sibling defect covers
the family: a recorded declared type or default source carrying a line break
reaches `renderBinderParamLine` unescaped. Unfiled — filed as bug
[0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md),
and discharged by the 0060 fix (0.61.0): the declared type and the default
literal are normalised at the render seam, inside `renderBinderParamLine`, so
all three reaches render one physical line per declared field, and
`binder-bypass-and-envelope.md` states the transform under *Type display* and
*Default-literal rendering*. That closes this residual's family and the
remaining three reaches of the §Fix obligation below (`:565–568`) without
refusing any grammar-admitted spelling: the recorded bytes group (c1) pins are
untouched, because the transform runs on the prompt copy alone. (iii) The
implementation
comments say "any unenumerated node kind" and do not spell out the
value-node-absent case that the registry *Trigger* names; prose-only, unfiled.

## Fix

One half is settled by the registry; the enforcement point is not settled by
the evidence, because the two candidate points close different input sets.

**Settled — the code.** No registered row's trigger covers a `params:` RHS that
is not a type expression (the four nearest rows and why each excludes this input
are enumerated in §Expected behaviour), so honest coverage requires a registry
addition: a DIAG-2 operation (`diagnostic-shape.md:72`), landed in the same
commit as the site it is raised from. Severity must be `E`, because
registration is gated on error severity alone
(`production-composition.ts:1894–1901`) and a warning would leave the
accept-anything param registered. The GOV-15 diagnostic-registry carve-out
(`governance/source-language-stability.md:25`) covers the newly-refused inputs
within a 1.x minor, with the in-scope set defined post-hoc over the inter-release
diff — so the added row's trigger must state exactly which spellings it refuses,
since that trigger *is* the post-hoc input set. The namespace choice has
precedent on both sides: frontmatter-shape failures are `theta/load/*`
(`params-null`), while the existing `params:` type-side and default-side checks
are `theta/parse/*` (`unresolved-named-type`, `default-not-literal`) and are
raised from `parseParams`.

**Not settled — where the check runs.** The two points differ in what they can
see and what they would refuse:

- *At the frontmatter read* (`extractParsedParams`, `frontmatter.ts:666–696`).
  This is the only point that still holds the YAML node, so the check is a shape
  test with no parsing: admit a scalar or a **flow mapping** (the inline object
  type), refuse anything else. The `yaml` dependency (pinned `^2.9.0`) marks
  flow collections with `Collection.flow`, which is `true` on a flow mapping or
  flow sequence and `undefined` on either block form under the production
  `parseDocument(block.yaml, { lineCounter })` call shape — verified at HEAD, no
  `keepSourceTokens` needed. Stating the predicate positively (scalar or flow
  mapping) rather than as a rejection list also covers node kinds not enumerated
  here. This closes fixtures A–D and does **not** close fixture E: the quoted
  and block-scalar spellings carry byte-identical text through the `isScalar`
  arm.
- *At the lowering* (`lowerTypeExpr`'s catch-all, `params.ts:409–411`). This
  point sees the text and closes A–E in one predicate, but the catch-all is
  currently the disposition for admitted forms whose lowering is not
  implemented — `LiteralType` (fixture M) — so converting it to a diagnostic
  refuses input grammar.md `:102` and schema-subset.md `:79` admit, unless
  literal lowering lands first or the diagnostic's trigger is narrowed to text
  that no `Type` production can spell. At this point the author's block YAML and
  a quoted string carrying the same bytes are indistinguishable — which is why
  it closes E, and why its diagnostic cannot name the YAML shape as the cause.

Obligations either way:

- The `Parameters:` block must never render a type containing a newline. Element
  2 is a defect against `binder-bypass-and-envelope.md:117`/`:129` independent
  of which point refuses the declaration; a refusal at either point discharges
  it for this input class, and any future non-scalar recovery must preserve it.
- Fixtures F, G, H, and J stay byte-identical: 0035's two fixed routes, the
  plain named RHS, and the null-scalar reading of a value-less key.
- Fixture I keeps its single `theta/load/missing-mode`. The YAML frame fails
  before the params read, so no check added here can improve that diagnostic —
  that is 0028 §Residuals (iv)'s subject, not this one's.
- The check must not consult `lowerCtx` state: nothing about this input class
  depends on resolution, so the refusal is available before any name is
  resolved and must not depend on `bodyTypeMap` contents.
- `paramValueSource`'s doc comment (`frontmatter.ts:345–353`) names only the
  flow mapping while the function is total over non-scalar nodes. It is where
  the shape contract is stated in code, so it must name the refused shapes
  whichever point takes the check.

## Provenance

- Origin: the review of bug 0035's 0.44.0 fix, round 1 (the reviewer's edge
  sweep over the recovery arm's non-flow inputs) — landed as
  [0035](./0035-params-rhs-inline-object-under-emission.md) §Fix (0.44.0)
  Residuals (iii). The uncommitted local run artefact
  `.pi/tmp/fixes/0035-report.md` records the same residual in its
  *Residuals* line: "(iii) block-mapping RHS recovers block-YAML bytes, still
  permissive-silent". Filed at 0.45.0 with the disposition attributed
  pre-0035 (fixture K) and the input class widened beyond the block mapping to
  the block sequence, the flow sequence, and the equivalent scalar spellings
  (fixtures C–E).
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (§`params`
  *Type side* — the RHS is a type expression in the theta type grammar, and the
  `NamedType` resolution rule); `docs/spec_topics/type-system.md:15` (one type
  grammar in every annotation position, `params:` named);
  `docs/spec_topics/grammar.md:90`–`:102` (§Type grammar — the closed `Type`
  production set), `:102` (`LiteralType`), `:105` (the position list, `params:`
  field types named), `:109` (§Inline object types —
  `ObjectType` in any `Type` position, the empty-body diagnostic, the hoist
  cross-reference); `docs/spec_topics/schema-subset.md:73` (Lowering step 2, the
  `__inline_<slug>` hoist), `:74`–`:81` (step 3, the per-type-form emission
  table; `:76` the named-or-inline `$ref`, `:79` the literal `{"const": …}`);
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` (§System-prompt
  structure item 4 — one per-field line per field, the two-space indent MUST,
  the `<wire-name> (<type>) <requirement>` template), `:123` (the token-order
  and no-extra-whitespace MUSTs), `:129` (*Type display* — the declared Theta
  type in surface syntax); `docs/spec_topics/diagnostics/code-registry-parse.md:27`
  (`theta/parse/unsupported-feature`), `:89`
  (`theta/parse/unresolved-named-type`);
  `docs/spec_topics/diagnostics/code-registry-load.md:18`
  (`theta/load/params-null`), `:19`
  (`theta/load/frontmatter-value-out-of-range`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, the registry is
  closed); `docs/spec_topics/governance/source-language-stability.md:25` (the
  GOV-15 diagnostic-registry carve-out and its post-hoc in-scope set);
  `docs/reference/frontmatter.md:75` (the reference restatement of the type
  side); `docs/reference/diagnostics.md` (the shipped registry mirror — no
  params-shape row).
- Implementation evidence at HEAD `f959f8de`:
  `src/parser/frontmatter.ts:344–361` (`paramValueSource` and its
  flow-mapping-only comment), `:534–580` (`toSystemParamType` and its
  string fall-through), `:591–623` (`splitParamValue`, the end-trim at `:622`),
  `:666–696` (`extractParsedParams`; the recovery arm at `:671–673`, the
  recorded declared type at `:686`), `:737–750` (FM-5, the neighbour's
  collapse), `:1132–1138` (the `system:` param typing call),
  `:1153` (registration withheld on any error-severity diagnostic);
  `src/parser/params.ts:143–151` (the per-field lowering call), `:159–167`
  (the `unresolved`-driven diagnostic loop), `:329` (the `IDENTIFIER` shape),
  `:357–411` (`lowerTypeExpr`'s arms and the catch-all at `:409–411`),
  `:454–460` (`lowerParamsFieldType`'s brace-root test);
  `src/binder/binder-envelope.ts:166–170` (`BypassParamsField.type`'s declared
  contract); `src/binder/binder-system-prompt.ts:151–164`
  (`renderBinderParamLine`); `src/extension/production-theta-producer.ts:603–612`,
  `:741` (`binderPromptParamField` and the per-attempt prompt build);
  `src/extension/production-composition.ts:1894–1901`, `:1941`, `:1969` (the
  error-severity registration gate).
- Reproduction: scratch vitest at HEAD — the thirteen fixtures quoted above
  (the block mapping in one- and two-key form, the block sequence, the flow
  sequence, the three scalar spellings of the same bytes, the three working
  controls, the fail-closed YAML-frame neighbour, the value-less key, the unit
  seam over five recovered texts including the pre-0035 empty string, the
  `system:` typing probe, and the `LiteralType` traffic), plus direct inspection
  of `yaml`'s value nodes (`flow`, `range`) at the production `parseDocument`
  call shape; run on those signatures, then deleted per scratch policy.
