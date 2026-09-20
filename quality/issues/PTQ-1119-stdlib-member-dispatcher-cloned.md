---
id: PTQ-1119
title: stdlib member dispatcher scaffolding cloned across array/string/object runtimes
lens: D4
status: open
verdict: confirmed
locations:
  - src/runtime/stdlib-array.ts:59-135
  - src/runtime/stdlib-string.ts:136-207
  - src/runtime/stdlib-object.ts:112-164
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# stdlib member dispatcher scaffolding cloned across array/string/object runtimes

## Observation
`src/runtime/stdlib-array.ts`, `src/runtime/stdlib-string.ts`, and `src/runtime/stdlib-object.ts` each define a hand-written member allow-list, a hand-written `ReadonlyMap<string, StdlibMemberSignature>` arity/kind table, and an `evaluateXMember(receiver, member, args)` dispatcher that performs the same three-step runtime belt: look up the signature, check arity, call `assertStdlibArgumentKinds`, then `switch` on `member`. The `StdlibMemberSignature` type and `assertStdlibArgumentKinds` helper already live in `stdlib-string.ts` and are imported by the other two files, but the dispatcher scaffolding and signature-map declarations are repeated in each module with only identifier and member-name substitutions.

The clone scanner reports six overlapping groups between `stdlib-array.ts` and `stdlib-string.ts` for this pattern (G017, G019, G027, G031, G065, G088). `stdlib-object.ts` implements the same shape but fell below the scanner's token-window floor because it has only three members; it is included here as beyond-map evidence of the same duplicated scaffolding.

## Evidence

**src/runtime/stdlib-array.ts:59-135** — `ARRAY_MEMBER_SIGNATURES` map and `evaluateArrayMember` dispatcher.

Excerpt (lines 88-101):
```typescript
  const signature = ARRAY_MEMBER_SIGNATURES.get(member);
  if (signature !== undefined) {
    if (args.length < signature.min || args.length > signature.max) {
      throw new StdlibMethodArgumentDefectError(member, signature.min, signature.max, args.length);
    }
    assertStdlibArgumentKinds(member, signature, args);
  }
  switch (member) {
    // `length` — the element count.
    case "length":
      return receiver.length;
```

**src/runtime/stdlib-string.ts:136-207** — `STRING_MEMBER_SIGNATURES` map and `evaluateStringMember` dispatcher.

Excerpt (lines 171-184):
```typescript
  const signature = STRING_MEMBER_SIGNATURES.get(member);
  if (signature !== undefined) {
    if (args.length < signature.min || args.length > signature.max) {
      throw new StdlibMethodArgumentDefectError(member, signature.min, signature.max, args.length);
    }
    assertStdlibArgumentKinds(member, signature, args);
  }
  switch (member) {
    // `length` — the UTF-16 code-unit count (JS `.length`; no grapheme or
    // code-point segmentation).
    case "length":
      return receiver.length;
```

**src/runtime/stdlib-object.ts:112-164** — `OBJECT_MEMBER_SIGNATURES` map and `evaluateObjectMember` dispatcher.

Excerpt (lines 139-152):
```typescript
  const signature = OBJECT_MEMBER_SIGNATURES.get(member);
  if (signature !== undefined) {
    if (args.length < signature.min || args.length > signature.max) {
      throw new StdlibMethodArgumentDefectError(member, signature.min, signature.max, args.length);
    }
    assertStdlibArgumentKinds(member, signature, args);
  }
  switch (member) {
    // `keys()` — the theta-side field names as an `array<string>`, in the
    // object value's own key order (schema declaration order for named schemas,
    // insertion order otherwise; both reduce to `Object.keys` at runtime).
    case "keys":
      return Object.keys(receiver);
```

**Diff verdict:** renamed-only (type-2 clone). The skeleton—signature map declaration shape, signature lookup, arity check, kind check, and switch entry—is identical across the three files modulo names (`ARRAY_`/`STRING_`/`OBJECT_`, `evaluateArrayMember`/`evaluateStringMember`/`evaluateObjectMember`, receiver type, comments, and switch cases). The smaller scanner groups G019/G027/G031/G088 are sub-spans of G065 (the signature-map wrapper) and G017 (the full dispatcher function).

**Clone-map groups filed here:** G017, G065; sub-span groups G019, G027, G031, G088 covered by the same root cause.

## Why this is a problem
The duplicated scaffolding is load-bearing. All three dispatchers implement the same runtime safety net for laundered/withheld receivers: the bug-0315 arity belt and the bug-0394 kind belt. A change to belt behavior in one dispatcher—ordering of checks, exception type, handling of omitted optional arguments, or a new precondition—must be reproduced in the other two or array/string/object methods will treat identical caller mistakes differently at runtime. The source code itself acknowledges this drift risk: the `STRING_MEMBER_SIGNATURES` comment states the two tables are "hand-written and independent ... a future member addition that updates only one of them is a silent drift a reviewer must catch by inspection, the same discipline the sibling `ARRAY_MEMBERS` / `OBJECT_MEMBERS` pairs below apply."

## Suggested direction (non-binding, optional)
The natural shared home is `src/runtime/stdlib-string.ts`, which already owns `StdlibParamKind`, `StdlibMemberSignature`, and `assertStdlibArgumentKinds`. The dispatcher scaffolding (signature lookup + arity/kind belt + switch wrapper) could be centralized there, with each module supplying only its member table and the per-member implementation closure; alternatively a sibling `src/runtime/stdlib-common.ts` could own the shared dispatcher. This would leave the three files with only their distinct member semantics.

## False-positive check
- Re-verified each cited span by direct read before filing; all three dispatchers are live exports consumed by `statement-executor.ts` (`evaluateStringMember`, `evaluateArrayMember`, `evaluateObjectMember` imports) and by the parse-time `checkMethodCall` path via the three signature maps.
- All copies are alive production code; none are dead or test-only.
- The `replace` normative reference vectors in `stdlib-string.ts` are spec-anchored and unrelated to this duplicated scaffolding.
- No spec clause repeats this dispatcher shape; it is implementation scaffolding, not a normative vector table.
- The object copy is not in the supplied clone map because it has only three members and fell below the token window, not because the pattern differs.

## Triage
verdict: confirmed — all three excerpts byte-exact at the cited lines; clone-scan map on stdlib-array.ts reproduces G017/G065 and the four sub-span groups, and my own diff of the 8-line belt (signature lookup → arity throw → assertStdlibArgumentKinds) at array:88-95 / string:171-178 / object:139-146 is IDENTICAL modulo the ARRAY_/STRING_/OBJECT_ table prefix, so the scanner-unlisted object copy is a genuine renamed-only clone; all three evaluateXMember exports are live (statement-executor.ts:1675-1684, production-theta-producer.ts:8638-8647); the belt is logic with a stated drift hazard, not a spec vector table; no tracked issue shares this root cause (PTQ-0024 was the detached-doc cause). Note for the fixer: the *_MEMBER_SIGNATURES maps are distinct spec-anchored data (different keys/values per receiver) and are not the dedupe target — the belt block is (triage: claude-fable-5-1)
