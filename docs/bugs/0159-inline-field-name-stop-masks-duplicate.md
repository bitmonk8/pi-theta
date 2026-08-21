# Bug 0159 — `theta/parse/duplicate-inline-field-name` compares only the field-name positions ahead of an inline interior's first stop, and a stop carried by a field's own type ends the comparison of every body enclosing it, so `{a: integer, : x, a: boolean}` and `{p: {c: 1, : y, c: 2}, p: 3}` load with zero diagnostics at all eight `Type` positions and still mint the last-wins property and the duplicate `required` bug 0052 refuses — at the `@<T>` annotation root that fragment IS the compiled document, so a real `AjvSchemaValidator.compile` still throws `schema is invalid: data/required must NOT have duplicate items` after the model turn has been spent

- **Status:** fixed (0.93.0). Residual 1 of the bug 0052 fix (0.84.0, commit
  `f856fd33`), recorded there as `## Fix (0.84.0)` *Residuals* item 1
  (`0052-…md:294–320`) with its cause stated: a resync in `parseObject`'s
  tolerant recovery moves three other registered rows on unmeasured inputs, and
  brace-level resync alone does not deliver 0052 §Expected's "no fragment
  carrying a repeated `required` entry is ever minted" (`:540–541`), because the
  same-body shapes need per-field resync. §Fix is constraint-pinned, not
  settled: two routes with their measured consequences, disposition left to the
  run. Ordering: nothing blocks this report from starting.
  [0160](./0160-inline-object-wire-name-rename-unparsed.md) and
  [0161](./0161-quoted-inline-field-name-not-a-field.md) are filed in the same
  batch against the same rule and the same registry row; §Fix
  route (a) closes all three at once, so whichever lands first states the
  adjudication and the other two cite it rather than re-deriving it. Route (b)
  enters the recovery space
  [0133](./0133-field-list-discard-recovery-unsettled.md) owns and settles
  nothing there.
- **Sev/Diff estimate:** S1/D3 — S1 because every shape in §Reproduction is
  accepted with no diagnostic at all eight `Type` positions and still mints the
  last-wins property drop and the duplicate `required` entry the rule was added
  to refuse, keeping the `@<T>`-root internal error after a spent model turn
  constructible (§Reproduction (c)); D3 because §Fix needs an in-run
  adjudication — a DIAG-2 *Trigger* rewrite landing in the same commit as the
  code, or a recovery change whose space another open report owns — over the
  walk every `Type` position shares, and it re-pins cells of a 49-cell witness
  three reports read.
- **Kind:** defect, plus the spec half that lands with it. Three elements, each
  measured at HEAD.
  1. *The comparison reaches only the positions ahead of the interior's first
     stop.* `TypeParser.parseObject` (`src/parser/type-grammar.ts:504`) pushes a
     name onto `fieldNames` (`:545`) once the interior has spelled `Ident ":"`
     at a field-name position, and its field loop ends at three shapes: a
     field-name position whose token is not an `ident` contributes nothing and
     the loop advances (`:528–534`); an identifier not followed by `:` breaks
     the loop (`:535–538`); a completed field not followed by `,` breaks it
     (`:562–564`). `walkType`'s `object` arm compares the retained list and
     nothing else (`:725–745`). A repeated name written behind any of those
     stops is never compared: `{a: integer, : x, a: boolean}` and
     `{a: 1 a: 2, a: 3}` draw `[]` while `{a: integer, a: boolean}` draws the
     line.
  2. *A stop carried by a field's own type ends the comparison of every
     enclosing body.* `namesStopped` latches when the field type
     `carriesUnclosedInterior` (`:553`, the predicate at `:378–389`, transitive
     over object fields, generic arguments and union arms), so the enclosing body
     compares only the names ahead of that field. `{p: {c: 1, : y, c: 2}, p: 3}`
     compares `["p"]` at the root and `["c"]` inside `p`, so the root's own
     repeated `p` is behind the same stop the nested `c` repeat is behind, and
     both bodies draw nothing. The cascade is unbounded in depth
     (`{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}`, §Reproduction row 5).
  3. *The boundary is normative, so closing it is a spec decision and not only
     code.* The row's *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:87`) states the three
     stops and the cascade, and states that names behind a stop are not
     compared. Implementation and registry therefore agree at HEAD; what fails
     is 0052 §Expected (`:540–543`), whose two required consequences — no
     duplicate-carrying fragment minted, no property silently dropped — hold for
     none of the six shapes below. 0045 §Non-goals reserves the family
     (`0045-…md:766–772`): "Widening the inline rule to these shapes needs its
     own spec decision." Any fix that reaches these inputs rewrites that
     *Trigger* in the same commit as the code (DIAG-2,
     `docs/spec_topics/diagnostics/diagnostic-shape.md:72`).
- **Related:**
  - **0052** —
    [`0052-inline-object-duplicate-field-names-silent-last-wins.md`](./0052-inline-object-duplicate-field-names-silent-last-wins.md),
    **fixed (0.84.0)**, the filing origin and the owner of the consequence this
    report measures as still reachable. Its `## Fix (0.84.0)` record carries
    this as *Residuals* item 1, names the closing route (`:317–320`), and states
    the two grounds for not taking it in that scope. Its §Fix constraint 4
    (`:668–675`) is the sentence route (a) below answers; its §Fix constraint 1
    (`:649–655`) freezes both lowerers' bytes and binds every route here.
  - **0045** —
    [`0045-inline-empty-object-type-missing-empty-schema-body.md`](./0045-inline-empty-object-type-missing-empty-schema-body.md),
    **fixed (0.57.0)**, whose sibling rule shares the `"inline-object-shape"`
    rule set and the closing-brace key with the rule this report bounds. Its
    §Non-goals (`:766–772`) is the reservation quoted above, and its own lock
    (`tests/inline-empty-object-type.test.ts`) is one of the witnesses a route
    (a) fix must leave unmoved.
  - **0133** —
    [`0133-field-list-discard-recovery-unsettled.md`](./0133-field-list-discard-recovery-unsettled.md),
    **open**, the recovery-space adjudication. It owns the DECLARATION body's
    discard recovery (`parseSchemaObjectBody` / `skipBraceRemainder`,
    `src/parser/theta-document.ts:2589` and `:2708` at this HEAD), a different
    function from the `TypeParser.parseObject` loop this report cites, and its
    header records that no open report edits either. Route (b) below changes
    type-position recovery, which is the same question one production layer
    over; the two dispositions are stated together or one cites the other.
  - **0160** —
    [`0160-inline-object-wire-name-rename-unparsed.md`](./0160-inline-object-wire-name-rename-unparsed.md),
    filed in the same batch: `parseObject` breaks its field loop at the `as`
    token, so no `Type` position parses the rename and neither wire-name code
    `grammar.md:109` assigns can fire there. `schemas.md:23` puts
    `as "WireName"` between the field identifier and its type, so that break is
    this report's missing-`:` stop (`type-grammar.ts:535–538`) read for a
    different code. The duplicate shape inside 0160's subject is
    `{a as "w": integer, a as "w": string}` (witness cell d4 row 1), which §Fix
    route (a) closes.
  - **0161** —
    [`0161-quoted-inline-field-name-not-a-field.md`](./0161-quoted-inline-field-name-not-a-field.md),
    filed in the same batch: a quoted field name is not a `Field`
    (`schemas.md:17`, "Field names are identifiers"), and the inline spelling
    admits it where the declaration spelling refuses it. Its duplicate shape is
    `{"a": string, "a": integer}` (cell d5), also closed by route (a). Route (b)
    closes neither report's shapes. All three turn on one question — which key
    the comparison runs over — so the three adjudications agree, or the row's
    *Trigger* states three different keys.
  - **0154** —
    [`0154-inline-object-type-field-name-rules-unenforced.md`](./0154-inline-object-type-field-name-rules-unenforced.md),
    **open**, which rebases onto the `fieldNames` retention the 0052 fix built
    (names only, range-free, not index-aligned with `fieldTypes`, stopping at an
    unclosed interior, gated on the spelled closing brace). Route (a) replaces
    that retention as this rule's key; the coordination is named in §Fix.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift. It covers
    the drift a fix here induces, and it is why §Affected cites symbols beside
    lines: the 0052 fix moved `src/parser/type-grammar.ts` from 567 to 835
    lines.
