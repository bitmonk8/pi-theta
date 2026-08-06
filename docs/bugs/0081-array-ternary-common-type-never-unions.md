# Bug 0081 — The array/ternary common-type rule is implemented as "one branch dominates", never the union LUB: both of expressions.md's own normative vectors (`[1, "a"]`, `["a", null]`) fail to load, a heterogeneous ternary silently types as its first branch, and the ternary half of the rule has no checker at all

- **Status:** fixed (0.83.0).
- **Kind:** defect (three facets, one shared root cause plus one missing sink).
- **Related:**
  - [0043](../../../docs/bugs/0043-union-nonprimitive-arm-lowers-permissive.md)
    (open) is the *lowering* of a written union type expression; this report is
    the *inference* of a union from expression operands. Neither reads the
    other's code: 0043 lives in `lowerTypeExpr`, this one in `hasCommonType` /
    `#commonType`. A fix here mints `{ kind: "union", arms }` `CompatType`
    values that never reach the lowering path.
  - [0050](../../../docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
    (open) records that `checkFnArgCompat` has no caller. Facet (d) below is
    the mirror image at the same boundary: the `fn` parameter type is not
    consulted as an array-literal element sink either. Same call site, opposite
    direction (argument checking vs. sink supply); a fix for one does not give
    the other.
- **Affected** (citations verified at HEAD `d06daae3`):
  - `hasCommonType` (`src/parser/type-compat.ts:613`) — the sink-less arm's
    whole decision procedure: `branches.some(candidate => branches.every(branch
    => branch ⊑ candidate))`. It admits only the case where one *existing*
    branch type dominates all the others (TYPE-1 identical, TYPE-2
    `integer ⊑ number`). It never forms a union, so it has no way to satisfy
    rule 2's `["a", null]` → `array<string | null>`.
  - `checkCommonType` (`:555`) raises `theta/parse/array-no-common-type`
    (`:599`) whenever `hasCommonType` is false.
  - `checkCommonType` has exactly **one** caller in `src/`:
    `checkArrayLiteral` (`src/parser/type-layer-checks.ts:841`, dispatched at
    `:1009` for a bare array and `:564` / `:959` for a sunk one). No ternary
    node reaches it — `walkExpr`'s ternary arm walks the branches individually
    with no common-type check.
  - `#commonType` (`src/parser/static-type-inference.ts:335`) — the *inference*
    counterpart, same shape: `candidates.find(candidate => candidates.every(…
    compatible …))` and, when none dominates,
    `return common ?? (candidates[0] as CompatType)` (`:344`). A heterogeneous
    array or ternary therefore types as its **first** element/branch. With no
    candidates at all it returns `{ kind: "named", name: "unknown" }` (`:337`).
  - Array element type is `#commonType` of the elements
    (`static-type-inference.ts:217–223`); ternary type is `#commonType` of the
    two branches (`:226–233`).
- **Observed at:** 0.52.0 (`d06daae3`), offline, through the production
  whole-file parser (`parseThetaDocument`), reading the aggregated diagnostic
  codes.

## Summary

expressions.md §"Array construction" states the common-type rule for array
literals *and ternary branches* in three numbered cases and supplies two
worked vectors. Case 2's union arm is unimplemented, so both vectors are
refused at load. The same missing arm in the inference pass makes a
heterogeneous array or ternary type as its first element/branch, which then
produces incorrect downstream diagnostics on legal code. The ternary half of
the rule is not checked at all, so case 3's rejection never fires for a
ternary. And case 1's `fn`-parameter sink is not applied.

## Reproduction

Parse-only, through `parseThetaDocument`. Aggregated diagnostic codes:

| Source (after `---\nmode: prompt\n---`) | Observed codes | Expected |
| --- | --- | --- |
| `let x = [1, "a"]` | `["theta/parse/array-no-common-type"]` | `[]` — `array<number \| string>` (spec vector) |
| `let x = ["a", null]` | `["theta/parse/array-no-common-type"]` | `[]` — `array<string \| null>` (spec vector) |
| `let x = [1, 2.5]` | `[]` | `[]` (TYPE-2 widening — the one case that works) |
| `let x: array<string \| null> = ["a", null]` | `[]` | `[]` (sink path works) |
| `schema S { xs: array<string \| null> }` + `S { xs: ["a", null] }` | `[]` | `[]` (constructor-field sink works) |
| `fn f(xs: array<string \| null>): integer { 1 }` + `f(["a", null])` | `["theta/parse/array-no-common-type"]` | `[]` — rule 1 lists "parameter type" as a sink |
| `schema A {…}` `schema B {…}` + `let x = [A{…}, B{…}]` | `["theta/parse/array-no-common-type"]` | same (rule 3 — correct) |
| `let x = true ? A{…} : B{…}` | `[]` | rule 3 applies to ternary branches too — nothing fires |
| `let x = true ? 1 : "a"` + `let n = x.length` | `["theta/parse/unknown-method"]` | `x` is `integer \| string`; `.length` on a union receiver is statically unresolvable, not an unknown method |
| `let x = true ? "a" : 1` + `let n = x + 1` | `["theta/parse/mixed-plus-operands"]` | `x` is `string \| integer`; the operand check should not resolve it to `string` |

The last two rows are the inference facet: `#commonType` returns
`candidates[0]`, so the ternary's static type is whichever branch was written
first, and the *wrong* diagnostic fires — a `theta/parse/unknown-method`
naming a member the receiver's real type does have, and a
`theta/parse/mixed-plus-operands` derived from half the type.

Probe: a throwaway vitest file calling `parseThetaDocument` on each source and
collecting `.diagnostics.map(d => d.code)`; deleted after the run.

## Expected behaviour

`docs/spec_topics/expressions.md:220–226`:

- `:220` — "`[]` is the empty array; its element type is inferred from context
  (binding annotation, parameter type, or surrounding constructor field)."
- `:222` — "*Common-type rules for array literals **(and ternary branches)**:*"
- `:225` (rule 2) — "Otherwise, the parser computes the *least upper bound* of
  the element types under `⊑`: identical types collapse (TYPE-1); `integer`
  widens to `number` when mixed with `number` (TYPE-2); **otherwise the element
  types are unioned via TYPE-5 and TYPE-6** (`["a", null]` →
  `array<string | null>`; `[1, "a"]` → `array<number | string>`)."
- `:226` (rule 3) — "Object schemas do not unify implicitly — an array
  containing two different named schemas yields `array<A | B>` only if some
  sink in scope expects a union; otherwise it is
  `theta/parse/array-no-common-type`."
- `docs/reference/type-system.md:90` mirrors rule 2: "collapse (TYPE-1);
  `integer` widens to `number` (TYPE-2); otherwise unioned via …".

Rule 3 is the *only* sink-less rejection the spec prescribes. Every other
heterogeneous combination unions and loads.

## Actual behaviour / root cause

`hasCommonType` searches for a dominating branch among the branches already
present. That is exactly TYPE-1 and TYPE-2 — the first two clauses of rule 2 —
and structurally cannot express the third clause, whose result type (`A | B`)
is not one of the inputs. `checkCommonType` therefore rejects every
heterogeneous sink-less literal, collapsing rule 2's union case into rule 3's
rejection.

`#commonType` in the inference pass repeats the identical search and, on
failure, falls back to `candidates[0]` rather than building the union. Because
the checker and the inferrer disagree in effect — the checker rejects, the
inferrer silently picks a branch — the inference-side wrongness is only
observable where the checker does not run: ternary branches (no caller) and any
array under a sink.

Two coverage gaps compound it:

- `checkCommonType` is reachable only from `checkArrayLiteral`, so the
  "(and ternary branches)" half of `:222` has no implementation at all.
- The sink set applied at a literal is binding-annotation, constructor-field
  and array-element; the `fn`-parameter sink named at `:220` is not applied at
  a call site, so a literal written as an argument is judged sink-less.

## Why it matters

1. Two worked examples printed in the spec do not load. An author following
   expressions.md verbatim gets an error-severity diagnostic and the theta
   never registers — a hard load refusal on documented-legal source.
2. The workaround the diagnostic's own message suggests ("annotate the binding
   with `array<A | B>`") is unavailable at the position most likely to need it:
   a literal passed directly as a `fn` argument has no binding to annotate, and
   the parameter type that should supply the sink is ignored.
3. The inference facet is silent and produces *misleading* diagnostics: a
   ternary over `1` / `"a"` reports `theta/parse/unknown-method` for `.length`
   — naming the wrong problem at the wrong place — and reversing the branch
   order changes which diagnostic fires. A diagnostic that flips with source
   order is worse than none.
4. Rule 3's rejection is silently absent for ternaries, so the one case the
   spec does want refused loads clean when written as `cond ? A{…} : B{…}`.

## Non-goals

- Not about lowering a union type to JSON Schema (bug 0043's territory); the
  union types this report asks for are static-only and, for arrays of
  primitives, never reach a lowering position unless the author writes the
  annotation themselves.
- Not about `theta/parse/array-element-type-mismatch`, the sunk arm, which was
  probed and behaves per rule 1 for the binding-annotation and
  constructor-field sinks.
- Not about the empty-literal case, filed separately (`05-…`): that is the
  `let` binding recording the RHS type instead of the annotation, a different
  mechanism.

## Fix

Not yet decided. Constraints any fix must satisfy:

1. `hasCommonType` / `#commonType` must return a *computed* LUB, not a member
   of the input set: identical → collapse, `integer` + `number` → `number`,
   otherwise `{ kind: "union", arms: [...] }` in receiver-first order (the
   order `concatElementType` in `src/runtime/stdlib-string.ts` already uses for
   the same LUB on `array<T>.concat`, which must stay consistent).
2. Rule 3 must survive: two distinct *named object schemas* with no sink still
   raise `theta/parse/array-no-common-type`. The union arm must therefore be
   gated on the branch kinds, not applied blanket.
3. The checker and the inferrer must agree. Today one rejects where the other
   silently narrows; after the fix both must produce the same union, or the
   `unknown-method` / `mixed-plus-operands` mis-reports simply move to new
   inputs.
4. `checkCommonType` must gain a ternary caller, or rule 3's ternary case stays
   unenforced.
5. The `fn`-parameter sink must be supplied at call sites. Note this is the
   same call-site boundary bug 0050 reports as uncalled; the two are best
   sequenced together so the argument type is resolved once.

An interim option that is strictly smaller: implement only the union arm for
non-object branch types (facets a and c) and leave the ternary checker and the
`fn`-param sink to a follow-up. That closes the two spec vectors and the
first-branch mis-typing without touching the sink resolution.

## Provenance

- Spec: `docs/spec_topics/expressions.md:220–226`;
  `docs/reference/type-system.md:69`, `:90`;
  `docs/reference/grammar.md:369`, `:379`;
  `docs/spec_topics/diagnostics/code-registry-parse.md`
  (`theta/parse/array-no-common-type` row);
  `docs/reference/diagnostics.md:87`.
- Implementation: `src/parser/type-compat.ts:541–626`;
  `src/parser/type-layer-checks.ts:544–572`, `:841–853`, `:1007–1013`;
  `src/parser/static-type-inference.ts:217–233`, `:335–346`;
  `src/parser/type-grammar.ts:420–462`.
- Existing reports read in full for duplicate separation: 0043, 0050.
- Observations: throwaway vitest parse probe at `d06daae3`, deleted after the
  run.

## Coordination note — bug 0050 landed (0.77.0)

0050's fix adds a second consumer of the common-type reduction at argument
positions and deliberately WITHHOLDS wherever the reduction is not exact, so
this report's defect is NOT observable at the new sink and nothing about the
common-type rule is settled there. Measured at the 0050 fix commit:
`[1, "a"]` reads `array<integer>` and `["a", null]` reads `array<string>`
(both erased, both already drawing `theta/parse/array-no-common-type`
today); `true ? 1 : "a"` reads `integer` via the `?? candidates[0]` fallback
and draws nothing. Five of 0050's eight orchestrated-round review findings
trace to that erasure (the `par for` marking, the `index` arm, the `ident`
arm, the `let`-marking guard, the laundered `let`). This report's fix is a
strict WIDENING of what the fn-argument sink may judge and needs its own
witness cells at `checkFnCallArgs` (`src/parser/type-layer-checks.ts`);
cells u1–u4 of `tests/fn-arg-type-mismatch-wired.test.ts` pin the current
withholding in both directions.

## Fix (0.83.0)

- **Route adopted** — the bug doc's own *interim option*, re-verified at this
  HEAD and adopted verbatim: the computed-LUB union arm in ONE exported
  `commonType` (`src/parser/type-compat.ts`), parameterised over the `⊑`
  relation and called by BOTH `checkCommonType` (same module, over
  `checkCompatible`) and `StaticTypeInferencePass.#commonType`
  (`src/parser/static-type-inference.ts`, over its constructor-injected engine)
  — facets (a) and (c). Facets (b) and (d) are DEFERRED, as residuals 1 and 2.
  Rationale, measured rather than assumed: facet (b) cannot be closed without
  widening `theta/parse/array-no-common-type`'s registered *Trigger*
  (`code-registry-parse.md` — "**Array literal** whose elements have no common
  type"), which DIAG-2's closed registry forbids, and about which the corpus
  disagrees with itself (`docs/reference/type-system.md`'s TYPE-9 bullet and
  `expressions.md:222`'s "(and ternary branches)" both prescribe the ternary
  route); facet (d) is materially narrower than §Why it matters item 2 states,
  because §Reproduction row 6 flips to `[]` under this route with NO parameter
  sink supplied — the literal stops being sink-less-refused once it has a
  common type of its own. Constraint 3 is met BY CONSTRUCTION, not by
  coincidence: one function answers both callers, so checker and inferrer
  cannot disagree about a candidate set.
- **What shipped**
  - `src/parser/type-compat.ts` (620 → 704) — new exported `CompatRelation` (the
    `⊑` relation as a parameter, so the inference pass keeps its injected-engine
    seam and the dependency stays one-way); new exported `commonType`, three
    clauses in the spec's own order — a dominating branch IS the LUB (TYPE-1
    collapse, TYPE-2 `integer`→`number`; an unresolvable branch does not block a
    candidate, per `type-system.md` §"Unresolvable operands"), else
    `{ kind: "union", arms }` receiver-first with arms VERBATIM (TYPE-5/TYPE-6),
    EXCEPT an object branch present with no dominator ⇒ `undefined` (rule 3);
    new `isObjectBranch` gating rule 3 on branch KINDS (alias-unfolded `object`
    per TYPE-8, or `named` resolving to an `object-schema` decl per TYPE-10,
    through the own-key-guarded `resolveNamed` bugs 0031/0038 require, with
    TYPE-11 unfolding first); `hasCommonType` deleted as subsumed;
    `checkCommonType`'s sink-less arm now tests
    `commonType(branches, env, checkCompatible) !== undefined`. `commonType` is
    TOTAL: an empty branch set answers `undefined` directly rather than falling
    through clause 2 to an empty union.
  - `src/parser/static-type-inference.ts` (378 → 378) — `#commonType` delegates
    to the same `commonType` over `this.#checkCompatible`, keeping its empty-set
    `named unknown` early return and its `?? candidates[0]` fallback for the
    rule-3 sets the checker refuses (a refused array or ternary still needs a
    type for the rest of the walk, and the refusal is already reported at the
    literal).
  - `src/parser/functions.ts` (427 → 427) and `src/parser/type-layer-checks.ts`
    (2531 → 2531) — comment-only, line-count-neutral. Both carried doc comments
    this change falsifies: `computeLub`'s claimed "the same common-type
    discipline `checkCommonType` applies to array/ternary branches" (false now
    — `computeLub` has no union clause), and `provableArgType`'s two worked
    examples (`true ? 1 : "a"` reads `integer`, `["a", null]` reads
    `array<string>` — both now exact). Corrected to currently-true, measured
    examples; the "measured at this HEAD" framing dropped per CLAUDE.md.
  - `tests/array-ternary-common-type-union.test.ts` — new, 21 cells, offline and
    provider-free, on bug 0142's witness shape: every *Message* read through
    `registryMessage` (DIAG-4), a loud precondition per absence cell so none can
    pass while measuring nothing.
  - `tests/live/live-production-acceptance.test.ts` (+213/−0) — one additive H8a
    cell, and a NEW shape for this file: an ADMISSION cell. `b81livegood`
    (`let x = [1, "a"]`, the spec's own worked vector) must now REGISTER through
    the real production composition root, where every sibling cell proves a
    denial; `b81livebroken` (`[A{…}, B{…}]`, rule 3) must still NOT register, so
    the harness is proven able to detect a refusal and `b81livegood`'s
    registration is not a vacuous pass; `b81livectl` is the plain control.
  - Byte-unchanged, verified: `tests/fixtures/h7a/permitted-codes.json` (decided
    by the REAL H9a run, 11/11, which drew no unpermitted code on the fixed
    path), the diagnostics registry and both mirrors (no DIAG-2 engagement — the
    change NARROWS an emission set onto its registered *Trigger*, the 0084/0139
    posture), `src/runtime/stdlib-string.ts`.
- **The eighteen re-pinned existing cells**, each with its bucket and the
  sentence that authorizes it. Measured, not assumed: a full-suite run BEFORE
  any test file was touched reded exactly these eighteen, in exactly these five
  files, and no nineteenth anywhere in the 4305-test suite.
  - *Bucket (i) — 10 cells, `tests/fn-arg-type-mismatch-wired.test.ts`*: u1, u2,
    u3, u4, u5, u7, u7-laundered, u11, u11b, u11c. Each flips from withholding
    to a TRUE-POSITIVE `theta/parse/fn-arg-type-mismatch` whose `<actual>` is
    the exact union (u1: `fn 'g' argument 0 ('s') type mismatch: expected
    string, got integer | string`). Authorized by this report's own coordination
    note: *"This report's fix is a strict WIDENING of what the fn-argument sink
    may judge … cells u1–u4 of `tests/fn-arg-type-mismatch-wired.test.ts` pin
    the current withholding in both directions"*, and for the other six *"Five
    of 0050's eight orchestrated-round review findings trace to that erasure
    (the `par for` marking, the `index` arm, the `ident` arm, the `let`-marking
    guard, the laundered `let`)"* — u5 is the `par for` marking, u7 the `index`
    arm, u2/u7-laundered the laundered `let`, u11/u11b/u11c the `let`-marking
    guard. Soundness re-audited cell by cell against `provableArgType` /
    `isProvenReduction`, and independently re-audited by review round 1: every
    arm is an independently proven read AND every arm is `⊑` the union (TYPE-5),
    so the union is an EXACT description of the values the expression can take,
    and `integer | string ⋢ string` is what TYPE-6 prescribes. u11 worked
    explicitly: the shadowing initialiser resolves its self-reference to the
    OUTER binding (the runtime's own evaluate-then-define order), whose value
    set is `{integer, string}`; the inner candidate set `{integer, integer |
    string}` collapses by clause-1 subsumption onto that same union object, so
    the recorded type is exact, not laundered. This is NOT bugs 0050/0072's
    false-`E` species: nothing misdescribes a value set.
  - *Bucket (ii) — 6 cells*, all authorized by §Reproduction's Expected column
    (row 1: `let x = [1, "a"]` → *"`[]` — `array<number | string>` (spec
    vector)"*) and by §Expected behaviour: *"Rule 3 is the only sink-less
    rejection the spec prescribes. Every other heterogeneous combination unions
    and loads."*
    - `tests/type-compat.test.ts` — the TYPE-9 no-sink row (two unrelated
      primitive branches through `checkCommonType` directly) → no diagnostic.
    - `tests/type-layer-diagnostics-production.test.ts` — "rejects an array
      literal whose elements share no common type" (`let xs = [1, "a"]`) → `[]`.
    - `tests/conformance/production-conformance.test.ts` — the V20g-T row, same
      source → `[]`.
    - `tests/index-element-alias-unfolded.test.ts` f1 → `[]`, f3 →
      `["theta/parse/let-rhs-type-mismatch"]`, f5 →
      `["theta/parse/object-field-type-mismatch"]`. f1's flip REMOVES a false
      `E`-severity rejection of a spec-legal binding, which bug 0125 §Fix (d)
      calls *"a sharper symptom than this report's"*.
  - *Operator-authorized — 2 cells*, `tests/index-element-alias-unfolded.test.ts`
    f4 and f6. The authorization, verbatim: *"The operator authorizes re-pinning
    EXACTLY TWO further cells beyond the 16 doc-authorized flips: f4 and f6 of
    `tests/index-element-alias-unfolded.test.ts` (bug 0125's group (f)) — f4
    (`let xs: array<string> = ["a", 1]`) from
    `["theta/parse/array-element-type-mismatch"]` to
    `["theta/parse/let-rhs-type-mismatch", "theta/parse/array-element-type-mismatch"]`,
    and f6 (the constructor-field twin) from
    `["theta/parse/array-element-type-mismatch"]` to
    `["theta/parse/object-field-type-mismatch", "theta/parse/array-element-type-mismatch"]`
    — each with a comment recording that the second code is open bug 0129's
    class (two `E`-severity diagnostics for one written mistake; no corpus
    sentence governs the count) and that 0129's adjudication rules the class and
    may re-pin these cells with its own authority. ALSO authorized: append
    (never delete) a disclosure note to open bug 0129's doc recording this
    shipped instance of its class (name the two cells, the codes, and that
    0142's cell c4 already pinned the same two-code pattern at this sink family
    before this fix). The authorization covers EXACTLY those two cells plus the
    16 bucket-(i)/(ii) cells the stop report inventoried."* Both cells' comments
    record 0129's class and its authority to re-pin them; the code ORDER was
    read off the pre-edit failure output, not assumed. They flip because the
    inferred type of `["a", 1]` becomes EXACT (`array<string | integer>`) and
    `array<string | integer> ⋢ array<string>`, so `checkLetRhsCompat` /
    `checkObjectFieldCompat` now fire alongside the element sink; the pre-fix
    agreement was accidental — the `candidates[0]` erasure happened to answer
    `array<string>`.
- **Line-count neutrality** (operator-mandated; bug 0125 §Residuals item 7 is
  the precedent). `src/parser/static-type-inference.ts` 378 → **378** exactly —
  eleven open reports cite it by line (0019, 0090, 0115, 0126, 0130, 0136, 0140,
  0142, 0145, 0146, 0152); the import stayed one line and `#commonType`'s
  docstring was sized to the shortened body. `src/parser/functions.ts` 427 →
  **427**; `src/parser/type-layer-checks.ts` 2531 → **2531**. For
  `src/parser/type-compat.ts` the open-doc citation set was enumerated: the last
  line cited by any open report other than this one is **582** (0152 `:573–582`,
  0142 `:577`, 0114 `:570–572`); the first edited line is **592**, so lines
  1–591 are byte-identical to HEAD (verified by `diff` at every round) and ALL
  growth sits below the last cited line. The only citations into the changed
  region are this report's own `:613` and `:541–626`, already 0.52.0-era drift
  and left as found (bug 0134's class — citing docs were not chased).
- **Gates** — witness `npx vitest run tests/array-ternary-common-type-union.test.ts`
  → `Test Files 1 passed (1)` / `Tests 21 passed (21)`; full suite
  `npx vitest run` → `Test Files 277 passed (277)` / `Tests 4306 passed (4306)`
  (clean-tree baseline 276/4285); `npm run typecheck` (`tsc -p tsconfig.json
  --noEmit`) clean, no output; `npm run lint` (`eslint --no-error-on-unmatched-pattern
  "src/**/*.ts"`) clean, no output; H8a live
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts`
  → `Test Files 1 passed (1)` / `Tests 26 passed (26)` including the new
  admission cell (25 before); H9a acceptance
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance`
  → `Test Files 2 passed (2)` / `Tests 11 passed (11)`, unchanged. No stochastic
  red in the shipping run.
- **Review** — 2 rounds, plus one pre-review citation-correction round that is
  not a review round. Pre-review round: the Phase-2 header-comment rewrites in
  the two large witness files were not line-count-neutral and shifted every
  citation below them; re-flowed to net zero, which returned
  `tests/index-element-alias-unfolded.test.ts` to ZERO staled citations and
  confined `tests/fn-arg-type-mismatch-wired.test.ts`'s shift to below its first
  re-pinned cell. r1 (deep): FINDINGS — no `correctness`, `fidelity` or `spec`
  finding; two defects (`isObjectBranch`'s TYPE-11 unfold step had no witness
  that could red, and its covering comment claimed a route inventory that
  measured false; two doc comments outside the diff falsified by the behaviour
  change) plus three observations. r2 (fast): CLEAN, one non-blocking `prose`
  residual (a false coverage claim in new prose), fixed by a comment-only polish
  round — polish verified by gate-diff, confirmation round skipped per the
  charter's post-polish rule.
- **Verification** — PASS. (1) The witness genuinely reds without the fix: with
  clause 2 neutralised (`commonType` returning `undefined` instead of the
  union), the derived-in-advance red set `{r1, r2, u3, uN, r6, r9, r10, s1–s5}`
  matched the measured 12-of-21 exactly, every red carrying the 0081 signature
  (`array-no-common-type` on the spec's own vectors; `array<integer>` where
  `array<integer | string>` is expected); with `isObjectBranch` forced `false`,
  the derived set `{r7, r7b}` matched exactly, proving rule 3's survival is
  witnessed and not asserted. Every restore proven byte-exact by `git
  hash-object` against the pre-neutralisation snapshot
  (`27b209b586a1116db9c55202835e6e45f7995ac4`, three cycles). (2) Full default
  suite green, and the three line invariants re-verified empty. (3) The new H8a
  admission cell run FOR REAL and proven in BOTH directions: neutralised, only
  `b81livectl` registers and the cell reds naming the refused spec vector;
  restored blob-hash-verified, 26/26 green. (4) Lint and typecheck clean.
- **Residuals** (evidence banked; no bug doc created by this fix)
  1. **Facet (b) — the ternary `checkCommonType` caller, blocked on a corpus
     self-disagreement.** `docs/reference/type-system.md`'s TYPE-9 bullet routes
     a ternary through "the array/ternary common-type machinery", and
     `expressions.md:222` scopes the rules to "array literals **(and ternary
     branches)**" — but `code-registry-parse.md`'s *Trigger* for
     `theta/parse/array-no-common-type` says "**Array literal** whose elements
     have no common type". Wiring the caller emits outside the registered
     *Trigger* (the fault bug 0125's fix record prosecutes at
     `theta/parse/non-array-iterand`); not wiring it leaves TYPE-9's ternary half
     unimplemented. Needs a DIAG-2 *Trigger* adjudication, not just code.
     Evidence: §Reproduction row 8 (`true ? A{…} : B{…}` → `[]`) re-measured at
     this HEAD and pinned as witness cell r8; `checkCommonType`'s single `src/`
     caller re-confirmed to be `checkArrayLiteral`.
  2. **Facet (d) — the `fn`-parameter sink at call sites, NARROWER than this
     report frames it.** Now bounded to "elements with no LUB (rule 3) under a
     union-typed parameter", e.g. `fn f(xs: array<A | B>)` + `f([A{…}, B{…}])`.
     Evidence: §Reproduction row 6 flips to `[]` under this fix with no sink
     supplied, pinned as witness cell r6. §Why it matters item 2 overstates the
     remaining gap.
  3. **Bug 0125's recorded-not-filed sink-routing siblings are HALF-CLOSED.**
     f1's false `E` is gone and f3/f5 relabel to a correctly-triggered code; the
     remaining divergence is only that the alias spelling reports the OUTER code
     where the concrete spelling reports the ELEMENT code (f3 vs f4, f5 vs f6).
     Whoever files the siblings' report must know 0125's §Reproduction (f)
     baseline no longer holds. Discharge note appended to 0125.
  4. **The inference pass now unions `match` arms while the checker still
     refuses them.** `#typeExpr`'s `case "match"`
     (`src/parser/static-type-inference.ts`) routes through `#commonType`, so a
     heterogeneous `match` types as a union, while `checkMatchArmTypes` (via
     `leastUpperBound`, `src/parser/match-result.ts`) and `computeLub`
     (`src/parser/functions.ts`) remain dominating-member-only and still refuse.
     No false `E` ships: the disagreement is observable only inside programs
     those rows' own registered *Triggers* already refuse, and an admitted
     program has a dominating arm, for which `commonType` returns exactly what it
     returned before. But `docs/reference/type-system.md:96` — "`match` arms and
     inferred theta/`fn` return types use the same LUB discipline" — now reads
     false in a new direction, and both rows' *Triggers* are written to the
     dominating semantics. Same adjudication class as residual 1.
  5. **Self-inflicted line drift, bounded and disclosed** (bug 0134's class;
     citing docs deliberately not chased). `tests/fn-arg-type-mismatch-wired.test.ts`
     2914 → 2961; every line up to 1273 is byte-identical to HEAD, so only
     citations at or after its first re-pinned cell move, in nine open reports:
     0139 (`:1639`, `:2334`), 0140 (`:1546`, `:1656`), 0141 (`:1618`, `:2420`,
     `:2436`, `:2468`), 0143 (`:2726`, `:2734`, `:2742`, `:2759`), 0144
     (`:2342`), 0145 (`:2694`), 0146 (`:1427`, `:1855`), 0149 (`:1371`), 0150
     (`:2154`, `:2169`). `tests/index-element-alias-unfolded.test.ts` 1204 →
     1269 with ZERO staled citations: its lowest cited line is `:168` and its
     highest is `:1003`, all inside the byte-identical 128–1031 window.
- **Discharge notes appended:** 0129 (the operator-mandated disclosure of this
  shipped instance of its class), 0125 (its §Fix (d) tripwire fired and was
  answered under authorization; its "the three sink-routing siblings keep their
  measured divergence" no longer holds for sibling 1). Bugs 0043, 0130, 0136,
  0145, 0146 and 0152 were re-scanned and no premise of theirs moves — 0043's in
  particular is structurally untouchable (`grep -c CompatType
  src/parser/body-type-lowering.ts src/parser/schema-lowering.ts` → 0 and 0; a
  minted union `CompatType` cannot reach `lowerTypeExpr`, which consumes
  annotation source strings) — so no note is owed.
- **Pinned dispositions / non-goals**
  1. **The union spelling is `integer | string`, not the spec's
     `number | string`.** `expressions.md:225` writes the worked vector as
     `[1, "a"]` → `array<number | string>`; this fix computes
     `array<integer | string>`, arms VERBATIM, as `concatElementType` already
     does. The vector's normative observable — the source loads — is met either
     way; `array<integer | string> ⊑ array<number | string>`, so the computed
     type is strictly TIGHTER and satisfies any sink written to the spec's
     spelling; and rule 2's TYPE-2 clause is conditioned on "`integer` widens to
     `number` **when mixed with `number`**", which `[1, "a"]` is not. Pinned by
     witness cell s1 with the argument in its comment, so a later "correction"
     toward the spec's printed spelling is a decision and not an accident.
  2. **Mirrored, not shared, with `concatElementType`** (`src/runtime/stdlib-string.ts`),
     with the divergence reason recorded in `commonType`'s doc comment:
     `concatElementType` treats an `"unknown"` relation as DISJOINT (it unions)
     where the common-type rule treats an unresolvable branch as NON-BLOCKING
     (it collapses onto the dominating branch, per `type-system.md`
     §"Unresolvable operands"). Delegating would silently change
     `array<T>.concat`'s behaviour on unresolvable element types. Union shape and
     arm order are identical, which is what §Fix constraint 1 asks.
  3. **A branch whose alias-unfolded kind is `union` is NOT an object branch**,
     so a discriminated-union-alias-typed element (`schema Animal = Cat | Dog`)
     takes rule 2's union clause rather than rule 3. Recorded as the disposition
     in `isObjectBranch`'s doc comment: the author already declared the union,
     TYPE-11 makes the alias transparent ahead of the test, and the route gates
     on branch KIND, which `union` is not.
  4. **GOV-15 removal direction.** Re-measured at this HEAD: 34 committed
     `.theta`/`.thetalib` files, ZERO heterogeneous array literals; the only
     multi-element bracket in the corpus is `docs/examples/ralph-inline.theta:22`
     (`tools: [read, bash]`), a frontmatter tools list, not an expression-position
     array literal. The change removes no diagnostic any committed theta draws
     and admits sources the corpus does not yet contain. Disposition: NARROWING
     an emission set onto its registered *Trigger* — the 0084/0139 posture — so
     no registry edit is engaged for facets (a)/(c).
  5. **§Non-goals stand**, with one correction to this report's own text: the
     interim option's claim that it closes the spec vectors *"without touching
     the sink resolution"* is FALSE as written — cells f4/f6 measure the sunk
     arm's observable output changing, which is what made this fix need the
     operator authorization recorded above.
