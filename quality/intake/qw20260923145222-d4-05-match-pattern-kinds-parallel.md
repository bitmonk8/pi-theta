---
id: pending
title: Match pattern kind switches are parallel across parser and runtime passes
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/match-result.ts:197-270
  - src/runtime/executor-result-flow.ts:251-280
  - src/parser/structural-checks.ts:740-770
  - src/parser/match-result.ts:40-60
  - src/parser/type-layer-walk.ts:1179-1200
sites: 5
fix_scope: cross-module
d4_class: parallel
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Match pattern kind switches are parallel across parser and runtime passes

## Observation
Theta 1.0 defines six `match` pattern forms: `wildcard`, `identifier`, `literal`, `constructor`, `object`, and `array` (`expressions.md` §"Pattern grammar"). At least five separate passes switch over these same forms: runtime pattern matching in `src/runtime/match-result.ts`, the parser-to-runtime pattern translation in `src/runtime/executor-result-flow.ts`, structural field checks in `src/parser/structural-checks.ts`, binder-name collection in `src/parser/match-result.ts`, and type-layer field-type checks in `src/parser/type-layer-walk.ts`. None of these passes delegates pattern traversal to a shared visitor; each maintains its own `switch (pattern.kind)` over the full form set.

## Evidence

**Pass 1 — runtime pattern dispatch**
`src/runtime/match-result.ts:197-270`
```typescript
function matchPattern(
  pattern: Pattern,
  value: ThetaValue,
  bindings: Record<string, ThetaValue>,
): boolean {
  switch (pattern.kind) {
    case "wildcard":
      return true;
    case "identifier":
      bindings[(pattern as { readonly name: string }).name] = value;
      return true;
    case "literal":
      return valuesEqual((pattern as { readonly value: ThetaValue }).value, value);
    case "constructor": {
      const p = pattern as { readonly ctor: "Ok" | "Err"; readonly inner: Pattern };
```

**Pass 2 — parser PatternNode → runtime Pattern translation**
`src/runtime/executor-result-flow.ts:251-280`
```typescript
function toRuntimePattern(pattern: PatternNode): Pattern {
  switch (pattern.kind) {
    case "wildcard":
      return { kind: "wildcard" };
    case "identifier":
      return { kind: "identifier", name: pattern.name };
    case "literal":
      return { kind: "literal", value: pattern.value };
    case "constructor":
      return { kind: "constructor", ctor: pattern.ctor, inner: toRuntimePattern(pattern.inner) };
```

**Pass 3 — structural-checks pattern object-field validation**
`src/parser/structural-checks.ts:740-770`
```typescript
  switch (pattern.kind) {
    case "wildcard":
    case "identifier":
    case "literal":
      return;
    case "constructor":
      checkPatternObjectFields(pattern.inner, refs, file, out);
      return;
    case "array":
      for (const element of pattern.elements) {
        checkPatternObjectFields(element, refs, file, out);
      }
      return;
```

**Pass 4 — parser binder-name collection**
`src/parser/match-result.ts:40-60`
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
```

**Pass 5 — type-layer pattern field-type checks**
`src/parser/type-layer-walk.ts:1179-1200`
```typescript
  private checkPatternFieldTypes(pattern: PatternNode): void {
    switch (pattern.kind) {
      case "wildcard":
      case "identifier":
      case "literal":
        return;
      case "constructor":
        this.checkPatternFieldTypes(pattern.inner);
        return;
      case "array":
        for (const element of pattern.elements) {
          this.checkPatternFieldTypes(element);
        }
        return;
```

**Parallel coverage claim:** all five passes enumerate the same six pattern kinds. `match-result.ts` (parser) uses a `default` arm for `wildcard`/`literal`, while the other four enumerate all six explicitly. Today every pass covers all six forms; the risk is that a seventh form added to `PatternNode`/`Pattern` would require coordinated updates to all five sites.

## Why this is a problem
This is the parallel class: multiple passes over the same language discriminant set that must stay in step. If a new pattern form is introduced (or an existing form changes shape, e.g. `constructor` gaining additional data), each pass must be updated or the compiler/runtime will disagree. For example, if `toRuntimePattern` adds a case but `matchPattern` does not, the parser will accept a program that the runtime cannot match; if `collectPatternBinderNames` misses a new binding form, arm bodies will see unbound identifiers. The repeated `switch` blocks are not clones (the actions differ), but they form a load-bearing parallel truth.

## Suggested direction (non-binding, optional)
The shared source of truth is the six-form pattern grammar in `expressions.md`. A shared pattern-visitor abstraction is a hypothesis for the fix stage, but any such fold must preserve the different actions each pass performs (binding, type-checking, structural validation, translation, runtime matching).

## False-positive check
- Re-read all five cited spans at HEAD; each is live and reachable.
- Verified `Pattern` and `PatternNode` both declare the same six kind literals (`wildcard`, `identifier`, `literal`, `constructor`, `object`, `array`).
- Checked `quality/issues/` for existing filings mentioning `matchPattern`, `toRuntimePattern`, `collectPatternBinderNames`, or pattern-kind parallelism; none found.
- The similarity is not incidental: each pass implements a different phase of the same language feature and references the same spec section.

## Triage
verdict: questionable — accounting verified: PatternNode (theta-ast.ts:224) and runtime Pattern (match-result.ts:113) both declare the same six kinds and the five `switch (pattern.kind)` sites reproduce at match-result.ts:202 / executor-result-flow.ts:258 / structural-checks.ts:745 / parser/match-result.ts:43 (default arm) / type-layer-walk.ts:1178 with no uncounted sixth switch in src/ (body-parser.ts only constructs nodes); Pass 1 excerpt is paraphrased from an older shape (HEAD uses defineRecordField / valuesEqual(value, pattern.value)) but arms and range match; not a duplicate of resolved PTQ-1129 (clone of the binder collector) — the shared pattern-visitor source of truth is a design decision for a human ruling, and the qw20260922211400 structural-ident-ast-walkers human-keep-whole ruling (different-purpose walks, PTQ-1142 precedent) is the closest analogue, with TS return-typed exhaustiveness already guarding passes 1-2 (triage: claude-fable-5-1)
