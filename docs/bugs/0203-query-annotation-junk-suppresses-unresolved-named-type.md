# Bug 0203 — `parseQuery`'s own `@<T>` depth loop joins any trailing junk into the captured annotation, and the junk-suffixed text SUPPRESSES a registered code at one of that code's own Trigger positions: ``let r = @<Ghost>`hi` `` draws `theta/parse/unresolved-named-type 'Ghost'` while ``let r = @<Ghost-->`hi` `` draws NOTHING, 26 of 29 trailers load with zero diagnostics, and every one of them lowers to the accept-anything `{}` that AJV validates every payload against

- **Status:** fixed (0.135.0). §Fix below is settled: route (b)(1), a NEW
  registry row (§Fix (c) option two), and the GOV-15 removal-direction
  question answered in §Fix (d) below.
  [0124](./0124-parsetype-trailing-punctuation-leniency.md) is **fixed
  (0.121.0)**, commit `9eb1290d` — the provenance, the owner of the shared
  recogniser a route here would call, and the owner of the three witness cells
  a fix must move (`tests/annotation-nontype-text-refusal.test.ts:2212`,
  `:2228`, `:2238`).
- **Sev/Diff estimate:** S1/D3 — S1 because a registered error-severity row is
  removed by one trailing punctuation character at a position its own Trigger
  names (`code-registry-parse.md:95`), and the input is then accepted with an
  empty diagnostic list and lowered to `{}`, so the declared response schema
  constrains nothing: measured, `@<Cat>`'s lowering rejects 5 of 6 probe
  payloads and `@<Cat-->`'s accepts 6 of 6 (§Reproduction (f)). Three further
  registered rows go the same way (§Reproduction (d)). No value is corrupted
  and nothing is refused, which is the silent-acceptance band, not the
  noisy-refusal one. D3 because the emission point needs in-run adjudication
  across three routes with different blast radii; the judgement is computed by
  a sink shared with bugs 0059, 0061 and 0124 whose one decline narrows all
  positions at once; a fix reds three cells inside 0124's own witness by
  design; and the refusal direction is a GOV-15 removal-direction question
  (`source-language-stability.md:5`) that 0124 answered for three other
  positions and this one inherits rather than re-derives.
