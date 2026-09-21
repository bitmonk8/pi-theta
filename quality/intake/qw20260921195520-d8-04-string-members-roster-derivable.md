---
id: pending
title: STRING_MEMBERS hand-maintains a second nine-name roster that is exactly STRING_MEMBER_SIGNATURES.keys(), and the code's own comment names the resulting silent-drift hazard
lens: D8
status: intake
verdict: pending
locations:
  - src/runtime/stdlib-string.ts:36-46
  - src/runtime/stdlib-string.ts:52-71
sites: 2
fix_scope: localized
d8_class: reimplemented
d8_host: src/runtime/stdlib-string.ts
wave: qw20260921195520
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# STRING_MEMBERS hand-maintains a second nine-name roster that is exactly STRING_MEMBER_SIGNATURES.keys(), and the code's own comment names the resulting silent-drift hazard

## Observation
`stdlib-string.ts` exports two hand-written constants over the same nine member names: `STRING_MEMBERS` (a `ReadonlySet<string>` allow-list, :36-46) and `STRING_MEMBER_SIGNATURES` (a `ReadonlyMap<string, StdlibMemberSignature>`, :61-71). The signature table's doc comment states the two are independent hand-written copies and that keeping them equal is a reviewer discipline. The set is derivable from the map's keys in one expression.

## Evidence
The hand-written allow-list, stdlib-string.ts:36-46:
```ts
export const STRING_MEMBERS: ReadonlySet<string> = new Set([
  "length",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "startsWith",
  "endsWith",
  "includes",
  "split",
  "replace",
]);
```
The code's own drift acknowledgement, stdlib-string.ts:57-60 (verbatim):
```ts
 * allow-list predates this table) rather than one derived from the other, so
 * a future member addition that updates only one of them is a silent drift a
 * reviewer must catch by inspection, the same discipline the sibling
 * `ARRAY_MEMBERS` / `OBJECT_MEMBERS` pairs below apply.
```
Facility and feature-for-feature comparison: `Map.prototype.keys()` (ES2015, already in use — the map is consumed by `assertStdlibMemberArguments` at :90 and by `checkMethodCall` in `type-layer-checks.ts:98`). `STRING_MEMBERS`' only consumers are membership tests: `type-layer-checks.ts:219` returns it from `builtinMembers` for the `theta/parse/unknown-method` allow-list check (`grep -rn STRING_MEMBERS src/` — one external consumer). `new Set(STRING_MEMBER_SIGNATURES.keys())` yields the identical nine names in the identical insertion order, so the allow-list consumer sees the same set feature-for-feature.

## Why this is a problem
Two hand-maintained enumerations of one fact, where the code itself documents that a member addition updating only one is a silent drift caught only "by inspection" — a maintenance hazard the language already solves with a one-expression derivation. The stated reason for independence ("the allow-list predates this table") is history, not a rationale: no consumer needs the set to differ from the map's key set, and the module's own contract (:34-35, "Kept in lockstep with the `evaluateStringMember` dispatcher below") demands they never differ.

## Suggested direction (non-binding, optional)
Unproven hypothesis: declare the signature map first and define `STRING_MEMBERS = new Set(STRING_MEMBER_SIGNATURES.keys())`, deleting the nine-line literal; the same fold applies to the sibling `ARRAY_MEMBERS`/`ARRAY_MEMBER_SIGNATURES` (stdlib-array.ts:39/60) and `OBJECT_MEMBERS`/`OBJECT_MEMBER_SIGNATURES` (stdlib-object.ts:96/110) pairs, which sit outside this shard and are noted rather than filed.

## False-positive check
- Already-filed check: PTQ-1119 (dispatcher clone, resolved) and PTQ-1216 (signature substrate placement, resolved-questionable) make no claim on the roster pair; `grep -rln "STRING_MEMBERS" quality/` shows no other filing.
- Exemption check: stdlib-string.ts is band-exempt for breakdown only; no D8 exemption exists for it.
- Spec check: expressions.md §"Built-in methods and properties" pins the member names and signatures, not two independent carriers; the derivation preserves the closed set byte-for-byte.
- D2 precedent check (spec-mirroring enumeration): both rosters mirror the spec table, but the precedent protects an enumeration's existence, not a second hand-written copy of the same enumeration in the same module; the derived form keeps one spec-mirroring roster.
- Consumer semantics: verified the set's sole use is `.has`-style membership (type-layer-checks.ts:212-227); no consumer depends on the set being a distinct object identity or a different order.

## Triage
verdict: questionable — accounting verified; the simpler shape is a design decision for a human ruling: both excerpts byte-exact at stdlib-string.ts:36-46 and :52-60, the nine STRING_MEMBERS names equal the nine STRING_MEMBER_SIGNATURES keys in the same order, the "hand-written and independent (the allow-list predates this table)" comment was introduced by 52712fb3 (bug-0315) and states history not a consumer need, STRING_MEMBERS' sole external consumer re-greps to type-layer-checks.ts:70/219 (builtinMembers, used only via .has at :236 for theta/parse/unknown-method), so new Set(STRING_MEMBER_SIGNATURES.keys()) covers the one need feature-for-feature; no quality/exemptions.json row for stdlib-string.ts; the spec pins the member names not two carriers, so no challenges_spec is needed; PTQ-0024/1119/1216/1217 are distinct root causes (detached docs, dispatcher belt clone, substrate/concatElementType placement) and no other filing names the roster pair (triage: claude-fable-5-1)
