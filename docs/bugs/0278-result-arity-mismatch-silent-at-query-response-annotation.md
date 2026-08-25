# Bug 0278 — A wrong-arity `Result` application at the `@<T>` query annotation draws nothing and registers: the response-annotation peel returns `undefined` for any argument count other than two, so the whole annotation-interior check block is skipped — `@<Result<Ghost>>` and `@<Result<void>>` load clean where `@<Result<Ghost, string>>` refuses and `@<array<Ghost, string>>` draws both `theta/parse/generic-arity-mismatch` and `theta/parse/unresolved-named-type` at the same position

- **Status:** fixed (0.273.0).
- **Sev/Diff estimate:** S3/D1 — S3 because no legal source is refused and no
  value is wrong that is not already wrong for the arity-2 spelling: the
  runtime lowers `Result<integer, string>` and `Result<integer>` alike to `{}`
  (§Reproduction, `LOWER` rows), so the downstream bind is bug 0028's settled
  permissive posture rather than a new mis-bind. Not S4, because the silence is
  not confined to the arity row: the skipped block is the query capture's ONLY
  gate on the annotation interior, so a wrong-arity `Result` also swallows
  `theta/parse/unresolved-named-type`, `theta/parse/void-in-non-return-position`,
  `theta/parse/empty-schema-body`, `theta/parse/reserved-keyword-as-identifier`
  and `theta/parse/query-annotation-type-not-expression` at that position, all
  measured. D1 because the seam is one `if` at one call site
  (`src/parser/theta-document.ts:8854`) and the arity judgement already exists
  (`src/parser/type-grammar.ts:1500`–`:1507`); the only reconciliation needed
  is the double-emission withhold the propagated route already carries
  (`:8882`–`:8886`).
- **Kind:** defect — a registered row does not fire for an input its own
  *Trigger* names verbatim.
  `docs/spec_topics/diagnostics/code-registry-parse.md:65` reads: "A generic-type
  application whose type-argument count does not match the constructor's
  declared arity in the closed `GenericType` set (`array` arity 1, `Result`
  arity 2) — e.g. `array<T, U>` or `Result<T>`." The *Trigger* enumerates no
  position and names `Result<T>` as its own example.
  `docs/spec_topics/grammar.md:99`–`:100` spell the arity
  (`GenericType ::= "array" "<" Type ">" | "Result" "<" Type "," Type ">"`) and
  `:107` restates the rule and admits `Result` in "type-ascription contexts",
  which is what `@<T>` is (`query-forms.md`, the ascription sentences bug 0203
  §Fix cites). The row therefore covers this input at this position and does
  not fire.
