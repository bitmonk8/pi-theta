# Bug 0260 — `preEvalCauseOf`'s ERR-6 `tools-resolution` batch names the nine `tools:`-ENTRY codes but not the two remaining `tools:`-surface codes: `theta/load/malformed-tools-field` (the field-shape rejection, bug 0104) and `theta/load/extension-tool-unreachable` (the PIC-64 rung-3 refusal over a callable-set extension tool) both fall through the `theta/load/` arm to the ERR-3 `frontmatter` cause; `functions.md` FN-7's `with { tools: … }` reuse list omits the field-shape code on the same footing

- **Status:** fixed (0.254.0).
- **Sev/Diff estimate:** S4/D1 — S4 because the mapping has no operator-visible
  divergence today (`routePreEvalFailure` discards its `cause` argument,
  `src/extension/load-pre-eval.ts:107`, so a misclassified code produces a
  byte-identical `theta-system-note`), so the cost is a false mapping row for
  callers, reload integration and any future per-cause consumer. D1 because the
  remedy is two `===` disjuncts in one `if` plus one spec-list widening, with
  the witness cell already table-driven.
- **Kind:** defect — implementation and spec prose. `preEvalCauseOf`'s doc
  comment states the mapping "documents which pre-eval cause each shipped
  load-path diagnostic realises"
  (`src/extension/production-composition.ts:286–287`); ERR-6 is "`tools:`
  resolution failure"
  (`docs/spec_topics/errors-and-results/error-model.md:20`); both codes are
  `tools:`-surface refusals, and both are mapped to ERR-3.
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - `src/extension/production-composition.ts:293–320` — `preEvalCauseOf`
    (exported by 0109). `:300–312` is the ERR-6 `tools-resolution` disjunction,
    nine codes: `malformed-tool-entry`, `unknown-tool`,
    `unresolvable-theta-path`, `prompt-mode-callable`, `tool-name-collision`,
    `invalid-tool-rename`, `invalid-derived-tool-name`, `invalid-pi-tool-name`,
    `callee-has-errors`. `:316–317` is the `theta/load/` arm that returns
    `frontmatter` (ERR-3) for every other load code, which is where both
    subject codes land.
  - `src/parser/frontmatter.ts:1259–1268` — the `theta/load/malformed-tools-field`
    push (bug 0104's field-shape code, landed 0.127.0).
  - `src/runtime/host-loop-dispatch.ts:34`, `:89–96` —
    `EXTENSION_TOOL_UNREACHABLE_CODE` and the fail-closed
    `kind: "unreachable"` diagnostic.
  - `src/extension/extension-tool-reachability.ts:212–231` —
    `checkExtensionToolReachability`, which raises that diagnostic only for
    names in the theta's callable set that resolved to extension tools and are
    called from code, i.e. only for `tools:` entries.
  - `src/extension/production-composition.ts:838–845` — the compose pass emits
    the reachability diagnostics through the shared `sink.emitGroup`, and
    `:1279–1289` (`emitLoadNoteGroup`) calls
    `preEvalRouter.routePreEvalFailure(preEvalCauseOf(diagnostic.code), …)` on
    every error-severity diagnostic. Both subject codes therefore reach
    `preEvalCauseOf` on the shipped load path.
  - `docs/spec_topics/functions.md:70` — FN-7's `with { tools: … }` reuse list.
    It names the eight entry codes and omits `theta/load/malformed-tools-field`,
    the rejection a `with`-clause `tools` value of a non-admitted shape reuses.
  - `tests/pre-evaluation-failures.test.ts:274–301` — 0109's table-driven
    witness cell. Its header `:269–273` states both subject codes are out of
    scope and that the cell asserts nothing about them.
  - `docs/spec_topics/diagnostics/code-registry-load.md:13` (
    `extension-tool-unreachable`), `:26` (`malformed-tools-field`) — the two
    registry rows, in registry order relative to the nine already batched
    (rows `:25`, `:27`–`:33`, `:41`).
- **Related:**
  - [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) —
    **fixed (0.234.0)**, the filing origin. Its `## Fix (0.234.0)` widened the
    ERR-6 arm by three codes, put it in registry order, exported
    `preEvalCauseOf` and landed the witness cell; §Residuals item 1 records
    both subject codes as measured, refused ("an unauthorised semantic flip of
    a mapping row" — 0109's settled §Fix named two codes, widened to three by
    0108's authority) and left "for the owning report", and
    `.pi/tmp/fixes/0109-report.md:170–181` states "A sibling or follow-up
    owning either code should widen this same arm."
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md) —
    **fixed (0.127.0)**, which landed `theta/load/malformed-tools-field` after
    0109 was filed. It classified no cause and left none owed, so no open
    report owns this code's mapping.
  - [0108](./0108-uppercase-pi-tool-name-mints-unspellable-callable.md) —
    **fixed (0.213.0)**. Its §Fix *Residual 2* is the precedent shape for this
    report: a new `tools:` code absent from the same two enumerations, routed
    to the report that owned them. That obligation was discharged by 0109's
    three-code widening; these two codes had no such owner.
  - [0248](./0248-malformed-escaping-tools-entry-containment-unwitnessed.md) —
    open. Its §Non-goals scopes "`preEvalCauseOf`'s ERR-6 enumeration
    (bug 0109)" out as "pre-existing and orthogonal", so it does not claim this
    axis and the two fixes do not collide.
  - **Ordering:** no report blocks this one, and this one blocks none.

## Summary

`preEvalCauseOf` maps a load diagnostic's registry code to the ERR-1…ERR-6 /
ERR-16 pre-evaluation failure cause it realises. Its ERR-6 `tools-resolution`
disjunction names the nine codes of the `tools:`-ENTRY family. Two further
`tools:`-surface error codes ship: `theta/load/malformed-tools-field` (the
field's value shape) and `theta/load/extension-tool-unreachable` (no code-side
dispatch rung for a callable-set extension tool). Neither is named, so both fall
through the function's `theta/load/` arm and are classified as the ERR-3
`frontmatter` cause. `functions.md` FN-7's `with { tools: … }` reuse list omits
the field-shape code for the same reason.

## Reproduction

Read `preEvalCauseOf` at HEAD:

```
sed -n '293,320p' src/extension/production-composition.ts
```

The ERR-6 disjunction (`:300–312`) names nine codes; neither
`theta/load/malformed-tools-field` nor `theta/load/extension-tool-unreachable`
appears. Both start with `theta/load/`, so `:316–317` returns `frontmatter`.

Direct call over the exported function (scratch probe, removed after the run —
a `tests/*.test.ts` file importing `preEvalCauseOf` from
`../src/extension/production-composition` and logging the result for each code):

```
theta/load/malformed-tools-field      => frontmatter
theta/load/extension-tool-unreachable => frontmatter
theta/load/malformed-tool-entry       => tools-resolution   (control)
```

FN-7's list:

```
rg -n "malformed-tools-field" docs/spec_topics/functions.md   # no match
```

## Expected behaviour

Both codes classify as the ERR-6 `tools-resolution` cause. ERR-6 is "`tools:`
resolution failure" (`error-model.md:20`);
`theta/load/malformed-tools-field` refuses a declared `tools:` field whose value
is neither admitted spelling (`code-registry-load.md:26`), and
`theta/load/extension-tool-unreachable` refuses a callable-set extension tool —
i.e. an admitted `tools:` entry — whose code-side dispatch ladder has no
available rung (`code-registry-load.md:13`;
`extension-tool-reachability.ts:212–231` gates on
`input.extensionToolNames`, the presented callable names from the callable set).
FN-7's reuse list names every diagnostic a `with { tools: … }` clause reuses,
which includes the field-shape rejection.

## Actual behaviour / root cause

`preEvalCauseOf` is a prefix cascade: two singleton codes, the ERR-6
disjunction of nine literal `===` comparisons, a `theta/parse/` prefix arm, then
a `theta/load/` prefix arm returning `frontmatter`. The two subject codes match
no literal in the disjunction and match the `theta/load/` prefix, so they are
reported as ERR-3. The enumeration is a hand-maintained list of literals with no
derivation from the registry or from the emitting sites, so a code added after
the last widening is classified by the fall-through arm by default. Both codes
post-date 0109's filing on that path: `malformed-tools-field` landed with 0104
(0.127.0) and 0109's fix (0.234.0) measured it, refused the widening as outside
its settled §Fix, and recorded it with `extension-tool-unreachable` for their
owner. 0104 is fixed, so no open report carried the widening.

FN-7's list is the same shape of hand-maintained enumeration and omits the
field-shape code for the same reason.

## Why it matters

The misclassification has no operator-visible symptom at HEAD:
`routePreEvalFailure` discards its `cause` argument (`void cause;`,
`src/extension/load-pre-eval.ts:107`) and delivers all seven load-time causes
over one `theta-system-note` surface with the same fixed options, so a
malformed `tools:` field and a malformed `tools:` entry produce byte-identical
notes. What is wrong is the mapping itself, which the function's doc comment
declares honest and which is carried "for caller / reload-integration reuse"
(`production-composition.ts:283–287`): two of eleven `tools:`-surface codes
report the frontmatter cause. Any consumer that starts reading the discriminant
— a per-cause router branch, reload integration, a cause-tagged telemetry
surface — inherits a wrong classification for a malformed `tools:` field and an
unreachable extension tool. FN-7's list understates by one code the diagnostics
a `with { tools: … }` clause reuses.

## Fix

Widen `preEvalCauseOf`'s ERR-6 disjunction
(`src/extension/production-composition.ts:300–312`) by the two codes, inserted
in registry order relative to the nine already present:
`theta/load/extension-tool-unreachable` (registry row `:13`) before
`theta/load/malformed-tool-entry`, and `theta/load/malformed-tools-field`
(row `:26`) between `theta/load/malformed-tool-entry` and
`theta/load/unknown-tool`. The arm then names all eleven `tools:`-surface error
codes. The `theta/parse/` and `theta/load/` arms, the doc comment's contract
sentence and the ERR-1…ERR-6 / ERR-16 taxonomy stay as they are; a disjunction
of `===` comparisons makes the ordering behaviour-neutral.

In the same commit, widen `docs/spec_topics/functions.md:70` (FN-7) by
`theta/load/malformed-tools-field`, placed in registry order in the `tools`
clause of the reuse list. `theta/load/extension-tool-unreachable` is not added
to FN-7: it is not a clause-validation rejection — it fires from the enclosing
body's code-side call sites through `checkExtensionToolReachability`, not from
the `with` clause's value — so adding it would widen FN-7's contract rather than
complete its list. No `docs/reference/` mirror is owed: `docs/reference/`
carries no `with { tools: … }` reuse list (`rg "with \{ tools" docs/reference/`
→ no match), and `docs/reference/diagnostics.md`'s `subagent fn` note delegates
to FN-7 instead of restating it.

Witness: extend 0109's table-driven cell,
`tests/pre-evaluation-failures.test.ts:274–301`, with one row per code
(`cause: "tools-resolution"`) and replace its header's "OUT OF SCOPE,
deliberately" paragraph (`:269–273`) with the widened family statement. The
`theta/load/missing-mode` guard row stays, so an over-widening of the ERR-3 arm
into a `theta/load/` prefix still reds. Both new rows must red before the source
edit (`expected 'frontmatter' to be 'tools-resolution'`) and green after. The
cell restates the family rather than deriving it from source, so it cannot red
on a future `tools:` code never added to the table — 0109 §Fix *Residual 2*, and
open bug [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md)'s axis,
unchanged here.

No registry row is added, removed or reworded (DIAG-2, DIAG-4). No emission
moves, so no new code becomes reachable from an ordinary `pi -p` run and no
`tests/fixtures/h7a/permitted-codes.json` append is owed.

## Non-goals

- **Making `routePreEvalFailure` branch on cause.** Its one-surface design is
  pinned by `src/extension/load-pre-eval.ts:3–9` and witnessed by
  `tests/pre-evaluation-failures.test.ts`. This report measures the mapping's
  fidelity, not the router's shape.
- **A source-derived `tools:` family gate.** Deriving the ERR-6 batch (or the
  witness table) from the registry or the emitting sites is bug 0107's axis.
- **Implementing FN-7's `with { tools: … }` load-time validation.** The clause
  emits no `tools:` code today (0109 §Actual behaviour finding 2). This report
  completes the list the contract already states and neither widens nor narrows
  the contract.
- **The two older absences from FN-7's list** —
  `theta/load/callee-has-errors` and `theta/load/invoke-path-escape`'s registry
  trigger — recorded in 0109 §Non-goals and left where they are.

## Fix (0.254.0)

- What shipped:
  - `src/extension/production-composition.ts` — `preEvalCauseOf`'s ERR-6
    `tools-resolution` disjunction widened by exactly two `===` disjuncts in
    registry order (§Fix step 1): `theta/load/extension-tool-unreachable`
    (registry row `code-registry-load.md:13`) before
    `theta/load/malformed-tool-entry`, and `theta/load/malformed-tools-field`
    (row `:26`) between `theta/load/malformed-tool-entry` and
    `theta/load/unknown-tool`. The arm now names all eleven `tools:`-surface
    error codes. The `theta/parse/` arm, the `theta/load/` ERR-3 arm, the ERR-1 /
    ERR-4 singletons, the doc comment and the ERR-1…ERR-6 / ERR-16 taxonomy are
    byte-unchanged; a disjunction of `===` comparisons makes the ordering
    behaviour-neutral.
  - `docs/spec_topics/functions.md:70` — FN-7's `with { tools: … }` reuse list
    widened by `theta/load/malformed-tools-field` ONLY, in registry order
    (§Fix step 2). `theta/load/extension-tool-unreachable` is deliberately NOT
    added: it is not a clause-validation rejection — `checkExtensionToolReachability`
    (`src/extension/extension-tool-reachability.ts`) raises it from the enclosing
    body's code-side call sites over names already in the callable set, never from
    the `with` clause's own value — so listing it would WIDEN FN-7's contract
    rather than complete its enumeration. No `docs/reference/` mirror was owed or
    edited (`rg "with \{ tools" docs/reference/` → no match;
    `docs/reference/diagnostics.md`'s `subagent fn` note delegates to FN-7).
  - `tests/pre-evaluation-failures.test.ts` — bug 0109's table-driven cell
    extended by one row per code (`cause: "tools-resolution"`), inserted in the
    same registry order as the source arm; the `theta/load/missing-mode` ERR-3
    over-widening guard row and the three other guard rows are retained
    unchanged. Header prose retired and replaced (enumerated below).
  - `tests/arg-mismatch-diagnostic-count-by-surface.test.ts`,
    `tests/lex-drop-single-delivery.test.ts`,
    `tests/live/unterminated-template-registration-live-cell.test.ts` —
    comment-only `+2` bumps of ten `production-composition.ts:<line>` citation
    spans the source edit's two inserted lines moved from exact-correct at
    `60afb295` to stale. Bound to exactly ten spans in exactly three files; each
    bumped number was re-derived against the post-edit tree. Citations that were
    ALREADY stale at HEAD were left where they stand, per 0109 §Residual 3's rule.
  - Not touched, per the lane's delta: `package.json`, `CHANGELOG.md`,
    `docs/bugs/README.md`. The version above is a placeholder the merge assigns.

- **Header replacement, enumerated** (the retirement §Fix entails — the retired
  paragraph named exactly the two subject codes as out of scope):
  1. `"Every code of the \`tools:\`-ENTRY family MUST map…"` → an EXTENSIONAL
     claim over "the eleven codes named below (registry rows `:13`, `:25`–`:33`,
     `:41`)". A universal over the `tools:` surface would be FALSE:
     `theta/load/invoke-path-escape` (row `:35`) also fires on a `tools:` `.theta`
     entry and still maps to ERR-3.
  2. `"the eight emitted by resolveCallableSet"` → `"the eight ENTRY-family codes
     emitted by resolveCallableSet"`; the eight names are unchanged.
  3. `"— nine codes in all."` retained for paragraph 1's own nine-code list
     (eight ENTRY + `callee-has-errors`); the eleven-code total is reached only
     after the family-boundary paragraph.
  4. NEW family-boundary paragraph: WHY the boundary is the `tools:` SURFACE, not
     the entry granularity, with each new code's emission site
     (`src/parser/frontmatter.ts` for the field-shape rejection,
     `src/extension/extension-tool-reachability.ts` for the PIC-64 rung-3 refusal).
  5. NEW "NOT NAMED BELOW" paragraph: `theta/load/invoke-path-escape` is a
     dual-surface code that reaches `preEvalCauseOf` from the `tools:` surface and
     maps to ERR-3 here. Its FN-7-list absence is what §Non-goals leaves where it
     stands; its ERR-3 classification is untouched because §Fix names exactly the
     two codes and does not reclassify it.
  6. RETIRED (4 comment lines): the "OUT OF SCOPE, deliberately" paragraph naming
     `theta/load/malformed-tools-field` and `theta/load/extension-tool-unreachable`
     as out of scope and stating the cell asserts nothing about them. The fix
     falsifies every clause of it.
  7. `"WHAT THIS CANNOT PIN: this table restates the ENTRY family…"` →
     `"… the eleven-code \`tools:\`-surface family…"`. Noun only — the
     non-derivation substance (0109 §Residual 2, open bug 0107's axis) is intact
     and still true.
  8. `it(...)` title: `"every tools:-entry-family code"` → `"the eleven
     tools:-surface codes named below"`, plus the bug 0260 cross-reference.
  9. Row-block comment: nine→eleven, with the registry-order note explaining the
     two insertion points.

- Gates: witness RED before the source edit on exactly the two codes
  (`theta/load/extension-tool-unreachable` and `theta/load/malformed-tools-field`,
  each `expected 'frontmatter' to be 'tools-resolution'`) and 9/9 cells,
  13/13 rows GREEN after; full default suite `428 passed (428)` files /
  `9049 passed (9049)` tests; `npm run typecheck` clean; `npm run lint` clean.
  Live: none run — see §Live decision below.

- Review: 2 rounds. Round 1 (deep) — 3 findings, all comment/prose:
  (F1) the source edit's +2 shift moved TEN `production-composition.ts:<line>`
  citations from exact-correct to stale in three test files, refuting the
  orchestrator's narrower spot-check; (F2) the rewritten header's counts
  contradicted its own enumeration; (F3) the header minted a NEW false totality
  (`theta/load/invoke-path-escape` is the counterexample) — the same failure mode
  0109's own round 1 caught. Round 2 (fast, confirmation) — 1 finding: the new
  exclusion paragraph attributed the ERR-3-classification-unchanged fact to
  §Non-goals, which is silent on it; reattributed to §Fix. Both fixer rounds were
  `bug-fix-fixer-light` and touched only comments and one `it(...)` title; no
  assertion and no executable line moved. The round-2 polish was verified by
  gate-diff (comment-only hunk, gates green), so no third confirmation round ran.

- Verification: SOLID on all obligations.
  (1) The witness reds: removing both disjuncts reds naming exactly both codes;
  mutation probe (a) replacing the ERR-6 arm with a `theta/load/` prefix arm reds
  the `theta/load/missing-mode` over-widening guard; mutation probe (b) adding only
  one disjunct reds naming exactly the other — the rows discriminate independently.
  `src/extension/production-composition.ts` restored byte-exact after each of the
  three probes (`git hash-object` = `3ec8d80ae1a22dcf5fe23dee62bd89dcb0977401`
  each time, equal to the pre-probe capture); no other file was mutated.
  (2) Full default suite green (totals above).
  (3) Live obligation adjudicated as NOT OWED and CONFIRMED from the diff, leg by
  leg (below).
  (4) `npm run typecheck` and `npm run lint` clean.
  (5) Fidelity and locks hold: registry order correct, `extension-tool-unreachable`
  absent from FN-7, `tests/fixtures/h7a/permitted-codes.json` and
  `docs/spec_topics/diagnostics/code-registry-load.md` byte-unchanged, 0109's other
  cells and 0108's / 0248's witnesses untouched, no version string other than the
  literal placeholder `0.254.0` introduced.

- **Live decision (on the record): NO live gate owed, none run.** The four legs,
  each confirmed against the diff:
  (i) `routePreEvalFailure` still discards its cause (`void cause;`,
  `src/extension/load-pre-eval.ts`) immediately before `sendSystemNote`, and all
  seven load-time causes share ONE `theta-system-note` surface with the same fixed
  options — so every operator-visible note stays BYTE-IDENTICAL across the
  ERR-3→ERR-6 reclassification. This is the S4 face the report pins, and the fix
  does not and must not move it.
  (ii) No emission site moved: `preEvalCauseOf` is pure and total on `string`, and
  `grep -rn "preEvalCauseOf" src/` returns exactly the definition and the single
  production call site inside `emitLoadNoteGroup`. No diagnostic is newly emitted
  or suppressed.
  (iii) `tests/fixtures/h7a/permitted-codes.json` and the registry page are
  byte-unchanged, so no code becomes newly reachable from an ordinary `pi -p` run
  and no H9a permitted-codes append is owed (DIAG-2, DIAG-4 untouched).
  (iv) The FN-7 edit is spec prose for a clause that emits no `tools:` code today
  (0109 §Actual behaviour finding 2), so it changes no runtime behaviour.
  With no observable moved on any live axis, a live run could only re-assert
  unchanged behaviour. Had any leg failed, the live run would have gone under the
  shared lock; none did.

- Residuals:
  1. **The witness still restates the family rather than deriving it.** It reds on
     any code ALREADY LISTED that diverges from the batch (proven by mutation
     probe (b)) but cannot red on a future `tools:` code added to the registry and
     never added to the table. Unchanged from 0109 §Residual 2; a source-derived
     family gate is open bug [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md)'s
     axis and stays there.
  2. **`theta/load/invoke-path-escape` still maps to ERR-3 `frontmatter`.** It is a
     dual-surface code — registry row `code-registry-load.md:35` triggers on "an
     `invoke(...)` literal or a `tools:` `.theta` entry" — so an eleven-code
     `tools:`-surface enumeration is extensional, not universal. Reclassifying it
     is outside this report's settled §Fix (which names exactly two codes) and its
     FN-7-list absence is expressly left where it stands by §Non-goals. Recorded
     verbatim in the witness cell's "NOT NAMED BELOW" paragraph; unowned, no report
     currently claims it.
  3. **Pre-existing stale `production-composition.ts:<line>` citations remain.**
     Roughly forty spans across `tests/**` (notably `:2220` ×43, `:2214`,
     `:1729`, `:1621`, `:1502`, `:1193–:1213`, `:330`, `:366`) were already stale
     at `60afb295` and were deliberately NOT re-derived: this fix repairs only what
     it moved from correct to stale (0109 §Residual 3's rule). The file is not in
     `tests/citation-symbol-form-gate.test.ts`'s `CONVERTED_FILES` ratchet.
  4. **This change shifts `src/extension/production-composition.ts` line numbers
     by +2 below `preEvalCauseOf`.** Any citation into that file authored after
     `60afb295` must be derived against the post-fix tree.

- Discharge notes appended:
  [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md)
  §Fix *Residuals* item 1 — the item that measured both codes, refused their
  reclassification as "an unauthorised semantic flip" outside 0109's settled §Fix,
  and left them "for the owning report". Marked discharged here, with the FN-7
  one-code-only reasoning restated. No note is owed to
  [0248](./0248-malformed-escaping-tools-entry-containment-unwitnessed.md): its
  §Non-goals already scopes this axis out as "pre-existing and orthogonal", and
  its witnesses and surfaces are byte-unchanged.

- Pinned dispositions / non-goals: §Non-goals holds unchanged.
  `routePreEvalFailure` still discards its cause and was NOT made to branch on it
  — this report measured the mapping's fidelity, not the router's shape. No
  source-derived `tools:` family gate was built (bug 0107's axis). FN-7's
  `with { tools: … }` load-time validation is still unimplemented and this fix
  neither widens nor narrows that contract — which is exactly why
  `theta/load/extension-tool-unreachable` was withheld from FN-7. FN-7's two older
  absences (`theta/load/callee-has-errors`, `theta/load/invoke-path-escape`'s
  registry trigger) are left where 0109 §Non-goals left them. No registry row was
  added, removed or reworded (DIAG-2, DIAG-4); no GOV-15 diagnostic-registry
  carve-out is engaged, because no code was added or removed.

## Provenance

- Filed at HEAD `53cd0d86`, 0.240.0, `main`.
- Evidence: source inspection at HEAD of `preEvalCauseOf`, the two emission
  sites, the compose-pass wiring and FN-7; plus one scratch direct-call probe
  over `preEvalCauseOf` (three codes, output quoted in §Reproduction) run under
  `npx vitest run` and deleted. No file in the tree was modified.
- Filing origin:
  [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) §Fix
  *Residuals* item 1 and `.pi/tmp/fixes/0109-report.md:170–181`, which name both
  codes and route the widening to their owner.
