---
id: pending
title: Pattern binder name collector cloned between match-result seam and theta-document parser
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/match-result.ts:49-71
  - src/parser/theta-document.ts:7132-7154
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Pattern binder name collector cloned between match-result seam and theta-document parser

## Observation
`src/parser/match-result.ts` exports `collectPatternBinderNames` for the type-layer checks and static-type inference passes. `src/parser/theta-document.ts` keeps its own private `collectPatternBindings` for parser-scope construction. Both walk the same `PatternNode` discriminated union and add every bound identifier to a `Set<string>`. The match-result copy's own comment says it is "kept independent" because theta-document.ts's copy is unexported; two downstream consumers (`type-layer-checks.ts` and `static-type-inference.ts`) therefore depend on the duplicated copy.

## Evidence

`src/parser/match-result.ts:49-71`:
```typescript
export function collectPatternBinderNames(pattern: PatternNode, names: Set<string>): void {
  switch (pattern.kind) {
    case "identifier":
      names.add(pattern.name);
      return;
    case "constructor":
      collectPatternBinderNames(pattern.inner, names);
      return;
    case "object":
      for (const f of pattern.fields) {
        collectPatternBinderNames(f.pattern, names);
      }
      return;
    case "array":
      for (const el of pattern.elements) {
        collectPatternBinderNames(el, names);
      }
      return;
```

`src/parser/theta-document.ts:7132-7154`:
```typescript
function collectPatternBindings(p: PatternNode, into: Set<string>): void {
  switch (p.kind) {
    case "identifier":
      into.add(p.name);
      return;
    case "constructor":
      collectPatternBindings(p.inner, into);
      return;
    case "object":
      for (const f of p.fields) {
        collectPatternBindings(f.pattern, into);
      }
      return;
    case "array":
      for (const el of p.elements) {
        collectPatternBindings(el, into);
      }
      return;
```

Diff verdict: renamed-only. The only differences are the function name, parameter names (`pattern`/`names` vs `p`/`into`), and recursive call targets. The switch arms, node field accesses, and `Set.add` calls are otherwise identical. Clone-map group id: G009.

## Why this is a problem
The duplication is load-bearing, not incidental. Both copies consume the same `PatternNode` grammar and must agree on which pattern forms introduce binders. If the grammar gains a new binder-producing form — or if one copy is fixed for a bug such as wildcard-with-alias or array-rest bindings — the other will silently produce a different binder set. That would cause the parser-built arm scope and the type-inference arm scope to disagree, leading to spurious `theta/parse/unknown-identifier` diagnostics or missed shadowing checks for the same `match` arm.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/theta-document.ts`, which already owns the canonical pattern parsing. Exporting `collectPatternBindings` there and consuming it from `match-result.ts` would remove the duplicate; `match-result.ts` already imports the `PatternNode` type from `theta-document.ts`, so no new cycle is introduced.

## False-positive check
- Re-read both cited spans immediately before filing; both functions are live production code.
- Confirmed clone-map group G009 matches the exact line ranges.
- Verified `src/parser/theta-document.ts` does not import any value from `src/parser/match-result.ts`, so exporting the helper from `theta-document.ts` would not create an import cycle.
- Searched `quality/intake/` for `collectPatternBinderNames` and `collectPatternBindings`; no existing D4 finding covers this pair.
- Not a spec-normative vector table; it is duplicated application logic.
- No test files are involved.

## Triage