- **Affected** (every citation re-derived at HEAD `61c10d22`;
  `src/parser/theta-document.ts` is 9296 lines and `src/parser/type-grammar.ts`
  1745 lines at HEAD):
  - `src/parser/theta-document.ts:6619` —
    `const RESULT_APPLICATION = /^Result\s*<([\s\S]*)>$/`, the peel's pattern:
    it matches ANY argument count.
  - `src/parser/theta-document.ts:6675`–`:6682` — `queryResponseAnnotation`,
    whose body is `return args.length === 2 ? args[0] : undefined;` (`:6681`).
    Every non-2 count yields `undefined`.
  - `src/parser/theta-document.ts:6646`–`:6651` — the peel's own doc block
    stating the contract this report falsifies: "`undefined` means 'this
    annotation has no response part to check': a `Result` application whose
    argument count is not 2 is `theta/parse/generic-arity-mismatch`'s to
    report". No site reports it for an AUTHOR-WRITTEN ascription.
  - `src/parser/theta-document.ts:8853`–`:8854` — the call and the guard
    `if (responseAnnotation !== undefined)`. The guard's body runs the whole
    annotation-interior check set; `undefined` skips all of it, including the
    `E`-side block bug 0273 landed at `:8933`–`:8935`, which is nested inside
    the same guard.
  - `src/parser/theta-document.ts:8882`–`:8886` — the
    `parseTypeExpression(responseAnnotation, "value", …)` call that IS the
    position-rule pass for this capture, and the
    `e.schemaFromLetAnnotation === true ? [] : …` withhold (bug 0093 §Fix
    route 2) that keeps the propagated route from doubling the `let`
    statement's own line. It is fed the PEELED text, never the application.
  - `src/parser/theta-document.ts:6699`–`:6706` — `queryErrorModelAnnotation`,
    the sibling with the identical non-2 declination (`:6705`) and the same
    stated deferral (`:6694`–`:6697`).
  - `src/parser/type-grammar.ts:1500`–`:1507` — the arity mint:
    `const expected = GENERIC_ARITY[node.ctor]` then
    `if (expected !== undefined && node.args.length !== expected)`, inside
    `walkType`'s `"generic"` arm, gated on `rules === "all"` (`:1499`).
    `GENERIC_ARITY` is at `:475`. `Result` is not special-cased here — the arm
    judges `Result` and `array` identically. The bypass is upstream: the
    application never reaches this walk from the query capture.
  - `src/parser/type-grammar.ts:215` — "(`theta/parse/generic-arity-mismatch`)
    is position-independent", the claim the query ascription falsifies for
    `Result`.
  - `src/runtime/query-schema-lowering.ts:153` —
    `lowerQueryResponseSchema(annotation, …)`, and
    `src/extension/production-theta-producer.ts:2749`–`:2754`, where the
    runtime passes `expr.schema` WHOLE — no peel — so both the wrong-arity and
    the arity-2 spelling lower to `{}` (§Reproduction). The `Result` arm's own
    comment (`query-schema-lowering.ts:66`–`:70`) records that posture as
    deliberate.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:65` — the row quoted
    under **Kind**.
  - `docs/spec_topics/grammar.md:99`–`:100`, `:107` — the productions and the
    prose quoted under **Kind**.
  - `./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
    §Non-goals — the recording of this finding as a separate, unowned subject:
    "It is the response-annotation peel's behaviour, not the keyword class's,
    and is a separate subject; no document exists for it yet."
  - `./0273-propagated-result-error-side-unresolved-name-silent.md` §Fix — the
    peel split that added `queryErrorModelAnnotation` beside
    `queryResponseAnnotation` and left both declinations as they were.
  - `./0028-unresolved-annotation-silent-permissive-lowering.md` (fixed,
    0.38.0) — the peel's origin and the sentence assigning a non-arity-2
    application to the arity row.
  - `tests/b0273-query-result-error-side-unresolved-name.test.ts` — bug 0273's
    10-cell witness over this same guard, and its live H8a cell 89.
  - `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` —
    bug 0274's 14-cell witness, whose group (E10) is stated by its own header
    as measuring "the non-arity-2 path"; a fix here must keep that cell's
    subject intact or restate it.
- **Observed at:** HEAD `61c10d22`, v0.272.0, `main`, by one offline
  provider-free scratch probe over `parseDoc` (`tests/helpers/e2e-s1.ts`) and
  one direct `lowerQueryResponseSchema` call, token `b0278scratch`, removed
  after measurement; sweep clean.
- **Scope:** the `@<T>` query response annotation only, for a `Result`
  application whose argument count is not 2. The five other measured type
  positions answer correctly for the same text.

## Summary

`queryResponseAnnotation` peels `Result<T, E>` down to `T` before the query
capture checks anything, and returns `undefined` for any argument count other
than two. The caller's guard (`theta-document.ts:8854`) makes that `undefined`
skip the ENTIRE check block: the position-rule walk, the
non-type-expression refusal, the response-part name resolution, the reserved-keyword
loop, and the `E`-side block. The arity judgement lives inside that walk
(`type-grammar.ts:1500`), so the one diagnostic the peel's doc block defers to
another site never runs at all for an author-written ascription.