- **Affected** (every citation verified against the tree at HEAD `f856fd33`,
  0.84.0; symbols named beside lines because `src/parser/type-grammar.ts` grew
  567 → 835 in the commit this report is a residual of):
  - **The retention and its three stops.** `TypeParser.parseObject`
    (`src/parser/type-grammar.ts:504`): `fieldNames` declared `:517`, the
    `namesStopped` latch `:523`, the non-`ident` field-name position skipped
    without contributing a name `:528–534`, the missing-`:` break `:535–538`,
    the push `:544–546`, the latch write `:553`, the `as` rename skip
    `:555–561`, the missing-`,` break `:562–564`, `braceClosed` `:566` and
    `closingBraceSpelled` `:573`. The two predicates:
    `interiorSpellsClosingBrace` (`:342`) and `carriesUnclosedInterior`
    (`:378–389`, recursing object field types, generic arguments and union
    arms). The `object` node's own doc comment states the design in the same
    terms (`:162–253`).
  - **The comparison.** `walkType` (`:635`), `object` arm `:695`; the gate
    `if (!insideGenericArgument && node.closingBraceSpelled)` (`:725`), the two
    `Set`s `:726–727`, the loop over `node.fieldNames` `:728–744`, the emission
    `:737–743` carrying `code: "theta/parse/duplicate-inline-field-name"`
    (`:739`).
  - **The eight positions, all already wired**, which is why the silence below
    is one rule's key and not a missing call site:
    `src/parser/theta-document.ts:5884` (alias / union arm), `:6150` (`let`
    annotation), `:6225` (`fn` parameter), `:6231` (`fn` return), `:6310`
    (schema body field type), `:6517` (`invoke<T>`, narrow rule set), `:6612`
    (`@<T>` annotation root), and `src/parser/params.ts:178` (`params:`
    per-field). The `.thetalib` spelling reaches the same schema-field site.
  - **The two lowerers that mint the fragment anyway.** Neither asks whether a
    name repeats. `hoistInlineObjectType` (`src/parser/params.ts:670`) splits
    with `splitTopLevel(source.slice(1, -1), ",", "angle-and-brace")` (`:677`),
    takes each entry's `topLevelColon` (`:678`), then writes
    `properties[fieldName] = lowerFieldType(…)` (`:687`) and
    `required.push(fieldName)` (`:688`). `lowerInlineObject`
    (`src/parser/body-type-lowering.ts:153`) splits the same way (`:161`),
    reads the same colon (`:163`), and reaches the same two writes through
    `lowerObjectFields` (`:109`, `:120`, `:128`).
  - **The tokenisation §Fix route (a) re-keys onto.** `splitTopLevel`
    (`src/parser/params.ts:950`, nesting mode `TypeSplitNesting` at `:923`) and
    `topLevelColon` (`:827`), the two functions both lowerers already use.
  - **The annotation root, where the fragment is the compiled document.**
    `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:113`); the
    single-enclosing-brace-group arm returns `lowerInlineObject`'s fragment
    directly (`:151–156`).
  - **The compile that throws.** `AjvSchemaValidator`
    (`src/seams/schema-validator.ts:104`), Ajv constructed with `strict: false`
    at `:112` — which does not disable meta-schema validation — and
    `#build`'s `this.#ajv.compile(schema)` at `:149`. The meta-schema constrains
    `required` to unique items and is applied to the ROOT document only, which
    is why a duplicate inside a `$defs` member compiles and a duplicate at the
    root does not.
  - **When the throw fires.** Both compile sites for the annotation root's
    lowering run over a candidate payload: the respond tool's `execute` verdict
    (`src/extension/production-theta-producer.ts:2595`, wired at `:2673` into
    `#executeRespondTool` at `:2686`) and QRY-22's `validateAgainst`
    (`src/runtime/typed-query-validation.ts:318`, the compile at `:323`, reached
    from `src/runtime/query-tool-loop.ts:693`). The `invoke<T>` return boundary
    compiles the same lowering after the callee returns
    (`production-theta-producer.ts:3383`). A non-`ThetaPanic`, non-`HostFatal`
    throw reaches the top-level slash catch and is framed
    `theta /<name> aborted with internal error: <message>`
    (`src/extension/theta-composition-producer.ts:492`).
  - **The registry row that states the boundary.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:87` — severity `E`,
    phase `parse`, *Message* `duplicate field name '<field>' within one inline
    object type`, no *Hint*. Its *Trigger* carries the sentence a fix here
    rewrites: "The comparison runs over the field-name positions the interior
    spells as `Ident ":"`, in source order, and reaches only the positions
    ahead of the interior's first stop … Names behind a stop are not compared;
    that is a refusal this row does not reach, distinct from the three shapes it
    excludes below." `:58`, `:59` and `:60` are the three rows a recovery change
    moves (`theta/parse/generic-arity-mismatch`,
    `theta/parse/void-in-non-return-position`,
    `theta/parse/result-in-schema-position`); `:86` is the sibling
    `theta/parse/empty-schema-body` row of the same rule set.
  - **The governing spec.** `docs/spec_topics/grammar.md:101` (the `ObjectType`
    production, `Field` per Schema Declarations) and `:109` (§"Inline object
    types", which names this code and its two carve-outs);
    `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
    position); `docs/spec_topics/schema-subset.md:73` (inline hoisting into
    `$defs` under `__inline_<slug>`);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, the registry
    is closed, and trigger changes land with the code) and `:74` (DIAG-4, the
    *Message* column is normative);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate every fixture below satisfies) and `:25` (the
    diagnostic-registry carve-out, which dispositions a *Trigger* change "as an
    addition for inputs newly brought into the code's emission set").
    User-facing mirrors: `docs/reference/diagnostics.md:136` (Message only, no
    *Trigger* column) and `docs/reference/grammar.md:205`.
  - **The landed witness this report is measured against.**
    `tests/inline-object-duplicate-field-name.test.ts`, group (k) — the group
    comment at `:1243–1281` and cells k1 `:1284`, k2 `:1306`, k3 `:1328`,
    k4 `:1352`, k5 `:1394`, k6 `:1440`, k7 `:1473`, k8 `:1558`, k9 `:1585`. Six
    of those cells pin a silence beside a still-minted lowering; k5 and k9 bound
    the boundary from either side. Cells d4 `:765` and d5 `:802` are 0160's and
    0161's subjects, cell d3 the generic-argument carve-out, group (f) the
    lowering freeze, and g3 `:1004` the real-`AjvSchemaValidator` compile.
  - **Corpus exposure — nil.** 34 committed `.theta` / `.thetalib` files at this
    HEAD; the only inline object TYPE among them is
    `tests/live/acceptance/fixtures/acc-typed-inline.theta:14`
    (`{ ok: boolean, label: string }`, names distinct, interior well-formed).
    Every other brace-and-colon match in the corpus is an object-literal
    expression (a tool-call argument or a constructor pattern), not an
    `ObjectType`. No committed source carries any shape below, under either
    route.
- **Observed at:** v0.84.0 (`f856fd33`). Offline, deterministic, provider-free:
  a scratch vitest probe over the shipped load path `parseThetaDocument` through
  `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the shipped
  `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:113`) and
  the production `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`);
  written, run, deleted. Every value below is that run's output verbatim, over a
  tracked tree byte-identical to HEAD.

## Summary

The rule bug 0052 shipped compares the field-name positions an inline object
interior spells as `Ident ":"`, and the retention that feeds it stops at the
interior's first malformed position. Three shapes stop it: a field-name position
that is not an identifier, an identifier not followed by `:`, and a completed
field not followed by `,`. A fourth path stops it from beneath — a field whose
own type carries an interior that never closes latches the stop for the rest of
the body, transitively, so a single unclosed nested interior ends the comparison
in every body enclosing it.

Names behind a stop are never compared, and the lowering runs regardless.
`{a: integer, : x, a: boolean}` loads with zero diagnostics at all eight `Type`
positions and lowers `required: ["a","a"]` beside a last-wins `properties.a`;
`{p: {c: 1, : y, c: 2}, p: 3}` and `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}`
lower a root `required: ["p","p"]`. That is the exact fragment bug 0052 owns, so
its consequences return with it: a declared field dropped without a word at the
hoisting positions, and at the `@<T>` annotation root — where the fragment is
the compiled document — a real `AjvSchemaValidator.compile` throwing
`schema is invalid: data/required must NOT have duplicate items`, after the
query turn has been spent.

The boundary is stated in the registry row, so implementation and corpus agree
at HEAD; what is unmet is 0052 §Expected's "no fragment carrying a repeated
`required` entry is ever minted". Closing it is either a re-key of the
comparison onto the tokenisation the lowerers themselves use — which also closes
0160 and 0161 and rewrites the row's *Trigger* — or a recovery change in
`parseObject`, which moves three other registered rows and enters bug 0133's
space.

## Reproduction

Offline, deterministic, at HEAD `f856fd33`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`, reading
the whole diagnostic list in emission order, unfiltered. `registers` is
`!diagnostics.some((d) => d.severity === "error")`
(`src/extension/production-composition.ts:1562`). Frontmatter
`---\nmode: prompt\n---` on lines 1–3; each body ends `let a = 1` + `a`.

