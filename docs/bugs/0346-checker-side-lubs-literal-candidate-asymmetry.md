# Bug 0346 — the checker-side LUBs `leastUpperBound` (`match-result.ts:255`) and `computeLub` (`functions.ts:348`) carry the literal-candidate asymmetry bug 0344 removed from `commonType`: a `match` arm set or an inferred-return set mixing an `integer`-typed binding with a fractional literal — `{prim integer, literal number}` — finds no dominating member and refuses `theta/parse/match-arm-type-mismatch` / `theta/parse/return-no-common-type`, where the reconciled member LUB collapses the same pair to `number`

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 because a spurious refusal reproduces
  through a real program at both surfaces: `match c { 1 => n, _ => 1.5 }` over
  an `integer`-typed `n` draws `theta/parse/match-arm-type-mismatch`, and the
  inferred-return twin draws `theta/parse/return-no-common-type`. Both are
  error-severity `theta/parse/*` codes, so `hasLoadParseError`
  (`production-composition.ts`) denies registration of a program whose arms /
  return operands share the common upper bound `number` — a program the
  member-LUB contract (`type-system.md:133`) admits. It is not S1: the fn-return
  surface has an author-side workaround (an explicit `: number` return
  annotation bypasses `computeLub`, row R4), and no admitted program observes a
  wrong VALUE — the refusal is at the registration gate. D2 because the fix
  mirrors bug 0344's one-site candidate-widening at two sites, and each site
  carries a scan the widening must leave intact (`leastUpperBound`'s
  least-candidate loop and sink arm; `computeLub`'s `undefined` contract that
  `resolveReturnType` maps to the diagnostic).