The bypass is not a `Result` special case in the arity check. `walkType`'s
`"generic"` arm judges `Result` and `array` alike. `array<integer, string>` at
the same ascription is not a `Result` application, so the peel returns the text
unchanged, the walk sees the application, and the row fires. The asymmetry is
produced entirely by which text the walk is handed.

At the five non-query positions the row fires for wrong-arity `Result`,
including the PROPAGATED query route (`let r: Result<integer> = @`q``), where
the `let` statement's own walk emits it before the query arm runs. The silence
is specific to the annotation the author writes at `@<T>`.

## Reproduction

HEAD `61c10d22`. One offline probe, `mode: prompt` frontmatter
(`---\ndescription: d\nmode: prompt\n---`), body as shown, driven through
`parseDoc` (`tests/helpers/e2e-s1.ts`); `reg` is "no error-severity diagnostic",
the GOV-15 registration reading. Positions are 1-indexed `line:column` of the
diagnostic range; body line 1 is source line 6.

**Matrix — five spellings × six positions.** Each cell is the complete
diagnostic list.

| spelling | `@<T>` ascription | propagated `let a: T = @`q`` | `fn` return | `fn` param | non-query `let` | `invoke<T>` |
| --- | --- | --- | --- | --- | --- | --- |
| `Result<integer>` | **SILENT, reg** | arity `@6:1` | arity `@6:1` | arity `@6:1` | arity `@6:1` | SILENT, reg |
| `Result<integer, string, boolean>` | **SILENT, reg** | arity `@6:1` | arity `@6:1` | arity `@6:1` | arity `@6:1` | SILENT, reg |
| `Result<integer, string>` (control) | SILENT, reg | SILENT, reg | SILENT, reg | SILENT, reg | SILENT, reg | SILENT, reg |
| `array<integer, string>` | arity `@6:9` | arity `@6:1` | arity `@6:1` | arity `@6:1` | arity `@6:1` + `let-rhs-type-mismatch` `@6:1` | SILENT, reg |
| `array<integer>` (control) | SILENT, reg | SILENT, reg | SILENT, reg | SILENT, reg | `let-rhs-type-mismatch` `@6:1` | SILENT, reg |

`arity` is `theta/parse/generic-arity-mismatch`, error severity. Bodies:
`let r = @<T>`q``; `let r: T = @`q``; `fn f(): T { 3 }`; `fn f(a: T): integer
{ 3 }`; `let a: T = 3`; `let r = invoke<T>("./x.theta")` — each followed by
`"ok"`.

Two readings of the matrix. (1) The wrong-arity `Result` rows are silent at the
ascription and refused at the four positions that run the full walk, so the
silence is query-peel-specific. (2) The `invoke<T>` column is silent for BOTH
constructors, including `array<integer, string>`, because that capture selects
`"inline-object-shape"` and withholds the `"all"`-only rules by decision
(`theta-document.ts:8728`–`:8733`, bug 0045 §Fix). That column is not this
report's subject (§Non-goals).

**What else the skipped block swallows.** Same probe, `@<T>` ascription only,
`Ghost` declared nowhere.

| # | annotation | diagnostics | reg |
| --- | --- | --- | --- |
| A1 | `@<Result<Ghost>>` | none | yes |
| A2 | `@<Result<Ghost, string, boolean>>` | none | yes |
| A3 | `@<Result<Ghost, string>>` (arity-2 control) | `theta/parse/unresolved-named-type` `@6:9` | no |
| A4 | `@<Result<void>>` | none | yes |
| A5 | `@<Result<{}>>` | none | yes |
| A6 | `@<Result<match>>` | none | yes |
| A7 | `@<Result<integer\|>>` | none | yes |
| A8 | `@<array<Ghost, string>>` (control) | arity `@6:9` + `unresolved-named-type` `@6:9` | no |
| A9 | `let r: Result<Ghost> = @`q`` | arity `@6:1` | no |