The eight positions are spelled: ``let r = @<T>`hi` `` (annotation root),
`let r: T = 1`, `schema S { f: T }`, `fn f(x: T): integer { 1 }`,
`schema S = T`, `params:` with `p: "T"`, `let r = invoke<T>("./x.theta")`, and
the `.thetalib` spelling of the schema-body position
(`schema S { p: T }` in a `.thetalib` file).

### (a) The six shapes — silent at every position

| # | inline type `T` | stop | diagnostics at all eight positions | registers |
|---|---|---|---|---|
| 1 | `{a: integer, : x, a: boolean}` | `x` stands at a field-name position with no `:` behind it | `[]` | **yes** |
| 2 | `{a as "w": integer, a: string, a: boolean}` | `a` is followed by `as`, not `:` | `[]` | **yes** |
| 3 | `{"a": string, a: integer, a: boolean}` | the quoted name contributes nothing, leaving `string` at a field-name position | `[]` | **yes** |
| 4 | `{p: {c: 1, : y, c: 2}, p: 3}` | the nested interior never closes; the root's list stops at `p` | `[]` | **yes** |
| 5 | `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}` | the same stop, two levels up | `[]` | **yes** |
| 6 | `{a: 1 a: 2, a: 3}` | `a: 1` completes with no `,` behind it | `[]` | **yes** |

Every cell of the 6 × 8 matrix is `[]`. The `.thetalib` column's control
`schema S { p: {a: integer, a: string} }` draws
`error theta/parse/duplicate-inline-field-name: duplicate field name 'a' within
one inline object type` in the same file kind, so the silence is the key and not
the position.

### (b) Each shape still mints the duplicate

`lowerQueryResponseSchema(T, [], [])` — the annotation root's own lowerer,
called directly:

| # | lowered fragment |
|---|---|
| 1 | `{"type":"object","properties":{"a":{"type":"boolean"}},"required":["a","a"],"additionalProperties":false}` |
| 2 | `{"type":"object","properties":{"a as \"w\"":{"type":"integer"},"a":{"type":"boolean"}},"required":["a as \"w\"","a","a"],"additionalProperties":false}` |
| 3 | `{"type":"object","properties":{"\"a\"":{"type":"string"},"a":{"type":"boolean"}},"required":["\"a\"","a","a"],"additionalProperties":false}` |
| 4 | `{"type":"object","properties":{"p":{"const":3}},"required":["p","p"],"additionalProperties":false}` |
| 5 | `{"type":"object","properties":{"p":{"const":3}},"required":["p","p"],"additionalProperties":false}` |
| 6 | `{"type":"object","properties":{"a":{"const":3}},"required":["a","a"],"additionalProperties":false}` |

Every row drops a declared field to last-wins: row 1 loses `a: integer`, rows 2
and 3 lose their middle `a`, rows 4 and 5 lose the nested body first declared
for `p`, and row 6 loses both `a: 1` and `a: 2`. Rows 4 and 5 lower the same
bytes from different sources, which is the cascade: the depth-3 spelling loses
its middle body the same way the depth-2 one loses its nested one.

### (c) The compile still throws

A real `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`) over each
row's fragment, one fresh instance per row:

| # | `compile` result |
|---|---|
| 1 | throws `schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)` |
| 2 | throws `… (items ## 2 and 1 are identical)` |
| 3 | throws `… (items ## 2 and 1 are identical)` |
| 4 | throws `… (items ## 1 and 0 are identical)` |
| 5 | throws `… (items ## 1 and 0 are identical)` |
| 6 | throws `… (items ## 1 and 0 are identical)` |

Rows 1, 4, 5 and 6 reproduce bug 0052's fixture A2 message byte-for-byte; rows 2
and 3 carry the same text with the index pair naming their three-item `required`.
Both compile sites for this lowering run over a candidate payload
(§Affected), so the throw lands after the model has answered.

### (d) The bounds — what the boundary is, measured from either side

| # | source at the annotation root | diagnostics |
|---|---|---|
| c1 | `{a: integer, a: boolean}` | one line, `'a'` |
| c2 | `{p: {c: 1, c: 2}, p: 3}` | two lines, `'p'` then `'c'` |
| c3 | `{a: 1, a: 2, b: {c: 1, : y, d: 2}, a: 3}` | one line, `'a'` |
| c4 | `{p: {c: 1, : y, p: 2}}` | `[]` |
| c5 | `{p: {c: 1, : y, c: 2, c: 3}, p: 9}` | `[]` |

c2 is row 4 with the malformed `: y,` removed — the same two repeats, both
reported. c3 shows the stop truncating rather than disabling: the repeat ahead
of it is reported, the `a: 3` behind it is not. c4 is the shape where no body
spells a repeat at all, and its lowering carries no duplicate anywhere —
`required: ["p"]` at the root and `["c","p"]` in the hoisted
`__inline_b40cf28af9264f70` — so it is what the cascade exists to protect, and
any route here must keep it silent. c5 keeps c4's stop and adds real repeats
behind it: silent, and its lowering mints `required: ["p","p"]` at the root with
a last-wins `properties.p = {"const":9}` and no `c` anywhere, so the name a
widening keyed on the leaked field list would report (`c`) is not the name the
lowering duplicates (`p`).

