# Bug 0260 — `preEvalCauseOf`'s ERR-6 `tools-resolution` batch names the nine `tools:`-ENTRY codes but not the two remaining `tools:`-surface codes: `theta/load/malformed-tools-field` (the field-shape rejection, bug 0104) and `theta/load/extension-tool-unreachable` (the PIC-64 rung-3 refusal over a callable-set extension tool) both fall through the `theta/load/` arm to the ERR-3 `frontmatter` cause; `functions.md` FN-7's `with { tools: … }` reuse list omits the field-shape code on the same footing

- **Status:** open.
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