A1 against A3 is the widened face: one extra argument turns an undeclared
response head from a load refusal into silence. A4, A5, A6 and A7 are the
same effect on `void-in-non-return-position`, `empty-schema-body`,
`reserved-keyword-as-identifier` and `query-annotation-type-not-expression`.
A9 shows the propagated route reporting arity from the `let` statement, one
diagnostic, at the statement range.

**Downstream lowering.** `lowerQueryResponseSchema(t, [], [])` called directly:

| `t` | lowered |
| --- | --- |
| `Result<integer>` | `{}` |
| `Result<integer, string, boolean>` | `{}` |
| `Result<integer, string>` | `{}` |
| `array<integer, string>` | `{}` |
| `array<integer>` | `{"type":"array","items":{"type":"integer"}}` |

The wrong-arity annotation lowers to `{}` — a fragment asserting nothing, so
any response payload validates — and so does the arity-2 spelling, because the
runtime hands the WHOLE `expr.schema` to the lowering with no peel
(`production-theta-producer.ts:2749`). The wrong-arity case therefore binds no
worse than the legal one; the defect is the missing refusal, not the bind.

## Expected behaviour

`@<Result<integer>>` and `@<Result<integer, string, boolean>>` each draw one
error-severity `theta/parse/generic-arity-mismatch` at the query expression's
range, with the registered *Message*
(`generic type 'Result' expects 2 type argument(s); got 1` / `got 3`), and the
document is not registered — the same disposition `@<array<integer, string>>`
receives at that position today (`@6:9`), and the same the four full-walk
positions give the same `Result` text.

The interior of a wrong-arity application stays unresolved. The peel cannot say
which argument would have been `T`, and descending the application would name
the builtin `QueryError` and every stray argument as unresolved beside the real
fault — the reason `theta-document.ts:6649`–`:6651` gives. One arity line is
the whole verdict: A1 draws arity alone, not arity plus `Ghost`.

`Result<integer, string>` keeps loading at every position. `array<integer>`
keeps loading. No legal spelling moves.

## Actual behaviour / root cause

By symbol at HEAD `61c10d22`:

1. `walkExpr`'s `"query"` arm computes
   `const responseAnnotation = queryResponseAnnotation(e.schema)`
   (`theta-document.ts:8853`).
2. `queryResponseAnnotation` (`:6675`) matches `RESULT_APPLICATION` (`:6619`),
   splits the interior with
   `splitTopLevel(application[1] ?? "", ",", "angle-and-brace")`, and returns
   `args.length === 2 ? args[0] : undefined` (`:6681`). For one or three
   arguments it returns `undefined`.
3. The caller guards the whole check block on
   `if (responseAnnotation !== undefined)` (`:8854`). `undefined` skips:
   `parseTypeExpression` (`:8884`), the
   `annotationSourceIsNotTypeExpression` refusal (`:8899`–`:8904`), the
   response-part `collectUnresolvedNamedTypes` and its two emission loops
   (`:8907`–`:8921`), and the `E`-side block bug 0273 landed (`:8933`
   onward), which is nested inside the same guard.
4. `parseTypeExpression` is the ONLY route from this capture to `walkType`, so
   the arity check at `type-grammar.ts:1500`–`:1507` never sees the
   application. Nothing in that arm treats `Result` differently from `array`;
   the arm is never reached with the `Result` node at all.
5. `array<integer, string>` at the same position fails the
   `RESULT_APPLICATION` match, so `queryResponseAnnotation` returns the text
   unchanged (`:6677`–`:6679`), the guard passes, and the arity row fires from
   the same walk.

The peel's contract sentence (`:6646`–`:6651`) assigns the arity report to
another site. That holds for the PROPAGATED route — `walkStatement`'s `let`
arm walks the annotation at the statement range before the query arm runs,
which is what cell A9 shows, and is the reason `:8882`–`:8886` withholds the
query-side walk for propagated text. It does not hold for an author-written
`@<T>`, where the query arm is the only walk of that text, and the withhold's
own condition (`e.schemaFromLetAnnotation === true`) is false there — so the
walk that would fire is available and is denied its input by the peel instead.

## Why it matters

