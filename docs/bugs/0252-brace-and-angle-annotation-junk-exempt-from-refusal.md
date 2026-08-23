# Bug 0252 — `annotationSourceIsNotTypeExpression`'s SHRED decline exempts every annotation text carrying BOTH a brace and an angle bracket, so junk that refuses when written with braces alone (`{a: integer--}`) or angles alone (`array<integer-->`) loads clean when both appear (`{a: integer--, c: array<integer>}`, `{a: integer, b > c, m: integer}`), the interior then declines in `letAnnotationToCompatType` to the deferring nominal, and TYPE-8's `let-rhs-type-mismatch` plus `reassign-rhs-type-mismatch` are withheld with nothing on any channel

- **Status:** fixed (0.225.0)
- **Sev/Diff estimate:** S2/D2 — S2 because no value is corrupted and no wrong
  verdict is emitted: what is lost is the check. `let y: {a: integer, b > c,
  m: integer} = 1` draws `[]` where its byte-neighbour control draws
  `theta/parse/let-rhs-type-mismatch`, the theta registers, and the same
  annotation withholds `theta/parse/reassign-rhs-type-mismatch` at the
  reassignment position (§Reproduction C). D2 because the recogniser's decline
  is landed law with a stated reason — it exists to stop a union split shredding
  a brace group (`type-layer-checks.ts:1127`–`:1154`, bug 0124 §Fix) — so
  narrowing it needs the *Trigger* sentence at
  `docs/spec_topics/diagnostics/code-registry-parse.md:106` edited in the same
  commit under DIAG-2, a GOV-15 carve-out for the inputs newly refused, and
  bug 0028's `RESULT-LET-BRACE` witness held green.
- **Kind:** defect — implementation, against
  `docs/reference/grammar.md:215` (the `Type` production) read with
  `docs/spec_topics/diagnostics/code-registry-parse.md:106`, whose *Trigger*
  states that a `let` annotation "carries text that derives from no `Type`
  production" is "Refused, at all three positions alike". One component, two
  stages:
  1. **The refusal never runs.** `annotationSourceIsNotTypeExpression`
     (`src/parser/type-layer-checks.ts:1156`) returns `false` — not refusable —
     for any text containing a brace AND an angle bracket
     (`:1164`–`:1168`), before the refusable-text sink is consulted at
     `:1169`–`:1171`. The exemption is text-level, not structure-level: one
     `array<integer>` field anywhere in the interior exempts junk in a sibling
     field (§Reproduction B, B1 vs B2).
  2. **The conversion then declines the whole interior, silently.**
     `letAnnotationToCompatType` (`:899`) reaches
     `inlineObjectAnnotationToCompatType` (`:954`) through
     `convertAnnotation` (`:903`, inline-object arm `:924`–`:929`), which
     returns `undefined` for an entry with no top-level colon (`:968`–`:970`),
     a non-identifier key (`:972`), or an unrecognised type tail
     (`:975`–`:977`).
     `convertAnnotation`'s catch-all then mints
     `{ kind: "named", name: <the whole annotation text> }` (`:930`), a
     deferring nominal, and TYPE-8 (`docs/reference/type-system.md:55`)
     compares nothing.