## Expected behaviour

`grammar.md:101` defines `ObjectType` as `"{" Field ("," Field)* ","? "}"` with
"`Field` per Schema Declarations", and `:109` states that a field name repeating
within one inline object type is `theta/parse/duplicate-inline-field-name`,
"raised once per repeated name in source order and before the body is lowered".
`type-system.md:15` makes that answer position-invariant.

Bug 0052 §Expected states the two consequences the refusal owes, both of which
this report measures as unmet (`0052-…md:540–543`):

> - No fragment carrying a repeated `required` entry is ever minted, so nothing
>   reaches AJV. The A2 throw becomes unreachable rather than better-framed.
> - No property is silently dropped. Today `a: integer` disappears from the
>   lowered schema (A1, C1–C4) with nothing recorded.

Rows 1–6 of §Reproduction (b) each mint such a fragment, and each drops a
declared field. Every row hands the `@<T>` root a document the compile refuses
(§Reproduction (c)).

**What is settled.** A body that spells a repeated name twice at two
`Ident ":"` positions ahead of every stop is refused, at every position, once
per repeated name (§Reproduction (d) c1–c3, and the landed witness's groups (a)
to (c)). A name reused between an outer inline object and one nested inside it
is two field lists rather than a repeat, and a generic type argument's interior
is outside the rule (`grammar.md:109`; witness cells d1, d3). No emission may
name a repeat no single field list spells — §Reproduction (d) c4 and c5 are the
sources that fix that reading, and the landed witness's k5 and k7 pin both.

**What is not settled, and is the subject of §Fix.** Which key the comparison
runs over. Today it is the type grammar's own `Ident ":"` positions, and the
registry row states the resulting boundary normatively
(`code-registry-parse.md:87`), so the row moves in the same commit as any code
that widens it (DIAG-2, `diagnostic-shape.md:72`). 0045 §Non-goals reserved this
family for exactly that reason (`0045-…md:766–772`).

## Actual behaviour / root cause

**The retention is keyed to a parse the interior may not survive.**
`parseObject` (`src/parser/type-grammar.ts:504`) walks the interior field by
field. A field-name position whose token is not an `ident` is consumed and the
loop continues without contributing a name (`:528–534`) — so the `:` in
`{a: integer, : x, a: boolean}` contributes nothing and leaves `x` standing at a
field-name position. An identifier the interior does not follow with `:` breaks
the loop (`:535–538`) — that is `x` in row 1, `string` in row 3, and `a`
followed by `as` in row 2. A completed field the interior does not follow with
`,` breaks it too (`:562–564`) — row 6. Whatever the interior spells after the
break is never read as a field-name position, so the repeated `a` in rows 1, 2,
3 and 6 is never compared.

**The stop propagates upward because the recovery leaks tokens across bodies.**
When a nested `parseObject` call breaks without consuming its own `}`, the
enclosing loop resumes inside that interior and would read its leftovers as its
own fields. The 0052 fix closed the false positive that produced by latching
`namesStopped` on any field type that `carriesUnclosedInterior` (`:553`,
predicate at `:378–389`), transitively through object fields, generic arguments
and union arms. The latch is correct against the false positive — §Reproduction
(d) c4 is the source it protects — and it is also what ends the enclosing body's
comparison. In row 4 the root's list is `["p"]`, one name, so nothing repeats;
the real `p: 3` sits past the nested interior and is never contributed. Row 5 is
the same fact one level deeper, which is why the predicate recurses: keyed on
the middle body's own closing brace, that row would report a repeat neither of
its field lists spells.

**The lowerers do not share the key, and do not stop.**
`hoistInlineObjectType` (`src/parser/params.ts:670`) and `lowerInlineObject`
(`src/parser/body-type-lowering.ts:153`) split the interior with
`splitTopLevel(…, ",", "angle-and-brace")` and take each entry's
`topLevelColon` — a brace-depth-aware text split with no notion of a stop. Every
entry becomes a property and a `required` member (`params.ts:687–688`,
`body-type-lowering.ts:120`/`:128`), so the two writes that mint the duplicate
run for exactly the sources the comparison did not reach. Two different
tokenisations of one body, disagreeing precisely on the malformed inputs.

**The annotation root is where the fragment is the document.**
`lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:113`) returns
`lowerInlineObject`'s fragment directly for a single enclosing brace group
(`:151–156`). `AjvSchemaValidator` builds Ajv with `strict: false` (`:112`),
which does not disable meta-schema validation, and `#build` calls
`this.#ajv.compile` (`:149`); the meta-schema constrains `required` to unique
items and is applied to the root only. So the same duplicate compiles inside a
`$defs` member and throws at the root — §Reproduction (c).

## Why it matters

- **The refused input is one token from an accepted one.**
  `{p: {c: 1, c: 2}, p: 3}` draws two diagnostics and does not register;
  `{p: {c: 1, : y, c: 2}, p: 3}` draws none and registers. The second source is
  the first plus a malformed field, so the source with two faults is accepted
  where the source with one is refused.
- **The internal error after a spent turn is still constructible.** Rows 4 and 5
  of §Reproduction reach the `@<T>` root with a document AJV refuses to compile.
  The theta loads, registers, renders its query, spends a model turn, and fails
  on the way back with `theta /<name> aborted with internal error: schema is
  invalid: data/required must NOT have duplicate items …` — a message naming
  neither the theta source nor the field. That is the outcome bug 0052 §Fix
  constraint 2 records as removed.
- **A declared field is still dropped without a word.** Every row of
  §Reproduction (b) lowers fewer properties than its source declares fields, each
  surviving property typed by the last declaration. At the `params:` and
  schema-body positions the theta registers and runs; the binder and the
  validator work against a shape the author did not write.
- **The rule's answer depends on a recovery detail, not on a source property.**
  Whether a repeat is reported turns on whether some other field's interior
  closed — including a field two levels down that the repeat has nothing to do
  with. The row states this, so a reader can predict it, but only by reading a
  *Trigger* that describes parser recovery.
- **Three reports carry the same root and would settle it three ways.** 0160 and
  0161 are the rename and quoted-name spellings of the same key. A route that
  closes one and not the others leaves the registry row stating a boundary made
  of unrelated exceptions.

## Fix

Not settled. The two routes below are constraint-pinned; the run selects one and
states its choice with the evidence that decided it. Both carry the same-commit
spec edit DIAG-2 requires (`diagnostic-shape.md:72`) if they change which inputs
emit. Both must dispose of every constraint in (c).

**(a) Re-key the comparison onto the lowerers' own tokenisation.** This is bug
0052 §Fix constraint 4's second branch (`:668–675`), named by that fix's round 3
and recorded in its *Residuals* item 1 (`:317–320`): compare the field names the
lowerers themselves derive — `splitTopLevel(body, ",", "angle-and-brace")`
(`src/parser/params.ts:950`) plus `topLevelColon` (`:827`) — instead of the type
grammar's retained `Ident ":"` positions. Consequences, each measured or
derived:

- **It closes every shape in §Reproduction with zero recovery change.** The
  split is brace-depth-aware text, so rows 1–6 each yield the entry list the
  lowering already builds, and a repeated pre-colon text is exactly the
  duplicate `required` the fragment carries. The rule then agrees with what is
  lowered by construction rather than by fixture, which is the property
  constraint 4 called the second branch's own.
