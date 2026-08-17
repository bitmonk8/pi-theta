# Bug 0186 — `docs/spec_topics/runtime-value-model.md:37` states that frontmatter `params:` defaults "bypass the inbound translation pass", and at HEAD every filled default goes THROUGH it: since bug 0172 face 1 (0.97.0) the merged `args` — defaulted fields included — are exactly what `paramBindingsFrom` hands `bindParamsInbound`, and since bug 0181 (0.103.0) an `Enum.Variant` default is deliberately projected to WIRE form at recovery so that the pass the sentence denies is the mechanism that re-establishes its enum tag, which makes the same section's own worked example (`frontmatter-fields-a.md:67`, `severity: Severity = Severity.Medium`) bind tagged only because the bypass does not happen — the falsehood is mirrored verbatim at `docs/reference/type-system.md:162`, restated in three test-file comments, and named as a divergence "whose reconciliation is a separate report" by two shipped code comments that this report is the referent of

- **Status:** open. §Fix is settled in shape: `runtime-value-model.md:37`'s
  bypass clause is rewritten to state the shipped mechanism, its
  `docs/reference/type-system.md:162–164` mirror moves in the same commit,
  `frontmatter-fields-a.md:71`'s "without a separate restoration pass" is
  reconciled to the reading bug 0181's `## Fix (0.103.0)` recorded, and the two
  code comments drop their "separate report" pointers. No executable byte
  changes. Ordering: nothing blocks this report from starting and it blocks
  nothing.
  [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) is
  **fixed (0.103.0)**, commit `e73c1aca` — the provenance and the run that made
  the divergence load-bearing. That fix's ten-cell witness
  (`tests/params-default-enum-access-merge.test.ts`) is the behavioural lock
  this report may not move.
- **Sev/Diff estimate:** S4/D2 — S4 because behaviour at HEAD is correct and
  witnessed: the worked-example spelling binds, tagged, through a shipped green
  test (§Reproduction (d)), and no author input, no diagnostic and no
  `theta-system-note` depends on the sentence. D2 rather than D1 because the fix
  adjudicates wording across four documents and five prose surfaces that must
  agree afterwards — the spec sentence (`runtime-value-model.md:37`), its
  reference mirror (`type-system.md:162–164`), `frontmatter-fields-a.md:71`'s
  independent "without a separate restoration pass" claim, the two code comments
  that currently correct their own spec page, and three test comments that
  restate the bypass — where D1 is "one file or one sentence". The subsystem is
  one (the inbound translation boundary), no registry row is engaged, and no new
  witness is owed.
