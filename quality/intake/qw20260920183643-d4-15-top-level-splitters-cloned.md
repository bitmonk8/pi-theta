---
id: pending
title: Top-level object-field, union-arm, and colon splitters cloned in type-layer-checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:1219-1233
  - src/parser/type-layer-checks.ts:1240-1253
  - src/parser/type-layer-checks.ts:1471-1485
sites: 3
fix_scope: localized
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Top-level object-field, union-arm, and colon splitters cloned in type-layer-checks

## Observation
`src/parser/type-layer-checks.ts` contains three tiny delimiter splitters that all walk a string while tracking angle/brace nesting depth: `splitTopLevelObjectFields` splits an inline object type on top-level commas, `topLevelColonIndex` finds the top-level colon in an object field, and `splitTopLevelUnion` splits a union type on top-level pipes. Clone-map groups G038, G049, and G070 flag pairwise overlaps among the three.

## Evidence
`src/parser/type-layer-checks.ts:1219-1233` (clone-map groups G038, G049, G070):
```ts
function splitTopLevelObjectFields(interior: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < interior.length; i += 1) {
    const c = interior[i];
    if (c === "<" || c === "{") {
      depth += 1;
    } else if (c === ">" || c === "}") {
      depth -= 1;
    } else if (c === "," && depth === 0) {
      parts.push(interior.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(interior.slice(start));
  return parts.map((p) => p.trim());
}
```

`src/parser/type-layer-checks.ts:1240-1253` (clone-map group G038):
```ts
function topLevelColonIndex(part: string): number {
  let depth = 0;
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i];
    if (c === "<" || c === "{") {
      depth += 1;
    } else if (c === ">" || c === "}") {
      depth -= 1;
    } else if (c === ":" && depth === 0) {
      return i;
    }
  }
  return -1;
}
```

`src/parser/type-layer-checks.ts:1471-1485` (clone-map groups G049, G070):
```ts
export function splitTopLevelUnion(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "<") {
      depth += 1;
    } else if (c === ">") {
      depth -= 1;
    } else if (c === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
```

Diff verdict: renamed-only (the clone map labels all three groups renamed-only). The three copies differ only in the delimiter character (`,` vs `:` vs `|`) and in whether they return an index, a string array, or a filtered string array.

## Why this is a problem
Object fields, field names, and union arms are parsed by independent copies of the same nesting-aware split logic. If the set of bracket-like tokens that affect nesting depth changes — for example, if square brackets become significant in type expressions — all three copies must be updated together. The `splitTopLevelUnion` comment notes that another file reuses this single copy rather than duplicating it, which underlines that the alternative is duplication elsewhere.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/type-layer-checks.ts` itself or a nearby parser helper module. A single `splitTopLevel(delimiter, text)` helper parameterized by delimiter and optional filter would absorb all three copies.

## False-positive check
- Re-verified all three spans at HEAD; all three functions are live.
- Confirmed clone-map groups G038, G049, and G070 match these exact line ranges.
- Searched `quality/intake/` for `splitTopLevelObjectFields`, `topLevelColonIndex`, and `splitTopLevelUnion`: no existing D4 filing covers them.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
