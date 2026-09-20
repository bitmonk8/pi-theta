---
id: PTQ-1115
title: named-type alias classifier duplicated across three type checks
lens: D4
status: open
verdict: confirmed
locations:
  - src/parser/type-compat.ts:525-541
  - src/parser/type-layer-checks.ts:228-243
  - src/parser/type-layer-checks.ts:189-199
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# named-type alias classifier duplicated across three type checks

## Observation
Three `CompatType` classifiers in `src/parser/` share the same `case "named"`
resolution shape: look up the name through `resolveNamedRef`, return a fixed
category when the declaration is an `object-schema`, and otherwise recursively
classify the alias right-hand side. The clone map G069 flags the copies in
`type-compat.ts` and `type-layer-checks.ts` as a 63-token renamed-only clone;
a third copy in `type-layer-checks.ts` (`classifyOperand`) repeats the same
named-resolution block.

## Evidence

`src/parser/type-compat.ts:525-541` (`classifyIndexReceiver`):

```ts
    case "literal":
      return "primitive";
    case "union":
      return "unknown";
    case "named": {
      const decl = resolveNamedRef(env, type);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      // A transparent alias: classify its resolved RHS (TYPE-11).
      return classifyIndexReceiver(decl.rhs, env);
    }
```

`src/parser/type-layer-checks.ts:228-243` (`classifyReceiver`):

```ts
    case "object":
      return "object";
    case "union":
      return "unknown";
    case "named": {
      const decl = resolveNamedRef(env, type);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "object";
      }
      return classifyReceiver(decl.rhs, env);
    }
```

`src/parser/type-layer-checks.ts:189-199` (`classifyOperand`):

```ts
    case "array":
    case "object":
    case "union":
      return "other";
    case "named": {
      const decl = resolveNamedRef(env, type);
      if (decl === undefined) {
        return "unknown";
      }
      if (decl.kind === "object-schema") {
        return "other";
      }
      // A transparent alias (TYPE-11): classify its resolved RHS.
      return classifyOperand(decl.rhs, env);
    }
```

Diff verdict: **renamed-only**. The only differences are the recursive call
target (`classifyIndexReceiver` / `classifyReceiver` / `classifyOperand`) and
the concrete category returned for an `object-schema` (`"object"` vs
`"other"`). The unresolved-named guard, the object-schema guard, and the
alias-recursion structure are identical. Clone-map group id: **G069**.

## Why this is a problem
The three classifiers feed three independent type-layer checks: indexed-access
receivers (`classifyIndexReceiver`), stdlib member receivers
(`classifyReceiver`), and expression operands (`classifyOperand`). They must
agree on the nominal-vs-transparent semantics of named types and on the
handling of unresolved names; otherwise the same alias could be indexable in
one check and non-indexable in another, or an object-schema alias could be
classified inconsistently. Because the alias-unfolding logic is copied rather
than shared, a future fix to alias transparency (TYPE-11) or to the
unresolved-named guard risks updating only two of the three sites.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/type-compat.ts`, which already owns
`resolveNamedRef` and `unfoldAlias`. A single helper that resolves a `named`
type and returns whether it is an object schema, an alias, or unknown would let
each classifier map that structural answer to its own category.

## False-positive check
- Re-read all three cited spans at HEAD; all are live production code in
  `src/parser/`.
- Confirmed the functions are called: `classifyIndexReceiver` is used in the
  same file for index-receiver checks; `classifyReceiver` and `classifyOperand`
  are used in `src/parser/type-layer-checks.ts`.
- Searched existing intake files for matching titles and found none.
- Not tests, not generated code, and not a spec-normative vector table.
- Clone-map group G069 re-verified at the cited line ranges.

## Triage
verdict: confirmed — all three excerpts byte-exact at the cited lines; clone-scan map on type-compat.ts reproduces `G069 — 63 tokens — renamed-only — type-compat.ts:525-541, type-layer-checks.ts:228-243` and the scanner-unlisted third copy (type-layer-checks.ts:189-199, `classifyOperand`) diffs to the same resolveNamedRef→undefined-guard→object-schema-guard→recurse-on-rhs skeleton with only the object-schema constant (`"other"`) and recursion target renamed; every copy is live (`classifyIndexReceiver` ← expression-evaluator.ts:600, stdlib-object.ts:72; `classifyReceiver` ← type-layer-checks.ts:3790/3868; `classifyOperand` ← :2942/2974/3921-4028); the shared invariant is mechanically evidenced, not taste — `resolveNamedRef`'s doc (type-compat.ts:166-176) names all three classifiers as sites that must see the `enumRef` marker identically and tests/fn-param-alias-unfolded-at-gates.test.ts c1/c2/c3 pin TYPE-11 unfolding at each, while `unfoldAlias`'s doc (:230 "the classifiers unfold inline instead") records the duplication without a rationale; not a spec vector table; no tracked issue names these classifiers — but same-wave sibling intake qw20260920183643-d4-18-receiver-classification-parallel.md files the same G069 pair as `parallel`, so whichever is accepted second should be deduped against the first (triage: claude-fable-5-1)