- A registered row does not fire for the input its own *Trigger* names as its
  example (`code-registry-parse.md:65`, `Result<T>`), at a position the row's
  *Trigger* does not exclude.
- The skipped block is the query annotation's only interior gate, so the
  arity silence carries five further rows with it (cells A1–A7). An undeclared
  response head, a `void` response, an empty inline object, a reserved keyword
  and a non-`Type` fragment all load and register behind one extra or one
  missing type argument.
- `type-grammar.ts:215` states the arity row is position-independent. The
  ascription falsifies that for `Result`, which makes the seam's own record
  wrong about its coverage.
- The wrong-arity annotation registers and lowers to `{}`, so the QRY-22 gate
  validates nothing for a query whose annotation is malformed. Bug 0028 settled
  `{}` as the permissive lowering for text carrying no lowerable shape; that
  disposition assumed the load gate had already refused the shapes that are
  refusable.

## Non-goals

- **Bug 0277's subject — the UNAPPLIED head — is a sibling, not this
  report.** `let a: Result = 3` and `fn f(): Result { 3 }` reach the atom arm
  of `lowerTypeExpr` and are a keyword-class question at nine captures
  (`./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`).
  Every spelling measured here is APPLIED and never reaches that arm. The two
  subjects are not merged: 0277's own §Non-goals records this finding as
  separate.
- **Bug 0273's `E`-side name walk is unchanged.** Its 10-cell witness and
  live cell 89 cover the arity-2 path
  (`./0273-propagated-result-error-side-unresolved-name-silent.md`). This
  report adds no rule to that walk and asks for no name resolution inside a
  wrong-arity application.
- **Bug 0274's reserved-keyword class is unchanged.** The withheld set
  (`Result` / `array` / `Ok` / `Err`) and its 14-cell witness stay as landed
  (`./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md`).
  Cell A6's silence here is the guard skipping the block, not the withhold.
- **The `invoke<T>` column is a different subject.** That capture withholds the
  `"all"`-only rules by decision (`theta-document.ts:8728`–`:8733`, bug 0045
  §Fix and its §Non-goals), which is why `array<integer, string>` is silent
  there too. Nothing here is a `Result`-vs-`array` asymmetry, and no route in
  this report touches that call's `rules` argument.
- **The `{}` lowering posture is bug 0028's.** `lowerQueryResponseSchema` stays
  a total function returning `{}` where no shape is derivable
  (`./0028-unresolved-annotation-silent-permissive-lowering.md`, decision D1).
  This report asks for a load-time refusal, not a lowering change.
- **The peel's bracket-blindness is bug 0204's / 0236's.**
  `Result<enum["a", "b"], string>` splits into three segments here and takes
  the same non-2 path (`theta-document.ts:6664`–`:6674`). A fix that fires the
  arity row on the non-2 path must not turn that residual into a FALSE arity
  diagnostic for a legal two-argument spelling; that constraint is stated in
  §Fix, and re-agreeing the split with `TypeParser` stays out of scope
  (`./0204-bracket-blind-split-shreds-inline-object-in-generic.md`,
  `./0236-bracket-group-generic-argument-truncates-list.md`).

## Fix

Feed the arity judgement the whole annotation, and keep the peel's interior
deferral. In `walkExpr`'s `"query"` arm (`theta-document.ts:8852` onward), run
the position-rule pass on `e.schema` rather than only on the peeled response
part, under the withhold the propagated route already carries — so an
author-written `@<T>` whose text is a non-arity-2 `Result` application draws
`theta/parse/generic-arity-mismatch` from the existing mint
(`type-grammar.ts:1500`–`:1507`) and the block's remaining checks stay skipped.

Constraints the change is adjudicated against:

1. **One diagnostic for one written annotation.** `@<Result<Ghost>>` draws
   arity alone (no `Ghost` line): the interior of a wrong-arity application
   stays unresolved on the ground `:6649`–`:6651` states. `@<Result<void>>`,
   `@<Result<{}>>`, `@<Result<match>>` and `@<Result<integer|>>` likewise draw
   arity alone.
