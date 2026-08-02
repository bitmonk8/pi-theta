# Bug 0081 — The array/ternary common-type rule is implemented as "one branch dominates", never the union LUB: both of expressions.md's own normative vectors (`[1, "a"]`, `["a", null]`) fail to load, a heterogeneous ternary silently types as its first branch, and the ternary half of the rule has no checker at all

- **Status:** open.
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