- **Kind:** spec-prose defect — a normative sentence one generation behind the
  shipped mechanism, in the direction that licenses removing the mechanism. The
  [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) /
  [0112](./0112-containment-records-inv5-label-and-coverage-row.md) family:
  behaviour is correct, the record is not. No `theta/*` code, REQ-ID, registry
  row or plan leaf is engaged; the registry is untouched, so
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) is not in
  play, and GOV-15's three observables
  ([source-language-stability.md:5](../spec_topics/governance/source-language-stability.md#gov-15))
  are unaffected because the change is prose only. The internal inconsistency is
  local to one page: `runtime-value-model.md:34` closes the inbound boundary set
  at four with binder `args` among them, and `:37` exempts the one class of
  binder-`args` value the runtime constructs itself.
- **Related:**
  - [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) —
    **fixed (0.103.0)**, commit `e73c1aca`. Provenance (residual 2 of that run,
    `.pi/tmp/fixes/0181-report.md` §*Residuals / notes*, recorded in the
    document's `## Fix (0.103.0)` §*Spec-sentence readings* at `:1116–1133`) and
    the source of the two readings this report inherits: that `:37` "is at odds
    with HEAD independently of this fix" (`:1128–1133`) and that
    `frontmatter-fields-a.md:71`'s guarantee "holds and is measured … No
    *separate* pass exists" (`:1118–1127`). Its §Non-goals (`:926–933`) is what
    deferred the sentence: "if the sentence needs to move, that is a separate
    report". This is that report. It adds no finding to 0181 and moves no byte
    0181 owns.
  - [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) —
    **fixed (0.102.0)**, two faces at two versions. Face 1 (`c2d22aad`, 0.97.0)
    is what falsified the sentence: it wired the binder-`args` boundary through
    `bindParamsInbound`, so the merged record — defaults included — began
    entering the pass. Face 2 (`ac4687db`, 0.102.0) threaded the compiled
    validator into that boundary, which is what re-tags a default sitting at a
    union arm (§Reproduction (d), cell 5). That document's own §Non-goals
    (`:956–959`) still repeats the bypass and cites it as
    `runtime-value-model.md:36`; both the claim and the line are stale, and
    bug-document prose is out of this report's scope (§Non-goals).
  - [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) — **fixed
    (0.98.0)**, commit `f912a8c3`. Owner of `projectForValidation`, the wire-form
    projection 0181 reused at the recovery site. Its §Non-goals (`:787–790`)
    carries the same bypass restatement, on the same terms as 0172's.
  - [0163](./0163-params-default-type-compat-unchecked-at-load.md) — **fixed
    (0.88.0)**. Deferral-family context: its row c6 fixture is 0181's witness
    cell 10, and its `type-system.md:48` safety-net reading is the reason an
    `Enum.Variant` default reaches the runtime AJV check at all rather than a
    load-time one.
  - [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md) —
    **fixed (0.97.0)**. The one place in the corpus that reasons *from* the false
    sentence: `:543–547` argues that `:37`'s "already branded" "cannot be read as
    an obligation on the pass" because "its subject is the path that *bypasses*
    the inbound pass". At HEAD there is no such path for a filled default. That
    conclusion is not disturbed here (0120 is closed and its brand-installation
    route landed on other grounds); it is cited as evidence that the sentence is
    load-bearing in argument, not only in prose.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, and the
    boundary this report is not. 0134's class is a `path:line` whose file,
    symbol and predicate are right and whose number moved. Every number below
    resolves at HEAD, and re-deriving them changes nothing: the claim is false
    about the mechanism, not about a position.
- **Affected** (every citation re-verified against the tree at HEAD `d470996e`,
  v0.103.0, by `git show HEAD:<path>` and `rg`; symbols named beside lines):
  - **The false sentence.** `docs/spec_topics/runtime-value-model.md:37`, the
    paragraph closing the §*Wire-name translation* block, verbatim:

    ```
    Frontmatter `params:` defaults bypass the inbound translation pass: defaults are written in the [Theta literal sublanguage](./grammar.md#theta-literal-sublanguage), parsed as ordinary Theta values at frontmatter-parse time, and therefore arrive at the theta body already branded and theta-side-named. `Severity.High` written as a default produces a value indistinguishable from `Severity.High` written in body code; cross-enum equality and `JSON.stringify` behave identically for the two paths.
    ```

    Its second sentence is true and is not at issue.
  - **The sentence it contradicts, on the same page.**
    `runtime-value-model.md:34`, the inbound bullet, closing: "The rule applies
    uniformly to every inbound boundary — typed query results, tool-call return
    decoding where typed, `invoke` returns, and binder `args` — and is not
    restated per call site." Unchanged by this report.
  - **The reference mirror that restates the bypass.**
    `docs/reference/type-system.md:162–164`, verbatim:

    ```
    Frontmatter `params:` defaults bypass the inbound pass — defaults are written in
    the [literal sublanguage](./grammar.md#theta-literal-sublanguage), parsed as
    ordinary Theta values, and arrive already branded and theta-side-named.
    ```

    The same page's `:156–158` already carries the four-boundary rule ("Applies
    uniformly to typed query results, typed tool-call returns, `invoke` returns,
    and binder `args`"), so the contradiction is mirrored too. `:193–194`
    (§Provenance) names `docs/spec_topics/runtime-value-model.md` as this
    section's source, which is the lock-step hook.
  - **The reference mirror that does NOT restate it.**
    `docs/reference/frontmatter.md:101–117` (§*Defaults*). Checked line by line:
    it names the literal sublanguage, the admitted production set including
    `Enum.Variant`, the diagnostics, and at `:110–112` "When a slash-command
    invocation omits the positional argument, the default fills in before AJV
    validation." It makes no claim about the inbound pass and needs no edit. This
    confirms 0181's residual-2 note.
  - **The independent author-facing claim.**
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:71`, verbatim:

    ```
        Because the literal sublanguage *is* a subset of the body expression grammar, `Enum.Variant` defaults preserve the runtime enum brand (see [Runtime Value Model](../runtime-value-model.md)) without a separate restoration pass, and discriminated-union variant defaults are written via the variant schema name (`Cat { ... }`) just as they are in body code — there is no second "wire-form" dialect for authors to learn.
    ```

    Its neighbours: `:60` (§*Defaults*, the admitted production set and
    "the default is filled in before AJV validation") and `:67`, the section's
    own worked example `severity: Severity = Severity.Medium` inside the YAML
    block at `:62–69`.
  - **The two shipped code comments that state the divergence and name a report
    that does not exist.** `src/runtime/inbound-boundary.ts:122–132`, the closing
    paragraph of `bindParamsInbound`'s doc-comment (the function is `:134`),
    verbatim:

    ```
     * A theta with no `params:` has no lowered document to plan against, so its
     * record is projected unchanged. A filled default DOES arrive here: the
     * merged `args` `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`)
     * produces are exactly what `paramBindingsFrom`
     * (`src/extension/theta-composition-producer.ts:99`) hands this function,
     * defaulted fields included, and for a value in WIRE form this pass is what
     * re-tags a named-enum position / re-brands a schema-typed one.
     * `runtime-value-model.md:37` still states that `params:` defaults "bypass the
     * inbound translation pass" — a divergence that pre-dates bug 0181's fix (a
     * bare-wire-string default is already re-tagged here, per bug 0181 §Reproduction
     * (e)) and whose reconciliation is a separate report (bug 0181 §Non-goals).
    ```

    `src/runtime/wire-translation.ts:35–43`, the module header, verbatim:

    ```
    //   Frontmatter `params:` defaults DO reach this pass: the merged `args`
    //   `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`) produces, defaulted
    //   fields included, are exactly what the binder-`args` inbound boundary
    //   (`bindParamsInbound`, `inbound-boundary.ts`) translates, so a default in WIRE
    //   form is re-tagged / re-branded here exactly as any other validated value is.
    //   `runtime-value-model.md:37` still states that defaults "bypass the inbound
    //   translation pass" — a divergence that pre-dates bug 0181's fix (a
    //   bare-wire-string default is already re-tagged here, per bug 0181 §Reproduction
    //   (e)) and whose reconciliation is a separate report (bug 0181 §Non-goals).
    ```

    Both were rewritten by `e73c1aca`; both are the "separate report" pointer
    this document answers. `wire-translation.ts` is 675 lines at HEAD and
    `inbound-boundary.ts` 174, the counts 0181's fix reflowed them to so their
    self-citations resolve.
  - **The mechanism, end to end** (each read at HEAD):
    `src/extension/production-theta-producer.ts:1292` (`#recoverDeclaredDefaults`),
    `:1332–1340` (the WHY of the projection) and `:1343` — the pushed value is
    `projectForValidation(evaluatePureExpression(parsed, env))`, the one
    executable line `e73c1aca` added; `:1263–1266`, the sole call site, reached
    only from the binder pass; `:718`, the `schemaValidator` accessor.
    `src/binder/defaulting.ts:37–45` — `DefaultedField.defaultValue`'s
    doc-comment, now "in WIRE form … not a theta-side runtime value"; `:136`, the
    fill that writes the default into the merged record; `:158`, the AJV call;
    `:161`, the merged record returned as `args`.
    `src/extension/theta-composition-producer.ts:99` (`paramBindingsFrom`),
    `:107` (its `bindParamsInbound` call), `:417` (the call site, passing
    `binderResult.args` and `deps.schemaValidator`).
    `src/runtime/inbound-boundary.ts:134` (`bindParamsInbound`), `:139`
    (`decodeInboundValue`), `:96` (`PARAMS_ROOT_ANNOTATION`).
  - **The path on which a default value is never constructed at all**, so no
    surviving reading of "bypass" is rescued there:
    `src/extension/production-composition.ts:1499–1502` computes `invoke(...)` /
    `.theta`-callable arity from `field.hasDefault` alone. `rg -n
    'defaultedFields|hasDefault' src/` returns no other value-producing consumer.
  - **The landed witness.** `tests/params-default-enum-access-merge.test.ts`
    (1039 lines, 10 cells) — cell 1 at `:713–755` and cell 5 at `:854–908` are
    the two this report rests on. Not modified by this report and not to be
    weakened by its fix.
  - **Three test-file comments that restate the bypass.**
    `tests/wire-name-translation.test.ts:20–21` ("Frontmatter `params:` defaults
    BYPASS the inbound pass — they arrive already branded and theta-side-named")
    plus the `describe` title at `:137` and the `it` title at `:138` ("a
    frontmatter default arrives already branded and theta-side-named, bypassing
    the inbound pass"), whose two assertions (`:156`, `:158`) test equality
    between a translated model output and a locally built enum value and do not
    test a bypass. `tests/inbound-boundary-binder-args.test.ts:278–280` and
    `tests/inbound-union-arm-dispatch.test.ts:1164–1166` carry the identical
    two-line justification for a fixture choice: "The fixture declares no
    `= <literal>` defaults: frontmatter defaults bypass the inbound pass by
    specification, so a defaulted field would arrive already theta-side and could
    not witness this boundary."
- **Observed at:** v0.103.0 (`d470996e`, `package.json:3`), the commit after
  0181's fix `e73c1aca`. Offline, deterministic, provider-free: `git show`,
  `rg`, and one run of a committed test file. The witness run in
  §Reproduction (d) was taken with `git status --short` empty. A sibling session
  transiently dirtied `src/parser/type-compat.ts` (bug 0179) and added
  `tests/scratch-0185-unresolvable-variant.test.ts` during measurement; neither
  is a file this report cites, and every citation above is read from
  `git show HEAD:<path>` rather than from the working tree.

## Summary

`runtime-value-model.md` §*Wire-name translation* states the inbound rule once
and closes its boundary set at four, binder `args` among them (`:34`). Three
lines later it exempts one class of binder-`args` value: "Frontmatter `params:`
defaults bypass the inbound translation pass" (`:37`).

At HEAD nothing bypasses. A filled default is written into the merged `args`
(`defaulting.ts:136`), the merged record is returned as `args` (`:161`), and
that record — whole, defaulted fields included — is what `paramBindingsFrom`
hands `bindParamsInbound` (`theta-composition-producer.ts:99`, `:107`, called at
`:417`). Bug 0172 face 1 (0.97.0) wired that boundary; bug 0174 (0.98.0) built
the wire-form projection; bug 0181 (0.103.0) applied the projection to the
recovered default itself, so an `Enum.Variant` default now reaches the merge as
a bare wire string on purpose and its enum tag exists at the body **because**
the inbound pass re-attaches it.

That inverts the sentence's role. It no longer merely misdescribes a path; it
denies the mechanism that makes the section's neighbouring worked example
correct. `frontmatter-fields-a.md:67` supplies `severity: Severity =
Severity.Medium` as the canonical spelling, and the only reason that spelling
binds as a tagged variant rather than as the string `"medium"` is the pass
`:37` says it skips.

Two shipped code comments already say this, in the module that owns the pass and
in the function that performs it at the binder boundary, and both defer the
correction to "a separate report". The bypass is additionally mirrored verbatim
at `docs/reference/type-system.md:162`, asserted in one test title, and used as
the stated justification for a fixture choice in two more test files. The
reference frontmatter page (`docs/reference/frontmatter.md:101–117`) does not
carry the claim.

A second sentence needs reconciling with the same facts:
`frontmatter-fields-a.md:71` says `Enum.Variant` defaults "preserve the runtime
enum brand … without a separate restoration pass". Bug 0181's `## Fix (0.103.0)`
recorded the reading under which that holds — the purpose is satisfied and no
*separate* pass exists — while the brand is in fact destroyed at recovery and
re-established by an existing boundary. The wording states an author guarantee
that HEAD keeps by a route the words do not describe.

## Reproduction

At HEAD `d470996e` (v0.103.0). Steps (a)–(c) and (e) are reads; step (d) runs a
committed test file.

**(a) The sentence, and the sentence it contradicts.**

```sh
git show HEAD:docs/spec_topics/runtime-value-model.md | sed -n '34p;37p'
```

`:34` closes the inbound boundary set at four including binder `args`. `:37`
opens "Frontmatter `params:` defaults bypass the inbound translation pass".

**(b) The two code comments that contradict `:37` from inside the runtime.**

```sh
git show HEAD:src/runtime/inbound-boundary.ts   | sed -n '122,133p'
git show HEAD:src/runtime/wire-translation.ts   | sed -n '35,43p'
```

Both read "A filled default DOES arrive here" / "defaults DO reach this pass",
both quote `runtime-value-model.md:37` back, and both close "whose
reconciliation is a separate report (bug 0181 §Non-goals)".

**(c) The mechanism, without a probe.**

```sh
git show HEAD:src/extension/production-theta-producer.ts | sed -n '1332,1344p'  # projectForValidation at recovery
git show HEAD:src/binder/defaulting.ts                   | sed -n '37,45p'      # defaultValue is WIRE form
git show HEAD:src/binder/defaulting.ts                   | sed -n '132,139p'    # the fill writes it into `merged`
git show HEAD:src/binder/defaulting.ts                   | sed -n '160,162p'    # `merged` is returned as `args`
git show HEAD:src/extension/theta-composition-producer.ts | sed -n '99,113p'    # the whole record → bindParamsInbound
git show HEAD:src/extension/theta-composition-producer.ts | sed -n '417p'       # the call site, with the validator
```

There is one producer of `DefaultedField.defaultValue`
(`#recoverDeclaredDefaults`) and it projects; one consumer of the merged `args`
on the binder path (`paramBindingsFrom`) and it translates. No branch skips the
pass for a defaulted key: `bindParamsInbound` receives a record, not a
per-field provenance.

**(d) The landed witness, run.** Bug 0181's ten-cell offline suite drives the
real `ProductionThetaProducer.runBinder()` through the shipped
`composeThetaFixture(...).run(...)` entry, so the bound values are read off the
real `paramBindingsFrom` output at its real call site.

```sh
npx vitest run tests/params-default-enum-access-merge.test.ts
```

→ `Test Files 1 passed (1)` / `Tests 10 passed (10)` (2.26 s, `vitest 2.1.9`).

The two cells that settle this report, run individually and green:

```sh
npx vitest run tests/params-default-enum-access-merge.test.ts -t "binds it TAGGED"
npx vitest run tests/params-default-enum-access-merge.test.ts -t "reaches the body as a tagged variant"
```

- **Cell 1** (`:713–755`, `sev: 'Sev = Sev.High'`) asserts that the merged args
  are `{ topic: "hello", sev: "high" }` (`:735`) — the default in wire form, no
  carrier — and that the bound value satisfies `isEnumValue` (`:742`) and
  `valuesEqual(sev, SEV_HIGH)` (`:746`). The only step between those two
  observables is `paramBindingsFrom`. The tag is produced by the pass.
- **Cell 5** (`:854–908`, `sev: 'Sev | null = Sev.High'`) does the same at a
  union arm and pins the mechanism twice: `capture.schemaValidatorThreaded`
  (`:887`) proves the composition supplies the validator, and a second call to
  `bindParamsInbound` with the validator withheld (`:898–906`) yields
  `isEnumValue === false`. Without the pass — or without 0172 face 2's validator
  thread through it — the same default binds an untagged string.

Cell 1's fixture is the shape of `frontmatter-fields-a.md:67`'s worked example;
cell 10 (`p: 'Sev = Sev.A'`) is bug 0163 deferral row c6's exact fixture.

**(e) The mirrors.**

```sh
rg -n 'bypass the inbound' docs/ src/ tests/
git show HEAD:docs/reference/type-system.md | sed -n '156,164p;193,194p'
git show HEAD:docs/reference/frontmatter.md | sed -n '101,117p'
```

Hits outside `docs/bugs/**`: `docs/spec_topics/runtime-value-model.md:37`,
`docs/reference/type-system.md:162`, `src/runtime/wire-translation.ts:40` (the
quote-back), `tests/inbound-boundary-binder-args.test.ts:279`,
`tests/inbound-union-arm-dispatch.test.ts:1165`, and
`tests/wire-name-translation.test.ts:21`/`:138` under the spelling "BYPASS the
inbound pass" / "bypassing the inbound pass". `docs/reference/frontmatter.md`
returns nothing: its §*Defaults* bullet stops at "the default fills in before AJV
validation" (`:110–112`).

## Expected behaviour

- **A normative sentence describes the mechanism that ships.** `docs/STYLE.md:28`
  §Claims: "Every claim is testable or is removed." "Defaults bypass the inbound
  translation pass" is decided by reading one call chain and running one
  committed test, and at HEAD the answer is that they do not.
- **One page does not contradict itself three lines apart.** `:34` names binder
  `args` as an inbound boundary the rule applies to "uniformly … and is not
  restated per call site". `:37` then exempts the one binder-`args` value class
  the runtime itself produces.
- **A spec page is not corrected by the code that implements it.** Two shipped
  comments currently carry the correction and point at a report. The correction
  belongs on the page; the comments should state the rule and stop citing an
  open divergence.
- **The reference mirror agrees with its source.**
  `docs/reference/type-system.md:193–194` declares `runtime-value-model.md` as
  the source for this section, so `:162–164` moves when `:37` moves.
- **`frontmatter-fields-a.md:71` resolves to a stated reading.** Either the
  author guarantee is stated as a guarantee about the observed value (which
  holds, and is measured by 0181's cells 1–5 and 8), or the mechanism clause is
  qualified. As written it asserts an implementation property — that no
  restoration happens — which is false at HEAD, next to a worked example whose
  correctness depends on the restoration.

## Actual behaviour / root cause

### The sentence, clause by clause

`runtime-value-model.md:37` makes four assertions. Their status at HEAD:

| Clause | Status at HEAD |
| --- | --- |
| "Frontmatter `params:` defaults bypass the inbound translation pass" | **False.** The merged `args` are handed whole to `bindParamsInbound`; nothing partitions defaulted keys out (`theta-composition-producer.ts:99–113`). |
| "defaults are written in the Theta literal sublanguage, parsed as ordinary Theta values at frontmatter-parse time" | **True.** `frontmatter-fields-a.md:60`; the recovery re-parses through the body evaluator (`production-theta-producer.ts:1328`, `:1343`). |
| "and therefore arrive at the theta body already branded and theta-side-named" | **False as a mechanism** ("therefore"), **true as an outcome**. An `Enum.Variant` default is projected to wire form at recovery (`:1343`) and is branded again by the pass. |
| "`Severity.High` written as a default produces a value indistinguishable from `Severity.High` written in body code; cross-enum equality and `JSON.stringify` behave identically for the two paths." | **True**, and measured — cells 1–5 each assert `valuesEqual` against a locally constructed variant, and cells 1, 2, 4 and 5 assert `isEnumValue` as well. |

The defect is in the first and third clauses. The second and fourth stay.

### What ships

1. **Recovery.** `#recoverDeclaredDefaults`
   (`production-theta-producer.ts:1292`) reads the frontmatter bytes,
   re-parses each defaulted field's RHS, evaluates it through the theta's own
   body environment, and pushes
   `projectForValidation(evaluatePureExpression(parsed, env))` (`:1343`). The
   projection is deliberate and is the whole of bug 0181's executable change;
   its WHY is at `:1332–1340`. `DefaultedField.defaultValue` is contractually
   wire form (`defaulting.ts:37–45`) and `#recoverDeclaredDefaults` is its one
   producer.
2. **Merge.** `fillDefaultsAndRevalidate` copies the binder args and writes each
   absent field's declared default into the copy (`defaulting.ts:132–139`), runs
   ceiling #4's depth walk, then AJV-validates the merged record (`:158`) and
   returns it as `args` (`:161`). By construction the merged record is
   homogeneous wire form: a `JSON.parse`d binder half and a projected default
   half.
3. **Inbound.** `paramBindingsFrom` (`theta-composition-producer.ts:99`) passes
   the merged record, the theta's lowered `params:` document, the body and the
   runtime's `SchemaValidator` to `bindParamsInbound` (`:107`), at the one call
   site `:417`. `bindParamsInbound` (`inbound-boundary.ts:134`) plans the whole
   record under `#params` and calls `decodeInboundValue` (`:139`), which runs
   `translateInbound`. The record is translated **whole** and only then split
   into per-name bindings, so a defaulted key is indistinguishable from a
   binder-supplied one at that seam.

So the tag on `sev` in cell 1 is not carried from frontmatter-parse time. It is
destroyed at step 1 and re-established at step 3.

### Two generations, two different falsehoods

The sentence was consistent with a tree in which the binder-`args` boundary did
not perform the pass at all — the state bug 0172 reports: after the 0067 fix
"`translateInbound` still has exactly one production caller", with binder `args`
binding the raw AJV-validated payload. Face 1 (`c2d22aad`, 0.97.0) ended that.
From 0.97.0 the sentence was **incidentally** false: a bare-wire-string default
(`sev: 'Sev = "high"'`) was already being carried into `bindParamsInbound` and
re-tagged there, which bug 0181 measured as its §Reproduction (e) and recorded in
§Non-goals (`:926–933`): "at HEAD the merged `args` carry them into
`bindParamsInbound`, and for a bare-wire-string default the pass changes the
value … That is a consequence of 0172's face-1 wiring".

Bug 0181 (`e73c1aca`, 0.103.0) made it **load-bearing**. Before that fix an
`Enum.Variant` default never reached the body at all — the boxed `String`
carrier was refused by the post-default-merge AJV check and the invocation ended
`bound: false`. The fix routes that spelling deliberately through wire form,
which means the enum tag `frontmatter-fields-a.md:71` promises and `:67`'s worked
example depends on is now supplied by the pass `:37` denies. Face 2 of 0172
(`ac4687db`, 0.102.0) is a second load-bearing thread: at a union-typed param the
tag is restorable only through the arm re-test, which needs the validator
(cell 5, `:887` and `:898–906`).

### The reading `frontmatter-fields-a.md:71` needs

Bug 0181's `## Fix (0.103.0)` recorded it (`:1118–1127`), verbatim:

```
  - `frontmatter-fields-a.md:71` ("`Enum.Variant` defaults preserve the runtime
    enum brand … **without a separate restoration pass**") — the author-facing
    guarantee holds and is measured: the default reaches body scope
    indistinguishable from a body-code `Sev.High` (`isEnumValue` true,
    `valuesEqual` true at all four positions; `schemaTagOf` `"Box"` with keys
    `["sev","who"]`). No *separate* pass exists. The tag is re-established by the
    binder-`args` inbound boundary `runtime-value-model.md:34` already mandates
    over binder `args` — the same pass that already re-tagged the bare-wire-string
    spelling before this fix. The sentence describes what an author must know; it
    does not name an implementation route.
```

The purpose reading holds and is witnessed. The letter does not: the brand is
destroyed at projection and re-established by an existing pass. The word
"separate" is doing all the work, and it is doing it silently — a reader with no
access to that fix record reads `:71` beside `:37` and concludes that no
restoration happens anywhere.

### The mirrored and derived surfaces

- `docs/reference/type-system.md:162–164` restates the bypass in condensed form,
  three lines below its own four-boundary rule at `:156–158`. Same contradiction,
  same page.
- `tests/wire-name-translation.test.ts:137–138` names a `describe`/`it` pair
  after the bypass. Its assertions (`:156`, `:158`) compare a translated model
  output against `makeEnumValue("Severity", "high")` and check
  `JSON.stringify`. Both pass and neither tests a bypass; the titles claim more
  than the cell measures, and the file header repeats the claim at `:20–21`.
- `tests/inbound-boundary-binder-args.test.ts:278–280` and
  `tests/inbound-union-arm-dispatch.test.ts:1164–1166` justify declaring no
  defaults in their fixtures on the ground that "a defaulted field would arrive
  already theta-side and could not witness this boundary". At HEAD a defaulted
  field is precisely what witnesses that boundary — 0181's cell 1 does it. The
  fixture choice is defensible (those files isolate other properties); the
  reason given is not.
- `docs/bugs/0172-…:956–959` and `docs/bugs/0174-…:787–790` repeat the bypass in
  their §Non-goals; 0172's copy also cites `runtime-value-model.md:36` for a
  sentence at `:37`. Bug documents record their own HEAD and are not rewritten
  (§Non-goals).

### Root cause

The sentence was written to answer an author's question — "do I need to write
defaults in wire form?" — and answered it with an implementation claim about a
pass. The pass then acquired three more boundaries (0172 face 1), a union-arm
dispatch (0172 face 2) and a wire-form projection on its own inputs (0174, 0181),
each of which moved the mechanism without touching the sentence, because each
fix's §Non-goals correctly scoped the sentence out. Nothing in the corpus
mechanically links a spec claim about a pass to the pass's call-site set, so the
claim aged in place while the code documented the divergence twice.

## Why it matters

- **The sentence licenses removing the mechanism it depends on.** A reader
  optimising the binder path who accepts `:37` concludes that a defaulted field
  needs no inbound handling, and that the validator thread at
  `theta-composition-producer.ts:417` is redundant for it. Dropping either turns
  cell 1 or cell 5 red — and, without those cells, would silently bind
  `"medium"` where the spec's own worked example promises `Severity.Medium`.
  Bug 0181's fix report states it for siblings: "The theta-side tag/brand is
  re-established one step later by `bindParamsInbound`."
- **Two shipped comments defer the correction to a report.** The `src/`
  comments are correct and current; what they cite is a pending reconciliation.
  Until it lands, the runtime's own record of a normative page reads as an open
  defect.
- **The corpus already reasons off the false premise.** Bug 0120 (`:543–547`)
  argues that `:37` "cannot be read as an obligation on the pass" because "its
  subject is the path that *bypasses* the inbound pass". That inference is
  unsound at HEAD. It reached a conclusion that survived on other grounds, which
  is luck rather than a property of the argument.
- **Three test comments teach the wrong rule to the next fixture author.** Two
  say a defaulted field "could not witness this boundary"; one titles a cell
  after a bypass it does not test. A maintainer trusting them writes fixtures
  that avoid the exact input class 0181 had to add ten cells for.
- **It is a contradiction inside one section.** `:34` and `:37` cannot both be
  followed. An implementer choosing `:37` over `:34` for binder `args` would
  reintroduce bug 0172 face 1 for one value class and be able to cite the spec
  for it.

## Fix

Prose only. No executable byte, assertion, fixture, diagnostic or gate changes;
`tests/params-default-enum-access-merge.test.ts` stays green unchanged.

1. **`docs/spec_topics/runtime-value-model.md:37` — rewrite the first sentence to
   state what ships.** Keep the paragraph's position and its second sentence
   verbatim. The replacement states: a frontmatter `params:` default is written
   in the Theta literal sublanguage and parsed as an ordinary Theta value at
   frontmatter-parse time; when a slash invocation omits the field, the runtime
   projects that value to wire form, merges it into the binder `args`, and the
   merged record — defaulted fields included — crosses the binder-`args` inbound
   boundary `:34` already mandates, where a named-enum position is re-tagged and
   a schema-typed one re-branded exactly as for a binder-supplied value. Do not
   write "bypass". Do not add a new boundary to `:34`'s set of four; the binder
   `args` entry already covers this.
2. **`docs/spec_topics/frontmatter/frontmatter-fields-a.md:71` — reconcile.** The
   author-facing guarantee is what the sentence should assert: an `Enum.Variant`
   default reaches body scope indistinguishable from the same variant written in
   body code, and there is no second "wire-form" dialect for authors to learn.
   Either drop "without a separate restoration pass" and let the guarantee stand
   on the observed value, or qualify it — no *separate* pass exists; the enum tag
   is re-established by the binder-`args` inbound boundary the runtime already
   runs. Pick one and state it plainly. `:60` and the `:62–69` worked example are
   unchanged.
3. **`docs/reference/type-system.md:162–164` — mirror, same commit.** Condense
   whatever `:37` becomes, keeping the page's existing register. `:156–158` (the
   four-boundary rule) is unchanged and is what the new text must not contradict.
   `docs/reference/frontmatter.md` needs no edit — verified, it carries no bypass
   claim.
4. **The two code comments — drop the pointer.**
   `src/runtime/inbound-boundary.ts:129–132` and
   `src/runtime/wire-translation.ts:40–43` each end with a sentence naming
   `runtime-value-model.md:37` as still divergent and deferring to a separate
   report. Once (1) lands those sentences are false and are removed; the
   preceding statements of what the code does ("A filled default DOES arrive
   here", "defaults DO reach this pass") stay and may now cite the amended
   sentence as agreeing. Both files were reflowed by `e73c1aca` to line counts at
   which their intra-file self-citations resolve — `wire-translation.ts` 675
   lines, `inbound-boundary.ts` 174. A shorter paragraph shifts anchors below it;
   re-derive every self-citation in the edited file and verify each against its
   anchor line, or reflow back to the same count.
5. **The three test comments.**
   `tests/inbound-boundary-binder-args.test.ts:278–280` and
   `tests/inbound-union-arm-dispatch.test.ts:1164–1166` state a true reason for
   the fixture choice — those cells isolate a binder-supplied value, and 0181's
   witness owns the defaulted-field case — instead of the bypass.
   `tests/wire-name-translation.test.ts:20–21`, `:137` and `:138` are retitled to
   what the cell measures: a model-output value, once translated, equals a
   locally constructed variant, which is the same value a default reaches the
   body as. Comment and title tokens only; the two assertions at `:156` and
   `:158` do not move.
6. **Constraints.**
   - `runtime-value-model.md:34` is not edited. Its four-boundary enumeration is
     what makes the shipped behaviour correct.
   - `:37`'s second sentence (the author-visible indistinguishability guarantee)
     survives verbatim. It is the true half and it is what cells 1–5 assert.
   - No behaviour moves. `tests/params-default-enum-access-merge.test.ts` (all
     ten cells), `tests/inbound-boundary-binder-args.test.ts`,
     `tests/inbound-union-arm-dispatch.test.ts` and
     `tests/wire-translation-inbound-retag.test.ts` keep their current verdicts;
     the only diffs in test files are comment and title tokens.
   - GOV-15 is untouched: no return value, diagnostic-code sequence or
     `theta-system-note` content changes. DIAG-2 is not engaged: no registry row
     is added, removed, renamed or reworded.
   - Bug 0181's route is not reopened. The projection at
     `production-theta-producer.ts:1343` is the mechanism this report documents,
     not a subject it revisits.
7. **Verification.**
   - `rg -n -i 'bypass(ing)? the inbound' docs/spec_topics/ docs/reference/ src/
     tests/` returns nothing.
   - `rg -n 'separate report' src/runtime/` returns nothing.
   - `npx vitest run tests/params-default-enum-access-merge.test.ts` →
     `Tests 10 passed (10)`, unchanged.
   - `npm test` green with the same file and test counts as before the change
     (comment-only in `tests/`).
   - `npm run lint` and `npm run typecheck` clean.
   - Every self-citation inside the two edited `src/runtime/` files re-resolved
     against its anchor line.

## Non-goals

- **Any code change.** The behaviour at HEAD is the behaviour this report asks
  the prose to describe. `src/` edits are confined to comment tokens in the two
  files named in §Fix item 4.
- **Reopening bug 0181's route.** Whether the projection belongs in
  `#recoverDeclaredDefaults` (a1) rather than in `fillDefaultsAndRevalidate` (a2)
  was settled with measured evidence and a structural constraint; this report
  inherits it.
- **Making the bypass true.** Partitioning defaulted keys out of the merged
  record before the inbound pass is a code change that would re-open bug 0181 at
  a union arm (cell 5's second premise measures the untagged outcome) and is not
  proposed.
- **Bug-document prose.** `docs/bugs/0172-…:956–959`,
  `docs/bugs/0174-…:787–790` and `docs/bugs/0120-…:543–547` restate or reason
  from the bypass. Each is a record of its own HEAD, including 0172's
  `runtime-value-model.md:36` citation for a sentence at `:37`. Nothing there is
  rewritten.
- **The `invoke(...)` and `.theta`-callable argument paths.** They compute arity
  from `hasDefault` (`production-composition.ts:1499–1502`) and construct no
  default value, so no default reaches an inbound boundary on those paths. What
  they bind for an omitted defaulted argument is bug 0181 §Non-goals'
  (`:934–939`) open question and is not answered here.
- **Positional citation drift.** `e73c1aca` grew
  `production-theta-producer.ts` by 22 lines and `defaulting.ts` by 7, staling
  `path:line` citations into them from other documents (0181 residual 4).
  That is [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class. A fix here may correct a number inside a sentence it is
  already rewriting; it is not obliged to sweep.
- **Bug 0181's other residuals.** An unresolvable `Enum.Variant` default
  (`Sev = Sev.Missing`) throwing `NullMemberAccessPanic` out of a recovery whose
  doc-comment says it "never throws" (residual 1), and `renderEchoValue`'s
  never-minted `enum` case at `src/render/argument-echo.ts:175` (residual 3), are
  independent and are not filed or fixed here.
- **A new witness.** The behaviour is already witnessed by ten committed cells.
  A prose fix that adds a test would be adding a second assertion of what cell 1
  already asserts.

## Provenance

- Filing origin: residual **2** of the bug 0181 fix
  (`.pi/tmp/fixes/0181-report.md` §*Residuals / notes*: "`runtime-value-model.md:37`'s
  `params:`-defaults bypass sentence … The divergence is now **load-bearing**
  rather than incidental: an enum-access default's tag is re-established BY the
  very pass the sentence says defaults bypass … **Candidate for filing**"),
  recorded in
  [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md)'s
  `## Fix (0.103.0)` §*Spec-sentence readings* (`:1116–1133`) and deferred by
  that document's §Non-goals (`:926–933`).
- What this report adds beyond the residual: the clause-by-clause status table
  for `:37`; the end-to-end mechanism trace at HEAD with each step's citation;
  the identification of `docs/reference/type-system.md:162–164` as a mirror that
  **does** restate the bypass (the residual named only
  `docs/reference/frontmatter.md:101`/`:111`, which do not, and that negative is
  re-verified here); the three test-file comments that restate it; bug 0120's
  `:543–547` inference off the false premise; the two-generation account
  separating 0172 face 1's incidental falsification from 0181's load-bearing
  one; and the verified absence of any other path on which a default value is
  constructed.
- Tree measured: HEAD `d470996e`, v0.103.0 (`package.json:3`), the commit after
  0181's fix `e73c1aca`. Every citation read via `git show HEAD:<path>`, so no
  reading depended on the working tree, which during measurement transiently
  carried a sibling session's uncommitted `src/parser/type-compat.ts` (bug 0179)
  and `tests/scratch-0185-unresolvable-variant.test.ts` — neither a file this
  report cites.
- Spec read: `docs/spec_topics/runtime-value-model.md` (`:12`, `:13`, `:16`,
  `:32`, `:34`, `:35`, `:37`, `:39`);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (`:57`, `:60`,
  `:62–69`, `:71`);
  `docs/spec_topics/binder/defaulting-system-note-echo.md` (`:7`, `:9`, `:11`);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2);
  `docs/STYLE.md:20–31`.
- Reference read: `docs/reference/type-system.md` (`:113`, `:145`, `:156–158`,
  `:162–164`, `:193–194`); `docs/reference/frontmatter.md:95–120`;
  `docs/reference/README.md:14–15`, `:22–24`.
- Implementation read: `src/runtime/inbound-boundary.ts` (174 lines; `:1–19`,
  `:86–96`, `:110–133`, `:134`, `:139`, `:166`);
  `src/runtime/wire-translation.ts` (675 lines; `:1–57`);
  `src/extension/production-theta-producer.ts` (`:225`, `:639`, `:718`,
  `:1263–1266`, `:1292`, `:1332–1340`, `:1343`);
  `src/binder/defaulting.ts` (`:1–26`, `:33–46`, `:117–169`, esp. `:136`,
  `:158`, `:161`);
  `src/extension/theta-composition-producer.ts` (`:86–113`, `:405–422`);
  `src/extension/production-composition.ts:1495–1505`.
- Tests read (not modified): `tests/params-default-enum-access-merge.test.ts`
  (`:1–90`, `:511`, `:626`, `:645`, `:657`, `:713–755`, `:854–908`);
  `tests/wire-name-translation.test.ts` (`:14–27`, `:137–160`);
  `tests/inbound-boundary-binder-args.test.ts:274–287`;
  `tests/inbound-union-arm-dispatch.test.ts:1160–1172`.
- Tests run: `npx vitest run tests/params-default-enum-access-merge.test.ts`
  (`Test Files 1 passed (1)` / `Tests 10 passed (10)`), plus the two `-t`
  invocations in §Reproduction (d). No probe was written; no scratch file was
  created.
- History read: `git log --oneline` — `c2d22aad` (0172 face 1, v0.97.0),
  `f912a8c3` (0174, v0.98.0), `ac4687db` (0172 face 2, v0.102.0), `e73c1aca`
  (0181, v0.103.0), `d470996e` (HEAD).
- Bug corpus read:
  `docs/bugs/0181-enum-access-params-default-boxed-string-refused-at-merge.md`
  (`:40`, `:234–250`, `:587`, `:764`, `:768`, `:926–939`, `:1116–1133`);
  `docs/bugs/0172-inbound-translation-pass-unperformed-at-three-boundaries.md:950–962`;
  `docs/bugs/0174-typed-invoke-enum-return-validation-prompt-cell.md:783–790`;
  `docs/bugs/0120-inbound-rebuild-ignores-declaration-order-and-brand.md`
  (`:242–251`, `:538–549`);
  `docs/bugs/README.md` rows for 0112, 0117, 0120, 0134, 0163, 0172, 0174, 0181.