2. **No double emission on the propagated route.** `let r: Result<integer> =
   @`q`` keeps exactly one arity line, at `@6:1`, from `walkStatement`'s `let`
   arm — the `e.schemaFromLetAnnotation === true` withhold (`:8882`–`:8886`)
   governs the new call too. Cell A9's diagnostic list does not move.
3. **No new line for any arity-2 or arity-1-`array` spelling.**
   `@<Result<integer, string>>`, `@<Result<{a: string, b: integer}, QueryError>>`,
   `@<array<integer>>`, `@<Ghost>` (which keeps its single
   `unresolved-named-type`) and `@<Schema>` are byte-identical before and
   after. In particular `result-in-schema-position` must NOT appear: the
   ascription is `TypePosition` `"value"` (`:8855`–`:8862`), and widening it
   is forbidden there.
4. **The bracket residual draws no false arity line.**
   `@<Result<enum["a", "b"], string>>` is a legal two-argument application the
   peel's split counts as three (§Non-goals). Whatever the route, that
   spelling's diagnostic list must not gain an arity diagnostic — so the arity
   judgement must come from `TypeParser`'s own argument count, not from
   `splitTopLevel`'s.
5. **The peel's doc block is corrected, not left stale.**
   `:6646`–`:6651` currently asserts that another site reports a non-arity-2
   application. After the fix it names the site; the sentence does not stay as
   an unconditional claim.

Locks (existing suites that must stay green, or whose flip must be authorized
and recorded):

- `tests/b0273-query-result-error-side-unresolved-name.test.ts` — 10 cells over
  this same guard; and live H8a cell 89, run only by the orchestrator under the
  shared live lock.
- `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` —
  14 cells; group (E10) is stated by that file's header as measuring "the
  non-arity-2 path" and is the cell this fix is most likely to flip. A flip
  there is authorized only with the cell's subject restated in the same commit.
  Its live sibling `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts`
  is the registration cell.
- `tests/committed-fixture-parse-gate.test.ts` — 36/36 at HEAD (measured); the
  corpus-wide "no shipped source moves" claim is discharged there, not by a
  scratch probe. The corpus's only `Result` spellings are applied at arity 2
  (`docs/examples/personas.thetalib:7`,
  `docs/examples/summarise-doc.theta:10`).
- `tests/conformance/production-conformance.test.ts` — V20g-T.
- `./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
  — no ordering dependency in either direction: 0277 changes what the atom arm
  publishes for an UNAPPLIED head, this changes which text the query capture
  walks for an APPLIED one. Both touch `walkExpr`'s `"query"` arm, so whichever
  lands second rebases on the other's lines.

## Provenance

Recorded as an adjacent finding, with measurements, in
`./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
§Non-goals during the seventeenth open-bug session, and filed as its own
report in that session. Re-measured independently at HEAD `61c10d22`
(v0.272.0) by one offline provider-free probe over `parseDoc` plus one direct
`lowerQueryResponseSchema` call; probe removed, tree clean.

## Fix (0.273.0)