- **It closes 0160 and 0161 too**, because it keys on raw pre-colon text: the
  identical-rename spelling and the quoted-name spelling both become repeats.
  Cell d4 row 1 and cell d5 flip from silence to refusal and must be re-pinned
  in the same commit, with their comments rewritten — both currently state the
  silence as deliberate.
- **It requires a *Trigger* rewrite.** `code-registry-parse.md:87` states the
  `Ident ":"` key, the three stops, the cascade and the three excluded shapes;
  under this route the key is the pre-colon text of a brace-aware comma split,
  two of the three exclusions disappear, and the stops do not exist. That is a
  DIAG-2 trigger change, dispositioned by the diagnostic-registry carve-out
  (`source-language-stability.md:25`) as an addition for inputs newly brought
  into the emission set. `docs/spec_topics/grammar.md:109` and the two mirrors
  (`docs/reference/diagnostics.md:136`, `docs/reference/grammar.md:205`) move in
  lock-step; the *Message* does not (DIAG-4, `:74`).
- **It must not re-key what the message renders.** `<field>` is a category-5
  source-derived placeholder, rendered "identifier-shaped per Lexical —
  Identifiers" and unquoted
  (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:5`, `:10`), and the
  present rule can only ever fill it with an `ident` token. Under this route the
  subject can be `"a"` or `a as "w"` — quoted or space-bearing text, neither of
  which matches `[A-Za-z_][A-Za-z0-9_]*`. The route states how the placeholder
  renders those (a DIAG-4 question, `diagnostic-shape.md:74`), or bounds the
  comparison to entries whose pre-colon text is identifier-shaped and leaves the
  rest to 0160 and 0161.
- **It must keep the generic-argument carve-out.** The lowering's own
  generic-argument handling never divides that interior into fields, so the
  agreement property that motivates this route also supplies the carve-out —
  but only if the comparison runs where the lowering splits, and not over every
  brace group in the source. Cell d3 is the lock.
- **It coordinates with 0154**, which rebases onto the `fieldNames` retention
  this route stops using as the rule's key. State whether the retention stays
  on the node for 0154's subject or moves with the rule.

**(b) Resynchronise `parseObject`'s recovery so the field walk continues past a
malformed field.** Measured consequences, from 0052's fix and re-derived here:

- **Brace-level resync alone does not deliver §Expected.** Rows 1, 2, 3 and 6
  are same-body stops with no unclosed interior at all; only per-FIELD resync
  reaches them. 0052's round 3 confirmed this by trace and measurement.
- **It moves three registered rows on unmeasured inputs.** Which field types the
  walk visits on a malformed interior decides where
  `theta/parse/void-in-non-return-position` (`code-registry-parse.md:59`),
  `theta/parse/generic-arity-mismatch` (`:58`) and
  `theta/parse/result-in-schema-position` (`:60`) fire. Any route (b) fix
  measures that blast radius before it lands, over the whole default suite and
  over sources those three rows own.
- **It enters 0133's space.** That report exists to pin the disposition of
  field-list discard recovery before code lands, at the declaration body. Route
  (b) answers the same question at the type position. Either the two land
  together or this one states why the answers differ.
- **It closes neither 0160 nor 0161**, whose shapes are excluded by the key and
  not by a stop.

**(c) Constraints binding on both routes.**

1. **No lowering changes.** 0052 §Fix constraint 1 (`:649–655`) and the locks it
   names (`tests/params-inline-object-lowering.test.ts`, group (f) of
   `tests/inline-object-duplicate-field-name.test.ts`) hold. The refusal is at
   parse; the fragments in §Reproduction (b) stay byte-identical for any source
   still admitted.
2. **No `catch` at any AJV seam.** The throw is removed by refusing the input,
   as 0052 §Fix constraint 2 requires.
3. **§Reproduction (d) c4 and c5 stay silent, and c1–c3 stay as they are.** An
   emission naming a repeat no single field list spells is a false positive over
   a source whose lowering mints no duplicate — the fault 0052's round 3 found
   and fixed. Witness cells k5, k7 and k9 are the locks; k9 additionally pins
   that a stop truncates rather than disables.
4. **Group (k) is re-pinned deliberately, comments included.** Cells k1–k4, k6,
   k7 and k8 assert silence beside a still-minted lowering and their comments
   name this report's residual. A route (a) fix flips seven of them to a
   refusal and must rewrite the comments; the lowering read-backs stay as
   controls only where the source is still admitted.
5. **All eight positions, uniformly** (`type-system.md:15`). The 6 × 8 matrix in
   §Reproduction (a) is the minimum witness shape: a fix measured at the
   annotation root alone cannot distinguish a rule change from a call-site
   change. Group (i) of the landed witness pins the rule set's reach by
   assertion over its sibling member; keep that property.
6. **State the GOV-15 disposition from a re-measured census.** §Affected's
   34-file, zero-instance count is this HEAD's; re-run it, since sibling fixes
   land `.theta` files. Every fixture here loads with no `E` diagnostic today
   (`source-language-stability.md:9`), so each is inside the loads-cleanly input
   set and the addition is carve-out-covered (`:25`).
7. **Coordinate with 0160 and 0161.** All three turn on the comparison key.
   Whichever lands first states the key and the *Trigger* it implies; the others
   cite that ruling. Do not settle their rows here beyond the key.

## Non-goals

- **Not the identical-`as`-rename shape.**
  `{a as "w": integer, a as "w": string}` lowers one last-wins property beside
  `required: ["a as \"w\"","a as \"w\""]` and is silent.
  [0160](./0160-inline-object-wire-name-rename-unparsed.md) owns it, together
  with the unparsed rename generally. Row 2 of §Reproduction uses a rename only
  as the stop ahead of an unrenamed repeat.
- **Not the quoted-name shape.** `{"a": string, "a": integer}` lowers one
  property keyed `"a"` beside a two-item `required` and is silent.
  [0161](./0161-quoted-inline-field-name-not-a-field.md) owns it, together with
  the inline/declaration asymmetry on non-identifier field names. Row 3 uses a
  quoted name only as the stop ahead of an unrenamed repeat.
- **Not the `as "WireName"` clause's absence from the inline `Field` form.**
  Neither lowerer parses it (the whole pre-colon text becomes the property
  name), and 0052 §Non-goals (`:726–733`) holds it as a separate subject. A
  route (a) fix inherits that text as the compared key without parsing it.
- **Not the generic-argument carve-out.** `array<{a: integer, a: string}>` stays
  silent: the lowering never divides a generic argument's interior into fields,
  so no duplicate `required` is minted there (witness cell d3, `grammar.md:109`).
  Unchanged here.
- **Not the nested-reuse boundary.** `{a: integer, b: {a: string}}` is two field
  lists, not a repeat (cell d1). Unchanged here.
- **Not dedup in a lowerer.** 0052 §Fix constraint 1 (`:649–655`) freezes both
  lowerers' bytes against 0035's and 0039's locks; the fragments in
  §Reproduction (b) are the frozen output for that text and stay so.
- **Not AJV's root-only meta-schema validation.** The asymmetry between a
  `$defs` member and the root is a property of the validator seam. No `catch` is
  added at any AJV seam.
- **Not the compound position's double emission.** A `let` annotation over a
  query initialiser draws every rule on this walk twice;
  [0093](./0093-let-annotation-query-position-double-emission.md) owns the class
  and witness cell h1 pins it.
- **Not the declaration body's discard recovery.** `parseSchemaObjectBody` /
  `skipBraceRemainder` (`src/parser/theta-document.ts:2589`, `:2708`) are 0133's
  subject and are not touched by route (a).

## Provenance

Filed as residual 1 of the bug 0052 fix (0.84.0, commit `f856fd33`). That fix's
report (`.pi/tmp/fixes/0052-report.md` §Residuals item 1) records the six shapes,
the two grounds for leaving them open, and the closing route; the same
disposition is in the doc at
[`0052-…md`](./0052-inline-object-duplicate-field-names-silent-last-wins.md)
`## Fix (0.84.0)` *Residuals* item 1 (`:294–320`). The residual originates in
that fix's review rounds 1 and 2 (the same-body truncation, then the enclosing
body's curtailment) and its round 3 (the transitive stop that fixed the
cross-body false positive).

