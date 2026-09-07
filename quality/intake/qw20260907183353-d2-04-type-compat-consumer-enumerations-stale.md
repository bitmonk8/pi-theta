---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: type-compat.ts's consumer enumerations are stale — the header counts "three per-site checkers" where six exist, widenLiteralTypes names a single caller where six call sites exist, and resolveNamedRef's reader list omits the stdlib-arg-diagnostics reader
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-compat.ts:24-28
  - src/parser/type-compat.ts:418-421
  - src/parser/type-compat.ts:162-171
sites: 3
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# type-compat.ts's consumer enumerations are stale — the header counts "three per-site checkers" where six exist, widenLiteralTypes names a single caller where six call sites exist, and resolveNamedRef's reader list omits the stdlib-arg-diagnostics reader

## Observation
Three doc comments in type-compat.ts enumerate who consumes the engine's
pieces, and each enumeration was frozen at an earlier consumer set. The header
says "the three per-site checkers" report the TYPE-9 diagnostics; the module
exports six. `widenLiteralTypes`'s doc says "The caller is the type layer's
unannotated-`let` arm"; six call expressions in five modules (plus this
module's own `commonType`) call it. `resolveNamedRef`'s doc enumerates "every
resolution site" that reads through it and the list omits the
stdlib-arg-diagnostics reader added later.

## Evidence
src/parser/type-compat.ts:24-28 — the header count:
```
// V2b implements the decision procedure: `checkCompatible` decides the
// directed relation `T₁ ⊑ T₂` over the `CompatType` model (TYPE-1…TYPE-11) and
// the three per-site checkers report the parse-time mismatch diagnostics
// (TYPE-9).
```
Current per-site checkers exported by this module: `checkLetRhsCompat` :544,
`checkFnArgCompat` :593, `checkObjectFieldCompat` :641, `checkCommonType`
:696, `checkParamsDefaultCompat` :936, `checkReassignRhsCompat` :992 — six
(`grep -n "^export function check" src/parser/type-compat.ts`).

src/parser/type-compat.ts:418-421 — `widenLiteralTypes`'s caller claim:
```
 * The caller is the type layer's unannotated-`let` arm, which records what an
 * initialiser EXPRESSION types as. Recording the unwidened literal makes the
 * binding a target no primitive-typed value satisfies: `decide`'s literal
 * target arm relates a literal target only to a literal source, so `let mut a
```
Current call sites (`grep -rn "widenLiteralTypes(" src`): the named arm
(type-layer-checks.ts:1653) plus functions.ts:363, match-result.ts:275 and
:281, static-type-inference.ts:640 and :646, and this module's own
`commonType` at type-compat.ts:820 — seven call expressions across five files.

src/parser/type-compat.ts:162-171 — `resolveNamedRef`'s reader enumeration:
```
 * This is the ONE seam that must see the marker: every resolution site whose
 * argument is a `named` `CompatType`'s OWN name (as opposed to a bare
 * annotation-spelled string, which `resolveNamed` still serves directly —
 * `declaredFieldsOf`, ./type-layer-checks.ts) reads through here instead, so a
 * marked enum-variant reference stays unresolvable everywhere the unmarked
 * shadowing schema would otherwise answer: `unfoldAlias` and `decide`'s
 * TYPE-7 / TYPE-8 / TYPE-10 arms below, `classifyIndexReceiver` and
 * `isObjectBranch` in this module, and `classifyOperand` / `classifyReceiver`
 * / `isResultGenericType` in ./type-layer-checks.ts.
```
Current readers (`grep -rn "resolveNamedRef" src`): all listed sites exist and
read it (type-layer-checks.ts:185, :228, :3583; type-compat.ts:236, :290,
:317, :351, :355, :365, :522, :859) — and additionally
src/parser/stdlib-arg-diagnostics.ts:173:
```ts
      if (unfolded.kind === "named" && resolveNamedRef(env, unfolded) === undefined) {
        continue;
      }
```
a resolution site whose argument is a `named` `CompatType`'s own reference,
absent from the "everywhere" list. (`decide` also reads it in a fourth arm at
:365, beyond the three arms the list names.)

## Why this is a problem
Historical narration: each enumeration presents itself as exhaustive ("the
three per-site checkers", "The caller is", "every resolution site ...:") and
is falsified by current code — the checker set doubled
(`checkObjectFieldCompat`, `checkParamsDefaultCompat`,
`checkReassignRhsCompat` landed after the header sentence),
`widenLiteralTypes` gained the LUB-side callers of bugs 0344/0346 (its own
`commonType` call at :820 cites bug 0344), and stdlib-arg-diagnostics joined
the marker-honouring readers. The `resolveNamedRef` list is load-bearing for
bug 0191's invariant (which sites must see the `enumRef` marker), so an
incomplete list understates where the marker matters; the caller-count
staleness is the same decay class as the already-accepted-shape findings
qw20260907130901-d2-04-interpolation-source-stale-call-site-count and
qw20260907130901-d2-06-ledger-errnote-call-site-count-stale, neither of which
cites this file.

## Suggested direction (non-binding, optional)
Recount or de-enumerate: name the checker family and reader set by role
rather than by number/closed list, or update the three enumerations to the
current sets in one pass.

## False-positive check
- Checker count: `grep -n "^export function check" src/parser/type-compat.ts`
  → six; all six have production callers (type-layer-checks.ts, params.ts,
  invoke-static-checks.ts per repo-wide grep), so none is a candidate for
  removal that would restore the count.
- `widenLiteralTypes` callers verified with context: functions.ts:363 and
  match-result.ts:275/:281 and static-type-inference.ts:640/:646 are LUB
  candidate widening; type-layer-checks.ts:1653 is the unannotated-`let` arm
  the doc names; type-compat.ts:820 is `commonType`'s domination-test
  widening.
- `resolveNamedRef` reader list: every listed reader confirmed real —
  including `isResultGenericType`, which exists as a private method
  (type-layer-checks.ts:3580) reading `resolveNamedRef` at :3583 — so only
  the OMISSION (stdlib-arg-diagnostics.ts:173) is claimed, not any phantom
  entry.
- Duplicate check: qw20260907183353-d2-02-check-integer-narrowing-consumer-
  claim-stale concerns literals.ts's header claim about this module and cites
  type-compat.ts only as an emitter; no filed finding concerns these three
  enumerations. The stub-narration finding filed this wave
  (qw20260907183353-d2-01-type-seam-stub-narration-stale) covers the V2b-T
  stub sentences, a different root cause (false stub claims vs drifted
  consumer counts), with no shared location.

## Triage
