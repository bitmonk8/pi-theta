---
id: pending
title: The stdlib member allow-list is derived from the signature table in stdlib-string.ts but hand-written beside it in stdlib-array.ts and stdlib-object.ts, whose comments still cite the string module's retired hand-pairing as the shared discipline
lens: D1
status: intake
verdict: pending
locations:
  - src/runtime/stdlib-string.ts:29-58
  - src/runtime/stdlib-array.ts:33-68
  - src/runtime/stdlib-object.ts:89-113
  - src/parser/type-layer-checks.ts:217-226
sites: 4
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The stdlib member allow-list is derived from the signature table in stdlib-string.ts but hand-written beside it in stdlib-array.ts and stdlib-object.ts, whose comments still cite the string module's retired hand-pairing as the shared discipline

## Observation
Each of the three stdlib surface modules exports a pair: a `*_MEMBER_SIGNATURES` map (arity/kind table read by `checkMethodCall` and the runtime belt) and a `*_MEMBERS` set (the `theta/parse/unknown-method` allow-list). One consumer, `builtinMembers` in `type-layer-checks.ts:217-226`, selects among the three sets by receiver kind, so the three modules owe each other the same lockstep guarantee. `stdlib-string.ts` keeps the two in lockstep by construction (`STRING_MEMBERS = new Set(STRING_MEMBER_SIGNATURES.keys())`, since commit `d41231e7`, the PTQ-1239 fix). `stdlib-array.ts` and `stdlib-object.ts` keep them in lockstep by a hand-written parallel literal, and each documents that choice as "the same way `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`" — a pairing mechanism that no longer exists in the string module.

## Evidence

Way A — derived roster, src/runtime/stdlib-string.ts:35-36 and :52-58 (re-read this session):
```ts
 * reads it for the runtime belt. `STRING_MEMBERS` below is derived from this
 * table's keys, so the two can never drift. Kept in lockstep with the
```
```ts
/**
 * The `string` standard-library member surface (expressions.md §"Built-in
 * methods and properties"): the allow-list the `type`-phase
 * `theta/parse/unknown-method` check consumes. Derived from
 * `STRING_MEMBER_SIGNATURES` above so the two rosters can never drift.
 */
export const STRING_MEMBERS: ReadonlySet<string> = new Set(STRING_MEMBER_SIGNATURES.keys());
```

Way B — hand-written parallel roster, src/runtime/stdlib-array.ts:39-46 and :57-58:
```ts
export const ARRAY_MEMBERS: ReadonlySet<string> = new Set([
  "length",
  "join",
  "includes",
  "indexOf",
  "slice",
  "concat",
]);
```
```ts
 * `end` argument. Hand-written, kept paired with `ARRAY_MEMBERS` above the
 * same way `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`.
```

Way B — second site, src/runtime/stdlib-object.ts:95 and :105-107:
```ts
export const OBJECT_MEMBERS: ReadonlySet<string> = new Set(["keys", "values", "has"]);
```
```ts
 * `evaluateObjectMember` below reads it for the runtime belt. Hand-written,
 * kept paired with `OBJECT_MEMBERS` above the same way
 * `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`.
```

The one consumer that treats the three sets interchangeably, src/parser/type-layer-checks.ts:217-226:
```ts
function builtinMembers(kind: BuiltinReceiver): ReadonlySet<string> {
  switch (kind) {
    case "string":
      return STRING_MEMBERS;
    case "array":
      return ARRAY_MEMBERS;
    case "object":
      return OBJECT_MEMBERS;
    default:
      return EMPTY_MEMBERS;
```

Consumer count, both ways. Command: `grep -rn "\bSTRING_MEMBERS\b\|\bARRAY_MEMBERS\b\|\bOBJECT_MEMBERS\b" src/ tests/ extensions/ tools/ --include=*.ts --include=*.mjs` — 14 hits; first 10:
```
src/parser/type-layer-checks.ts:71:  STRING_MEMBERS,
src/parser/type-layer-checks.ts:75:import { ARRAY_MEMBERS, ARRAY_MEMBER_SIGNATURES } from "../runtime/stdlib-array";
src/parser/type-layer-checks.ts:76:import { OBJECT_MEMBERS, OBJECT_MEMBER_SIGNATURES } from "../runtime/stdlib-object";
src/parser/type-layer-checks.ts:220:      return STRING_MEMBERS;
src/parser/type-layer-checks.ts:222:      return ARRAY_MEMBERS;
src/parser/type-layer-checks.ts:224:      return OBJECT_MEMBERS;
src/runtime/stdlib-array.ts:39:export const ARRAY_MEMBERS: ReadonlySet<string> = new Set([
src/runtime/stdlib-array.ts:57: * `end` argument. Hand-written, kept paired with `ARRAY_MEMBERS` above the
src/runtime/stdlib-array.ts:58: * same way `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`.
src/runtime/stdlib-object.ts:95:export const OBJECT_MEMBERS: ReadonlySet<string> = new Set(["keys", "values", "has"]);
```
(remaining 4: stdlib-object.ts:106, :107; stdlib-string.ts:35, :58 — all shown in the excerpts above). Producers: exactly one declaration per set (the three `export const` lines). Consumers: exactly one production read site per set (`type-layer-checks.ts:220/222/224`), zero in tests/, extensions/, tools/.

The stale cross-reference. Command: `grep -n "is paired with" src/runtime/stdlib-array.ts src/runtime/stdlib-object.ts src/runtime/stdlib-string.ts` — 2 hits:
```
src/runtime/stdlib-array.ts:58: * same way `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`.
src/runtime/stdlib-object.ts:107: * `STRING_MEMBER_SIGNATURES` is paired with `STRING_MEMBERS`.
```
Command: `grep -n "Derived from\|derived from" src/runtime/stdlib-string.ts src/runtime/stdlib-array.ts src/runtime/stdlib-object.ts` — 2 hits, both in the string module:
```
src/runtime/stdlib-string.ts:35: * reads it for the runtime belt. `STRING_MEMBERS` below is derived from this
src/runtime/stdlib-string.ts:55: * `theta/parse/unknown-method` check consumes. Derived from
```