- **Kind:** defect against `docs/spec_topics/type-system.md:15` and
  `docs/spec_topics/grammar.md:105` read together, plus a registry gap.
  `type-system.md:15` states "The same type grammar applies in every
  type-annotation position: schema fields, frontmatter `params:`, `let x: T`,
  function parameters, and `@<T>`…`` explicit query schemas", and then, in the
  same sentence, "Text that derives from none of the forms above is refused at
  load or parse time rather than admitted as a nominal reference" —
  enumerating `theta/parse/annotation-type-not-expression`,
  `theta/parse/schema-type-not-expression` and
  `theta/load/params-type-not-expression`, which between them name four
  positions and **omit the `@<T>` position its own first clause lists**.
  `grammar.md:105` has the same shape: it lists "`invoke<Type>` /
  type-ascription contexts" among the bare-`Type` positions, states "The
  grammar is otherwise identical in every position", and then names rows for
  five positions, not for the ascription. Measured at HEAD, the ascription
  position admits `Ghost--`, `--`, `Gho--st`, `Ghost--%%` and 22 further
  spellings with zero diagnostics and lowers each to `{}`.

  Three elements, each measured at HEAD `9eb1290d` (v0.121.0) through the real
  `parseThetaDocument` and the shipped lowering and validator seams.
  1. *The capture joins anything.* `parseQuery`'s annotation capture
     (`src/parser/theta-document.ts:4583–4599`) is an inline loop with no stop
     set at all: it tracks `<` / `>` depth and `atEnd()`, and
     `parts.push(this.advance().text)` (`:4597`) takes every other token
     whole. 26 of the 29 trailers 0124 measured join and load silently,
     including the five — `,`, `)`, `}`, `{`, `=` — that `parseType`'s stop
     set ends the capture on. So this capture is strictly more lenient than
     the one 0124 closed.
  2. *The junk removes the position's own name walk.* The `@<T>` position IS
     one of `theta/parse/unresolved-named-type`'s closed five Trigger
     positions (`code-registry-parse.md:95`; restated at
     `theta-document.ts:5127–5148`, which names "the `"query"` case of
     `walkExpr`" as one of the four emitters). `Ghost--` is not an `Ident`, so
     `lowerTypeExpr`'s trailing catch-all (`src/parser/params.ts:786–787`)
     takes it, nothing lands in the `unresolved` sink, and the walk at
     `theta-document.ts:7020` returns `[]`. Four registered rows disappear
     with it (§Reproduction (d)).
  3. *The answer is already computed at that call site and discarded.* The
     same sink call has a fourth out-parameter for exactly this text
     (`collectUnresolvedNamedTypes`,
     `src/parser/body-type-lowering.ts:601–621`). The `@<T>` call site passes
     three arguments (`theta-document.ts:7020–7024`), so `unspellable` is
     `undefined` and the junk is dropped on the floor. Measured directly:
     `collectUnresolvedNamedTypes("Ghost--", ∅, kw, unspellable)` fills
     `unspellable` with `["Ghost--"]`, and 0124's exported recogniser
     `annotationSourceIsNotTypeExpression("Ghost--")`
     (`src/parser/type-layer-checks.ts:952`) answers `true` today.
- **Related:**
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **fixed
    (0.121.0)**, commit `9eb1290d`, and the closest report; read the boundary
    before treating this as a duplicate. 0124 closed the identical leniency
    class at the three `Type` positions outside a schema (a `let` annotation,
    an `fn` parameter type, an `fn` return type) with
    `theta/parse/annotation-type-not-expression`. Its registry row
    (`code-registry-parse.md:92`) names those three positions and **does not
    claim this capture**; its §Non-goals declines it in terms ("Its capture is
    the inline depth loop … a different site with its own registered
    empty-interior rejection … the disposition of that suppression belongs
    with whoever owns that capture, not here"); and its witness pins the
    current silence byte-identically in three cross-position fence cells
    (`tests/annotation-nontype-text-refusal.test.ts:2212` f5 `@<Cat-->`,
    `:2228` f6 `@<Ghost-->`, `:2238` f7 the `@<Ghost>` channel-liveness
    control). Those cells red the day this report is fixed, which is what
    0124's framing intends. This report also inherits 0124's two mandatory
    declines (the shared brace/literal decline and the position's own SHRED
    decline) and its own-position-rule rule (§Fix (b)).
  - [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) —
    **fixed (0.87.0)**. Closed the same class at the two schema positions (a
    `schema` body field type, a `schema X = …` alias/union arm) with
    `theta/parse/schema-type-not-expression`, through the lowering sink's
    `unspellable` out-parameter — the exact mechanism §Fix (b)(2) reuses.
    Re-measured at HEAD: `schema S { a: Ghost-- }` and `schema X = Ghost--`
    each draw that row (§Reproduction (g)).
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
    **fixed (0.86.0)**. The `params:` right-hand side, the first position to
    land this judgement and the origin of the shared sink and decline.
    Re-measured: both `params:` spellings draw
    `theta/load/params-type-not-expression` for `Ghost--`.
  - [0014](./0014-empty-typed-query-annotation-silent-unvalidated-bind.md) —
    **fixed (0.23.0)**. Owns the EMPTY interior of this same capture and its
    registered `theta/parse/empty-query-annotation`
    (`code-registry-parse.md:76`), emitted 14 lines below the capture loop
    (`theta-document.ts:4613–4622`). Its rationale is this report's argument
    verbatim — "the type grammar derives no empty `Type` … type-system.md
    applies the same grammar to the `@<T>` annotation position" — applied to
    the one interior that trims to empty. Measured live at HEAD: `@<>` and
    `@<  >` each draw that row (§Reproduction (a)), which is what makes the
    junk rows' empty diagnostic lists measurements rather than a dead channel.
    The two are disjoint by construction: the empty guard tests
    `schema.length === 0`, and every input here is non-empty.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) —
    **fixed (0.38.0)**. Owns the permissive-`{}` inventory at this position and
    the QRY-22 vacuity argument this report reuses. Its fix closed the
    *resolvable-name* holes (forward, self, mutual, `enum`) and left the
    unresolvable name refused from source, which is why
    `src/runtime/query-schema-lowering.ts:44–47` states the `{}` for a name
    resolving to no declaration is "defence in depth behind the parse gate
    rather than reachable behaviour". That sentence is true of `Ghost` and
    silent about `Ghost--`, which reaches the seam's TRAILING CATCH-ALL
    (`:58–90`) instead — an arm whose enumerated routes are a generic argument
    and a shredded union arm, not a junk-suffixed root. Its witness
    (`tests/unresolved-annotation-lowering.test.ts:582` `SILENT (v)`, `:1385`
    `RESULT-LET-BRACE`) pins legal annotations at this position silent and
    bounds any route here (§Fix (b)(9)).
  - [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
    **open**, filed in the same pass from 0124's report residual 5, and the
    coordination point on the shared split. 0204 owns the OPPOSITE direction at
    the three landed positions: `array<{a: string, b: integer, c: boolean}>` —
    text the grammar derives — is refused there because the angle-only
    generic-argument split shreds the brace group. The two reports meet at
    0124's SHRED decline: it is why this position's route §Fix (b)(1) is safe
    and why §Fix (b)(2) is not, and 0204's route (b)(1) (widen the split to
    `"angle-and-brace"`) would remove the shred the decline exists for, while
    its route (b)(2) shares that decline with three more sites. Neither blocks
    the other; whichever lands second re-derives the other's cost table rather
    than assuming it. Disjoint on the observable: 0204's class is legal input
    refused, this report's is illegal input admitted.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, and the precedent that rules out the cheap route.
    0044 established that `unresolved-named-type` must not fire for text that
    is not an `Ident` (`grammar.md:98`). `Ghost--` is not an `Ident`, so the
    remedy is NOT to make the name walk see `Ghost` inside `Ghost--`
    (§Fix (b)(4)).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Every citation into
    `src/parser/theta-document.ts` (7300+ lines) and
    `src/extension/production-theta-producer.ts` below is named by symbol
    beside its line number under that adjudication, and 0124's fix moved
    `theta-document.ts` by +54 lines below `schemaTypeNotExpressionDiagnostic`,
    which is why the numbers here are re-derived rather than copied.
- **Affected** (every citation re-verified against the tree at HEAD
  `9eb1290d`, v0.121.0, by `git show HEAD:<path>`; positions in
  `src/parser/theta-document.ts` and
  `src/extension/production-theta-producer.ts` are named by symbol beside
  their line numbers per [0134](./0134-params-shift-induced-stale-citations.md)):
  - **The capture.** `src/parser/theta-document.ts`: `parseQuery` (`:4576`),
    its `<`-guarded annotation branch (`:4583`), the parts buffer (`:4585`),
    the depth counter (`:4586`), the loop (`:4587–:4598`) whose only exits are
    depth 0 and `atEnd()`, the unconditional join
    (`parts.push(this.advance().text)`, `:4597`), and the capture's
    materialisation (`schema = parts.join("").trim()`, `:4599`). The
    empty-interior rejection bug 0014 owns is `:4613–:4622` (its code literal
    at `:4616`), and its own doc comment (`:4600–:4612`) states the grammar
    argument this report extends. The bare `@Ident` arm (`:4623–:4630`) takes
    one `ident`/`keyword` token, so it cannot carry a trailer.
  - **The discarded judgement.** `src/parser/theta-document.ts`: `walkExpr`'s
    `"query"` arm — the annotation guard (`:7005`), the `Result` peel
    (`queryResponseAnnotation(e.schema)`, `:7006`; the function at `:5344`,
    with its argument split at `:5349`), the position-rule walk
    (`parseTypeExpression(responseAnnotation, "value", …)`, `:7016–:7018`),
    the reserved-keyword sink (`:7019`), the THREE-ARGUMENT sink call
    (`:7020–:7024`), and the two emission loops (`:7025–:7027`,
    `:7028–:7030`). The builders are `unresolvedNamedTypeDiagnostic` (`:5215`)
    and `reservedKeywordAsIdentifierDiagnostic` (`:5240`); the former's doc
    comment (`:5127–:5148`) states the closed five-position list and names
    this walk as one of its four emitters.
  - **The sink that already computes the answer.**
    `src/parser/body-type-lowering.ts`: `collectUnresolvedNamedTypes`
    (`:601`), its optional fourth out-parameter (`unspellable?: string[]`,
    `:605`), the no-dedup append (`:620`), and the structural split
    (`:613–:618`) that dispatches a single enclosing brace group to
    `lowerInlineObject` (`:166`) and everything else to `lowerTypeSource`
    (`:254`). The out-parameter's contract is documented at `:590–:599`.
  - **The permissive arm.** `src/parser/params.ts`: `lowerTypeExpr` (`:665`)
    and its trailing catch-all (`lowerCtx.unspellable?.push(s); return {};`,
    `:786–:787`), whose comment (`:778–:785`) enumerates the sink's readers as
    `parseParams` plus the two `theta-document.ts` schema-position emitters —
    an enumeration that names neither 0124's recogniser nor this position.
    The ONE shared decline is `isUnspellableTextRefusable` (`:1274`), whose
    comment (`:1267–:1272`) likewise says "none of the three keeps a private
    copy" and is one consumer short since 0.121.0 (0124's report residual 3).
    `splitTopLevel` (`:1561`) is the angle-depth split whose shred behaviour
    forces the decline §Fix (b)(2) states.
  - **0124's landed recogniser, which answers `true` for this text today.**
    `src/parser/type-layer-checks.ts`: `annotationSourceIsNotTypeExpression`
    (`:952`), its empty decline (`:954–:956`), its bracket decline (`:957–:959`),
    its brace-AND-angle SHRED decline (`:960–:963`), the sink call against the
    empty declared set (`:966`, with `NO_DECLARED_TYPE_NAMES` at `:897`) and
    the filter through the shared decline (`:967`).
    `annotationToCompatType` (`:864`) is the converter it sits beside.
  - **The lowering.** `src/runtime/query-schema-lowering.ts`:
    `lowerQueryResponseSchema` (`:123`), the empty-annotation `undefined`
    contract (`:130–:131`), the `IDENTIFIER` test that a junk-suffixed name
    fails (`:111`, `:136`), the brace-group arm (`:161`) and the
    `lowerTypeSource` fall-through (`:170`) that a junk root takes to
    `lowerTypeExpr`'s catch-all. The module header's `{}`-origin inventory is
    `:26–:90`: the unresolved-name arm's defence-in-depth sentence at `:44–:47`
    and the trailing catch-all's enumerated routes at `:58–:90`.
  - **The consumer.** `src/extension/production-theta-producer.ts`:
    `#resolvePromptQuery` (`:2512`), the single lowering (`:2534–:2541`, the
    call at `:2536`) whose comment (`:2531–:2533`) states it "feeds the
    validation collaborator, the respond-tool registration, and the QRY-15
    template", and the respond-context gate (`:2550–:2551`) that treats
    `lowered !== undefined` as typed — so a `{}` lowering takes the full
    structured-respond path with an accept-anything validator, where the empty
    annotation (`undefined`) takes 0014's degraded arm instead.
  - **The validator.** `src/seams/schema-validator.ts`: `AjvSchemaValidator`
    (`:104`), `compile` (`:116`) and `CompiledValidator.validate` (`:30`) — the
    production seam §Reproduction (f) drives directly.
  - **The pins.** `tests/annotation-nontype-text-refusal.test.ts:2212` (f5,
    `@<Cat-->` silent), `:2228` (f6, `@<Ghost-->` silent), `:2238` (f7,
    `@<Ghost>` fires) — the only committed cells that assert this position's
    junk disposition, all three green at HEAD (whole file 251/251).
    `tests/unresolved-annotation-lowering.test.ts` cells `SILENT (v)` (`:582`)
    and `RESULT-LET-BRACE` (`:1385`) pin legal annotations at this position
    silent. `tests/empty-query-annotation.test.ts` owns the empty interior.
    No committed cell asserts a junk-suffixed annotation's LOWERING.
  - **The spec sentences.** `docs/spec_topics/type-system.md:15` (the
    one-grammar sentence, its five-position list, and its four-row refusal
    enumeration); `docs/spec_topics/grammar.md:86` (the §Type grammar heading)
    and `:89–:102` (the production block, `NamedType ::= Ident` at `:98`),
    `:105` (the bare-`Type` position
    list including type ascriptions, "The grammar is otherwise identical in
    every position", and the same five-position refusal enumeration);
    `docs/spec_topics/query/query-forms.md:27` (QRY-3, the ascription always
    supplies the response schema), `:57` (QRY-4);
    `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22, "The
    runtime MUST NOT bind, as a typed query's value, a response that has not
    been validated against its declared schema");
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15) and
    `:9` (the loads-cleanly predicate). Registry rows:
    `docs/spec_topics/diagnostics/code-registry-parse.md:95`
    (`unresolved-named-type`, the closed five-position Trigger naming `@<T>`),
    `:92` (`annotation-type-not-expression`, three positions, this capture not
    claimed), `:91` (`schema-type-not-expression`), `:76`
    (`empty-query-annotation`), `:21` (`reserved-keyword-as-identifier`),
    `:56` (`let-rhs-type-mismatch`), `:75` (`explicit-schema-mismatch`), and
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`params-type-not-expression`). Reference mirrors:
    `docs/reference/grammar.md`, `docs/reference/type-system.md`,
    `docs/reference/diagnostics.md`.
  - **The corpus.** `git ls-files '*.theta' '*.thetalib'` lists **34** files.
    **2** write an `@<…>` annotation at all: `@<Triage>`
    (`docs/examples/handle-error.theta`) and `@<integer>`
    (`docs/examples/personas.thetalib`). Both are well-formed, so no committed
    fixture changes disposition when a fix lands and
    `tests/committed-fixture-parse-gate.test.ts` never meets one of these
    inputs. The class is reachable from clean author source and unreached by
    the corpus.
- **Observed at:** v0.121.0 (`9eb1290d`, `package.json:3`), the fix commit for
  bug 0124. Offline, deterministic, provider-free, zero model turns: five
  scratch vitest probes (written, run, deleted; `git status --porcelain` and a
  case-insensitive `scratch` sweep verified afterwards) driving the REAL
  `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s `parseDoc`, plus the
  shipped seams directly — `collectUnresolvedNamedTypes`,
  `isUnspellableTextRefusable`, `annotationSourceIsNotTypeExpression`,
  `lowerQueryResponseSchema`, and a real `AjvSchemaValidator`. The working tree
  carried one uncommitted sibling edit to `src/parser/theta-document.ts` (a
  `theta/parse/type-as-value` emission in `walkExpr`'s `ident` arm and one
  extra argument at its member-access arm, both below `:6861`, +12 lines net).
  No fixture below writes a schema or enum name in value position, no measured
  diagnostic list contains that code, and 0124's f5/f6/f7 cells — which pin
  this report's core pair at HEAD — are green in the same tree (251/251), so
  the measurements are HEAD's. Every line number above is read from
  `git show HEAD:<path>`, not from the working tree.

## Summary

`type-system.md:15` names five type-annotation positions and says text
deriving from none of the grammar's forms "is refused at load or parse time
rather than admitted as a nominal reference". Four of those five refuse it at
HEAD. The fifth — the `@<T>` query annotation — admits it, and admitting it
costs a registered code at a position that code's own Trigger names.

`parseQuery`'s annotation capture is not `parseType`. It is a local loop that
counts `<` / `>` depth and takes every other token whole, with no stop set, so
26 of the 29 trailers bug 0124 measured join the captured schema text and the
file loads with an empty diagnostic list. The five structural trailers that
END `parseType`'s capture — `,`, `)`, `}`, `{`, `=` — join here too.

The captured text then decides whether the position's own name walk runs:

```
let r = @<Ghost>`hi`      →  error theta/parse/unresolved-named-type: unresolved named type 'Ghost'
let r = @<Ghost-->`hi`    →  []
```

`Ghost--` is not an `Ident`, so `lowerTypeExpr`'s trailing catch-all takes it,
the `unresolved` sink stays empty, and the walk at `theta-document.ts:7020`
reports nothing. Three further registered rows go the same way — the
reserved-keyword row (`@<match>` fires, `@<match-->` does not), the
`let`-RHS mismatch and the QRY-4 explicit-schema warning
(``let a: string = @<Cat>`x` `` draws both, `@<Cat-->` draws neither) — and the
suppression reaches one level down into a generic argument, a union arm and an
inline-object field alike.

The answer is already computed at the site that discards it.
`collectUnresolvedNamedTypes` has a fourth out-parameter for exactly this
text; the `@<T>` call site passes three arguments. Measured, that sink fills
`["Ghost--"]`, and 0124's landed recogniser
`annotationSourceIsNotTypeExpression("Ghost--")` answers `true` today.

Downstream, every junk-suffixed capture lowers to the permissive `{}` —
`array<Cat-->` to `{"type":"array","items":{}}`, `Cat-- | integer` to
`{"anyOf":[{},{"type":"integer"}]}` — and the producer treats a `{}` as typed,
so the query takes the full structured-respond path with a validator that
accepts everything. Driven through the production `AjvSchemaValidator`,
`@<Cat>`'s lowering accepts 1 of 6 probe payloads and `@<Cat-->`'s accepts 6
of 6. QRY-22 is satisfied vacuously at a position where the empty annotation
`@<>` is refused outright.

## Reproduction

Every fixture is `mode: prompt` frontmatter plus the body shown (except where
a mode or extension is named), parsed through `parseThetaDocument` via
`tests/helpers/e2e-s1.ts`. `DECLS` is `schema Cat { a: string }`. `diags` is
the whole diagnostic list unfiltered, rendered `severity code: message`.
`schema` is the `QueryExpr.schema` text read off the AST. Zero model turns.

Every fixture whose `diags` is `[]` emits no diagnostic of effective severity
`error`, so it is inside GOV-15's loads-cleanly input set
(`source-language-stability.md:9`).

### (a) The suppression pair, and the empty-interior control

```
let r = @<Ghost>`hi`        schema "Ghost"    [error theta/parse/unresolved-named-type: unresolved named type 'Ghost']
let r = @<Ghost-->`hi`      schema "Ghost--"  []
DECLS + let r = @<Cat>`hi`  schema "Cat"      []
DECLS + let r = @<Cat-->`hi` schema "Cat--"   []
let r = @<>`hi`             schema ""         [error theta/parse/empty-query-annotation: `@<>` query annotation is
                                               empty; write `@<Schema>` or drop the annotation for an untyped query]
let r = @<  >`hi`           schema ""         [same]
```

Row 2 is the defect. Rows 1 and 5 are the channel-liveness proofs: the
position emits `unresolved-named-type` for a resolvable-shaped name that
resolves to nothing, and 0014's row for an empty interior, so row 2's `[]` is
a measurement and not a dead channel. Rows 3 and 4 are the declared-`Cat`
pair: both silent at parse, and they diverge at the lowering instead
(§Reproduction (f)).

### (b) The trailer sweep — 29 trailers × 3 names, at `@<`*name*+*trailer*`>`

Names: `Ghost` (declared nowhere), `Cat` (declared), `integer` (a primitive).
The trailer set is bug 0124's group (a) plus its structural stop set.

**Joined into the capture, and the file loads with zero diagnostics at all
three names — 26 trailers:**

```
--  ++  -  +  %  *  /  .  ==  &&  ||  ?  !  :  |  ~  ^  @  #  $  "x"      (21)
,   )   }  {  =                                                          ( 5)
```

Captured text is the concatenation verbatim: `@<Ghost-->` → `"Ghost--"`,
`@<Ghost}>` → `"Ghost}"`, `@<Ghost"x">` → `"Ghost\"x\""`, `@<Ghost=>` →
`"Ghost="`. The second row is what separates this capture from the one 0124
closed: at the positions `parseType` serves, those five END the capture and the
fault surfaces one layer out instead (0124 §Reproduction (a)'s structural stop
set); here they join and the statement parses.

**Joined, and the row still fires — 1 trailer:**

```
1     @<Ghost1>  → [unresolved-named-type 'Ghost1']    @<Cat1> → 'Cat1'    @<integer1> → 'integer1'
```

`Ghost1` IS an `Ident`, so it is a `NamedType` and the walk runs on it. That
is the discriminator: the suppression is keyed to `Ident`-shape, not to the
presence of a trailer.

**Never joined — 2 trailers, both lexer-level:**

```
;   @<Ghost;>  → [unresolved-named-type 'Ghost', unsupported-feature: ';' (semicolons are not part of the grammar)]
\   @<Ghost\>  → [unresolved-named-type 'Ghost', stray-backslash: stray backslash in source]
```

The token never reaches the capture (`schema` is `"Ghost"`), so the name walk
runs and the row fires beside a lexer rejection that would fire anywhere in
the file. Neither is a judgement on the annotation.

### (c) Spelling variants, nesting, and the routes into `QueryExpr.schema`

```
let r = @<--Ghost>`hi`             schema "--Ghost"        []
let r = @<Gho--st>`hi`             schema "Gho--st"        []
let r = @<Ghost--%%>`hi`           schema "Ghost--%%"      []
let r = @<Ghost -->`hi`            schema "Ghost--"        []   (interior space dropped)
let r = @<-->`hi`                  schema "--"             []
let r = @<thisisnotatype>`hi`      schema "thisisnotatype" [unresolved-named-type 'thisisnotatype']
let r = @<array<Ghost>>`hi`        schema "array<Ghost>"   [unresolved-named-type 'Ghost']
let r = @<array<Ghost-->>`hi`      schema "array<Ghost-->" []
let r = @<Ghost | string>`hi`      schema "Ghost|string"   [unresolved-named-type 'Ghost']
let r = @<Ghost-- | string>`hi`    schema "Ghost--|string" []
let r = @<{a: Ghost}>`hi`          schema "{a:Ghost}"      [unresolved-named-type 'Ghost']
let r = @<{a: Ghost--}>`hi`        schema "{a:Ghost--}"    []
let r = @Ghost`hi`                 schema "Ghost"          [unresolved-named-type 'Ghost']
```

Leading, interior, doubled, spaced and bare spellings are all silent. The
prose spelling `thisisnotatype` is an `Ident` and fires — 0124 recorded the
same exclusion at its three positions. Three pairs put the
suppression one level down: inside a `GenericType` argument, a union arm, and a
single-enclosing inline `ObjectType` field, the clean name fires and the
junk-suffixed one does not. The bare `@Ident` form takes one token and cannot
carry a trailer.

Every route that writes `QueryExpr.schema` reaches the same walk, and only the
`@<T>`-written route is unguarded:

```
let r: Ghost = @`hi`               schema "Ghost"                  [unresolved-named-type 'Ghost']
let r: Ghost-- = @`hi`             schema "Ghost--"                [annotation-type-not-expression: 'r' declares a
                                                                    type that is not a theta type expression]
let r: Result<Ghost, QueryError> = @`hi`   schema "Result<Ghost,QueryError>"  [unresolved-named-type 'Ghost']
let r = @<Ghost-->`hi`             schema "Ghost--"                []
```

Rows 2 and 4 write the same junk text at two positions of the same statement
shape. At the `let` annotation it is refused by 0124's landed row; at the
`@<T>` annotation it is silent, and the propagated route's own refusal comes
from the `let` position, not from this walk.

The pair is invariant across spellings and enclosing forms — top-level
`.theta`, inside an ordinary `fn` body, `.thetalib`, `mode: subagent`, and a
`match` scrutinee (QRY-4's required-ascription position):

```
.thetalib    fn g(): string { let r = @<Ghost-->`hi`  "s" }        []
             (CTL @<Ghost>)                                        [unresolved-named-type 'Ghost']
mode: subagent  let r = @<Ghost-->`hi`                             []
             (CTL @<Ghost>)                                        [unresolved-named-type 'Ghost']
match        let s = match @<Ghost-->`hi` { Ok(v) => "a", Err(e) => "b" }   []
             (CTL @<Ghost>)                                        [unresolved-named-type 'Ghost']
query stmt   @<Ghost-->`hi`                                        [discarded-query-result]
             (CTL @<Ghost>)                                        [discarded-query-result, unresolved-named-type 'Ghost']
```

### (d) The loss inventory — four registered rows, each with its control

```
row                                            clean spelling                         junk spelling
theta/parse/unresolved-named-type (E)          @<Ghost>            fires 'Ghost'      @<Ghost-->            []
theta/parse/reserved-keyword-as-identifier (E) @<match>            fires 'match'      @<match-->            []
theta/parse/let-rhs-type-mismatch (E)          let a: string = @<Cat>`x`   fires      let a: string = @<Cat-->`x`   []
theta/parse/explicit-schema-mismatch (W)       let a: string = @<Cat>`x`   fires      let a: string = @<Cat-->`x`   []
                                               let a: integer = @<string>`x` fires    let a: integer = @<string-->`x` []
```

Verbatim, the pair that loses two rows at once:

```
DECLS + let a: string = @<Cat>`x`      [error theta/parse/let-rhs-type-mismatch: let binding 'a' initialiser type
                                        mismatch: expected string, got Cat,
                                        warning theta/parse/explicit-schema-mismatch: explicit @<Schema> ascription
                                        is not compatible with binding annotation]
DECLS + let a: string = @<Cat-->`x`    []
DECLS + let a: string = @<Ghost>`x`    [error theta/parse/unresolved-named-type: unresolved named type 'Ghost']
DECLS + let a: string = @<Ghost-->`x`  []
```

The `@<Ghost>` / `@<Ghost-->` rows bound the claim honestly: an UNRESOLVABLE
name already loses the mismatch pair (the comparison treats an unresolvable
name as inconclusive and skips), so the inventory's third and fourth rows are
the junk's loss only against a RESOLVABLE control. Against `@<Cat>` the junk
loses two rows the unresolvable spelling never had, plus the row the
unresolvable spelling did have.

### (e) What does NOT move — the annotation's own position rules still run

`parseTypeExpression(responseAnnotation, "value", …)` at `:7016` is unaffected
by the trailer, so every rule that reads the annotation's SHAPE rather than
resolving a name keeps firing:

```
@<void>                     [void-in-non-return-position]        @<void-->                     [same]
@<array<string, integer>>   [generic-arity-mismatch: 'array' expects 1; got 2]
@<array<string, integer>-->                                      [same]
@<{}>                       [empty-schema-body]                  @<{}-->                       [same]
@<{a: string, a: integer}>  [duplicate-inline-field-name 'a']    @<{a: string, a: integer}-->   [same]
```

So the defect is confined to the NAME-resolution half of the walk and to the
type-compatibility consumers of the captured text. This also pins a
constraint on any route: four codes already fire for junk-carrying annotations,
and 0124's row states that an annotation whose own position-rule walk already
drew an error-severity diagnostic keeps that diagnostic alone
(`code-registry-parse.md:92`).

### (f) The lowering, and what AJV then accepts

`lowerQueryResponseSchema(annotation, [schema Cat { a: string }], [])`,
verbatim:

```
"Cat"              {"type":"object","properties":{"a":{"type":"string"}},"required":["a"],"additionalProperties":false}
"Cat--"            {}
"Ghost"            {}
"Ghost--"          {}
"integer"          {"type":"integer"}
"integer--"        {}
"array<Cat>"       {"type":"array","items":{"$ref":"#/$defs/Cat"},"$defs":{"Cat":{…}}}
"array<Cat-->"     {"type":"array","items":{}}
"Cat | integer"    {"anyOf":[{"$ref":"#/$defs/Cat"},{"type":"integer"}],"$defs":{"Cat":{…}}}
"Cat-- | integer"  {"anyOf":[{},{"type":"integer"}]}
"{a: string}"      {"type":"object","properties":{"a":{"type":"string"}},"required":["a"],"additionalProperties":false}
"{a: string--}"    {"type":"object","properties":{"a":{}},"required":["a"],"additionalProperties":false}
"--"               {}
"thisisnotatype"   {}
""                 undefined
```

`""` is the sole `undefined` — 0014's degraded arm, and the reason the producer
distinguishes an empty annotation from a junk one: `lowered !== undefined`
(`production-theta-producer.ts:2550–:2551`) makes `Ghost--` typed and builds
the respond-turn context, with the `{}` document feeding "the validation
collaborator, the respond-tool registration, and the QRY-15 template"
(`:2531–:2533`).

Compiled through the production `AjvSchemaValidator` and run over six probe
payloads:

```
lowered document                     {a:"ok"}  {a:42}  "nonsense"  [1,2,3]  null  {unrelated:true}
"Cat"     → typed object             ACCEPT    reject  reject      reject   reject  reject
"Cat--"   → {}                       ACCEPT    ACCEPT  ACCEPT      ACCEPT   ACCEPT  ACCEPT
"Ghost--" → {}                       ACCEPT    ACCEPT  ACCEPT      ACCEPT   ACCEPT  ACCEPT
"--"      → {}                       ACCEPT    ACCEPT  ACCEPT      ACCEPT   ACCEPT  ACCEPT
```

One trailing `-` on a correctly-spelled, declared schema name turns the QRY-22
gate from 1-of-6 to 6-of-6. `Ghost`'s `{}` is the same document, but no theta
can reach it: `@<Ghost>` does not load. `Ghost--`'s does.

### (g) The other four positions of the same Trigger, re-measured at HEAD

`code-registry-parse.md:95` names five positions. With `Ghost--` at each:

```
position                                    fixture                              diags
params: scalar        (0059)  params: / p: Ghost--                 [error theta/load/params-type-not-expression]
params: block         (0059)  params: / p: / type: Ghost--         [error theta/load/params-type-not-expression]
schema body field     (0061)  schema S { a: Ghost-- }              [error theta/parse/schema-type-not-expression]
schema X = alias arm  (0061)  schema X = Ghost--                   [error theta/parse/schema-type-not-expression]
object-constructor name       let x = Ghost-- { a: 1 }             [error unknown-identifier 'Ghost',
                                                                    error increment-decrement, error bare-object-literal]
@<T> query annotation         let r = @<Ghost-->`hi`               []
CONTROLS (clean name, same positions)
params: scalar                params: / p: Ghost                   [error theta/parse/unresolved-named-type 'Ghost']
schema body field             schema S { a: Ghost }                [error theta/parse/unresolved-named-type 'Ghost']
schema X = alias arm          schema X = Ghost                     [error theta/parse/unresolved-named-type 'Ghost']
object-constructor name       let x = Ghost { a: 1 }               [error theta/parse/unresolved-named-type 'Ghost']
```

Four of the five refuse the junk or cannot represent it — the constructor
position takes a single `Ident` token, so `Ghost--` is not an annotation there
at all but three unrelated expression-level faults. The `@<T>` position is the
only one that admits it. The three positions bug 0124 closed agree:

```
let x: Ghost-- = 1                      [error theta/parse/annotation-type-not-expression: 'x' …]
fn f(n: Ghost--): integer { 1 }         [error theta/parse/annotation-type-not-expression: 'n' …]
fn f(): Ghost-- { 1 }                   [error theta/parse/annotation-type-not-expression: 'f' …]
```

`invoke<T>` remains silent in both directions (`invoke<Ghost>` and
`invoke<Ghost-->` each `[]`), because that capture runs no name walk and is
outside the row's five positions — the same non-differential 0124 measured.

### (h) The judgement is already computed at the discarding call site

`collectUnresolvedNamedTypes(text, declared, reservedKeywords, unspellable)`
with the fourth argument supplied, beside 0124's recogniser over the same text:

```
text                                        declared  unresolved      unspellable                            refusable  recogniser
"Ghost--"                                   {}        []              ["Ghost--"]                            [true]     true
"Cat--"                                     {Cat}     []              ["Cat--"]                              [true]     true
"Ghost"                                     {}        ["Ghost"]       []                                     []         false
"Cat"                                       {Cat}     []              []                                     []         false
"match--"                                   {}        []              ["match--"]                            [true]     true
"--"                                        {}        []              ["--"]                                 [true]     true
"thisisnotatype"                            {}        ["thisisnotatype"] []                                  []         false
"array<Ghost-->"                            {}        []              ["Ghost--"]                            [true]     true
"Ghost--|string"                            {}        []              ["Ghost--"]                            [true]     true
"{a:Ghost--}"                               {}        []              ["Ghost--"]                            [true]     true
"array<{a: string, b: integer, c: boolean}>" {}       []              ["{a: string","b: integer","c: boolean}"] [f,t,f]  false
"{a: string, b: integer, c: boolean}"       {}        []              []                                     []         false
"array<Cat>"                                {Cat}     []              []                                     []         false
"Cat|integer"                               {Cat}     []              []                                     []         false
"Result<Cat,QueryError>"                    {Cat}     ["QueryError"]  []                                     []         false
"Ghost1"                                    {}        ["Ghost1"]      []                                     []         false
```

The eleventh row is why a naive route is wrong and 0124's recogniser is not:
the sink shreds a legal three-field brace group inside a generic argument and
the middle shard is refusable on its own, while the recogniser's SHRED decline
(brace AND angle ⇒ admit) answers `false` for the whole text. The last row is
why a route must run at or after the `Result` peel — the raw text names
`QueryError`, the builtin the peel exists to protect.

0124's recogniser over every capture the trailer sweep produces:

```
refused  (24): Ghost-- Ghost++ Ghost- Ghost+ Ghost% Ghost* Ghost/ Ghost. Ghost== Ghost&& Ghost||
               Ghost? Ghost! Ghost: Ghost| Ghost~ Ghost^ Ghost@ Ghost# Ghost$ Ghost"x" Ghost, Ghost) Ghost=
admitted ( 3): Ghost1  (an Ident — already fires today)
               Ghost}  Ghost{  (the shared brace decline)
also refused:  --  --Ghost  Gho--st  Ghost--%%  array<Ghost-->  Ghost--|string  {a:Ghost--}
               match--  void--  array<string,integer>--  "Ghost\nr" (the over-run capture)
admitted:      {}--
```

So §Fix (b)(1) closes 24 of the 26 silent trailers with no new judgement
written anywhere, and leaves `Ghost{` / `Ghost}` silent under the same shared
decline every sibling position carries.

### (i) The capture's extent, recorded and not owned

Five rows bounding the loop's extent. They are the capture's mechanics, not
the judgement over what it captured, and §Non-goals declines them:

```
let r = @<Ghost                    schema "Ghost\nr"      template ""   []
let r = @<Ghost--`hi`              schema "Ghost--``\nr"  template ""   []
let r = @<Ghost<>`hi`              schema "Ghost<>``\nr"  template ""   []
let r = @<Ghost>>`hi`              schema "Ghost"         template ""   [unresolved-named-type 'Ghost',
                                                                         unsupported-feature: backtick template in
                                                                         value position]
let r = @<Ghost<Cat>>`hi`          schema "Ghost<Cat>"    template "hi" []
```

Row 1 is the unterminated capture 0014's row covers only when it trims to
empty: with a name present it swallows the rest of the file and stays silent.
Row 5 shows the depth counter admitting an unbounded generic application whose
head resolves nowhere, silently.

## Expected behaviour

- **The grammar closes the admitted set, and closes it identically at this
  position.** `grammar.md:90–:95` gives `Type` as `PrimitiveType` |
  `NamedType` | `GenericType` | `ObjectType` | a union | `LiteralType`;
  `:105` lists type-ascription contexts among the bare-`Type` positions and
  states "The grammar is otherwise identical in every position";
  `type-system.md:15` names `@<T>`…`` explicitly in its five-position list.
  `Ghost--`, `--`, `Gho--st`, `Ghost--%%` and `Ghost"x"` are derivable from
  none of the six alternatives, at any position.
- **`NamedType` is an `Ident`.** `grammar.md:98` is `NamedType ::= Ident`.
  `Ghost--` is not an `Ident`. Bug 0044's fix settled the consequence for the
  opposite direction — text that is not an `Ident` must not draw
  `unresolved-named-type` — so the remedy here is not to resolve `Ghost`
  inside `Ghost--`. Both dispositions follow from the same sentence: the text
  is not a name, and it is also not a type.
- **A registered code's Trigger positions are where it fires.**
  `code-registry-parse.md:95` names the `@<T>` query annotation as one of five
  positions for `theta/parse/unresolved-named-type`, and
  `theta-document.ts:5127–:5148` restates that list and names this walk as one
  of its four emitters. At HEAD the row fires at that position for `Ghost` and
  not for `Ghost--`, so the position's coverage depends on a trailing
  character the grammar does not admit. Whatever a fix does about refusing the
  junk, a registered row that names a position must not be removable from it
  by text the grammar refuses.
- **Text that derives from no `Type` is refused, not admitted as a nominal
  reference.** `type-system.md:15` says so in terms and enumerates the rows
  that do it at four positions; `grammar.md:105` does the same for five.
  Neither names this position. That absence is a registry/spec gap this report
  pins and does not answer (§Fix (c)).
- **QRY-22 is not satisfied by a validator that accepts everything.**
  `query-failure-and-repair.md:78`: the runtime MUST resolve the annotation to
  its declared shape, lower it, convey it, and "MUST NOT bind, as a typed
  query's value, a response that has not been validated against its declared
  schema". `Ghost--` and `Cat--` have no declared shape; the lowering is `{}`
  and the gate accepts 6 of 6 probe payloads. Bug 0028 settled that this is
  the defect and not the design at this same position, and the lowering seam's
  own header (`query-schema-lowering.ts:44–:47`) states the remaining
  unresolvable-name `{}` is reachable only by a caller that bypasses the parse
  gate. A theta that loads with an empty diagnostic list is not such a caller.
- **The empty interior and the junk interior are the same argument.** 0014's
  row exists because "the type grammar derives no empty `Type`"
  (`code-registry-parse.md:76`, `theta-document.ts:4600–:4612`). `""` and
  `"Ghost--"` are both texts the `Type` production does not derive, captured
  by the same loop 14 lines apart. One is refused; the other is lowered to the
  same accept-anything `{}` the refusal exists to prevent.

## Actual behaviour / root cause

### 1. The capture has no stop set

`parseQuery` (`theta-document.ts:4576`) enters its annotation branch on a `<`
(`:4583`) and loops until depth 0 or `atEnd()` (`:4587`). Every token that is
not the depth-closing `>` is appended whole (`:4597`) and the result is joined
and trimmed (`:4599`). Nothing in the loop consults the token's kind, so a
punctuation token, a string literal, a number, a `}` or an `=` is annotation
text by construction. `parseType`, which serves the `let` annotation, the `fn`
parameter and return types and the two schema positions, has a stop set; this
loop has none. That is why the five trailers 0124 measured as that stop set
join here silently (§Reproduction (b)).

### 2. The junk text routes around the name walk

`walkExpr`'s `"query"` arm guards on a non-empty annotation (`:7005`), peels a
`Result` application (`:7006`), runs the position rules (`:7016`) and then
asks the shared sink for unresolved names (`:7020`). The sink resolves through
`lowerTypeSource` → `lowerTypeExpr`, whose arms match a union, a generic
application, a primitive, a literal and a resolvable name in turn; `Ghost--`
matches none, so the trailing catch-all takes it (`params.ts:786–:787`),
pushes the text into `unspellable` and returns `{}`. `unresolved` is never
appended, so `:7028`'s loop has nothing to emit. The suppression is therefore
structural, not conditional: any text the catch-all reaches is invisible to
this position's only name-resolution channel.

### 3. The fourth out-parameter is not passed

The sink's signature has carried `unspellable?: string[]` since bug 0061
(`body-type-lowering.ts:605`), and 0124 added an exported recogniser over it
(`type-layer-checks.ts:952`) that already answers `true` for every text this
position admits except `Ghost1`, `Ghost{`, `Ghost}` and `{}--`
(§Reproduction (h)) — and the last three are its shared brace decline's, which
every sibling position carries too.
The `@<T>` call site passes three arguments (`:7020–:7024`). The information
needed to refuse is computed and dropped at the same expression.

### 4. The two doc-comment enumerations that would have caught it are stale

`params.ts:778–:785` lists the `unspellable` sink's readers as `parseParams`
plus the two `theta-document.ts` schema-position emitters;
`params.ts:1267–:1272` says the shared decline has three consumers and "none
of the three keeps a private copy". Since 0.121.0 there are four consumers
(0124's report records this as its residual 3). Neither enumeration mentions
the `@<T>` position, and neither is wrong about what it names — they are
incomplete, which is why a reader tracing the sink's coverage does not
discover that one of the five Trigger positions never asks it.

### 5. The consequence divides at `undefined`, not at well-formedness

`lowerQueryResponseSchema` returns `undefined` for exactly one input, the
empty string (`query-schema-lowering.ts:130–:131`), and the producer treats
`undefined` as untyped and everything else as typed
(`production-theta-producer.ts:2550–:2551`). A junk annotation therefore does
not fall back to 0014's degraded arm: it takes the full structured-respond
path, and the `{}` it lowers to becomes the respond tool's parameters, the
QRY-15 template's shape and the validator's document at once (`:2531–:2533`).
Measured, that validator accepts every payload offered (§Reproduction (f)).

### 6. Nothing witnesses it

The only committed cells over this input class assert the current silence:
0124's f5 and f6 (`tests/annotation-nontype-text-refusal.test.ts:2212`,
`:2228`), written as cross-position fence cells to keep 0124's fix from
silently taking this position over, with f6's own message naming the defect —
"the trailing junk SUPPRESSES `unresolved-named-type` at one of that row's OWN
five positions". No cell asserts a junk-suffixed annotation's lowering, and
the two committed fixtures that write `@<…>` at all are well-formed.

## Why it matters

An author who mistypes one character after a correctly-spelled schema name
loses the check that exists to catch the mistype, and gains a query whose
response is bound after a validation gate that accepts anything. Both halves
are silent: the file loads with an empty diagnostic list, the query is marked
typed, and the respond-tool path runs normally.

The outcome is not an untyped query. An untyped query returns
`Result<string, QueryError>` and the author sees a string. A junk-annotated
query is typed, so the binder, the respond tool and the QRY-15 template all
present a schema to the model — the `{}` one — and whatever comes back is
bound as the declared type. Bug 0028 filed this exact shape at this exact
position and its fix closed the resolvable-name half; the junk-suffixed half
survived because it reaches a different lowering arm.

The position is the last one in its class. Bug 0059 closed `params:`, bug 0061
closed the two schema positions, bug 0124 closed the three annotation
positions, and each closure was argued from the same two sentences
(`type-system.md:15`, `grammar.md:105`) that name this position too. Leaving it
open leaves those sentences false at one of the five positions they enumerate,
and leaves a registered row removable at one of the five positions its own
Trigger names.

## Non-goals

- **The three positions bug 0124 closed.** A `let` annotation, an `fn`
  parameter type and an `fn` return type are refused at HEAD by
  `theta/parse/annotation-type-not-expression`
  ([0124](./0124-parsetype-trailing-punctuation-leniency.md), fixed 0.121.0);
  §Reproduction (g) measures them as controls and claims nothing about their
  disposition. A route here calls that fix's recogniser; it does not reopen
  its judgement, its row, or its Trigger's three-position scope.
- **The two schema positions and the `params:` position.** Refused at HEAD by
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) (fixed
  0.87.0) and
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) (fixed
  0.86.0). Measured here as controls only. The shared sink and the ONE shared
  decline are the coordination surface (§Fix (b)(1)–(2)), and narrowing that
  decline is out of scope in either direction.
- **The pre-existing FALSE refusal at those landed positions.** 0124's report
  residual 5 records that `array<{a: string, b: integer, c: boolean}>` — a
  legal annotation — draws a refusal at a `schema` field, an alias arm and a
  `params:` field because the angle-only split shreds a ≥3-field brace group.
  §Reproduction (h) row 11 measures the same shred through the sink and
  measures 0124's SHRED decline answering `false` for the whole text. That
  false refusal is now bug
  [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md)'s
  (open, filed in the same pass); this report inherits the decline that avoids
  it and repairs neither the split nor the positions that lack the decline.
- **The capture's extent.** The unterminated capture running to EOF, the
  unfloored depth counter, and the `<` / `>` over-run rows of §Reproduction
  (i) are the loop's extent mechanics, not the judgement over what it
  captured. 0124 §Non-goals records the analogue at `parseType` as unfiled and
  out of frame; the same holds here. A route must state what it does with a
  capture that swallowed the template (§Fix (b)(7)) without owning the
  mechanism.
- **The empty interior.** `@<>`, `@<  >` and an unterminated `@<` that trims to
  empty are bug
  [0014](./0014-empty-typed-query-annotation-silent-unvalidated-bind.md)'s,
  refused at HEAD and measured here only as the channel-liveness control. The
  guard tests `schema.length === 0`; every input here is non-empty, so the two
  do not interact.
- **`invoke<T>`.** Its capture is a separate loop
  (`theta-document.ts:4413`, the same shape) and its position is outside
  `unresolved-named-type`'s five, so there is no differential to observe:
  `invoke<Ghost>` and `invoke<Ghost-->` are both silent. 0124 pinned five
  `invoke<…>` cells for exactly this reason. Whether that position owes a
  refusal is a separate question this report does not open.
- **Whether `{}` should ever be a lowering.** Bug
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory question, fixed at 0.38.0 for its own inputs and not reopened.
  This report claims only that a junk-suffixed annotation reaches the
  permissive arm from a theta that loads clean, which the seam's header does
  not enumerate.
- **The QRY-4 explicit-schema check's conversion path.** §Reproduction (d)
  measures `let-rhs-type-mismatch` and `explicit-schema-mismatch` moving with
  the junk, but that check (`src/parser/query-schema-resolve.ts`) is owned by
  open bugs **0093** (the double-emission topology at that site) and **0130**
  (the conversion it shares), and 0124's row already records its own
  interaction with it as a labelled exception. This report measures the two
  rows as consequences and does not propose to change that check.
- **Case at a reference position.** Whether a lowercase `NamedType` owes a
  case diagnostic is bug
  [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s. Every
  input here fails to be an `Ident` at all.

## Fix

**Not settled.** Constraint-pinned: the judgement is decided — text the `Type`
production does not derive is not an ascription — and the emission point, the
registry disposition and the GOV-15 direction are not.

### (a) What is not in question

The text class is the one bugs 0059, 0061 and 0124 already settled at four
positions, judged by the one sink and the one decline they share
(`collectUnresolvedNamedTypes`'s `unspellable`, filtered through
`isUnspellableTextRefusable`). No route re-derives the type-grammar judgement
or writes a second copy of it. `unresolved-named-type`'s five-position Trigger
does not move: the `@<T>` position is already in it, and removing the
suppression restores that row at a position it already claims — which is why
the suppression-removal half may need **no registry edit at all**, while a
junk-REFUSAL half needs the decision in (c).

### (b) Routes

1. **Call 0124's landed recogniser from the `@<T>` walk.** Ask
   `annotationSourceIsNotTypeExpression(responseAnnotation)` beside the
   existing sink call (`theta-document.ts:7020`) and emit a refusal at the
   query expression's range. Smallest diff of the three, and already measured:
   the recogniser answers `true` for 24 of the 26 silent trailers and for
   every leading/interior/doubled/bare spelling, carries the shared decline
   and the SHRED decline already, and needs no change to
   `type-layer-checks.ts`. Costs: it
   is a FOURTH consumer of a function whose own doc comment describes it as
   serving three positions (§Actual 4), so the comment and 0124's
   `isUnspellableTextRefusable` enumeration are same-commit corrections; and
   it needs the registry answer in (c) before it can emit anything.
2. **Pass the fourth out-parameter at the existing call site.** Thread
   `unspellable` into `collectUnresolvedNamedTypes` at `:7020–:7024` and
   filter it through `isUnspellableTextRefusable`, exactly as 0061's two
   emitters do. Costs, measured: without 0124's SHRED decline this route
   **falsely refuses a legal annotation** —
   `array<{a: string, b: integer, c: boolean}>` hands the sink
   `["{a: string","b: integer","c: boolean}"]` whose middle shard is refusable
   (§Reproduction (h) row 11), so `@<array<{a: string, b: integer, c: boolean}>>`
   — measured `[]` at HEAD — would newly refuse. **No committed cell would
   catch that**: bug 0028's `RESULT-LET-BRACE` family carries 1- and 2-field
   brace groups only (`tests/unresolved-annotation-lowering.test.ts:1378`,
   `:1379`, `:1382`) and the shred needs ≥3 fields inside a generic argument
   (0124's report residual 5), so its `array<{a: string, b: integer}>` row
   stays green while the class regresses. It also emits one diagnostic per
   FRAGMENT where 0124's row emits one per annotation, so the two positions
   would count differently. Taking this route means re-deriving the decline
   route 1 gets for free.
3. **Judge at `lowerQueryResponseSchema`.** Costs: it is the wrong side of the
   load boundary. That seam runs after load
   (`query-schema-lowering.ts:143–:149` states there is "no load-time
   diagnostic channel to report a collision through" at this position), so a
   verdict there cannot refuse a theta and cannot produce a parse diagnostic.
   It would at best return `undefined`, which the producer reads as UNTYPED
   (`production-theta-producer.ts:2550`) — silently converting a declared
   query into 0014's degraded arm, the arm 0014's fix exists to make
   unreachable from source. Rejected on the measurement unless the route also
   moves the parse gate.
4. **Make the name walk see `Ghost` inside `Ghost--`.** Rejected on bug
   0044's precedent: `unresolved-named-type` must not fire for text that is
   not an `Ident` (`grammar.md:98`), and this route would re-open exactly what
   0044 closed at 0.54.0. It also cannot restore the other three rows
   (§Reproduction (d)), which are compatibility verdicts, not name
   resolutions.

Constraints every route carries:

5. **The position's own rules keep firing alone.** `@<void-->`,
   `@<array<string, integer>-->`, `@<{}-->` and
   `@<{a: string, a: integer}-->` each already draw their own error-severity
   row (§Reproduction (e)). 0124's row states the rule this position
   inherits: an annotation whose position-rule walk already drew an
   error keeps that diagnostic alone and draws no refusal.
6. **The `Result` peel comes first.** A route must judge
   `queryResponseAnnotation`'s output, not `e.schema`: the raw
   `Result<Cat,QueryError>` text names `QueryError` to the sink
   (§Reproduction (h), last row), the builtin the peel exists to protect. The
   propagated `let`-annotation route reaches this walk too
   (`theta-document.ts:6993–:7004`), and at that route the junk is ALREADY
   refused by 0124's row at the `let` position (§Reproduction (c)), so a
   second refusal here would double up on one statement. Whatever emits must
   not fire for text another position already refused.
7. **The capture-over-run rows need a stated disposition, not an owner.**
   `@<Ghost` swallows the rest of the file into the annotation and the
   recogniser answers `true` for the swallowed text (§Reproduction (h)). A
   refusal there is defensible but its range spans the file tail; a route
   states what it does and §Non-goals keeps the mechanism out of scope.
8. **Three cells inside 0124's witness move.**
   `tests/annotation-nontype-text-refusal.test.ts:2212` (f5) and `:2228` (f6)
   assert `[]` and must become the refusal; `:2238` (f7) asserts
   `unresolved-named-type 'Ghost'` and stays green either way. 0124's §Fix
   authored those cells as this position's pins and its §Non-goals hands the
   disposition here, so moving them is authorized by that report in terms —
   but the file is 0124's surface and the edit must cite it, exactly as 0124
   moved 0061's `g3`/`g4`/`g5` cells under 0061's own decline.
9. **Bug 0028's witness must stay green.** `SILENT (v)` and the
   `RESULT-LET-BRACE` family pin legal annotations at this position silent;
   the legal-annotation controls measured at HEAD —
   `@<{a: string, b: integer, c: boolean}>`,
   `@<array<{a: string, b: integer, c: boolean}>>`, `@<array<Cat>>`,
   `@<Cat | integer>`, `@<"a" | "b">`, `@<array<string>>` — are all `[]` and
   must remain so.

### (c) The registry question — DIAG-2, and it must be answered before code

Two dispositions, and the choice is the honest-identity question bug 0044's
precedent governs:

- **Widen `theta/parse/annotation-type-not-expression`'s Trigger
  (`code-registry-parse.md:92`) to a fifth position.** Its slug says
  "annotation", its Message placeholder is `<name>` rendered as the binder,
  and its Trigger names three positions and their spellings. The `@<T>`
  position has no binder of its own — the diagnostic's range is the query
  expression's — so the Message would render the enclosing `let` name or
  nothing, and 0124's Trigger states the emitted unit as "the WHOLE captured
  annotation" naming "the annotation's own binder". Widening also inherits
  0124's `integer|`-at-the-return-slot asymmetry paragraph, which is false
  here: this capture is delimited by its closing `>`, so a trailing `|`
  absorbs nothing and `@<Ghost|>` captures `Ghost|`, which the recogniser
  refuses (§Reproduction (h)).
- **A NEW row for the ascription position.** The precedent is 0124's own
  choice against widening `schema-type-not-expression`: bug 0044's
  honest-identity rule says a row's slug and Trigger must name what it
  judges, and an ascription is neither a `schema` field nor a `let`
  annotation. Cost: a fourth row for one judgement across three modules, plus
  its Hint, its placeholder set and the GOV-7/GOV-8 exposure any new
  placeholder carries (`<name>` is category 5 and already in the table, so a
  row reusing it adds none).

Either way the same-commit spec edits are `grammar.md:105` and
`type-system.md:15` — both sentences enumerate the refusing rows and both omit
this position — plus the three `docs/reference/` mirrors.

### (d) GOV-15 — the removal direction

A refusal makes inputs that load cleanly today fail to load, which is GOV-15's
removal direction (`source-language-stability.md:5`, input set at `:9`). The
adjudication is not new: 0124 made it for 26 trailers at three positions and
authored its Trigger "as the post-hoc GOV-15 in-scope set". The measured blast
radius here is smaller than 0124's — **2** of the 34 committed fixtures write
an `@<…>` annotation at all and both are well-formed (§Affected), so no
committed input changes disposition and
`tests/committed-fixture-parse-gate.test.ts` never meets one. The question is
entirely about author files outside the tree, and the addition direction (this
report's suppression half) is not a GOV-15 question at all: restoring
`unresolved-named-type` at a position its Trigger already names adds a
diagnostic to input that today loads and validates nothing.

### (e) Same-commit corrections every route carries

1. `src/parser/params.ts:778–:785` — the catch-all's reader enumeration names
   `parseParams` and the two schema-position emitters; 0124's recogniser is a
   third reader and this position a fourth.
2. `src/parser/params.ts:1267–:1272` — "none of the three keeps a private
   copy" is one consumer short since 0.121.0 (0124's report residual 3, left
   deliberately unedited because `params.ts` was outside that fix's surface).
   A route touching this file closes it.
3. `src/runtime/query-schema-lowering.ts:44–:47` — "A name resolving to NO
   declaration lands on the same arm but is refused from source
   (theta-document.ts), making the `{}` for THAT input defence in depth behind
   the parse gate rather than reachable behaviour" is true of `Ghost` and does
   not cover `Ghost--`, which reaches the TRAILING CATCH-ALL (`:58–:90`)
   whose enumerated routes are a generic argument and a shredded union arm.
   The enumeration gains the junk-root route, or loses it once a refusal makes
   it unreachable.
4. `src/parser/theta-document.ts:5127–:5148` — the five-position doc comment
   states four positions emit through the builder without recording that one
   of them cannot reach it for non-`Ident` text.

### (f) Ordering

Nothing blocks this report and it blocks nothing. 0124 is fixed, so its
recogniser and its declines are landed surface rather than in-flight work.
[0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) is open
over the same split and the same decline: whichever of the two lands second
re-derives the other's cost table — if 0204 takes its route (b)(1) the shred
disappears and §Fix (b)(2) here loses its measured false refusal; if it takes
(b)(2) or (b)(3) the decline's shape moves under §Fix (b)(1). A route that
edits `src/parser/query-schema-resolve.ts` would collide with open bugs 0093
and 0130 — §Non-goals keeps that file out of scope, so no coordination clause
applies there.

## Fix (0.135.0)

- **Route taken — §Fix (b)(1), with the (b)(6) carrier.** `walkExpr`'s
  `"query"` arm calls bug 0124's landed recogniser
  `annotationSourceIsNotTypeExpression` (`src/parser/type-layer-checks.ts`)
  against `queryResponseAnnotation(e.schema)`'s peeled output and, when it
  answers `true`, emits one new error-severity
  `theta/parse/query-annotation-type-not-expression` at the query expression's
  range. No second copy of the type-grammar judgement is written: the shared
  sink, the shared fragment decline and the SHRED decline are inherited
  verbatim. Routes (b)(2)–(4) were rejected exactly as §Fix argued — (b)(2)
  would falsely refuse the legal `array<{a, b, c}>` shape bug 0204 now owns;
  (b)(3) is the wrong side of the load boundary; (b)(4) would reopen bug
  0044's closed direction.
  **The carrier §Fix (b)(6) needed.** `QueryExpr` gains an optional
  `ascriptionWritten?: boolean`, set by `parseQuery` to `schema !== null`. The
  refusal fires only when `ascriptionWritten === true`, so a `let`-propagated
  or QRY-2-inferred annotation — whose junk is the `let` binding's own text,
  already refused there by `theta/parse/annotation-type-not-expression` —
  never double-refuses at the query. The field is OPTIONAL: six committed test
  files construct a `kind: "query"` literal directly, and a required field
  would have redded their typecheck for no behavioural gain.
- **Precedence (§Fix (b)(5)) and the `Result` peel (§Fix (b)(6)).** The
  position-rule walk's diagnostics (`parseTypeExpression(responseAnnotation,
  "value", …)`) are captured into a local BEFORE the refusal is judged; the
  refusal fires only when none of them is `severity === "error"`, so
  `@<void-->`, `@<array<string, integer>-->`, `@<{}-->` and
  `@<{a: string, a: integer}-->` each keep their own row alone. The refusal
  judges `queryResponseAnnotation(e.schema)`'s output, never the raw
  `e.schema`, so a `Result<Ghost, QueryError>` ascription is judged on `Ghost`
  and never misnames the builtin `QueryError`.
- **The capture-over-run (§Fix (b)(7)).** Stated, not owned: an unterminated
  `@<Ghost` swallows the file tail into the annotation, the recogniser answers
  `true` for the swallowed text, and the refusal fires with the query
  expression's range spanning the tail. The loop's extent mechanics are
  unchanged.
- **The whole-disposition rule.** When the refusal fires it is the
  annotation's WHOLE disposition: the reserved-keyword and unresolved-name
  loops below it in the same arm do not also run, because text the refusal
  judges is neither a name nor a reserved keyword.
- **Registry — a NEW row (§Fix (c) option two), for the reasons §Fix already
  argued against widening `theta/parse/annotation-type-not-expression`:** the
  `@<T>` position has no binder of its own, that row's withhold contract and
  its `integer|`-at-the-return-slot asymmetry are meaningless or false at an
  ascription, and `theta/parse/empty-query-annotation` is the placeholder-free
  precedent at this same capture. `theta/parse/query-annotation-type-not-
  expression` (E, parse) carries a placeholder-free Message — no
  placeholder-table edit, no GOV-7/GOV-8 exposure. Same-commit spec edits:
  `docs/spec_topics/type-system.md`, `docs/spec_topics/grammar.md`, and the
  mirrors `docs/reference/type-system.md`, `docs/reference/grammar.md`,
  `docs/reference/diagnostics.md` now name this position in their refusal
  enumerations.
- **GOV-15 (§Fix (d)), answered as 0124 answered it for its own three
  positions:** the refusal is IN SCOPE. Of the 34 committed
  `.theta`/`.thetalib` fixtures, 2 write an `@<…>` annotation and both are
  well-formed, so `tests/committed-fixture-parse-gate.test.ts` never meets a
  refused input and no committed source changes disposition.
- **Same-commit doc-comment corrections (§Fix (e)), all four.**
  `src/parser/params.ts`'s two stale reader enumerations
  (`lowerTypeExpr`'s trailing catch-all, and `isUnspellableTextRefusable`) now
  name the recogniser and this position as a third and fourth consumer;
  `src/runtime/query-schema-lowering.ts`'s `{}`-origin inventory records that
  the junk-root route into the trailing catch-all is now closed exactly as
  wide as this refusal and no wider — text the recogniser REFUSES no longer
  reaches that `{}` from a theta that loads, while text its shared
  brace/bracket declines ADMIT (`Ghost{`, `Ghost}` — bug 0204's boundary)
  still loads and still reaches it; `src/parser/theta-document.ts`'s
  `unresolvedNamedTypeDiagnostic` doc comment records that the `@<T>` position
  reaches that builder only for `Ident`-shaped text, since non-`Ident` text is
  now refused ahead of it. `annotationSourceIsNotTypeExpression`'s own doc
  comment (`src/parser/type-layer-checks.ts`) now names bug 0203's position
  alongside bug 0124's three.
- **The fence flips §Fix (b)(8) enumerates.**
  `tests/annotation-nontype-text-refusal.test.ts` f5 (`@<Cat-->`) and f6
  (`@<Ghost-->`) now assert the refusal instead of silence, cited to this bug;
  f7 (the `@<Ghost>` control) is untouched.
- <a id="g1-fence-flip"></a>**The fence flip §Fix (b)(8) does NOT enumerate —
  `tests/schema-body-nontype-text-refusal.test.ts` g1, pending parent
  ratification.** §Fix (b)(8) names three cells in bug 0124's witness and no
  others; a FOURTH fence sits at the same `@<T>` position in bug 0061's
  witness: the cell titled "GREEN (g1, `@<T>` annotation): `@<Cat +>` stays
  silent", together with its group header sentence "Only the `@<T>` annotation (g1/g2) still
  threads no sink under either bug and stays silent." Bug 0061 fenced the
  position without OWNING it, and its own cell comment declines the
  disposition in terms — "§Fix constraint 2 pins it as measured silent at HEAD
  and **not claimed**" — exactly as bug 0124 later did at f5/f6. It therefore
  flips under this bug's authority for the same reason f5 and f6 do: `Cat +`
  (captured `Cat+`, the interior space dropped) is the absorbed-operator
  fragment of the same text class at the same position, and it reaches
  `annotationSourceIsNotTypeExpression` from `walkExpr`'s `"query"` arm rather
  than through bug 0061's `lowerQueryResponseSchema` seam. **Subject
  PRESERVED byte-identically** (`@<Cat +>`); the cell's title and comment are
  re-derived under this bug, and the group header sentence is corrected in the
  same edit. `g2` (the LOWERING assertion) stays green and untouched, because
  this fix changes no lowering. This flip is recorded here as a place the bug
  document turned out to be incomplete and is listed for PARENT RATIFICATION;
  it is not a self-authorization. No other existing cell moved.
- **The 0204 boundary (R10), left exactly as landed.** The shared brace
  decline's admissions — `@<Ghost{>`, `@<Ghost}>`, `@<{}-->`,
  `@<{a: string, a: integer}-->` — stay silent; this fix inherits
  `annotationSourceIsNotTypeExpression`'s SHRED and fragment declines verbatim
  and narrows neither. Narrowing them, in either direction, is
  [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md)'s
  subject.
- **What shipped.** `src/parser/theta-document.ts` — the
  `QueryExpr.ascriptionWritten` carrier, `parseQuery` setting it, the
  `queryAnnotationTypeNotExpressionDiagnostic` builder, and the guarded
  emission in `walkExpr`'s `"query"` arm (§Fix (b)(1), (b)(5), (b)(6), (b)(7)).
  `src/parser/type-layer-checks.ts`, `src/parser/params.ts` (×2),
  `src/runtime/query-schema-lowering.ts` — the §Fix (e) doc-comment
  corrections, comment-only. `docs/spec_topics/diagnostics/code-registry-parse.md`
  — the new row (§Fix (c) option two). `docs/spec_topics/type-system.md`,
  `docs/spec_topics/grammar.md` and the three `docs/reference/` mirrors — the
  same-commit refusal-enumeration edits.
  `tests/query-annotation-nontype-text-refusal.test.ts` — the new 67-cell
  witness. `tests/live/live-production-acceptance.test.ts` — the H8a
  registration cell. `tests/annotation-nontype-text-refusal.test.ts`,
  `tests/schema-body-nontype-text-refusal.test.ts` — the three fence flips.
- **Gates.** Witness: `tests/query-annotation-nontype-text-refusal.test.ts`
  `Test Files 1 passed (1)`, `Tests 67 passed (67)`. Full default suite
  (`npm test`): `Test Files 332 passed (332)`, `Tests 6154 passed (6154)`.
  `npx tsc --noEmit`: exit 0, no output. `npm run lint`: exit 0, no output.
  Live (`npm run test:live`): `Test Files 16 passed (16)`,
  `Tests 101 passed (101)`, 701.90 s — H8a 67 cells (the new registration cell
  among them) and H9a 11 of 11.
- **Review.** Two rounds. Round 1 (deep): five findings — the new row's
  Trigger understated its own refused set (`,`, `)`, `=` and the trailing
  number literal are refused here and are not in the sibling row's twenty);
  the lowering header's junk-root claim was falsified by this fix's own
  bug-0204 boundary cells; three committed comments cited an authority that
  resolves to nothing in the committed tree; two line citations the change
  itself wrote were stale after its own edit; the carrier's doc comment stated
  `undefined` where the value is `false`. All five fixed. Round 2 (fast):
  CLEAN, with one prose observation adjudicated out of scope
  (`docs/STYLE.md`'s banned-word list binds the user-facing `docs/` corpus,
  not `src/` implementation comments).
- **Verification.** Verdict SOLID. The witness reds by construction: the
  emission was neutralised on two INDEPENDENT levers — the emission line
  itself, and the `ascriptionWritten` guard — and each produced
  `Tests 41 failed | 26 passed (67)` with the reds naming the absent refusal,
  the bug's own symptom; each restoration was proven byte-exact by blob hash
  (`eba1b3d7d610ecb01e33c51c1aabb2a290539357`, 7542 lines). The live cell reds
  in the same direction: neutralised, `Registered:
  ["b203livebroken","b203livegood"]` against an expected absence; restored, it
  passes. The full default suite, the live suite, `tsc` and `lint` are as
  quoted under Gates. No test skips: every reader in the witness fails loudly
  naming its unmet precondition, and the registry lookups throw rather than
  fall back to a hard-coded string. `annotationSourceIsNotTypeExpression`'s
  body, its `[`/`]` decline and its SHRED decline are byte-identical to HEAD.
- **The cost table [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md)
  will re-derive.** This fix DEPENDS ON 0124's shred-decline boundary and
  closes none of it. If 0204 widens the split to `"angle-and-brace"`, the
  shred disappears and the decline can narrow — at which point the `[`/`]` and
  brace-AND-angle ADMISSIONS this row inherits narrow with it. If 0204 takes
  its route (b)(2) or (b)(3) instead, the decline's shape moves under this row.
  Either way the surface 0204 must re-derive is exactly three places: this
  row's two decline sentences in
  `docs/spec_topics/diagnostics/code-registry-parse.md`;
  `annotationSourceIsNotTypeExpression`'s SHRED paragraph in
  `src/parser/type-layer-checks.ts`; and the silence cells this fix's witness
  pins as that boundary — group (g)'s `@<Ghost{>` and `@<Ghost}>`, each
  measured `[]`. Group (d)'s `@<{}-->` and `@<{a: string, a: integer}-->` are
  admitted by the same brace decline but are pinned by their own position-rule
  row instead (`theta/parse/empty-schema-body` and
  `theta/parse/duplicate-inline-field-name`, measured alone), so they move only
  if that decline narrows AND §Fix (b)(5)'s precedence changes. The
  shred-decline Trigger sentence itself (`[`/`]`-carrying or brace+angle text
  ADMITTED because `splitTopLevel` never tracks bracket depth) is left as a
  BOUNDARY RECORD, unedited. `QueryExpr.ascriptionWritten` is this fix's new
  surface; 0204 touches no query AST and should not need it.
- **Residuals.** (1) The `g1` fence flip above is pending PARENT RATIFICATION
  — evidence: bug 0203 §Fix (b)(8) enumerates three cells and this is a fourth,
  in bug 0061's witness rather than bug 0124's; bug 0061's own cell comment
  declines the disposition ("not claimed"); the subject is byte-identical and
  the flip was measured in the pre-Phase-1 blast-radius premeasure, not
  discovered late. (2) `theta/parse/let-rhs-type-mismatch` and
  `theta/parse/explicit-schema-mismatch` are still not restored for a
  junk-suffixed ascription: the refusal now refuses the input outright, so the
  theta does not register and the two comparison rows never run. That check
  lives in `src/parser/query-schema-resolve.ts`, which §Non-goals keeps out of
  scope because open bugs 0093 and 0130 own it. (3) The `§Reproduction (i)`
  capture-extent rows are recorded and not owned: the unterminated `@<Ghost`
  refusal's range spans the swallowed file tail, which is defensible but
  unlovely; the loop's extent mechanics stay §Non-goals. (4) One
  `docs/STYLE.md`-banned word ("just") sits in a `src/` comment this change
  added; round 2 adjudicated STYLE.md's jurisdiction as the user-facing `docs/`
  corpus, so it was left rather than tidied outside a finding.
- **Discharge notes appended.**
  [0124](./0124-parsetype-trailing-punctuation-leniency.md) — its residual 4
  (the `@<T>` capture out of frame) and its residual 3
  (`isUnspellableTextRefusable`'s one-short consumer enumeration) are both
  closed by this fix, and its own three-position Trigger is unchanged. No
  other sibling doc was touched: 0059, 0061, 0044, 0028 and 0014 keep their
  claims intact and are measured here only as controls.
- **Pinned dispositions / non-goals.** Every §Non-goals boundary held. The
  three positions bug 0124 closed, the two schema positions, the `params:`
  position and `invoke<T>` are byte-identical. `@<>` / `@<  >` stay bug 0014's
  alone. Bug 0028's witness — `SILENT (v)`, the `RESULT-LET-BRACE` family — and
  every legal-annotation control (`@<{a: string, b: integer, c: boolean}>`,
  `@<array<{a: string, b: integer, c: boolean}>>`, `@<array<Cat>>`,
  `@<Cat | integer>`, `@<"a" | "b">`, `@<array<string>>`) are still `[]`.
  `@<Ghost1>` and `@<thisisnotatype>` keep `theta/parse/unresolved-named-type`
  under bug 0044's `Ident` rule, and the lowering seam is unchanged — no
  `{}` document moved.

## Provenance

Filed from the bug 0124 fix run (0.121.0, commit `9eb1290d`), which recorded
this defect three times, pinned it, and deliberately changed none of it:

- **That run's report** (`.pi/tmp/fixes/0124-report.md` §*Residuals / notes*
  item 4), verbatim: "**The `@<T>` capture's junk-suppression stays
  UNFILED-recorded** — `@<Ghost-->` suppresses
  `theta/parse/unresolved-named-type` at one of that row's own five positions.
  Measured byte-identical across this change and pinned as fence cells.
  Belongs to whoever owns that capture; **the parent may want to file it.**"
- **The bug document's own §Reproduction group (f)** ("Positions measured and
  NOT owned here"), which records the pair and its control and states the
  reason for declining: "the trailing junk SUPPRESSES a registered code at one
  of that row's own five positions; not `parseType`, so not this report's
  frame". Its §Non-goals repeats it as a decline in terms.
- **The witness cells** `f5` / `f6` / `f7`
  (`tests/annotation-nontype-text-refusal.test.ts:2212`, `:2228`, `:2238`),
  whose messages state that this position "HAS a live diagnostic channel,
  which is what makes f5's and f6's empty sequences measurements rather than
  dead channels" and that the disposition "belongs with whoever owns that
  capture".

**Re-measured at HEAD `9eb1290d` for this filing, not copied.** The residual
gives one pair and one sentence; it does not establish the following, each
measured here:

- **The class boundary.** 29 trailers × 3 names: 26 join and load silently, 1
  joins and keeps its row because the joined text is an `Ident`, 2 never join
  because the lexer rejects the token first. The five structural trailers
  `parseType` stops on join here, so this capture is strictly more lenient
  than the one 0124 closed.
- **The loss is four registered rows, not one.**
  `unresolved-named-type` (E), `reserved-keyword-as-identifier` (E),
  `let-rhs-type-mismatch` (E) and `explicit-schema-mismatch` (W), each with a
  clean-spelling control, and with the unresolvable-name row measured
  separately so the last two are not overclaimed (§Reproduction (d)).
- **What still fires**, which bounds any route: the annotation's own position
  rules (`void`, generic arity, empty inline object, duplicate inline field)
  are unaffected by the trailer.
- **The downstream consequence, driven.** Every junk capture lowers to `{}`,
  including nested (`array<Cat-->` → `items:{}`) and union
  (`Cat-- | integer` → `anyOf:[{},…]`) forms; the producer reads `{}` as typed
  where it reads `undefined` as untyped; and the production
  `AjvSchemaValidator` over the lowered documents accepts 6 of 6 probe
  payloads for `Cat--` against 1 of 6 for `Cat`.
- **That the judgement is already computed and discarded.** The sink's fourth
  out-parameter fills `["Ghost--"]` at this text and 0124's exported
  recogniser answers `true` for 24 of the 26 silent trailers, with the shred
  row measured in both directions.
- **That four of the five Trigger positions refuse the same junk at HEAD**,
  and that the object-constructor position cannot represent it — so this
  capture is the last junk-lenient one among them.
- **The corpus blast radius**: 34 committed fixtures, 2 `@<…>` annotations,
  both well-formed.
