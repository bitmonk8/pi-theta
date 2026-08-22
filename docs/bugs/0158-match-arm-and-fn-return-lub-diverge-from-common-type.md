# Bug 0158 — Bug 0081's fix gave the shared `commonType` (`type-compat.ts:656`) a union clause and `#typeExpr`'s `case "match"` (`static-type-inference.ts:237–241`) routes arm types through it, so the inference pass types `match 1 { 1 => 1, _ => "a" }` as `integer | string` while the checker-side LUBs for the same two constructs — `leastUpperBound` (`match-result.ts:214`) behind `checkMatchArmTypes` and `computeLub` (`functions.ts:348`) behind `resolveReturnType` — stay dominating-member-only and refuse it: `docs/reference/type-system.md:97` ("`match` arms and inferred theta/`fn` return types use the same LUB discipline") and `docs/spec_topics/functions.md:26` (FN-3, "the same common-upper-bound discipline … that the spec already applies to `match` arms, ternary branches, and array literals") now read false in a new direction, `["a", null]` loads as `array<string | null>` while `match 1 { 1 => "a", _ => null }` and its `fn`-return twin each draw an `E`, and the union already renders into three other rows' `<actual>` placeholders

- **Status:** fixed (0.181.0). §Fix was unsettled at filing: two routes were
  constraint-pinned with their GOV-15, DIAG-2 and witness consequences
  enumerated, and the disposition — whether `match` arms and inferred
  `fn`/theta returns ADOPT the union LUB, or the spec sentences are CORRECTED
  to scope the union discipline to the array/ternary positions — was left to
  the run. The run selected **route B** (CORRECT), plus route B's B7 option
  (i); see `## Fix (0.181.0)` below.
- **Sev/Diff estimate:** S4/D3 — S4 because no admitted program observes a
  wrong value or a wrong diagnostic: the checker's `match` row runs on the same
  node, over the same arm-type reads, as the inference union
  (`type-layer-checks.ts:1958–1966` calls `this.typeOf(arm.body, …)`, the same
  seam `#typeExpr` answers), so the divergence and the `E` are coextensive —
  measured across ten syntactic positions in §Reproduction (w), every
  heterogeneous `match` draws `theta/parse/match-arm-type-mismatch` and
  `hasLoadParseError` (`production-composition.ts:2047–2054`) denies
  registration before any sink reads the union; on the `fn`-return side the
  inference pass computes no return LUB at all (`case "call"` answers
  `{ kind: "named", name: node.callee }`, `static-type-inference.ts:251–252`),
  so there is no second computation to diverge and the defect is the spec
  sentence alone. The harm is two false normative sentences plus a latent
  divergence: the next consumer of `typeOf` on a `match` node inherits a type
  the checker will not admit. **Upgrade condition, stated so the fixer can
  rescore honestly:** if the run adjudicates ADOPT, the same evidence rescores
  **S2** — rows n3, v3, n4 and v4 are then conformant inputs noisily refused,
  and `v3`/`v4` carry the spec's own worked vector `["a", null] → string | null`.
  D3 because §Fix needs in-run adjudication (the same class 0081 residual R1
  left open), because either route lands on the shared `⊑` surface under the
  byte-pins 0081 established — `static-type-inference.ts` at exactly 378 lines
  (eleven open reports cite it by line), `functions.ts` at exactly 427,
  `type-layer-checks.ts` at exactly 2531, `type-compat.ts` byte-identical
  through line 591 — and because the ADOPT route re-pins committed cells in
  witness files other reports own.
- **Kind:** defect — spec/implementation divergence. No false `E` ships and no
  admitted program observes it. Four elements:
  1. **One LUB function answers the array/ternary sites; two others answer the
     `match` and `fn`-return sites, and they now disagree.** Bug 0081's fix
     (0.83.0, `5de8d78a`) put the union clause in the exported `commonType`
     (`src/parser/type-compat.ts:656–677`): a dominating branch wins, else
     `{ kind: "union", arms: branches }`, except a set holding an object branch
     with no dominator (rule 3). `checkCommonType` (`:555`, sole `src/` caller
     `checkArrayLiteral`, `type-layer-checks.ts:1441`) and
     `StaticTypeInferencePass.#commonType` (`static-type-inference.ts:353–358`)
     both call it, which is 0081's constraint 3. `leastUpperBound`
     (`match-result.ts:214–238`) and `computeLub` (`functions.ts:348–358`) do
     not: both restrict the candidate set to MEMBERS of their input
     (`armTypes.filter(covers)` at `:223`; `types.find(…)` at `:352`) and
     answer `undefined` when no member dominates.
  2. **The inference pass unions `match` arms; the checker refuses the same
     node.** `#typeExpr`'s `case "match"` (`static-type-inference.ts:237–241`)
     maps the arm bodies through `#commonType`. Measured (§Reproduction (t)):
     `typeOf` on `match 1 { 1 => 1, _ => "a" }` is
     `{"kind":"union","arms":[{"kind":"literal","typesAs":"integer"},{"kind":"literal","typesAs":"string"}]}`,
     `displayType` `integer | string`, while `checkMatchArmTypes` on the
     identical arm-type array returns `lub: undefined` and one
     `theta/parse/match-arm-type-mismatch`.
  3. **Two normative sentences read false.** `docs/reference/type-system.md:97`
     and `docs/spec_topics/functions.md:26` (FN-3) both assert that the
     `match`-arm and inferred-return discipline IS the array/ternary
     discipline. The array/ternary discipline unions at this HEAD (rows n1, n2,
     v1, v2 load with `[]`); the `match` and `fn`-return discipline does not
     (rows n3, n4, v3, v4 each draw an `E`). Before 0081 the same sentences were
     false in the other direction — nothing unioned — so the pair was wrong
     together; now they are wrong apart. Both registered *Triggers*
     (`code-registry-parse.md:75`, `:42`) are written to the dominating
     reading and would need a DIAG-2 disposition under the ADOPT route.
  4. **The union already renders into three other rows' `<actual>`
     placeholders, inside programs the `match` row refuses anyway.** Measured
     (§Reproduction (p)): `fn-arg-type-mismatch` reports
     `expected integer, got integer | string`, `object-field-type-mismatch`
     reports `expected integer, got integer | string`, and
     `mixed-plus-operands` reports `'+' has mixed operand types: integer |
     string and integer`. Under the pre-0081 `#commonType` — transcribed
     verbatim from `git show 9e797da7:src/parser/static-type-inference.ts`
     `:347–357` and re-run on the same candidate sets (§Reproduction (x)) — the
     answer was `integer`, at which each of those three sinks is silent
     (controls c9, c11, c14). So 0081 moved the diagnostic SEQUENCE on these
     inputs. Every one of them already carried an `E` at 1.0.0, so none is in
     GOV-15's loads-cleanly set and the promise is not breached
     (`source-language-stability.md:9`).