- **Related:**
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **fixed
    (0.121.0)**, the origin of both the row and the decline. Its §Fix records
    the decline as mandatory ("Without the decline the fix falsely refuses that
    LEGAL annotation and reds bug 0028's witness … RESULT-LET-BRACE") and states
    it can "only ever refuse LESS … never more". This report claims the
    conjunct's reach, not the decline's existence: the measured hole is junk
    that each half of the conjunct refuses on its own.
  - [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
    **fixed (0.139.0)**. The decline's own doc comment
    (`src/parser/type-layer-checks.ts:1140`–`:1154`) records that after 0204 the
    GENERIC-ARGUMENT half of the shard hazard no longer reaches the sink, and
    that the decline was left unnarrowed because the UNION-split half is
    untouched. That half is the constraint on any route here.
  - [0238](./0238-stray-close-token-underflows-top-level-split.md) — **fixed
    (0.218.0)**, the report this one is filed out of, and the position
    comparison. Its typed opener stacks repaired the same interior at `params:`
    (§Reproduction D: `p: '{a: integer, b > c, m: integer}'` now lowers
    byte-identically to its control), while the `let` annotation still draws
    nothing. **Its *Residuals* item 1 attributes its W21 row to
    `type-layer-checks.ts`'s `splitTopLevelObjectFields` /
    `topLevelColonIndex`; that attribution is wrong, measured**
    (§Reproduction E). Its witness cell W21
    (`tests/inline-object-stray-close-token-split.test.ts`) pins the row as an
    explicitly unattributed fence and is this report's red-when-fixed pin.
  - [0247](./0247-untypeable-static-type-has-no-category-1-rendering-clause.md)
    — **open**, and the owner of the RENDERING face measured here. The nominal
    `convertAnnotation` mints carries the junk text as its name, and that text
    reaches `<actual>` / `<expected>` verbatim (`got {a: integer, b > c, m:
    integer}`, `expected array<{a: integer--}>` — §Reproduction B5, C3). 0247's
    §Related already names bug 0130 as a carrier of "a distinct non-conformant
    `named` into the same render arm". Not claimed here.
  - [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — **fixed
    (0.160.0)**, which landed the conversion and its decline. Its *Residuals*
    item 4 pins GRAMMAR-ADMITTED spellings the strict interior parser declines
    (a quoted key, an `as "WireName"` rename, a `Result<A, B>` field type) as
    safe status-quo silence. Those are not this report: an annotation admitted
    by the grammar and declined by the converter is a deferral; an annotation
    the grammar does not derive is one the registry row says to refuse. Its
    *Residuals* item 3 (`splitTopLevelUnion` shredding a `|` inside a brace
    group) is the same union half bug 0204's comment names.
  - [0244](./0244-colon-less-inline-object-entry-silently-discarded.md) —
    **open**, filed in a parallel lane over the same spelling at a different
    component: `TypeParser.parseObject`'s resync discards an entry that spells
    no top-level `:`. **Not a duplicate:** that report claims the type
    PARSER's recovery arm and its missing key, this one claims the annotation
    REFUSAL recogniser's decline and the withheld TYPE-8 check at the `let`
    position. Neither blocks the other; whichever lands second re-measures the
    other's rows over the same interiors.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) — **open**,
    the neighbouring deferral. Its subject is a well-formed `NamedType` whose
    resolution is deferred (`let a: nope = 3`); this report's subject is text
    that is no `Type` at all. Disjoint inputs, same terminal silence.
  - [0222](./0222-qry4-let-mismatch-reads-refused-annotation.md) — **fixed
    (0.166.0)**. `checkLetMismatch` (`src/parser/query-schema-resolve.ts:530`)
    consults the same recogniser, so the QRY-4 site inherits whatever the
    conjunct admits. Not measured here.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated citation-drift class. A route editing
    `src/parser/type-layer-checks.ts` shifts every absolute line number cited
    above; not chased.
- **Affected** (every citation read at HEAD `b9cf2f26`, 0.219.0):
  - `src/parser/type-layer-checks.ts:1156` —
    `annotationSourceIsNotTypeExpression`; the bracket decline `:1161`–`:1163`,
    the brace-AND-angle decline `:1164`–`:1168`, the sink `:1169`–`:1171`, the
    decline's rationale comment `:1127`–`:1154`.
  - `src/parser/type-layer-checks.ts:899` — `letAnnotationToCompatType`;
    `:903` — `convertAnnotation`, inline-object arm `:924`–`:929`, nominal
    catch-all `:930`; `:954` — `inlineObjectAnnotationToCompatType`, its
    `colon < 0` decline `:968`–`:970`, key decline `:972`, tail decline
    `:975`–`:977`;
    `:1009` — `recognisedFieldType`.
  - `src/parser/theta-document.ts:7726`, `:7810` — the emission guards that read
    the recogniser; `src/parser/query-schema-resolve.ts:530` — the QRY-4 reader.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:106` — the
    `theta/parse/annotation-type-not-expression` row, which states both the
    refusal and the decline.
  - `docs/reference/grammar.md:215` (`Type`), `:225` (`ObjectType`),
    `docs/reference/type-system.md:55` (TYPE-8).
  - **Not affected, measured:** `splitTopLevelObjectFields`
    (`src/parser/type-layer-checks.ts:1041`) and `topLevelColonIndex` (`:1061`),
    the third untyped copy of the depth arithmetic bug 0238 converted to typed
    opener stacks elsewhere. The copy is real — unconditional `depth -= 1` at
    `:1050` and `:1068`, no kind matching — and is non-causal for every row
    below (§Reproduction E).
- **Observed at:** HEAD `b9cf2f26` (0.219.0), offline, provider-free.

## Summary

`theta/parse/annotation-type-not-expression` refuses a `let` annotation whose
text derives from no `Type` production. Its recogniser first declines — admits
without judging — any text carrying both a brace and an angle bracket, a
position-level decline bug 0124 added so a union or generic split cannot hand
the refusable-text sink a shard of a group the author wrote whole.

The decline reads the whole annotation as text, so one well-formed
angle-bracketed field exempts junk in a sibling field. `{a: integer--}` refuses;
`{a: integer--, c: array<integer>}` draws nothing. `array<integer-->` refuses;
`array<{a: integer--}>` draws a mismatch whose `<expected>` column renders
`array<{a: integer--}>`. A stray depth-0 close token supplies the angle bracket
by itself: `{a: integer, b > c, m: integer}` is exempt with no generic anywhere
in it.

Behind the exemption the conversion declines the interior whole — one entry with
no top-level colon, a non-identifier key or an unrecognised tail is enough — and
`convertAnnotation`'s catch-all mints a nominal whose name is the annotation
text. TYPE-8 has no field set to compare, so `let-rhs-type-mismatch` is
withheld, and so is `reassign-rhs-type-mismatch` on the same binding. The theta
registers.

The same interior at `params:` was repaired by bug 0238 (0.218.0) and now lowers
byte-identically to its control. One interior, two positions, two dispositions.

## Reproduction

Zero model turns, no provider contacted. `diags` is the whole unfiltered
`doc.diagnostics` list in emission order, read through `parseDoc`
(`tests/helpers/e2e-s1.ts`). Every body is a whole prompt-mode theta:

```
---
mode: prompt
---
<body>
```

`[]` means the theta registers: `hasLoadParseError`
(`src/extension/production-composition.ts`) needs one error-severity
`theta/load/` or `theta/parse/` code.

### (A) The `let` annotation — the check is withheld

| row | body | diags |
| --- | --- | --- |
| A1 control | `let y: {a: integer, m: integer} = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'y' initialiser type mismatch: expected { a: integer, m: integer }, got integer` |
| A2 **THE SHARP ROW** | `let y: {a: integer, b > c, m: integer} = 1` | `[]` |
| A3 string RHS | `let y: {a: integer, b > c, m: integer} = "s"` | `[]` |
| A4 nested stray | `let y: {a: integer, n: {q > r, m: integer}} = 1` | `[]` |
| A5 nested control | `let y: {a: integer, n: {q: integer, m: integer}} = 1` | `error theta/parse/let-rhs-type-mismatch: … expected { a: integer, n: { q: integer, m: integer } }, got integer` |

A3 shows the row is not an artefact of the RHS: no initialiser type is
compatible with the annotation, and none is reported.

### (B) The conjunct is the hole

| row | body | diags |
| --- | --- | --- |
| B1 brace-only junk | `let y: {a: integer--} = 1` | `error theta/parse/annotation-type-not-expression: 'y' declares a type that is not a theta type expression` |
| B2 the same junk, one angle bracket added | `let y: {a: integer--, c: array<integer>} = 1` | `[]` |
| B3 the same junk, a bare `>` added | `let y: {a: integer--, c > d} = 1` | `[]` |
| B4 angle-only junk | `let y: array<integer--> = 1` | `error theta/parse/annotation-type-not-expression: …` |
| B5 the same junk, one brace added | `let y: array<{a: integer--}> = 1` | `error theta/parse/let-rhs-type-mismatch: … expected array<{a: integer--}>, got integer` |
| B6 bare junk | `let y: integer-- = 1` | `error theta/parse/annotation-type-not-expression: …` |

B1/B2 and B4/B5 are byte-neighbour pairs: the added text is well-formed and the
junk is unchanged. B5's `<expected>` column carries `integer--`, which is no
static type — bug 0247's class, named here and not claimed.

### (C) The other checks the deferral withholds

| row | body | diags |
| --- | --- | --- |
| C1 reassignment control | `let mut y: {a: integer, m: integer} = 1` + `y = "s"` | `let-rhs-type-mismatch` **and** `error theta/parse/reassign-rhs-type-mismatch: reassignment of 'y' type mismatch: expected { a: integer, m: integer }, got string` |
| C2 reassignment, stray | `let mut y: {a: integer, b > c, m: integer} = 1` + `y = "s"` | `[]` |
| C3 iterand, stray | `let y: {a: integer, b > c, m: integer} = 1` + `for q in y { let w = 1 }` | `error theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got {a: integer, b > c, m: integer}` |
| C4 iterand control | `let y: {a: integer, m: integer} = 1` + `for q in y { let w = 1 }` | `let-rhs-type-mismatch` **and** `non-array-iterand: … got { a: integer, m: integer }` |
| C5 index, stray | `let y: {a: integer, b > c, m: integer} = 1` + `let w = y["a"]` | `[]` |
| C6 member, stray | `let y: {a: integer, b > c, m: integer} = 1` + `let w = y.zzz` | `[]` |

C3 is the deferral's one visible face: the nominal's name is the annotation text
and it renders verbatim into the `<actual>` column, unspaced, where C4's control
renders the re-serialised type. C5 and C6 lose the annotation's line only; the
index and member checks defer on a nominal by design.

### (D) The same interior at `params:`, repaired by bug 0238

Whole theta: `params:` with one field `p`, body `let x = 1`.
`lowered` is `doc.frontmatter.params.loweredSchema`.

| row | `p:` type | diags | lowered |
| --- | --- | --- | --- |
| D1 control | `{a: integer, m: integer}` | `[]` | `$ref → __inline_6ab13cdeb4b48b5a`, fragment `{a: integer, m: integer}`, `required ["a","m"]` |
| D2 stray `>` | `{a: integer, b > c, m: integer}` | `[]` | the SAME `$ref`, the same slug, byte-identical fragment |

D2's bytes are bug 0238's shipped outcome. The annotation position did not move
with it.

### (E) The third copy of the depth arithmetic is NOT the cause

`splitTopLevelObjectFields` (`src/parser/type-layer-checks.ts:1041`) and
`topLevelColonIndex` (`:1061`) decrement unconditionally on `>` / `}` with no
kind matching — the shape bug 0238 replaced with typed opener stacks in
`src/parser/params.ts` and `src/parser/type-grammar.ts`. Neutralisation
measurement, both directions:

1. Both functions were rewritten in place to the typed opener stack (a `>`
   closes only an open `<`, a `}` only an open `{`, an unmatched close token
   inert). **A2 stays `[]`.** With the typed rule the interior splits into three
   parts and the middle part `b > c` still has no top-level colon, so
   `inlineObjectAnnotationToCompatType` declines at `:968`–`:970` exactly as
   before.
2. 1802 distinct inline-object annotation interiors, generated from an
   18-element atom alphabet mixing well-formed fields with stray `>` / `}`
   tokens, unbalanced generics and unrecognised tails, were parsed under both
   implementations and their whole diagnostic lists compared: **0 differences**.
   Every input that distinguishes the two splitters carries a close token that
   lands in some part, and that part fails the key or tail test under either
   split, so the whole interior declines either way.

The copy is a divergence from the rule the other three components now share; it
is not an observable one, and bug 0238 *Residuals* item 1's attribution of its
W21 row to this copy is corrected by this measurement. The file was restored
byte-exact after each pass (`git hash-object` equal to
`491a307b62250c48e92b51001f75b0624172f79d`); no `git checkout` / `restore` /
`stash` was used.

### (F) The committed corpus

`git ls-files -- '*.theta' '*.thetalib'` → **34 files**;
`tests/committed-fixture-parse-gate.test.ts` green at HEAD (36 tests). One
committed declaration line carries both a brace and an angle bracket —
`docs/examples/personas.thetalib:7`,
`fn rate_strictness(a: Author): Result<integer, QueryError> {` — and its
annotation text is a well-formed `Type`. No committed fixture spells junk behind
the exemption, so a narrowing route newly refuses no committed file. That bounds
the corpus half of a GOV-15 sweep; it does not discharge it, since every (A),
(B) and (C) row loads cleanly today.

## Expected behaviour

1. **An annotation deriving from no `Type` production is refused at the `let`
   position, whatever brackets its text happens to carry.** A2, A3, A4, B2 and
   B3 draw `theta/parse/annotation-type-not-expression` (or, if a route instead
   makes the interior convertible, they draw the control's
   `let-rhs-type-mismatch`); the registry row at
   `code-registry-parse.md:106` states the refusal for these three positions and
   states the decline as a shard protection, not as a licence for junk that each
   half of the conjunct refuses alone.
2. **The reassignment check is not lost with it.** C2 either refuses or draws
   C1's `reassign-rhs-type-mismatch`.
3. **A legal annotation is still not refused.** `Result<{a: string, b: integer,
   c: boolean}, QueryError>`, `array<{a: integer}>` and `{a: integer} | null`
   keep drawing exactly what they draw today; bug 0028's
   `tests/unresolved-annotation-lowering.test.ts` `RESULT-LET-BRACE` cell stays
   green, and the union half of the shard hazard bug 0204's comment names
   (`type-layer-checks.ts:1151`–`:1154`) is not re-opened.
4. **Nothing else moves.** A1, A5, B1, B4, B6, C1, C4, D1 and D2 keep their
   diagnostics, values and lowered bytes; B5 and C3 keep their codes (their
   rendered columns are bug 0247's question).

## Actual behaviour / root cause

**The decline is text-level and the junk is field-level.**
`annotationSourceIsNotTypeExpression` (`src/parser/type-layer-checks.ts:1156`)
asks `text.includes("{") || text.includes("}")` and
`text.includes("<") || text.includes(">")` (`:1164`–`:1165`) and returns `false`
when both hold (`:1166`–`:1168`). The refusable-text sink at `:1169`–`:1171`
never runs. The hazard the decline protects against is a SHARD produced by a
split of a group; the test it uses is the presence of two characters anywhere in
the annotation, which also covers every interior whose junk sits beside an
unrelated generic (B2), and every interior whose only angle bracket IS the junk
(A2, B3).

**The conversion then declines whole, and the fallback is deferring.**
`letAnnotationToCompatType` (`:899`) routes an inline object through
`inlineObjectAnnotationToCompatType` (`:954`), which returns `undefined` on the
first entry with no top-level colon (`:968`–`:970`), a non-identifier or
duplicate key (`:972`), or a tail `recognisedFieldType` (`:1009`) does not
derive (`:975`–`:977`). `convertAnnotation` (`:903`) then falls to `:930` and mints
`{ kind: "named", name: text }`. TYPE-8 (`docs/reference/type-system.md:55`)
governs inline object types field-wise; a nominal has no fields, so the relation
defers and no diagnostic is emitted. The decline direction is bug 0130's landed
decision and is sound for GRAMMAR-ADMITTED interiors its *Residuals* item 4
pins; what makes A2 a defect is that its interior is not grammar-admitted and
the component that exists to refuse it declined to look.

**The split arithmetic in the same file is a red herring for these rows.**
`splitTopLevelObjectFields` (`:1041`) and `topLevelColonIndex` (`:1061`) count
`<`/`{` up and `>`/`}` down with no floor and no kind matching, so a stray close
token underflows exactly as bug 0238's two functions did before 0.218.0. Its
consequence is which entry fails, never whether one does: measured over 1802
interiors, the typed rule and the unfloored counter produce identical diagnostic
lists (§Reproduction E).

## Why it matters

A `let` annotation is the author's declaration of what the binding holds. Behind
this exemption the declaration is accepted and then read as an opaque name: the
initialiser is not checked against it (A2, A3), a later reassignment is not
checked against it (C2), and the theta registers and runs. The author's signal
is the absence of a diagnostic they never learn was withheld.

The exemption is reachable without writing anything exotic. One stray `>` inside
an inline object supplies the angle bracket (A2); one well-formed `array<…>`
field beside a typo supplies it for the whole interior (B2). Both spellings are
one keystroke from a legal annotation, which is when a type check is worth most.

The two halves of the conjunct each refuse the same junk (B1, B4). A rule whose
conjunction admits what both of its conjuncts refuse is not a protection with a
boundary; it is a hole with a reason attached, and the reason — a split shredding
a group — no longer covers the generic-argument half at all
(`type-layer-checks.ts:1140`–`:1150`, measured by bug 0204).

## Non-goals

- **The rendering of the deferring nominal.** `got {a: integer, b > c, m:
  integer}` (C3) and `expected array<{a: integer--}>` (B5) are bug
  [0247](./0247-untypeable-static-type-has-no-category-1-rendering-clause.md)'s
  class: no clause of category 1 admits a rendering for a static type the parse
  layer cannot determine. Measured here, claimed there.
- **The third copy of the split arithmetic.** `splitTopLevelObjectFields` /
  `topLevelColonIndex` diverge from the typed rule bug 0238 landed and are
  measured non-causal for every row here (§Reproduction E). A route that
  converts them is welcome as hygiene and closes nothing in this report.
- **Grammar-admitted interiors the converter declines.** Bug 0130 *Residuals*
  item 4's pinned set — a quoted key, an `as "WireName"` rename, a `Result<A,
  B>` field type — stays deferring.
- **`splitTopLevelUnion`'s brace-blindness.** Bug 0130 *Residuals* item 3; the
  shared splitter also feeds `src/runtime/tool-call.ts`'s RFC-0002 disjointness
  computation.
- **The `[` / `]` decline** (`type-layer-checks.ts:1161`–`:1163`). Unmeasured
  here; only the brace-and-angle conjunct is claimed.
- **The other three positions of the row** (`fn` parameter type, `fn` return
  type) and the QRY-4 reader. Each consults the same recogniser, and at the two
  `fn` positions the control draws nothing either (an `fn` argument mismatch is
  unreachable — bugs 0050, 0137, 0146), so no differential is measured there.
- **Citation drift.** Bug 0134's adjudicated class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one and
states its choice.

**Route (a) — narrow the decline to the hazard.** The decline stops testing for
two characters anywhere in the text and starts testing whether the sink's
refusable candidate is a SHARD — a fragment the traversal's own split produced
from a group the source spells whole — which is the property bug 0124's §Fix
names. `{a: integer--, c: array<integer>}` and `{a: integer, b > c, m: integer}`
then reach the sink and refuse; `Result<{a: string, b: integer, c: boolean},
QueryError>` still declines because its middle shard is one. This route mints no
code and moves no registry row's identity, but it edits the *Trigger* sentence
at `code-registry-parse.md:106` (and the inherited sentence in row `:107`) that
states the decline, so it is a DIAG-2 same-commit registry edit and a GOV-15
carve-out for the inputs it newly refuses (§Reproduction F bounds the committed
corpus at zero).

**Route (b) — make the interior convertible instead of refusing.** The
conversion stops declining the whole interior on one malformed entry and instead
reports through the rules that already exist for inline object entries, so A2
draws its control's `let-rhs-type-mismatch` against the fields the source
declares. This route leaves the recogniser untouched and re-opens bug 0130's
recorded decline decision, whose direction — decline rather than mint a partial
field set — was chosen so TYPE-8's operand spells exactly what the source
spells. It also does not close B2/B3 as refusals: those interiors carry junk no
field set can represent, so they would stay silent, which fails §Expected
behaviour 1.

**Constraints on either route.**

1. **Bug 0028's `RESULT-LET-BRACE` cell stays green.**
   `tests/unresolved-annotation-lowering.test.ts` is the witness bug 0124's §Fix
   names as the one the decline exists to protect; it is re-run before and after
   and its cell count is unmoved.
2. **The union half of the shard hazard is not re-opened.**
   `splitTopLevelUnion` tracks angle depth only
   (`src/parser/type-layer-checks.ts:1222`), so a brace group carrying a
   top-level `|` can still be shredded; a route must show, by measurement rather
   than reasoning, that `{a: integer} | null` and
   `Result<{a: string}, QueryError>` reach the same disposition after as before.
3. **Exactly one diagnostic per offending annotation.** Bug 0124 §Fix (f)
   constraint 1's per-annotation guard and the six-consumer withhold census
   (`annotationSourceIsNotTypeExpression`'s call sites) hold: a newly-refused
   annotation draws its refusal alone and its consumers read the position as
   unannotated or seed the binding withheld, as the *Trigger* states.
4. **W21 is the red-when-fixed pin.**
   `tests/inline-object-stray-close-token-split.test.ts` pins A2 as `[]` in a
   cell labelled an unattributed fence, whose own comment states that "a later
   route that does restore the RHS gate at this position reds visibly rather
   than landing unnoticed". A route here reds that cell; it is updated in the
   same commit, with bug 0238's fence label replaced by this report's
   attribution rather than deleted.
5. **Locks.** These keep their cell counts and ordered diagnostic lists apart
   from cells the chosen route's own authority moves, and each is re-run before
   and after: `tests/unresolved-annotation-lowering.test.ts` (bug 0028),
   `tests/let-annotation-query-double-emission.test.ts` (bug 0093 cell b2),
   `tests/inline-object-stray-close-token-split.test.ts` (bug 0238, 16 `it`
   blocks), `tests/withheld-sentinel-mooting-and-render-pins.test.ts` (bug 0143,
   the render pins bug 0247 owns), and
   `tests/committed-fixture-parse-gate.test.ts`.
6. **Corpus.** §Reproduction F is re-run at the fix tree rather than cited from
   here.

**Witness — offline, provider-free.** One new file on the whole-list ordered
`toEqual` shape (`parseDoc` from `tests/helpers/e2e-s1.ts`, expected messages
read from the registry through the `registryMessage` oracle). Required cells:
A1–A5; the two byte-neighbour pairs B1/B2 and B4/B5 plus B3 and B6; C1/C2 as the
reassignment pair and C3/C4 as the render-face fence, labelled with bug 0247's
ownership; D1/D2 as the `params:` no-move rows; and a direct unit cell over
`annotationSourceIsNotTypeExpression` pinning its verdict for the six B-group
texts, since that predicate is the changed component under route (a). A live
cell is owed if the route changes a registration outcome — every (A), (B) and
(C) row registers today, and route (a) makes them refuse.

## Provenance

- **Origin:** bug
  [0238](./0238-stray-close-token-underflows-top-level-split.md)'s
  `## Fix (0.218.0)` *Residuals* items 1 and 2, which record the `let`-annotation
  row as measured-and-unattributed and name `type-layer-checks.ts`'s third copy
  of the split arithmetic as a candidate substrate for a future report.
- **Ownership check performed before any probe.** `rg -l` over `docs/bugs/`
  for `annotationSourceIsNotTypeExpression`, `annotation-type-not-expression`,
  `inlineObjectAnnotationToCompatType` and `recognisedFieldType` returns one
  **open** document, [0051](./0051-lowercase-named-type-reference-positions-silent.md),
  whose subject is a well-formed `NamedType` whose resolution is deferred; the
  rest (0061, 0124, 0130, 0203, 0204, 0217, 0222, 0238) are fixed. `rg -l` for
  `splitTopLevelObjectFields` / `topLevelColonIndex` returns 0229, 0232 and 0238,
  all fixed: 0229 *Residuals* item 2 owns that scanner's QUOTE-blindness — the
  same two functions, a different property, and by its own measurement also
  degrading only to the deferring nominal. No open document claims the
  brace-and-angle exemption or the withheld TYPE-8 check.
- **Relationship to 0229's residual, recorded as asked.** `topLevelColonIndex`
  is the SAME site 0229 names (`src/parser/type-layer-checks.ts:1061` at this
  HEAD, cited by 0229 as its `:1038`-era self); its quote-blindness and its
  missing kind matching are two defects of one scanner, and both are non-causal
  here for the same structural reason — the consumer declines the whole interior
  on any entry it cannot key.
- **Measured at HEAD `b9cf2f26` (0.219.0), not copied.** Every row in
  §Reproduction was produced by scratch probes at this tree; bug 0238's W21/W22
  rows were re-measured rather than quoted, and its residual's attribution was
  tested and corrected (§Reproduction E). The neutralisation passes rewrote
  `src/parser/type-layer-checks.ts` in place and restored it byte-exact,
  verified with `git hash-object`.
- **Scratch probes.** Four files under `tests/`, named `scratch-0252-*`, and one
  scratch directory `.pi/tmp/0252/`, both deleted after measurement;
  `git status --short` carries no `tests/` entry from this filing.

## Fix (0.225.0)

**Route (a) was taken, narrowed to the author-written brace group.** Route (b)
is rejected on §Fix's own record: it re-opens bug 0130's landed decline
decision and leaves B2/B3 silent, failing §Expected behaviour 1. Route (a)
alone is not sufficient either, and the measurement that shows it is the
adjudication's hinge: with the brace-and-angle decline hypothetically removed,
the shared sink returns an EMPTY refusable set for A2's interior
(`sinkRefusable("{a: integer, b > c, m: integer}")` → `[]`, against
`["integer--"]` for B2's), because `lowerInlineObject`'s keyless-entry skip
drops `b > c` before the sink can see it. Narrowing the decline therefore
closes B2/B3 and not A2/A3/A4, so the recogniser gains a positive structural
judgement beside the narrower decline.

- What shipped:
  - `src/parser/type-layer-checks.ts` — `annotationSourceIsNotTypeExpression`'s
    brace-AND-angle decline is narrowed to the shape a split can still cut. A
    brace-and-angle text that is not a SINGLE ENCLOSING brace group
    (`isSingleEnclosingBraceGroup`, `src/parser/params.ts` — the predicate the
    shared sink itself decides its brace-group entry with, so the two agree by
    construction) declines exactly as bug 0124 landed it; a text that IS one is
    a group the author wrote whole and no traversal here cuts, so a quote-aware
    KIND-MATCHED scan of it (`braceGroupCarriesUnmatchedCloseToken`, new,
    module-private) refuses a close token that closes nothing or closes a kind
    its nearest unclosed opener did not open — text deriving from no `Type`
    production; anything else falls through to the refusable-text sink
    unchanged. The `[` / `]` decline is untouched (§Non-goals).
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the same-commit
    DIAG-2 edit: the `theta/parse/annotation-type-not-expression` row's
    *Trigger* sentence stating the SHRED decline now states the narrowed
    boundary, and the `theta/parse/query-annotation-type-not-expression` row's
    sentence — which inherits that boundary verbatim rather than copying it —
    moves in lock-step. No code minted, no row added or removed, every
    *Message* and *Remedy* column byte-identical.
  - `tests/brace-and-angle-annotation-junk-refusal.test.ts` (new) — §Fix's
    witness: A1–A5, B1/B2 and B4/B5 as byte-neighbour pairs plus B3 and B6,
    C1/C2, C3/C4, C5/C6, D1/D2 over `loweredSchema` byte-equality, the F-group
    anti-widening fences, the constraint-3 one-line-per-annotation cell, and a
    direct unit cell over the recogniser. Whole-list ordered `toEqual` over the
    unfiltered diagnostics through `parseDoc`; every expected message read
    through the `registryMessage` oracle (DIAG-4).
  - `tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts`
    (new) — the live cell §Fix's witness clause owes, since route (a) changes a
    registration outcome: the offender annotation is absent from the registered
    set at live production load while its byte-neighbour control registers and
    drives a real turn, discriminated by an arithmetic oracle over two bound
    field values (the bug 0243 convention, no verbatim echo).
  - `tests/inline-object-stray-close-token-split.test.ts` — §Fix constraint 4:
    bug 0238's W21 fence is re-attributed to this report's refusal rather than
    deleted. 16 `it` blocks, unmoved.
  - `tests/let-annotation-inline-object-compat.test.ts` — bug 0130 cell e7 rows
    e7.1–e7.4 (`{a: integer>}`, `{a: b>c}`, `{a: array<b>c>}`,
    `{a: {b: integer>}}`) now expect the registered refusal. e7.5
    (`{a: Result<integer>}`, bug 0130 *Residuals* item 4) and e7.6
    (`{a: integer,,}`) are byte-untouched.
  - `tests/generic-argument-shredded-group-refusal.test.ts`,
    `tests/query-annotation-nontype-text-refusal.test.ts` — comment-only: two
    prose mirrors of the pre-fix blanket boundary stated a universal that is
    now measurably false; each points at the one copy (the registry row read
    with the recogniser) instead of restating the boundary.
- Gates: witness RED before / GREEN after, with the neutralisation run by the
  verifier (the blanket `return false` restored in place, every red exactly `[]`
  where the refusal is owed, then written back byte-exact —
  `git hash-object` `cf033301182720e7f5d71ef580b847e17d30977a` before and
  after; no `git stash`, no `git checkout`, no `git restore`); full default
  suite 409 files / 8592 tests green (three files needing an isolated re-run for
  the repository's documented `Hook timed out` load-contention class, green
  there); `npm run typecheck` clean; `npm run lint` clean; live —
  `b0252live-…-live-cell` green under the live lock and its red direction proved
  by a restored byte edit, and `tests/live/live-production-acceptance.test.ts`
  88/88 green.
- Review: 2 rounds. Round 1 (deep) — three findings: the new helper was placed
  between the recogniser's doc comment and the recogniser (house-rule), the
  owed live cell was missing (fidelity), and three prose mirrors of the old
  boundary were stale (prose). Round 2 (fast) — clean, with the round-1
  remedies re-derived independently (including its own red-direction proof of
  the live cell).
- Verification: SOLID. The witness reds on neutralisation with the
  missing-refusal signature and greens on restore, hash-verified; the default
  suite is green; the live cell and the H8a acceptance file were run for real
  under the lock; typecheck and lint pass; §Fix constraint 5's five locks are
  green at their pinned cell counts (bug 0028's RESULT-LET-BRACE included), and
  §Reproduction F was re-measured at this tree (34 committed `.theta` /
  `.thetalib` files, parse gate 36 green) rather than cited.
- Residuals:
  1. **§Expected behaviour 4's "C3 keeps its code" does not hold under route
     (a), and §Expected behaviour 1 is what overrides it.** Once A2's
     annotation is refused, the registry row's own withhold census seeds the
     binding WITHHELD, so the `non-array-iterand` line that read the deferring
     nominal is gone and C3 is the refusal alone; C5 and C6 lose their silence
     for the same reason. The clause holds only under route (b). Bug 0247's
     class is not closed here — it is no longer reachable through THIS
     annotation, since the nominal is never built (B5 still builds one, and
     that row is unmoved).
  2. **Bug 0130's cell e7 rows e7.1–e7.4 flip, enumerated for ratification.**
     B2 refuses only through the shared sink over a keyed junk tail
     (`integer--`); e7.1's `integer>` is the same shape and draws the same sink
     verdict, and no predicate separates them that is not arbitrary. The flip
     is a strengthening (silence → a registered refusal); bug 0130's conversion
     decline is UNTOUCHED (the interior still declines to the deferring
     nominal — the refusal now runs before that deferral is read) and its
     *Residuals* item 4 set is unmoved. Bug 0130's own document is not edited
     by this change.
  3. **A third prose mirror of the pre-fix boundary is left stale on purpose:**
     `src/runtime/query-schema-lowering.ts`'s module header still states that
     brace-and-angle text "is declined before judgement … left exactly as
     landed", which is now false at the `@<T>` position (measured:
     `@<{a: integer--, c: array<integer>}>` draws
     `theta/parse/query-annotation-type-not-expression`). Four OPEN bug
     documents name that file (0054, 0098, 0121, 0244), so it was not edited
     here. Whichever of those lands next owns the reword.
  4. **The third untyped copy of the depth arithmetic is untouched**, as
     §Non-goals directs: `splitTopLevelObjectFields` and `topLevelColonIndex`
     still decrement unconditionally, measured non-causal for every row here.
  5. **The `@<T>` position inherits the narrowing by design.** The recogniser
     is shared and row `:107` says so; a depth-0 stray `>` inside `@<…>`
     terminates the capture itself, so the scan's arm is hard to reach there
     while the sink half is reachable and measured. No test moved at that
     position.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the `[` / `]` decline, the rendering of the
  deferring nominal (bug 0247), grammar-admitted interiors the converter
  declines (bug 0130 *Residuals* item 4), `splitTopLevelUnion`'s
  brace-blindness (bug 0130 *Residuals* item 3), the two `fn` positions and the
  QRY-4 reader, and citation drift (bug 0134) all stay exactly as filed.
