# Bug 0222 — `checkLetMismatch` converts a REFUSED `let` annotation directly instead of consulting the `theta/parse/annotation-type-not-expression` withhold six other consumers honour, so `let a: array<integer--> = @<integer>`x`` draws `theta/parse/explicit-schema-mismatch` (W) beside the refusal — a warning derived from text the same commit declared ABSENT, while the identical binding with the annotation OMITTED draws nothing on that channel

- **Status:** fixed (0.166.0). Filed as bug
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md)'s §Fix
  (0.160.0) *Residuals* item 1, which names this consumer, holds it, and states
  that "the withhold-routing question stays open for a follow-up report"
  (`:1234`, `:1243`). Re-measured at HEAD for this filing, not copied.
- **Sev/Diff estimate:** S2/D2 — S2 because one written mistake draws two
  diagnostics, the second computed from text the registry row's own *Trigger*
  declares absent to its consumers, and the pairing is not a duplicate of the
  refusal but a different code with a different range (§Reproduction A1: the
  `E` refusal at `4:1-4:40`, the `W` at the query's `4:27-4:40`). Not S1: the
  refusal is error-severity, so `hasLoadParseError` denies registration either
  way and no value or dispatch moves. D2 because the withhold already exists as
  one exported recogniser with six landed call sites in a sibling file, the
  consumer is one private method of one class, and the registry cost is a
  *Trigger* prose edit on an existing row rather than a new code; the only
  coordination is a flip of two witness cells the cells' own header
  pre-authorises.
- **Kind:** defect — implementation, against normative text that names this
  exact site as unintended, one element, measured at HEAD `5daeca77`
  (v0.160.0).

  `theta/parse/annotation-type-not-expression`'s *Trigger*
  (`docs/spec_topics/diagnostics/code-registry-parse.md:95`) states the absence
  semantics its withhold carries — "A refused annotation is ABSENT to the
  downstream consumers this row's withhold reaches" — and then records this
  consumer as the one exception, in its own words: "One further consumer of a
  `let` annotation is an EXCEPTION to that absence test … and it is a KNOWN,
  RECORDED residual, not intended behaviour. The QRY-4 explicit-schema check …
  converts the refused source directly rather than through this row's
  withhold". Measured, that is exactly what
  `checkLetMismatch` (`src/parser/query-schema-resolve.ts:470`) does: it calls
  `annotationToCompatType(annotationSource)` (`:479`) with no consultation of
  `annotationSourceIsNotTypeExpression`, so `array<integer-->` converts to
  `{kind:"array",element:{kind:"named",name:"integer--"}}` and `⊑`'s array arm
  decides the comparison on the outer kind before the unresolvable element is
  inspected. The refusal and the warning then fire together (A1, A2, A3), where
  the same binding with the annotation OMITTED draws nothing on that channel
  (A4) — so the warning is derived from the refused text, which is the test the
  *Trigger* itself applies to separate a withheld verdict from an independent
  one.
- **Affected** (every citation verified against the tree at HEAD `5daeca77`,
  v0.160.0 — `package.json:3`; symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication, since bug 0130's fix inserted lines into
  `src/parser/type-layer-checks.ts` and recorded no citation sweep):
  - **The consumer** — `checkLetMismatch`
    (`src/parser/query-schema-resolve.ts:470`, doc comment `:463–:469`), a
    private method of `QuerySchemaResolveWalk` (`:106`), called from
    `rewriteStmt`'s `case "let"` at `:143`. It returns early on a null or empty
    annotation (`:471–:473`) and on an initialiser that is not a (wrapped)
    query (`:474–:477`, the `query.schema === null` test at `:475`), converts
    BOTH sides through
    `annotationToCompatType` (`:478–:479`), skips when either conversion yields
    `undefined` (`:480–:482`), and otherwise pushes
    `checkExplicitSchemaMismatch`'s result (`:483–:490`). No call to
    `annotationSourceIsNotTypeExpression` exists anywhere in the file
    (measured: `rg -n annotationSourceIsNotTypeExpression src/parser/query-schema-resolve.ts`
    → no matches).
  - **The `?` peel that widens the reach** — `unwrapToQuery` (`:499`) walks
    through a `try` wrapper, so the postfix-`?` spelling reaches the same
    conversion (A3).
  - **The relation that decides the verdict** — `checkExplicitSchemaMismatch`
    (`src/parser/query-schema-inference.ts:224`): it skips on `"compatible"`
    and `"unknown"` (`:236–:238`) and warns on `"incompatible"` /
    `"integer-narrowing"`. That skip is why a refusal converting to a BARE
    unresolvable name draws the refusal alone (A6) and an `array` / `union`
    outer shape does not (A1, A2).
  - **The withhold this consumer does not consult** —
    `annotationSourceIsNotTypeExpression`
    (`src/parser/type-layer-checks.ts:1128`), exported beside
    `annotationToCompatType` (`:834`), with six landed consumer call sites in
    that file: `collectFnReturnAnnotations` (`:461`, the Result-certainty
    channel), the `let` binding record (`:1340`, followed by
    `recordWithheldBinders` `:1343`), `walkFn`'s parameter loop (`:1797`,
    withhold at `:1808`), the `?`-scope computation (`:1837`,
    `{ kind: "inferred" }`), `checkSubagentReturnAnnotation` (`:1884`) and
    `checkFnCallArgs` (`:2209`). Each is measured silent in §Reproduction (B).
  - **The second reader in the same file, which declines for an unrelated
    reason** — `annotationToInferred` (`:518`) and `compatToInferred` (`:530`):
    `compatToInferred`'s `named` arm tests
    `/^[A-Za-z_][A-Za-z0-9_]*$/` (`:544`), and every spelling this row refuses
    fails that test at the leaf, so an INDIRECT sink under a refused annotation
    stays untyped by accident rather than by withhold (§Reproduction C).
  - **The conversion boundary bug 0130 landed and this report must not
    disturb** — `letAnnotationToCompatType`
    (`src/parser/type-layer-checks.ts:871`), whose only call site is
    `walkStmt`'s `case "let"` annotation resolution, and the doc comment at
    `:798–:833` that lists `query-schema-resolve.ts`'s `checkLetMismatch` and
    `compatToInferred` (`:821–:824`) among the consumers held on the unchanged
    `annotationToCompatType`.
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:95`
    (`theta/parse/annotation-type-not-expression`, whose *Trigger* carries the
    absence semantics AND the labelled exception paragraph naming this check,
    bug 0093 and bug 0130) and `:77`
    (`theta/parse/explicit-schema-mismatch`, `W`, whose *Trigger* is a
    two-annotations-present condition and says nothing about refused text).
    `docs/reference/diagnostics.md:126` mirrors the `W` row's Message only
    (Code | Sev | Phase | Message), so no mirror carries the *Trigger* prose.
  - **The normative source of the check** —
    `docs/spec_topics/query/query-forms.md:57` (QRY-4) and `:66` (the override
    rule: the warning fires iff `ascription ⋢ annotation`, and "when either
    side is past the parser's static view … the warning is skipped").
  - **The pinned witness** —
    `tests/annotation-nontype-text-refusal.test.ts:1831–:1875` (group (o)'s
    header, which states that wiring this consumer "would decide those two
    reports' open coordination questions rather than this one's") and its five
    cells: `o1` (`:1873`), `o2` (`:1892`), `o3` (`:1912`), `o4` (`:1935`),
    `o5` (`:1956`). The file is green as written at HEAD (measured: 251
    passed), and `git log -L 1830,1975:tests/annotation-nontype-text-refusal.test.ts`
    lists exactly ONE commit, `9eb1290d` (bug 0124, v0.121.0) — so the group's
    bytes survived BOTH QRY-4 fixes (bug 0093 at 0.155.0, bug 0130 at 0.160.0)
    unflipped.
- **Observed at:** v0.160.0 (`5daeca77`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns: one scratch vitest probe
  (written, run, deleted) driving the REAL `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts`'s `parseDoc`. Every value below is that run's
  output verbatim.

## Summary

Bug 0124 refused annotation text that derives from no `Type` production and
threaded a WITHHOLD to six consumers, so that a refused annotation is absent
rather than an opaque nominal declaration. Its round-3 review found a seventh
consumer of the same text — `checkLetMismatch`, the QRY-4 explicit-schema check
— ruled it out of scope, and pinned the pairing as group (o) of its witness.
Bug 0093 closed the double-emission half of that site and measured group (o)
unmoved; bug 0130 closed the `⊑`-refuses-but-loads half, HELD
`query-schema-resolve` on the unchanged conversion, and recorded the routing
question as an open follow-up.

That follow-up is this report. `checkLetMismatch` still converts
`stmt.annotation` directly. When the refused text's OUTER shape survives the
conversion as an `array` or a `union`, the compatibility relation decides the
comparison on that shape alone and a `theta/parse/explicit-schema-mismatch`
warning fires beside the refusal. The annotation's ABSENCE at the same site
draws nothing on that channel, which is the *Trigger*'s own test for whether a
verdict is derived from refused text: it is.

## Reproduction

Zero model turns, no provider contacted. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines of frontmatter), so a body line
numbered 4 is the first source line. `REFUSAL` is
`error theta/parse/annotation-type-not-expression`, `MISMATCH` is
`warning theta/parse/explicit-schema-mismatch`.

### (A) The subject and its boundaries

| row | source under test | diagnostics |
| --- | --- | --- |
| A1 **IN-CLASS** | `let a: array<integer--> = @<integer>`x`` | REFUSAL, MISMATCH |
| A2 **IN-CLASS** | `let a: array<integer--> \| boolean = @<string>`x`` | REFUSAL, MISMATCH |
| A3 **IN-CLASS**, `?` form | `let a: array<integer--> = @<integer>`x`?` inside `fn f(): Result<integer, QueryError>` | REFUSAL, MISMATCH |
| A4 CONTROL, annotation ABSENT | `let a = @<integer>`x`` | `[]` |
| A5 CONTROL, well-formed | `let a: string = @<integer>`x`` | MISMATCH alone |
| A6 boundary, bare junk name | `let a: integer-- = @<string>`x`` | REFUSAL alone |

A1 verbatim, with ranges:

```
error theta/parse/annotation-type-not-expression: 'a' declares a type that is not a theta type expression @ 4:1-4:40
warning theta/parse/explicit-schema-mismatch: explicit @<Schema> ascription is not compatible with binding annotation @ 4:27-4:40
```

A2 verbatim:

```
error theta/parse/annotation-type-not-expression: 'a' declares a type that is not a theta type expression @ 4:1-4:49
warning theta/parse/explicit-schema-mismatch: explicit @<Schema> ascription is not compatible with binding annotation @ 4:37-4:49
```

A4 and A5 are the pair that locates the fault. A4 (`let a = @<integer>`x``)
draws `[]`, so absence is silent on this channel; A5
(`let a: string = @<integer>`x``) draws the warning ALONE, so the channel is
live on ordinary input. A6 is the same junk text as A1 without the `array<…>`
wrapper: it converts to a bare `named`, `checkCompatible` answers `"unknown"`,
and `checkExplicitSchemaMismatch` skips — so the pairing is a property of the
converted OUTER shape, not of the junk by itself. The recogniser answers `true`
for `integer--`, `array<integer-->` and `array<integer--> | boolean`, and
`false` for `string`; the conversions are
`{"kind":"named","name":"integer--"}`,
`{"kind":"array","element":{"kind":"named","name":"integer--"}}` and
`{"kind":"union","arms":[{"kind":"array","element":{"kind":"named","name":"integer--"}},{"kind":"prim","name":"boolean"}]}`.

### (B) The threaded consumers, on the same refused text

| row | source under test | diagnostics |
| --- | --- | --- |
| B1 CONTROL, binding record | `let a: integer-- = 3` + `for x in a { 1 }` | REFUSAL alone |
| B2 CONTROL, `fn` param scope | `fn f(n: integer--): integer { n` / `1 }` + `f(1)` | REFUSAL alone |
| B3 CONTROL, callee param table | `fn g(n: integer--): integer { 1 }` + `let z = g("s")` | REFUSAL alone |
| B4 CONTROL, withheld read | `let a: integer-- = 3` + `let b = a.join(",")` | REFUSAL alone |

Verbatim, B1 (B2–B4 identical but for the `<name>` placeholder and range):

```
error theta/parse/annotation-type-not-expression: 'a' declares a type that is not a theta type expression
```

B1 and B4 read the withheld binder, B2 reads the parameter scope, B3 reads the
callee's parameter table. Each would have a verdict to report if it converted
the refused text — B1's `theta/parse/non-array-iterand`, B3's
`theta/parse/fn-arg-type-mismatch` on a `string` argument, B4's
`theta/parse/unknown-method` — and each reports nothing, which is the shape the
subject does not have.

### (C) The second reader in the same file

| row | source under test | `QueryExpr.schema` | diagnostics |
| --- | --- | --- | --- |
| C1 | `let a: array<integer--> = [@`x`]` (indirect sink) | `null` | REFUSAL alone |
| C2 CONTROL | `let a: array<string> = [@`x`]` | `"string"` | `[]` |

C1 stays untyped, but not through the withhold: `compatToInferred`'s `named`
arm requires a plain identifier (`:544`), and every refused spelling fails that
test at the leaf. The decline is incidental, so a fix must not treat it as coverage.

### (D) The propagated-schema channel, measured and out of frame

`let a: array<integer--> = @`x`` records `QueryExpr.schema` as
`"array<integer-->"`, and `let a: integer-- = @`x`` records `"integer--"` —
`parseLet`'s direct propagation copies the annotation source verbatim. That
text is deliberately outside
`theta/parse/query-annotation-type-not-expression`'s *Trigger*
(`code-registry-parse.md:96`: "Not this position: a `let x: T = @`…`` or
QRY-2-inferred annotation propagated onto a query that carried none"), and the
refusal already fires at the `let` position. Recorded here as measured, not
claimed as a defect (§Non-goals).

## Expected behaviour

1. A `let` annotation that `annotationSourceIsNotTypeExpression` refuses is
   ABSENT to `checkLetMismatch`, as it is to the six consumers in §Reproduction
   (B). A1, A2 and A3 draw the refusal ALONE.
2. Refusal and absence reach the same verdict on this channel: A1 with the
   annotation deleted is A4, which draws `[]`, so A1 draws no warning either.
   This is the *Trigger*'s own absence test
   (`code-registry-parse.md:95`), applied to the one consumer it currently
   exempts.
3. The QRY-4 channel is otherwise unmoved. A5 keeps its warning, A6 keeps its
   single refusal, and every well-formed annotation / ascription pair keeps its
   verdict, its code and its range.
4. The row's *Trigger* stops recording an exception it no longer has: the
   exception paragraph naming this check, bug 0093 and bug 0130 is replaced by
   the withheld reading, and the withhold's consumer list gains this consumer.

## Actual behaviour / root cause

`checkLetMismatch` converts before it asks. `rewriteStmt`'s `let` arm calls it
with the raw `stmt.annotation` (`src/parser/query-schema-resolve.ts:143`); the
method's only guards are emptiness (`:471`), initialiser shape (`:474`) and a
`undefined` conversion result (`:480`), and none of the three is the
type-grammar judgement. `annotationToCompatType`'s final arm maps unrecognised
text to `{kind:"named"}` — its documented deferral for a name whose resolution
is pending — so `array<integer-->` becomes a well-formed `array` whose element
is unresolvable, and a `union` whose first arm is that array. `⊑`'s array arm
decides against a scalar ascription on the outer kind, and the union verdict is
`"incompatible"` once no arm answers `"compatible"` or `"unknown"`, so
`checkExplicitSchemaMismatch` warns (`query-schema-inference.ts:236–:238`
skips only `"compatible"` and `"unknown"`).

The withhold exists and is one call away: `annotationSourceIsNotTypeExpression`
is exported from `src/parser/type-layer-checks.ts:1128` and is consulted at six
sites in that file. `query-schema-resolve.ts` imports from
`query-schema-inference.ts` and from `type-layer-checks.ts` already
(`annotationToCompatType`), and consults the recogniser nowhere. The reason is
recorded, not accidental: bug 0124's round-3 review ruled the consumer out of
scope because the file was claimed by two then-open reports, and bug 0130's
route held `query-schema-resolve` on the unchanged conversion. Both of those
reports are now fixed.

## Why it matters

One written mistake draws two diagnostics, and the second is computed from text
the same registry row declares absent. An author who writes
`let a: array<integer--> = @<integer>`x`` is told, correctly, that the
annotation is not a type — and then told that an ascription is incompatible
with that annotation, which is a comparison against a type the author never
wrote. The second line survives fixing the first only by coincidence, and its
range points at the query rather than the annotation, so it reads as an
independent second fault.

The cost is also a standing exception in normative text. The *Trigger* at
`code-registry-parse.md:95` carries a paragraph whose only purpose is to record
that one consumer disagrees with the row's own absence semantics, and names two
reports as its future owners; both have since landed and neither took it. Every
report that touches this site has to re-derive the exception, and group (o) of
`tests/annotation-nontype-text-refusal.test.ts` pins the wrong behaviour green
so that no future widening can red there by accident.

## Fix

**Settled: `checkLetMismatch` consults the withhold, in the shape bug 0124
landed.** The consumer asks
`annotationSourceIsNotTypeExpression(annotationSource)` and returns before any
conversion when it answers `true`, joining the six sites the recogniser already
gates. A1, A2 and A3 then draw the refusal alone.

### (a) The landed shape, and why it is the whole route

The recogniser is already exported and already the single judgement all seven
positions share (`src/parser/type-layer-checks.ts:1128`); bug 0124 §Fix
(0.121.0) states the invariant this consumer must satisfy — a site that reads
an annotation DIRECTLY, with no derived carrier between it and the text,
establishes the absence itself rather than inheriting it, which is the reason
`checkSubagentReturnAnnotation` (`:1884`) and `checkFnCallArgs` (`:2209`) each
carry their own call. `checkLetMismatch` is exactly that shape: it reads
`stmt.annotation` verbatim off the AST. The guard goes BEFORE the conversion,
for the same reason `:1884` gives — the position has no unannotated form whose
branch the refused text could take instead.

The ASCRIPTION side is not this report's subject and does not move: junk in
`@<S>` is `theta/parse/query-annotation-type-not-expression`'s
(`code-registry-parse.md:96`, bugs 0124 / 0203), and that row already refuses
author-written junk at that position.

### (b) Constraints every route carries

1. **The group (o) cells of `tests/annotation-nontype-text-refusal.test.ts`
   are LOCKS, and this report flips exactly two of them.** The group's bytes
   have never moved: `git log -L 1830,1975` on that file lists one commit,
   `9eb1290d` (bug 0124, v0.121.0), so the cells stayed byte-identical through
   BOTH QRY-4 fixes — bug 0093's (0.155.0, which measured them green and
   recorded why: the explicit `@<Schema>` blocks `parseLet`'s propagation
   guard) and bug 0130's (0.160.0, "group (o) is byte-identical, all 251 cells
   passing, so the QRY-4 co-fire pin did not flip in either direction"). The
   flip authorised here is `o1` (`:1873`) and `o2` (`:1892`) — the two RESIDUAL
   cells whose expectation is the refusal-plus-warning pairing — under the
   group's own header, which states that the cells are "required to stay green
   until 0093 or 0130 settles the conversion path — at which point this group
   reds and forces this file, and the registry row's stated exception, back
   into review". `o3` (`:1912`, the absence control), `o4` (`:1935`, the
   well-formed QRY-4 warning) and `o5` (`:1956`, the bare-name deferral) stay
   byte-identical, and so does every other cell in the file: 251 passing at
   HEAD, and the same count after, with two cells' expected lists shortened and
   the group header re-derived to record the repair instead of the residual.
2. **Bug 0130's `letAnnotationToCompatType` boundary keeps working.**
   `src/parser/type-layer-checks.ts:871` and its single `walkStmt` call site
   are byte-identical, and so is `annotationToCompatType` (`:834`): this fix
   adds a guard in `query-schema-resolve.ts` and converts nothing differently.
   The doc comment at `:798–:833` that names `checkLetMismatch` among the held
   consumers is updated in the same commit to say that the consumer is now
   gated by the recogniser and still reads the unchanged conversion — the
   conversion is unwidened, so bug 0130's five-consumer hold is not narrowed by
   this change. `tests/let-annotation-inline-object-compat.test.ts` (51 cells)
   is a lock, cell `c3` included.
3. **Bug 0093's landed topology is a lock.**
   `tests/let-annotation-query-double-emission.test.ts` (10 cells) stays green
   as written; its subjects propagate the annotation onto a query that carried
   no ascription, so `checkLetMismatch` returns at `:476`
   (`query.schema === null` is false there only for an explicit ascription) and
   this fix cannot reach them. `src/parser/theta-document.ts` is untouched: the
   propagation, the marker `schemaFromLetAnnotation` and the `query`-arm
   withhold do not move.
4. **The registry *Trigger* edit is same-commit and is a subtraction plus a
   list entry, not a new row.** `code-registry-parse.md:95` loses the
   exception paragraph ("One further consumer … its disposition belongs with
   whichever report settles that check's conversion path") and gains this
   consumer in the withhold's consumer list, with its mechanism stated (it
   reads the position exactly as an unannotated one would — A4's `[]`). No new
   code is minted, no closed set is extended, `theta/parse/explicit-schema-mismatch`'s
   own row (`:77`) does not move, and `docs/reference/diagnostics.md:126`
   carries the Message only, so no mirror edit is owed. DIAG-2 is satisfied
   because no row is added or removed; DIAG-4 because no *Message* changes.
   `docs/spec_topics/query/query-forms.md:66` needs no edit: QRY-4's own
   condition is "both a binding annotation and an explicit `<Schema>` are
   present", and a refused annotation is absent.
5. **GOV-15 is the removal direction, and the sweep is still run.** The change
   removes an emission from inputs that already fail to register, so no
   currently-clean program changes disposition. Bug 0124 §Fix (0.121.0)'s
   census (34 committed files, 10 `let` annotations, ZERO offenders) is
   re-derived at the fix baseline rather than assumed, and the corpus-wide
   claim is discharged by `tests/committed-fixture-parse-gate.test.ts`, not by
   a scratch probe. `tests/fixtures/h7a/permitted-codes.json` carries no
   `theta/parse/*` entry and is expected to stay byte-unchanged.
6. **The `?` form is covered by the same guard.** `unwrapToQuery` (`:499`)
   peels `try`, so A3 must be pinned beside A1 rather than assumed to follow;
   the guard sits ahead of the peel and covers both spellings at once.
7. **`compatToInferred` is not the fix and is not relied on.** C1's silence
   comes from the identifier test at `:544`, which is incidental. The fix
   either leaves that reader alone (its decline is already total for every
   refused spelling, measured) or gates it with the same recogniser call; it
   must NOT be counted as existing coverage of the subject, and either way C1
   and C2 are pinned with their measured `QueryExpr.schema` values.
8. **One diagnostic per construct, in the direction the withhold owns.** The
   guard removes an emission and adds none. A5's warning, A6's single refusal,
   and every diagnostic in §Reproduction (B) keep their exact codes, counts and
   ranges.

### (c) Witness

A new offline, deterministic, provider-free witness file —
`tests/qry4-refused-annotation-withhold.test.ts` is the natural name, beside
its two siblings `tests/let-annotation-query-double-emission.test.ts` and
`tests/let-annotation-inline-object-compat.test.ts` — pinning §Reproduction
(A), (B), (C) and (D) with every expected message READ from the registry at
runtime (DIAG-4), and red-proved in both directions: with the guard neutralised
the A1/A2/A3 cells must red on the surviving warning.

## Non-goals

- **The propagated `QueryExpr.schema` text.** §Reproduction (D) records that a
  refused annotation is copied verbatim onto the query's `schema` by
  `parseLet`. `theta/parse/query-annotation-type-not-expression`'s *Trigger*
  excludes propagated text in terms (`code-registry-parse.md:96`), the `let`
  position already refuses it, and the lowering consequence of that text is
  outside this report.
- **Widening `annotationToCompatType`.** Bug 0130 §Fix (0.160.0) holds five
  consumers on the unchanged conversion, each with its reason in code
  (`type-layer-checks.ts:798–:833`). This report gates a consumer; it does not
  change what the conversion produces for anything.
- **The `⊑` relation's treatment of an unresolvable element.** A6's
  `"unknown"` deferral and A1's outer-kind decision are `type-compat.ts`'s
  documented behaviour and are the reason the pairing is shape-dependent; the
  fix removes the input, not the rule.
- **The QRY-4 warning's severity, direction or range.** `W`, one-directional,
  at the query's range — `code-registry-parse.md:77` and
  `query-forms.md:66` — all unmoved.

## Related

- [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **fixed
  (0.121.0)**, the origin of this consumer's exemption. Its §Fix (0.121.0)
  threaded the refusal answer to SIX consumption sites and its *Consumer
  census* names exactly those six; its round-3 review "FINDINGS: an EIGHTH
  consumer, `checkLetMismatch`, ruled OUT" (`:1520`, with the reasoning at
  `:1573–:1595`) is where this report's subject was first measured, and its
  witness group (o) is the pin. The exemption is also written into the registry
  row's *Trigger* (`code-registry-parse.md:95`), which §Fix (b)(4) edits.
- [0093](./0093-let-annotation-query-position-double-emission.md) — **fixed
  (0.155.0)**, which was assigned half of this residual and measured it
  untouched. Its §Fix (0.155.0) *Measured NOT to flip* (`:598–:605`) records
  the reason group (o) stayed green: "group (o)'s subjects carry an explicit
  `@<Schema>` ascription, so `parseLet`'s `init.schema === null` guard never
  propagates and the marker is never set. The QRY-4 explicit-schema channel is
  untouched by this repair, and the residual it records stays open with 0130."
  Its 10-cell witness is a lock (§Fix (b)(3)).
- [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — **fixed
  (0.160.0)**, which held this route deliberately and filed it here. Its §Fix
  (0.160.0) *Residuals* item 1 states the disposition: "This route HOLDS
  `query-schema-resolve` on the unchanged conversion (§Fix (f)), so that
  residual survives untouched, witnessed by the unflipped group (o) cells. The
  QRY-4 pair's shared *Trigger* exception is therefore **not fully
  discharged** … while the withhold-routing question stays open for a follow-up
  report" (`:1234–:1244`). Its `letAnnotationToCompatType` boundary is a
  constraint here (§Fix (b)(2)).
- [0203](./0203-query-annotation-junk-suppresses-unresolved-named-type.md) —
  **open**, the ascription side of the same pair
  (`theta/parse/query-annotation-type-not-expression`). Disjoint: that row
  judges author-written `@<T>` text, this report gates a consumer of `let`
  annotation text, and neither changes the other's refused set.
- [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
  adjudicated do-not-chase class for positional drift, under which every
  citation here is symbol-named beside its line number and re-verified at HEAD
  after bug 0130's insertions into `src/parser/type-layer-checks.ts`.

## Provenance

Three landed fix records name this consumer and none closes it.

1. Bug 0124 §Fix (0.121.0), round-3 review: an eighth consumer,
   `checkLetMismatch`, "ruled OUT" of that fix's scope because "preventing it
   means editing a file bug 0093 and bug 0130 (both open, both unsettled)
   already claim" (the witness header at
   `tests/annotation-nontype-text-refusal.test.ts:1831–:1849`), and pinned as
   group (o) instead.
2. Bug 0093 §Fix (0.155.0): group (o) measured NOT to flip, "the residual it
   records stays open with 0130".
3. Bug 0130 §Fix (0.160.0) *Residuals* item 1: the route holds
   `query-schema-resolve`, "the withhold-routing question stays open for a
   follow-up report".

**Re-measured at HEAD `5daeca77` for this filing, not copied.** The measurement
adds four things those records do not state:

- **The pairing reaches the `?` form.** `unwrapToQuery` peels `try`, so
  `let a: array<integer--> = @<integer>`x`?` inside a `Result`-returning `fn`
  draws the same two lines (A3). Group (o) pins only the direct spelling.
- **Both of the reports the exception was assigned to have landed.** Bug 0093
  is fixed at 0.155.0 and bug 0130 at 0.160.0, so the *Trigger*'s sentence
  "its disposition belongs with whichever report settles that check's
  conversion path — currently bug 0093 … and bug 0130" now names two closed
  reports.
- **The withhold is one call away and the file already imports its module.**
  `query-schema-resolve.ts` imports `annotationToCompatType` from
  `type-layer-checks.ts` and consults `annotationSourceIsNotTypeExpression`
  nowhere (measured: zero matches in the file), while the six threaded
  consumers all sit in the module it already imports.
- **The sibling reader in the same file declines for an unrelated reason.**
  `compatToInferred`'s identifier test makes an INDIRECT sink under a refused
  annotation stay untyped (C1) — incidental, not a withhold, and not coverage
  of the subject.

## Fix (0.166.0)

- **What shipped:**
  - `src/parser/query-schema-resolve.ts` — `checkLetMismatch` asks
    `annotationSourceIsNotTypeExpression(annotationSource)` and returns before
    either conversion when it answers `true`, joining the six landed call
    sites in `type-layer-checks.ts` (§Fix (a)). The guard sits ahead of
    `unwrapToQuery`'s `try` peel, so the direct and the postfix-`?` spellings
    are covered by one guard (§Fix (b)(6)); the recogniser is added to the
    existing named import the file already carries from that module, and the
    method's doc comment states the absence semantics as its reason.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` —
    `theta/parse/annotation-type-not-expression`'s *Trigger* loses the
    exception paragraph naming this consumer, bug 0093 and bug 0130, and
    gains this consumer in the withhold's consumer list and in the
    reads-as-unannotated mechanism sentence (§Fix (b)(4)). Same commit. No row
    added or removed (DIAG-2), no *Message* changed (DIAG-4), so no mirror
    edit is owed — measured: `docs/reference/diagnostics.md` carries
    Code | Sev | Phase | Message only and is byte-untouched, as is
    `docs/spec_topics/query/query-forms.md` (QRY-4's own condition is that
    both are present, and a refused annotation is absent).
  - `src/parser/type-layer-checks.ts` — comment-only, one bullet of
    `annotationToCompatType`'s doc comment: the `checkLetMismatch` consumer is
    now gated by the recogniser and still reads this unwidened conversion, so
    bug 0130's five-consumer hold is not narrowed (§Fix (b)(2)). Both
    conversion functions' bodies are byte-identical.
  - `tests/qry4-refused-annotation-withhold.test.ts` — NEW, the name §Fix (c)
    names: 14 offline, deterministic, provider-free cells pinning
    §Reproduction (A) A1–A6, (B) B1–B4, (C) C1–C2 with their measured
    `QueryExpr.schema` values, and (D) D1–D2. Every expected message is read
    from the registry at runtime (DIAG-4); no cell skips, and every
    precondition fails loudly naming itself.
  - `tests/annotation-nontype-text-refusal.test.ts` — the two pre-authorised
    flips and the group (o) header re-derivation (enumerated below). 251 cells
    at HEAD, 251 passing after.
  - `tests/live/live-production-acceptance.test.ts` — additive-only: one H8a
    cell appended at the end of the file, tagged `CELL-D`, asserting the
    subject's `theta-system-note` notes carry the refusal fragment and NOT the
    mismatch fragment, with a well-formed-mismatch liveness control asserted
    first. Registration-only, zero model turns.
- **The two authorised witness flips, enumerated for ratification** (§Fix
  (b)(1) pre-authorises exactly these two and no others; each subject is
  preserved):
  1. `o1` — subject `let a: array<integer--> = @<integer>`x``, unchanged.
     Expected list `[refusal, warning]` → `[refusal]`. Title
     `RESIDUAL (o1)` → `WITHHELD (o1)`; `why` moved to a new
     `WITHHOLD_OWNER` constant naming this report.
  2. `o2` — subject `let a: array<integer--> | boolean = @<string>`x``,
     unchanged. Expected list `[refusal, warning]` → `[refusal]`. Same title
     and `why` re-derivation.
  The group (o) banner comment and the `describe` title are re-derived to
  record the repair: the "out of scope / not a fix" framing, the
  "required to stay green until 0093 or 0130 settles the conversion path"
  clause, and the two-open-reports attribution were all false after this fix.
  `o3` (absence control), `o4` (well-formed QRY-4 warning) and `o5`
  (bare-name deferral) are byte-identical, as is every other cell in the
  file — verified by diff extent and by the unchanged 251-cell pass count.
  Locks byte-verified against HEAD by `git hash-object`:
  `tests/let-annotation-query-double-emission.test.ts` (10 cells, bug 0093),
  `tests/let-annotation-inline-object-compat.test.ts` (51 cells, bug 0130,
  cell `c3` included), `src/parser/theta-document.ts`,
  `tests/fixtures/h7a/permitted-codes.json`, `docs/reference/diagnostics.md`,
  `docs/spec_topics/query/query-forms.md`.
- **Gates:**
  - Witness, red before: `npx vitest run tests/qry4-refused-annotation-withhold.test.ts`
    → `Tests 3 failed | 11 passed (14)`, A1/A2/A3 each failing with the single
    diff `+ "warning theta/parse/explicit-schema-mismatch: explicit @<Schema>
    ascription is not compatible with binding annotation @ 4:27-4:40"` (A2 at
    `4:37-4:49`, A3 at `5:29-5:42`) — the correct-reason symptom.
  - Witness, green after: `Tests 14 passed (14)`; with
    `tests/annotation-nontype-text-refusal.test.ts`, `Tests 265 passed (265)`.
  - Full offline suite: `Test Files 358 passed (358)` / `Tests 7303 passed
    (7303)` (baseline at the fork was 357 files / 7289 tests; the deltas are
    the one new witness file and its 14 cells).
  - `npx tsc --noEmit` — clean. `npm run lint` — clean.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts -t "CELL-D"` →
    `Tests 1 passed | 81 skipped (82)` (the 81 are the `-t` filter's, not
    skips in the cell).
- **Blast-radius premeasurement** (before the witness was written): the guard
  was prototyped and the FULL offline suite run against it. Exactly two reds,
  `o1` and `o2` — 356/357 files and 7287/7289 tests green. Nothing else in the
  corpus moved. The prototype was then removed by writing the file's content
  back, verified byte-exact against `HEAD:src/parser/query-schema-resolve.ts`
  by `git hash-object`. GOV-15 direction is REMOVAL: the change deletes an
  emission from inputs that already fail to register, so no currently-clean
  program changes disposition. Bug 0124's census was re-derived at this
  baseline rather than assumed — 34 committed `.theta`/`.thetalib` fixtures,
  10 `let` annotations, zero offenders — and the corpus-wide claim is
  discharged by `tests/committed-fixture-parse-gate.test.ts` (36 cells green),
  not by a scratch probe.
- **Review:** 1 round.
  - Round 1 (`bug-fix-reviewer`): FINDINGS — one `prose` defect (the new
    `WITHHOLD_OWNER` doc comment claimed o4 cites `RESIDUAL_OWNERS`; measured,
    only o3 and o5 do) plus one non-blocking `prose` residual (a banned
    "Note that" in the new witness's header). No `correctness`, `fidelity` or
    `spec` finding; guard placement, the registry subtraction, the mechanism
    group, every lock hash and the red-capability of A1/A2/A3 were each
    verified with quoted evidence.
  - Polish (`bug-fix-fixer-light`): both prose items fixed. Every hunk of that
    round touches only comment text; gates re-run green, so per the
    convergence policy the polish is verified by gate-diff and the
    confirmation round is skipped.
- **Verification:** SOLID, 2 rounds (`bug-fix-verifier`).
  - Witness genuinely witnesses: the guard was neutralised by a temporary
    local edit; A1/A2/A3 and the flipped `o1`/`o2` all red on the surviving
    `explicit-schema-mismatch` line; restored by writing the content back and
    proved byte-exact by identical `git hash-object` before and after
    (`fe583de908d0307e0aa2cdc00334a46321bd6edf`); green re-confirmed.
  - Full offline suite green (358/7303), twice, with identical counts.
  - Live: round 1 ran the new `CELL-D` cell green but did not prove it can
    red, and the subject theta does not register — so the decisive
    "no mismatch note" assertion was suspected vacuous. Round 2 settled it by
    measurement: `parseDiscoveredTheta` returns a failed load's diagnostics as
    `dropped` rather than discarding them, `runComposePass` emits that group,
    and `emitLoadNoteGroup` routes its warning-severity members onto the same
    `theta-system-note` channel as one batch note, unconditional of
    registration — registration and load-diagnostic delivery are decoupled.
    Proved by running the live cell with the guard neutralised: it RED on the
    decisive assertion itself, with both notes present and citing the subject
    file. Restored, re-run green. Both directions proven live, per AGENTS.md.
  - Lint and typecheck clean.
- **Residuals:**
  1. `RESIDUAL_OWNERS` in `tests/annotation-nontype-text-refusal.test.ts`
     still reads "both open and unsettled" of bugs 0093 and 0130, and is still
     cited by cells `o3` and `o5`. Both reports have landed, so that clause is
     stale prose. It is left as written BY DECISION: §Fix (b)(1) makes those
     three cells byte-locks, and the lock outranks re-deriving prose inside
     them. `o1` and `o2` moved to the new `WITHHOLD_OWNER` constant instead.
     Evidence: `grep -n RESIDUAL_OWNERS` returns the declaration, the
     `WITHHOLD_OWNER` doc comment, o3's `why` and o5's `why`; o4 carries a
     bespoke literal and never used the constant.
  2. `compatToInferred`'s identifier test (`named` arm) is why an INDIRECT
     sink under a refused annotation stays untyped (§Reproduction C1). That
     decline is INCIDENTAL, not a withhold — recorded in §Fix (b)(7),
     deliberately NOT fixed here, and not counted as coverage. C1 and C2 pin
     it with their measured `QueryExpr.schema` values and C1's own text
     disclaims it.
  3. The guard adds thirteen lines to `src/parser/query-schema-resolve.ts` and
     five to `src/parser/type-layer-checks.ts`, so line citations into both
     files drift. Not chased: bug 0134's adjudicated do-not-chase class, and
     no citation sweep was run. Every citation this record makes names
     symbols.
  4. §Reproduction (D)'s propagated `QueryExpr.schema` text is unmoved and
     stays outside this report (§Non-goals); D1/D2 pin it as measured.
- **Discharge notes appended:** 0093 and 0130 (both fixed; append-only,
  statuses unchanged). Bug 0124's witness group (o) is the flip site and is
  recorded above rather than by a note on that report.
- **Pinned dispositions / non-goals:** the propagated `QueryExpr.schema` text;
  widening `annotationToCompatType` (bug 0130's five-consumer hold, unmoved —
  this fix gates a consumer and converts nothing differently); `⊑`'s treatment
  of an unresolvable element (`type-compat.ts` unmoved — the fix removes the
  input, not the rule); the QRY-4 warning's severity, direction and range; the
  ascription side, which is
  `theta/parse/query-annotation-type-not-expression`'s (bug 0203, open). All
  unmoved.