- **Related:**
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **fixed
    (0.83.0)**, the origin. Found by its review round 1 (finding R1, "the
    dominating-only LUB survives at two sibling call sites while the inference
    pass now unions `match` arms", carried non-blocking) and banked as residual
    **R4** in its fix report (`.pi/tmp/fixes/0081-report.md`) and as item 4 of
    its own `## Fix (0.83.0)` record. That record cites the falsified sentence
    at `docs/reference/type-system.md:96`; the sentence is at **`:97–98`**
    (`:96` is blank) — corrected here and re-verified. The same round-1 loop
    re-scoped `computeLub`'s doc comment (`functions.ts:340–347`) precisely
    because it no longer matched `checkCommonType`; that corrected comment is
    quoted in §Actual behaviour and is the in-tree admission of this divergence.
  - [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md) — **open**,
    filed concurrently from 0081 residual **R1**, the same adjudication class on
    the other side: the ternary caller of `checkCommonType` and the scope of
    `theta/parse/array-no-common-type`'s registered *Trigger* ("**Array
    literal** whose elements have no common type…"). Row o2 here measures its
    subject — `true ? A { a: 1 } : B { b: "s" }` draws `[]` where the array
    twin o1 draws `array-no-common-type` — and leaves it there. This report
    claims only the `match`-arm and `fn`/theta-return side; it edits no
    ternary-facing code, no `array-no-common-type` row, and no
    `checkCommonType` caller. If both fixes land, whichever is second rebases
    against the other's `type-compat.ts` line positions; neither is a
    prerequisite of the other.
  - [0145](./0145-inference-pass-no-match-arm-scope.md) — **open**, the other
    open report on `#typeExpr`'s `case "match"`. Its premises are unmoved by
    0081, verified here: `static-type-inference.ts:237–241` is byte-identical to
    `9e797da7` (`diff` empty), so its arm-scope citation is exact; `matchArmScope`
    (`type-layer-checks.ts:1202`) and `recordWithheldBinders` (`:1181`) are
    untouched; and its group-(a) tripwire cell **u13e stayed GREEN** (the whole
    84-cell `tests/fn-arg-type-mismatch-wired.test.ts` passes at this HEAD).
    Two citation corrections it will need, both disclosed by 0081 residual R5:
    u13e is at `tests/fn-arg-type-mismatch-wired.test.ts:2784`, not `:2694`;
    and `hasLoadParseError` is `production-composition.ts:2047–2054`, not
    `:2045–2052`. The two reports are behaviourally disjoint — 0145's subject is
    WHICH binding an arm body reads, this report's is WHAT TYPE the set of arm
    body types reduces to — and they share one `case` block, so whichever lands
    second rebases.
  - [0142](./0142-division-result-type-not-number.md) — **open**, the source of
    the group-(t) raw-read harness pattern §Reproduction (t) uses
    (`StaticTypeInferencePass.typeOf` on the body tail over an empty `TypeEnv`,
    reported as raw `CompatType` plus `displayType`). Its own witness
    `tests/division-result-type-number.test.ts` is green at this HEAD and no row
    here touches `#typeBinary`.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    the diagnostic-COUNT class. Rows p9, p11 and p14 measure one input drawing
    two codes; the count question at those sinks is 0129's, not this report's
    (§Non-goals).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class covering the positional drift either route
    here induces in `type-compat.ts`, `match-result.ts` and `functions.ts`
    citations.
- **Affected** (every citation verified at HEAD `5de8d78a`, 0.83.0):
  - **The spec sentences under adjudication** —
    `docs/reference/type-system.md:97–98`, the sentence in full: "`match` arms
    and inferred theta/`fn` return types use the same LUB discipline (see
    [Grammar](./grammar.md) and [Errors and results — final
    value](./errors-and-results.md))." It sits directly under
    `## Common-type rules (array literals & ternary branches)` (`:83`) whose
    own heading already scopes the section, with the three rules at `:85–95`.
    `docs/spec_topics/functions.md:26` — FN-3, "**Theta return type**", whose
    reconciliation clause reads: "applying the same common-upper-bound
    discipline — the least upper bound under [Type System — Type
    compatibility](./type-system.md#type-compatibility) (`⊑`), with every
    contributing type `⊑` the chosen common type, narrowed by any sink in scope
    — that the spec already applies to `match` arms, ternary branches, and
    array literals", and whose closing sentence assigns the failure:
    "contributing types that share no common upper bound and that no sink
    narrows make the body `theta/parse/return-no-common-type`".
    `docs/spec_topics/expressions.md:180` — §"Arm syntax": "All arms must
    produce values of the same type, or values whose types share a common upper
    bound under [Type System — Type
    compatibility](./type-system.md#type-compatibility) (every arm `⊑` the
    chosen common type, narrowed by any sink in scope on the `match` expression
    itself); a mismatched-arm `match` is `theta/parse/match-arm-type-mismatch`."
    `docs/spec_topics/expressions.md:225` — the array-construction rule 2 the
    other two sentences point at. `docs/spec_topics/type-system.md:27` — the
    `⊑` site list, which names "the common type of `match` arms or ternary
    branches" alongside the array element sink.
    `docs/reference/grammar.md:262` — "absent → return type inferred (see [Type
    system](./type-system.md))", the forward pointer that makes `:97` the
    operative reference-lane sentence for `fn` returns.
  - **The two registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:75`,
    `theta/parse/match-arm-type-mismatch`, severity `E`, namespace `type`,
    *Trigger* "A `match` arm's body type is not assignable to the common type
    of the other arms.", *Message* `match arm body type does not match the
    common type of the other arms`. `:42`,
    `theta/parse/return-no-common-type`, severity `E`, namespace `type`,
    *Trigger* "A theta or annotation-less-`fn` body whose tail-expression type
    and early-`return` operand types (every `return` syntactically present,
    regardless of static reachability) share no common upper bound and no sink
    narrows them.", *Remedy* "Give the body a single return type, or add an
    explicit `fn` return annotation / sink that reconciles the operands.",
    *Message* `return operands have no common type; annotate the function
    return type or reconcile the operands`. Mirrors without a *Trigger* column:
    `docs/reference/diagnostics.md:124` and `:88`. Neither *Message* is
    placeholdered on any input below, so no DIAG-4 reword is in play at either
    row.
  - **The one LUB the array/ternary sites use** —
    `src/parser/type-compat.ts:656–677`, `commonType`, with its three-clause
    doc comment at `:620–655`; `CompatRelation` at `:618`; `isObjectBranch`
    (rule 3's kind gate) at `:698–704`; `checkCommonType` at `:555–606` with
    its `commonType` call at `:592`. Lines 1–591 of this file are byte-identical
    to `9e797da7` (`diff` empty), so every citation below 592 in any other
    report is unaffected by 0081 and by either route here.
  - **The two LUBs that do not** —
    `src/parser/match-result.ts:214–238`, `leastUpperBound`: `covers` at
    `:218–222`, the member restriction `armTypes.filter(covers)` at `:223`,
    the `undefined` return at `:224–226`, the least-candidate scan at
    `:227–236`, the `candidates[0]` fallback at `:237`. Its caller
    `checkMatchArmTypes` at `:165–194` (doc comment `:151–164`): the sink arm
    at `:176–185`, the sink-less arm at `:187–193`, `mismatchDiagnostic` at
    `:196–205`.
    `src/parser/functions.ts:348–358`, `computeLub`, whose re-scoped doc
    comment sits at `:340–347`. Its caller `resolveReturnType` at `:267–329`
    (doc comment `:250–266`): the annotation bypass at `:280–285`, the FN-3
    wrap at `:289–290`, the FN-4 empty-tail arm at `:294–300`, the
    `computeLub` call at `:309`, the `return-no-common-type` construction at
    `:311–326`.
  - **The inference pass** — `src/parser/static-type-inference.ts`, exactly 378
    lines. `#typeExpr`'s `case "match"` at `:237–241`; `case "array"` at
    `:217–223`; `case "ternary"` at `:226–233`; `case "call"` at `:251–252`
    (why the pass computes no return LUB); `#typeBinary`'s arithmetic tail at
    `:331–337`; `#commonType` at `:353–358` with its doc comment at `:340–352`,
    including the rule-3 `?? (candidates[0] as CompatType)` fallback at `:357`.
  - **The checker walk** — `src/parser/type-layer-checks.ts:1958–1966`, the
    `case "match"` arm: `checkMatchArmTypes` is called with
    `armTypes: e.arms.map((arm) => this.typeOf(arm.body, bindings))` (`:1961`)
    and **`sink: undefined`** (`:1962`), hard-coded. This is the file's only
    call site (import at `:86`), so `checkMatchArmTypes`'s sink arm
    (`match-result.ts:176–185`) is unreachable from `.theta` source — measured
    in §Reproduction (s). `checkArrayLiteral` at `:1426–1448` with its
    `checkCommonType` call at `:1441`.
  - **The registration gate** —
    `src/extension/production-composition.ts:2047–2054`, `hasLoadParseError`:
    any error-severity diagnostic whose code starts `theta/load/` or
    `theta/parse/` blocks registration; called at `:1329`, `:1751`, `:1935`,
    `:2094`.
  - **The governance clauses either route must dispose against** —
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, "The registry
    is closed"); `docs/spec_topics/governance/source-language-stability.md:9`
    (the loads-cleanly predicate) and `:25` (the diagnostic-registry carve-out,
    "a code **removal** (DIAG-2) is in-scope for inputs that previously emitted
    the removed code" and "a DIAG-2 *trigger* change is dispositioned by the
    same principle, in-scope as an addition for inputs newly brought into the
    code's emission set and as a removal for inputs taken out of it").
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is **34** files.
    Four contain a `match`: `docs/examples/configure-tool-loop.theta:8`,
    `docs/examples/fan-out-reviews.theta:29`,
    `docs/examples/handle-error.theta:12`,
    `tests/live/acceptance/fixtures/acc-match-queryerror.theta:7`. Every one has
    arms that already share a dominating member (three all-`string`, one
    all-`Triage`). Six contain a `return`: `docs/examples/ralph-inline.theta`,
    `docs/examples/ralph.theta`, `docs/examples/refine-inline.theta`,
    `docs/examples/refine.theta`,
    `docs/examples/typed-params-across-boundary.theta`,
    `tests/live/acceptance/fixtures/acc-lib.thetalib`. **Zero** committed files
    draw `theta/parse/match-arm-type-mismatch` or
    `theta/parse/return-no-common-type` when parsed through the shipped
    `parseThetaDocument` (§Reproduction (g)), so no committed theta's
    diagnostic sequence moves under either route.
  - **The witnesses either route must keep green or re-pin** —
    `tests/match-result.test.ts:220–283`, the `V4a-T` block asserting
    `checkMatchArmTypes([string, integer])` fires the row with the
    registry-sourced *Message*; `tests/array-ternary-common-type-union.test.ts`
    (21 cells, 0081's own witness, which pins the union clause and rule 3 in
    both directions); `tests/division-result-type-number.test.ts` (0142's
    group-(t) harness); `tests/fn-arg-type-mismatch-wired.test.ts` (84 cells,
    including 0145's u13e at `:2784`).
- **Observed at:** `0.83.0` (HEAD `5de8d78a`). Offline, deterministic; no live
  model, no provider, no child process, no network. Parse rows go through the
  shipped `parseThetaDocument` via the house driver `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) with frontmatter `---\nmode: prompt\n---` on
  lines 1–3, so the source under test starts on line 4; `hits` is the whole
  unfiltered `doc.diagnostics` in emission order rendered `severity code ::
  message`. Raw-type rows are one
  `new StaticTypeInferencePass({ checkCompatible }).typeOf(doc.body.tail, {})`
  call over the shipped `⊑` engine — the group-(t) harness shape
  `tests/division-result-type-number.test.ts:583–603` establishes. Seam rows
  call `checkMatchArmTypes`, `resolveReturnType` and `commonType` directly with
  hand-built `CompatType` arrays. "Registers" is read as `hasLoadParseError`
  defines it: zero error-severity `theta/parse/*` diagnostics. Measured with
  four scratch vitest probes, run on the outputs quoted below, then deleted;
  the tracked tree at the close of this filing is identical to HEAD
  (`git status --short` empty apart from this document, no path matching
  `scratch` anywhere). `src/`, `tests/`, `docs/bugs/README.md` and every other
  bug document are unmodified by this filing.

## Summary

Bug 0081's fix put the array/ternary least upper bound in one exported
`commonType` (`type-compat.ts:656`) and gave it a union clause: a dominating
branch wins, otherwise the branches union verbatim, except a set holding an
object branch with no dominator. Two callers share it — `checkCommonType`, and
`StaticTypeInferencePass.#commonType`. The inference pass routes four node kinds
through `#commonType`, and one of them is `case "match"`
(`static-type-inference.ts:237–241`). So `typeOf` on
`match 1 { 1 => 1, _ => "a" }` is now `integer | string`.

The checker did not follow. `checkMatchArmTypes` reduces the same arm types with
`leastUpperBound` (`match-result.ts:214`), which filters the candidate set down
to MEMBERS of its input and answers `undefined` when none dominates; the
annotation-less `fn`/theta return path reduces its contributions with
`computeLub` (`functions.ts:348`), which does the same with `types.find`. Both
still refuse. The result is a two-way split: `[1, "a"]` and `true ? 1 : "a"`
load and type as unions, `match 1 { 1 => 1, _ => "a" }` draws
`theta/parse/match-arm-type-mismatch`, and the `fn`-return twin draws
`theta/parse/return-no-common-type`. The spec's own worked vector
`["a", null] → string | null` splits the same way (rows v1–v4).

No false `E` ships. The checker's `match` row runs on the same node, over the
same `typeOf(arm.body, …)` reads, that produce the union
(`type-layer-checks.ts:1958–1966`), so the two are coextensive: measured across
ten syntactic positions, every heterogeneous `match` is refused and registration
is denied before any sink consumes the union. On the `fn`-return side the
inference pass computes no return type at all, so there is no second
computation. What ships is two false normative sentences —
`docs/reference/type-system.md:97` and `docs/spec_topics/functions.md:26` — each
asserting that these two constructs use the array/ternary discipline, which now
unions where they do not; two registered *Triggers* written to the dominating
reading; and a measured spillover inside already-refused programs, where the
union reaches three other rows' `<actual>` placeholders and adds codes the
pre-0081 answer did not draw. The deliverable is the adjudication: ADOPT the
union at both LUBs, or CORRECT the sentences to scope the union discipline to
the array/ternary positions.

## Reproduction

Offline, at `5de8d78a`. Parse rows: `parseDoc` over the production
`parseThetaDocument`, frontmatter `---\nmode: prompt\n---`, source from line 4.
`hits` is the whole aggregated, unfiltered `doc.diagnostics`. Raw-type rows:
`StaticTypeInferencePass.typeOf` on the body tail over an empty `TypeEnv`. Seam
rows: direct calls with hand-built `CompatType` arrays.

### (t) The raw inference read, and the two checker LUBs on the same input

```
@@ t1 match 1 { 1 => 1, _ => "a" }
     typeOf=integer | string  raw={"kind":"union","arms":[{"kind":"literal","typesAs":"integer"},{"kind":"literal","typesAs":"string"}]}
@@ t2 match 1 { 1 => 1, _ => 2 }
     typeOf=integer  raw={"kind":"literal","typesAs":"integer"}
@@ t3 match 1 { 1 => 1, _ => 2.5 }
     typeOf=number  raw={"kind":"literal","typesAs":"number"}
@@ t4 match 1 { 1 => "a", _ => null }
     typeOf=string | null  raw={"kind":"union","arms":[{"kind":"literal","typesAs":"string"},{"kind":"literal","typesAs":"null"}]}
@@ t5 match 1 { 1 => 1, 2 => "a", _ => true }
     typeOf=integer | string | boolean  raw={"kind":"union","arms":[{"kind":"literal","typesAs":"integer"},{"kind":"literal","typesAs":"string"},{"kind":"literal","typesAs":"boolean"}]}
```

The same candidate sets through the three LUB functions, called directly:

```
@@ tC1 commonType([integer,string])            = {"kind":"union","arms":[{"kind":"literal","typesAs":"integer"},{"kind":"literal","typesAs":"string"}]}
@@ tC2 checkMatchArmTypes([integer,string]).lub   = undefined
@@ tC3 checkMatchArmTypes([integer,string]).diags = ["theta/parse/match-arm-type-mismatch"]
@@ tC4 resolveReturnType([integer,string])     = {"kind":"inference-no-common-type","diagnostic":{"severity":"error","code":"theta/parse/return-no-common-type","file":"bug0158.theta","message":"return operands have no common type; annotate the function return type or reconcile the operands"}}
@@ tC5 resolveReturnType([integer,number])     = {"kind":"inferred","inferred":{"payload":{"kind":"literal","typesAs":"number"},"wrapped":false}}
@@ tC6 commonType([integer,number])            = {"kind":"literal","typesAs":"number"}
```

tC1 against tC2 and tC4 is the divergence with the input held fixed: one
function unions, the other two answer "no candidate". tC5/tC6 is the control —
on a dominating set all three agree, which is why an admitted program sees
nothing (t2, t3).

### (n)(v)(o)(d) The four routes over one candidate set, end to end

`[1, "a"]`:

```
@@ n1 array   "let x = [1, \"a\"]\nx"                       hits=[]
@@ n2 ternary "let t = true ? 1 : \"a\"\nt"                 hits=[]
@@ n3 match   "let m = match 1 { 1 => 1, _ => \"a\" }\nm"
   hits=["error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ n4 fnret   "fn g() {\n  if true { return 1 }\n  \"a\"\n}\ng()"
   hits=["error theta/parse/return-no-common-type :: return operands have no common type; annotate the function return type or reconcile the operands"]
```

`["a", null]` — the spec's own worked vector at `type-system.md:89–92`:

```
@@ v1 array   "let x = [\"a\", null]\nx"                     hits=[]
@@ v2 ternary "let t = true ? \"a\" : null\nt"               hits=[]
@@ v3 match   "let m = match 1 { 1 => \"a\", _ => null }\nm"
   hits=["error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ v4 fnret   "fn g() {\n  if true { return \"a\" }\n  null\n}\ng()"
   hits=["error theta/parse/return-no-common-type :: return operands have no common type; annotate the function return type or reconcile the operands"]
```

Rule 3 — two object schemas, no dominator (`schema A { a: integer }` and
`schema B { b: string }` precede each row):

```
@@ o1 array   "let x = [A { a: 1 }, B { b: \"s\" }]\nx"
   hits=["error theta/parse/array-no-common-type :: array elements have no common type; annotate the binding with array<A | B> or use a single schema"]
@@ o2 ternary "let t = true ? A { a: 1 } : B { b: \"s\" }\nt"      hits=[]
@@ o3 match   "let m = match 1 { 1 => A { a: 1 }, _ => B { b: \"s\" } }\nm"
   hits=["error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ o4 fnret   "fn g() {\n  if true { return A { a: 1 } }\n  B { b: \"s\" }\n}\ng()"
   hits=["error theta/parse/return-no-common-type :: return operands have no common type; annotate the function return type or reconcile the operands"]
```

TYPE-2 dominating control — all four admit:

```
@@ d1 array   "let x = [1, 2.5]\nx"                          hits=[]
@@ d2 ternary "let t = true ? 1 : 2.5\nt"                    hits=[]
@@ d3 match   "let m = match 1 { 1 => 1, _ => 2.5 }\nm"      hits=[]
@@ d4 fnret   "fn g() {\n  if true { return 1 }\n  2.5\n}\ng()"  hits=[]
```

o1/o3/o4 agree because rule 3 is the one case where `commonType` also answers
`undefined`. o2 is bug 0155's subject and is left there. The n/v block is the
report: identical candidate sets, opposite dispositions, decided by which of
three LUB functions the position calls.

### (w) Does the walk reach every `match` the inference pass types?

Ten positions; each source's only defect is one heterogeneous `match`.

```
@@ w1  if body        "if true { match 1 { 1 => 1, _ => \"a\" } }\n1"
@@ w2  else body      "if false { 1 } else { match 1 { 1 => 1, _ => \"a\" } }\n1"
@@ w3  while body     "let mut i = 0\nwhile i < 1 { i = i + 1\n  match 1 { 1 => 1, _ => \"a\" } }\n1"
@@ w4  par for body   "let r = par for x in [1] { match x { 1 => 1, _ => \"a\" } }\nr"
@@ w5  subagent fn    "subagent fn g() { match 1 { 1 => 1, _ => \"a\" } }\ng()"
@@ w6  nested block   "fn g() { if true { if true { match 1 { 1 => 1, _ => \"a\" } } }\n  1 }\ng()"
@@ w7  scrutinee      "match (match 1 { 1 => 1, _ => \"a\" }) { _ => 1 }"
@@ w8  index target   "let a = (match 1 { 1 => [1], _ => [\"a\"] })[0]\na"
@@ w9  return operand "fn g(): integer { return match 1 { 1 => 1, _ => \"a\" } }\ng()"
@@ w10 uncalled fn    "fn g() { match 1 { 1 => 1, _ => \"a\" } }\n1"
```

All ten: `hits=["error theta/parse/match-arm-type-mismatch :: match arm body
type does not match the common type of the other arms"]`. Plus the tail, `let`
RHS, arm body, array element, ternary branch, `for` body and method receiver
positions in the same probe. w9 and w10 are the two that could have escaped —
an annotated `fn` (whose return path bypasses `computeLub`) and a function never
called — and neither does. This is the no-false-`E` bound made concrete: the
walk visits every `match` node, `checkMatchArmTypes` runs on every visit with
the same arm-type reads, so no admitted program contains a `match` whose
inference type is a union.

### (r) The registration gate

```
@@ r1 "let m = match 1 { 1 => 1, _ => \"a\" }\nm"  errorSeverityCount=1 codes=["theta/parse/match-arm-type-mismatch"]
@@ r2 "let m = match 1 { 1 => 1, _ => 2 }\nm"      errorSeverityCount=0 codes=[]
```

`hasLoadParseError` (`production-composition.ts:2047–2054`) is true for r1 and
false for r2, so r1 never registers and no runtime, binder or wire surface reads
the union.

### (p)(c)(x) What the union does reach: three other rows' `<actual>`

The union renders into three sinks, in each case alongside the `match` row —
never alone:

```
@@ p9  call arg    "fn h(p: integer) { p }\nlet r = h(match 1 { 1 => 1, _ => \"a\" })\nr"
   hits=["error theta/parse/fn-arg-type-mismatch :: fn 'h' argument 0 ('p') type mismatch: expected integer, got integer | string",
         "error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ p11 object fld  "schema S { f: integer }\nlet o = S { f: match 1 { 1 => 1, _ => \"a\" } }\no"
   hits=["error theta/parse/object-field-type-mismatch :: field 'f' on schema 'S' type mismatch: expected integer, got integer | string",
         "error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ p14 binary opnd "let n = 1 + match 1 { 1 => 1, _ => \"a\" }\nn"
   hits=["error theta/parse/mixed-plus-operands :: '+' has mixed operand types: integer and integer | string",
         "error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ p15 let sink    "let m: string = match 1 { 1 => 1, _ => \"a\" }\nm"
   hits=["error theta/parse/let-rhs-type-mismatch :: let binding 'm' initialiser type mismatch: expected string, got integer | string",
         "error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms"]
@@ p16 downstream  "let m = match 1 { 1 => 1, _ => \"a\" }\nm + 1"
   hits=["error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms",
         "error theta/parse/mixed-plus-operands :: '+' has mixed operand types: integer | string and integer"]
```

The dominating-arm controls at the identical sinks are silent, which is what
"an admitted program sees nothing" means:

```
@@ c9  "fn h(p: integer) { p }\nlet r = h(match 1 { 1 => 1, _ => 2 })\nr"          hits=[]
@@ c11 "schema S { f: integer }\nlet o = S { f: match 1 { 1 => 1, _ => 2 } }\no"   hits=[]
@@ c14 "let n = 1 + match 1 { 1 => 1, _ => 2 }\nn"                                 hits=[]
@@ c4  "let m = match 1 { 1 => 1, _ => 2 }\nm + 1"                                 hits=[]
@@ c7  "let m: string = match 1 { 1 => 1, _ => 2 }\nm"
   hits=["error theta/parse/let-rhs-type-mismatch :: let binding 'm' initialiser type mismatch: expected string, got integer"]
```

The pre-0081 answer for the same candidate sets, from the `#commonType` body at
`git show 9e797da7:src/parser/static-type-inference.ts` `:347–357` (dominating
member, else `candidates[0]`), transcribed and re-run:

```
@@ x1 old #commonType([integer,string]) = integer  ({"kind":"literal","typesAs":"integer"})
@@ x2 old #commonType([string,null])    = string   ({"kind":"literal","typesAs":"string"})
@@ x3 old #commonType([integer,number]) = number   ({"kind":"literal","typesAs":"number"})
@@ x4 "let m = 1\nm + 1"          hits=[]
@@ x5 "let m: string = 1\nm"
   hits=["error theta/parse/let-rhs-type-mismatch :: let binding 'm' initialiser type mismatch: expected string, got integer"]
```

x1 with c9/c11/c14 gives the delta: p9, p11 and p14 each drew ONE code before
0081 and draw TWO now; p15 and p16 draw the same codes with a different
`<actual>` (`integer` → `integer | string`). x3 is the control that the
dominating case is unmoved. Every affected input already carried an `E` at
1.0.0, so none is in GOV-15's loads-cleanly set.

### (s) The `match` sink arm is unreachable from source

`checkMatchArmTypes` has a documented sink arm (`match-result.ts:176–185`,
"With an in-scope sink on the `match` expression itself, every arm body must be
`⊑` the sink"), which `expressions.md:180` also states. The walk's only call
site passes `sink: undefined` (`type-layer-checks.ts:1962`), so no annotation
reaches it:

```
@@ s1 "let m: integer | string = match 1 { 1 => 1, _ => \"a\" }\nm"
@@ s2 "fn h(p: integer | string) { p }\nlet r = h(match 1 { 1 => 1, _ => \"a\" })\nr"
@@ s3 "schema U { f: integer | string }\nlet o = U { f: match 1 { 1 => 1, _ => \"a\" } }\no"
```

All three: `hits=["error theta/parse/match-arm-type-mismatch :: …"]`. There is
therefore no author-side escape hatch for a heterogeneous `match` at this HEAD.
The `fn`-return twin has one, because an explicit annotation bypasses
`computeLub` entirely (`functions.ts:280–285`):

```
@@ e1 "fn g() {\n  if true { return 1 }\n  \"a\"\n}\ng()"
   hits=["error theta/parse/return-no-common-type :: …"]
@@ e2 "fn g(): integer | string {\n  if true { return 1 }\n  \"a\"\n}\ng()"   hits=[]
```

e2's silence is not a type-check passing. The walk consumes `resolveReturnType`
only when `fn.returnType === null` (`type-layer-checks.ts:1246–1257`); for a
non-`subagent` annotated `fn` the `else if (fn.subagent)` arm (`:1257`) runs
nothing, so the `"checked"` `operandResults` are discarded and no code exists
for the plain annotated-return mismatch — `fn g(): integer { "a" }` and
`fn g(): integer { return "a" }` both report `[]` at this HEAD. That gap is
independent of this report and unchanged by 0081; it is recorded here so the
annotation is not mistaken for a working sink (§Non-goals).

### (g) The corpus

```
@@ g0 committed .theta/.thetalib files = 34
@@ g1 files containing 'match' = ["docs/examples/configure-tool-loop.theta","docs/examples/fan-out-reviews.theta","docs/examples/handle-error.theta","tests/live/acceptance/fixtures/acc-match-queryerror.theta"]
@@ g2 files containing 'return' = ["docs/examples/ralph-inline.theta","docs/examples/ralph.theta","docs/examples/refine-inline.theta","docs/examples/refine.theta","docs/examples/typed-params-across-boundary.theta","tests/live/acceptance/fixtures/acc-lib.thetalib"]
@@ g3 files drawing match-arm-type-mismatch or return-no-common-type = []
```

Every committed `match` has arms sharing a dominating member, so no committed
theta's diagnostic sequence moves under either route.

## Expected behaviour

The spec says these constructs share one discipline. `docs/reference/type-system.md:97–98`:

> `match` arms and inferred theta/`fn` return types use the same LUB discipline (see
> [Grammar](./grammar.md) and [Errors and results — final value](./errors-and-results.md)).

`docs/spec_topics/functions.md:26` (FN-3) says it again for the return side,
naming the three constructs it borrows from:

> applying the same common-upper-bound discipline — the least upper bound under
> [Type System — Type compatibility](./type-system.md#type-compatibility) (`⊑`),
> with every contributing type `⊑` the chosen common type, narrowed by any sink
> in scope — that the spec already applies to `match` arms, ternary branches,
> and array literals

`docs/spec_topics/expressions.md:180` states the arm rule in the same shape:

> All arms must produce values of the same type, or values whose types share a
> common upper bound under [Type System — Type
> compatibility](./type-system.md#type-compatibility) (every arm `⊑` the chosen
> common type, narrowed by any sink in scope on the `match` expression itself);
> a mismatched-arm `match` is `theta/parse/match-arm-type-mismatch`.

Neither the FN-3 clause nor the arm-syntax clause restricts the chosen common
type to a MEMBER of the contributing set: both state only that every
contribution is `⊑` it. A union satisfies that — `integer ⊑ integer | string`
and `string ⊑ integer | string` under TYPE-5/TYPE-6, which is exactly why the
array/ternary rule's union clause is legal under the same relation. Read
literally at this HEAD, all three sentences admit `match 1 { 1 => 1, _ => "a" }`
and `fn g() { if true { return 1 } "a" }`.

The two registered *Triggers* read the other way.
`code-registry-parse.md:75`:

> A `match` arm's body type is not assignable to the common type of the other
> arms.

`code-registry-parse.md:42`:

> A theta or annotation-less-`fn` body whose tail-expression type and
> early-`return` operand types (every `return` syntactically present, regardless
> of static reachability) share no common upper bound and no sink narrows them.

Both presuppose that a set can fail to have a common upper bound in cases where
the array/ternary rule now computes one. Under a union LUB, "share no common
upper bound" survives only as rule 3 — an object branch with no dominator — so
each *Trigger* narrows onto rows o3 and o4 rather than dying.

Whichever way the divergence is resolved, three properties must hold
afterwards:

1. **One answer per candidate set, per position, stated in the spec.** Either
   all four routes union (n1–n4, v1–v4 all `[]`), or the spec says in terms that
   the `match`/return LUB is dominating-member-only and the array/ternary LUB is
   not.
2. **Rule 3 is preserved on every route.** o1, o3 and o4 refuse today and must
   keep refusing; o2 is 0155's.
3. **The dominating case does not move.** d1–d4, t2, t3, tC5, tC6, and every
   committed theta in (g) are unchanged by either route.

## Actual behaviour / root cause

Three LUB functions over one `⊑` relation, and 0081 changed one of them.

**`commonType` (`type-compat.ts:656–677`) — the array/ternary LUB, unions.**
Clause 1 finds a dominating branch; clause 2 returns
`{ kind: "union", arms: branches }`; clause 3 withholds when an object branch is
present with no dominator. Its doc comment (`:620–655`) scopes itself to "The
array/ternary common type of `branches`", per "expressions.md §"Array
construction" rule 2 and type-system.md §"Common-type rules" rule 2" — the two
array/ternary sentences, not the `match` or FN-3 ones.

**`leastUpperBound` (`match-result.ts:214–238`) — the `match`-arm LUB, does
not.** `const candidates = armTypes.filter(covers)` (`:223`) restricts the
answer to a member of the arm-type set; `if (candidates.length === 0) return
undefined` (`:224–226`) is the refusal. Its doc comment states the member
restriction as the definition: "a candidate arm type that every arm is `⊑`, and
that is itself `⊑` every other such candidate (the least)".

**`computeLub` (`functions.ts:348–358`) — the return LUB, does not.**
`types.find(candidate => types.every(…))` is the same member restriction in one
expression. Its doc comment was re-scoped by 0081's own review round 1, and now
records the divergence in the tree, verbatim (`:340–347`):

> The least upper bound of `types` under `⊑`: a member `C` of `types` such
> that every type is `⊑ C`. Returns `undefined` when no member dominates the
> rest — unlike `commonType` (`./type-compat.ts`), this LUB has no union
> clause, so a non-dominated set here has no candidate rather than a computed
> union. A statically-unresolvable operand (`"unknown"`) does not block a
> candidate — the runtime AJV check is the safety net.

That comment is accurate and is the admission that the spec sentence at
`type-system.md:97` no longer holds. `leastUpperBound`'s comment carries no
equivalent note.

**How the union reaches the `match` node.** `#typeExpr`'s `case "match"`
(`static-type-inference.ts:237–241`) maps the arm bodies and hands the array to
`#commonType` (`:353–358`), which delegates to the shared `commonType` over the
pass's injected engine and falls back to `candidates[0]` only when `commonType`
answers `undefined` (rule 3). Before 0081 that method WAS the dominating-member
search with the same fallback, so it agreed with `leastUpperBound` by
construction. 0081 replaced the body with the delegation and the agreement
ended. The `case` block itself is byte-identical to `9e797da7`; nothing about
`match` was edited.

**Why no admitted program observes it.** The checker's walk
(`type-layer-checks.ts:1958–1966`) computes `armTypes` with the same
`this.typeOf(arm.body, bindings)` call the inference pass answers, then hands
them to `checkMatchArmTypes`. So for any arm-type set, "the inference pass
returns a union" and "`leastUpperBound` returns `undefined`" are the same
condition, and the second one emits an `E`-severity `theta/parse/*` code that
`hasLoadParseError` turns into a registration refusal. Group (w) confirms the
walk reaches every `match` position, including an uncalled `fn` and an
annotated `fn`'s `return` operand. Group (s) confirms no annotation suppresses
the row, because the walk hard-codes `sink: undefined`.

**Why the `fn`-return side has no second computation at all.** `#typeExpr`'s
`case "call"` (`static-type-inference.ts:251–252`) answers
`{ kind: "named", name: node.callee }` — the callee's NAME, not its return type.
The inference pass therefore never computes a return LUB, and the return-side
defect is exactly one thing: FN-3 and `type-system.md:97` claim a discipline
`computeLub` does not implement.

**What does leak.** Inside programs the `match` row already refuses, the union
flows onward through `typeOf` into four other sinks and changes their output
(§Reproduction (p)): two of them gain a diagnostic that the pre-0081 `integer`
answer did not draw (p9, p11, p14 against controls c9, c11, c14), and two render
`integer | string` where they rendered `integer` (p15, p16). Each of those
inputs already carried an `E` at 1.0.0, so GOV-15's promise — which ranges only
over inputs that load with no `E` (`source-language-stability.md:9`) — is not
breached. It is nonetheless a diagnostic-sequence movement attributable to 0081
and is recorded here rather than left to be re-discovered.

## Why it matters

- **Two normative sentences are false, and the falsity is not visible from
  either sentence alone.** `type-system.md:97` and `functions.md:26` both say
  "the same discipline". A reader who checks the array/ternary rules at `:85–95`
  and then writes `match 1 { 1 => 1, _ => "a" }` gets an `E`. The failure mode
  is a correct spec read producing a rejected program, and the rejection message
  ("does not match the common type of the other arms") names a common type the
  reader can see the spec computing four lines earlier.
- **The divergence is latent, and the next inference consumer trips over it.**
  `#typeExpr` is a shared seam: `TypeLayerWalk` forwards to it, and
  `collectProvableArgTypes` (`src/extension/invoke-static-checks.ts:505`) reasons
  over the SET of types a node can take. Today the `match` union is fenced in
  by the checker row running on the same node. Any future consumer that reads
  `typeOf` on a `match` WITHOUT that row running in the same pass — a hover
  type, a completion, a new sink that defers instead of refusing, or a fix that
  makes the `match` row skippable (0145's route family touches this same
  block) — inherits a type the checker will not admit, and the fence is gone
  with no witness to catch it.
- **The spillover already changed measured behaviour.** p9, p11 and p14 draw a
  second code that they did not draw at 0.82.0; p15 and p16 render a different
  `<actual>`. The inputs are all outside GOV-15's set, so nothing is breached,
  but the fix that resolves this report will move these rows again, and doing
  that without knowing they moved once already invites a wrong baseline.
- **Half of `checkMatchArmTypes` is dead, and the adjudication decides whether
  that matters.** `expressions.md:180` promises the arms are "narrowed by any
  sink in scope on the `match` expression itself"; the walk passes
  `sink: undefined` unconditionally, so there is no way to write a
  heterogeneous `match` that loads (group (s)). Under the CORRECT route this
  becomes the only remaining escape hatch and its absence is load-bearing;
  under the ADOPT route it stops mattering for the union case.
- **The cost of resolving it is bounded and measured.** Zero committed thetas
  draw either row, and no committed `match` has non-dominating arms (group (g)),
  so neither route moves a corpus observable.

## Non-goals

- **The ternary caller of `checkCommonType`, and the scope of
  `theta/parse/array-no-common-type`'s registered *Trigger*.** Row o2 measures
  it (`true ? A { a: 1 } : B { b: "s" }` → `[]` where the array twin refuses)
  and leaves it with
  [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md), which owns
  0081 residual R1. No route here edits `checkCommonType`, `checkArrayLiteral`,
  the `array-no-common-type` row, or `#typeExpr`'s `case "ternary"`. Row n2/v2
  behaviour must be byte-unchanged by any fix here.
- **Which binding an arm body reads.**
  [0145](./0145-inference-pass-no-match-arm-scope.md) owns the arm-scope
  question at the same `case` block. This report claims only what the SET of arm
  body types reduces to, taking each arm body's type as `typeOf` currently
  answers it. Whichever lands second rebases against the other's edit to
  `static-type-inference.ts:237–241`.
- **The diagnostic COUNT at the sinks in group (p).** One input drawing two
  codes is [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s
  class. This report measures the counts and their movement; it does not
  adjudicate them, and a fix here must state what the counts become rather than
  silently re-pinning them.
- **The plain annotated-`fn` return check.** `resolveReturnType`'s `"checked"`
  branch (`functions.ts:280–285`) produces `operandResults` that the walk
  discards for a non-`subagent` annotated `fn` (`type-layer-checks.ts:1257`),
  and no registry row covers the slot, so `fn g(): integer { "a" }` reports `[]`
  (§Reproduction (s)). The gap predates 0081 and is untouched by either route
  here; a fix must not close it as a side effect, and must not rely on it —
  row e2 loads because nothing checks it, not because the annotation narrows.
- **A *Message* reword or a code rename at either row.** DIAG-4 defers wording
  to theta 2.0 and neither *Message* is placeholdered on any input above, so
  neither needs one under either route.
- **The `<actual>` spelling of a union.** `integer | string` rather than
  `number | string` is bug 0081's pinned disposition 1 (arms verbatim, matching
  `concatElementType`). Any union this fix causes to be rendered inherits that
  spelling; changing it is 0081's decision to reopen, not this one's.
- **Citation drift.** Either route shifts absolute line numbers in
  `src/parser/match-result.ts` and/or `src/parser/functions.ts`; that is bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class. 0145's two stale citations are corrected in §Related for
  the record, not in 0145's document.

## Fix

Not settled. The two routes below are constraint-pinned; the run selects one and
states its choice with the evidence that settled it. They are exclusive — the
divergence is between an implementation and a sentence, and exactly one of the
two moves.

### Route A — ADOPT the union LUB at `match` arms and inferred returns

A behaviour change. `leastUpperBound` (`match-result.ts:214`) and `computeLub`
(`functions.ts:348`) stop being member-restricted and answer the same three
clauses `commonType` answers.

- **A1 — one decision procedure, not three copies.** The route that meets
  0081's constraint 3 in the same way it met it for the array/ternary pair is
  to call the exported `commonType` (`type-compat.ts:656`) from both sites,
  over the `CompatRelation` each already uses (`checkCompatible` in both
  cases). Re-implementing the union clause in either module reintroduces
  exactly the drift 0081 removed and must be refused unless a measured reason
  is recorded.
- **A2 — the `undefined` contract differs at the two callers and must be kept.**
  `checkMatchArmTypes` returns `{ diagnostics: [mismatch], lub: undefined }`
  and `resolveReturnType` returns `kind: "inference-no-common-type"` when their
  LUB is absent. `commonType`'s `undefined` means rule 3 only. Both callers
  keep refusing on `undefined` — that is what preserves rows o3 and o4 — and
  neither may adopt `#commonType`'s `?? candidates[0]` fallback, which exists
  because the inference pass owes the walk a type and these two callers do not.
- **A3 — rule 3 must survive at both sites, witnessed destructively.** o3 and
  o4 are the only inputs that still refuse. A fix must prove that neutralising
  `isObjectBranch` reds a cell — 0081 proved exactly this for its own two rule-3
  cells (r7, r7b) and the same discipline applies here, or rule 3 ships
  unwitnessed at two new call sites.
- **A4 — GOV-15 removal direction, and its measurement.** Adopting the union
  REMOVES `theta/parse/match-arm-type-mismatch` and
  `theta/parse/return-no-common-type` emissions on every input in rows n3, n4,
  v3, v4, w1–w10, p9, p11, p14, p15, p16 and s1–s3. All of those carry an `E`
  today, so none is in GOV-15's loads-cleanly set
  (`source-language-stability.md:9`) and the promise is untouched; the corpus
  measurement in group (g) — 34 files, zero drawing either row — must be
  **re-run at the fix HEAD**, not copied, because sibling fixes land files. The
  disposition is the diagnostic-registry carve-out's removal arm (`:25`):
  "a code **removal** (DIAG-2) is in-scope for inputs that previously emitted
  the removed code".
- **A5 — GOV-15 addition direction.** Newly-admitted programs newly reach
  downstream sinks. Measured here: p9, p11 and p14 keep their second code and
  lose the `match` row; p15 keeps `let-rhs-type-mismatch` with `<actual>`
  `integer | string`; s1–s3 become `[]`; n3/v3/n4/v4 become `[]`. No input
  gains a code it did not already draw. A fix must re-derive this set rather
  than assume it, and must state whether any input moves INTO the loads-cleanly
  set (n3, v3, n4, v4, w1–w10 and s1–s3 do), which is the carve-out's
  "in-scope as an addition for inputs newly brought into the code's emission
  set" clause read in reverse.
- **A6 — DIAG-2 *Trigger* fidelity.** Neither row is deleted: both narrow onto
  rule 3. Under the 0084/0139/0081 posture, narrowing an emission set onto its
  registered *Trigger* needs no registry edit — but here the *Trigger* TEXT
  presupposes the dominating reading ("the common type of the other arms";
  "share no common upper bound"). The run must decide, and record, whether the
  narrowed emission set is still inside the registered text or whether a
  *Trigger* edit is owed. A *Trigger* edit is a DIAG-2 spec change landing in
  the same commit (`diagnostic-shape.md:72`).
- **A7 — spec edits in the same commit.** `type-system.md:97–98` becomes true
  as written and needs no edit; `functions.md:26` likewise. If either sentence
  is kept, the run must state that it verified it against the new behaviour
  rather than assuming it. `expressions.md:180`'s sink clause stays false until
  the walk stops hard-coding `sink: undefined` (§Non-goals leaves that open, but
  a fix that admits the union must say whether it also closes it, since the
  clause's only purpose was the escape hatch the union replaces).
- **A8 — witness re-pins, all in files other reports own.**
  `tests/match-result.test.ts:220–283` asserts
  `checkMatchArmTypes([string, integer])` fires the row; that cell inverts and
  must be re-pinned to assert the union `lub` instead, with the
  registry-sourced *Message* assertion preserved on a rule-3 input. The new
  witness must carry a loud precondition per absence cell (0081's discipline)
  and must red before the fix, with the red set derived before it is measured.
- **A9 — the byte pins.** `src/parser/static-type-inference.ts` must stay at
  **378** lines (eleven open reports cite it by line: 0019, 0090, 0115, 0126,
  0130, 0136, 0140, 0142, 0145, 0146, 0152). `src/parser/functions.ts` (**427**)
  and `src/parser/type-layer-checks.ts` (**2531**) are at their 0081 counts;
  `src/parser/type-compat.ts` is byte-identical through line **591** and every
  other report's citations into it sit at or below **582**. A route-A change
  lands executable lines in `match-result.ts` and `functions.ts`, so exact
  neutrality is not achievable there; the obligation is to enumerate the induced
  drift the way 0081's residual R5 did, not to chase it (0134).

### Route B — CORRECT the spec to scope the union discipline to array/ternary

A docs-lane change. No `src/` edit, no registry edit, no behaviour change.

- **B1 — the sentence.** `docs/reference/type-system.md:97–98` is rewritten so
  that it no longer asserts identity with the section it sits under. The section
  heading (`:83`, "Common-type rules (array literals & ternary branches)")
  already scopes the union rules; the replacement must say what `match` arms and
  inferred returns DO use — a dominating member of the contributing set, with
  rule 3's object-branch case folded in — and must keep the two cross-links.
- **B2 — the FN-3 clause.** `docs/spec_topics/functions.md:26`'s "the same
  common-upper-bound discipline … that the spec already applies to `match` arms,
  ternary branches, and array literals" is the same claim in the spec lane and
  moves with it. Route B is not complete with only the reference-lane edit.
- **B3 — the arm-syntax clause.** `docs/spec_topics/expressions.md:180`'s
  "every arm `⊑` the chosen common type" admits a union as written. Under route
  B it must say the chosen common type is one of the arm types.
- **B4 — *Trigger* fidelity confirmed, not assumed.** Both *Triggers*
  (`code-registry-parse.md:75`, `:42`) already describe the dominating
  semantics. The obligation is to state that they were re-read against the
  corrected sentences and found consistent — including the second half of
  `:42` ("and no sink narrows them"), which the `match` row's dead sink arm
  (group (s)) does not honour at the `match` site. If that is judged an
  inconsistency, it is a *Trigger* question this route must dispose of or
  explicitly hand to a separate report.
- **B5 — `commonType`'s doc comment.** `type-compat.ts:620–655` scopes itself to
  the array/ternary rules and stays as written. `computeLub`'s comment
  (`functions.ts:340–347`) already records the divergence correctly and stays.
  `leastUpperBound`'s comment (`match-result.ts:207–213`) gains the same note
  `computeLub` carries, so the next reader of `match-result.ts` finds the
  divergence recorded at both sites rather than one. This is a comment-only
  edit and `match-result.ts` has no stated line pin; the run states its line
  count before and after.
- **B6 — GOV-15 and DIAG-2 are both no-ops.** No emission set moves, no registry
  row is touched, every row in §Reproduction is unchanged. The run must say so
  explicitly, with a re-run of the default suite as the evidence, rather than
  omitting the analysis because the route is docs-only.
- **B7 — the residual this route leaves.** Under route B, `#typeExpr`'s
  `case "match"` still computes a union no checker will accept. The run must
  either (i) make the inference pass agree — `case "match"` stops routing
  through `#commonType` and takes the dominating-member reduction, which is an
  executable change inside the 378-line pin and re-instates 0081's constraint 3
  by a different means — or (ii) record, with a witness, that the union is
  deliberately unreachable and state what keeps it so. Shipping route B without
  one of those two leaves the latent divergence §Why it matters names, and the
  fix report must say which was chosen.

### Common obligations

- Rows d1–d4, t2, t3, tC5, tC6 and every committed theta in group (g) are
  unchanged by either route; assert them, do not assume them.
- Row o2 (`true ? A : B` → `[]`) is 0155's and must not move.
- 0145's u13e (`tests/fn-arg-type-mismatch-wired.test.ts:2784`) and the whole
  84-cell file are green at this HEAD and stay green.
- 0081's witness `tests/array-ternary-common-type-union.test.ts` (21 cells) and
  0142's `tests/division-result-type-number.test.ts` stay green.
- Re-derive the corpus census at the fix HEAD; do not reuse group (g)'s numbers.

## Provenance

Filed as residual **R4** of the bug 0081 fix (0.83.0, commit `5de8d78a`).
0081's review round 1 raised it as finding **R1** ("the dominating-only LUB
survives at two sibling call sites while the inference pass now unions `match`
arms"), classified it non-blocking, and the orchestrator carried it to
`.pi/tmp/fixes/0081-report.md` §Residuals R4 and to 0081's own
`## Fix (0.83.0)` record as item 4, marking it "Same adjudication class as
residual 1" — the class [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md)
owns.

Independently re-derived at HEAD `5de8d78a` for this filing, not copied from
0081's measurements: four scratch vitest probes over `parseDoc`
(`tests/helpers/e2e-s1.ts:39`), `StaticTypeInferencePass.typeOf`, and direct
calls to `commonType`, `checkMatchArmTypes` and `resolveReturnType`, covering
every row in §Reproduction, then deleted. The pre-0081 counterfactual in group
(x) was transcribed from `git show 9e797da7:src/parser/static-type-inference.ts`
and re-run against the live `checkCompatible`; no tree was checked out and no
git write was performed.

Every `src/`, `tests/` and spec citation above was re-verified against the tree
at HEAD. Three citations in 0081's own artefacts are corrected here:

- the falsified sentence is `docs/reference/type-system.md:97–98`, not `:96`
  (`:96` is blank) — 0081's fix report §Residuals R4 and its `## Fix (0.83.0)`
  record item 4 both cite `:96`;
- `computeLub` is `src/parser/functions.ts:348` (doc comment `:340–347`); the
  `427` figure 0081 records against that file is its total LINE COUNT pin, not a
  line citation;
- the second falsified sentence, `docs/spec_topics/functions.md:26` (FN-3), is
  named in neither 0081 artefact.

Two citations open bug 0145 will need are recorded in §Related: its u13e cell is
at `tests/fn-arg-type-mismatch-wired.test.ts:2784` (0081 residual R5's disclosed
drift, from `:2694`), and `hasLoadParseError` is at
`src/extension/production-composition.ts:2047–2054`, not `:2045–2052`. 0145's
own document is not edited by this filing.

The line invariants 0081 established were re-proved at this HEAD for this
filing: `wc -l` gives 378 / 427 / 2531 / 704 for
`static-type-inference.ts` / `functions.ts` / `type-layer-checks.ts` /
`type-compat.ts`, and
`diff <(git show 9e797da7:src/parser/type-compat.ts | head -591) <(head -591 src/parser/type-compat.ts)`
is empty.


## Fix (0.181.0)

- **Route selected: B** — the spec is corrected to scope the union discipline to
  the array/ternary positions; the two registered *Triggers* stand; no emission
  set moves. The adjudication cites, verbatim, the law bug 0155's fix stated
  (`0155-…md` `## Fix (0.174.0)`, "THE STATED LAW") rather than restating one:
  > A registered *Trigger* is the normative statement of a code's emission set
  > (DIAG-2). Where a rule page's scope exceeds the registered *Trigger* of the
  > code it names, the *Trigger* governs and the rule page is corrected in the
  > same commit; no implementation may be wired to emit a code outside its
  > registered *Trigger*. Narrowing an emission set ONTO its registered
  > *Trigger* needs no registry edit (the 0084/0139 posture), but where the
  > *Trigger*'s TEXT presupposes the wider reading, that text is corrected in
  > the same commit as the narrowing.

  Applied: `theta/parse/match-arm-type-mismatch`'s *Trigger* ("the common type
  of the other arms", `code-registry-parse.md:85`) and
  `theta/parse/return-no-common-type`'s ("share no common upper bound and no
  sink narrows them", `:45`) both read to the dominating-member semantics at
  this HEAD, and both implementations (`leastUpperBound`, `match-result.ts`;
  `computeLub`, `functions.ts`) match them. The three rule pages that claimed
  identity with the array/ternary union discipline exceeded those *Triggers*,
  so the *Triggers* govern and the pages are corrected in this commit.
  **Route A (ADOPT) was refused on measured grounds:** a prototype delegating
  both checker LUBs to `commonType` red 9 tests in 5 files — including four
  cells of bug 0123's witness (`tests/match-pattern-increment-decrement.test.ts`
  c1/h1/h2/i3) and bug 0141's g3
  (`tests/capitalised-bare-match-pattern-refusal.test.ts`) — unauthorised flips
  in other open reports' witnesses that no §Fix bullet authorises (A8
  authorises only `tests/match-result.test.ts`). The prototype was reverted
  byte-exact (`git hash-object` == `git rev-parse HEAD:<path>` for both files).
  Route A would additionally have made the *Trigger* text follow the rule page,
  the inverse of the law's first limb.
- **What shipped:**
  - `docs/reference/type-system.md` — B1: the "`match` arms and inferred
    theta/`fn` return types use the same LUB discipline" sentence replaced by
    the member-restricted statement (the chosen common type is a member of the
    contributing types, never a computed union; a memberless set has no common
    type and draws `theta/parse/match-arm-type-mismatch` or, when no sink
    narrows the contributions, `theta/parse/return-no-common-type`, where an
    array literal or a ternary would union under rule 2). Both cross-links
    kept; the return code carries the *Trigger*'s own sink qualifier so the
    mirror does not out-scope `:45`.
  - `docs/spec_topics/functions.md` — B2: FN-3 now borrows the `match`-arm
    discipline (chosen common type is a member of the contributing types),
    explicitly not the array-literal/ternary rule-2 discipline; "an inferred
    return type never unions".
  - `docs/spec_topics/expressions.md` — B3: the Arm-syntax parenthetical states
    the member restriction for the sink-less case ("the chosen common type is
    one of the arm types — a member every other arm is `⊑`") and states the
    sink case as `checkMatchArmTypes`'s sink arm implements it (every arm `⊑`
    the sink), without claiming the sink path is reachable from source.
  - `src/parser/match-result.ts` — B5: `leastUpperBound`'s doc comment gains
    the divergence note `computeLub` already carries (no union clause, unlike
    `commonType`). Comment-only; 277 → 279 lines; zero executable lines.
  - `src/parser/static-type-inference.ts` — B7 **option (i)**: `#typeExpr`'s
    `case "match"` no longer routes arm-body types through the union
    `#commonType`; it reduces them with the new private `#matchArmType`, the
    same dominating-member discipline `leastUpperBound` enforces on the
    identical arm-type array (`"unknown"` counts as covered; the least of
    several candidates wins), falling back to the first arm type where the
    checker refuses the node. 518 → 566 lines. `leastUpperBound` is not
    exported because it hard-binds the production `checkCompatible` import
    instead of taking an injectable relation, and giving it one is an
    executable signature change B5 excludes; the pass therefore decides over
    its own injected `#checkCompatible` rather than a relation that would
    bypass it. `case "array"`, `case "ternary"` (bug 0155's landed
    disposition) and `#commonType` are behaviourally untouched.
  - `tests/match-fn-return-lub-dominating-discipline.test.ts` — new 26-cell
    witness: corpus-conformance cells A1–A3 over the three corrected
    sentences, inference-agreement cells B1/B2/B4/B5, the unchanged-behaviour
    set (n1–n4, v1–v4, o1–o4 including **o2, bug 0155's row**, d1–d4, s1/s2,
    w9/w10, e2, the registration gate r1/r2, the direct seams tC2–tC6),
    *Trigger*-fidelity and structural pins D1–D3, and a GOV-15 census cell E1
    re-measured at this HEAD.
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a live
    cell (CELL-E2): through the real production composition root, the
    heterogeneous `match` still refuses registration under its registered
    *Trigger* while the dominating-arm twin registers and drives to normal
    completion (empty `systemNotes` plus a sentinel built from the match
    result). No existing cell touched.
- **Gates:** witness RED before (8 cells: A1/A2/A3 on the three false
  sentences, B1 `integer | string` against `integer`, B2 `string | null`
  against `string`, B4/B5 the `integer | string`-rendered second diagnostic at
  p9/p14, D2 the `commonType(` call still wired), GREEN after (26/26). Full
  default suite `npx vitest run` → **368 files / 7539 tests passed** (baseline
  367/7513 plus this witness's 26 cells). `npm run typecheck` clean.
  `npm run lint` clean. Live: `npx vitest run --config
  config/vitest/vitest.live.config.ts
  tests/live/live-production-acceptance.test.ts -t "CELL-E2"` → 1 passed / 85
  skipped, run twice under the live lock (the second after a sentinel rename,
  see residual 3).
- **Review:** 2 rounds. Round 1 (deep) — FINDINGS: one `house-rule` (the
  `#matchArmType` doc comment narrated this run's own edit-scope decision) and
  two `spec` (the corrected arm-syntax parenthetical asserted the member
  restriction unconditionally, contradicting `checkMatchArmTypes`'s sink arm;
  the mirror sentence claimed `return-no-common-type` unqualified where the
  *Trigger* and FN-3 both qualify it with "no sink narrows"), plus one `test`
  residual (cell E1's exact-list corpus pin). All four fixed in round 2 with
  zero executable hunks. Round 2 (fast) — CLEAN, no `recommend-deep-review`,
  two prose residuals; one (a missing article, plus one over-long comment line)
  was corrected by the orchestrator as a bounded comment-only edit with the
  gates re-run green — polish verified by gate-diff, confirmation round
  skipped.
- **Verification:** SOLID. (1) The witness reds destructively in both lanes:
  rewiring `case "match"` back to `#commonType` reds B1/B2/B4/B5/D2 with the
  union signatures the report predicts; reinstating each pre-fix sentence from
  `git show HEAD:<path>` reds exactly its A cell. Every perturbation was
  restored by writing the bytes back and hash-verified. (2) Full suite
  368/7539 green (the documented `inbound-union-arm-dispatch` contention flake
  appeared in one review-round run and passed 19/19 in isolation; absent from
  the verifier's and the orchestrator's runs). (3) Live: no pre-existing cell
  drove a heterogeneous `match`; the new CELL-E2 cell was run for real under
  the live lock. (4) typecheck and lint clean. (5) §Common obligations
  re-derived at this HEAD, not copied: d1–d4/t2/t3/tC5/tC6 unchanged, o2
  unmoved, `tests/fn-arg-type-mismatch-wired.test.ts` (93 cells at this HEAD,
  84 at filing) green including 0145's u13e,
  `tests/array-ternary-common-type-union.test.ts` and
  `tests/division-result-type-number.test.ts` green.
- **GOV-15 / DIAG-2:** census re-measured at this HEAD — 34 committed
  `.theta`/`.thetalib` files (32 + 2), zero drawing
  `theta/parse/match-arm-type-mismatch` or `theta/parse/return-no-common-type`,
  so no committed source's diagnostic sequence moves. Under route B no
  emission set moves at all: `leastUpperBound` and `computeLub` are unchanged
  in behaviour, so DIAG-2 is a no-op and no registry row, mirror row or
  `docs/reference/diagnostics.md` entry was touched.
- **Residuals:**
  1. **The 0081 spillover at three sinks is retired, in the direction §Fix A5
     did not predict.** B7(i) removes the union from `typeOf` on a `match`
     node, so rows p9, p11, p14 lose the second code they gained at 0081 and
     rows p15/p16 render `integer` again instead of `integer | string`
     (witness cells B4/B5 pin p9 and p14 as the `match` row ALONE). Every
     affected input already carried an `E` at 1.0.0 and still carries the
     `match` row, so none is in GOV-15's loads-cleanly set and no input gains
     a code. 0129's diagnostic-COUNT question at those sinks is untouched and
     is owed no disclosure: the counts move DOWN and no new code appears.
  2. **The dead sink arm stays dead.** `checkMatchArmTypes`'s sink arm is
     still unreachable from `.theta` source — the walk hard-codes
     `sink: undefined` at its only `checkMatchArmTypes` call site
     (`type-layer-checks.ts`) — so `expressions.md`'s sink clause remains a
     statement about a function arm no source input reaches. §Non-goals leaves
     that open and this fix does not close it; the corrected parenthetical was
     scoped (round-1 finding F2) so it no longer asserts the member
     restriction over the sink case it does not govern. A future report owns
     the reachability question.
  3. **The live cell's sentinel was renamed after its first green run.** The
     original sentinel embedded the cell token in a longer string
     (`CELL-E2-DOM-1`), which is not a strip-safe placement; it is now
     `THETA-MATCH-DOM-1` and every `CELL-E2` occurrence in the file sits in a
     parenthesised form. The cell was re-run for real under the live lock
     after the rename and passed.
  4. **Induced positional drift, not chased (bug 0134's class).** The
     `case "match"` comment block grew, shifting
     `src/parser/static-type-inference.ts:497` → `:504` (`#commonType`'s
     `?? candidates[0]` line), which a comment in bug 0155's protected witness
     `tests/ternary-common-type-trigger-adjudication.test.ts` cites twice; and
     the B5 comment shifted `match-result.ts:253` → `:255`, cited in a comment
     in this fix's own witness header. Both are comments, no cell asserts on
     them, and the protected witness is byte-identical to HEAD
     (hash-verified). No citation sweep was performed.
  5. **The 0158 line pins are stale and were not restored.** §Fix A9's byte
     pins (`static-type-inference.ts` at 378, `functions.ts` at 427,
     `type-layer-checks.ts` at 2531, `type-compat.ts` byte-identical through
     591) all lapsed across the ~90 minors between filing and this HEAD; the
     counts at this HEAD before this fix were 518 / 552 / 3216 / 938. Every
     citation in this record is symbol-anchored for that reason.
- **Discharge notes appended:** none (no sibling bug document was edited).
- **Pinned dispositions / non-goals:**
  - **0195's subject is NOT claimed:** `docs/spec_topics/control-flow.md`'s
    empty-array iterand claim and registered-row reachability are untouched —
    the file is not in this diff.
  - **0155's landed scope corrections are cited, not re-litigated:** rule 2's
    union clause, the ternary's adjudicated by-rule branch-order dependence
    and the `integer | string` arms-verbatim spelling are unchanged; witness
    cell o2 pins the ternary row.
  - **The ternary and array positions do not move:** `checkCommonType`,
    `checkArrayLiteral`, the `array-no-common-type` row and `#typeExpr`'s
    `case "ternary"` are untouched (rows n1/n2/v1/v2/o1/o2 green).
  - **0145's subject (which binding an arm body reads) is untouched:** the
    `#matchArmScope` call inside `case "match"` is unchanged; only the
    reduction of the resulting type SET changed.
  - **The plain annotated-`fn` return gap stays open** (`fn g(): integer
    { "a" }` reports `[]`), as §Non-goals requires; row e2's silence is pinned
    as measured, not as a working sink.
  - **No *Message* reword, no code rename, no registry edit** (DIAG-4 defers
    wording; neither row is placeholdered on any input here).