- **Kind:** defect against the 0158 reconciliation contract.
  `docs/reference/type-system.md:133-141` states it directly: "`match` arms and
  inferred theta/`fn` return types reduce under a narrower LUB: the chosen
  common type must be a member of the contributing types — one that every other
  contribution is `⊑` — never a computed union, so a set with no dominating
  member has no common type at all". `{integer, number}` HAS a dominating
  member: `1.5` types as `number` in expression position
  ([TYPE-3](../spec_topics/type-system.md#type-3)), `integer ⊑ number`
  ([TYPE-2](../spec_topics/type-system.md#type-2)), so `number` is a member every
  contribution is `⊑`. The set is not memberless; the refusal reads the pair as
  memberless because the two checker LUBs never widen the literal candidate to
  the primitive it types as before the domination test.
- **Affected** (verified at `ada1e419`, v0.319.0):
  - `src/parser/match-result.ts:255-278` — `leastUpperBound`, the match-arm LUB
    behind `checkMatchArmTypes`. `covers` (`:259-263`) tests every arm `⊑` a
    candidate AS-IS; `armTypes.filter(covers)` (`:264`) restricts the candidate
    set to arm-type members with no literal widening; `candidates.length === 0`
    (`:265-267`) returns `undefined`. For `{prim integer, literal number}`
    neither member covers: `covers(prim integer)` fails because
    `literal number ⊑ prim integer` is `integer-narrowing`; `covers(literal
    number)` fails because `prim integer ⊑ literal number` is `incompatible`.
    `candidates` is empty and the LUB is `undefined`.
  - `src/parser/match-result.ts:228-231` — `checkMatchArmTypes` maps
    `leastUpperBound(...) === undefined` to `mismatchDiagnostic(site)`
    (`theta/parse/match-arm-type-mismatch`).
  - `src/parser/functions.ts:348-358` — `computeLub`, the inferred-return LUB
    behind `resolveReturnType`. `types.find((candidate) => types.every(...))`
    (`:352-357`) relates each contribution against each candidate AS-IS; the
    same `{prim integer, literal number}` pair finds no dominating member and
    the function returns `undefined`.
  - `src/parser/functions.ts:309-325` — `resolveReturnType` maps
    `computeLub(...) === undefined` to `theta/parse/return-no-common-type`
    (`:311-325`). The contributions reach `computeLub` through
    `operandType` (`:308`), which projects each contribution to its type; an
    `integer`-typed parameter operand enters as `{prim integer}`.
  - `src/parser/type-compat.ts:381-388` — `decide`'s literal-TARGET arm returns
    `"incompatible"` for a non-`literal` source. This is the arm that refuses
    `prim integer ⊑ literal number` and denies the literal candidate its
    dominator. `⊑` is not the defect; this arm is correct and stays strict (bug
    0341 residual 2, bug 0344 §Fix).
  - `src/parser/type-compat.ts:370-378` — `decide`'s primitive-TARGET arm,
    which decides `literal number ⊑ prim integer` through `decidePrimitive`
    (`:397-410`) to `"integer-narrowing"` (`:405`), so the `prim integer`
    candidate is not a dominator in the other direction either.
  - `src/parser/type-compat.ts:429-452` — `widenLiteralTypes`, the function bug
    0341 ships and bug 0344 reuses; the fix's candidate-preparation helper at
    both checker sites.
  - `src/parser/type-compat.ts:803-834` — `commonType`, the array/ternary LUB,
    whose candidate-widening (`.map((candidate) => widenLiteralTypes(candidate))`
    at `:820`) bug 0344 landed. The two checker LUBs are its 0158-reconciled
    siblings and did not receive the same treatment.
- **Observed at:** 0.319.0 (`ada1e419`), offline, through
  `tests/helpers/e2e-s1.ts`'s `parseDoc` (the shipped `lexTheta` +
  `parseThetaDocument`). Not exercised by any committed `.theta`/`.thetalib`
  fixture or live theta at this HEAD (see §Provenance).

## Summary

Bug 0344 removed a literal-candidate asymmetry from `commonType`
(`type-compat.ts`), the array/ternary LUB: it now widens each candidate to the
primitive it types as before the domination test, so `[n, 1.5]` over an
`integer`-typed `n` reduces to `array<number>` rather than
`array<integer | number>`. The two checker-side LUBs bug 0158 reconciled with
`commonType` — `leastUpperBound` (`match-result.ts:255`, the match-arm LUB) and
`computeLub` (`functions.ts:348`, the inferred-return LUB) — carry the same
asymmetry, unremoved.

Both search for a MEMBER of their input set that every member is `⊑`, and both
relate candidates AS-IS. For the arm / return set `{prim integer, literal
number}` neither member dominates: `literal number ⊑ prim integer` is
`integer-narrowing`, and `prim integer ⊑ literal number` is `incompatible`
(`decide`'s literal-TARGET arm, `type-compat.ts:381-388`). The candidate set is
empty, the LUB is `undefined`, and the callers emit a diagnostic —
`theta/parse/match-arm-type-mismatch` at the `match`,
`theta/parse/return-no-common-type` at the inferred return. Each is an
error-severity `theta/parse/*` code, so `hasLoadParseError` denies registration.

The refused set has a dominating member. `1.5` types as `number` in expression
position (TYPE-3); `number` is a member every contribution is `⊑` under TYPE-2.
The member-LUB contract (`type-system.md:133-141`) says such a set reduces to
that member. The defect is that the two checker LUBs test domination against
the literal candidate's own type — which carries less absorbing power than the
primitive it types as — rather than against its expression-position primitive.
This is the information loss bug 0344 removed at `commonType`, present at the
two sibling sites.

The asymmetry is confined to the mixed prim-integer + literal-number pairing.
Two `prim` contributions collapse (`{integer, number}` → `number`, a member
dominates under TYPE-2). Two `literal` contributions collapse (`{literal
integer, literal number}` → `number`, `decidePrimitive` relates them). Only a
`prim` on one side and a `literal` on the other fails.

## Reproduction

Bodies under `---\ndescription: b0346\nmode: prompt\n---\n`, measured at
`ada1e419` through `parseDoc`. Match-arm rows exercise `leastUpperBound`;
inferred-return rows exercise `computeLub`. The inferred-return set requires the
`integer` contribution to be a PARAMETER (in the return-inference `TypeEnv`): a
local `let a: integer = 1` reads as `unknown` in that env, which `computeLub`
treats as non-blocking, so the pair collapses and the row does not reproduce —
the parameter is what places `{prim integer}` in the contribution set.

`leastUpperBound` (match arms):

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| M1 | `let n: integer = 1` / `match 1 { 1 => n, _ => 1.5 }` | `error theta/parse/match-arm-type-mismatch :: match arm body type does not match the common type of the other arms` | `[]` — the arms reduce to `number` |
| M2 | `let n: integer = 1` / `let m: number = 1.5` / `match 1 { 1 => n, _ => m }` | `[]` | unchanged — two `prim` candidates collapse |
| M3 | `match 1 { 1 => 1, _ => 1.5 }` | `[]` | unchanged — two `literal` candidates collapse |
| M4 | `let n: integer = 1` / `match 1 { 1 => 1.5, _ => n }` | `error theta/parse/match-arm-type-mismatch :: …` | `[]` — order-independent |
| M5 | `let n: integer = 1` / `let r = match 1 { 1 => n, _ => 1.5 }` / `r + 1` | `error theta/parse/match-arm-type-mismatch :: …` | `[]` — registration denied before the read |

`computeLub` (inferred returns):

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| R1 | `fn g(a: integer) {` / `  if true { return a }` / `  1.5` / `}` / `g(1)` | `error theta/parse/return-no-common-type :: return operands have no common type; annotate the function return type or reconcile the operands` | `[]` — contributions reduce to `number` |
| R2 | `fn g(a: integer, b: number) {` / `  if true { return a }` / `  b` / `}` / `g(1, 1.5)` | `[]` | unchanged — two `prim` contributions collapse |
| R3 | `fn g(a: integer) {` / `  if false { return 1.5 }` / `  a` / `}` / `g(1)` | `error theta/parse/return-no-common-type :: …` | `[]` — order-independent |
| R4 | `fn g(a: integer): number {` / `  if true { return a }` / `  1.5` / `}` / `g(1)` | `[]` | unchanged — an explicit annotation bypasses `computeLub` |

M2/M3 and R2 isolate the cause: the diagnostic appears only when one numeric
contribution is a `prim` and the other a `literal`. M4/R3 show the pairing is
order-independent. R4 is the annotated-return counterfactual — the `computeLub`
path is not taken, so no refusal.

## Expected behaviour

`docs/reference/type-system.md:133-141` — the member-LUB contract bug 0158
reconciled: "`match` arms and inferred theta/`fn` return types reduce under a
narrower LUB: the chosen common type must be a member of the contributing types
— one that every other contribution is `⊑` — never a computed union, so a set
with no dominating member has no common type at all and draws
`theta/parse/match-arm-type-mismatch` or … `theta/parse/return-no-common-type`,
where an array literal or a ternary would union under rule 2". The contract is
member-restricted, not union-forming; that scope is bug 0158's settled route and
this defect does not reopen it.

`{integer, number}` is not a memberless set. `1.5` types as `number` in
expression position (TYPE-3 — "a literal types as its `typesAs` primitive in
expression position", `type-compat.ts:369`), and `integer ⊑ number` (TYPE-2), so
`number` is a member every contribution is `⊑`. The member LUB is `number`, the
`match` resolves to `number`, and the inferred return type is `number`; neither
refuses.

`docs/spec_topics/functions.md:26` (FN-3) states the return side in the same
terms — "the `match`-arm common-upper-bound discipline … where the chosen common
type is a member of the contributing types that every other contribution is
`⊑` … not the array-literal/ternary rule-2 discipline, which unions" — and
`docs/spec_topics/expressions.md:184` states the arm side: "values whose types
share a common upper bound … absent a sink in scope on the `match` expression
itself, the chosen common type is one of the arm types — a member every other
arm is `⊑`". Under both, the member whose absorbing power decides the set is the
contribution's expression-position type, so the `1.5` arm's is `number`.

Three properties hold afterwards:

1. **The three LUBs agree on a set with a dominating member.** For `{integer,
   number}`, `commonType` (clause 1), `leastUpperBound`, and `computeLub` all
   return `number`. This is the 0158 reconciliation invariant read as an oracle
   (§Fix).
2. **The member-restricted discipline is preserved.** A genuinely memberless set
   (`{integer, string}`, or an object-branch set) still refuses at both checker
   sites. No union clause is added; bug 0158's route-B scope is untouched.
3. **The dominating and two-literal cases do not move.** M2, M3, R2, R4 are
   unchanged.

## Actual behaviour / root cause

Both checker LUBs run a member search that relates candidates as-is.

`leastUpperBound` (`match-result.ts:255-278`):

```ts
const covers = (candidate: CompatType): boolean =>
  armTypes.every((arm) => {
    const r = checkCompatible(arm, candidate, env);
    return r === "compatible" || r === "unknown";
  });
const candidates = armTypes.filter(covers);
if (candidates.length === 0) {
  return undefined;
}
```

`computeLub` (`functions.ts:348-358`):

```ts
return types.find((candidate) =>
  types.every((t) => {
    const r = checkCompatible(t, candidate, env);
    return r === "compatible" || r === "unknown";
  }),
);
```

For the input `[{prim integer}, {literal number}]`:

- Candidate `{literal number}`: `checkCompatible({prim integer}, {literal
  number})` hits `decide`'s literal-TARGET arm (`type-compat.ts:381-388`), whose
  `sub.kind !== "literal"` path returns `"incompatible"`. The literal candidate
  does not cover the set.
- Candidate `{prim integer}`: `checkCompatible({literal number}, {prim
  integer})` hits the primitive-TARGET arm (`:370-378`),
  `decidePrimitive("number", "integer")` → `"integer-narrowing"` (`:397-410`,
  `:405`). The primitive candidate does not cover the set.

No candidate covers. `leastUpperBound` returns `undefined` and
`checkMatchArmTypes` emits `theta/parse/match-arm-type-mismatch`
(`match-result.ts:228-231`); `computeLub` returns `undefined` and
`resolveReturnType` emits `theta/parse/return-no-common-type`
(`functions.ts:309-325`).

The literal-TARGET arm is correct: TYPE-3 is one-way, a primitive is not `⊑` a
literal, and bug 0341 keeps this arm strict for the day an annotation lowers to a
literal type. The defect is that the two checker LUBs ask the relation to decide
domination against the literal candidate's own type rather than against the
primitive it types as. `commonType` had the identical shape until bug 0344
mapped each candidate through `widenLiteralTypes` before the domination test
(`type-compat.ts:820`); the two sibling LUBs test the raw candidate, so a
`literal number` candidate carries less absorbing power than the `prim number`
it types as, and a member that exists is not found.

## Why it matters

The refused program mixes a counter or index with a fractional constant in a
`match` arm or an inferred return — `match c { 1 => n, _ => 0.5 }`,
`fn f(i: integer) { if c { return i } 1.5 }` — and the arms / operands share the
common upper bound `number`. Both surfaces emit an error-severity
`theta/parse/*` code, so `hasLoadParseError` denies registration of a program
the member-LUB contract admits. The message names a mismatch the author cannot
act on: the arms DO share a common upper bound, and the diagnostic says they do
not. The array-literal spelling of the same reconciliation
(`let xs = [n, 1.5]`) loads and types `array<number>` after bug 0344, so two
constructs the spec binds to one discipline disagree.

The divergence is also latent past the diagnostic. `checkMatchArmTypes` and
`resolveReturnType` return `lub: undefined` / `kind: "inference-no-common-type"`
where a `number` LUB exists; any consumer that reads the resolved type on such a
node inherits an absence the contract does not license.

## Fix

Widen each candidate to the primitive it types as before the domination test at
both checker LUBs — the change bug 0344 landed in `commonType`, applied to
`leastUpperBound` (`match-result.ts:255`) and `computeLub` (`functions.ts:348`).
A candidate compared as its expression-position primitive (`{literal number}`
as `{prim number}`, TYPE-3) covers the set when the primitive it types as
covers it, so `{prim integer, literal number}` reduces to `number`: `prim
number` dominates `prim integer` under TYPE-2. Reuse `widenLiteralTypes`
(`type-compat.ts:429`) to derive each candidate's expression-position type for
the domination / cover test, and return the widened member as the LUB, so the
resolved type is a primitive rather than a literal — the same shape as bug
0344's `commonType` edit.

Constraints, pinned:

- **`⊑` does not change.** `decide`'s literal-TARGET arm
  (`type-compat.ts:381-388`) stays strict; TYPE-3's one-way direction is
  untouched. The change is confined to how each LUB prepares its candidates for
  the member search — the reduction, not the relation. This preserves bug 0341's
  decide-literal-arm adjudication.
- **The member-restricted discipline is unchanged.** No union clause is added at
  either site. Bug 0158's route B scoped the union to array/ternary and made
  `match` / inferred-return LUBs member-only; that disposition stands. A set
  with no dominating member under the WIDENED comparison — `{integer, string}`,
  or an object-branch set with no dominator — still returns `undefined` and
  still refuses. Neither caller adopts a fallback; the `undefined` that
  `checkMatchArmTypes` and `resolveReturnType` map to their diagnostics survives
  for the genuinely memberless case.
- **`leastUpperBound`'s least-candidate scan and sink arm are preserved.** The
  scan that selects the least of several covering candidates
  (`match-result.ts:268-278`) and `checkMatchArmTypes`'s sink arm (`:215-224`,
  which relates each arm to an in-scope sink) keep their current behaviour;
  widening changes which candidates cover, not the selection among covering
  candidates or the sink path.
- **`decide` / `decidePrimitive` and `commonType` are not edited.** The fix
  touches candidate preparation inside the two checker LUBs; `commonType`
  already widens (bug 0344) and is left as is.

**Oracle.** The 0158 reconciliation invariant is the post-fix oracle: on a
contribution set that has a dominating member under the expression-position
reading, `commonType`, `leastUpperBound`, and `computeLub` return the same
primitive. Post-fix, `{integer, number}` → `number` at all three surfaces. The
member-vs-union divergence on a memberless set (`commonType` unions where the
two checker LUBs refuse) is bug 0158's settled disposition and is unchanged.

**Flip authority.** No committed cell pins the union or refusal outcome on these
two surfaces for the asymmetric pair. Sweeps at `ada1e419`: `rg "integer \|
number|number \| integer" tests/` returns only `commonType`-surface cells
(`tests/b0344-...test.ts`, `tests/live/acceptance/b0344live-...test.ts`) and one
unrelated annotation-union hit
(`tests/generic-argument-shredded-group-refusal.test.ts:903`) — the two checker
LUBs never produce a union, so none of these pins them. `rg
"match-arm-type-mismatch|return-no-common-type" tests/` returns cells that pin
those codes on genuinely memberless sets (`{integer, string}` in
`tests/match-fn-return-lub-dominating-discipline.test.ts`, bug 0158's witness)
or on the two-literal / two-prim collapse controls (`match 1 { 1 => 1, _ => 2.5
}` at `:438`; `[INTEGER, NUMBER]` at `:680-686`) — none pins the mixed
prim-integer + literal-number refusal this fix removes. The fix flips no
committed cell; it is witnessed by new cells (the §Reproduction rows) plus a
destructive proof that neutralising each widening reds them.

**Spec:** no registry edit is owed — no code is minted, and `type-system.md:133`,
`functions.md:26`, and `expressions.md:184` already state the member LUB the fix
satisfies. They are not edited.

## Related

- [0344](./0344-commontype-literal-candidate-asymmetry-yields-union-not-primitive.md)
  (fixed 0.319.0) — the same asymmetry at `commonType`, the array/ternary LUB.
  Its fix mapped each candidate through `widenLiteralTypes` before the
  domination test; this report applies that shape to the two checker-side
  siblings. Bug 0344's §Fix residual 2 names this filing as the next in the
  lineage.
- [0341](./0341-inferred-literal-binding-refuses-primitive-rhs.md) (fixed
  0.309.0) — the recording-side origin. Its `widenLiteralTypes` is the function
  both bug 0344 and this fix reuse, and its decide-literal-arm adjudication
  (residual 2) is the constraint that keeps `⊑` strict here.
- [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md) (fixed
  0.181.0) — the report that reconciled `leastUpperBound` and `computeLub` with
  `commonType` and, via route B, scoped the union clause to array/ternary while
  making the two checker LUBs member-restricted. This report does not reopen
  that scope; it corrects the two checker LUBs so a set WITH a dominating member
  is recognized as having one. The member-LUB sentence 0158 wrote
  (`type-system.md:133-141`) is the oracle §Fix names.
- [0081](./0081-array-ternary-common-type-never-unions.md) (fixed 0.83.0) — gave
  `commonType` its union clause; the shared ancestry of all three LUBs. Not a
  dependency.

No fix-ordering dependency: this report edits `match-result.ts` and
`functions.ts` only; bug 0344 (fixed) already shipped the `commonType` edit this
mirrors. A future fix landing in either file rebases against this one's line
positions, per the citation-drift convention.

## Provenance

Filed from bug 0344's §Residual 2, which records this checker-side sibling
asymmetry as the next filing in the 0341 → 0344 lineage.

Ownership checked: `rg` over `docs/bugs/` for `computeLub` / `leastUpperBound`
returns 0081, 0123, 0145, 0155, 0158, 0195, and 0344 — all `fixed`. 0158 is the
report that owned these two surfaces and is `fixed (0.181.0)`; no open bug claims
`computeLub` or `leastUpperBound`.

Measured at `ada1e419` (0.319.0) offline through `parseDoc` (the shipped
`lexTheta` + `parseThetaDocument`), with two scratch vitest probes exercising the
real parse/type-check pipeline over `.theta` source — not direct unit calls to
the LUB functions. The match-arm surface (`leastUpperBound`) reproduces: M1 and
M4 draw `theta/parse/match-arm-type-mismatch`; M5 draws the same code and
registration is denied before `r + 1` is read; M2 (two `prim`), M3 (two
`literal`) report `[]`. The inferred-return surface (`computeLub`) reproduces
through a PARAMETER-typed contribution: R1 and R3 draw
`theta/parse/return-no-common-type`; R2 (two `prim`) and R4 (annotated return,
`computeLub` bypassed) report `[]`. A local-binding integer contribution reads as
`unknown` in the return-inference env and does not reproduce, so the
reproduction is scoped to the parameter case at the fn-return surface; the
match-arm surface reproduces from a plain `let n: integer = 1` binding. Both
surfaces reproduce through a real program, so the filing covers both. Scratch
probes deleted; a case-insensitive sweep for the probe name (`b0346scratch`)
returned no tracked residue, and `git status --short` shows no path matching
`scratch`.