Independently re-derived at HEAD `f856fd33` for this filing, not copied: one
scratch vitest probe over `parseDoc`, `lowerQueryResponseSchema` and the
production `AjvSchemaValidator` covering every row of §Reproduction (a)–(d) at
all eight positions, run and then deleted; plus the corpus census in §Affected.
The landed witness `tests/inline-object-duplicate-field-name.test.ts` was re-run
green (49/49) against the same tree, which pins each lowered fragment quoted
here byte-identical to its committed expectation. Every `src/`, `tests/`, spec
and bug-doc citation above was verified against the tree at HEAD; symbols are
named beside lines because the 0052 fix grew `src/parser/type-grammar.ts` from
567 to 835 lines.

Three citation observations, recorded rather than chased (0134's class): bug
0133 cites `parseSchemaObjectBody` at `src/parser/theta-document.ts:2534–2616`
and `skipBraceRemainder` at `:2619`; at this HEAD they are `:2589` and `:2708`.
Bug 0052's §Affected cites its evidence at `52e257bc` (0.49.0) throughout, which
its own `## Fix (0.84.0)` record already dispositions as re-derived by symbol;
the line numbers in this report's §Affected are this HEAD's, not that section's.
Bug 0052 §Fix (0.84.0) *Residuals* item 4 links
`./0093-let-annotation-over-query-double-emission.md`, which does not exist —
the file is `0093-let-annotation-query-position-double-emission.md`, the
spelling this report links.

A concurrent sibling filing's uncommitted prototype in `src/parser/params.ts`
and `src/parser/body-type-lowering.ts` was present in the working tree during an
earlier measurement pass. Every value in this report comes from the later pass
over a tree `git status --short` reported clean, and both passes produced
byte-identical output. No file outside `docs/bugs/` was read as evidence in a
modified state.

## Fix (0.93.0)

- **What shipped:**
  - `src/parser/type-grammar.ts` — §Fix route (a), the whole change. `TypeToken`
    gains a `start` source offset; `TypeParser` holds the source beside the
    tokens; `interiorSpellsClosingBrace` becomes `interiorClosingBraceIndex`,
    returning the token index of the depth-0 `}`; the object `TypeNode` gains
    `interiorSource`, the raw text between its own `{` and that brace, sliced
    off those offsets rather than rebuilt from token texts; and `walkType`'s
    `object` arm keys on `inlineObjectFieldKeys(node.interiorSource)`, which
    calls `splitTopLevel(interior, ",", "angle-and-brace")` and `topLevelColon`
    imported from `./params` — the very functions `hoistInlineObjectType` and
    `lowerInlineObject` call. Both gates, both `Set`s, the emission shape, the
    multiplicity and ordering, `parseObject`'s tolerant recovery and every
    lowerer are unchanged.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the DIAG-2 *Trigger*
    rewrite of the `theta/parse/duplicate-inline-field-name` row, in the same
    commit as the code. The *Message* cell is byte-identical to its 0.92.0 text
    (DIAG-4).
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — a row-scoped
    `<field>` carve-out plus its test vector, both folded into existing lines so
    the file's length does not move.
  - `docs/spec_topics/grammar.md` §"Inline object types" and
    `docs/reference/grammar.md`'s `ObjectType` bullet — the lock-step edits.
    `docs/reference/diagnostics.md` needed none: that table carries no *Trigger*
    column and the *Message* did not move.
  - `tests/inline-object-field-name-comparison-key.test.ts` — the 18-cell
    witness (new), carrying §Reproduction (a)'s 6 × 8 matrix plus the
    `.thetalib` spelling, the key-boundary rows, the false-positive fence, the
    agreement-by-construction assertion, the AJV unreachability, the surviving
    carve-outs, 0161's declaration controls and its open half, and the
    position-dependence of the rendered subject.
  - `tests/inline-object-duplicate-field-name.test.ts` — the nine pre-authorized
    re-pins (below).
  - `tests/live/live-production-acceptance.test.ts` — additive H8a cell 35.

- **The two adjudications this fix implements, verbatim.**
  - *Operator, set-level:* "0159→0160→0161 as ONE adjudication: same rule, same
    registry row (theta/parse/duplicate-inline-field-name); §Fix route (a) —
    re-key the comparison onto the lowerers' splitTopLevel/topLevelColon
    tokenisation — closes all three at once; route (b) enters open 0133's
    recovery space; whichever lands FIRST states the adjudication and the other
    two cite it; any Trigger widening is a DIAG-2 same-commit spec edit."
  - *Parent, packaging:* "ONE orchestrator, ONE commit, v0.93.0, owning 0159 as
    primary. It closes 0159 fully and 0161 per its route-B terms (both statuses
    flip in the commit), and NARROWS 0160 with a coordination note (stays open —
    flipping it would close a doc whose measured subject survives). The parent
    files the 0161 quoted-key re-filing at the gate. This follows each doc's own
    evidence over the summary sentence: 0160 §Fix (a) route 2 states it
    'delivers no wire-name semantics: G1's two fields carry two different
    pre-colon texts and one shared wire name, so G1 stays [] unless the rename
    is additionally parsed OUT of that text' — so 0160's title subject (the
    rename unparsed) survives route (a) and its doc stays open, narrowed to the
    wire-name-semantics half. 0161 §Fix route B states its own closure terms:
    'If route B is chosen, this report closes on the duplicate and the
    quoted-key question is re-filed rather than left implicit.'"
  - §Fix constraint (c)7 ("Do not settle their rows here beyond the key") was
    written for three separate landings. The one-adjudication instruction
    supersedes it for 0161, which closes here on its own route-B terms, and for
    0160's duplicate face, which is recorded in that document rather than left
    implicit. 0160's own subject is untouched and its status does not move.

- **The key, exactly as landed.** Each entry of
  `splitTopLevel(interiorSource, ",", "angle-and-brace")`; that entry's text
  before its own `topLevelColon`, after `trim()`; no unquoting and no
  normalisation. An entry with no top-level `:`, or whose pre-colon text trims
  to empty, spells no key and contributes none — which is why `{: x, : y}`,
  `{ a }` and `{ a: }` stay silent and mint no duplicate. An entry whose TYPE
  position is empty KEEPS its key: `{a: integer, a: }` repeats `a` though the
  lowering mints a one-item `required`, which is cell j1's settled reading that
  the key is the source's and not the lowered artefact's. Both lowerers skip
  that entry as well as the empty-key one; this rule skips only the empty-key
  one, and the divergence is stated in the *Trigger* and in the helper's own doc
  comment.

- **The placeholder disposition, and the alternatives rejected by measurement.**
  Route (a) makes the subject the raw key, which can be `"a"`, `'a'`, `""` or
  `a as "w"` — none identifier-shaped, and `<field>` is category 5,
  "identifier-shaped per Lexical — Identifiers", rendered unquoted
  (`placeholder-rendering-b.md:10`). §Fix route (a)'s second disposition —
  bounding the comparison to identifier-shaped entries — is foreclosed by the
  set-level adjudication, which requires the re-key to close 0161's quoted shape
  and 0160's rename-duplicate shape. **Landed: a ROW-SCOPED carve-out on
  `<field>`**, written on the exact precedent of `<X>`'s `{}` carve-out for
  `theta/parse/empty-schema-body`'s empty-inline-object trigger
  (`placeholder-rendering-b.md:55`) — the sibling row of the same
  `"inline-object-shape"` rule set. It is the narrowest admissible form of the
  category-5 amendment, it leaves the *Message* untouched (DIAG-4), and 0161
  §Fix B3 names it among the three admissible dispositions ("or the placeholder
  table gains a carve-out in the same commit"). Rejected, each on measurement:
  1. *A normalised rendered subject.* No normalisation maps `""`, `'a'` or
     `"a-b"` to identifier shape, so it cannot satisfy the bullet it exists to
     satisfy; and a render that erased the distinction between `'a'` and `"a"`
     would describe two keys the row deliberately keeps distinct (0161 §Fix B4,
     row f3).
  2. *A NEW row keyed on `<key>`* (0161 §Fix A2's candidate, raised there for
     route A). `<key>` double-quotes a non-identifier-shaped key by a runtime
     check, so the subject would render `""a""` and `"a as "w""` — less legible
     than the source text it names — and splitting one rule's emissions across
     two closed-registry rows buys a distinction that carries no difference in
     remedy.
  3. *A general amendment to the category-5 bullet.* `<field>` is carried by
     fifteen registry *Message* templates; the other fourteen must not move.

- **The *Trigger* rewrite (DIAG-2, same commit).** The `Ident ":"` key, the
  three stops and the cascade are deleted — under this key the stops do not
  exist — and the excluded shapes drop from three to two (the quoted name and
  the `as "WireName"` rename are now keys like any other). The closing-brace
  requirement, the multiplicity and ordering sentence, and the final
  `theta/parse/wire-name-collision` sentence are unchanged. The new key clause,
  verbatim as shipped:

  > The comparison runs over the entries a brace-and-angle-aware split of the
  > interior on top-level commas yields (quoted regions skipped), keyed on each
  > entry's own text before its own top-level `:`, taken verbatim after `trim()`
  > — the same split and the same text both lowerers key their `properties` and
  > `required` writes on, so `"a"`, `'a'` and `a as "w"` are the keys they are
  > written as, `{'a': …, "a": …}` is two keys and not one, and padding around
  > an entry's pre-colon text is absorbed by the trim; no unquoting and no
  > normalisation otherwise apply. An entry with no top-level `:`, or whose
  > pre-colon text trims to empty, spells no key and contributes none; an entry
  > whose TYPE position is empty still keeps its key.

  Review round 1 falsified a first draft of the closing clause ("so this row's
  answer is exactly the lowering's") with two probes — `{a: integer, a: }` fires
  while the lowering mints no repeat, and `{p: {c: 1, : y, c: 2}, p: 3}` reports
  `p` and `c` while the lowered document repeats only `p`, last-wins having
  erased the nested body. The shipped clause claims DERIVATION identity instead:
  the key list is derived from exactly the bytes that position hands the
  lowerer, by the same split and the same colon.

- **The generic-argument carve-out and the closing-brace gate are intact and
  load-bearing**, proven by neutralisation: dropping `!insideGenericArgument`
  makes `array<{a: integer, a: string}>` fire (cells d3 and F1 red). The
  comparison runs where the LOWERING splits, not over every brace group; cell d3
  is the lock, as §Fix route (a) requires.

- **0154 coordination — the retention stays.** `fieldNames`, the `namesStopped`
  latch and `carriesUnclosedInterior` are unchanged and stay on the node.
  `fieldNames` is the theta-side IDENTIFIER list; 0154's lowercase-first and
  reserved-keyword rules ask whether a name is a well-formed identifier, a
  question asked of a TOKEN and not of the raw, unnormalised entry text this
  rule now keys on. Removing it would widen this diff into 0154's substrate. The
  disposition is stated at all three sites in the code and appended to 0154's
  own document.

- **GOV-15.** Disposition: the diagnostic-registry carve-out
  (`source-language-stability.md:25`), addition direction — every newly-refused
  input carries no `E`-severity diagnostic at 0.92.0 and so leaves the
  loads-cleanly set (`:9`). The newly-emitting input set, enumerated: an inline
  object type, in any `Type` position and at any nesting depth reachable through
  inline object fields and union arms, two of whose comma-separated entries
  share a raw pre-colon text — which brings in (i) repeats behind a
  malformed-entry position in the same body (`{a: integer, : x, a: boolean}`,
  `{a: 1 a: 2, a: 3}`), (ii) repeats in a body enclosing a nested interior that
  never closes, at any depth (`{p: {c: 1, : y, c: 2}, p: 3}`,
  `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}`), (iii) the quoted-name spelling
  (`{"a": string, "a": integer}`, and `{"": …, "": …}`), and (iv) the
  identical-rename spelling (`{a as "w": integer, a as "w": string}`). At four
  positions — the `schema` body field, the alias RHS, the `.thetalib` spelling
  and `params:` — `{a: 1 a: 2, a: 3}` was ALREADY refused at 0.92.0 by the
  last-resort residue guards (`theta/parse/schema-type-not-expression`,
  `theta/load/params-type-not-expression`), which stand down when the field's
  own walk supplies an error; there the change substitutes this code for those,
  and is not a new refusal.
- **Corpus census, re-run at this HEAD.** 34 committed `.theta`/`.thetalib`.
  The only inline object TYPE is
  `tests/live/acceptance/fixtures/acc-typed-inline.theta:14`
  (`{ ok: boolean, label: string }`, distinct names, well formed); every other
  brace-and-colon match is an object-literal expression. Zero `as` renames (the
  one regex hit is the English word in a comment at
  `docs/examples/ralph-inline.theta:35`) and zero quoted field names. No
  committed source moves; `tests/committed-fixture-parse-gate.test.ts` takes no
  new refusal.

- **Gates** (each re-run by the orchestrator, not taken on report):
  - Witness, red before / green after — neutralising the object arm's key back
    to `node.fieldNames` reds exactly 19 cells, all `AssertionError` of the form
    "the expected duplicate line is missing", zero `TypeError`; restoring gives
    `git hash-object src/parser/type-grammar.ts` =
    `cedf5fa541f13396abbf71b82aa504cdee2987cd` on both sides and 67/67 green.
  - Default suite: `npx vitest run` → 296 files / 4887 tests, zero failures.
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` → clean. Build:
    `npm run build` → clean.
  - Lint: `npm run lint` → clean.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → 35/35 (cell 35 additive;
    cells 1–34 untouched).
  - Live H9a, both files: `noninteractive-acceptance.test.ts` (10) +
    `ctor-unresolved-load-refusal.test.ts` (1) → 11/11.
    `tests/fixtures/h7a/permitted-codes.json` decided by that real run:
    BYTE-UNCHANGED, `git hash-object` = `git rev-parse HEAD:` =
    `a4a8da04209f90e13d815edd92c1fc682e2a2236`.
  - `src/parser/type-grammar.ts` 835 → **923** lines, recorded for the reports
    that cite it by line rather than chased (0134's class).

- **Existing cells re-pinned — the nine §Fix (c)4 and 0161 §Fix A6/B5
  pre-authorize, and nothing else.** In
  `tests/inline-object-duplicate-field-name.test.ts`: d4 (row 1 only; rows 2 and
  3 stay silent, their pre-colon texts differing), d5, k1, k2, k3, k4, k6, k7
  and k8 — with their comments rewritten, and the lowering read-backs reframed
  as "what the refusal prevents" where the source is no longer admitted. k5 and
  k9 are UNMOVED and green, so the false-positive fence of §Fix (c)3 holds
  (`{p: {c: 1, : y, p: 2}}` silent, because no entry list spells a repeat and no
  fragment carries a duplicate `required`; `{a: 1, a: 2, b: {c: 1, : y, d: 2},
  a: 3}` fires exactly once). j1, j2, j3 and d1–d3 are unmoved and green. The
  measured blast radius over the whole default suite is exactly those nine cells
  and no file outside this witness.
  §Fix (c)3's illustrative sentence "c4 and c5 stay silent" was derived under
  the 0.92.0 key: c4 (cell k5) stays silent as required, but c5 (cell k6) mints
  `required: ["p","p"]` at its own root, so refusing it is a true positive, and
  the constraint's normative half — "an emission naming a repeat no single field
  list spells is a false positive" — is what holds.

- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — NOT-CLEAN, six
  findings, no blockers: a falsifiable *Trigger* clause, an unreachable
  rendering claimed by the placeholder carve-out, a stale spec quote in the new
  witness, stale old-key prose in the landed witness's file and group (j)
  headers, an under-enumerated stand-down appositive on another row, and one
  historical-narration comment. It cleared, with probes, the re-key's
  correctness (13 adversarial probes), the `type-grammar → params` import cycle
  (one of nine in this repo; every cyclic use sits in a hoisted function
  declaration, both entry orders probed green, `npm run build` clean), fidelity
  to route (a), the false-positive fence, both gates by neutralisation, the
  GOV-15 census and the residue-guard substitution. Round 2
  (`bug-fix-reviewer-fast`) — CLEAN, no findings, after five of the six were
  fixed; it re-probed every clause of the shipped *Trigger* and falsified none.
- **Verification:** VERIFIED. The witness reds on neutralisation and only on the
  expected cells, with byte-exact restoration proven by hash on all three
  neutralisations; the default suite, typecheck, lint and build are clean; H8a
  (35/35, additive cell 35) and H9a (11/11, both files) ran for real against a
  live provider with `permitted-codes.json` byte-unchanged.

- **Residuals:**
  1. *The quoted-key SINGLE-field admission — 0161 §Fix B2's explicitly-open
     half.* `{"a": string}` still loads at every `Type` position and still
     lowers `properties['"a"']` — a JSON Schema property name carrying quote
     characters no theta identifier can address. Route B closes the duplicate
     and not this; 0161's own §Fix B2 requires it to be "re-filed rather than
     left implicit". Evidence bundle: 0161 §Reproduction (c) row v6 and (d) rows
     L1–L7, re-measured green here as cell G2 of
     `tests/inline-object-field-name-comparison-key.test.ts`, which pins both
     the silence and the lowered bytes. The parent files it; this run creates no
     bug document.
  2. *The type-source capture collapses inter-token whitespace at seven of the
     eight positions.* Measured here, PRE-EXISTING and not created by this fix:
     `params:` hands its position the raw YAML scalar, while `@<T>`, `let`, `fn`
     parameter, `fn` return, the `schema` body field, the alias RHS and
     `invoke<T>` reconstruct the type text by joining lexer token texts with no
     separator, so `{a  as  "w": integer, b: string}` arrives as
     `{aas"w":integer,b:string}`. Both the rule and the lowerer receive that
     same string, so agreement is exact at every position and the LOWERED
     property names already carried the collapse before this change; what is new
     is only that the collapse is now visible in a diagnostic subject. Cells H1
     and H2 pin it in both directions. Consequence for 0160: its §Reproduction
     rows L1, L2, L4, L5, L6, D2, D3 and D8 were measured by direct
     `lowerQueryResponseSchema` / `buildBodyTypeSchemas` calls on hand-written
     strings, so their exact key bytes are not what the DOCUMENT path mints at
     those positions — its conclusions stand, its bytes are position-dependent.
     Recorded in 0160's coordination note.
  3. *An under-enumerated appositive on another row.*
     `theta/parse/schema-type-not-expression`'s stand-down clause names "a
     position rule …, a reserved keyword, or an unresolved name" where the code
     stands down for ANY error-severity diagnostic the field's own walk
     supplies. Round 1 proved this pre-existing (it already stood down for this
     rule at 0.92.0) and the generic clause true of the code; the sibling
     `theta/load/params-type-not-expression` row already words it correctly
     ("one of the type grammar's own registered rejections"). Not edited:
     amending another row's normative *Trigger* on a pre-existing condition is
     outside this fix's scope.
  4. *A stale field list in a protected witness's comment.*
     `tests/schema-field-name-case.test.ts:110` states that `TypeToken` "is
     `{ kind, text }` with no range"; it is now `{ kind, text, start }`. The
     comment's argument is unaffected — a single numeric offset is not a range —
     and no assertion depends on it. Not edited: that file is a protected
     whole-list witness.
  5. *Positional drift, recorded not chased* (0134's adjudicated class):
     `src/parser/type-grammar.ts` 835 → 923. `docs/reference/diagnostics.md`'s
     row is at `:138`, not the `:136` the three sibling documents cite; the
     registry row is at `:89`, not the `:87` those documents and the landed
     witness cite. `docs/spec_topics/diagnostics/placeholder-rendering-b.md`
     (134) and `docs/reference/grammar.md` (613) were deliberately restored to
     their pre-fix line counts by a citation-only correction round, so no
     citation into either moved.

- **Discharge notes appended:**
  [0160](./0160-inline-object-wire-name-rename-unparsed.md) (narrowed, status
  unchanged) and
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md) (the
  retention disposition).
  [0161](./0161-quoted-inline-field-name-not-a-field.md) carries its own
  `## Fix (0.93.0)` record and flips with this commit.
- **Pinned dispositions / non-goals:** route (b) is rejected and stays rejected
  — it closes neither sibling and enters open
  [0133](./0133-field-list-discard-recovery-unsettled.md)'s recovery space;
  `parseSchemaObjectBody` and `skipBraceRemainder` are untouched. Both lowerers
  are byte-unchanged (§Fix constraint (c)1); no `catch` was added at any AJV
  seam (§Fix constraint (c)2); the declaration spelling keeps
  `theta/parse/wire-name-collision` and its own bytes. The `as "WireName"`
  clause's wire-name SEMANTICS remain unparsed and remain 0160's subject, as
  does the `<schema>` placeholder question for that row.

## Note — bug 0176 discharged this fix record's *Residuals* item 1 (0.161.0)

The quoted-key SINGLE-field admission this record named as owed to a filing is
closed by [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md)
on its §Fix route **A**: a non-repeating inline key whose first character is `"`
or `'` is refused as `theta/parse/quoted-inline-field-name` at every `Type`
position, so `{"a": string}` no longer lowers `properties['"a"']`. This fix's
comparison key is unchanged and was REUSED, not re-adjudicated — the new row
reads the same `inlineObjectFieldKeys` list, behind the same two gates, and a
key that repeats still keeps `theta/parse/duplicate-inline-field-name` alone.
Four cells of the witness this fix shipped were re-pinned there (A3, B1, D1 and
G2 of `tests/inline-object-field-name-comparison-key.test.ts`; G2's own comment
authorised its inversion), each with its subject preserved. Status unchanged
(**fixed (0.93.0)**).
