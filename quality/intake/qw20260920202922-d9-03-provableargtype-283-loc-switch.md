---
id: pending
title: TypeLayerWalk.provableArgType is a 283-LOC exhaustive Expr switch whose binary, ident, and member arms each carry 40-60-line inline soundness blocks
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:2868-3150
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts#TypeLayerWalk.provableArgType
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# TypeLayerWalk.provableArgType is a 283-LOC exhaustive Expr switch whose binary, ident, and member arms each carry 40-60-line inline soundness blocks

## Observation
`provableArgType` (src/parser/type-layer-checks.ts:2868-3150, 283 LOC, strong band) decides per expression kind whether a static-type read is an exact proof of the runtime value's type or must be withheld. It is, by its own doc comment, an "Exhaustive `switch` over the `Expr` union with no `default` arm, so a kind added to the union without an arm here is a compile error." Three arms dominate: `binary` (2919-2977, 59 LOC), `ident` (2992-3033, 42 LOC), `member` (3049-3102, 54 LOC).

## Evidence
Step inventory (arm boundaries from `grep -n 'case "'` over 2872-3150):

| phase (arm) | lines | LOC | locals read/written |
|---|---|---|---|
| literals number/string/bool/null | 2873-2878 | 6 | — |
| ternary / match / array reductions | 2879-2918 | 40 | reduced; reads this.pass via typeOf, matchArmScope |
| binary: unary-minus numeric proof, boolean-result shortcut, arithmetic reduction exactness | 2919-2977 | 59 | operand, reduced; reads classifyOperand, this.env |
| try / block propagation | 2978-2991 | 14 | — |
| ident: recorded-binding read + laundered-binding identity check | 2992-3033 | 42 | recorded; reads this.unprovableBindings |
| method-call withhold | 3034-3048 | 15 | — |
| member: receiver proof obligation + declared-field-type read | 3049-3102 | 54 | reads this.pass.declaredFieldType |
| call / invoke withhold | 3103-3127 | 25 | — |
| query / object / result-ctor / par-for nominal reads; index target proof | 3128-3150 | 23 | — |

Executable statements per arm are small (the member arm is 3 executable lines behind ~50 lines of rationale prose); the scanner's authoritative LOC, which counts the prose, is what places the host at 283.

## Why this is a problem
Strong band: presumption of breakdown absent a strong concrete reason. Reasons considered and defeated: closed-enumeration dispatch — concrete (the arms mirror the `Expr` union, and the no-default exhaustiveness is compile-checked), but the reason requires each arm short and the longest arms are 59/54/42 LOC, at or near the 60-LOC zone threshold themselves; and in the strong band a concrete reason alone does not suffice — no spec-cited critical section (per-arm order is not observable; each arm returns independently), no measured cost a seam would re-introduce, no reverted prior split in `git log`, no quality/exemptions.json entry. Single algorithm with shared local state — defeated: every arm's locals are arm-private; shared state (`env`, `pass`, `unprovableBindings`) rides on `this` and is available to a private per-arm method unchanged.

## Suggested direction (non-binding, optional)
All hypotheses unproven, and note the dominant content is per-arm soundness rationale rather than code — a split moves prose more than logic, which the human may weigh against any seam. Seam A: the binary arm (2919-2977) -> private `provableBinaryType` (hypothesis) — 0 exports moved, exhaustive switch retained. Seam B: the member + ident arms (3049-3102, 2992-3033) -> private `provableMemberType` / `provableIdentType` (hypothesis), same shape. None identified yet for a cross-module seam.

## False-positive check
Band check: 283 LOC ≥ 200 (strong) per the authoritative map. Reasons-considered list recorded above with the defeating evidence per class. Exemptions check: no D9 key for this host. Generated-code check: hand-written (bug 0050/0072/0136/0156/0199 citations in-body). Spec-mirror check: the arm set mirrors the code-defined `Expr` union rather than a spec table; recorded and defeated on arm length plus the strong-band requirement. Duplicate check: qw20260920183643-d4-03-provable-arg-types-expr-switch-parallel files a D4 parallel-structure claim against this switch; this finding is the size/breakdown accounting, a different class with a different host key.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 2868-3150 / 283 LOC / strong; arm boundaries match `case` lines exactly (binary 2919-2977, ident 2992-3033, member 3049-3102), locals are arm-private, no exemptions.json key, no reverted split in `git log -S provableArgType`, arm set mirrors the code `Expr` union not a spec table, sibling D4 intake cites different files; target shape (and whether a prose-dominated 283 LOC merits any seam — member arm is one 3-line return behind ~50 comment lines) needs a human ruling (triage: claude-fable-5-1)
