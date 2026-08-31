# Bug 0344 — `commonType`'s dominating-candidate search inherits the literal-vs-primitive asymmetry from the CANDIDATE side: an array literal `[n, 1.5]` over an `integer`-typed `n` reduces to `array<integer | number>` rather than `array<number>`, and the union element then refuses `xs[0] + 1` as `theta/parse/mixed-plus-operands` — a legal read that a correctly-typed `array<number>` element accepts

- **Status:** fixed (0.319.0).
- **Sev/Diff estimate:** S2/D2 — S2 because the union element type is not
  merely displayed oddly: element arithmetic on it (`xs[0] + 1`) is refused
  `theta/parse/mixed-plus-operands` where the same read over a correctly-typed
  `array<number>` element loads clean, so a legal program is denied. It is not
  S1: the array itself assigns and passes wherever `array<number>` is accepted
  (the union distributes under [TYPE-6](../spec_topics/type-system.md#type-6)),
  so the blast radius is element-read positions, not the binding. D2 because
  the fix is one candidate-side widening inside `commonType`, but it sits next
  to the object-branch gate (rule 3) and the `concatElementType` mirror, both
  of which must keep their current dispositions.
- **Kind:** defect against the array-literal common-type rule.
  `docs/spec_topics/expressions.md` §"Array construction" rule 2 states the
  least-upper-bound directly: "identical types collapse ([TYPE-1](../spec_topics/type-system.md#type-1));
  `integer` widens to `number` when mixed with `number`
  ([TYPE-2](../spec_topics/type-system.md#type-2))". `[integer, number]` is
  that mixed case, so its LUB is `number` and the array types `array<number>`;
  the union arm of the same rule governs only element types with no dominator.
  `integer ⊑ number` (TYPE-2) holds, so a union is never the LUB of these two.
- **Affected** (verified at `7ec6fd2f`, v0.309.0):
  - `src/parser/type-compat.ts:805-817` — `commonType`'s dominating-candidate
    search. It relates each branch against each candidate as-is; a
    `{kind:"literal",typesAs:"number"}` candidate is never widened before the
    domination test, so it cannot absorb a `{kind:"prim",name:"integer"}`
    branch and the search falls through to the union at `:817`.
  - `src/parser/type-compat.ts:382-387` — `decide`'s literal-TARGET arm returns
    `"incompatible"` for a non-`literal` source. This is the arm that refuses
    `prim integer ⊑ literal number` and denies the literal candidate its
    dominator. `⊑` is not the defect here; this arm is correct and must stay
    strict (see §Fix and bug 0341's residual 2).
  - `src/parser/type-compat.ts:370-380` — `decide`'s primitive-TARGET arm,
    which decides `literal number ⊑ prim integer` through `decidePrimitive`
    (`:397`) to `"integer-narrowing"` (`:405`), so the `prim integer` candidate
    is not a dominator in the other direction either. Neither candidate
    dominates; the union results.
  - `src/parser/static-type-inference.ts:272-276` — `#typeExpr`'s `case "array"`,
    which reduces the element types through `#commonType` (`:597-601`). The
    literal element `1.5` enters as `{kind:"literal",typesAs:"number"}` from the
    `case "number"` arm (`:259`).
  - `src/parser/type-compat.ts:459-464` — `displayType` renders the resulting
    `union` as `integer | number`, the string every downstream refusal
    interpolates.
- **Observed at:** 0.309.0 (`7ec6fd2f`), offline, through
  `tests/helpers/e2e-s1.ts`'s `parseDoc` (the real `lexTheta` +
  `parseThetaDocument`). Pre-existing for annotated bindings at `089b27df`
  (pre-0341); bug 0341's `widenLiteralTypes` made the inferred spelling
  (`let n = 1`) agree with the annotated one rather than diverge, so both now
  present identically — see §Provenance.

## Summary

An array literal that mixes an `integer`-typed binding with a `number` literal
— `[n, 1.5]`, `n: integer` — reduces to the element type `integer | number`
instead of `number`. The mismatch is a candidate-side asymmetry in
`commonType`: the `1.5` element enters the reduction as
`{kind:"literal",typesAs:"number"}`, and `decide`'s literal-TARGET arm
(`type-compat.ts:382-387`) refuses a `prim` source, so the `prim integer`
branch is not `⊑` the `literal number` candidate and the literal candidate
never dominates. The reverse candidate fails too: `literal number ⊑ prim
integer` is `integer-narrowing`. Neither dominates, so the search unions.

The asymmetry is exactly the one bug 0341 corrected on the recording side, seen
from the other direction. There the literal was a TARGET; here it is a
CANDIDATE. Two facts localise the mechanism to the literal candidate:

- Both numeric elements as bindings collapse correctly. `[n, m]` with
  `n: integer`, `m: number` reduces to `array<number>` — two `prim` candidates,
  and `prim number` dominates `prim integer` under TYPE-2.
- Both numeric elements as literals collapse correctly. `[1, 1.5]` reduces to
  `array<number>` — two `literal` candidates, and `decidePrimitive` relates
  them.

Only the mixed prim-integer + literal-number pairing fails.

The union is not display-only. Where an element is read and fed to `+`,
`classifyOperand` sees a union rather than a `number` and reports
`theta/parse/mixed-plus-operands`: `xs[0] + 1` is refused, though the same read
over a declared `array<number>` element loads clean. Positions that consume the
array whole — assignment to `array<number>`, a `number`-array parameter — accept
it, because `integer | number ⊑ number` distributes under TYPE-6.

## Reproduction

Bodies under `---\ndescription: b0344\nmode: prompt\n---\n`, measured at
`7ec6fd2f` through `parseDoc`. The `array<string>` sink in Q1/Q2 forces the
mismatch message that prints the reduced element type.

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| Q1 | `let n: integer = 1` / `let xs = [n, 1.5]` / `let ys: array<string> = xs` / `ys` | `let-rhs-type-mismatch … got array<integer \| number>` | `… got array<number>` |
| Q2 | `let n = 1` / `let xs = [n, 1.5]` / `let ys: array<string> = xs` / `ys` | `… got array<integer \| number>` | `… got array<number>` |
| Q3 | `let n = 1` / `let xs = [n, 1.5]` / `xs[0] + 1` | `mixed-plus-operands: '+' has mixed operand types: integer \| number and integer` | `[]` |
| Q4 | `let xs: array<number> = [1.0, 2.5]` / `xs[0] + 1` | `[]` | unchanged — the correctly-typed counterfactual |
| Q5 | `let n = 1` / `let xs = [n, 1.5]` / `let ys: array<number> = xs` / `ys` | `[]` | unchanged — the whole array is `⊑ array<number>` |
| Q6 | `fn total(a: array<number>): number { 0 }` / `let n = 1` / `let xs = [n, 1.5]` / `total(xs)` | `[]` | unchanged — same distribution at a parameter sink |
| Q7 | `let n: integer = 1` / `let m: number = 1.5` / `let xs = [n, m]` / `let ys: array<string> = xs` / `ys` | `… got array<number>` | unchanged — two `prim` candidates collapse |
| Q8 | `let xs = [1, 1.5]` / `let ys: array<string> = xs` / `ys` | `… got array<number>` | unchanged — two `literal` candidates collapse |

Q1 and Q2 are identical, which is the fixed state bug 0341 landed: the inferred
and annotated spellings now agree. Q7 and Q8 isolate the cause — the union
appears only when one numeric candidate is a `prim` and the other a `literal`.

## Expected behaviour

`docs/spec_topics/expressions.md` §"Array construction" rule 2 — the LUB of the
element types under `⊑`, with `integer` widening to `number` when mixed with
`number`. `[integer, number]` is that case, so `[n, 1.5]` types `array<number>`
and `xs[0]` reads `number`. `xs[0] + 1` is then `number + integer`, which the
`+` rule (§"`+` operator") widens to `number` and admits. The union arm of rule
2 governs only element types with no dominator (`["a", null]` →
`array<string | null>`); `integer ⊑ number` holds (TYPE-2), so these two have a
dominator and the union arm does not apply.

## Actual behaviour / root cause

`commonType` (`type-compat.ts:805-817`) searches for a branch every branch is
`⊑`:

```ts
const dominating = branches.find((candidate) =>
  branches.every((branch) => {
    const r = relate(branch, candidate, env);
    return r === "compatible" || r === "unknown";
  }),
);
```

For `[n, 1.5]` the branch set is `[{prim integer}, {literal number}]`.

- Candidate `{literal number}`: `relate({prim integer}, {literal number})` hits
  `decide`'s literal-TARGET arm (`:382-387`), whose `sub.kind !== "literal"`
  path returns `"incompatible"`. The literal candidate does not dominate.
- Candidate `{prim integer}`: `relate({literal number}, {prim integer})` hits
  the primitive-TARGET arm (`:370-380`), `decidePrimitive("number","integer")`
  → `"integer-narrowing"` (`:397-405`). The primitive candidate does not
  dominate.

No candidate dominates, and neither branch is an object branch, so the search
returns `{kind:"union", arms:[{prim integer},{literal number}]}` (`:817`).
`displayType` renders it `integer | number` (`:459-464`).

The literal-TARGET arm is correct. TYPE-3 is one-way: a primitive is not `⊑` a
literal, and the arm is the guard bug 0341 kept strict for the day an
annotation lowers to a literal type (0341 §Non-goals, residual 2). The defect
is that `commonType` asks the relation a question the relation is right to
refuse. The `1.5` candidate's dominating power should be that of the primitive
it types as (`number`, under TYPE-3 in expression position), not that of the
literal type itself. `commonType` never widens the candidate before testing
domination, so a `literal number` candidate carries less absorbing power than
the `prim number` it types as — the same information loss bug 0341 removed at
the recording site, unremoved here at the reduction site.

## Why it matters

The refused program is an array literal mixing a counter or index with a
fractional constant — `[n, 1.5]`, `[idx, 0.5]` — followed by arithmetic on an
element. The array assigns and passes everywhere `array<number>` is accepted,
so the union survives silently until an element is read into `+`, `-`, `*`,
`/`, or `%`, at which point the read is refused `theta/parse/mixed-plus-operands`
(or `theta/parse/non-numeric-arithmetic-operands`) with a message naming a
union the author did not write. The author's array is a numeric array; the
diagnostic says it is not.

## Fix

Widen a literal candidate to the primitive it types as before the domination
test in `commonType` (`type-compat.ts:805-817`) — a candidate that is
`⊑`-dominated by another under the widened comparison is absorbed. With the
`1.5` candidate compared as `prim number`, `prim number` dominates `prim
integer` under TYPE-2 and the LUB is `number`, so `[n, 1.5]` types
`array<number>`. Reuse `widenLiteralTypes` (`type-compat.ts:429`) — the
function bug 0341 already ships — to derive each candidate's expression-position
type for the domination test; the branch objects returned in the LUB are the
widened ones, so the reduced element type is a primitive, not a literal.

Constraints, pinned:

- **`⊑` does not change.** `decide`'s literal-TARGET arm (`:382-387`) stays
  strict; TYPE-3's one-way direction is untouched. The change is confined to
  how `commonType` prepares its candidates — the LUB/collapse, not the
  relation. This preserves bug 0341's decide-literal-arm adjudication (0341
  residual 2: the arm is provably unreachable from production and must stay
  strict for a future literal-value-carrying model).
- **The object-branch gate (rule 3) keeps its disposition.**
  `isObjectBranch` (`type-compat.ts`) gates on branch KIND; widening literals
  to primitives never turns a branch into or out of an object branch, so a set
  holding an object branch still refuses to unify implicitly.
- **The `concatElementType` mirror (`../runtime/stdlib-string.ts`) is out of
  scope.** `commonType`'s clause 2 and `concatElementType` are deliberately
  mirrored, not shared (they disagree on an unresolvable branch). This change
  touches candidate preparation, not the union clause, so the mirror is
  undisturbed; leave `concatElementType` as is.

**Flip authority.** Cell G1 in
`tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts:207-229`
pins the current state: it asserts the inferred and annotated twins AGREE
(`expect(inferred).toEqual(annotated)`) AND that both read `got array<integer
| number>`. The agreement assertion stays green after this fix — both twins
move together to `array<number>`. The second assertion's pinned string flips
from `array<integer | number>` to `array<number>`, and the cell's header
comment (`:220-224`) and the file-level witness note (`:46`) that describe the
union as the settled outcome are reworded to the collapsed outcome. G1 is the
only cell in the tree that pins an `array<integer | number>` outcome (swept:
`rg "array<integer \| number>"` returns G1's three lines and nothing else), so
it is the complete flip set. G1 legitimately flips because it pins the
asymmetry this report removes; it is not a regression.

**Spec:** no registry edit is owed — no code is minted, and rule 2 already
states the collapsed LUB. `expressions.md` §"Array construction" rule 2 is the
authority the fix satisfies; it is not edited.

## Related

- [0341](./0341-inferred-literal-binding-refuses-primitive-rhs.md) (fixed
  0.309.0) — the recording-side twin. Its `widenLiteralTypes` made
  `let n = 1` record `prim integer`, so the inferred and annotated spellings of
  `[n, 1.5]` now agree at `integer | number`; 0341 records this reduction-side
  asymmetry as its residual 1, "worth its own filing", and its §Non-goals
  ("The `integer | number` array LUB (G1)") scopes it out of that fix. This is
  that filing.
- [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md) (fixed
  0.181.0) and
  [0081](./0081-array-ternary-common-type-never-unions.md) (fixed 0.83.0) — the
  ancestry of the shared `commonType`. 0081 gave it the union clause; 0158
  reconciled the checker-side LUBs (`leastUpperBound`, `computeLub`) with it.
  Neither owns the candidate-side literal asymmetry; both left the
  dominating-candidate search relating candidates as-is.
- [0164](./0164-generic-argument-literal-lowers-permissive.md) (fixed 0.123.0)
  — checked for a shared surface (generic-argument LUBs) and found unrelated:
  it concerns how a generic's argument lowers to AJV, not the array-literal
  element LUB. Not a dependency.

## Provenance

Credited to external PR #3 (Harald Nielsen), which landed as bug 0341 in
v0.309.0. That PR's fix report records this reduction-side asymmetry as its
residual 1 and marks it worth its own filing; this document is that filing.

Ownership checked: `rg` over `docs/bugs/` for `commonType` / `LUB` / `union
collapse` returns the array/ternary LUB ancestry (0081, 0155, 0156, 0158,
0179, 0190, 0205, 0241) and 0341, none of which owns this defect. 0341 is
`fixed` and names it a residual, so no open bug owns it.

Measured at `7ec6fd2f` (0.309.0) offline through `parseDoc`. Every §Reproduction
row is from that measurement. The verdicts: Q1 and Q2 both report `got
array<integer | number>` (inferred and annotated agree); Q3 refuses `xs[0] + 1`
as `theta/parse/mixed-plus-operands: '+' has mixed operand types: integer |
number and integer`; Q4 (declared `array<number>` element), Q5 (assign whole to
`array<number>`), Q6 (pass to `array<number>` parameter), Q7 (two `prim`
candidates), and Q8 (two `literal` candidates) all report `[]` or the
collapsed `array<number>`. The consequence is a spurious refusal of a legal
element read, not a display-only artefact — Q3 refuses where Q4 accepts the
same arithmetic over the correctly-typed element. Scratch probes deleted; a
case-insensitive sweep for the probe name returned only the deleted files and
an ephemeral vitest cache, no tracked residue.

## Fix (0.319.0)

- **What shipped:**
  - `src/parser/type-compat.ts` — `commonType`'s dominating-candidate search
    now maps each candidate through `widenLiteralTypes` (the function bug 0341
    already ships) BEFORE the domination test and returns the WIDENED
    candidate as the LUB, so a `literal number` candidate carries the same
    absorbing power as the `prim number` it types as (TYPE-3): `prim number`
    dominates `prim integer` under TYPE-2 and `[n, 1.5]` types `array<number>`,
    not `array<integer | number>`. The change is confined to candidate
    preparation — the union arm still unions the ORIGINAL (unwidened)
    `branches` in receiver-first order, and the object-branch gate
    (`isObjectBranch`) is untouched. Doc-comment clause 1 and one inline
    comment narrate why. `decide`/`decidePrimitive` (`⊑`) and
    `concatElementType` (`../runtime/stdlib-string.ts`) are UNTOUCHED; no
    registry row minted, no `expressions.md` edit (rule 2 already states the
    collapsed LUB).
  - `tests/b0344-commontype-literal-candidate-asymmetry.test.ts` (new, offline
    via `parseDoc`) — the §Reproduction witnesses: (A) `[n, 1.5]` types
    `array<number>`, inferred and annotated spellings agree; (B/B2) `xs[0] + 1`
    admits (the §Repro Q3 `mixed-plus-operands` refusal disappears); (C) LUB
    order-independence `[1.5, n]` ≡ `[n, 1.5]`; and the controls (D) pure-
    literal `[1.5, 2.5]` display unchanged, (E) `["a", null]` still unions
    byte-identical, (F) object-branch set still refuses `array-no-common-type`,
    (G) integer-only `[n, 2]` stays `array<integer>`.
  - `tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts` — the
    §Fix "Flip authority" set, cell G1 ONLY: the agreement assertion
    (`expect(inferred).toEqual(annotated)`) stays green — both twins move to
    `array<number>` together — while G1's pinned string flips
    `array<integer | number>` → `array<number>` and its header comment plus the
    file-level witness note (`:46`) are reworded from the union outcome to the
    collapsed outcome. No other b0341 cell moved (swept:
    `rg "array<integer \| number>"` returned only G1's three lines).
  - `tests/live/acceptance/b0344live-commontype-literal-candidate-admittee.test.ts`
    (new, live H9a) — the previously-refused admittee (`[n, 1.5]` /
    `let v = xs[0] + 1`) registers and DRIVES a real turn through the real
    `pi -p` binary (task-framed compute-from-inline-value, answers `2 + 263 =
    265`), while the object-branch offender still refuses registration
    (invoke→`Err` sentinel `REFUSED`) — proving the widening did not manufacture
    a dominator past the object-branch gate.

- **Gates (verbatim):** witness `npx vitest run
  tests/b0344-...test.ts tests/b0341-...test.ts` → 28 passed post-fix;
  neutralising the widening (identity `.map((candidate) => candidate)`) →
  5 of 28 red for the right reason (b0344 A/B/B2/C draw the union / `mixed-plus-
  operands`; b0341 G1 reads `array<integer | number>`), restored byte-exact →
  28 passed. Full suite `npm test` → 498 files / 9704 tests passed.
  `npm run typecheck` clean; `npm run lint` clean. Live (under the shared lock)
  `… vitest.live.config.ts tests/live/acceptance/b0344live-...test.ts` →
  1 passed post-fix; neutralised → the offline attribution guard reds in ~12 ms
  with zero tokens (`[theta/parse/mixed-plus-operands]` vs `[]`), restored →
  1 passed.

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`, deep) — CLEAN, no
  findings; one non-blocking residual raised (R1 below), evidence-backed
  against the diff.

- **Verification:** SOLID. Obligation A (witness reds on the neutralised
  widening, greens on restore, `type-compat.ts` byte-exact to the fix diff)
  discharged; obligation B (full suite 498/9704) discharged; obligation C
  (live end-to-end admittee registers-and-drives + object-branch refusal
  control, with a zero-token neutralise-red pair) discharged; obligation D
  (lint + typecheck clean) discharged.

- **Residuals:**
  1. **Lineage (closed here).** This report IS bug 0341's residual 1 — the
     reduction-side twin of the recording-side asymmetry 0341 fixed. 0341's
     `widenLiteralTypes` made the inferred and annotated spellings of `[n, 1.5]`
     agree at `integer | number`; this fix collapses what they agree ON to
     `number`. Credited to external PR #3 (Harald Nielsen), which landed as
     0341 in v0.309.0 and marked this reduction-side asymmetry "worth its own
     filing" — this document is that filing.
  2. **Checker-side sibling asymmetry (open — filing material, NOT fixed).**
     `computeLub` (`src/parser/functions.ts`, the fn-return LUB) and
     `leastUpperBound` (`src/parser/match-result.ts`, the match-arm LUB) — the
     0158-reconciled checker-side siblings of `commonType` — both still relate
     candidates AS-IS over `checkCompatible` with no candidate widening, so a
     `match c { 1 => n, _ => 1.5 }` arm set (`prim integer` + `literal number`)
     finds no dominating candidate for exactly the reason this fix removes in
     `commonType`, and reds with `match-arm-type-mismatch` /
     `return-no-common-type`. They are their OWN functions, not the
     `commonType` path, and §Fix names `commonType` only; per the 0341→0344
     precedent (residual → own filing) this is filing material, not scope
     creep. Evidence: the quoted code plus the shared `decide`/`decidePrimitive`
     chain (premeasure + review round 1). Not exercised by any committed
     fixture or live theta.

- **Discharge notes appended:** none — 0341 (fixed 0.309.0) already records
  this reduction-side asymmetry as its residual 1 and scopes it out in its
  §Non-goals; no sibling doc needs an amendment.

- **Pinned dispositions / non-goals:** the §Fix pinned constraints stand — `⊑`
  is unchanged (`decide`'s literal-TARGET arm stays strict for a future
  literal-value-carrying model, per 0341's standing adjudication); the
  object-branch gate (rule 3) keeps its disposition (widening never turns a
  branch into or out of an object branch); `concatElementType`'s deliberate
  mirror is out of scope and left as is; no registry row, no `expressions.md`
  edit. The `tests/fixtures/h7a/permitted-codes.json` baseline is
  byte-unchanged; the live cell is outside the H9a manifest and owes no
  permitted-codes entry.
