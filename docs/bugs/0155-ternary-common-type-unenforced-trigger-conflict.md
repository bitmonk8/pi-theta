# Bug 0155 — `expressions.md:222` scopes the common-type rules to "array literals **(and ternary branches)**" and TYPE-9 routes a ternary through that same machinery, but `theta/parse/array-no-common-type`'s registered *Trigger* names only an "**Array literal**" and `checkCommonType` has exactly one caller in `src/` (`checkArrayLiteral`), so rule 3's refusal never fires for a ternary: `let x = true ? A { a: 1 } : B { b: "x" }` reports `[]` and registers where the array twin `[A { a: 1 }, B { b: "x" }]` draws `theta/parse/array-no-common-type` and does not, and `#commonType`'s rule-3 fallback then launders the ternary to whichever branch is written first, so `let p = P { v: true ? A { a: 1 } : B { b: "x" } }` binds a `B`-producing expression into an `A`-declared field unremarked and `let y: B = x` flips between refusal and silence on branch order alone

- **Status:** fixed (0.174.0) — route (b); see `## Fix (0.174.0)`. Residual R1 of the bug 0081 fix (0.83.0, commit
  `5de8d78a`), recorded there as facet (b) and DEFERRED with its cause stated:
  "**Needs a DIAG-2 *Trigger* adjudication, not just code.**" The deliverable
  here is that adjudication — a *Trigger* decision with its same-commit spec
  edits and mirrors — with the code following from it, not the other way round.
  §Fix is constraint-pinned, not settled: the two admissible routes are
  enumerated with their measured consequences and the disposition is left to
  the run. Ordering: nothing blocks this report from starting. It shares an
  adjudication class with 0158 (filed concurrently, the `match`-arm /
  `fn`-return divergence over the same LUB sentence); whichever lands second
  reuses the first's *Trigger*-fidelity ruling rather than re-deriving it.
