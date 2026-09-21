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
verdict: questionable — excerpts, liveness and groups G038/G049/G070 reproduce, and the G038 pair (`splitTopLevelObjectFields`/`topLevelColonIndex`) is a genuine renamed-only clone; but the "differ only in the delimiter" diff verdict is refuted for `splitTopLevelUnion`, which tracks `<…>` depth ONLY (no `{`/`}`) — a divergence the host documents as a recorded residual at type-layer-checks.ts:1072-1075 and that bug 0252 cell F4 pins (tests/brace-and-angle-annotation-junk-refusal.test.ts:590-608), so folding all three into one `splitTopLevel(delimiter, text)` is a bracket-set behaviour choice, not a mechanical dedupe; a human should rule whether the dedupe scope is the G038 pair only or a helper parameterised by nesting-token set (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: excerpts byte-exact at 1219-1236/1239-1252/1471-1488, all three live (callers 1087/1144-1145/1192 + runtime/tool-call.ts:53,356), clone-scan reproduces the three pairs at the same ranges under renumbered ids (G034/G045/G066, filed as G038/G049/G070), and no PTQ or same-wave sibling tracks them; the G038 pair (`splitTopLevelObjectFields`/`topLevelColonIndex`) is a genuine renamed-only clone, but the filing's "differ only in the delimiter" claim is refuted for `splitTopLevelUnion`, which tracks `<…>` depth only — a deliberate, documented residual (type-layer-checks.ts:1072-1075; bug 0130 Residuals item 3; bug 0252 §Fix constraint 2) pinned by cell F4 `let y: {a: integer|null} = 1` staying silent (tests/brace-and-angle-annotation-junk-refusal.test.ts:590-631), so a single `{}`-aware `splitTopLevel(delimiter, text)` would red F4 — the three-way fold is a bracket-set behaviour decision for a human ruling, not a mechanical dedupe (triage: claude-fable-5-1)
verdict: questionable — third independent pass at HEAD (two src/parser fix commits since filing drifted the host by −88 lines): excerpts byte-exact at 1131-1148 / 1151-1163 / 1214-1231, all three live (callers :1056-1057, :999, :1104, runtime/tool-call.ts:53,356), clone-scan re-lists the same three pairs as G023 (fields↔colon) + G033/G051 (fields↔union), no PTQ tracks them (PTQ-1120 is the system-interpolation/query-render scanner, a different pair; the two same-wave D9 type-layer/tool-call filings list these only as inventory members); the fields↔colon pair is a genuine renamed-only clone with a real bracket-set-change breakage, but the filing's own diff verdict "differ only in the delimiter" is inaccurate for `splitTopLevelUnion`, which tracks `<…>` only — the host comment :984-987 names this a recorded residual, bug 0130 Residuals 3 / bug 0252 :357,404 document it, and cell F4 `let y: {a: integer|null} = 1` → `expected: []` (tests/brace-and-angle-annotation-junk-refusal.test.ts:606-631) would red under a `{}`-aware shared splitter (F3 shows the whole-group path emits LETRHS), so the proposed `splitTopLevel(delimiter, text)` is not behaviour-preserving; whether to dedupe the G023 pair alone or a scanner parameterised by nesting-token set is a human ruling (triage: claude-fable-5-1)