Drift already happened (the divergence's origin). Command: `git log --oneline -S"new Set(STRING_MEMBER_SIGNATURES.keys())" -- src/runtime/stdlib-string.ts` — 1 hit:
```
d41231e7 quality: qw20260921210914 fix d8/src__runtime__stdlib-string.ts
```
`git show d41231e7 --stat` touches only `src/runtime/stdlib-string.ts` (1 file changed, 12 insertions, 25 deletions). The removed comment at that commit read "the same discipline the sibling `ARRAY_MEMBERS` / `OBJECT_MEMBERS` pairs below apply"; the array/object comments pointing back at the string pairing were not touched, so they now describe a mechanism the string module abandoned.

Self-inconsistency statement: no written rule exists for how a stdlib allow-list must be kept in step with its signature table; the anchor is self-inconsistency (one derived roster, two hand-paired rosters, behind one consumer that treats them as the same kind of thing) plus the cost cited below.

## Why this is a problem
The three modules solve one problem — "the `unknown-method` allow-list must equal the signature table's key set" — two ways. The cost is already visible in the code: the array and object modules justify their hand-pairing by citing the string module's hand-pairing (`stdlib-array.ts:57-58`, `stdlib-object.ts:105-107`), and that citation has been false since `d41231e7`. A maintainer adding an `array<T>` or `object` member today reads a comment that says "the string module does it this way too", opens the string module, finds a derivation instead, and has to work out which of the two is the house discipline — while the derived module's own comment ("so the two can never drift") states that the hand-paired form is exactly the drift hazard PTQ-1239 (confirmed, human-ratified) removed for strings only. The single selector `builtinMembers` hands all three sets to the same `.has` check, so a member added to `ARRAY_MEMBER_SIGNATURES` but not `ARRAY_MEMBERS` is parse-rejected as `unknown-method` while the runtime belt would dispatch it; the same edit on the string side cannot produce that split.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the unification is the one PTQ-1239 already applied to strings — declare each signature table first and derive its `*_MEMBERS` set from the table's keys — and retire the two "same way … is paired with" sentences. Whether the derived or the hand-written form is the house discipline is the fix stage's call; either way the three modules should agree and the cross-references should describe the mechanism actually in force.

## False-positive check
- Clone-map check: the injected clone map lists G002/G003/G010/G060 over `stdlib-array.ts:61-65` × `stdlib-string.ts:44-48` — the `*_MEMBER_SIGNATURES` map literal rows. This filing is about the `*_MEMBERS` set declarations (`stdlib-array.ts:39-46`, `stdlib-object.ts:95`, `stdlib-string.ts:58`) and the mechanism that ties each set to its table; no injected group covers those lines.
- D9-affinity check: no wrong-home claim — each pair lives in its own surface module and the filing accepts that home; the divergence is in how the pair is kept consistent, not where it lives.
- D2-deadness check: all three sets are live — declared once each and read at `type-layer-checks.ts:220/222/224` (search pasted above); all three signature tables are read by `checkMethodCall` and by their dispatchers (`stdlib-array.ts:89`, `stdlib-object.ts:136`, `stdlib-string.ts:73`).
- Prior-filing check: PTQ-1239 (resolved, confirmed) covered `stdlib-string.ts` only — its Suggested direction names the array/object pairs as "outside this shard and are noted rather than filed", and its fix commit `d41231e7` changed one file. PTQ-1119/1301 (dispatcher clones), PTQ-1216/1217 (substrate placement), PTQ-0024 (detached docs) make no claim on the roster mechanism. `grep -rln "ARRAY_MEMBERS\|OBJECT_MEMBERS" quality/intake quality/issues quality/resolved` returned PTQ-0024, PTQ-0071, PTQ-1119, PTQ-1239 — none files the array/object roster mechanism or the stale cross-reference.
- Human-ruling check: the 2026-09-28 rejection of `qw20260923145222-d4-01-stdlib-param-descriptor-parallel` concerns the `StdlibParamKind` descriptors, not the allow-list/table pairing; PTQ-1239's D8 ruling was confirmed, not rejected.
- Exemption check: `grep -n "stdlib" quality/exemptions.json` — 0 hits.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above (the falsified cross-reference introduced by `d41231e7`).

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling: every stated search reproduces verbatim (member-set grep 14 hits with the pasted lines, "is paired with" 2, "derived from" 2, git log -S → d41231e7 only, 1 file changed); STRING_MEMBERS = new Set(STRING_MEMBER_SIGNATURES.keys()) at stdlib-string.ts:58 vs hand-written literals at stdlib-array.ts:39-46 and stdlib-object.ts:95, one selector builtinMembers (type-layer-checks.ts:217-226); the cost is concrete — d41231e7's diff deleted the string comment "the same discipline the sibling ARRAY_MEMBERS / OBJECT_MEMBERS pairs below apply" while stdlib-array.ts:57-58 and stdlib-object.ts:105-107 still cite a string hand-pairing that no longer exists; clone-scan map on stdlib-string.ts lists only G002/G003/G010/G060 over the signature-map rows (array:61-65 × string:44-48), none covering the *_MEMBERS sets, so not D4's; PTQ-1239 (resolved) noted but did not file the array/object pairs, no intake/issue names stdlib-array/stdlib-object, no exemptions row (triage: claude-opus-5-5)