- **Sev/Diff estimate:** S1/D3 — S1 on the letter ("inputs accepted that the
  spec refuses … with no diagnostic, declared constraints not enforced"), and
  the letter is met twice over: §Reproduction (a) row t1 loads and registers a
  source rule 3 refuses in its array spelling, and §Reproduction (b) rows s2/s3
  and (d) row L5 measure the laundered stand-in type passing a *declared* `A`
  sink that a `B`-producing expression flows into, with no diagnostic on the
  ordinary load path. Against that, weighed and stated rather than assumed: rule 3's rationale
  is about implicit schema *unification* (`expressions.md:226` — "Object schemas
  do not unify implicitly"), and a ternary is an expression position where no
  container type is being formed, so whether the rule reaches it at all is the
  open question this report exists to settle — S1 is the letter's score, not a
  ruling that the refusal is owed; the harm is a static false negative at parse
  time, not a runtime value corruption (the interpreter evaluates whichever
  branch the condition selects); and corpus exposure is nil — §Reproduction (e)
  measures **zero** ternary expressions across all 34 committed
  `.theta`/`.thetalib` files, so no committed source moves under either route.
  D3 on three counts §Fix names: the fix is a DIAG-2 adjudication whose spec
  edits land in the same commit (`diagnostic-shape.md:72`) across the registry
  and two mirrors; `theta/parse/array-no-common-type`'s registered *Message* and
  *Hint* are array-worded and DIAG-4 (`:74`) defers a reword to theta 2.0, so
  one route must either emit an array-worded string at a ternary or add a row;
  and the fix deliberately re-pins cell r8 of the 21-cell witness file bug 0081
  shipped, against two array-twin cells (r7, r7b) that must not move.
- **Kind:** spec gap — corpus self-disagreement, plus the implementation half
  that follows from it. Three elements.
  1. **Two corpus sentences put a ternary inside rule 3.**
     `docs/spec_topics/expressions.md:222` opens the numbered block with
     "*Common-type rules for array literals (and ternary branches):*" — the
     parenthetical scopes all three rules, including `:226`'s rule 3.
     `docs/spec_topics/type-system.md:50` (TYPE-9) and its mirror
     `docs/reference/type-system.md:64–69` route a ternary through that
     machinery by name and name both codes it may draw. The mirror's block
     heading at `docs/reference/type-system.md:83` reads "Common-type rules
     (array literals & ternary branches)".
  2. **The registered *Trigger* excludes one.**
     `docs/spec_topics/diagnostics/code-registry-parse.md:41` reads "**Array
     literal** whose elements have no common type and no sink to narrow
     against."; `:40`, the sink half TYPE-9 also names, reads "**Array
     literal** element does not type-check against the surrounding sink's
     element type." Neither *Trigger* admits a ternary. Rule 3's own body is
     array-worded to match — `expressions.md:226` says "an **array** containing
     two different named schemas yields `array<A | B>`", a result type that is
     not well-formed for a ternary (whose LUB would be `A | B`) — and so is the
     mirror at `docs/reference/type-system.md:93–95`. The scoping parenthetical
     at `:222` and the body of the rule it scopes do not agree.
  3. **Nothing is wired, and the inference pass's stand-in type is unaccompanied
     by the refusal that justifies it.** `checkCommonType` has exactly one
     caller in `src/` (§Reproduction (f)), `checkArrayLiteral`, so no ternary
     node reaches either half of TYPE-9's route. `#commonType`
     (`static-type-inference.ts:353–358`) still answers a rule-3 branch set with
     `?? candidates[0]`, and its docstring states the premise that makes that
     sound — "which the checker turns into `array-no-common-type` at the
     literal" (`:346–347`). At a ternary the checker turns it into nothing, so
     the stand-in propagates silently to every downstream sink (§Reproduction
     (d)).
- **Related:**
  - **0081** —
    [`0081-array-ternary-common-type-never-unions.md`](./0081-array-ternary-common-type-never-unions.md),
    **fixed (0.83.0)**, the filing origin. Its `## Fix (0.83.0)` record
    dispositions this as facet (b), DEFERRED, and states the cause in the same
    terms this report measures: closing it "cannot be closed without widening
    `theta/parse/array-no-common-type`'s registered *Trigger* … which DIAG-2's
    closed registry forbids, and about which the corpus disagrees with itself".
    Its §Fix constraint 4 — "`checkCommonType` must gain a ternary caller, or
    rule 3's ternary case stays unenforced" — is the sentence this report
    answers, and the answer is not automatically "wire it": constraint 4 was
    written before the *Trigger* conflict was measured. 0081's fix also supplies
    this report's **pinned baseline**, cell r8 of
    `tests/array-ternary-common-type-union.test.ts:855–880`, quoted verbatim in
    §Reproduction (a); a fix here re-pins r8 deliberately, which is what its own
    comment asks for.
  - **0158** — filed concurrently, the **sibling divergence in the same
    adjudication class**. 0081's fix routed `#typeExpr`'s `case "match"`
    (`static-type-inference.ts:237–241`) through the shared `commonType`, so the
    inference pass unions `match` arms, while `checkMatchArmTypes`
    (via `leastUpperBound`, `src/parser/match-result.ts:189`, `:214`) and
    `computeLub` (`src/parser/functions.ts:348`, called at `:309`) remain
    dominating-member-only. `docs/reference/type-system.md:97` — "`match` arms
    and inferred theta/`fn` return types use the same LUB discipline" — is the
    sentence 0158 claims. Same class, different rows: 0158 owns the `match` /
    `fn`-return divergence and this report claims only the ternary and the
    *Trigger* question. Neither blocks the other; both settle by the same
    *Trigger*-fidelity reasoning, so the second to land cites the first's
    ruling. (0081's own report cites that sentence as `type-system.md:96`; it is
    `:97` at this HEAD, `:96` being blank.)
  - **0156** —
    [`0156-fn-parameter-sink-not-consulted-for-rule3-unions.md`](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md),
    filed concurrently, 0081's residual R2 (facet (d), the
    `fn`-parameter sink at call sites, bounded to "elements with no LUB (rule 3)
    under a union-typed parameter"). Disjoint from this report: R2's subject is
    the sink SET applied to an array literal, this report's is whether a ternary
    is inside a *Trigger* at all. Named in §Non-goals.
  - **0125** —
    [`0125-index-element-narrowing-not-alias-unfolded.md`](./0125-index-element-narrowing-not-alias-unfolded.md),
    **fixed (0.76.0)**, the *Trigger*-fidelity precedent this report's problem is
    an instance of. Its fix record prosecutes exactly this fault at another row:
    `theta/parse/non-array-iterand`, "whose registered trigger is
    "`for x in expr` where `expr` is not `array<T>`" and whose emission there is
    therefore outside its own trigger today, the same fault bug 0089 prosecuted
    at gate 1" (`:988–991`). It also records the mirror discipline this report
    inherits: "`docs/reference/diagnostics.md` carries no *Trigger* column, so
    no mirror edit follows from the codes" (`:991–992`).
  - **0084** —
    [`0084-increment-decrement-check-dead.md`](./0084-increment-decrement-check-dead.md),
    **fixed (0.71.0)**, and **0139** —
    [`0139-fn-parameter-name-case-rule-unenforced.md`](./0139-fn-parameter-name-case-rule-unenforced.md),
    **fixed (0.79.0)** — the posture both established and 0081's fix invoked by
    name. 0139 states it: a *Trigger* "is a spec-level statement of which inputs
    a code fires on; the implementation fires on a strict subset of the
    registered set. That is the implementation moving to match a normative rule,
    not a rule being widened — the same posture bug 0084 took when it wired a
    registered row's caller" (`:429–433`). That posture is what makes wiring a
    ternary caller inadmissible *as currently registered*: a ternary is not in
    the registered set, so the wiring would move the implementation OUTSIDE it,
    not onto it. 0084 also records the GOV-15 disposition §Fix route (a) needs:
    the carve-out "dispositions "a DIAG-2 *trigger* change … as an addition for
    inputs newly brought into the code's emission set"" (`:152–153`).
  - **0129** —
    [`0129-empty-object-field-type-draws-two-diagnostics.md`](./0129-empty-object-field-type-draws-two-diagnostics.md),
    **open**, the diagnostic-multiplicity class. Route (a) of §Fix emits a
    second `E` at a site that may already carry one (row L6's shape: a ternary
    inside an array literal, where the array's own refusal and the ternary's
    would both fire). Its own header states that it "exists to pin the
    disposition of the second diagnostic before any code lands" (`:3–4`), so a
    route (a) fix that produces that pairing owes 0129 a disclosure note or an
    authorization, on the footing 0081's fix already used for cells f4/f6.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift. It covers
    the citation drift any fix here induces, and it is why §Affected cites
    symbols alongside lines.
- **Affected** (every citation verified against the tree at HEAD `5de8d78a`,
  0.83.0; symbols named alongside lines because `src/parser/type-compat.ts` grew
  620 → 704 in the 0081 fix and `src/parser/static-type-inference.ts` is held at
  exactly 378 lines by eleven open reports that cite it positionally):
  - **The three corpus sentences in conflict.**
    - `docs/spec_topics/expressions.md:222` — the scoping parenthetical,
      "*Common-type rules for array literals (and ternary branches):*". `:220`
      names the sink set; `:224` rule 1; `:225` rule 2; `:226` rule 3, whose
      body says "an **array** containing two different named schemas yields
      `array<A | B>` only if some sink in scope expects a union; otherwise it is
      `theta/parse/array-no-common-type`".
    - `docs/spec_topics/type-system.md:50` — TYPE-9: "A ternary `cond ? a : b`
      reports through the array-and-ternary common-type machinery in [Expressions
      — Array construction]: `theta/parse/array-element-type-mismatch` when a
      branch fails against an in-scope sink, and
      `theta/parse/array-no-common-type` when no sink narrows two branches that
      share no common type." Mirror: `docs/reference/type-system.md:64–69`,
      "a ternary → through the array/ternary common-type machinery
      (`theta/parse/array-element-type-mismatch` against a sink, else
      `theta/parse/array-no-common-type`)". The mirror also carries the block
      heading `:83` and rules 1–3 at `:87–95`, rule 3 array-worded at `:93–95`.
    - `docs/spec_topics/diagnostics/code-registry-parse.md:41` — the registered
      row for `theta/parse/array-no-common-type`: severity `E`, phase `type`,
      *Trigger* "Array literal whose elements have no common type and no sink to
      narrow against.", *Hint* "Annotate the binding with `array<A | B>` or use
      a single schema.", *Message* `array elements have no common type;
      annotate the binding with array<A | B> or use a single schema`. `:40` is
      the sink half: *Trigger* "Array literal element does not type-check
      against the surrounding sink's element type.", *Message* `array element
      type mismatch at index <i>: expected <expected>, got <actual>`.
  - **The governing meta-rules.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, "**The
    registry is closed.** Adding a new code, removing a code, or changing a
    code's namespace, severity, or trigger are all spec changes … New
    diagnostic sites added by future spec work MUST land their codes in this
    table at the same time." `:74` — DIAG-4, the *Message* column is normative
    and a reword is "deferred to theta 2.0 migration".
    `docs/spec_topics/governance/source-language-stability.md:25` — the
    diagnostic-registry carve-out, which dispositions "a DIAG-2 *trigger*
    change … in-scope as an addition for inputs newly brought into the code's
    emission set and as a removal for inputs taken out of it".
  - **The sentences that do NOT mention a ternary**, which is why the conflict
    is a corpus-wide drafting question and not one line's typo:
    `docs/reference/grammar.md:395–398` ("`[a, b, c]` element type is the common
    type of its elements … No sink and no common type is
    `theta/parse/array-no-common-type`") and `:400–407` (the exhaustive sink
    set, headed "`array<T>` literal type-sink rule");
    `docs/spec_topics/grammar.md:223` (the `for` iterand is not a sink);
    `docs/spec_topics/glossary.md:67`, whose *type sink* entry names exactly two
    consumers — "a query expression takes its schema from the sink, and an
    `array<T>` literal (`[]` / `[expr, ...]`) takes its element type from the
    sink" — and no ternary. `docs/reference/diagnostics.md:86`/`:87` are Message
    mirrors with no *Trigger* column.
  - **The one-caller fact.** `checkCommonType`
    (`src/parser/type-compat.ts:555`, doc comment `:541–554`) is called from
    exactly one place in `src/`: `TypeLayerChecker.checkArrayLiteral`
    (`src/parser/type-layer-checks.ts:1426`, the call at `:1441`, imported at
    `:64`), itself dispatched from three array-only sites — the annotated `let`
    (`:982`), the constructor-field sink (`:1560`), and `walkExpr`'s bare
    `case "array"` (`:1947`). Its own doc comment is already written for both
    shapes: "Given the branch element types (**ternary branches** or
    array-literal elements)" (`:542–544`).
  - **The ternary walk that could have carried the check.**
    `TypeLayerChecker.walkExpr`'s `case "ternary"`
    (`src/parser/type-layer-checks.ts:1910–1921`) runs `checkBooleanPosition` on
    the condition and then walks the three sub-expressions. It never forms the
    branch-type pair. The other three `case "ternary"` arms in that file are not
    check sites: `walkExprForLocalBinders` (`:584`), `provableArgType`'s
    reduction arm (`:1665`), and `childExprs` (`:2457`).
  - **The refusal itself.** `checkCommonType`'s sink-less arm tests
    `commonType(branches, env, checkCompatible) !== undefined` (`:592`) and
    raises the code at `:596–605`. `commonType` (`:656–677`) is the shared LUB
    0081 shipped; rule 3's gate is `branches.some((branch) =>
    isObjectBranch(branch, env))` (`:673–675`), and `isObjectBranch`
    (`:698–704`) unfolds aliases (TYPE-11) then admits an `object` kind (TYPE-8)
    or a `named` resolving to an `object-schema` declaration (TYPE-10).
  - **The inference side.** `StaticTypeInferencePass.#typeExpr`'s
    `case "ternary"` (`src/parser/static-type-inference.ts:226–233`) reduces the
    two branches through `#commonType`; the array arm (`:217–223`) does the same
    for elements. `#commonType` (`:353–358`) delegates to the shared
    `commonType` and falls back to `candidates[0]` (`:357`) when it answers
    `undefined`. The docstring at `:340–352` states the premise that fallback
    rests on, at `:345–349`: "`undefined` means rule 3 — an object-branch set
    with no dominating member — which the checker turns into
    `array-no-common-type` at the literal; this pass still owes the rest of the
    walk a type for that node, so it falls back to the first candidate rather
    than propagate the absence."
  - **The pinned baseline.** `tests/array-ternary-common-type-union.test.ts:855–880`
    (cell r8), plus the file header's inventory lines `:51` and `:83` and the
    section comment at `:785`. Its fixture constant `A_B_SCHEMAS` is at `:492`.
- **Observed at:** 0.83.0 (`5de8d78a`), offline and provider-free, through the
  production whole-file parser `parseThetaDocument` via `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`), reading the whole diagnostic list in emission
  order plus the registration predicate `!diagnostics.some(d => d.severity ===
  "error")` (`src/extension/production-composition.ts:1562`).

## Summary

`expressions.md:222` scopes three numbered common-type rules to "array literals
(and ternary branches)", and TYPE-9 routes a ternary through that machinery by
name in both its home page and its mirror. The registered *Trigger* for the code
rule 3 raises names an "Array literal" only, and so does the *Trigger* for rule
1's code. At HEAD the implementation follows the *Triggers*, not the rules:
`checkCommonType` has one caller, `checkArrayLiteral`, so neither half of
TYPE-9's ternary route exists. `let x = true ? A { a: 1 } : B { b: "x" }` loads
and registers; the array spelling of the same pair does not.

That is not the whole cost. `#commonType` still answers a rule-3 branch set with
its first candidate, and its docstring justifies that by the checker reporting
the refusal at the literal — which for a ternary it does not. The stand-in type
therefore reaches every downstream sink unaccompanied: a `B`-producing ternary
binds into an `A`-declared constructor field with no diagnostic, and
`let y: B = x` is refused or admitted depending only on which branch was written
first.

Wiring the caller emits outside a registered *Trigger*, the fault bug 0125's fix
record prosecutes at `theta/parse/non-array-iterand` and the 0084/0139 posture
forbids. Not wiring it leaves TYPE-9's ternary half and `:222`'s parenthetical
unimplemented. The deliverable is the DIAG-2 *Trigger* adjudication that decides
which, with its same-commit spec edits.

## Reproduction

Offline, deterministic, at HEAD `5de8d78a`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`. Each cell
is the whole diagnostic list in emission order, unfiltered; `registers` is
`!diagnostics.some(d => d.severity === "error")`. Frontmatter
`---\nmode: prompt\n---` on lines 1–3. Where a row needs two named object
schemas it is prefixed with

```
schema A {
  a: integer
}
schema B {
  b: string
}
```

which is byte-identical to what `A_B_SCHEMAS`
(`tests/array-ternary-common-type-union.test.ts:492`) expands to, so every row
below is comparable to that file's cells.

### (a) The asymmetry — one pair of schemas, two spellings

| # | source (after the two schemas) | diagnostics | registers |
|---|---|---|---|
| t1 | `let x = true ? A { a: 1 } : B { b: "x" }` | `[]` | **yes** |
| a1 | `let x = [A { a: 1 }, B { b: "x" }]` | `error theta/parse/array-no-common-type @10:9-10:35: array elements have no common type; annotate the binding with array<A \| B> or use a single schema` | **no** |
| t1x | `schema X = A` `schema Y = B` + `fn f(x: X, y: Y): integer { let z = true ? x : y  1 }` | `[]` | **yes** |
| a1x | same two aliases + `fn f(x: X, y: Y): integer { let z = [x, y]  1 }` | `error theta/parse/array-no-common-type @13:11-13:17: array elements …` | **no** |

t1/a1 are the direct spelling; t1x/a1x the alias spelling that `isObjectBranch`'s
TYPE-11 unfold reaches (the ternary twin of witness cell r7b). Both pairs differ
in exactly one token: `[…, …]` versus `… ? … : …`.

Row t1 is the fixture of cell **r8**, the pinned baseline
(`tests/array-ternary-common-type-union.test.ts:855–880`). Verbatim, cell and
comment:

```ts
  it("r8: `true ? A{…} : B{…}` still loads — facet (b)'s residual", () => {
    // §Reproduction row 8. Rule 3 is NOT enforced for a ternary, and the route
    // under test does not enforce it: `checkCommonType`'s only caller in `src/`
    // is `checkArrayLiteral` (src/parser/type-layer-checks.ts), so no ternary
    // node reaches the refusal.
    //
    // The deferral is not an oversight. `theta/parse/array-no-common-type`'s
    // registered *Trigger* (code-registry-parse.md:41) reads "**Array literal**
    // whose elements have no common type and no sink to narrow against", so
    // wiring the ternary caller emits the code outside its registered Trigger —
    // a DIAG-2 adjudication (diagnostic-shape.md:72, the registry is closed)
    // that this fix does not make. Closing facet (b) honestly requires widening
    // that Trigger to name ternaries, against
    // docs/spec_topics/type-system.md:50 TYPE-9, which already routes a ternary
    // here. That corpus self-disagreement is facet (b)'s residual.
    //
    // This cell is green before and after. It is a tripwire: a later widening
    // that enforces rule 3 for a ternary without settling the Trigger reds here
    // instead of landing unnoticed.
    const doc = parse(`${A_B_SCHEMAS}let x = true ? A { a: 1 } : B { b: "x" }\n`);
    precondition(doc, "r8", { ternaries: 1, ctors: ["A", "B"] });
    expect(
      codesOf(doc),
      `r8 — facet (b) is deferred; this row's silence is the present value, pinned so that closing it becomes a visible decision about code-registry-parse.md:41's *Trigger*. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
```

The cell is a tripwire by construction, and a fix here reds it. The re-pin is
the intended outcome, not collateral.

### (b) Rule 1's sink half at a ternary — also absent

TYPE-9 names `theta/parse/array-element-type-mismatch` for a branch that fails
against an in-scope sink. No row draws it.

| # | source | diagnostics | registers |
|---|---|---|---|
| s1 | `let y: string = true ? 1 : 2` | `error theta/parse/let-rhs-type-mismatch @4:1-4:29: let binding 'y' initialiser type mismatch: expected string, got integer` | no |
| s2 | two schemas + `let y: A = true ? A { a: 1 } : B { b: "x" }` | `[]` | **yes** |
| s3 | two schemas + `fn f(v: A): integer { 1 }` + `let n = f(true ? A { a: 1 } : B { b: "x" })` | `[]` | **yes** |

s1 shows the enclosing site's own code firing on the reduced type rather than
the ternary reporting per-branch (`got integer`, not a per-branch index). s2 and
s3 show the reduction hiding the failing branch entirely: the sink is satisfied
by `A`, which is `candidates[0]`, and `B` is never compared against it.

### (c) Post-0081 control — a heterogeneous NON-object ternary unions and loads

The 0081 fix made `commonType` (`src/parser/type-compat.ts:656`) compute the
real union LUB and made checker and inferrer share it, so the gap measured here
is exactly rule 3's object-schema refusal at the ternary position, not the
common-type rule generally.

| # | source | diagnostics | registers |
|---|---|---|---|
| u1 | `let x = true ? 1 : "a"` | `[]` | yes |
| u2 | `let x = true ? 1 : "a"` + `let y: string = x` | `error theta/parse/let-rhs-type-mismatch @5:1-5:18: let binding 'y' initialiser type mismatch: expected string, got integer \| string` | no |
| u3 | `fn f(s: string): integer { 1 }` + `let x = true ? 1 : "a"` + `let n = f(x)` | `error theta/parse/fn-arg-type-mismatch @8:11-8:12: fn 'f' argument 0 ('s') type mismatch: expected string, got integer \| string` | no |
| u4 | same, with `let x = [1, "a"]` (array control) | `error theta/parse/fn-arg-type-mismatch @8:11-8:12: … expected string, got array<integer \| string>` | no |

The sinks in u2/u3 render `integer | string` — the union, both arms, receiver
first. Before 0081 the same sinks saw `integer` alone. u4 is the array control
showing the same LUB one container deep.

### (d) The laundering — the stand-in type reaching sinks, and branch order deciding

| # | source (after the two schemas) | diagnostics | registers |
|---|---|---|---|
| L2 | `let x = true ? A { a: 1 } : B { b: "x" }` + `let y: B = x` | `error theta/parse/let-rhs-type-mismatch @11:1-11:13: let binding 'y' initialiser type mismatch: expected B, got A` | no |
| L3 | `let x = true ? B { b: "x" } : A { a: 1 }` + `let y: B = x` | `[]` | **yes** |
| L4 | `let x = true ? B { b: "x" } : A { a: 1 }` + `let y: A = x` | `error theta/parse/let-rhs-type-mismatch @11:1-11:13: … expected A, got B` | no |
| L5 | `schema P { v: A }` + `let p = P { v: true ? A { a: 1 } : B { b: "x" } }` | `[]` | **yes** |
| L6 | `let x = [true ? A { a: 1 } : B { b: "x" }, true ? B { b: "y" } : A { a: 2 }]` | `error theta/parse/array-no-common-type @10:9-10:77: array elements have no common type; …` | no |

L2 against L3 is the order dependence: the same two schemas, the same sink,
transposed branches — refused in one spelling, silent in the other, and in the
silent one the expression can produce an `A` that the `B` annotation forbids.
L5 is the constructor-field twin, silent. L6 shows the array checker consuming
the two laundered stand-ins (`A` and `B`) and refusing on them — the pairing
§Fix route (a) must dispose of, since a wired ternary caller would add its own
diagnostic at each element inside a literal that already draws one.

One measurement that is **not** evidence, recorded so it is not mistaken for
some: `let y = x.b` on the laundered `A` draws `[]`, but so does the same read
on a plain `let x = A { a: 1 }` — no bare member read is checked at this HEAD,
so the row measures the absent member check, not the laundering.

### (e) Corpus census — GOV-15 direction

```
$ git ls-files '*.theta' '*.thetalib' | wc -l
34
$ git ls-files '*.theta' '*.thetalib' | xargs rg -n " \? "
(no output)
```

Zero ternary expressions across all 34 committed `.theta` / `.thetalib` files.
The corpus holds 38 `?`-bearing lines in 20 files; every one is either the
try/propagate `?` in trailing position, a `?` in a `//` comment, or a question
mark inside a query-template string. The four that are neither trailing nor
comment — `docs/examples/personas.thetalib:8`,
`docs/examples/reviewer.theta:12`, `docs/examples/call-tool.theta:10`,
`docs/examples/refine-inline.theta:17` — are all question marks in template
prose. Under either §Fix route no committed
source changes its observable (b) diagnostic sequence, so the GOV-15
disposition is an addition over an input set with no committed member
(`source-language-stability.md:25`).

### (f) The single caller

```
$ rg -n "checkCommonType" src/
src/parser/static-type-inference.ts:343:   * `checkCommonType` also calls, so the checker and this inference pass
src/parser/type-layer-checks.ts:64:  checkCommonType,
src/parser/type-layer-checks.ts:1441:      ...checkCommonType({
src/parser/type-compat.ts:555:export function checkCommonType(opts: {
src/parser/type-compat.ts:610: * called from this module's own `checkCommonType`, over `checkCompatible`, and

$ rg -n "checkArrayLiteral" src/
src/parser/type-layer-checks.ts:982:              this.checkArrayLiteral(stmt.init, annotation.element, bindings);
src/parser/type-layer-checks.ts:1426:  private checkArrayLiteral(
src/parser/type-layer-checks.ts:1560:      this.checkArrayLiteral(value, declared.element, bindings);
src/parser/type-layer-checks.ts:1947:          this.checkArrayLiteral(e, undefined, bindings);
```

Two of the five `checkCommonType` matches are prose in doc comments and one is
the declaration; one is the import. The single call site is `:1441`, inside
`checkArrayLiteral`, whose three dispatch sites (`:982`, `:1560`, `:1947`) each
guard on an `array`-kinded node.

## Expected behaviour

Three corpus sentences bear, and they do not agree.

**One — the scoping parenthetical.** `docs/spec_topics/expressions.md:222`:

> *Common-type rules for array literals (and ternary branches):* the underlying
> compatibility check is governed by [Type System — Type compatibility]; the
> rules below apply that relation to the array-and-ternary case.

The parenthetical scopes all three numbered rules that follow, and "the
array-and-ternary case" repeats the scope in the same sentence. Rule 3 at `:226`
is inside it.

**Two — TYPE-9.** `docs/spec_topics/type-system.md:50`:

> A ternary `cond ? a : b` reports through the array-and-ternary common-type
> machinery in [Expressions — Array construction]:
> `theta/parse/array-element-type-mismatch` when a branch fails against an
> in-scope sink, and `theta/parse/array-no-common-type` when no sink narrows two
> branches that share no common type.

Mirrored at `docs/reference/type-system.md:64–69`: "a ternary → through the
array/ternary common-type machinery (`theta/parse/array-element-type-mismatch`
against a sink, else `theta/parse/array-no-common-type`)."

**Three — the registered *Trigger*.**
`docs/spec_topics/diagnostics/code-registry-parse.md:41`:

> Array literal whose elements have no common type and no sink to narrow
> against.

and `:40`:

> Array literal element does not type-check against the surrounding sink's
> element type.

**The conflict, stated precisely.** Sentences one and two put a sink-less
ternary whose branches share no common type inside the emission set of
`theta/parse/array-no-common-type`. Sentence three, which under DIAG-2
(`diagnostic-shape.md:72`) is the normative statement of that emission set,
excludes it: its subject is an "Array literal", and a ternary is not one. The
same disagreement holds one row up for `theta/parse/array-element-type-mismatch`.
Rule 3's own body agrees with sentence three rather than with the parenthetical
that scopes it: `expressions.md:226` speaks of "an **array** containing two
different named schemas" yielding `array<A | B>`, and the mirror at
`docs/reference/type-system.md:93–95` repeats the `array<A | B>` result type — a
spelling that is not well-formed for a ternary, whose LUB under rule 2 would be
`A | B`. Every other corpus sentence about this machinery is array-only: the
sink set (`docs/reference/grammar.md:400–407`), the *type sink* glossary entry
naming exactly two consumers (`docs/spec_topics/glossary.md:67`), and the
grammar mirror's element-type bullet (`docs/reference/grammar.md:395–398`).

**What is settled, and what is not.** Settled: whichever way the conflict is
adjudicated, the corpus must stop stating both. Settled: no code may emit
`theta/parse/array-no-common-type` at a ternary while `:41`'s *Trigger* reads as
it does — that is the 0084/0139 posture and the fault 0125's fix record
prosecutes. Settled: `#commonType`'s `?? candidates[0]` fallback
(`static-type-inference.ts:357`) is documented as sound because "the checker
turns [the absence] into `array-no-common-type` at the literal"; at a ternary
that premise is false today, so either the refusal arrives or the docstring's
justification is corrected and the resulting stand-in type is dispositioned
explicitly. NOT settled, and the subject of §Fix: whether a ternary belongs
inside rule 3 at all.

Rows u1–u4 of §Reproduction (c) do not move under either route. Rule 2's union
clause is implemented and correct at the ternary position; this report claims
nothing about it.

## Actual behaviour / root cause

The implementation follows the *Triggers*. `checkCommonType`
(`src/parser/type-compat.ts:555`) is written for both shapes — its own doc
comment says "Given the branch element types (ternary branches or array-literal
elements)" (`:542–544`) — but is reached from one place, `checkArrayLiteral`
(`src/parser/type-layer-checks.ts:1426`, call at `:1441`), whose three dispatch
sites each require an `array`-kinded node (`:982`, `:1560`, `:1947`). The
checker's ternary arm (`walkExpr`, `:1910–1921`) runs the boolean-position check
on the condition and walks the three sub-expressions; it never forms the branch
pair. So rule 3's refusal and rule 1's element check are both unreachable for a
ternary — rows t1, t1x, s2, s3.

The inference pass does form the pair. `#typeExpr`'s `case "ternary"`
(`src/parser/static-type-inference.ts:226–233`) reduces both branches through
`#commonType` (`:353–358`), which delegates to the shared `commonType` and, when
rule 3's gate answers `undefined`, returns `candidates[0]` (`:357`). For
`true ? A { a: 1 } : B { b: "x" }` that is `A`. The B branch then has no static
existence: it cannot be compared against a sink (rows s2, s3, L5), it cannot be
named in a diagnostic (rows L2/L3/L4 name whichever branch was written first),
and it cannot reach the array checker as itself (row L6 sees `A` and `B` because
the two ternaries were written in opposite orders).

The fallback is deliberate and its docstring says why: "this pass still owes the
rest of the walk a type for that node, so it falls back to the first candidate
rather than propagate the absence" (`:347–349`), justified by "which the checker
turns into `array-no-common-type` at the literal" (`:346–347`). Inside an array
literal that premise holds — the refusal fires at the literal and the stand-in
only has to keep the walk going past a node already reported. At a ternary it
does not hold, and nothing reports. The order-dependent diagnostic in rows
L2/L3 is that premise failing, not a second defect.

Underneath both is the corpus conflict. There is no implementation change that
closes the gap and stays inside the registered *Trigger*, and no reading of the
*Trigger* that leaves `:222`'s parenthetical and TYPE-9's ternary clause true.

## Why it matters

1. **A source rule 3 refuses in one spelling registers in the other.** Row t1
   against row a1: the same two named object schemas, the same absence of a
   sink, one token apart. `[A { a: 1 }, B { b: "x" }]` is an `E` and the theta
   does not register; `true ? A { a: 1 } : B { b: "x" }` registers. An author
   reading `expressions.md:222` cannot predict which they get.
2. **A declared constraint is unenforced on the ordinary load path.** Row L5
   binds a ternary that can produce a `B` into a field declared `v: A`, with no
   diagnostic and a registering theta. Row s3 passes the same expression to a
   parameter declared `v: A`. TYPE-10 makes `A` and `B` nominally incompatible;
   the check that would say so never sees `B`.
3. **A diagnostic flips on branch order alone.** Rows L2 and L3 are the same
   program with the two branches transposed: refused in one order, silent in the
   other. 0081 §Why it matters item 3 states the principle for the primitive
   case it closed — "A diagnostic that flips with source order is worse than
   none" — and the object case it deferred still exhibits it, because the
   stand-in type is `candidates[0]`.
4. **The corpus contradicts itself in a place tests are entitled to read.**
   DIAG-2 makes the *Trigger* column the normative statement of an emission
   set, and DIAG-4 makes tests source their expected strings from the registry.
   A witness written from `expressions.md:222` and a witness written from
   `code-registry-parse.md:41` disagree about whether row t1 should draw a code,
   and both cite the corpus correctly. Cell r8 exists only because the 0081 fix
   had to pick one and record which.
5. **The unimplemented half is load-bearing for a shipped comment.**
   `#commonType`'s docstring asserts a checker-side refusal that does not exist
   at the ternary position. Left unadjudicated, the next reader of that function
   inherits a false premise about why the fallback is safe.

## Non-goals

- **Not the `match`-arm / `fn`-return divergence.** `#typeExpr`'s `case "match"`
  unions arms through the shared `commonType` while `checkMatchArmTypes`
  (`src/parser/match-result.ts:189`) and `computeLub`
  (`src/parser/functions.ts:348`) remain dominating-member-only, against
  `docs/reference/type-system.md:97`. Same adjudication class, different rows
  and a different sentence; **0158** owns it. A fix here settles the
  *Trigger*-fidelity question those rows also turn on, so the two coordinate,
  but this report claims only the ternary.
- **Not the `fn`-parameter sink at call sites** — 0081's residual R2, bounded to
  "elements with no LUB (rule 3) under a union-typed parameter".
  [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) owns it. Row s3 above uses a fn parameter only as a sink already applied to a
  ternary, not as the missing array-literal sink R2 names.
- **Not rule 2's union clause**, which 0081 shipped and rows u1–u4 measure
  working at the ternary position, including the arm-verbatim spelling
  (`integer | string`, not `number | string`) that fix pinned deliberately.
- **Not `theta/parse/array-element-type-mismatch`'s behaviour inside an array
  literal**, which rule 1 covers and 0081 §Non-goals already excludes.
- **Not the absent member check** the (d) note records: `x.b` draws nothing on a
  plain `A` too.
- **Not bug 0129's multiplicity question**, though §Fix route (a) creates an
  instance of it at row L6's shape and owes 0129 a disclosure.

## Fix

Not settled. The two routes below are constraint-pinned; the run selects one and
states its choice with the evidence that decided it. Both carry spec edits that
land in the same commit as any code they carry (`diagnostic-shape.md:72`); route
(a) is a DIAG-2 registry edit and route (b) is not. Both must dispose of every
constraint in (c).

**(a) Widen the *Trigger* to name ternaries, and wire the caller.**
`code-registry-parse.md:41`'s *Trigger* gains the ternary case, `:40`'s with it
if rule 1's half is wired too, and `checkArrayLiteral` gains a sibling that
forms `[consequent, alternate]` at `walkExpr`'s `case "ternary"`
(`type-layer-checks.ts:1910–1921`) and calls the existing `checkCommonType`.
Consequences, each measured or derived above:

- **The *Message* is array-worded and DIAG-4 forbids rewording it.** The
  registered *Message* is `array elements have no common type; annotate the
  binding with array<A | B> or use a single schema`, and the *Hint* repeats the
  `array<A | B>` advice. At a ternary both are false: there are no array
  elements, and the annotation that would fix row t1 is `A | B`. DIAG-4
  (`diagnostic-shape.md:74`) defers a reword to theta 2.0. This route must
  therefore choose, and say which: emit the array-worded string at a ternary
  (author-facing wrong advice, but DIAG-4-clean), or add a ternary-specific code
  with its own row (a DIAG-2 addition, GOV-15-covered per
  `source-language-stability.md:25` since §Reproduction (e) measures zero
  affected committed sources, but a new code that must then be reconciled by
  `tests/code-registry.test.ts`'s closed-set gate).
- **Mirrors.** `docs/reference/diagnostics.md:86`/`:87` carry no *Trigger*
  column, so no mirror edit follows from a *Trigger* widening alone (0125's
  recorded rule). A new code does require a row there.
  `docs/spec_topics/expressions.md:226` and `docs/reference/type-system.md:93–95`
  state rule 3's result type as `array<A | B>` and must gain the ternary
  spelling in the same commit, or the corpus still disagrees after the fix.
- **The multiplicity question.** Row L6 is a ternary inside an array literal
  where both refusals would now fire. State the disposition, and disclose the
  instance to open bug 0129 on the footing 0081's fix used for cells f4/f6.
- **The fallback.** With the refusal arriving, `#commonType`'s `?? candidates[0]`
  regains the premise its docstring claims; no inference-side change is required,
  and the docstring becomes true as written. Verify rather than assume — rows
  L2/L3's order dependence must be re-measured after wiring, since the refusal
  and the stand-in are independent.

**(b) Adjudicate the ternary out of rule 3, and fix the two corpus sentences.**
The *Triggers* stand; `expressions.md:222`'s parenthetical is narrowed to the
rules it actually scopes, and TYPE-9's ternary clause
(`docs/spec_topics/type-system.md:50` plus the mirror at
`docs/reference/type-system.md:64–69`) is rewritten to say what a ternary does
report. Consequences:

- **The route has corpus support**, and the run must weigh it rather than treat
  this as the do-nothing option: rule 3's own body and both mirrors are
  array-worded and give an `array<A | B>` result type; the *type sink* glossary
  entry names two consumers and a ternary is not one; rule 3's stated rationale
  is that object schemas "do not unify implicitly", which describes forming a
  container element type, not selecting one of two values.
- **It must say what a ternary DOES report**, at both halves. Row s1 measures
  the present answer for the sink half — the enclosing site's own code on the
  reduced type — and rows s2/s3/L5 measure that the reduction hides a failing
  branch. If TYPE-9 is rewritten to bless the reduced-type route, it must also
  disposition rows s2/s3/L5: a ternary that can produce `B` satisfying an `A`
  sink is either accepted by rule, or a different existing code covers it.
- **It must disposition the stand-in type.** If no refusal ever arrives at a
  ternary, `#commonType`'s docstring premise (`:346–347`) is false for this node
  kind and the `?? candidates[0]` answer for an object branch pair becomes a
  rule, not a stopgap. Either it is stated as one — with the branch-order
  dependence in rows L2/L3/L4 accepted in writing — or the pass answers
  something order-independent for that set. The second is a behaviour change
  reaching every sink, and needs its own blast-radius measurement.
- **No registry edit and no mirror edit follow**, which is what makes this route
  cheaper on the DIAG axis and more expensive on the prose axis.

**(c) Constraints binding on both routes.**

1. **Cell r8 is re-pinned deliberately, with its comment rewritten to the
   settled disposition.** `tests/array-ternary-common-type-union.test.ts:855–880`
   asserts `[]` today and its comment says in terms that "a later widening that
   enforces rule 3 for a ternary without settling the Trigger reds here instead
   of landing unnoticed". Route (a) reds it, and it must be re-pinned to the
   emitted code and its registry-sourced *Message*; route (b) keeps its assertion and must replace the comment, whose
   present text describes the deferral as open. Either way the comment stops
   citing an unresolved conflict. Rows r7 and r7b (the array twins) must not
   move under either route; a fix that reds them has widened rule 3 itself.
2. **The witness covers both spellings and the alias path.** Rows t1/a1 and
   t1x/a1x are the minimum pair set: a fix that reaches the direct spelling but
   not the alias spelling passes a witness built from t1 alone.
3. **`src/parser/static-type-inference.ts` stays at exactly 378 lines.** Eleven
   open reports cite it positionally (0019, 0090, 0115, 0126, 0130, 0136, 0140,
   0142, 0145, 0146, 0152 — each verified to carry at least one
   `static-type-inference.ts:<line>` citation at this HEAD); 0081's fix held the
   line count and 0125's §Residuals item 7 (`0125-…md:1307–1319`) is the
   precedent. Any inference-side edit under route (b) is bound by it.
4. **State the GOV-15 disposition from a re-measured census.**
   §Reproduction (e)'s 34-file, zero-ternary count is this HEAD's; re-run it,
   since sibling fixes have landed `.theta` files before (0081's report records
   32 → 34 across two runs).
5. **Coordinate with 0158.** Both reports turn on whether an implementation may
   emit outside a registered *Trigger* when a rule page says it should. Whichever
   lands first states the ruling; the second cites it. Do not settle 0158's rows
   here.

## Provenance

Filed as residual R1 of the bug 0081 fix (0.83.0, commit `5de8d78a`). That fix's
report (`.pi/tmp/fixes/0081-report.md`) records it under §Residuals as R1 —
"Facet (b): the ternary `checkCommonType` caller, blocked on a corpus
self-disagreement … **Needs a DIAG-2 *Trigger* adjudication, not just code.**"
— and the archived stop report (`.pi/tmp/fixes/0081-report-stopped-r1.md`
§"The route I selected", item 1) carries the fuller derivation, including the
0125 comparison. 0081's own `## Fix (0.83.0)` record states the same disposition
in the doc.

Independently re-derived at HEAD `5de8d78a` for this filing, not copied from
0081's measurements: two scratch vitest probes over `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) covering every row of §Reproduction (a)–(d), plus
the two `rg` inventories in (f) and the corpus census in (e), all run and then
deleted. Every `src/`, `tests/` and spec citation above was re-verified against
the tree at HEAD; symbols are cited alongside lines because 0081's fix grew
`src/parser/type-compat.ts` from 620 to 704 lines (lines 1–591 byte-identical)
and because `src/parser/static-type-inference.ts` is held at 378 lines by eleven
open reports.

One citation correction to 0081's shipped artefacts, recorded because this
report cites the same sentence: its fix report gives the `match`-arm LUB
sentence as `docs/reference/type-system.md:96`; at this HEAD it is `:97`, `:96`
being blank. The sentence itself is 0158's subject, not this report's.

Three sibling reports (0156, 0157, 0158) were being filed concurrently against
the same HEAD; their scratch probe files were present in the working tree during
part of this measurement session and were neither read as evidence nor touched.
The tracked tree was verified identical to HEAD before and after every
measurement (`git status --short` showing untracked scratch files only, and
`git diff --stat HEAD -- src/ docs/ tests/` empty).

## Fix (0.174.0)

- **Route selected: (b)** — the ternary is adjudicated OUT of common-type rules
  1 and 3; the two registered *Triggers* stand; no code was wired and no
  executable line changed. Route (a) was refused on three measured grounds: the
  *Trigger* rows still read "Array literal" at this HEAD
  (`code-registry-parse.md`, the `array-element-type-mismatch` and
  `array-no-common-type` rows); wiring a ternary caller would emit outside a
  registered *Trigger* — the fault 0125's fix record prosecutes and the
  0084/0139 posture forbids; and route (a)'s only natural code region (a
  sibling of `checkArrayLiteral`, `type-layer-checks.ts:2039–2069`) sits 92
  lines from a concurrent sibling lane's `checkObjectFieldCompat` region
  (`:2161`), inside this run's 200-line no-go boundary.
- **THE STATED LAW** (the *Trigger*-fidelity adjudication this report and 0158
  share; 0158 lands second and cites this clause verbatim):
  > A registered *Trigger* is the normative statement of a code's emission set
  > (DIAG-2). Where a rule page's scope exceeds the registered *Trigger* of the
  > code it names, the *Trigger* governs and the rule page is corrected in the
  > same commit; no implementation may be wired to emit a code outside its
  > registered *Trigger*. Narrowing an emission set ONTO its registered
  > *Trigger* needs no registry edit (the 0084/0139 posture), but where the
  > *Trigger*'s TEXT presupposes the wider reading, that text is corrected in
  > the same commit as the narrowing.
- **What shipped:**
  - `docs/spec_topics/expressions.md` — the scoping sentence no longer scopes
    all three rules to ternary branches; rules 1 and 3 are marked
    array-literal-only, rule 3 points at TYPE-9 for the ternary case, and rule
    2's LUB is stated as the one rule that also governs ternary branches.
  - `docs/spec_topics/type-system.md` — TYPE-9's ternary clause rewritten: a
    ternary reports no code of its own; its branches reduce under rule 2's LUB
    and the enclosing site reports through its own registered code; a
    two-object-schema branch pair reduces to the first branch and the resulting
    branch-order dependence is accepted by rule. The paragraph's opening
    counter was reworded so it no longer claims all five TYPE-9 sites report a
    code of their own.
  - `docs/reference/type-system.md` — the TYPE-9 mirror bullet and rules 1/3 of
    the common-type block carry the same disposition, mirror-faithfully.
  - `src/parser/static-type-inference.ts` — `#commonType`'s docstring premise
    ("which the checker turns into `array-no-common-type` at the literal")
    corrected: true at an array-literal call site, out of scope at a ternary,
    so the first-candidate answer is the ternary's type BY RULE, not a stopgap
    awaiting a refusal. Comment-only (510 → 518 lines; §Fix constraint 3's
    "378 lines" pin is stale at this HEAD and was already 510 before this fix).
  - `tests/array-ternary-common-type-union.test.ts` — §Fix (c) constraint 1
    discharged: cell r8's assertion stays `[]` and its comment, the file
    header's inventory lines, the `describe`/section headers and the
    SPEC-ANCHORS TYPE-9 line are re-pinned to the settled disposition. Cells r7
    and r7b did not move.
  - `tests/ternary-common-type-trigger-adjudication.test.ts` — new 23-cell
    witness (corpus-conformance cells A1–A5, behaviour pins over §Reproduction
    rows t1/a1/t1x/a1x/s1/s2/s3/u1–u4/L2–L6, and two *Trigger*-fidelity
    structural pins over `src/`).
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a live
    cell proving the same disposition through the real production composition
    root.
- **Gates:** witness RED before (4 corpus-conformance cells: `A2` quoting
  TYPE-9's `theta/parse/array-no-common-type` routing, `A3` the mirror bullet,
  `A4` expressions.md's "(and ternary branches)" parenthetical, `A5` the
  mirror's unscoped rules 1/3), GREEN after (23/23). Full default suite
  `npx vitest run` → 367 files / 7513 tests passed (baseline 366/7490 plus this
  witness's 23 cells). `npm run typecheck` clean. `npm run lint` clean. Live:
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/live-production-acceptance.test.ts -t "CELL-E"` → 1 passed / 84
  skipped.
- **Review:** 2 rounds. Round 1 (deep) — FINDINGS: one `spec` finding (TYPE-9's
  "Five sites … each reports its own diagnostic" counter contradicted the new
  ternary clause in both pages) and four `test` findings (a header line still
  calling facet (b) deferred; header quotes of corpus sentences this fix
  changed; a mirror rule-range inventory misassigning rules 1/2/3; two fresh
  `code-registry-parse.md:41` citations for a row at `:44`), plus two prose
  residuals. Round 2 (fast) — CLEAN, with one one-line citation residual
  corrected by the orchestrator as a bounded citation-only edit (a failure
  message string, no assertion, gates re-run green; polish verified by
  gate-diff, confirmation round skipped).
- **Verification:** SOLID. (1) The witness reds destructively in both
  directions: reinstating the pre-fix sentence in `expressions.md` reds A4 and
  in `spec_topics/type-system.md` reds A2, each restored byte-exact and
  hash-verified; reinstating the REFUSED behaviour-change limb (a verbatim
  union stand-in in `#typeExpr`'s `case "ternary"`) reds 7 cells across both
  witness files (L3/L4/L5/L6 among them), restored byte-exact. (2) Full suite
  367/7513 green. (3) Live: no pre-existing live cell drove a ternary node; one
  H8a cell was added and run for real under the live lock — the ternary
  registers, the one-token-apart array-literal twin still refuses. (4)
  typecheck and lint clean.
- **GOV-15:** census re-measured at this HEAD — 34 committed
  `.theta`/`.thetalib` files, zero ternary expressions (` ? ` sweep empty). No
  committed source's diagnostic sequence moves; no emission set moves at all
  under route (b), so DIAG-2 is a no-op and no registry row, mirror row or
  `docs/reference/diagnostics.md` entry was touched.
- **Residuals:**
  1. The un-narrowed object-branch ternary (§Reproduction rows s2, s3, L5) and
     the branch-order dependence (rows L2/L3/L4) are now accepted BY RULE, as
     §Fix route (b) bullet 3's first option authorises. The order-independent
     alternative was premeasured and refused: prototyping a verbatim-union
     stand-in in `#typeExpr`'s `case "ternary"` red 14 cells in
     `tests/loop-element-withhold-binding-scoped.test.ts` (bug 0194's witness)
     — an unauthorised flip in another open report's witness. A future report
     wanting order independence owns that blast radius.
  2. `docs/reference/type-system.md`'s block heading "Common-type rules (array
     literals & ternary branches)" and its "Applying `⊑` to the array/ternary
     case" lead-in are deliberately unchanged: rule 2 genuinely governs ternary
     branches, each rule beneath now self-scopes, and that heading is cited by
     open bug 0158.
  3. This fix grew `docs/reference/type-system.md` by 4 lines, shifting the
     absolute positions other open reports cite in it (0081, 0158, 0180 cite
     `:96`/`:97`/`:108`/`:109` for sentences this fix did not touch). That is
     bug 0134's adjudicated do-not-chase class; no citation sweep was
     performed. For the record, the `match`-arm LUB sentence 0158 claims is at
     `docs/reference/type-system.md:113` after this fix.
  4. Three pre-existing `code-registry-parse.md:41`-family citations in
     `tests/array-ternary-common-type-union.test.ts` (bug 0081's own prose,
     outside the cells this fix re-pinned) are stale at this HEAD. 0134 class;
     not chased.
- **Discharge notes appended:** none (no sibling bug document was edited).
- **Pinned dispositions / non-goals:**
  - **0158's rows are NOT settled here.** This fix edits no `match`-arm or
    `fn`-return sentence, no `leastUpperBound`, no `computeLub`, and neither
    `docs/reference/type-system.md`'s `match`-arm LUB sentence nor
    `docs/spec_topics/functions.md` FN-3. 0158 inherits THE STATED LAW above
    and applies it to its own two rows.
  - **0195's subject is NOT claimed:** `docs/spec_topics/control-flow.md`'s
    empty-array iterand claim and registered-row reachability are untouched;
    the file is not in this diff.
  - Rule 2's union clause (bug 0081's shipped behaviour, §Reproduction rows
    u1–u4) and the `integer | string` arms-verbatim spelling are unchanged.
  - 0156's `fn`-parameter-sink subject and 0129's diagnostic-multiplicity
    question are untouched: route (b) adds no diagnostic, so row L6's shape
    gains no second code and 0129 is owed no disclosure.