- **What shipped:**
  - `src/parser/theta-document.ts` — one new
    `else if (e.schemaFromLetAnnotation !== true)` branch on the existing
    `if (responseAnnotation !== undefined)` guard in `walkExpr`'s `"query"`
    arm. `queryResponseAnnotation` returns `undefined` for exactly one reason,
    so that branch feeds the WHOLE annotation to
    `parseTypeExpression(e.schema, "value", …)` — reaching the existing arity
    mint in `walkType`'s `"generic"` arm (`type-grammar.ts`) — and pushes only
    the FIRST `theta/parse/generic-arity-mismatch` that call returns
    (§Fix constraint 1: the interior of a wrong-arity application stays
    unresolved; `.find` is first-in-source-order and the `"generic"` arm mints
    the arity line before descending arguments, so the surviving line is the
    outermost application's). The `e.schemaFromLetAnnotation !== true`
    condition is the bug-0093 withhold the response-part call already carries
    (constraint 2). The count comes from `TypeParser`'s parsed
    `node.args.length`, never `splitTopLevel`'s, so
    `@<Result<enum["a", "b"], string>>` gains no false arity line
    (constraint 4).
  - `src/parser/theta-document.ts` — the `queryResponseAnnotation` and
    `queryErrorModelAnnotation` doc blocks corrected to name the reporting site
    (constraint 5).
  - `tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts`
    — new 14-cell / 8-group offline witness.
  - `tests/live/b0278live-result-arity-mismatch-registration.test.ts` — new
    2-cell live registration witness.
  - `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`
    — group (E10) restated under this report's explicit authorization, subject
    preserved, header bullet updated.
  - `tests/b0273-query-result-error-side-unresolved-name.test.ts` — group
    `(arity)` rows `arity-w1` / `arity-w3` restated under the operator
    ratification quoted below.
  - No registry, spec or fixture edit:
    `docs/spec_topics/diagnostics/code-registry-parse.md:65`'s *Trigger*
    already enumerates no position and already names `Result<T>`;
    `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged.

- **Operator ratification of the §Fix Locks overlap (recorded verbatim):**

  > The stop was correct: rows arity-w1/arity-w3 assert that
  > `let r = @<Result<integer>>`q`` draws `[]` and REGISTERS — they pin, as
  > their VEHICLE, the exact pre-fix silence 0278's §Expected behaviour
  > removes; no implementation can keep them green. The parent ratifies the
  > flip as vehicle-collateral, subject-preserving, per the established
  > precedent class (0262 ruling clause (i) re-vehicling; 0274's authorized
  > tripwire batch; the 0268 merge-gate ratification of 0248's witness):
  > BOUND = exactly those two rows in exactly that file, restated per the prior
  > run's draft (author-written rows only — the group's propagated rows and the
  > cell's E-side subject stay untouched); the rows now witness the FIXED
  > behaviour (generic-arity-mismatch drawn, registration refused) so 0273's
  > witness remains a lock at full strength; a dated coordination note is
  > appended to `docs/bugs/0273-*.md` (0.273.0 placeholder) recording the
  > re-vehicle under 0278's fix; if ANY cell beyond those two rows reds ⇒ STOP
  > again immediately. Evidence: the measured blast (suite red at exactly that
  > cell), the direct contradiction between the rows' assertion and 0278
  > §Expected, and the subject-preservation of the draft.

  The bound held: no cell beyond those two rows moved. §Fix's Locks list was
  wrong to call `tests/b0273-…test.ts` an unconditional 10-cell lock, and
  §Non-goals was wrong that b0273's cells "cover the arity-2 path" — group
  `(arity)` pinned the non-arity-2 path's silence at the author-written
  ascription, which is this report's whole subject.

- **Gates:**
  - Witness, RED before the implementation existed:
    `5 failed | 9 passed (14)`, every red reading
    `expected [theta/parse/generic-arity-mismatch], received []`.
    GREEN after: `14 passed (14)`.
  - Full default suite: `Test Files 451 passed (451)` /
    `Tests 9323 passed (9323)`.
  - Typecheck: `tsc -p tsconfig.json --noEmit` — no output.
  - Lint: `eslint --no-error-on-unmatched-pattern "src/**/*.ts"` — no output.
  - Live, run under the shared cross-worktree lock:
    `tests/live/b0278live-result-arity-mismatch-registration.test.ts` →
    `2 passed (2)`; its red-proof (fix branch neutralised) →
    `1 failed | 1 passed (2)`, the offender registering as the pre-fix
    behaviour predicts; restore byte-exact and hash-verified
    (`8d075f91a82eaab1f9f56651c8bceb30c423d6d6` before and after), re-run →
    `2 passed (2)`. `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts`
    (whose E10 flipped) → `1 passed (1)`.
  - Locks: `tests/b0274-…` 14 passed, `tests/b0273-…` 10 passed,
    `tests/b0262-…` 26 passed, `tests/committed-fixture-parse-gate.test.ts`
    36/36, `tests/conformance/production-conformance.test.ts` 27 passed
    (V20g-T), `tests/citation-symbol-form-gate.test.ts` 3 passed.

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — verdict FINDINGS, two:
  F1 [test], the implementer had renumbered `src/parser/theta-document.ts:<line>`
  citations in twelve unrelated test files by `+5`, and the reviewer's
  resolution of a six-citation sample found NONE pointed at the construct its
  prose names even after the shift — the drift is pre-existing and committed
  and the rewrite increased it; R1 [prose], a stray `}` in a new WHY comment.
  Both resolved by the orchestrator as a bounded citation/comment-only
  correction: the twelve files were reverted byte-exact to HEAD, 12/12
  hash-verified (`git hash-object` == `git rev-parse HEAD:<path>`), zero
  assertion and zero executable changes; R1 fixed in place. Polish verified by
  gate-diff; confirmation round skipped per the post-polish rule.

- **Verification:** SOLID (`bug-fix-verifier`, one round, findings: none).
  - Witness genuinely reds without the fix: the new branch's guard was
    neutralised in place after capturing the working-tree hash; the witness
    read `5 failed | 9 passed (14)` with the diff shape
    `- ["theta/parse/generic-arity-mismatch"] / + []` across all five reds —
    the filed reason, and the same group set (R, A-red, KW) recorded as red at
    HEAD; restored byte-exact, hash matched, `14 passed (14)`.
  - Full default suite green: 451 files / 9323 tests, zero failed.
  - Lint and typecheck: both clean, no output.
  - Live end-to-end coverage of the fixed path: run by the orchestrator under
    the lock, both directions proven (see Gates).
  - Bounding of the b0273 restatement confirmed against the diff: indices 0–1
    moved, indices 2–3 byte-identical and still asserted at `6:1`, and
    `arity-w3`'s undeclared `Nope` still draws no `unresolved-named-type`.

- **Residuals:**
  1. **Pre-existing citation drift in twelve test files** (`~700`–`1800` lines
     stale, measured by the round-1 reviewer; e.g. `walkExpr` cited at `:7355`,
     actually at `8674`) is real, predates this change, and is deliberately NOT
     repaired here — it is a separate subject and would widen this fix into
     twelve unrelated files. Worth its own report.
  2. **The 0277 ordering note holds and is now quantified.** 0277 changes what
     the atom arm publishes for an UNAPPLIED head; this changes which text the
     query capture walks for an APPLIED one. Both touch `walkExpr`'s `"query"`
     arm. This change adds `+5` lines before `theta-document.ts` HEAD:8967 and
     `+37` at HEAD:8967 — 0277's owner must re-derive line citations rather
     than assume.
  3. **§Fix's Locks list and §Non-goals were wrong about b0273's coverage**
     (recorded above under the ratification). The correction is the coordination
     note appended to `docs/bugs/0273-…md`; no other document changes.

- **Discharge notes appended:**
  `./0273-propagated-result-error-side-unresolved-name-silent.md` — the
  `(arity)` re-vehicle under this fix, its bound and what stayed byte-stable;
  `./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md`
  — row E10's restatement.

- **Pinned dispositions / non-goals:** the `{}` lowering posture stays bug
  0028's — this is a load-time refusal, not a lowering change; the `invoke<T>`
  column stays silent under bug 0045's withheld `"all"`-only rules; bug 0273's
  `E`-side name walk gains no rule and no name is resolved inside a wrong-arity
  application; bug 0274's withheld keyword set is unchanged; the peel's
  bracket-blind split (bugs 0204 / 0236) is not re-agreed with `TypeParser` and
  `@<Result<enum["a", "b"], string>>` draws no arity line;
  `result-in-schema-position` does not appear — the ascription stays
  `TypePosition` `"value"`; no *Message* byte and no registry row moved.
